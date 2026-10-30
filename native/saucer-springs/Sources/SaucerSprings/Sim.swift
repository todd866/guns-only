import Foundation
import JavaScriptCore
import simd

// The browser's RC car physics, run unchanged in JavaScriptCore (bundled by tools/rc/native/bundle-sim.sh).
final class Sim {
  let ctx = JSContext()!
  private let rc: JSValue
  private var keep: [Data] = []   // the typed arrays point into these bytes

  init() throws {
    let url = Bundle.main.url(forResource: "rcsim", withExtension: "js") ?? Bundle.module.url(forResource: "rcsim", withExtension: "js")!
    ctx.exceptionHandler = { _, e in print("sim error: \(e?.toString() ?? "?")") }
    ctx.evaluateScript(try String(contentsOf: url, encoding: .utf8))
    rc = ctx.objectForKeyedSubscript("RCSim")
  }

  // <world>.col: 'RCC1', u32 headerBytes, JSON {tris, surfaces, flatGround}, f32 9 per triangle, u8 surface per triangle.
  func load(collision path: String, spawn: SIMD3<Float>, yaw: Float) throws -> Int {
    let data = try Data(contentsOf: URL(fileURLWithPath: path))
    let hb = Int(data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) })
    let json = try JSONSerialization.jsonObject(with: data.subdata(in: 8..<(8 + hb)).filter { $0 != 0 }) as! [String: Any]
    let n = json["tris"] as! Int, at = 8 + hb
    let tris = data.subdata(in: at..<(at + n * 36)), surf = data.subdata(in: (at + n * 36)..<(at + n * 37)); keep = [tris, surf]
    let g = ctx.jsGlobalContextRef
    func typed(_ d: Data, _ type: JSTypedArrayType) -> JSValue {
      let ptr = d.withUnsafeBytes { UnsafeMutableRawPointer(mutating: $0.baseAddress!) }
      return JSValue(jsValueRef: JSObjectMakeTypedArrayWithBytesNoCopy(g, type, ptr, d.count, nil, nil, nil), in: ctx)
    }
    let r = rc.invokeMethod("load", withArguments: [typed(tris, kJSTypedArrayTypeFloat32Array), typed(surf, kJSTypedArrayTypeUint8Array),
                                                    json["surfaces"] as! [String], json["flatGround"] as? Bool ?? false, [spawn.x, spawn.y, spawn.z], yaw])
    return Int(r?.toInt32() ?? 0)
  }

  struct Pose { var pos: SIMD3<Float>; var q: simd_quatf; var speed: Float; var yaw: Float; var mode: Int }
  struct Input { var throttle: Float = 0, steer: Float = 0, brake = false, drift = false, boost: Float = 1
                 var pitch: Float = 0, roll: Float = 0, yaw: Float = 0, power: Float = 0, burner = false }

  func step(_ i: Input, dt: Float) {
    rc.invokeMethod("step", withArguments: [i.throttle, i.steer, i.brake, i.drift, i.boost, i.pitch, i.roll, i.yaw, i.power, i.burner, dt])
  }
  func pose() -> Pose {
    let a = rc.invokeMethod("pose", withArguments: [])!.toArray()!.map { Float(($0 as! NSNumber).doubleValue) }
    // The physics stores quaternions as [x, y, z, w].
    return Pose(pos: SIMD3(a[0], a[1], a[2]), q: simd_quatf(ix: a[3], iy: a[4], iz: a[5], r: a[6]), speed: a[7], yaw: a[8], mode: Int(a[9]))
  }
  @discardableResult func fly() -> String { rc.invokeMethod("fly", withArguments: [])?.toString() ?? "" }
  func recover() { rc.invokeMethod("recover", withArguments: []) }
  func raycast(_ o: SIMD3<Float>, _ d: SIMD3<Float>, _ max: Float) -> Float? {
    let r = rc.invokeMethod("raycast", withArguments: [o.x, o.y, o.z, d.x, d.y, d.z, max])?.toDouble() ?? -1
    return r < 0 ? nil : Float(r)
  }
}

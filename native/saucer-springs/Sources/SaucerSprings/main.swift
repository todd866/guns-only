import AppKit
import Metal
import MetalKit
import simd

// Saucer Springs native (Apple silicon). Loads a world exported from the browser build
// (tools/rc/native/export-world.cjs) and renders it with Metal: rasterised visibility plus
// hardware ray-traced sun shadows and ambient occlusion.
//   SaucerSprings <world.rcworld>                 window, fly with WASD/QE + mouse drag
//   SaucerSprings <world.rcworld> --shot out.png  [--at x,y,z,yaw,pitch] render one frame offscreen

struct Uniforms {
  var viewProj: simd_float4x4
  var eye: SIMD4<Float>
  var sun: SIMD4<Float>
  var fog: SIMD4<Float>
  var size: SIMD2<UInt32>
  var frame: UInt32
  var aoRays: UInt32
}

struct World {
  let positions: MTLBuffer, normals: MTLBuffer, colours: MTLBuffer, indices: MTLBuffer
  let indexCount: Int, vertexCount: Int
  let spawn: SIMD3<Float>, yaw: Float, sun: SIMD3<Float>
}

enum LoadError: Error { case bad(String) }

func loadWorld(_ path: String, device: MTLDevice) throws -> World {
  let data = try Data(contentsOf: URL(fileURLWithPath: path), options: .alwaysMapped)
  guard data.count > 8, String(decoding: data.prefix(4), as: UTF8.self) == "RCW1" else { throw LoadError.bad("not an RCW1 file") }
  let headerBytes = Int(data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) })
  let json = try JSONSerialization.jsonObject(with: data.subdata(in: 8..<(8 + headerBytes)).filter { $0 != 0 }) as! [String: Any]
  let v = json["vertices"] as! Int, n = json["indices"] as! Int
  let spawn = (json["spawn"] as! [Double]).map(Float.init), sun: [Float] = [0.55, 0.42, 0.62]   // a lower mid-morning sun for longer shadows
  var at = 8 + headerBytes
  func buffer(_ bytes: Int) -> MTLBuffer {
    let b = data.withUnsafeBytes { raw in device.makeBuffer(bytes: raw.baseAddress! + at, length: bytes, options: .storageModeShared)! }
    at += bytes; return b
  }
  let P = buffer(v * 12), N = buffer(v * 12), C = buffer(v * 4), I = buffer(n * 4)
  return World(positions: P, normals: N, colours: C, indices: I, indexCount: n, vertexCount: v,
               spawn: SIMD3(spawn[0], spawn[1], spawn[2]), yaw: Float(json["yaw"] as? Double ?? 0), sun: simd_normalize(SIMD3(sun[0], sun[1], sun[2])))
}

func perspective(fovy: Float, aspect: Float, near: Float, far: Float) -> simd_float4x4 {
  let y = 1 / tan(fovy * 0.5), x = y / aspect, z = far / (near - far)
  return simd_float4x4(columns: (SIMD4(x, 0, 0, 0), SIMD4(0, y, 0, 0), SIMD4(0, 0, z, -1), SIMD4(0, 0, z * near, 0)))
}
func lookAt(eye: SIMD3<Float>, forward f: SIMD3<Float>) -> simd_float4x4 {
  let z = -simd_normalize(f), x = simd_normalize(simd_cross(SIMD3(0, 1, 0), z)), y = simd_cross(z, x)
  return simd_float4x4(columns: (SIMD4(x.x, y.x, z.x, 0), SIMD4(x.y, y.y, z.y, 0), SIMD4(x.z, y.z, z.z, 0),
                                 SIMD4(-simd_dot(x, eye), -simd_dot(y, eye), -simd_dot(z, eye), 1)))
}

final class Renderer {
  let device: MTLDevice, queue: MTLCommandQueue, world: World
  let worldPipeline: MTLRenderPipelineState, skyPipeline: MTLRenderPipelineState, depthState: MTLDepthStencilState
  var accel: MTLAccelerationStructure!
  var eye: SIMD3<Float>, yaw: Float, pitch: Float = -0.08, frame: UInt32 = 0
  let colourFormat: MTLPixelFormat = .bgra8Unorm_srgb

  init(device: MTLDevice, world: World) throws {
    self.device = device; self.world = world; queue = device.makeCommandQueue()!
    eye = world.spawn + SIMD3(0, 1.2, 0); yaw = world.yaw
    let url = Bundle.module.url(forResource: "Shaders", withExtension: "metal")!
    let opts = MTLCompileOptions(); opts.languageVersion = .version3_1
    let lib = try device.makeLibrary(source: try String(contentsOf: url, encoding: .utf8), options: opts)
    let d = MTLRenderPipelineDescriptor()
    d.vertexFunction = lib.makeFunction(name: "worldVertex"); d.fragmentFunction = lib.makeFunction(name: "worldFragment")
    d.colorAttachments[0].pixelFormat = colourFormat; d.depthAttachmentPixelFormat = .depth32Float
    worldPipeline = try device.makeRenderPipelineState(descriptor: d)
    let s = MTLRenderPipelineDescriptor()
    s.vertexFunction = lib.makeFunction(name: "skyVertex"); s.fragmentFunction = lib.makeFunction(name: "skyFragment")
    s.colorAttachments[0].pixelFormat = colourFormat; s.depthAttachmentPixelFormat = .depth32Float
    skyPipeline = try device.makeRenderPipelineState(descriptor: s)
    let ds = MTLDepthStencilDescriptor(); ds.depthCompareFunction = .less; ds.isDepthWriteEnabled = true
    depthState = device.makeDepthStencilState(descriptor: ds)!
    try buildAccel()
  }

  func buildAccel() throws {
    let g = MTLAccelerationStructureTriangleGeometryDescriptor()
    g.vertexBuffer = world.positions; g.vertexStride = 12; g.vertexFormat = .float3
    g.indexBuffer = world.indices; g.indexType = .uint32; g.triangleCount = world.indexCount / 3; g.opaque = true
    let desc = MTLPrimitiveAccelerationStructureDescriptor(); desc.geometryDescriptors = [g]
    let sizes = device.accelerationStructureSizes(descriptor: desc)
    accel = device.makeAccelerationStructure(size: sizes.accelerationStructureSize)!
    let scratch = device.makeBuffer(length: sizes.buildScratchBufferSize, options: .storageModePrivate)!
    let cb = queue.makeCommandBuffer()!, enc = cb.makeAccelerationStructureCommandEncoder()!
    enc.build(accelerationStructure: accel, descriptor: desc, scratchBuffer: scratch, scratchBufferOffset: 0)
    enc.endEncoding(); cb.commit(); cb.waitUntilCompleted()
    if let e = cb.error { throw e }
  }

  var forward: SIMD3<Float> { SIMD3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)) }

  func encode(into cb: MTLCommandBuffer, colour: MTLTexture, depth: MTLTexture) {
    let w = colour.width, h = colour.height
    let proj = perspective(fovy: 60 * .pi / 180, aspect: Float(w) / Float(h), near: 0.05, far: 2000)
    let vp = proj * lookAt(eye: eye, forward: forward)
    var u = Uniforms(viewProj: vp, eye: SIMD4(eye, 0), sun: SIMD4(world.sun, 2.4), fog: SIMD4(260, 900, 0, 0),
                     size: SIMD2(UInt32(w), UInt32(h)), frame: frame, aoRays: 4)
    var inv = vp.inverse
    let rp = MTLRenderPassDescriptor()
    rp.colorAttachments[0].texture = colour; rp.colorAttachments[0].loadAction = .clear; rp.colorAttachments[0].storeAction = .store
    rp.depthAttachment.texture = depth; rp.depthAttachment.loadAction = .clear; rp.depthAttachment.clearDepth = 1; rp.depthAttachment.storeAction = .dontCare
    let enc = cb.makeRenderCommandEncoder(descriptor: rp)!
    enc.setRenderPipelineState(skyPipeline)
    enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
    enc.setFragmentBytes(&inv, length: MemoryLayout<simd_float4x4>.stride, index: 1)
    enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
    enc.setRenderPipelineState(worldPipeline); enc.setDepthStencilState(depthState); enc.setCullMode(.none)
    enc.setVertexBuffer(world.positions, offset: 0, index: 0); enc.setVertexBuffer(world.normals, offset: 0, index: 1)
    enc.setVertexBuffer(world.colours, offset: 0, index: 2); enc.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 3)
    enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
    enc.setFragmentAccelerationStructure(accel, bufferIndex: 1)
    enc.useResource(accel, usage: .read, stages: .fragment)
    enc.drawIndexedPrimitives(type: .triangle, indexCount: world.indexCount, indexType: .uint32, indexBuffer: world.indices, indexBufferOffset: 0)
    enc.endEncoding(); frame &+= 1
  }

  func shot(to path: String, width: Int = 1280, height: Int = 720) throws -> Double {
    let cd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: colourFormat, width: width, height: height, mipmapped: false)
    cd.usage = [.renderTarget, .shaderRead]; cd.storageMode = .shared
    let dd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .depth32Float, width: width, height: height, mipmapped: false)
    dd.usage = .renderTarget; dd.storageMode = .private
    let colour = device.makeTexture(descriptor: cd)!, depth = device.makeTexture(descriptor: dd)!
    // Warm-up frame, then a timed one.
    for _ in 0..<2 { let cb = queue.makeCommandBuffer()!; encode(into: cb, colour: colour, depth: depth); cb.commit(); cb.waitUntilCompleted() }
    let cb = queue.makeCommandBuffer()!; encode(into: cb, colour: colour, depth: depth); cb.commit(); cb.waitUntilCompleted()
    let gpuMs = (cb.gpuEndTime - cb.gpuStartTime) * 1000
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    colour.getBytes(&bytes, bytesPerRow: width * 4, from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
    // BGRA → RGBA for the PNG writer.
    for i in stride(from: 0, to: bytes.count, by: 4) { bytes.swapAt(i, i + 2) }
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                               isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32)!
    memcpy(rep.bitmapData!, bytes, bytes.count)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    return gpuMs
  }
}

final class View: MTKView {
  var renderer: Renderer!, keys = Set<UInt16>(), last = CACurrentMediaTime()
  override var acceptsFirstResponder: Bool { true }
  override func keyDown(with e: NSEvent) { keys.insert(e.keyCode) }
  override func keyUp(with e: NSEvent) { keys.remove(e.keyCode) }
  override func mouseDragged(with e: NSEvent) { renderer.yaw += Float(e.deltaX) * 0.004; renderer.pitch = max(-1.4, min(1.4, renderer.pitch - Float(e.deltaY) * 0.004)) }
  override func draw(_ r: NSRect) {
    let now = CACurrentMediaTime(), dt = Float(min(0.05, now - last)); last = now
    let f = renderer.forward, flat = simd_normalize(SIMD3(f.x, 0, f.z)), right = SIMD3(-flat.z, 0, flat.x)
    let speed: Float = keys.contains(56) ? 40 : 8   // shift = fast
    var m = SIMD3<Float>(0, 0, 0)
    if keys.contains(13) { m += f }; if keys.contains(1) { m -= f }; if keys.contains(2) { m += right }; if keys.contains(0) { m -= right }
    if keys.contains(14) { m.y += 1 }; if keys.contains(12) { m.y -= 1 }
    renderer.eye += m * speed * dt
    guard let pass = currentRenderPassDescriptor, let drawable = currentDrawable, let depth = pass.depthAttachment.texture else { return }
    let cb = renderer.queue.makeCommandBuffer()!
    renderer.encode(into: cb, colour: drawable.texture, depth: depth)
    cb.present(drawable); cb.commit()
  }
}

let args = CommandLine.arguments
guard args.count >= 2 else { print("usage: SaucerSprings <world.rcworld> [--shot out.png] [--at x,y,z,yaw,pitch]"); exit(2) }
let device = MTLCreateSystemDefaultDevice()!
guard device.supportsRaytracing else { print("this GPU has no Metal ray tracing"); exit(1) }
let t0 = CACurrentMediaTime()
let world = try loadWorld(args[1], device: device)
let renderer = try Renderer(device: device, world: world)
print(String(format: "%@: %d vertices, %d triangles, load+BVH %.2f s", device.name, world.vertexCount, world.indexCount / 3, CACurrentMediaTime() - t0))
if let i = args.firstIndex(of: "--at"), i + 1 < args.count {
  let v = args[i + 1].split(separator: ",").compactMap { Float($0) }
  if v.count >= 3 { renderer.eye = SIMD3(v[0], v[1], v[2]) }; if v.count >= 4 { renderer.yaw = v[3] }; if v.count >= 5 { renderer.pitch = v[4] }
}
if let i = args.firstIndex(of: "--shot"), i + 1 < args.count {
  let ms = try renderer.shot(to: args[i + 1])
  print(String(format: "frame GPU %.2f ms", ms)); exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
window.title = "Saucer Springs"
let view = View(frame: window.contentLayoutRect, device: device)
view.colorPixelFormat = renderer.colourFormat; view.depthStencilPixelFormat = .depth32Float; view.renderer = renderer; view.preferredFramesPerSecond = 120
window.contentView = view; window.center(); window.makeKeyAndOrderFront(nil); window.makeFirstResponder(view)
app.activate(ignoringOtherApps: true)
app.run()

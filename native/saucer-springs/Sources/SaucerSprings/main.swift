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
  var invViewProj: simd_float4x4
  var prevViewProj: simd_float4x4
  var eye: SIMD4<Float>
  var sun: SIMD4<Float>
  var fog: SIMD4<Float>
  var size: SIMD2<UInt32>
  var frame: UInt32
  var accumulated: UInt32
  var jitter: SIMD2<Float>
  var historyCap: Float
  var pad: Float = 0
}
struct Material { var tex: Int32; var alpha: Int32 }

struct World {
  let positions: MTLBuffer, normals: MTLBuffer, colours: MTLBuffer, uvs: MTLBuffer, mats: MTLBuffer, indices: MTLBuffer
  let solidIndices: MTLBuffer, cutoutIndices: MTLBuffer, solidCount: Int, cutoutCount: Int
  let materials: [Material], textures: MTLTexture?
  let indexCount: Int, vertexCount: Int
  let spawn: SIMD3<Float>, yaw: Float, sun: SIMD3<Float>
}

enum LoadError: Error { case bad(String) }

func loadWorld(_ path: String, device: MTLDevice) throws -> World {
  let data = try Data(contentsOf: URL(fileURLWithPath: path), options: .alwaysMapped)
  guard data.count > 8, String(decoding: data.prefix(4), as: UTF8.self) == "RCW2" else { throw LoadError.bad("not an RCW2 file (re-export with tools/rc/native/export-world.cjs)") }
  let headerBytes = Int(data.subdata(in: 4..<8).withUnsafeBytes { $0.load(as: UInt32.self) })
  let json = try JSONSerialization.jsonObject(with: data.subdata(in: 8..<(8 + headerBytes)).filter { $0 != 0 }) as! [String: Any]
  let v = json["vertices"] as! Int, n = json["indices"] as! Int, texCount = json["textures"] as? Int ?? 0
  let spawn = (json["spawn"] as! [Double]).map(Float.init), sun: [Float] = [0.55, 0.42, 0.62]   // a lower mid-morning sun for longer shadows
  let materials = (json["materials"] as? [[String: Any]] ?? []).map { Material(tex: Int32($0["tex"] as? Int ?? -1), alpha: ($0["alpha"] as? Bool ?? false) ? 1 : 0) }
  var at = 8 + headerBytes
  func buffer(_ bytes: Int, advance: Int? = nil) -> MTLBuffer {
    let b = data.withUnsafeBytes { raw in device.makeBuffer(bytes: raw.baseAddress! + at, length: max(4, bytes), options: .storageModeShared)! }
    at += advance ?? bytes; return b
  }
  let P = buffer(v * 12), N = buffer(v * 12), C = buffer(v * 4), U = buffer(v * 8), M = buffer(v * 2, advance: v * 2 + (4 - (v * 2) % 4) % 4), I = buffer(n * 4)
  // Textures: <world>.tex/NNN.png (1024², sRGB) into one mipmapped array; inside the .app, Resources/world.tex.
  var array: MTLTexture? = nil
  if texCount > 0 {
    let dir = URL(fileURLWithPath: path).deletingPathExtension().appendingPathExtension("tex")
    let d = MTLTextureDescriptor(); d.textureType = .type2DArray; d.pixelFormat = .bgra8Unorm_srgb; d.width = 1024; d.height = 1024; d.arrayLength = texCount
    d.mipmapLevelCount = 11; d.usage = .shaderRead; d.storageMode = .private
    let tex = device.makeTexture(descriptor: d)!, loader = MTKTextureLoader(device: device), queue = device.makeCommandQueue()!, cb = queue.makeCommandBuffer()!, blit = cb.makeBlitCommandEncoder()!
    for i in 0..<texCount {
      let url = dir.appendingPathComponent(String(format: "%03d.png", i))
      // The loader hands back BGRA; the array matches it, because a blit copies raw bytes.
      guard let t = try? loader.newTexture(URL: url, options: [.SRGB: true, .textureStorageMode: MTLStorageMode.private.rawValue, .generateMipmaps: false]), t.width == 1024, t.pixelFormat == .bgra8Unorm_srgb else { print("texture \(i) skipped"); continue }
      blit.copy(from: t, sourceSlice: 0, sourceLevel: 0, to: tex, destinationSlice: i, destinationLevel: 0, sliceCount: 1, levelCount: 1)
    }
    blit.generateMipmaps(for: tex); blit.endEncoding(); cb.commit(); cb.waitUntilCompleted(); array = tex
  }
  // Ray tracing splits the triangles: opaque ones skip any-hit work; only leaf cards run the alpha test.
  var solid = [UInt32](), cutout = [UInt32](); solid.reserveCapacity(n)
  let ip = I.contents().bindMemory(to: UInt32.self, capacity: n), mp = M.contents().bindMemory(to: UInt16.self, capacity: v)
  for t in stride(from: 0, to: n, by: 3) {
    let mi = Int(mp[Int(ip[t])]), cut = mi < materials.count && materials[mi].alpha != 0
    if cut { cutout += [ip[t], ip[t + 1], ip[t + 2]] } else { solid += [ip[t], ip[t + 1], ip[t + 2]] }
  }
  if cutout.isEmpty { cutout = [0, 0, 0] }
  let SB = device.makeBuffer(bytes: solid, length: solid.count * 4)!, CB = device.makeBuffer(bytes: cutout, length: cutout.count * 4)!
  return World(positions: P, normals: N, colours: C, uvs: U, mats: M, indices: I, solidIndices: SB, cutoutIndices: CB, solidCount: solid.count, cutoutCount: cutout.count, materials: materials, textures: array, indexCount: n, vertexCount: v,
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
  let device: MTLDevice, queue: MTLCommandQueue, world: World, car: World?
  let carMaterials: MTLBuffer
  var carAccel: MTLAccelerationStructure?, instances: MTLAccelerationStructure!, instanceBuffer: MTLBuffer!, instanceScratch: MTLBuffer!
  var carModel = matrix_identity_float4x4
  let worldPipeline: MTLRenderPipelineState, skyPipeline: MTLRenderPipelineState, postPipeline: MTLRenderPipelineState
  let accumulate: MTLComputePipelineState, depthState: MTLDepthStencilState, equalState: MTLDepthStencilState, depthPipeline: MTLRenderPipelineState, sampler: MTLSamplerState
  let materials: MTLBuffer, fallbackTexture: MTLTexture
  var accel: MTLAccelerationStructure!
  var eye: SIMD3<Float>, yaw: Float, pitch: Float = -0.08, frame: UInt32 = 0, accumulated: UInt32 = 0
  var hdr: MTLTexture?, accum: [MTLTexture] = [], bloom: MTLTexture?, depth: MTLTexture?, prevVP: simd_float4x4? = nil, moved = true
  let colourFormat: MTLPixelFormat = .bgra8Unorm_srgb

  init(device: MTLDevice, world: World, car: World? = nil) throws {
    self.device = device; self.world = world; self.car = car; queue = device.makeCommandQueue()!
    var plain = Material(tex: -1, alpha: 0); carMaterials = device.makeBuffer(bytes: &plain, length: MemoryLayout<Material>.stride)!
    eye = world.spawn + SIMD3(0, 1.2, 0); yaw = world.yaw
    // Inside the .app the shaders sit in Contents/Resources; from `swift run` they are in the SwiftPM bundle.
    let url = Bundle.main.url(forResource: "Shaders", withExtension: "metal") ?? Bundle.module.url(forResource: "Shaders", withExtension: "metal")!
    let opts = MTLCompileOptions(); opts.languageVersion = .version3_1
    let lib = try device.makeLibrary(source: try String(contentsOf: url, encoding: .utf8), options: opts)
    func pipeline(_ v: String, _ f: String, _ format: MTLPixelFormat, depth: Bool) throws -> MTLRenderPipelineState {
      let d = MTLRenderPipelineDescriptor(); d.vertexFunction = lib.makeFunction(name: v); d.fragmentFunction = lib.makeFunction(name: f)
      d.colorAttachments[0].pixelFormat = format; if depth { d.depthAttachmentPixelFormat = .depth32Float }
      return try device.makeRenderPipelineState(descriptor: d)
    }
    worldPipeline = try pipeline("worldVertex", "worldFragment", .rgba16Float, depth: true)
    let dp = MTLRenderPipelineDescriptor(); dp.vertexFunction = lib.makeFunction(name: "worldVertex"); dp.fragmentFunction = lib.makeFunction(name: "depthFragment")
    dp.colorAttachments[0].pixelFormat = .rgba16Float; dp.colorAttachments[0].writeMask = []; dp.depthAttachmentPixelFormat = .depth32Float
    depthPipeline = try device.makeRenderPipelineState(descriptor: dp)
    skyPipeline = try pipeline("skyVertex", "skyFragment", .rgba16Float, depth: true)
    postPipeline = try pipeline("postVertex", "postFragment", colourFormat, depth: false)
    accumulate = try device.makeComputePipelineState(function: lib.makeFunction(name: "accumulate")!)
    let ds = MTLDepthStencilDescriptor(); ds.depthCompareFunction = .less; ds.isDepthWriteEnabled = true
    depthState = device.makeDepthStencilState(descriptor: ds)!
    let es = MTLDepthStencilDescriptor(); es.depthCompareFunction = .equal; es.isDepthWriteEnabled = false
    equalState = device.makeDepthStencilState(descriptor: es)!
    let sd = MTLSamplerDescriptor(); sd.minFilter = .linear; sd.magFilter = .linear; sd.mipFilter = .linear; sd.maxAnisotropy = 16
    sd.sAddressMode = .repeat; sd.tAddressMode = .repeat; sampler = device.makeSamplerState(descriptor: sd)!
    var mats = world.materials.isEmpty ? [Material(tex: -1, alpha: 0)] : world.materials
    materials = device.makeBuffer(bytes: &mats, length: MemoryLayout<Material>.stride * mats.count)!
    let fd = MTLTextureDescriptor(); fd.textureType = .type2DArray; fd.pixelFormat = .bgra8Unorm_srgb; fd.width = 1; fd.height = 1; fd.arrayLength = 1
    fallbackTexture = device.makeTexture(descriptor: fd)!
    try buildAccel()
  }

  func buildAccel() throws {
    func geometry(_ w: World, _ idx: MTLBuffer, _ count: Int, opaque: Bool) -> MTLAccelerationStructureTriangleGeometryDescriptor {
      let g = MTLAccelerationStructureTriangleGeometryDescriptor()
      g.vertexBuffer = w.positions; g.vertexStride = 12; g.vertexFormat = .float3
      g.indexBuffer = idx; g.indexType = .uint32; g.triangleCount = count / 3; g.opaque = opaque; return g
    }
    func build(_ desc: MTLAccelerationStructureDescriptor) throws -> MTLAccelerationStructure {
      let sizes = device.accelerationStructureSizes(descriptor: desc), a = device.makeAccelerationStructure(size: sizes.accelerationStructureSize)!
      let scratch = device.makeBuffer(length: max(16, sizes.buildScratchBufferSize), options: .storageModePrivate)!
      let cb = queue.makeCommandBuffer()!, enc = cb.makeAccelerationStructureCommandEncoder()!
      enc.build(accelerationStructure: a, descriptor: desc, scratchBuffer: scratch, scratchBufferOffset: 0)
      enc.endEncoding(); cb.commit(); cb.waitUntilCompleted(); if let e = cb.error { throw e }; return a
    }
    // World geometry 0: opaque triangles. Geometry 1: alpha-tested leaf cards (any-hit tests the texture).
    let desc = MTLPrimitiveAccelerationStructureDescriptor()
    desc.geometryDescriptors = [geometry(world, world.solidIndices, world.solidCount, opaque: true), geometry(world, world.cutoutIndices, world.cutoutCount, opaque: false)]
    accel = try build(desc)
    if let car {
      let cd = MTLPrimitiveAccelerationStructureDescriptor(); cd.geometryDescriptors = [geometry(car, car.solidIndices, car.solidCount, opaque: true)]
      carAccel = try build(cd)
    }
    instanceBuffer = device.makeBuffer(length: MemoryLayout<MTLAccelerationStructureInstanceDescriptor>.stride * 2, options: .storageModeShared)!
    let sizes = device.accelerationStructureSizes(descriptor: instanceDescriptor())
    instances = device.makeAccelerationStructure(size: sizes.accelerationStructureSize)!
    instanceScratch = device.makeBuffer(length: max(16, sizes.buildScratchBufferSize), options: .storageModePrivate)!
  }

  func instanceDescriptor() -> MTLInstanceAccelerationStructureDescriptor {
    let d = MTLInstanceAccelerationStructureDescriptor()
    d.instancedAccelerationStructures = carAccel.map { [accel, $0] } ?? [accel]
    d.instanceCount = carAccel == nil ? 1 : 2; d.instanceDescriptorBuffer = instanceBuffer; return d
  }

  // World at identity, the car at its model matrix; rebuilt each frame (two instances: microseconds).
  func encodeInstances(into cb: MTLCommandBuffer) {
    let p = instanceBuffer.contents().bindMemory(to: MTLAccelerationStructureInstanceDescriptor.self, capacity: 2)
    func packed(_ m: simd_float4x4) -> MTLPackedFloat4x3 {
      MTLPackedFloat4x3(columns: (MTLPackedFloat3Make(m.columns.0.x, m.columns.0.y, m.columns.0.z), MTLPackedFloat3Make(m.columns.1.x, m.columns.1.y, m.columns.1.z),
                                  MTLPackedFloat3Make(m.columns.2.x, m.columns.2.y, m.columns.2.z), MTLPackedFloat3Make(m.columns.3.x, m.columns.3.y, m.columns.3.z)))
    }
    for (i, m) in [matrix_identity_float4x4, carModel].enumerated() where i == 0 || carAccel != nil {
      p[i] = MTLAccelerationStructureInstanceDescriptor(transformationMatrix: packed(m), options: [], mask: 0xff, intersectionFunctionTableOffset: 0, accelerationStructureIndex: UInt32(i))
    }
    let enc = cb.makeAccelerationStructureCommandEncoder()!
    enc.build(accelerationStructure: instances, descriptor: instanceDescriptor(), scratchBuffer: instanceScratch, scratchBufferOffset: 0); enc.endEncoding()
  }

  var forward: SIMD3<Float> { SIMD3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)) }
  // Camera motion keeps history (reprojected); only a jump or resize starts over.
  func resetAccumulation() { moved = true }

  func targets(_ w: Int, _ h: Int) {
    if hdr?.width == w && hdr?.height == h { return }
    func tex(_ f: MTLPixelFormat, _ usage: MTLTextureUsage) -> MTLTexture { let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: f, width: w, height: h, mipmapped: false); d.usage = usage; d.storageMode = .private; return device.makeTexture(descriptor: d)! }
    hdr = tex(.rgba16Float, [.renderTarget, .shaderRead]); accum = [tex(.rgba16Float, [.shaderRead, .shaderWrite]), tex(.rgba16Float, [.shaderRead, .shaderWrite])]
    depth = tex(.depth32Float, [.renderTarget, .shaderRead]); accumulated = 0
    let bd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba16Float, width: w, height: h, mipmapped: true); bd.usage = .shaderRead; bd.storageMode = .private
    bloom = device.makeTexture(descriptor: bd)
  }

  // Halton(2,3) sub-pixel offsets for anti-aliasing under accumulation.
  func halton(_ i: UInt32, _ b: UInt32) -> Float { var f: Float = 1, r: Float = 0, i = i; while i > 0 { f /= Float(b); r += f * Float(i % b); i /= b }; return r }

  func encode(into cb: MTLCommandBuffer, output: MTLTexture) {
    let w = output.width, h = output.height; targets(w, h)
    let proj = perspective(fovy: 60 * .pi / 180, aspect: Float(w) / Float(h), near: 0.05, far: 2000)
    let vp = proj * lookAt(eye: eye, forward: forward)
    let j = SIMD2((halton(accumulated + 1, 2) - 0.5) * 2 / Float(w), (halton(accumulated + 1, 3) - 0.5) * 2 / Float(h))
    // The rasteriser draws with sub-pixel jitter, so reconstruct positions with the jittered inverse.
    var jm = matrix_identity_float4x4; jm.columns.3 = SIMD4(j.x, j.y, 0, 1)
    var u = Uniforms(viewProj: vp, invViewProj: (jm * vp).inverse, prevViewProj: prevVP ?? vp, eye: SIMD4(eye, 0), sun: SIMD4(world.sun, 3.2), fog: SIMD4(300, 1100, 0, 0),
                     size: SIMD2(UInt32(w), UInt32(h)), frame: frame, accumulated: accumulated, jitter: j, historyCap: moved ? 10 : 4096)
    prevVP = vp; moved = false
    var inv = vp.inverse
    let rp = MTLRenderPassDescriptor()
    rp.colorAttachments[0].texture = hdr; rp.colorAttachments[0].loadAction = .clear; rp.colorAttachments[0].storeAction = .store
    rp.depthAttachment.texture = depth; rp.depthAttachment.loadAction = .clear; rp.depthAttachment.clearDepth = 1; rp.depthAttachment.storeAction = .store
    encodeInstances(into: cb)
    var identity = matrix_identity_float4x4
    let enc = cb.makeRenderCommandEncoder(descriptor: rp)!
    enc.setRenderPipelineState(skyPipeline)
    enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
    enc.setFragmentBytes(&inv, length: MemoryLayout<simd_float4x4>.stride, index: 1)
    enc.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3)
    enc.setCullMode(.none)
    for (i, b) in [world.positions, world.normals, world.colours, world.uvs, world.mats].enumerated() { enc.setVertexBuffer(b, offset: 0, index: i) }
    enc.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 5)
    enc.setFragmentBuffer(materials, offset: 0, index: 7); enc.setFragmentTexture(world.textures ?? fallbackTexture, index: 0); enc.setFragmentSamplerState(sampler, index: 0)
    enc.setVertexBytes(&identity, length: MemoryLayout<simd_float4x4>.stride, index: 6)
    enc.setRenderPipelineState(depthPipeline); enc.setDepthStencilState(depthState)
    enc.drawIndexedPrimitives(type: .triangle, indexCount: world.indexCount, indexType: .uint32, indexBuffer: world.indices, indexBufferOffset: 0)
    func bindCar(_ c: World) {
      for (i, b) in [c.positions, c.normals, c.colours, c.uvs, c.mats].enumerated() { enc.setVertexBuffer(b, offset: 0, index: i) }
      enc.setVertexBytes(&carModel, length: MemoryLayout<simd_float4x4>.stride, index: 6); enc.setFragmentBuffer(carMaterials, offset: 0, index: 7)
    }
    if let car { bindCar(car); enc.drawIndexedPrimitives(type: .triangle, indexCount: car.indexCount, indexType: .uint32, indexBuffer: car.indices, indexBufferOffset: 0) }
    enc.setRenderPipelineState(worldPipeline); enc.setDepthStencilState(equalState)
    for (i, b) in [world.positions, world.normals, world.colours, world.uvs, world.mats].enumerated() { enc.setVertexBuffer(b, offset: 0, index: i) }
    enc.setVertexBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 5); enc.setVertexBytes(&identity, length: MemoryLayout<simd_float4x4>.stride, index: 6)
    enc.setFragmentBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
    enc.setFragmentAccelerationStructure(instances, bufferIndex: 1)
    let cp = car ?? world
    for (i, b) in [world.positions, world.solidIndices, world.colours, world.uvs, world.mats, materials, world.cutoutIndices, cp.positions, cp.solidIndices, cp.colours].enumerated() { enc.setFragmentBuffer(b, offset: 0, index: i + 2) }
    enc.setFragmentTexture(world.textures ?? fallbackTexture, index: 0); enc.setFragmentSamplerState(sampler, index: 0)
    enc.useResource(instances, usage: .read, stages: .fragment); enc.useResource(accel, usage: .read, stages: .fragment)
    if let carAccel { enc.useResource(carAccel, usage: .read, stages: .fragment) }
    enc.drawIndexedPrimitives(type: .triangle, indexCount: world.indexCount, indexType: .uint32, indexBuffer: world.indices, indexBufferOffset: 0)
    if let car { bindCar(car); enc.drawIndexedPrimitives(type: .triangle, indexCount: car.indexCount, indexType: .uint32, indexBuffer: car.indices, indexBufferOffset: 0) }
    enc.endEncoding()
    let ce = cb.makeComputeCommandEncoder()!
    let current = accum[Int(frame % 2)], previous = accum[Int((frame + 1) % 2)]
    ce.setComputePipelineState(accumulate); ce.setTexture(hdr, index: 0); ce.setTexture(previous, index: 1); ce.setTexture(current, index: 2); ce.setTexture(depth, index: 3)
    ce.setBytes(&u, length: MemoryLayout<Uniforms>.stride, index: 0)
    ce.dispatchThreads(MTLSize(width: w, height: h, depth: 1), threadsPerThreadgroup: MTLSize(width: 16, height: 16, depth: 1)); ce.endEncoding()
    let bl = cb.makeBlitCommandEncoder()!
    bl.copy(from: current, sourceSlice: 0, sourceLevel: 0, to: bloom!, destinationSlice: 0, destinationLevel: 0, sliceCount: 1, levelCount: 1)
    bl.generateMipmaps(for: bloom!); bl.endEncoding()
    let pp = MTLRenderPassDescriptor(); pp.colorAttachments[0].texture = output; pp.colorAttachments[0].loadAction = .dontCare; pp.colorAttachments[0].storeAction = .store
    let pe = cb.makeRenderCommandEncoder(descriptor: pp)!
    pe.setRenderPipelineState(postPipeline); pe.setFragmentTexture(current, index: 0); pe.setFragmentTexture(bloom, index: 1); pe.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3); pe.endEncoding()
    frame &+= 1; accumulated += 1
  }

  var moving = false, drive: (() -> Void)? = nil, driveFrames = 0, lookTarget: SIMD3<Float>? = nil, atEye: SIMD3<Float>? = nil
  func shot(to path: String, width: Int = 1280, height: Int = 720, samples: Int = 96) throws -> Double {
    let cd = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: colourFormat, width: width, height: height, mipmapped: false)
    cd.usage = [.renderTarget, .shaderRead]; cd.storageMode = .shared
    let colour = device.makeTexture(descriptor: cd)!
    var gpu: Double = 0
    let start = eye
    for i in 0..<(samples + driveFrames) {
      if i < driveFrames { drive?() }
      if i == driveFrames && driveFrames > 0 { accumulated = 0 }   // the still starts clean, no chase-camera history
      if i >= driveFrames, let t = lookTarget { if let a = atEye { eye = a }; let d = simd_normalize(t - eye); yaw = atan2(d.x, -d.z); pitch = asin(d.y) }
      // --moving: strafe the camera sideways at ~6 m/s at 60 fps for the whole capture.
      if moving { let f = forward; eye = start + simd_normalize(SIMD3(-f.z, 0, f.x)) * Float(i) * 0.1; moved = true }
      let cb = queue.makeCommandBuffer()!; encode(into: cb, output: colour); cb.commit(); cb.waitUntilCompleted()
      if let e = cb.error { throw e }
      if i == 1 { gpu = (cb.gpuEndTime - cb.gpuStartTime) * 1000 }
    }
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    colour.getBytes(&bytes, bytesPerRow: width * 4, from: MTLRegionMake2D(0, 0, width, height), mipmapLevel: 0)
    for i in stride(from: 0, to: bytes.count, by: 4) { bytes.swapAt(i, i + 2) }   // BGRA → RGBA
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true,
                               isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: width * 4, bitsPerPixel: 32)!
    memcpy(rep.bitmapData!, bytes, bytes.count)
    try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
    return gpu
  }
}

// Drives the shared physics from the keyboard and follows the car with the RC chase camera.
final class Driver {
  let sim: Sim, renderer: Renderer
  var cam: SIMD3<Float>? = nil
  init(sim: Sim, renderer: Renderer) { self.sim = sim; self.renderer = renderer }
  // macOS key codes: W 13, S 1, A 0, D 2, ←123 →124 ↓125 ↑126, space 49, shift 56.
  func input(_ k: Set<UInt16>) -> Sim.Input {
    var i = Sim.Input(); let has = { k.contains($0) }
    i.throttle = (has(13) || has(126) ? 1 : 0) - (has(1) || has(125) ? 1 : 0)
    i.steer = (has(2) || has(124) ? 1 : 0) - (has(0) || has(123) ? 1 : 0)
    i.drift = has(56); i.burner = has(49); i.boost = has(49) ? 1.8 : 1
    i.pitch = (has(125) ? 1 : 0) - (has(126) ? 1 : 0); i.roll = (has(124) ? 1 : 0) - (has(123) ? 1 : 0)
    i.yaw = (has(2) ? 1 : 0) - (has(0) ? 1 : 0); i.power = (has(13) ? 1 : 0) - (has(1) ? 1 : 0)
    return i
  }
  func update(keys: Set<UInt16>, dt: Float) {
    var i = input(keys); if sim.pose().mode != 0 { i.throttle = 0; i.steer = 0 }   // flying: the jet keys only
    sim.step(i, dt: dt)
    let p = sim.pose()
    renderer.carModel = simd_float4x4(translation: p.pos) * simd_float4x4(p.q)
    // Low chase camera behind the heading (as in the browser game), eased so it never snaps.
    let fwd = SIMD3(sin(p.yaw), 0, -cos(p.yaw)), want = p.pos - fwd * (p.mode == 0 ? 1.55 : 2.6) + SIMD3(0, p.mode == 0 ? 0.55 : 0.9, 0)
    cam = cam.map { $0 + (want - $0) * min(1, dt * 7) } ?? want
    // As in the browser: pull the camera in front of anything between it and the car.
    let eye = p.pos + SIMD3(0, 0.12, 0), ray = cam! - eye, dist = simd_length(ray)
    if dist > 0.01, let hit = sim.raycast(eye, ray / dist, dist) { cam = eye + ray / dist * max(0.15, hit - 0.12) }
    let look = simd_normalize(eye - cam!)
    renderer.eye = cam!; renderer.yaw = atan2(look.x, -look.z); renderer.pitch = asin(look.y); renderer.resetAccumulation()
  }
}
extension simd_float4x4 {
  init(translation t: SIMD3<Float>) { self = matrix_identity_float4x4; columns.3 = SIMD4(t, 1) }
}

final class View: MTKView {
  var renderer: Renderer!, driver: Driver?, keys = Set<UInt16>(), last = CACurrentMediaTime()
  override var acceptsFirstResponder: Bool { true }
  override func keyDown(with e: NSEvent) {
    if !e.isARepeat, let d = driver { if e.keyCode == 36 { d.sim.fly() }; if e.keyCode == 15 { d.sim.recover() } }   // Enter: fly / parachute, R: recover
    keys.insert(e.keyCode)
  }
  override func keyUp(with e: NSEvent) { keys.remove(e.keyCode) }
  override func mouseDragged(with e: NSEvent) { renderer.yaw += Float(e.deltaX) * 0.004; renderer.pitch = max(-1.4, min(1.4, renderer.pitch - Float(e.deltaY) * 0.004)); renderer.resetAccumulation() }
  override func draw(_ r: NSRect) {
    let now = CACurrentMediaTime(), dt = Float(min(0.05, now - last)); last = now
    if let driver { driver.update(keys: keys, dt: dt) } else { fly(dt) }
    guard let drawable = currentDrawable else { return }
    let cb = renderer.queue.makeCommandBuffer()!
    renderer.encode(into: cb, output: drawable.texture)
    cb.present(drawable); cb.commit()
  }
  func fly(_ dt: Float) {
    let f = renderer.forward, flat = simd_normalize(SIMD3(f.x, 0, f.z)), right = SIMD3(-flat.z, 0, flat.x)
    let speed: Float = keys.contains(56) ? 40 : 8   // shift = fast
    var m = SIMD3<Float>(0, 0, 0)
    if keys.contains(13) { m += f }; if keys.contains(1) { m -= f }; if keys.contains(2) { m += right }; if keys.contains(0) { m -= right }
    if keys.contains(14) { m.y += 1 }; if keys.contains(12) { m.y -= 1 }
    if simd_length(m) > 0 { renderer.eye += m * speed * dt; renderer.resetAccumulation() }
  }
}

let args = CommandLine.arguments
// Default: the game, i.e. the same web build that ships to the website, in a native window.
// --metal (or --shot) runs the Metal ray-traced renderer on an exported world instead.
if !args.contains("--metal") && !args.contains("--shot") {   // (--snapshot is a game-mode QA capture)
  let web = args.firstIndex(of: "--web").map { URL(fileURLWithPath: args[$0 + 1]) } ?? Bundle.main.resourceURL!.appendingPathComponent("web")
  guard FileManager.default.fileExists(atPath: web.appendingPathComponent("rc/index.html").path) else { print("no game build at \(web.path) (make-app.sh packages it)"); exit(2) }
  if let i = args.firstIndex(of: "--snapshot") {
    snapshotGame(root: web, to: args[i + 1], wait: args.firstIndex(of: "--wait").flatMap { Double(args[$0 + 1]) } ?? 15, clickStart: args.contains("--click-start"))
  }
  let app = NSApplication.shared
  app.setActivationPolicy(.regular); installMenu()
  let game = GameWindow(root: web)
  app.activate(ignoringOtherApps: true)
  withExtendedLifetime(game) { app.run() }
  exit(0)
}
let worldPath = args.count >= 2 && !args[1].hasPrefix("--") ? args[1] : Bundle.main.path(forResource: "world", ofType: "rcworld")
// (Metal mode from here on.)
guard let worldPath else { print("usage: SaucerSprings <world.rcworld> [--shot out.png] [--at x,y,z,yaw,pitch]"); exit(2) }
let device = MTLCreateSystemDefaultDevice()!
guard device.supportsRaytracing else { print("this GPU has no Metal ray tracing"); exit(1) }
let t0 = CACurrentMediaTime()
let world = try loadWorld(worldPath, device: device)
let base = worldPath.hasSuffix(".rcworld") ? String(worldPath.dropLast(8)) : worldPath
let car = FileManager.default.fileExists(atPath: base + ".car") ? try loadWorld(base + ".car", device: device) : nil
let renderer = try Renderer(device: device, world: world, car: car)
var driver: Driver? = nil
if car != nil, FileManager.default.fileExists(atPath: base + ".col"), !args.contains("--fly") {
  let sim = try Sim(); let n = try sim.load(collision: base + ".col", spawn: world.spawn, yaw: world.yaw)
  driver = Driver(sim: sim, renderer: renderer); print("physics: \(n) collision triangles")
}
print(String(format: "%@: %d vertices, %d triangles, load+BVH %.2f s", device.name, world.vertexCount, world.indexCount / 3, CACurrentMediaTime() - t0))
if let i = args.firstIndex(of: "--at"), i + 1 < args.count {
  let v = args[i + 1].split(separator: ",").compactMap { Float($0) }
  if v.count >= 3 { renderer.eye = SIMD3(v[0], v[1], v[2]); renderer.atEye = renderer.eye }; if v.count >= 4 { renderer.yaw = v[3] }; if v.count >= 5 { renderer.pitch = v[4] }
}
if let i = args.firstIndex(of: "--shot"), i + 1 < args.count {
  let samples = args.firstIndex(of: "--samples").flatMap { Int(args[$0 + 1]) } ?? 96
  renderer.moving = args.contains("--moving")
  // --drive N: drive straight ahead (throttle held) for N seconds of 60 fps frames, then capture.
  if let d = args.firstIndex(of: "--drive").flatMap({ Float(args[$0 + 1]) }), let driver {
    renderer.drive = { driver.update(keys: [13], dt: 1 / 60) }; renderer.driveFrames = Int(d * 60)
  }
  let size = args.firstIndex(of: "--size").map { args[$0 + 1].split(separator: "x").compactMap { Int($0) } } ?? [1280, 720]
  // --look x,y,z: aim the --at camera at a point (for framing stills such as the app icon).
  if let l = args.firstIndex(of: "--look").map({ args[$0 + 1].split(separator: ",").compactMap { Float($0) } }), l.count == 3 {
    renderer.lookTarget = SIMD3(l[0], l[1], l[2])
  }
  let ms = try renderer.shot(to: args[i + 1], width: size[0], height: size[1], samples: samples)
  print(String(format: "frame GPU %.2f ms", ms)); exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.regular); installMenu()
let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 800), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
window.title = "Saucer Springs"
let view = View(frame: window.contentLayoutRect, device: device)
view.colorPixelFormat = renderer.colourFormat; view.framebufferOnly = false; view.renderer = renderer; view.driver = driver; view.preferredFramesPerSecond = 120
window.contentView = view; window.center(); window.makeKeyAndOrderFront(nil); window.makeFirstResponder(view)
app.activate(ignoringOtherApps: true)
app.run()

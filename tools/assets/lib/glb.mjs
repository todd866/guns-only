import { readFile } from "node:fs/promises";
import path from "node:path";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;

function accessorCount(gltf, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  return Number.isInteger(accessor?.count) ? accessor.count : 0;
}

function primitiveElementCount(gltf, primitive) {
  if (Number.isInteger(primitive.indices)) return accessorCount(gltf, primitive.indices);
  if (Number.isInteger(primitive.attributes?.POSITION)) return accessorCount(gltf, primitive.attributes.POSITION);
  return 0;
}

function triangleCount(gltf, primitive) {
  const count = primitiveElementCount(gltf, primitive);
  switch (primitive.mode ?? 4) {
    case 4: return Math.floor(count / 3);
    case 5:
    case 6: return Math.max(0, count - 2);
    default: return 0;
  }
}

function imageUsesKtx2(image) {
  return image?.mimeType === "image/ktx2" || typeof image?.uri === "string" && image.uri.toLowerCase().endsWith(".ktx2");
}

export function inspectGltfJson(gltf) {
  if (!gltf || typeof gltf !== "object" || Array.isArray(gltf)) throw new Error("glTF JSON root must be an object");
  let primitives = 0;
  let triangles = 0;
  let vertices = 0;
  let uv0Primitives = 0;
  let tangentPrimitives = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitives++;
      triangles += triangleCount(gltf, primitive);
      vertices += Number.isInteger(primitive.attributes?.POSITION)
        ? accessorCount(gltf, primitive.attributes.POSITION)
        : 0;
      if (Number.isInteger(primitive.attributes?.TEXCOORD_0)) uv0Primitives++;
      if (Number.isInteger(primitive.attributes?.TANGENT)) tangentPrimitives++;
    }
  }
  const images = Array.isArray(gltf.images) ? gltf.images : [];
  const nodeNames = (gltf.nodes ?? []).map((node) => node?.name).filter((name) => typeof name === "string").sort();
  const externalUris = [];
  for (const collection of [gltf.buffers ?? [], images]) {
    for (const item of collection) {
      if (typeof item?.uri === "string" && !item.uri.startsWith("data:")) externalUris.push(item.uri);
    }
  }
  externalUris.sort();
  const extensionsUsed = [...(gltf.extensionsUsed ?? [])].sort();
  const extensionsRequired = [...(gltf.extensionsRequired ?? [])].sort();
  return {
    version: String(gltf.asset?.version ?? "unknown"),
    generator: typeof gltf.asset?.generator === "string" ? gltf.asset.generator : null,
    scenes: gltf.scenes?.length ?? 0,
    nodes: gltf.nodes?.length ?? 0,
    meshes: gltf.meshes?.length ?? 0,
    primitives,
    triangles,
    vertices,
    uv0Primitives,
    tangentPrimitives,
    materials: gltf.materials?.length ?? 0,
    pbrTextureMaterials: (gltf.materials ?? []).filter((material) => Boolean(
      material?.pbrMetallicRoughness?.baseColorTexture
      || material?.pbrMetallicRoughness?.metallicRoughnessTexture
      || material?.normalTexture
      || material?.occlusionTexture,
    )).length,
    normalMapMaterials: (gltf.materials ?? []).filter((material) => Boolean(material?.normalTexture)).length,
    textures: gltf.textures?.length ?? 0,
    images: images.length,
    ktx2Images: images.filter(imageUsesKtx2).length,
    animations: gltf.animations?.length ?? 0,
    cameras: gltf.cameras?.length ?? 0,
    lights: gltf.extensions?.KHR_lights_punctual?.lights?.length ?? 0,
    nodeNames,
    socketNames: nodeNames.filter((name) => name.startsWith("SOCKET_")),
    extensionsUsed,
    extensionsRequired,
    usesMeshopt: extensionsUsed.includes("EXT_meshopt_compression") || extensionsRequired.includes("EXT_meshopt_compression"),
    usesDraco: extensionsUsed.includes("KHR_draco_mesh_compression") || extensionsRequired.includes("KHR_draco_mesh_compression"),
    externalUris,
  };
}

export function inspectGlbBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  if (buffer.byteLength < 20) throw new Error("GLB is shorter than its 20-byte minimum");
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error("file does not begin with the glTF binary magic");
  const version = buffer.readUInt32LE(4);
  if (version !== 2) throw new Error(`unsupported GLB version ${version}; expected 2`);
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.byteLength) throw new Error(`GLB length header is ${declaredLength}, actual file is ${buffer.byteLength}`);

  let offset = 12;
  let json = null;
  while (offset + 8 <= buffer.byteLength) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (length < 0 || offset + length > buffer.byteLength) throw new Error("GLB chunk extends beyond end of file");
    if (type === JSON_CHUNK && json === null) {
      const source = buffer.subarray(offset, offset + length).toString("utf8").replace(/[\0\x20]+$/u, "");
      try { json = JSON.parse(source); }
      catch (error) { throw new Error(`invalid GLB JSON chunk: ${error.message}`); }
    }
    offset += length;
  }
  if (offset !== buffer.byteLength) throw new Error("GLB contains trailing bytes outside a chunk");
  if (!json) throw new Error("GLB has no JSON chunk");
  return { ...inspectGltfJson(json), containerBytes: buffer.byteLength, container: "glb", json };
}

export async function inspectModelFile(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".glb") return inspectGlbBuffer(await readFile(file));
  if (extension === ".gltf") {
    let json;
    try { json = JSON.parse(await readFile(file, "utf8")); }
    catch (error) { throw new Error(`invalid glTF JSON: ${error.message}`); }
    const info = inspectGltfJson(json);
    return { ...info, containerBytes: (await readFile(file)).byteLength, container: "gltf", json };
  }
  return null;
}

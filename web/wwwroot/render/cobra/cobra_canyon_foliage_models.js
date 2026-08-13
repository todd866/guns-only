/**
 * Loads the authored CC0 palm mesh for the jungle role.
 *
 * Everything in this canyon has been geometry typed into JavaScript, which is why it reads as
 * hand-made. The repo has carried a full glTF pipeline the whole time (GLTFLoader, KTX2,
 * meshopt, the AssetRegistry) — the Korea pack uses it; this pack never did.
 * `content/packs/cobra-vietnam/asset-manifest.json` declares the palm cluster as CC0 by
 * Quaternius, and this module turns it into instanceable geometry.
 *
 * FAILS SAFE, exactly like the foliage atlas beside it: any load failure returns null and the
 * caller keeps the crossed alpha cards, which the manifest already declares as the fallback.
 * A missing asset must never cost the player the scene.
 */

// Resolved against THIS module's URL (/render/cobra/…), so it needs two levels up to reach
// the published wwwroot root. One level lands in /render/ and 404s into the card fallback —
// which fails silently by design, so the frame just looks unchanged.
const PALM_ASSET_URL = "../../content/packs/cobra-vietnam/assets/vegetation/palm-cluster.glb";

/**
 * The palm file holds five variants (PalmTree_1..5) as sibling nodes. An InstancedMesh
 * replicates its ONE geometry at every placement, so merging all five would put five
 * overlapping palms at every jungle position — five times the triangles for a shape nobody
 * asked for. Pick a single variant instead, chosen by sorted name so the build is
 * deterministic across loads and machines.
 */
function selectVariantRoot(scene) {
  const meshBearing = (node) => {
    let found = false;
    node.traverse((child) => {
      if (child.isMesh && child.geometry?.attributes?.position) found = true;
    });
    return found;
  };
  // The exporter wraps the five variants in a single mesh-less "RootNode". Descend through any
  // such wrapper — picking it would merge all five and put a whole grove at every placement.
  let level = scene.children.filter(meshBearing);
  while (level.length === 1 && !level[0].isMesh) {
    const inner = level[0].children.filter(meshBearing);
    if (inner.length === 0) break;
    level = inner;
  }
  if (level.length === 0) return null;
  level.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return level[0];
}

/**
 * Merges every primitive beneath one variant root into a single non-indexed
 * position/normal/uv geometry, which is what InstancedMesh takes.
 */
function mergeVariantGeometry(THREE, root) {
  const positions = [];
  const normals = [];
  const uvs = [];
  root.updateMatrixWorld(true);
  // World matrices carry the variant's own offset within the file; strip it so the palm sits
  // at the placement, not wherever the artist parked it on the source grid.
  const inverseRoot = root.matrixWorld.clone().invert();
  root.traverse((child) => {
    const geometry = child.isMesh ? child.geometry : null;
    if (!geometry?.attributes?.position) return;
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.attributes.position;
    const normal = source.attributes.normal;
    const uv = source.attributes.uv;
    const matrix = inverseRoot.clone().multiply(child.matrixWorld);
    const vertex = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let index = 0; index < position.count; index++) {
      vertex.fromBufferAttribute(position, index).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      if (normal) {
        vertex.fromBufferAttribute(normal, index).applyMatrix3(normalMatrix).normalize();
        normals.push(vertex.x, vertex.y, vertex.z);
      } else {
        normals.push(0, 1, 0);
      }
      uvs.push(uv ? uv.getX(index) : 0.5, uv ? uv.getY(index) : 0.5);
    }
    if (source !== geometry) source.dispose();
  });
  if (positions.length === 0) return null;

  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Normalises the merged palm to a UNIT footprint so it can drop into the existing placement
 * maths untouched. Every ambient placement already scales by an authored per-instance
 * width/height; a raw glTF in metres would be scaled a second time and produce hundred-metre
 * palms.
 */
function normaliseToUnit(THREE, geometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = Math.max(1e-6, box.max.y - box.min.y);
  const width = Math.max(1e-6, Math.max(box.max.x - box.min.x, box.max.z - box.min.z));
  // Sit the base on y=0 and centre horizontally: placements anchor at ground level.
  geometry.translate(
    -(box.min.x + box.max.x) * 0.5,
    -box.min.y,
    -(box.min.z + box.max.z) * 0.5,
  );
  geometry.scale(1 / width, 1 / height, 1 / width);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * @returns {Promise<{geometry: object, url: string, triangles: number} | null>} null when
 * unavailable, so the caller falls back to the procedural cards.
 */
export async function loadCobraVietnamPalmGeometry(THREE, options = {}) {
  const url = options.url ?? new URL(PALM_ASSET_URL, import.meta.url).href;
  try {
    const { GLTFLoader } = await import("../../vendor/three/addons/loaders/GLTFLoader.js");
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const root = selectVariantRoot(gltf.scene);
    if (!root) return null;
    const merged = mergeVariantGeometry(THREE, root);
    if (!merged) return null;
    const triangles = merged.attributes.position.count / 3;
    return Object.freeze({
      geometry: normaliseToUnit(THREE, merged),
      url,
      triangles,
    });
  } catch {
    return null;
  }
}

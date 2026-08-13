/**
 * CC0 foliage atlas for Cobra Canyon near-field jungle cards.
 * Provenance: content/packs/cobra-vietnam/environment/foliage/SOURCES.md
 */

export const COBRA_VIETNAM_FOLIAGE_ATLAS_URL =
  "/content/packs/cobra-vietnam/environment/foliage/foliage-atlas.png";

/** Palm half of foliage-atlas.png (u ∈ [0, 0.5]). */
export const FOLIAGE_UV_PALM = Object.freeze({ u0: 0, u1: 0.5, v0: 0, v1: 1 });

/** Understory half of foliage-atlas.png (u ∈ [0.5, 1]). */
export const FOLIAGE_UV_UNDERSTORY = Object.freeze({ u0: 0.5, u1: 1, v0: 0, v1: 1 });

/**
 * Tiny procedural stand-in so Node tests and failed loads still exercise the alpha-card path.
 * Not a visual substitute for the shipped CC0 atlas in the browser.
 */
export function createSyntheticFoliageAtlasTexture(THREE) {
  const width = 16;
  const height = 8;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const palmHalf = x < width / 2;
      const nx = palmHalf ? (x + 0.5) / (width / 2) : (x - width / 2 + 0.5) / (width / 2);
      const ny = (y + 0.5) / height;
      // Soft diamond silhouette so alphaTest has something to discard.
      const radial = Math.abs(nx - 0.5) * 2 + Math.abs(ny - 0.55) * 1.4;
      const inside = radial < (palmHalf ? 0.95 : 0.85);
      data[i] = palmHalf ? 40 : 50;
      data[i + 1] = palmHalf ? 110 : 130;
      data[i + 2] = palmHalf ? 45 : 55;
      data[i + 3] = inside ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.name = "COBRA_VIETNAM_FOLIAGE_ATLAS_SYNTHETIC";
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  if ("SRGBColorSpace" in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  else if ("sRGBEncoding" in THREE) texture.encoding = THREE.sRGBEncoding;
  return texture;
}

function configureFoliageTexture(THREE, texture) {
  texture.name = texture.name || "COBRA_VIETNAM_FOLIAGE_ATLAS";
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, texture.anisotropy || 4);
  if ("SRGBColorSpace" in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  else if ("sRGBEncoding" in THREE) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Loads the shipped CC0 atlas. Rejects if TextureLoader is unavailable.
 */
export function loadCobraVietnamFoliageTextures(THREE, options = {}) {
  const url = options.url ?? COBRA_VIETNAM_FOLIAGE_ATLAS_URL;
  if (!THREE?.TextureLoader) {
    return Promise.reject(new TypeError("THREE.TextureLoader is required to load foliage cards."));
  }
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => resolve(Object.freeze({
        atlas: configureFoliageTexture(THREE, texture),
        url,
        synthetic: false,
      })),
      undefined,
      (error) => reject(error ?? new Error(`Failed to load foliage atlas: ${url}`)),
    );
  });
}

/**
 * Resolves browser atlas or synthetic fallback. Always returns a usable `{ atlas }`.
 */
export async function resolveCobraVietnamFoliageTextures(THREE, options = {}) {
  try {
    return await loadCobraVietnamFoliageTextures(THREE, options);
  } catch {
    return Object.freeze({
      atlas: createSyntheticFoliageAtlasTexture(THREE),
      url: null,
      synthetic: true,
    });
  }
}

/**
 * Soft falloff for the mist and water-accent cards.
 *
 * These were flat, UNTEXTURED `MeshBasicMaterial` quads at 0.42 opacity, double-sided — so every
 * mist billboard drew as a hard-edged translucent grey rectangle hanging in the air, which is
 * exactly what it looks like from the cockpit. Mist has no edges. A tiny radial alpha ramp is
 * enough to make the card read as a drifting bank instead of a slab, and it costs one 32x32
 * DataTexture for the whole role.
 */
export function createCobraSoftFalloffTexture(THREE) {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = (x + 0.5) / size - 0.5;
      const ny = (y + 0.5) / size - 0.5;
      // Wider than tall: a mist bank lies along the ground rather than standing up in a column.
      const radial = Math.sqrt((nx * nx) / 0.26 + (ny * ny) / 0.10);
      const alpha = Math.max(0, 1 - radial);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      // Squared so the edge leaves gently instead of ending on a visible rim.
      data[i + 3] = Math.round(255 * alpha * alpha);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.name = "COBRA_CANYON_SOFT_FALLOFF";
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if ("SRGBColorSpace" in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

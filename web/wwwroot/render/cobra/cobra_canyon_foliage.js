/**
 * Project-authored foliage atlas for Cobra Canyon near-field jungle cards.
 * The same atlas/regions are declared in the renderer-neutral visual contract for Unity parity.
 * Provenance: content/packs/cobra-vietnam/environment/foliage/SOURCES.md
 */

export const COBRA_VIETNAM_FOLIAGE_ATLAS_URL =
  "/content/packs/cobra-vietnam/environment/foliage/foliage-atlas-painted-v2.png";
export const COBRA_VIETNAM_GROUND_MACRO_URL =
  "/content/packs/cobra-vietnam/environment/textures/cobra-ground-macro-painted-v1.png";

// Atlas regions use the renderer-neutral top-left/down convention in the visual contract.
// Upload without implicit Y inversion; card geometry maps physical top to vMin and bottom to vMax.
export const FOLIAGE_UV_PALM = Object.freeze({ u0: 0, u1: 0.5, v0: 0, v1: 0.5 });
export const FOLIAGE_UV_HARDWOOD = Object.freeze({ u0: 0.5, u1: 1, v0: 0, v1: 0.5 });
export const FOLIAGE_UV_BAMBOO = Object.freeze({ u0: 0, u1: 0.5, v0: 0.5, v1: 1 });
export const FOLIAGE_UV_SCRUB = Object.freeze({ u0: 0.5, u1: 1, v0: 0.5, v1: 1 });

// Compatibility name for older callers; the v2 atlas uses the dedicated low scrub quadrant.
export const FOLIAGE_UV_UNDERSTORY = FOLIAGE_UV_SCRUB;

/**
 * Tiny procedural stand-in so Node tests and failed loads still exercise the alpha-card path.
 * Not a visual substitute for the shipped CC0 atlas in the browser.
 */
export function createSyntheticFoliageAtlasTexture(THREE) {
  const width = 16;
  const height = 16;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const left = x < width / 2;
      const top = y < height / 2;
      const nx = (x % (width / 2) + 0.5) / (width / 2);
      const ny = (y % (height / 2) + 0.5) / (height / 2);
      // Soft diamond silhouette so alphaTest has something to discard.
      const radial = Math.abs(nx - 0.5) * 2 + Math.abs(ny - 0.55) * 1.4;
      const inside = radial < (top ? 0.95 : 0.84);
      data[i] = left ? 40 : 52;
      data[i + 1] = top ? 112 : 136;
      data[i + 2] = left ? 42 : 56;
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
  texture.flipY = false;
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
  texture.anisotropy = Math.max(4, texture.anisotropy || 1);
  texture.flipY = false;
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

function configureGroundMacroTexture(THREE, texture) {
  texture.name = texture.name || "COBRA_VIETNAM_GROUND_MACRO";
  // Mirror-repeat gives the shader a route-scale layer and a restrained near-field layer from the
  // same portable source. Mirroring keeps the join continuous; the two scales/rotations keep it
  // from reading as a stamped square. This is albedo only — terrain authority never moves.
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(4, texture.anisotropy || 1);
  // Ground sampling uses the contract's top-left/down image convention on the canonical
  // east/south material plane. Unity must use the equivalent import orientation.
  texture.flipY = false;
  if ("SRGBColorSpace" in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  else if ("sRGBEncoding" in THREE) texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

function loadGroundMacroTexture(THREE, url) {
  if (!THREE?.TextureLoader) {
    return Promise.reject(new TypeError("THREE.TextureLoader is required to load ground art."));
  }
  const loader = new THREE.TextureLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (texture) => resolve(configureGroundMacroTexture(THREE, texture)),
      undefined,
      (error) => reject(error ?? new Error(`Failed to load ground macro: ${url}`)),
    );
  });
}

/** Resolves the renderer-neutral foliage and macro-ground art as one presentation bundle. */
export async function resolveCobraVietnamVisualTextures(THREE, options = {}) {
  const foliage = await resolveCobraVietnamFoliageTextures(THREE, options);
  const groundUrl = options.groundUrl ?? COBRA_VIETNAM_GROUND_MACRO_URL;
  try {
    const ground = await loadGroundMacroTexture(THREE, groundUrl);
    return Object.freeze({
      ...foliage,
      ground,
      groundUrl,
      groundSynthetic: false,
    });
  } catch {
    return Object.freeze({
      ...foliage,
      ground: null,
      groundUrl: null,
      groundSynthetic: true,
    });
  }
}

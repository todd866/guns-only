/**
 * Reviewed foliage atlas for Cobra Canyon near-field jungle cards.
 * Provenance: content/packs/cobra-vietnam/environment/foliage/SOURCES.md
 */

export const COBRA_VIETNAM_FOLIAGE_ATLAS_URL =
  "/content/packs/cobra-vietnam/environment/foliage/foliage-atlas-generated-v2.png";

/** Broad-leaf clump half of the atlas (u ∈ [0, 0.5]). */
export const FOLIAGE_UV_PALM = Object.freeze({ u0: 0, u1: 0.5, v0: 0, v1: 1 });

/** Understory half of the atlas (u ∈ [0.5, 1]). */
export const FOLIAGE_UV_UNDERSTORY = Object.freeze({ u0: 0.5, u1: 1, v0: 0, v1: 1 });

/**
 * Tiny procedural stand-in so Node tests and failed loads still exercise the alpha-card path.
 * Not a visual substitute for the shipped atlas in the browser.
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

function configureFoliageTexture(THREE, texture, url) {
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
  if (String(url).split("?")[0].endsWith(COBRA_VIETNAM_FOLIAGE_ATLAS_URL)) {
    texture.userData.cobraFoliageEncoding = "black-matte-v1";
  }
  return texture;
}

/**
 * The generated atlas stores colour against pure black rather than an alpha channel. Interpret
 * that encoding only for the tagged source. Coverage is measured in linear texture space before
 * scene/instance tint; the same hook is used in colour and shadow passes. Compensating the narrow
 * matte transition reduces black fringes at minified leaf edges. This adds no texture fetch.
 */
export function applyCobraFoliageOpacity(THREE, material) {
  if (material.map?.userData?.cobraFoliageEncoding !== "black-matte-v1") return false;
  const mapFragment = THREE.ShaderChunk.map_fragment.replaceAll("vMapUv", "cobraFoliageUv");
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      #ifdef USE_MAP
        // The actual generated plants have a clear gap at u=.52. Preserve both silhouettes
        // while mapping the geometry's existing half-atlas UVs into those source regions.
        vec2 cobraFoliageUv = vec2(vMapUv.x < 0.5 ? vMapUv.x * 1.04
          : 0.52 + (vMapUv.x - 0.5) * 0.96, vMapUv.y);
      #endif
      ${mapFragment}
      #ifdef USE_MAP
        float foliageCoverage = smoothstep(0.002, 0.018,
          max(sampledDiffuseColor.r, max(sampledDiffuseColor.g, sampledDiffuseColor.b)));
        diffuseColor.a *= foliageCoverage;
        diffuseColor.rgb /= max(foliageCoverage, 0.001);
        // The generated source already has lifted midtones. Calm its lime saturation after
        // coverage is measured, so colour tuning cannot change the leaf silhouette or shadows.
        float foliageLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(foliageLuminance), diffuseColor.rgb, 0.7);
      #endif
    `);
  };
  material.customProgramCacheKey = () => "cobra-foliage-black-matte-v1-muted";
  return true;
}

/**
 * Loads the shipped atlas. Rejects if TextureLoader is unavailable.
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
        atlas: configureFoliageTexture(THREE, texture, url),
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

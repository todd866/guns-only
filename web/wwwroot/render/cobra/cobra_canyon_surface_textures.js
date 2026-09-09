/** Reviewed fictional surface art; the page owns this shared texture across quality rebuilds. */
export const COBRA_CANYON_ROCK_TEXTURE_URL =
  "/content/packs/cobra-vietnam/environment/surfaces/limestone-generated-v1.webp";
export const COBRA_CANYON_CANOPY_TEXTURE_URL =
  "/content/packs/cobra-vietnam/environment/surfaces/canopy-generated-v1.webp";

function loadTexture(THREE, url, name) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (texture) => {
      texture.name = name;
      // Generation did not guarantee matching edges. Mirroring keeps sampling continuous;
      // world projections and a broad exposure mask break up the reflected repetition.
      texture.wrapS = THREE.MirroredRepeatWrapping;
      texture.wrapT = THREE.MirroredRepeatWrapping;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 4;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    }, undefined, (error) => reject(error ?? new Error(`Failed to load surface art: ${url}`)));
  });
}

/** Independent loads retain whichever surface succeeds; one missing image cannot discard another. */
export async function loadCobraCanyonSurfaceTextures(THREE, options = {}) {
  if (!THREE?.TextureLoader) throw new TypeError("TextureLoader is required.");
  const url = options.url ?? COBRA_CANYON_ROCK_TEXTURE_URL;
  const canopyUrl = options.canopyUrl ?? COBRA_CANYON_CANOPY_TEXTURE_URL;
  const [rockResult, canopyResult] = await Promise.allSettled([
    loadTexture(THREE, url, "COBRA_CANYON_LIMESTONE_GENERATED_V1"),
    loadTexture(THREE, canopyUrl, "COBRA_CANYON_TREETOPS_GENERATED_V1"),
  ]);
  if (rockResult.status === "rejected" && canopyResult.status === "rejected") {
    throw new AggregateError([rockResult.reason, canopyResult.reason], "Surface art unavailable.");
  }
  return Object.freeze({
    rock: rockResult.status === "fulfilled" ? rockResult.value : null,
    canopy: canopyResult.status === "fulfilled" ? canopyResult.value : null,
    url, canopyUrl,
  });
}

/** Called once by the page owner, after materials borrowing these images have been disposed. */
export function disposeCobraCanyonSurfaceTextures(textures) {
  for (const texture of new Set([textures?.rock, textures?.canopy])) texture?.dispose();
}

/** Failure preserves the procedural basin; surface art must never prevent a sortie. */
export async function resolveCobraCanyonSurfaceTextures(THREE, options = {}) {
  try {
    return await loadCobraCanyonSurfaceTextures(THREE, options);
  } catch {
    return null;
  }
}

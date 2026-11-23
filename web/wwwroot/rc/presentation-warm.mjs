// Shader compile and texture upload belong before the opening camera moves.
// Three's compile walks visible materials; initTexture forces the first upload
// that would otherwise stall a later frame.

function consider(value, take, depth) {
  if (!value || typeof value !== 'object' || depth > 4) return;
  if (value.isTexture) {
    take(value);
    return;
  }
  if (value.isColor || value.isVector2 || value.isVector3 || value.isMatrix3 || value.isMatrix4) return;
  const nested = Array.isArray(value) ? value : Object.values(value);
  for (const item of nested) consider(item, take, depth + 1);
}

export function presentationTextures(scene) {
  const seen = new Set();
  const textures = [];
  const take = texture => {
    if (!texture?.isTexture || seen.has(texture)) return;
    seen.add(texture);
    textures.push(texture);
  };
  scene.traverse?.(object => {
    for (const material of [].concat(object.material ?? [])) consider(material, take, 0);
  });
  consider(scene.environment, take, 0);
  consider(scene.background, take, 0);
  return textures;
}

export async function warmPresentation(renderer, scene, camera) {
  if (typeof renderer?.compileAsync === 'function') await renderer.compileAsync(scene, camera);
  else renderer?.compile?.(scene, camera);
  for (const texture of presentationTextures(scene)) {
    try {
      renderer?.initTexture?.(texture);
    } catch {
      // An image that is not decoded yet uploads on first use instead.
    }
  }
}

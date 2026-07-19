const BYTE_MAX = 255;

function clampByte(value) {
  return Math.max(0, Math.min(BYTE_MAX, Math.round(value)));
}

function hash2d(x, y, seed) {
  let value = Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + seed, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}

function rgbaTexture(THREE, name, width, height, pixel, options = {}) {
  const bytes = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const color = pixel(x, y, width, height);
      bytes[offset] = clampByte(color[0]);
      bytes[offset + 1] = clampByte(color[1]);
      bytes[offset + 2] = clampByte(color[2]);
      bytes[offset + 3] = clampByte(color[3] ?? BYTE_MAX);
    }
  }
  const texture = new THREE.DataTexture(bytes, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = name;
  texture.flipY = false;
  texture.wrapS = options.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = options.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = options.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.userData = {
    generator: "guns-only/pbr-textures@1",
    semantic: options.semantic ?? "surface",
    deterministic: true,
  };
  texture.needsUpdate = true;
  return texture;
}

function panelHeight(x, y, size, seed) {
  const major = size / 4;
  const minor = size / 8;
  const majorDistance = Math.min(x % major, major - x % major, y % major, major - y % major);
  const minorDistance = Math.min(x % minor, minor - x % minor, y % minor, minor - y % minor);
  const seam = majorDistance < 1.1 ? -0.75 : minorDistance < 0.7 ? -0.28 : 0;
  const rivetCell = Math.max(4, Math.floor(size / 32));
  const rivetX = x % rivetCell;
  const rivetY = y % rivetCell;
  const rivet = (majorDistance < 2.2 || minorDistance < 1.5)
    && (rivetX - rivetCell * 0.5) ** 2 + (rivetY - rivetCell * 0.5) ** 2 < 1.5
    ? 0.8 : 0;
  const grain = (hash2d(x, y, seed) & 255) / 255 - 0.5;
  return seam + rivet + grain * 0.09;
}

/**
 * Creates a compact, shared base-colour/normal/ORM set. Base colour stays close
 * to white so the material's authored colour remains the livery source of truth.
 */
export function createPanelledSurfaceSet(THREE, name, options = {}) {
  const size = options.size ?? 128;
  const seed = options.seed ?? 1;
  const warmth = options.warmth ?? 0;
  const grime = options.grime ?? 0.08;
  const roughness = options.roughness ?? 0.82;
  const metalness = options.metalness ?? 0.96;
  const baseColor = rgbaTexture(THREE, `${name}_BASECOLOR`, size, size, (x, y) => {
    const height = panelHeight(x, y, size, seed);
    const streak = ((hash2d(Math.floor(x / 3), Math.floor(y / 11), seed + 17) & 255) / 255 - 0.5) * grime;
    const seamDarkening = height < -0.2 ? height * 18 : height * 4;
    const value = 242 + seamDarkening + streak * 30;
    return [value + warmth * 10, value + warmth * 4, value - warmth * 8, 255];
  }, { srgb: true, semantic: "baseColor" });

  const normal = rgbaTexture(THREE, `${name}_NORMAL`, size, size, (x, y) => {
    const left = panelHeight((x - 1 + size) % size, y, size, seed);
    const right = panelHeight((x + 1) % size, y, size, seed);
    const down = panelHeight(x, (y - 1 + size) % size, size, seed);
    const up = panelHeight(x, (y + 1) % size, size, seed);
    const dx = (right - left) * 0.34;
    const dy = (up - down) * 0.34;
    const inverseLength = 1 / Math.hypot(dx, dy, 1);
    return [128 - dx * inverseLength * 127, 128 - dy * inverseLength * 127, 128 + inverseLength * 127, 255];
  }, { semantic: "normal" });

  // glTF ORM packing: occlusion=R, roughness=G, metalness=B.
  const orm = rgbaTexture(THREE, `${name}_ORM`, size, size, (x, y) => {
    const height = panelHeight(x, y, size, seed);
    const variation = ((hash2d(x, y, seed + 41) & 255) / 255 - 0.5) * 0.08;
    const occlusion = height < -0.2 ? 184 : 244;
    return [occlusion, (roughness + variation) * 255, metalness * 255, 255];
  }, { semantic: "occlusionRoughnessMetalness" });

  return Object.freeze({ baseColor, normal, orm, size });
}

export function applyPbrTextureSet(material, textureSet, options = {}) {
  material.map = textureSet.baseColor;
  material.normalMap = textureSet.normal;
  material.normalScale?.set(options.normalScale ?? 0.62, options.normalScale ?? 0.62);
  material.aoMap = textureSet.orm;
  material.aoMapIntensity = options.aoIntensity ?? 0.72;
  material.roughnessMap = textureSet.orm;
  material.metalnessMap = textureSet.orm;
  material.needsUpdate = true;
  return material;
}

export function createInstrumentFaceTexture(THREE, name = "COCKPIT_INSTRUMENT_FACE", size = 256) {
  const center = (size - 1) * 0.5;
  const radius = size * 0.43;
  return rgbaTexture(THREE, name, size, size, (x, y) => {
    const dx = x - center;
    const dy = y - center;
    const distance = Math.hypot(dx, dy);
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const tickPhase = angle / (Math.PI * 2) * 60;
    const tickDistance = Math.abs(tickPhase - Math.round(tickPhase));
    const majorTick = Math.round(tickPhase) % 5 === 0;
    const tickBand = distance > radius * (majorTick ? 0.74 : 0.82) && distance < radius * 0.96 && tickDistance < 0.075;
    const outerRing = Math.abs(distance - radius) < size * 0.018;
    const centerBoss = distance < size * 0.025;
    if (distance > radius * 1.05) return [6, 9, 9, 255];
    if (outerRing) return [152, 164, 153, 255];
    if (tickBand) return [218, 224, 202, 255];
    if (centerBoss) return [178, 184, 168, 255];
    const mottling = (hash2d(x, y, 731) & 15) - 8;
    return [20 + mottling, 25 + mottling, 23 + mottling, 255];
  }, { srgb: true, repeat: false, semantic: "instrumentFace" });
}

export function createRoundelDecalTexture(THREE, name = "PLAYER_WING_ROUNDEL", size = 256) {
  const center = (size - 1) * 0.5;
  return rgbaTexture(THREE, name, size, size, (x, y) => {
    const nx = (x - center) / (size * 0.5);
    const ny = (y - center) / (size * 0.5);
    const radius = Math.hypot(nx, ny);
    if (radius > 0.94) return [255, 255, 255, 0];
    if (radius > 0.72) return [225, 228, 212, 255];
    if (radius > 0.48) return [24, 49, 73, 255];
    const angle = Math.atan2(ny, nx) - Math.PI / 2;
    const starRadius = Math.cos(5 * angle) * 0.08 + 0.34;
    return radius < starRadius ? [228, 230, 214, 255] : [24, 49, 73, 255];
  }, { srgb: true, repeat: false, semantic: "decal" });
}

export const PBR_TEXTURE_GENERATOR_ID = "guns-only/pbr-textures@1";

const DEFAULT_PROFILE_URL = "../../content/packs/korea-1950s/visual-profile.json";

const TONE_MAPPINGS = new Set([
  "none",
  "linear",
  "reinhard",
  "cineon",
  "aces_filmic",
  "agx",
  "neutral",
  "custom",
]);

const FOG_MODES = new Set(["none", "linear", "exponential"]);
const DISTANT_MODES = new Set(["mesh_only", "silhouette_impostor"]);
const ANTIALIASING_MODES = new Set(["none", "fxaa", "smaa"]);
const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

function number(value, fallback, minimum = -Infinity, maximum = Infinity) {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

function integer(value, fallback, minimum = -Infinity, maximum = Infinity) {
  return Math.round(number(value, fallback, minimum, maximum));
}

function bool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function enumeration(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function color(value, fallback) {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toUpperCase() : fallback;
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function copySettings(source = {}) {
  return {
    pixelRatioCap: number(source.pixelRatioCap, 1, 0.5, 4),
    shadowMapSize: integer(source.shadowMapSize, 0, 0, 8192),
    textureMaxSize: integer(source.textureMaxSize, 1024, 256, 16384),
    anisotropy: integer(source.anisotropy, 1, 1, 16),
    lodBias: number(source.lodBias, 0, -4, 4),
    particleMultiplier: number(source.particleMultiplier, 1, 0, 4),
    dynamicLights: integer(source.dynamicLights, 0, 0, 64),
    oceanRadialSegments: integer(source.oceanRadialSegments, 112, 16),
    oceanAngularSegments: integer(source.oceanAngularSegments, 144, 32),
  };
}

function normalizeTiers(rawTiers) {
  if (!Array.isArray(rawTiers) || rawTiers.length === 0) {
    throw new TypeError("A visual profile must define at least one quality tier.");
  }
  const ids = new Set();
  const tiers = rawTiers.map((rawTier, index) => {
    const tier = record(rawTier);
    const id = typeof tier.id === "string" && tier.id ? tier.id : `tier-${index}`;
    if (ids.has(id)) throw new TypeError(`Duplicate visual quality tier: ${id}`);
    ids.add(id);
    return {
      id,
      displayName: typeof tier.displayName === "string" && tier.displayName
        ? tier.displayName
        : id,
      order: integer(tier.order, index, 0),
      settings: copySettings(record(tier.settings)),
    };
  });
  return tiers.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * Selects a tier without consulting browser globals, keeping the decision
 * deterministic in tests, workers, replays, and server-side tooling.
 */
export function selectVisualQualityTier(tiers, options = {}) {
  if (options.tierId) {
    const selected = tiers.find((tier) => tier.id === options.tierId);
    if (!selected) throw new RangeError(`Unknown visual quality tier: ${options.tierId}`);
    return selected;
  }

  const deviceClass = options.deviceClass ?? "desktop";
  if (deviceClass === "mobile") {
    return tiers.find((tier) => tier.id === "mobile") ?? tiers[0];
  }
  if (deviceClass === "balanced" || number(options.deviceMemoryGiB, 8, 0) <= 4) {
    return tiers.find((tier) => tier.id === "balanced") ?? tiers[Math.min(1, tiers.length - 1)];
  }
  return tiers.find((tier) => tier.id === "desktop") ?? tiers[tiers.length - 1];
}

function tierExtension(extension, tierId) {
  const base = record(extension);
  return { ...base, ...record(record(base.tiers)[tierId]), tiers: undefined };
}

function normalizePostProcessing(profile, tier) {
  const tierId = tier.id;
  const defaults = tierId === "mobile"
    ? { enabled: false, antialiasing: "none", bloomEnabled: false }
    : tierId === "desktop"
      ? { enabled: true, antialiasing: "smaa", bloomEnabled: true }
      : { enabled: true, antialiasing: "fxaa", bloomEnabled: false };
  const raw = tierExtension(record(profile.extensions).postProcessing, tierId);
  const bloom = record(raw.bloom);
  return {
    enabled: bool(raw.enabled, defaults.enabled),
    hdr: bool(raw.hdr, true),
    antialiasing: enumeration(raw.antialiasing, ANTIALIASING_MODES, defaults.antialiasing),
    bloom: {
      enabled: bool(bloom.enabled ?? raw.bloomEnabled, defaults.bloomEnabled),
      selection: "luminance_threshold",
      threshold: number(bloom.threshold, 1.12, 0, 8),
      strength: number(bloom.strength, 0.18, 0, 2),
      radius: number(bloom.radius, 0.22, 0, 1),
    },
  };
}

function normalizeAdaptiveResolution(profile, tier) {
  const tierId = tier.id;
  const raw = tierExtension(record(profile.extensions).adaptiveResolution, tierId);
  const mobile = tierId === "mobile";
  const minScale = number(raw.minScale, mobile ? 0.68 : 0.72, 0.5, 1);
  return {
    enabled: bool(raw.enabled, true),
    targetFps: number(raw.targetFps, mobile ? 50 : 60, 24, 240),
    minScale,
    maxScale: Math.max(minScale, number(raw.maxScale, 1, 0.5, 1)),
    downThreshold: number(raw.downThreshold, 1.08, 1, 2),
    upThreshold: number(raw.upThreshold, 0.82, 0.25, 1),
    stepDown: number(raw.stepDown, 0.08, 0.01, 0.5),
    stepUp: number(raw.stepUp, 0.04, 0.01, 0.5),
    smoothing: number(raw.smoothing, 0.08, 0.01, 1),
    warmupSamples: integer(raw.warmupSamples, 45, 1, 600),
    cooldownSamples: integer(raw.cooldownSamples, 45, 1, 600),
    ignoredFrameMs: number(raw.ignoredFrameMs, 250, 34, 2000),
    modeTargetFps: {
      combat: number(record(raw.modeTargetFps).combat, mobile ? 50 : 60, 24, 240),
      carrier: number(record(raw.modeTargetFps).carrier, mobile ? 45 : 55, 24, 240),
      replay: number(record(raw.modeTargetFps).replay, mobile ? 45 : 60, 24, 240),
      menu: number(record(raw.modeTargetFps).menu, 30, 24, 240),
    },
  };
}

function normalizeFog(rawFog) {
  const fog = record(rawFog);
  const mode = enumeration(fog.mode, FOG_MODES, "none");
  const nearMetres = number(fog.nearMetres, 9000, 0);
  return {
    mode,
    color: color(fog.color, "#A8C1CC"),
    nearMetres,
    farMetres: Math.max(nearMetres + 1, number(fog.farMetres, 56000, 1)),
    density: number(fog.density, 0.00002, 0, 1),
  };
}

function normalizeEffects(rawEffects) {
  const effects = record(rawEffects);
  const bindings = Array.isArray(effects.bindings) ? effects.bindings : [];
  const byEventId = {};
  const normalizedBindings = bindings.flatMap((rawBinding) => {
    const binding = record(rawBinding);
    if (typeof binding.eventId !== "string" || typeof binding.assetId !== "string") return [];
    const normalized = {
      eventId: binding.eventId,
      assetId: binding.assetId,
      scale: number(binding.scale, 1, Number.EPSILON),
      settings: { ...record(binding.settings) },
    };
    byEventId[normalized.eventId] = normalized;
    return normalized;
  });
  return {
    id: typeof effects.id === "string" ? effects.id : "effects.unspecified.v1",
    bindings: normalizedBindings,
    byEventId,
  };
}

/** Normalizes schema-valid input and also puts hard safety bounds around extension values. */
export function normalizeVisualProfile(profile, options = {}) {
  const raw = record(profile);
  const tiers = normalizeTiers(raw.qualityTiers);
  const tier = selectVisualQualityTier(tiers, options);
  const environment = record(raw.environment);
  const lighting = record(environment.lighting);
  const readability = record(raw.readability);
  const distant = record(readability.distantRepresentation);
  const fallback = record(raw.fallbackPolicy);

  const normalized = {
    schemaVersion: raw.schemaVersion ?? "1.0.0",
    profileId: raw.profileId ?? "visual.unspecified.v1",
    profileVersion: raw.profileVersion ?? "0.0.0",
    packId: raw.packId ?? "unspecified",
    presentationProfileId: raw.presentationProfileId ?? "presentation.unspecified.v1",
    tier,
    tiers,
    renderer: {
      outputColorSpace: "srgb",
      toneMapping: enumeration(environment.toneMapping, TONE_MAPPINGS, "aces_filmic"),
      exposure: number(environment.exposure, 1, 0.01, 8),
      pixelRatioCap: tier.settings.pixelRatioCap,
    },
    environment: {
      skyAssetId: environment.skyAssetId ?? null,
      surfaceAssetId: environment.surfaceAssetId ?? null,
      platformAssetIds: Array.isArray(environment.platformAssetIds)
        ? [...environment.platformAssetIds]
        : [],
      fog: normalizeFog(environment.fog),
      lighting: {
        ambientIntensity: number(lighting.ambientIntensity, 1, 0, 32),
        sunIntensity: number(lighting.sunIntensity, 1, 0, 32),
        sunColor: color(lighting.sunColor, "#FFFFFF"),
        shadowDistanceMetres: number(lighting.shadowDistanceMetres, 0, 0, 100000),
      },
    },
    readability: {
      minimumTargetPixels: number(readability.minimumTargetPixels, 8, 1, 64),
      worldScale: 1,
      distantRepresentation: {
        mode: enumeration(distant.mode, DISTANT_MODES, "mesh_only"),
        transitionStartPixels: number(distant.transitionStartPixels, 14, 1, 128),
        fullyImpostorPixels: number(distant.fullyImpostorPixels, 8, 1, 128),
        hysteresisPixels: number(distant.hysteresisPixels, 2, 0, 32),
      },
      minimumHudContrastRatio: number(readability.minimumHudContrastRatio, 4.5, 1, 21),
      targetSilhouetteColor: color(readability.targetSilhouetteColor, "#D7E7EC"),
    },
    effects: normalizeEffects(raw.effectsProfile),
    fallbackPolicy: {
      allowProcedural: bool(fallback.allowProcedural, false),
      onMissing: typeof fallback.onMissing === "string" ? fallback.onMissing : "error",
      emitDiagnostics: bool(fallback.emitDiagnostics, true),
    },
    postProcessing: null,
    adaptiveResolution: null,
  };
  normalized.postProcessing = normalizePostProcessing(raw, tier);
  normalized.adaptiveResolution = normalizeAdaptiveResolution(raw, tier);
  return deepFreeze(normalized);
}

async function fetchProfile(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response?.ok) {
    throw new Error(`Visual profile request failed: ${response?.status ?? "unknown"} ${url}`);
  }
  return response.json();
}

/** Loads either an injected profile object or a URL relative to this module. */
export async function loadVisualProfile(options = {}) {
  const baseUrl = options.baseUrl ?? import.meta.url;
  const profileUrl = new URL(options.profileUrl ?? DEFAULT_PROFILE_URL, baseUrl).href;
  const profile = options.profile ?? await fetchProfile(profileUrl, options.fetch ?? fetch);
  return {
    profile,
    profileUrl,
    config: normalizeVisualProfile(profile, options),
  };
}

export { DEFAULT_PROFILE_URL as DEFAULT_VISUAL_PROFILE_URL };

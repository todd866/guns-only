// Renderer-neutral art direction for Cobra Canyon.
//
// The world, palette, light direction, scale and acceptance views are shared product decisions.
// WebGL and Unity are free to implement them differently, but neither renderer should invent a
// second theatre look. Keep this profile in lockstep with the portable contract under
// content/packs/cobra-vietnam/environment/cobra-canyon-visual-contract.v1.json.

function normalized(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return Object.freeze(vector.map((value) => value / length));
}

/** Maps a direction from the simulation's left-handed east/up/north basis into Three.js. */
export function cobraAuthorityDirectionToThree(direction) {
  if (!Array.isArray(direction) || direction.length !== 3
    || direction.some((value) => !Number.isFinite(value))) {
    throw new TypeError("direction must be a finite [east, up, north] triple");
  }
  return Object.freeze([direction[0], direction[1], -direction[2]]);
}

export const COBRA_CANYON_VISUAL_PROFILE = Object.freeze({
  schemaVersion: "4.0.0",
  profileId: "visual.cobra-vietnam.humid-readable.v4",
  packId: "cobra-vietnam",
  qualityTierIds: Object.freeze(["mobile", "balanced", "desktop"]),

  // Shared with the F-22 presentation. Theatre identity comes from landcover and humid air,
  // not from putting each experience under an unrelated sun.
  // Authority uses the simulation's east/up/north basis. Renderers must apply their declared
  // axis mapping instead of feeding this tuple directly to their native scene coordinates.
  // Its Three.js image is [east, up, -north], preserving the shared F-22 light direction.
  sunDirectionAuthority: normalized([0.50, 0.28, 0.82]),
  toneMappingExposure: 1.12,

  fog: Object.freeze({
    color: 0x8a9fa5,
    // ~9.8 km readable radius (1.87 / density): enough depth separation for layered ridges while
    // keeping the 3 km gorge legible. Continuous haze avoids visible quantisation bands.
    density: 0.00019,
  }),

  sky: Object.freeze({
    zenithColor: Object.freeze([0.035, 0.16, 0.34]),
    horizonColor: Object.freeze([0.34, 0.47, 0.52]),
    belowHorizonColor: Object.freeze([0.022, 0.075, 0.095]),
    skyCurveExponent: 0.42,
    horizonShoulderFalloff: 70,
    horizonShoulderWeight: 0.46,
    cloudColor: Object.freeze([0.62, 0.67, 0.69]),
    cloudShelf: Object.freeze([0.045, 0.34]),
  }),

  lighting: Object.freeze({
    hemisphereSkyColor: 0xb5cad0,
    hemisphereGroundColor: 0x314338,
    hemisphereIntensity: 1.02,
    sunColor: 0xffe2b4,
    sunIntensity: 2.65,
    sunDistanceM: 9_000,
  }),

  terrainPaint: Object.freeze({
    // Shadows retain shape but never collapse humid gorge walls into black cut-outs.
    shadowFloor: 0.36,
    toneRampGates: Object.freeze([
      Object.freeze({ start: 0.26, end: 0.40, weight: 0.42 }),
      Object.freeze({ start: 0.58, end: 0.76, weight: 0.58 }),
    ]),
    occlusionRange: Object.freeze([0.92, 1.06]),
    concavityNormalizerM: 26,
    reliefGain: 0.18,
    cloudShadowStrength: 0.08,
    microNormalStrength: 0.12,
    skyFill: Object.freeze([0.70, 0.79, 0.92]),
    sunKey: Object.freeze([1.06, 1.01, 0.92]),
    slopeFaceWindow: Object.freeze([0.035, 0.19]),
    elevationBandsM: Object.freeze([150, 300, 600, 900]),
    bands: Object.freeze({
      valleyFloor: Object.freeze([0.145, 0.225, 0.090]),
      cultivationGold: Object.freeze([0.205, 0.235, 0.155]),
      jungleMid: Object.freeze([0.050, 0.185, 0.060]),
      lateriteSlope: Object.freeze([0.300, 0.145, 0.055]),
      ridgeSage: Object.freeze([0.105, 0.195, 0.098]),
      rimRock: Object.freeze([0.300, 0.285, 0.235]),
    }),
    parcelPitchM: Object.freeze([118, 86]),
  }),

  water: Object.freeze({
    deepColor: Object.freeze([0.006, 0.032, 0.038]),
    shallowColor: Object.freeze([0.024, 0.078, 0.078]),
    bankColor: Object.freeze([0.100, 0.112, 0.064]),
    shoreWindow: Object.freeze([0.86, 1.10]),
    bankWidthM: 8,
  }),
});

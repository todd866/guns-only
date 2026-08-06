// Painted-tactical visual profile for the Cobra Canyon scene.
//
// Structure salvaged from the parked WIP commit 630cf83 ("visual.cobra-vietnam.painted-tactical
// .v1"); every constant is re-derived for the Build 264 scene, because the v1 numbers predate
// Builds 253-263 and baked the washed-out pre-261 look this profile exists to kill.
//
// The profile is the ONE SUN for the canyon: the lab sky shader, the scene light rig, the fog and
// the basin/river surface shaders all read `sunDirectionWorld` and `fog`, so glow, prop shading,
// haze and terrain relief agree about where the light comes from. The surface recipe itself is
// the production F-22 terrain technique (render/environment/korea_terrain.js) — see
// `cobra_canyon_terrain_material.js`, which is where these numbers become GLSL uniforms.
//
// CALIBRATED AGAINST THE ACTUAL HEIGHTFIELD, not against Korea's. Sampling
// `sampleCobraCanyonTerrain` on a 201x201 lattice over the 16 km bounds gives:
//   elevation  min 98 m, p10 199, p50 291, p90 620, max 932   (inside the 5.1 km basin: 98-571)
//   gradient   p10 0.00, p50 0.10, p90 0.30, p99 0.90, max 1.10
// So the whole playable bowl lives in ~150-350 m and under a 0.3 gradient. Elevation gates and
// the relief gain below are set from those numbers; Korea's gates, applied unchanged, collapse
// this basin into one band, which is precisely the Build 264 monotone.

function normalized(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  return Object.freeze([
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ]);
}

export const COBRA_CANYON_VISUAL_PROFILE = Object.freeze({
  schemaVersion: "3.0.0",
  profileId: "visual.cobra-vietnam.painted-tactical.v3",
  packId: "cobra-vietnam",
  qualityTierIds: Object.freeze(["mobile", "balanced", "desktop"]),

  // THE F-22'S SUN, VERBATIM (app.js SUN_DIRECTION). Not a cobra-specific afternoon: the two
  // modes are one product, so they fly under one sun at one time of day. Its low 0.28 elevation
  // is most of the house look — it is what gives every slope a long modelling gradient instead
  // of the flat overhead wash a high sun produces.
  sunDirectionWorld: normalized([0.50, 0.28, -0.82]),

  toneMappingExposure: 1.06,

  // THE F-22'S AIR. Colour is app.js fogLow (0x6f8790) and density is its clear-air setting;
  // the banding is korea_terrain's Korea-branch default (6 planes at 0.65 blend), which is the
  // discrete aerial-perspective look the F-22 world recedes through. Haze and view radius remain
  // one knob (density = 1.87 / radius, adaptive-world-radius doctrine): 5.5e-5 implies a ~34 km
  // readable world, comfortably past this 16 km theatre's rim.
  fog: Object.freeze({
    color: 0x6f8790,
    density: 0.000055,
    hazeBands: 6,
    hazeBandBlend: 0.65,
  }),

  // THE F-22'S SKY, in linear working space, lifted from createDecisionSupportSky's cool
  // (Korea / uSoftWorld = 0) branch in render/scene/scene_builders.js at zero altitude — the same
  // zenith, the same horizon, the same 0.42 sky curve and 70x horizon shoulder, so the dome over
  // the canyon is the dome over Korea. Authored well below 0.4 linear on purpose: ACES compresses
  // everything above that into the top sRGB decile, which is what turns a blue sky pale grey.
  //
  // The one divergence is `cloudShelf`. The F-22 gets its weather from the tactical cloud field,
  // which this scene does not run; an empty dome seen from 30 m AGL reads as a backdrop, so a
  // cheap painted cumulus band sits under ~15 degrees. Same palette, no new system.
  sky: Object.freeze({
    zenithColor: Object.freeze([0.035, 0.16, 0.34]),
    horizonColor: Object.freeze([0.34, 0.47, 0.52]),
    belowHorizonColor: Object.freeze([0.022, 0.075, 0.095]),
    skyCurveExponent: 0.42,
    horizonShoulderFalloff: 70,
    horizonShoulderWeight: 0.38,
    cloudColor: Object.freeze([0.62, 0.68, 0.72]),
    cloudShelf: Object.freeze([0.015, 0.16]),
  }),

  // THE F-22'S LIGHT RIG, verbatim from app.js: hemisphere 0xb5cad0 over 0x102229 at 0.78, and a
  // 0xffe2b4 key at 2.65. These shape the Lambert props (vegetation, bridge, landmarks, ground
  // war); the basin and river carry their own shaders. Matching them is what makes a hut or a
  // tree in this scene sit in the same daylight as a hangar in the F-22 scene.
  lighting: Object.freeze({
    hemisphereSkyColor: 0xb5cad0,
    // DIVERGENCE, and a forced one. The F-22 scene sets scene.environment from
    // createLitEnvironment(), so its props take image-based fill on top of this rig and its
    // 0x102229 bounce is a floor, not the whole shadow side. This page has no environment map,
    // so copying that bounce literally rendered every tree and hut as a black silhouette. The
    // bounce is lifted to stand in for the missing IBL; the sky term and key are untouched.
    hemisphereGroundColor: 0x2c3a33,
    hemisphereIntensity: 0.9,
    sunColor: 0xffe2b4,
    sunIntensity: 2.65,
    sunDistanceM: 9_000,
  }),

  terrainPaint: Object.freeze({
    // korea_terrain's shipped uShadowFloor default. The terrain-legibility diagnosis is that a
    // ~0.40 floor puts the whole world inside the top 60% of the value range and reads as a flat
    // wash; 0.12 is the number the F-22 world actually ships, and this scene uses it unchanged.
    shadowFloor: 0.12,
    // Two-softstep tone-ramp gates over squared half-Lambert, verbatim from korea_terrain's
    // non-Ukraine branch. Under the shared 0.28-elevation sun, level ground sits at halfLambert
    // ~0.41 — through the lower gate, short of the upper — so flat basin floor reads mid-dark,
    // sun-facing slopes climb to 1.0 and lee faces fall to the 0.12 floor. That is exactly where
    // Korean terrain sits on the same ramp, which is why the two worlds share a value structure.
    toneRampGates: Object.freeze([
      Object.freeze({ start: 0.26, end: 0.40, weight: 0.42 }),
      Object.freeze({ start: 0.58, end: 0.76, weight: 0.58 }),
    ]),
    // Baked-occlusion multiplier at fully concave (x) and fully convex (y) — korea_terrain's
    // shipped uOcclusionRange, unchanged.
    occlusionRange: Object.freeze([0.55, 1.10]),
    // Height difference (m) against the ~200 m neighbourhood ring that saturates concavity.
    concavityNormalizerM: 22,
    // DELIBERATE DIVERGENCE, and the only one in the light model. korea_terrain applies this
    // bounded planform cue (same expression, same 0.70/1.14 clamp) only on its Ukraine branch,
    // for exactly the reason it is needed here: half this basin sits under a 0.1 gradient, where
    // the Lambert term separates nothing and the bowl washes flat however the ramp is tuned. The
    // Korean heightfield is dissected enough not to need it. Above ~4 it prints as banding.
    reliefGain: 4.6,
    // korea_terrain's shipped uCloudShadowStrength.
    cloudShadowStrength: 0.34,
    // Hue-separated painted light, verbatim from korea_terrain: cool fill from the sky,
    // warm key from the sun.
    skyFill: Object.freeze([0.62, 0.74, 1.0]),
    sunKey: Object.freeze([1.06, 1.01, 0.92]),
    // Gradient-magnitude window that opens the slope palette, measured as korea does it in
    // `1 - normal.y`: 0.035 is a 0.27 gradient, 0.19 is a 0.67 gradient. On this heightfield
    // that opens at roughly the 92nd slope percentile — cut banks, gorge walls and rim faces
    // only, which is what makes laterite read as an exposure rather than a tint.
    slopeFaceWindow: Object.freeze([0.035, 0.19]),
    // Elevation gates (m): lowland fades out over [x,y], upland comes in over [y,z], rim rock
    // over [z,w]. Set from the measured basin, not from Korea's 70-1500 m span.
    elevationBandsM: Object.freeze([185, 330, 545, 790]),
    // Albedo bands in LINEAR working space, sitting in korea_terrain's own value family: its
    // period valley (0.22, 0.27, 0.075), upland (0.075, 0.13, 0.035), drySlope (0.27, 0.17, 0.075)
    // and ridge (0.32, 0.31, 0.26) are the anchors, and rimRock is that ridge verbatim. The HUE is
    // shifted to Vietnam — greener canopy, redder laterite on exposed cuts — but the VALUES are
    // the F-22's, so both worlds tone-map into the same range instead of one reading darker.
    // Korea's valley band is ALREADY an olive cultivation tone, so copying it into both
    // valleyFloor and cultivationGold collapsed the patchwork to one colour and the basin went
    // flat again. The values stay in the F-22 family; the two bands are pulled apart in hue —
    // wild ground toward green, worked ground toward gold — which is the separation the
    // patchwork needs and which Korea gets from its own parcel tint instead.
    bands: Object.freeze({
      valleyFloor: Object.freeze([0.130, 0.210, 0.065]),
      cultivationGold: Object.freeze([0.330, 0.270, 0.075]),
      jungleMid: Object.freeze([0.055, 0.110, 0.035]),
      lateriteSlope: Object.freeze([0.285, 0.150, 0.062]),
      ridgeSage: Object.freeze([0.150, 0.165, 0.075]),
      rimRock: Object.freeze([0.320, 0.310, 0.260]),
    }),
    // Valley cultivation parcels: world-space cell pitch of the patchwork tint.
    parcelPitchM: Object.freeze([155, 115]),
  }),

  // Analytic river paint, linear working space. The gravel bank window is expressed in units of
  // half the authored water width, so 1.0 is the waterline and the ribbon's extra rim is bank.
  water: Object.freeze({
    deepColor: Object.freeze([0.012, 0.040, 0.058]),
    shallowColor: Object.freeze([0.040, 0.098, 0.105]),
    bankColor: Object.freeze([0.150, 0.128, 0.084]),
    shoreWindow: Object.freeze([0.90, 1.04]),
    // Gravel rim draped either side of the water sheet, metres.
    bankWidthM: 7,
  }),
});

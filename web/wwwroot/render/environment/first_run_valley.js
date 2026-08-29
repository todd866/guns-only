// First-flight terrain relief. The kernel publishes every geometry parameter used here; this is a
// mesh of the same analytic surface, not decorative scenery that can disagree with collision.

const FIRST_RUN_MISSION_ID = "mission.modern.visual-merge.first-run-valley.v1";
export const FIRST_RUN_VALLEY_MESH_RECESS_M = 15.75;
export const FIRST_RUN_VALLEY_GEOMETRY_VERSION = 2;

const GRAND_CANYON_CENTERLINE_COMPONENT_COUNT = 3;
const GRAND_CANYON_SIDE_CUTS = Object.freeze([
  Object.freeze({ progress01: 0.18, halfSpan01: 0.034, side: -1, relativeDepth01: 0.82 }),
  Object.freeze({ progress01: 0.39, halfSpan01: 0.046, side: 1, relativeDepth01: 1.00 }),
  Object.freeze({ progress01: 0.64, halfSpan01: 0.040, side: -1, relativeDepth01: 0.91 }),
  Object.freeze({ progress01: 0.82, halfSpan01: 0.032, side: 1, relativeDepth01: 0.76 }),
]);
const GRAND_CANYON_BUTTES = Object.freeze([
  Object.freeze({ progress01: 0.29, halfSpan01: 0.040, side: 1,
    offset01: 0.72, halfWidthM: 500, relativeRise01: 0.28 }),
  Object.freeze({ progress01: 0.55, halfSpan01: 0.050, side: -1,
    offset01: 0.76, halfWidthM: 650, relativeRise01: 0.34 }),
  Object.freeze({ progress01: 0.74, halfSpan01: 0.038, side: 1,
    offset01: 0.70, halfWidthM: 480, relativeRise01: 0.24 }),
]);
const GRAND_CANYON_STRATA_RGB = Object.freeze([
  Object.freeze([0.24, 0.055, 0.022]), // shadowed Supai red
  Object.freeze([0.46, 0.115, 0.034]), // burnt sienna
  Object.freeze([0.64, 0.215, 0.058]), // orange sandstone
  Object.freeze([0.33, 0.070, 0.026]), // dark shale break
  Object.freeze([0.70, 0.350, 0.125]), // sunlit Coconino ledge
  Object.freeze([0.50, 0.145, 0.042]), // redwall face
  Object.freeze([0.76, 0.455, 0.195]), // pale rim cap
  Object.freeze([0.29, 0.060, 0.024]), // deep maroon seam
]);
const GRAND_CANYON_BACKDROP_NEAR_EXTENSION_M = 900;
const GRAND_CANYON_BACKDROP_MID_EXTENSION_M = 2_100;
const GRAND_CANYON_BACKDROP_OUTER_EXTENSION_M = 3_200;
const GRAND_CANYON_EXIT_APRON_NORTH_EXTENSION_M = 4_200;
const GRAND_CANYON_EXIT_APRON_NORTH_SEGMENTS = 160;
const GRAND_CANYON_EXIT_APRON_LATERAL_SEGMENTS = 32;
const GRAND_CANYON_EXIT_DRAINAGE_SEGMENTS = 192;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function smoothStep(edge0, edge1, value) {
  if (!(edge1 > edge0)) return value >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function firstRunValleyProfileFromState(state = {}) {
  if (state?.first_run_valley_available !== true
      || (state?.mission_definition_id != null
        && String(state.mission_definition_id) !== FIRST_RUN_MISSION_ID)) return null;
  const geometryVersion = finite(state.first_run_valley_geometry_version) ?? 1;
  const profile = {
    geometryVersion,
    centerEastM: finite(state.first_run_valley_center_east_m),
    entryNorthM: finite(state.first_run_valley_entry_north_m),
    popOutNorthM: finite(state.first_run_valley_popout_north_m),
    routeAltitudeM: finite(state.first_run_valley_route_alt_m),
    floorHeightM: finite(state.first_run_valley_floor_height_m),
    floorBlendDropM: finite(state.first_run_valley_floor_blend_drop_m),
    floorHalfWidthM: finite(state.first_run_valley_floor_half_width_m),
    crestOffsetM: finite(state.first_run_valley_crest_offset_m),
    outerOffsetM: finite(state.first_run_valley_outer_offset_m),
    westRidgeRiseM: finite(state.first_run_valley_west_ridge_rise_m),
    eastRidgeRiseM: finite(state.first_run_valley_east_ridge_rise_m),
    curveAmplitudeM: finite(state.first_run_valley_curve_amplitude_m),
    curveWavelengthM: finite(state.first_run_valley_curve_wavelength_m),
    centerlineComponentCount: finite(state.first_run_valley_centerline_component_count)
      ?? (geometryVersion === 1 ? 0 : null),
    sideCutCount: finite(state.first_run_valley_side_cut_count)
      ?? (geometryVersion === 1 ? 0 : null),
    butteCount: finite(state.first_run_valley_butte_count)
      ?? (geometryVersion === 1 ? 0 : null),
    sideCutDepth01: finite(state.first_run_valley_side_cut_depth_01)
      ?? (geometryVersion === 1 ? 0 : null),
    strataStepHeightM: finite(state.first_run_valley_strata_step_height_m)
      ?? (geometryVersion === 1 ? 0 : null),
    strataBenchFraction: finite(state.first_run_valley_strata_bench_fraction)
      ?? (geometryVersion === 1 ? 0 : null),
    southExtentNorthM: finite(state.first_run_valley_south_extent_north_m),
    southFullNorthM: finite(state.first_run_valley_south_full_north_m),
    popOutFadeStartNorthM: finite(state.first_run_valley_popout_fade_start_north_m),
    northExtentNorthM: finite(state.first_run_valley_north_extent_north_m),
  };
  if (Object.values(profile).some((value) => value === null)
      || !(profile.popOutNorthM > profile.entryNorthM)
      || !(profile.floorHalfWidthM > 100)
      || !(profile.crestOffsetM > profile.floorHalfWidthM)
      || !(profile.outerOffsetM > profile.crestOffsetM)
      || !(profile.curveWavelengthM > 100)
      || !([1, FIRST_RUN_VALLEY_GEOMETRY_VERSION].includes(profile.geometryVersion))
      || (profile.geometryVersion === FIRST_RUN_VALLEY_GEOMETRY_VERSION
        && (!(profile.centerlineComponentCount === GRAND_CANYON_CENTERLINE_COMPONENT_COUNT)
          || !(profile.sideCutCount === GRAND_CANYON_SIDE_CUTS.length)
          || !(profile.butteCount === GRAND_CANYON_BUTTES.length)
          || !(profile.sideCutDepth01 > 0 && profile.sideCutDepth01 < 1)
          || !(profile.strataStepHeightM > 20)
          || !(profile.strataBenchFraction > 0 && profile.strataBenchFraction < 0.8)
          || Math.abs(profile.curveWavelengthM
            - (profile.popOutNorthM - profile.entryNorthM)) > 1))
      || !(profile.southExtentNorthM < profile.southFullNorthM)
      || !(profile.southFullNorthM < profile.popOutFadeStartNorthM)
      || !(profile.popOutFadeStartNorthM < profile.northExtentNorthM)) return null;
  return Object.freeze(profile);
}

export function firstRunValleyCenterEastM(profile, northM) {
  if (!profile || !Number.isFinite(northM)) return null;
  const alongM = northM - profile.entryNorthM;
  const progress = Math.max(0, Math.min(1, alongM / profile.curveWavelengthM));
  if (profile.geometryVersion === FIRST_RUN_VALLEY_GEOMETRY_VERSION) {
    const entryMouthEnvelope = Math.sin(Math.PI * progress) ** 2;
    const offset01 = entryMouthEnvelope * (
      0.70 * Math.sin(3 * Math.PI * progress)
      + 0.16 * Math.sin(Math.PI * progress + 0.50)
      + 0.06 * Math.sin(5 * Math.PI * progress - 0.80)
    );
    return profile.centerEastM + profile.curveAmplitudeM * offset01;
  }
  const easedProgress = smoothStep(0, 1, progress);
  return profile.centerEastM + profile.curveAmplitudeM
    * Math.sin(easedProgress * Math.PI * 2);
}

export function firstRunValleyStratifiedWallRiseM(profile, smoothRiseM) {
  if (!profile || !Number.isFinite(smoothRiseM) || !(smoothRiseM > 0)) return 0;
  if (profile.geometryVersion !== FIRST_RUN_VALLEY_GEOMETRY_VERSION) return smoothRiseM;
  const band = Math.floor(smoothRiseM / profile.strataStepHeightM);
  const bandBaseM = band * profile.strataStepHeightM;
  const phase01 = (smoothRiseM - bandBaseM) / profile.strataStepHeightM;
  const steppedPhase01 = smoothStep(profile.strataBenchFraction, 1, phase01);
  return bandBaseM + profile.strataStepHeightM * steppedPhase01;
}

export function firstRunValleySideCutOpening01(profile, signedOffsetM, northM) {
  if (!profile || profile.geometryVersion !== FIRST_RUN_VALLEY_GEOMETRY_VERSION
      || !Number.isFinite(signedOffsetM) || !Number.isFinite(northM)) return 0;
  const progress01 = (northM - profile.entryNorthM) / profile.curveWavelengthM;
  if (!(progress01 > 0 && progress01 < 1)) return 0;
  const side = signedOffsetM < 0 ? -1 : 1;
  const offsetM = Math.abs(signedOffsetM);
  const wall01 = smoothStep(profile.floorHalfWidthM * 0.88, profile.crestOffsetM, offsetM)
    * (1 - smoothStep(profile.crestOffsetM * 1.08, profile.outerOffsetM, offsetM));
  if (!(wall01 > 0)) return 0;
  let opening01 = 0;
  for (const cut of GRAND_CANYON_SIDE_CUTS) {
    if (cut.side !== side) continue;
    const distance01 = Math.abs(progress01 - cut.progress01);
    const along01 = 1 - smoothStep(0, cut.halfSpan01, distance01);
    opening01 = Math.max(opening01,
      profile.sideCutDepth01 * cut.relativeDepth01 * along01 * wall01);
  }
  return Math.max(0, Math.min(0.92, opening01));
}

export function firstRunValleyButteRiseM(profile, signedOffsetM, northM) {
  if (!profile || profile.geometryVersion !== FIRST_RUN_VALLEY_GEOMETRY_VERSION
      || !Number.isFinite(signedOffsetM) || !Number.isFinite(northM)) return 0;
  const progress01 = (northM - profile.entryNorthM) / profile.curveWavelengthM;
  if (!(progress01 > 0 && progress01 < 1)) return 0;
  const side = signedOffsetM < 0 ? -1 : 1;
  const offsetM = Math.abs(signedOffsetM);
  let riseM = 0;
  for (const butte of GRAND_CANYON_BUTTES) {
    if (butte.side !== side) continue;
    const along01 = 1 - smoothStep(
      0, butte.halfSpan01, Math.abs(progress01 - butte.progress01),
    );
    const across01 = 1 - smoothStep(
      0, butte.halfWidthM, Math.abs(offsetM - profile.outerOffsetM * butte.offset01),
    );
    const sideRiseM = side < 0 ? profile.westRidgeRiseM : profile.eastRidgeRiseM;
    riseM = Math.max(riseM,
      sideRiseM * butte.relativeRise01 * along01 * across01);
  }
  return Math.max(0, riseM);
}

/**
 * Presentation-only sampling concentrates vertices on the stepped inner walls. The analytic
 * height function remains the sole collision authority; this only decides where its visual mesh
 * is sampled so a 36 m rock layer is not skipped by a 65 m uniform grid cell.
 */
export function firstRunValleyLateralOffsetM(profile, across01) {
  if (!profile || !Number.isFinite(across01)) return null;
  const signed01 = clamp01(across01) * 2 - 1;
  const side = Math.sign(signed01);
  const radial01 = Math.abs(signed01);
  let offsetM;
  if (radial01 <= 0.10) {
    offsetM = profile.floorHalfWidthM * radial01 / 0.10;
  } else if (radial01 <= 0.62) {
    offsetM = profile.floorHalfWidthM
      + (profile.crestOffsetM - profile.floorHalfWidthM)
        * (radial01 - 0.10) / 0.52;
  } else {
    offsetM = profile.crestOffsetM
      + (profile.outerOffsetM - profile.crestOffsetM)
        * (radial01 - 0.62) / 0.38;
  }
  return side * offsetM;
}

/** Strong deterministic strata colour; it changes no geometry and invents no terrain truth. */
export function firstRunValleyRockColorRgb(profile, signedOffsetM, northM, heightM) {
  if (!profile || !Number.isFinite(signedOffsetM)
      || !Number.isFinite(northM) || !Number.isFinite(heightM)) return null;
  const riseM = Math.max(0, heightM - profile.floorHeightM);
  if (riseM < 18) {
    const floorVariation = 0.96
      + 0.04 * Math.sin((northM - profile.entryNorthM) / 410);
    return Object.freeze([
      0.36 * floorVariation,
      0.165 * floorVariation,
      0.070 * floorVariation,
    ]);
  }

  const band = Math.floor(riseM / profile.strataStepHeightM);
  const phase01 = (riseM / profile.strataStepHeightM) - band;
  const base = GRAND_CANYON_STRATA_RGB[
    ((band % GRAND_CANYON_STRATA_RGB.length) + GRAND_CANYON_STRATA_RGB.length)
      % GRAND_CANYON_STRATA_RGB.length
  ];
  // Bright, narrow bench lips and darker face toes keep the layering legible at jet speed. The
  // transition is deliberately horizontal because it is derived only from authoritative height.
  const benchLight = phase01 < 0.10 ? 1.22 : phase01 > 0.76 ? 0.88 : 1;
  const sunSide = signedOffsetM > 0 ? 1.055 : 0.94;
  const alongVariation = 0.97
    + 0.03 * Math.sin((northM - profile.entryNorthM) / 690 + band * 0.31);
  const opening01 = firstRunValleySideCutOpening01(profile, signedOffsetM, northM);
  const tributaryShadow = 1 - 0.38 * opening01;
  const butteRiseM = firstRunValleyButteRiseM(profile, signedOffsetM, northM);
  const butteCap = butteRiseM > profile.strataStepHeightM ? 1.08 : 1;
  const intensity = benchLight * sunSide * alongVariation * tributaryShadow * butteCap;
  return Object.freeze([
    clamp01(base[0] * intensity),
    clamp01(base[1] * intensity),
    clamp01(base[2] * intensity),
  ]);
}

/** Analytic ridge height before max-compositing over the shipped terrain atlas. */
export function firstRunValleyAuthoredHeightM(profile, eastM, northM) {
  if (!profile || !Number.isFinite(eastM) || !Number.isFinite(northM)
      || northM <= profile.southExtentNorthM || northM >= profile.northExtentNorthM) return null;
  const centerEastM = firstRunValleyCenterEastM(profile, northM);
  const signedOffsetM = eastM - centerEastM;
  const offsetM = Math.abs(signedOffsetM);
  if (offsetM >= profile.outerOffsetM) return null;
  const southEnvelope = smoothStep(
    profile.southExtentNorthM, profile.southFullNorthM, northM,
  );
  const northEnvelope = 1 - smoothStep(
    profile.popOutFadeStartNorthM, profile.northExtentNorthM, northM,
  );
  const longitudinalEnvelope = southEnvelope * northEnvelope;
  if (!(longitudinalEnvelope > 0)) return null;
  const corridorFloorBlend = 1
    - smoothStep(profile.floorHalfWidthM, profile.outerOffsetM, offsetM);
  const authoredFloorM = profile.floorHeightM
    - profile.floorBlendDropM * (1 - longitudinalEnvelope * corridorFloorBlend);
  const innerRise = smoothStep(profile.floorHalfWidthM, profile.crestOffsetM, offsetM);
  const outerFall = 1 - smoothStep(profile.crestOffsetM, profile.outerOffsetM, offsetM);
  const sideRiseM = signedOffsetM < 0 ? profile.westRidgeRiseM : profile.eastRidgeRiseM;
  const sidePhase = signedOffsetM < 0 ? 0.35 : 2.15;
  const grandCanyon = profile.geometryVersion === FIRST_RUN_VALLEY_GEOMETRY_VERSION;
  const ridgeVariation = grandCanyon
    ? 1
      + 0.105 * Math.sin((northM - profile.entryNorthM) / 1180 + sidePhase)
      + 0.045 * Math.sin((northM - profile.entryNorthM) / 470 - sidePhase * 0.6)
    : 1
      + 0.105 * Math.sin((northM - profile.entryNorthM) / 355 + sidePhase)
      + 0.045 * Math.sin((northM - profile.entryNorthM) / 137 - sidePhase * 0.6);
  const faceRuggedness = grandCanyon
    ? 1
      + 0.065 * Math.sin(offsetM / 310
        + (northM - profile.entryNorthM) / 540 + sidePhase * 1.8)
      + 0.030 * Math.sin(offsetM / 145
        - (northM - profile.entryNorthM) / 260 - sidePhase)
    : 1
      + 0.075 * Math.sin(offsetM / 118
        + (northM - profile.entryNorthM) / 205 + sidePhase * 1.8)
      + 0.035 * Math.sin(offsetM / 61
        - (northM - profile.entryNorthM) / 119 - sidePhase);
  const wallRiseM = sideRiseM * innerRise * outerFall * longitudinalEnvelope
    * ridgeVariation * faceRuggedness
    + firstRunValleyButteRiseM(profile, signedOffsetM, northM) * longitudinalEnvelope;
  const stratifiedRiseM = firstRunValleyStratifiedWallRiseM(
    profile, Math.max(0, wallRiseM),
  );
  const sideCutOpening01 = firstRunValleySideCutOpening01(profile, signedOffsetM, northM);
  return authoredFloorM + stratifiedRiseM * (1 - sideCutOpening01);
}

function profileKey(profile) {
  return Object.values(profile).map((value) => Number(value).toFixed(3)).join("|");
}

function appendValleyFloorRibbon({
  positions,
  colors,
  terrainWater,
  landcover,
  concavity,
  indices,
}, profile, {
  startNorthM,
  endNorthM,
  segments,
  halfWidthM,
  centerOffsetM,
  meanderM,
  meanderPeriodM,
  meanderPhase,
  surfaceLiftM,
  water,
  fallbackColor,
  cover,
  enclosure,
}) {
  const firstVertex = positions.length / 3;
  const centerEastAt = (northM) => firstRunValleyCenterEastM(profile, northM)
    + centerOffsetM
    + meanderM * Math.sin(
      (northM - profile.entryNorthM) * Math.PI * 2 / meanderPeriodM + meanderPhase,
    );

  for (let alongIndex = 0; alongIndex <= segments; alongIndex += 1) {
    const along = alongIndex / segments;
    const northM = startNorthM + (endNorthM - startNorthM) * along;
    const centerEastM = centerEastAt(northM);
    const tangentSampleM = 4;
    const tangentEastM = centerEastAt(northM + tangentSampleM)
      - centerEastAt(northM - tangentSampleM);
    const tangentNorthM = tangentSampleM * 2;
    const tangentLengthM = Math.hypot(tangentEastM, tangentNorthM);
    const normalEast = tangentNorthM / tangentLengthM;
    const normalNorth = -tangentEastM / tangentLengthM;
    const widthM = halfWidthM * (0.88 + 0.12 * Math.sin(along * Math.PI * 6 + meanderPhase));
    for (const side of [-1, 1]) {
      const eastM = centerEastM + normalEast * widthM * side;
      const edgeNorthM = northM + normalNorth * widthM * side;
      const authoredHeightM = firstRunValleyAuthoredHeightM(profile, eastM, edgeNorthM);
      positions.push(
        eastM,
        (authoredHeightM ?? profile.floorHeightM) + surfaceLiftM,
        -edgeNorthM,
      );
      colors.push(...fallbackColor);
      terrainWater.push(water ? 1 : 0);
      landcover.push(...cover);
      concavity.push(enclosure);
    }
  }

  for (let alongIndex = 0; alongIndex < segments; alongIndex += 1) {
    const a = firstVertex + alongIndex * 2;
    const b = a + 1;
    const c = a + 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  return segments * 2;
}

/**
 * Presentation-only rock mantle behind the analytic ridge mesh. The streamed terrain atlas is
 * deliberately left in place for collision and distant context, but a banked cockpit could see
 * its green edge where the narrow analytic strip ended. This broad, warm surface starts beyond
 * the crest (well outside the flyable floor), overlaps the falling outer wall, and reaches far
 * enough behind it that the atlas hand-off stays below the horizon. It shares the ridge mesh and
 * therefore adds no draw call or collision authority.
 */
function appendGrandCanyonBackdropMantle({
  positions,
  colors,
  terrainWater,
  landcover,
  concavity,
  indices,
}, profile, northSegments, meshRecessM) {
  const backdropNorthSegments = Math.max(192, Math.round(northSegments / 2));
  const overlapSpanM = profile.outerOffsetM - profile.crestOffsetM;
  const radialBandsM = Object.freeze([
    profile.crestOffsetM + Math.min(90, overlapSpanM * 0.04),
    profile.crestOffsetM + overlapSpanM * 0.42,
    profile.outerOffsetM * 0.98,
    profile.outerOffsetM + GRAND_CANYON_BACKDROP_NEAR_EXTENSION_M,
    profile.outerOffsetM + GRAND_CANYON_BACKDROP_MID_EXTENSION_M,
    profile.outerOffsetM + GRAND_CANYON_BACKDROP_OUTER_EXTENSION_M,
  ]);
  const firstVertex = positions.length / 3;
  const firstIndex = indices.length;
  // Low skirts beyond the published longitudinal extent keep the mantle's terminal edge out of
  // the cockpit view. Height still fades on the original authority envelope, preserving the open
  // entry and pop-out instead of erecting a scenic end wall.
  const terminalSkirtM = 1_400;
  const startNorthM = profile.southExtentNorthM - terminalSkirtM;
  const endNorthM = profile.northExtentNorthM + terminalSkirtM;
  const northSpanM = endNorthM - startNorthM;

  for (const side of [-1, 1]) {
    const sideFirstVertex = positions.length / 3;
    const orderedBandsM = side < 0
      ? [...radialBandsM].reverse()
      : radialBandsM;
    for (let northIndex = 0; northIndex <= backdropNorthSegments; northIndex += 1) {
      const along01 = northIndex / backdropNorthSegments;
      const northM = startNorthM + northSpanM * along01;
      const centerEastM = firstRunValleyCenterEastM(profile, northM);
      const southEnvelope01 = smoothStep(
        profile.southExtentNorthM, profile.southFullNorthM, northM,
      );
      const northEnvelope01 = 1 - smoothStep(
        profile.popOutFadeStartNorthM, profile.northExtentNorthM, northM,
      );
      const routeEnvelope01 = southEnvelope01 * northEnvelope01;
      const sideRiseM = side < 0 ? profile.westRidgeRiseM : profile.eastRidgeRiseM;
      const alongVariation = 0.94
        + 0.07 * Math.sin((northM - profile.entryNorthM) / 1_160 + side * 0.9)
        + 0.035 * Math.sin((northM - profile.entryNorthM) / 430 - side * 1.7);
      const baseHeightM = profile.floorHeightM - profile.floorBlendDropM - meshRecessM;
      const backdropRiseM = sideRiseM * routeEnvelope01 * 0.66 * alongVariation;

      for (const radialM of orderedBandsM) {
        const bandIndex = radialBandsM.indexOf(radialM);
        const signedOffsetM = radialM * side;
        const eastM = centerEastM + signedOffsetM;
        const authoredHeightM = firstRunValleyAuthoredHeightM(profile, eastM, northM);
        const authoredVisualM = (authoredHeightM ?? baseHeightM) - meshRecessM - 2;
        let heightM;
        if (bandIndex === 0) {
          // Begin just behind the crest and remain below the analytic surface at the overlap seam.
          heightM = authoredVisualM;
        } else if (bandIndex === 1) {
          heightM = authoredVisualM * 0.45 + (baseHeightM + backdropRiseM) * 0.55;
        } else {
          const radialUndulationM = sideRiseM * routeEnvelope01
            * (0.025 * Math.sin(bandIndex * 1.7 + along01 * Math.PI * 5 + side));
          const distanceScale = [0, 0, 1, 0.95, 1.02, 0.92][bandIndex];
          heightM = baseHeightM + backdropRiseM * distanceScale + radialUndulationM;
        }
        positions.push(eastM, heightM, -northM);
        const rockColor = firstRunValleyRockColorRgb(
          profile,
          signedOffsetM,
          northM,
          Math.max(profile.floorHeightM, heightM + meshRecessM),
        );
        const distanceTone = 1 - bandIndex * 0.028;
        colors.push(
          clamp01(rockColor[0] * distanceTone),
          clamp01(rockColor[1] * distanceTone),
          clamp01(rockColor[2] * distanceTone),
        );
        terrainWater.push(0);
        landcover.push(0.060, 0.080);
        concavity.push(0.66 + bandIndex * 0.018);
      }
    }

    const stride = radialBandsM.length;
    for (let northIndex = 0; northIndex < backdropNorthSegments; northIndex += 1) {
      for (let bandIndex = 0; bandIndex < stride - 1; bandIndex += 1) {
        const a = sideFirstVertex + northIndex * stride + bandIndex;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }

  return Object.freeze({
    firstVertex,
    vertexCount: positions.length / 3 - firstVertex,
    firstIndex,
    indexCount: indices.length - firstIndex,
    triangleCount: (indices.length - firstIndex) / 3,
    innerOffsetM: radialBandsM[0],
    outerOffsetM: radialBandsM.at(-1),
    startNorthM,
    endNorthM,
    northSegments: backdropNorthSegments,
    bandCount: radialBandsM.length,
  });
}

/**
 * Presentation-only continuation through the open pop-out.
 *
 * The collision overlay deliberately fades before weapons release and then hands authority back
 * to the real atlas. Its browser mesh used to fade to the low analytic fallback at the same rate,
 * exposing a pale-green atlas slope straight through the mouth whenever the aircraft banked. A
 * broad warm apron now overlaps that fade and continues beyond the authored north extent. It is
 * kept in the same BufferGeometry/draw, starts well after the enclosed route has established its
 * real walls, and never joins the authority index range. Low faceted shoulders retain an open
 * horizon instead of replacing the atlas seam with a scenic end wall.
 */
function appendGrandCanyonExitApron({
  positions,
  colors,
  terrainWater,
  landcover,
  concavity,
  indices,
}, profile, meshRecessM) {
  const firstVertex = positions.length / 3;
  const firstIndex = indices.length;
  const outerHalfWidthM = profile.outerOffsetM
    + GRAND_CANYON_BACKDROP_OUTER_EXTENSION_M;
  // Concentrate cross-valley samples around the drainage and stepped shoulders. Eleven broad
  // bands made the first seam fix read as one tan sheet even though it technically covered the
  // atlas. This power curve retains the full ±5.6 km sightline with 250–600 m cells where the
  // banked cockpit can actually resolve benches and channels.
  const lateralOffsetsM = Object.freeze(Array.from({
    length: GRAND_CANYON_EXIT_APRON_LATERAL_SEGMENTS + 1,
  }, (_, index) => {
    const signed01 = index / GRAND_CANYON_EXIT_APRON_LATERAL_SEGMENTS * 2 - 1;
    return Math.sign(signed01) * outerHalfWidthM * Math.abs(signed01) ** 1.32;
  }));
  // Begin exactly where authority starts to fade. The earlier 900 m overlap put this enormous
  // scenic sheet only 500 m ahead of the deep-canyon hardware pose, so its first triangles read
  // as a hard-edged dark slab across the foreground.
  const startNorthM = profile.popOutFadeStartNorthM;
  const fullCoverNorthM = profile.popOutFadeStartNorthM + 600;
  const endNorthM = profile.northExtentNorthM
    + GRAND_CANYON_EXIT_APRON_NORTH_EXTENSION_M;
  const fadeNorthM = endNorthM - 2_000;
  const northSpanM = endNorthM - startNorthM;
  // The real route survey guarantees at least 100 m centreline clearance at the pop-out. A low
  // 215 m basin overlaps that surveyed handoff while the outboard shoulders cover the adjacent
  // atlas relief. The shoulders are capped separately below so they cannot become a new end wall.
  const atlasCoverHeightM = Math.min(
    profile.routeAltitudeM - 95,
    profile.floorHeightM + profile.floorBlendDropM * 0.58,
  );

  const drainageOffsetM = (northM) => 92 * Math.sin(
    (northM - profile.entryNorthM) / 780 + 0.65,
  ) + 38 * Math.sin(
    (northM - profile.entryNorthM) / 315 - 0.9,
  );
  const surfaceAt = (signedOffsetM, northM) => {
    const offsetM = Math.abs(signedOffsetM);
    const sideRiseM = signedOffsetM < 0
      ? profile.westRidgeRiseM
      : profile.eastRidgeRiseM;
    const shoulder01 = smoothStep(
      profile.floorHalfWidthM,
      profile.crestOffsetM,
      offsetM,
    );
    const outerSettle01 = 1 - 0.24 * smoothStep(
      profile.outerOffsetM,
      outerHalfWidthM,
      offsetM,
    );
    const smoothShoulderM = sideRiseM * 0.18 * shoulder01 * outerSettle01;
    const terracedShoulderM = firstRunValleyStratifiedWallRiseM(
      profile,
      smoothShoulderM,
    );
    const channel01 = 1 - smoothStep(
      58,
      330,
      Math.abs(signedOffsetM - drainageOffsetM(northM)),
    );
    const facetM = 14 * Math.sin(
      (northM - profile.entryNorthM) / 510 + signedOffsetM / 1_060,
    ) + 7 * Math.sin(
      (northM - profile.entryNorthM) / 225 - signedOffsetM / 470,
    ) + 4 * Math.sin(
      (northM - profile.entryNorthM) / 118 + signedOffsetM / 260,
    );
    const eastM = firstRunValleyCenterEastM(profile, northM) + signedOffsetM;
    const authoredHeightM = firstRunValleyAuthoredHeightM(profile, eastM, northM);
    const entryHeightM = (authoredHeightM ?? (
      profile.floorHeightM - profile.floorBlendDropM + terracedShoulderM * 0.55
    )) - meshRecessM;
    const coverHeightM = Math.min(
      profile.routeAltitudeM + 70,
      atlasCoverHeightM + terracedShoulderM + facetM - channel01 * 22,
    );
    const farHeightM = profile.floorHeightM - profile.floorBlendDropM
      - meshRecessM - 2 + terracedShoulderM * 0.18;
    const entryEnvelope01 = smoothStep(startNorthM, fullCoverNorthM, northM);
    const terminalEnvelope01 = 1 - smoothStep(fadeNorthM, endNorthM, northM);
    const enteredHeightM = entryHeightM
      + (coverHeightM - entryHeightM) * entryEnvelope01;
    return Object.freeze({
      heightM: farHeightM + (enteredHeightM - farHeightM) * terminalEnvelope01,
      channel01,
      shoulder01,
      offsetM,
    });
  };

  for (let northIndex = 0;
    northIndex <= GRAND_CANYON_EXIT_APRON_NORTH_SEGMENTS; northIndex += 1) {
    const along01 = northIndex / GRAND_CANYON_EXIT_APRON_NORTH_SEGMENTS;
    const northM = startNorthM + northSpanM * along01;
    const centerEastM = firstRunValleyCenterEastM(profile, northM);

    for (const signedOffsetM of lateralOffsetsM) {
      const eastM = centerEastM + signedOffsetM;
      const surface = surfaceAt(signedOffsetM, northM);
      const { heightM, channel01, shoulder01, offsetM } = surface;
      positions.push(eastM, heightM, -northM);
      const rockColor = firstRunValleyRockColorRgb(
        profile,
        signedOffsetM,
        northM,
        Math.max(profile.floorHeightM, heightM),
      );
      const distanceTone = 0.97 - 0.04 * Math.min(1, offsetM / outerHalfWidthM);
      const erosionTone = (1 - channel01 * 0.16) * (
        0.97 + 0.035 * Math.sin((northM - profile.entryNorthM) / 190)
      );
      colors.push(
        clamp01(rockColor[0] * distanceTone * erosionTone),
        clamp01(rockColor[1] * distanceTone * erosionTone),
        clamp01(rockColor[2] * distanceTone * erosionTone),
      );
      terrainWater.push(0);
      landcover.push(0.11, 0.08);
      concavity.push(0.55 + shoulder01 * 0.06);
    }
  }

  const stride = lateralOffsetsM.length;
  for (let northIndex = 0;
    northIndex < GRAND_CANYON_EXIT_APRON_NORTH_SEGMENTS; northIndex += 1) {
    for (let lateralIndex = 0; lateralIndex < stride - 1; lateralIndex += 1) {
      const a = firstVertex + northIndex * stride + lateralIndex;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Continue the Colorado-scale drainage across the open mouth. It follows the same height
  // sampler as the apron, so it cannot float above a shelf or disappear underneath one. A narrow
  // dark ribbon supplies scale and breaks the old uninterrupted tan polygon without another mesh.
  const drainageFirstVertex = positions.length / 3;
  const drainageFirstIndex = indices.length;
  const drainageStartNorthM = profile.popOutFadeStartNorthM - 160;
  const drainageEndNorthM = fadeNorthM;
  const drainageSpanM = drainageEndNorthM - drainageStartNorthM;
  const centerEastAt = (northM) => firstRunValleyCenterEastM(profile, northM)
    + drainageOffsetM(northM);
  for (let alongIndex = 0;
    alongIndex <= GRAND_CANYON_EXIT_DRAINAGE_SEGMENTS; alongIndex += 1) {
    const along01 = alongIndex / GRAND_CANYON_EXIT_DRAINAGE_SEGMENTS;
    const northM = drainageStartNorthM + drainageSpanM * along01;
    const centerEastM = centerEastAt(northM);
    const tangentSampleM = 5;
    const tangentEastM = centerEastAt(northM + tangentSampleM)
      - centerEastAt(northM - tangentSampleM);
    const tangentLengthM = Math.hypot(tangentEastM, tangentSampleM * 2);
    const normalEast = tangentSampleM * 2 / tangentLengthM;
    const normalNorth = -tangentEastM / tangentLengthM;
    const halfWidthM = 47 + 9 * Math.sin(along01 * Math.PI * 7 + 0.4);
    for (const side of [-1, 1]) {
      const eastM = centerEastM + normalEast * halfWidthM * side;
      const edgeNorthM = northM + normalNorth * halfWidthM * side;
      const signedOffsetM = eastM - firstRunValleyCenterEastM(profile, edgeNorthM);
      const heightM = surfaceAt(signedOffsetM, edgeNorthM).heightM + 0.9;
      positions.push(eastM, heightM, -edgeNorthM);
      colors.push(0.085, 0.25, 0.24);
      terrainWater.push(1);
      landcover.push(0.08, 0.32);
      concavity.push(0.48);
    }
  }
  for (let alongIndex = 0;
    alongIndex < GRAND_CANYON_EXIT_DRAINAGE_SEGMENTS; alongIndex += 1) {
    const a = drainageFirstVertex + alongIndex * 2;
    const b = a + 1;
    const c = a + 2;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }

  return Object.freeze({
    firstVertex,
    vertexCount: positions.length / 3 - firstVertex,
    firstIndex,
    indexCount: indices.length - firstIndex,
    triangleCount: (indices.length - firstIndex) / 3,
    startNorthM,
    fullCoverNorthM,
    fadeNorthM,
    endNorthM,
    halfWidthM: outerHalfWidthM,
    atlasCoverHeightM,
    northSegments: GRAND_CANYON_EXIT_APRON_NORTH_SEGMENTS,
    bandCount: lateralOffsetsM.length,
    surfaceVertexCount: drainageFirstVertex - firstVertex,
    surfaceIndexCount: drainageFirstIndex - firstIndex,
    drainageFirstVertex,
    drainageVertexCount: positions.length / 3 - drainageFirstVertex,
    drainageFirstIndex,
    drainageIndexCount: indices.length - drainageFirstIndex,
    drainageTriangleCount: (indices.length - drainageFirstIndex) / 3,
    drainageStartNorthM,
    drainageEndNorthM,
  });
}

function buildRidgeGeometry(
  THREE,
  profile,
  northSegments = 512,
  lateralSegments = 160,
  meshRecessM = FIRST_RUN_VALLEY_MESH_RECESS_M,
) {
  const positions = [];
  const colors = [];
  const terrainWater = [];
  const landcover = [];
  const concavity = [];
  const indices = [];
  const northSpanM = profile.northExtentNorthM - profile.southExtentNorthM;
  const stride = lateralSegments + 1;

  for (let northIndex = 0; northIndex <= northSegments; northIndex += 1) {
    const along = northIndex / northSegments;
    const northM = profile.southExtentNorthM + northSpanM * along;
    const centerEastM = firstRunValleyCenterEastM(profile, northM);
    for (let lateralIndex = 0; lateralIndex <= lateralSegments; lateralIndex += 1) {
      const across = lateralIndex / lateralSegments;
      const signedOffsetM = firstRunValleyLateralOffsetM(profile, across);
      const eastM = centerEastM + signedOffsetM;
      const authoredM = firstRunValleyAuthoredHeightM(profile, eastM, northM);
      // Recess the triangulated chord below analytic collision. The mountain profile contains
      // short-wavelength rock variation as well as a curved centreline, so the mesh stays dense
      // enough for the chord to follow authority instead of creating an invisible impact wall.
      const heightM = (authoredM ?? (profile.floorHeightM - profile.floorBlendDropM))
        - meshRecessM;
      positions.push(eastM, heightM, -northM);
      // Strong rock identity survives the bright terrain grade: each horizontal authority band
      // has its own red/orange/tan value, tributary cuts fall into shadow, and rim caps catch sun.
      const rockColor = firstRunValleyRockColorRgb(
        profile,
        signedOffsetM,
        northM,
        authoredM ?? profile.floorHeightM,
      );
      colors.push(...rockColor);
      const relief01 = Math.max(0, Math.min(1,
        (heightM - profile.floorHeightM)
          / Math.max(profile.westRidgeRiseM, profile.eastRidgeRiseM),
      ));
      terrainWater.push(0);
      landcover.push(0.20 - relief01 * 0.13, 0.14 - relief01 * 0.09);
      concavity.push(0.52 + relief01 * 0.15);
    }
  }
  for (let northIndex = 0; northIndex < northSegments; northIndex += 1) {
    for (let lateralIndex = 0; lateralIndex < lateralSegments; lateralIndex += 1) {
      const a = northIndex * stride + lateralIndex;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const authorityIndexCount = indices.length;
  // A broad river and a dry rim wash give the 14 km route persistent scale and depth cues. They
  // sit on the analytic floor and use the shared terrain language instead of becoming scenery
  // pasted over a generic green trench.
  let scenicTriangleCount = 0;
  const ribbonGeometry = {
    positions, colors, terrainWater, landcover, concavity, indices,
  };
  scenicTriangleCount += appendValleyFloorRibbon(ribbonGeometry, profile, {
    startNorthM: profile.southFullNorthM + 90,
    endNorthM: profile.popOutFadeStartNorthM - 40,
    segments: 384,
    halfWidthM: 58,
    centerOffsetM: -34,
    meanderM: 108,
    meanderPeriodM: 1_720,
    meanderPhase: 0.35,
    surfaceLiftM: 0.12,
    water: true,
    fallbackColor: [0.085, 0.25, 0.24],
    cover: [0.08, 0.32],
    enclosure: 0.48,
  });
  scenicTriangleCount += appendValleyFloorRibbon(ribbonGeometry, profile, {
    startNorthM: profile.southFullNorthM + 140,
    endNorthM: profile.popOutFadeStartNorthM - 80,
    segments: 320,
    halfWidthM: 22,
    centerOffsetM: 310,
    meanderM: 72,
    meanderPeriodM: 2_150,
    meanderPhase: 1.7,
    surfaceLiftM: 0.78,
    water: false,
    fallbackColor: [0.47, 0.27, 0.14],
    cover: [0.05, 0.01],
    enclosure: 0.54,
  });
  const backdrop = appendGrandCanyonBackdropMantle(
    ribbonGeometry,
    profile,
    northSegments,
    meshRecessM,
  );
  scenicTriangleCount += backdrop.triangleCount;
  const exitApron = appendGrandCanyonExitApron(
    ribbonGeometry,
    profile,
    meshRecessM,
  );
  scenicTriangleCount += exitApron.triangleCount;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("terrainWater", new THREE.Float32BufferAttribute(terrainWater, 1));
  geometry.setAttribute("landcover", new THREE.Float32BufferAttribute(landcover, 2));
  geometry.setAttribute("concavity", new THREE.Float32BufferAttribute(concavity, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData = {
    authorityMatched: true,
    triangleCount: indices.length / 3,
    authorityTriangleCount: authorityIndexCount / 3,
    authorityIndexCount,
    scenicTriangleCount,
    backdropPresentationOnly: true,
    backdropTriangleCount: backdrop.triangleCount,
    backdropVertexStart: backdrop.firstVertex,
    backdropVertexCount: backdrop.vertexCount,
    backdropIndexStart: backdrop.firstIndex,
    backdropIndexCount: backdrop.indexCount,
    backdropInnerOffsetM: backdrop.innerOffsetM,
    backdropOuterOffsetM: backdrop.outerOffsetM,
    backdropStartNorthM: backdrop.startNorthM,
    backdropEndNorthM: backdrop.endNorthM,
    backdropNorthSegments: backdrop.northSegments,
    backdropBandCount: backdrop.bandCount,
    exitApronPresentationOnly: true,
    exitApronTriangleCount: exitApron.triangleCount,
    exitApronVertexStart: exitApron.firstVertex,
    exitApronVertexCount: exitApron.vertexCount,
    exitApronIndexStart: exitApron.firstIndex,
    exitApronIndexCount: exitApron.indexCount,
    exitApronStartNorthM: exitApron.startNorthM,
    exitApronFullCoverNorthM: exitApron.fullCoverNorthM,
    exitApronFadeNorthM: exitApron.fadeNorthM,
    exitApronEndNorthM: exitApron.endNorthM,
    exitApronHalfWidthM: exitApron.halfWidthM,
    exitApronAtlasCoverHeightM: exitApron.atlasCoverHeightM,
    exitApronNorthSegments: exitApron.northSegments,
    exitApronBandCount: exitApron.bandCount,
    exitApronSurfaceVertexStart: exitApron.firstVertex,
    exitApronSurfaceVertexCount: exitApron.surfaceVertexCount,
    exitApronSurfaceIndexStart: exitApron.firstIndex,
    exitApronSurfaceIndexCount: exitApron.surfaceIndexCount,
    exitDrainageVertexStart: exitApron.drainageFirstVertex,
    exitDrainageVertexCount: exitApron.drainageVertexCount,
    exitDrainageIndexStart: exitApron.drainageFirstIndex,
    exitDrainageIndexCount: exitApron.drainageIndexCount,
    exitDrainageTriangleCount: exitApron.drainageTriangleCount,
    exitDrainageStartNorthM: exitApron.drainageStartNorthM,
    exitDrainageEndNorthM: exitApron.drainageEndNorthM,
    northSegments,
    lateralSegments,
    meshRecessM,
  };
  return geometry;
}

export function createFirstRunValleyPresentation(THREE, options = {}) {
  const root = new THREE.Group();
  root.name = "FIRST_RUN_AUTHORITY_VALLEY";
  root.visible = false;
  root.userData = {
    authorityMatched: true,
    active: false,
    triangleCount: 0,
  };
  // The streamed Ukraine material intentionally derives its palette from world-space regional
  // paint and does not consume vertex colour. Reusing it here would turn these authored red-rock
  // strata back into the surrounding green/brown steppe as soon as terrain streaming completed.
  // Keep one dedicated, lit material so the canyon retains its warm rock identity and still
  // receives the same scene lights, fog and shadow map as every other solid surface.
  const canyonMaterial = new THREE.MeshStandardMaterial({
    name: "MAT_FIRST_RUN_GRAND_CANYON_ROCK",
    color: 0xffffff,
    vertexColors: true,
    fog: true,
    side: THREE.FrontSide,
    roughness: 0.88,
    metalness: 0,
    envMapIntensity: 0.24,
    flatShading: true,
    // The shipped atlas remains underneath as distant context. Bias only co-planar fragments so
    // its low-resolution triangles cannot sparkle or cut diagonal cracks through the gorge skin.
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  });
  let mesh = null;
  let currentKey = "";
  let disposed = false;

  function replaceGeometry(profile) {
    mesh?.geometry?.dispose?.();
    if (mesh) root.remove(mesh);
    const geometry = buildRidgeGeometry(
      THREE,
      profile,
      Math.max(256, Math.round(options.northSegments ?? 512)),
      Math.max(144, Math.round(options.lateralSegments ?? 160)),
      Math.max(FIRST_RUN_VALLEY_MESH_RECESS_M, Number(options.meshRecessM)
        || FIRST_RUN_VALLEY_MESH_RECESS_M),
    );
    mesh = new THREE.Mesh(geometry, canyonMaterial);
    mesh.name = "FIRST_RUN_VALLEY_RIDGES";
    // This one draw also contains the presentation-only mantle and exit apron. Casting that
    // kilometre-scale sheet into the local combat cascade produced a hard moving slab across the
    // gorge. Stable side/tributary shade is already authored into vertex colour; still receive
    // aircraft and world shadows, but do not self-cast the entire scenic envelope.
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    mesh.userData = { authorityMatched: true };
    root.add(mesh);
    root.userData.triangleCount = geometry.userData.triangleCount;
  }

  return {
    object3d: root,
    update(state, _terrainMaterial = null, _terrainReady = false) {
      if (disposed) return false;
      const profile = firstRunValleyProfileFromState(state);
      if (!profile) {
        root.visible = false;
        root.userData.active = false;
        return false;
      }
      const nextKey = profileKey(profile);
      if (nextKey !== currentKey) {
        currentKey = nextKey;
        replaceGeometry(profile);
      }
      root.visible = true;
      root.userData.active = true;
      return true;
    },
    diagnostics() {
      return Object.freeze({
        active: root.visible,
        authorityMatched: true,
        triangleCount: root.userData.triangleCount,
        drawCount: mesh ? 1 : 0,
        northSegments: mesh?.geometry?.userData?.northSegments ?? 0,
        lateralSegments: mesh?.geometry?.userData?.lateralSegments ?? 0,
        meshRecessM: mesh?.geometry?.userData?.meshRecessM
          ?? FIRST_RUN_VALLEY_MESH_RECESS_M,
        dedicatedCanyonMaterial: mesh?.material === canyonMaterial,
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      mesh?.geometry?.dispose?.();
      canyonMaterial.dispose();
      mesh = null;
    },
  };
}

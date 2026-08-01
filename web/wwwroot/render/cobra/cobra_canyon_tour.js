/**
 * Deterministic camera choreography for the standalone Cobra Canyon inspection lab.
 *
 * These tracks move a presentation camera around the authored collision primitives. They are not
 * simulation autopilot commands and do not replace aircraft or obstacle authority. Distances are
 * measured along each public route. Positive lateral offset is aircraft-right of the route tangent.
 */

export const COBRA_CANYON_TOUR_BASE_AGL_M = 34;
export const COBRA_CANYON_TOUR_ROTOR_RADIUS_M = 6.706;
export const COBRA_CANYON_TOUR_CLEARANCE_MARGIN_M = 3;
export const COBRA_CANYON_TOUR_TANGENT_WINDOW_M = 45;

const RIVER_ROUTE_ID = "route.cobra-canyon.river-gorge.v1";
const RIDGE_ROUTE_ID = "route.cobra-canyon.ridge-shadow.v1";
const ROAD_ROUTE_ID = "route.cobra-canyon.road-plantation.v1";

function freezeTrack(id, cue, axis, keyframes) {
  const frozenKeyframes = keyframes.map(([distanceM, value]) => Object.freeze({ distanceM, value }));
  return Object.freeze({
    id,
    cue,
    axis,
    startDistanceM: frozenKeyframes[0].distanceM,
    endDistanceM: frozenKeyframes[frozenKeyframes.length - 1].distanceM,
    keyframes: Object.freeze(frozenKeyframes),
  });
}

const MANEUVERS_BY_ROUTE = Object.freeze({
  [RIVER_ROUTE_ID]: Object.freeze([
    freezeTrack(
      "tour.cobra-canyon.iron-bell-underpass.v1",
      "IRON BELL / COMMIT LOW",
      "agl",
      [[6_250, 34], [6_600, 13], [7_150, 13], [7_500, 34]],
    ),
    freezeTrack(
      "tour.cobra-canyon.gorge-wires-left.v1",
      "GORGE WIRES / LEFT OF POLE",
      "lateral",
      [[8_000, 0], [8_300, -20], [9_250, -20], [9_550, 0]],
    ),
  ]),
  [RIDGE_ROUTE_ID]: Object.freeze([
    freezeTrack(
      "tour.cobra-canyon.saddle-wires-low.v1",
      "SADDLE WIRES / STAY LOW",
      "agl",
      [[9_450, 34], [9_650, 31], [10_150, 31], [10_350, 34]],
    ),
    freezeTrack(
      "tour.cobra-canyon.ridge-mast-left.v1",
      "RIDGE MAST / PASS LEFT",
      "lateral",
      [[11_700, 0], [12_000, -25], [12_700, -25], [13_000, 0]],
    ),
  ]),
  [ROAD_ROUTE_ID]: Object.freeze([
    freezeTrack(
      "tour.cobra-canyon.water-tower-broadside.v1",
      "WATER TOWER / RIGHT BROADSIDE",
      "lateral",
      [[6_400, 0], [6_900, 185], [7_250, 185], [7_600, 0]],
    ),
    freezeTrack(
      "tour.cobra-canyon.plantation-wires-over.v1",
      "THREE WIRES / STEP OVER",
      "agl",
      [[7_500, 34], [7_700, 42], [8_100, 42], [8_300, 34]],
    ),
  ]),
});

export const COBRA_CANYON_TOUR_MANEUVERS = MANEUVERS_BY_ROUTE;

function requireFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite.`);
  return number;
}

function sampleTrack(track, distanceM, target) {
  const keyframes = track.keyframes;
  let segment = 1;
  while (segment < keyframes.length - 1 && distanceM > keyframes[segment].distanceM) {
    segment += 1;
  }
  const from = keyframes[segment - 1];
  const to = keyframes[segment];
  const spanM = to.distanceM - from.distanceM;
  const blend = spanM > 0 ? (distanceM - from.distanceM) / spanM : 0;
  target.value = from.value + (to.value - from.value) * blend;
  target.slopePerM = spanM > 0 ? (to.value - from.value) / spanM : 0;
}

const trackSample = { value: 0, slopePerM: 0 };

function requireRoutePoint(point, label) {
  if (!Array.isArray(point) || point.length !== 3 || point.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`${label} must be a finite east/up/north triple.`);
  }
}

/** Builds an allocation-free sampler with a bevelled tangent across authored polyline corners. */
export function createCobraCanyonRouteSampler(
  route,
  options = {},
) {
  if (!route || typeof route !== "object" || !Array.isArray(route.pathLocalM)
    || route.pathLocalM.length < 2) {
    throw new TypeError("A Cobra Canyon route with at least two path points is required.");
  }
  route.pathLocalM.forEach((point, index) => requireRoutePoint(point, `pathLocalM[${index}]`));
  const tangentWindowM = requireFinite(
    options.tangentWindowM ?? COBRA_CANYON_TOUR_TANGENT_WINDOW_M,
    "tangentWindowM",
  );
  if (tangentWindowM <= 0) throw new RangeError("tangentWindowM must be greater than zero.");
  const cumulative = new Float64Array(route.pathLocalM.length);
  for (let index = 1; index < route.pathLocalM.length; index++) {
    const from = route.pathLocalM[index - 1];
    const to = route.pathLocalM[index];
    cumulative[index] = cumulative[index - 1] + Math.hypot(to[0] - from[0], to[2] - from[2]);
  }
  const lengthM = cumulative[cumulative.length - 1];
  if (!(lengthM > 0)) throw new RangeError("Cobra Canyon route length must be greater than zero.");
  const before = { eastM: 0, upM: 0, northM: 0 };
  const after = { eastM: 0, upM: 0, northM: 0 };

  function sampleRaw(distanceM, target) {
    const clampedDistanceM = Math.min(lengthM, Math.max(0, distanceM));
    let segment = 1;
    while (segment < cumulative.length - 1 && cumulative[segment] < clampedDistanceM) {
      segment += 1;
    }
    const from = route.pathLocalM[segment - 1];
    const to = route.pathLocalM[segment];
    const segmentLengthM = cumulative[segment] - cumulative[segment - 1];
    const blend = segmentLengthM > 0
      ? (clampedDistanceM - cumulative[segment - 1]) / segmentLengthM
      : 0;
    target.eastM = from[0] + (to[0] - from[0]) * blend;
    target.upM = from[1] + (to[1] - from[1]) * blend;
    target.northM = from[2] + (to[2] - from[2]) * blend;
  }

  function sample(distanceM, target = {}) {
    const clampedDistanceM = Math.min(lengthM, Math.max(0, requireFinite(distanceM, "distanceM")));
    sampleRaw(clampedDistanceM, target);
    sampleRaw(clampedDistanceM - tangentWindowM, before);
    sampleRaw(clampedDistanceM + tangentWindowM, after);
    const segmentEastM = after.eastM - before.eastM;
    const segmentNorthM = after.northM - before.northM;
    const horizontalLengthM = Math.hypot(segmentEastM, segmentNorthM) || 1;
    target.distanceM = clampedDistanceM;
    target.tangentEast = segmentEastM / horizontalLengthM;
    target.tangentNorth = segmentNorthM / horizontalLengthM;
    return target;
  }

  return Object.freeze({ lengthM, sample });
}

/**
 * Samples the authored camera track into a caller-owned object to keep the frame loop allocation
 * free. The optional object is useful for one-off tools; the lab always supplies a stable target.
 */
export function sampleCobraCanyonTour(
  routeId,
  distanceM,
  totalLengthM,
  target = {},
) {
  const maneuvers = MANEUVERS_BY_ROUTE[routeId];
  if (!maneuvers) throw new RangeError(`Unknown Cobra Canyon route ${routeId}.`);
  const lengthM = requireFinite(totalLengthM, "totalLengthM");
  if (lengthM <= 0) throw new RangeError("totalLengthM must be greater than zero.");
  const clampedDistanceM = Math.min(lengthM, Math.max(0, requireFinite(distanceM, "distanceM")));

  target.distanceM = clampedDistanceM;
  target.commandedAglM = COBRA_CANYON_TOUR_BASE_AGL_M;
  target.aglOffsetM = 0;
  target.lateralOffsetM = 0;
  target.lateralSlopePerM = 0;
  target.active = false;
  target.maneuverId = "";
  target.cue = "";

  for (const maneuver of maneuvers) {
    if (clampedDistanceM < maneuver.startDistanceM
      || clampedDistanceM > maneuver.endDistanceM) continue;
    sampleTrack(maneuver, clampedDistanceM, trackSample);
    if (maneuver.axis === "agl") {
      target.commandedAglM += trackSample.value - COBRA_CANYON_TOUR_BASE_AGL_M;
    } else {
      target.lateralOffsetM += trackSample.value;
      target.lateralSlopePerM += trackSample.slopePerM;
    }
    target.active = true;
    target.maneuverId = maneuver.id;
    target.cue = maneuver.cue;
  }
  target.aglOffsetM = target.commandedAglM - COBRA_CANYON_TOUR_BASE_AGL_M;
  return target;
}

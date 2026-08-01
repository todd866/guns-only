/// Pure presentation boundary for the authored carrier-sortie route.
/// The simulation owns route state and target geometry; this module only validates, labels,
/// formats, and selects an already-projected navigation source.

const METERS_PER_NAUTICAL_MILE = 1852;
const KNOTS_PER_METER_PER_SECOND = 1.9438444924406;

export const CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN =
  "carrier-sortie-request-rtb";

const PHASES = Object.freeze([
  Object.freeze({ code: 0, token: "UNAVAILABLE", label: "UNAVAILABLE" }),
  Object.freeze({ code: 1, token: "ON_DECK", label: "ON DECK" }),
  Object.freeze({ code: 2, token: "DEPARTURE", label: "DEPARTURE" }),
  Object.freeze({ code: 3, token: "OUTBOUND", label: "OUTBOUND" }),
  Object.freeze({ code: 4, token: "TRANSIT", label: "TRANSIT" }),
  Object.freeze({ code: 5, token: "AWAITING_RETURN", label: "AWAITING RETURN" }),
  Object.freeze({ code: 6, token: "RETURN", label: "RETURN" }),
  Object.freeze({ code: 7, token: "RECOVERY", label: "RECOVERY" }),
  Object.freeze({ code: 8, token: "GROOVE", label: "GROOVE" }),
  Object.freeze({ code: 9, token: "COMPLETE", label: "COMPLETE" }),
]);

const FIXES = Object.freeze([
  Object.freeze({ code: 0, token: "NONE", label: "NONE" }),
  Object.freeze({ code: 1, token: "DEPARTURE", label: "DEPARTURE" }),
  Object.freeze({ code: 2, token: "OUTBOUND", label: "OUTBOUND" }),
  Object.freeze({ code: 3, token: "TRANSIT", label: "TRANSIT" }),
  Object.freeze({ code: 4, token: "RETURN_INITIAL", label: "RETURN INITIAL" }),
  Object.freeze({ code: 5, token: "RECOVERY_INITIAL", label: "RECOVERY INITIAL" }),
  Object.freeze({ code: 6, token: "GROOVE", label: "GROOVE" }),
  Object.freeze({ code: 7, token: "DECK", label: "DECK" }),
]);

const PHASE_BY_CODE = new Map(PHASES.map((phase) => [phase.code, phase]));
const FIX_BY_CODE = new Map(FIXES.map((fix) => [fix.code, fix]));

function compactToken(value) {
  if (typeof value !== "string" || !value.trim()
      || !/^[A-Za-z0-9 _-]+$/.test(value)) return null;
  return value.trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase()
    .replace(/[ _-]+/g, "");
}

const PHASE_BY_TOKEN = new Map(PHASES.map((phase) => [compactToken(phase.token), phase]));
const FIX_BY_TOKEN = new Map(FIXES.map((fix) => [compactToken(fix.token), fix]));

const EXPECTED_FIX_BY_PHASE = Object.freeze({
  1: 1,
  2: 1,
  3: 2,
  4: 3,
  5: 3,
  6: 4,
  7: 5,
  8: 6,
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function owns(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function strictFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveEnum(record, codeKey, tokenKey, byCode, byToken) {
  const hasCode = owns(record, codeKey);
  const hasToken = owns(record, tokenKey);
  if (!hasCode && !hasToken) return null;

  let fromCode = null;
  if (hasCode) {
    const rawCode = record[codeKey];
    if (!Number.isInteger(rawCode)) return null;
    fromCode = byCode.get(rawCode) ?? null;
    if (!fromCode) return null;
  }

  let fromToken = null;
  if (hasToken) {
    const rawToken = record[tokenKey];
    if (typeof rawToken !== "string" || !rawToken.trim()) return null;
    fromToken = byToken.get(compactToken(rawToken)) ?? null;
    if (!fromToken) return null;
  }

  if (fromCode && fromToken && fromCode.code !== fromToken.code) return null;
  return fromCode ?? fromToken;
}

function validRtbState(phaseCode, available, requested) {
  if (typeof available !== "boolean" || typeof requested !== "boolean") return false;
  if (phaseCode === 1) return !available && !requested;
  if (phaseCode >= 2 && phaseCode <= 5) return available && !requested;
  if (phaseCode >= 6 && phaseCode <= 8) return available && requested;
  return false;
}

function bearingDirective(bearingDeg) {
  const rounded = ((Math.round(bearingDeg) % 360) + 360) % 360;
  return `${String(rounded).padStart(3, "0")}°`;
}

function distanceDirective(rangeNm) {
  return `${rangeNm < 10 ? rangeNm.toFixed(1) : Math.round(rangeNm)} NM`;
}

function signedTurnDirective(turnDeg) {
  const magnitude = Math.round(Math.abs(turnDeg));
  if (magnitude === 0) return "STEADY";
  return `${turnDeg < 0 ? "L" : "R"} ${String(magnitude).padStart(3, "0")}°`;
}

function speedDirective(targetKtas) {
  return `${Math.round(targetKtas)} KTAS`;
}

/**
 * Validate and format the kernel's current carrier-sortie fix. An active route is only useful
 * when every value needed to fly it is coherent; partial or contradictory projections return
 * null instead of manufacturing browser-side guidance.
 */
export function carrierSortieRoutePresentation(state = {}) {
  const snapshot = isRecord(state) ? state : {};
  if (snapshot.carrier_sortie_route_active !== true) return null;

  const profileId = typeof snapshot.carrier_sortie_route_profile_id === "string"
    ? snapshot.carrier_sortie_route_profile_id.trim() : "";
  if (!profileId) return null;

  const phase = resolveEnum(
    snapshot,
    "carrier_sortie_route_phase_code",
    "carrier_sortie_route_phase",
    PHASE_BY_CODE,
    PHASE_BY_TOKEN,
  );
  const fix = resolveEnum(
    snapshot,
    "carrier_sortie_route_fix_code",
    "carrier_sortie_route_fix",
    FIX_BY_CODE,
    FIX_BY_TOKEN,
  );
  if (!phase || !fix || phase.code < 1 || phase.code > 8) return null;
  if (EXPECTED_FIX_BY_PHASE[phase.code] !== fix.code) return null;

  const targetEastM = strictFiniteNumber(snapshot.carrier_sortie_route_target_x);
  const targetAltitudeM = strictFiniteNumber(snapshot.carrier_sortie_route_target_y);
  const targetNorthM = strictFiniteNumber(snapshot.carrier_sortie_route_target_z);
  const distanceM = strictFiniteNumber(snapshot.carrier_sortie_route_distance_m);
  const bearingDeg = strictFiniteNumber(snapshot.carrier_sortie_route_target_bearing_deg);
  const turnDeg = strictFiniteNumber(snapshot.carrier_sortie_route_target_turn_deg);
  const targetSpeedMps = strictFiniteNumber(snapshot.carrier_sortie_route_target_tas_mps);
  const captureRadiusM = strictFiniteNumber(snapshot.carrier_sortie_route_capture_radius_m);
  if (targetEastM === null || targetAltitudeM === null || targetNorthM === null
      || distanceM === null || distanceM < 0
      || bearingDeg === null || bearingDeg < 0 || bearingDeg >= 360
      || turnDeg === null || turnDeg < -180 || turnDeg > 180
      || targetSpeedMps === null || targetSpeedMps <= 0
      || captureRadiusM === null || captureRadiusM <= 0) return null;

  const rtbAvailable = snapshot.carrier_sortie_route_rtb_available;
  const rtbRequested = snapshot.carrier_sortie_route_rtb_requested;
  if (!validRtbState(phase.code, rtbAvailable, rtbRequested)) return null;

  const rangeNm = distanceM / METERS_PER_NAUTICAL_MILE;
  const targetKtas = targetSpeedMps * KNOTS_PER_METER_PER_SECOND;
  const bearingText = bearingDirective(bearingDeg);
  const distanceText = distanceDirective(rangeNm);
  const turnText = signedTurnDirective(turnDeg);
  const targetSpeedText = speedDirective(targetKtas);
  const rtbActionRequired = phase.code === 5;
  const keyboardPrompt = rtbActionRequired ? "PRESS O — RETURN TO SHIP" : null;
  const touchActionToken = rtbActionRequired
    ? CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN : null;

  return Object.freeze({
    navigationSource: "route",
    active: true,
    profileId,
    phaseCode: phase.code,
    phaseToken: phase.token,
    phaseLabel: phase.label,
    fixCode: fix.code,
    fixToken: fix.token,
    fixLabel: fix.label,
    displayName: fix.label,
    target: Object.freeze({
      eastM: targetEastM,
      altitudeM: targetAltitudeM,
      northM: targetNorthM,
    }),
    distanceM,
    rangeNm,
    bearingDeg,
    turnDeg,
    targetSpeedMps,
    targetKtas,
    captureRadiusM,
    bearingDirective: bearingText,
    distanceDirective: distanceText,
    turnDirective: turnText,
    targetSpeedDirective: targetSpeedText,
    guidanceDirective:
      `${fix.label} · BRG ${bearingText} · ${distanceText} · ${turnText} · ${targetSpeedText}`,
    rtbAvailable,
    rtbRequested,
    rtbActionRequired,
    keyboardPrompt,
    touchActionToken,
  });
}

/**
 * Select route, Mesh, then Home Plate without silently replacing a broken active route. Mesh and
 * home are already-built presenters so this seam remains independent of runtime import wiring.
 */
export function selectCarrierSortieNavigationPresentation(
  state = {},
  sources = {},
) {
  const snapshot = isRecord(state) ? state : {};
  const mesh = isRecord(sources) ? sources.mesh : null;
  const home = isRecord(sources) ? sources.home : null;
  if (owns(snapshot, "carrier_sortie_route_active")
      && typeof snapshot.carrier_sortie_route_active !== "boolean") return null;

  if (snapshot.carrier_sortie_route_active === true) {
    const route = carrierSortieRoutePresentation(snapshot);
    return route ? Object.freeze({ source: "route", presentation: route }) : null;
  }
  if (isRecord(mesh) && mesh.active === true) {
    return Object.freeze({ source: "mesh", presentation: mesh });
  }
  if (isRecord(home) && home.recoveryPointKnown === true) {
    return Object.freeze({ source: "home", presentation: home });
  }
  return null;
}

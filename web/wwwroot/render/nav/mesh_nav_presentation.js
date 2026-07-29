/// Mesh nav console presentation — binds snapshot Mesh fields for `#nav-console`.
/// Spec: docs/superpowers/specs/2026-07-29-shared-geography-nav-fabric-design.md

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function travelStateFromClosure(closureKts, rangeNm, etaMinutes) {
  if (etaMinutes === 0 && rangeNm !== null && rangeNm < 0.01) return "arrived";
  if (closureKts === null) return "unknown";
  if (closureKts < -1) return "outbound";
  if (closureKts <= 1) return "abeam";
  return "inbound";
}

/**
 * Prefer Mesh ActiveDest solution when present; otherwise null so the caller can fall back to
 * recoveryNavigationPresentation (HomePlate-direct RTB).
 */
export function meshNavPresentation(state = {}) {
  const snapshot = state && typeof state === "object" ? state : {};
  if (snapshot.mesh_active_known !== true) return null;

  const rangeNm = finiteNumber(snapshot.mesh_dest_range_nm);
  const bearingDeg = finiteNumber(snapshot.mesh_dest_bearing_deg);
  const turnDeg = finiteNumber(snapshot.mesh_dest_turn_deg);
  const closureKts = finiteNumber(snapshot.mesh_dest_closure_kts);
  const etaMinutes = finiteNumber(snapshot.mesh_dest_eta_min);
  const fuelToDestLb = finiteNumber(snapshot.mesh_fuel_to_dest_lb);
  const fuelOnArrivalDestLb = finiteNumber(snapshot.mesh_fuel_on_arrival_dest_lb);
  const fuelDestToHomeLb = finiteNumber(snapshot.mesh_fuel_dest_to_home_lb);
  const reserveMarginViaDestLb = finiteNumber(snapshot.mesh_reserve_margin_via_dest_lb);
  const reserveTargetLb = finiteNumber(snapshot.fuel_reserve_target_lb)
    ?? finiteNumber(snapshot.mesh_home_reserve_target_lb);
  const groundKts = finiteNumber(snapshot.ground_speed_kts);
  const directFlowPph = finiteNumber(snapshot.fuel_flow_pph);
  const legacyFlowLbPerMinute = finiteNumber(snapshot.fuel_flow_lb_min)
    ?? finiteNumber(snapshot.fuel_burn_lb_min);
  const flowPph = directFlowPph
    ?? (legacyFlowLbPerMinute === null ? null : legacyFlowLbPerMinute * 60);
  const nmPerMin = groundKts === null ? null : Math.max(0, groundKts) / 60;
  const lbPerMin = flowPph === null ? null : Math.max(0, flowPph) / 60;
  const lbPerNm = lbPerMin !== null && nmPerMin !== null && nmPerMin > 0.01
    ? lbPerMin / nmPerMin : null;

  const displayName = typeof snapshot.mesh_active_display_name === "string"
    && snapshot.mesh_active_display_name.trim()
    ? snapshot.mesh_active_display_name.trim()
    : "ACTIVE DEST";

  return Object.freeze({
    active: true,
    displayName,
    isPlace: snapshot.mesh_active_is_place === true,
    placeId: typeof snapshot.mesh_active_place_id === "string"
      ? snapshot.mesh_active_place_id : null,
    transitMode: typeof snapshot.mesh_transit_mode === "string"
      ? snapshot.mesh_transit_mode : "mission_gated",
    rangeNm,
    bearingDeg,
    turnDeg,
    closureKts,
    etaMinutes,
    fuelToDestLb,
    fuelOnArrivalDestLb,
    fuelDestToHomeLb,
    reserveMarginViaDestLb,
    reserveTargetLb,
    nmPerMin,
    lbPerMin,
    lbPerNm,
    travelState: travelStateFromClosure(closureKts, rangeNm, etaMinutes),
  });
}

export function parseMeshPlaceCatalog(state = {}) {
  const raw = state?.mesh_place_catalog_json;
  if (typeof raw !== "string" || !raw.trim()) return Object.freeze([]);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return Object.freeze([]);
    return Object.freeze(parsed.map((entry) => Object.freeze({
      id: String(entry?.id ?? ""),
      name: String(entry?.name ?? ""),
      eastM: Number(entry?.east_m),
      northM: Number(entry?.north_m),
      role: String(entry?.role ?? "landmark"),
      selectable: entry?.selectable === true,
    })).filter((place) => place.id && Number.isFinite(place.eastM)
      && Number.isFinite(place.northM)));
  } catch {
    return Object.freeze([]);
  }
}

const MPS_TO_KT = 3600 / 1852;

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function regimeToken(regime) {
  const raw = String(regime ?? "normal").toLowerCase();
  switch (raw) {
    case "effectivetranslationallift":
    case "effective_translational_lift":
      return "ETL";
    case "vortexringstate":
    case "vortex_ring_state":
      return "VRS";
    case "retreatingbladestall":
    case "retreating_blade_stall":
      return "RBS";
    case "surfacecontact":
    case "surface_contact":
      return "SKID";
    case "rotorstrike":
    case "rotor_strike":
      return "STRIKE";
    case "autorotation":
      return "AUTO";
    default:
      return "NRM";
  }
}

/**
 * Compact AH-1G flight strip for Hold the Bridge. Uses authoritative rotorcraft telemetry only;
 * never invents Nr, torque, or regime from camera height.
 */
export function formatCobraRotorcraftStrip(vehicle, routeGuidance = null) {
  const rotor = vehicle?.rotorcraft ?? {};
  const nr = finite(rotor.main_rotor_rpm);
  const torqueNm = finite(rotor.transmission_torque_nm);
  const collectiveDeg = finite(rotor.collective_root_pitch_rad) * (180 / Math.PI);
  const tasKt = finite(vehicle?.true_airspeed_mps) * MPS_TO_KT;
  const gsKt = finite(vehicle?.ground_speed_mps) * MPS_TO_KT;
  const vsiFpm = finite(vehicle?.vertical_speed_mps) * 196.8504;
  const aglM = routeGuidance?.current_clearance_m ?? rotor.main_rotor_clearance_m;
  const aglText = Number.isFinite(Number(aglM)) && Number(aglM) >= 0
    ? `${Math.round(Number(aglM))}M`
    : "—";
  const warn = [];
  if (rotor.governor_saturated) warn.push("GOV");
  if (finite(rotor.vortex_ring_severity) >= 0.20) warn.push("VRS");
  if (finite(rotor.retreating_blade_stall_severity) >= 0.20) warn.push("RBS");
  if (finite(rotor.mast_bump_risk) >= 0.35) warn.push("MAST");
  const primary = [
    `NR${Math.round(nr)}`,
    `Q${Math.round(torqueNm / 1000)}K`,
    `COL${collectiveDeg.toFixed(1)}°`,
    `TAS${Math.round(tasKt)}`,
    `GS${Math.round(gsKt)}`,
    `AGL${aglText}`,
    `VSI${vsiFpm >= 0 ? "+" : ""}${Math.round(vsiFpm)}`,
    regimeToken(rotor.regime),
  ].join("·");
  return warn.length > 0 ? `${primary} · ${warn.join("·")}` : primary;
}

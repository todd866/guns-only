const MPS_TO_KNOTS = 1.9438444924406;
const M_TO_FEET = 3.2808398950131;
const MPS_TO_FPM = 196.8503937008;
const KG_TO_LB = 2.20462262185;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalFinite(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Project the Fire Boss authority into the same flat airdata/audio contract used by every other
 * Guns Only aircraft. Okanagan keeps its own mission authority; it does not get a second HUD,
 * control legend, or propulsion bus.
 */
export function okanaganFlightState(current = {}) {
  const position = current.position ?? {};
  const velocity = current.velocity ?? {};
  const speedMps = Math.max(0, finite(current.tas_mps));
  const speedKts = speedMps * MPS_TO_KNOTS;
  const verticalMps = finite(current.vertical_speed_mps, finite(velocity.y));
  const flightPathRad = speedMps > 0.5
    ? Math.asin(clamp(verticalMps / speedMps, -1, 1)) : 0;
  const throttle = clamp(finite(current.throttle), 0, 1);
  const enginePower = clamp(finite(current.engine_power_fraction, throttle), 0, 1);
  const grossMassKg = Math.max(1, finite(current.gross_mass_kg, 5_470));
  const stallKts = 31.5 * Math.sqrt(grossMassKg / 5_470) * MPS_TO_KNOTS;
  const fuelKg = Math.max(0, finite(current.fuel_kg));
  // Fire Boss sorties start hot and have no in-mission shutdown control. Flight idle is still
  // an operating, governed PT6; only fuel exhaustion or a destroyed airframe stops the engine.
  const engineRunning = fuelKg > 0 && String(current.surface ?? "") !== "destroyed";
  const blockFuelKg = Math.max(fuelKg, finite(current.fuel_plan?.block_kg, fuelKg));
  const minimumFuelKg = Math.max(0, finite(current.fuel_plan?.minimum_rtb_kg));
  const publishedScoopRateKgps = optionalFinite(current.scoop_rate_kgps);
  const scoopRateKgps = publishedScoopRateKgps == null
    ? undefined
    : Math.max(0, publishedScoopRateKgps);
  const waterReleasedKg = Math.max(0, finite(current.water_released_this_tick_kg));
  const publishedWaterReleaseRateKgps = optionalFinite(current.water_release_rate_kgps);
  const waterReleaseRateKgps = publishedWaterReleaseRateKgps == null
    ? undefined
    : Math.max(0, publishedWaterReleaseRateKgps);
  const burnKgPerSecond = 0.032 + 0.115 * throttle;
  const minutesToMinimum = Math.max(0, fuelKg - minimumFuelKg)
    / Math.max(0.001, burnKgPerSecond) / 60;

  return {
    player_aircraft_id: "aircraft.at-802f-fireboss",
    audio_profile_id: "audio.fireboss.pt6a-67f.v1",
    audio_perspective: "cockpit",
    camera_perspective: "cockpit",
    calibrated_airspeed_kts: speedKts,
    indicated_airspeed_kts: speedKts,
    true_airspeed_kts: speedKts,
    true_airspeed_mps: speedMps,
    ground_speed_kts: Math.hypot(finite(velocity.x), finite(velocity.z)) * MPS_TO_KNOTS,
    stall_speed_kcas: stallKts,
    accelerated_stall_speed_kcas: stallKts,
    alt_ft: finite(position.y) * M_TO_FEET,
    vertical_speed_fpm: verticalMps * MPS_TO_FPM,
    heading_deg: ((finite(current.heading_rad) * 180 / Math.PI) % 360 + 360) % 360,
    pitch_deg: finite(current.pitch_rad) * 180 / Math.PI,
    bank_deg: finite(current.roll_rad) * 180 / Math.PI,
    aoa_deg: finite(current.aoa_rad,
      finite(current.pitch_rad) - flightPathRad) * 180 / Math.PI,
    pitch_rate_dps: finite(current.pitch_rate_radps) * 180 / Math.PI,
    roll_rate_dps: finite(current.roll_rate_radps) * 180 / Math.PI,
    mach: speedMps / 340.3,
    throttle,
    applied_throttle: throttle,
    engine: enginePower,
    engine_spool_fraction: enginePower,
    // This legacy RPM field is Ng, never propeller Np.
    engine_rpm_pct: engineRunning ? 61 + enginePower * 36 : 0,
    // AT-802F takeoff configuration: the propeller governor holds Np while the power lever
    // changes torque. Keep those authorities separate so audio does not pitch-sweep with power.
    propeller_rpm: engineRunning ? 1_700 : 0,
    propeller_blade_count: 5,
    engine_ng_pct: engineRunning ? 61 + enginePower * 36 : 0,
    engine_torque_fraction: engineRunning
      ? enginePower
      : 0,
    engine_running: engineRunning,
    has_engine: true,
    has_afterburner: false,
    max_thrust_fraction: 1,
    fuel_consumes: true,
    fuel_lb: fuelKg * KG_TO_LB,
    fuel_capacity_lb: blockFuelKg * KG_TO_LB,
    fuel_bingo_lb: minimumFuelKg * KG_TO_LB,
    fuel_minimum_lb: minimumFuelKg * KG_TO_LB,
    fuel_reserve_target_lb: minimumFuelKg * KG_TO_LB,
    fuel_minutes_to_bingo: minutesToMinimum,
    fuel_endurance_minutes: fuelKg / Math.max(0.001, burnKgPerSecond) / 60,
    fuel_minimum: minimumFuelKg > 0 && fuelKg <= minimumFuelKg,
    fuel_flow_pph: burnKgPerSecond * 3_600 * KG_TO_LB,
    has_retractable_gear: false,
    has_flaps: false,
    has_electrical_system: false,
    has_utility_hydraulics: false,
    suppress_systems_panel: true,
    mode: "FREE",
    fight: "Civilian",
    opponent_alive: false,
    bandit_alive: false,
    opponent_body_present: false,
    px: finite(position.x),
    py: finite(position.y),
    // The shared flight snapshot is Z-north and the main renderer flips it. Okanagan renders
    // Z-north directly, so publish the inverse here and let the shared HUD's one conversion put
    // the conformal FPV back on the real velocity vector.
    pz: -finite(position.z),
    vx: finite(velocity.x),
    vy: finite(velocity.y, verticalMps),
    vz: -finite(velocity.z),
    g_actual: finite(current.load_factor, 1),
    pilot_gz: finite(current.load_factor, 1),
    pilot_gz_valid: true,
    water_load_kg: Math.max(0, finite(current.water_kg)),
    water_capacity_kg: Math.max(1, finite(current.water_capacity_kg, 3_104)),
    fireboss_surface: String(current.surface ?? ""),
    fireboss_scoop_valid: current.scoop_valid === true,
    fireboss_scoops_commanded: current.scoops_commanded === true,
    fireboss_scoop_rate_kgps: scoopRateKgps,
    fireboss_water_release_kg: waterReleasedKg,
    fireboss_water_release_rate_kgps: waterReleaseRateKgps,
    fireboss_drop_active: waterReleaseRateKgps == null
      ? waterReleasedKg > 0
      : waterReleaseRateKgps > 0,
  };
}

export function compactOkanaganCue(current = {}) {
  const fault = String(current.scoop_fault ?? "").trim();
  if (fault) return fault;
  const cue = String(current.cue ?? "").trim();
  if (cue) return cue;
  const gate = current.route?.[current.active_gate];
  return String(gate?.label ?? "").trim();
}

/** Keep transient radio readable without parking a subtitle over the outside view. */
export function okanaganRadioHoldMs(transmission) {
  const words = String(transmission ?? "").trim().split(/\s+/u).filter(Boolean).length;
  if (words === 0) return 0;
  return clamp(1_900 + words * 240, 2_200, 4_200);
}

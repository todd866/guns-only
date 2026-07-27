const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB · FL560",
  3: "LEVEL ACCEL · M2.20",
  4: "RAM CLIMB · FL700",
  5: "INTERCEPT · FL700",
  6: "ATTACK",
  7: "EGRESS · HOME",
  8: "RETURN · HOME",
  9: "RECOVERY",
  10: "COMPLETE",
});

/// Quiet mode line under the heading tape. Spec:
/// docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md
/// Nav numbers live in the Limits Panel; engine bars live in Systems.
export function rapierGuidancePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  let phaseText = PHASE[phase] ?? "MISSION";
  const enabled = state.rapier_automation_enabled === true;
  const active = state.rapier_automation_active === true;
  const drones = Math.max(0,
    Math.floor(Number(state.rapier_gun_drones_remaining) || 0));
  const gate = Math.max(0, Math.floor(Number(state.rapier_recovery_gate) || 0));
  if (phase === 9) {
    phaseText = `RECOVERY · GATE ${gate}/4`;
  } else if (gate > 0 && phase >= 1 && phase <= 5) {
    phaseText = `${phaseText} · GATE ${gate}/4`;
  }

  const weapon = phase === 6
    ? ` · F RELEASES SWARM · ${drones}`
    : "";
  const authority = active ? "AUTO" : enabled ? "AUTO STBY" : "PILOT";

  // Thermal OVER replaces the mode fragment until clear — Limits accent also goes fault.
  const marginC = Number(state.rapier_thermal_margin_c);
  const thermalOver = Number.isFinite(marginC) && marginC < 0;
  const text = thermalOver
    ? `${authority} · SKIN OVER · P TOGGLE AUTO`
    : `${authority} · ${phaseText}${weapon} · P TOGGLE AUTO`;

  return Object.freeze({
    text,
    detail: "",
    level: thermalOver ? "attack"
      : phase === 6 || phase === 7 ? "attack" : active ? "active" : "manual",
  });
}

/// Diagnostic engine state for the Aircraft Systems console / tests — not drawn on the HUD.
export function rapierEnginePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const mach = Math.max(0, Number(state.mach) || 0);
  const trueAirspeedKts = Math.max(0, Number(state.true_airspeed_kts) || 0);
  const thrustKn = Math.max(0,
    (Number(state.engine_net_thrust_lbf) || 0) * 4.4482216153 / 1000);
  const lever = Math.max(0, Number(state.throttle) || 0);
  const stagnationC = Number(state.rapier_stagnation_temp_c);
  const turbineThrustKn = Math.max(0, Number(state.rapier_turbine_thrust_kn) || 0);
  const ramjetThrustKn = Math.max(0, Number(state.rapier_ramjet_thrust_kn) || 0);
  const turbineFuelPpm = Math.max(0, Number(state.rapier_turbine_fuel_ppm) || 0);
  const ramjetFuelPpm = Math.max(0, Number(state.rapier_ramjet_fuel_ppm) || 0);
  const RAM_FADE_START = 1.85;
  const FULL_RAM = 2.15;
  const TURBINE_GONE = 3.0;
  const mode = mach < RAM_FADE_START ? "TURBINE"
    : mach < FULL_RAM ? "RAM LIGHT"
      : mach < TURBINE_GONE ? "FULL RAM"
        : "RAM ONLY";
  return Object.freeze({
    text: `PROPULSION ${mode} · ${thrustKn.toFixed(0)} KN · LEVER ${lever.toFixed(2)} · M${mach.toFixed(2)} · ${Math.round(trueAirspeedKts).toLocaleString("en-US")} KTAS${Number.isFinite(stagnationC) ? ` · T0 ${Math.round(stagnationC)}°C` : ""}`,
    level: mach >= FULL_RAM ? "ram" : mach >= RAM_FADE_START ? "transition" : "turbine",
    channels: Object.freeze([
      Object.freeze({
        label: "TURBINE / A-B",
        thrustKn: turbineThrustKn,
        fuelPpm: turbineFuelPpm,
      }),
      Object.freeze({
        label: "RAMJET",
        thrustKn: ramjetThrustKn,
        fuelPpm: ramjetFuelPpm,
      }),
    ]),
  });
}

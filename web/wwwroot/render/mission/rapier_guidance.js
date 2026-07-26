const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB M0.90 / FL560",
  3: "LEVEL ACCEL / M2.20",
  4: "RAM CLIMB / FL700",
  5: "INTERCEPT M4.00 / FL700",
  6: "ATTACK FORMATION",
  7: "ESCAPE M4.00 / FL700",
  8: "RTB M1.50 / FL380",
  9: "RECOVERY · FLY THE SQUARES",
  10: "SORTIE COMPLETE",
});

export function rapierGuidancePresentation(state) {
  if (state?.rapier_mission_available !== true) return null;
  const phase = Math.floor(Number(state.rapier_mission_phase) || 0);
  const phaseText = PHASE[phase] ?? "MISSION SCRIPT";
  const enabled = state.rapier_automation_enabled === true;
  const active = state.rapier_automation_active === true;
  const drones = Math.max(0,
    Math.floor(Number(state.rapier_gun_drones_remaining) || 0));
  const weapon = phase === 6
    ? ` · F RELEASES GUN-DRONE SWARM · ${drones} DRONES`
    : "";
  const authority = active ? "AUTO" : enabled ? "PILOT OVERRIDE" : "PILOT";
  return Object.freeze({
    text: `${authority} · ${phaseText}${weapon} · P AUTO`,
    level: phase === 6 || phase === 7 ? "attack" : active ? "active" : "manual",
  });
}

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
  const mode = mach < 1.6 ? "TURBINE"
    : mach < 2.2 ? "RAM LIGHT"
      : mach < 3.0 ? "FULL RAM"
        : "MACH-4 RAM";
  return Object.freeze({
    text: `PROPULSION ${mode} · ${thrustKn.toFixed(0)} KN · LEVER ${lever.toFixed(2)} · M${mach.toFixed(2)} · ${Math.round(trueAirspeedKts).toLocaleString("en-US")} KTAS${Number.isFinite(stagnationC) ? ` · T0 ${Math.round(stagnationC)}°C` : ""}`,
    level: mach >= 2.2 ? "ram" : mach >= 1.6 ? "transition" : "turbine",
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

const PHASE = Object.freeze({
  1: "LAUNCH",
  2: "CLIMB M0.90 / FL560",
  3: "LEVEL ACCEL / M2.20",
  4: "RAM CLIMB / FL700",
  5: "INTERCEPT M4.00 / FL700",
  6: "ATTACK FORMATION",
  7: "FORMATION DESTROYED · EGRESS HOME M4.00 / FL700",
  8: "RETURN HOME M2.00 / FL450",
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
  const authority = active ? "AUTO FLYING" : enabled ? "AUTO STANDBY" : "PILOT FLYING";
  const homeRangeNm = Number(state.rtb_range_nm);
  const homeBearingDeg = Number(state.rtb_bearing_deg);
  const homeTurnDeg = Number(state.rtb_turn_deg);
  const trueAirspeedKts = Math.max(1, Number(state.true_airspeed_kts) || 0);
  const hasHome = phase >= 7 && phase <= 9
    && Number.isFinite(homeRangeNm)
    && Number.isFinite(homeBearingDeg)
    && Number.isFinite(homeTurnDeg);
  const turn = Math.abs(homeTurnDeg) < 3
    ? "STEADY"
    : `TURN ${homeTurnDeg < 0 ? "L" : "R"} ${Math.round(Math.abs(homeTurnDeg))}°`;
  // CLOSURE, not true airspeed. TAS is total speed through the air, and on a ballistic lob a large
  // part of that is vertical — climbing steeply the aircraft can be doing M4 while barely closing on
  // home, and diving the reverse. Dividing range by TAS therefore read optimistic on the way up and
  // pessimistic on the way down, and fuel-to-home inherited the error because it is ETA x flow.
  //
  // Projecting ground velocity onto the bearing home gives the rate the distance is ACTUALLY
  // shrinking, which is what a time-to-run means. It falls out correct for a steady cruise too.
  const bearingRad = (Number(state.rtb_bearing_deg) || 0) * Math.PI / 180;
  const eastMps = Number(state.vx) || 0;
  const northMps = Number(state.vz) || 0;
  const closureKts = (eastMps * Math.sin(bearingRad) + northMps * Math.cos(bearingRad)) * 1.94384;
  // Below a knot of closure the arc is not making progress home; fall back to TAS so the readout
  // degrades to the old behaviour rather than dividing by zero.
  const closingKts = closureKts > 1 ? closureKts : trueAirspeedKts;
  const etaMinutes = hasHome
    ? Math.max(0, Math.round(homeRangeNm / closingKts * 60))
    : 0;
  // CAN I GET HOME? The cue gave bearing, range and ETA but never answered the only question that
  // matters on the egress. A pilot at 637 lb with 234 NM to run and 14,185 PPH flowing is already
  // out of options and nothing on the HUD said so. Fuel required is ETA at the CURRENT flow, which
  // is the honest estimate: it prices the speed being flown right now, so slowing down visibly
  // improves it.
  const fuelLb = Math.max(0, Number(state.fuel_lb) || 0);
  const fuelFlowPph = Math.max(0, Number(state.fuel_flow_pph) || 0);
  const fuelToHomeLb = hasHome && fuelFlowPph > 0
    ? fuelFlowPph * (etaMinutes / 60) : Number.NaN;
  const fuelMarginLb = fuelLb - fuelToHomeLb;
  // Ten per cent of the requirement is the reserve line: inside it, a headwind or one extra turn
  // costs the aircraft, so it reads as marginal rather than safe.
  const fuelVerdict = !Number.isFinite(fuelToHomeLb) ? ""
    : fuelMarginLb < 0 ? `SHORT ${Math.round(-fuelMarginLb)} LB`
      : fuelMarginLb < fuelToHomeLb * 0.10 ? `MARGINAL +${Math.round(fuelMarginLb)} LB`
        : `OK +${Math.round(fuelMarginLb)} LB`;
  // The nav triad on the cue as well as the console: nm/min, lb/min, lb/nm is how the pilot reads
  // navigation, and lb/nm is the only figure that improves when they slow down.
  const groundKts = Math.max(0, Number(state.ground_speed_kts) || 0);
  const nmPerMin = groundKts / 60;
  const lbPerMin = fuelFlowPph / 60;
  const lbPerNm = nmPerMin > 0.01 ? lbPerMin / nmPerMin : Number.NaN;
  const rateCue = nmPerMin > 0.01
    ? ` · ${nmPerMin.toFixed(1)} NM/MIN · ${Math.round(lbPerMin)} LB/MIN`
      + `${Number.isFinite(lbPerNm) ? ` · ${lbPerNm.toFixed(2)} LB/NM` : ""}`
    : "";
  const fuelCue = Number.isFinite(fuelToHomeLb)
    ? `${rateCue} · NEED ${Math.round(fuelToHomeLb)} LB · HAVE ${Math.round(fuelLb)} LB · ${fuelVerdict}`
    : rateCue;
  const detail = hasHome
    ? `HOME ${String(Math.round((homeBearingDeg % 360 + 360) % 360)).padStart(3, "0")}° · ${homeRangeNm.toFixed(0)} NM · ETA ${etaMinutes} MIN · ${turn}${fuelCue} · ${active ? "AUTOMATION HAS CONTROL" : "FOLLOW HOME CUE · P ENGAGES AUTO"}`
    : "";
  return Object.freeze({
    text: `${authority} · ${phaseText}${weapon} · P TOGGLE AUTO`,
    detail,
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
  // Thresholds mirror TurboRamjetPerformanceMap's fade band. They were 1.6 / 2.2 / 3.0 after the
  // band moved to 1.85 / 2.15, so the readout named a mode the engine was not in yet.
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

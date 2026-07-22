function activeSortie(state) {
  return String(state?.session_phase || "").toUpperCase() === "ACTIVE"
    && String(state?.player_terminal_state || "").toUpperCase() === "FLYING";
}

/**
 * Decide which direct-manipulation controls belong on the live phone HUD.
 *
 * This is deliberately capability- and phase-driven. The keyboard surface remains complete, but
 * a phone should not inherit every aircraft/system command merely because a GKey exists for it.
 */
export function mobileControlProfile(state = {}) {
  const active = activeSortie(state);
  const carrier = state.carrier === true;
  const maintenance = state.maintenance_scenario === true;
  // Mission role is intentionally stable across a splash/replacement dwell. Visibility must not
  // churn at exactly the moment the pilot is still holding the phone and watching the outcome.
  const combat = !carrier && !maintenance;
  const gearPilotOwned = !maintenance && (state.configuration_automatic !== true
    || state.configuration_gear_auto === false);
  const flapsPilotOwned = !maintenance && (state.configuration_automatic !== true
    || state.configuration_flap_auto === false);
  const hasAmmo = Number(state.ammo) > 0;

  return Object.freeze({
    throttle: active && state.has_engine === true,
    waveOff: active && carrier && (state.approach === true || state.wave_off === true),
    gear: active && carrier && gearPilotOwned && state.has_retractable_gear === true,
    flaps: active && carrier && flapsPilotOwned && state.has_flaps === true,
    padlock: active && (carrier || combat),
    limitOverride: active && combat,
    fire: active && combat && hasAmmo,
    gcasOverride: active && state.auto_gcas_available === true
      && (state.auto_gcas_active === true || state.auto_gcas_override_held === true)
      && Number(state.pilot_control_authority_01) >= 0.55,
  });
}

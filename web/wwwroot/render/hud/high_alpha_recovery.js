const LABEL = "Centre pitch stick to re-arm high-alpha recovery";

function isF22(state) {
  const id = String(state?.player_aircraft_id ?? "").trim().toLowerCase();
  return id === "f-22a" || id.startsWith("aircraft.f22a.");
}

/** Compact centre-stick cue for the F-22 high-alpha recovery detent. */
export function highAlphaRecoveryPresentation(state = {}) {
  const active = isF22(state) && state?.high_alpha_recovery === true;
  return Object.freeze({
    active,
    symbol: active ? "→⊙←" : "",
    label: LABEL,
  });
}

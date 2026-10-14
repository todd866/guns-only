import { approachPowerFallback } from "./approach_energy.js";

/// Prefer the per-airframe two-sided SortieSchedule. When that is absent, fall back to the
/// continuous approach-guidance power command (also two-sided). GoldenPath is never used here:
/// its solve is <= 0.5 by construction and must not masquerade as a complete throttle command.
/// The F-22 overhead pattern has its own two-sided power solve toward the ACTIVE fix (initial,
/// break, downwind, final). The SortieSchedule beside it plans a straight-in 3° final from range to
/// the field, so inside 1.5 km — i.e. in the break, over the numbers at 1,500 ft — it called GROOVE
/// and asked for glideslope power. While the pattern owns recovery, its command wins.
export function patternOwnsPower(state) {
  return state?.conventional_rtb_pattern_active === true
    && state?.approach_guidance_active === true
    && state?.approach_valid === true
    && Number.isFinite(Number(state?.approach_power_01));
}

export function sortiePowerCommand(state) {
  if (patternOwnsPower(state))
    return Math.max(0, Math.min(1, Number(state.approach_power_01)));
  if (state?.sortie_valid === true) {
    const command = Number(state?.sortie_power_01);
    return Number.isFinite(command) ? command : null;
  }
  return approachPowerFallback(state);
}

import { approachPowerFallback } from "./approach_energy.js";

/// Prefer the per-airframe two-sided SortieSchedule. When that is absent, fall back to the
/// continuous approach-guidance power command (also two-sided). GoldenPath is never used here:
/// its solve is <= 0.5 by construction and must not masquerade as a complete throttle command.
export function sortiePowerCommand(state) {
  if (state?.sortie_valid === true) {
    const command = Number(state?.sortie_power_01);
    return Number.isFinite(command) ? command : null;
  }
  return approachPowerFallback(state);
}

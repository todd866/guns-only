/// The only recovery power command safe to put on the throttle rail is the per-airframe,
/// two-sided SortieSchedule. GoldenPath remains a useful legacy altitude/speed corridor, but its
/// power solve is <= 0.5 by construction and must not masquerade as a complete throttle command.
export function sortiePowerCommand(state) {
  if (state?.sortie_valid !== true) return null;
  const command = Number(state?.sortie_power_01);
  return Number.isFinite(command) ? command : null;
}

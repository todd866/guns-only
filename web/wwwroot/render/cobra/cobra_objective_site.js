/**
 * Select the hostile point both the mission order and tactical-map pointer should name.
 *
 * The authority array is the mission sequence. The first hostile point stays the objective until
 * it flips friendly; only then does the next hostile point become the job. Recomputing "nearest"
 * every frame made the briefing change from Phu Rieng to Cau Song Ma during the same departure
 * (owner recording, Build 335), while the highway continued on its authored ingress. A tactical
 * objective must be stable, not whichever red dot happens to be closest after a turn.
 */

const GARRISON_ID_SUFFIX = ".garrison";

/** Authority-published conquest lock, with the exact pre-field ID retained for old snapshots. */
export function cobraUnitLocksObjective(unit, siteId) {
  if (!unit || !siteId) return false;
  if (unit.objective_lock === true) return unit.home_site_id === siteId;
  return unit.id === `${siteId}${GARRISON_ID_SUFFIX}`;
}

export function cobraSiteHasLivingGarrison(units, siteId) {
  return (Array.isArray(units) ? units : [])
    .some((unit) => unit?.alive && cobraUnitLocksObjective(unit, siteId));
}

export function cobraObjectiveSiteId({ sites = [], units = [], player = null } = {}) {
  const hostileSites = Array.isArray(sites)
    ? sites.filter((site) => site && site.owner === "hostile")
    : [];
  return hostileSites[0]?.id ?? null;
}

/**
 * Stable Tab order for the gunner: the fortified gun pit holding the current conquest point is
 * the first job, then every other living hostile is ordered by range. Distance-only ordering put
 * unrelated infantry ahead of the one target the mission copy says must be destroyed.
 */
export function cobraPrioritizedHostileTargetIds({
  sites = [],
  units = [],
  player = null,
} = {}) {
  const objectiveSiteId = cobraObjectiveSiteId({ sites, units, player });
  const playerEastM = Number(player?.eastM ?? player?.x_m);
  const playerNorthM = Number(player?.northM ?? player?.z_m);
  const distanceSq = (unit) => {
    const eastM = Number(unit?.x_m);
    const northM = Number(unit?.z_m);
    if (![playerEastM, playerNorthM, eastM, northM].every(Number.isFinite))
      return Number.POSITIVE_INFINITY;
    return (eastM - playerEastM) ** 2 + (northM - playerNorthM) ** 2;
  };
  const isObjectiveGunPit = (unit) => cobraUnitLocksObjective(unit, objectiveSiteId);
  return (Array.isArray(units) ? units : [])
    .filter((unit) => unit?.alive === true && unit?.faction === "hostile")
    .sort((a, b) => {
      const priority = Number(isObjectiveGunPit(b)) - Number(isObjectiveGunPit(a));
      if (priority !== 0) return priority;
      const range = distanceSq(a) - distanceSq(b);
      return range !== 0 ? range : String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    })
    .map((unit) => unit.id);
}

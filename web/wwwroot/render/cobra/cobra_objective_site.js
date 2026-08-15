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

export function cobraSiteHasLivingGarrison(units, siteId) {
  const garrisonId = `${siteId}${GARRISON_ID_SUFFIX}`;
  return (Array.isArray(units) ? units : [])
    .some((unit) => unit?.alive && unit.id === garrisonId);
}

export function cobraObjectiveSiteId({ sites = [], units = [], player = null } = {}) {
  const hostileSites = Array.isArray(sites)
    ? sites.filter((site) => site && site.owner === "hostile")
    : [];
  return hostileSites[0]?.id ?? null;
}

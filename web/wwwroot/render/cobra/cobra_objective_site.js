/**
 * Select the hostile point both the mission order and tactical-map pointer should name.
 *
 * A living garrison is the Cobra's unique job, so garrisoned points outrank already-cleared
 * hostile points. Within that rung, the nearest point wins when a player position is known;
 * otherwise authority snapshot order is retained. Returning only the site ID keeps this pure
 * resolver independent of either presentation's projected/readout model.
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
  if (!hostileSites.length) return null;

  const garrisonedSites = hostileSites.filter(
    (site) => cobraSiteHasLivingGarrison(units, site.id),
  );
  const candidates = garrisonedSites.length ? garrisonedSites : hostileSites;

  const eastM = Number(player?.eastM);
  const northM = Number(player?.northM);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) {
    return candidates[0]?.id ?? null;
  }

  let selected = candidates[0] ?? null;
  let selectedRangeM = Infinity;
  for (const site of candidates) {
    const siteEastM = Number(site?.x_m);
    const siteNorthM = Number(site?.z_m);
    const rangeM = Number.isFinite(siteEastM) && Number.isFinite(siteNorthM)
      ? Math.hypot(siteEastM - eastM, siteNorthM - northM)
      : Infinity;
    if (rangeM < selectedRangeM) {
      selected = site;
      selectedRangeM = rangeM;
    }
  }
  return selected?.id ?? null;
}

/**
 * Pure tactical-map model for the AH-1G Cobra mission.
 *
 * Consumes the authority snapshot's ground_war block (sites, units, tickets) plus the
 * player pose, and projects it into a north-up pixel box. No canvas, no DOM, no three.js —
 * a separate task wires the drawing layer. One engine: this module never infers ownership,
 * progress or unit positions, it only reprojects what the sim already published.
 */

import { cobraObjectiveSiteId } from "./cobra_objective_site.js?v=338";

export const COBRA_TACTICAL_MAP_SCHEMA = "guns-only.cobra-tactical-map.v1";

function assertFiniteNumber(value, message) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(message);
  }
}

function assertBounds(bounds) {
  if (!bounds || typeof bounds !== "object") {
    throw new TypeError("cobraTacticalMapModel: bounds is required");
  }
  assertFiniteNumber(bounds.minEastM, "cobraTacticalMapModel: bounds.minEastM must be finite");
  assertFiniteNumber(bounds.maxEastM, "cobraTacticalMapModel: bounds.maxEastM must be finite");
  assertFiniteNumber(bounds.minNorthM, "cobraTacticalMapModel: bounds.minNorthM must be finite");
  assertFiniteNumber(bounds.maxNorthM, "cobraTacticalMapModel: bounds.maxNorthM must be finite");
  if (!(bounds.maxEastM - bounds.minEastM > 0)) {
    throw new TypeError("cobraTacticalMapModel: bounds east span must be positive");
  }
  if (!(bounds.maxNorthM - bounds.minNorthM > 0)) {
    throw new TypeError("cobraTacticalMapModel: bounds north span must be positive");
  }
}

/**
 * Linear north-up projection of world metres into a pixel box, clamping anything outside
 * `bounds` to the edge and flagging it offMap. The bounds' north-west corner maps to (0, 0);
 * the south-east corner maps to (widthPx, heightPx).
 */
function project(eastM, northM, bounds, widthPx, heightPx) {
  const eastSpan = bounds.maxEastM - bounds.minEastM;
  const northSpan = bounds.maxNorthM - bounds.minNorthM;
  const rawX = ((eastM - bounds.minEastM) / eastSpan) * widthPx;
  const rawY = ((bounds.maxNorthM - northM) / northSpan) * heightPx;
  const offMap =
    eastM < bounds.minEastM ||
    eastM > bounds.maxEastM ||
    northM < bounds.minNorthM ||
    northM > bounds.maxNorthM;
  const x = Math.min(widthPx, Math.max(0, rawX));
  const y = Math.min(heightPx, Math.max(0, rawY));
  return { x, y, offMap };
}

/**
 * @param {{
 *   sites?: Array<object>,
 *   units?: Array<object>,
 *   tickets?: { friendly?: number, hostile?: number },
 *   combatLive?: boolean,
 *   player?: { eastM?: number, northM?: number, headingRad?: number },
 *   bounds: { minEastM: number, maxEastM: number, minNorthM: number, maxNorthM: number },
 *   widthPx: number,
 *   heightPx: number,
 *   showUnits?: boolean,
 * }} params
 */
export function cobraTacticalMapModel({
  sites = [],
  units = [],
  tickets = { friendly: 0, hostile: 0 },
  combatLive = true,
  player = { eastM: 0, northM: 0, headingRad: 0 },
  // The river course, as [{ eastM, northM }]. It is the strongest landmark a pilot actually
  // has out of the windscreen, so a chart that omits it gives them nothing to match against.
  river = [],
  bounds,
  widthPx,
  heightPx,
  showUnits = true,
} = {}) {
  assertBounds(bounds);
  assertFiniteNumber(widthPx, "cobraTacticalMapModel: widthPx is required and must be finite");
  if (!(widthPx > 0)) {
    throw new TypeError("cobraTacticalMapModel: widthPx must be positive");
  }
  assertFiniteNumber(heightPx, "cobraTacticalMapModel: heightPx is required and must be finite");
  if (!(heightPx > 0)) {
    throw new TypeError("cobraTacticalMapModel: heightPx must be positive");
  }

  const projectedSites = [];
  for (const site of sites) {
    if (!site) continue;
    if (!Number.isFinite(site.x_m) || !Number.isFinite(site.z_m)) continue;
    const { x, y, offMap } = project(site.x_m, site.z_m, bounds, widthPx, heightPx);
    projectedSites.push({
      id: site.id,
      label: site.label,
      x,
      y,
      owner: site.owner,
      progress: site.capture_progress,
      contested: site.contested,
      offMap,
    });
  }

  const projectedUnits = [];
  const tacticalSymbols = [];
  const objectiveSiteId = cobraObjectiveSiteId({ sites, units, player });
  if (showUnits) {
    for (const unit of units) {
      if (!unit) continue;
      if (!unit.alive) continue;
      if (!Number.isFinite(unit.x_m) || !Number.isFinite(unit.z_m)) continue;
      const { x, y, offMap } = project(unit.x_m, unit.z_m, bounds, widthPx, heightPx);
      projectedUnits.push({
        id: unit.id,
        x,
        y,
        faction: unit.faction,
        role: unit.role,
        homeSiteId: unit.home_site_id,
        offMap,
      });
    }
  }

  // The minimap suppresses ordinary infantry clutter, but never suppresses the things a pilot
  // must know before takeoff: the objective garrison and every gun that can shoot the aircraft.
  // These are role-shaped symbols, not another set of identical red dots.
  for (const unit of units) {
    if (!unit?.alive || unit.faction !== "hostile") continue;
    const role = String(unit.role ?? "").toLowerCase();
    const isThreat = role === "dshk-site";
    const isObjectiveTarget = unit.home_site_id === objectiveSiteId
      && String(unit.id ?? "").endsWith(".garrison");
    if (!isThreat && !isObjectiveTarget) continue;
    if (!Number.isFinite(unit.x_m) || !Number.isFinite(unit.z_m)) continue;
    const { x, y, offMap } = project(unit.x_m, unit.z_m, bounds, widthPx, heightPx);
    tacticalSymbols.push({
      id: unit.id,
      kind: isThreat ? "air-threat" : "target",
      role,
      x,
      y,
      offMap,
      homeSiteId: unit.home_site_id,
      rangeM: Number.isFinite(Number(unit.air_threat_range_m))
        ? Number(unit.air_threat_range_m)
        : null,
    });
  }

  const playerEastM = player?.eastM ?? 0;
  const playerNorthM = player?.northM ?? 0;
  const headingRad = player?.headingRad ?? 0;
  const playerProjection = project(playerEastM, playerNorthM, bounds, widthPx, heightPx);
  const projectedPlayer = {
    x: playerProjection.x,
    y: playerProjection.y,
    headingRad,
    offMap: playerProjection.offMap,
  };

  const projectedRiver = [];
  for (const point of river) {
    const eastM = Number(point?.eastM);
    const northM = Number(point?.northM);
    if (!Number.isFinite(eastM) || !Number.isFinite(northM)) continue;
    const { x, y } = project(eastM, northM, bounds, widthPx, heightPx);
    projectedRiver.push({ x, y });
  }

  let objective = null;
  const objectiveSite = sites.find((site) => site?.id === objectiveSiteId) ?? null;
  if (objectiveSite
    && Number.isFinite(objectiveSite.x_m)
    && Number.isFinite(objectiveSite.z_m)) {
    const site = objectiveSite;
    const deltaEast = site.x_m - playerEastM;
    const deltaNorth = site.z_m - playerNorthM;
    const rangeM = Math.hypot(deltaEast, deltaNorth);
    objective = {
      siteId: site.id,
      label: site.label,
      bearingRad: Math.atan2(deltaEast, deltaNorth),
      rangeM,
    };
  }

  return {
    widthPx,
    heightPx,
    sites: projectedSites,
    units: projectedUnits,
    tacticalSymbols,
    river: projectedRiver,
    player: projectedPlayer,
    tickets: { friendly: tickets?.friendly ?? 0, hostile: tickets?.hostile ?? 0 },
    combat_live: combatLive !== false,
    objective,
  };
}

/**
 * Axis-aligned bounds enclosing every finite-coordinate site plus `paddingM` on each side,
 * forced to a square (the larger span wins; the smaller axis is centred in it) so the
 * projection never distorts.
 */
export function cobraTacticalMapBounds(sites, { paddingM = 400 } = {}) {
  if (!Array.isArray(sites) || sites.length === 0) {
    throw new TypeError("cobraTacticalMapBounds: sites must be a non-empty array");
  }

  let minEastM = Infinity;
  let maxEastM = -Infinity;
  let minNorthM = Infinity;
  let maxNorthM = -Infinity;
  for (const site of sites) {
    if (!site) continue;
    if (!Number.isFinite(site.x_m) || !Number.isFinite(site.z_m)) continue;
    minEastM = Math.min(minEastM, site.x_m);
    maxEastM = Math.max(maxEastM, site.x_m);
    minNorthM = Math.min(minNorthM, site.z_m);
    maxNorthM = Math.max(maxNorthM, site.z_m);
  }

  if (!Number.isFinite(minEastM) || !Number.isFinite(minNorthM)) {
    throw new TypeError("cobraTacticalMapBounds: sites has no finite coordinates");
  }

  minEastM -= paddingM;
  maxEastM += paddingM;
  minNorthM -= paddingM;
  maxNorthM += paddingM;

  const eastSpan = maxEastM - minEastM;
  const northSpan = maxNorthM - minNorthM;
  const span = Math.max(eastSpan, northSpan);

  const eastCenter = (minEastM + maxEastM) / 2;
  const northCenter = (minNorthM + maxNorthM) / 2;

  return {
    minEastM: eastCenter - span / 2,
    maxEastM: eastCenter + span / 2,
    minNorthM: northCenter - span / 2,
    maxNorthM: northCenter + span / 2,
  };
}

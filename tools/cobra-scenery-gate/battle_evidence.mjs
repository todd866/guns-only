export const COBRA_BATTLE_PROOF_VIEWS = Object.freeze({
  "cockpit-battle": "site.iron-bell-bridge.v1",
  "iron-bell": "site.iron-bell-bridge.v1",
  "plantation-fight": "site.plantation-water-tower.v1",
});

// The first legal volley is authority-correct but visually the weakest possible sample. Hold the
// proof until the battle has established a rhythm while still requiring both factions alive and a
// fresh exact exchange at the photographed objective.
export const COBRA_BATTLE_PROOF_MIN_ELAPSED_S = 3;
// Actual on-screen dash span is the decisive visibility check. A 12 m reciprocal rifle exchange
// can read clearly in a close objective composition and must not be rejected by the retired
// full-authority-line heuristic before its rendered packet is measured.
export const COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M = 12;
export const COBRA_BATTLE_PROOF_SAFE_MARGIN_PX = 60;
export const COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES = 2;
export const COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX = 12;
export const COBRA_BATTLE_PROOF_MAX_RENDER_CALLS = 260;
export const COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES = 500_000;

function finitePoint(event, prefix = "") {
  return ["x_m", "y_m", "z_m"].every((axis) => {
    const value = event?.[`${prefix}${axis}`];
    return value !== null && value !== "" && Number.isFinite(Number(value));
  });
}

/** Validate the authority sidecar written in the same capture pass as the PNGs. */
export function validateCobraBattleEvidence(entries) {
  const failures = [];
  if (!Array.isArray(entries)) {
    return { pass: false, failures: ["views.json is not an array"] };
  }
  for (const [viewName, siteId] of Object.entries(COBRA_BATTLE_PROOF_VIEWS)) {
    const view = entries.find((entry) => entry?.name === viewName);
    if (!view) {
      failures.push(`${viewName}: missing view metadata`);
      continue;
    }
    const evidence = view.battleEvidence;
    if (!evidence) {
      failures.push(`${viewName}: missing battle evidence`);
      continue;
    }
    if (evidence.combatLive !== true)
      failures.push(`${viewName}: combat_live was not true`);
    if (!["engage", "hold"].includes(evidence.missionAct))
      failures.push(`${viewName}: mission act was ${String(evidence.missionAct)}`);
    if (!(Number(evidence.elapsedS) >= COBRA_BATTLE_PROOF_MIN_ELAPSED_S))
      failures.push(`${viewName}: battle proof was captured before the mid-fight window`);
    if (evidence.siteId !== siteId)
      failures.push(`${viewName}: evidence site ${String(evidence.siteId)} != ${siteId}`);
    if (!(Number(evidence.friendlyAlive) >= 1) || !(Number(evidence.hostileAlive) >= 1)) {
      failures.push(
        `${viewName}: both factions were not alive (${evidence.friendlyAlive}/${evidence.hostileAlive})`,
      );
    }
    const packets = Array.isArray(evidence.packets) ? evidence.packets : [];
    const factions = new Set(packets.map((packet) => packet?.event?.faction));
    if (!factions.has("friendly") || !factions.has("hostile")) {
      failures.push(`${viewName}: rendered proof did not contain reciprocal faction fire`);
    }
    for (const packet of packets) {
      const event = packet?.event;
      const rendered = packet?.rendered;
      const packetLabel = `${viewName}/${String(event?.faction ?? "unknown")}`;
      if (event?.kind !== "small-arms" || event?.site_id !== siteId)
        failures.push(`${packetLabel}: no matching small-arms event`);
      if (!Number.isFinite(Number(event?.tick)))
        failures.push(`${packetLabel}: event tick missing`);
      if (!finitePoint(event) || !finitePoint(event, "target_"))
        failures.push(`${packetLabel}: event source/target coordinates missing`);
      else if (Math.hypot(
        Number(event.target_x_m) - Number(event.x_m),
        Number(event.target_y_m) - Number(event.y_m),
        Number(event.target_z_m) - Number(event.z_m),
      ) < COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M) {
        failures.push(`${packetLabel}: exchange was too short to prove crossfire`);
      }
      if (rendered?.siteId !== siteId
        || Number(rendered?.tick) !== Number(event?.tick)
        || rendered?.unitId !== event?.unit_id
        || rendered?.faction !== event?.faction) {
        failures.push(`${packetLabel}: rendered packet did not match its exact authority event`);
      }
      if (!(Number(rendered?.sourceFlash?.opacity) > 0)
        || !(Number(rendered?.tracer?.opacity) > 0)) {
        failures.push(`${packetLabel}: rendered flash/tracer had no visible opacity`);
      }
      if (packet?.screen?.sourceFlashInSafeFrame !== true)
        failures.push(`${packetLabel}: rendered muzzle flash was not inside the safe frame`);
      if (!(Number(packet?.screen?.visibleDashCount)
        >= COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES)) {
        failures.push(`${packetLabel}: too few actual tracer dashes were inside the frame`);
      }
      if (!(Number(packet?.screen?.renderedSpanPx)
        >= COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX)) {
        failures.push(`${packetLabel}: actual tracer packet was too short on screen`);
      }
    }
    const render = evidence.render;
    if (!Number.isFinite(Number(render?.calls))
      || Number(render.calls) > COBRA_BATTLE_PROOF_MAX_RENDER_CALLS) {
      failures.push(`${viewName}: renderer calls exceeded the battle ceiling`);
    }
    if (!Number.isFinite(Number(render?.triangles))
      || Number(render.triangles) > COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES) {
      failures.push(`${viewName}: renderer triangles exceeded the battle ceiling`);
    }
  }
  return Object.freeze({ pass: failures.length === 0, failures: Object.freeze(failures) });
}

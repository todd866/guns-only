import assert from "node:assert/strict";
import test from "node:test";
import {
  COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M,
  COBRA_BATTLE_PROOF_MIN_ELAPSED_S,
  COBRA_BATTLE_PROOF_MAX_RENDER_CALLS,
  COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES,
  COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES,
  COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX,
  validateCobraBattleEvidence,
} from "../battle_evidence.mjs";

function proof(name, siteId) {
  return {
    name,
    battleEvidence: {
      missionAct: "engage",
      combatLive: true,
      elapsedS: COBRA_BATTLE_PROOF_MIN_ELAPSED_S + 0.7,
      siteId,
      friendlyAlive: 3,
      hostileAlive: 4,
      render: {
        calls: COBRA_BATTLE_PROOF_MAX_RENDER_CALLS - 10,
        triangles: COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES - 10_000,
      },
      packets: ["friendly", "hostile"].map((faction, index) => {
        const unitId = `${faction}.rifle`;
        const event = {
          tick: 52 + index,
          kind: "small-arms",
          unit_id: unitId,
          site_id: siteId,
          faction,
          x_m: 1 + index * 80,
          y_m: 2,
          z_m: 3,
          target_x_m: 1 + index * 80 + COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M + 4,
          target_y_m: 5,
          target_z_m: 6,
        };
        return {
          event,
          rendered: {
            siteId,
            tick: event.tick,
            unitId,
            faction,
            sourceFlash: { x_m: event.x_m, y_m: event.y_m, z_m: event.z_m, opacity: 0.8 },
            tracer: { opacity: 0.7, segments: [{}, {}, {}] },
          },
          screen: {
            sourceFlashInSafeFrame: true,
            visibleDashCount: COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES + 1,
            renderedSpanPx: COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX + 8,
          },
        };
      }),
    },
  };
}

function validProof() {
  return [
    proof("cockpit-battle", "site.iron-bell-bridge.v1"),
    proof("iron-bell", "site.iron-bell-bridge.v1"),
    proof("plantation-fight", "site.plantation-water-tower.v1"),
  ];
}

test("battle evidence requires real authority at both photographed objectives", () => {
  assert.deepEqual(validateCobraBattleEvidence(validProof()), {
    pass: true,
    failures: [],
  });
});

test("battle evidence rejects an empty, stale, or coordinate-free battle claim", () => {
  const entries = validProof();
  entries[0].battleEvidence.friendlyAlive = 0;
  entries[0].battleEvidence.packets[0].event.target_x_m = null;
  entries[1].battleEvidence.combatLive = false;
  entries[1].battleEvidence.elapsedS = COBRA_BATTLE_PROOF_MIN_ELAPSED_S - 0.1;
  const shortEvent = entries[1].battleEvidence.packets[0].event;
  shortEvent.target_x_m = shortEvent.x_m + 1;
  shortEvent.target_y_m = shortEvent.y_m;
  shortEvent.target_z_m = shortEvent.z_m;
  entries[2].battleEvidence.packets[0].screen.sourceFlashInSafeFrame = false;
  entries[2].battleEvidence.packets[0].screen.visibleDashCount =
    COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES - 1;
  entries[2].battleEvidence.packets[0].screen.renderedSpanPx =
    COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX - 1;
  entries[2].battleEvidence.packets = entries[2].battleEvidence.packets
    .filter((packet) => packet.event.faction === "friendly");
  entries[2].battleEvidence.render.calls = COBRA_BATTLE_PROOF_MAX_RENDER_CALLS + 1;
  entries[2].battleEvidence.render.triangles = COBRA_BATTLE_PROOF_MAX_RENDER_TRIANGLES + 1;
  const result = validateCobraBattleEvidence(entries);
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /both factions were not alive/);
  assert.match(result.failures.join("\n"), /source\/target coordinates missing/);
  assert.match(result.failures.join("\n"), /combat_live was not true/);
  assert.match(result.failures.join("\n"), /before the mid-fight window/);
  assert.match(result.failures.join("\n"), /too short to prove crossfire/);
  assert.match(result.failures.join("\n"), /reciprocal faction fire/);
  assert.match(result.failures.join("\n"), /muzzle flash was not inside the safe frame/);
  assert.match(result.failures.join("\n"), /too few actual tracer dashes/);
  assert.match(result.failures.join("\n"), /actual tracer packet was too short/);
  assert.match(result.failures.join("\n"), /renderer calls exceeded/);
  assert.match(result.failures.join("\n"), /renderer triangles exceeded/);
});

test("battle evidence rejects missing view metadata", () => {
  const result = validateCobraBattleEvidence([]);
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /cockpit-battle: missing/);
  assert.match(result.failures.join("\n"), /iron-bell: missing/);
  assert.match(result.failures.join("\n"), /plantation-fight: missing/);
});

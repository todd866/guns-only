import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; the contract scan reads both so a field is found wherever it now lives.
const readBridgeContract = () =>
  Promise.all([readFile(bridgeUrl, "utf8"), readFile(projectionUrl, "utf8")])
    .then((parts) => parts.join("\n"));
const sessionUrl = new URL("../../../../../sim/SimulationSession.cs", import.meta.url);
const beatsUrl = new URL("../../../../../sim/Doctrine/Beats.cs", import.meta.url);
const appUrl = new URL("../../../app.js", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);

const [bridgeSource, sessionSource, beatsSource, appSource, hudSource] = await Promise.all([
  readBridgeContract(),
  readFile(sessionUrl, "utf8"),
  readFile(beatsUrl, "utf8"),
  readFile(appUrl, "utf8"),
  readFile(hudUrl, "utf8"),
]);

test("mission seven alone opts into continuous successor merges", () => {
  assert.match(beatsSource,
    /ModernVisualMerge\(\)[\s\S]*?ContinuousCombat: new ContinuousCombatConfig\(\)/);
  assert.match(sessionSource, /CreateForStagedNextTarget\(\)/,
    "successor targets must retain the player's finite magazine");
  assert.match(sessionSource, /CreateForFreshShooterAgainstSameTarget/,
    "a fresh opponent must not repair existing ownship damage");
  assert.match(sessionSource, /DetachedOpponentWrecks/,
    "successor staging must not erase terminal wreck physics");
});

test("authoritative state and events expose every replacement edge", () => {
  for (const field of [
    "continuous_combat",
    "engagement_number",
    "opponent_replacement_pending",
    "opponent_replacement_s",
  ]) {
    assert.match(bridgeSource, new RegExp(`\\\\\"${field}\\\\\"`),
      `${field} must be present in the browser snapshot contract`);
  }
  assert.match(bridgeSource,
    /SessionEventType\.OpponentSpawned => "OPPONENT_SPAWNED"/);
  assert.match(bridgeSource, /\\"entity_id\\"/);
  assert.match(bridgeSource, /\\"position\\"/);
  assert.match(bridgeSource, /\\"velocity\\"/);
  assert.doesNotMatch(bridgeSource, /detached_opponent_wrecks/,
    "moving wreck tracks stay event-sourced instead of bloating every 20 Hz snapshot");
  assert.match(appSource,
    /updateBanditDestruction\(true, nowSeconds, true, position\)/,
    "a detached wreck impact must use its recorded event position, not the live target slot");
});

test("mission brief and splash cue explain the continuous resource problem", () => {
  assert.match(appSource,
    /Continuous visual merges[\s\S]*?480 rounds across all fights/);
  assert.match(appSource,
    /Fuel, ammunition, ownship damage, and kill count persist/);
  assert.match(hudSource,
    /opponent_replacement_pending[\s\S]*?engagement_number[\s\S]*?\+ 1[\s\S]*?BANDIT \$\{nextEngagement\} IN/);
});

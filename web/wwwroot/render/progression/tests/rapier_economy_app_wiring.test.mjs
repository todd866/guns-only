import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../../../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("only the explicit Rapier economy contract reaches persistent campaign balance", async () => {
  const [app, projection] = await Promise.all([
    source("app.js"),
    readFile(new URL("../../../../SnapshotProjection.cs", import.meta.url), "utf8"),
  ]);

  assert.match(app,
    /ledgerIsEconomicMission = state\?\.rapier_economy_active === true/);
  assert.match(app,
    /ledgerHasStableKey[\s\S]*?\^\[a-f0-9\]\{64\}\$/);
  assert.match(app,
    /applyRapierSortieCredits\([\s\S]*?ledgerApplyKey,[\s\S]*?ledgerNet/);
  assert.match(projection,
    /rapier_economy_application_key[\s\S]*?serviceLife\?\.RecordSha256/);
  assert.doesNotMatch(app, /ledgerMission\.includes\("rapier"\)/,
    "airframe-name inference would wrongly charge Circuits");
});

test("Rapier economics stay in the briefing and debrief instead of the flight HUD", async () => {
  const [hud, app, debrief] = await Promise.all([
    source("hud.js"),
    source("app.js"),
    source("render/debrief/points_ledger.js"),
  ]);

  assert.doesNotMatch(hud, /rapier_economy_/);
  assert.match(app, /Rapier budget posted|rapierEconomyPresentation/);
  assert.match(debrief, /Rapier balance/);
});

test("the transport contract owns a distinct capability and compatibility silhouette", async () => {
  const [beats, scene, app] = await Promise.all([
    readFile(new URL("../../../../../sim/Doctrine/Beats.cs", import.meta.url), "utf8"),
    source("render/scene/scene_builders.js"),
    source("app.js"),
  ]);

  assert.match(beats, /TransportTargetPrototype[\s\S]*?transport-target\.prototype/);
  assert.match(scene, /export function createTransport\(/);
  assert.match(app,
    /\["presentation\.vehicle\.transport-target\.prototype\.v1", createTransport\]/);
});

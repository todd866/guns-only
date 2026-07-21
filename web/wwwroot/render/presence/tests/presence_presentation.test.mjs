import test from "node:test";
import assert from "node:assert/strict";
import {
  presenceStatusPresentation,
  presenceTelemetryContext,
  projectRemoteContact,
  remoteContactVisible,
  snapshotForTerrainFrame,
  shouldResetRemoteInterpolation,
} from "../presence_presentation.js";

test("combat loss does not erase a body while terminal physics is still integrating", () => {
  const fallingWreck = projectRemoteContact({
    playerId: "pilot-2",
    entityId: "entity.player.7",
    missionId: "mission.perch-attack.v1",
    phase: "ACTIVE",
    alive: false,
    bodyPresent: true,
    terminalState: "DESTROYED_AIRBORNE",
    impactSurface: "WATER",
  });
  assert.equal(fallingWreck.alive, false);
  assert.equal(fallingWreck.bodyPresent, true);
  assert.equal(fallingWreck.impactSurface, "WATER");
  assert.equal(remoteContactVisible(fallingWreck), true);

  const settled = projectRemoteContact({
    playerId: "pilot-2",
    entityId: "entity.player.7",
    alive: false,
    bodyPresent: false,
    terminalState: "SETTLED",
  });
  assert.equal(remoteContactVisible(settled), false);
});

test("historical replay suppresses live room traffic without changing physical presence", () => {
  const contact = projectRemoteContact({ playerId: "pilot-2", alive: true });
  assert.equal(remoteContactVisible(contact), true);
  assert.equal(remoteContactVisible(contact, { historicalReplay: true }), false);
  assert.equal(contact.bodyPresent, true);
});

test("a per-sortie entity change resets interpolation even within the same mission", () => {
  const first = projectRemoteContact({
    playerId: "pilot-2", entityId: "entity.player.7", missionId: "mission.test",
  });
  const restarted = projectRemoteContact({
    playerId: "pilot-2", entityId: "entity.player.8", missionId: "mission.test",
  });
  assert.equal(shouldResetRemoteInterpolation(first.continuityKey, restarted), true);
  assert.equal(shouldResetRemoteInterpolation(restarted.continuityKey, restarted), false);
});

test("a new server pose stream resets interpolation even when sequence restarts", () => {
  const beforeReload = projectRemoteContact({
    playerId: "pilot-2", streamId: "stream-old", entityId: "entity.player.7",
  });
  const afterReload = projectRemoteContact({
    playerId: "pilot-2", streamId: "stream-new", entityId: "entity.player.7",
  });
  assert.equal(beforeReload.streamId, "stream-old");
  assert.equal(shouldResetRemoteInterpolation(beforeReload.continuityKey, afterReload), true);
});

test("remote contacts retain a bounded pack presentation binding", () => {
  const pilot = projectRemoteContact({
    playerId: "pilot-2",
    presentationId: "  presentation.vehicle.player.v1\u0000ROOT  ",
  });
  const bogey = projectRemoteContact({ bogeyId: "bogey-2" });
  assert.equal(pilot.presentationId, "presentation.vehicle.player.v1ROOT");
  assert.equal(bogey.presentationId, "presentation.vehicle.bandit.v1");
});

test("untrusted lifecycle labels fall back to bounded teaching states", () => {
  const contact = projectRemoteContact({
    playerId: "pilot-2", alive: false, bodyPresent: true,
    phase: "ROOT", terminalState: "TELEPORTED",
  });
  assert.equal(contact.phase, "ACTIVE");
  assert.equal(contact.terminalState, "DESTROYED_AIRBORNE");
  assert.equal(contact.impactSurface, "NONE");
});

test("legacy peers use mission identity for discontinuity and alive for body presence", () => {
  const first = projectRemoteContact({
    playerId: "pilot-2", missionId: "mission.one", alive: true,
  });
  const next = projectRemoteContact({
    playerId: "pilot-2", missionId: "mission.two", alive: false,
  });
  assert.equal(shouldResetRemoteInterpolation(first.continuityKey, next), true);
  assert.equal(next.bodyPresent, false);
});

test("shared Korea terrain shows only contacts which use the same global substrate", () => {
  const snapshot = {
    players: [
      { playerId: "inland", missionId: "mission.perch-attack.v1" },
      { playerId: "boat", missionId: "mission.carrier-qualification.v1" },
      { playerId: "maintenance", missionId: "mission.f86f.degraded-gear-recovery.v1" },
    ],
    bogeys: [{ bogeyId: "world-bogey" }],
  };
  const framed = snapshotForTerrainFrame(snapshot, {
    multiplayer_terrain_shared: true,
    world_frame_id: "world.korea-central-front.v1",
  });
  assert.deepEqual(framed.players.map((player) => player.playerId), ["inland"]);
  assert.equal(framed.bogeys.length, 1);
  assert.equal(snapshot.players.length, 3, "projection must not mutate the room snapshot");
});

test("local carrier training cannot display shared-world aircraft over its instanced terrain", () => {
  const snapshot = {
    players: [{ playerId: "inland", missionId: "mission.perch-attack.v1" }],
    bogeys: [{ bogeyId: "world-bogey" }],
  };
  const framed = snapshotForTerrainFrame(snapshot, {
    multiplayer_terrain_shared: false,
    world_frame_id: "local.carrier-training.v1",
  });
  assert.deepEqual(framed.players, []);
  assert.deepEqual(framed.bogeys, []);
});

test("room status visibly teaches the browser callsign and assigned world origin", () => {
  const presentation = presenceStatusPresentation({
    phase: "online",
    callsign: "PILOT-0042",
    connected: 2,
    bogeys: 6,
    spawnOrigin: [40_000, 0, -40_000],
  });
  assert.equal(presentation.text, "PILOT-0042 · GLOBAL · 2 PILOTS · 6 BOGEYS");
  assert.match(presentation.title, /browser's local pilot identity/);
  assert.match(presentation.title, /40000 \/ 0 \/ -40000 m/);
});

test("telemetry context is bounded and excludes the reusable browser credential", () => {
  const context = presenceTelemetryContext({
    phase: "online",
    playerId: "pilot-uuid",
    pilotKey: "browser-secret-that-must-not-be-recorded",
    callsign: "PILOT-0042",
    worldEpoch: "world-test",
    spawnOrigin: [40_000.4, 0, -39_999.6],
    connected: 2,
    bogeys: 6,
  });
  assert.deepEqual(context.spawnOrigin, [40_000, 0, -40_000]);
  assert.equal(context.playerId, "pilot-uuid");
  assert.equal("pilotKey" in context, false);
});

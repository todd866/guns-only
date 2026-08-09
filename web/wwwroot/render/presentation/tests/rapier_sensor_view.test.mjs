import assert from "node:assert/strict";
import test from "node:test";
import {
  RAPIER_PLAYER_PRESENTATION_ID,
  resolveRapierCockpitCameraAnchor,
} from "../rapier_sensor_view.js";
import { createRapier } from "../../scene/scene_builders.js";

test("Rapier live flight prefers an authored camera.cockpit semantic anchor", () => {
  const authored = { name: "AUTHORED_RAPIER_EYE" };
  const procedural = { name: "SOCKET_CAMERA_COCKPIT" };
  const slot = { object: { userData: { sockets: { cockpitCamera: procedural } } } };
  const calls = [];

  const resolved = resolveRapierCockpitCameraAnchor({
    playerPresentationId: RAPIER_PLAYER_PRESENTATION_ID,
    playerExteriorSlot: slot,
    semanticAnchor(candidate, semanticId) {
      calls.push([candidate, semanticId]);
      return authored;
    },
  });

  assert.equal(resolved, authored);
  assert.deepEqual(calls, [[slot, "camera.cockpit"]]);
});

test("Rapier procedural fallback exposes its canonical buried-capsule camera socket", () => {
  const procedural = { name: "SOCKET_CAMERA_COCKPIT" };
  const slot = { object: { userData: { sockets: { cockpitCamera: procedural } } } };

  const resolved = resolveRapierCockpitCameraAnchor({
    playerPresentationId: RAPIER_PLAYER_PRESENTATION_ID,
    playerExteriorSlot: slot,
    semanticAnchor: () => null,
  });

  assert.equal(resolved, procedural);
});

test("production Rapier v2 resolves the buried-capsule datum instead of the generic forward eye", () => {
  const rapier = createRapier();
  const resolved = resolveRapierCockpitCameraAnchor({
    playerPresentationId: RAPIER_PLAYER_PRESENTATION_ID,
    playerExteriorSlot: { object: rapier },
    semanticAnchor: () => null,
  });

  assert.equal(resolved?.name, "SOCKET_CAMERA_COCKPIT");
  assert.ok(Math.abs(resolved.position.x) < 1e-12);
  assert.ok(Math.abs(resolved.position.y - 0.21) < 1e-12);
  assert.ok(Math.abs(resolved.position.z + 1.8) < 1e-12);
});

test("non-Rapier aircraft retain the existing compatibility camera behavior", () => {
  let queried = false;
  const resolved = resolveRapierCockpitCameraAnchor({
    playerPresentationId: "presentation.vehicle.f22a.public-data-surrogate.v1",
    playerExteriorSlot: {
      object: { userData: { sockets: { cockpitCamera: { name: "WRONG_EYE" } } } },
    },
    semanticAnchor: () => {
      queried = true;
      return { name: "WRONG_AUTHORED_EYE" };
    },
  });

  assert.equal(resolved, null);
  assert.equal(queried, false);
});

test("Rapier falls back safely when neither authored nor procedural camera data exists", () => {
  assert.equal(resolveRapierCockpitCameraAnchor({
    playerPresentationId: RAPIER_PLAYER_PRESENTATION_ID,
    playerExteriorSlot: { object: { userData: {} } },
    semanticAnchor: () => null,
  }), null);
});

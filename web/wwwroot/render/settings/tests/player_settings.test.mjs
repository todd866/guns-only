import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_BINDINGS,
  controlCodeLabel,
  keyboardMapForSettings,
  normalisePlayerSettings,
  rebindControl,
  resetControlBindings,
} from "../player_settings.js";

test("settings normalisation is bounded and produces one unique key per action", () => {
  const settings = normalisePlayerSettings({
    tiltSensitivity: 99,
    bindings: { pull: "KeyZ", push: "KeyZ", fire: "Escape" },
  });
  assert.equal(settings.tiltSensitivity, 1.6);
  assert.equal(settings.bindings.pull, "KeyZ");
  assert.equal(settings.bindings.push, "ArrowUp");
  assert.equal(settings.bindings.fire, "KeyF");
  assert.equal(new Set(Object.values(settings.bindings)).size, CONTROL_BINDINGS.length);
});

test("rebinding swaps an occupied key instead of creating an ambiguous control", () => {
  const original = normalisePlayerSettings();
  const rebound = rebindControl(original, "fire", "KeyV");
  assert.equal(rebound.bindings.fire, "KeyV");
  assert.equal(rebound.bindings.padlock, "KeyF");
  assert.equal(keyboardMapForSettings(rebound).get("KeyV"), 8);
  assert.equal(keyboardMapForSettings(rebound).get("KeyF"), 9);
  assert.equal(rebindControl(rebound, "fire", "Escape"), null);
  assert.equal(rebindControl(rebound, "gearToggle", "KeyC"), null,
    "fixed UI shortcuts cannot be accepted as unreachable flight bindings");

  const gearOnSpace = rebindControl(original, "gearToggle", "Space");
  assert.equal(gearOnSpace.bindings.gearToggle, "Space");
  assert.equal(gearOnSpace.bindings.limitOverride, "KeyG");
  assert.equal(keyboardMapForSettings(gearOnSpace).get("Space"), 13);
});

test("binding reset and labels preserve the ordinary flight-control vocabulary", () => {
  const rebound = rebindControl(normalisePlayerSettings(), "pull", "KeyP");
  const reset = resetControlBindings(rebound);
  assert.equal(reset.bindings.pull, "ArrowDown");
  assert.equal(controlCodeLabel("ArrowDown"), "↓");
  assert.equal(controlCodeLabel("KeyW"), "W");
});

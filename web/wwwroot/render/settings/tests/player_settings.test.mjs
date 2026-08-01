import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_BINDINGS,
  controlCodeLabel,
  keyboardMapForSettings,
  loadPlayerSettings,
  normalisePlayerSettings,
  rebindControl,
  resetControlBindings,
} from "../player_settings.js";

const storageWith = (value) => ({
  getItem: () => value === undefined ? null : JSON.stringify(value),
});

test("settings normalisation is bounded and produces one unique key per action", () => {
  const settings = normalisePlayerSettings({
    tiltSensitivity: 99,
    radioVoice: false,
    radioCaptions: true,
    bindings: { pull: "KeyZ", push: "KeyZ", fire: "Escape" },
  });
  assert.equal(settings.tiltSensitivity, 1.6);
  assert.equal(settings.radioVoice, false);
  assert.equal(settings.radioCaptions, true);
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
  const rebound = rebindControl(
    rebindControl(normalisePlayerSettings(), "pull", "KeyP"),
    "knockItOff",
    "KeyL",
  );
  const reset = resetControlBindings(rebound);
  assert.equal(reset.bindings.pull, "ArrowDown");
  assert.equal(reset.bindings.knockItOff, "KeyO");
  assert.equal(keyboardMapForSettings(reset).get("KeyO"), 10);
  assert.equal(keyboardMapForSettings(reset).get("KeyK"), 20,
    "Knock It Off must never displace the Auto-GCAS paddle");
  assert.equal(controlCodeLabel("ArrowDown"), "↓");
  assert.equal(controlCodeLabel("KeyW"), "W");
});

test("Knock It Off is remappable without creating a second action on O", () => {
  const original = normalisePlayerSettings();
  const rebound = rebindControl(original, "knockItOff", "KeyF");

  assert.equal(rebound.bindings.knockItOff, "KeyF");
  assert.equal(rebound.bindings.fire, "KeyO");
  assert.equal(keyboardMapForSettings(rebound).get("KeyF"), 10);
  assert.equal(keyboardMapForSettings(rebound).get("KeyO"), 8);
  assert.equal(new Set(Object.values(rebound.bindings)).size, CONTROL_BINDINGS.length);
});

test("first visit inherits reduced motion while an explicit saved choice always wins", () => {
  const reduce = () => ({ matches: true });
  const noReduce = () => ({ matches: false });

  assert.equal(loadPlayerSettings(storageWith(undefined), reduce).reducedMotion, true);
  assert.equal(loadPlayerSettings(storageWith({ audio: false }), reduce).reducedMotion, true,
    "legacy settings without a motion choice should inherit the current OS preference");
  assert.equal(loadPlayerSettings(storageWith({ reducedMotion: false }), reduce).reducedMotion,
    false, "an explicit opt-out must not be overwritten by the OS default");
  assert.equal(loadPlayerSettings(storageWith({ reducedMotion: true }), noReduce).reducedMotion,
    true, "an explicit opt-in must remain durable when the OS default differs");
});

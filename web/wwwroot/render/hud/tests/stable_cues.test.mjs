import test from "node:test";
import assert from "node:assert/strict";
import { AoAIndexerQualifier, DisplayCueQualifier } from "../stable_cues.js";

test("AoA indexer ignores noisy threshold crossings until a qualified state persists", () => {
  const qualifier = new AoAIndexerQualifier({ acquireSeconds: 0.25 });
  assert.equal(qualifier.update({ aoa: 6.8, onSpeed: 6.8, tolerance: 0.9 }, 0.02), "ON_SPEED");

  for (let index = 0; index < 20; index += 1) {
    const aoa = index % 2 === 0 ? 5.70 : 5.86;
    assert.equal(qualifier.update({ aoa, onSpeed: 6.8, tolerance: 0.9 }, 0.02), "ON_SPEED");
  }
  for (let index = 0; index < 13; index += 1) {
    qualifier.update({ aoa: 5.4, onSpeed: 6.8, tolerance: 0.9 }, 0.02);
  }
  assert.equal(qualifier.state, "FAST");

  for (let index = 0; index < 20; index += 1) {
    const aoa = index % 2 === 0 ? 5.95 : 6.02;
    qualifier.update({ aoa, onSpeed: 6.8, tolerance: 0.9 }, 0.02);
  }
  assert.equal(qualifier.state, "FAST", "exit hysteresis prevents a boundary chatter pulse");
});

test("LSO-style display qualifier persists ordinary calls but escalates an urgent waveoff immediately", () => {
  const qualifier = new DisplayCueQualifier({ acquireSeconds: 0.25, releaseSeconds: 0.35 });
  const ball = { key: "ON THE BALL", call: "ON THE BALL" };
  const power = { key: "POWER", call: "POWER" };
  const waveoff = { key: "WAVE OFF", call: "WAVE OFF" };
  assert.equal(qualifier.update(ball, 0.02)?.call, "ON THE BALL");

  for (let index = 0; index < 20; index += 1) {
    const noisy = index % 2 === 0 ? power : ball;
    assert.equal(qualifier.update(noisy, 0.02)?.call, "ON THE BALL");
  }
  for (let index = 0; index < 13; index += 1) qualifier.update(power, 0.02);
  assert.equal(qualifier.current?.call, "POWER");
  for (let index = 0; index < 10; index += 1) qualifier.update(null, 0.02);
  assert.equal(qualifier.current?.call, "POWER", "brief call dropout does not blink the footer");
  assert.equal(qualifier.update(waveoff, 0.001, { urgent: true })?.call, "WAVE OFF");
});

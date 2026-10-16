import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHud } from "../../../hud.js";
import { systemsReadout } from "../hud_readouts.js";
import { gunFunnelEnvelope, gunFunnelProfile } from "../gun_funnel.js";

// PathfinderTests verifies these fixtures against the actual simulation projection on every
// dotnet run, including t+3 and the first 900 m crossing. They are not invented HUD inputs.
const fixture = async name => JSON.parse(await readFile(new URL(`fixtures/${name}.json`, import.meta.url), "utf8"));
const [start, threeSeconds, firstWindow] = await Promise.all([
  fixture("pathfinder_start"), fixture("pathfinder_three_seconds"), fixture("pathfinder_first_window"),
]);

function footerCalls(state) {
  const calls = [];
  const canvas = { getContext: () => ({ measureText: text => ({ width: text.length * 6 }) }) };
  const originalDocument = globalThis.document;
  try {
    globalThis.document = { createElement: () => canvas };
    const hud = createHud(canvas);
    hud.glassPanel = () => {};
    hud.fillEssentialHudText = text => calls.push(text);
    hud.drawFooter({ state, dt: 1 });
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
  return calls;
}

test("live First Light snapshots at spawn and t+3 produce no landing or inlet alerts", () => {
  for (const state of [start, threeSeconds]) {
    assert.ok(state.pathfinder);
    assert.equal(state.wave_off, false);
    assert.notEqual(state.mode, "WAVE-OFF");
    assert.deepEqual(footerCalls(state), []);
    assert.ok(state.rapier_inlet_recovery >= 0.9);
    assert.deepEqual(systemsReadout(state).warnings.filter(warning => warning.text.startsWith("INLET")), []);
  }
});

test("actual recovery and low inlet recovery still warn, including later in Pathfinders", () => {
  for (const pathfinder of [undefined, start.pathfinder]) {
    const waveOff = { ...start, pathfinder, mode: "WAVE-OFF", wave_off: true,
      lso: "WAVE OFF, WAVE OFF", lso_severity: "WAVEOFF" };
    assert.deepEqual(footerCalls(waveOff), ["WAVE OFF"]);
    for (const [recovery, expected] of [[0.89, "INLET RECOVERY LOW"], [0.64, "INLET DISTORTION"]]) {
      const warnings = systemsReadout({ ...start, pathfinder, rapier_inlet_recovery: recovery }).warnings;
      assert.ok(warnings.some(warning => warning.text === expected));
    }
  }
});

test("the live first-window crossing reaches the HUD gun envelope near 15 seconds after spawn", () => {
  const envelope = gunFunnelEnvelope(gunFunnelProfile(firstWindow));
  assert.ok(firstWindow.sample_seconds >= 14 && firstWindow.sample_seconds <= 20);
  assert.ok(firstWindow.range_m <= envelope.farRangeM);
  assert.ok(firstWindow.range_m >= envelope.nearRangeM);
  assert.ok(start.range_m > envelope.farRangeM);
  assert.ok(threeSeconds.range_m > firstWindow.range_m);
  assert.equal(start.pathfinder.selected_id, firstWindow.pathfinder.selected_id);
  const [first, second, third] = start.pathfinder.relays;
  for (const gap of [second.position.x - first.position.x, third.position.x - second.position.x]) {
    assert.ok(Math.abs(gap) >= 25000 && Math.abs(gap) <= 35000);
  }
});

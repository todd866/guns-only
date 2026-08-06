import test from "node:test";
import assert from "node:assert/strict";

import { createBootWatchdog, resourceProgressCounter } from "../boot_watchdog.js";

function harness(overrides = {}) {
  let clock = 0;
  let bytes = 0;
  let hidden = false;
  const states = [];
  const watchdog = createBootWatchdog({
    now: () => clock,
    progress: () => bytes,
    isHidden: () => hidden,
    onState: (snapshot) => states.push(snapshot),
    ...overrides,
  });
  return {
    watchdog,
    states,
    advance(ms, { addBytes = 0 } = {}) {
      const steps = Math.max(1, Math.round(ms / 500));
      for (let i = 0; i < steps; i += 1) {
        clock += ms / steps;
        bytes += addBytes / steps;
        watchdog.tick();
      }
    },
    hide() { hidden = true; },
    show() { hidden = false; },
  };
}

test("a slow but progressing boot is called slow and never stalled", () => {
  // The Threads session that took 18-25 seconds and DID reach ready. Declaring that one broken
  // would throw away a working player.
  const rig = harness();
  rig.watchdog.mark("script_load");
  rig.advance(24_000, { addBytes: 8_000_000 });
  assert.equal(rig.watchdog.state, "slow");
  assert.deepEqual(rig.states.map((s) => s.state), ["slow"]);
  rig.watchdog.mark("bridge_ready");
  rig.watchdog.mark("webgl_ok");
  rig.watchdog.mark("ready");
  assert.equal(rig.watchdog.state, "ready");
});

test("a boot with no milestone and no bytes is called stalled", () => {
  const rig = harness();
  rig.watchdog.mark("script_load");
  rig.advance(24_000);
  assert.equal(rig.watchdog.state, "stalled");
  assert.deepEqual(rig.states.map((s) => s.state), ["slow", "stalled"],
    "the player is told it is slow before being told it is stuck");
  const stalled = rig.states.at(-1);
  assert.equal(stalled.milestone, "script_load",
    "the stall verdict must carry the milestone it died on, which is what telemetry buckets by");
  assert.ok(stalled.since_progress_ms >= 12_000);
});

test("a stall is never declared before the slow threshold", () => {
  const rig = harness({ slowMs: 9_000, stallMs: 2_000 });
  rig.watchdog.mark("script_load");
  rig.advance(5_000);
  assert.equal(rig.watchdog.state, "booting",
    "a short stallMs must not let a five-second boot be condemned");
});

test("time spent hidden does not count against the boot", () => {
  // A webview backgrounded because the player answered a message suspends its timers. Counting
  // that as a stall would accuse every distracted player on iOS.
  const rig = harness();
  rig.watchdog.mark("script_load");
  rig.advance(4_000, { addBytes: 500_000 });
  rig.hide();
  rig.advance(120_000);
  rig.show();
  rig.advance(1_000, { addBytes: 500_000 });
  assert.equal(rig.watchdog.state, "booting");
  assert.ok(rig.watchdog.snapshot().active_ms < 9_000);
});

test("progress arriving after a stall verdict demotes it back to slow", () => {
  const rig = harness();
  rig.watchdog.mark("script_load");
  rig.advance(24_000);
  assert.equal(rig.watchdog.state, "stalled");
  rig.advance(2_000, { addBytes: 2_000_000 });
  assert.equal(rig.watchdog.state, "slow", "a boot that resumes must stop being accused");
});

test("a boot that dribbles forever still hits the hard backstop", () => {
  const rig = harness({ hardMs: 40_000 });
  rig.watchdog.mark("script_load");
  rig.advance(50_000, { addBytes: 50_000 });
  assert.equal(rig.watchdog.state, "stalled");
});

test("reaching ready stops the watchdog for good", () => {
  const rig = harness();
  rig.watchdog.mark("script_load");
  rig.watchdog.mark("bridge_ready");
  rig.watchdog.mark("webgl_ok");
  rig.watchdog.mark("ready");
  rig.advance(120_000);
  assert.equal(rig.watchdog.state, "ready");
  assert.deepEqual(rig.states.map((s) => s.state), ["ready"]);
});

test("the progress counter survives cross-origin entries with no transferSize", () => {
  const counter = resourceProgressCounter({
    getEntriesByType: () => [{ transferSize: 0 }, { transferSize: 0 }],
  });
  assert.ok(counter() > 0, "opaque responses must still register as bytes arriving");
  assert.equal(resourceProgressCounter({})(), 0);
});

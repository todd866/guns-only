import assert from "node:assert/strict";
import test from "node:test";

import { createSharedFlightAudioFacade } from "../flight_audio_singleton.js";

test("cache-busted and canonical flight-audio imports share one controller", () => {
  const calls = [];
  const owner = {
    arm: (state) => calls.push(["arm", state]) && "armed",
    setEnabled: (enabled) => calls.push(["enabled", enabled]) && enabled,
    isEnabled: () => true,
    diagnostics: () => ({ controller: "owner" }),
    suspend: (reason) => calls.push(["suspend", reason]) && "suspended",
    update: (state, options) => calls.push(["update", state, options]) && "updated",
  };
  const duplicate = {
    arm: () => assert.fail("duplicate controller must not allocate or resume its own graph"),
    setEnabled: () => assert.fail("duplicate controller must not own mute state"),
    isEnabled: () => false,
    diagnostics: () => assert.fail("duplicate controller must not report graph state"),
    suspend: () => assert.fail("duplicate controller must not suspend its own graph"),
    update: () => assert.fail("duplicate controller must not drive a second graph"),
  };

  const canonicalFacade = createSharedFlightAudioFacade(
    owner,
    "https://example.test/render/audio/flight_audio.js",
  );
  const cacheBustedFacade = createSharedFlightAudioFacade(
    duplicate,
    "https://example.test/render/audio/flight_audio.js?v=176",
  );
  const state = { engine_rpm_pct: 91 };
  const options = { muted: false };

  assert.equal(cacheBustedFacade.arm(state), "armed");
  assert.equal(cacheBustedFacade.setEnabled(true), true);
  assert.equal(cacheBustedFacade.isEnabled(), true);
  assert.equal(cacheBustedFacade.suspend("qa-complete"), "suspended");
  assert.equal(cacheBustedFacade.update(state, options), "updated");
  assert.deepEqual(calls, [
    ["arm", state],
    ["enabled", true],
    ["suspend", "qa-complete"],
    ["update", state, options],
  ]);
  assert.equal(canonicalFacade.isEnabled(), true);
  assert.deepEqual(cacheBustedFacade.diagnostics(), { controller: "owner" });
});

test("non-release module queries remain isolated for deterministic harnesses", () => {
  const first = createSharedFlightAudioFacade({
    arm: () => "first",
    setEnabled: (enabled) => enabled,
    isEnabled: () => true,
    diagnostics: () => ({ controller: "first" }),
    suspend: () => "first",
    update: () => "first",
  }, "https://example.test/render/audio/flight_audio.js?test=first");
  const second = createSharedFlightAudioFacade({
    arm: () => "second",
    setEnabled: (enabled) => enabled,
    isEnabled: () => false,
    diagnostics: () => ({ controller: "second" }),
    suspend: () => "second",
    update: () => "second",
  }, "https://example.test/render/audio/flight_audio.js?test=second");

  assert.equal(first.arm(), "first");
  assert.equal(second.arm(), "second");
  assert.equal(first.isEnabled(), true);
  assert.equal(second.isEnabled(), false);
});

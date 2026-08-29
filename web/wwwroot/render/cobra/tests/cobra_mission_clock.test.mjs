import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cobraConquestScoreLine,
  cobraMissionCountdown,
} from "../cobra_objective_copy.js";
import { cobraTacticalMapModel } from "../cobra_tactical_map.js";

const source = (url) => readFile(new URL(url, import.meta.url), "utf8");

function clockedMap(overrides = {}) {
  return cobraTacticalMapModel({
    sites: [
      { id: "friendly", label: "Friendly", owner: "friendly", x_m: 100, z_m: 100 },
      { id: "hostile", label: "Hostile", owner: "hostile", x_m: 900, z_m: 900 },
    ],
    tickets: { friendly: 280, hostile: 190 },
    timeLimitSeconds: 600,
    timeRemainingSeconds: 554.2,
    outcome: "pending",
    bounds: { minEastM: 0, maxEastM: 1_000, minNorthM: 0, maxNorthM: 1_000 },
    widthPx: 200,
    heightPx: 154,
    showUnits: false,
    ...overrides,
  });
}

test("the tactical model preserves the real authority clock beside the conquest score", () => {
  const model = clockedMap();
  assert.equal(model.time_limit_s, 600);
  assert.equal(model.time_remaining_s, 554.2);
  assert.equal(model.outcome, "pending");
  assert.equal(cobraConquestScoreLine(model),
    "PTS 1–1 · TKT 280–190 · STALEMATE");
  // 554.2 seconds rounds upward while counting down: the crew still has all of second 9:15.
  assert.equal(cobraMissionCountdown(model), "T−9:15");

  const staged = clockedMap({ combatLive: false, timeRemainingSeconds: 600 });
  assert.equal(cobraConquestScoreLine(staged),
    "PTS 1–1 · TKT 280–190 · STAGED");
  assert.equal(cobraMissionCountdown(staged), "T−10:00",
    "the brief/ingress board must show the full clock before contact starts it");
});

test("the clock clamps malformed values and becomes FINAL after the strategic verdict", () => {
  assert.equal(cobraMissionCountdown(clockedMap({ timeRemainingSeconds: -4 })), "T−0:00");
  const final = clockedMap({
    timeRemainingSeconds: 0,
    outcome: "defeat",
    combatLive: false,
  });
  assert.equal(cobraMissionCountdown(final), "FINAL");
  assert.equal(cobraConquestScoreLine(final), "PTS 1–1 · TKT 280–190 · LOST",
    "RTB must show the recorded verdict rather than calling the finished battle staged");
  assert.equal(cobraMissionCountdown({ time_remaining_s: 300 }), null,
    "a remaining value without the published limit is not a trustworthy mission clock");
});

test("runtime, bridge and route wire one authority-owned mission clock end to end", async () => {
  const [runtime, bridge, main, draw] = await Promise.all([
    source("../../../../../sim/Cobra/GroundWar/CobraGroundWarRuntime.cs"),
    source("../../../../CobraWebBridge.cs"),
    source("../../../cobra-lab/main.js"),
    source("../cobra_tactical_map_draw.js"),
  ]);

  assert.match(runtime, /public double TimeRemainingSeconds =>[\s\S]*MissionTimeLimitSeconds - _elapsedSeconds/);
  assert.match(bridge, /time_limit_s = CobraGroundWarRuntime\.MissionTimeLimitSeconds/);
  assert.match(bridge, /time_remaining_s = groundWar\.TimeRemainingSeconds/);
  assert.match(main, /timeLimitSeconds: war\.time_limit_s/);
  assert.match(main, /timeRemainingSeconds: war\.time_remaining_s/);
  assert.match(draw, /const clockLine = cobraMissionCountdown\(model\)/);
  assert.match(draw, /ctx\.textAlign = "right";[\s\S]*ctx\.fillText\(clockLine, widthPx - padPx/,
    "long objective copy must never be able to ellipsise the countdown");
});

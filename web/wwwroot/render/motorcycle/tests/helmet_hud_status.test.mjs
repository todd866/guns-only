import assert from "node:assert/strict";
import test from "node:test";

import { trackDayStatusLine } from "../helmet_hud.js";

test("track-day status makes course validity and rider mode explicit", () => {
  assert.equal(
    trackDayStatusLine({ phase: "active", on_track: false }).text,
    "OFF COURSE · RETURN BETWEEN CURBS",
  );
  assert.match(
    trackDayStatusLine({
      phase: "active",
      on_track: true,
      control_mode: "assisted",
      lap: 2,
      lap_time_s: 65.4,
      off_track_s: 0,
    }).text,
    /^RIDER ASSIST · LAP 2 · 65:40/,
  );
  assert.match(
    trackDayStatusLine({
      phase: "active",
      on_track: true,
      control_mode: "raw",
      lap: 0,
    }).text,
    /^RAW · LAP 0/,
  );
});

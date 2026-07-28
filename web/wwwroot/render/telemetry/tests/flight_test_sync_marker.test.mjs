import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);
const settingsUrl = new URL("../../settings/player_settings.js", import.meta.url);

test("backquote emits one numbered telemetry marker and matching HUD flash", async () => {
  const [app, hud, settings] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(hudUrl, "utf8"),
    readFile(settingsUrl, "utf8"),
  ]);

  assert.match(app,
    /function emitFlightTestSyncMarker\(view\)[\s\S]*MARK-\$\{String\(flightTestSyncSequence\)\.padStart\(3, "0"\)\}/);
  assert.match(app,
    /view\.hud\.showFlightTestSyncMarker\(markerId, nowSeconds\)/);
  assert.match(app,
    /recorder\.event\("flight-test-sync", markerId, \{[\s\S]*sample_key: recorder\.lastSampleKey/);
  assert.match(app,
    /if \(event\.code === "Backquote"\) \{[\s\S]*session_phase === "ACTIVE"[\s\S]*emitFlightTestSyncMarker\(view\)/);
  assert.match(hud,
    /showFlightTestSyncMarker\(markerId, nowSeconds\)[\s\S]*FLIGHT TEST SYNC/);
  assert.match(settings, /"Backquote"/,
    "the sync key must be reserved from user control remapping");
});

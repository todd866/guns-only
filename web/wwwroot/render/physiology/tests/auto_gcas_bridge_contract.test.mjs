import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);

test("bridge projects authoritative Auto-GCAS state without JSON non-finite values", async () => {
  const source = await readFile(bridgeUrl, "utf8");
  const requiredFields = [
    "auto_gcas_profile_id",
    "auto_gcas_available",
    "auto_gcas_phase",
    "auto_gcas_active",
    "auto_gcas_warning",
    "auto_gcas_cue",
    "auto_gcas_inhibit_reason",
    "auto_gcas_override_held",
    "auto_gcas_activation_count",
    "auto_gcas_override_count",
    "auto_gcas_release_count",
    "auto_gcas_active_seconds",
    "auto_gcas_prediction_valid",
    "auto_gcas_used_fallback_terrain",
    "auto_gcas_current_clearance_m",
    "auto_gcas_pilot_minimum_clearance_m",
    "auto_gcas_recovery_minimum_clearance_m",
    "auto_gcas_pilot_violation_time_seconds",
    "auto_gcas_time_available_seconds",
    "auto_gcas_pilot_recovery_credited",
  ];
  for (const field of requiredFields) {
    assert.equal(source.includes(`\\"${field}\\"`), true,
      `missing Auto-GCAS snapshot field ${field}`);
  }
  assert.match(source, /FiniteNumberJson\(autoGcasPrediction\.TimeAvailableToAvoidGroundImpactSeconds\)/,
    "infinite time-available must serialize as JSON null");
  assert.match(source, /autoGcasProfileIdJson = JsonString\(/);
  assert.match(source, /autoGcasCueJson = JsonString\(/);
});

test("Auto-GCAS presentation is demand-driven and G-LOC grants no aural channel", async () => {
  const source = await readFile(hudUrl, "utf8");
  assert.match(source,
    /gcasActive \|\| gcasWarning \|\| gcasLowEnergy \|\| gcasTerrainUnavailable/,
    "there must be no permanent Auto-GCAS annunciator");
  assert.match(source,
    /state\.auto_gcas_available !== true[\s\S]*?radarAltFt < 500/,
    "modern Auto-GCAS and the legacy proximity warning must not duplicate PULL UP");
  assert.match(source,
    /const conscious = frame\.state\.pilot_conscious !== false;[\s\S]*?this\.audioEnabled && conscious/,
    "an unconscious pilot must not receive impossible audio information");
  assert.match(source,
    /if \(gcasAvailable\)[\s\S]*?K  AGCAS PADDLE/,
    "paddle help must appear only on a capable aircraft");
});

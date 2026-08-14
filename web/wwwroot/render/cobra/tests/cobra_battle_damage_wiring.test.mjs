import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [bridge, runtime, threat, groundWar, main] = await Promise.all([
  readFile(new URL("../../../../CobraWebBridge.cs", import.meta.url), "utf8"),
  readFile(new URL("../../../../../sim/Cobra/CobraMissionRuntime.cs", import.meta.url), "utf8"),
  readFile(new URL("../../../../../sim/Cobra/CobraThreatFireRuntime.cs", import.meta.url), "utf8"),
  readFile(new URL("../../../../../sim/Cobra/GroundWar/CobraGroundWarRuntime.cs", import.meta.url), "utf8"),
  readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8"),
]);

test("Cobra authority advances observer fire and applies subsystem effects", () => {
  assert.match(runtime,
    /_threatFire\.Advance\([\s\S]*?_cachedMaskingAssessment,[\s\S]*?_resolvedThreatObservers,[\s\S]*?_groundWar\.Units,[\s\S]*?new CobraThreatAirframeGeometry\([\s\S]*?currentPositionWorldM,[\s\S]*?_cobra\.State\.BodyAttitude/);
  assert.match(groundWar, /SeedAirThreatSites\(definition\)/);
  assert.match(groundWar, /observer\.Id,[\s\S]*?GroundUnitRole\.DshkSite/,
    "authored observers must be selectable killable ground-war units with the same ids");
  assert.match(bridge, /GroundUnitRole\.DshkSite\s*=>\s*"dshk-site"/);
  assert.match(threat, /IsOperationalAirThreat\(observer\.ObserverId, groundUnits\)/);
  assert.match(threat, /currentTarget\.Intersects\(burst\.ImpactWorldM\)/,
    "impact must resolve against live oriented airframe capsules");
  assert.match(threat, /SeededDispersion\(observer\.Id, sequence, rangeM/,
    "aimed bursts need stable range-scaled dispersion");
  assert.match(runtime, /_cobra\.FailScas\(\)/);
  assert.match(runtime, /_cobra\.FailEngine\(\)/);
  assert.match(runtime,
    /VerticalLiftPilotCommand authorityCommand = _turnaround\.FlightControlsEnabled[\s\S]*?\? command[\s\S]*?: GroundedCommand;[\s\S]*?PlayerVehicleCommand\.FromVerticalLift\(authorityCommand\)/,
    "operational battle damage must leave pilot controls intact while turnaround owns its grounded lock");
});

test("Cobra state DTO exposes actionable battle-damage truth", () => {
  assert.match(bridge, /CobraBattleDamageState battleDamage = diagnostics\.BattleDamage/);
  assert.match(bridge, /battle_damage = new/);
  for (const field of [
    "active_observer_id",
    "continuous_exposure_seconds",
    "acquisition_progress",
    "tracking_observers",
    "threat_tracking",
    "receiving_fire",
    "bursts_fired",
    "pending_bursts",
    "damaging_hits",
    "seconds_to_next_impact",
    "scas_damaged",
    "engine_damaged",
    "recent_bursts",
  ]) {
    assert.match(bridge, new RegExp(`\\b${field}\\s*=`), `missing ${field}`);
  }
  assert.doesNotMatch(bridge, /\bintegrity\s*=/,
    "the threat model must expose named subsystem hits, not a hitpoint pool");
  for (const field of [
    "sequence", "observer_id",
    "source_x_m", "source_y_m", "source_z_m",
    "target_x_m", "target_y_m", "target_z_m",
    "impact_x_m", "impact_y_m", "impact_z_m",
    "fired_at_s", "impact_at_s", "will_hit", "subsystem", "has_impacted",
  ]) {
    assert.match(bridge, new RegExp(`\\b${field}\\s*=`), `missing burst ${field}`);
  }
});

test("every ground-war presentation sync receives authority battle-damage events", () => {
  const syncCalls = [...main.matchAll(/groundWarPresentation\?\.sync\(([\s\S]*?)\);/g)];
  assert.equal(syncCalls.length, 4, "expected all four ground-war presentation sync sites");
  for (const [, argumentsSource] of syncCalls) {
    assert.match(argumentsSource, /authorityState\??\.battle_damage\s*\?\?\s*null/,
      "presentation sync must receive authority-owned burst and subsystem state");
  }
});

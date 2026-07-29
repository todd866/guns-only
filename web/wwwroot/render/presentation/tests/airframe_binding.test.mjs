import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import embeddedRapier from "../../../airframes/rapier_v1.embedded.js";
import embeddedGunDrone from "../../../airframes/rapier_gun_drone_v1.embedded.js";

const wwwroot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoAirframes = join(wwwroot, "../../airframes");
const flightModel = readFileSync(join(wwwroot, "../../sim/FlightModel.cs"), "utf8");

function extractRapierBlock() {
  const start = flightModel.indexOf("public static readonly AircraftParams RapierPublicDataSurrogate");
  assert.ok(start >= 0, "RapierPublicDataSurrogate missing");
  const end = flightModel.indexOf("public static readonly AircraftParams F22APublicDataSurrogate", start);
  assert.ok(end > start, "Rapier block end not found");
  return flightModel.slice(start, end);
}

test("embedded and staged Rapier definitions stay fully synchronized with source", () => {
  const pairs = [
    ["rapier.v1.json", embeddedRapier],
    ["rapier-gun-drone.v1.json", embeddedGunDrone],
  ];
  for (const [fileName, embedded] of pairs) {
    const canonical = JSON.parse(
      readFileSync(join(repoAirframes, fileName), "utf8"),
    );
    const staged = JSON.parse(
      readFileSync(join(wwwroot, "airframes", fileName), "utf8"),
    );
    assert.deepEqual(staged, canonical, `${fileName} staged JSON drifted from source`);
    assert.deepEqual(embedded, canonical, `${fileName} embedded runtime data drifted from source`);
  }
});

test("Rapier definition envelope binds to FlightModel.RapierPublicDataSurrogate", () => {
  const def = JSON.parse(readFileSync(join(wwwroot, "airframes/rapier.v1.json"), "utf8"));
  const repoDef = JSON.parse(readFileSync(join(repoAirframes, "rapier.v1.json"), "utf8"));
  assert.deepEqual(def.massKg, repoDef.massKg, "wwwroot and repo definitions must match");
  assert.equal(def.revision, "1.4.0");

  const block = extractRapierBlock();
  assert.match(block, /RapierAirframeFuelFreeMassKg\s*\+\s*RapierDesignStowedGunDroneMassKg\s*\+\s*4_500\.0/);
  assert.match(block, /WingAreaM2:\s*18\.0/);
  assert.match(block, /WingSpanM:\s*7\.35/);
  assert.match(block, /FuelFreeMassKg:\s*RapierAirframeFuelFreeMassKg\s*\+\s*RapierDesignStowedGunDroneMassKg/);
  assert.match(block, /SkinTemperatureLimitK:\s*1473\.15/);
  assert.match(block, /ThrustMaxN:\s*84_000\.0/);
  assert.match(flightModel, /RapierAirframeFuelFreeMassKg\s*=\s*5_150\.0/);
  assert.match(flightModel, /RapierDesignGunDroneCount\s*=\s*4/);

  assert.equal(def.dimensionsM.span, 7.35);
  assert.equal(def.wing.areaM2, 18);
  assert.equal(def.wing.renderedSolidPlanformAreaM2, 24.3173);
  assert.equal(def.wing.bodyOverlapNonReferenceAreaM2, 6.3173);
  assert.equal(def.aerodynamics.model, "rapier-cranked-delta-public-data-surrogate.v1");
  assert.equal(def.aerodynamics.controlMomentCoefficientMax.pitchCm, 0.18);
  assert.equal(def.aerodynamics.landingElevonDroop.mechanicallyInterconnected, false);
  assert.equal(def.aerodynamics.inletRecovery.onsetMach, 2);
  assert.equal(def.massKg.fuelFreeAirframe, 5150);
  assert.equal(def.massKg.designStowedGunDrones, 1440);
  assert.equal(def.massKg.fuelFree, 6590);
  assert.equal(def.massKg.gross, 11090);
  assert.equal(def.thermal.skinTemperatureLimitK, 1473.15);
  assert.equal(def.propulsion.thrustMaxN, 84000);
  assert.equal(def.flightModelBinding, "FlightModel.RapierPublicDataSurrogate");
});

test("gun-drone definition binds to RapierGunDroneSurrogate mass and skin", () => {
  const def = JSON.parse(readFileSync(join(wwwroot, "airframes/rapier-gun-drone.v1.json"), "utf8"));
  assert.equal(def.flightModelBinding, "FlightModel.RapierGunDroneSurrogate");
  assert.equal(def.massKg.gross, 360);
  assert.equal(def.massKg.fuelFree, 280);
  assert.equal(def.thermal.skinTemperatureLimitK, 593.15);
  assert.equal(def.wing.areaM2, 4.0);
  assert.equal(def.dimensionsM.span, 5.5);

  const start = flightModel.indexOf("public static readonly AircraftParams RapierGunDroneSurrogate");
  const end = flightModel.indexOf("public static readonly AircraftParams CheapRapierPublicDataSurrogate", start);
  const block = flightModel.slice(start, end);
  assert.match(block, /MassKg:\s*360\.0/);
  assert.match(block, /FuelFreeMassKg:\s*280\.0/);
  assert.match(block, /SkinTemperatureLimitK:\s*593\.15/);
  assert.match(block, /WingAreaM2:\s*4\.0/);
});

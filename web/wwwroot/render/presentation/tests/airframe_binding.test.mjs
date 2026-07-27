import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

test("Rapier definition envelope binds to FlightModel.RapierPublicDataSurrogate", () => {
  const def = JSON.parse(readFileSync(join(wwwroot, "airframes/rapier.v1.json"), "utf8"));
  const repoDef = JSON.parse(readFileSync(join(repoAirframes, "rapier.v1.json"), "utf8"));
  assert.deepEqual(def.massKg, repoDef.massKg, "wwwroot and repo definitions must match");
  assert.equal(def.revision, "1.1.0");

  const block = extractRapierBlock();
  assert.match(block, /MassKg:\s*9650\.0/);
  assert.match(block, /WingAreaM2:\s*18\.0/);
  assert.match(block, /WingSpanM:\s*7\.35/);
  assert.match(block, /FuelFreeMassKg:\s*5150\.0/);
  assert.match(block, /SkinTemperatureLimitK:\s*1473\.15/);
  assert.match(block, /ThrustMaxN:\s*85_000\.0/);

  assert.equal(def.dimensionsM.span, 7.35);
  assert.equal(def.wing.areaM2, 18);
  assert.equal(def.massKg.fuelFree, 5150);
  assert.equal(def.massKg.gross, 9650);
  assert.equal(def.thermal.skinTemperatureLimitK, 1473.15);
  assert.equal(def.propulsion.thrustMaxN, 85000);
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

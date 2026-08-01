import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import embeddedRapierV2 from "../../../airframes/rapier_v2.embedded.js";
import embeddedGunDrone from "../../../airframes/rapier_gun_drone_v1.embedded.js";

const wwwroot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoAirframes = join(wwwroot, "../../airframes");
const flightModel = readFileSync(join(wwwroot, "../../sim/FlightModel.cs"), "utf8");

function sourceDefinition() {
  return JSON.parse(readFileSync(join(repoAirframes, "rapier.v2.json"), "utf8"));
}

function extractRapierBlock() {
  const start = flightModel.indexOf("public static readonly AircraftParams RapierPublicDataSurrogate");
  assert.ok(start >= 0, "RapierPublicDataSurrogate missing");
  const end = flightModel.indexOf("public static readonly AircraftParams F22APublicDataSurrogate", start);
  assert.ok(end > start, "Rapier block end not found");
  return flightModel.slice(start, end);
}

test("canonical, staged, and embedded Rapier v2 definitions stay identical", () => {
  const canonical = sourceDefinition();
  const staged = JSON.parse(
    readFileSync(join(wwwroot, "airframes/rapier.v2.json"), "utf8"),
  );
  assert.deepEqual(staged, canonical, "Rapier v2 staged JSON drifted from source");
  assert.deepEqual(embeddedRapierV2, canonical,
    "Rapier v2 embedded runtime data drifted from source");
});

test("shape-first Rapier v2 is the sole production airframe authority", () => {
  const def = sourceDefinition();
  const engineering = JSON.parse(readFileSync(
    join(repoAirframes, "generated/rapier.v2.engineering.json"),
    "utf8",
  ));

  assert.equal(def.schema, "guns-only.shape-first-airframe-definition.v1");
  assert.equal(def.id, "rapier.shape-first-engineering.v2");
  assert.equal(def.revision, "2.0.0");
  assert.equal(def.authority.geometryIsCanonical, true);
  assert.equal(def.authority.runtimeBinding, "FlightModel.RapierPublicDataSurrogate");
  assert.equal(engineering.source.id, def.id);
  assert.equal(engineering.source.revision, def.revision);
  assert.equal(engineering.source.runtimeBinding, def.authority.runtimeBinding);
  assert.equal(engineering.referenceGeometry.lengthM, 13);
  assert.equal(engineering.referenceGeometry.spanM, 7.35);

  // These answers must be derived into the engineering artifact, never authored beside shape.
  for (const duplicate of ["dimensionsM", "massKg", "inertiaKgM2", "wingAreaM2"]) {
    assert.equal(Object.hasOwn(def, duplicate), false,
      `${duplicate} must not become a second authored airframe truth`);
  }

  const block = extractRapierBlock();
  assert.match(block, /MassKg:\s*RapierV2Design\.GrossMassKg/);
  assert.match(block, /WingAreaM2:\s*RapierV2Design\.ReferenceAreaM2/);
  assert.match(block, /ThrustMaxN:\s*RapierV2Design\.SeaLevelStaticDryThrustN/);
  assert.match(block, /SkinTemperatureLimitK:\s*RapierV2Design\.BindingThermalLimitK/);
  assert.match(block, /FuelFreeMassKg:\s*RapierV2Design\.EmptyMassKg/);
  assert.match(block, /WingSpanM:\s*RapierV2Design\.SpanM/);
});

test("production v2 structurally deletes the four-drone design", () => {
  const def = sourceDefinition();
  const volumeIds = def.geometry.internalVolumes.map(({ id }) => id);

  assert.equal(def.fixedRequirements.baselineMission.target, "high-altitude-balloon");
  assert.equal(def.fixedRequirements.baselineMission.weapon, "internal-gun");
  assert.equal(def.fixedRequirements.baselineMission.droneCount, 0);
  assert.equal(volumeIds.some((id) => /drone/i.test(id)), false);
  assert.equal(def.visualIdentity.prohibited.includes("drone bay"), true);
  assert.equal(def.geometry.externalInterfaces.externalStores, "none");
  assert.match(flightModel, /RapierDesignGunDroneCount\s*=\s*0/);
  assert.match(flightModel,
    /RapierAirframeFuelFreeMassKg\s*=>\s*RapierV2Design\.EmptyMassKg/);
});

test("quarantined gun-drone preview assets stay synchronized without becoming production authority", () => {
  const source = JSON.parse(readFileSync(
    join(repoAirframes, "rapier-gun-drone.v1.json"),
    "utf8",
  ));
  const staged = JSON.parse(readFileSync(
    join(wwwroot, "airframes/rapier-gun-drone.v1.json"),
    "utf8",
  ));

  assert.deepEqual(staged, source,
    "quarantined gun-drone preview JSON drifted from its source");
  assert.deepEqual(embeddedGunDrone, source,
    "quarantined gun-drone embedded preview data drifted from its source");
  assert.notEqual(source.id, sourceDefinition().id,
    "preview drone must not become the production Rapier authority");
});

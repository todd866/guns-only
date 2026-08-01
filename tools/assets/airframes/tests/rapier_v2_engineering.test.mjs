import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertShapeFirstDefinition,
  canonicalDefinitionSha256,
  createEngineeringArtifact,
  deriveShapeFirstAirframe,
  embeddedDefinitionModuleText,
  engineeringArtifactText,
  evaluateDashDesignPoint,
  evaluateInletFlow,
  standardAtmosphere,
} from "../derive_shape_first_airframe.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const sourcePath = resolve(repoRoot, "airframes/rapier.v2.json");
const stagedPath = resolve(repoRoot, "web/wwwroot/airframes/rapier.v2.json");
const embeddedPath = resolve(
  repoRoot, "web/wwwroot/airframes/rapier_v2.embedded.js");
const generatedPath = resolve(repoRoot, "airframes/generated/rapier.v2.engineering.json");
const schemaPath = resolve(
  repoRoot, "airframes/schema/shape-first-airframe-definition.schema.json");
const sourceText = readFileSync(sourcePath, "utf8");
const definition = JSON.parse(sourceText);

test("Rapier v2 source geometry is the runtime-bound authority and staged bytes match", () => {
  assert.doesNotThrow(() => assertShapeFirstDefinition(definition));
  assert.equal(definition.authority.geometryIsCanonical, true);
  assert.equal(
    definition.authority.runtimeBinding,
    "FlightModel.RapierPublicDataSurrogate",
  );
  assert.equal(readFileSync(stagedPath, "utf8"), sourceText);
  assert.equal(
    readFileSync(embeddedPath, "utf8"),
    embeddedDefinitionModuleText(definition, sourceText),
    "embedded synchronous browser definition must be generated from canonical source",
  );
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "guns-only.shape-first-airframe-definition.v1");
  assert.ok(schema.required.includes("geometry"));
  assert.ok(schema.required.includes("fixedRequirements"));
});

test("turbine core has bounded augmentation, ordered fade, and ordered fuel anchors", () => {
  const turbine = definition.propulsionModel.turbineCore;
  const { package: packageContract, ...cycleDeck } = turbine;
  assert.deepEqual(cycleDeck, {
    seaLevelStaticDryThrustN: 84_000,
    maximumAugmentedThrustRatio: 1.35,
    fadeStartMach: 1.9,
    fadeCompleteMach: 3,
    fuelFlowAnchorsLbPerMinute: { idle: 10.08, military: 144.48, augmented: 453.6 },
    augmentationAppliesTo: "turbine-stream-only",
  });
  assert.deepEqual(packageContract, {
    coreDiameterM: 1.22,
    coreLengthM: 4.88,
    minimumStructuralRadialClearanceM: 0.03,
    minimumThermalRadialClearanceM: 0.03,
    foreClearanceM: 0.3,
    aftClearanceM: 0.3,
    minimumFireBulkheadGapM: 0.15,
    axisCenterM: [0, -0.075, 2.29],
    tunnelBodyId: "single-ventral-propulsion-tunnel",
    internalVolumeId: "turbo-ramjet-core-and-duct-hardware",
  });
  const artifact = createEngineeringArtifact(definition);
  assert.equal(artifact.propulsion.turbineCore.maximumAugmentedSeaLevelStaticThrustN,
    113_400);
  assert.equal(turbine.fuelFlowAnchorsLbPerMinute.idle / turbine.seaLevelStaticDryThrustN,
    6 / 50_000);
  assert.equal(turbine.fuelFlowAnchorsLbPerMinute.military / turbine.seaLevelStaticDryThrustN,
    86 / 50_000);
  assert.equal(turbine.fuelFlowAnchorsLbPerMinute.augmented
    / (turbine.seaLevelStaticDryThrustN * turbine.maximumAugmentedThrustRatio),
  270 / 67_500);
  assert.equal(artifact.propulsion.turbineCore.ramStreamAugmentationRatio, 1);
  assert.equal(artifact.propulsion.ramStream.augmentationRatio, 1);
  assert.equal(artifact.propulsion.designPoint.turbineStreamThrustN, 0);
  assert.equal(
    artifact.propulsion.designPoint.ramStreamThrustN,
    artifact.propulsion.designPoint.netThrustN,
  );

  const unorderedFade = structuredClone(definition);
  unorderedFade.propulsionModel.turbineCore.fadeCompleteMach = 1.8;
  assert.throws(() => assertShapeFirstDefinition(unorderedFade), /fade complete Mach/i);
  const unorderedFuel = structuredClone(definition);
  unorderedFuel.propulsionModel.turbineCore.fuelFlowAnchorsLbPerMinute.augmented = 80;
  assert.throws(() => assertShapeFirstDefinition(unorderedFuel), /idle < military < augmented/i);
  const augmentedRam = structuredClone(definition);
  augmentedRam.propulsionModel.turbineCore.augmentationAppliesTo = "all-streams";
  assert.throws(() => assertShapeFirstDefinition(augmentedRam), /turbine stream only/i);
});

test("F100-class core has explicit clearance, co-annular flow area, and no collisions", () => {
  const derived = deriveShapeFirstAirframe(definition);
  const packaging = derived.propulsionPackaging;
  assert.equal(
    packaging.architecture.kind,
    "single-inlet-coannular-variable-cycle-shared-nozzle",
  );
  assert.equal(packaging.architecture.epistemic, "provisional-fictional-integration");
  assert.deepEqual(packaging.core, {
    diameterM: 1.22,
    radiusM: 0.61,
    lengthM: 4.88,
    centerM: [0, -0.075, 2.29],
    minZM: -0.1499999999999999,
    maxZM: 4.73,
  });
  assert.ok(Math.abs(packaging.envelope.diameterM - 1.34) < 1e-12);
  assert.ok(Math.abs(packaging.envelope.lengthM - 5.48) < 1e-12);
  assert.ok(Math.abs(packaging.envelope.volumeM3 - 7.728229963236592) < 1e-12);
  assert.ok(Math.abs(packaging.envelope.massKg - 1893.416340992965) < 1e-9);
  assert.ok(Math.abs(packaging.fireBulkhead.actualGapM - 0.15) < 1e-12);
  assert.equal(packaging.fireBulkhead.passes, true);
  assert.deepEqual(
    packaging.tunnel.crossSections.map((section) => Number(section.zM.toFixed(2))),
    [-0.45, -0.15, 2.29, 4.73, 5.03],
  );
  assert.ok(Math.abs(packaging.tunnel.minimumRadialClearanceM - 0.073) < 1e-12);
  assert.ok(Math.abs(packaging.tunnel.minimumClearCoannularAreaM2
    - 0.3240521406251334) < 1e-12);
  assert.equal(packaging.internalVolumeCollisionPass, true);

  const flow = packaging.flowCapacity;
  assert.equal(flow.pressureRecoveryFloorFraction, 0.3);
  assert.ok(flow.minimumRecoveryRequiredFraction > 0.28
    && flow.minimumRecoveryRequiredFraction < 0.29);
  assert.ok(flow.requiredChokedAreaM2 > 0.305 && flow.requiredChokedAreaM2 < 0.306);
  assert.ok(flow.coannularAreaMarginFraction > 0.06
    && flow.coannularAreaMarginFraction < 0.07);
  assert.ok(Math.abs(flow.nozzleAreaM2 - Math.PI * 0.45 ** 2) < 1e-12);
  assert.equal(flow.passes, true);

  const packageVolume = definition.geometry.internalVolumes.find(
    (volume) => volume.id === "turbo-ramjet-core-and-duct-hardware");
  assert.equal(packageVolume.shape, "propulsion-package-cylinder-z");
  assert.equal(packageVolume.sizeM, undefined,
    "the engine envelope is derived from one package contract, not duplicated as a box");
  const tunnel = definition.geometry.bodies.find(
    (body) => body.id === "single-ventral-propulsion-tunnel");
  assert.equal(tunnel.massModel.internalEffectiveDensityKgM3, 0);
  assert.equal(tunnel.massModel.fuelVolumeFraction, 0);

  const wallStrike = structuredClone(definition);
  wallStrike.geometry.bodies.find(
    (body) => body.id === "single-ventral-propulsion-tunnel").stations.find(
    (station) => station.zM === 2.29).radiusYM = 0.67;
  assert.throws(() => assertShapeFirstDefinition(wallStrike), /breaches.*tunnel inner wall/i);

  const volumeStrike = structuredClone(definition);
  volumeStrike.geometry.internalVolumes.find(
    (volume) => volume.id === "port-fuel-thermal-and-flight-control-services")
    .centerM = [0, -0.075, 2.29];
  assert.throws(() => assertShapeFirstDefinition(volumeStrike),
    /turbine package intersects internal volume/i);
});

test("standard atmosphere treats authored altitude as geometric like runtime", () => {
  const atmosphere = standardAtmosphere(24_000);
  assert.equal(atmosphere.geometricAltitudeM, 24_000);
  assert.ok(Math.abs(atmosphere.geopotentialAltitudeM - 23909.728706553415) < 1e-9);
  assert.ok(Math.abs(atmosphere.temperatureK - 220.55972870655341) < 1e-12);
  assert.ok(Math.abs(atmosphere.pressurePa - 2971.7457089181216) < 1e-9);
  assert.ok(Math.abs(atmosphere.densityKgM3 - 0.046937886665397936) < 1e-15);
});

test("installed inlet incidence closes design trim without hiding off-design loss", () => {
  const inlet = definition.geometry.inlet;
  assert.equal(inlet.designFlowIncidenceDeg, 7.5);
  const point = deriveShapeFirstAirframe(definition).dashDesignPoint;
  assert.ok(Math.abs(point.designTrimAlphaDeg - 7.592733) < 1e-6);
  assert.ok(Math.abs(point.inletFlow.alphaDeviationDeg - 0.092733) < 1e-6);
  assert.ok(Math.abs(point.inletFlow.recovery - 0.999924) < 1e-6);
  assert.equal(point.inletFlow.unstarted, false);
  assert.ok(point.rawRamStreamThrustN > point.netThrustN);

  const incidenceRad = inlet.designFlowIncidenceDeg * Math.PI / 180;
  assert.equal(evaluateInletFlow(definition, 4.2, incidenceRad, 0).recovery, 1);
  assert.ok(evaluateInletFlow(definition, 4.2, 0, 0).recovery < 0.7,
    "body-zero alpha is off-design for the visibly inclined inlet");

  const badHysteresis = structuredClone(definition);
  badHysteresis.geometry.inlet.offDesignFlowModel.unstartClearDeviationRad = 0.13;
  assert.throws(() => assertShapeFirstDefinition(badHysteresis), /clear deviation.*trip/i);
});

test("inlet recovery and sticky-unstart golden vectors pin the runtime contract", () => {
  const incidenceRad = definition.geometry.inlet.designFlowIncidenceDeg * Math.PI / 180;
  const vectors = [
    // mach, alpha deviation, beta, previously unstarted, recovery, next unstarted
    [1.9, 0.30, 0.20, false, 1.0, false],
    [2.3, 0.12, 0.04, false, 0.15, true],
    [2.6, 0.08, 0.03, false, 0.9240406226587864, false],
    [2.6, 0.08, 0.03, true, 0.15, true],
    [4.2, 0.05, 0.04, false, 0.8940458962166633, false],
  ];

  for (const [mach, alphaDeviationRad, betaRad, previouslyUnstarted,
    expectedRecovery, expectedUnstarted] of vectors) {
    const result = evaluateInletFlow(
      definition,
      mach,
      incidenceRad + alphaDeviationRad,
      betaRad,
      previouslyUnstarted,
    );
    assert.equal(result.unstarted, expectedUnstarted);
    assert.ok(Math.abs(result.recovery - expectedRecovery) < 1e-12,
      `M${mach} recovery ${result.recovery} != ${expectedRecovery}`);
  }
});

test("checked-in engineering artifact is a deterministic fresh derivation", () => {
  const expected = engineeringArtifactText(definition);
  const checkedIn = readFileSync(generatedPath, "utf8");
  assert.equal(checkedIn, expected,
    "regenerate the engineering artifact after changing canonical geometry");
  const artifact = JSON.parse(checkedIn);
  assert.equal(artifact.source.runtimeBinding, definition.authority.runtimeBinding);
  assert.match(artifact.source.canonicalSha256, /^[a-f0-9]{64}$/);
  assert.equal(artifact.acceptance.shapeFirstNoAuthoredDerivedOutputs, true);
  assert.equal(artifact.acceptance.dashDesignPointPasses, true);
});

test("canonical definition rejects duplicated hand-authored visual or physical truth", () => {
  for (const forbidden of [
    "dimensionsM",
    "areaM2",
    "aspectRatio",
    "meanAerodynamicChordM",
    "wettedAreaM2",
    "enclosedVolumeM3",
    "frontalAreaM2",
    "ramCaptureAreaM2",
    "massKg",
    "fuelCapacityKg",
    "grossMassKg",
    "cgM",
    "inertiaKgM2",
    "thermalAreaM2",
  ]) {
    assert.equal(Object.hasOwn(definition, forbidden), false, forbidden);
  }
  const duplicate = structuredClone(definition);
  duplicate.geometry.wing.areaM2 = 24.3;
  assert.throws(() => assertShapeFirstDefinition(duplicate),
    /hand-authored derived output.*areaM2/i);
});

test("reference geometry is derived from the canonical exterior", () => {
  const derived = deriveShapeFirstAirframe(definition);
  const geometry = derived.referenceGeometry;
  assert.equal(geometry.lengthM, 13);
  assert.equal(geometry.spanM, 7.35);
  assert.ok(Math.abs(geometry.heightM - 2.228801) < 1e-6);
  assert.ok(Math.abs(geometry.bounds.minM.y - (-0.829881)) < 1e-6,
    "the visible inlet lip participates in canonical exterior height");
  assert.ok(Math.abs(geometry.referenceAreaM2 - 24.316845) < 1e-6);
  assert.ok(Math.abs(geometry.meanAerodynamicChordM - 4.790958) < 1e-6);
  assert.ok(Math.abs(geometry.aspectRatio - 2.221608) < 1e-6);
  assert.ok(Math.abs(geometry.wettedAreaM2 - 152.549316) < 1e-6);
  assert.ok(Math.abs(geometry.enclosedVolumeM3 - 33.471682) < 1e-6);
  assert.ok(Math.abs(geometry.frontalAreaM2 - 3.416581) < 1e-6);
  assert.ok(Math.abs(derived.inletCaptureAreaM2 - 1.427791) < 1e-6);
  assert.equal(definition.geometry.wing.planform, undefined,
    "full planform is generated from half-stations, not copied beside them");
  assert.ok(derived.wing.outline.length >= 12);
});

test("mass, CG, fuel and coordinate inertias come from shaped volumes", () => {
  const mass = deriveShapeFirstAirframe(definition).massProperties;
  assert.ok(Math.abs(mass.emptyMassKg - 8068.259074) < 1e-6);
  assert.ok(Math.abs(mass.fuelCapacityKg - 3755.447606) < 1e-6);
  assert.ok(Math.abs(mass.grossMassKg - 11823.70668) < 1e-6);
  assert.ok(Math.abs(mass.grossMassKg
    - mass.emptyMassKg - mass.fuelCapacityKg) < 1e-9);
  assert.ok(Math.abs(mass.emptyCgM.z - 0.742613) < 1e-6);
  assert.ok(Math.abs(mass.grossCgM.z - 0.532894) < 1e-6);
  assert.ok(Math.abs(mass.emptyInertiaKgM2.xx - 67477.860023) < 1e-6);
  assert.ok(Math.abs(mass.emptyInertiaKgM2.yy - 71093.857366) < 1e-6);
  assert.ok(Math.abs(mass.emptyInertiaKgM2.zz - 5421.976494) < 1e-6);
  assert.ok(mass.grossInertiaKgM2.xx > mass.emptyInertiaKgM2.xx);
  assert.ok(mass.grossInertiaKgM2.yy > mass.emptyInertiaKgM2.yy);
  assert.ok(mass.grossInertiaKgM2.zz > mass.emptyInertiaKgM2.zz);
});

test("fixed operating contract is catapult, midpoint arrestor, balloon and no drones", () => {
  const fixed = definition.fixedRequirements;
  assert.equal(fixed.launch.mode, "catapult");
  assert.equal(fixed.recoverySite.runwayLengthM, 3048);
  assert.equal(fixed.recoverySite.arrestorStationM, 1524);
  assert.equal(
    fixed.recoverySite.arrestorStationM,
    fixed.recoverySite.runwayLengthM / 2,
  );
  assert.equal(fixed.baselineMission.target, "high-altitude-balloon");
  assert.equal(fixed.baselineMission.weapon, "internal-gun");
  assert.equal(fixed.baselineMission.droneCount, 0);
  assert.equal(definition.geometry.externalInterfaces.externalStores, "none");
  assert.equal(definition.geometry.externalInterfaces.canopy, "none");
  assert.equal(definition.geometry.externalInterfaces.droneBay, undefined);
  assert.ok(fixed.baselineMission.phases.includes("zoom"));
  assert.ok(fixed.baselineMission.phases.includes("reentry"));
  assert.ok(fixed.baselineMission.phases.includes("runway-arrested-recovery"));
});

test("M4.2 at 24 km has positive thrust, bounded q and a narrow thermal margin", () => {
  const derived = deriveShapeFirstAirframe(definition);
  const point = derived.dashDesignPoint;
  assert.equal(point.mach, 4.2);
  assert.equal(point.altitudeM, 24000);
  assert.ok(point.dynamicPressurePa > 35_000 && point.dynamicPressurePa < 37_000);
  assert.ok(point.netThrustN > 57_000 && point.netThrustN < 58_000);
  assert.ok(point.dragN > 42_000 && point.dragN < 43_000);
  assert.ok(point.excessThrustN > 14_000);
  assert.equal(point.propulsivePass, true);
  assert.equal(point.dynamicPressurePass, true);
  assert.equal(point.thermalPass, true);
  assert.equal(point.thermal.bindingZone, "insulated-warm-panel");
  assert.ok(point.thermal.minimumMarginK > 15 && point.thermal.minimumMarginK < 25);
  assert.ok(point.thermal.stagnationTemperatureK > 990);
  assert.ok(Math.abs(derived.dashEnvelope.lastPassingMach - 4.3) < 1e-9);
  assert.ok(Math.abs(derived.dashEnvelope.firstFailingMach - 4.31) < 1e-9);
});

test("CMC is enabling rather than decorative and low-altitude M4 is rejected", () => {
  const withoutCmc = structuredClone(definition);
  const hotEdge = withoutCmc.thermalModel.zones.find(
    (zone) => zone.id === "cmc-stagnation-hot-edge");
  hotEdge.materialId = "high-temperature-bmi-composite";
  const noCmcPoint = evaluateDashDesignPoint(withoutCmc, 4.2, 24000);
  assert.equal(noCmcPoint.thermalPass, false);
  assert.ok(noCmcPoint.thermal.zones.find(
    (zone) => zone.id === "cmc-stagnation-hot-edge").marginK < -300);

  const lowAltitudePoint = evaluateDashDesignPoint(definition, 4.2, 12000);
  assert.equal(lowAltitudePoint.dynamicPressurePass, false);
  assert.ok(lowAltitudePoint.dynamicPressurePa
    > definition.fixedRequirements.dash.maximumDynamicPressurePa * 4);
});

test("artifact exposes the exact runtime-consumable paths", () => {
  const artifact = createEngineeringArtifact(definition);
  assert.equal(
    artifact.source.canonicalSha256,
    canonicalDefinitionSha256(definition),
  );
  assert.equal(artifact.referenceGeometry.referenceAreaM2, 24.316845);
  assert.equal(artifact.massProperties.grossMassKg, 11823.70668);
  assert.equal(artifact.massProperties.grossInertiaKgM2.zz, 7855.515175);
  assert.equal(artifact.propulsion.inletCaptureAreaM2, 1.427791);
  assert.equal(artifact.propulsion.designPoint.dynamicPressurePa, 36695.116014);
  assert.equal(artifact.propulsion.inletFlow.designPoint.trimAlphaDeg, 7.592733);
  assert.equal(artifact.propulsion.inletFlow.designPoint.recovery, 0.999924);
  assert.equal(artifact.propulsion.designPoint.rawRamStreamThrustN, 57515.494188);
  assert.equal(artifact.propulsion.designPoint.netThrustN, 57511.139568);
  assert.equal(artifact.propulsion.designPoint.excessThrustN, 14586.355534);
  assert.equal(artifact.propulsion.packaging.flowCapacity.passes, true);
  assert.equal(artifact.thermal.designPoint.bindingZone, "insulated-warm-panel");
  assert.equal(artifact.thermal.designPoint.minimumMarginK, 19.12548);
});

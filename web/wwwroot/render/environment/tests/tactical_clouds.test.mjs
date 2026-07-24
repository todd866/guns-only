import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../../vendor/three.module.js";
import {
  cloudCellDescriptor,
  cloudDensityAt,
  createTacticalCloudField,
  layerCloudCoverageAt,
  simulationValueNoise,
  weatherConfigurationFromState,
} from "../tactical_clouds.js";

test("cloud cells are deterministic and world anchored", () => {
  const first = cloudCellDescriptor(12, -7);
  const second = cloudCellDescriptor(12, -7);
  assert.deepEqual(first, second);
  assert.ok(Number.isFinite(first.x));
  assert.ok(Number.isFinite(first.y));
  assert.ok(Number.isFinite(first.z));
});
test("cloud density rises inside a present cloud and clears outside it", () => {
  const cloud = { present: true, x: 100, y: 1500, z: -200, width: 1800, height: 500 };
  assert.ok(cloudDensityAt({ x: 100, y: 1500, z: -200 }, [cloud]) > 0.95);
  assert.equal(cloudDensityAt({ x: 10000, y: 1500, z: -200 }, [cloud]), 0);
});

test("runtime builds one instanced cloud and shadow draw for its tier", () => {
  const field = createTacticalCloudField(THREE, { qualityTier: "mobile" });
  assert.equal(field.cloudMesh.count, 0);
  assert.equal(field.shadowMesh.count, 0);
  const extinction = field.update(new THREE.Vector3(0, 1450, 0), 2,
    new THREE.Color(0x7898a0), 0.000055);
  assert.ok(extinction >= 0 && extinction <= 1);
  assert.equal(field.descriptors.length, 25);
  const shown = field.descriptors.filter((cloud) => cloud.present && cloud.opacity > 0.002);
  assert.equal(field.cloudMesh.count, shown.length);
  assert.equal(field.shadowMesh.count, shown.length);

  const matrixVersion = field.cloudMesh.instanceMatrix.version;
  field.update(new THREE.Vector3(20, 1450, -20), 2,
    new THREE.Color(0x7898a0), 0.000055);
  assert.equal(field.cloudMesh.instanceMatrix.version, matrixVersion,
    "re-presenting one simulation instant should not upload unchanged transforms");
  field.dispose();
});

test("volumetric tiers bound overlapping ray-march work", () => {
  const balanced = createTacticalCloudField(THREE, { qualityTier: "balanced" });
  const desktop = createTacticalCloudField(THREE, { qualityTier: "desktop" });
  assert.equal(balanced.cloudMesh.material.defines.CLOUD_STEPS, 8);
  assert.equal(desktop.cloudMesh.material.defines.CLOUD_STEPS, 12);
  assert.equal(balanced.lobesPerCloud, 1);
  assert.equal(desktop.lobesPerCloud, 2);
  assert.equal(
    desktop.cloudMesh.material.fragmentShader.match(/cloudDensity\(samplePoint \+/g)?.length,
    1,
    "each march step should use one self-shadow probe",
  );
  balanced.dispose();
  desktop.dispose();
});

test("an explicit performance override keeps desktop weather on the impostor path", () => {
  const field = createTacticalCloudField(THREE, {
    qualityTier: "desktop",
    volumetric: false,
  });
  assert.equal(field.volumetric, false);
  assert.equal(field.cloudMesh.name, "TACTICAL_CLOUD_IMPOSTORS");
  assert.deepEqual(field.cloudMesh.material.defines, {});
  assert.match(field.cloudMesh.material.fragmentShader, /nearFade/,
    "camera-intersecting impostors must fade instead of becoming a screen-sized slab");
  assert.match(field.shadowMesh.material.fragmentShader, /shadowEnvelope/,
    "cloud shadows must feather instead of exposing rectangular proxy geometry");
  field.dispose();
});

test("browser value noise matches the simulation reference vector", () => {
  assert.equal(
    simulationValueNoise(0.25, -0.5, 1.75, "1234567890abcdef"),
    0.041854168391723734,
  );
});

test("authoritative layer coverage advects without changing its seeded shape", () => {
  const layer = {
    coverage_01: 0.44,
    scale_m: 4500,
    wind_east_mps: 11,
    wind_north_mps: 4,
  };
  const seed = "20300915d20e0001";
  const stationary = layerCloudCoverageAt(3500, 0, layer, 0, seed, 0);
  const advected = layerCloudCoverageAt(3500 + 11 * 37, 4 * 37,
    layer, 0, seed, 37);
  assert.equal(advected, stationary);
  assert.ok(stationary > 0.7);
});

test("bridge weather conversion flips north once and balanced tier builds ray volumes", () => {
  const configuration = weatherConfigurationFromState({
    weather_profile_id: "weather.test.v1",
    weather_seed_hex: "1234567890abcdef",
    weather_layers: [{
      base_m: 1200,
      top_m: 2600,
      coverage_01: 0.48,
      scale_m: 4200,
      extinction_per_m: 0.018,
      wind_east_mps: 9,
      wind_north_mps: 3,
    }],
    weather_cells: [{
      east_m: 5000,
      north_m: 7000,
      base_m: 900,
      top_m: 5200,
      radius_east_m: 2300,
      radius_north_m: 1800,
      lifetime_s: 900,
      transition_s: 0,
      wind_north_mps: 4,
      coverage_01: 1,
      extinction_per_m: 0.02,
    }],
  });
  assert.equal(configuration.cells[0].initialZ, -7000);
  assert.equal(configuration.cells[0].windZ, -4);

  const field = createTacticalCloudField(THREE, { qualityTier: "balanced" });
  assert.equal(field.volumetric, true);
  field.configure(configuration);
  field.update(new THREE.Vector3(0, 2000, 0), 10,
    new THREE.Color(0x7898a0), 0.000055, new THREE.Vector3(0.3, 0.8, -0.5));
  assert.equal(field.cloudMesh.name, "TACTICAL_CLOUD_VOLUMES");
  assert.equal(field.cloudMesh.material.defines.CLOUD_STEPS, 8);
  assert.equal(field.lobesPerCloud, 1);
  assert.ok(field.cloudMesh.count > 0 && field.cloudMesh.count <= 26);
  assert.equal(field.shadowMesh.count, field.cloudMesh.count);
  field.dispose();
});

test("cloud-break entry clears smoothly when terrain residency is ready", () => {
  const field = createTacticalCloudField(THREE, {
    qualityTier: "mobile",
    entryResidentPages: 1,
    entryResidentChunks: 2,
    entryClearSeconds: 2.6,
  });
  const camera = new THREE.PerspectiveCamera();
  field.beginCloudBreak({ nowSeconds: 10 });

  const holding = field.updateCloudBreak({
    camera,
    nowSeconds: 10.5,
    terrainStats: { residentPages: 1, residentChunks: 1 },
    trueAirspeedKts: 400,
  });
  assert.equal(holding.phase, "holding");
  assert.equal(holding.opacity, 1);

  const threshold = field.updateCloudBreak({
    camera,
    nowSeconds: 10.6,
    terrainStats: { residentPages: 1, residentChunks: 2 },
    trueAirspeedKts: 400,
  });
  assert.equal(threshold.phase, "clearing");
  assert.equal(threshold.reason, "residency");
  assert.equal(threshold.opacity, 1, "the residency edge must not snap the cloud away");

  const easing = field.updateCloudBreak({
    camera,
    nowSeconds: 11.9,
    terrainStats: { residentPages: 1, residentChunks: 2 },
    trueAirspeedKts: 400,
  });
  assert.ok(easing.coverage > 0 && easing.coverage < 1);
  assert.ok(easing.opacity > 0 && easing.opacity < 1);
  assert.ok(easing.fogDensity > 0);
  field.dispose();
});

test("cloud-break entry uses a bounded timeout when terrain never becomes resident", () => {
  const field = createTacticalCloudField(THREE, {
    qualityTier: "mobile",
    entryHoldTimeoutSeconds: 6,
    entryClearSeconds: 2.6,
  });
  const camera = new THREE.PerspectiveCamera();
  field.beginCloudBreak({ nowSeconds: 20 });

  const beforeTimeout = field.updateCloudBreak({
    camera,
    nowSeconds: 25.99,
    terrainStats: null,
    trueAirspeedKts: 400,
  });
  assert.equal(beforeTimeout.phase, "holding");

  const timeout = field.updateCloudBreak({
    camera,
    nowSeconds: 26,
    terrainStats: { residentPages: 0, residentChunks: 0, errors: 1 },
    trueAirspeedKts: 400,
  });
  assert.equal(timeout.phase, "clearing");
  assert.equal(timeout.reason, "timeout");

  const complete = field.updateCloudBreak({
    camera,
    nowSeconds: 28.61,
    terrainStats: null,
    trueAirspeedKts: 400,
  });
  assert.equal(complete.phase, "complete");
  assert.equal(complete.active, false);
  assert.equal(complete.fogDensity, 0);
  field.dispose();
});

test("cloud-break near-field wisps are fully torn down after break-out", () => {
  const field = createTacticalCloudField(THREE, {
    qualityTier: "mobile",
    entryResidentPages: 1,
    entryResidentChunks: 1,
    entryClearSeconds: 1,
  });
  const camera = new THREE.PerspectiveCamera();
  field.beginCloudBreak({ nowSeconds: 0 });
  field.updateCloudBreak({
    camera,
    nowSeconds: 0,
    terrainStats: { residentPages: 1, residentChunks: 1 },
    trueAirspeedKts: 450,
  });
  assert.ok(field.entryWispMesh);
  assert.ok(field.cloudBreakDiagnostics().wispInstances > 0);
  let wispMeshDisposed = false;
  let wispGeometryDisposed = false;
  let wispMaterialDisposed = false;
  field.entryWispMesh.addEventListener("dispose", () => { wispMeshDisposed = true; });
  field.entryWispMesh.geometry.addEventListener("dispose", () => { wispGeometryDisposed = true; });
  field.entryWispMesh.material.addEventListener("dispose", () => { wispMaterialDisposed = true; });

  field.updateCloudBreak({
    camera,
    nowSeconds: 1.01,
    terrainStats: { residentPages: 1, residentChunks: 1 },
    trueAirspeedKts: 450,
  });
  assert.equal(field.entryWispMesh, null);
  assert.equal(field.entryInsideMesh, null);
  assert.equal(wispMeshDisposed, true);
  assert.equal(wispGeometryDisposed, true);
  assert.equal(wispMaterialDisposed, true);
  assert.equal(field.group.getObjectByName("CLOUD_BREAK_NEAR_WISPS"), undefined);
  assert.equal(field.group.getObjectByName("CLOUD_BREAK_INSIDE_LAYER"), undefined);
  assert.deepEqual(
    {
      allocated: field.cloudBreakDiagnostics().wispResourcesAllocated,
      insideLayer: field.cloudBreakDiagnostics().insideLayerAllocated,
      instances: field.cloudBreakDiagnostics().wispInstances,
    },
    { allocated: false, insideLayer: false, instances: 0 },
  );

  field.updateCloudBreak({
    camera,
    nowSeconds: 5,
    terrainStats: { residentPages: 1, residentChunks: 1 },
    trueAirspeedKts: 450,
  });
  assert.equal(field.entryWispMesh, null, "completed entries must not recreate hidden work");
  field.dispose();
});

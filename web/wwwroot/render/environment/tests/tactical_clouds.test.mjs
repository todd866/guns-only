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
  assert.equal(field.cloudMesh.count, 25);
  assert.equal(field.shadowMesh.count, 25);
  const extinction = field.update(new THREE.Vector3(0, 1450, 0), 2,
    new THREE.Color(0x7898a0), 0.000055);
  assert.ok(extinction >= 0 && extinction <= 1);
  assert.equal(field.descriptors.length, 25);
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
  assert.equal(field.cloudMesh.material.defines.CLOUD_STEPS, 20);
  assert.equal(field.lobesPerCloud, 2);
  assert.ok(field.cloudMesh.count > 26 && field.cloudMesh.count <= 51);
  assert.equal(field.shadowMesh.count, field.cloudMesh.count);
  field.dispose();
});

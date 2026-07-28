import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "../../../vendor/three.module.js";
import {
  WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS,
  WINTER_PRECIPITATION_TIER_CAPACITIES,
  createWinterPrecipitation,
  winterPrecipitationCapacityForTier,
  winterPrecipitationConfigurationFromSnapshot,
} from "../winter_precipitation.js";

const MIXED_SNAPSHOT = Object.freeze({
  precipitation_rain_mm_water_equivalent_hr: 1,
  precipitation_snow_mm_water_equivalent_hr: 1,
  precipitation_freezing_drizzle_mm_water_equivalent_hr: 1,
  precipitation_freezing_rain_mm_water_equivalent_hr: 1,
  precipitation_ice_pellets_mm_water_equivalent_hr: 1,
  precipitation_graupel_mm_water_equivalent_hr: 1,
  precipitation_hail_mm_water_equivalent_hr: 1,
  precipitation_visibility_m: 420,
  wind_x_mps: 4,
  wind_y_mps: -0.5,
  wind_z_mps: 2,
});

test("quality tiers expose strictly bounded fixed capacities", () => {
  assert.ok(
    WINTER_PRECIPITATION_TIER_CAPACITIES.mobile
      < WINTER_PRECIPITATION_TIER_CAPACITIES.balanced,
  );
  assert.ok(
    WINTER_PRECIPITATION_TIER_CAPACITIES.balanced
      < WINTER_PRECIPITATION_TIER_CAPACITIES.desktop,
  );
  assert.equal(
    winterPrecipitationCapacityForTier("mobile"),
    WINTER_PRECIPITATION_TIER_CAPACITIES.mobile,
  );
  assert.equal(
    winterPrecipitationCapacityForTier({ id: "desktop" }),
    WINTER_PRECIPITATION_TIER_CAPACITIES.desktop,
  );
  assert.equal(
    winterPrecipitationCapacityForTier("unknown"),
    WINTER_PRECIPITATION_TIER_CAPACITIES.balanced,
  );
  assert.equal(
    winterPrecipitationCapacityForTier("desktop", Number.MAX_SAFE_INTEGER),
    WINTER_PRECIPITATION_TIER_CAPACITIES.desktop,
  );
  assert.equal(winterPrecipitationCapacityForTier("mobile", 1), 64);
});

test("configuration consumes only the explicit authoritative phase-rate keys", () => {
  const legacyOnly = winterPrecipitationConfigurationFromSnapshot({
    precipitation_mm_hr: 100,
    precipitation_total_mm_water_equivalent_hr: 100,
  });
  assert.equal(legacyOnly.active, false);
  assert.equal(legacyOnly.totalRateMmWaterEquivalentPerHour, 0);

  const configuration =
    winterPrecipitationConfigurationFromSnapshot(MIXED_SNAPSHOT);
  assert.equal(configuration.active, true);
  assert.equal(configuration.totalRateMmWaterEquivalentPerHour, 7);
  assert.equal(configuration.phaseRates.snow, 1);
  assert.equal(configuration.phaseRates.graupel, 1);
  assert.equal(configuration.phaseRates.icePellets, 2,
    "hail shares the hard ice-pellet visual class");
  assert.equal(configuration.phaseRates.liquid, 2,
    "rain and freezing rain share the liquid streak class");
  assert.equal(configuration.phaseRates.freezingDrizzle, 1);
  assert.deepEqual(configuration.windVelocityMps, { x: 4, y: -0.5, z: -2 });
  assert.equal(configuration.visibilityM, 420);
  assert.ok(configuration.phaseCutoffs.snow > 0);
  assert.ok(configuration.phaseCutoffs.graupel > configuration.phaseCutoffs.snow);
  assert.ok(
    configuration.phaseCutoffs.icePellets > configuration.phaseCutoffs.graupel,
  );
  assert.ok(
    configuration.phaseCutoffs.liquid > configuration.phaseCutoffs.icePellets,
  );
  assert.ok(configuration.phaseCutoffs.liquid < 1);
  assert.deepEqual(
    winterPrecipitationConfigurationFromSnapshot(MIXED_SNAPSHOT),
    configuration,
  );
  assert.equal(Object.isFrozen(configuration), true);
  assert.equal(Object.isFrozen(configuration.rates), true);
});

test("configuration clamps corrupt rates without inventing precipitation", () => {
  const configuration = winterPrecipitationConfigurationFromSnapshot({
    [WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS.snow]: -2,
    [WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS.graupel]: Number.NaN,
    [WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS.hail]: Number.POSITIVE_INFINITY,
    [WINTER_PRECIPITATION_SNAPSHOT_RATE_KEYS.freezingDrizzle]: 5_000,
  });

  assert.equal(configuration.rates.snowMmWaterEquivalentPerHour, 0);
  assert.equal(configuration.rates.graupelMmWaterEquivalentPerHour, 0);
  assert.equal(configuration.rates.hailMmWaterEquivalentPerHour, 0);
  assert.equal(
    configuration.rates.freezingDrizzleMmWaterEquivalentPerHour,
    1_000,
  );
  assert.equal(configuration.dominantPhase, "freezingDrizzle");
  assert.ok(configuration.density01 >= 0 && configuration.density01 <= 1);
  assert.ok(configuration.opacity01 >= 0 && configuration.opacity01 <= 0.9);
});

test("runtime starts inactive and owns exactly one fixed-capacity Points draw", () => {
  const scene = new THREE.Scene();
  const precipitation = createWinterPrecipitation(THREE, {
    parent: scene,
    qualityTier: "mobile",
    capacity: 128,
  });
  let pointObjects = 0;
  scene.traverse((object) => {
    if (object.isPoints) pointObjects += 1;
  });

  assert.equal(pointObjects, 1);
  assert.ok(precipitation.points.isPoints);
  assert.equal(precipitation.capacity, 128);
  assert.equal(precipitation.points.visible, false);
  assert.equal(precipitation.geometry.drawRange.count, 0);
  assert.equal(precipitation.diagnostics().drawCalls, 0);
  assert.equal(precipitation.diagnostics().drawCount, 0);
  assert.equal(
    precipitation.geometry.attributes.position.usage,
    THREE.StaticDrawUsage,
  );
  precipitation.dispose();
});

test("mixed winter phases share one draw but retain distinct motion and shape styles", () => {
  const precipitation = createWinterPrecipitation(THREE, {
    qualityTier: "desktop",
    capacity: 512,
  });
  precipitation.configureFromSnapshot(MIXED_SNAPSHOT);
  const diagnostics = precipitation.diagnostics();

  assert.equal(diagnostics.active, true);
  assert.equal(diagnostics.drawCalls, 1);
  assert.ok(diagnostics.drawCount > 0 && diagnostics.drawCount <= 512);
  assert.ok(diagnostics.phaseCounts.snow > 0);
  assert.ok(diagnostics.phaseCounts.graupel > 0);
  assert.ok(diagnostics.phaseCounts.icePellets > 0);
  assert.ok(diagnostics.phaseCounts.liquid > 0);
  assert.ok(diagnostics.phaseCounts.freezingDrizzle > 0);

  const fallSpeeds = [
    ...precipitation.uniforms.uFallSpeedsMps.value.toArray(),
    precipitation.uniforms.uFreezingDrizzleFallSpeedMps.value,
  ];
  const pointSizes = [
    ...precipitation.uniforms.uPointSizesM.value.toArray(),
    precipitation.uniforms.uFreezingDrizzlePointSizeM.value,
  ];
  assert.equal(new Set(fallSpeeds).size, 5);
  assert.equal(new Set(pointSizes).size, 5);
  assert.equal(new Set([
    precipitation.uniforms.uSnowColor.value.getHex(),
    precipitation.uniforms.uGraupelColor.value.getHex(),
    precipitation.uniforms.uIcePelletColor.value.getHex(),
    precipitation.uniforms.uLiquidColor.value.getHex(),
    precipitation.uniforms.uFreezingDrizzleColor.value.getHex(),
  ]).size, 5);
  assert.match(precipitation.material.fragmentShader, /float snowflake\(/);
  assert.match(precipitation.material.fragmentShader, /float graupel\(/);
  assert.match(precipitation.material.fragmentShader, /float icePellet\(/);
  assert.match(precipitation.material.fragmentShader, /float liquidStreak\(/);
  assert.match(precipitation.material.fragmentShader, /float freezingDrizzle\(/);
  precipitation.dispose();
});

test("frame updates change uniforms only and leave particle attributes untouched", () => {
  const precipitation = createWinterPrecipitation(THREE, {
    qualityTier: "balanced",
    capacity: 256,
  });
  precipitation.configureFromSnapshot(MIXED_SNAPSHOT);
  const positionAttribute = precipitation.geometry.attributes.position;
  const selectorAttribute = precipitation.geometry.attributes.aSelector;
  const seedAttribute = precipitation.geometry.attributes.aSeed;
  const positionArray = positionAttribute.array;
  const positionVersion = positionAttribute.version;
  const selectorVersion = selectorAttribute.version;
  const seedVersion = seedAttribute.version;
  const drawCount = precipitation.geometry.drawRange.count;

  assert.equal(precipitation.update({
    cameraPosition: { x: 1_200, y: 240, z: -800 },
    simulationTimeSeconds: 12.5,
    viewportHeight: 900,
    pixelRatio: 1.5,
  }), true);
  precipitation.update({
    cameraPosition: { x: 1_260, y: 230, z: -740 },
    simulationTimeSeconds: 13,
    windVelocityMps: { x: 7, y: 0.2, z: -3 },
  });

  assert.equal(positionAttribute.array, positionArray);
  assert.equal(positionAttribute.version, positionVersion);
  assert.equal(selectorAttribute.version, selectorVersion);
  assert.equal(seedAttribute.version, seedVersion);
  assert.equal(precipitation.geometry.drawRange.count, drawCount);
  assert.equal(precipitation.uniforms.uSimulationTime.value, 13);
  assert.deepEqual(
    precipitation.uniforms.uCameraPosition.value.toArray(),
    [1_260, 230, -740],
  );
  assert.deepEqual(
    precipitation.uniforms.uWindVelocityMps.value.toArray(),
    [7, 0.2, -3],
  );
  assert.match(
    precipitation.material.vertexShader,
    /mod\(\s*rawPosition - uCameraPosition \+ uVolumeHalfExtentsM/,
  );
  assert.equal(precipitation.diagnostics().updateCount, 2);
  precipitation.dispose();
});

test("seed geometry and snapshot configuration are reproducible", () => {
  const first = createWinterPrecipitation(THREE, {
    qualityTier: "mobile",
    capacity: 64,
  });
  const second = createWinterPrecipitation(THREE, {
    qualityTier: "mobile",
    capacity: 64,
  });

  assert.deepEqual(first.positions, second.positions);
  assert.deepEqual(first.selectors, second.selectors);
  assert.deepEqual(first.seeds, second.seeds);
  assert.deepEqual(
    first.configureFromSnapshot(MIXED_SNAPSHOT),
    second.configureFromSnapshot(MIXED_SNAPSHOT),
  );
  first.dispose();
  second.dispose();
});

test("runtime requires explicit finite simulation time and has no wall-clock path", async () => {
  const precipitation = createWinterPrecipitation(THREE, {
    qualityTier: "mobile",
    capacity: 64,
    snapshot: MIXED_SNAPSHOT,
  });
  assert.throws(
    () => precipitation.update({ cameraPosition: { x: 0, y: 0, z: 0 } }),
    /simulationTimeSeconds/,
  );
  assert.throws(
    () => precipitation.update({
      cameraPosition: { x: 0, y: Number.NaN, z: 0 },
      simulationTimeSeconds: 1,
    }),
    /cameraPosition/,
  );

  const source = await readFile(
    new URL("../winter_precipitation.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /Date\.now|performance\.now|Math\.random/);
  precipitation.dispose();
});

test("zero authoritative rates deactivate the batch and disposal is idempotent", () => {
  const scene = new THREE.Scene();
  const precipitation = createWinterPrecipitation(THREE, {
    parent: scene,
    qualityTier: "balanced",
    capacity: 128,
    snapshot: MIXED_SNAPSHOT,
  });
  precipitation.configureFromSnapshot({});
  assert.equal(precipitation.points.visible, false);
  assert.equal(precipitation.geometry.drawRange.count, 0);
  assert.equal(precipitation.diagnostics().drawCalls, 0);

  let geometryDisposed = false;
  let materialDisposed = false;
  precipitation.geometry.addEventListener("dispose", () => {
    geometryDisposed = true;
  });
  precipitation.material.addEventListener("dispose", () => {
    materialDisposed = true;
  });

  assert.equal(precipitation.dispose(), true);
  assert.equal(precipitation.dispose(), false);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
  assert.equal(precipitation.points.parent, null);
  assert.equal(precipitation.update(undefined), false);
  assert.equal(precipitation.configureFromSnapshot(MIXED_SNAPSHOT), false);
  assert.deepEqual(
    {
      disposed: precipitation.diagnostics().disposed,
      active: precipitation.diagnostics().active,
      drawCount: precipitation.diagnostics().drawCount,
      drawCalls: precipitation.diagnostics().drawCalls,
    },
    { disposed: true, active: false, drawCount: 0, drawCalls: 0 },
  );
});

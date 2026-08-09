import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import * as THREE from "../../../vendor/three.module.js";
import {
  WEEKEND_FIELD_LANDCOVER_URL,
  WEEKEND_HINTERLAND_GROUND_URL,
  WEEKEND_ROUTE_SCHEMA,
  WEEKEND_TRACK_DAY_SCHEMA,
  WEEKEND_TRACK_SURFACE_URL,
  createWeekendTrackDayPresentation,
  planWeekendGoldenPathCue,
  planWeekendTrackDay,
} from "../track_day_presentation.js";

const centreline = [
  { x: 0, y: 68, z: -320 },
  { x: 350, y: 68, z: -320 },
  { x: 590, y: 68, z: -220 },
  { x: 720, y: 68, z: -40 },
  { x: 680, y: 68, z: 160 },
  { x: 520, y: 68, z: 310 },
  { x: 300, y: 68, z: 390 },
  { x: 80, y: 68, z: 310 },
  { x: -140, y: 68, z: 430 },
  { x: -400, y: 68, z: 400 },
  { x: -620, y: 68, z: 280 },
  { x: -730, y: 68, z: 80 },
  { x: -680, y: 68, z: -120 },
  { x: -500, y: 68, z: -250 },
  { x: -300, y: 68, z: -320 },
  { x: 0, y: 68, z: -320 },
];

const route = Object.freeze({
  schema: WEEKEND_ROUTE_SCHEMA,
  id: "weekend-track-day.closed-circuit.v1",
  mode: "track-day",
  route_kind: "closed-circuit",
  closed: true,
  track_width_m: 18,
  pavement_half_width_m: 22,
  surface_elevation_m: 68,
  circuit_length_m: 3_850,
  sector_gate_progress: [0.25, 0.5, 0.75],
  start: { x: 0, y: 68, z: -320, heading_rad: Math.PI / 2 },
  paddock_access: { x: -80, y: 68, z: -345, heading_rad: Math.PI },
  centreline,
});

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function distanceToCircuit(point) {
  let minimumM = Infinity;
  for (let index = 0; index < centreline.length - 1; index++) {
    const start = centreline[index];
    const end = centreline[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(
      1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared,
    ));
    minimumM = Math.min(
      minimumM,
      Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t)),
    );
  }
  return minimumM;
}

test("route contract produces a broad purpose-built closed circuit", () => {
  const plan = planWeekendTrackDay(route);

  assert.equal(plan.schema, WEEKEND_TRACK_DAY_SCHEMA);
  assert.equal(plan.circuitId, route.id);
  assert.equal(plan.trackWidthM, route.track_width_m);
  assert.equal(plan.pavementHalfWidthM, route.pavement_half_width_m);
  assert.equal(plan.runoffWidthM, 13);
  assert.ok(plan.bounds.maximumX - plan.bounds.minimumX > 1_300);
  assert.ok(plan.bounds.maximumZ - plan.bounds.minimumZ > 650);
  assert.equal(plan.gantry.center.x, centreline[0].x);
  assert.equal(plan.paddockAccess.center.x, route.paddock_access.x);
  assert.equal(plan.accessRoad.start.z, route.paddock_access.z);
  assert.equal(plan.marshalPosts.length, 3);
  assert.ok(plan.cones.length >= 16);
  assert.equal(plan.tyreWalls.length, 128);
  assert.equal(plan.paddock.length, 6);
});

test("pavement, runoff, barriers, and facilities follow the circuit corridor", () => {
  const plan = planWeekendTrackDay(route);

  for (const cone of plan.cones) {
    assert.ok(distanceToCircuit(cone.center) <= plan.trackWidthM * 0.5 + 0.2);
  }
  for (const wall of plan.tyreWalls) {
    assert.ok(
      distanceToCircuit(wall.center) >= plan.pavementHalfWidthM + 3,
      `barrier at (${wall.center.x}, ${wall.center.z}) intrudes into paved runoff`,
    );
  }
  for (const asset of [...plan.paddock, plan.raceControl, plan.pitGarage]) {
    assert.ok(distanceToCircuit(asset.center) > plan.pavementHalfWidthM);
  }
  assert.ok(plan.raceControl.heightM >= 10);
  assert.ok(plan.pitGarage.widthM >= 60);
});

test("presentation has no rectangular facility slab, edge stripes, beacons, or airfield landmarks", () => {
  const presentation = createWeekendTrackDayPresentation(THREE, route);
  const names = [];
  presentation.object3d.traverse((object) => names.push(object.name));

  assert.equal(presentation.object3d.name, "weekend-track-day");
  assert.ok(presentation.object3d.getObjectByName("weekend-circuit-verge"));
  assert.ok(presentation.object3d.getObjectByName("weekend-race-control"));
  assert.ok(presentation.object3d.getObjectByName("weekend-pit-garage"));
  assert.equal(names.some((name) => /runway|airfield|beacon|threshold/i.test(name)), false);
  assert.equal("beacons" in presentation.plan, false);
  assert.equal("pavedHalfLengthM" in presentation.plan, false);
  assert.equal("pavedHalfWidthM" in presentation.plan, false);
  assert.equal(
    presentation.object3d.getObjectByName("weekend-circuit-verge").geometry.type,
    "BufferGeometry",
  );
  presentation.dispose();
});

test("horizon, landcover, and midfield stay populated without crowding the route", () => {
  const plan = planWeekendTrackDay(route);

  assert.ok(plan.ground.sizeM >= 12_000);
  assert.ok(plan.horizon.segments.length >= 24);
  assert.ok(plan.horizon.radiusM >= 4_000 && plan.horizon.radiusM <= 7_500);
  assert.ok(plan.horizon.silhouettes.length >= 3);
  assert.ok(plan.fieldPatches.length >= 4);
  assert.ok(plan.hedgerows.length >= 4);
  assert.ok(plan.trees.length >= 700 && plan.trees.length <= 1_400);
  for (const tree of plan.trees) {
    assert.ok(
      distanceToCircuit(tree.center) >= plan.pavementHalfWidthM + 25,
      `tree at (${tree.center.x}, ${tree.center.z}) crowds the circuit`,
    );
  }
  assert.ok(plan.farms.length >= 2);
});

test("dense authority geometry keeps ambient marker counts bounded", () => {
  const dense = Array.from({ length: 1_024 }, (_, index) => {
    const angle = index / 1_024 * Math.PI * 2;
    return { x: Math.cos(angle) * 700, y: 68, z: Math.sin(angle) * 420 };
  });
  dense.push(dense[0]);

  const plan = planWeekendTrackDay({ ...route, centreline: dense });

  assert.ok(plan.cones.length <= 128);
  assert.equal(plan.tyreWalls.length, 128);
  assert.equal(plan.paddock.length, 6);
});

test("golden-path cues use authoritative progress, sector, route geometry, and lap state", () => {
  const base = {
    lap: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    circuit_progress_m: 0,
    circuit_length_m: route.circuit_length_m,
    next_sector: 0,
  };
  const launch = planWeekendGoldenPathCue(route, base, {}, 1_000);
  assert.deepEqual({ kind: launch.kind, token: launch.token }, { kind: "launch", token: "↑" });

  const sector = planWeekendGoldenPathCue(route, {
    ...base,
    vx: 12,
    circuit_progress_m: route.circuit_length_m * 0.25 - 100,
  }, launch.state, 2_000);
  assert.equal(sector.kind, "sector");
  assert.match(sector.token, /^[↰↱] S1$/);

  const finish = planWeekendGoldenPathCue(route, {
    ...base,
    vx: 14,
    circuit_progress_m: route.circuit_length_m - 100,
    next_sector: 3,
  }, sector.state, 3_000);
  assert.deepEqual({ kind: finish.kind, token: finish.token }, { kind: "finish", token: "◎" });

  const lap = planWeekendGoldenPathCue(route, { ...base, lap: 1 }, finish.state, 4_000);
  assert.deepEqual({ kind: lap.kind, token: lap.token }, { kind: "lap", token: "✓ LAP 1" });
});

test("generated asphalt, near ground, and field assets are hash-pinned and staged identically", async () => {
  assert.equal(
    WEEKEND_TRACK_SURFACE_URL,
    "/content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp?v=299",
  );
  assert.equal(
    WEEKEND_HINTERLAND_GROUND_URL,
    "/content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp?v=299",
  );
  assert.equal(
    WEEKEND_FIELD_LANDCOVER_URL,
    "/content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp?v=299",
  );
  const [
    asphaltCanonical, asphaltStaged, groundCanonical, groundStaged,
    fieldCanonical, fieldStaged,
  ] = await Promise.all([
    readFile(new URL("../../../../../content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp", import.meta.url)),
    readFile(new URL("../../../content/packs/weekend-ride/environment/textures/track-asphalt-v1.webp", import.meta.url)),
    readFile(new URL("../../../../../content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp", import.meta.url)),
    readFile(new URL("../../../content/packs/weekend-ride/environment/textures/weekend-hinterland-ground-v1.webp", import.meta.url)),
    readFile(new URL("../../../../../content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp", import.meta.url)),
    readFile(new URL("../../../content/packs/weekend-ride/environment/textures/weekend-field-landcover-v1.webp", import.meta.url)),
  ]);
  assert.deepEqual(asphaltStaged, asphaltCanonical);
  assert.deepEqual(groundStaged, groundCanonical);
  assert.deepEqual(fieldStaged, fieldCanonical);
  assert.equal(
    createHash("sha256").update(asphaltCanonical).digest("hex"),
    "bb9a4033b80a0d7069cb987f73e0c325e10c64c9c1030b73e9b7f6a8819ec713",
  );
  assert.equal(
    createHash("sha256").update(groundCanonical).digest("hex"),
    "bb97d9528ad773891d6a704b6d01ab6b145eff451055c827d3a6c05be51641a1",
  );
  assert.equal(
    createHash("sha256").update(fieldCanonical).digest("hex"),
    "9b6b3cb7ee30f81ea485dd2fa1f3b18d04a17e03285c284f27b3ec0538be542d",
  );
});

test("generated textures use metre-scaled UVs and mirrored sRGB landcover", () => {
  const asphalt = new THREE.Texture();
  const ground = new THREE.Texture();
  const field = new THREE.Texture();
  const atlas = new THREE.Texture();
  const presentation = createWeekendTrackDayPresentation(THREE, route, {
    surfaceTexture: asphalt,
    groundTexture: ground,
    fieldTexture: field,
    roadsideAtlas: atlas,
  });
  const surface = presentation.object3d.getObjectByName("weekend-track-surface");
  const shoulder = presentation.object3d.getObjectByName("weekend-paved-shoulder");
  const hinterland = presentation.object3d.getObjectByName("weekend-hinterland-ground");
  const verge = presentation.object3d.getObjectByName("weekend-circuit-verge");
  const ecology = presentation.object3d.getObjectByName(
    "weekend-midfield-trees-roadside-atlas",
  );
  assert.equal(surface.material.map, asphalt);
  assert.equal(shoulder.material.map, asphalt);
  assert.equal(hinterland.material.map, field);
  assert.equal(ground.colorSpace, THREE.SRGBColorSpace);
  assert.equal(ground.wrapS, THREE.MirroredRepeatWrapping);
  assert.equal(ground.wrapT, THREE.MirroredRepeatWrapping);
  assert.ok(field.repeat.x > 15 && field.repeat.x < 16);
  assert.equal(field.colorSpace, THREE.SRGBColorSpace);
  assert.notEqual(verge.material.map, ground, "verge owns a metre-mapped clone");
  assert.equal(verge.material.map.source, ground.source);
  assert.equal(verge.material.map.wrapS, THREE.MirroredRepeatWrapping);
  assert.equal(ecology.material.map, atlas);
  assert.equal(ecology.material.type, "MeshBasicMaterial");
  assert.equal(ecology.material.vertexColors, true);
  assert.equal(ecology.material.alphaTest, 0.28);
  assert.equal(atlas.flipY, false);
  assert.equal(atlas.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(surface.geometry.getAttribute("uv").count, surface.geometry.getAttribute("position").count);
  assert.ok(
    surface.geometry.getAttribute("uv").getX(2) > 1,
    "track UVs repeat at an authored metre scale instead of stretching around the circuit",
  );
  presentation.dispose();
});

test("canonical Web scene manifest is byte-identical for content, Web, and Unity", async () => {
  const [canonical, staged, unity] = await Promise.all([
    readFile(new URL("../../../../../content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json", import.meta.url)),
    readFile(new URL("../../../content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json", import.meta.url)),
    readFile(new URL("../../../../../unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/Circuit/weekend-track-day-presentation-v1.json", import.meta.url)),
  ]);
  assert.deepEqual(staged, canonical);
  assert.deepEqual(unity, canonical);
  assert.equal(
    createHash("sha256").update(canonical).digest("hex"),
    "0b906b2e24616c3648d39626bb63f9391f2e423e44beef8a03f945609b952461",
  );
});

test("retained manifest serializes actual Web leaves, transforms, instances, materials, and UVs", async () => {
  const bytes = await readFile(new URL(
    "../../../../../content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json",
    import.meta.url,
  ));
  const manifest = JSON.parse(bytes);
  assert.equal(manifest.schema, "guns-only.weekend-track-day-scene.v1");
  assert.equal(manifest.serialization, "canonical-json-v1");
  const { semantic_sha256: semanticSha256, ...payload } = manifest;
  assert.equal(
    createHash("sha256").update(canonicalJson(payload)).digest("hex"),
    semanticSha256,
  );
  assert.equal(semanticSha256, "325fa88219e8f3929a684be8d7090519ac94d94f979d982d428793fe7d5a0ad4");
  assert.equal(manifest.route_authority.centreline.length, 577);
  assert.equal(manifest.scene.leaf_count, 110);
  assert.equal(manifest.scene.leaves.length, 110);
  assert.equal(
    manifest.scene.leaves.reduce((sum, leaf) => sum + leaf.instances.count, 0),
    699,
  );
  assert.equal(JSON.stringify(manifest).includes("uuid"), false);

  const required = [
    "weekend-hinterland-ground", "weekend-circuit-verge", "weekend-field-patchwork",
    "weekend-rolling-field-relief", "weekend-field-hedgerows", "weekend-horizon-ridge",
    "weekend-horizon-silhouettes", "weekend-midfield-trees-roadside-atlas",
    "weekend-paddock-access-road", "weekend-paddock-access-delineator",
    "weekend-farm-buildings", "weekend-race-control",
    "weekend-pit-garage", "weekend-paved-shoulder", "weekend-track-surface",
    "weekend-track-curbs", "weekend-track-edge-lines", "weekend-runoff-edge-lines",
    "weekend-start-finish-gantry", "weekend-course-cones",
    "weekend-tyre-walls", "weekend-marshal-post", "weekend-paddock-canopy",
    "weekend-service-vehicle",
  ];
  const paths = manifest.scene.leaves.map((leaf) => leaf.path).join("\n");
  for (const token of required) assert.match(paths, new RegExp(token));
  for (const leaf of manifest.scene.leaves) {
    assert.equal(leaf.world_matrix.length, 16);
    assert.equal(leaf.geometry.position.values.length, leaf.geometry.vertex_count * 3);
    assert.equal(leaf.geometry.indices.length % 3, 0);
    assert.ok(["mesh-basic", "mesh-standard"].includes(leaf.material.model));
    if (leaf.kind === "instanced-mesh") {
      assert.equal(leaf.instances.matrices.length, leaf.instances.count * 16);
    }
  }
  const track = manifest.scene.leaves.find((leaf) => leaf.name === "weekend-track-surface");
  const ground = manifest.scene.leaves.find((leaf) => leaf.name === "weekend-hinterland-ground");
  assert.equal(track.material.map.id, "TEX_WEEKEND_TRACK_ASPHALT_V1");
  assert.equal(ground.material.map.id, "TEX_WEEKEND_FIELD_LANDCOVER_V1");
  assert.deepEqual(ground.material.map.repeat, [15.172413793103, 15.172413793103]);
  assert.ok(Math.max(...track.geometry.uv.values) > 100);
});

test("manifest render profile remains identical to Weekend Web camera, sky, fog, light, and ACES", async () => {
  const [manifestBytes, mainBytes] = await Promise.all([
    readFile(new URL("../../../../../content/packs/weekend-ride/presentation/weekend-track-day-presentation.v1.json", import.meta.url)),
    readFile(new URL("../../../weekend-ride/main.js", import.meta.url), "utf8"),
  ]);
  const profile = JSON.parse(manifestBytes).render_profile;
  assert.deepEqual(profile.camera, { far_m: 24000, near_m: 0.25, vertical_fov_deg: 68 });
  assert.equal(profile.tone_mapping, "three-r160-aces-filmic");
  assert.equal(profile.tone_mapping_exposure, 1.04);
  assert.match(mainBytes, /toneMapping\s*=\s*THREE\.ACESFilmicToneMapping/);
  assert.match(mainBytes, /toneMappingExposure\s*=\s*1\.04/);
  assert.match(mainBytes, /new THREE\.FogExp2\(0xa8b8b7, 0\.00016\)/);
  assert.match(mainBytes, /HemisphereLight\(0xf4f8f4, 0x67745f, 1\.65\)/);
  assert.match(mainBytes, /DirectionalLight\(0xffefd1, 2\.05\)/);
  assert.match(mainBytes, /#include <tonemapping_fragment>[\s\S]*#include <colorspace_fragment>/);
  assert.match(mainBytes, /new THREE\.PerspectiveCamera\(68, 1, 0\.25, 24_000\)/);
  assert.match(mainBytes, /new THREE\.SphereGeometry\(8_000, 24, 12\)/);
  assert.match(mainBytes, /sun\.position\.set\(-1_200, 2_400, 900\)/);
});

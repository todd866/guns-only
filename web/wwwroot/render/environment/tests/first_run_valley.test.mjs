import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../../../vendor/three.module.js";
import {
  createFirstRunValleyPresentation,
  FIRST_RUN_VALLEY_GEOMETRY_VERSION,
  FIRST_RUN_VALLEY_MESH_RECESS_M,
  firstRunValleyAuthoredHeightM,
  firstRunValleyButteRiseM,
  firstRunValleyCenterEastM,
  firstRunValleyLateralOffsetM,
  firstRunValleyProfileFromState,
  firstRunValleyRockColorRgb,
  firstRunValleySideCutOpening01,
  firstRunValleyStratifiedWallRiseM,
} from "../first_run_valley.js";

const valleyState = Object.freeze({
  mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
  first_run_valley_available: true,
  first_run_valley_geometry_version: 2,
  first_run_valley_center_east_m: 0,
  first_run_valley_entry_north_m: -19200,
  first_run_valley_popout_north_m: -1200,
  first_run_valley_route_alt_m: 310,
  first_run_valley_floor_height_m: 150,
  first_run_valley_floor_blend_drop_m: 70,
  first_run_valley_floor_half_width_m: 340,
  first_run_valley_crest_offset_m: 900,
  first_run_valley_outer_offset_m: 2400,
  first_run_valley_west_ridge_rise_m: 800,
  first_run_valley_east_ridge_rise_m: 700,
  first_run_valley_curve_amplitude_m: 1200,
  first_run_valley_curve_wavelength_m: 18000,
  first_run_valley_centerline_component_count: 3,
  first_run_valley_side_cut_count: 4,
  first_run_valley_butte_count: 3,
  first_run_valley_side_cut_depth_01: 0.78,
  first_run_valley_strata_step_height_m: 26,
  first_run_valley_strata_bench_fraction: 0.22,
  first_run_valley_south_extent_north_m: -21000,
  first_run_valley_south_full_north_m: -19800,
  first_run_valley_popout_fade_start_north_m: -3600,
  first_run_valley_north_extent_north_m: -450,
});

test("projected valley profile is complete and rejects partial or wrong-mission truth", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  assert.ok(profile);
  assert.equal(profile.routeAltitudeM, 310);
  assert.equal(profile.geometryVersion, FIRST_RUN_VALLEY_GEOMETRY_VERSION);
  assert.equal(profile.popOutNorthM - profile.entryNorthM, 18_000);
  assert.equal(firstRunValleyProfileFromState({
    ...valleyState,
    mission_definition_id: "mission.other",
  }), null);
  assert.equal(firstRunValleyProfileFromState({
    ...valleyState,
    first_run_valley_crest_offset_m: null,
  }), null);
});

test("versioned centreline is an 18 km asymmetric multi-meander, not one sine", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const samples = [];
  for (let index = 0; index <= 276; index += 1) {
    const northM = profile.entryNorthM
      + (profile.popOutNorthM - profile.entryNorthM) * index / 276;
    samples.push(firstRunValleyCenterEastM(profile, northM));
  }
  let reversals = 0;
  let previousSign = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const delta = samples[index] - samples[index - 1];
    const sign = Math.abs(delta) < 0.25 ? 0 : Math.sign(delta);
    if (sign && previousSign && sign !== previousSign) reversals += 1;
    if (sign) previousSign = sign;
  }
  assert.ok(reversals >= 3, `expected several broad turn reversals, got ${reversals}`);
  assert.ok(Math.max(...samples) > 380);
  assert.ok(Math.min(...samples) < -600);
  let minimumRadiusM = Number.POSITIVE_INFINITY;
  const curvatureStepM = 20;
  for (let northM = profile.entryNorthM + curvatureStepM;
    northM < profile.popOutNorthM - curvatureStepM; northM += curvatureStepM) {
    const x0 = firstRunValleyCenterEastM(profile, northM - curvatureStepM);
    const x1 = firstRunValleyCenterEastM(profile, northM);
    const x2 = firstRunValleyCenterEastM(profile, northM + curvatureStepM);
    const a = Math.hypot(x1 - x0, curvatureStepM);
    const b = Math.hypot(x2 - x1, curvatureStepM);
    const c = Math.hypot(x2 - x0, curvatureStepM * 2);
    const areaM2 = Math.abs((x1 - x0) * curvatureStepM
      - curvatureStepM * (x2 - x1)) * 0.5;
    if (areaM2 > 1e-6) minimumRadiusM = Math.min(
      minimumRadiusM, a * b * c / (4 * areaM2),
    );
  }
  assert.ok(minimumRadiusM > 1_800,
    `tightest ${minimumRadiusM.toFixed(0)} m turn is not a broad jet meander`);
  assert.ok(Math.abs(samples[0]) < 1e-9);
  assert.ok(Math.abs(samples.at(-1)) < 1e-9);
});

test("browser analytic surface preserves a passable river floor, tall walls, tributaries, and pop-out", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const northM = profile.entryNorthM + profile.curveWavelengthM * 0.08;
  const centerEastM = firstRunValleyCenterEastM(profile, northM);
  assert.equal(firstRunValleyAuthoredHeightM(profile, centerEastM, northM),
    profile.floorHeightM);
  const westM = firstRunValleyAuthoredHeightM(
    profile, centerEastM - profile.crestOffsetM, northM,
  );
  const eastM = firstRunValleyAuthoredHeightM(
    profile, centerEastM + profile.crestOffsetM, northM,
  );
  assert.ok(westM > profile.routeAltitudeM + 380);
  assert.ok(eastM > profile.routeAltitudeM + 320);

  for (let north = profile.entryNorthM; north <= profile.popOutNorthM; north += 50) {
    const center = firstRunValleyCenterEastM(profile, north);
    const floorM = firstRunValleyAuthoredHeightM(profile, center, north);
    assert.ok(floorM <= profile.floorHeightM + 1e-6,
      `centreline rose into an obstruction at north ${north}`);
    assert.ok(profile.routeAltitudeM - floorM >= 150,
      `centreline clearance collapsed at north ${north}`);
  }

  const tributaryNorthM = profile.entryNorthM + profile.curveWavelengthM * 0.39;
  const tributaryOpening01 = firstRunValleySideCutOpening01(
    profile, profile.crestOffsetM, tributaryNorthM,
  );
  assert.ok(tributaryOpening01 > 0.7, "east tributary must cut a broad opening through the wall");
  assert.ok(firstRunValleyStratifiedWallRiseM(profile, 430) < 430,
    "wall authority must contain an exposed bench before the next stratum face");
  const butteNorthM = profile.entryNorthM + profile.curveWavelengthM * 0.55;
  assert.ok(firstRunValleyButteRiseM(
    profile, -profile.outerOffsetM * 0.76, butteNorthM,
  ) > 230, "outer west shelf must retain a collision-matched butte");
  assert.equal(firstRunValleyButteRiseM(
    profile, profile.outerOffsetM * 0.76, butteNorthM,
  ), 0, "the butte recipe must preserve its authored side");

  const popCenterM = firstRunValleyCenterEastM(profile, profile.popOutNorthM);
  const popWallM = firstRunValleyAuthoredHeightM(
    profile, popCenterM + profile.crestOffsetM, profile.popOutNorthM,
  );
  assert.ok(eastM - popWallM > 350, "the visual wall must fall away before weapons release");
});

test("visual sampling resolves authority strata without changing their surface", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  assert.equal(firstRunValleyLateralOffsetM(profile, 0), -profile.outerOffsetM);
  assert.equal(firstRunValleyLateralOffsetM(profile, 0.5), 0);
  assert.equal(firstRunValleyLateralOffsetM(profile, 1), profile.outerOffsetM);
  const samples = [];
  for (let index = 0; index <= 160; index += 1) {
    samples.push(firstRunValleyLateralOffsetM(profile, index / 160));
  }
  const westWallSteps = [];
  for (let index = 1; index < samples.length; index += 1) {
    const midpointM = (Math.abs(samples[index]) + Math.abs(samples[index - 1])) * 0.5;
    if (midpointM >= profile.floorHalfWidthM && midpointM <= profile.crestOffsetM) {
      westWallSteps.push(Math.abs(samples[index] - samples[index - 1]));
    }
  }
  assert.ok(Math.max(...westWallSteps) < 30,
    "inner-wall tessellation must resolve each 36 m authority stratum");
});

test("rock palette separates horizontal ledges, tributary shadow, and rim caps", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const signedOffsetM = -profile.crestOffsetM;
  const northM = profile.entryNorthM + profile.curveWavelengthM * 0.30;
  const colors = [1, 2, 3, 4, 5, 6].map((band) => firstRunValleyRockColorRgb(
    profile,
    signedOffsetM,
    northM,
    profile.floorHeightM + profile.strataStepHeightM * (band + 0.35),
  ));
  const redRange = Math.max(...colors.map((color) => color[0]))
    - Math.min(...colors.map((color) => color[0]));
  const greenRange = Math.max(...colors.map((color) => color[1]))
    - Math.min(...colors.map((color) => color[1]));
  assert.ok(redRange > 0.25 && greenRange > 0.15,
    "successive authority bands need visible red/orange/tan separation");
  for (const color of colors) assert.ok(color[0] > color[1] && color[1] > color[2]);

  const cutNorthM = profile.entryNorthM + profile.curveWavelengthM * 0.39;
  const openCut = firstRunValleyRockColorRgb(
    profile, profile.crestOffsetM, cutNorthM, profile.floorHeightM + 600,
  );
  const closedWall = firstRunValleyRockColorRgb(
    profile, profile.crestOffsetM, cutNorthM + 900, profile.floorHeightM + 600,
  );
  assert.ok(openCut[0] < closedWall[0] * 0.8,
    "tributary opening needs a stable deep-shadow cue");
});

test("versioned browser recipe matches authority golden samples", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const samples = [
    [0.00,     0,    0.000000000,  150.000000000],
    [0.08,  -900,   45.632178689, 1030.350072934],
    [0.08,   900,   45.632178689,  826.840337640],
    [0.18,  -900,  306.060781779,  427.605228636],
    [0.29,  1728,  300.743507573,  599.831428773],
    [0.39,   900, -262.691498671,  326.053587511],
    [0.55, -1824, -511.597761018,  639.461581787],
    [0.64,  -900,  -68.225174252,  337.867055690],
    [0.74,  1680,  278.616094404,  655.146389698],
    [0.82,   900,  233.225558826,  436.193455422],
    [0.90,  -550,   66.296004253,  401.507697952],
    [1.00,   900,   -0.000000000,  170.214425408],
  ];
  for (const [progress01, signedOffsetM, expectedCenterM, expectedHeightM] of samples) {
    const northM = profile.entryNorthM + profile.curveWavelengthM * progress01;
    const centerM = firstRunValleyCenterEastM(profile, northM);
    const heightM = firstRunValleyAuthoredHeightM(
      profile, centerM + signedOffsetM, northM,
    );
    assert.ok(Math.abs(centerM - expectedCenterM) <= 1e-6,
      `centreline recipe drifted at progress ${progress01}`);
    assert.ok(Math.abs(heightM - expectedHeightM) <= 1e-6,
      `surface recipe drifted at progress ${progress01}`);
  }
});

test("one bounded draw keeps warm strata, river, and dry wash after terrain streaming", () => {
  const valley = createFirstRunValleyPresentation(THREE);
  assert.equal(valley.update(valleyState), true);
  const mesh = valley.object3d.getObjectByName("FIRST_RUN_VALLEY_RIDGES");
  assert.ok(mesh);
  assert.equal(valley.object3d.children.length, 1);
  assert.equal(mesh.geometry.userData.backdropTriangleCount, 5_120);
  assert.equal(mesh.geometry.userData.exitApronTriangleCount, 10_624);
  assert.equal(mesh.geometry.userData.exitDrainageTriangleCount, 384);
  assert.equal(mesh.geometry.userData.scenicTriangleCount, 17_152);
  assert.equal(mesh.geometry.userData.authorityTriangleCount, 163_840);
  assert.equal(mesh.geometry.userData.triangleCount, 180_992);
  assert.ok(mesh.geometry.getAttribute("terrainWater"));
  assert.ok(mesh.geometry.getAttribute("landcover"));
  assert.ok(mesh.geometry.getAttribute("concavity"));
  const water = mesh.geometry.getAttribute("terrainWater");
  const cover = mesh.geometry.getAttribute("landcover");
  let waterVertices = 0;
  let roadVertices = 0;
  const authorityVertexCount = (mesh.geometry.userData.northSegments + 1)
    * (mesh.geometry.userData.lateralSegments + 1);
  for (let index = authorityVertexCount; index < water.count; index += 1) {
    if (water.getX(index) > 0.5) waterVertices += 1;
    if (cover.getX(index) < 0.2 && cover.getY(index) < 0.06) roadVertices += 1;
  }
  assert.equal(waterVertices, 1_156,
    "the Colorado-scale river and its exit continuation must remain bounded ribbons");
  assert.equal(roadVertices, 642, "the dry rim wash must remain a bounded ribbon");
  const color = mesh.geometry.getAttribute("color");
  let warmRockVertices = 0;
  for (let index = 0; index < mesh.geometry.userData.authorityIndexCount / 6; index += 1) {
    if (color.getX(index) > color.getY(index)
        && color.getY(index) > color.getZ(index)) warmRockVertices += 1;
  }
  assert.ok(warmRockVertices > 20_000,
    "the authority mesh must read as red/orange/tan rock rather than green forest walls");
  assert.equal(mesh.castShadow, false,
    "the combined authority/apron draw must not cast a cascade-sized slab across itself");
  assert.equal(mesh.receiveShadow, true);
  assert.equal(valley.diagnostics().drawCount, 1);
  assert.equal(valley.diagnostics().northSegments, 512);
  assert.equal(valley.diagnostics().lateralSegments, 160);
  assert.equal(valley.diagnostics().meshRecessM, FIRST_RUN_VALLEY_MESH_RECESS_M);

  const shared = new THREE.MeshBasicMaterial();
  valley.update(valleyState, shared, true);
  assert.notEqual(mesh.material, shared,
    "the Ukraine regional shader would erase the canyon's warm vertex palette");
  assert.equal(mesh.material.name, "MAT_FIRST_RUN_GRAND_CANYON_ROCK");
  assert.equal(mesh.material.vertexColors, true);
  assert.equal(mesh.material.roughness, 0.88);
  assert.equal(mesh.material.flatShading, true);
  assert.equal(mesh.material.envMapIntensity, 0.24);
  assert.equal(mesh.material.polygonOffset, true);
  assert.equal(mesh.material.polygonOffsetFactor, -1.5);
  assert.equal(valley.diagnostics().dedicatedCanyonMaterial, true);

  assert.equal(valley.update({ first_run_valley_available: false }), false);
  assert.equal(valley.object3d.visible, false);
  valley.dispose();
  assert.equal(valley.object3d.parent, null);
  shared.dispose();
});

test("banked deep-canyon camera cannot see through the pop-out handoff to the atlas", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const valley = createFirstRunValleyPresentation(THREE);
  valley.update(valleyState);
  const mesh = valley.object3d.getObjectByName("FIRST_RUN_VALLEY_RIDGES");
  const geometry = mesh.geometry;
  const data = geometry.userData;
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const index = geometry.index;

  assert.equal(data.exitApronPresentationOnly, true);
  assert.equal(data.exitApronIndexStart,
    data.backdropIndexStart + data.backdropIndexCount,
    "the exit cover must remain scenic and follow every authority/backdrop index");
  assert.equal(data.exitApronIndexCount, data.exitApronTriangleCount * 3);
  assert.equal(data.exitApronStartNorthM, profile.popOutFadeStartNorthM,
    "the scenic apron must not intrude into the deep-canyon foreground");
  assert.ok(data.exitApronFullCoverNorthM > profile.popOutFadeStartNorthM
    && data.exitApronFullCoverNorthM < profile.popOutNorthM,
  "the warm overlap should ease across the authority fade before the open pop-out");
  assert.ok(data.exitApronEndNorthM
    >= profile.northExtentNorthM + 4_200);
  assert.ok(data.exitApronHalfWidthM
    >= profile.outerOffsetM + 3_200);
  assert.ok(data.exitApronAtlasCoverHeightM > profile.floorHeightM + 35);
  assert.ok(data.exitApronAtlasCoverHeightM <= profile.routeAltitudeM - 95,
    "the open exit basin must stay visibly below the route, not become an end wall");

  let warmVertices = 0;
  let minimumHeightM = Infinity;
  let maximumHeightM = -Infinity;
  let fullCoverMaximumHeightM = -Infinity;
  let fullCoverCenterMaximumHeightM = -Infinity;
  assert.equal(data.exitApronNorthSegments, 160,
    "the pop-out needs enough along-route facets to avoid a single smooth shelf");
  assert.equal(data.exitApronBandCount, 33,
    "the banked sightline needs stepped cross-valley detail instead of eleven broad bands");
  assert.equal(data.exitApronSurfaceVertexStart, data.exitApronVertexStart);
  assert.equal(data.exitApronSurfaceVertexCount, 5_313);
  assert.equal(data.exitApronSurfaceIndexStart, data.exitApronIndexStart);
  assert.equal(data.exitApronSurfaceIndexCount, 10_240 * 3);
  assert.equal(data.exitDrainageVertexStart,
    data.exitApronSurfaceVertexStart + data.exitApronSurfaceVertexCount);
  assert.equal(data.exitDrainageVertexCount, 386);
  assert.equal(data.exitDrainageIndexStart,
    data.exitApronSurfaceIndexStart + data.exitApronSurfaceIndexCount);
  assert.equal(data.exitDrainageIndexCount, data.exitDrainageTriangleCount * 3);
  assert.ok(data.exitDrainageStartNorthM < profile.popOutFadeStartNorthM);
  assert.equal(data.exitDrainageEndNorthM, data.exitApronFadeNorthM);

  let authoredEntrySamples = 0;
  for (let band = 0; band < data.exitApronBandCount; band += 1) {
    const vertex = data.exitApronSurfaceVertexStart + band;
    const eastM = position.getX(vertex);
    const northM = -position.getZ(vertex);
    const authoredM = firstRunValleyAuthoredHeightM(profile, eastM, northM);
    if (authoredM === null) continue;
    authoredEntrySamples += 1;
    assert.ok(Math.abs(position.getY(vertex)
      - (authoredM - FIRST_RUN_VALLEY_MESH_RECESS_M)) < 0.02,
    "the scenic continuation must enter on the authored surface without a hard shelf boundary");
  }
  assert.ok(authoredEntrySamples >= 14,
    "the apron needs a broad authored overlap before it becomes presentation-only terrain");

  const water = geometry.getAttribute("terrainWater");
  const normal = geometry.getAttribute("normal");
  const normalBuckets = new Set();
  const colorBuckets = new Set();
  for (let vertex = data.exitApronSurfaceVertexStart;
    vertex < data.exitApronSurfaceVertexStart + data.exitApronSurfaceVertexCount;
    vertex += 1) {
    const eastM = position.getX(vertex);
    const heightM = position.getY(vertex);
    const northM = -position.getZ(vertex);
    minimumHeightM = Math.min(minimumHeightM, heightM);
    maximumHeightM = Math.max(maximumHeightM, heightM);
    if (northM >= data.exitApronFullCoverNorthM
        && northM <= data.exitApronFadeNorthM) {
      fullCoverMaximumHeightM = Math.max(fullCoverMaximumHeightM, heightM);
      if (Math.abs(eastM - firstRunValleyCenterEastM(profile, northM)) < 0.1) {
        fullCoverCenterMaximumHeightM = Math.max(
          fullCoverCenterMaximumHeightM,
          heightM,
        );
      }
    }
    if (color.getX(vertex) > color.getY(vertex)
        && color.getY(vertex) > color.getZ(vertex)) warmVertices += 1;
    normalBuckets.add([
      Math.round(normal.getX(vertex) * 12),
      Math.round(normal.getY(vertex) * 12),
      Math.round(normal.getZ(vertex) * 12),
    ].join("|"));
    colorBuckets.add([
      Math.round(color.getX(vertex) * 20),
      Math.round(color.getY(vertex) * 20),
      Math.round(color.getZ(vertex) * 20),
    ].join("|"));
  }
  assert.ok(warmVertices > data.exitApronSurfaceVertexCount * 0.95,
    "the full handoff envelope must remain warm rock rather than atlas green");
  assert.ok(maximumHeightM - minimumHeightM > 350,
    "entry/terminal fades and faceted shoulders must avoid one flat tan slab");
  assert.ok(fullCoverMaximumHeightM <= profile.routeAltitudeM + 70.01,
    "outboard exit shoulders must not become a wall across the open horizon");
  assert.ok(fullCoverCenterMaximumHeightM < profile.routeAltitudeM - 70,
    "the full-cover centreline must retain a clearly open flight corridor");
  assert.ok(normalBuckets.size >= 30,
    "the exit surface needs enough distinct facets to stop reading as a smooth tan sheet");
  assert.ok(colorBuckets.size >= 16,
    "terraces and erosion need visible rock-tone separation through the open mouth");
  for (let vertex = data.exitDrainageVertexStart;
    vertex < data.exitDrainageVertexStart + data.exitDrainageVertexCount; vertex += 1) {
    assert.equal(water.getX(vertex), 1,
      "the scale-giving exit drainage must retain its water presentation channel");
    assert.ok(color.getZ(vertex) > color.getX(vertex),
      "the exit drainage must break up the apron with a dark teal ribbon");
  }
  for (let offset = data.exitApronIndexStart;
    offset < data.exitApronIndexStart + data.exitApronIndexCount; offset += 1) {
    assert.ok(index.getX(offset) >= data.exitApronVertexStart,
      "exit-cover triangles must never enter the collision-matched authority grid");
  }

  // Exact first hardware reject sample: x/y/z, heading, pitch and bank come from
  // first-run-ai-flight.json at the first state z >= -5 km capture. FlightView mirrors sim north
  // into render -Z, so state z=-4999.602 correctly places this camera at render z=+4999.602.
  // These rays pass through the pale wedge in that 1440x900 frame; before the apron all three
  // missed the canyon mesh entirely.
  const deg = Math.PI / 180;
  const camera = new THREE.PerspectiveCamera(66, 1.6, 0.06, 680_000);
  camera.position.set(150.254, 323.349, 4_999.602);
  camera.quaternion.setFromEuler(new THREE.Euler(
    1.51 * deg,
    -24.38 * deg,
    23.88 * deg,
    "YXZ",
  ));
  camera.updateMatrixWorld(true);
  mesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (const probe of [
    new THREE.Vector2(-0.50, 0.18),
    new THREE.Vector2(-0.375, 0.12),
    new THREE.Vector2(-0.25, 0.12),
  ]) {
    raycaster.setFromCamera(probe, camera);
    const hit = raycaster.intersectObject(mesh, false)[0];
    assert.ok(hit, `banked reject ray ${probe.toArray()} must hit warm canyon geometry`);
    const hitIndexOffset = hit.faceIndex * 3;
    assert.ok(hitIndexOffset >= data.exitApronIndexStart
      && hitIndexOffset < data.exitApronIndexStart + data.exitApronIndexCount,
    `banked reject ray ${probe.toArray()} hit outside the exit apron`);
    const hitNorthM = -hit.point.z;
    assert.ok(hitNorthM >= data.exitApronStartNorthM
      && hitNorthM <= data.exitApronEndNorthM,
    `banked reject ray ${probe.toArray()} hit outside the longitudinal cover`);
    for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
      const warmRock = color.getX(vertex) > color.getY(vertex)
        && color.getY(vertex) > color.getZ(vertex);
      const drainage = water.getX(vertex) > 0.5
        && color.getZ(vertex) > color.getX(vertex);
      assert.ok(warmRock || drainage,
        `banked reject ray ${probe.toArray()} did not hit canyon rock or drainage`);
    }
    assert.ok(hit.distance < 6_000,
      `banked reject ray ${probe.toArray()} was not covered before the old atlas seam`);
  }

  // The same hardware pose must see several genuinely distinct facets and rock bands, not just
  // one technically warm polygon stretched across the former atlas hole. These sparse samples
  // cover the broad left/middle apron that read as a smooth tan sheet in Metal capture 358.
  const poseNormalBuckets = new Set();
  const poseFaceNormalBuckets = new Set();
  const poseColorBuckets = new Set();
  let poseApronHits = 0;
  for (const y of [0.30, 0.18, 0.06, -0.06, -0.18]) {
    for (const x of [-0.75, -0.625, -0.50, -0.375, -0.25]) {
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit) continue;
      const hitIndexOffset = hit.faceIndex * 3;
      if (hitIndexOffset < data.exitApronSurfaceIndexStart
          || hitIndexOffset >= data.exitApronSurfaceIndexStart
            + data.exitApronSurfaceIndexCount) continue;
      poseApronHits += 1;
      poseFaceNormalBuckets.add([
        Math.round(hit.face.normal.x * 12),
        Math.round(hit.face.normal.y * 12),
        Math.round(hit.face.normal.z * 12),
      ].join("|"));
      for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
        poseNormalBuckets.add([
          Math.round(normal.getX(vertex) * 12),
          Math.round(normal.getY(vertex) * 12),
          Math.round(normal.getZ(vertex) * 12),
        ].join("|"));
        poseColorBuckets.add([
          Math.round(color.getX(vertex) * 20),
          Math.round(color.getY(vertex) * 20),
          Math.round(color.getZ(vertex) * 20),
        ].join("|"));
      }
    }
  }
  assert.ok(poseApronHits >= 5,
    `the exact banked composition must retain apron coverage only through the open mouth; got ${poseApronHits}`);
  assert.ok(poseNormalBuckets.size >= 8,
    `the exact banked composition must resolve multiple facets instead of a smooth shelf; got ${poseNormalBuckets.size}`);
  assert.ok(poseFaceNormalBuckets.size >= 5,
    `flat-shaded triangles in the exact banked view must present several distinct planes; got ${poseFaceNormalBuckets.size}`);
  assert.ok(poseColorBuckets.size >= 7,
    `the exact banked composition must retain several warm strata/erosion tones; got ${poseColorBuckets.size}`);

  valley.dispose();
});

test("one-draw rock mantle hides the atlas seam outside the flyable canyon", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const valley = createFirstRunValleyPresentation(THREE);
  valley.update(valleyState);
  const mesh = valley.object3d.getObjectByName("FIRST_RUN_VALLEY_RIDGES");
  const geometry = mesh.geometry;
  const data = geometry.userData;
  const position = geometry.getAttribute("position");
  const color = geometry.getAttribute("color");
  const normal = geometry.getAttribute("normal");
  const index = geometry.index;
  const authorityVertexCount = (data.northSegments + 1) * (data.lateralSegments + 1);

  assert.equal(valley.diagnostics().drawCount, 1);
  assert.equal(valley.object3d.children.length, 1);
  assert.equal(data.backdropPresentationOnly, true);
  assert.equal(data.authorityIndexCount, data.northSegments * data.lateralSegments * 6);
  assert.equal(data.authorityTriangleCount, 163_840,
    "the scenic seam cover must not add triangles to collision authority");
  assert.equal(data.backdropIndexStart - data.authorityIndexCount, 1_408 * 3,
    "river and wash remain the only scenic indices before the backdrop");
  assert.equal(data.backdropIndexCount, data.backdropTriangleCount * 3);
  assert.ok(data.backdropInnerOffsetM > profile.crestOffsetM,
    "the mantle must begin behind the collision crest, never in the flyable floor");
  assert.ok(data.backdropOuterOffsetM >= profile.outerOffsetM + 3_200,
    "the warm mantle must extend far enough behind the wall to bury the green atlas edge");
  assert.ok(data.backdropStartNorthM < profile.southExtentNorthM);
  assert.ok(data.backdropEndNorthM > profile.northExtentNorthM);

  for (let offset = 0; offset < data.authorityIndexCount; offset += 1) {
    assert.ok(index.getX(offset) < authorityVertexCount,
      "authority indices must remain confined to the analytic grid");
  }
  for (let offset = data.backdropIndexStart;
    offset < data.backdropIndexStart + data.backdropIndexCount; offset += 1) {
    assert.ok(index.getX(offset) >= data.backdropVertexStart,
      "backdrop indices must never be folded into the authority grid");
  }

  let minimumOffsetM = Infinity;
  let maximumOffsetM = 0;
  let outsideAtlasEdgeVertices = 0;
  let interiorBackdropHeightM = -Infinity;
  let terminalBackdropHeightM = -Infinity;
  let warmBackdropVertices = 0;
  let upwardBackdropVertices = 0;
  for (let vertex = data.backdropVertexStart;
    vertex < data.backdropVertexStart + data.backdropVertexCount; vertex += 1) {
    const eastM = position.getX(vertex);
    const northM = -position.getZ(vertex);
    const centerEastM = firstRunValleyCenterEastM(profile, northM);
    const offsetM = Math.abs(eastM - centerEastM);
    minimumOffsetM = Math.min(minimumOffsetM, offsetM);
    maximumOffsetM = Math.max(maximumOffsetM, offsetM);
    if (offsetM > profile.outerOffsetM + 1) outsideAtlasEdgeVertices += 1;
    if (northM > profile.entryNorthM + profile.curveWavelengthM * 0.2
        && northM < profile.entryNorthM + profile.curveWavelengthM * 0.8
        && offsetM > profile.outerOffsetM) {
      interiorBackdropHeightM = Math.max(interiorBackdropHeightM, position.getY(vertex));
    }
    if (northM <= profile.southExtentNorthM || northM >= profile.northExtentNorthM) {
      terminalBackdropHeightM = Math.max(terminalBackdropHeightM, position.getY(vertex));
    }
    if (color.getX(vertex) > color.getY(vertex)
        && color.getY(vertex) > color.getZ(vertex)) warmBackdropVertices += 1;
    if (normal.getY(vertex) > 0) upwardBackdropVertices += 1;
  }
  assert.ok(minimumOffsetM >= data.backdropInnerOffsetM - 0.01);
  assert.ok(maximumOffsetM >= data.backdropOuterOffsetM - 0.01);
  assert.ok(outsideAtlasEdgeVertices > data.backdropVertexCount * 0.45,
    "most backdrop samples must cover ground beyond the former atlas seam");
  assert.ok(interiorBackdropHeightM > profile.floorHeightM + 300,
    "the middle-route mantle must stay behind the visible rim, not collapse into a flat apron");
  assert.ok(terminalBackdropHeightM < profile.floorHeightM,
    "the entry and pop-out skirts must fade below the route floor");
  assert.ok(warmBackdropVertices > data.backdropVertexCount * 0.9,
    "the atlas cover must retain the canyon's warm rock identity");
  assert.equal(upwardBackdropVertices, data.backdropVertexCount,
    "the one-sided canyon material must render every mantle face from the cockpit");

  valley.dispose();
});

test("triangulated ridge is conservatively recessed inside analytic collision authority", () => {
  const profile = firstRunValleyProfileFromState(valleyState);
  const weights = [
    [1 / 3, 1 / 3, 1 / 3],
    [0.5, 0.5, 0],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
    [0.6, 0.2, 0.2],
    [0.2, 0.6, 0.2],
    [0.2, 0.2, 0.6],
  ];
  for (const options of [
    { northSegments: 512, lateralSegments: 160, label: "desktop" },
    { northSegments: 448, lateralSegments: 144, meshRecessM: 6, label: "mobile" },
  ]) {
    const valley = createFirstRunValleyPresentation(THREE, options);
    valley.update(valleyState);
    const geometry = valley.object3d.getObjectByName("FIRST_RUN_VALLEY_RIDGES").geometry;
    assert.equal(geometry.userData.meshRecessM, FIRST_RUN_VALLEY_MESH_RECESS_M,
      `${options.label} must retain the proven conservative recess floor`);
    const position = geometry.getAttribute("position");
    const index = geometry.index;
    let maximumOvershootM = -Infinity;
    let maximumUndershootM = 0;
    let maximumOvershootAt = null;
    let checked = 0;
    const authorityIndexCount = geometry.userData.authorityIndexCount;
    for (let offset = 0; offset < authorityIndexCount; offset += 3) {
      const ids = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      for (const weight of weights) {
        let eastM = 0;
        let northM = 0;
        let renderedM = 0;
        for (let vertex = 0; vertex < 3; vertex += 1) {
          eastM += position.getX(ids[vertex]) * weight[vertex];
          northM += -position.getZ(ids[vertex]) * weight[vertex];
          renderedM += position.getY(ids[vertex]) * weight[vertex];
        }
        const authorityM = firstRunValleyAuthoredHeightM(profile, eastM, northM);
        if (authorityM === null) continue;
        const overshootM = renderedM - authorityM;
        if (overshootM > maximumOvershootM) {
          maximumOvershootM = overshootM;
          maximumOvershootAt = { eastM, northM, renderedM, authorityM };
        }
        maximumUndershootM = Math.max(maximumUndershootM, -overshootM);
        checked += 1;
      }
    }
    assert.ok(checked > 20_000, `${options.label} grid did not sample enough authority faces`);
    assert.ok(maximumOvershootM <= 0.05,
      `${options.label} rendered terrain exceeded authority by ${maximumOvershootM.toFixed(3)} m`
        + ` at ${JSON.stringify(maximumOvershootAt)}`);
    assert.ok(maximumUndershootM < 33,
      `${options.label} visual recess ${maximumUndershootM.toFixed(3)} m is too far below collision`);
    valley.dispose();
  }
  assert.equal(FIRST_RUN_VALLEY_MESH_RECESS_M, 15.75);
});

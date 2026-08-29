import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approachJoinGuidanceGates,
  createGuidancePath,
  firstRunIngressGuidanceGates,
  gateToScenePosition,
  GUIDANCE_PATH_DEFAULTS,
  rtbGuidanceGates,
} from "../guidance_path.js";

const approachGates = [
  { east_m: 100, north_m: 200, up_m: 300, half_m: 400, target_ktas: 250, dirty: 0, active: 0 },
  { east_m: 500, north_m: 600, up_m: 700, half_m: 800, target_ktas: 200, dirty: 1, active: 1 },
];

// Minimal THREE stand-in: the module must not need a GL context to be testable.
class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  add(v) { return this.set(this.x + v.x, this.y + v.y, this.z + v.z); }
  sub(v) { return this.set(this.x - v.x, this.y - v.y, this.z - v.z); }
  negate() { return this.set(-this.x, -this.y, -this.z); }
  lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
  normalize() {
    const l = Math.sqrt(this.lengthSq()) || 1;
    return this.set(this.x / l, this.y / l, this.z / l);
  }
  setScalar(v) { return this.set(v, v, v); }
}
const THREE = {
  Group: class { constructor() { this.children = []; } add(o) { this.children.push(o); }
    removeFromParent() {} },
  Mesh: class {
    constructor(g, m) {
      this.geometry = g; this.material = m; this.visible = false;
      this.position = new V3(); this.scale = new V3(1, 1, 1);
      this.lookAtTarget = null;
    }
    lookAt(v) { this.lookAtTarget = new V3(v.x, v.y, v.z); }
  },
  PlaneGeometry: class { dispose() {} },
  ShaderMaterial: class {
    constructor(o) { Object.assign(this, o); }
    dispose() {}
  },
  Color: class { constructor(c) { this.value = c; } set(c) { this.value = c; return this; } },
  Vector3: V3,
  AdditiveBlending: "additive",
  NormalBlending: "normal",
  DoubleSide: "double",
};

const gatesJson = JSON.stringify([
  { id: "a", label: "A", east_m: 100, north_m: 200, up_m: 300, half_m: 400,
    target_ktas: 250, dirty: false, active: false },
  { id: "b", label: "B", east_m: 500, north_m: 600, up_m: 700, half_m: 800,
    target_ktas: 200, dirty: true, active: true },
]);

const firstRunState = Object.freeze({
  mission_definition_id: "mission.modern.visual-merge.first-run-valley.v1",
  first_run_weapons_cold: true,
  first_run_valley_available: true,
  first_run_valley_center_east_m: 0,
  first_run_valley_entry_north_m: -6000,
  first_run_valley_popout_north_m: -1200,
  first_run_valley_route_alt_m: 240,
  first_run_valley_floor_height_m: 155,
  first_run_valley_floor_blend_drop_m: 110,
  first_run_valley_floor_half_width_m: 430,
  first_run_valley_crest_offset_m: 1250,
  first_run_valley_outer_offset_m: 3400,
  first_run_valley_west_ridge_rise_m: 760,
  first_run_valley_east_ridge_rise_m: 660,
  first_run_valley_curve_amplitude_m: 430,
  first_run_valley_curve_wavelength_m: 4800,
  first_run_valley_south_extent_north_m: -7600,
  first_run_valley_south_full_north_m: -6800,
  first_run_valley_popout_fade_start_north_m: -2600,
  first_run_valley_north_extent_north_m: -750,
  px: 0,
  py: 260,
  pz: -6000,
});

test("world north maps to scene -Z, matching the player transform", () => {
  const p = gateToScenePosition({ eastM: 100, northM: 200, upM: 300 });
  assert.deepEqual(p, { x: 100, y: 300, z: -200 });
});

test("the ladder is drawn, one soft volume per gate, scaled to authored tolerance", () => {
  const path = createGuidancePath(THREE);
  const drawn = path.update({ recovery_gates_json: gatesJson, player_rtb_active: true });
  assert.equal(drawn, 2, "both gates must be drawn");
  assert.equal(path.object3d.visible, true);

  const meshes = path.object3d.children.filter((m) => m.visible);
  assert.equal(meshes.length, 2);
  // Scale is the authored half-width, so the volume thins out exactly at the kernel's tolerance
  // rather than at some tighter line invented by the renderer.
  assert.equal(meshes[0].scale.x, 400);
  assert.equal(meshes[1].scale.x, 800);
  assert.equal(meshes[0].position.z, -200, "north must be negated into the scene");
});

test("an authored ladder can forbid ownship-relative chevrons so world cues stay fixed", () => {
  const path = createGuidancePath(THREE);
  const first = {
    approach_guidance_active: true,
    approach_join_guidance_active: false,
    approach_gates: approachGates,
    approach_gate_count: approachGates.length,
    px: -2_000,
    py: 120,
    pz: -2_000,
  };
  assert.equal(path.update(first), approachGates.length);
  assert.equal(path.object3d.userData.mode, "procedure");
  assert.equal(path.object3d.userData.joinGateCount, 0);
  const before = path.object3d.children
    .filter((mesh) => mesh.visible)
    .map((mesh) => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }));

  assert.equal(path.update({ ...first, px: -500, py: 260, pz: -900 }), approachGates.length);
  const after = path.object3d.children
    .filter((mesh) => mesh.visible)
    .map((mesh) => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }));
  assert.deepEqual(after, before,
    "moving ownship must not move an explicitly world-locked guidance ladder");
});

test("guidance never occludes: additive, depth-tested, never depth-writing, well under opaque", () => {
  const path = createGuidancePath(THREE);
  path.update({ recovery_gates_json: gatesJson, player_rtb_active: true });
  const material = path.object3d.children[0].material;
  assert.equal(material.depthWrite, false, "guidance must never write depth");
  assert.equal(material.depthTest, true, "a gate behind a hill stays behind that hill");
  assert.equal(material.blending, "additive", "it must lighten the world, not cover it");
  assert.ok(GUIDANCE_PATH_DEFAULTS.gateOpacity <= 0.25,
    "the pilot has to be able to see past it and disagree");
  assert.ok(GUIDANCE_PATH_DEFAULTS.activeOpacity <= 0.45);
});

test("procedure and RTB each share one shader program, so boot does not stutter", () => {
  const seen = new Set();
  const counting = {
    ...THREE,
    ShaderMaterial: class extends THREE.ShaderMaterial {
      constructor(o) { super(o); seen.add(this); }
    },
  };
  const path = createGuidancePath(counting);
  path.update({ recovery_gates_json: gatesJson, player_rtb_active: true });
  // 24 materials meant 24 program compilations in the first frames after boot. One shared soft
  // procedure shader plus one shared chevron shader is still exactly two bounded compiles.
  assert.equal(seen.size, 2,
    `guidance must compile two shared shader programs, not ${seen.size}`);
  const meshes = path.object3d.children;
  assert.equal(new Set(meshes.map((m) => m.material)).size, 1,
    "every currently drawn procedure gate shares the procedure material");
});

test("no recovery procedure means nothing is drawn at all", () => {
  const path = createGuidancePath(THREE);
  assert.equal(path.update({}), 0);
  assert.equal(path.object3d.visible, false);
});

test("first flight gets a stable sage centreline through the valley to the real pop-out", () => {
  const gates = firstRunIngressGuidanceGates(firstRunState);
  assert.equal(gates.length, GUIDANCE_PATH_DEFAULTS.ingressGateCount);
  assert.equal(gates.every((gate) => gate.ingress === true && gate.rtb === true), true);
  assert.equal(gates.every((gate) => gate.upM === 240), true,
    "the world path must use authority altitude rather than moving with live ownship py");
  assert.equal(gates.at(-1).northM, firstRunState.first_run_valley_popout_north_m);
  assert.notEqual(gates[1].eastM, gates.at(-2).eastM,
    "the breadcrumbs should follow the published drainage meander");

  const path = createGuidancePath(THREE);
  assert.equal(path.update(firstRunState), gates.length);
  assert.equal(path.object3d.userData.mode, "first-run-ingress");
  const first = path.object3d.children[0];
  first.onBeforeRender();
  assert.equal(first.userData.guidanceStyle, "ingress-chevron");
  assert.equal(first.material.uniforms.uColor.value.value,
    GUIDANCE_PATH_DEFAULTS.ingressActiveColor);
  assert.equal(first.position.y, 240);
});

test("valley route disappears immediately at weapons-hot and malformed geometry fails quiet", () => {
  const path = createGuidancePath(THREE);
  assert.ok(path.update(firstRunState) > 0);
  assert.equal(path.update({ ...firstRunState, first_run_weapons_cold: false }), 0);
  assert.equal(path.object3d.visible, false);
  assert.equal(firstRunIngressGuidanceGates({
    ...firstRunState,
    first_run_valley_popout_north_m: null,
  }).length, 0);
});

test("an authored recovery ladder stays hidden until authority publishes recovery intent", () => {
  const path = createGuidancePath(THREE);
  assert.equal(path.update({ recovery_gates_json: gatesJson }), 0);
  assert.equal(path.object3d.visible, false);

  assert.equal(path.update({
    recovery_gates_json: gatesJson,
    player_rtb_active: true,
  }), approachGates.length);
  assert.equal(path.object3d.userData.mode, "procedure");
});

test("direct RTB builds a bounded golden breadcrumb corridor to published Home Plate", () => {
  const state = {
    px: 0,
    py: 1_500,
    pz: 0,
    player_rtb_active: true,
    rtb_steer: true,
    recovery_point_known: true,
    mesh_home_place_id: "home.runway",
    mesh_home_east_m: 8_000,
    mesh_home_north_m: 0,
    golden_path_valid: true,
    golden_path_target_alt_m: 500,
  };
  const gates = rtbGuidanceGates(state);
  assert.ok(gates.length >= GUIDANCE_PATH_DEFAULTS.rtbMinGateCount);
  assert.ok(gates.length <= GUIDANCE_PATH_DEFAULTS.rtbGateCount);
  assert.equal(gates.length, 9,
    "a 6 km preview stays sparse instead of filling all ten slots by default");
  assert.equal(gates[0].active, true);
  assert.equal(gates.every((gate) => gate.rtb === true), true);
  assert.equal(gates[0].halfM, GUIDANCE_PATH_DEFAULTS.rtbVisualHalfM);
  assert.equal(gates.at(-1).halfM, GUIDANCE_PATH_DEFAULTS.rtbFarVisualHalfM,
    "far chevrons compensate for perspective without changing authority tolerances");
  assert.ok(gates[0].eastM > state.px, "first cue starts ahead of ownship");
  assert.ok(gates.at(-1).eastM <= GUIDANCE_PATH_DEFAULTS.rtbMaxDrawM
    + GUIDANCE_PATH_DEFAULTS.rtbLeadM + 1);
  assert.equal(gates[0].upM, state.py, "long transit starts level instead of inventing a dive");
  assert.ok(gates.at(-1).upM < state.py, "far end blends toward the authority schedule");

  const path = createGuidancePath(THREE);
  assert.equal(path.update(state), gates.length);
  assert.equal(path.object3d.visible, true);
  assert.equal(path.object3d.userData.mode, "rtb");
  assert.equal(path.object3d.userData.drawnGateCount, gates.length);
  assert.equal(path.object3d.userData.suppressionReason, null);
  const first = path.object3d.children[0];
  first.onBeforeRender();
  assert.equal(first.userData.guidanceStyle, "rtb-chevron");
  assert.equal(first.material.blending, "normal",
    "RTB chevrons use normal alpha instead of additive white bloom");
  assert.match(first.material.fragmentShader, /stroke/u,
    "RTB material is an open chevron, not the procedure's filled probability disc");
  assert.equal(first.material.uniforms.uColor.value.value,
    GUIDANCE_PATH_DEFAULTS.rtbActiveColor);
  assert.equal(first.material.uniforms.uOpacity.value,
    GUIDANCE_PATH_DEFAULTS.rtbActiveOpacity);
});

test("Rapier balloon gallery draws the outbound intercept highway before RTB", () => {
  const state = {
    px: 0,
    py: 600,
    pz: 0,
    bandit_alive: true,
    rapier_mission_available: true,
    rapier_pattern_only: false,
    rapier_job: "BALLOON",
    rapier_zoom_lob: false,
    rapier_mission_phase: 2,
    rapier_guidance_x: -65_000,
    rapier_guidance_y: 6_865,
    rapier_guidance_z: 0,
  };
  const gates = rtbGuidanceGates(state);
  assert.ok(gates.length >= 3);
  assert.equal(gates.every((gate) => gate.intercept === true), true);
  assert.ok(gates[0].eastM < 0, "the first chevron points west toward the gallery");

  const path = createGuidancePath(THREE);
  assert.equal(path.update(state), gates.length);
  assert.equal(path.object3d.userData.mode, "intercept");
  assert.equal(path.object3d.children[0].userData.guidanceStyle, "intercept-chevron");
  path.object3d.children[0].onBeforeRender();
  assert.equal(path.object3d.children[0].material.uniforms.uColor.value.value,
    GUIDANCE_PATH_DEFAULTS.interceptActiveColor);
  assert.notEqual(GUIDANCE_PATH_DEFAULTS.interceptActiveColor,
    GUIDANCE_PATH_DEFAULTS.rtbActiveColor,
    "outbound intercept and recovery must not share the same amber semantic");
});

test("an active Case I gate gets a visible conformal join corridor", () => {
  const state = {
    px: 0,
    py: 1_200,
    pz: 0,
    approach_guidance_active: true,
    approach_gate_count: 2,
    approach_gates: approachGates,
  };
  const authored = [
    { id: "initial", eastM: 5_500, northM: 800, upM: 244, halfM: 450, active: true },
    { id: "break", eastM: 6_200, northM: 900, upM: 244, halfM: 350, active: false },
  ];
  const join = approachJoinGuidanceGates(state, authored);
  assert.ok(join.length >= 3);
  assert.equal(join.every((gate) => gate.rtb === true && gate.join === true), true);
  assert.ok(join[0].eastM > state.px, "the first chevron starts ahead toward INITIAL");
  assert.ok(join.at(-1).eastM < authored[0].eastM,
    "the chevron chain hands off before the authored gate instead of duplicating it");

  const path = createGuidancePath(THREE);
  const drawn = path.update(state);
  assert.ok(drawn > approachGates.length, "join chevrons and authored gates are both drawn");
  assert.equal(path.object3d.userData.mode, "approach-join");
  assert.equal(path.object3d.userData.drawnGateCount, drawn);
  assert.ok(path.object3d.userData.joinGateCount >= 3);
  assert.equal(path.object3d.children[0].userData.guidanceStyle, "rtb-chevron");
});

test("join chevrons never starve authored procedure gates from the mesh budget", () => {
  const authored = Array.from({ length: 20 }, (_, index) => ({
    east_m: 4_000 + index * 100,
    north_m: 500 + index * 20,
    up_m: 250 - index * 2,
    half_m: 300,
    target_ktas: 250 - index,
    dirty: false,
    active: index === 0,
  }));
  const path = createGuidancePath(THREE);
  const drawn = path.update({
    px: 0, py: 1_200, pz: 0,
    approach_guidance_active: true,
    approach_gate_count: authored.length,
    approach_gates: authored,
  });
  assert.equal(drawn, GUIDANCE_PATH_DEFAULTS.maxGates);
  assert.equal(path.object3d.userData.joinGateCount, 4,
    "only spare slots may be used for join chevrons");
  const visible = path.object3d.children.filter((mesh) => mesh.visible);
  const finalAuthored = authored.at(-1);
  assert.equal(visible.at(-1).position.x, finalAuthored.east_m);
  assert.equal(visible.at(-1).position.z, -finalAuthored.north_m);
});

test("carrier return follows the authority's current route fix, not generic Home Plate", () => {
  const gates = rtbGuidanceGates({
    px: 1_000,
    py: 1_200,
    pz: 2_000,
    player_rtb_active: true,
    rtb_steer: true,
    recovery_point_known: true,
    mesh_home_east_m: -20_000,
    mesh_home_north_m: -20_000,
    carrier_sortie_route_active: true,
    carrier_sortie_route_rtb_requested: true,
    carrier_sortie_route_fix: "RETURN_INITIAL",
    carrier_sortie_route_target_x: 4_000,
    carrier_sortie_route_target_y: 900,
    carrier_sortie_route_target_z: 2_000,
  });
  assert.ok(gates.length > 0);
  assert.ok(gates.every((gate) => gate.eastM > 1_000 && gate.northM === 2_000));
  assert.match(gates[0].id, /carrier-RETURN_INITIAL/);
});

test("carrier RTB fix outranks a stale land recovery ladder in the scene update", () => {
  const path = createGuidancePath(THREE);
  const drawn = path.update({
    px: 1_000,
    py: 1_200,
    pz: 2_000,
    recovery_gates_json: gatesJson,
    recovery_point_known: true,
    mesh_home_east_m: -20_000,
    mesh_home_north_m: -20_000,
    carrier_sortie_route_active: true,
    carrier_sortie_route_rtb_requested: true,
    carrier_sortie_route_fix: "RETURN_INITIAL",
    carrier_sortie_route_target_x: 4_000,
    carrier_sortie_route_target_y: 900,
    carrier_sortie_route_target_z: 2_000,
  });
  assert.ok(drawn >= 3);
  assert.equal(path.object3d.userData.mode, "rtb");
  const first = path.object3d.children[0];
  assert.ok(first.position.x > 1_000 && first.position.x < 4_000,
    "the first cue leads toward the live carrier-route fix");
  assert.equal(first.position.z, -2_000);
});

test("Rapier EGRESS and RECOVERY phases activate the shared RTB chevrons", () => {
  const base = {
    px: 0,
    py: 12_000,
    pz: 0,
    rapier_mission_available: true,
    recovery_point_known: true,
    mesh_home_place_id: "rapier.dispersed-strip",
    mesh_home_east_m: 40_000,
    mesh_home_north_m: -20_000,
  };
  for (const phase of [11, 12, 13]) {
    const gates = rtbGuidanceGates({ ...base, rapier_mission_phase: phase });
    assert.ok(gates.length >= 3, `Rapier phase ${phase} must publish a transit corridor`);
    assert.equal(gates.every((gate) => gate.rtb === true), true);
  }
  assert.deepEqual(rtbGuidanceGates({ ...base, rapier_mission_phase: 10 }), [],
    "ATTACK is not RTB");
  assert.deepEqual(rtbGuidanceGates({
    ...base,
    rapier_mission_phase: 13,
    rapier_pattern_only: true,
  }), [], "circuit school keeps its authored procedure instead of a coarse transit chain");
});

test("a requested carrier return with a malformed fix never falls through to land Home Plate", () => {
  assert.deepEqual(rtbGuidanceGates({
    px: 1_000,
    py: 1_200,
    pz: 2_000,
    player_rtb_active: true,
    recovery_point_known: true,
    mesh_home_east_m: -20_000,
    mesh_home_north_m: -20_000,
    carrier_sortie_route_active: true,
    carrier_sortie_route_rtb_requested: true,
    carrier_sortie_route_target_x: null,
    carrier_sortie_route_target_y: 900,
    carrier_sortie_route_target_z: 2_000,
  }), []);
});

test("RTB breadcrumbs fail closed without active intent or a finite destination", () => {
  assert.deepEqual(rtbGuidanceGates({
    px: 0, py: 1_000, pz: 0,
    recovery_point_known: true,
    mesh_home_east_m: 2_000,
    mesh_home_north_m: 0,
  }), []);
  assert.deepEqual(rtbGuidanceGates({
    px: 0, py: 1_000, pz: 0,
    player_rtb_active: true,
    recovery_point_known: true,
  }), []);
});

test("active approach guidance prefers hot sample gates over the PROC ladder", () => {
  const path = createGuidancePath(THREE);
  const drawn = path.update({
    approach_guidance_active: true,
    approach_gate_count: 2,
    approach_gates: approachGates,
    recovery_gates_json: gatesJson,
  });
  assert.equal(drawn, 2);
  const meshes = path.object3d.children.filter((m) => m.visible);
  assert.equal(meshes[0].position.z, -200);
  assert.equal(meshes[1].scale.x, 800);
  assert.equal(path.object3d.userData.mode, "procedure",
    "authored approach gates replace the coarse RTB breadcrumb chain");
});

test("an active approach with an empty frame hides instead of flashing coarse RTB crumbs", () => {
  const path = createGuidancePath(THREE);
  assert.equal(path.update({
    px: 0,
    py: 1_000,
    pz: 0,
    approach_guidance_active: true,
    approach_gate_count: 0,
    approach_gates: [],
    approach_gates_json: "[]",
    player_rtb_active: true,
    recovery_point_known: true,
    mesh_home_east_m: 2_000,
    mesh_home_north_m: 0,
  }), 0);
  assert.equal(path.object3d.visible, false);
  assert.equal(path.object3d.userData.drawnGateCount, 0);
  assert.equal(path.object3d.userData.suppressionReason, "approach-empty");
});

test("one empty active-approach snapshot cannot blank an established highway", () => {
  const path = createGuidancePath(THREE);
  const valid = {
    px: 0,
    py: 1_000,
    pz: 0,
    approach_guidance_active: true,
    approach_gate_count: approachGates.length,
    approach_gates: approachGates,
  };
  const drawn = path.update(valid);
  assert.ok(drawn > 0);
  const firstX = path.object3d.children[0].position.x;

  const held = path.update({
    ...valid,
    approach_gate_count: 0,
    approach_gates: [],
    approach_gates_json: "[]",
  });
  assert.equal(held, drawn);
  assert.equal(path.object3d.visible, true);
  assert.equal(path.object3d.children[0].position.x, firstX);
  assert.equal(path.object3d.userData.continuityHeld, true);

  path.update({ ...valid, approach_guidance_active: false, approach_gates: [] });
  assert.equal(path.object3d.userData.continuityHeld, false,
    "ending approach ownership releases the cached ladder");
});

test("an empty frame from a new sortie cannot replay the previous procedure", () => {
  const path = createGuidancePath(THREE);
  const drawn = path.update({
    approach_guidance_active: true,
    guidance_sortie_sequence: 41,
    recovery_procedure_kind: 2,
    approach_gate_count: approachGates.length,
    approach_gates: approachGates,
  });
  assert.ok(drawn > 0);

  const nextSortie = path.update({
    approach_guidance_active: true,
    guidance_sortie_sequence: 42,
    recovery_procedure_kind: 2,
    approach_gate_count: 0,
    approach_gates: [],
  });
  assert.equal(nextSortie, 0);
  assert.equal(path.object3d.visible, false);
  assert.equal(path.object3d.userData.continuityHeld, false);
  assert.equal(path.object3d.userData.suppressionReason, "approach-empty");
});

test("approach ownership invalidates a same-bucket RTB breadcrumb cache", () => {
  const path = createGuidancePath(THREE);
  const rtb = {
    px: 0,
    py: 1_000,
    pz: 0,
    player_rtb_active: true,
    recovery_point_known: true,
    mesh_home_east_m: 5_000,
    mesh_home_north_m: 0,
  };
  path.update(rtb);
  const first = path.object3d.children[0];
  const oldX = first.position.x;

  assert.equal(path.update({
    ...rtb,
    approach_guidance_active: true,
    approach_gates: [],
    approach_gates_json: "[]",
  }), 0);
  path.update({ ...rtb, px: 40 });
  assert.ok(first.position.x > oldX + 30,
    "leaving approach must rebuild breadcrumbs even inside the 100 m motion bucket");
});

test("near-home crumbs persist through the former 80 metre blackout", () => {
  const gates = rtbGuidanceGates({
    px: 0,
    py: 100,
    pz: 0,
    player_rtb_active: true,
    recovery_point_known: true,
    mesh_home_east_m: 60,
    mesh_home_north_m: 0,
  });
  assert.equal(gates.length, 3);
  assert.ok(gates.at(-1).eastM <= 60);
});

test("RTB breadcrumb cache follows authority altitude schedule changes without waiting for motion", () => {
  const path = createGuidancePath(THREE);
  const state = {
    px: 0,
    py: 1_500,
    pz: 0,
    player_rtb_active: true,
    recovery_point_known: true,
    mesh_home_east_m: 5_000,
    mesh_home_north_m: 0,
    golden_path_valid: true,
    golden_path_target_alt_m: 500,
  };
  path.update(state);
  const drawn = path.update(state);
  const last = path.object3d.children[drawn - 1];
  const firstAltitudeM = last.position.y;

  path.update({ ...state, golden_path_target_alt_m: 900 });
  assert.ok(last.position.y > firstAltitudeM,
    "the same-position frame must consume the revised authority descent schedule");
});

test("hot approach gates update when only north or a non-active altitude changes", () => {
  const path = createGuidancePath(THREE);
  path.update({
    approach_guidance_active: true,
    approach_gate_count: 2,
    approach_gates: approachGates,
  });
  const first = path.object3d.children[0];
  assert.equal(first.position.z, -200);

  path.update({
    approach_guidance_active: true,
    approach_gate_count: 2,
    approach_gates: [
      { ...approachGates[0], north_m: 325, up_m: 425 },
      approachGates[1],
    ],
  });

  assert.equal(first.position.z, -325);
  assert.equal(first.position.y, 425);
});

test("production updates and disposes shared guidance outside the CASEVAC-only branch", () => {
  const appSource = readFileSync(new URL("../../../app.js", import.meta.url), "utf8");
  assert.equal((appSource.match(/this\.guidancePath\?\.update\(state\);/g) ?? []).length, 1,
    "one shared world-guidance update owns every mission frame");
  assert.match(appSource,
    /this\.playerPosition\.set\(state\.px, state\.py, -state\.pz\);[\s\S]{0,700}?this\.guidancePath\?\.update\(state\);/,
    "the update belongs to the common flight frame after ownship pose is projected");
  const casevacBody = appSource.match(/syncCasevacPresentation\(state\) \{([\s\S]*?)\n  update\(state, dt,/)?.[1] ?? "";
  assert.doesNotMatch(casevacBody, /guidancePath\?\.update/,
    "fixed-wing guidance must never be trapped in CASEVAC again");
  assert.match(appSource, /async dispose\(\) \{[\s\S]*?this\.guidancePath\?\.dispose\(\);/,
    "the shared guidance graph is released with the scene");
  assert.match(appSource, /presentation_guidance_drawn_gates/,
    "telemetry records what the scene actually drew, not only authority intent");
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createHotSnapshotSource,
  decodeHotFrame,
  parseHotLayout,
} from "../hot_snapshot.js";

// A miniature layout exercising every decode rule: core numbers/booleans/nullables, a
// presence-guarded block whose flag slot lives inside the block (the recovery-platform pattern), a
// presence slot living outside the block (the merge/drone pattern), a tracer region, and a
// keyed sample array (the gun_trajectory pattern).
const LAYOUT_JSON = JSON.stringify({
  layout_version: 3,
  slot_count: 25,
  cold_version_index: 0,
  blocks: [
    {
      name: "core",
      presence_index: -1,
      slots: [
        { name: "t", index: 1, kind: "number" },
        { name: "paused_like", index: 2, kind: "boolean" },
        { name: "maybe", index: 3, kind: "nullable" },
        { name: "gate", index: 4, kind: "boolean" },
      ],
    },
    {
      name: "gated_detail",
      presence_index: 4,
      slots: [{ name: "detail", index: 5, kind: "number" }],
    },
    {
      name: "recovery_platform_like",
      presence_index: 6,
      slots: [
        { name: "recovery_platform", index: 6, kind: "boolean" },
        { name: "carrier", index: 7, kind: "boolean" },
        { name: "deck", index: 8, kind: "number" },
      ],
    },
  ],
  tracers: [
    { field: "tracers", count_index: 9, start: 10, max_rounds: 1, stride: 6 },
  ],
  sample_arrays: [
    { field: "gun_trajectory", start: 17, samples: 2, keys: ["x", "y", "z", "r"] },
  ],
});

// The production CASEVAC block is a sibling of the combat blocks. Duplicate field names are
// intentional: the cold snapshot's discriminator selects exactly one projection family.
const CASEVAC_LAYOUT_JSON = JSON.stringify({
  layout_version: 13,
  slot_count: 14,
  cold_version_index: 0,
  blocks: [
    {
      name: "combat_core",
      presence_index: -1,
      slots: [
        { name: "t", index: 1, kind: "number" },
        { name: "paused_like", index: 2, kind: "boolean" },
        { name: "bx", index: 3, kind: "number" },
      ],
    },
  ],
  tracers: [],
  sample_arrays: [],
  casevac_block: {
    name: "casevac",
    presence_index: 4,
    slots: [
      { name: "t", index: 5, kind: "number" },
      { name: "tick", index: 6, kind: "number" },
      { name: "px", index: 7, kind: "number" },
      { name: "casevac_clock_running", index: 8, kind: "boolean" },
      { name: "casevac_target_x", index: 9, kind: "nullable" },
      { name: "casevac_target_range_m", index: 10, kind: "nullable" },
      { name: "casevac_energy_remaining_kwh", index: 11, kind: "number" },
      { name: "casevac_energy_depleted", index: 12, kind: "boolean" },
      { name: "casevac_destination_reserve_kwh", index: 13, kind: "nullable" },
    ],
  },
});

const hotFrame = (overrides = {}) => {
  const hot = new Float64Array(25);
  hot[0] = 1;            // cold_version
  hot[1] = 12.5;         // t
  hot[2] = 1;            // paused_like true
  hot[3] = NaN;          // maybe -> null
  hot[4] = 0;            // gate absent
  hot[5] = NaN;          // gated detail (absent fill)
  hot[6] = 0;            // recovery platform absent
  hot[7] = 0;            // maritime carrier false
  hot[8] = NaN;
  hot[9] = 0;            // no tracer rounds
  for (const [index, value] of Object.entries(overrides)) hot[index] = value;
  return hot;
};

const casevacHotFrame = (overrides = {}) => {
  const hot = new Float64Array(14);
  hot[0] = 1;       // cold_version
  hot[1] = 999;     // combat t: must never overlay CASEVAC
  hot[2] = 1;       // combat boolean: must remain absent
  hot[3] = 123;     // bx: must remain absent
  hot[4] = 1;       // CASEVAC block present
  hot[5] = 12.5;    // CASEVAC t
  hot[6] = 300;     // tick
  hot[7] = -1800;   // px
  hot[8] = 1;       // clock running
  hot[9] = NaN;     // target x -> null
  hot[10] = 420.5;  // target range
  hot[11] = 449.75; // remaining fictional usable energy
  hot[12] = 0;      // energy not depleted
  hot[13] = 431.25; // projected destination reserve
  for (const [index, value] of Object.entries(overrides)) hot[index] = value;
  return hot;
};

test("decode overlays hot slots onto a fresh object and preserves cold fields", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const coldBase = { t: 1.0, paused_like: false, maybe: 4.2, beat: "VALLEY", tracers: [] };
  const state = decodeHotFrame(layout, hotFrame(), coldBase);

  assert.notEqual(state, coldBase);
  assert.equal(state.t, 12.5);
  assert.equal(state.paused_like, true);
  assert.equal(state.maybe, null);
  assert.equal(state.beat, "VALLEY");
  assert.deepEqual(state.tracers, []);
});

test("booleans decode to real booleans, never truthy numbers", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout, hotFrame(), {});
  assert.equal(typeof state.paused_like, "boolean");
  // strict-comparison consumers (=== true / === false) must keep working
  assert.equal(state.paused_like === true, true);
});

test("absent blocks leave no keys behind", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout, hotFrame(), {});
  assert.equal("detail" in state, false);
  assert.equal("recovery_platform" in state, false);
  assert.equal("carrier" in state, false);
  assert.equal("deck" in state, false);
});

test("maritime recovery platforms decode both presence and carrier flags", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout,
    hotFrame({ 4: 1, 5: 7.75, 6: 1, 7: 1, 8: 88.25 }), {});
  assert.equal(state.gate, true);
  assert.equal(state.detail, 7.75);
  assert.equal(state.recovery_platform, true);
  assert.equal(state.carrier, true);
  assert.equal(state.deck, 88.25);
});

test("fixed strips are present recovery platforms without becoming carriers", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout, hotFrame({ 6: 1, 7: 0, 8: 88.25 }), {});
  assert.equal(state.recovery_platform, true);
  assert.equal(state.carrier, false);
  assert.equal(state.deck, 88.25);
});

test("tracer regions rebuild the flat [x,y,z,vx,vy,vz] arrays", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout,
    hotFrame({ 9: 1, 10: 1.5, 11: 2.5, 12: 3.5, 13: -1.5, 14: -2.5, 15: -3.5 }), {});
  assert.deepEqual(state.tracers, [[1.5, 2.5, 3.5, -1.5, -2.5, -3.5]]);
});

test("sample arrays rebuild keyed objects (the gun_trajectory funnel locus)", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const state = decodeHotFrame(layout, hotFrame({
    17: 10.25, 18: 20.5, 19: -30.75, 20: 4.0,
    21: 110.25, 22: 120.5, 23: -130.75, 24: 250.9,
  }), { gun_trajectory: [{ x: 0, y: 0, z: 0, r: 0 }] });
  assert.deepEqual(state.gun_trajectory, [
    { x: 10.25, y: 20.5, z: -30.75, r: 4.0 },
    { x: 110.25, y: 120.5, z: -130.75, r: 250.9 },
  ]);
});

test("layouts without sample arrays still parse (older kernels)", () => {
  const raw = JSON.parse(LAYOUT_JSON);
  raw.layout_version = 2;
  delete raw.sample_arrays;
  const layout = parseHotLayout(JSON.stringify(raw));
  assert.equal(layout.layoutVersion, 2);
  assert.deepEqual(layout.sampleArrays, []);
  const state = decodeHotFrame(layout, hotFrame(), { beat: "VALLEY" });
  assert.equal("gun_trajectory" in state, false);
});

test("legacy v2 carrier-as-presence layouts remain decodable", () => {
  const legacyLayoutJson = JSON.stringify({
    layout_version: 2,
    slot_count: 3,
    cold_version_index: 0,
    blocks: [
      { name: "core", presence_index: -1, slots: [] },
      {
        name: "carrier_like",
        presence_index: 1,
        slots: [
          { name: "carrier", index: 1, kind: "boolean" },
          { name: "deck", index: 2, kind: "number" },
        ],
      },
    ],
    tracers: [],
  });
  const layout = parseHotLayout(legacyLayoutJson);
  const state = decodeHotFrame(layout, Float64Array.of(1, 1, 72.5), {});
  assert.equal(layout.layoutVersion, 2);
  assert.equal(state.carrier, true);
  assert.equal(state.deck, 72.5);
});

test("each frame returns a new object so retained snapshots never rewrite history", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const coldBase = { beat: "VALLEY" };
  const first = decodeHotFrame(layout, hotFrame(), coldBase);
  const second = decodeHotFrame(layout, hotFrame({ 1: 99.0 }), coldBase);
  assert.notEqual(first, second);
  assert.equal(first.t, 12.5);
  assert.equal(second.t, 99.0);
});

test("older layouts keep CASEVAC cold-only without manufacturing combat fields", () => {
  const layout = parseHotLayout(LAYOUT_JSON);
  const coldBase = {
    casevac_mission: true,
    t: 3.25,
    casevac_phase: "INGRESS",
    opponent_present: false,
  };
  const first = decodeHotFrame(layout, hotFrame({
    1: 99.0,
    9: 1,
    10: 1,
  }), coldBase);
  const second = decodeHotFrame(layout, hotFrame({
    1: 101.0,
    9: 1,
    10: 2,
  }), coldBase);

  assert.notEqual(first, coldBase);
  assert.notEqual(second, first);
  assert.equal(first.t, 3.25);
  assert.equal(second.t, 3.25);
  assert.equal(first.casevac_phase, "INGRESS");
  assert.equal(first.opponent_present, false);
  assert.equal("tracers" in first, false);
  assert.equal("gun_trajectory" in first, false);
  assert.equal("paused_like" in first, false);
});

test("CASEVAC overlays only its numeric block and preserves combat-key absence", () => {
  const layout = parseHotLayout(CASEVAC_LAYOUT_JSON);
  const coldBase = {
    casevac_mission: true,
    t: 3.25,
    tick: 1,
    px: 0,
    casevac_phase: "INGRESS",
    casevac_clock_running: false,
    casevac_target_x: 10,
    casevac_target_range_m: null,
    casevac_energy_remaining_kwh: 450,
    casevac_energy_depleted: true,
    casevac_destination_reserve_kwh: null,
    opponent_present: false,
  };
  const state = decodeHotFrame(layout, casevacHotFrame(), coldBase);

  assert.notEqual(state, coldBase);
  assert.equal(layout.casevacBlock.name, "casevac");
  assert.equal(state.t, 12.5);
  assert.equal(state.tick, 300);
  assert.equal(state.px, -1800);
  assert.equal(state.casevac_clock_running, true);
  assert.equal(state.casevac_target_x, null);
  assert.equal(state.casevac_target_range_m, 420.5);
  assert.equal(state.casevac_energy_remaining_kwh, 449.75);
  assert.equal(state.casevac_energy_depleted, false);
  assert.equal(state.casevac_destination_reserve_kwh, 431.25);
  assert.equal(state.casevac_phase, "INGRESS");
  assert.equal(state.opponent_present, false);
  assert.equal("bx" in state, false);
  assert.equal("paused_like" in state, false);
  assert.equal("tracers" in state, false);
  assert.equal("gun_trajectory" in state, false);
});

test("source fetches cold on first frame, version bumps, and fallback expiry only", () => {
  let fetches = 0;
  let version = 1;
  const source = createHotSnapshotSource({
    layoutJson: LAYOUT_JSON,
    readHotFrame: () => hotFrame({ 0: version }),
    fetchColdState: () => ({ beat: "VALLEY", fetchedAt: ++fetches }),
    fallbackMs: 250,
  });

  assert.equal(source.frame(1000).fetchedAt, 1);   // initial fetch
  assert.equal(source.frame(1016).fetchedAt, 1);   // steady frame: no re-fetch
  assert.equal(source.frame(1032).fetchedAt, 1);

  version = 2;                                      // kernel edge → same-frame re-fetch
  assert.equal(source.frame(1048).fetchedAt, 2);
  assert.equal(source.frame(1064).fetchedAt, 2);

  assert.equal(source.frame(1298).fetchedAt, 3);    // fallback interval expired
  assert.equal(fetches, 3);
});

test("CASEVAC source keeps cold fetches low while numeric hot values advance", () => {
  let fetches = 0;
  let version = 1;
  let tick = 100;
  let phase = "INGRESS";
  const source = createHotSnapshotSource({
    layoutJson: CASEVAC_LAYOUT_JSON,
    readHotFrame: () => casevacHotFrame({
      0: version,
      5: tick / 120,
      6: tick,
    }),
    fetchColdState: () => ({
      casevac_mission: true,
      casevac_phase: phase,
      opponent_present: false,
      fetchedAt: ++fetches,
    }),
    fallbackMs: 250,
  });

  const first = source.frame(1000);
  tick = 101;
  const second = source.frame(1016);
  assert.equal(first.casevac_phase, "INGRESS");
  assert.equal(second.casevac_phase, "INGRESS");
  assert.equal(first.tick, 100);
  assert.equal(second.tick, 101);
  assert.equal(first.fetchedAt, 1);
  assert.equal(second.fetchedAt, 1);
  assert.equal(source.diagnostics().coldFetches, 1);

  phase = "PICKUP_APPROACH";
  version = 2;
  tick = 102;
  const edge = source.frame(1032);
  assert.equal(edge.casevac_phase, "PICKUP_APPROACH");
  assert.equal(edge.tick, 102);
  assert.equal(edge.fetchedAt, 2);
  assert.equal("bx" in edge, false);
  assert.equal("tracers" in second, false);
  assert.equal(source.diagnostics().coldFetches, 2);
});

test("source survives a non-finite clock without wedging the cold base", () => {
  let fetches = 0;
  const source = createHotSnapshotSource({
    layoutJson: LAYOUT_JSON,
    readHotFrame: () => hotFrame(),
    fetchColdState: () => ({ fetchedAt: ++fetches }),
    fallbackMs: 250,
  });
  assert.equal(source.frame(NaN).fetchedAt, 1);
  // NaN comparisons must not permanently disable the fallback re-fetch
  assert.equal(source.frame(NaN).fetchedAt, 2);
});

test("background fallback refreshes cold state even when no render frame runs", async () => {
  let fetches = 0;
  const source = createHotSnapshotSource({
    layoutJson: LAYOUT_JSON,
    readHotFrame: () => hotFrame(),
    fetchColdState: () => ({ fetchedAt: ++fetches }),
    fallbackMs: 10,
    backgroundFallback: true,
  });
  try {
    source.frame(performance.now());
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.ok(source.diagnostics().coldFetches >= 2);
  } finally {
    source.dispose();
  }
});

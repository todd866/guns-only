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

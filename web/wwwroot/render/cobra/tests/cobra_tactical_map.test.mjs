import assert from "node:assert/strict";
import test from "node:test";
import {
  cobraTacticalMapModel,
  cobraTacticalMapBounds,
} from "../cobra_tactical_map.js";

const BOUNDS = { minEastM: 0, maxEastM: 1000, minNorthM: 0, maxNorthM: 1000 };

test("north-west corner of bounds maps to top-left, south-east to bottom-right", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "nw", label: "NW", x_m: 0, y_m: 0, z_m: 1000, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
      { id: "se", label: "SE", x_m: 1000, y_m: 0, z_m: 0, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 100,
  });
  const nw = model.sites.find((s) => s.id === "nw");
  const se = model.sites.find((s) => s.id === "se");
  assert.equal(nw.x, 0);
  assert.equal(nw.y, 0);
  assert.equal(se.x, 200);
  assert.equal(se.y, 100);
});

test("player heading passes through unchanged and does not affect x/y", () => {
  const base = {
    sites: [],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  };
  const a = cobraTacticalMapModel({ ...base, player: { eastM: 500, northM: 500, headingRad: 0 } });
  const b = cobraTacticalMapModel({ ...base, player: { eastM: 500, northM: 500, headingRad: 2.4 } });
  assert.equal(a.player.x, b.player.x);
  assert.equal(a.player.y, b.player.y);
  assert.equal(a.player.headingRad, 0);
  assert.equal(b.player.headingRad, 2.4);
});

test("combat-live staging truth survives tactical-map projection", () => {
  const staged = cobraTacticalMapModel({
    combatLive: false,
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  const live = cobraTacticalMapModel({
    combatLive: true,
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  assert.equal(staged.combat_live, false);
  assert.equal(live.combat_live, true);
});

test("ownership and progress pass through unchanged for every site", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "a", label: "A", x_m: 200, y_m: 0, z_m: 200, capture_radius_m: 10, owner: "hostile", capture_progress: 0.42, contested: true },
      { id: "b", label: "B", x_m: 300, y_m: 0, z_m: 300, capture_radius_m: 10, owner: "friendly", capture_progress: 1, contested: false },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  const a = model.sites.find((s) => s.id === "a");
  const b = model.sites.find((s) => s.id === "b");
  assert.equal(a.owner, "hostile");
  assert.equal(a.progress, 0.42);
  assert.equal(a.contested, true);
  assert.equal(b.owner, "friendly");
  assert.equal(b.progress, 1);
  assert.equal(b.contested, false);
});

test("a site outside bounds is clamped to the edge and flagged offMap", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "far", label: "Far", x_m: -500, y_m: 0, z_m: 2000, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  const far = model.sites.find((s) => s.id === "far");
  assert.equal(far.offMap, true);
  assert.equal(far.x, 0);
  assert.equal(far.y, 0);
});

test("a site inside bounds is not flagged offMap", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "in", label: "In", x_m: 500, y_m: 0, z_m: 500, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  assert.equal(model.sites.find((s) => s.id === "in").offMap, false);
});

test("showUnits false returns empty units array", () => {
  const model = cobraTacticalMapModel({
    units: [
      { id: "u1", faction: "friendly", alive: true, x_m: 100, z_m: 100, role: "infantry" },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
    showUnits: false,
  });
  assert.deepEqual(model.units, []);
});

test("showUnits true returns only living units", () => {
  const model = cobraTacticalMapModel({
    units: [
      { id: "u1", faction: "friendly", alive: true, x_m: 100, z_m: 100, role: "infantry" },
      { id: "u2", faction: "hostile", alive: false, x_m: 200, z_m: 200, role: "soft-vehicle" },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
    showUnits: true,
  });
  assert.equal(model.units.length, 1);
  assert.equal(model.units[0].id, "u1");
});

test("objective picks the nearest hostile site by metres with correct bearing", () => {
  const model = cobraTacticalMapModel({
    sites: [
      // Due east of the player (500,500), 100m away.
      { id: "near-hostile", label: "Near", x_m: 600, y_m: 0, z_m: 500, capture_radius_m: 10, owner: "hostile", capture_progress: 0.1, contested: false },
      // Farther hostile site.
      { id: "far-hostile", label: "Far", x_m: 900, y_m: 0, z_m: 900, capture_radius_m: 10, owner: "hostile", capture_progress: 0.1, contested: false },
      // Closer but friendly-owned — must not be picked.
      { id: "closer-friendly", label: "Closer", x_m: 510, y_m: 0, z_m: 500, capture_radius_m: 10, owner: "friendly", capture_progress: 0.1, contested: false },
    ],
    player: { eastM: 500, northM: 500, headingRad: 0 },
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  assert.equal(model.objective.siteId, "near-hostile");
  assert.equal(model.objective.label, "Near");
  assert.ok(Math.abs(model.objective.bearingRad - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(model.objective.rangeM - 100) < 1e-9);
});

test("objective is null when every site is friendly-owned", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "a", label: "A", x_m: 600, y_m: 0, z_m: 500, capture_radius_m: 10, owner: "friendly", capture_progress: 0.1, contested: false },
    ],
    player: { eastM: 500, northM: 500, headingRad: 0 },
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  assert.equal(model.objective, null);
});

test("cobraTacticalMapBounds produces a square enclosing all sites with padding", () => {
  const sites = [
    { id: "a", x_m: 0, z_m: 0 },
    { id: "b", x_m: 1000, z_m: 200 },
  ];
  const bounds = cobraTacticalMapBounds(sites, { paddingM: 400 });
  // Raw span: east 0..1000 (1000), north 0..200 (200). Padded: east -400..1400 (1800), north -400..600 (1000).
  assert.equal(bounds.minEastM, -400);
  assert.equal(bounds.maxEastM, 1400);
  const eastSpan = bounds.maxEastM - bounds.minEastM;
  const northSpan = bounds.maxNorthM - bounds.minNorthM;
  assert.ok(Math.abs(eastSpan - northSpan) < 1e-9, "bounds must be square");
  assert.equal(eastSpan, 1800);
  // North padded span before squaring would be 1000; centred to 1800 means padding 400 each side
  // of the padded 1000 span, i.e. (1800-1000)/2 = 400 extra on each side of -400..600.
  const northCenter = (-400 + 600) / 2;
  const newNorthCenter = (bounds.minNorthM + bounds.maxNorthM) / 2;
  assert.ok(Math.abs(northCenter - newNorthCenter) < 1e-9, "smaller axis stays centred");
});

test("cobraTacticalMapBounds throws on empty sites", () => {
  assert.throws(() => cobraTacticalMapBounds([]), TypeError);
});

test("missing bounds throws TypeError", () => {
  assert.throws(
    () => cobraTacticalMapModel({ sites: [], widthPx: 200, heightPx: 200 }),
    TypeError,
  );
});

test("zero-span bounds throws TypeError", () => {
  assert.throws(
    () =>
      cobraTacticalMapModel({
        sites: [],
        bounds: { minEastM: 0, maxEastM: 0, minNorthM: 0, maxNorthM: 100 },
        widthPx: 200,
        heightPx: 200,
      }),
    TypeError,
  );
});

test("missing widthPx/heightPx throws TypeError", () => {
  assert.throws(
    () => cobraTacticalMapModel({ sites: [], bounds: BOUNDS, heightPx: 200 }),
    TypeError,
  );
  assert.throws(
    () => cobraTacticalMapModel({ sites: [], bounds: BOUNDS, widthPx: 200 }),
    TypeError,
  );
});

test("a unit with NaN coordinates is skipped, other units still project", () => {
  const model = cobraTacticalMapModel({
    units: [
      { id: "bad", faction: "hostile", alive: true, x_m: NaN, z_m: 200, role: "infantry" },
      { id: "good", faction: "friendly", alive: true, x_m: 100, z_m: 100, role: "infantry" },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
    showUnits: true,
  });
  assert.equal(model.units.length, 1);
  assert.equal(model.units[0].id, "good");
});

test("a site with non-finite coordinates is skipped, does not blank the map", () => {
  const model = cobraTacticalMapModel({
    sites: [
      { id: "bad", label: "Bad", x_m: NaN, y_m: 0, z_m: 200, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
      { id: "good", label: "Good", x_m: 200, y_m: 0, z_m: 200, capture_radius_m: 10, owner: "friendly", capture_progress: 0, contested: false },
    ],
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
  });
  assert.equal(model.sites.length, 1);
  assert.equal(model.sites[0].id, "good");
});

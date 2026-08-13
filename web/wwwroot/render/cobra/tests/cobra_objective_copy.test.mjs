import assert from "node:assert/strict";
import test from "node:test";
import { cobraObjectiveCopy } from "../cobra_objective_copy.js";

const PLAYER = { eastM: 0, northM: 0 };

function site(id, label, owner, overrides = {}) {
  return {
    id,
    label,
    owner,
    capture_progress: 0,
    contested: false,
    x_m: 0,
    y_m: 0,
    z_m: 0,
    capture_radius_m: 60,
    ...overrides,
  };
}

function garrison(siteId, alive = true) {
  return { id: `${siteId}.garrison`, faction: "hostile", role: "garrison", alive, x_m: 0, y_m: 0, z_m: 0 };
}

function conquest(overrides = {}) {
  return {
    ammo_dry: false,
    ammo_bingo: false,
    tickets: { friendly: 300, hostile: 300 },
    sites: [site("bridge", "Bridge", "friendly"), site("ford", "Ford", "hostile", { x_m: 400 })],
    units: [garrison("ford")],
    ...overrides,
  };
}

// —— The conquest ladder, rung by rung ——

test("1. a dry gun outranks every conquest rung", () => {
  const copy = cobraObjectiveCopy(conquest({
    ammo_dry: true,
    tickets: { friendly: 10, hostile: 300 },
  }), { player: PLAYER });
  assert.match(copy.line, /REARM AT CAMP EMBER/);
});

test("2. friendly tickets under a fifth of the start says the valley is being lost", () => {
  const copy = cobraObjectiveCopy(conquest({
    tickets: { friendly: 44, hostile: 260 },
  }), { player: PLAYER });
  assert.equal(copy.line, "LOSING THE VALLEY");
  assert.match(copy.detail, /Down 216 points/);
});

test("3. a hostile point with a living garrison is the core instruction, with range", () => {
  const copy = cobraObjectiveCopy(conquest(), { player: PLAYER });
  assert.equal(copy.line, "DESTROY GARRISON · FORD");
  assert.match(copy.detail, /^400 m — kill the garrison and friendlies will take the point$/);
});

test("3. the NEAREST garrisoned point wins, and kilometre ranges get one decimal", () => {
  const copy = cobraObjectiveCopy(conquest({
    sites: [
      site("ford", "Ford", "hostile", { x_m: 4_200 }),
      site("quarry", "Quarry", "hostile", { x_m: 1_520 }),
    ],
    units: [garrison("ford"), garrison("quarry")],
  }), { player: PLAYER });
  assert.equal(copy.line, "DESTROY GARRISON · QUARRY");
  assert.match(copy.detail, /^1\.5 km — /);
});

test("3. a dead garrison does not keep the destroy order up", () => {
  const copy = cobraObjectiveCopy(conquest({
    units: [garrison("ford", false)],
  }), { player: PLAYER });
  assert.doesNotMatch(copy.line, /DESTROY GARRISON/);
});

test("4. a hostile point with no living garrison becomes a hold order with progress", () => {
  const copy = cobraObjectiveCopy(conquest({
    sites: [site("bridge", "Bridge", "friendly"), site("ford", "Ford", "hostile", { capture_progress: 0.42 })],
    units: [garrison("ford", false)],
  }), { player: PLAYER });
  assert.equal(copy.line, "HOLDING FORD · 42%");
  assert.match(copy.detail, /keep hostiles off it/i);
});

test("5. bingo ammo shows once no hostile point is left to work", () => {
  const copy = cobraObjectiveCopy(conquest({
    ammo_bingo: true,
    sites: [site("bridge", "Bridge", "friendly")],
    units: [],
  }), { player: PLAYER });
  assert.match(copy.line, /BINGO AMMO/);
});

test("5b. the act overlay sits directly above the all-held default", () => {
  const overlay = { line: "EMBER RUN · TURN FOR THE PAD", detail: "Follow the guidance path" };
  const held = conquest({ sites: [site("bridge", "Bridge", "friendly")], units: [] });
  assert.deepEqual(cobraObjectiveCopy(held, { player: PLAYER, actOverlay: overlay }), overlay);
  // …but the fight outranks it: a garrison still standing is not an errand.
  const fighting = cobraObjectiveCopy(conquest(), { player: PLAYER, actOverlay: overlay });
  assert.match(fighting.line, /DESTROY GARRISON/);
});

test("6. every point friendly reports the hostile pool still to burn down", () => {
  const copy = cobraObjectiveCopy(conquest({
    tickets: { friendly: 280, hostile: 96.4 },
    sites: [site("bridge", "Bridge", "friendly"), site("ford", "Ford", "friendly")],
    units: [],
  }), { player: PLAYER });
  assert.equal(copy.line, "VALLEY HELD · 96 LEFT");
});

test("no player pose still gives an order, just without a range", () => {
  const copy = cobraObjectiveCopy(conquest());
  assert.equal(copy.line, "DESTROY GARRISON · FORD");
  assert.doesNotMatch(copy.detail, /\d+ m/);
  assert.match(copy.detail, /kill the garrison/i);
});

test("a tickets-less, ownerless snapshot does not throw and keeps the old behaviour", () => {
  const copy = cobraObjectiveCopy({ control: 0, ammo_bingo: false, ammo_dry: false });
  assert.equal(copy.line, "TIP CONTROL FRIENDLY · HOLD 45s");
  assert.match(copy.detail, /W collective up/);
  assert.equal(cobraObjectiveCopy(null), null);
  // Sites present but ownerless (an older sim) must not crash the strip either.
  assert.ok(cobraObjectiveCopy({ sites: [{ id: "a", label: "A", x_m: 0, z_m: 0 }], units: [] }).line.length > 0);
});

// —— Pre-conquest ladder, still reachable for old snapshots ——

test("parked on the FOB while control bleeds hostile demands return to fight", () => {
  // Mirrors web-cobra-1786090836886-dc8wvig0 after t≈132 s: over pad, ctrl < −0.25, no lose hold yet.
  const copy = cobraObjectiveCopy({
    control: -0.3,
    over_fob: true,
    ammo_bingo: false,
    ammo_dry: false,
    defeat_control_threshold: -0.75,
  });
  assert.match(copy.line, /HOSTILES GAINING/);
  assert.match(copy.line, /RETURN TO FIGHT/);
  assert.match(copy.detail, /pad will not hold/i);
});

test("defeat hold progress outranks the tip-friendly default", () => {
  const copy = cobraObjectiveCopy({
    control: -0.8,
    defeat_hold_progress: 0.4,
    defeat_control_threshold: -0.75,
    over_fob: false,
    ammo_dry: false,
  });
  assert.match(copy.line, /BRIDGE FALLING · 40%/);
  assert.match(copy.detail, /Tab a mark/);
});

test("losing on the pad tells the pilot to leave, not rearm", () => {
  const copy = cobraObjectiveCopy({
    control: -0.76,
    defeat_hold_progress: 0.1,
    defeat_control_threshold: -0.75,
    over_fob: true,
    ammo_dry: false,
    ammo_remaining: 725,
  });
  assert.match(copy.line, /LEAVE THE PAD/);
});

test("ammo dry still wins so a empty gun can rearm", () => {
  const copy = cobraObjectiveCopy({
    control: -0.8,
    defeat_hold_progress: 0.5,
    ammo_dry: true,
    over_fob: false,
  });
  assert.match(copy.line, /REARM AT CAMP EMBER/);
});

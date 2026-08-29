import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  cobraObjectiveSiteId,
  cobraPrioritizedHostileTargetIds,
  cobraUnitLocksObjective,
} from "../cobra_objective_site.js";

const sites = [
  { id: "site.iron-bell", owner: "hostile" },
  { id: "site.quarry", owner: "hostile" },
];

test("objective selection remains the first hostile site in mission sequence", () => {
  assert.equal(cobraObjectiveSiteId({ sites }), "site.iron-bell");
  assert.equal(cobraObjectiveSiteId({ sites: [{ ...sites[0], owner: "friendly" }, sites[1]] }),
    "site.quarry");
});

test("Tab puts only the authority objective lock ahead of nearer secondary hard points", () => {
  const units = [
    { id: "iron-bell.secondary-gun", faction: "hostile", role: "hard-point", alive: true,
      fortified: false, objective_lock: false,
      home_site_id: "site.iron-bell", x_m: 20, z_m: 0 },
    { id: "near.scout", faction: "hostile", role: "infantry", alive: true,
      home_site_id: "site.quarry", x_m: 40, z_m: 0 },
    { id: "iron-bell.locking-pit", faction: "hostile", role: "hard-point", alive: true,
      fortified: true, objective_lock: true,
      home_site_id: "site.iron-bell", x_m: 600, z_m: 0 },
    { id: "quarry.locking-pit", faction: "hostile", role: "hard-point", alive: true,
      fortified: true, objective_lock: true,
      home_site_id: "site.quarry", x_m: 700, z_m: 0 },
    { id: "middle.aa", faction: "hostile", role: "dshk-site", alive: true,
      home_site_id: "site.iron-bell", x_m: 120, z_m: 0 },
    { id: "friendly.squad", faction: "friendly", role: "infantry", alive: true,
      home_site_id: "site.iron-bell", x_m: 10, z_m: 0 },
  ];
  assert.deepEqual(cobraPrioritizedHostileTargetIds({
    sites,
    units,
    player: { eastM: 0, northM: 0 },
  }), [
    "iron-bell.locking-pit",
    "iron-bell.secondary-gun",
    "near.scout",
    "middle.aa",
    "quarry.locking-pit",
  ]);

  const afterCapture = [{ ...sites[0], owner: "friendly" }, sites[1]];
  assert.deepEqual(cobraPrioritizedHostileTargetIds({
    sites: afterCapture,
    units,
    player: { eastM: 0, northM: 0 },
  }), [
    "quarry.locking-pit",
    "iron-bell.secondary-gun",
    "near.scout",
    "middle.aa",
    "iron-bell.locking-pit",
  ],
  "ownership changes must move the next point's defender to the front immediately");
});

test("the exact legacy garrison ID remains a safe fallback for old snapshots", () => {
  assert.equal(cobraUnitLocksObjective({
    id: "site.iron-bell.garrison",
    home_site_id: "site.iron-bell",
  }, "site.iron-bell"), true);
  assert.equal(cobraUnitLocksObjective({
    id: "site.iron-bell.secondary",
    role: "hard-point",
    home_site_id: "site.iron-bell",
  }, "site.iron-bell"), false);
});

test("Cobra authority publishes fortified and objective-lock semantics separately", async () => {
  const bridge = await readFile(new URL("../../../../CobraWebBridge.cs", import.meta.url), "utf8");
  assert.match(bridge, /fortified = unit\.IsFortified/);
  assert.match(bridge, /objective_lock = objectiveLock/);
  assert.match(bridge, /CobraGroundWarRuntime\.GarrisonUnitId\(unit\.HomeSiteId\)/,
    "objective_lock must be tied to the conquest garrison, not every hard-point role");
});

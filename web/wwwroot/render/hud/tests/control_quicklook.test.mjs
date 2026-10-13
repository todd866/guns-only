import test from "node:test";
import assert from "node:assert/strict";
import { controlQuicklookEntries, keyCapLabel } from "../control_quicklook.js";

test("FIRE leads the F-22 key card and only this sortie's controls appear", () => {
  const entries = controlQuicklookEntries({ mode: "f22" });
  assert.deepEqual(entries[0], { caps: ["F"], action: "FIRE", primary: true });
  assert.deepEqual(entries.filter((e) => e.primary).map((e) => e.action),
    ["FIRE", "PULL · PUSH", "ROLL", "POWER", "PADLOCK", "LIMIT OVR"]);
  const actions = entries.map((e) => e.action);
  assert.ok(!actions.includes("AUTOMATION") && !actions.includes("MISSILE"), "no Rapier keys in an F-22 fight");
  assert.ok(!actions.includes("AGCAS PADDLE") && !actions.includes("WING SWEEP"));
  // Primary controls are contiguous so the column-major grid keeps them together.
  assert.ok(entries.findIndex((e) => !e.primary) === 6);
});

test("remapped bindings show on the caps; arrows render as glyphs", () => {
  const entries = controlQuicklookEntries({ bindings: { fire: "KeyJ", pull: "KeyS", push: "KeyW" } });
  assert.deepEqual(entries[0].caps, ["J"]);
  assert.deepEqual(entries[1].caps, ["S", "W"]);
  assert.deepEqual(entries[2].caps, ["←", "→"]);
  assert.equal(keyCapLabel("Space"), "SPACE");
});

test("mode-specific rows: valley, Top Gun, Rapier, AGCAS, F-14 sweep", () => {
  assert.equal(controlQuicklookEntries({ mode: "valley" })[0].action, "FIRE · FOX 2 → GUNS");
  const topGun = controlQuicklookEntries({ mode: "topgun", foxTwo: "R FOX TWO ×2", f14WingSweep: true });
  assert.ok(topGun.some((e) => e.action === "FOX TWO ×2" && e.primary));
  assert.ok(topGun.some((e) => e.action === "RTB") && !topGun.some((e) => e.action === "RESTART"));
  assert.ok(topGun.some((e) => e.action === "WING SWEEP"));
  assert.ok(controlQuicklookEntries({ mode: "rapier" }).some((e) => e.action === "AUTOMATION"));
  assert.ok(controlQuicklookEntries({ gcasAvailable: true }).some((e) => e.action === "AGCAS PADDLE"));
});

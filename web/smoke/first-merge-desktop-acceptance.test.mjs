import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkDesktopReceipt } from "./first-merge-desktop-acceptance.mjs";

function passingReceipt() {
  return {
    pilot: "human", launch: { autoAim: true, lesson: "O1" },
    contactS: 0.2, firstWindowS: 0.2, coarseWindowS: 2,
    firstHitS: 3, killS: 4, d1S: 7, errors: [],
  };
}

test("an integrated receipt passes", () => {
  assert.doesNotThrow(() => checkDesktopReceipt(passingReceipt()));
});

test("missing gimbal telemetry fails an otherwise passing receipt", () => {
  const r = passingReceipt();
  delete r.launch.autoAim;
  assert.throws(() => checkDesktopReceipt(r), /gimbal telemetry/);
});

test("absent gimbal telemetry cannot turn the browser gate into TODO or skip", () => {
  const source = readFileSync(new URL("./first-merge-desktop-receipt.test.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\b(?:todo|skip)\s*\(/);
  assert.match(source, /checkDesktopReceipt\(r\)/);
});

for (const [name, change, message] of [
  ["lost contact", { contactS: null }, /target bracket/],
  ["late contact", { contactS: 21 }, /target bracket/],
  ["no hit", { firstHitS: null }, /physical hit/],
  ["late hit", { firstHitS: 46 }, /physical hit/],
  ["missing D1", { d1S: null }, /hand-over/],
  ["page errors", { errors: ["TypeError: broken HUD"] }, /TypeError/],
]) {
  test(`${name} fails the integrated gate`, () => {
    assert.throws(() => checkDesktopReceipt({ ...passingReceipt(), ...change }), message);
  });
}

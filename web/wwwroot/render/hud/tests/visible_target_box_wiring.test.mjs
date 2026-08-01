import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BANDIT_TALLY_RANGE_M,
  VISIBLE_TARGET_RANGE_M,
  contactPositionCue,
} from "../contact_visibility.js";

const hudUrl = new URL("../../../hud.js", import.meta.url);
const source = await readFile(hudUrl, "utf8");

test("the 10-20 NM visible-contact band routes to a box, not a bearing arrow", () => {
  assert.equal(BANDIT_TALLY_RANGE_M, 18_520);
  assert.equal(VISIBLE_TARGET_RANGE_M, 37_040);
  assert.equal(contactPositionCue(13 * 1_852, true), "box");
  assert.equal(contactPositionCue(9 * 1_852, true), "bracket");
  assert.equal(contactPositionCue(13 * 1_852, false), "arrow");
  assert.equal(contactPositionCue(20 * 1_852, true), "arrow");
  assert.equal(contactPositionCue(160 * 1_852, true), "arrow");
  assert.equal(contactPositionCue(Number.NaN, true), "arrow");
});

test("production HUD routes both formation contacts through the same target-box contract", () => {
  assert.match(source,
    /const bvrContact = primaryRangeM > BANDIT_TALLY_RANGE_M;/);
  assert.match(source,
    /if \(contactPositionCue\(primaryRangeM, locatorOnScreen\) === "box"\) \{\s*this\.drawVisibleTargetBox\([\s\S]*?return;\s*\}/);
  assert.match(source,
    /const positionCue = contactPositionCue\(rangeM, onScreen\);[\s\S]*?positionCue === "box"[\s\S]*?drawVisibleTargetBox\([\s\S]*?role: "wingman"[\s\S]*?targetLabel: "TARGET 2"/,
    "the second fighter must get the same on-screen visible-range box as the primary");
  assert.match(source,
    /drawVisibleTargetBox\([\s\S]*?contactRangeClosureText\(position, frame, role\)/,
    "both boxed contacts must use the stable-identity closure tracker");
});

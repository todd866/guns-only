import assert from "node:assert/strict";
import test from "node:test";

import { indoorRouteCueState } from "../../../indoor/presentation.js";

test("Indoor keeps only the next two fixed route cues visible", () => {
  assert.deepEqual(indoorRouteCueState({ pathIndex: 2, routeProgress: 1 }), {
    visible: true,
    opacity: 0.68,
  });
  assert.deepEqual(indoorRouteCueState({ pathIndex: 3, routeProgress: 1 }), {
    visible: true,
    opacity: 0.2,
  });
  assert.equal(indoorRouteCueState({ pathIndex: 1, routeProgress: 1 }).visible, false);
  assert.equal(indoorRouteCueState({ pathIndex: 4, routeProgress: 1 }).visible, false);
  assert.equal(indoorRouteCueState({
    pathIndex: 2,
    routeProgress: 1,
    linkMode: "rf",
  }).visible, false);
});

test("Indoor reverses the fixed cue order for autonomous recovery", () => {
  assert.deepEqual(indoorRouteCueState({
    pathIndex: 2,
    routeProgress: 3,
    direction: "return",
  }), {
    visible: true,
    opacity: 0.68,
  });
  assert.deepEqual(indoorRouteCueState({
    pathIndex: 1,
    routeProgress: 3,
    direction: "return",
  }), {
    visible: true,
    opacity: 0.2,
  });
  assert.equal(indoorRouteCueState({
    pathIndex: 4,
    routeProgress: 3,
    direction: "return",
  }).visible, false);
});

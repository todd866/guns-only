import test from "node:test";
import assert from "node:assert/strict";
import {
  MESH_MAP_DEFAULT_SPAN_NM,
  MESH_MAP_DRAG_THRESHOLD_PX,
  MESH_MAP_MAX_SPAN_NM,
  MESH_MAP_MIN_SPAN_NM,
  clampSpanNm,
  canvasToWorld,
  worldToCanvas,
} from "../mesh_nav_map.js";

test("clampSpanNm keeps map between 15 and 400 NM", () => {
  assert.equal(clampSpanNm(MESH_MAP_DEFAULT_SPAN_NM), MESH_MAP_DEFAULT_SPAN_NM);
  assert.equal(clampSpanNm(1), MESH_MAP_MIN_SPAN_NM);
  assert.equal(clampSpanNm(9999), MESH_MAP_MAX_SPAN_NM);
  assert.equal(clampSpanNm(Number.NaN), MESH_MAP_DEFAULT_SPAN_NM);
});

test("world/canvas round-trip stays within a metre at map centre", () => {
  const spanM = 120 * 1852;
  const point = worldToCanvas(1000, -500, 0, 0, 280, 240, spanM);
  const world = canvasToWorld(point.x, point.y, 0, 0, 280, 240, spanM);
  assert.ok(Math.abs(world.eastM - 1000) < 1);
  assert.ok(Math.abs(world.northM + 500) < 1);
});

test("drag threshold is six pixels", () => {
  assert.equal(MESH_MAP_DRAG_THRESHOLD_PX, 6);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  OKANAGAN_CHEVRON_SPACING_M,
  createOkanaganHighway,
  okanaganGuidanceContinuityKey,
  okanaganHighwayChevrons,
} from "../okanagan_highway.js";

const route = [
  { id: "one", label: "DEPART 16", position: { x: 0, y: 600, z: 0 },
    radius_m: 600, target_speed_mps: 55 },
  { id: "turn", label: "TURN WEST", position: { x: 1_200, y: 720, z: 2_000 },
    radius_m: 600, target_speed_mps: 60 },
  { id: "three", label: "JOIN LAKE", position: { x: -400, y: 800, z: 4_000 },
    radius_m: 600, target_speed_mps: 62 },
];

test("Fire Boss samples chevrons along the remaining route, not only the next gate", () => {
  const position = { x: -400, y: 500, z: -200 };
  const chevrons = okanaganHighwayChevrons(route, 0, position);
  assert.ok(chevrons.length >= 6,
    "a three-gate outbound must become a chain you can follow");
  assert.ok(chevrons.every((gate) => gate.rtb === true),
    "the chain is directional chevrons, not procedure volumes");
  assert.equal(chevrons[0].active, true);
  assert.equal(chevrons.at(-1).id, "three");
  const first = chevrons[0];
  const rangeToNose = Math.hypot(first.east_m - position.x, first.north_m - (-position.z));
  assert.ok(rangeToNose >= 80, "the first chevron sits ahead of the aircraft, not on the nose");
  const span = Math.hypot(
    chevrons.at(-1).east_m - chevrons[0].east_m,
    chevrons.at(-1).north_m - chevrons[0].north_m,
  );
  assert.ok(span > OKANAGAN_CHEVRON_SPACING_M * 2,
    "the chain reaches the last remaining gate, not a two-gate lookahead");
});

test("Okanagan draws the shared chevron highway and retains a final visual after gate completion", () => {
  const scene = new THREE.Scene();
  const highway = createOkanaganHighway(scene);
  const position = { x: -500, y: 500, z: -300 };
  const drawn = highway.update(route, 0, position);
  const chevrons = highway.group.children.filter((child) => child.visible
    && child.userData.guidanceStyle === "rtb-chevron");
  const volumes = highway.group.children.filter((child) => child.visible
    && child.userData.guidanceStyle === "procedure-volume");
  assert.ok(drawn >= 6);
  assert.ok(chevrons.length >= 6, "the player must see a chevron chain, not two cream boxes");
  assert.equal(volumes.length, 0, "procedure volumes must not replace the chevron highway");
  assert.equal(highway.group.name, "Fire Boss shared guidance path");
  assert.ok(highway.update(route, route.length, position) >= 1,
    "the final route cue must not drop out before phase handoff");
  assert.equal(highway.group.visible, true);
  highway.dispose();
});

test("advancing through one route preserves the highway continuity identity", () => {
  const identity = okanaganGuidanceContinuityKey(route);
  assert.equal(identity, "okanagan:one|turn|three");
  assert.equal(okanaganGuidanceContinuityKey(route), identity);
  assert.notEqual(okanaganGuidanceContinuityKey(route.slice(1)), identity,
    "a phase route replacement should still establish a new identity");
});

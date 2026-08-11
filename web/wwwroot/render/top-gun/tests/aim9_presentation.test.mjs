import assert from "node:assert/strict";
import test from "node:test";

import { projectAim9Presentation } from "../aim9_presentation.js";

test("live AIM-9 authority pose is mirrored into the scene without inventing motion", () => {
  const pose = projectAim9Presentation({
    presentation_theme: "top-gun-anime-1986",
    aim9_pose_valid: true,
    aim9_state_code: 2,
    aim9_x: 10,
    aim9_y: 20,
    aim9_z: 30,
    aim9_vx: 0,
    aim9_vy: 0,
    aim9_vz: 400,
  });

  assert.equal(pose.visible, true);
  assert.deepEqual(pose.position, { x: 10, y: 20, z: -30 });
  assert.deepEqual(pose.direction, { x: 0, y: 0, z: -1 });
});

test("safe, terminal, invalid, and non-Top-Gun snapshots cannot render a phantom missile", () => {
  const base = {
    presentation_theme: "top-gun-anime-1986",
    aim9_pose_valid: true,
    aim9_x: 10,
    aim9_y: 20,
    aim9_z: 30,
    aim9_vx: 0,
    aim9_vy: 0,
    aim9_vz: 400,
  };
  for (const stateCode of [0, 3, 4, 5]) {
    assert.equal(projectAim9Presentation({ ...base, aim9_state_code: stateCode }).visible,
      false, `state ${stateCode}`);
  }
  assert.equal(projectAim9Presentation({ ...base, aim9_state_code: 2, aim9_x: null }).visible,
    false);
  assert.equal(projectAim9Presentation({
    ...base,
    presentation_theme: null,
    mission_definition_id: "mission.modern.visual-merge.v1",
    aim9_state_code: 2,
  }).visible, false);
});

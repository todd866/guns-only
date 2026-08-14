import assert from "node:assert/strict";
import test from "node:test";

import {
  terrainLaunchMissionIdentity,
  terrainLaunchMissionSelector,
  terrainLaunchOwnerMatches,
} from "../terrain_launch_owner.js";

const topGunState = Object.freeze({
  mission_definition_id: "mission.top-gun.dact.v1",
  player_entity_id: "entity.player.41",
});

test("Top Gun warmup ownership survives its string programme selector", () => {
  const owner = {
    missionSelector: terrainLaunchMissionSelector("top-gun"),
    missionIdentity: terrainLaunchMissionIdentity("top-gun", topGunState),
  };

  assert.equal(owner.missionSelector, "program:top-gun");
  assert.equal(owner.missionIdentity,
    "program:top-gun:mission.top-gun.dact.v1:spawn-41");
  assert.equal(terrainLaunchOwnerMatches(owner, "top-gun", topGunState), true);
  assert.equal(terrainLaunchOwnerMatches(owner, 7, topGunState), false,
    "the numeric shell beat behind the Top Gun card is not the warmup owner");
});

test("warmup completion rejects a restaged sortie with the same selector", () => {
  const owner = {
    missionSelector: terrainLaunchMissionSelector("top-gun"),
    missionIdentity: terrainLaunchMissionIdentity("top-gun", topGunState),
  };

  assert.equal(terrainLaunchOwnerMatches(owner, "top-gun", {
    ...topGunState,
    player_entity_id: "entity.player.42",
  }), false);
  assert.equal(terrainLaunchOwnerMatches(owner, "top-gun", {
    ...topGunState,
    mission_definition_id: "mission.top-gun.dact.mig28.v1",
  }), false);
});

test("numeric production beats retain stable warmup ownership", () => {
  const state = {
    mission_definition_id: "mission.first-merge.v1",
    player_entity_id: "entity.player.8",
  };
  const owner = {
    missionSelector: terrainLaunchMissionSelector(7),
    missionIdentity: terrainLaunchMissionIdentity(7, state),
  };

  assert.equal(owner.missionSelector, "beat:7");
  assert.equal(terrainLaunchOwnerMatches(owner, 7, state), true);
  assert.equal(terrainLaunchOwnerMatches(owner, 8, state), false);
});

test("explicit sequence fields retain priority over the production entity-id fallback", () => {
  const state = {
    mission_definition_id: "mission.top-gun.dact.v1",
    player_spawn_sequence: 77,
    player_entity_id: "entity.player.41",
  };

  assert.match(terrainLaunchMissionIdentity("top-gun", state), /:spawn-77$/);
  assert.match(terrainLaunchMissionIdentity("top-gun", {
    mission_definition_id: state.mission_definition_id,
    player_spawn_sequence: null,
    player_entity_id: "entity.player.41",
  }), /:spawn-41$/,
    "a null compatibility field must not mask the real production entity generation");
  assert.match(terrainLaunchMissionIdentity("top-gun", {
    mission_definition_id: state.mission_definition_id,
    player_entity_id: "not-a-production-player-id",
  }), /:unversioned$/);
});

function missionDefinitionId(state) {
  return typeof state?.mission_definition_id === "string"
    && state.mission_definition_id.trim()
    ? state.mission_definition_id.trim()
    : "unknown-mission";
}

function safeSequence(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) ? numeric : null;
}

function playerEntitySpawnSequence(state) {
  if (typeof state?.player_entity_id !== "string") return null;
  const match = /^entity\.player\.(\d+)$/.exec(state.player_entity_id.trim());
  return match ? safeSequence(match[1]) : null;
}

function missionSequence(state) {
  const casevacSequence = safeSequence(state?.casevac_mission_epoch_sequence);
  if (casevacSequence != null) return `casevac-${casevacSequence}`;
  const spawnSequence = safeSequence(state?.player_spawn_sequence);
  if (spawnSequence != null) return `spawn-${spawnSequence}`;
  // SnapshotProjection exposes the production spawn generation inside player_entity_id rather
  // than as a standalone player_spawn_sequence field. Parse that real DTO shape so an old terrain
  // completion cannot claim a freshly restaged Top Gun seat with the same mission definition.
  const entitySpawnSequence = playerEntitySpawnSequence(state);
  if (entitySpawnSequence != null) return `spawn-${entitySpawnSequence}`;
  return "unversioned";
}

/**
 * Preserve the authority that requested terrain warmup. Shell missions are numbered beats, while
 * standalone in-shell programmes such as Top Gun own a string selector even though a numeric beat
 * remains staged behind their Ready card.
 */
export function terrainLaunchMissionSelector(selector) {
  if (Number.isSafeInteger(selector)) return `beat:${selector}`;
  if (typeof selector === "string" && selector.trim())
    return `program:${selector.trim()}`;
  return "unknown";
}

export function terrainLaunchMissionIdentity(selector, state) {
  return [
    terrainLaunchMissionSelector(selector),
    missionDefinitionId(state),
    missionSequence(state),
  ].join(":");
}

export function terrainLaunchOwnerMatches(owner, selector, state) {
  return owner?.missionSelector === terrainLaunchMissionSelector(selector)
    && owner?.missionIdentity === terrainLaunchMissionIdentity(selector, state);
}

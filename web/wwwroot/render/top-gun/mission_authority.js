export const MISSION_AUTHORITY_KIND = Object.freeze({
  PRODUCTION: "production",
  TOP_GUN: "top-gun",
});

export function productionMissionAuthority(beat, deckConfiguration) {
  if (!Number.isInteger(beat)) throw new TypeError("production beat must be an integer");
  return Object.freeze({
    kind: MISSION_AUTHORITY_KIND.PRODUCTION,
    beat,
    deckConfiguration: Number(deckConfiguration) === 1 ? 1 : 0,
  });
}

export function topGunMissionAuthority(seat) {
  return Object.freeze({
    kind: MISSION_AUTHORITY_KIND.TOP_GUN,
    seat: Number(seat) === 1 ? 1 : 0,
  });
}

export function sameMissionAuthority(left, right) {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === MISSION_AUTHORITY_KIND.TOP_GUN) return left.seat === right.seat;
  return left.beat === right.beat
    && left.deckConfiguration === right.deckConfiguration;
}

/// Top Gun owns R for every phase while its selected and staged mission identities agree. Snapshot
/// delivery is intentionally not part of input ownership: a just-restaged Ready frame can still
/// carry the previous mission's cold state, and that transient may never turn R into restart.
export function topGunOwnsFoxTwoInput({
  selectedProgramId,
  topGunProgramId = "top-gun",
  stagedAuthority,
} = {}) {
  return selectedProgramId === topGunProgramId
    && stagedAuthority?.kind === MISSION_AUTHORITY_KIND.TOP_GUN;
}

export function foxTwoLaunchEligible({
  bridgeAvailable,
  snapshotIsTopGun,
  pauseCount = 0,
  snapshotFrozen = false,
  replayActive = false,
  sessionPhase,
} = {}) {
  return bridgeAvailable === true
    && snapshotIsTopGun === true
    && Number(pauseCount) === 0
    && snapshotFrozen !== true
    && replayActive !== true
    && sessionPhase === "ACTIVE";
}

/// Resolve a deep link without ever making a blocked preview the selected/staged authority.
export function resolveInitialProgramSelection({
  requestedProgramNode,
  requestedExperience,
  requestedAccess,
  defaultProgramNode,
}) {
  if (!defaultProgramNode?.id || !Number.isInteger(defaultProgramNode.mission)) {
    throw new TypeError("default production program must own a mission");
  }
  const allowedRequest = requestedProgramNode && requestedAccess?.allowed === true;
  return Object.freeze({
    selectedProgramNode: allowedRequest ? requestedProgramNode : defaultProgramNode,
    blockedExperience: requestedExperience && requestedAccess?.allowed === false
      ? requestedExperience
      : null,
  });
}

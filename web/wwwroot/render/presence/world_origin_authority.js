const validOriginStatus = (status) => status?.phase === "online"
  && Array.isArray(status.spawnOrigin)
  && status.spawnOrigin.length === 3
  && status.spawnOrigin.every((value) => typeof value === "number" && Number.isFinite(value));

/// Apply one stable room origin to the currently staged mission. A rejected contract deliberately
/// does not retain the key: a later mission restage can retry the same already-known welcome
/// without waiting for another websocket status transition.
export function applyStableWorldOrigin({
  status,
  setWorldOrigin,
  appliedKey = "",
} = {}) {
  if (!validOriginStatus(status) || typeof setWorldOrigin !== "function") {
    return Object.freeze({ applied: false, called: false, appliedKey });
  }
  const originKey = `${status.worldEpoch || "world.unknown"}|${status.spawnOrigin.join(",")}`;
  if (originKey === appliedKey) {
    return Object.freeze({ applied: true, called: false, appliedKey });
  }
  const accepted = setWorldOrigin(status.spawnOrigin[0], status.spawnOrigin[2]) === true;
  return Object.freeze({
    applied: accepted,
    called: true,
    appliedKey: accepted ? originKey : "",
  });
}

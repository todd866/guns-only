function authoritativeTargetSlot(state) {
  const slot = Number(state?.selected_player_gun_target_slot);
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

/**
 * The gun follows the combat contact the pilot has actually selected. Circuit traffic is visual
 * only, and a destroyed/promoted w1 cannot keep the weapon pointed at a stale formation slot.
 */
export function desiredPlayerGunTargetSlot({
  padlock = false,
  padlockTarget = "bandit",
  state = null,
} = {}) {
  const liveCombatWingman = padlock
    && padlockTarget === "wingman"
    && state?.rapier_pattern_only !== true
    && state?.w1_present === 1
    && state?.w1_alive === 1;
  return liveCombatWingman ? 1 : 0;
}

/**
 * Reconcile the browser's last accepted request with the authoritative hot snapshot, then cross
 * the bridge only when the desired semantic slot differs. A rejected request is never cached as
 * applied, so a later frame can retry after formation staging catches up.
 */
export function syncPlayerGunTargetSelection({
  bridge = null,
  state = null,
  padlock = false,
  padlockTarget = "bandit",
  appliedSlot = null,
} = {}) {
  const authoritativeSlot = authoritativeTargetSlot(state);
  const reconciledSlot = authoritativeSlot ?? appliedSlot;
  const desiredSlot = desiredPlayerGunTargetSlot({ padlock, padlockTarget, state });
  if (!bridge || typeof bridge.SetPlayerGunTargetSlot !== "function") {
    return {
      appliedSlot: reconciledSlot,
      desiredSlot,
      requested: false,
      accepted: false,
    };
  }
  if (desiredSlot === reconciledSlot) {
    return {
      appliedSlot: reconciledSlot,
      desiredSlot,
      requested: false,
      accepted: true,
    };
  }

  const accepted = bridge.SetPlayerGunTargetSlot(desiredSlot) === true;
  return {
    appliedSlot: accepted ? desiredSlot : authoritativeSlot,
    desiredSlot,
    requested: true,
    accepted,
  };
}

/**
 * Promotion moves the same physical aircraft from w1 into the primary render slot. Recognize that
 * identity-preserving handoff before generic invalid-target kill-cam handling treats it as a loss.
 */
export function wingmanPadlockPromotedToPrimary({
  padlock = false,
  padlockTarget = "bandit",
  padlockEntityId = "",
  padlockEngagement = null,
  state = null,
} = {}) {
  if (!padlock || padlockTarget !== "wingman") return false;
  const engagement = Number(state?.engagement_number);
  if (!Number.isFinite(engagement)
      || engagement !== Number(padlockEngagement)) return false;
  if (state?.w1_present === 1 || state?.w1_alive === 1) return false;
  if (state?.selected_player_gun_target_slot !== 0
      || state?.bandit_alive === false
      || state?.opponent_alive === false) return false;

  const primaryEntityId = String(state?.bandit_entity_id ?? "");
  if (!primaryEntityId || !padlockEntityId) return false;
  return padlockEntityId !== `${primaryEntityId}.wingman`;
}

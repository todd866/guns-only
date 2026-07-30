function authoritativeTargetSlot(state) {
  const slot = Number(state?.selected_player_gun_target_slot);
  return Number.isInteger(slot) && slot >= 0 ? slot : null;
}

function primaryCombatTargetLive(state) {
  return state?.opponent_body_present !== false
    && state?.bandit_alive !== false
    && state?.opponent_alive !== false;
}

function wingmanCombatTargetLive(state) {
  return state?.rapier_pattern_only !== true
    && state?.w1_present === 1
    && state?.w1_alive === 1;
}

/**
 * Resolve the pilot's persistent combat-target choice to the formation slot that currently owns
 * that physical aircraft. Padlock is deliberately absent from this contract: V changes the view,
 * while Tab changes the weapon target.
 *
 * If the chosen contact has just died or moved slots during promotion, retain the kernel's live
 * fallback instead of re-requesting a stale slot. The next browser frame then adopts that slot as
 * the pilot-facing selection.
 */
export function desiredPlayerGunTargetSlot({
  selectedTarget = "bandit",
  state = null,
} = {}) {
  const authoritativeSlot = authoritativeTargetSlot(state);
  if (selectedTarget === "wingman" && wingmanCombatTargetLive(state)) return 1;
  if (selectedTarget === "bandit" && primaryCombatTargetLive(state)) return 0;
  return authoritativeSlot ?? (wingmanCombatTargetLive(state) ? 1 : 0);
}

/**
 * Reconcile the browser's last accepted request with the authoritative hot snapshot, then cross
 * the bridge only when the desired semantic slot differs. A rejected request is never cached as
 * applied, so a later frame can retry after formation staging catches up.
 */
export function syncPlayerGunTargetSelection({
  bridge = null,
  state = null,
  selectedTarget = "bandit",
  appliedSlot = null,
} = {}) {
  const authoritativeSlot = authoritativeTargetSlot(state);
  const reconciledSlot = authoritativeSlot ?? appliedSlot;
  const desiredSlot = desiredPlayerGunTargetSlot({ selectedTarget, state });
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

const CLEARANCE_COPY = Object.freeze({
  CLEARED: "Operating budget positive",
  DEFERRED: "Operating budget in deficit",
  GROUNDED: "Allocation exception required for the next Rapier sortie",
});

const DEFERRED_BELOW = 0;
const GROUNDED_BELOW = -150;

function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function signedCredits(value) {
  const n = Math.trunc(Number(value) || 0);
  return `${n > 0 ? "+" : ""}${n} CR`;
}

export function clearanceForBalance(balance) {
  const n = Math.trunc(Number(balance) || 0);
  if (n >= DEFERRED_BELOW) return "CLEARED";
  if (n >= GROUNDED_BELOW) return "DEFERRED";
  return "GROUNDED";
}

/**
 * Rapier operations slip from the kernel-authored allocation-credit lines plus the locally
 * persisted running balance. Arcade missions do not opt in merely because they expose fuel,
 * kills, or a finished-sortie state.
 * Returns null when the sortie did not publish lines (unfinished / non-scoring).
 */
export function rapierEconomyPresentation(state, balanceBefore = 0) {
  if (state?.finished !== true || state?.rapier_economy_active !== true) return null;
  const linesIn = Array.isArray(state?.rapier_economy_lines)
    ? state.rapier_economy_lines : [];
  if (linesIn.length === 0
    && !Number.isFinite(Number(state?.rapier_economy_sortie_net_credits))) {
    return null;
  }
  const before = Math.trunc(Number(balanceBefore) || 0);
  const sortieNet = Math.trunc(
    Number(state?.rapier_economy_sortie_net_credits) || 0,
  );
  const after = before + sortieNet;
  const clearance = clearanceForBalance(after);
  const lines = linesIn.map((line) => ({
    label: String(line?.label || line?.code || "Line"),
    category: String(line?.category || ""),
    creditsText: signedCredits(line?.credits),
  }));
  return {
    kicker: "Rapier budget posted",
    lines,
    netText: `Sortie net · ${signedCredits(sortieNet)}`,
    balanceText: `Rapier balance · ${signedCredits(after)}`,
    clearanceText: CLEARANCE_COPY[clearance] || CLEARANCE_COPY.CLEARED,
    clearance,
    balanceBefore: before,
    balanceAfter: after,
    sortieNet,
  };
}

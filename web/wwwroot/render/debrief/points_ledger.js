const CLEARANCE_COPY = Object.freeze({
  CLEARED: "Norm fulfilled · cleared",
  DEFERRED: "Allocation deferred",
  GROUNDED: "Exception denied · grounded pending allocation",
});

const DEFERRED_BELOW = 0;
const GROUNDED_BELOW = -150;

function token(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function signedPoints(value) {
  const n = Math.trunc(Number(value) || 0);
  return n > 0 ? `+${n}` : `${n}`;
}

export function clearanceForBalance(balance) {
  const n = Math.trunc(Number(balance) || 0);
  if (n >= DEFERRED_BELOW) return "CLEARED";
  if (n >= GROUNDED_BELOW) return "DEFERRED";
  return "GROUNDED";
}

/**
 * Municipal ledger slip from projected PointsLedger lines + campaign running balance.
 * Returns null when the sortie did not publish lines (unfinished / non-scoring).
 */
export function pointsLedgerPresentation(state, balanceBefore = 0) {
  if (state?.finished !== true) return null;
  const linesIn = Array.isArray(state?.points_lines) ? state.points_lines : [];
  if (linesIn.length === 0 && !Number.isFinite(Number(state?.points_sortie_net))) {
    return null;
  }
  const before = Math.trunc(Number(balanceBefore) || 0);
  const sortieNet = Math.trunc(Number(state?.points_sortie_net) || 0);
  const after = before + sortieNet;
  const clearance = clearanceForBalance(after);
  const lines = linesIn.map((line) => ({
    label: String(line?.label || line?.code || "Line"),
    pointsText: signedPoints(line?.points),
  }));
  return {
    kicker: "Allocation posted",
    lines,
    netText: `Sortie net · ${signedPoints(sortieNet)}`,
    balanceText: `Balance · ${after}`,
    clearanceText: CLEARANCE_COPY[clearance] || CLEARANCE_COPY.CLEARED,
    clearance,
    balanceBefore: before,
    balanceAfter: after,
    sortieNet,
  };
}

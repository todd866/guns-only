/// Mesh ND chrome — toolbar + solution-strip helpers for `#nav-console`.

export function bindNavNdChrome(root = document) {
  const q = (id) => root.querySelector(id);
  return Object.freeze({
    follow: q("#nav-nd-follow"),
    free: q("#nav-nd-free"),
    tourAdd: q("#nav-nd-tour-add"),
    clearDest: q("#nav-nd-clear"),
    procNone: q("#nav-nd-proc-none"),
    procOverhead: q("#nav-nd-proc-overhead"),
    procDownwind: q("#nav-nd-proc-downwind"),
    procStraight: q("#nav-nd-proc-straight"),
    destination: q("#nav-destination"),
    bearing: q("#nav-bearing"),
    range: q("#nav-range"),
    eta: q("#nav-eta"),
    turn: q("#nav-turn"),
    fuelHave: q("#nav-fuel-have"),
    fuelNeed: q("#nav-fuel-need"),
    fuelArrival: q("#nav-fuel-arrival"),
    fuelMargin: q("#nav-fuel-margin"),
    nmPerMin: q("#nav-nm-per-min"),
    lbPerMin: q("#nav-lb-per-min"),
    lbPerNm: q("#nav-lb-per-nm"),
    procedure: q("#nav-procedure"),
  });
}

export function formatWholeLb(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Math.round(Number(value)).toLocaleString("en-US")} LB`;
}

export function procedureLabelFromState(state = {}) {
  const code = Number(state?.recovery_procedure_kind);
  if (code === 1) return "OVERHEAD";
  if (code === 2) return "DOWNWIND REJOIN";
  if (code === 3) return "STRAIGHT-IN";
  const raw = typeof state?.recovery_procedure_label === "string"
    ? state.recovery_procedure_label.trim()
    : "";
  if (raw) return raw.toUpperCase();
  if (state?.rapier_pattern_only === true) return "CIRCUITS · DEFAULT";
  return "NONE";
}

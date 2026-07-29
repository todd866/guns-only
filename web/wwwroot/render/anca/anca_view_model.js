/// Pure ANCA view model: flat kernel snapshot in, four frozen rows out. The panel is an SA
/// display of what the automation is doing for the pilot — it never invents state; missing
/// truth renders as a quiet em-dash.
export const CHECKLIST_NAMES = Object.freeze({
  0: "", 1: "LAUNCH", 2: "COMMIT", 3: "RECOVERY",
});

const QUIET_ROW = Object.freeze({ line: "—", tone: "quiet" });

const row = (letter, key, body) =>
  Object.freeze({ letter, key, ...(body ?? QUIET_ROW) });

const token = (value) => (typeof value === "string" ? value.trim() : "");
const finite = (value) => (Number.isFinite(value) ? value : null);

export function aviateRow(state) {
  const gear = token(state?.gear_handle);
  if (!gear) return null;
  const parts = [];
  let tone = "steady";
  if (state?.gear_unsafe === true || state?.gear_warning_horn === true) {
    parts.push("GEAR UNSAFE");
    tone = "attention";
  } else {
    parts.push(gear === "DOWN" ? "GEAR DN" : "GEAR UP");
  }
  if (state?.has_flaps === true) {
    const deflection = Math.max(
      finite(state?.flap_left_deg) ?? 0, finite(state?.flap_right_deg) ?? 0);
    parts.push(deflection > 1 ? "FLAPS LDG" : "FLAPS UP");
  }
  return { line: parts.join(" · "), tone };
}

export function navigateRow(state) {
  const fuelHome = finite(state?.fuel_to_home_estimate_lb);
  if (fuelHome === null) return null;
  const parts = [`${Math.round(fuelHome)} LB HOME`];
  const home = token(state?.recovery_display_name);
  if (home) parts.push(home);
  let tone = "steady";
  if (state?.fuel_bingo === true) { parts.push("BINGO"); tone = "attention"; }
  else if (state?.fuel_joker === true) { parts.push("JOKER"); tone = "attention"; }
  else {
    const toJoker = finite(state?.fuel_minutes_to_joker);
    if (toJoker !== null) parts.push(`JOKER ${Math.max(0, Math.round(toJoker))} MIN`);
  }
  return { line: parts.join(" · "), tone };
}

export function communicateRow(state) {
  if (state?.radio_active === true) {
    const speaker = token(state?.radio_speaker) || "R/T";
    const text = token(state?.radio_text);
    return { line: `${speaker} · ${text}`, tone: "active" };
  }
  const frequency = token(state?.radio_frequency);
  if (!frequency) return null;
  return { line: `${frequency} · MONITORING`, tone: "steady" };
}

export function administrateRow(state) {
  if (state?.checklist_active !== true) return null;
  const total = finite(state?.checklist_total);
  if (total === null || total <= 0) return null;
  const done = finite(state?.checklist_done) ?? 0;
  const name = token(state?.checklist_name)
    || CHECKLIST_NAMES[finite(state?.checklist_id) ?? 0] || "";
  const parts = [`${name} ${done}/${total}`.trim()];
  const next = token(state?.checklist_next);
  if (next) parts.push(next);
  return { line: parts.join(" · "), tone: done >= total ? "steady" : "attention" };
}

export function deriveAncaView(state) {
  const rows = Object.freeze([
    row("A", "aviate", aviateRow(state)),
    row("N", "navigate", navigateRow(state)),
    row("C", "communicate", communicateRow(state)),
    row("A", "administrate", administrateRow(state)),
  ]);
  const visible = Boolean(state)
    && state.ready !== true
    && state.finished !== true;
  return Object.freeze({ visible, rows });
}

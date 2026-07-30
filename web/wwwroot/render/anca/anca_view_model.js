/// Pure ANCA view model: flat kernel snapshot in, four frozen channel rows out. A row earns
/// disclosure only for active automation, a phase-relevant cross-check, or an exception.
/// Dedicated HUD/system/radio owners keep their routine state; ANCA never fabricates around them.
export const CHECKLIST_NAMES = Object.freeze({
  0: "", 1: "LAUNCH", 2: "COMMIT", 3: "RECOVERY", 4: "RTB",
});

const QUIET_ROW = Object.freeze({
  line: "—", tone: "quiet", shown: false, notify: false,
});

const row = (letter, key, body) =>
  Object.freeze({
    letter,
    key,
    ...(body ? { shown: true, notify: false, ...body } : QUIET_ROW),
  });

const token = (value) => (typeof value === "string" ? value.trim() : "");
const finite = (value) => (Number.isFinite(value) ? value : null);
const upperToken = (value) => token(value).toUpperCase();

export function aviateRow(state) {
  const warnings = [];
  if (state?.gear_warning_horn === true) warnings.push("GEAR WARNING");
  else if (state?.gear_limit_exceeded === true) warnings.push("GEAR OVERSPEED");
  else if (state?.gear_unsafe === true) warnings.push("GEAR UNSAFE");
  if (state?.flap_limit_exceeded === true) warnings.push("FLAPS OVERSPEED");
  if (state?.flap_split === true) warnings.push("FLAPS SPLIT");
  if (warnings.length > 0) {
    return { line: warnings.join(" · "), tone: "attention" };
  }

  // Routine clean configuration belongs to the HUD/systems panel. ANCA only exposes a live
  // automatic transition, or the recovery configuration a pilot may deliberately cross-check.
  if (state?.configuration_automatic !== true) return null;
  const transition = state?.configuration_transition === true;
  const target = upperToken(state?.configuration_target);
  const mode = upperToken(state?.mode);
  const recoveryCrosscheck = target === "RECOVERY"
    && (mode === "APPROACH" || state?.approach === true);
  if (!transition && !recoveryCrosscheck) return null;

  const gear = upperToken(state?.gear_handle);
  const flapLeft = finite(state?.flap_left_deg);
  const flapRight = finite(state?.flap_right_deg);
  const hasFlapTruth = state?.has_flaps === true
    || flapLeft !== null || flapRight !== null;
  const parts = [];
  parts.push(recoveryCrosscheck ? "AUTO RECOVERY CONFIG" : "AUTO CONFIG");
  if (gear) parts.push(gear === "DOWN" ? "GEAR DN" : "GEAR UP");
  if (hasFlapTruth) {
    const deflection = Math.max(flapLeft ?? 0, flapRight ?? 0);
    parts.push(deflection > 1 ? "FLAPS LDG" : "FLAPS UP");
  }
  return { line: parts.join(" · "), tone: transition ? "active" : "steady" };
}

export function navigateRow(state) {
  const rtbActive = state?.player_rtb_active === true;
  const reserveMargin = finite(state?.fuel_reserve_margin_lb);
  const bingo = state?.fuel_bingo === true;
  const joker = state?.fuel_joker === true;
  const attention = bingo || joker
    || (reserveMargin !== null && reserveMargin < 0);
  if (!rtbActive && !attention) return null;

  const parts = [];
  if (bingo) parts.push("BINGO");
  else if (joker) parts.push("JOKER");
  else if (reserveMargin !== null && reserveMargin < 0) parts.push("RESERVE SHORT");

  if (rtbActive) {
    const home = token(state?.recovery_display_name) || "HOME";
    parts.push(`RTB ${home}`);
    const eta = finite(state?.rtb_eta_min);
    if (eta !== null) parts.push(`ETA ${Math.max(0, Math.round(eta))} MIN`);
    const arrival = finite(state?.fuel_on_arrival_estimate_lb);
    if (arrival !== null) parts.push(`ARR ${Math.round(arrival)} LB`);
  }
  if (reserveMargin !== null) {
    const roundedMargin = Math.round(reserveMargin);
    parts.push(`${roundedMargin >= 0 ? "+" : ""}${roundedMargin} LB RES`);
  }
  return { line: parts.join(" · "), tone: attention ? "attention" : "steady" };
}

export function communicateRow(state) {
  // Idle tuning belongs to the radio surface. When the automation is actively transmitting,
  // ANCA may expose that activity, but never duplicates the spoken/captioned transcript.
  if (state?.radio_active !== true) return null;
  const frequency = token(state?.radio_frequency);
  const channel = token(state?.radio_channel);
  const parts = [];
  if (channel) parts.push(channel);
  else if (frequency) parts.push(frequency);
  else parts.push("R/T");
  parts.push("AUTO TX");
  return { line: parts.join(" · "), tone: "active" };
}

export function administrateRow(state) {
  if (state?.checklist_active !== true) return null;
  const total = finite(state?.checklist_total);
  if (total === null || total <= 0) return null;
  const done = finite(state?.checklist_done) ?? 0;
  if (done >= total) return null;
  const name = token(state?.checklist_name)
    || CHECKLIST_NAMES[finite(state?.checklist_id) ?? 0] || "";
  const next = token(state?.checklist_next);
  // Reserve consequence belongs to Navigate; repeating it here makes an automatic checklist look
  // like a second task list.
  if (upperToken(next) === "RESERVE MARGIN") return null;
  const parts = [`${name || "CHECK"} · AUTO ${done}/${total}`];
  if (next) parts.push(`→ ${next}`);
  return { line: parts.join(" "), tone: "active" };
}

export function closedAncaTone(rows) {
  // ANCA is a secondary, optional surface. Warnings already owned by the HUD/systems panel do
  // not earn a second alarm here. A future ANCA-exclusive condition must explicitly opt in.
  return rows.some((item) => item.notify === true && item.tone === "attention")
    ? "attention" : "quiet";
}

export function deriveAncaView(state) {
  const rows = Object.freeze([
    row("A", "aviate", aviateRow(state)),
    row("N", "navigate", navigateRow(state)),
    row("C", "communicate", communicateRow(state)),
    row("A", "administrate", administrateRow(state)),
  ]);
  const shownRows = Object.freeze(rows.filter((item) => item.shown));
  const visible = Boolean(state)
    && state.ready !== true
    && state.finished !== true;
  return Object.freeze({
    visible,
    tone: closedAncaTone(rows),
    rows,
    shownRows,
  });
}

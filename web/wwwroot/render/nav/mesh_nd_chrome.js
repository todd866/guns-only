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
    decision: q("#nav-decision"),
    decisionKicker: q("#nav-decision-kicker"),
    decisionTitle: q("#nav-decision-title"),
    decisionDetail: q("#nav-decision-detail"),
    rtbAction: q("#nav-rtb-action"),
    recoveryLesson: q("#nav-recovery-lesson"),
    recoveryStep: q("#nav-recovery-step"),
    recoveryTitle: q("#nav-recovery-title"),
    recoveryTargets: q("#nav-recovery-targets"),
    recoveryAction: q("#nav-recovery-action"),
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

const CASE_I_LESSONS = Object.freeze([
  ["INITIAL", "Join the initial", "Fly the ship's heading toward the bow. Arrive level at 800 ft, 350 kt, then hold it to the break."],
  ["BREAK", "Break left", "Cross the ship at 350 kt, roll into the left break and reduce power. Stay at 800 ft; select landing configuration below 250 kt."],
  ["DOWNWIND", "Establish downwind", "Roll out left of the ship at 600 ft. Gear comes down here; finish the deceleration before abeam."],
  ["ABEAM", "Abeam—start the 180", "At 600 ft and on-speed about 1.2 NM abeam, begin the descending left approach turn."],
  ["90", "At the 90", "Cross the 90 near 450 ft. Keep the turn coming, correct lineup gradually, and remain on speed."],
  ["45", "At the 45", "Cross the ship's wake near 350 ft. Ease the turn onto the angled landing line without chasing lineup."],
  ["GROOVE", "Roll into the groove", "Intercept final near 3/4 NM and 280 ft. Fly the 3.5° path: nose for AoA, power for glideslope."],
  ["WIRES", "Fly through the wires", "Hold lineup, on-speed AoA and the flight path to touchdown. Do not flare; full power for a wave-off or bolter."],
]);

export function carrierRecoveryLesson(state = {}) {
  const topGun = state?.presentation_theme === "top-gun-anime-1986"
    || String(state?.mission_definition_id || "").includes("top-gun");
  if (!topGun || state?.player_rtb_active !== true
      || state?.approach_guidance_active !== true) return null;
  const label = String(state?.approach_next_label || "").toUpperCase();
  const index = CASE_I_LESSONS.findIndex(([prefix]) => label.startsWith(prefix));
  if (index < 0) return null;
  const [, title, action] = CASE_I_LESSONS[index];
  const deckAltM = Number(state?.deck_alt);
  const targetAltM = Number(state?.approach_next_alt_m);
  const targetSpeedMps = Number(state?.approach_next_tas_mps);
  const heightFt = Number.isFinite(targetAltM) && Number.isFinite(deckAltM)
    ? Math.round((targetAltM - deckAltM) * 3.280839895) : null;
  const speedKt = Number.isFinite(targetSpeedMps)
    ? Math.round(targetSpeedMps * 1.943844492) : null;
  const brcRad = Number(state?.cheading);
  const landingRad = Number(state?.landing_heading);
  const heading = (rad) => Number.isFinite(rad)
    ? String(Math.round(((rad * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, "0")
    : "—";
  const course = index === 0 ? `BRC ${heading(brcRad)}°`
    : index === 2 ? `COURSE ${heading(brcRad + Math.PI)}°`
      : index >= 6 ? `FINAL ${heading(landingRad)}°`
        : "LEFT TURN";
  return Object.freeze({
    index,
    step: `${index + 1} / ${CASE_I_LESSONS.length} · CASE I`,
    shortLabel: label.split("·")[0].trim(),
    title,
    targets: `${heightFt === null ? "—" : `${heightFt} FT AGL`} · ${speedKt === null ? "—" : `${speedKt} KTAS`} · ${index >= 2 ? "LANDING CONFIG" : "CLEAN"} · ${course}`,
    action,
  });
}

export function topGunNavDecision(state = {}) {
  const topGun = state?.presentation_theme === "top-gun-anime-1986"
    || String(state?.mission_definition_id || "").includes("top-gun");
  const available = Number(state?.combat_handoff_phase) === 1
    && state?.combat_handoff_requested !== true
    && state?.player_rtb_active !== true;
  if (!topGun || !available) return null;

  const replacementPending = state?.opponent_replacement_pending === true;
  const seconds = Math.max(0, Number(state?.opponent_replacement_s) || 0);
  const engagement = Math.max(1, Math.trunc(Number(state?.engagement_number) || 1));
  if (replacementPending) {
    return Object.freeze({
      mode: "post-kill",
      kicker: "SPLASH CONFIRMED · CHOOSE",
      title: `NEXT JET IN ${seconds.toFixed(1)} SEC`,
      detail: "Stay in the arena and the next opponent launches automatically, or hand off and recover aboard the carrier.",
      action: "RTB TO CARRIER",
    });
  }
  return Object.freeze({
    mode: "fight",
    kicker: `ENGAGEMENT ${engagement} · LIVE`,
    title: "FIGHT CONTINUES",
    detail: "Knock it off at any time to hand the fight to relief and recover aboard the carrier.",
    action: "RTB TO CARRIER",
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

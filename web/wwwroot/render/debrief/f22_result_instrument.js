// F-22 result instrument: four information rows and one action row, replacing the generic
// title / brief / facts / scoreboard stack for the F-22 sortie. Every value is read from the
// kernel snapshot; nothing here grades, scores or invents a cause. Words live in tooltips.
//
//   FIGHT  ✓ 2/2            LAND ✓      combat result · engagements won/billed · recovery
//   GUN    18/480           2:14        hits/rounds · attempt duration
//   OPP    Competent ×1 → Veteran ×1 ⓘ  this sortie's opponent → the earned next opponent
//   ▸      Close before firing  [Practise guns]   one correction, only when evidence gives one
//   [Again] [Recover] [Logbook] [Aircraft] [Settings]

import { isF22Sortie } from "./f22_sortie_result.js";

const token = (value) => String(value ?? "").trim().toUpperCase();
const count = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
};

const SKILL_NAMES = Object.freeze({
  NOVICE: "Novice", COMPETENT: "Competent", VETERAN: "Veteran", ACE: "Ace", MACHINE: "Machine",
});

// Mirrors sim/Doctrine/FightDirector.cs ApplyRamp. Tooltip text only; the kernel decides.
const NEXT_MILESTONE = Object.freeze([
  "One gun hit earns a Veteran opponent.",
  "A gun kill earns an Ace opponent.",
  "A second gun kill earns the uprated Ace pair.",
  "Complete both pair engagements, then land.",
]);

function lost(state) {
  const outcome = token(state?.sortie_outcome);
  const terminal = token(state?.player_terminal_state);
  return outcome === "DEFEAT" || outcome === "DRAW"
    || (terminal !== "" && terminal !== "FLYING");
}

function physicallyRecovered(state) {
  return state?.runway_recovery_complete === true
    && state?.runway_touchdown_contact === true
    && state?.runway_touchdown_survivable === true;
}

/** complete | lost | open. Combat completion never implies a landing. */
export function f22CombatDisposition(state) {
  if (!isF22Sortie(state)) return null;
  if (state.combat_complete === true) return "complete";
  if (lost(state)) return "lost";
  return "open";
}

/** recovered | lost | open (not recovered: still flying, abandoned, or never attempted). */
export function f22RecoveryDisposition(state) {
  if (!isF22Sortie(state)) return null;
  if (physicallyRecovered(state)) return "recovered";
  if (lost(state)) return "lost";
  return "open";
}

/** The frozen difficulty contract an attempt was flown under, for like-for-like comparison. */
export function f22AttemptContract(state) {
  if (!isF22Sortie(state)) return null;
  const rung = count(state.sortie_rung);
  const opponentCount = count(state.sortie_opponent_count);
  const skill = token(state.sortie_opponent_skill);
  return {
    rung,
    opponent: skill && opponentCount !== null ? `${skill}x${opponentCount}` : "",
    assist: state.assisted_flight === true ? "assisted" : "manual",
  };
}

// A single ship is the default and carries no suffix; a formation shows its count.
function opponentLabel(skillToken, countValue) {
  const skill = SKILL_NAMES[token(skillToken)];
  const n = count(countValue);
  if (!skill || n === null || n === 0) return null;
  return n > 1 ? `${skill} ×${n}` : skill;
}

function opponentWords(skillToken, countValue) {
  const skill = SKILL_NAMES[token(skillToken)];
  const n = count(countValue);
  if (!skill || n === null || n === 0) return null;
  return n > 1 ? `${skill} pair` : `${skill} single`;
}

export function formatAttemptClock(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(Number(seconds))) return "—";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const COMBAT_SYMBOL = Object.freeze({ complete: "✓", lost: "×", open: "–" });
const COMBAT_WORDS = Object.freeze({
  complete: "Combat complete", lost: "Aircraft lost in combat", open: "Combat not completed",
});
const RECOVERY_SYMBOL = Object.freeze({ recovered: "✓", lost: "×", open: "–" });
const RECOVERY_WORDS = Object.freeze({
  recovered: "Landed and stopped", lost: "Aircraft not recovered", open: "Not landed",
});

/**
 * Pure model for the result instrument.
 * phase: "combat" while the aircraft is still flying at the combat-result boundary,
 *        "final" once the sortie has ended.
 */
export function f22ResultInstrument(state, {
  phase = "final",
  durationSeconds = null,
  correction = "",
  practiceExercise = "",
  practiceLabel = "",
} = {}) {
  if (!isF22Sortie(state)) return null;
  const combat = f22CombatDisposition(state);
  const recovery = f22RecoveryDisposition(state);
  const won = count(state.engagements_won) ?? 0;
  const cap = count(state.engagement_cap) ?? 0;
  const hits = count(state.sortie_hits) ?? 0;
  const rounds = count(state.sortie_rounds_fired) ?? 0;
  const clock = formatAttemptClock(durationSeconds);
  const now = opponentLabel(state.sortie_opponent_skill, state.sortie_opponent_count);
  const next = opponentLabel(state.earned_opponent_skill, state.earned_opponent_count);
  const sortieRung = count(state.sortie_rung);
  const earnedRung = count(state.difficulty_rung);

  const recoveryDetail = [RECOVERY_WORDS[recovery]];
  const fuel = Number(state.fuel_lb);
  const margin = Number(state.fuel_reserve_margin_lb);
  if (recovery === "recovered" && Number.isFinite(fuel))
    recoveryDetail.push(`fuel ${Math.round(fuel)} lb`);
  if (recovery === "recovered" && Number.isFinite(margin))
    recoveryDetail.push(`reserve ${margin < 0 ? "−" : "+"}${Math.round(Math.abs(margin))} lb`);

  const nowWords = opponentWords(state.sortie_opponent_skill, state.sortie_opponent_count);
  const nextWords = opponentWords(state.earned_opponent_skill, state.earned_opponent_count);
  const opponentDetail = [];
  if (nowWords) opponentDetail.push(`This sortie: ${nowWords}${token(state.sortie_opponent_mount) === "UPRATED" ? ", uprated" : ""}.`);
  if (nextWords) opponentDetail.push(`Next sortie: ${nextWords}${token(state.earned_opponent_mount) === "UPRATED" ? ", uprated" : ""}.`);
  if (earnedRung !== null) opponentDetail.push(NEXT_MILESTONE[Math.min(3, earnedRung)]);
  if (earnedRung !== null && sortieRung !== null && earnedRung < sortieRung)
    opponentDetail.push("Two hitless losses step the opponent down one level.");

  const recoverAvailable = phase === "combat"
    && combat === "complete"
    && state.player_rtb_active === true
    && token(state.player_terminal_state) === "FLYING"
    && !lost(state);

  return Object.freeze({
    phase,
    combat: Object.freeze({
      status: combat,
      symbol: COMBAT_SYMBOL[combat],
      value: cap > 0 ? `${won}/${cap}` : "",
      label: `${COMBAT_WORDS[combat]}${cap > 0 ? ` · ${won} of ${cap} engagements won` : ""}`,
    }),
    recovery: Object.freeze({
      status: recovery,
      symbol: RECOVERY_SYMBOL[recovery],
      label: recoveryDetail.join(" · "),
    }),
    gun: Object.freeze({
      value: `${hits}/${rounds}`,
      label: `${hits} hits from ${rounds} rounds`,
      clock,
      clockLabel: clock === "—" ? "Attempt time unavailable" : `Attempt time ${clock}`,
    }),
    opponent: Object.freeze({
      value: now && next ? `${now} → ${now === next ? "same" : next}` : now || next || "—",
      changed: !!(now && next && now !== next),
      label: opponentDetail.join(" "),
    }),
    correction: correction || practiceExercise
      ? Object.freeze({
        text: correction || "",
        practiceExercise: practiceExercise || "",
        practiceLabel: practiceLabel || "Practice",
      })
      : null,
    actions: Object.freeze({ again: true, recover: recoverAvailable }),
  });
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setLabel(element, label) {
  if (!element) return;
  if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label", label);
  if (element.title !== label) element.title = label;
}

/**
 * Paint a model into the static #f22-result markup. Idempotent; runs on presented frames, so it
 * only writes what changed and never rebuilds focusable DOM.
 */
export function paintF22ResultInstrument(root, model) {
  if (!root) return;
  root.hidden = !model;
  if (!model) return;
  const $ = (id) => root.querySelector(`#${id}`);
  const combat = $("f22-combat");
  combat.dataset.status = model.combat.status;
  setText($("f22-combat-symbol"), model.combat.symbol);
  setText($("f22-combat-value"), model.combat.value);
  setLabel(combat, model.combat.label);
  const recovery = $("f22-recovery");
  recovery.dataset.status = model.recovery.status;
  setText($("f22-recovery-symbol"), model.recovery.symbol);
  setLabel(recovery, model.recovery.label);
  const gun = $("f22-gun");
  setText(gun, model.gun.value);
  setLabel(gun, model.gun.label);
  const clock = $("f22-clock");
  setText(clock, model.gun.clock);
  setLabel(clock, model.gun.clockLabel);
  const opponent = $("f22-opponent");
  setText(opponent, model.opponent.value);
  setLabel(opponent, model.opponent.label);
  setText($("f22-opponent-detail"), model.opponent.label);
  const correctionRow = $("f22-row-correction");
  correctionRow.hidden = !model.correction;
  if (model.correction) {
    setText($("f22-correction"), model.correction.text);
    const practice = $("f22-practice");
    practice.hidden = !model.correction.practiceExercise;
    setText(practice, model.correction.practiceLabel);
  }
  $("f22-recover").hidden = !model.actions.recover;
}

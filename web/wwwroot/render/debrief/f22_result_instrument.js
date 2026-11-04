// F-22 result instrument: five information rows and one action row, replacing the generic
// title / brief / facts / scoreboard stack for the F-22 sortie. Every value is deterministic
// from the kernel snapshot; explanations live in tooltips and detail views.
//
//   FIGHT  ✓ 950                          LAND ✓      combat score when waves on · recovery bonus badge
//   SCORE  1350 · W4 ×2 · 0-hit +250 · land +150  PB ◆ +350   deterministic score · bonuses · personal-best delta
//   GUN    18/480                          2:14        hits/rounds · attempt duration
//   OPP    Competent ×1 → Veteran ×1 ⓘ                 this sortie's opponent → the earned next opponent
//   ▸      Close before firing  [Practise guns]        one correction, only when evidence gives one
//   [Again] [Recover] [Logbook] [Aircraft] [Settings]

import { isF22Sortie } from "./f22_sortie_result.js";

export const F22_UNTOUCHED_BONUS = 250;
export const F22_LANDING_BONUS = 150;
export const F22_PERSONAL_BEST_KEY_PREFIX = "guns-only.f22-personal-best.v1";
export const F22_PERSONAL_BEST_STORAGE_KEY = F22_PERSONAL_BEST_KEY_PREFIX;

export function f22PersonalBestKey(state) {
  const beat = String(state?.mission_definition_id || "").trim();
  return beat ? `${F22_PERSONAL_BEST_KEY_PREFIX}:${beat}` : F22_PERSONAL_BEST_KEY_PREFIX;
}

const token = (value) => String(value ?? "").trim().toUpperCase();
const count = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
};

const SKILL_NAMES = Object.freeze({
  NOVICE: "Novice", COMPETENT: "Competent", VETERAN: "Veteran", ACE: "Ace", MACHINE: "Machine",
});

const BFM_LESSONS = new Set(["O1", "D1", "O2", "D2", "O3", "D3", "N", "A2"]);
const BFM_OUTCOME_SYMBOL = Object.freeze({ open: "–", passed: "✓", failed: "×" });
const BFM_OUTCOME_WORD = Object.freeze({ open: "open", passed: "passed", failed: "failed" });

function bfmLessonValue(value) {
  const lesson = token(value);
  return BFM_LESSONS.has(lesson) ? lesson : "";
}

function bfmOutcomeValue(value) {
  const outcome = String(value ?? "").trim().toLowerCase();
  return Object.hasOwn(BFM_OUTCOME_SYMBOL, outcome) ? outcome : "open";
}

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
const SCORE_SYMBOL = Object.freeze({ best: "★", below: "−", tie: "–", first: "–" });

function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStoredPersonalBest(storage, state) {
  if (!storage || typeof storage.getItem !== "function") return null;
  try {
    const raw = storage.getItem(f22PersonalBestKey(state))
      ?? storage.getItem(F22_PERSONAL_BEST_KEY_PREFIX);
    if (raw === null || raw === undefined || raw === "") return null;
    const direct = Number(raw);
    if (Number.isFinite(direct) && direct >= 0) return Math.trunc(direct);
    const parsed = JSON.parse(raw);
    const candidate = Number(
      parsed?.[state?.mission_definition_id] ?? parsed?.best ?? parsed?.score,
    );
    return Number.isFinite(candidate) && candidate >= 0 ? Math.trunc(candidate) : null;
  } catch {
    return null;
  }
}

function writeStoredPersonalBest(storage, state, score) {
  if (!storage || typeof storage.setItem !== "function") return false;
  if (!Number.isFinite(score) || score < 0) return false;
  try {
    storage.setItem(f22PersonalBestKey(state), String(Math.trunc(score)));
    return true;
  } catch {
    return false;
  }
}

const activeRunBaseline = new Map();

function resolvePersonalBest(storage, state, total, shouldRecord, runKey) {
  const key = f22PersonalBestKey(state);
  let previousBest;
  if (runKey) {
    const cacheKey = `${key}|${runKey}`;
    if (!activeRunBaseline.has(cacheKey)) {
      if (activeRunBaseline.size >= 32) activeRunBaseline.clear();
      activeRunBaseline.set(cacheKey, readStoredPersonalBest(storage, state));
    }
    previousBest = activeRunBaseline.get(cacheKey);
  } else {
    previousBest = readStoredPersonalBest(storage, state);
  }
  const best = previousBest === null ? total : Math.max(previousBest, total);
  if (shouldRecord && (previousBest === null || total > previousBest)) {
    writeStoredPersonalBest(storage, state, best);
  }
  const delta = previousBest === null ? null : total - previousBest;
  const newBest = previousBest !== null && total > previousBest;
  const status = newBest ? "best" : delta !== null && delta < 0 ? "below" : delta === 0 ? "tie" : "first";
  const deltaText = delta === null ? "" : delta > 0 ? `+${delta}` : `${delta}`;
  return { previousBest, best, delta, deltaText, newBest, status, symbol: SCORE_SYMBOL[status] };
}

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
  storage = defaultStorage(),
  runKey = "",
} = {}) {
  if (!isF22Sortie(state)) return null;
  const combat = f22CombatDisposition(state);
  const recovery = f22RecoveryDisposition(state);
  const won = count(state.engagements_won) ?? 0;
  const cap = count(state.engagement_cap) ?? 0;
  const waves = state.escalating_waves === true;
  const waveScoreSum = Array.isArray(state.wave_scores)
    ? state.wave_scores.reduce((sum, item) => {
      const value = count(item);
      return sum + (value ?? 0);
    }, 0)
    : 0;
  const score = count(state.combat_score) ?? waveScoreSum;
  const wave = count(state.wave_reached ?? state.engagements_won) ?? 0;
  const rawMultiplier = Number(state.wave_multiplier ?? state.wave_score_multiplier);
  const multiplier = Number.isFinite(rawMultiplier) && rawMultiplier > 0
    ? rawMultiplier
    : (wave > 2 ? 1 + 0.5 * (wave - 2) : 1);
  const multiplierText = Number.isInteger(multiplier) ? `${multiplier}` : multiplier.toFixed(1);
  const explicitHitsTaken = count(
    state.hits_taken ?? state.player_hits_taken ?? state.opponent_hits,
  );
  const damagedHealth = Number.isFinite(Number(state.player_health))
    && Number(state.player_health) < 1;
  const hitsTaken = explicitHitsTaken !== null ? explicitHitsTaken : (damagedHealth ? 1 : 0);
  const untouched = state.untouched === true
    ? true
    : state.untouched === false
      ? false
      : (hitsTaken === 0 && !lost(state) && (combat === "complete" || won > 0 || score > 0));
  const untouchedBonus = untouched ? F22_UNTOUCHED_BONUS : 0;
  const landingBonus = recovery === "recovered" ? F22_LANDING_BONUS : 0;
  const totalScore = score + untouchedBonus + landingBonus;
  const shouldRecordBest = totalScore > 0 || combat !== "open" || state.finished === true;
  const pb = resolvePersonalBest(storage, state, totalScore, shouldRecordBest, runKey);
  const hits = count(state.sortie_hits) ?? 0;
  const rounds = count(state.sortie_rounds_fired) ?? 0;
  const clock = formatAttemptClock(durationSeconds);
  const now = opponentLabel(state.sortie_opponent_skill, state.sortie_opponent_count);
  const next = opponentLabel(state.earned_opponent_skill, state.earned_opponent_count);
  const sortieRung = count(state.sortie_rung);
  const earnedRung = count(state.difficulty_rung);
  const bfmLesson = bfmLessonValue(state.bfm_lesson);
  const bfmNextLesson = bfmLessonValue(state.bfm_next_lesson);
  const bfmActive = !!bfmLesson;
  const bfmOutcome = bfmOutcomeValue(state.bfm_lesson_outcome);
  const bfmCriterion = String(state.bfm_lesson_criterion ?? "").trim();
  const bfmCorrection = String(state.bfm_correction ?? "").trim();

  const recoveryDetail = [
    RECOVERY_WORDS[recovery],
    recovery === "recovered"
      ? `+${F22_LANDING_BONUS} landing bonus`
      : recovery === "open"
        ? `+${F22_LANDING_BONUS} landing bonus on full stop`
        : "no landing bonus",
  ];
  const fuel = Number(state.fuel_lb);
  const margin = Number(state.fuel_reserve_margin_lb);
  if (recovery === "recovered" && Number.isFinite(fuel))
    recoveryDetail.push(`fuel ${Math.round(fuel)} lb`);
  if (recovery === "recovered" && Number.isFinite(margin))
    recoveryDetail.push(`reserve ${margin < 0 ? "−" : "+"}${Math.round(Math.abs(margin))} lb`);

  const scoreValue = `${totalScore} · W${wave} ×${multiplierText} · 0-hit +${untouchedBonus} · land +${landingBonus}`;
  const scoreLabel = `Run score ${totalScore} · wave ${wave} (×${multiplierText}) ${score} + untouched ${untouchedBonus} + landing ${landingBonus}`;
  const bestLabel = pb.newBest
    ? `New personal best ${pb.best} (${pb.deltaText} vs ${pb.previousBest})`
    : pb.previousBest !== null
      ? `Personal best ${pb.best} (${pb.deltaText})`
      : `Personal best ${pb.best} · first run`;

  const nowWords = opponentWords(state.sortie_opponent_skill, state.sortie_opponent_count);
  const nextWords = opponentWords(state.earned_opponent_skill, state.earned_opponent_count);
  const opponentDetail = [];
  if (bfmActive) {
    const opponent = opponentWords(state.bfm_opponent_skill, state.bfm_opponent_count)
      || nowWords || "opponent unavailable";
    opponentDetail.push(`Lesson ${bfmLesson} ${BFM_OUTCOME_WORD[bfmOutcome]}.`);
    opponentDetail.push(`Opponent: ${opponent}.`);
    opponentDetail.push(`Criterion: ${bfmCriterion || "kernel criterion unavailable"}.`);
    opponentDetail.push(`Next lesson: ${bfmNextLesson || "none"}.`);
  } else {
    if (nowWords) opponentDetail.push(`This sortie: ${nowWords}${token(state.sortie_opponent_mount) === "UPRATED" ? ", uprated" : ""}.`);
    if (nextWords) opponentDetail.push(`Next sortie: ${nextWords}${token(state.earned_opponent_mount) === "UPRATED" ? ", uprated" : ""}.`);
    if (earnedRung !== null) opponentDetail.push(NEXT_MILESTONE[Math.min(3, earnedRung)]);
    if (earnedRung !== null && sortieRung !== null && earnedRung < sortieRung)
      opponentDetail.push("Two hitless losses step the opponent down one level.");
  }

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
      value: waves ? (score > 0 ? `${score}` : "") : cap > 0 ? `${won}/${cap}` : "",
      label: waves ? `${COMBAT_WORDS[combat]} · ${score} combat points · wave ${won} cleared`
        : `${COMBAT_WORDS[combat]}${cap > 0 ? ` · ${won} of ${cap} engagements won` : ""}`,
    }),
    recovery: Object.freeze({
      status: recovery,
      symbol: RECOVERY_SYMBOL[recovery],
      bonus: landingBonus,
      label: recoveryDetail.join(" · "),
    }),
    score: Object.freeze({
      total: totalScore,
      combatScore: score,
      wave,
      multiplier,
      untouched,
      untouchedBonus,
      landingBonus,
      best: pb.best,
      previousBest: pb.previousBest,
      delta: pb.delta,
      deltaText: pb.deltaText,
      newBest: pb.newBest,
      status: pb.status,
      symbol: pb.symbol,
      value: scoreValue,
      label: scoreLabel,
      bestLabel,
    }),
    gun: Object.freeze({
      value: `${hits}/${rounds}`,
      label: `${hits} hits from ${rounds} rounds`,
      clock,
      clockLabel: clock === "—" ? "Attempt time unavailable" : `Attempt time ${clock}`,
    }),
    opponent: Object.freeze({
      value: bfmActive
        ? `${bfmLesson} ${BFM_OUTCOME_SYMBOL[bfmOutcome]} → ${bfmNextLesson || "—"}`
        : now && next ? `${now} → ${now === next ? "same" : next}` : now || next || "—",
      changed: bfmActive
        ? !!(bfmNextLesson && bfmNextLesson !== bfmLesson)
        : !!(now && next && now !== next),
      label: opponentDetail.join(" "),
    }),
    correction: bfmActive
      ? (bfmOutcome === "failed" && bfmCorrection
        ? Object.freeze({ text: bfmCorrection, practiceExercise: "", practiceLabel: "" })
        : null)
      : correction || practiceExercise
      ? Object.freeze({
        text: correction || "",
        practiceExercise: practiceExercise || "",
        practiceLabel: practiceLabel || "Practice",
      })
      : null,
    lesson: bfmActive ? Object.freeze({
      id: bfmLesson,
      next: bfmNextLesson,
      outcome: bfmOutcome,
      criterion: bfmCriterion,
    }) : null,
    actions: Object.freeze({ again: true, recover: recoverAvailable }),
  });
}

function setText(element, value) {
  if (element && element.textContent !== value) element.textContent = value;
}

function setStatusSymbol(element, status) {
  const icon = status === "complete" || status === "recovered" ? "check"
    : status === "best" ? "mark"
    : status === "lost" ? "close" : "minus";
  const href = `#shell-${icon}`;
  if (element && element.getAttribute("href") !== href) element.setAttribute("href", href);
}

function setLabel(element, label) {
  if (!element) return;
  if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label") !== undefined && element.setAttribute("aria-label", label);
  if (element.getAttribute("aria-label") !== label) element.setAttribute("aria-label", label);
  if (element.title !== label) element.title = label;
}

const RESULT_RETRY_CODES = new Set(["Space", "Enter", "NumpadEnter"]);

function secondaryControlOwnsKeyTarget(target) {
  const interactive = target?.closest?.("button, a[href], input, select, textarea, [role=button]");
  if (!interactive) return false;
  return interactive.id !== "f22-again";
}

/**
 * One-key retry loop for the F-22 result screen. Space and ⏎ trigger Again when focus is not
 * on a secondary control (Recover, Logbook, etc.), while suppressing key repeat and blocking
 * a held retry key from leaking into live flight controls across the merge restart.
 */
export function createF22ResultKeyHandler({
  isResultActive = () => false,
  onAgain = () => {},
} = {}) {
  const heldCodes = new Set();
  return Object.freeze({
    keydown(event) {
      const code = event?.code;
      if (!RESULT_RETRY_CODES.has(code)) return false;
      if (heldCodes.has(code)) {
        event.preventDefault?.();
        return true;
      }
      if (!isResultActive()) return false;
      if (secondaryControlOwnsKeyTarget(event.target)) {
        if (event.repeat) {
          event.preventDefault?.();
          return true;
        }
        return false;
      }
      event.preventDefault?.();
      if (event.repeat) return true;
      heldCodes.add(code);
      onAgain(event);
      return true;
    },
    keyup(event) {
      const code = event?.code;
      if (!heldCodes.has(code)) return false;
      heldCodes.delete(code);
      event.preventDefault?.();
      return true;
    },
    reset() {
      heldCodes.clear();
    },
  });
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
  setStatusSymbol($("f22-combat-symbol"), model.combat.status);
  setText($("f22-combat-value"), model.combat.value);
  setLabel(combat, model.combat.label);
  const recovery = $("f22-recovery");
  recovery.dataset.status = model.recovery.status;
  setStatusSymbol($("f22-recovery-symbol"), model.recovery.status);
  setLabel(recovery, model.recovery.label);
  if (model.score) {
    const score = $("f22-score");
    setText(score, model.score.value);
    setLabel(score, model.score.label);
    const best = $("f22-best");
    if (best) best.dataset.status = model.score.status;
    setStatusSymbol($("f22-best-symbol"), model.score.status);
    setText($("f22-best-delta"), model.score.deltaText);
    setLabel(best, model.score.bestLabel);
  }
  const gun = $("f22-gun");
  setText(gun, model.gun.value);
  setLabel(gun, model.gun.label);
  const clock = $("f22-clock");
  setText(clock, model.gun.clock);
  setLabel(clock, model.gun.clockLabel);
  setText($("f22-row-opponent")?.querySelector(".f22-tag"), model.lesson ? "BFM" : "OPP");
  setLabel($("f22-opponent-info"), model.lesson ? "Lesson and next lesson" : "Opponent and next milestone");
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
    setText(practice.querySelector(".shell-action-label"), model.correction.practiceLabel);
  }
  $("f22-recover").hidden = !model.actions.recover;
}

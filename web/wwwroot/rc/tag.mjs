// Split-screen tag: who spends least time as IT wins the round.
export const TAG = {round: 90, dist: 2.2, grace: 2, result: 5, itBoost: 1.15};

export function createTag() {
  return {on: false, it: 1, p1It: 0, p2It: 0, roundLeft: TAG.round, roundN: 1, grace: 0, graceLeft: 0, resultLeft: 0, safe: 0, safeLeft: 0};
}

export function setTagOn(t, on, rng = Math.random) {
  t.on = on;
  if (on) beginRound(t, rng);
  else Object.assign(t, createTag());
}

function beginRound(t, rng = Math.random) {
  t.it = rng() < 0.5 ? 1 : 2;
  t.p1It = 0;
  t.p2It = 0;
  t.roundLeft = TAG.round;
  t.grace = 0;
  t.graceLeft = 0;
  t.resultLeft = 0;
  t.safe = 0;
  t.safeLeft = 0;
}

export function winner(t) {
  if (t.p1It < t.p2It) return 1;
  if (t.p2It < t.p1It) return 2;
  return 0;
}

export function fmtTag(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function hudLine(t, player) {
  if (!t.on || t.resultLeft > 0) return '';
  return `🏷️ IT ${fmtTag(player === 1 ? t.p1It : t.p2It)} · round ${fmtTag(t.roundLeft)}`;
}

export function resultHead(t) {
  const w = winner(t);
  return w === 0 ? 'Tie!' : `P${w} wins!`;
}

export function resultStats(t) {
  return [`P1 IT ${fmtTag(t.p1It)}`, `P2 IT ${fmtTag(t.p2It)}`];
}

/** @returns {{tagged?: boolean, safe?: number, roundEnd?: boolean}} */
export function stepTag(t, dt, dist, paused) {
  if (!t.on || paused) return {};
  if (t.resultLeft > 0) {
    t.resultLeft = Math.max(0, t.resultLeft - dt);
    if (t.resultLeft === 0) {
      t.roundN++;
      beginRound(t);
    }
    return {result: true};
  }
  t.roundLeft = Math.max(0, t.roundLeft - dt);
  if (t.it === 1) t.p1It += dt;
  else t.p2It += dt;
  if (t.safeLeft > 0) {
    t.safeLeft = Math.max(0, t.safeLeft - dt);
    if (t.safeLeft === 0) t.safe = 0;
  }
  if (t.graceLeft > 0) t.graceLeft = Math.max(0, t.graceLeft - dt);
  let tagged = false;
  if (dist < TAG.dist) {
    const other = t.it === 1 ? 2 : 1;
    if (!(t.grace === other && t.graceLeft > 0)) {
      const was = t.it;
      t.it = other;
      t.grace = was;
      t.graceLeft = TAG.grace;
      t.safe = was;
      t.safeLeft = TAG.grace;
      tagged = true;
    }
  }
  if (t.roundLeft <= 0) {
    t.resultLeft = TAG.result;
    return {roundEnd: true, tagged};
  }
  return {tagged, safe: t.safeLeft > 0 ? t.safe : 0};
}

export function tagTelemetry(t) {
  if (!t.on) return null;
  return {it: t.it, p1It: Math.round(t.p1It * 10) / 10, p2It: Math.round(t.p2It * 10) / 10, round: t.roundN};
}

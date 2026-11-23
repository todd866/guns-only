// Split-screen pumpkin hunt: both cars feed one team count. Ten pumpkins, or three minutes.
export const HUNT = {round: 180, goal: 10, result: 5};

export function createHunt() {
  return {on: false, team: 0, p1: 0, p2: 0, roundLeft: HUNT.round, roundN: 1, resultLeft: 0};
}

export function setHuntOn(h, on) {
  h.on = on;
  if (on) beginRound(h);
  else Object.assign(h, createHunt());
}

function beginRound(h) {
  h.team = 0;
  h.p1 = 0;
  h.p2 = 0;
  h.roundLeft = HUNT.round;
  h.resultLeft = 0;
}

export function collect(h, player, n = 1) {
  const count = Math.max(0, n | 0);
  if (!h.on || h.resultLeft > 0 || count <= 0 || (player !== 1 && player !== 2)) return {added: 0, goal: false};
  if (player === 1) h.p1 += count;
  else h.p2 += count;
  h.team += count;
  if (h.team >= HUNT.goal) {
    h.resultLeft = HUNT.result;
    return {added: count, goal: true};
  }
  return {added: count, goal: false};
}

export function fmtHunt(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function hudLine(h) {
  if (!h.on || h.resultLeft > 0) return '';
  return `🎃 ${h.team}/${HUNT.goal} · ${fmtHunt(h.roundLeft)}`;
}

export function resultHead(h) {
  return `🎃 Team got ${h.team}!`;
}

export function resultStats(h) {
  return [`P1 ${h.p1}`, `P2 ${h.p2}`];
}

/** @returns {{roundEnd?: boolean, result?: boolean}} */
export function stepHunt(h, dt, paused) {
  if (!h.on || paused) return {};
  if (h.resultLeft > 0) {
    h.resultLeft = Math.max(0, h.resultLeft - dt);
    if (h.resultLeft === 0) {
      h.roundN++;
      beginRound(h);
    }
    return {result: true};
  }
  h.roundLeft = Math.max(0, h.roundLeft - dt);
  if (h.roundLeft <= 0) {
    h.resultLeft = HUNT.result;
    return {roundEnd: true};
  }
  return {};
}

export function huntTelemetry(h) {
  if (!h.on) return null;
  return {team: h.team, p1: h.p1, p2: h.p2, left: Math.round(h.roundLeft * 10) / 10, round: h.roundN};
}

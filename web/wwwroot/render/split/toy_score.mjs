// Scoring follows RC Odyssey furball: a hit pops a balloon. First to 5 pops
// wins the dogfight. A popped toy tumbles and is back after 3 s. Words stay
// inside Splat! / Got you! / Pop!

export const POPS_TO_WIN = 5;
export const RESPAWN_S = 3;

export const CALLOUTS = Object.freeze(["Splat!", "Got you!", "Pop!"]);

const ALLOWED = new Set(CALLOUTS);

export function calloutFor({weapon, downed}) {
  if (weapon === "balloon") return "Splat!";
  if (downed) return "Got you!";
  return "Pop!";
}

export function assertCallout(text) {
  if (!ALLOWED.has(text)) throw new Error(`callout outside the toy set: ${text}`);
  return text;
}

export function emptyPops() {
  return {p1: 0, p2: 0, team: 0};
}

/** Apply one accepted hit. Mutates pops and the target balloon count. */
export function scoreHit(match, {by, target, weapon}) {
  if (!target || target.downFor > 0 || target.invuln > 0) return null;
  const left = Math.max(0, Math.trunc(Number(target.balloons) || 0) - 1);
  target.balloons = left;
  const downed = left <= 0;
  if (downed) {
    target.downFor = RESPAWN_S;
    target.bounceV = 7;
    target.balloons = 0;
  }
  const seat = by?.seat;
  if (match.mode === "dogfight" && seat && target.seat && seat !== target.seat) {
    match.pops[seat] = (match.pops[seat] ?? 0) + 1;
  } else if (match.mode === "coop" && by?.team === "good" && target.team === "bad") {
    match.pops.team += 1;
  }
  const text = assertCallout(calloutFor({weapon, downed}));
  if (weapon === "balloon") target.splat = 0.45;
  else target.pop = 0.35;
  return {text, downed, weapon};
}

export function dogfightWinner(pops) {
  if ((pops?.p1 ?? 0) >= POPS_TO_WIN || (pops?.p2 ?? 0) >= POPS_TO_WIN) {
    return (pops.p1 ?? 0) >= (pops.p2 ?? 0) ? "p1" : "p2";
  }
  return null;
}

export function popBack(craft) {
  craft.downFor = 0;
  craft.balloons = craft.maxBalloons;
  craft.invuln = 0.7;
  craft.tumble = 0;
  craft.pitch = 0;
  craft.bank = 0;
  craft.y = Math.max(Number(craft.y) || 0, 4);
  craft.bounceV = 5;
  craft.vy = 4;
}

export function stepDowned(craft, dt) {
  const step = Math.max(0, Number(dt) || 0);
  craft.tumble = (Number(craft.tumble) || 0) + step * 7;
  craft.bounceV = (Number(craft.bounceV) || 0) - 16 * step;
  craft.y = (Number(craft.y) || 0) + craft.bounceV * step;
  if (craft.y < 0.8) {
    craft.y = 0.8;
    craft.bounceV = Math.abs(craft.bounceV) * 0.62;
  }
}

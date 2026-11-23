// THPS2-style pad timing for the skateboard (owner, 18 Nov 2026: "more closely mimic the controls in
// THPS2 when skateboarding"). THPS2 on the PlayStation: hold X to crouch and release it to ollie;
// up then down is a manual, down then up a nose manual (d-pad). Here A is the PlayStation X.
// Pure state machines so main.js only wires them; tests in pad-skate.test.mjs.

export const PAD_SKATE = Object.freeze({
  fullCrouch: 0.5, // s of crouch for the highest ollie
  maxBoost: 0.3, // a full crouch pops 30% higher than a tap; a tap is the old ollie exactly
  seqWindow: 0.32, // s between the two halves of a manual press
  offGround: 0.25, // s of real air that ends a manual; a park seam's one-frame hop does not
  flick: 0.6 // stick or d-pad past this counts as up or down
});

/**
 * Hold-to-crouch, release-to-ollie. Call every frame with whether A is down.
 * Returns {crouch: 0..1 while held, pop: null | multiplier on the frame A is released}.
 */
export function stepOllie(state, held, now) {
  const s = state ?? {since: null};
  if (held) {
    if (s.since == null) s.since = now;
    return {state: s, crouch: Math.min(1, (now - s.since) / PAD_SKATE.fullCrouch), pop: null};
  }
  if (s.since == null) return {state: s, crouch: 0, pop: null};
  const charge = Math.min(1, (now - s.since) / PAD_SKATE.fullCrouch);
  s.since = null;
  return {state: s, crouch: 0, pop: 1 + PAD_SKATE.maxBoost * charge};
}

/**
 * Manual latch from a two-part flick: up then down = manual (wheelie), down then up = nose manual
 * (stoppie). THPS2 takes the flick in the air ("im Sprung") so the landing rolls straight into the
 * manual; a flick on the ground starts one at once. The latch holds until an ollie, rolling off the
 * ground after the manual began, stopping, or the same flick again. `y` is the stick or d-pad: up positive.
 */
export function stepManual(state, {y = 0, now, ollie = false, airborne = false, speed = 0}) {
  const s = state ?? {last: null, lastAt: -1e9, armed: null, latch: null, rolling: false, air: 0, at: now};
  s.air = airborne ? s.air + Math.max(0, now - (s.at ?? now)) : 0;
  s.at = now;
  const dir = y > PAD_SKATE.flick ? 'up' : y < -PAD_SKATE.flick ? 'down' : null;
  if (dir && dir !== s.armed) {
    if (s.last && s.last !== dir && now - s.lastAt <= PAD_SKATE.seqWindow) {
      const want = s.last === 'up' ? 'wheelie' : 'stoppie';
      s.latch = s.latch === want ? null : want;
      s.last = null;
    } else {
      s.last = dir;
      s.lastAt = now;
    }
  }
  s.armed = dir;
  if (ollie || (s.rolling && s.air > PAD_SKATE.offGround) || (!airborne && speed < 0.3)) s.latch = null;
  if (!s.latch) s.rolling = false;
  else if (!airborne) s.rolling = true;
  return {state: s, wheelie: s.latch === 'wheelie', stoppie: s.latch === 'stoppie'};
}

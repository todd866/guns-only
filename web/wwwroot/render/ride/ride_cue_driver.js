/**
 * Headless proof driver for the weekend ride. Same cues and the same 250 ms lag as
 * WeekendRideCueRider. Not a player control mode: main.js calls it only when the
 * page was opened with ?cueRider=1.
 */

const LAG_SECONDS = 0.25;
const THROTTLE_RATE = 2;
const BRAKE_RATE = 4;
const STEER_RATE = 2;

function moveToward(current, target, maxDelta) {
  return current + Math.min(maxDelta, Math.max(-maxDelta, target - current));
}

export function rideCueIntent(decision, now = decision) {
  const pitApproach = decision.pitOpen && !decision.inPit;
  const lookDistanceM = pitApproach
    ? Math.max(80, Math.abs(decision.look) * 2)
    : Math.max(12, decision.speed * 0.8);
  const headingError = Math.atan2(decision.look, lookDistanceM);
  const commit = !pitApproach && !decision.exit && decision.apexM < 40;
  const steerGain = pitApproach ? 0.8 : commit ? 1.6 : 0.55;
  const steerCap = pitApproach ? 0.45 : commit ? 0.75 : 0.55;
  let steerTarget = Math.min(steerCap, Math.max(-steerCap, headingError * steerGain));
  const cornerMps = Math.max(0, decision.apexMps);

  let speedTarget = 32;
  if (decision.pitOpen && !decision.inPit) speedTarget = 12;
  else if (decision.inPit && decision.legal) speedTarget = 0;
  else if (!decision.exit && decision.apexM < 150) speedTarget = cornerMps;
  else if (decision.exit && Math.abs(decision.look) > 3) speedTarget = cornerMps;
  else if (decision.exit) speedTarget = Math.max(cornerMps, 18);

  if (now.inPit) steerTarget = 0;

  let throttleTarget = decision.speed < speedTarget - 1 ? 1 : 0;
  const brakeDivisor = now.inPit ? 40 : 8;
  let brakeTarget = decision.speed > speedTarget + 1
    ? Math.min(1, Math.max(0, (decision.speed - speedTarget) / brakeDivisor))
    : 0;
  if (brakeTarget > 0.05) throttleTarget = 0;
  if (!decision.onTrack && !decision.pitOpen) throttleTarget = 0;
  if (!decision.inPit && decision.speed < 10) {
    throttleTarget = Math.max(throttleTarget, 0.4);
    brakeTarget = 0;
  }
  return { throttleTarget, brakeTarget, steerTarget };
}

export function createRideCueDriver() {
  const cues = [];
  let elapsed = 0;
  let throttle = 0;
  let brake = 0;
  let steer = 0;

  return {
    step(state, dt) {
      const stepDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 1 / 120;
      elapsed += stepDt;
      const speed = Math.hypot(state?.vx ?? 0, state?.vy ?? 0, state?.vz ?? 0);
      const cue = {
        t: elapsed,
        speed,
        apexM: Number(state?.next_apex_m) || 0,
        apexMps: Number(state?.next_apex_mps) || 0,
        exit: state?.next_apex_exit === true,
        pitOpen: state?.pit_open === true,
        look: Number(state?.look_ahead_lateral_m) || 0,
        inPit: state?.in_pit === true,
        legal: state?.pit_entry_legal === true,
        onTrack: state?.on_track !== false,
      };
      cues.push(cue);
      while (cues.length > 1 && elapsed - cues[0].t >= LAG_SECONDS) cues.shift();
      const decision = cues[0];
      const intent = rideCueIntent(decision, cue);
      throttle = moveToward(throttle, intent.throttleTarget, THROTTLE_RATE * stepDt);
      brake = moveToward(brake, intent.brakeTarget, BRAKE_RATE * stepDt);
      steer = nowSteer(steer, intent.steerTarget, stepDt, cue.inPit);
      return { throttle, brake, steer };
    },
  };
}

function nowSteer(current, target, dt, inPit) {
  if (inPit) return 0;
  return moveToward(current, target, STEER_RATE * dt);
}

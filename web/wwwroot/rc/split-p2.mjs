// Player 2 split-screen: when split stays on, pad flight input, rival drive packet.
import {padKind} from './pad-art.mjs';

const axis = v => {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
};

/** Split stays on for a joined rival, including while either player is the walking robot. */
export function splitScreenOn({split, rival, started, p1Robot, p2Robot}) {
  void p1Robot;
  void p2Robot;
  return !!(split && rival && started);
}

/** Pad 2 left face: car → walking robot → skateboard → car. */
export function toggleP2SkateForm(form) {
  if (form === 'robot') return 'board';
  if (form === 'board') return 'car';
  return 'robot';
}

/** Left stick walks, A jumps (bottom on Xbox, right on SN30), top face punches and uses. */
export function p2RobotPad(gp) {
  const down = i => (gp?.buttons?.[i]?.value ?? 0) > 0.5,
    jump = padKind(gp?.id) === 'sn30' ? 1 : 0,
    top = down(3);
  return {
    throttle: gp ? -axis(gp.axes?.[1] ?? 0) : 0,
    steer: gp ? axis(gp.axes?.[0] ?? 0) : 0,
    jump: down(jump),
    punch: top,
    use: top
  };
}

/** Right stick pitch/roll, left stick/triggers power/yaw — same contract as driving-input flightInput + kid easy flyer. */
export function flightGamepadInput(gp, poll, mode) {
  if (mode === 'kid') {
    return {easy: true, steer: poll.steer ?? 0, climb: poll.throttle ?? 0, burner: !!poll.boost};
  }
  return {
    pitch: axis(-(gp?.axes?.[3] ?? 0)),
    roll: axis(gp?.axes?.[2] ?? 0),
    yaw: poll.steer ?? 0,
    power: poll.throttle ?? 0,
    burner: !!poll.boost,
    assist: mode === 'kid'
  };
}

export function rivalHumanInput({paused, uiPanel, pad2, gp, mode, session, fire, tagBoost, p2Form}) {
  if (paused || uiPanel) return {throttle: 0, steer: 0, brake: true};
  // The walker is its own body. Hold the hidden car so the stick does not drive it.
  if (p2Form === 'robot')
    return {throttle: 0, steer: 0, brake: true, drift: false, fire: false, boost: tagBoost, boardSpin: false};
  const base = {
    throttle: pad2.throttle,
    steer: pad2.steer,
    brake: pad2.brake,
    drift: pad2.drift,
    fire: !!fire,
    boost: tagBoost,
    boardSpin: p2Form === 'board'
  };
  if (!session.flight.mode) return base;
  const fl = flightGamepadInput(gp, pad2, mode);
  if (session.flight.mode === 'chute') fl.steer = pad2.steer;
  return {...base, throttle: 0, brake: false, flight: fl};
}

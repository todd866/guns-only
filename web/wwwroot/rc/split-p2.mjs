// Player 2 split-screen: the same standard pad as player 1, on their own controller.
import {mapPad, cameraMove} from './gamepad.mjs';

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

/** Left stick walks relative to player 2's camera. A (index 0) jumps, X punches and uses. */
export function p2RobotPad(gp, camYaw = 0) {
  const m = mapPad('robot', gp),
    move = cameraMove(camYaw, m.moveX, m.moveY);
  return {
    move,
    throttle: 0,
    steer: 0,
    jump: m.jumpHeld,
    punch: m.punch,
    use: m.punch,
    sprint: m.sprint,
    aim: m.aim
  };
}

/** Left stick pitch/roll, triggers throttle, right stick is the camera (not the aeroplane). */
export function flightGamepadInput(gp, poll, mode) {
  const m = mapPad('fly', gp);
  return {
    pitch: m.pitch,
    roll: m.roll,
    yaw: 0,
    power: m.power,
    burner: !!poll?.boost,
    assist: mode === 'kid'
  };
}

export function rivalHumanInput({paused, uiPanel, pad2, gp, mode, session, fire, tagBoost, p2Form}) {
  if (paused || uiPanel) return {throttle: 0, steer: 0, brake: true};
  // The walker is its own body. Hold the hidden car so the stick does not drive it.
  if (p2Form === 'robot')
    return {throttle: 0, steer: 0, brake: true, drift: false, fire: false, boost: tagBoost, boardSpin: false};
  const flying = !!session.flight.mode,
    mapped = mapPad(flying ? 'fly' : p2Form === 'board' ? 'board' : 'car', gp),
    base = {
      throttle: flying ? 0 : (pad2?.throttle ?? mapped.throttle),
      steer: flying ? 0 : (pad2?.steer ?? mapped.steer),
      brake: pad2?.brake ?? false,
      drift: flying ? false : !!(pad2?.drift ?? mapped.drift),
      fire: !!fire,
      boost: tagBoost,
      boardSpin: p2Form === 'board'
    };
  if (!flying) return base;
  const fl = flightGamepadInput(gp, pad2, mode);
  if (session.flight.mode === 'chute') fl.steer = pad2?.moveX || pad2?.steer || 0;
  return {...base, throttle: 0, brake: false, flight: fl};
}

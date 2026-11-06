// Player 2 split-screen: the same standard pad as player 1, on their own controller.
import {mapPad, cameraMove} from './gamepad.mjs';
import {stickAttitude} from './physics/flight.mjs';

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
export function p2RobotPad(gp, camYaw = 0, feel) {
  const m = mapPad('robot', gp, feel),
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

/** Left stick climb/turn, triggers throttle, shoulders yaw. Right stick stays the camera. */
export function flightGamepadInput(gp, poll, mode, {invert = false, feel} = {}) {
  void mode;
  const m = mapPad('fly', gp, feel),
    att = stickAttitude({x: m.roll, y: m.pitch}, {invert});
  return {
    arcade: true,
    pitch: att.pitch,
    roll: att.roll,
    yaw: m.yaw,
    power: m.power,
    flyUp: !!m.jumpHeld,
    burner: !!(m.rt > 0.55 || poll?.boost),
    trick: m.loopHeld ? (Math.abs(m.roll) > 0.35 ? 'roll' : 'loop') : null
  };
}

export function rivalHumanInput({paused, uiPanel, pad2, gp, mode, session, fire, tagBoost, p2Form, invert = false, feel}) {
  if (paused || uiPanel) return {throttle: 0, steer: 0, brake: true};
  // The walker is its own body. Hold the hidden car so the stick does not drive it.
  if (p2Form === 'robot')
    return {throttle: 0, steer: 0, brake: true, drift: false, fire: false, boost: tagBoost, boardSpin: false};
  const flying = !!session.flight.mode,
    mapped = mapPad(flying ? 'fly' : p2Form === 'board' ? 'board' : 'car', gp, feel),
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
  const fl = flightGamepadInput(gp, pad2, mode, {invert, feel});
  if (session.flight.mode === 'chute') fl.steer = fl.roll || fl.yaw || pad2?.moveX || pad2?.steer || 0;
  return {...base, throttle: 0, brake: false, flight: fl};
}

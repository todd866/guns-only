// Player 2 split-screen: when split stays on, pad flight input, rival drive packet.
const axis = v => {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) < 0.12 ? 0 : (Math.sign(v) * (Math.abs(v) - 0.12)) / 0.88;
};

/** Split stays on in roam unless player 1 is the walking robot (P2 robot not implemented). */
export function splitScreenOn({split, rival, started, p1Robot}) {
  return !!(split && rival && started && !p1Robot);
}

export function toggleP2SkateForm(form) {
  return form === 'board' ? 'car' : 'board';
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

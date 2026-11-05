// When does a player need the controller drawing? Pure, per player, fed every frame.
// Shows when they sit still, hold both triggers (go + reverse cancel), push into a wall,
// or have just picked the pad up; hides after a few seconds of real driving.
export function createCoach() {
  let still = 0,
    both = 0,
    pushing = 0,
    good = 0,
    intro = 0,
    showing = false;
  return ({dt, speed, throttle = 0, lt = 0, rt = 0, active = true, joined = false}) => {
    if (joined) intro = 8;
    if (!active) return {show: false, glow: new Set(), why: null};
    intro = Math.max(0, intro - dt);
    still = speed < 0.6 && Math.abs(throttle) < 0.2 ? still + dt : 0;
    pushing = speed < 0.6 && throttle > 0.3 ? pushing + dt : 0;
    both = lt > 0.3 && rt > 0.3 ? both + dt : 0;
    good = speed > 2.2 && both === 0 ? good + dt : 0;
    const why = both > 1.2 ? 'both' : pushing > 2 ? 'stuck' : still > 2.5 ? 'still' : intro > 0 ? 'intro' : null;
    if (why) showing = true;
    else if (good > 3) showing = false;
    const glow = new Set(why === 'both' ? [7, 'stick'] : why === 'stuck' ? [6, 13] : why === 'still' ? ['stick', 7, 12] : []);
    return {show: showing, glow, why};
  };
}

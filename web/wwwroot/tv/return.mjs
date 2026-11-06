// Every TV game leaves the same way: hold Start for 1.5 s, or the pause
// menu's Games control. Both come back here.
export const TV_HOME = "/tv/";
export const HOLD_MS = 1500;
export const START_BUTTON = 9;

export function startDown(pads) {
  for (const pad of pads ?? []) {
    const button = pad?.buttons?.[START_BUTTON];
    if (!button) continue;
    if (button.pressed === true || Number(button.value) > 0.5) return true;
  }
  return false;
}

export function stepHold(state, {down, now, holdMs = HOLD_MS} = {}) {
  if (!down) return {since: null, fired: false, go: false};
  const since = state?.since ?? now;
  const go = now - since >= holdMs && state?.fired !== true;
  return {since, fired: state?.fired === true || go, go};
}

export function goHome(win = globalThis) {
  const location = win?.location;
  if (!location) return;
  if (typeof location.assign === "function") location.assign(TV_HOME);
  else location.href = TV_HOME;
}

export function attachHold(getPads, {now = () => Date.now(), holdMs = HOLD_MS, go = () => goHome()} = {}) {
  let state = {since: null, fired: false};
  return () => {
    state = stepHold(state, {down: startDown(getPads?.() ?? []), now: now(), holdMs});
    if (state.go) go();
    return state.go === true;
  };
}

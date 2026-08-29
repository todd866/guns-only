/**
 * Escape peels the teaching layer first, toggles only a resumable pause during a live ride,
 * and cannot replace the actions on a terminal debrief.
 */
export function weekendRideEscapeAction({
  onboardingOpen = false,
  paused = false,
  terminal = false,
} = {}) {
  if (onboardingOpen) return "dismiss-onboarding";
  if (terminal) return "noop";
  return paused ? "resume" : "pause";
}

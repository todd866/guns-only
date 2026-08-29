/** Escape peels the topmost Cobra UI layer, then toggles an in-mission pause. */

/** Where the mission list lives — the sortie chooser on the root shell. */
export const MAIN_MENU_HREF = "/?program=cobra-lab&menu=1";

/**
 * @param {{ onboardingOpen?: boolean, tacticalMapOpen?: boolean, paused?: boolean, terminal?: boolean }} shell
 * @returns {"dismiss-onboarding" | "close-map" | "pause" | "resume" | "noop"}
 */
export function resolveEscapeAction(shell = {}) {
  if (shell.onboardingOpen === true) return "dismiss-onboarding";
  if (shell.tacticalMapOpen === true) return "close-map";
  if (shell.terminal === true) return "noop";
  return shell.paused === true ? "resume" : "pause";
}

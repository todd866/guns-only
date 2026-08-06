/**
 * What Escape means in Hold the Bridge.
 *
 * The other shells bind Escape to PAUSE: the F-22 (app.js -> toggleSessionPause), Weekend Ride
 * (SetPaused) and the indoor mission (togglePause) all have a pause state in their own authority
 * to toggle. The Cobra does not — CobraWebBridge exposes no pause export at all, so there is
 * nothing on this page for Escape to toggle. What the page also lacks is any way out: the play
 * shell has no back link, no menu chrome and no exit control, so once a player is in the gorge
 * the only exit is the browser's own back button. The owner's report on Build 265 was exactly
 * that ("esc doesn't escape to menu").
 *
 * So Escape leaves the sortie for the main menu, deliberately and not as a pause-by-another-name.
 * Two orderings matter and are why this is a function rather than an inline branch:
 *
 *  - the shared first-run controls overlay dismisses on ANY key (first_run_controls.js listens in
 *    capture phase). Without an explicit precedence the very first Escape of a player's first
 *    sortie would dismiss the card AND quit the mission in one press. Escape closes the card and
 *    stops there;
 *  - a terminal sortie (debrief card up) still exits. R restarts, Escape leaves; a mission that
 *    has already ended is the moment a player is most likely to want the menu.
 */

/** Where the mission list lives — the sortie chooser on the root shell. */
export const MAIN_MENU_HREF = "/";

/**
 * @param {{ onboardingOpen?: boolean, missionTerminal?: boolean }} shell
 * @returns {"dismiss-onboarding" | "leave-mission"}
 */
export function resolveEscapeAction(shell = {}) {
  return shell.onboardingOpen === true ? "dismiss-onboarding" : "leave-mission";
}

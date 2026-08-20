/**
 * First-visit Soniachne valley on-ramp. Storage sits in the guns-only.* family; it is not the
 * cobra/weekend-ride controls overlay (`guns-only.onboarding.*` + first_run_controls.js).
 */

export const FIRST_RUN_VALLEY_STORAGE_KEY = "guns-only.first-run-valley";

const FIRST_RUN_MISSION_ID = "mission.modern.visual-merge.first-run-valley.v1";

/** True until markFirstRunValleySeen ran. Storage failures read as pending. */
export function firstRunValleyPending(storage) {
  try {
    return storage?.getItem?.(FIRST_RUN_VALLEY_STORAGE_KEY) == null;
  } catch {
    return true;
  }
}

/** Record that the valley on-ramp has launched. Never throws (Safari private mode). */
export function markFirstRunValleySeen(storage) {
  try {
    storage?.setItem?.(FIRST_RUN_VALLEY_STORAGE_KEY, "seen");
  } catch {
    // The picker simply returns next launch — better than crashing the boot path.
  }
}

/**
 * First pending visit with no other programme query auto-starts the valley. Playwright
 * (`navigator.webdriver`) keeps the six-tile picker unless `?firstRun=1`. `?menu=1` always
 * keeps the picker, including over a QA replay query.
 */
export function shouldAutoStartFirstRunValley({
  firstRunPending,
  programQuery = null,
  menuQuery = null,
  firstRunQuery = null,
  webdriver = false,
} = {}) {
  if (String(menuQuery ?? "") === "1") return false;
  if (String(firstRunQuery ?? "") === "1") return true;
  if (webdriver === true) return false;
  const program = String(programQuery ?? "").trim();
  if (program !== "" && program !== "first-merge") return false;
  return firstRunPending === true;
}

/** Aria names heaters only on this beat while they remain. */
export function touchFireAriaLabel(state = {}) {
  const remaining = Number(state?.aim9_remaining);
  if (state?.mission_definition_id === FIRST_RUN_MISSION_ID
      && Number.isInteger(remaining)
      && remaining > 0) {
    return "Fire missile";
  }
  return "Fire guns";
}

/** The visible control must teach the same overloaded Fire contract as authority. */
export function touchFireVisibleLabel(state = {}) {
  const remaining = Number(state?.aim9_remaining);
  if (state?.mission_definition_id === FIRST_RUN_MISSION_ID) {
    return Number.isInteger(remaining) && remaining > 0 ? "FOX 2" : "GUNS";
  }
  return "FIRE";
}

/**
 * First-visit Kestrel Gorge on-ramp. Storage sits in the guns-only.* family; it is not the
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
 * Kestrel Gorge is an opt-in replay, never the front door (2026-10-13 opening package,
 * docs/grok-overhaul/design/f22-opening.md). A fresh visit -- root or ?program=first-merge -- lands
 * on the wordless picker with the F-22 selected, one tap from the rung-0 gun lesson. Only the
 * explicit replay seam (?firstRun=1, which the "Replay valley intro" button writes) stages the
 * valley Ready card; ?menu=1 still wins over it. `firstRunPending` is accepted for callers but no
 * longer decides anything: the unseen flag is a record, not a detour.
 */
export function shouldAutoStartFirstRunValley({
  menuQuery = null,
  firstRunQuery = null,
} = {}) {
  if (String(menuQuery ?? "") === "1") return false;
  return String(firstRunQuery ?? "") === "1";
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

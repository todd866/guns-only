// Beyond ~10 NM no human eye holds a fighter: contacts retain bearing/data cues but lose the
// close-range positional bracket. The renderer keeps an aircraft speck out to ~20 NM, so an
// on-screen contact in that visible band gets a small target box; off-screen or truly BVR contacts
// get a bearing arrow instead.
export const BANDIT_TALLY_RANGE_M = 18_520;
export const VISIBLE_TARGET_RANGE_M = 37_040;

export function contactPositionCue(rangeM, onScreen) {
  const range = Number(rangeM);
  if (onScreen !== true || !Number.isFinite(range) || range < 0) return "arrow";
  if (range <= BANDIT_TALLY_RANGE_M) return "bracket";
  if (range < VISIBLE_TARGET_RANGE_M) return "box";
  return "arrow";
}

import assert from "node:assert/strict";

export const CONTACT_BY_S = 20;
export const WINDOW_BY_S = 30;
export const WINDOW_MIN_S = 2;
export const HIT_BY_S = 45;
export const KILL_TO_D1_S = 30;
// The harness polls at 10 ms wall time; tolerate screenshot/scheduling overhead up to one
// human reaction period in sim time. A longer observation gap cannot prove continuity.
export const MAX_WINDOW_SAMPLE_GAP_S = 0.25;

// Only adjacent in-cone samples extend an interval. Leaving the cone (including a missing
// bracket) ends it at the last qualifying sample; no unseen time is credited at either edge.
export function createGunWindowTracker() {
  const windows = [];
  let active = null;
  return {
    sample(t, coarse) {
      if (!coarse || t > WINDOW_BY_S) { active = null; return; }
      if (active === null || t - active.endS > MAX_WINDOW_SAMPLE_GAP_S) {
        active = { startS: t, endS: t };
        windows.push(active);
      } else {
        active.endS = t;
      }
    },
    result() {
      return {
        coarseWindows: windows.map((w) => ({ ...w })),
        coarseWindowS: windows.reduce((longest, w) => Math.max(longest, w.endS - w.startS), 0),
      };
    },
  };
}

export function checkDesktopReceipt(r) {
  const tag = `${r.pilot} (${r.launch?.mission ?? "?"}, end ${r.endReason})`;
  assert.equal(r.launch?.autoAim, true, `${tag}: missing gun_gimbal_mounted boolean gimbal telemetry`);
  assert.ok(r.contactS !== null && r.contactS <= CONTACT_BY_S,
    `${tag}: no target bracket in the forward view within ${CONTACT_BY_S} s (first at ${r.contactS})`);
  // An early physical hit only completes the continuous interval containing it. Never sum
  // separate opportunities or waive the duration because a hit happened before a window.
  const qualifyingWindow = r.coarseWindows?.some(({ startS, endS }) =>
    Number.isFinite(startS) && Number.isFinite(endS) && startS >= 0 && endS <= WINDOW_BY_S
    && endS > startS && (endS - startS >= WINDOW_MIN_S - 1e-9
      || (Number.isFinite(r.firstHitS) && r.firstHitS > startS && r.firstHitS <= endS)));
  assert.ok(qualifyingWindow,
    `${tag}: no continuous coarse gun window of ${WINDOW_MIN_S} s (or through the hit) before ${WINDOW_BY_S} s`);
  assert.ok(r.firstHitS !== null && r.firstHitS <= HIT_BY_S,
    `${tag}: no physical hit within ${HIT_BY_S} s (rounds fired ${r.end?.rounds ?? "?"})`);
  assert.equal(r.launch?.lesson, "O1", `${tag}: the first sortie is not O1`);
  assert.ok(r.d1S !== null, `${tag}: no O1 -> D1 hand-over within ${KILL_TO_D1_S} s of the kill (kill ${r.killS})`);
  assert.deepEqual(r.errors, []);
}

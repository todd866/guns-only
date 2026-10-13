import assert from "node:assert/strict";

export const CONTACT_BY_S = 20;
export const WINDOW_BY_S = 30;
export const WINDOW_MIN_S = 2;
export const HIT_BY_S = 45;
export const KILL_TO_D1_S = 30;

export function checkDesktopReceipt(r) {
  const tag = `${r.pilot} (${r.launch?.mission ?? "?"}, end ${r.endReason})`;
  assert.equal(r.launch?.autoAim, true, `${tag}: missing gun_gimbal_mounted boolean gimbal telemetry`);
  assert.ok(r.contactS !== null && r.contactS <= CONTACT_BY_S,
    `${tag}: no target bracket in the forward view within ${CONTACT_BY_S} s (first at ${r.contactS})`);
  // A kill inside the window ends it early; the window must then have lasted until the hit.
  const windowNeed = r.firstHitS !== null && r.firstWindowS !== null
    ? Math.min(WINDOW_MIN_S, Math.max(0, r.firstHitS - r.firstWindowS)) : WINDOW_MIN_S;
  assert.ok(r.coarseWindowS >= windowNeed - 0.05,
    `${tag}: coarse gun window ${r.coarseWindowS} s before ${WINDOW_BY_S} s, need ${windowNeed} s`);
  assert.ok(r.firstHitS !== null && r.firstHitS <= HIT_BY_S,
    `${tag}: no physical hit within ${HIT_BY_S} s (rounds fired ${r.end?.rounds ?? "?"})`);
  assert.equal(r.launch?.lesson, "O1", `${tag}: the first sortie is not O1`);
  assert.ok(r.d1S !== null, `${tag}: no O1 -> D1 hand-over within ${KILL_TO_D1_S} s of the kill (kill ${r.killS})`);
  assert.deepEqual(r.errors, []);
}


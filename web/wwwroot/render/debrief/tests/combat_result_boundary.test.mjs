import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

// Execute the app's actual boundary/Recover functions with their shell dependencies stubbed.
const app = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
const source = app.slice(app.indexOf("const COMBAT_RESULT_HOLD_SECONDS"),
  app.indexOf("function againFromCombatResult"));
function shell() {
  const reasons = new Set();
  const ctx = vm.createContext({
    selectedPracticeExercise: null, isMultiplayerLane: () => false, isF22Sortie: () => true,
    combatCompleteSeenAt: null, combatResultShownFor: null, pauseReasons: reasons,
    recorder: { event() {} }, sceneCanvas: { focus() {} },
    setPauseReason: (key, on) => on ? reasons.add(key) : reasons.delete(key),
  });
  vm.runInContext(source, ctx);
  return { ctx, reasons };
}
const flying = { player_entity_id: 1, session_phase: "ACTIVE", combat_complete: true,
  player_rtb_active: true, player_terminal_state: "FLYING", sortie_outcome: "NONE" };

test("destruction during the splash hold never pauses a live wreck on Combat result", () => {
  const { ctx, reasons } = shell();
  ctx.observeCombatResultBoundary({ ...flying, simulation_time_s: 10 });
  assert.equal(reasons.size, 0);
  ctx.latestState = { ...flying, player_terminal_state: "DESTROYED_AIRBORNE", simulation_time_s: 11 };
  ctx.observeCombatResultBoundary(ctx.latestState);
  ctx.observeCombatResultBoundary({ ...ctx.latestState, simulation_time_s: 13 });
  assert.equal(reasons.has("combat-result"), false);
});

test("a flying pilot gets the boundary after two seconds and can resume the same aircraft", () => {
  const { ctx, reasons } = shell();
  ctx.latestState = flying;
  ctx.observeCombatResultBoundary({ ...flying, simulation_time_s: 10 });
  ctx.observeCombatResultBoundary({ ...flying, simulation_time_s: 11.9 });
  assert.equal(reasons.size, 0);
  ctx.observeCombatResultBoundary({ ...flying, simulation_time_s: 12 });
  assert.equal(reasons.has("combat-result"), true);
  assert.equal(ctx.recoverFromCombatResult(), true);
  assert.equal(reasons.size, 0);
});

test("Recover rejects a stale click after physical loss", () => {
  const { ctx, reasons } = shell();
  reasons.add("combat-result");
  ctx.latestState = { ...flying, player_terminal_state: "DESTROYED_AIRBORNE" };
  assert.equal(ctx.recoverFromCombatResult(), false);
});

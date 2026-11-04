import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

// The picker is usable while the ~20 MB simulator runtime boots: owner, 2026-10-28, "the loading
// is too slow". Live measurement at 8 Mbps: picker 14.5 s -> 2.2 s, Saucer Springs 3.9 s.
const [app, index] = await Promise.all([
  readFile(new URL("../../../app.js", import.meta.url), "utf8"),
  readFile(new URL("../../../index.html", import.meta.url), "utf8"),
]);

test("the cover lifts before boot unless the first-run valley flies straight in", () => {
  const lift = app.indexOf('bootScreen?.classList.add("picker-live")');
  assert.ok(lift > 0 && lift < app.lastIndexOf("boot().catch(showFatal);"), "picker-live is set before boot starts");
  assert.match(app.slice(lift - 200, lift), /shouldAutoStartFirstRunValley\(firstRunValleyQueryContext\(\)\)/);
  assert.match(index, /#boot\.picker-live:not\(\.ready\) \{\s*background: none;\s*pointer-events: none;/);
});

test("Fly before the runtime: dedicated routes leave now, simulator launches wait for the first frame", () => {
  const start = app.indexOf("function activateReadyAction() {");
  const guard = app.slice(start, app.indexOf("\n  if (pauseReasons.has(\"finished\"))", start));
  const run = ({ route, practice = null }) => {
    const calls = [], removed = [];
    const context = {
      pauseReasons: new Set(["ready"]), bridge: null, selectedProgramNodeId: "x", selectedBeat: 0,
      selectedPracticeExercise: practice, bootLaunchPending: false,
      buildIdentityBlocksSortie: () => false, againFromCombatResult: () => "again",
      experienceById: () => (route ? { mission: null, route } : { mission: 1 }),
      launchMission: () => { calls.push("launch"); return true; },
      bootScreen: { classList: { remove: (name) => removed.push(name) } },
    };
    const result = vm.runInNewContext(`${guard}\n}\nconst r = activateReadyAction(); ({ r, pending: bootLaunchPending });`, context);
    return { ...result, calls, removed };
  };
  const rc = run({ route: "/rc/" });
  assert.deepEqual([rc.r, rc.pending, rc.calls], [true, false, ["launch"]]);
  const f22 = run({ route: null });
  assert.deepEqual([f22.r, f22.pending, f22.calls, f22.removed], [false, true, [], ["picker-live"]]);
  assert.match(app, /if \(bootLaunchPending\) \{\s*bootLaunchPending = false;\s*queueMicrotask\(activateReadyAction\);/);
});

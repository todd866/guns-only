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

test("buildIdentityBlocksSortie blocks only on a confirmed stale identity, not while checking", () => {
  const match = app.match(/function buildIdentityBlocksSortie\(\) \{[\s\S]*?\n\}/);
  assert.ok(match, "buildIdentityBlocksSortie must exist in app.js");
  const check = (buildIdentity) => vm.runInNewContext(
    `${match[0]}\nbuildIdentityBlocksSortie()`,
    { buildIdentity },
  );
  assert.equal(check({ stale: false, state: "checking" }), false,
    "in-flight build check must not lock the Fly button");
  assert.equal(check({ stale: false, state: "current" }), false);
  assert.equal(check({ stale: false, state: "unverified" }), false);
  assert.equal(check({ stale: false, state: "candidate" }), false);
  assert.equal(check({ stale: true, state: "stale" }), true,
    "confirmed stale build must still block sortie launch");
  assert.match(app, /if \(showScreen && ready && !wasScreenVisible\) void resolveBuildIdentity\(\{ force: true \}\);/);
  assert.match(app, /if \(buildIdentity\.stale\)[\s\S]*?void reloadCurrentBuild\(\)/);
});

test("f22-value and cvf-value layouts fit their longest values without text-overflow ellipsis", () => {
  assert.doesNotMatch(index, /\.f22-value\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(app, /\.cvf-value\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.match(app, /\.cvf-primary\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(max-content,\s*1fr\)\)/);
});

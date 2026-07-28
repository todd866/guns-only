import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const sessionUrl = new URL("../../../../../sim/SimulationSession.cs", import.meta.url);

test("measured frame pressure reaches the kernel before the next simulation advance", async () => {
  const [app, bridge, session] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(bridgeUrl, "utf8"),
    readFile(sessionUrl, "utf8"),
  ]);

  assert.match(app, /new AdaptiveAiWorkBudget\(\)/);
  assert.match(app,
    /adaptiveAiWorkBudget\.observe\(\{[\s\S]*?previousSimPhaseMilliseconds[\s\S]*?previousExecutedTicks[\s\S]*?\}\);/);
  assert.match(app,
    /previousSimPhaseMilliseconds = simPhaseMilliseconds;[\s\S]*?previousExecutedTicks = executedTicks;/);

  const applyStart = app.indexOf("function applyAiComputeLevel");
  const resetStart = app.indexOf("function resetAdaptiveAiBudget", applyStart);
  assert.ok(applyStart >= 0);
  assert.ok(resetStart > applyStart);
  const applySource = app.slice(applyStart, resetStart).trim();
  const appliedLevels = [];
  const apply = new Function(
    "bridge",
    "latestState",
    `return (${applySource});`,
  )({
    SetAiComputeLevel(level) {
      appliedLevels.push(level);
      return 73.9;
    },
  }, { tick: 11 });
  assert.equal(apply(2), 73,
    "the helper must use the authority tick returned by SetAiComputeLevel");
  assert.deepEqual(appliedLevels, [2]);
  const fallbackApply = new Function(
    "bridge",
    "latestState",
    `return (${applySource});`,
  )({ SetAiComputeLevel: () => Number.NaN }, { tick: 11.8 });
  assert.equal(fallbackApply(1), 11,
    "projected state is only a fallback when the bridge cannot return a tick");

  const decisionStart = app.indexOf("if (aiBudgetDecision.changed)");
  const levelApply = app.indexOf(
    "applyAiComputeLevel(aiBudgetDecision.computeLevel)",
    decisionStart,
  );
  const transitionEvent = app.indexOf(
    'recorder.event("perf", "AiComputeLevel"',
    levelApply,
  );
  const simulationAdvance = app.indexOf("bridge.Advance(", transitionEvent);
  assert.ok(decisionStart >= 0);
  assert.ok(levelApply > decisionStart);
  assert.ok(transitionEvent > levelApply);
  assert.ok(simulationAdvance > transitionEvent);
  const transitionBlock = app.slice(decisionStart, simulationAdvance);
  assert.match(transitionBlock,
    /const effectiveAuthorityTick\s*=\s*applyAiComputeLevel\(aiBudgetDecision\.computeLevel\);/);
  assert.match(transitionBlock,
    /effective_authority_tick:\s*effectiveAuthorityTick/);
  assert.ok(
    transitionBlock.indexOf("const effectiveAuthorityTick")
      < transitionBlock.indexOf('recorder.event("perf", "AiComputeLevel"'),
    "the exact bridge-returned tick must be captured before its telemetry event",
  );

  const resetEnd = app.indexOf(
    "\n}\n\n// The fight director",
    resetStart,
  );
  const resetBlock = app.slice(resetStart, resetEnd);
  assert.match(resetBlock, /recordInitial/);
  assert.match(resetBlock, /cause:\s*"sortie-initial"/);
  assert.match(resetBlock,
    /effective_authority_tick:\s*effectiveAuthorityTick/);
  const beginFlightStart = app.indexOf("function beginFlight");
  const beginFlightEnd = app.indexOf("function activateReadyAction", beginFlightStart);
  assert.match(app.slice(beginFlightStart, beginFlightEnd),
    /resetAdaptiveAiBudget\(\{\s*recordInitial:\s*true\s*\}\)/);

  assert.match(bridge,
    /\[JSExport\][\s\S]*?double SetAiComputeLevel\(int level\)[\s\S]*?Session\.SetAiComputeLevel[\s\S]*?return Session\.Tick/);
  assert.match(session,
    /public void SetAiComputeLevel\(AiComputeLevel level\)/);
  assert.match(session,
    /void RunFixedTick\(\) \{[\s\S]*?ConfigureAdaptiveAiPlanning\(\);/);
});

test("production catch-up cannot cross the pair's five-tick planner separation", async () => {
  const app = await readFile(appUrl, "utf8");
  const capExpression = app.match(
    /const SIM_CATCHUP_CAP_SECONDS = ([^;]+);/,
  )?.[1];

  assert.ok(capExpression);
  const capSeconds = Number(new Function(`return ${capExpression}`)());
  assert.equal(capSeconds, 4 / 120);
  assert.match(app, /without crossing the formation's five-tick planner/);
});

test("frame-pressure sampling uses safe early replay truth before projection refresh", async () => {
  const app = await readFile(appUrl, "utf8");
  const replayDeclaration = app.indexOf(
    "let replayActive = incidentReplay?.active === true",
  );
  const observeStart = app.indexOf("adaptiveAiWorkBudget.observe({");
  const projectionRefresh = app.indexOf(
    "replayActive = replayPresentation.active",
    observeStart,
  );

  assert.notEqual(replayDeclaration, -1);
  assert.notEqual(observeStart, -1);
  assert.ok(replayDeclaration < observeStart,
    "replay state must be initialized before the early performance policy");
  assert.ok(projectionRefresh > observeStart,
    "fresh snapshot replay state should update only after projection");
  const pressureSample = app.slice(observeStart, projectionRefresh);
  assert.doesNotMatch(pressureSample, /active:\s*!\s*replayActive/,
    "frame pressure must not read the later projected replay value");
  assert.match(pressureSample, /incidentReplay\?\.active !== true/);
});

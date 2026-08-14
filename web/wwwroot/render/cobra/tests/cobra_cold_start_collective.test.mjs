import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridge = await readFile(
  new URL("../../../../CobraWebBridge.cs", import.meta.url),
  "utf8",
);
const swapLatch = await readFile(
  new URL("../../../../CobraAirframeSwapControlLatch.cs", import.meta.url),
  "utf8",
);

test("Cobra bridge stages every route with the collective fully down", () => {
  assert.match(swapLatch,
    /GroundedCommand = new\(0\.0, 0\.0, 0\.0, 0\.0\)/,
    "the authority latch owns the physical full-down and neutral ramp command");
  const startRoute = bridge.match(/public static void StartRoute\(int routeChoice\)[\s\S]*?\n    \}/)?.[0] ?? "";
  assert.match(startRoute, /_controlLatch\.Reset\(\);/);
  assert.doesNotMatch(startRoute, /EstimateHoverCollective/,
    "route staging must not preload the authority command with hover trim");
  assert.match(bridge,
    /public static double GetHoverCollective\(\)[\s\S]*?EstimateHoverCollective/,
    "the continuously-running lab must retain an explicit provider-calculated trim seam");
});

test("Cobra bridge latches a same-tick grounded command across stale browser frames", () => {
  assert.match(bridge, /static CobraAirframeSwapControlLatch _controlLatch = new\(\);/);
  assert.match(bridge,
    /while \([\s\S]*?int airframeSwapsBeforeTick = runtime\.AirframeSwaps;[\s\S]*?runtime\.Advance\(_controlLatch\.Command, _turnaroundActionHeld\);[\s\S]*?_controlLatch\.ObserveAuthoritySwap\(runtime\.AirframeSwaps\);/,
    "every fixed tick must observe a swap before the catch-up loop can advance its spare");
  assert.match(bridge,
    /public static bool AcknowledgeAirframeSwap\(int swapGeneration\)[\s\S]*?_controlLatch\.AcknowledgeAuthoritySwap\(swapGeneration\)/,
    "the browser must release the latch only by acknowledging the exact authority generation");
  assert.match(bridge,
    /public static void SetControls\([\s\S]*?_controlLatch\.TrySetControls\(/,
    "ordinary held controls must cross the swap latch");
  assert.match(bridge,
    /if \(_controlLatch\.AwaitingAcknowledgement\)[\s\S]*?return checked\(\(int\)runtime\.Cobra\.State\.Tick\);/,
    "authority time must remain frozen until the browser resets Ready and acknowledges the swap");
  assert.match(bridge,
    /_controlLatch\.ObserveAuthoritySwap\(runtime\.AirframeSwaps\);[\s\S]*?_accumulatorSeconds = 0\.0;[\s\S]*?break;/,
    "the swap tick must discard the old bird's remaining catch-up budget");
});

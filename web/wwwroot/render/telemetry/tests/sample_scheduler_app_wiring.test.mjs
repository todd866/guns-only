import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const sessionUrl = new URL("../../../../../sim/SimulationSession.cs", import.meta.url);
const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);

test("the browser recorder uses elapsed ticks and persists cadence/gap evidence", async () => {
  const app = await readFile(appUrl, "utf8");

  assert.match(app, /new TelemetrySampleScheduler\(\{ strideTicks: TELEMETRY_TICK_STRIDE \}\)/);
  assert.match(app, /this\._sampleScheduler\.observe\(state\)/);
  assert.match(app, /if \(!sampleDecision\.record\) return/);
  assert.doesNotMatch(app, /tick\s*%\s*TELEMETRY_TICK_STRIDE/,
    "an exact modulo gate can starve an entire non-zero tick residue");
  assert.match(app, /authority_tick_hz: AUTHORITY_TICK_HZ/);
  assert.match(app, /state_sample_schedule: TELEMETRY_SAMPLE_SCHEDULE/);
  assert.match(app, /row\.authority_tick_delta = sampleDecision\.authorityTickDelta/);
  assert.match(app, /row\.sample_reason = sampleDecision\.reasons\.join\("\+"\)/);
  assert.match(app,
    /protectionChanged \|\| terminalChanged \|\| sampleDecision\.recentEventChanged[\s\S]*?forceKeyframe/);
});

test("Auto-GCAS transitions survive between render snapshots as exact authority events", async () => {
  const [session, bridge] = await Promise.all([
    readFile(sessionUrl, "utf8"),
    readFile(bridgeUrl, "utf8"),
  ]);

  assert.match(session, /SessionEventType\.AutoGcasTransition/);
  assert.match(session,
    /result\.State\.Phase != previous\.Phase[\s\S]*?result\.State\.PilotOverrideCount != previous\.PilotOverrideCount/);
  assert.match(session,
    /EmitEvent\(SessionEventType\.AutoGcasTransition,[\s\S]*?autoGcas: result\.State\)/);
  assert.match(bridge, /SessionEventType\.AutoGcasTransition => "AUTO_GCAS_TRANSITION"/);
  assert.match(bridge, /\\\"auto_gcas_phase\\\"/);
  assert.match(bridge, /\\\"auto_gcas_inhibit_reason\\\"/);
  assert.match(bridge, /\\\"auto_gcas_activation_count\\\"/);
  assert.match(bridge, /\\\"auto_gcas_release_count\\\"/);
  assert.match(bridge, /\\\"auto_gcas_override_count\\\"/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgePath = new URL("../../../../CobraWebBridge.cs", import.meta.url);
const runtimePath = new URL("../../../../../sim/Cobra/CobraMissionRuntime.cs", import.meta.url);

test("Cobra bridge transports authority-owned turnaround input and snapshot truth", async () => {
  const bridge = await readFile(bridgePath, "utf8");
  assert.match(bridge, /public static void SetTurnaroundAction\(bool held\)/);
  assert.match(bridge, /runtime\.Advance\(_controlLatch\.Command, _turnaroundActionHeld\)/);
  assert.match(bridge, /turnaround = new \{/);
  for (const field of [
    "phase", "sequence", "action", "hold_progress",
    "flight_controls_enabled", "weapons_enabled", "main_rotor_rpm",
    "main_rotor_fraction", "engine_power_fraction",
  ]) assert.match(bridge, new RegExp(`${field}\\s*=`));
  assert.match(bridge, /engine_shaft_power_w\s*=/);
  assert.match(bridge, /available_shaft_power_w\s*=/);
  assert.match(bridge,
    /contact_kind\s*=\s*ContactKindToken\(observation\.Contact\.Kind\)/,
    "the vehicle snapshot must publish authority-owned skid contact, not infer it from AGL");
  assert.match(bridge,
    /VehicleContactKind\.StableSurfaceContact\s*=>\s*"stable-surface-contact"/,
    "the landed-and-settled wire token must remain stable for turnaround automation");
  assert.match(bridge,
    /fire_authorized\s*=\s*_gunnerDecision\.FireAuthorized[\s\S]*?runtime\.Turnaround\.WeaponsEnabled/);
  assert.match(bridge,
    /WeaponsArmed:\s*runtime\.Turnaround\.WeaponsEnabled[\s\S]*?!runtime\.GroundWar\.Magazine\.IsDry/);
});

test("mission runtime owns control and weapon locks instead of trusting presentation", async () => {
  const runtime = await readFile(runtimePath, "utf8");
  assert.match(runtime, /_turnaround\.FlightControlsEnabled[\s\S]*?command[\s\S]*?GroundedCommand/);
  assert.match(runtime, /public bool ApplyAuthorizedGunfire[\s\S]*?_turnaround\.WeaponsEnabled/);
  assert.match(runtime, /Ah1gCobraInitialPowerplantState\.Cold/);
});

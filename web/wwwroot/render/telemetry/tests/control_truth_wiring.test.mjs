import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const projectionUrl = new URL("../../../../SnapshotProjection.cs", import.meta.url);
// The flat-snapshot projection moved from the browser-only WebBridge into the plain, linkable
// SnapshotProjection; the contract scan reads both so a field is found wherever it now lives.
const readBridgeContract = () =>
  Promise.all([readFile(bridgeUrl, "utf8"), readFile(projectionUrl, "utf8")])
    .then((parts) => parts.join("\n"));
const appUrl = new URL("../../../app.js", import.meta.url);
const hudUrl = new URL("../../../hud.js", import.meta.url);

test("flight telemetry separates pilot aileron, SAS, rolling moment, and achieved rate", async () => {
  const source = await readBridgeContract();

  assert.match(source, /\\\"roll_control\\\"/);
  assert.match(source, /\\\"pilot_aileron\\\"/);
  assert.match(source, /appliedCommand\.RollControl/);
  assert.match(source, /\\\"sas_aileron\\\"/);
  assert.match(source, /appliedCommand\.SasRollControl/);
  assert.match(source, /\\\"aileron_command_deg\\\"/);
  assert.match(source, /MaxAileronDeflectionRad/);
  assert.match(source, /\\\"sas_aileron_deg\\\"/);
  assert.match(source, /\\\"lateral_derivative_profile\\\"/);
  assert.match(source, /LateralDerivativeProfileId/);
  assert.match(source, /\\\"roll_moment_nm\\\"/);
  assert.match(source, /_player\.LastRollMomentNm/);
  assert.match(source, /\\\"roll_rate_dps\\\"/);
  assert.match(source, /s\.BodyRates\.P \* 57\.2958/);
  assert.match(source, /\\\"lateral_control_applied\\\"/);
  assert.match(source, /_player\.HasAppliedFlightCommand/);
  assert.match(source, /\\\"direct_lateral_control\\\"/);
  assert.match(source, /appliedCommand\.DirectLateralControl/);
  assert.match(source, /\\\"requested_roll_control\\\"/);
  assert.match(source, /requestedCommand\.RollControl/);
  assert.match(source, /\\\"total_aileron_command_deg\\\"/);
  assert.match(source,
    /Math\.Clamp\(appliedCommand\.RollControl \+ appliedCommand\.SasRollControl/);
});

test("system neutralisation emits reconstructable input releases", async () => {
  const source = await readFile(appUrl, "utf8");
  assert.match(source, /releaseAllMappedKeys\(reason = "system-neutralise"\)/);
  assert.match(source, /recorder\.event\("up", code, \{[\s\S]*neutralised: true,[\s\S]*owners,/);
  assert.match(source, /releaseAllMappedKeys\("visibility-hidden"\)/);
  assert.match(source, /clearFlightInput\(`pause:\$\{reason\}`\)/);
});

test("engine telemetry separates spool state from physical net thrust", async () => {
  const source = await readBridgeContract();

  assert.match(source, /\\\"engine_spool_fraction\\\"/);
  assert.match(source, /_player\.ThrustFraction/);
  assert.match(source, /\\\"engine_net_thrust_lbf\\\"/);
  assert.match(source, /engine\.NetThrustLbf/);
  assert.match(source, /Protection\.SustainedG\(s, _beat\.PlayerAir,[\s\S]*engine\.NetThrustN,[\s\S]*Session\.PlayerAerodynamicConfiguration/);
});

test("modern envelope override publishes its ceiling and distinguishes G from AoA release", async () => {
  const [bridge, hud] = await Promise.all([
    readBridgeContract(),
    readFile(hudUrl, "utf8"),
  ]);

  assert.match(bridge, /\\\"g_override_max\\\"[\s\S]*?Protection\.OverrideMaxG/);
  assert.match(bridge, /\\\"requested_envelope_override\\\"[\s\S]*?DemandTier\.OverDemand/);
  assert.match(bridge, /\\\"requested_alpha_deg\\\"[\s\S]*?requestedAlphaDegreesJson/);
  assert.match(hud, /state\.tier === 3[\s\S]*?requested_alpha_deg[\s\S]*?AOA LIMIT OFF[\s\S]*?G LIMIT OVERRIDE/,
    "Space must explain whether it released the G limiter or the AoA limiter");
});

test("gunnery pitch assistance publishes request, limits, and achieved command separately", async () => {
  const source = await readBridgeContract();

  assert.match(source, /\\\"gunnery_pitch_assist\\\"/);
  assert.match(source, /gunneryPitchAssist\.Active/);
  assert.match(source, /\\\"gunnery_pitch_error_deg\\\"/);
  assert.match(source, /gunneryPitchAssist\.PitchLeadErrorRad/);
  assert.match(source, /\\\"gunnery_total_lead_error_deg\\\"/);
  assert.match(source, /gunneryPitchAssist\.TotalLeadErrorRad/);
  assert.match(source, /\\\"gunnery_pitch_rate_cmd_dps\\\"/);
  assert.match(source, /gunneryPitchAssist\.RequestedPitchRateRadPerSecond/);
  assert.match(source, /\\\"gunnery_pitch_rate_measured_dps\\\"/);
  assert.match(source, /gunneryPitchAssist\.MeasuredPitchRateRadPerSecond/);
  assert.match(source, /\\\"gunnery_pitch_rate_error_dps\\\"/);
  assert.match(source, /gunneryPitchAssist\.PitchRateErrorRadPerSecond/);
  assert.match(source, /\\\"gunnery_pitch_assist_g\\\"/);
  assert.match(source, /gunneryPitchAssist\.AssistedLoadFactorG/);
  assert.match(source, /\\\"gunnery_pitch_assist_delta_g\\\"/);
  assert.match(source, /gunneryPitchAssist\.LoadFactorCorrectionG/);
});

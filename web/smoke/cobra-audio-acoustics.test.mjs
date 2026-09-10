import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

// Acoustic mix regression, not an AH-1G authenticity or calibrated loudness claim. Every
// sample is rendered by OfflineAudioContext; a real device AudioContext is forbidden.
test("Cobra recording leads the rendered cockpit while tones, mute and fallback remain bounded", { timeout: 180_000 }, async (t) => {
  assert.ok(process.env.SMOKE_WWWROOT, "SMOKE_WWWROOT must identify the source or published static root");
  let site, browser, evidence;
  const errors = [];
  try {
    site = await serveStatic(process.env.SMOKE_WWWROOT);
    browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--mute-audio"] });
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      window.realTimeAudioAttempts = 0;
      window.AudioContext = window.webkitAudioContext = class {
        constructor() {
          window.realTimeAudioAttempts++;
          throw new Error("Device AudioContext is forbidden in offline acoustic QA");
        }
      };
    });
    await page.route("**/__cobra_audio_qa__", (route) => route.fulfill({ contentType: "text/html",
      body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Silent Cobra acoustic QA</title>' }));
    await page.goto(`${site.url}__cobra_audio_qa__`);
    evidence = await page.evaluate(async () => {
      const audio = await import("/render/audio/cobra_audio.js");
      const beds = await import("/render/audio/sample_bed.js");
      const sampleRate = 48_000, seconds = 16;
      const base = {
        audio_profile_id: "audio.ah1g.t53-b540.v1", cobra_main_rotor_rpm: 324,
        cobra_tail_rotor_rpm: 324 * audio.COBRA_MAIN_TO_TAIL_GEAR_RATIO,
        cobra_engine_operating: true, cobra_engine_power_fraction: .78, cobra_collective: .72,
        cobra_transmission_limit_fraction: .84, cobra_advance_ratio: .26,
        cobra_vortex_ring_severity: 0, cobra_retreating_blade_stall_severity: 0,
        cobra_mast_bump_risk: 0, cobra_ground_effect_factor: 1,
        cobra_pedal: -.16, cobra_torque_yaw_demand_rad_s: .11,
        cobra_scas_yaw_rad_s: -.024, cobra_yaw_residual_rad_s: .086,
        true_airspeed_kts: 82, cobra_fire_authorized: false, cobra_ammo_remaining: 900,
        cobra_rounds_expended: 0, cobra_turnaround_phase: "ready", cobra_turnaround_sequence: 1,
      };
      const scenarios = {
        hover: { ...base, cobra_engine_power_fraction: .64, cobra_collective: .55,
          cobra_transmission_limit_fraction: .64, cobra_advance_ratio: 0, true_airspeed_kts: 0 },
        cruise: base,
        loaded: { ...base, cobra_engine_power_fraction: 1, cobra_collective: 1,
          cobra_transmission_limit_fraction: 1, cobra_advance_ratio: .4, true_airspeed_kts: 105 },
      };
      const tonal = ["inverterGain", "starterGain", "turbineGain", "gearboxGain", "gearboxHighGain",
        "turbineWhineGain", "mainRotorThumpGain", "tailRotorGain", "tailRotorHarmonicGain"];
      const outputs = [...tonal, "decodedBedInput", "turbineNoiseGain", "mainRotorGain", "bladeSlapGain",
        "rotorRoughnessGain", "tailRotorNoiseGain", "windGain", "gunGain"];
      const meanSquare = (data, start = 3, end = data.length / sampleRate) => {
        let sum = 0;
        const first = Math.round(start * sampleRate), last = Math.round(end * sampleRate);
        for (let i = first; i < last; i++) sum += data[i] * data[i];
        return sum / Math.max(1, last - first);
      };
      const db = (amplitude) => 20 * Math.log10(Math.max(amplitude, 1e-30));
      function metrics(data) {
        let peak = 0, invalid = 0, clipped = 0;
        for (const value of data) {
          if (!Number.isFinite(value)) invalid++;
          if (Math.abs(value) >= 1) clipped++;
          peak = Math.max(peak, Math.abs(value));
        }
        return { peak, rmsDbfs: db(Math.sqrt(meanSquare(data))), invalid, clipped };
      }
      function seamRatio(data, period) {
        const differences = new Float32Array(data.length - 3 * sampleRate);
        for (let i = 0; i < differences.length; i++) {
          const n = i + 3 * sampleRate;
          differences[i] = Math.abs(data[n] - data[n - 1]);
        }
        differences.sort();
        const p999 = differences[Math.floor(differences.length * .999)];
        let seam = 0;
        const n = Math.round(period * sampleRate);
        for (let i = n - 24; i <= n + 24; i++) seam = Math.max(seam, Math.abs(data[i] - data[i - 1]));
        return seam / Math.max(p999, 1e-30);
      }
      async function render(frame, mode, changes = []) {
        const context = new OfflineAudioContext(1, seconds * sampleRate, sampleRate);
        const graph = audio.createCobraAudioVoices(context, context.destination);
        if (mode === "fallback") {
          try {
            await beds.ensureLoopingSampleBed(context, graph, beds.COBRA_COCKPIT_SAMPLE_BED,
              { fetchImpl: async () => ({ ok: false, status: 404 }) });
            throw new Error("The missing recording unexpectedly loaded");
          } catch (error) {
            if (graph.decodedBedStatus !== "failed") throw error;
          }
        } else {
          const attachment = await beds.ensureLoopingSampleBed(context, graph, beds.COBRA_COCKPIT_SAMPLE_BED);
          if (!(attachment?.source?.buffer?.duration > 0)) throw new Error("Shipped Cobra recording did not attach");
        }
        audio.updateCobraAudioVoices(graph, context, frame, { muted: false });
        // Disconnect complete branch outputs, retaining AudioParam modulation inside each branch.
        // Setting intrinsic gains to zero would leave connected modulation sources audible.
        for (const name of outputs) {
          if (!graph[name]?.gain) throw new Error(`Unaccounted acoustic output: ${name}`);
          if ((mode === "recording" && name !== "decodedBedInput")
            || (mode === "procedural" && name === "decodedBedInput")
            || (mode === "tonal" && !tonal.includes(name))) graph[name].disconnect();
        }
        const pending = changes.map(({ at, state, muted }) => context.suspend(at).then(async () => {
          audio.updateCobraAudioVoices(graph, context, state, { muted: muted === true });
          await context.resume();
        }));
        const output = await context.startRendering();
        await Promise.all(pending);
        return { data: output.getChannelData(0), status: graph.decodedBedStatus,
          period: graph.decodedBedAttachment?.source?.buffer?.duration ?? null };
      }
      const results = {};
      for (const [name, frame] of Object.entries(scenarios)) {
        const renders = {};
        for (const mode of ["full", "recording", "procedural", "tonal", "fallback"]) {
          renders[mode] = await render(frame, mode);
        }
        const total = meanSquare(renders.full.data);
        let residual = 0;
        for (let i = 3 * sampleRate; i < renders.full.data.length; i++) {
          const error = renders.full.data[i] - renders.recording.data[i] - renders.procedural.data[i];
          residual += error * error;
        }
        results[name] = {
          ...Object.fromEntries(Object.entries(renders).map(([mode, value]) => [mode, metrics(value.data)])),
          recordingPowerRatio: meanSquare(renders.recording.data) / total,
          proceduralPowerRatio: meanSquare(renders.procedural.data) / total,
          tonalPowerRatio: meanSquare(renders.tonal.data) / total,
          isolationResidual: Math.sqrt(residual / (renders.full.data.length - 3 * sampleRate) / total),
          period: renders.full.period, seamDerivativeRatio: seamRatio(renders.full.data, renders.full.period),
          fallbackStatus: renders.fallback.status,
        };
      }
      const off = { ...base, cobra_engine_operating: false, cobra_engine_power_fraction: 0,
        cobra_main_rotor_rpm: 0, cobra_tail_rotor_rpm: 0, cobra_collective: 0,
        cobra_transmission_limit_fraction: 0, true_airspeed_kts: 0, cobra_advance_ratio: 0,
        cobra_turnaround_phase: "cold" };
      const muted = await render(base, "full", [{ at: 3, state: base, muted: true }]);
      const shutdown = await render(base, "full", [
        { at: 3, state: { ...off, cobra_main_rotor_rpm: 180, cobra_tail_rotor_rpm: 180 * 5.123,
          cobra_turnaround_phase: "rotor-coast" } },
        { at: 7, state: off },
      ]);
      return { seconds, sampleRate, sampleUrl: beds.COBRA_COCKPIT_SAMPLE_BED.url,
        realTimeAudioAttempts: window.realTimeAudioAttempts, scenarios: results,
        muted: { ...metrics(muted.data), settledRms: Math.sqrt(meanSquare(muted.data, 5, 16)) },
        shutdown: { ...metrics(shutdown.data), coastRms: Math.sqrt(meanSquare(shutdown.data, 4, 6)),
          settledRms: Math.sqrt(meanSquare(shutdown.data, 10, 16)) } };
    });
  } finally {
    try { await browser?.close(); } finally { await site?.close(); }
  }
  if (process.env.SMOKE_ARTIFACT_DIR) {
    await mkdir(process.env.SMOKE_ARTIFACT_DIR, { recursive: true });
    await writeFile(resolve(process.env.SMOKE_ARTIFACT_DIR, "cobra-acoustic-evidence.json"),
      JSON.stringify({ ...evidence, errors, browserClosed: !browser?.isConnected() }, null, 2));
  }
  assert.deepEqual(errors, []);
  assert.equal(evidence.realTimeAudioAttempts, 0);
  for (const [name, result] of Object.entries(evidence.scenarios)) {
    t.diagnostic(`${name}: recording ${(result.recordingPowerRatio * 100).toFixed(1)}%, tones ${(result.tonalPowerRatio * 100).toFixed(3)}%, peak ${result.full.peak.toFixed(3)}, fallback ${result.fallback.rmsDbfs.toFixed(1)} dBFS`);
    for (const mode of ["full", "recording", "procedural", "tonal", "fallback"]) {
      assert.equal(result[mode].invalid, 0, `${name}/${mode}: finite PCM`);
      assert.equal(result[mode].clipped, 0, `${name}/${mode}: no clipping`);
    }
    assert.ok(result.full.peak < .85, `${name}: preserve transient headroom before the shared bus`);
    assert.ok(result.recordingPowerRatio > .85, `${name}: recording must lead the cockpit mix`);
    assert.ok(result.proceduralPowerRatio < .15, `${name}: procedural texture must remain secondary`);
    assert.ok(result.tonalPowerRatio < .002, `${name}: synthetic sustained tones must not dominate`);
    assert.ok(result.isolationResidual < 1e-5, `${name}: measured branch isolation reconstructs the full mix`);
    assert.ok(result.period > 0 && result.period < evidence.seconds, `${name}: render crosses the real loop boundary`);
    assert.ok(result.seamDerivativeRatio < 2, `${name}: no exceptional loop seam click`);
    assert.equal(result.fallbackStatus, "failed", `${name}: exercise real loader failure`);
    assert.ok(result.fallback.rmsDbfs > -65, `${name}: missing recording retains audible fallback`);
  }
  assert.ok(evidence.scenarios.loaded.recording.rmsDbfs > evidence.scenarios.hover.recording.rmsDbfs + .5,
    "actual load increases the recorded machinery level");
  for (const kind of ["muted", "shutdown"]) {
    assert.equal(evidence[kind].invalid, 0, `${kind}: finite PCM`);
    assert.equal(evidence[kind].clipped, 0, `${kind}: no clipping`);
    assert.ok(evidence[kind].settledRms < 1e-6, `${kind}: settled graph is silent`);
  }
  assert.ok(evidence.shutdown.coastRms > 1e-5, "rotor coast remains audible before it stops");
});

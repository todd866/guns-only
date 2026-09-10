import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { serveStatic } from "../wwwroot/render/hud/tests/harness/static_server.mjs";

// Acoustic design regression, not an OEM/cockpit-realism or calibrated loudness test. Render
// the shipped graph before the shared flight bus, entirely offline: no speaker AudioContext.
// SMOKE_WWWROOT may be either the source static root or the published root used by browser CI.
test("Fire Boss recording leads the actual offline mix without tonal, seam or water clipping regressions", { timeout: 240_000 }, async (t) => {
  assert.ok(process.env.SMOKE_WWWROOT, "SMOKE_WWWROOT must point at the static or published wwwroot");
  let site;
  let browser;
  let evidence;
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
    await page.route("**/__offline_audio_qa__", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>Silent offline audio QA</title>',
    }));
    await page.goto(`${site.url}__offline_audio_qa__`);
    evidence = await page.evaluate(async () => {
      const audio = await import("/render/audio/turboprop_audio.js");
      const beds = await import("/render/audio/sample_bed.js");
      const sampleRate = 48_000;
      const seconds = 52; // Exercises both boundaries of the shipped 24-second recording.
      const base = {
        engine_running: true, fuel_lb: 1900, propeller_rpm: 1700, propeller_blade_count: 5,
        fireboss_scoop_rate_kgps: 0, fireboss_water_release_rate_kgps: 0,
      };
      const state = (power, speed, surface = "airborne") => ({
        ...base, throttle: power, applied_throttle: power, engine_spool_fraction: power,
        engine_torque_fraction: power, engine_ng_pct: 61 + 36 * power,
        true_airspeed_kts: speed, fireboss_surface: surface,
      });
      const scenarios = { idle: state(.08, 0, "runway"), cruise: state(.65, 120), takeoff: state(1, 80) };
      const gains = ["decodedBedInput", "propBodyGain", "propHarmonicGain", "shaftGain",
        "propWashOutput", "exhaustGain", "gearboxGain", "compressorGain", "compressorToneGain",
        "airGain", "hullGain", "scoopGain", "dropGain"];
      const meanSquare = (data, start = 3, end = data.length / sampleRate) => {
        let sum = 0;
        const first = Math.round(start * sampleRate), last = Math.round(end * sampleRate);
        for (let i = first; i < last; i++) sum += data[i] * data[i];
        return sum / Math.max(1, last - first);
      };
      const db = (amplitude) => 20 * Math.log10(Math.max(1e-30, amplitude));
      function pcmMetrics(data) {
        let peak = 0, invalid = 0, clipped = 0;
        for (const value of data) {
          if (!Number.isFinite(value)) invalid++;
          if (Math.abs(value) >= 1) clipped++;
          peak = Math.max(peak, Math.abs(value));
        }
        return { peak, peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(meanSquare(data))), invalid, clipped };
      }
      function derivativeP999(data) {
        const differences = new Float32Array(data.length - 3 * sampleRate);
        for (let i = 0; i < differences.length; i++) {
          const n = i + 3 * sampleRate;
          differences[i] = Math.abs(data[n] - data[n - 1]);
        }
        differences.sort();
        return differences[Math.floor(differences.length * .999)];
      }
      function seamMetrics(data, period) {
        if (!Number.isFinite(period) || period <= 0) throw new Error("Invalid decoded loop period");
        const typicalMaxDerivative = derivativeP999(data), seams = [];
        for (let at = period; at < data.length / sampleRate - .1; at += period) {
          if (at < 3) continue;
          const n = Math.round(at * sampleRate);
          let jump = 0;
          for (let i = n - 24; i <= n + 24; i++) jump = Math.max(jump, Math.abs(data[i] - data[i - 1]));
          seams.push({ at, derivativeRelativeToP999: jump / Math.max(typicalMaxDerivative, 1e-20),
            dipDb: 10 * Math.log10(Math.max(meanSquare(data, at, at + .02), 1e-30)
              / Math.max(meanSquare(data, at - .1, at), 1e-30)) });
        }
        return seams;
      }
      // A synchronous Fourier projection measures the old audible compressor sine at its actual
      // runtime frequency. Broadband noise does not coherently accumulate like a pure whistle.
      function coherentTonePower(data, frequency) {
        const first = 3 * sampleRate, count = 3 * sampleRate;
        let real = 0, imaginary = 0;
        for (let i = 0; i < count; i++) {
          const phase = 2 * Math.PI * frequency * i / sampleRate;
          real += data[first + i] * Math.cos(phase);
          imaginary += data[first + i] * Math.sin(phase);
        }
        return 2 * (real * real + imaginary * imaginary) / (count * count);
      }
      async function render(frame, mode, duration = seconds, changes = []) {
        const context = new OfflineAudioContext(1, duration * sampleRate, sampleRate);
        const graph = audio.createTurbopropAudioVoices(context, context.destination);
        if (mode !== "fallback") {
          graph.decodedBedAttachment = await beds.ensureLoopingSampleBed(context, graph, beds.FIRE_BOSS_COCKPIT_SAMPLE_BED);
          if (!(graph.decodedBedAttachment?.source?.buffer?.duration > 0)) {
            throw new Error("Shipped recording did not produce a usable decoded attachment");
          }
        }
        const acoustic = audio.updateTurbopropAudioVoices(graph, context, frame, { muted: false });
        const presentGains = gains.filter((name) => graph[name]?.gain);
        const mute = mode === "decoded" ? gains.filter((name) => name !== "decodedBedInput")
          : mode === "procedural" ? ["decodedBedInput"] : [];
        for (const name of mute) {
          const gain = graph[name]?.gain;
          gain?.cancelScheduledValues(0);
          gain?.setValueAtTime(0, 0);
        }
        const attachment = graph.decodedBedAttachment;
        const period = attachment ? ((attachment.source.loopEnd || attachment.source.buffer.duration)
          - attachment.source.loopStart) / attachment.source.playbackRate.value : null;
        const pending = changes.map(({ at, frame: next }) => context.suspend(at).then(async () => {
          audio.updateTurbopropAudioVoices(graph, context, next, { muted: false });
          await context.resume();
        }));
        const buffer = await context.startRendering();
        await Promise.all(pending);
        return { data: buffer.getChannelData(0), acoustic, presentGains, period };
      }
      const results = {};
      for (const [name, frame] of Object.entries(scenarios)) {
        const full = await render(frame, "full"), decoded = await render(frame, "decoded");
        const procedural = await render(frame, "procedural"), fallback = await render(frame, "fallback", 8);
        const total = meanSquare(full.data);
        let residual = 0;
        for (let i = 3 * sampleRate; i < full.data.length; i++) {
          const error = full.data[i] - decoded.data[i] - procedural.data[i];
          residual += error * error;
        }
        results[name] = {
          full: pcmMetrics(full.data), decoded: pcmMetrics(decoded.data),
          procedural: pcmMetrics(procedural.data), fallback: pcmMetrics(fallback.data),
          decodedPowerRatio: meanSquare(decoded.data) / total,
          proceduralPowerRatio: meanSquare(procedural.data) / total,
          isolationResidual: Math.sqrt(residual / (full.data.length - 3 * sampleRate) / total),
          compressorTonePowerRatio: coherentTonePower(full.data, full.acoustic.compressorHz) / total,
          presentGains: full.presentGains, period: full.period,
          fullSeams: seamMetrics(full.data, full.period), decodedSeams: seamMetrics(decoded.data, full.period),
        };
      }
      // Deliberately abrupt control/event edges stress the native smoothing. Simultaneous maximum
      // scoop/drop is an adversarial headroom state, not a claim that the mission commands it.
      const allWater = { ...scenarios.takeoff, fireboss_surface: "water", true_airspeed_kts: 140,
        fireboss_scoop_rate_kgps: 10_000, fireboss_water_release_rate_kgps: 10_000 };
      const changes = [
        { at: 2, frame: scenarios.takeoff }, { at: 6, frame: allWater },
        { at: 8, frame: { ...scenarios.takeoff, fireboss_water_release_rate_kgps: 10_000 } },
        { at: 10, frame: scenarios.cruise },
        { at: 12, frame: { ...scenarios.idle, engine_running: false, propeller_rpm: 0 } },
      ];
      const transition = await render(scenarios.idle, "full", 14, changes);
      const p999 = derivativeP999(transition.data);
      const edges = changes.map(({ at }) => {
        const n = Math.round(at * sampleRate);
        let jump = 0;
        for (let i = n - 128; i <= n + 128; i++) jump = Math.max(jump, Math.abs(transition.data[i] - transition.data[i - 1]));
        return { at, derivativeRelativeToP999: jump / Math.max(p999, 1e-20) };
      });
      return { seconds, sampleRate, sampleUrl: beds.FIRE_BOSS_COCKPIT_SAMPLE_BED.url,
        realTimeAudioAttempts: window.realTimeAudioAttempts, scenarios: results,
        transition: { ...pcmMetrics(transition.data), edges,
          afterShutdownRms: Math.sqrt(meanSquare(transition.data, 13, 14)) } };
    });
  } finally {
    try { await browser?.close(); } finally { await site?.close(); }
  }
  if (process.env.SMOKE_ARTIFACT_DIR) {
    await mkdir(process.env.SMOKE_ARTIFACT_DIR, { recursive: true });
    await writeFile(resolve(process.env.SMOKE_ARTIFACT_DIR, "fireboss-acoustic-evidence.json"),
      JSON.stringify({ ...evidence, errors, browserClosed: !browser?.isConnected() }, null, 2));
  }
  assert.deepEqual(errors, []);
  assert.equal(evidence.realTimeAudioAttempts, 0);
  for (const [name, result] of Object.entries(evidence.scenarios)) {
    t.diagnostic(`${name}: ${JSON.stringify(result)}`);
    for (const mode of ["full", "decoded", "procedural", "fallback"]) {
      assert.equal(result[mode].invalid, 0, `${name}/${mode} finite PCM`);
      assert.equal(result[mode].clipped, 0, `${name}/${mode} no clipping`);
    }
    // Deliberate recording-primary design bounds, independent of a captured expected waveform.
    assert.ok(result.decodedPowerRatio >= .70, `${name}: recording must lead the engine mix`);
    assert.ok(result.proceduralPowerRatio <= .25, `${name}: procedural layer must remain secondary`);
    assert.ok(result.isolationResidual < 1e-5, `${name}: direct layer isolation is valid`);
    assert.ok(!result.presentGains.includes("shaftGain") && !result.presentGains.includes("compressorToneGain"),
      `${name}: do not restore independent pure shaft/compressor tones`);
    assert.ok(result.compressorTonePowerRatio < .005, `${name}: no coherent compressor whistle`);
    assert.ok(result.fallback.rmsDbfs > -80, `${name}: missing recording leaves usable fallback sound`);
    assert.ok(result.fullSeams.length >= 2, `${name}: actually exercise two loop seams`);
    assert.ok(result.fullSeams.every((seam) => seam.derivativeRelativeToP999 < 2), `${name}: no loop click outlier`);
    assert.ok(result.decodedSeams.every((seam) => seam.dipDb > -12), `${name}: no repeated boundary silence dip`);
  }
  assert.ok(evidence.scenarios.takeoff.full.rmsDbfs > evidence.scenarios.idle.full.rmsDbfs + 2,
    "matched recording interval grows with actual torque");
  assert.equal(evidence.transition.invalid, 0);
  assert.equal(evidence.transition.clipped, 0);
  assert.ok(evidence.transition.peak < .9, "combined water cues preserve unclipped headroom");
  assert.ok(evidence.transition.edges.every((edge) => edge.derivativeRelativeToP999 < 2),
    "power and water transitions do not produce exceptional sample discontinuities");
  assert.ok(evidence.transition.afterShutdownRms < 1e-6, "engine-off actually releases all graph audio");
});

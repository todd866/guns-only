// Fictional automated air-ambulance cabin sound. This is presentation only: it follows projected
// applied shaft power and groundspeed, and never feeds rotor, power, contact, or mission authority.

const MAXIMUM_GROUND_SPEED_MPS = 32;
const MAXIMUM_VERTICAL_SPEED_MPS = 3;

export function casevacAudioQaSilent(locationLike = globalThis.location) {
  try {
    return new URLSearchParams(locationLike?.search ?? "").get("audioQa") === "silent";
  } catch {
    return false;
  }
}

const silentQa = casevacAudioQaSilent();

let context = null;
let voices = null;
let enabled = true;
let disabled = false;
let signalActive = false;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function projectCasevacAudioState(state) {
  const appliedPowerW = Math.max(0, finite(state?.casevac_applied_power_w));
  const availablePowerW = Math.max(0, finite(state?.casevac_available_power_w));
  const groundspeedMps = Math.max(0, finite(state?.casevac_lateral_speed_mps));
  const verticalSpeedMps = Math.abs(finite(state?.casevac_vertical_speed_mps));
  return Object.freeze({
    power01: availablePowerW > 1
      ? clamp(appliedPowerW / availablePowerW)
      : 0,
    groundspeed01: clamp(groundspeedMps / MAXIMUM_GROUND_SPEED_MPS),
    verticalSpeed01: clamp(verticalSpeedMps / MAXIMUM_VERTICAL_SPEED_MPS),
    flyable: state?.casevac_vehicle_flyable !== false,
  });
}

function deterministicNoiseBuffer(audioContext) {
  const length = Math.max(1, Math.floor(audioContext.sampleRate * 2));
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x4d454456;
  for (let index = 0; index < data.length; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    data[index] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function build() {
  if (disabled || context) return Boolean(context);
  const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AudioContext) return false;
  try {
    context = new AudioContext();

    const master = context.createGain();
    master.gain.value = 0;
    const cabin = context.createBiquadFilter();
    cabin.type = "lowpass";
    cabin.frequency.value = 1450;
    cabin.Q.value = 0.55;
    cabin.connect(master).connect(context.destination);

    const rotorFundamental = context.createOscillator();
    rotorFundamental.type = "triangle";
    rotorFundamental.frequency.value = 48;
    const rotorFundamentalGain = context.createGain();
    rotorFundamentalGain.gain.value = 0;
    rotorFundamental.connect(rotorFundamentalGain).connect(cabin);

    const rotorHarmonic = context.createOscillator();
    rotorHarmonic.type = "sine";
    rotorHarmonic.frequency.value = 96;
    const rotorHarmonicGain = context.createGain();
    rotorHarmonicGain.gain.value = 0;
    rotorHarmonic.connect(rotorHarmonicGain).connect(cabin);

    const airflow = context.createBufferSource();
    airflow.buffer = deterministicNoiseBuffer(context);
    airflow.loop = true;
    const airflowHighpass = context.createBiquadFilter();
    airflowHighpass.type = "highpass";
    airflowHighpass.frequency.value = 190;
    airflowHighpass.Q.value = 0.4;
    const airflowLowpass = context.createBiquadFilter();
    airflowLowpass.type = "lowpass";
    airflowLowpass.frequency.value = 1300;
    airflowLowpass.Q.value = 0.5;
    const airflowGain = context.createGain();
    airflowGain.gain.value = 0;
    airflow
      .connect(airflowHighpass)
      .connect(airflowLowpass)
      .connect(airflowGain)
      .connect(cabin);

    const inverter = context.createOscillator();
    inverter.type = "sine";
    inverter.frequency.value = 400;
    const inverterGain = context.createGain();
    inverterGain.gain.value = 0;
    inverter.connect(inverterGain).connect(cabin);

    rotorFundamental.start();
    rotorHarmonic.start();
    airflow.start();
    inverter.start();
    voices = {
      master,
      rotorFundamental,
      rotorFundamentalGain,
      rotorHarmonic,
      rotorHarmonicGain,
      airflowGain,
      inverterGain,
    };
    return true;
  } catch {
    disabled = true;
    context = null;
    voices = null;
    return false;
  }
}

export function primeCasevacAudio() {
  if (!build()) return false;
  if (context.state === "suspended") context.resume()?.catch?.(() => {});
  return true;
}

export function setCasevacAudioEnabled(nextEnabled) {
  enabled = Boolean(nextEnabled);
  if (voices && context) {
    voices.master.gain.setTargetAtTime(
      enabled && !silentQa ? 0.48 : 0,
      context.currentTime,
      0.025,
    );
  }
  return enabled;
}

export function updateCasevacAudio(state, { muted = false } = {}) {
  if (disabled || (!context && !build())) return;
  try {
    if (context.state === "suspended") return;
    const sample = projectCasevacAudioState(state);
    const live = enabled && !muted && sample.flyable;
    signalActive = live;
    const now = context.currentTime;
    const bladeFrequency = 44
      + sample.power01 * 17
      + sample.verticalSpeed01 * 3;
    voices.rotorFundamental.frequency.setTargetAtTime(
      bladeFrequency,
      now,
      0.12,
    );
    voices.rotorHarmonic.frequency.setTargetAtTime(
      bladeFrequency * 2.02,
      now,
      0.12,
    );
    voices.rotorFundamentalGain.gain.setTargetAtTime(
      live ? 0.035 + sample.power01 * 0.055 : 0,
      now,
      0.09,
    );
    voices.rotorHarmonicGain.gain.setTargetAtTime(
      live ? 0.012 + sample.power01 * 0.024 : 0,
      now,
      0.08,
    );
    voices.airflowGain.gain.setTargetAtTime(
      live ? 0.018 + sample.groundspeed01 * 0.085 : 0,
      now,
      0.16,
    );
    voices.inverterGain.gain.setTargetAtTime(
      live ? 0.004 + sample.power01 * 0.003 : 0,
      now,
      0.18,
    );
    // Keep every presentation oscillator/filter and its authoritative modulation live in silent
    // QA. Only the destination master is clamped, so browser acceptance exercises the real graph
    // without putting shared-machine audio on speakers.
    voices.master.gain.setTargetAtTime(
      live && !silentQa ? 0.48 : 0,
      now,
      live && !silentQa ? 0.2 : 0.03,
    );
  } catch {
    disabled = true;
    signalActive = false;
  }
}

export function casevacAudioDiagnostics() {
  return Object.freeze({
    enabled,
    disabled,
    silentQa,
    contextState: context?.state ?? "uninitialized",
    signalActive,
    outputGain: Number(voices?.master?.gain?.value ?? 0),
    outputMode: silentQa ? "silent-qa" : "audible",
  });
}

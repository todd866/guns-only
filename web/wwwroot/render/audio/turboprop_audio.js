function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function smooth(param, value, now, timeConstant = 0.06) {
  param.setTargetAtTime(value, now, timeConstant);
}

function noiseBuffer(context) {
  const length = Math.max(1, Math.floor(context.sampleRate * 2));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 0x802f67;
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

/** PT6A + five-blade propeller cockpit graph, routed into the shared flight-audio bus. */
export function createTurbopropAudioVoices(context, destination) {
  const master = context.createGain();
  master.gain.value = 0;
  master.connect(destination);

  const cabin = context.createBiquadFilter();
  cabin.type = "lowpass";
  cabin.frequency.value = 3_200;
  cabin.Q.value = 0.65;
  cabin.connect(master);

  const blade = context.createOscillator();
  blade.type = "sawtooth";
  const bladeFilter = context.createBiquadFilter();
  bladeFilter.type = "bandpass";
  bladeFilter.frequency.value = 112;
  bladeFilter.Q.value = 1.1;
  const bladeGain = context.createGain();
  bladeGain.gain.value = 0;
  blade.connect(bladeFilter).connect(bladeGain).connect(cabin);
  blade.start();

  const turbine = context.createOscillator();
  turbine.type = "triangle";
  const turbineFilter = context.createBiquadFilter();
  turbineFilter.type = "bandpass";
  turbineFilter.frequency.value = 1_650;
  turbineFilter.Q.value = 3.8;
  const turbineGain = context.createGain();
  turbineGain.gain.value = 0;
  turbine.connect(turbineFilter).connect(turbineGain).connect(cabin);
  turbine.start();

  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context);
  source.loop = true;
  const airFilter = context.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 900;
  airFilter.Q.value = 0.55;
  const airGain = context.createGain();
  airGain.gain.value = 0;
  source.connect(airFilter).connect(airGain).connect(cabin);

  const waterFilter = context.createBiquadFilter();
  waterFilter.type = "highpass";
  waterFilter.frequency.value = 480;
  const waterGain = context.createGain();
  waterGain.gain.value = 0;
  source.connect(waterFilter).connect(waterGain).connect(cabin);
  source.start();

  return {
    master,
    blade,
    bladeFilter,
    bladeGain,
    turbine,
    turbineFilter,
    turbineGain,
    airFilter,
    airGain,
    waterGain,
  };
}

export function updateTurbopropAudioVoices(voices, context, state = {}, { muted = false } = {}) {
  if (!voices || !context) return;
  const now = context.currentTime;
  const throttle = clamp(state.engine_spool_fraction ?? state.engine ?? state.throttle);
  const speed = Math.max(0, Number(state.true_airspeed_kts) || 0);
  const running = state.engine_running !== false && (Number(state.fuel_lb) || 1) > 0;
  const live = !muted && running;
  const surface = String(state.fireboss_surface ?? "").toLowerCase();
  const onWater = surface === "water";
  const scoop = state.fireboss_scoop_valid === true;
  const dropping = state.fireboss_drop_active === true;

  smooth(voices.master.gain, live ? 0.54 : 0, now, live ? 0.18 : 0.035);
  smooth(voices.blade.frequency, 74 + throttle * 52, now, 0.08);
  smooth(voices.bladeFilter.frequency, 105 + throttle * 38, now, 0.08);
  smooth(voices.bladeGain.gain, live ? 0.19 + throttle * 0.16 : 0, now);
  smooth(voices.turbine.frequency, 980 + throttle * 1_420, now, 0.09);
  smooth(voices.turbineFilter.frequency, 1_050 + throttle * 1_150, now, 0.09);
  smooth(voices.turbineGain.gain, live ? 0.025 + throttle * 0.055 : 0, now);
  smooth(voices.airFilter.frequency, 500 + Math.min(190, speed) * 9, now, 0.1);
  smooth(voices.airGain.gain, live ? Math.pow(clamp(speed / 150), 1.7) * 0.11 : 0, now);
  smooth(voices.waterGain.gain, live && (onWater || scoop || dropping)
    ? (onWater ? 0.15 : 0) + (scoop ? 0.16 : 0) + (dropping ? 0.19 : 0)
    : 0, now, dropping ? 0.025 : 0.08);
}

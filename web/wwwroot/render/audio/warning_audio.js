// Bounded safety-warning aural on the shared flight bus. One arbiter selects one pattern and one
// oscillator renders it: concurrent HUD cautions can never turn into a stack of competing beeps.
// The square source is deliberately filtered so the alert stays clinical without spraying
// unlimited harmonics into a headset.

const COBRA_NOMINAL_MAIN_ROTOR_RPM = 324;
const COBRA_LOW_ROTOR_FRACTION = 0.9;

function pattern({
  id,
  priority,
  frequencyHz,
  filterHz,
  level,
  periodSeconds,
  pulseWindows,
}) {
  return Object.freeze({
    id,
    priority,
    frequencyHz,
    filterHz,
    level,
    periodSeconds,
    pulseWindows: Object.freeze(pulseWindows.map((window) => Object.freeze(window))),
  });
}

export const WARNING_AUDIO_PATTERNS = Object.freeze({
  quiet: pattern({
    id: "quiet",
    priority: 0,
    frequencyHz: 760,
    filterHz: 1_850,
    level: 0,
    periodSeconds: 1,
    pulseWindows: [],
  }),
  gcasWarning: pattern({
    id: "gcas-warning",
    priority: 1,
    frequencyHz: 760,
    filterHz: 1_850,
    level: 0.014,
    periodSeconds: 0.45,
    pulseWindows: [[0, 0.24]],
  }),
  gearWarning: pattern({
    id: "gear-warning",
    priority: 2,
    frequencyHz: 640,
    filterHz: 1_650,
    level: 0.016,
    periodSeconds: 0.75,
    pulseWindows: [[0, 0.42]],
  }),
  cobraLowRotor: pattern({
    id: "cobra-low-rotor",
    priority: 3,
    frequencyHz: 390,
    filterHz: 1_150,
    level: 0.019,
    periodSeconds: 0.36,
    pulseWindows: [[0, 0.46]],
  }),
  engineOut: pattern({
    id: "engine-out",
    priority: 3,
    frequencyHz: 510,
    filterHz: 1_350,
    level: 0.02,
    periodSeconds: 1,
    // A restrained doublet distinguishes engine loss from the faster low-rotor pulse without
    // creating another voice or a continuous, fatiguing alarm.
    pulseWindows: [[0, 0.11], [0.21, 0.32]],
  }),
  gcasActive: pattern({
    id: "gcas-active",
    priority: 4,
    frequencyHz: 920,
    filterHz: 2_250,
    level: 0.024,
    periodSeconds: 0.2,
    pulseWindows: [[0, 0.38]],
  }),
});

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Select exactly one safety pattern from published authority, in audible priority order.
 * Unrelated caution fields deliberately fail quiet; the HUD remains their presentation owner.
 */
export function resolveWarningAudioPattern(state = {}, { engineLossLatched = false } = {}) {
  if (state?.auto_gcas_active === true) return WARNING_AUDIO_PATTERNS.gcasActive;

  const turnaroundActive = state?.cobra_turnaround_active === true;
  // `engine_running === false` is also the truthful state for cold, parked, deliberately shut
  // down, fuel-empty, and destroyed vehicles. Only an explicit damage fact or a running->stopped
  // edge latched by updateWarningVoices is an aural engine-loss condition.
  const engineOut = !turnaroundActive && (
    engineLossLatched === true
    || state?.engine_out_audio_active === true
    || state?.cobra_engine_damaged === true
  );
  if (engineOut) return WARNING_AUDIO_PATTERNS.engineOut;

  const cobraMainRotorRpm = finiteNumber(state?.cobra_main_rotor_rpm);
  const cobraLowRotor = cobraMainRotorRpm !== null
    && cobraMainRotorRpm < COBRA_NOMINAL_MAIN_ROTOR_RPM * COBRA_LOW_ROTOR_FRACTION
    && !turnaroundActive;
  if (cobraLowRotor) return WARNING_AUDIO_PATTERNS.cobraLowRotor;

  if (state?.gear_warning_horn === true) return WARNING_AUDIO_PATTERNS.gearWarning;
  if (state?.auto_gcas_warning === true) return WARNING_AUDIO_PATTERNS.gcasWarning;
  return WARNING_AUDIO_PATTERNS.quiet;
}

function patternIsOn(selectedPattern, nowSeconds) {
  if (selectedPattern.level <= 0 || selectedPattern.pulseWindows.length === 0) return false;
  const period = Math.max(0.01, selectedPattern.periodSeconds);
  const elapsed = Number(nowSeconds) || 0;
  const phase = ((elapsed % period) + period) % period / period;
  return selectedPattern.pulseWindows.some(
    ([start, end]) => phase >= start && phase < end,
  );
}

export function createWarningVoices(audioContext, destination) {
  const oscillator = audioContext.createOscillator();
  oscillator.type = "square";
  oscillator.frequency.value = 760;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1_850;
  filter.Q.value = 0.74;
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  oscillator.connect(filter).connect(gain).connect(destination);
  oscillator.start();
  return {
    oscillator,
    filter,
    gain,
    lastLevel: -1,
    lastPatternId: "",
    patternStartedAtSeconds: 0,
    selectedPattern: WARNING_AUDIO_PATTERNS.quiet,
    engineWasRunning: false,
    engineLossLatched: false,
  };
}

export function updateWarningVoices(voices, audioContext, state, {
  enabled = true,
  nowSeconds = 0,
} = {}) {
  if (!voices || !audioContext) return;
  // Resolve and retain authority even while muted. A warning which clears during a pause cannot
  // replay on resume, while a safety condition which remains active resumes its current pattern.
  // Establishing a cold/off baseline does not invent a flameout: the aural arms only after this
  // graph has observed the engine running, or from explicit Cobra battle-damage authority.
  const engineRunning = state?.engine_running;
  const turnaroundActive = state?.cobra_turnaround_active === true;
  if (turnaroundActive) {
    voices.engineWasRunning = engineRunning === true;
    voices.engineLossLatched = false;
  } else if (engineRunning === true) {
    voices.engineWasRunning = true;
    voices.engineLossLatched = false;
  } else if (engineRunning === false && voices.engineWasRunning) {
    voices.engineLossLatched = true;
  }
  if (!turnaroundActive && state?.cobra_engine_damaged === true)
    voices.engineLossLatched = true;

  const selectedPattern = resolveWarningAudioPattern(state, {
    engineLossLatched: voices.engineLossLatched,
  });
  const patternChanged = selectedPattern.id !== voices.lastPatternId;
  voices.lastPatternId = selectedPattern.id;
  voices.selectedPattern = selectedPattern;
  if (patternChanged) voices.patternStartedAtSeconds = Number(nowSeconds) || 0;

  const conscious = state?.pilot_conscious !== false;
  const now = audioContext.currentTime;
  if (patternChanged) {
    voices.oscillator.frequency.setTargetAtTime(
      selectedPattern.frequencyHz,
      now,
      0.01,
    );
    voices.filter.frequency.setTargetAtTime(selectedPattern.filterHz, now, 0.018);
  }

  const patternElapsedSeconds = (Number(nowSeconds) || 0) - voices.patternStartedAtSeconds;
  const level = enabled && conscious && patternIsOn(selectedPattern, patternElapsedSeconds)
    ? selectedPattern.level
    : 0;
  if (level !== voices.lastLevel) {
    voices.lastLevel = level;
    voices.gain.gain.setTargetAtTime(level, now, level > 0 ? 0.012 : 0.026);
  }
  return selectedPattern;
}

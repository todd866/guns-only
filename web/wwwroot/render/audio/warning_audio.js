// GCAS / caution aural on the shared flight bus. Semantics match the former HUD square beeper:
// warning vs active rates, silent while unconscious.

export function createWarningVoices(audioContext, destination) {
  const oscillator = audioContext.createOscillator();
  oscillator.type = "square";
  oscillator.frequency.value = 760;
  const gain = audioContext.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  return { oscillator, gain, lastLevel: -1 };
}

export function updateWarningVoices(voices, audioContext, state, {
  enabled = true,
  nowSeconds = 0,
} = {}) {
  if (!voices || !audioContext) return;
  const active = state?.auto_gcas_active === true;
  const warning = state?.auto_gcas_warning === true;
  const conscious = state?.pilot_conscious !== false;
  const rateHz = active ? 6 : warning ? 3 : 0;
  const phaseOn = rateHz > 0
    && Math.floor((Number(nowSeconds) || 0) * rateHz * 2) % 2 === 0;
  const level = enabled && conscious && phaseOn
    ? active ? 0.024 : 0.014
    : 0;
  if (level === voices.lastLevel) return;
  voices.lastLevel = level;
  const now = audioContext.currentTime;
  voices.oscillator.frequency.setTargetAtTime(active ? 920 : 760, now, 0.006);
  voices.gain.gain.setTargetAtTime(level, now, 0.008);
}

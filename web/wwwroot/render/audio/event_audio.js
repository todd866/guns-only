// One-shot and pulsed combat / airframe events on a shared flight bus.
// Gun reports are short cyclic bursts (not a continuous saw bed). Buffet is a low rumble bed
// amplitude-modulated from snapshot buffet magnitude. Speed brake, G-on strain, and aged-canopy
// seal whine live here so propulsion stays independent. Fail-silent: callers catch at the façade.

import { pinkNoiseBuffer, whiteNoiseBuffer } from "./engine_audio.js";
import { isAgedF22, resolvePropulsionCharacter } from "./audio_character.js";

const GUN_INTERVAL_S = 0.055;

export function createEventVoices(audioContext, destination) {
  const buffetSource = audioContext.createBufferSource();
  buffetSource.buffer = pinkNoiseBuffer(audioContext, 0x62756666);
  buffetSource.loop = true;
  const buffetFilter = audioContext.createBiquadFilter();
  buffetFilter.type = "lowpass";
  buffetFilter.frequency.value = 140;
  buffetFilter.Q.value = 0.9;
  const buffetGain = audioContext.createGain();
  buffetGain.gain.value = 0;
  buffetSource.connect(buffetFilter).connect(buffetGain).connect(destination);
  buffetSource.start();

  // Speed brake / board — broadband q-scaled roar when the surface is out.
  const brakeSource = audioContext.createBufferSource();
  brakeSource.buffer = pinkNoiseBuffer(audioContext, 0x42524B45);
  brakeSource.loop = true;
  const brakeHp = audioContext.createBiquadFilter();
  brakeHp.type = "highpass";
  brakeHp.frequency.value = 180;
  brakeHp.Q.value = 0.6;
  const brakeBp = audioContext.createBiquadFilter();
  brakeBp.type = "bandpass";
  brakeBp.frequency.value = 900;
  brakeBp.Q.value = 0.55;
  const brakeGain = audioContext.createGain();
  brakeGain.gain.value = 0;
  brakeSource.connect(brakeHp).connect(brakeBp).connect(brakeGain).connect(destination);
  brakeSource.start();

  // G-on — airframe flex / strain when |Nz| climbs (not buffet AoA rumble).
  const gSource = audioContext.createBufferSource();
  gSource.buffer = pinkNoiseBuffer(audioContext, 0x474F4E31);
  gSource.loop = true;
  const gFilter = audioContext.createBiquadFilter();
  gFilter.type = "lowpass";
  gFilter.frequency.value = 110;
  gFilter.Q.value = 1.2;
  const gGain = audioContext.createGain();
  gGain.gain.value = 0;
  gSource.connect(gFilter).connect(gGain).connect(destination);
  gSource.start();

  // Late-2030s F-22 canopy seal whine — thin high whistle that grows with q.
  const canopySource = audioContext.createBufferSource();
  canopySource.buffer = whiteNoiseBuffer(audioContext, 0x5345414C);
  canopySource.loop = true;
  const canopyFilter = audioContext.createBiquadFilter();
  canopyFilter.type = "bandpass";
  canopyFilter.frequency.value = 4200;
  canopyFilter.Q.value = 14;
  const canopyGain = audioContext.createGain();
  canopyGain.gain.value = 0;
  canopySource.connect(canopyFilter).connect(canopyGain).connect(destination);
  canopySource.start();

  // Second seal leak — slightly detuned so it isn't a single synth line.
  const canopy2Filter = audioContext.createBiquadFilter();
  canopy2Filter.type = "bandpass";
  canopy2Filter.frequency.value = 6100;
  canopy2Filter.Q.value = 11;
  const canopy2Gain = audioContext.createGain();
  canopy2Gain.gain.value = 0;
  canopySource.connect(canopy2Filter).connect(canopy2Gain).connect(destination);

  // --- Maglev catshot (buried tube) ---
  // Tunnel pressure roar — sealed gallery air being dragged with the sled.
  const tunnelSource = audioContext.createBufferSource();
  tunnelSource.buffer = pinkNoiseBuffer(audioContext, 0x54554E31);
  tunnelSource.loop = true;
  const tunnelHp = audioContext.createBiquadFilter();
  tunnelHp.type = "highpass";
  tunnelHp.frequency.value = 80;
  tunnelHp.Q.value = 0.5;
  const tunnelBp = audioContext.createBiquadFilter();
  tunnelBp.type = "bandpass";
  tunnelBp.frequency.value = 420;
  tunnelBp.Q.value = 0.7;
  const tunnelGain = audioContext.createGain();
  tunnelGain.gain.value = 0;
  tunnelSource.connect(tunnelHp).connect(tunnelBp).connect(tunnelGain).connect(destination);
  tunnelSource.start();

  // Electromagnetic whine — climbing tonal line (inverter / coil stack).
  const emOsc = audioContext.createOscillator();
  emOsc.type = "sawtooth";
  emOsc.frequency.value = 90;
  const emFilter = audioContext.createBiquadFilter();
  emFilter.type = "bandpass";
  emFilter.frequency.value = 420;
  emFilter.Q.value = 6;
  const emGain = audioContext.createGain();
  emGain.gain.value = 0;
  emOsc.connect(emFilter).connect(emGain).connect(destination);
  emOsc.start();

  // Second EM harmonic — denser "maglev" identity.
  const em2Osc = audioContext.createOscillator();
  em2Osc.type = "triangle";
  em2Osc.frequency.value = 180;
  const em2Filter = audioContext.createBiquadFilter();
  em2Filter.type = "bandpass";
  em2Filter.frequency.value = 900;
  em2Filter.Q.value = 8;
  const em2Gain = audioContext.createGain();
  em2Gain.gain.value = 0;
  em2Osc.connect(em2Filter).connect(em2Gain).connect(destination);
  em2Osc.start();

  // Rail spark / armature crackle.
  const sparkSource = audioContext.createBufferSource();
  sparkSource.buffer = whiteNoiseBuffer(audioContext, 0x5350524B);
  sparkSource.loop = true;
  const sparkHp = audioContext.createBiquadFilter();
  sparkHp.type = "highpass";
  sparkHp.frequency.value = 2500;
  sparkHp.Q.value = 0.6;
  const sparkGain = audioContext.createGain();
  sparkGain.gain.value = 0;
  sparkSource.connect(sparkHp).connect(sparkGain).connect(destination);
  sparkSource.start();

  // Sub sled thump — felt more than heard under the tube.
  const sledFilter = audioContext.createBiquadFilter();
  sledFilter.type = "lowpass";
  sledFilter.frequency.value = 90;
  sledFilter.Q.value = 1.4;
  const sledGain = audioContext.createGain();
  sledGain.gain.value = 0;
  tunnelSource.connect(sledFilter).connect(sledGain).connect(destination);


  // --- Rapier RCS cold-gas ---
  const rcsSource = audioContext.createBufferSource();
  rcsSource.buffer = whiteNoiseBuffer(audioContext, 0x52435331);
  rcsSource.loop = true;
  const rcsHp = audioContext.createBiquadFilter();
  rcsHp.type = "highpass";
  rcsHp.frequency.value = 800;
  rcsHp.Q.value = 0.5;
  const rcsBp = audioContext.createBiquadFilter();
  rcsBp.type = "bandpass";
  rcsBp.frequency.value = 2400;
  rcsBp.Q.value = 0.8;
  const rcsGain = audioContext.createGain();
  rcsGain.gain.value = 0;
  rcsSource.connect(rcsHp).connect(rcsBp).connect(rcsGain).connect(destination);
  rcsSource.start();

  // --- Trap / arrest wire ---
  const wireSource = audioContext.createBufferSource();
  wireSource.buffer = pinkNoiseBuffer(audioContext, 0x57495245);
  wireSource.loop = true;
  const wireFilter = audioContext.createBiquadFilter();
  wireFilter.type = "bandpass";
  wireFilter.frequency.value = 220;
  wireFilter.Q.value = 1.8;
  const wireGain = audioContext.createGain();
  wireGain.gain.value = 0;
  wireSource.connect(wireFilter).connect(wireGain).connect(destination);
  wireSource.start();

  return {
    destination,
    buffetFilter,
    buffetGain,
    brakeHp,
    brakeBp,
    brakeGain,
    gFilter,
    gGain,
    canopyFilter,
    canopyGain,
    canopy2Filter,
    canopy2Gain,
    tunnelHp,
    tunnelBp,
    tunnelGain,
    emOsc,
    emFilter,
    emGain,
    em2Osc,
    em2Filter,
    em2Gain,
    sparkHp,
    sparkGain,
    sledFilter,
    sledGain,
    lastGunAt: -Infinity,
    wasFiring: false,
    catapultWasActive: false,
    rcsHp,
    rcsBp,
    rcsGain,
    wireFilter,
    wireGain,
    lastArrestPhase: "",
    lastHits: 0,
    lastOpponentHits: 0,
    lastOpponentAlive: true,
    lastRcsPulseAt: -Infinity,
  };
}

export function updateBuffetVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const buffet = clamp01(finiteNumber(state?.buffet) ?? 0);
  const angle = Math.hypot(
    finiteNumber(state?.buffet_pitch_deg) ?? 0,
    finiteNumber(state?.buffet_yaw_deg) ?? 0,
  );
  const buffetMag = clamp01(buffet + angle / 8);
  voices.buffetFilter.frequency.setTargetAtTime(90 + buffetMag * 160, now, 0.08);
  voices.buffetGain.gain.setTargetAtTime(
    enabled ? 0.09 * Math.pow(buffetMag, 1.15) : 0,
    now,
    0.06,
  );
}

/// Speed-brake roar + G-on strain + (F-22) canopy seal whine.
export function updateAirframeCueVoices(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const q01 = clamp01(dynamicPressureProxy(state));
  const tas = Math.max(0, finiteNumber(state?.true_airspeed_kts) ?? 0);
  const speed01 = clamp01((tas - 120) / 480);

  const hasBrake = state?.has_speed_brake === true
    || finiteNumber(state?.speed_brake) != null;
  const brake = hasBrake ? clamp01(finiteNumber(state?.speed_brake) ?? 0) : 0;
  const brakeLevel = enabled ? brake * (0.2 + 0.8 * Math.max(q01, speed01)) : 0;
  voices.brakeHp.frequency.setTargetAtTime(140 + brake * 220 + q01 * 180, now, 0.1);
  voices.brakeBp.frequency.setTargetAtTime(650 + brake * 900 + q01 * 500, now, 0.1);
  voices.brakeGain.gain.setTargetAtTime(0.22 * Math.pow(brakeLevel, 1.05), now, 0.08);

  const gz = finiteNumber(state?.pilot_gz);
  const nz = finiteNumber(state?.g_actual);
  const g = Math.abs(gz ?? nz ?? 1);
  // G-on starts around ~2.4 and saturates near 7–8 (suit / structure story, not buffet).
  const gOn = clamp01((g - 2.35) / 5.2);
  voices.gFilter.frequency.setTargetAtTime(70 + gOn * 160 + q01 * 40, now, 0.1);
  voices.gGain.gain.setTargetAtTime(
    enabled ? 0.14 * Math.pow(gOn, 1.25) : 0,
    now,
    0.1,
  );

  const aged = isAgedF22(state);
  // Late-2030s canopy seals leak under load — high-G flex is the tell, q just brightens it.
  const canopyG = clamp01((g - 2.1) / 4.8);
  const canopyDrive = aged
    ? canopyG * (0.55 + 0.45 * Math.max(q01, speed01))
    : 0;
  voices.canopyFilter.frequency.setTargetAtTime(
    3600 + canopyG * 1800 + q01 * 1600 + speed01 * 600, now, 0.14);
  voices.canopy2Filter.frequency.setTargetAtTime(
    5200 + canopyG * 1600 + q01 * 1400 + speed01 * 700, now, 0.14);
  voices.canopyGain.gain.setTargetAtTime(
    enabled ? 0.045 * Math.pow(canopyDrive, 1.1) : 0,
    now,
    0.12,
  );
  voices.canopy2Gain.gain.setTargetAtTime(
    enabled ? 0.028 * Math.pow(canopyDrive, 1.15) : 0,
    now,
    0.12,
  );
}

/// Rapier buried-tube maglev catshot — rising EM whine + tunnel pressure + rail spark.
/// Portal exit fires a one-shot pressure release when the stroke ends.
export function updateCatapultVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const active = enabled && (
    state?.catapult_active === true
    || String(state?.recovery ?? "").toUpperCase() === "CATAPULT"
    || String(state?.mode ?? "").toUpperCase() === "CATAPULT"
  );
  // Land tube (maglev story). Maritime decks keep a quieter generic stroke.
  const buried = state?.carrier !== true && state?.recovery_platform === true;
  const maglev = buried || resolvePropulsionCharacter(state) === "rapier";

  const progress = clamp01(finiteNumber(state?.catapult_progress) ?? 0);
  const speedKts = Math.max(0, finiteNumber(state?.catapult_speed_kts)
    ?? finiteNumber(state?.deck_closure_kts) ?? 0);
  const endKts = Math.max(1, finiteNumber(state?.catapult_end_speed_kts) ?? 214);
  const speed01 = clamp01(speedKts / endKts);
  // Constant-accel stroke: distance frac ≈ speed² — prefer published progress when present.
  const stroke = progress > 0 ? progress : speed01 * speed01;
  const drive = active ? Math.max(stroke, speed01 * 0.85) : 0;
  const presence = maglev ? 1 : 0.45;

  if (active && !voices.catapultWasActive) {
    scheduleCatapultEnergize(audioContext, voices.destination, now);
  }
  if (!active && voices.catapultWasActive) {
    schedulePortalExit(audioContext, voices.destination, now, maglev);
  }
  voices.catapultWasActive = active;

  // Tunnel roar builds hard late in the stroke (pressure pile-up before the portal).
  voices.tunnelHp.frequency.setTargetAtTime(60 + drive * 220, now, 0.08);
  voices.tunnelBp.frequency.setTargetAtTime(280 + drive * 1100 + stroke * 400, now, 0.08);
  voices.tunnelGain.gain.setTargetAtTime(
    enabled ? 0.34 * Math.pow(drive, 1.15) * presence : 0, now, 0.06);

  // EM inverter line climbs from ~90 Hz → ~1.4 kHz across the shot.
  const emHz = 90 + drive * 1280;
  voices.emOsc.frequency.setTargetAtTime(emHz, now, 0.05);
  voices.emFilter.frequency.setTargetAtTime(emHz * 1.15, now, 0.05);
  voices.emGain.gain.setTargetAtTime(
    enabled ? 0.07 * Math.pow(drive, 0.9) * presence : 0, now, 0.05);
  voices.em2Osc.frequency.setTargetAtTime(emHz * 2.02, now, 0.05);
  voices.em2Filter.frequency.setTargetAtTime(emHz * 2.1, now, 0.05);
  voices.em2Gain.gain.setTargetAtTime(
    enabled ? 0.045 * Math.pow(drive, 1.05) * presence : 0, now, 0.05);

  voices.sparkHp.frequency.setTargetAtTime(1800 + drive * 4200, now, 0.06);
  voices.sparkGain.gain.setTargetAtTime(
    enabled ? 0.09 * Math.pow(drive, 1.4) * presence : 0, now, 0.04);

  voices.sledFilter.frequency.setTargetAtTime(55 + drive * 80, now, 0.1);
  voices.sledGain.gain.setTargetAtTime(
    enabled ? 0.28 * Math.pow(drive, 0.85) * presence : 0, now, 0.08);
}

function scheduleCatapultEnergize(audioContext, destination, at) {
  const osc = audioContext.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(55, at);
  osc.frequency.exponentialRampToValueAtTime(140, at + 0.09);
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x43415431, 0.12);
  const nFilter = audioContext.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.value = 600;
  nFilter.Q.value = 0.8;
  const oEnv = audioContext.createGain();
  const nEnv = audioContext.createGain();
  oEnv.gain.setValueAtTime(0.0001, at);
  oEnv.gain.exponentialRampToValueAtTime(0.12, at + 0.012);
  oEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
  nEnv.gain.setValueAtTime(0.0001, at);
  nEnv.gain.exponentialRampToValueAtTime(0.1, at + 0.008);
  nEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.11);
  osc.connect(oEnv).connect(destination);
  noise.connect(nFilter).connect(nEnv).connect(destination);
  osc.start(at);
  osc.stop(at + 0.16);
  noise.start(at);
  noise.stop(at + 0.13);
}

function schedulePortalExit(audioContext, destination, at, maglev) {
  const scale = maglev ? 1 : 0.55;
  const roar = audioContext.createBufferSource();
  roar.buffer = shortNoiseBuffer(audioContext, 0x504F5254, 0.45);
  const hp = audioContext.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 120;
  const bp = audioContext.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.45;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.38 * scale, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.12 * scale, at + 0.12);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  roar.connect(hp).connect(bp).connect(env).connect(destination);
  roar.start(at);
  roar.stop(at + 0.58);

  const tone = audioContext.createOscillator();
  tone.type = "sawtooth";
  tone.frequency.setValueAtTime(520, at);
  tone.frequency.exponentialRampToValueAtTime(90, at + 0.35);
  const tEnv = audioContext.createGain();
  tEnv.gain.setValueAtTime(0.0001, at);
  tEnv.gain.exponentialRampToValueAtTime(0.09 * scale, at + 0.015);
  tEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
  tone.connect(tEnv).connect(destination);
  tone.start(at);
  tone.stop(at + 0.42);
}


/// Cold-gas RCS hiss + irregular thruster ticks while authority is up (zoom-coast).
export function updateRcsVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const authority = clamp01(finiteNumber(state?.rapier_rcs_authority) ?? 0);
  const gas = clamp01(finiteNumber(state?.rapier_rcs_gas_frac) ?? 1);
  const live = enabled && authority > 0.08 && gas > 0.02;
  const level = live ? authority * (0.35 + 0.65 * gas) : 0;
  voices.rcsHp.frequency.setTargetAtTime(600 + authority * 1400, now, 0.1);
  voices.rcsBp.frequency.setTargetAtTime(1800 + authority * 2200, now, 0.1);
  voices.rcsGain.gain.setTargetAtTime(0.055 * Math.pow(level, 1.1), now, 0.08);

  if (live && now - (voices.lastRcsPulseAt || 0) > (0.12 + (1 - authority) * 0.35)) {
    voices.lastRcsPulseAt = now;
    scheduleRcsTick(audioContext, voices.destination, now, authority);
  }
}

function scheduleRcsTick(audioContext, destination, at, authority) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x52435354, 0.06);
  const bp = audioContext.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 2800 + authority * 1800;
  bp.Q.value = 1.2;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.07 + authority * 0.06, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  noise.connect(bp).connect(env).connect(destination);
  noise.start(at);
  noise.stop(at + 0.06);
}

/// Arrest wire: snatch on catch, stretch groan while running out, thud/snap on stop/fail.
export function updateTrapVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const phase = String(state?.arrest_phase ?? "").toUpperCase();
  const prev = voices.lastArrestPhase || "";
  const tension = Math.max(0, finiteNumber(state?.wire_tension_kn) ?? 0);
  const decel = Math.max(0, finiteNumber(state?.arrest_decel_g) ?? 0);
  const running = enabled && phase === "ARRESTED";
  const stretch = running
    ? clamp01(decel / 3.5) * 0.55 + clamp01(tension / 250) * 0.45
    : 0;

  if (enabled && phase === "ARRESTED" && prev !== "ARRESTED") {
    scheduleTrapSnatch(audioContext, voices.destination, now);
  }
  if (enabled && phase === "STOPPED" && prev !== "STOPPED") {
    scheduleTrapStop(audioContext, voices.destination, now);
  }
  if (enabled && phase === "FAILED" && prev !== "FAILED") {
    scheduleTrapFail(audioContext, voices.destination, now);
  }
  voices.lastArrestPhase = phase;

  voices.wireFilter.frequency.setTargetAtTime(140 + stretch * 420, now, 0.08);
  voices.wireFilter.Q.setTargetAtTime(1.2 + stretch * 2.5, now, 0.08);
  voices.wireGain.gain.setTargetAtTime(enabled ? 0.2 * Math.pow(stretch, 1.05) : 0, now, 0.06);
}

function scheduleTrapSnatch(audioContext, destination, at) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x534E4154, 0.22);
  const bp = audioContext.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 380;
  bp.Q.value = 0.7;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.32, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
  const osc = audioContext.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(90, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.2);
  const oEnv = audioContext.createGain();
  oEnv.gain.setValueAtTime(0.0001, at);
  oEnv.gain.exponentialRampToValueAtTime(0.1, at + 0.01);
  oEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
  noise.connect(bp).connect(env).connect(destination);
  osc.connect(oEnv).connect(destination);
  noise.start(at); noise.stop(at + 0.3);
  osc.start(at); osc.stop(at + 0.24);
}

function scheduleTrapStop(audioContext, destination, at) {
  const osc = audioContext.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(70, at);
  osc.frequency.exponentialRampToValueAtTime(28, at + 0.18);
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.14, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x53544F50, 0.15);
  const nEnv = audioContext.createGain();
  nEnv.gain.setValueAtTime(0.0001, at);
  nEnv.gain.exponentialRampToValueAtTime(0.08, at + 0.008);
  nEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
  osc.connect(env).connect(destination);
  noise.connect(nEnv).connect(destination);
  osc.start(at); osc.stop(at + 0.28);
  noise.start(at); noise.stop(at + 0.16);
}

function scheduleTrapFail(audioContext, destination, at) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x4641494C, 0.2);
  const hp = audioContext.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1200;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.22, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  noise.connect(hp).connect(env).connect(destination);
  noise.start(at); noise.stop(at + 0.22);
}

/// Hit sparks + destroy boom from snapshot edges (hits / opponent_alive).
export function updateCombatCueVoices(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const hits = Math.max(0, Math.trunc(finiteNumber(state?.hits) ?? 0));
  const opponentHits = Math.max(0, Math.trunc(finiteNumber(state?.opponent_hits) ?? 0));
  const alive = state?.opponent_alive !== false && state?.bandit_alive !== false;

  if (enabled && hits > (voices.lastHits || 0)) {
    const n = Math.min(4, hits - voices.lastHits);
    for (let i = 0; i < n; i++) scheduleHitImpact(audioContext, voices.destination, now + i * 0.03, false);
  }
  if (enabled && opponentHits > (voices.lastOpponentHits || 0)) {
    const n = Math.min(3, opponentHits - voices.lastOpponentHits);
    for (let i = 0; i < n; i++) scheduleHitImpact(audioContext, voices.destination, now + i * 0.04, true);
  }
  if (enabled && voices.lastOpponentAlive !== false && alive === false) {
    scheduleDestroyBoom(audioContext, voices.destination, now);
  }
  voices.lastHits = hits;
  voices.lastOpponentHits = opponentHits;
  voices.lastOpponentAlive = alive;
}

function scheduleHitImpact(audioContext, destination, at, onOwnship) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, onOwnship ? 0x48495450 : 0x4849544F, 0.1);
  const bp = audioContext.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = onOwnship ? 700 : 1400;
  bp.Q.value = 0.9;
  const env = audioContext.createGain();
  const amp = onOwnship ? 0.16 : 0.11;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(amp, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
  noise.connect(bp).connect(env).connect(destination);
  noise.start(at); noise.stop(at + 0.1);
}

function scheduleDestroyBoom(audioContext, destination, at) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x424F4F4D, 0.55);
  const lp = audioContext.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.35, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.08, at + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
  const osc = audioContext.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(55, at);
  osc.frequency.exponentialRampToValueAtTime(22, at + 0.5);
  const oEnv = audioContext.createGain();
  oEnv.gain.setValueAtTime(0.0001, at);
  oEnv.gain.exponentialRampToValueAtTime(0.18, at + 0.015);
  oEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  noise.connect(lp).connect(env).connect(destination);
  osc.connect(oEnv).connect(destination);
  noise.start(at); noise.stop(at + 0.72);
  osc.start(at); osc.stop(at + 0.58);
}

export function fireGunReports(voices, audioContext, state, {
  enabled = true,
  triggerHeld = false,
} = {}) {
  if (!voices || !audioContext || !voices.destination) return;
  const now = audioContext.currentTime;
  const firing = enabled
    && triggerHeld
    && state?.gun_firing === true
    && state?.gun_overheat !== true;
  if (!firing) {
    voices.wasFiring = false;
    return;
  }
  if (!voices.wasFiring) {
    voices.wasFiring = true;
    voices.lastGunAt = now - GUN_INTERVAL_S;
  }
  while (now - voices.lastGunAt >= GUN_INTERVAL_S) {
    voices.lastGunAt += GUN_INTERVAL_S;
    scheduleGunReport(audioContext, voices.destination, voices.lastGunAt);
  }
}

function scheduleGunReport(audioContext, destination, at) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x47554e31, 0.08);
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 980;
  filter.Q.value = 0.85;
  const tone = audioContext.createOscillator();
  tone.type = "square";
  tone.frequency.value = 88;
  const noiseEnv = audioContext.createGain();
  const toneEnv = audioContext.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, at);
  noiseEnv.gain.exponentialRampToValueAtTime(0.11, at + 0.004);
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.045);
  toneEnv.gain.setValueAtTime(0.0001, at);
  toneEnv.gain.exponentialRampToValueAtTime(0.055, at + 0.003);
  toneEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.028);
  noise.connect(filter).connect(noiseEnv).connect(destination);
  tone.connect(toneEnv).connect(destination);
  noise.start(at);
  noise.stop(at + 0.06);
  tone.start(at);
  tone.stop(at + 0.04);
}

function shortNoiseBuffer(audioContext, initialSeed, seconds) {
  const frames = Math.max(1, Math.floor(audioContext.sampleRate * seconds));
  const buffer = audioContext.createBuffer(1, frames, audioContext.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = initialSeed & 0x7fffffff;
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < frames; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
    const white = seed / 0x3fffffff - 1;
    b0 = 0.997 * b0 + white * 0.12;
    b1 = 0.98 * b1 + white * 0.22;
    b2 = 0.9 * b2 + white * 0.35;
    channel[i] = (b0 + b1 + b2) * 0.28;
  }
  return buffer;
}

function dynamicPressureProxy(state) {
  const density = finiteNumber(state?.air_density_kg_m3) ?? 1.225;
  const kts = finiteNumber(state?.true_airspeed_kts) ?? 0;
  const mps = finiteNumber(state?.true_airspeed_mps) ?? kts * 0.514444;
  const q = 0.5 * Math.max(0, density) * Math.max(0, mps) ** 2;
  return smoothstep(clamp01((q - 750) / (45_000 - 750)));
}

function finiteNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// One-shot and pulsed combat / airframe events on a shared flight bus.
// Gun reports are short cyclic bursts (not a continuous saw bed). Buffet is a low rumble bed
// amplitude-modulated from snapshot buffet magnitude. Speed brake, G-on strain, and aged-canopy
// seal whine live here so propulsion stays independent. Fail-silent: callers catch at the façade.

import { pinkNoiseBuffer, whiteNoiseBuffer } from "./engine_audio.js";
import { isAgedF22, resolvePropulsionCharacter } from "./audio_character.js";

const GUN_SOUND_PROFILES = Object.freeze({
  m61: Object.freeze({
    roundsPerSecond: 100,
    reportRate: 25,
    bodyHz: 100,
    bodyLevel: 0.085,
    gasLevel: 0.07,
    mechanismLevel: 0.028,
    reportLevel: 0.085,
  }),
  gsh301: Object.freeze({
    roundsPerSecond: 25,
    reportRate: 25,
    bodyHz: 25,
    bodyLevel: 0.105,
    gasLevel: 0.065,
    mechanismLevel: 0.024,
    reportLevel: 0.15,
  }),
  sixM3: Object.freeze({
    roundsPerSecond: 15,
    reportRate: 15,
    bodyHz: 15,
    bodyLevel: 0.075,
    gasLevel: 0.045,
    mechanismLevel: 0.035,
    reportLevel: 0.11,
  }),
});

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

  // A low-rate flutter modulator keeps an extended board from becoming static pink noise.
  // Its depth remains below the base gain, so the modulation cannot invert the signal.
  const brakeFlutterOsc = audioContext.createOscillator();
  brakeFlutterOsc.type = "sine";
  brakeFlutterOsc.frequency.value = 13;
  const brakeFlutterDepth = audioContext.createGain();
  brakeFlutterDepth.gain.value = 0;
  brakeFlutterOsc.connect(brakeFlutterDepth).connect(brakeGain.gain);
  brakeFlutterOsc.start();

  // Positive G-on — low airframe flex / strain (not buffet AoA rumble).
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

  // Positive-G pneumatic suit and harness load sit above the engine body's low-frequency energy.
  const gSuitSource = audioContext.createBufferSource();
  gSuitSource.buffer = whiteNoiseBuffer(audioContext, 0x47535549);
  gSuitSource.loop = true;
  const gSuitFilter = audioContext.createBiquadFilter();
  gSuitFilter.type = "bandpass";
  gSuitFilter.frequency.value = 520;
  gSuitFilter.Q.value = 0.85;
  const gSuitGain = audioContext.createGain();
  gSuitGain.gain.value = 0;
  gSuitSource.connect(gSuitFilter).connect(gSuitGain).connect(destination);
  gSuitSource.start();

  const gHarnessSource = audioContext.createBufferSource();
  gHarnessSource.buffer = pinkNoiseBuffer(audioContext, 0x4841524E);
  gHarnessSource.loop = true;
  const gHarnessFilter = audioContext.createBiquadFilter();
  gHarnessFilter.type = "bandpass";
  gHarnessFilter.frequency.value = 1150;
  gHarnessFilter.Q.value = 1.4;
  const gHarnessGain = audioContext.createGain();
  gHarnessGain.gain.value = 0;
  gHarnessSource.connect(gHarnessFilter).connect(gHarnessGain).connect(destination);
  gHarnessSource.start();

  // Negative G / sudden unload has a deliberately different, lighter strap-and-loose-kit voice.
  const gUnloadSource = audioContext.createBufferSource();
  gUnloadSource.buffer = whiteNoiseBuffer(audioContext, 0x554E4C44);
  gUnloadSource.loop = true;
  const gUnloadFilter = audioContext.createBiquadFilter();
  gUnloadFilter.type = "bandpass";
  gUnloadFilter.frequency.value = 1750;
  gUnloadFilter.Q.value = 0.72;
  const gUnloadGain = audioContext.createGain();
  gUnloadGain.gain.value = 0;
  gUnloadSource.connect(gUnloadFilter).connect(gUnloadGain).connect(destination);
  gUnloadSource.start();

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

  // Internal gun body. The continuous 15/25/100 Hz cyclic component carries actual gun cadence;
  // clustered one-shots below provide breech/body variation without allocating 100 source graphs/s.
  const gunBodyOsc = audioContext.createOscillator();
  gunBodyOsc.type = "sawtooth";
  gunBodyOsc.frequency.value = 60;
  const gunBodyFilter = audioContext.createBiquadFilter();
  gunBodyFilter.type = "lowpass";
  gunBodyFilter.frequency.value = 280;
  gunBodyFilter.Q.value = 1.1;
  const gunBodyGain = audioContext.createGain();
  gunBodyGain.gain.value = 0;
  gunBodyOsc.connect(gunBodyFilter).connect(gunBodyGain).connect(destination);
  gunBodyOsc.start();

  const gunGasSource = audioContext.createBufferSource();
  gunGasSource.buffer = pinkNoiseBuffer(audioContext, 0x47554E47);
  gunGasSource.loop = true;
  const gunGasFilter = audioContext.createBiquadFilter();
  gunGasFilter.type = "bandpass";
  gunGasFilter.frequency.value = 720;
  gunGasFilter.Q.value = 0.58;
  const gunGasGain = audioContext.createGain();
  gunGasGain.gain.value = 0;
  gunGasSource.connect(gunGasFilter).connect(gunGasGain).connect(destination);
  gunGasSource.start();

  const gunMechanismSource = audioContext.createBufferSource();
  gunMechanismSource.buffer = whiteNoiseBuffer(audioContext, 0x47554E4D);
  gunMechanismSource.loop = true;
  const gunMechanismHp = audioContext.createBiquadFilter();
  gunMechanismHp.type = "highpass";
  gunMechanismHp.frequency.value = 1100;
  gunMechanismHp.Q.value = 0.5;
  const gunMechanismBp = audioContext.createBiquadFilter();
  gunMechanismBp.type = "bandpass";
  gunMechanismBp.frequency.value = 2300;
  gunMechanismBp.Q.value = 0.9;
  const gunMechanismGain = audioContext.createGain();
  gunMechanismGain.gain.value = 0;
  gunMechanismSource.connect(gunMechanismHp).connect(gunMechanismBp)
    .connect(gunMechanismGain).connect(destination);
  gunMechanismSource.start();

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

  // Gear/flap mechanism bed: hydraulic pump/actuator tone plus bay/track rumble. Edge one-shots
  // below provide door opening and downlock/up-lock punctuation.
  const mechanismSource = audioContext.createBufferSource();
  mechanismSource.buffer = pinkNoiseBuffer(audioContext, 0x48594431);
  mechanismSource.loop = true;
  const mechanismFilter = audioContext.createBiquadFilter();
  mechanismFilter.type = "bandpass";
  mechanismFilter.frequency.value = 260;
  mechanismFilter.Q.value = 0.8;
  const mechanismGain = audioContext.createGain();
  mechanismGain.gain.value = 0;
  mechanismSource.connect(mechanismFilter).connect(mechanismGain).connect(destination);
  mechanismSource.start();

  const hydraulicOsc = audioContext.createOscillator();
  hydraulicOsc.type = "triangle";
  hydraulicOsc.frequency.value = 115;
  const hydraulicFilter = audioContext.createBiquadFilter();
  hydraulicFilter.type = "bandpass";
  hydraulicFilter.frequency.value = 460;
  hydraulicFilter.Q.value = 4.5;
  const hydraulicGain = audioContext.createGain();
  hydraulicGain.gain.value = 0;
  hydraulicOsc.connect(hydraulicFilter).connect(hydraulicGain).connect(destination);
  hydraulicOsc.start();

  return {
    destination,
    buffetFilter,
    buffetGain,
    brakeHp,
    brakeBp,
    brakeGain,
    brakeFlutterOsc,
    brakeFlutterDepth,
    gFilter,
    gGain,
    gSuitFilter,
    gSuitGain,
    gHarnessFilter,
    gHarnessGain,
    gUnloadFilter,
    gUnloadGain,
    canopyFilter,
    canopyGain,
    canopy2Filter,
    canopy2Gain,
    gunBodyOsc,
    gunBodyFilter,
    gunBodyGain,
    gunGasFilter,
    gunGasGain,
    gunMechanismHp,
    gunMechanismBp,
    gunMechanismGain,
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
    mechanismFilter,
    mechanismGain,
    hydraulicOsc,
    hydraulicFilter,
    hydraulicGain,
    lastArrestPhase: "",
    lastHits: 0,
    lastOpponentHits: 0,
    lastOpponentAlive: true,
    lastRcsPulseAt: -Infinity,
    gunShotIndex: 0,
    lastGearPosition: null,
    lastFlapDegrees: null,
    lastConfigurationAt: audioContext.currentTime,
    gearWasMoving: false,
    flapWasMoving: false,
    lastSpeedBrake: null,
    speedBrakeWasExtended: false,
    lastPilotG: null,
    lastPilotGAt: audioContext.currentTime,
  };
}

/// Build the continuous acoustic presence of the other aircraft in the engagement. This graph is
/// separate from ownship propulsion so callers can update/mute it independently in cockpit,
/// external-camera, replay, and preview contexts.
export function createContactAcousticVoices(audioContext, destination) {
  const contactOcclusionFilter = audioContext.createBiquadFilter();
  contactOcclusionFilter.type = "lowpass";
  contactOcclusionFilter.frequency.value = 1000;
  contactOcclusionFilter.Q.value = 0.65;
  const contactOutput = audioContext.createGain();
  contactOutput.gain.value = 0;
  contactOcclusionFilter.connect(contactOutput).connect(destination);

  // Nearby jet: broadband exhaust/shear noise plus a low structure-borne turbine component.
  const fighterSource = audioContext.createBufferSource();
  fighterSource.buffer = whiteNoiseBuffer(audioContext, 0x464A4554);
  fighterSource.loop = true;
  const fighterHp = audioContext.createBiquadFilter();
  fighterHp.type = "highpass";
  fighterHp.frequency.value = 75;
  fighterHp.Q.value = 0.5;
  const fighterBp = audioContext.createBiquadFilter();
  fighterBp.type = "bandpass";
  fighterBp.frequency.value = 720;
  fighterBp.Q.value = 0.48;
  const fighterGain = audioContext.createGain();
  fighterGain.gain.value = 0;
  fighterSource.connect(fighterHp).connect(fighterBp)
    .connect(fighterGain).connect(contactOcclusionFilter);
  fighterSource.start();

  const fighterBodyOsc = audioContext.createOscillator();
  fighterBodyOsc.type = "sawtooth";
  fighterBodyOsc.frequency.value = 92;
  const fighterBodyFilter = audioContext.createBiquadFilter();
  fighterBodyFilter.type = "lowpass";
  fighterBodyFilter.frequency.value = 330;
  fighterBodyFilter.Q.value = 0.72;
  const fighterBodyGain = audioContext.createGain();
  fighterBodyGain.gain.value = 0;
  fighterBodyOsc.connect(fighterBodyFilter).connect(fighterBodyGain)
    .connect(contactOcclusionFilter);
  fighterBodyOsc.start();

  // Heavy contra-prop: broad low-frequency wash plus blade-passing and interaction tones.
  const propSource = audioContext.createBufferSource();
  propSource.buffer = pinkNoiseBuffer(audioContext, 0x434F4E54);
  propSource.loop = true;
  const propNoiseFilter = audioContext.createBiquadFilter();
  propNoiseFilter.type = "bandpass";
  propNoiseFilter.frequency.value = 145;
  propNoiseFilter.Q.value = 0.5;
  const propNoiseGain = audioContext.createGain();
  propNoiseGain.gain.value = 0;
  propSource.connect(propNoiseFilter).connect(propNoiseGain).connect(contactOcclusionFilter);
  propSource.start();

  const propBladeOsc = audioContext.createOscillator();
  propBladeOsc.type = "triangle";
  propBladeOsc.frequency.value = 50;
  const propBladeGain = audioContext.createGain();
  propBladeGain.gain.value = 0;
  propBladeOsc.connect(propBladeGain).connect(contactOcclusionFilter);
  propBladeOsc.start();

  const propInteractionOsc = audioContext.createOscillator();
  propInteractionOsc.type = "sawtooth";
  propInteractionOsc.frequency.value = 100;
  const propInteractionFilter = audioContext.createBiquadFilter();
  propInteractionFilter.type = "lowpass";
  propInteractionFilter.frequency.value = 380;
  propInteractionFilter.Q.value = 0.85;
  const propInteractionGain = audioContext.createGain();
  propInteractionGain.gain.value = 0;
  propInteractionOsc.connect(propInteractionFilter).connect(propInteractionGain)
    .connect(contactOcclusionFilter);
  propInteractionOsc.start();

  // ~750 rpm rotor-rate pulse for the Tu-95 branch; kept very shallow under the BPF/tone bed.
  const propPulseOsc = audioContext.createOscillator();
  propPulseOsc.type = "sine";
  propPulseOsc.frequency.value = 12.5;
  const propPulseDepth = audioContext.createGain();
  propPulseDepth.gain.value = 0;
  propPulseOsc.connect(propPulseDepth).connect(propNoiseGain.gain);
  propPulseOsc.start();

  return {
    destination,
    contactOcclusionFilter,
    contactOutput,
    fighterHp,
    fighterBp,
    fighterGain,
    fighterBodyOsc,
    fighterBodyFilter,
    fighterBodyGain,
    propNoiseFilter,
    propNoiseGain,
    propBladeOsc,
    propBladeGain,
    propInteractionOsc,
    propInteractionFilter,
    propInteractionGain,
    propPulseOsc,
    propPulseDepth,
    lastContactId: "",
    lastClosureKts: null,
    passArmed: false,
    passTransientCount: 0,
    acousticClass: "silent",
  };
}

function selectedOpponentAlive(state) {
  return typeof state?.opponent_alive === "boolean"
    ? state.opponent_alive
    : state?.bandit_alive !== false;
}

/// Update other-aircraft acoustics from the target snapshot. `cockpit` may be supplied by the
/// caller; when omitted, common perspective/camera fields are inspected and cockpit is the safe
/// default. Returns a compact parameter summary for previews/diagnostics.
export function updateContactAcousticVoices(
  voices,
  audioContext,
  state,
  { enabled = true, cockpit = null } = {},
) {
  if (!voices || !audioContext) return null;
  const now = audioContext.currentTime;
  const acousticClass = resolveContactAcousticClass(state);
  const contactId = String(
    state?.bandit_aircraft_id
      ?? state?.bandit_audio_class
      ?? acousticClass,
  ).toLowerCase();
  const rangeValue = finiteNumber(state?.range_m);
  const rangeM = rangeValue == null ? Infinity : Math.max(0, rangeValue);
  const closureKts = finiteNumber(state?.closure_kts) ?? 0;
  const alive = selectedOpponentAlive(state);
  const live = enabled && alive && acousticClass !== "silent" && Number.isFinite(rangeM);
  const cockpitMode = resolveCockpitPerspective(state, cockpit);
  const f22Cockpit = cockpitMode && resolvePropulsionCharacter(state) === "f22";

  if (contactId !== voices.lastContactId) {
    voices.lastContactId = contactId;
    voices.lastClosureKts = null;
    voices.passArmed = false;
  }

  // Closure is positive while the contact is approaching in the combat snapshot. Arm on a
  // confidently positive value, then fire exactly once when it becomes confidently negative.
  if (live && closureKts > 6) voices.passArmed = true;
  const crossedPass = live
    && voices.passArmed
    && closureKts < -6
    && (voices.lastClosureKts == null || voices.lastClosureKts >= -6);
  if (closureKts < -6) voices.passArmed = false;
  voices.lastClosureKts = closureKts;

  const doppler = clamp(1 + closureKts / 1450, 0.72, 1.34);
  const perspectiveLevel = cockpitMode ? (f22Cockpit ? 0.78 : 0.9) : 1.35;
  voices.contactOcclusionFilter.frequency.setTargetAtTime(
    cockpitMode ? (f22Cockpit ? 920 : 1450) : 12_000,
    now,
    0.12,
  );
  voices.contactOcclusionFilter.Q.setTargetAtTime(
    cockpitMode ? 0.72 : 0.5,
    now,
    0.12,
  );
  voices.contactOutput.gain.setTargetAtTime(live ? perspectiveLevel : 0, now, 0.08);

  const fighter = acousticClass === "fighter_jet";
  const fighterDistance = clamp01(1 - (rangeM - 80) / 2520);
  const fighterPresence = live && fighter ? Math.pow(fighterDistance, 1.65) : 0;
  voices.fighterHp.frequency.setTargetAtTime(
    (70 + fighterPresence * 150) * doppler,
    now,
    0.08,
  );
  voices.fighterBp.frequency.setTargetAtTime(
    (560 + fighterPresence * 1250) * doppler,
    now,
    0.065,
  );
  voices.fighterBodyOsc.frequency.setTargetAtTime(
    (78 + fighterPresence * 90) * doppler,
    now,
    0.06,
  );
  voices.fighterBodyFilter.frequency.setTargetAtTime(
    (260 + fighterPresence * 310) * doppler,
    now,
    0.07,
  );
  voices.fighterGain.gain.setTargetAtTime(0.16 * fighterPresence, now, 0.055);
  voices.fighterBodyGain.gain.setTargetAtTime(0.075 * fighterPresence, now, 0.055);

  const contra = acousticClass === "heavy_contra_prop";
  const heavyProp = contra || acousticClass === "heavy_turboprop";
  const maxPropRangeM = contra ? 80_000 : 32_000;
  const propReferenceM = contra ? 9_000 : 5_500;
  const propFade = clamp01(1 - rangeM / maxPropRangeM);
  const propSpreading = 1 / (1 + Math.pow(rangeM / propReferenceM, 1.35));
  const propPresence = live && heavyProp
    ? Math.pow(propFade, 0.45) * Math.sqrt(propSpreading)
    : 0;
  const propRpm = Math.max(
    300,
    finiteNumber(state?.bandit_prop_rpm) ?? (contra ? 750 : 1020),
  );
  const bladeCount = Math.max(
    2,
    finiteNumber(state?.bandit_prop_blade_count) ?? 4,
  );
  const rotorHz = propRpm / 60;
  const bladeHz = rotorHz * bladeCount;
  voices.propPulseOsc.frequency.setTargetAtTime(rotorHz * doppler, now, 0.1);
  voices.propBladeOsc.frequency.setTargetAtTime(bladeHz * doppler, now, 0.08);
  voices.propInteractionOsc.frequency.setTargetAtTime(
    bladeHz * (contra ? 2.02 : 1.5) * doppler,
    now,
    0.08,
  );
  voices.propNoiseFilter.frequency.setTargetAtTime(
    (105 + propPresence * (contra ? 170 : 230)) * doppler,
    now,
    0.11,
  );
  voices.propInteractionFilter.frequency.setTargetAtTime(
    (310 + propPresence * 320) * doppler,
    now,
    0.1,
  );
  voices.propNoiseGain.gain.setTargetAtTime(0.13 * propPresence, now, 0.1);
  voices.propBladeGain.gain.setTargetAtTime(
    (contra ? 0.047 : 0.032) * propPresence,
    now,
    0.1,
  );
  voices.propInteractionGain.gain.setTargetAtTime(
    (contra ? 0.026 : 0.014) * propPresence,
    now,
    0.1,
  );
  voices.propPulseDepth.gain.setTargetAtTime(0.018 * propPresence, now, 0.1);

  const passRangeM = fighter ? 2800 : contra ? 14_000 : 7500;
  if (crossedPass && rangeM <= passRangeM) {
    const passScale = clamp01(1 - rangeM / passRangeM);
    scheduleContactPass(
      audioContext,
      voices.contactOcclusionFilter,
      now,
      fighter,
      passScale,
      cockpitMode,
    );
    voices.passTransientCount += 1;
  }
  voices.acousticClass = acousticClass;

  return {
    acousticClass,
    rangeM,
    closureKts,
    cockpit: cockpitMode,
    fighterPresence,
    propPresence,
    doppler,
    crossedPass: crossedPass && rangeM <= passRangeM,
  };
}

export function resolveContactAcousticClass(state) {
  const explicit = String(state?.bandit_audio_class ?? "").trim().toLowerCase();
  const id = String(state?.bandit_aircraft_id ?? "").trim().toLowerCase();
  const identity = `${explicit} ${id}`;
  if (/(?:silent|none|balloon|glider|sailplane)/.test(identity)) return "silent";
  if (/(?:tu[-_. ]?95|bear|contra[-_. ]?(?:rotat|prop)|nk[-_. ]?12)/.test(identity)) {
    return "heavy_contra_prop";
  }
  if (/(?:heavy[-_. ]?turboprop|turboprop|awacs|kj[-_. ]?500|e[-_. ]?2[cd]?|hawkeye)/.test(identity)) {
    return "heavy_turboprop";
  }
  // A combat target without a specialized acoustic contract is overwhelmingly a jet. Keeping
  // this default preserves existing missions while future content can publish an explicit class.
  return id || explicit ? "fighter_jet" : "silent";
}

function scheduleContactPass(
  audioContext,
  destination,
  at,
  fighter,
  passScale,
  cockpit,
) {
  const scale = passScale * (cockpit ? 0.78 : 1.15);
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, fighter ? 0x50415353 : 0x50524F50, 0.65);
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(fighter ? 1850 : 520, at);
  filter.frequency.exponentialRampToValueAtTime(fighter ? 430 : 170, at + 0.5);
  filter.Q.value = fighter ? 0.42 : 0.7;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, (fighter ? 0.24 : 0.15) * scale),
    at + 0.035,
  );
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.62);
  noise.connect(filter).connect(env).connect(destination);
  noise.start(at);
  noise.stop(at + 0.68);

  const body = audioContext.createOscillator();
  body.type = fighter ? "sawtooth" : "triangle";
  body.frequency.setValueAtTime(fighter ? 155 : 72, at);
  body.frequency.exponentialRampToValueAtTime(fighter ? 58 : 42, at + 0.48);
  const bodyEnv = audioContext.createGain();
  bodyEnv.gain.setValueAtTime(0.0001, at);
  bodyEnv.gain.exponentialRampToValueAtTime(
    Math.max(0.0002, (fighter ? 0.085 : 0.065) * scale),
    at + 0.025,
  );
  bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
  body.connect(bodyEnv).connect(destination);
  body.start(at);
  body.stop(at + 0.58);
}

export function updateBuffetVoice(voices, audioContext, state, { enabled = true } = {}) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  // The production snapshot publishes `buffet` as a boolean. Treat it as a gate/floor, never as
  // full-scale intensity; the actual camera/airframe angular disturbance supplies progression.
  const rawBuffet = state?.buffet;
  const numericBuffet = typeof rawBuffet === "number" && Number.isFinite(rawBuffet)
    ? clamp01(rawBuffet)
    : clamp01(finiteNumber(state?.buffet_intensity_01) ?? 0);
  const buffetFloor = rawBuffet === true ? 0.08 : 0;
  const angle = Math.hypot(
    finiteNumber(state?.buffet_pitch_deg) ?? 0,
    finiteNumber(state?.buffet_roll_deg) ?? 0,
    finiteNumber(state?.buffet_yaw_deg) ?? 0,
  );
  const angleDrive = smoothstep(clamp01(angle / 3.2));
  const aoa = Math.abs(finiteNumber(state?.aoa_deg) ?? 0);
  const aoaDrive = rawBuffet === true ? 0.16 * smoothstep(clamp01((aoa - 6) / 12)) : 0;
  const buffetMag = clamp01(Math.max(numericBuffet, buffetFloor + angleDrive * 0.82 + aoaDrive));
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
  const brakeLevel = enabled ? brake * q01 : 0;
  const brakeExtended = brake > (voices.speedBrakeWasExtended ? 0.04 : 0.1);
  if (enabled
    && voices.lastSpeedBrake != null
    && brakeExtended !== voices.speedBrakeWasExtended) {
    scheduleSpeedBrakeEdge(
      audioContext,
      voices.destination,
      now,
      brakeExtended,
      q01,
    );
  }
  voices.lastSpeedBrake = brake;
  voices.speedBrakeWasExtended = brakeExtended;
  voices.brakeHp.frequency.setTargetAtTime(140 + brake * 220 + q01 * 180, now, 0.1);
  voices.brakeBp.frequency.setTargetAtTime(650 + brake * 900 + q01 * 500, now, 0.1);
  voices.brakeGain.gain.setTargetAtTime(0.22 * Math.pow(brakeLevel, 1.05), now, 0.08);
  voices.brakeFlutterOsc.frequency.setTargetAtTime(10 + q01 * 19 + brake * 4, now, 0.12);
  voices.brakeFlutterDepth.gain.setTargetAtTime(
    enabled ? 0.035 * brakeLevel : 0,
    now,
    0.08,
  );

  const g = readPilotG(state);
  const elapsed = voices.lastPilotG == null
    ? 1 / 60
    : Math.max(1 / 120, Math.min(0.3, now - voices.lastPilotGAt || 0));
  const fallingRate = voices.lastPilotG == null
    ? 0
    : Math.max(0, (voices.lastPilotG - g) / elapsed);
  voices.lastPilotG = g;
  voices.lastPilotGAt = now;

  // Positive G uses pressure/structure; negative G and rapid unloading use loose straps/kit.
  const positiveG = clamp01((g - 1.55) / 5.7);
  const negativeG = clamp01((0.35 - g) / 2.35);
  const positiveOnset = clamp01(
    (finiteNumber(state?.pilot_positive_onset_rate_g_per_second) ?? 0) / 6,
  );
  const negativeOnset = clamp01(
    (finiteNumber(state?.pilot_negative_onset_rate_g_per_second) ?? 0) / 4,
  );
  const unloadOnset = clamp01(fallingRate / 7);
  voices.gFilter.frequency.setTargetAtTime(70 + positiveG * 160 + q01 * 40, now, 0.1);
  voices.gGain.gain.setTargetAtTime(
    enabled ? 0.105 * Math.pow(positiveG, 1.2) : 0,
    now,
    0.1,
  );
  voices.gSuitFilter.frequency.setTargetAtTime(
    390 + positiveG * 360 + positiveOnset * 170,
    now,
    0.08,
  );
  voices.gSuitGain.gain.setTargetAtTime(
    enabled ? 0.075 * Math.pow(positiveG, 1.05) * (0.7 + 0.3 * positiveOnset) : 0,
    now,
    0.08,
  );
  voices.gHarnessFilter.frequency.setTargetAtTime(
    820 + positiveG * 520 + positiveOnset * 420,
    now,
    0.06,
  );
  voices.gHarnessGain.gain.setTargetAtTime(
    enabled ? 0.038 * Math.max(positiveG * 0.55, positiveOnset) : 0,
    now,
    0.055,
  );
  voices.gUnloadFilter.frequency.setTargetAtTime(
    1300 + negativeG * 1050 + Math.max(negativeOnset, unloadOnset) * 620,
    now,
    0.055,
  );
  voices.gUnloadGain.gain.setTargetAtTime(
    enabled
      ? 0.07 * Math.max(
        Math.pow(negativeG, 0.85),
        negativeOnset,
        unloadOnset * 0.72,
      )
      : 0,
    now,
    0.045,
  );

  const aged = isAgedF22(state);
  // Late-2030s canopy seals leak under load — high-G flex is the tell, q just brightens it.
  const canopyG = clamp01((Math.max(1, Math.abs(g)) - 2.1) / 4.8);
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

function scheduleSpeedBrakeEdge(audioContext, destination, at, extending, q01) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(
    audioContext,
    extending ? 0x42524445 : 0x42525254,
    extending ? 0.16 : 0.11,
  );
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = extending ? 520 + q01 * 480 : 360 + q01 * 260;
  filter.Q.value = extending ? 0.82 : 1.25;
  const env = audioContext.createGain();
  const level = (extending ? 0.085 : 0.06) * (0.6 + 0.4 * q01);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, at + (extending ? 0.14 : 0.095));
  noise.connect(filter).connect(env).connect(destination);
  noise.start(at);
  noise.stop(at + (extending ? 0.17 : 0.12));
}

/// Cockpit mechanism cues from published gear/flap positions. Movement drives a continuous
/// hydraulic/track bed; start and lock edges fire short structure-borne clunks.
export function updateConfigurationVoices(
  voices,
  audioContext,
  state,
  { enabled = true } = {},
) {
  if (!voices || !audioContext) return;
  const now = audioContext.currentTime;
  const elapsed = Math.max(1 / 120, Math.min(0.25, now - voices.lastConfigurationAt || 0));
  voices.lastConfigurationAt = now;

  const gearValues = [
    finiteNumber(state?.gear_nose),
    finiteNumber(state?.gear_left),
    finiteNumber(state?.gear_right),
  ].filter((value) => value != null);
  const gear = gearValues.length > 0
    ? gearValues.reduce((total, value) => total + value, 0) / gearValues.length
    : null;
  const flapValues = [
    finiteNumber(state?.flap_left_deg),
    finiteNumber(state?.flap_right_deg),
  ].filter((value) => value != null);
  const flaps = flapValues.length > 0
    ? flapValues.reduce((total, value) => total + value, 0) / flapValues.length
    : null;

  const gearRate = gear != null && voices.lastGearPosition != null
    ? Math.abs(gear - voices.lastGearPosition) / elapsed
    : 0;
  const flapRate = flaps != null && voices.lastFlapDegrees != null
    ? Math.abs(flaps - voices.lastFlapDegrees) / elapsed
    : 0;
  const gearMotion = clamp01(gearRate / 0.28);
  const flapMotion = clamp01(flapRate / 9);
  const gearMoving = gearMotion > 0.025;
  const flapMoving = flapMotion > 0.025;

  if (enabled && gearMoving && !voices.gearWasMoving) {
    scheduleConfigurationClunk(audioContext, voices.destination, now, "gear-start");
  }
  if (enabled && !gearMoving && voices.gearWasMoving && gear != null) {
    const locked = gear < 0.04 || gear > 0.96;
    scheduleConfigurationClunk(
      audioContext,
      voices.destination,
      now,
      locked ? "gear-lock" : "gear-stop",
    );
  }
  if (enabled && flapMoving && !voices.flapWasMoving) {
    scheduleConfigurationClunk(audioContext, voices.destination, now, "flap-start");
  }
  if (enabled && !flapMoving && voices.flapWasMoving) {
    scheduleConfigurationClunk(audioContext, voices.destination, now, "flap-stop");
  }

  const motion = Math.max(gearMotion, flapMotion * 0.72);
  const gearWeight = gearMotion >= flapMotion ? 1 : 0.65;
  voices.mechanismFilter.frequency.setTargetAtTime(
    190 + gearMotion * 240 + flapMotion * 430,
    now,
    0.08,
  );
  voices.mechanismFilter.Q.setTargetAtTime(0.7 + motion * 1.1, now, 0.08);
  voices.mechanismGain.gain.setTargetAtTime(
    enabled ? 0.095 * Math.pow(motion, 0.85) * gearWeight : 0,
    now,
    0.05,
  );
  voices.hydraulicOsc.frequency.setTargetAtTime(
    102 + gearMotion * 38 + flapMotion * 64,
    now,
    0.08,
  );
  voices.hydraulicFilter.frequency.setTargetAtTime(
    360 + gearMotion * 280 + flapMotion * 520,
    now,
    0.08,
  );
  voices.hydraulicGain.gain.setTargetAtTime(
    enabled ? 0.028 * Math.pow(motion, 0.9) : 0,
    now,
    0.05,
  );

  voices.lastGearPosition = gear;
  voices.lastFlapDegrees = flaps;
  voices.gearWasMoving = gearMoving;
  voices.flapWasMoving = flapMoving;
}

function scheduleConfigurationClunk(audioContext, destination, at, kind) {
  const gear = kind.startsWith("gear");
  const locking = kind.endsWith("lock") || kind.endsWith("stop");
  const noise = audioContext.createBufferSource();
  const seed = kind === "gear-start" ? 0x47445231
    : kind === "gear-lock" ? 0x474C4B31
      : kind === "gear-stop" ? 0x47535431
        : kind === "flap-start" ? 0x46505231 : 0x46505331;
  noise.buffer = shortNoiseBuffer(audioContext, seed, gear ? 0.18 : 0.11);
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = gear ? (locking ? 240 : 390) : (locking ? 720 : 980);
  filter.Q.value = gear ? 0.8 : 1.1;
  const env = audioContext.createGain();
  const level = gear ? (locking ? 0.2 : 0.14) : (locking ? 0.065 : 0.05);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(level, at + (locking ? 0.004 : 0.009));
  env.gain.exponentialRampToValueAtTime(0.0001, at + (gear ? 0.16 : 0.1));
  noise.connect(filter).connect(env).connect(destination);
  noise.start(at);
  noise.stop(at + (gear ? 0.2 : 0.13));

  if (gear) {
    const body = audioContext.createOscillator();
    body.type = "sine";
    body.frequency.setValueAtTime(locking ? 62 : 84, at);
    body.frequency.exponentialRampToValueAtTime(locking ? 34 : 48, at + 0.12);
    const bodyEnv = audioContext.createGain();
    bodyEnv.gain.setValueAtTime(0.0001, at);
    bodyEnv.gain.exponentialRampToValueAtTime(locking ? 0.085 : 0.05, at + 0.006);
    bodyEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
    body.connect(bodyEnv).connect(destination);
    body.start(at);
    body.stop(at + 0.17);
  }
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
  const alive = selectedOpponentAlive(state);
  const targetRangeM = Math.max(0, finiteNumber(state?.range_m) ?? 450);
  const targetScale = Math.max(0.18, 1 / (1 + Math.max(0, targetRangeM - 80) / 720));

  if (enabled && hits > (voices.lastHits || 0)) {
    const n = Math.min(4, hits - voices.lastHits);
    for (let i = 0; i < n; i++) {
      scheduleHitImpact(
        audioContext,
        voices.destination,
        now + i * 0.03,
        false,
        targetScale,
      );
    }
  }
  if (enabled && opponentHits > (voices.lastOpponentHits || 0)) {
    const n = Math.min(3, opponentHits - voices.lastOpponentHits);
    for (let i = 0; i < n; i++) {
      scheduleHitImpact(audioContext, voices.destination, now + i * 0.04, true, 1);
    }
  }
  if (enabled && voices.lastOpponentAlive !== false && alive === false) {
    scheduleDestroyBoom(audioContext, voices.destination, now, targetScale);
  }
  voices.lastHits = hits;
  voices.lastOpponentHits = opponentHits;
  voices.lastOpponentAlive = alive;
}

function scheduleHitImpact(audioContext, destination, at, onOwnship, distanceScale) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, onOwnship ? 0x48495450 : 0x4849544F, 0.1);
  const bp = audioContext.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = onOwnship ? 700 : 1400;
  bp.Q.value = 0.9;
  const env = audioContext.createGain();
  const amp = onOwnship ? 0.16 : 0.11 * distanceScale;
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(amp, at + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
  noise.connect(bp).connect(env).connect(destination);
  noise.start(at); noise.stop(at + 0.1);
}

function scheduleDestroyBoom(audioContext, destination, at, distanceScale) {
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, 0x424F4F4D, 0.55);
  const lp = audioContext.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 520 + 380 * distanceScale;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(0.28 * distanceScale, at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.06 * distanceScale, at + 0.18);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
  const osc = audioContext.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(55, at);
  osc.frequency.exponentialRampToValueAtTime(22, at + 0.5);
  const oEnv = audioContext.createGain();
  oEnv.gain.setValueAtTime(0.0001, at);
  oEnv.gain.exponentialRampToValueAtTime(0.12 * distanceScale, at + 0.015);
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
  const profile = resolveGunSoundProfile(state);
  const firing = enabled
    && triggerHeld
    && state?.gun_firing === true
    && state?.gun_overheat !== true;

  voices.gunBodyOsc.frequency.setTargetAtTime(profile.bodyHz, now, 0.025);
  voices.gunBodyFilter.frequency.setTargetAtTime(
    180 + Math.min(100, profile.roundsPerSecond) * 2.1,
    now,
    0.04,
  );
  voices.gunGasFilter.frequency.setTargetAtTime(
    520 + Math.min(100, profile.roundsPerSecond) * 5.2,
    now,
    0.05,
  );
  voices.gunMechanismHp.frequency.setTargetAtTime(
    900 + profile.roundsPerSecond * 5,
    now,
    0.05,
  );
  voices.gunMechanismBp.frequency.setTargetAtTime(
    1700 + profile.roundsPerSecond * 8,
    now,
    0.05,
  );
  voices.gunBodyGain.gain.setTargetAtTime(firing ? profile.bodyLevel : 0, now, firing ? 0.008 : 0.025);
  voices.gunGasGain.gain.setTargetAtTime(firing ? profile.gasLevel : 0, now, firing ? 0.01 : 0.045);
  voices.gunMechanismGain.gain.setTargetAtTime(
    firing ? profile.mechanismLevel : 0,
    now,
    firing ? 0.006 : 0.02,
  );

  if (!firing) {
    voices.wasFiring = false;
    return;
  }
  const reportInterval = 1 / profile.reportRate;
  if (!voices.wasFiring) {
    voices.wasFiring = true;
    const rounds = Math.max(0, Math.trunc(finiteNumber(state?.rounds_fired) ?? 0));
    voices.gunShotIndex = rounds;
    voices.lastGunAt = now - reportInterval;
  }
  let reports = 0;
  while (now - voices.lastGunAt >= reportInterval && reports < 6) {
    voices.lastGunAt += reportInterval;
    scheduleGunReport(
      audioContext,
      voices.destination,
      voices.lastGunAt,
      profile,
      voices.gunShotIndex++,
    );
    reports += 1;
  }
  if (reports === 6 && now - voices.lastGunAt >= reportInterval) {
    // A backgrounded tab must not dump a seconds-long catch-up burst on resume.
    voices.lastGunAt = now;
  }
}

function resolveGunSoundProfile(state) {
  const id = String(state?.player_gun_profile_id ?? "").toLowerCase();
  if (id.includes("m61")) return GUN_SOUND_PROFILES.m61;
  if (id.includes("gsh301") || id.includes("gsh-301")) return GUN_SOUND_PROFILES.gsh301;
  if (id.includes("m3") || id.includes("50cal")) return GUN_SOUND_PROFILES.sixM3;
  // The modern F-22/Rapier missions use the M61-class contract; historical fixed-wing defaults
  // keep the slower six-gun cadence.
  const character = resolvePropulsionCharacter(state);
  return character === "f22" || character === "rapier"
    ? GUN_SOUND_PROFILES.m61
    : GUN_SOUND_PROFILES.sixM3;
}

function scheduleGunReport(audioContext, destination, at, profile, shotIndex) {
  const variation = deterministicUnit(shotIndex + 1);
  const seed = (0x47554E31 ^ Math.imul(shotIndex + 1, 0x45d9f3b)) & 0x7fffffff;
  const noise = audioContext.createBufferSource();
  noise.buffer = shortNoiseBuffer(audioContext, seed, 0.085);
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 620 + profile.reportLevel * 2600 + variation * 460;
  filter.Q.value = 0.68 + variation * 0.32;
  const tone = audioContext.createOscillator();
  tone.type = "triangle";
  tone.frequency.value = 54 + variation * 28 + Math.min(100, profile.roundsPerSecond) * 0.12;
  const noiseEnv = audioContext.createGain();
  const toneEnv = audioContext.createGain();
  noiseEnv.gain.setValueAtTime(0.0001, at);
  noiseEnv.gain.exponentialRampToValueAtTime(
    profile.reportLevel * (0.85 + variation * 0.3),
    at + 0.0035,
  );
  noiseEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.052);
  toneEnv.gain.setValueAtTime(0.0001, at);
  toneEnv.gain.exponentialRampToValueAtTime(
    profile.reportLevel * (0.48 + variation * 0.16),
    at + 0.0025,
  );
  toneEnv.gain.exponentialRampToValueAtTime(0.0001, at + 0.034);
  noise.connect(filter).connect(noiseEnv).connect(destination);
  tone.connect(toneEnv).connect(destination);
  noise.start(at);
  noise.stop(at + 0.07);
  tone.start(at);
  tone.stop(at + 0.045);
}

function deterministicUnit(value) {
  let x = Math.imul(value | 0, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
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
  const normalized = finiteNumber(state?.dynamic_pressure_01, state?.q_01);
  if (normalized != null) return smoothstep(clamp01(normalized));
  const publishedPa = finiteNumber(state?.dynamic_pressure_pa, state?.q_pa);
  if (publishedPa != null) {
    return smoothstep(clamp01((Math.max(0, publishedPa) - 750) / (45_000 - 750)));
  }
  const density = finiteNumber(state?.air_density_kg_m3) ?? 1.225;
  const kts = finiteNumber(state?.true_airspeed_kts) ?? 0;
  const mps = finiteNumber(state?.true_airspeed_mps) ?? kts * 0.514444;
  const q = 0.5 * Math.max(0, density) * Math.max(0, mps) ** 2;
  return smoothstep(clamp01((q - 750) / (45_000 - 750)));
}

function readPilotG(state) {
  const pilotG = finiteNumber(state?.pilot_gz);
  if (state?.pilot_gz_valid !== false && pilotG != null) return pilotG;
  return finiteNumber(state?.g_actual) ?? 1;
}

function resolveCockpitPerspective(state, explicitCockpit) {
  if (typeof explicitCockpit === "boolean") return explicitCockpit;
  if (state?.replay_external === true) return false;
  const perspective = String(
    state?.audio_perspective
      ?? state?.camera_perspective
      ?? state?.replay_camera
      ?? "",
  ).trim().toLowerCase();
  if (/(?:external|outside|chase|orbit|flyby)/.test(perspective)) return false;
  return true;
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

function clamp(value, minimum, maximum) {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

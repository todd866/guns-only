// Physical speech path and radio-link models are deliberately separate.
//
// Talker profiles describe the microphone and what is around the speaker's mouth. Transceiver
// profiles describe the RF installation heard by the receiver. The source WAV remains dry so a
// radio change can re-use the performance; a mask/microphone change stays explicit because it may
// also require a different source performance.

export const TALKER_PROFILES = Object.freeze({
  "rapier.pressure-vessel.emergency-mask": Object.freeze({
    highpassHz: 150,
    lowpassHz: 6_200,
    presenceHz: 2_150,
    presenceQ: 0.85,
    presenceDb: 0.8,
  }),
  "modern.fast-jet.oxygen-mask": Object.freeze({
    highpassHz: 230,
    lowpassHz: 4_600,
    presenceHz: 1_850,
    presenceQ: 1.05,
    presenceDb: 2.2,
  }),
  "korea.f9f.a13a-mask": Object.freeze({
    highpassHz: 310,
    lowpassHz: 3_300,
    presenceHz: 1_650,
    presenceQ: 1.2,
    presenceDb: 3.1,
  }),
  "ground.controller.close-mic": Object.freeze({
    highpassHz: 120,
    lowpassHz: 7_200,
    presenceHz: 2_100,
    presenceQ: 0.8,
    presenceDb: 0.4,
  }),
  "carrier.deck-lso.close-mic": Object.freeze({
    highpassHz: 250,
    lowpassHz: 5_600,
    presenceHz: 2_000,
    presenceQ: 0.95,
    presenceDb: 1.4,
  }),
});

export const TRANSCEIVER_PROFILES = Object.freeze({
  "modern.uhf-am.airborne": Object.freeze({
    highpassHz: 255,
    lowpassHz: 3_850,
    presenceHz: 1_900,
    presenceQ: 0.9,
    presenceDb: 1.7,
    compressor: Object.freeze({
      thresholdDb: -20,
      kneeDb: 5,
      ratio: 5,
      attackS: 0.006,
      releaseS: 0.14,
    }),
    outputLevel: 0.67,
    strongCarrierNoise: 0.0025,
    marginalCarrierNoise: 0.050,
    marginalBandwidthLossHz: 1_050,
    key: Object.freeze({ minimumS: 0.032, variationS: 0.025, level: 0.11 }),
    unkey: Object.freeze({ minimumS: 0.046, variationS: 0.028, level: 0.18 }),
  }),
  "modern.uhf-am.ground": Object.freeze({
    highpassHz: 235,
    lowpassHz: 4_100,
    presenceHz: 1_950,
    presenceQ: 0.85,
    presenceDb: 1.4,
    compressor: Object.freeze({
      thresholdDb: -21,
      kneeDb: 5,
      ratio: 4.5,
      attackS: 0.007,
      releaseS: 0.15,
    }),
    outputLevel: 0.72,
    strongCarrierNoise: 0.0015,
    marginalCarrierNoise: 0.043,
    marginalBandwidthLossHz: 950,
    key: Object.freeze({ minimumS: 0.028, variationS: 0.020, level: 0.09 }),
    unkey: Object.freeze({ minimumS: 0.040, variationS: 0.024, level: 0.15 }),
  }),
  "modern.uhf-am.deck": Object.freeze({
    highpassHz: 280,
    lowpassHz: 3_600,
    presenceHz: 1_900,
    presenceQ: 0.95,
    presenceDb: 2.0,
    compressor: Object.freeze({
      thresholdDb: -21,
      kneeDb: 4,
      ratio: 5.5,
      attackS: 0.005,
      releaseS: 0.13,
    }),
    outputLevel: 0.76,
    strongCarrierNoise: 0.0035,
    marginalCarrierNoise: 0.054,
    marginalBandwidthLossHz: 1_000,
    key: Object.freeze({ minimumS: 0.032, variationS: 0.025, level: 0.13 }),
    unkey: Object.freeze({ minimumS: 0.045, variationS: 0.026, level: 0.19 }),
  }),
  "korea.arc-1.vhf-airborne": Object.freeze({
    highpassHz: 335,
    lowpassHz: 2_900,
    presenceHz: 1_600,
    presenceQ: 1.05,
    presenceDb: 3.0,
    compressor: Object.freeze({
      thresholdDb: -23,
      kneeDb: 3,
      ratio: 7,
      attackS: 0.004,
      releaseS: 0.20,
    }),
    outputLevel: 0.68,
    strongCarrierNoise: 0.008,
    marginalCarrierNoise: 0.075,
    marginalBandwidthLossHz: 800,
    key: Object.freeze({ minimumS: 0.046, variationS: 0.045, level: 0.17 }),
    unkey: Object.freeze({ minimumS: 0.070, variationS: 0.050, level: 0.27 }),
  }),
  "korea.arc-1.vhf-ship": Object.freeze({
    highpassHz: 310,
    lowpassHz: 3_050,
    presenceHz: 1_650,
    presenceQ: 1.0,
    presenceDb: 2.7,
    compressor: Object.freeze({
      thresholdDb: -22,
      kneeDb: 3,
      ratio: 6.5,
      attackS: 0.004,
      releaseS: 0.19,
    }),
    outputLevel: 0.71,
    strongCarrierNoise: 0.006,
    marginalCarrierNoise: 0.067,
    marginalBandwidthLossHz: 800,
    key: Object.freeze({ minimumS: 0.042, variationS: 0.038, level: 0.15 }),
    unkey: Object.freeze({ minimumS: 0.064, variationS: 0.044, level: 0.24 }),
  }),
});

const ROLE_DEFAULTS = Object.freeze({
  tower: Object.freeze({
    talkerProfile: "ground.controller.close-mic",
    transceiverProfile: "modern.uhf-am.ground",
  }),
  controller: Object.freeze({
    talkerProfile: "ground.controller.close-mic",
    transceiverProfile: "modern.uhf-am.ground",
  }),
  lso: Object.freeze({
    talkerProfile: "carrier.deck-lso.close-mic",
    transceiverProfile: "modern.uhf-am.deck",
  }),
  launch: Object.freeze({
    talkerProfile: "carrier.deck-lso.close-mic",
    transceiverProfile: "modern.uhf-am.deck",
  }),
  pilot: Object.freeze({
    talkerProfile: "rapier.pressure-vessel.emergency-mask",
    transceiverProfile: "modern.uhf-am.airborne",
  }),
  traffic: Object.freeze({
    talkerProfile: "rapier.pressure-vessel.emergency-mask",
    transceiverProfile: "modern.uhf-am.airborne",
  }),
});

function clamp01(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function roleDefault(role) {
  if (ROLE_DEFAULTS[role]) return ROLE_DEFAULTS[role];
  if (String(role ?? "").startsWith("traffic-")) return ROLE_DEFAULTS.traffic;
  return ROLE_DEFAULTS.traffic;
}

export function resolveRadioEquipment({
  role,
  talkerProfile,
  transceiverProfile,
  signalQuality,
} = {}) {
  const fallback = roleDefault(role);
  const talkerId = TALKER_PROFILES[talkerProfile]
    ? talkerProfile
    : fallback.talkerProfile;
  const transceiverId = TRANSCEIVER_PROFILES[transceiverProfile]
    ? transceiverProfile
    : fallback.transceiverProfile;
  const quality = clamp01(signalQuality);
  const talker = TALKER_PROFILES[talkerId];
  const transceiver = TRANSCEIVER_PROFILES[transceiverId];
  const degradation = 1 - quality;

  return {
    talkerId,
    transceiverId,
    signalQuality: quality,
    talker,
    transceiver,
    // Strong line-of-sight AM should be intelligible, not buried under film-style static.
    carrierNoise: transceiver.strongCarrierNoise
      + transceiver.marginalCarrierNoise * degradation * degradation,
    receiveHighpassHz: transceiver.highpassHz + 70 * degradation,
    receiveLowpassHz: Math.max(
      transceiver.highpassHz + 900,
      transceiver.lowpassHz - transceiver.marginalBandwidthLossHz * degradation,
    ),
    receiveLevel: transceiver.outputLevel * (0.88 + 0.12 * quality),
  };
}

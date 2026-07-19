const SCHEMA = "carrier-incident-replay.v3";
const MAX_SAMPLES = 400;
const MAX_DURATION_SECONDS = 31;

const SURFACES = Object.freeze([
  "NONE", "WATER", "FLIGHT DECK", "CARRIER STRUCTURE", "SIMULATION BOUNDARY",
]);
const RECOVERIES = Object.freeze([
  "FLYING", "TRAP", "BOLTER", "HARD LANDING", "RAMP STRIKE", "IN THE WATER",
  "ARRESTMENT FAILED",
]);
const HOOKS = Object.freeze([
  "NOT CONTACTED", "ENGAGED", "HOOK SKIP", "IN-FLIGHT ENGAGEMENT", "MISSED WIRES",
]);
const TERMINAL_STATES = Object.freeze([
  "FLYING", "DESTROYED AIRBORNE", "IMPACTED", "SETTLED", "SIMULATION BOUNDED",
]);
const EVENTS = Object.freeze([
  "HIT", "DESTROYED", "IMPACT", "SETTLED", "TERMINAL LIMIT", "SORTIE FINISHED",
  "ARRESTMENT FAILED",
]);
const ARRESTMENT_FAILURES = Object.freeze([
  "NONE", "ENERGY CAPACITY EXCEEDED", "RUNOUT EXHAUSTED", "LINE LOAD EXCEEDED",
]);
const CARRIER_SOLIDS = Object.freeze(["NONE", "FLIGHT DECK", "HULL", "ISLAND"]);
const TOUCHDOWN_GRADES = Object.freeze(["NONE", "OK", "FAIR", "NO GRADE", "CUT"]);
const TOUCHDOWN_CORRECTIONS = Object.freeze([
  "NONE", "WAVE OFF EARLIER", "ADD POWER EARLIER", "STABILIZE IAS",
  "ESTABLISH LINEUP EARLIER", "FLY ON-SPEED AOA", "FLY THROUGH — DO NOT FLARE",
  "MEET TRAINING TARGET",
]);
const TOUCHDOWN_DEVIATIONS = Object.freeze([
  [1 << 0, "LOW SINK RATE"],
  [1 << 1, "HARD SINK RATE"],
  [1 << 2, "UNSAFE SINK RATE"],
  [1 << 3, "LINEUP"],
  [1 << 4, "SLOW"],
  [1 << 5, "FAST"],
  [1 << 6, "EXCESSIVE CLOSURE"],
  [1 << 7, "HIGH AOA"],
  [1 << 8, "LOW AOA"],
  [1 << 9, "OUTSIDE ADAPTIVE TARGET"],
]);
const DEVIATION = Object.freeze({
  LOW_SINK: 1 << 0,
  HARD_SINK: 1 << 1,
  UNSAFE_SINK: 1 << 2,
  LINEUP: 1 << 3,
  SLOW: 1 << 4,
  FAST: 1 << 5,
  EXCESSIVE_CLOSURE: 1 << 6,
  HIGH_AOA: 1 << 7,
  LOW_AOA: 1 << 8,
  OUTSIDE_ADAPTIVE_TARGET: 1 << 9,
});
const GEAR_INDICATIONS = Object.freeze(["UP LOCKED", "UNSAFE", "DOWN LOCKED"]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function enumText(values, value) {
  return values[Math.round(finite(value, 0))] ?? "UNKNOWN";
}

function fieldMap(fields) {
  return new Map(fields.map((field, index) => [field, index]));
}

function rowValue(row, fields, name, fallback = 0) {
  const index = fields.get(name);
  return index === undefined ? fallback : finite(row[index], fallback);
}

function decodeTouchdownAssessment(value) {
  if (!value || typeof value !== "object"
    || typeof value.profile !== "string" || !value.profile.trim()
    || !Number.isInteger(value.version) || value.version <= 0
    || !value.limits || typeof value.limits !== "object") return null;
  const limits = {};
  for (const key of [
    "min_sink_fpm", "hard_sink_fpm", "max_sink_fpm", "max_lineup_m",
    "min_ias_kts", "max_ias_kts", "max_closure_kts", "on_speed_aoa_deg",
    "max_aoa_error_deg",
  ]) {
    if (!Number.isFinite(Number(value.limits[key]))) return null;
    limits[key] = Number(value.limits[key]);
  }
  if (!(limits.min_sink_fpm >= 0
    && limits.min_sink_fpm < limits.hard_sink_fpm
    && limits.hard_sink_fpm < limits.max_sink_fpm
    && limits.max_lineup_m > 0
    && limits.min_ias_kts > 0
    && limits.min_ias_kts < limits.max_ias_kts
    && limits.max_closure_kts > 0
    && limits.max_aoa_error_deg > 0)) return null;

  let adaptiveTarget = null;
  if (value.adaptive_target !== null && value.adaptive_target !== undefined) {
    const adaptive = value.adaptive_target;
    if (!adaptive || typeof adaptive !== "object"
      || !Number.isInteger(adaptive.level) || adaptive.level <= 0) return null;
    for (const key of ["max_sink_fpm", "max_lineup_m", "min_ias_kts", "max_ias_kts"])
      if (!Number.isFinite(Number(adaptive[key]))) return null;
    if (!(adaptive.max_sink_fpm > 0 && adaptive.max_lineup_m > 0
      && adaptive.min_ias_kts > 0 && adaptive.min_ias_kts < adaptive.max_ias_kts)) return null;
    adaptiveTarget = Object.freeze({
      level: adaptive.level,
      maxSinkFpm: Number(adaptive.max_sink_fpm),
      maxLineupM: Number(adaptive.max_lineup_m),
      minIasKts: Number(adaptive.min_ias_kts),
      maxIasKts: Number(adaptive.max_ias_kts),
    });
  }
  return Object.freeze({
    profile: value.profile,
    version: value.version,
    limits: Object.freeze({
      minSinkFpm: limits.min_sink_fpm,
      hardSinkFpm: limits.hard_sink_fpm,
      maxSinkFpm: limits.max_sink_fpm,
      maxLineupM: limits.max_lineup_m,
      minIasKts: limits.min_ias_kts,
      maxIasKts: limits.max_ias_kts,
      maxClosureKts: limits.max_closure_kts,
      onSpeedAoaDeg: limits.on_speed_aoa_deg,
      maxAoaErrorDeg: limits.max_aoa_error_deg,
    }),
    adaptiveTarget,
  });
}

export function decodeIncidentReplay(payload) {
  if (!payload || payload.schema !== SCHEMA || payload.authoritative !== true
    || !Array.isArray(payload.fields) || !Array.isArray(payload.samples)) return null;
  if (payload.samples.length < 2 || payload.samples.length > MAX_SAMPLES) return null;
  const touchdownAssessment = decodeTouchdownAssessment(payload.touchdown_assessment);
  if (!touchdownAssessment) return null;
  const fields = fieldMap(payload.fields);
  for (const required of [
    "t", "tick", "px", "py", "pz", "pfx", "pfy", "pfz", "plx", "ply", "plz",
    "kias", "gs_kts", "sink_fpm", "aoa_deg", "closure_kts", "deck_cross_m",
    "deck_height_m", "cx", "cy", "cz", "carrier_heading_rad", "deck_pitch_deg",
    "gear_handle", "gear_fraction", "gear_locked", "flap_lever", "flap_deg",
    "recovery", "hook", "wire", "terminal", "surface", "event_sequence", "event_type",
    "event_surface", "throttle_command", "engine_power", "gamma_deg", "vertical_speed_fpm",
    "nz", "tx", "ty", "tz", "ax", "ay", "az", "g_demand", "bank_target_deg",
    "rudder", "roll_control", "has_pitch_command", "pitch_command_deg", "gear_nose",
    "gear_left", "gear_right", "gear_nose_indication", "gear_left_indication",
    "gear_right_indication", "flap_left_deg", "flap_right_deg",
    "arrest_failure_reason", "arrest_initial_energy_mj", "arrest_absorbed_energy_mj",
    "arrest_remaining_energy_mj", "arrest_effective_capacity_mj", "arrest_peak_load_kn",
    "arrest_max_line_load_kn", "arrest_initial_closure_kts",
    "carrier_solid", "touchdown_grade", "touchdown_deviations",
    "touchdown_primary_correction",
  ]) if (!fields.has(required)) return null;

  const samples = payload.samples.map((row) => {
    if (!Array.isArray(row)) return null;
    return Object.freeze({
      t: rowValue(row, fields, "t"),
      tick: rowValue(row, fields, "tick"),
      px: rowValue(row, fields, "px"), py: rowValue(row, fields, "py"), pz: rowValue(row, fields, "pz"),
      pfx: rowValue(row, fields, "pfx"), pfy: rowValue(row, fields, "pfy"), pfz: rowValue(row, fields, "pfz"),
      plx: rowValue(row, fields, "plx"), ply: rowValue(row, fields, "ply"), plz: rowValue(row, fields, "plz"),
      kias: rowValue(row, fields, "kias"),
      gsKts: rowValue(row, fields, "gs_kts"),
      sinkFpm: rowValue(row, fields, "sink_fpm"),
      aoaDeg: rowValue(row, fields, "aoa_deg"),
      closureKts: rowValue(row, fields, "closure_kts"),
      deckAlongM: rowValue(row, fields, "deck_along_m"),
      deckCrossM: rowValue(row, fields, "deck_cross_m"),
      deckHeightM: rowValue(row, fields, "deck_height_m"),
      cx: rowValue(row, fields, "cx"), cy: rowValue(row, fields, "cy"), cz: rowValue(row, fields, "cz"),
      carrierHeadingRad: rowValue(row, fields, "carrier_heading_rad"),
      deckPitchDeg: rowValue(row, fields, "deck_pitch_deg"),
      deckLengthM: rowValue(row, fields, "deck_len_m"),
      deckWidthM: rowValue(row, fields, "deck_width_m"),
      gearHandle: rowValue(row, fields, "gear_handle"),
      gearFraction: rowValue(row, fields, "gear_fraction"),
      gearLocked: rowValue(row, fields, "gear_locked") === 1,
      flapLever: rowValue(row, fields, "flap_lever"),
      flapDeg: rowValue(row, fields, "flap_deg"),
      recovery: rowValue(row, fields, "recovery"),
      hook: rowValue(row, fields, "hook"),
      wire: rowValue(row, fields, "wire"),
      terminal: rowValue(row, fields, "terminal"),
      surface: rowValue(row, fields, "surface"),
      eventSequence: rowValue(row, fields, "event_sequence"),
      eventType: rowValue(row, fields, "event_type"),
      eventSurface: rowValue(row, fields, "event_surface"),
      throttleCommand: rowValue(row, fields, "throttle_command"),
      enginePower: rowValue(row, fields, "engine_power"),
      gammaDeg: rowValue(row, fields, "gamma_deg"),
      verticalSpeedFpm: rowValue(row, fields, "vertical_speed_fpm"),
      nz: rowValue(row, fields, "nz"),
      tx: rowValue(row, fields, "tx"), ty: rowValue(row, fields, "ty"), tz: rowValue(row, fields, "tz"),
      ax: rowValue(row, fields, "ax"), ay: rowValue(row, fields, "ay"), az: rowValue(row, fields, "az"),
      gDemand: rowValue(row, fields, "g_demand"),
      bankTargetDeg: rowValue(row, fields, "bank_target_deg"),
      rudder: rowValue(row, fields, "rudder"),
      rollControl: rowValue(row, fields, "roll_control"),
      hasPitchCommand: rowValue(row, fields, "has_pitch_command") === 1,
      pitchCommandDeg: rowValue(row, fields, "pitch_command_deg"),
      gearNose: rowValue(row, fields, "gear_nose"),
      gearLeft: rowValue(row, fields, "gear_left"),
      gearRight: rowValue(row, fields, "gear_right"),
      gearNoseIndication: rowValue(row, fields, "gear_nose_indication"),
      gearLeftIndication: rowValue(row, fields, "gear_left_indication"),
      gearRightIndication: rowValue(row, fields, "gear_right_indication"),
      flapLeftDeg: rowValue(row, fields, "flap_left_deg"),
      flapRightDeg: rowValue(row, fields, "flap_right_deg"),
      arrestFailureReason: rowValue(row, fields, "arrest_failure_reason"),
      arrestInitialEnergyMj: rowValue(row, fields, "arrest_initial_energy_mj"),
      arrestAbsorbedEnergyMj: rowValue(row, fields, "arrest_absorbed_energy_mj"),
      arrestRemainingEnergyMj: rowValue(row, fields, "arrest_remaining_energy_mj"),
      arrestEffectiveCapacityMj: rowValue(row, fields, "arrest_effective_capacity_mj"),
      arrestPeakLoadKn: rowValue(row, fields, "arrest_peak_load_kn"),
      arrestMaxLineLoadKn: rowValue(row, fields, "arrest_max_line_load_kn"),
      arrestInitialClosureKts: rowValue(row, fields, "arrest_initial_closure_kts"),
      carrierSolid: rowValue(row, fields, "carrier_solid"),
      touchdownGrade: rowValue(row, fields, "touchdown_grade"),
      touchdownDeviations: rowValue(row, fields, "touchdown_deviations"),
      touchdownCorrection: rowValue(row, fields, "touchdown_primary_correction"),
    });
  });
  if (samples.some((sample) => sample === null)) return null;
  for (let i = 1; i < samples.length; i += 1) {
    if (samples[i].t <= samples[i - 1].t || samples[i].tick <= samples[i - 1].tick) return null;
  }
  const duration = samples.at(-1).t - samples[0].t;
  if (!(duration > 0) || duration > MAX_DURATION_SECONDS) return null;
  const incidentIndex = Math.round(finite(payload.incident_index, -1));
  if (incidentIndex < 0 || incidentIndex >= samples.length) return null;

  const clip = {
    schema: SCHEMA,
    authoritative: true,
    id: Math.round(finite(payload.id, 0)),
    sampleRateHz: finite(payload.sample_rate_hz, 12),
    arrestmentProfile: typeof payload.arrestment_profile === "string"
      ? payload.arrestment_profile : "UNKNOWN",
    touchdownAssessment,
    incidentIndex,
    samples: Object.freeze(samples),
    startTime: samples[0].t,
    endTime: samples.at(-1).t,
    duration,
  };
  clip.analysis = analyseIncidentReplay(clip);
  return Object.freeze(clip);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

const INTERPOLATED_FIELDS = Object.freeze([
  "px", "py", "pz", "pfx", "pfy", "pfz", "plx", "ply", "plz",
  "kias", "gsKts", "sinkFpm", "aoaDeg", "closureKts", "deckAlongM", "deckCrossM",
  "deckHeightM", "cx", "cy", "cz", "carrierHeadingRad", "deckPitchDeg", "deckLengthM",
  "deckWidthM", "gearFraction", "flapDeg",
  "throttleCommand", "enginePower", "gammaDeg", "verticalSpeedFpm", "nz",
  "tx", "ty", "tz", "ax", "ay", "az",
  "gDemand", "bankTargetDeg", "rudder", "rollControl", "pitchCommandDeg",
  "gearNose", "gearLeft", "gearRight", "flapLeftDeg", "flapRightDeg",
  "arrestInitialEnergyMj", "arrestAbsorbedEnergyMj", "arrestRemainingEnergyMj",
  "arrestEffectiveCapacityMj", "arrestPeakLoadKn", "arrestMaxLineLoadKn",
  "arrestInitialClosureKts",
]);

export function interpolateIncidentReplay(clip, replayTime) {
  if (!clip?.samples?.length) return null;
  const samples = clip.samples;
  const target = Math.max(clip.startTime, Math.min(clip.endTime, finite(replayTime)));
  if (target <= samples[0].t) return samples[0];
  if (target >= samples.at(-1).t) return samples.at(-1);
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].t <= target) low = middle;
    else high = middle;
  }
  const before = samples[low];
  const after = samples[high];
  const amount = (target - before.t) / Math.max(1e-9, after.t - before.t);
  const frame = { ...before, t: target, tick: lerp(before.tick, after.tick, amount) };
  for (const field of INTERPOLATED_FIELDS) frame[field] = lerp(before[field], after[field], amount);
  return frame;
}

function firstSustained(samples, start, end, predicate) {
  for (let i = start; i <= end; i += 1) {
    if (predicate(samples[i]) && (i === end || predicate(samples[i + 1]))) return i;
  }
  // No evidence means no invented early decision marker. Mark the measured event itself until the
  // recorder gains a more specific island/hull/round-down collision subtype.
  return end;
}

function hasDeviation(mask, deviation) {
  return (Math.round(finite(mask)) & deviation) !== 0;
}

function touchdownDeviationLabels(mask) {
  return TOUCHDOWN_DEVIATIONS
    .filter(([flag]) => hasDeviation(mask, flag))
    .map(([, label]) => label);
}

function touchdownTrendPredicate(impact, assessment) {
  const limits = assessment.limits;
  switch (Math.round(impact.touchdownCorrection)) {
    case 1:
      return hasDeviation(impact.touchdownDeviations, DEVIATION.UNSAFE_SINK)
        ? (sample) => sample.sinkFpm > limits.maxSinkFpm : null;
    case 2:
      return hasDeviation(impact.touchdownDeviations, DEVIATION.HARD_SINK)
        ? (sample) => sample.sinkFpm > limits.hardSinkFpm : null;
    case 3:
      return (sample) =>
        (hasDeviation(impact.touchdownDeviations, DEVIATION.SLOW)
            && sample.kias < limits.minIasKts)
        || (hasDeviation(impact.touchdownDeviations, DEVIATION.FAST)
            && sample.kias > limits.maxIasKts)
        || (hasDeviation(impact.touchdownDeviations, DEVIATION.EXCESSIVE_CLOSURE)
            && sample.closureKts > limits.maxClosureKts);
    case 4:
      return hasDeviation(impact.touchdownDeviations, DEVIATION.LINEUP)
        ? (sample) => Math.abs(sample.deckCrossM) > limits.maxLineupM : null;
    case 5:
      if (hasDeviation(impact.touchdownDeviations, DEVIATION.HIGH_AOA))
        return (sample) => sample.aoaDeg
          > limits.onSpeedAoaDeg + limits.maxAoaErrorDeg;
      if (hasDeviation(impact.touchdownDeviations, DEVIATION.LOW_AOA))
        return (sample) => sample.aoaDeg
          < limits.onSpeedAoaDeg - limits.maxAoaErrorDeg;
      return null;
    case 6:
      return hasDeviation(impact.touchdownDeviations, DEVIATION.LOW_SINK)
        ? (sample) => sample.sinkFpm < limits.minSinkFpm : null;
    case 7: {
      const adaptive = assessment.adaptiveTarget;
      if (!adaptive
        || !hasDeviation(impact.touchdownDeviations,
          DEVIATION.OUTSIDE_ADAPTIVE_TARGET)) return null;
      return (sample) => sample.sinkFpm > adaptive.maxSinkFpm
        || Math.abs(sample.deckCrossM) > adaptive.maxLineupM
        || sample.kias < adaptive.minIasKts
        || sample.kias > adaptive.maxIasKts;
    }
    default:
      return null;
  }
}

function touchdownAssessmentCause(impact, assessment) {
  const deviations = touchdownDeviationLabels(impact.touchdownDeviations);
  const limits = assessment.limits;
  const source = `${assessment.profile} v${assessment.version}`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.UNSAFE_SINK))
    return `${source} recorded UNSAFE SINK RATE: ${Math.round(impact.sinkFpm)} ft/min against its ${Math.round(limits.maxSinkFpm)} ft/min maximum`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.HARD_SINK))
    return `${source} recorded HARD SINK RATE: ${Math.round(impact.sinkFpm)} ft/min above its ${Math.round(limits.hardSinkFpm)} ft/min hard-arrival boundary`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.SLOW))
    return `${source} recorded SLOW: ${Math.round(impact.kias)} KIAS below its ${Math.round(limits.minIasKts)} KIAS reference`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.FAST))
    return `${source} recorded FAST: ${Math.round(impact.kias)} KIAS above its ${Math.round(limits.maxIasKts)} KIAS reference`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.EXCESSIVE_CLOSURE))
    return `${source} recorded EXCESSIVE CLOSURE: ${Math.round(impact.closureKts)} kt against its ${Math.round(limits.maxClosureKts)} kt maximum`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.LINEUP))
    return `${source} recorded LINEUP: ${Math.abs(impact.deckCrossM).toFixed(1)} m against its ${limits.maxLineupM.toFixed(1)} m maximum`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.HIGH_AOA)
    || hasDeviation(impact.touchdownDeviations, DEVIATION.LOW_AOA))
    return `${source} recorded ${hasDeviation(impact.touchdownDeviations, DEVIATION.HIGH_AOA) ? "HIGH" : "LOW"} AOA: ${impact.aoaDeg.toFixed(1)}° against its ${limits.onSpeedAoaDeg.toFixed(1)}° datum ±${limits.maxAoaErrorDeg.toFixed(1)}°`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.LOW_SINK))
    return `${source} recorded LOW SINK RATE: ${Math.round(impact.sinkFpm)} ft/min below its ${Math.round(limits.minSinkFpm)} ft/min reference`;
  if (hasDeviation(impact.touchdownDeviations, DEVIATION.OUTSIDE_ADAPTIVE_TARGET))
    return `${source} recorded OUTSIDE ADAPTIVE TARGET at difficulty level ${assessment.adaptiveTarget?.level ?? "unknown"}`;
  return deviations.length > 0
    ? `${source} recorded ${deviations.join(" · ")}`
    : `${source} recorded no touchdown deviation associated with this contact`;
}

function touchdownCorrectionCopy(correction) {
  switch (Math.round(correction)) {
    case 1:
      return "Wave off at the marked point; do not continue an arrival the authoritative assessment has identified as unsafe.";
    case 2:
      return "Add power earlier at the marked point and arrest the sink; wave off if the trend will not converge.";
    case 3:
      return "Stabilise IAS and deck closure at the marked point; wave off rather than forcing an out-of-window arrival.";
    case 4:
      return "Establish lineup earlier at the marked point; wave off if centreline convergence is not assured.";
    case 5:
      return "Fly the recorded on-speed AOA datum at the marked point while controlling flight path with power.";
    case 6:
      return "Fly through without a flare at the marked point; retain the commanded deck-relative descent.";
    case 7:
      return "Meet the recorded adaptive training target at the marked point; it is proficiency feedback, not arresting-gear physics.";
    default:
      return "Use the marked point to compare the stable segment with contact, and make the go/no-go decision while an airborne correction remains.";
  }
}

function carrierContactLabel(sample) {
  const solid = enumText(CARRIER_SOLIDS, sample.carrierSolid);
  if (solid !== "NONE") return solid.toLowerCase();
  return enumText(SURFACES, sample.eventSurface || sample.surface).toLowerCase();
}

function physicalOutcomeFor(samples, impactIndex) {
  const impact = samples[impactIndex];
  const final = samples.at(-1);
  const contacts = [];
  for (let index = impactIndex; index < samples.length; index += 1) {
    const solid = enumText(CARRIER_SOLIDS, samples[index].carrierSolid);
    if (solid !== "NONE" && contacts.at(-1) !== solid) contacts.push(solid);
  }
  const primary = (contacts[0] ?? enumText(SURFACES,
    impact.eventSurface || impact.surface)).toLowerCase();
  const secondary = contacts.slice(1)
    .map((contact) => contact.toLowerCase())
    .filter((contact, index, all) => contact !== primary && all.indexOf(contact) === index);
  const secondaryText = secondary.length > 0
    ? `; secondary ${secondary.join(" then ")} contact` : "";
  const finalSurface = enumText(SURFACES, final.surface).toLowerCase();
  const terminal = enumText(TERMINAL_STATES, final.terminal);
  const settle = terminal === "SIMULATION BOUNDED"
    ? "the explicit numerical guard retained the last integrated state before physical rest"
    : finalSurface === "water" && primary !== "water"
      ? "the wreck then departed the carrier and settled in water"
      : `the wreck settled on ${finalSurface}`;
  return `${primary} impact${secondaryText}; ${settle}`;
}

export function analyseIncidentReplay(clip) {
  const samples = clip.samples;
  const impactIndex = clip.incidentIndex;
  const impact = samples[impactIndex];
  let decisionIndex = Math.max(0, impactIndex - Math.ceil(8 * clip.sampleRateHz));
  let cause;
  let correction;
  const impactSurface = enumText(SURFACES, impact.eventSurface || impact.surface);
  const impactCarrierSolid = enumText(CARRIER_SOLIDS, impact.carrierSolid);
  const arrestmentFailure = enumText(ARRESTMENT_FAILURES, impact.arrestFailureReason);

  if (arrestmentFailure !== "NONE") {
    if (arrestmentFailure === "LINE LOAD EXCEEDED") {
      decisionIndex = impactIndex;
      cause = `${arrestmentFailure}: recorded peak ${impact.arrestPeakLoadKn.toFixed(0)} kN exceeded the profile limit of ${impact.arrestMaxLineLoadKn.toFixed(0)} kN (${clip.arrestmentProfile})`;
      correction = "This fixed-force profile demanded more than its own line-load limit: treat it as an equipment/profile fault, execute the deck-emergency response, and quarantine the configuration for maintenance review. Do not attribute it to pilot technique.";
    } else {
      const safeClosureKts = impact.arrestInitialEnergyMj > 0
        ? impact.arrestInitialClosureKts * Math.sqrt(impact.arrestEffectiveCapacityMj
          / impact.arrestInitialEnergyMj)
        : Number.NaN;
      if (Number.isFinite(safeClosureKts) && safeClosureKts > 0
        && impact.arrestInitialEnergyMj > impact.arrestEffectiveCapacityMj) {
        decisionIndex = firstSustained(samples, decisionIndex, impactIndex,
          (sample) => sample.closureKts > safeClosureKts);
      } else {
        decisionIndex = impactIndex;
      }
      cause = `${arrestmentFailure}: ${impact.arrestAbsorbedEnergyMj.toFixed(2)} MJ absorbed against ${impact.arrestEffectiveCapacityMj.toFixed(2)} MJ effective capacity from ${impact.arrestInitialEnergyMj.toFixed(2)} MJ, leaving ${impact.arrestRemainingEnergyMj.toFixed(2)} MJ (${clip.arrestmentProfile})`;
      correction = Number.isFinite(safeClosureKts) && safeClosureKts > 0
        ? `The arresting engine cannot create capacity for the arriving aircraft. For the recorded mass/profile, the model-derived closure boundary was ${Math.round(safeClosureKts)} kt; stabilise IAS and deck closure before touchdown and wave off while airborne if it cannot be met.`
        : "The arresting engine cannot create capacity for the arriving aircraft. Stabilise IAS and deck closure before touchdown; wave off while airborne if the pass will overrun the fixed capability.";
    }
  } else if (impactSurface === "CARRIER STRUCTURE") {
    decisionIndex = firstSustained(samples, decisionIndex, impactIndex,
      (sample) => sample.deckHeightM < 0 || sample.deckAlongM < -sample.deckLengthM * 0.5);
    const structure = impactCarrierSolid === "ISLAND" ? "carrier island"
      : impactCarrierSolid === "HULL" ? "carrier hull / round-down"
        : "carrier structure";
    cause = `The recorded flight path intersected the ${structure} ${Math.abs(impact.deckAlongM).toFixed(0)} m from deck centre`;
    correction = `Correct the low/short or ${structure} conflict at the marked point; wave off if a safe deck intercept cannot be restored.`;
  } else if (impactSurface === "FLIGHT DECK" && !impact.gearLocked) {
    decisionIndex = firstSustained(samples, decisionIndex, impactIndex,
      (sample) => !sample.gearLocked);
    cause = `Gear was not down and locked at deck contact (${Math.round(impact.gearFraction * 100)}% travel)`;
    correction = "Do not continue to touchdown without the required downlock state; execute the applicable check or wave off while options remain.";
  } else if (impact.touchdownGrade !== 0 || impact.touchdownDeviations !== 0
    || impact.touchdownCorrection !== 0) {
    const trend = touchdownTrendPredicate(impact, clip.touchdownAssessment);
    if (trend) decisionIndex = firstSustained(
      samples, decisionIndex, impactIndex, trend);
    else decisionIndex = impactIndex;
    cause = touchdownAssessmentCause(impact, clip.touchdownAssessment);
    correction = touchdownCorrectionCopy(impact.touchdownCorrection);
  } else {
    cause = `The recorded trajectory ended in ${carrierContactLabel(impact)} contact`;
    correction = "Use the marked point to compare sink, lineup and energy against the stable segment; make the go/no-go decision before the final correction becomes unrecoverable.";
  }

  const physicalOutcome = physicalOutcomeFor(samples, impactIndex);
  const hook = enumText(HOOKS, impact.hook);
  const decision = samples[decisionIndex];
  const chain = [cause];
  chain.push(`At the marked point: power lever ${Math.round(decision.throttleCommand * 100)}%, engine ${Math.round(decision.enginePower * 100)}%, flight path ${decision.gammaDeg.toFixed(1)}°`);
  if (hook !== "NOT CONTACTED") chain.push(`${hook}${impact.wire > 0 ? ` wire ${Math.round(impact.wire)}` : ""}`);
  chain.push(physicalOutcome);

  return Object.freeze({
    classification: "AUTOMATED CAUSAL REVIEW — NOT AN LSO GRADE",
    physicalOutcome,
    touchdownAssessment: Object.freeze({
      profile: clip.touchdownAssessment.profile,
      version: clip.touchdownAssessment.version,
      grade: enumText(TOUCHDOWN_GRADES, impact.touchdownGrade),
      deviations: Object.freeze(touchdownDeviationLabels(
        impact.touchdownDeviations)),
      primaryCorrection: enumText(TOUCHDOWN_CORRECTIONS,
        impact.touchdownCorrection),
    }),
    causalChain: Object.freeze(chain),
    decisionIndex,
    decisionTime: samples[decisionIndex].t,
    correction,
  });
}

export function replayFrameState(liveState, frame) {
  if (!frame) return liveState;
  return {
    ...liveState,
    replay_external: true,
    px: frame.px, py: frame.py, pz: frame.pz,
    pfx: frame.pfx, pfy: frame.pfy, pfz: frame.pfz,
    plx: frame.plx, ply: frame.ply, plz: frame.plz,
    cx: frame.cx, cy: frame.cy, cz: frame.cz,
    tx: frame.tx, ty: frame.ty, tz: frame.tz,
    ax: frame.ax, ay: frame.ay, az: frame.az,
    cheading: frame.carrierHeadingRad,
    deck_pitch_deg: frame.deckPitchDeg,
    deck_len: frame.deckLengthM,
    deck_w: frame.deckWidthM,
    indicated_airspeed_kts: frame.kias,
    ground_speed_kts: frame.gsKts,
    speed_kts: frame.kias,
    sink_rate_fpm: frame.sinkFpm,
    aoa_deg: frame.aoaDeg,
    deck_closure_kts: frame.closureKts,
    deck_along: frame.deckAlongM,
    deck_cross: frame.deckCrossM,
    deck_height: frame.deckHeightM,
    gear_handle: frame.gearHandle === 1 ? "DOWN" : "UP",
    gear_nose: frame.gearNose,
    gear_left: frame.gearLeft,
    gear_right: frame.gearRight,
    flap_left_deg: frame.flapLeftDeg,
    flap_right_deg: frame.flapRightDeg,
    throttle: frame.throttleCommand,
    engine: frame.enginePower,
    gamma_deg: frame.gammaDeg,
    vertical_speed_fpm: frame.verticalSpeedFpm,
    g_actual: frame.nz,
    recovery: enumText(RECOVERIES, frame.recovery).replaceAll(" ", ""),
    arrest_failure_reason: enumText(ARRESTMENT_FAILURES,
      frame.arrestFailureReason).replaceAll(" ", "_"),
    arrest_initial_energy_mj: frame.arrestInitialEnergyMj,
    arrest_absorbed_energy_mj: frame.arrestAbsorbedEnergyMj,
    arrest_remaining_energy_mj: frame.arrestRemainingEnergyMj,
    arrest_effective_capacity_mj: frame.arrestEffectiveCapacityMj,
    arrest_peak_load_kn: frame.arrestPeakLoadKn,
    arrest_max_line_load_kn: frame.arrestMaxLineLoadKn,
    arrest_initial_closure_kts: frame.arrestInitialClosureKts,
    carrier_solid: enumText(CARRIER_SOLIDS, frame.carrierSolid).replaceAll(" ", "_"),
    touchdown_grade: enumText(TOUCHDOWN_GRADES, frame.touchdownGrade),
    touchdown_deviations: touchdownDeviationLabels(frame.touchdownDeviations).join("|"),
    touchdown_primary_correction: enumText(TOUCHDOWN_CORRECTIONS,
      frame.touchdownCorrection),
    hook_outcome: enumText(HOOKS, frame.hook).replaceAll(" ", ""),
    wire: Math.round(frame.wire),
    player_terminal_state: enumText(TERMINAL_STATES, frame.terminal).replaceAll(" ", "_"),
    player_impact_surface: enumText(SURFACES, frame.surface).replaceAll(" ", "_"),
    opponent_body_present: false,
  };
}

export class IncidentReplayController {
  static END_HOLD_SECONDS = 1.25;

  constructor(consumeClip) {
    this.consumeClip = consumeClip;
    this.clip = null;
    this.active = false;
    this.startedAtMs = 0;
    this.lastLoadedId = 0;
  }

  ingest(state, nowMs) {
    const id = Math.round(finite(state?.incident_replay_id, 0));
    if (id <= 0 || id === this.lastLoadedId || state?.incident_replay_available !== true) return false;
    let payload;
    try {
      payload = JSON.parse(this.consumeClip(id));
    } catch {
      this.lastLoadedId = id;
      return false;
    }
    const clip = decodeIncidentReplay(payload);
    this.lastLoadedId = id;
    if (!clip || clip.id !== id) return false;
    this.clip = clip;
    this.start(nowMs);
    return true;
  }

  start(nowMs) {
    if (!this.clip) return false;
    this.startedAtMs = finite(nowMs);
    this.active = true;
    return true;
  }

  stop() {
    this.active = false;
  }

  frame(nowMs) {
    if (!this.active || !this.clip) return null;
    const elapsed = Math.max(0, (finite(nowMs) - this.startedAtMs) / 1000);
    if (elapsed > this.clip.duration + IncidentReplayController.END_HOLD_SECONDS) {
      this.active = false;
      return null;
    }
    const replayTime = this.clip.startTime + Math.min(elapsed, this.clip.duration);
    return interpolateIncidentReplay(this.clip, replayTime);
  }
}

/// One frame of the app-facing replay pipeline. Keeping lifecycle deferral and state substitution
/// here makes the automatic finished-sortie handoff testable without a WebGL or DOM harness.
export function advanceIncidentReplay(controller, liveState, nowMs) {
  controller?.ingest(liveState, nowMs);
  const frame = controller?.frame(nowMs) ?? null;
  return Object.freeze({
    active: frame !== null,
    frame,
    presentedState: replayFrameState(liveState, frame),
    deferFinishedDebrief: liveState?.finished === true && frame !== null,
  });
}

export const incidentReplayLabels = Object.freeze({
  surface: (value) => enumText(SURFACES, value),
  recovery: (value) => enumText(RECOVERIES, value),
  hook: (value) => enumText(HOOKS, value),
  terminal: (value) => enumText(TERMINAL_STATES, value),
  event: (value) => enumText(EVENTS, value),
  arrestmentFailure: (value) => enumText(ARRESTMENT_FAILURES, value),
  carrierSolid: (value) => enumText(CARRIER_SOLIDS, value),
  touchdownGrade: (value) => enumText(TOUCHDOWN_GRADES, value),
  touchdownCorrection: (value) => enumText(TOUCHDOWN_CORRECTIONS, value),
  touchdownDeviations: (value) => touchdownDeviationLabels(value),
  flapLever: (value) => value < 0 ? "UP" : value > 0 ? "DOWN" : "HOLD",
  gearIndication: (value) => enumText(GEAR_INDICATIONS, value),
});

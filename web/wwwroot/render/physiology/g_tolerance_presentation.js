const PHYSIOLOGY_STATES = new Set([
  "NORMAL",
  "STRAINING",
  "GRAYOUT",
  "BLACKOUT",
  "G_LOC",
  "RECOVERING",
  "REDOUT",
]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unit(value, fallback) {
  return Math.min(1, Math.max(0, finiteNumber(value) ?? fallback));
}

function physiologyState(value) {
  if (typeof value !== "string") return "NORMAL";
  const token = value.trim().toUpperCase().replaceAll("-", "_");
  return PHYSIOLOGY_STATES.has(token) ? token : "NORMAL";
}

function cueFor(stage) {
  switch (stage) {
    case "STRAINING":
      return { text: "G STRAIN · MANAGE EXPOSURE", level: "caution" };
    case "GRAYOUT":
      return { text: "VISION NARROWING · UNLOAD", level: "warning" };
    case "BLACKOUT":
    case "G_LOC":
      // A pilot without useful vision cannot read a diagnostic label. Keep the visual channel
      // honestly absent here; recovery and the sortie debrief provide the teaching context.
      return null;
    case "RECOVERING":
      return { text: "RECOVERING · FLY ATTITUDE", level: "caution" };
    case "REDOUT":
      return { text: "RED-OUT · UNLOAD", level: "warning" };
    default:
      return null;
  }
}

/**
 * Convert authoritative pilot physiology into the smallest useful presentation contract.
 *
 * The kernel owns exposure integration and consciousness. This layer never infers G tolerance
 * from the instantaneous G meter; it only renders the continuous retinal/cerebral state supplied
 * by the simulation. At normal physiology it returns `active: false`, leaving no permanent test
 * instrumentation or decorative graphics on screen.
 */
export function gTolerancePresentation(state = {}) {
  const stage = physiologyState(state.pilot_state);
  const peripheralVision = unit(state.pilot_peripheral_vision_01, 1);
  const centralVision = unit(state.pilot_central_vision_01, 1);
  const controlAuthority = unit(state.pilot_control_authority_01, 1);
  const cognitiveCapacity = unit(state.pilot_cognitive_capacity_01, 1);
  const explicitRedout = unit(state.pilot_redout_01, 0);
  const blackout = Math.max(1 - centralVision, stage === "G_LOC" ? 1 : 0);
  const vignette = Math.max(0, 1 - peripheralVision);
  const redout = stage === "REDOUT" ? Math.max(explicitRedout, vignette) : explicitRedout;
  const cue = cueFor(stage);
  const active = stage !== "NORMAL"
    || vignette > 0.002
    || blackout > 0.002
    || redout > 0.002
    || controlAuthority < 0.998
    || cognitiveCapacity < 0.998;

  return Object.freeze({
    active,
    stage,
    vignetteOpacity: vignette,
    blackoutOpacity: blackout,
    redoutOpacity: redout,
    controlAuthority,
    cognitiveCapacity,
    cue,
  });
}

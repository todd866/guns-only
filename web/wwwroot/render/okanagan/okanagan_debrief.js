const TERMINAL_PHASES = new Set(["complete", "failed"]);

const SORTIE_TITLES = Object.freeze({
  "water-circuits": "Water Circuits",
  "fire-attack": "Initial Attack",
  "large-force-employment": "Large Force Employment",
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function whole(value) {
  return Math.max(0, Math.round(finite(value)));
}

function decimal(value, digits = 1) {
  return Math.max(0, finite(value)).toFixed(digits);
}

function fact(id, label, value, tone = "normal") {
  return Object.freeze({ id, label, value, tone });
}

function integerText(value) {
  return whole(value).toLocaleString("en-US");
}

function reserveEvidence(state) {
  const fuelKg = Math.max(0, finite(state?.fuel_kg));
  const minimumKg = Math.max(0, finite(state?.fuel_plan?.minimum_rtb_kg));
  const rawPublishedMargin = state?.fuel_plan?.above_minimum_kg;
  const publishedMargin = rawPublishedMargin == null ? Number.NaN : Number(rawPublishedMargin);
  const marginKg = Number.isFinite(publishedMargin)
    ? publishedMargin
    : fuelKg - minimumKg;
  const protectedReserve = marginKg >= 0;
  return Object.freeze({
    fuelKg,
    minimumKg,
    marginKg,
    protectedReserve,
    copy: protectedReserve
      ? `${integerText(marginKg)} KG above RTB minimum`
      : `${integerText(-marginKg)} KG below RTB minimum`,
  });
}

function nextSortieCorrection({ failed, aircraftNotFlyable, fireMission, drops, cycles, reserve }) {
  if (!reserve.protectedReserve)
    return "Leave the working leg earlier and recover before fuel falls below the RTB minimum.";
  if (aircraftNotFlyable)
    return "Review the final recorded aircraft state before relaunch.";
  if (failed)
    return "Review the final recorded flight path and aircraft state before relaunch.";
  if (fireMission && drops === 0)
    return "Hold the next drop on the marked line until the authority credits effective water.";
  if (fireMission)
    return "Repeat the credited drop profile while protecting the RTB reserve.";
  if (cycles === 0)
    return "Complete one full scoop, drop, and recovery circuit.";
  return "Repeat the circuit and protect the recorded RTB reserve through landing.";
}

export function okanaganMissionTerminal(state = {}) {
  return TERMINAL_PHASES.has(String(state?.phase ?? "").trim().toLowerCase());
}

/**
 * Build the player-facing terminal card exclusively from the published mission snapshot.
 * It deliberately does not infer a crash cause or operational fire outcome the authority does
 * not provide.
 */
export function okanaganDebriefModel(state = {}) {
  if (!okanaganMissionTerminal(state)) return null;

  const sortie = String(state?.sortie ?? "").trim().toLowerCase();
  const sortieTitle = SORTIE_TITLES[sortie] ?? "Fire Boss Sortie";
  const failed = String(state?.phase ?? "").trim().toLowerCase() === "failed";
  const cycles = whole(state?.completed_cycles);
  const drops = whole(state?.effective_drops);
  const effectiveWaterKg = whole(state?.effective_water_kg);
  const reserve = reserveEvidence(state);
  const fireMission = sortie !== "water-circuits";
  const aircraftNotFlyable = state?.flyable === false;
  const aircraftState = aircraftNotFlyable
    ? "NOT FLYABLE"
    : state?.flyable === true ? "FLYABLE" : "NOT REPORTED";

  const summary = failed
    ? `The mission authority recorded the sortie as failed; final fuel was ${integerText(reserve.fuelKg)} KG, ${reserve.copy}.`
    : fireMission
      ? `${drops} effective ${drops === 1 ? "drop" : "drops"} credited with ${integerText(effectiveWaterKg)} KG effective water; final fuel was ${integerText(reserve.fuelKg)} KG, ${reserve.copy}.`
      : `${cycles} water ${cycles === 1 ? "circuit" : "circuits"} recorded; final fuel was ${integerText(reserve.fuelKg)} KG, ${reserve.copy}.`;

  const correction = nextSortieCorrection({
    failed, aircraftNotFlyable, fireMission, drops, cycles, reserve,
  });

  const facts = [
    fact("aircraft", "AIRCRAFT", aircraftState,
      aircraftNotFlyable || aircraftState === "NOT REPORTED" ? "caution" : "normal"),
    fact("score", "SCORE", integerText(state?.score)),
    fact("cycles", "CYCLES", String(cycles)),
    fact("drops", "EFFECTIVE DROPS", String(drops)),
    fact("effective-water", "EFFECTIVE WATER", `${integerText(effectiveWaterKg)} KG`),
    fact("fire-intensity", "FIRE INTENSITY", decimal(state?.fire_intensity, 1)),
    fact("burned-area", "BURNED AREA", `${decimal(state?.burned_area_ha, 2)} HA`),
    fact("population", "POPULATION EXPOSED", integerText(state?.population_exposed)),
    fact("fuel-reserve", "FUEL / RTB MIN", `${whole(reserve.fuelKg)} / ${whole(reserve.minimumKg)} KG`,
      reserve.protectedReserve ? "normal" : "caution"),
  ];

  return Object.freeze({
    failed,
    outcome: failed ? "failed" : "complete",
    kicker: failed ? "RECORDED SORTIE FAILURE" : "RECORDED SORTIE RESULT",
    title: failed ? "Sortie Failed" : `${sortieTitle} Complete`,
    summary,
    correction,
    reserve,
    facts: Object.freeze(facts),
  });
}

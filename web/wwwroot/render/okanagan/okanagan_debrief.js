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
    return "Leave the line earlier.";
  if (aircraftNotFlyable)
    return "Use a serviceable aircraft.";
  if (failed) return "";
  if (fireMission && drops === 0)
    return "Release on the marked line.";
  if (cycles === 0)
    return "Complete one circuit.";
  return "";
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
    ? ""
    : fireMission
      ? drops > 0
        ? `${drops} ${drops === 1 ? "drop" : "drops"} · ${integerText(effectiveWaterKg)} KG water`
        : "No effective drops"
      : cycles > 0
        ? `${cycles} ${cycles === 1 ? "circuit" : "circuits"}`
        : "No complete circuits";

  const correction = nextSortieCorrection({
    failed, aircraftNotFlyable, fireMission, drops, cycles, reserve,
  });

  const facts = [];
  if (aircraftNotFlyable || aircraftState === "NOT REPORTED") {
    facts.push(fact("aircraft", "AIRCRAFT", aircraftState, "caution"));
  }
  if (!failed && whole(state?.score) > 0)
    facts.push(fact("score", "SCORE", integerText(state?.score)));

  // A successful sortie puts its primary accomplishment in the summary. Failed sorties have no
  // summary narration, so retain only non-zero work completed before the failure.
  if (failed && !fireMission && cycles > 0)
    facts.push(fact("cycles", "CYCLES", String(cycles)));
  if (failed && fireMission && drops > 0)
    facts.push(fact("drops", "DROPS", String(drops)));
  if (failed && fireMission && effectiveWaterKg > 0)
    facts.push(fact("effective-water", "WATER", `${integerText(effectiveWaterKg)} KG`));

  if (fireMission) {
    facts.push(fact("fire-intensity", "FIRE INTENSITY", decimal(state?.fire_intensity, 1)));
    if (finite(state?.burned_area_ha) > 0)
      facts.push(fact("burned-area", "BURNED AREA", `${decimal(state?.burned_area_ha, 2)} HA`));
    if (whole(state?.population_exposed) > 0)
      facts.push(fact("population", "POPULATION EXPOSED", integerText(state?.population_exposed)));
  }
  facts.push(fact(
    "fuel-reserve",
    "FUEL / RTB MIN",
    `${whole(reserve.fuelKg)} / ${whole(reserve.minimumKg)} KG`,
    reserve.protectedReserve ? "normal" : "caution",
  ));

  return Object.freeze({
    failed,
    outcome: failed ? "failed" : "complete",
    kicker: sortieTitle.toUpperCase(),
    title: failed ? "Failed" : "Complete",
    summary,
    correction,
    reserve,
    facts: Object.freeze(facts),
  });
}

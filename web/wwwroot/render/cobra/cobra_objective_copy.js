/**
 * Hold the Bridge objective-strip copy.
 *
 * The mission is a conquest: four points change hands, whoever is down on points bleeds
 * tickets, and the side that runs out of tickets loses. The strip used to say
 * "TIP CONTROL FRIENDLY · HOLD 45s" — a promise about a hidden control number that no longer
 * decides anything. Copy that describes a rule the sim does not run is worse than no copy: the
 * owner's verdict was that it is not obvious what to do, and the strip was actively lying.
 *
 * The ladder below is the loop, in the order a pilot needs it:
 *   service the aircraft → depart/ingress → dry gun → losing the valley → break a garrison
 *   → cover a capture → bingo → engage/hold act → all held.
 *
 * The garrison entries are the core: a dug-in garrison freezes a friendly push and only the
 * gunship can break it (CobraGroundWarRuntime — ground units shoot at it and achieve nothing).
 * So "destroy the garrison and the friendlies will take the point" is not flavour, it is the
 * literal mechanism, and it is the one sentence that makes the mission legible.
 *
 * One engine: ownership, capture progress, tickets and unit liveness come from the snapshot.
 * Presentation derives only labels and compact readouts from those published values.
 */

import {
  cobraObjectiveSiteId,
  cobraSiteHasLivingGarrison,
} from "./cobra_objective_site.js?v=341";

// Mirrors CobraGroundWarRuntime.StartingTickets, used ONLY as a floor for the "critically low"
// threshold when the snapshot does not publish a start value. Kept as a floor rather than a
// truth: the largest pool seen this frame also counts, so a sim that raises the starting pool
// cannot make this warning fire late.
const FALLBACK_STARTING_TICKETS = 300;
const CRITICAL_TICKET_FRACTION = 0.2;
// Mirrors CobraGroundWarRuntime.TicketBleedPerSecondPerPoint. Prefer a published rate whenever
// the authority adds one; the projected map model currently retains only sites and tickets.
const FALLBACK_TICKET_BLEED_PER_POINT_PER_SECOND = 0.5;

function normalizedToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fraction(value) {
  const number = finiteNumber(value);
  return number === null ? null : Math.min(1, Math.max(0, number));
}

function percentSuffix(value) {
  const progress = fraction(value);
  return progress !== null && progress > 0 ? ` · ${Math.round(progress * 100)}%` : "";
}

function rotorReadout(turnaround) {
  const publishedFraction = fraction(
    turnaround?.rotor_fraction
      ?? turnaround?.rotor_fraction_01
      ?? turnaround?.main_rotor_fraction
      ?? turnaround?.rotorFraction,
  );
  const rotorRpm = finiteNumber(
    turnaround?.main_rotor_rpm
      ?? turnaround?.rotor_rpm
      ?? turnaround?.mainRotorRpm,
  );
  const nominalRpm = finiteNumber(
    turnaround?.nominal_main_rotor_rpm
      ?? turnaround?.main_rotor_nominal_rpm
      ?? turnaround?.nominalRotorRpm,
  );
  const rotorFraction = publishedFraction ?? (
    Number.isFinite(rotorRpm) && rotorRpm >= 0 && Number.isFinite(nominalRpm) && nominalRpm > 0
      ? fraction(rotorRpm / nominalRpm)
      : null
  );
  return {
    fraction: rotorFraction,
    percent: rotorFraction === null ? null : Math.round(rotorFraction * 100),
    rpm: Number.isFinite(rotorRpm) && rotorRpm >= 0 ? Math.round(rotorRpm) : null,
  };
}

/**
 * Recovery/start copy. This accepts the authority tokens in either snake_case or kebab-case so
 * the objective strip cannot briefly fall back to a stale combat order during a cold-snapshot
 * transition. Unknown phases deliberately return null: an idle/ready turnaround is not an order.
 */
function turnaroundObjectiveCopy(turnaround) {
  if (!turnaround || typeof turnaround !== "object") return null;
  const phase = normalizedToken(turnaround.phase ?? turnaround.state);
  const action = normalizedToken(turnaround.action ?? turnaround.stage);
  const holdProgress = turnaround.hold_progress
    ?? turnaround.action_hold_progress
    ?? turnaround.holdProgress;
  const rotor = rotorReadout(turnaround);
  const lowerCollective = action.includes("lower") && action.includes("collective");
  const releaseAction = action.includes("release");

  switch (phase) {
    case "qualifying":
      return {
        line: "PARKED · COLLECTIVE DOWN",
        detail: "Set collective fully down and settle the damaged bird on the pad",
      };
    case "shutdown":
    case "shutdownrequired":
    case "shutdown-required":
      if (releaseAction) {
        return {
          line: "PARKED · RELEASE E",
          detail: "Release E once to arm the shutdown hold",
        };
      }
      if (lowerCollective) {
        return {
          line: "PARKED · COLLECTIVE DOWN",
          detail: "Lower collective fully before shutting down the damaged bird",
        };
      }
      return {
        line: `HOLD E · SHUT DOWN${percentSuffix(holdProgress)}`,
        detail: "Keep E held — the spare stays locked until this aircraft is shut down",
      };
    case "rotor-coast":
    case "rotorcoast":
    case "rotor-coasting":
    case "rotor-coast/running-down":
    case "running-down": {
      const readout = rotor.percent !== null
        ? ` · ${rotor.percent}%`
        : (rotor.rpm !== null ? ` · ${rotor.rpm} RPM` : "");
      return {
        line: `ENGINE OFF · ROTOR COASTING${readout}`,
        detail: rotor.rpm !== null
          ? `Rotor ${rotor.rpm} RPM — stay clear while the rotor coasts`
          : "Stay clear while the rotor coasts to safe handoff speed",
      };
    }
    case "await-start-release":
    case "awaitstartrelease":
    case "awaiting-start-release":
      return {
        line: "SPARE COLD · RELEASE E",
        detail: "Release E once to arm the spare's starter",
      };
    case "cold":
    case "coldanddark":
    case "cold-and-dark":
      if (lowerCollective) {
        return {
          line: "SPARE COLD · COLLECTIVE DOWN",
          detail: "Lower collective fully before starting the spare",
        };
      }
      return {
        line: `HOLD E · START${percentSuffix(holdProgress)}`,
        detail: "One hold runs the starter, light-off and rotor engagement",
      };
    case "starting": {
      // Authority normally publishes action=starting for the whole assisted sequence. Use the
      // actual Nr fraction to name what the player is hearing rather than inventing a timer.
      const inferredLabel = rotor.fraction !== null && rotor.fraction >= 0.25
        ? "ROTOR"
        : (rotor.fraction !== null && rotor.fraction >= 0.05 ? "LIGHT OFF" : "STARTER");
      const label = action.includes("light")
        ? "LIGHT OFF"
        : (action.includes("rotor") || action.includes("governor")
          ? "ROTOR"
          : (action.includes("starter") ? "STARTER" : inferredLabel));
      const stageProgress = rotor.fraction ?? fraction(holdProgress);
      const suffix = stageProgress === null ? "" : ` · ${Math.round(stageProgress * 100)}%`;
      return {
        line: `${label}${suffix}`,
        detail: rotor.rpm !== null
          ? `Rotor ${rotor.rpm} RPM — controls stay locked until the governor settles`
          : "Controls stay locked until the rotor and governor are ready",
      };
    }
    case "secured":
      return {
        line: "AIRCRAFT SECURED · NO SPARE",
        detail: "Camp Ember has no serviceable Cobra left",
      };
    default:
      return null;
  }
}

function flightNavigationOverlay(actOverlay) {
  const line = String(actOverlay?.line ?? "").toUpperCase();
  return line.startsWith("DEPART") || line.startsWith("INGRESS")
    || line.startsWith("RTB") || line.startsWith("SLOW")
    || line.startsWith("CHECK SINK") || line.startsWith("FLARE")
    || line.startsWith("HOVER") || line.startsWith("SORTIE COMPLETE")
    ? actOverlay
    : null;
}

function formatBleedRate(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Compact conquest truth for the always-visible chart caption. Accepts either the complete
 * authority snapshot, its ground_war block, or the projected tactical-map model. It reads only
 * published ownership and ticket pools — never the legacy hidden `control` number.
 */
export function cobraConquestScoreLine(authoritySnapshot) {
  const war = authoritySnapshot?.ground_war ?? authoritySnapshot;
  const sites = Array.isArray(war?.sites) ? war.sites.filter(Boolean) : [];
  const friendlyTickets = finiteNumber(war?.tickets?.friendly);
  const hostileTickets = finiteNumber(war?.tickets?.hostile);
  if (!sites.length || !Number.isFinite(friendlyTickets) || !Number.isFinite(hostileTickets)) {
    return null;
  }

  const friendlyPoints = sites.filter((site) => site.owner === "friendly").length;
  const hostilePoints = sites.filter((site) => site.owner === "hostile").length;
  const pointMargin = friendlyPoints - hostilePoints;
  if (war.combat_live === false) {
    return `PTS ${friendlyPoints}–${hostilePoints} · TKT ${Math.round(friendlyTickets)}–${Math.round(hostileTickets)} · STAGED`;
  }
  const publishedRate = finiteNumber(war.ticket_bleed_per_second_per_point);
  const perPointRate = Number.isFinite(publishedRate) && publishedRate >= 0
    ? publishedRate
    : FALLBACK_TICKET_BLEED_PER_POINT_PER_SECOND;
  let state = "STALEMATE";
  if (pointMargin < 0) {
    state = `LOSING −${formatBleedRate(Math.abs(pointMargin) * perPointRate)}/S`;
  } else if (pointMargin > 0) {
    state = `WINNING +${formatBleedRate(pointMargin * perPointRate)}/S`;
  }
  return `PTS ${friendlyPoints}–${hostilePoints} · TKT ${Math.round(friendlyTickets)}–${Math.round(hostileTickets)} · ${state}`;
}

/** Whole metres inside 1 km, one decimal of a kilometre beyond it. */
function formatRangeM(rangeM) {
  if (!Number.isFinite(rangeM)) return null;
  if (rangeM < 1_000) return `${Math.round(rangeM)} m`;
  return `${(rangeM / 1_000).toFixed(1)} km`;
}

function siteLabel(site) {
  return String(site?.label ?? site?.id ?? "THE POINT").toUpperCase();
}

/**
 * Any living friendly ground unit inside the site's own published capture radius. Derived
 * strictly from what the sim publishes — positions, factions and the radius are all snapshot
 * fields — so this reads state rather than guessing at it.
 */
function unitsInsideSite(units, site, faction) {
  const radiusM = Number(site?.capture_radius_m);
  const east = Number(site?.x_m);
  const north = Number(site?.z_m);
  if (!Number.isFinite(radiusM) || !Number.isFinite(east) || !Number.isFinite(north)) return [];
  return units.filter((unit) => unit
    && unit.alive
    && unit.faction === faction
    && Number.isFinite(unit.x_m)
    && Number.isFinite(unit.z_m)
    && Math.hypot(unit.x_m - east, unit.z_m - north) <= radiusM);
}

function hasFriendlyPresence(units, site) {
  return unitsInsideSite(units, site, "friendly").length > 0;
}

/** Any living hostile inside the radius — the sim will not insert onto a point that has one. */
function hasHostilePresence(units, site) {
  return unitsInsideSite(units, site, "hostile").length > 0;
}

function rangeToSite(site, player) {
  const east = Number(player?.eastM);
  const north = Number(player?.northM);
  return Number.isFinite(east)
    && Number.isFinite(north)
    && Number.isFinite(site?.x_m)
    && Number.isFinite(site?.z_m)
    ? Math.hypot(site.x_m - east, site.z_m - north)
    : Number.NaN;
}

/**
 * Pre-conquest copy, kept for snapshots with no tickets and no site ownership (an older sim, a
 * fixture, a replay). Returning the old strip beats throwing or blanking.
 */
function legacyObjectiveCopy(war, options) {
  const { selectedTargetId = null, playerHasInteracted = false } = options;
  const defeatThreshold = war.defeat_control_threshold ?? -0.75;
  const defeatPct = Math.round((war.defeat_hold_progress ?? 0) * 100);
  const holdPct = Math.round((war.victory_hold_progress ?? 0) * 100);
  const control = Number(war.control);
  const defeatHold = Number(war.defeat_hold_progress ?? 0);
  const losing = (Number.isFinite(control) && control <= defeatThreshold) || defeatHold > 0;
  const tippingHostile = Number.isFinite(control) && control < -0.25;

  if (losing) {
    if (war.over_fob) {
      return {
        line: `BRIDGE FALLING · ${defeatPct}% · LEAVE THE PAD`,
        detail: "Control is tipping hostile — get back over the fight and put rounds in",
      };
    }
    return {
      line: `BRIDGE FALLING · ${defeatPct}%`,
      detail: "Hostiles own the meter — Tab a mark and hold F before the hold expires",
    };
  }

  if (tippingHostile) {
    if (war.over_fob) {
      return {
        line: "HOSTILES GAINING · RETURN TO FIGHT",
        detail: "The pad will not hold the bridge — fly back to the fight and engage",
      };
    }
    return {
      line: "HOSTILES GAINING · ENGAGE",
      detail: "Tip control back toward friendly before the lose timer starts",
    };
  }

  if (war.ammo_bingo) {
    return {
      line: "BINGO AMMO · CAMP EMBER SOON",
      detail: "Gun can under a fifth — break off for the pad before it runs dry",
    };
  }

  if (options.actOverlay?.line) return options.actOverlay;

  if ((war.victory_hold_progress ?? 0) > 0) {
    return {
      line: `HOLDING FRIENDLY CONTROL · ${holdPct}%`,
      detail: "Keep tipping the fight — do not let hostiles claw it back",
    };
  }

  if (selectedTargetId) {
    return {
      line: "TIP CONTROL FRIENDLY · HOLD 45s",
      detail: "Hold F when GUN ON TARGET — Tab cycles marks",
    };
  }

  if (playerHasInteracted) {
    return {
      line: "TIP CONTROL FRIENDLY · HOLD 45s",
      detail: "Tab a hostile on the nose, then hold F",
    };
  }

  return {
    line: "TIP CONTROL FRIENDLY · HOLD 45s",
    // Owner ruling 2026-08-05: collective follows game convention — W raises, S lowers
    // (the Builds 253-264 real-lever mapping with S=pull is overruled).
    detail: "W collective up · S down · Tab target · hold F gunner",
  };
}

/**
 * @param {object|null} war the snapshot's ground_war block
 * @param {{
 *   selectedTargetId?: string|null,
 *   playerHasInteracted?: boolean,
 *   actOverlay?: { line?: string, detail?: string }|null,
 *   player?: { eastM?: number, northM?: number },
 *   turnaround?: {
 *     phase?: string, state?: string, action?: string, stage?: string,
 *     hold_progress?: number, rotor_fraction?: number, main_rotor_rpm?: number,
 *   }|null,
 * }} [options] `player` is optional: without it the ladder still picks a site, it just cannot
 *   quote a range.
 */
export function cobraObjectiveCopy(war, options = {}) {
  // Servicing owns the aircraft and its controls. Never leave a stale garrison/place label up
  // while the pilot is being asked to shut down or start a different airframe.
  const servicing = turnaroundObjectiveCopy(options.turnaround);
  if (servicing) return servicing;

  // On the ramp and along the ingress path, navigation is the achievable next action. Once the
  // Engage/Hold acts begin, conquest-specific garrison/clear/capture orders take precedence.
  const navigation = flightNavigationOverlay(options.actOverlay);
  if (navigation) return navigation;

  if (!war) return null;

  // 1. A dry gun outranks everything: nothing else on this list is achievable without rounds.
  if (war.ammo_dry) {
    return {
      line: "BINGO / DRY · REARM AT CAMP EMBER",
      detail: "Put the skids on the Camp Ember pad, then return to the fight",
    };
  }

  const sites = Array.isArray(war.sites) ? war.sites.filter(Boolean) : [];
  const units = Array.isArray(war.units) ? war.units.filter(Boolean) : [];
  const ownedSites = sites.filter((site) => site.owner === "friendly" || site.owner === "hostile");
  const friendlyTickets = Number(war.tickets?.friendly);
  const hostileTickets = Number(war.tickets?.hostile);
  const hasTickets = Number.isFinite(friendlyTickets) && Number.isFinite(hostileTickets);
  if (!ownedSites.length && !hasTickets) return legacyObjectiveCopy(war, options);

  const friendlyPoints = ownedSites.filter((site) => site.owner === "friendly").length;
  const hostileSites = ownedSites.filter((site) => site.owner === "hostile");

  // 2. Losing the valley. The ticket pool is the mission clock, and a pilot who cannot see it
  // draining has no way to know the sortie is being lost while they fly a clean gun pass.
  if (hasTickets) {
    const startTickets = Math.max(
      Number(war.tickets?.start) || 0,
      FALLBACK_STARTING_TICKETS,
      friendlyTickets,
      hostileTickets,
    );
    if (friendlyTickets < startTickets * CRITICAL_TICKET_FRACTION) {
      // TICKETS, not points. Points are the four sites on the map and there are never more
      // than four of them; saying "down 240 points" to a pilot looking at a four-point chart
      // is not a rounding error in the copy, it is a different quantity.
      const deficit = Math.max(0, Math.round(hostileTickets - friendlyTickets));
      return {
        line: "LOSING THE VALLEY",
        detail: deficit > 0
          ? `Down ${deficit} tickets — take a hostile point back or the pool runs out`
          : `${Math.round(friendlyTickets)} tickets left — take a hostile point back to stop the bleed`,
      };
    }
  }

  const player = options.player ?? null;
  const objectiveSiteId = cobraObjectiveSiteId({ sites: hostileSites, units, player });
  const objectiveSite = hostileSites.find((site) => site.id === objectiveSiteId) ?? null;

  // 3. The core loop. A hostile point with a living garrison is the only thing on the map that
  // ONLY the gunship can solve, so it is the strip's first affirmative instruction.
  if (objectiveSite && cobraSiteHasLivingGarrison(units, objectiveSite.id)) {
    const site = objectiveSite;
    const rangeM = rangeToSite(site, player);
    const range = formatRangeM(rangeM);
    return {
      line: `DESTROY GARRISON · ${siteLabel(site)}`,
      detail: range
        ? `${range} — kill the garrison and friendlies will take the point`
        : "Kill the garrison and friendlies will take the point",
    };
  }

  // 4. Garrison gone, friendlies moving in: the job changes from breaking a point to covering
  // one, and the strip must say so or the pilot goes hunting elsewhere and loses the capture.
  if (objectiveSite) {
    const site = objectiveSite;
    const progressPct = Math.round(Math.min(1, Math.max(0, Number(site.capture_progress) || 0)) * 100);
    // "Friendlies will take it" is only true if any friendly is actually standing in the
    // radius. Reinforcements hold their own points rather than marching kilometres, so a
    // cleared point far from the line can sit open with nobody near it — and the strip was
    // promising a capture that could not happen while the pilot orbited waiting for it.
    // Three distinct states once the garrison is down, and they ask for different flying.
    if (hasHostilePresence(units, site)) {
      return {
        line: `CLEAR THE POINT · ${siteLabel(site)}`,
        detail: "Hostiles still on it — nothing lands until the point is empty",
      };
    }
    if (!hasFriendlyPresence(units, site)) {
      return {
        line: `LIFT INBOUND · ${siteLabel(site)}`,
        detail: "Point clear — cover it until the squad is on the ground",
      };
    }
    return {
      line: `HOLDING ${siteLabel(site)} · ${progressPct}%`,
      detail: "Keep hostiles off it while friendlies take it",
    };
  }

  if (war.ammo_bingo) {
    return {
      line: "BINGO AMMO · CAMP EMBER SOON",
      detail: "Gun can under a fifth — break off for the pad before it runs dry",
    };
  }

  // Ember Run act spine keeps its old rung: below the fight, above the all-held default.
  if (options.actOverlay?.line) return options.actOverlay;

  // 6. Every point friendly. The hostile pool is now the only thing left to run down, and it is
  // running down on its own — the instruction is to hold what you took.
  const hostileLeft = Number.isFinite(hostileTickets) ? Math.round(hostileTickets) : null;
  return {
    line: hostileLeft === null ? "VALLEY HELD" : `VALLEY HELD · ${hostileLeft} LEFT`,
    detail: friendlyPoints > 0
      ? "Every point is friendly — hold them and the hostile pool bleeds out"
      : "Hold the valley — M opens the map",
  };
}

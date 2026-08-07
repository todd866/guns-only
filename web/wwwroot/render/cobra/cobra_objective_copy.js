/**
 * Hold-the-Bridge objective strip copy.
 *
 * Telemetry from owner sortie web-cobra-1786090836886-dc8wvig0 (Build 271): after a good
 * early gun pass the pilot sat on Camp Ember for ~80 s while control bled −0.25 → −0.79.
 * The strip kept saying "TIP CONTROL FRIENDLY · HOLD 45s" the whole time. Losing and
 * "get off the pad" must outrank the tip-friendly default.
 */

export function cobraObjectiveCopy(war, options = {}) {
  if (!war) return null;

  const {
    selectedTargetId = null,
    playerHasInteracted = false,
  } = options;

  const defeatThreshold = war.defeat_control_threshold ?? -0.75;
  const defeatPct = Math.round((war.defeat_hold_progress ?? 0) * 100);
  const holdPct = Math.round((war.victory_hold_progress ?? 0) * 100);
  const control = Number(war.control);
  const defeatHold = Number(war.defeat_hold_progress ?? 0);
  const losing = (Number.isFinite(control) && control <= defeatThreshold) || defeatHold > 0;
  const tippingHostile = Number.isFinite(control) && control < -0.25;

  if (war.ammo_dry) {
    return {
      line: "BINGO / DRY · REARM AT CAMP EMBER",
      detail: "Put the skids on the Camp Ember pad, then return to the fight",
    };
  }

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

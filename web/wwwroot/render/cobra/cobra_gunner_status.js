/**
 * Play-HUD gunner status copy. Maps the authoritative crew contract (state/reason as serialized
 * by CobraWebBridge) to a single line a pilot can act on; never invents gunner truth.
 */

// "OutOfLimits" → "OUT OF LIMITS". Reasons are bridge enum names in PascalCase.
function reasonLabel(reason) {
  return String(reason).replace(/([a-z0-9])([A-Z])/g, "$1 $2").toUpperCase();
}

export function gunnerStatusText(gunner, war) {
  if (war?.ammo_dry) return "GUN DRY";
  if (!gunner?.selected_target_id) return "GUN —";
  const reason = gunner.reason ?? "";
  switch (gunner.state) {
    case "acquiring":
      return "GUN ACQUIRING";
    case "masked":
      if (reason === "OutOfLimits") return "GUN OUT OF ARC";
      if (reason && reason !== "Masked") return `GUN ${reasonLabel(reason)}`;
      return "GUN MASKED — NO LOS";
    case "outoflimits":
      // The M28A1 authority uses OutOfLimits for azimuth/elevation reach. Call the pilot's
      // correction, not the implementation enum: turn/climb until the mark is back in arc.
      if (!reason || reason === "OutOfLimits") return "GUN OUT OF ARC";
      return `GUN ${reasonLabel(reason)}`;
    case "inhibited":
      if (reason === "FriendlyTarget") return "GUN FRIENDLY";
      if (reason === "TurretUnserviceable") return "GUN UNSERVICEABLE";
      return "GUN INHIBITED";
    case "tracking":
      if (gunner.fire_authorized) return "GUN FIRING";
      if (reason === "ConsentReleased") return "GUN ON TARGET — HOLD F";
      if (reason === "WeaponsSafe") return "GUN SAFE";
      if (reason === "NoBallisticSolution") {
        // Current authority's range gate is explicit. Keep the generic ballistic wording as a
        // distinct fallback for a future solver failure inside that physical range.
        return gunner.target_within_range === false
          ? "GUN OUT OF RANGE"
          : "GUN NO BALLISTIC SOLUTION";
      }
      if (reason === "SightNotCoincident") return "GUN SLEWING";
      return "GUN TRACKING";
    default:
      return "GUN —";
  }
}

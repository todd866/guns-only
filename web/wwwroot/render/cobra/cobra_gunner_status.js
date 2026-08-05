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
    case "outoflimits":
      // Surface the bridge's own reason string. This HUD must never relabel an envelope or
      // geometry problem as MASKED — the pilot's correction (turn/climb into limits versus
      // waiting to unmask) depends on the real reason.
      if (reason) return `GUN ${reasonLabel(reason)}`;
      return gunner.state === "masked" ? "GUN MASKED" : "GUN OUT OF LIMITS";
    case "inhibited":
      if (reason === "FriendlyTarget") return "GUN FRIENDLY";
      if (reason === "TurretUnserviceable") return "GUN UNSERVICEABLE";
      return "GUN INHIBITED";
    case "tracking":
      if (gunner.fire_authorized) return "GUN FIRING";
      if (reason === "ConsentReleased") return "GUN ON TARGET — HOLD F";
      if (reason === "WeaponsSafe") return "GUN SAFE";
      if (reason === "NoBallisticSolution") return "GUN NO SOLUTION";
      if (reason === "SightNotCoincident") return "GUN SLEWING";
      return "GUN TRACKING";
    default:
      return "GUN —";
  }
}

export const RAPIER_PLAYER_PRESENTATION_ID =
  "presentation.vehicle.rapier.public-data-surrogate.v1";

/**
 * Resolve Rapier's sensor-mediated pilot datum without making its exterior visible.
 *
 * Authored assets publish `camera.cockpit` through their descriptor. The procedural v2 fallback
 * predates that registry seam, but carries the same canonical point in `userData.sockets`. Keep the
 * fallback deliberately Rapier-only: every other aircraft retains the compatibility eye used by
 * the existing live camera path.
 */
export function resolveRapierCockpitCameraAnchor({
  playerPresentationId,
  playerExteriorSlot,
  semanticAnchor,
} = {}) {
  if (playerPresentationId !== RAPIER_PLAYER_PRESENTATION_ID || !playerExteriorSlot) return null;

  const authoredAnchor = typeof semanticAnchor === "function"
    ? semanticAnchor(playerExteriorSlot, "camera.cockpit")
    : null;
  if (authoredAnchor) return authoredAnchor;

  return playerExteriorSlot.object?.userData?.sockets?.cockpitCamera ?? null;
}

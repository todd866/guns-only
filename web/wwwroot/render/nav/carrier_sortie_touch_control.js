import {
  CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN,
  carrierSortieRoutePresentation,
} from "./carrier_sortie_route_presentation.js?v=332";

/**
 * Synchronize the contextual touch RTB button from the validated carrier-route presentation.
 * The returned action token can be retained by the app's click integration; null means that the
 * button is not currently authorized to request RTB.
 */
export function syncCarrierSortieTouchRtbControl(button, state = null) {
  const route = carrierSortieRoutePresentation(state);
  const actionToken = route?.phaseToken === "AWAITING_RETURN"
      && route.rtbActionRequired === true
      && route.touchActionToken === CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN
    ? CARRIER_SORTIE_TOUCH_RTB_ACTION_TOKEN
    : null;
  const available = actionToken !== null;

  if (button !== null && (typeof button === "object" || typeof button === "function")) {
    button.hidden = !available;
    button.disabled = !available;
  }

  return actionToken;
}

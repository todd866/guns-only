import { isF22CanopyGlassAirframe } from "../presentation/f22_canopy_glass.js";

// F-22 terrain preparation finishes under Ready. Its first controllable frame uses only
// simulated weather/physiology, never a synthetic cloud to mask asset residency.
export function beginMissionCloudEntry(view, state) {
  if (isF22CanopyGlassAirframe(state)) view?.cancelCloudBreakEntry();
  else view?.beginCloudBreakEntry();
}

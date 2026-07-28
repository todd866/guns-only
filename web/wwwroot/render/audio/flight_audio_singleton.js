// A browser resolves query strings as part of an ES-module identity. Production intentionally
// cache-busts app.js -> flight_audio.js, while hud.js reaches the same module without a query.
// Keep those two import paths on one controller so the user gesture resumes the exact graph which
// the render loop drives. This module itself is imported at one canonical URL by both instances.

const owners = new Map();

function controllerScope(moduleUrl) {
  if (!moduleUrl) return "default";
  const url = new URL(moduleUrl);
  const releaseAlias = [...url.searchParams.keys()]
    .every((key) => key === "v");
  return releaseAlias ? `${url.origin}${url.pathname}` : url.href;
}

export function createSharedFlightAudioFacade(controller, moduleUrl = "") {
  if (!controller || typeof controller !== "object")
    throw new TypeError("flight audio controller is required");
  const scope = controllerScope(moduleUrl);
  if (!owners.has(scope)) owners.set(scope, controller);
  const owner = owners.get(scope);

  return Object.freeze({
    arm(state = null) {
      return owner.arm(state);
    },
    setEnabled(enabled) {
      return owner.setEnabled(enabled);
    },
    isEnabled() {
      return owner.isEnabled();
    },
    diagnostics() {
      return owner.diagnostics();
    },
    update(state, options) {
      return owner.update(state, options);
    },
  });
}

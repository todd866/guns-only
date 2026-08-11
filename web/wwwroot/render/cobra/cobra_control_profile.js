const DEFAULT_BINDINGS = Object.freeze({
  pull: "ArrowDown",
  push: "ArrowUp",
  rollLeft: "ArrowLeft",
  rollRight: "ArrowRight",
  rudderLeft: "KeyA",
  rudderRight: "KeyD",
  powerUp: "KeyW",
  powerDown: "KeyS",
  fire: "KeyF",
});

function binding(bindings, action) {
  const candidate = bindings?.[action];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : DEFAULT_BINDINGS[action];
}

function control(code, direction, motion) {
  return Object.freeze({ code, direction, motion });
}

/**
 * Resolve the Cobra's physical control semantics from the shared remappable key bindings.
 *
 * The fixed-wing action names remain an input-storage detail. Builds 253-264 mapped the
 * "power down" binding (S) to the collective pull on real-lever semantics (the lever comes
 * toward the pilot to raise it). On 2026-08-05 the owner overruled the lever semantics in
 * favour of game convention: "power up" (W by default) is the pull and raises collective;
 * "power down" (S) is the push and lowers it.
 */
export function resolveCobraControlProfile(bindings = {}) {
  return Object.freeze({
    commandFamily: "vertical-lift-pilot",
    // Production is the authentic direct-input path: the profile must never advertise "none"
    // while the pilot seam quietly captures attitude or manufactures a cyclic command.
    assistance: "none",
    collective: Object.freeze({
      pull: control(binding(bindings, "powerUp"), 1, "toward-pilot"),
      push: control(binding(bindings, "powerDown"), -1, "away-from-pilot"),
    }),
    cyclic: Object.freeze({
      forward: control(binding(bindings, "push"), 1, "forward"),
      aft: control(binding(bindings, "pull"), -1, "aft"),
      right: control(binding(bindings, "rollRight"), 1, "right"),
      left: control(binding(bindings, "rollLeft"), -1, "left"),
    }),
    pedals: Object.freeze({
      right: control(binding(bindings, "rudderRight"), 1, "right"),
      left: control(binding(bindings, "rudderLeft"), -1, "left"),
    }),
    fire: Object.freeze({ code: binding(bindings, "fire") }),
  });
}

export const COBRA_CONTROL_PROFILE = resolveCobraControlProfile();

function axis(activeCodes, positiveCode, negativeCode) {
  const positive = activeCodes.has(positiveCode);
  const negative = activeCodes.has(negativeCode);
  return positive === negative ? 0 : positive ? 1 : -1;
}

/**
 * Convert held physical keys into raw, unfiltered pilot intent. The simulation remains responsible
 * for control travel, rotor response and aircraft motion; this layer adds no rate damping, trim,
 * hover hold, coordinated-turn logic or stability assistance.
 */
export function cobraKeyboardControlIntent(
  activeCodes,
  profile = COBRA_CONTROL_PROFILE,
) {
  const held = typeof activeCodes?.has === "function"
    ? activeCodes
    : new Set(activeCodes ?? []);
  return Object.freeze({
    collectiveRate: axis(
      held,
      profile.collective.pull.code,
      profile.collective.push.code,
    ),
    forwardCyclic: axis(
      held,
      profile.cyclic.forward.code,
      profile.cyclic.aft.code,
    ),
    rightCyclic: axis(
      held,
      profile.cyclic.right.code,
      profile.cyclic.left.code,
    ),
    yaw: axis(
      held,
      profile.pedals.right.code,
      profile.pedals.left.code,
    ),
    fire: held.has(profile.fire.code),
  });
}

/**
 * Integrate the keyboard's spring-centred rate demand into a persistent physical lever position.
 * The host must provide the full-travel rate explicitly; this input seam does not invent a climb
 * rate, collective rigging speed or aircraft response.
 */
export function advanceCobraCollectiveLever(
  collective,
  intent,
  deltaSeconds,
  fullTravelPerSecond,
) {
  if (!Number.isFinite(collective) || collective < 0 || collective > 1) {
    throw new RangeError("collective must be finite and within 0..1");
  }
  const collectiveRate = Number(intent?.collectiveRate);
  if (!Number.isFinite(collectiveRate) || collectiveRate < -1 || collectiveRate > 1) {
    throw new RangeError("collectiveRate must be finite and within -1..1");
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new RangeError("deltaSeconds must be finite and non-negative");
  }
  if (!Number.isFinite(fullTravelPerSecond) || fullTravelPerSecond <= 0) {
    throw new RangeError("fullTravelPerSecond must be finite and positive");
  }
  return Math.max(0, Math.min(1,
    collective + collectiveRate * fullTravelPerSecond * deltaSeconds));
}

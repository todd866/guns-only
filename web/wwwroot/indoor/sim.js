const EPSILON = 1e-9;
const MAX_SUBSTEP_SECONDS = 1 / 60;
const DRONE_RADIUS = 0.32;
const DRONE_ACCELERATION = 13.5;
const DRONE_DRAG = 3.8;
const DRONE_MAX_SPEED = 5.4;
const YAW_RATE = 2.2;
const PITCH_RATE = 1.65;
const MAX_PITCH = Math.PI * 0.46;
const PLAYER_PROJECTILE_SPEED = 22;
const HOSTILE_PROJECTILE_SPEED = 10;
const PLAYER_PROJECTILE_TTL = 1.6;
const HOSTILE_PROJECTILE_TTL = 2.2;
const GUN_INTERVAL = 0.14;
const RF_WINDOW_SECONDS = 45;
const FIBER_MAX_LENGTH = 58;
const FIBER_MAX_TENSION = 1;
const RF_STRONG_SIGNAL = 0.75;
const RF_DEGRADED_SIGNAL = 0.45;
const RF_LOST_SIGNAL = 0.12;
const RF_AUTONOMY_ENGAGE_LEVEL = 0.08;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function aabb(minX, minY, minZ, maxX, maxY, maxZ) {
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

/**
 * The renderer-facing source of truth for the fictional Nightglass Annex.
 * Coordinates use metres, +Y is up, and a drone at yaw 0 faces -Z.
 */
export const FACILITY = deepFreeze({
  id: "nightglass-annex",
  name: "Nightglass Annex",
  bounds: aabb(-10, 0, -16, 10, 6, 16),
  startPosition: { x: 0, y: 2, z: 14 },
  relayPosition: { x: 0, y: 1.15, z: 14.9 },
  extractionPosition: { x: 0, y: 2, z: 13.4 },
  walls: [
    { id: "floor", aabb: aabb(-10.3, -0.3, -16.3, 10.3, 0, 16.3) },
    { id: "ceiling", aabb: aabb(-10.3, 6, -16.3, 10.3, 6.3, 16.3) },
    { id: "west-shell", aabb: aabb(-10.3, 0, -16.3, -10, 6, 16.3) },
    { id: "east-shell", aabb: aabb(10, 0, -16.3, 10.3, 6, 16.3) },
    { id: "north-shell", aabb: aabb(-10, 0, -16.3, 10, 6, -16) },
    { id: "south-shell", aabb: aabb(-10, 0, 16, 10, 6, 16.3) },
    { id: "vestibule-left", aabb: aabb(-10, 0, 5.85, -1.5, 6, 6.15) },
    { id: "vestibule-right", aabb: aabb(1.5, 0, 5.85, 10, 6, 6.15) },
    { id: "core-left", aabb: aabb(-10, 0, -5.15, -1.5, 6, -4.85) },
    { id: "core-right", aabb: aabb(1.5, 0, -5.15, 10, 6, -4.85) },
    { id: "atrium-lower-bulkhead", aabb: aabb(-1.8, 0, 0.75, 1.8, 3.55, 1.05) },
    { id: "west-service-spine", aabb: aabb(-6.15, 0, -4.85, -5.85, 3.7, 5.85) },
    { id: "east-service-spine", aabb: aabb(5.85, 0, -4.85, 6.15, 3.7, 5.85) },
  ],
  doors: [
    {
      id: "vestibule-door",
      label: "Vestibule shutter",
      aabb: aabb(-1.5, 0, 5.85, 1.5, 3.65, 6.15),
      initiallyOpen: true,
    },
    {
      id: "core-door",
      label: "Core shutter",
      aabb: aabb(-1.5, 0, -5.15, 1.5, 3.65, -4.85),
      initiallyOpen: false,
    },
  ],
  pathNodes: [
    { id: "ingress", position: { x: 0, y: 2, z: 14 }, cleared: true },
    { id: "vestibule", position: { x: 0, y: 2, z: 8 }, cleared: true },
    { id: "atrium-rise", position: { x: 0, y: 4.35, z: 2.15 }, cleared: true },
    { id: "atrium", position: { x: 0, y: 4.35, z: 0.2 }, cleared: true },
    { id: "core-threshold", position: { x: 0, y: 2.6, z: -4.2 }, cleared: true },
    { id: "archive", position: { x: 0, y: 2, z: -11.5 }, cleared: true },
  ],
  checkpoint: {
    id: "interior-checkpoint",
    label: "Interior checkpoint",
    position: { x: 0, y: 4.35, z: 0.2 },
    radius: 1.4,
  },
  objectiveNodes: [
    {
      id: "security-core-a",
      label: "Security core A",
      position: { x: -2.4, y: 2, z: -11.6 },
      radius: 0.58,
      integrity: 2,
      required: true,
    },
    {
      id: "security-core-b",
      label: "Security core B",
      position: { x: 2.5, y: 2.35, z: -10.4 },
      radius: 0.58,
      integrity: 2,
      required: true,
    },
    {
      id: "command-core",
      label: "Command core",
      position: { x: 0, y: 2.15, z: -13.45 },
      radius: 0.68,
      integrity: 3,
      required: true,
    },
  ],
  sentryDrones: [
    {
      id: "sentry-west",
      position: { x: -3.1, y: 2.25, z: 0.4 },
      radius: 0.38,
      health: 2,
      patrolAxis: { x: 0, y: 0.35, z: 1 },
      patrolAmplitude: 1.35,
      patrolSpeed: 0.72,
      patrolPhase: 0.2,
    },
    {
      id: "sentry-east",
      position: { x: 3.4, y: 2.65, z: -8.2 },
      radius: 0.38,
      health: 2,
      patrolAxis: { x: 1, y: 0.2, z: 0 },
      patrolAmplitude: 1.15,
      patrolSpeed: 0.61,
      patrolPhase: 1.8,
    },
  ],
  snagZones: [
    {
      id: "cable-rack",
      label: "Loose cable rack",
      aabb: aabb(2.3, 0.4, 1.1, 5.55, 3.8, 3.2),
      severity: 0.58,
    },
    {
      id: "service-frame",
      label: "Service frame",
      aabb: aabb(-5.55, 0.5, -3.3, -2.2, 4.2, -1.2),
      severity: 0.54,
    },
  ],
});

function copyVector(vector) {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function copyAabb(value) {
  return { min: copyVector(value.min), max: copyVector(value.max) };
}

function cloneEvent(event) {
  const copy = { ...event };
  if (event.position) copy.position = copyVector(event.position);
  return copy;
}

function cloneState(state) {
  return {
    ...state,
    drone: {
      ...state.drone,
      position: copyVector(state.drone.position),
      velocity: copyVector(state.drone.velocity),
      autonomy: { ...state.drone.autonomy },
    },
    doors: state.doors.map((door) => ({ ...door, aabb: copyAabb(door.aabb) })),
    checkpoint: {
      ...state.checkpoint,
      position: copyVector(state.checkpoint.position),
    },
    objectives: state.objectives.map((objective) => ({
      ...objective,
      position: copyVector(objective.position),
    })),
    hostiles: state.hostiles.map((hostile) => ({
      ...hostile,
      position: copyVector(hostile.position),
      home: copyVector(hostile.home),
      velocity: copyVector(hostile.velocity),
      patrolAxis: copyVector(hostile.patrolAxis),
    })),
    link: {
      ...state.link,
      fiber: {
        ...state.link.fiber,
        relayPosition: copyVector(state.link.fiber.relayPosition),
        trail: state.link.fiber.trail.map(copyVector),
        snaggedZones: [...state.link.fiber.snaggedZones],
      },
      rf: {
        ...state.link.rf,
        relayPosition: copyVector(state.link.rf.relayPosition),
      },
    },
    gun: { ...state.gun },
    projectiles: state.projectiles.map((projectile) => ({
      ...projectile,
      position: copyVector(projectile.position),
      velocity: copyVector(projectile.velocity),
    })),
    events: state.events.map(cloneEvent),
  };
}

function length(vector) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function controlValue(value) {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function moveToward(current, target, maximumDelta) {
  if (current < target) return Math.min(target, current + maximumDelta);
  return Math.max(target, current - maximumDelta);
}

function smoothstep(minimum, maximum, value) {
  const progress = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

function normalized(vector) {
  const magnitude = length(vector);
  if (magnitude <= EPSILON) return { x: 0, y: 0, z: -1 };
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function aimDirection(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * horizontal,
  };
}

function insideAabb(point, box) {
  return point.x >= box.min.x && point.x <= box.max.x
    && point.y >= box.min.y && point.y <= box.max.y
    && point.z >= box.min.z && point.z <= box.max.z;
}

function sphereIntersectsAabb(point, radius, box) {
  const nearestX = clamp(point.x, box.min.x, box.max.x);
  const nearestY = clamp(point.y, box.min.y, box.max.y);
  const nearestZ = clamp(point.z, box.min.z, box.max.z);
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  const dz = point.z - nearestZ;
  return dx * dx + dy * dy + dz * dz < radius * radius - EPSILON;
}

function collisionSolids(state) {
  return [
    ...FACILITY.walls,
    ...state.doors.filter((door) => !door.open),
  ];
}

function collidesAt(position, state) {
  if (position.x < FACILITY.bounds.min.x + DRONE_RADIUS
    || position.x > FACILITY.bounds.max.x - DRONE_RADIUS
    || position.y < FACILITY.bounds.min.y + DRONE_RADIUS
    || position.y > FACILITY.bounds.max.y - DRONE_RADIUS
    || position.z < FACILITY.bounds.min.z + DRONE_RADIUS
    || position.z > FACILITY.bounds.max.z - DRONE_RADIUS) {
    return true;
  }
  return collisionSolids(state)
    .some((solid) => sphereIntersectsAabb(position, DRONE_RADIUS, solid.aabb));
}

function resolveDroneMovement(state, delta) {
  const position = state.drone.position;
  let collisions = 0;
  for (const axis of ["x", "y", "z"]) {
    if (Math.abs(delta[axis]) <= EPSILON) continue;
    const start = position[axis];
    const candidate = copyVector(position);
    candidate[axis] = start + delta[axis];
    if (!collidesAt(candidate, state)) {
      position[axis] = candidate[axis];
      continue;
    }

    let clearFraction = 0;
    let blockedFraction = 1;
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const fraction = (clearFraction + blockedFraction) * 0.5;
      candidate[axis] = start + delta[axis] * fraction;
      if (collidesAt(candidate, state)) blockedFraction = fraction;
      else clearFraction = fraction;
    }
    position[axis] = start + delta[axis] * clearFraction;
    state.drone.velocity[axis] = 0;
    collisions += 1;
  }
  state.drone.collisionCount += collisions;
  return collisions;
}

function segmentAabb(start, end, box) {
  let minimumT = 0;
  let maximumT = 1;
  for (const axis of ["x", "y", "z"]) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) <= EPSILON) {
      if (start[axis] < box.min[axis] || start[axis] > box.max[axis]) return null;
      continue;
    }
    const inverse = 1 / delta;
    let near = (box.min[axis] - start[axis]) * inverse;
    let far = (box.max[axis] - start[axis]) * inverse;
    if (near > far) [near, far] = [far, near];
    minimumT = Math.max(minimumT, near);
    maximumT = Math.min(maximumT, far);
    if (minimumT > maximumT) return null;
  }
  return minimumT;
}

function segmentSphere(start, end, center, radius) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const fx = start.x - center.x;
  const fy = start.y - center.y;
  const fz = start.z - center.z;
  const a = dx * dx + dy * dy + dz * dz;
  if (a <= EPSILON) return null;
  const b = 2 * (fx * dx + fy * dy + fz * dz);
  const c = fx * fx + fy * fy + fz * fz - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  if (near >= 0 && near <= 1) return near;
  if (far >= 0 && far <= 1) return far;
  return null;
}

function hasLineOfSight(state, start, end) {
  for (const solid of collisionSolids(state)) {
    const hit = segmentAabb(start, end, solid.aabb);
    if (hit !== null && hit > EPSILON && hit < 1 - EPSILON) return false;
  }
  return true;
}

function pushEvent(state, type, details = {}) {
  state.eventSequence += 1;
  state.events.push({
    id: state.eventSequence,
    tick: state.tick,
    time: state.time,
    type,
    ...details,
  });
  if (state.events.length > 48) state.events.splice(0, state.events.length - 48);
}

function setFailure(state, reason) {
  if (state.status !== "active") return;
  state.status = "failure";
  state.success = false;
  state.failure = true;
  state.failureReason = reason;
  pushEvent(state, "mission-failed", { reason });
}

function setSuccess(state) {
  if (state.status !== "active") return;
  state.status = "success";
  state.success = true;
  state.failure = false;
  state.failureReason = null;
  pushEvent(state, "mission-complete");
}

function applyDetach(state, reason) {
  if (state.link.mode !== "fiber") return state;
  const detachReason = typeof reason === "string" && reason.length > 0 ? reason : "manual";
  state.link.mode = "rf";
  state.link.fiber.connected = false;
  state.link.fiber.detached = true;
  state.link.fiber.detachReason = detachReason;
  state.link.rf.active = true;
  state.link.rf.survivalTimer = state.link.rf.maxSurvivalTimer;
  state.link.rf.signal = calculateRfSignal(state);
  state.link.rf.lossReason = null;
  pushEvent(state, "fiber-detached", {
    reason: detachReason,
    position: copyVector(state.drone.position),
  });
  updateRfTelemetry(state);
  return state;
}

function calculateRfSignal(state) {
  if (!state.link.rf.active || state.link.rf.relayIntegrity <= 0) return 0;
  const separation = distance(state.drone.position, state.link.rf.relayPosition);
  const rangeFactor = clamp(1 - separation / 43, 0, 1);
  const occlusionFactor = hasLineOfSight(
    state,
    state.link.rf.relayPosition,
    state.drone.position,
  ) ? 1 : 0.58;
  return clamp(
    rangeFactor * occlusionFactor * (state.link.rf.relayIntegrity / 100),
    0,
    1,
  );
}

function signalState(signal) {
  if (signal >= RF_STRONG_SIGNAL) return "strong";
  if (signal >= RF_DEGRADED_SIGNAL) return "degraded";
  if (signal >= RF_LOST_SIGNAL) return "weak";
  return "lost";
}

function videoState(signal) {
  if (signal >= 0.72) return "clear";
  if (signal >= 0.42) return "degraded";
  if (signal >= 0.08) return "choppy";
  return "lost";
}

function nextLiveObjective(state) {
  return state.objectives.find((objective) => objective.required && !objective.destroyed)
    ?? state.objectives.find((objective) => !objective.destroyed)
    ?? null;
}

function signalSeverity(value) {
  return {
    optical: -1,
    strong: 0,
    degraded: 1,
    weak: 2,
    lost: 3,
  }[value] ?? 3;
}

/**
 * Keep the presentation-facing RF and autonomy state derived from one
 * deterministic signal value. Player authority fades continuously while the
 * complementary share is handed to the onboard controller.
 */
function updateRfTelemetry(state) {
  if (state.link.mode === "fiber") return;

  const rf = state.link.rf;
  const previousSignalState = rf.signalState;
  const previousAutonomyActive = state.drone.autonomy.active;
  const signal = state.link.mode === "lost" ? 0 : clamp(rf.signal, 0, 1);
  const nextSignalState = signalState(signal);
  const quality = clamp(signal, 0, 1);
  const authority = state.link.mode === "lost"
    ? 0
    : smoothstep(0.06, 0.82, signal);
  const automationLevel = 1 - authority;
  const target = nextLiveObjective(state);

  rf.signal = signal;
  rf.signalState = nextSignalState;
  rf.videoState = videoState(signal);
  rf.quality = quality;
  state.drone.autonomy.authority = authority;
  state.drone.autonomy.level = automationLevel;
  state.drone.autonomy.active = automationLevel >= RF_AUTONOMY_ENGAGE_LEVEL;
  state.drone.autonomy.mode = state.drone.autonomy.active
    ? (target ? "objective-pursuit" : "stabilize")
    : "standby";
  state.drone.autonomy.targetId = target?.id ?? null;

  if (previousSignalState !== nextSignalState) {
    const previousSeverity = signalSeverity(previousSignalState);
    const nextSeverity = signalSeverity(nextSignalState);
    if (nextSignalState === "lost") {
      pushEvent(state, "rf-lost", {
        reason: rf.lossReason ?? "signal",
        signal,
      });
    } else if (previousSignalState === "optical") {
      if (nextSignalState !== "strong") {
        pushEvent(state, "rf-degraded", {
          signalState: nextSignalState,
          signal,
        });
      }
    } else if (previousSignalState === "lost" || nextSeverity < previousSeverity) {
      pushEvent(state, "rf-recovered", {
        signalState: nextSignalState,
        signal,
      });
    } else {
      pushEvent(state, "rf-degraded", {
        signalState: nextSignalState,
        signal,
      });
    }
  }

  if (!previousAutonomyActive && state.drone.autonomy.active) {
    pushEvent(state, "autonomy-engaged", {
      mode: state.drone.autonomy.mode,
      targetId: state.drone.autonomy.targetId,
      authority,
    });
  } else if (previousAutonomyActive && !state.drone.autonomy.active) {
    pushEvent(state, "autonomy-disengaged", { authority });
  }
}

function loseRfLink(state, reason) {
  if (state.link.mode === "lost") return;
  state.link.mode = "lost";
  state.link.rf.active = false;
  state.link.rf.signal = 0;
  state.link.rf.lossReason = reason;
  updateRfTelemetry(state);
}

function refreshRfLink(state) {
  if (state.link.mode === "rf") {
    if (state.link.rf.relayIntegrity <= 0) {
      loseRfLink(state, "relay-disabled");
      return;
    }
    if (state.link.rf.survivalTimer <= 0) {
      loseRfLink(state, "rf-window-expired");
      return;
    }
    state.link.rf.signal = calculateRfSignal(state);
  }
  if (state.link.mode === "rf" || state.link.mode === "lost") {
    updateRfTelemetry(state);
  }
}

/**
 * Create a fresh, fully serializable indoor mission.
 */
export function createIndoorMission() {
  const initialFiberLength = distance(FACILITY.relayPosition, FACILITY.startPosition);
  return {
    version: 1,
    facilityId: FACILITY.id,
    tick: 0,
    time: 0,
    status: "active",
    success: false,
    failure: false,
    failureReason: null,
    eventSequence: 0,
    drone: {
      position: copyVector(FACILITY.startPosition),
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      radius: DRONE_RADIUS,
      battery: 100,
      ammo: 36,
      integrity: 100,
      collisionCount: 0,
      autonomy: {
        active: false,
        authority: 1,
        level: 0,
        mode: "standby",
        targetId: null,
      },
    },
    doors: FACILITY.doors.map((door) => ({
      id: door.id,
      label: door.label,
      aabb: copyAabb(door.aabb),
      open: door.initiallyOpen,
    })),
    checkpoint: {
      ...FACILITY.checkpoint,
      position: copyVector(FACILITY.checkpoint.position),
      reached: false,
    },
    objectives: FACILITY.objectiveNodes.map((objective) => ({
      ...objective,
      position: copyVector(objective.position),
      maxIntegrity: objective.integrity,
      destroyed: false,
    })),
    hostiles: FACILITY.sentryDrones.map((sentry, index) => ({
      id: sentry.id,
      position: copyVector(sentry.position),
      home: copyVector(sentry.position),
      velocity: { x: 0, y: 0, z: 0 },
      radius: sentry.radius,
      health: sentry.health,
      maxHealth: sentry.health,
      alive: true,
      patrolAxis: copyVector(sentry.patrolAxis),
      patrolAmplitude: sentry.patrolAmplitude,
      patrolSpeed: sentry.patrolSpeed,
      patrolPhase: sentry.patrolPhase,
      fireCooldown: 1.2 + index * 0.35,
    })),
    link: {
      mode: "fiber",
      fiber: {
        connected: true,
        detached: false,
        detachReason: null,
        relayPosition: copyVector(FACILITY.relayPosition),
        deployed: initialFiberLength,
        maxLength: FIBER_MAX_LENGTH,
        tension: 0,
        maxTension: FIBER_MAX_TENSION,
        snags: 0,
        snaggedZones: [],
        trail: [
          copyVector(FACILITY.relayPosition),
          copyVector(FACILITY.startPosition),
        ],
      },
      rf: {
        active: false,
        relayPosition: copyVector(FACILITY.relayPosition),
        relayIntegrity: 100,
        maxSurvivalTimer: RF_WINDOW_SECONDS,
        survivalTimer: RF_WINDOW_SECONDS,
        signal: 0,
        signalState: "optical",
        videoState: "clear",
        quality: 1,
        lossReason: null,
      },
    },
    alert: 0,
    gun: {
      cooldown: 0,
      interval: GUN_INTERVAL,
      shots: 0,
      hits: 0,
    },
    nextProjectileId: 1,
    projectiles: [],
    events: [],
  };
}

/**
 * Switch a mission from its optical umbilical to its finite RF window.
 * The input state is left untouched.
 */
export function detachFiber(state, reason = "manual") {
  const next = cloneState(state);
  return applyDetach(next, reason);
}

function inputAxes(input) {
  const thrust = input?.thrust ?? {};
  const move = input?.move ?? {};
  const worldMove = input?.worldMove ?? {};
  return {
    forward: controlValue(input?.forward ?? thrust.forward ?? move.z),
    right: controlValue(input?.right ?? input?.strafe ?? thrust.right ?? move.x),
    up: controlValue(input?.up ?? input?.lift ?? thrust.up ?? move.y),
    worldX: controlValue(worldMove.x),
    worldY: controlValue(worldMove.y),
    worldZ: controlValue(worldMove.z),
    yaw: controlValue(input?.yaw ?? input?.look?.yaw),
    pitch: controlValue(input?.pitch ?? input?.look?.pitch),
  };
}

function probeDirectionClear(state, direction, probeDistance = 1.15) {
  for (let step = 1; step <= 6; step += 1) {
    const distanceAlongProbe = probeDistance * step / 6;
    if (collidesAt({
      x: state.drone.position.x + direction.x * distanceAlongProbe,
      y: state.drone.position.y + direction.y * distanceAlongProbe,
      z: state.drone.position.z + direction.z * distanceAlongProbe,
    }, state)) {
      return false;
    }
  }
  return true;
}

function safeAutonomyDirection(state, desired) {
  if (probeDirectionClear(state, desired)) return desired;

  const candidates = [
    normalized({ x: desired.x, y: desired.y + 1.15, z: desired.z }),
    normalized({ x: desired.x + 1.15, y: desired.y, z: desired.z }),
    normalized({ x: desired.x - 1.15, y: desired.y, z: desired.z }),
    normalized({ x: desired.x, y: desired.y - 1.15, z: desired.z }),
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
  ];
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (!probeDirectionClear(state, candidate)) continue;
    const progress = candidate.x * desired.x
      + candidate.y * desired.y
      + candidate.z * desired.z;
    // Stable index ordering breaks equal-score ties deterministically.
    const score = progress - Math.abs(candidate.y - desired.y) * 0.025
      - index * 1e-6;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ?? { x: 0, y: 0, z: 0 };
}

function guidanceTarget(state, objective) {
  if (hasLineOfSight(state, state.drone.position, objective.position)) {
    return objective.position;
  }

  const currentObjectiveDistance = distance(state.drone.position, objective.position);
  let selected = null;
  let selectedScore = Infinity;
  for (const node of FACILITY.pathNodes) {
    const nodeObjectiveDistance = distance(node.position, objective.position);
    if (nodeObjectiveDistance >= currentObjectiveDistance - 0.2) continue;
    if (!hasLineOfSight(state, state.drone.position, node.position)) continue;
    const score = nodeObjectiveDistance + distance(state.drone.position, node.position) * 0.18;
    if (score < selectedScore) {
      selected = node.position;
      selectedScore = score;
    }
  }
  return selected ?? objective.position;
}

function angleDifference(target, current) {
  let difference = target - current;
  while (difference > Math.PI) difference -= Math.PI * 2;
  while (difference < -Math.PI) difference += Math.PI * 2;
  return difference;
}

function autonomyAxes(state) {
  const result = {
    forward: 0,
    right: 0,
    up: 0,
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    yaw: 0,
    pitch: 0,
  };
  if (!state.drone.autonomy.active) return result;

  const objective = nextLiveObjective(state);
  if (!objective) {
    result.worldX = clamp(-state.drone.velocity.x / DRONE_MAX_SPEED, -1, 1);
    result.worldY = clamp(-state.drone.velocity.y / DRONE_MAX_SPEED, -1, 1);
    result.worldZ = clamp(-state.drone.velocity.z / DRONE_MAX_SPEED, -1, 1);
    return result;
  }

  const guidance = guidanceTarget(state, objective);
  const guidanceDelta = {
    x: guidance.x - state.drone.position.x,
    y: guidance.y - state.drone.position.y,
    z: guidance.z - state.drone.position.z,
  };
  const guidanceDistance = length(guidanceDelta);
  const desired = safeAutonomyDirection(state, normalized(guidanceDelta));
  const approach = clamp(guidanceDistance / 1.4, 0.22, 1);
  result.worldX = clamp(
    desired.x * approach - state.drone.velocity.x / DRONE_MAX_SPEED * 0.38,
    -1,
    1,
  );
  result.worldY = clamp(
    desired.y * approach - state.drone.velocity.y / DRONE_MAX_SPEED * 0.38,
    -1,
    1,
  );
  result.worldZ = clamp(
    desired.z * approach - state.drone.velocity.z / DRONE_MAX_SPEED * 0.38,
    -1,
    1,
  );

  const objectiveDelta = {
    x: objective.position.x - state.drone.position.x,
    y: objective.position.y - state.drone.position.y,
    z: objective.position.z - state.drone.position.z,
  };
  const objectiveDistance = Math.max(EPSILON, length(objectiveDelta));
  const targetYaw = Math.atan2(objectiveDelta.x, -objectiveDelta.z);
  const targetPitch = Math.asin(clamp(objectiveDelta.y / objectiveDistance, -1, 1));
  result.yaw = clamp(angleDifference(targetYaw, state.drone.yaw) / 0.7, -1, 1);
  result.pitch = clamp((targetPitch - state.drone.pitch) / 0.52, -1, 1);
  return result;
}

function blendAxes(player, automation, authority) {
  const automationLevel = 1 - authority;
  return {
    forward: player.forward * authority,
    right: player.right * authority,
    up: player.up * authority,
    worldX: player.worldX * authority + automation.worldX * automationLevel,
    worldY: player.worldY * authority + automation.worldY * automationLevel,
    worldZ: player.worldZ * authority + automation.worldZ * automationLevel,
    yaw: player.yaw * authority + automation.yaw * automationLevel,
    pitch: player.pitch * authority + automation.pitch * automationLevel,
  };
}

function tryAutonomyDoorInteraction(state) {
  if (!state.drone.autonomy.active) return;
  for (const door of state.doors) {
    if (door.open) continue;
    const center = {
      x: (door.aabb.min.x + door.aabb.max.x) * 0.5,
      y: clamp(state.drone.position.y, door.aabb.min.y, door.aabb.max.y),
      z: (door.aabb.min.z + door.aabb.max.z) * 0.5,
    };
    if (distance(state.drone.position, center) > 2.1) continue;
    door.open = true;
    pushEvent(state, "door-opened", {
      doorId: door.id,
      source: "autonomy",
    });
  }
}

function shouldAutonomyFire(state) {
  if (!state.drone.autonomy.active || !state.drone.autonomy.targetId) return false;
  const target = state.objectives.find(
    (objective) => objective.id === state.drone.autonomy.targetId
      && !objective.destroyed,
  );
  if (!target) return false;

  const targetDelta = {
    x: target.position.x - state.drone.position.x,
    y: target.position.y - state.drone.position.y,
    z: target.position.z - state.drone.position.z,
  };
  const targetDistance = length(targetDelta);
  if (targetDistance > 16 || !hasLineOfSight(state, state.drone.position, target.position)) {
    return false;
  }
  const direction = normalized(targetDelta);
  const aim = aimDirection(state.drone.yaw, state.drone.pitch);
  const alignment = direction.x * aim.x + direction.y * aim.y + direction.z * aim.z;
  return alignment >= 0.995;
}

function tryDoorInteraction(state, input) {
  if (!input?.interact && typeof input?.door !== "string") return;
  let selected = null;
  let selectedDistance = Infinity;
  for (const door of state.doors) {
    if (door.open) continue;
    if (typeof input.door === "string" && input.door !== door.id) continue;
    const center = {
      x: (door.aabb.min.x + door.aabb.max.x) * 0.5,
      y: clamp(state.drone.position.y, door.aabb.min.y, door.aabb.max.y),
      z: (door.aabb.min.z + door.aabb.max.z) * 0.5,
    };
    const separation = distance(state.drone.position, center);
    if (separation <= 2.1 && separation < selectedDistance) {
      selected = door;
      selectedDistance = separation;
    }
  }
  if (selected) {
    selected.open = true;
    pushEvent(state, "door-opened", { doorId: selected.id });
  }
}

function updateCheckpoint(state) {
  if (state.checkpoint.reached) return;
  if (distance(state.drone.position, state.checkpoint.position) > state.checkpoint.radius) return;
  state.checkpoint.reached = true;
  pushEvent(state, "checkpoint-reached", {
    checkpointId: state.checkpoint.id,
    position: copyVector(state.drone.position),
  });
}

function updateFiber(state, previousPosition, collisions, axes, dt) {
  if (state.link.mode !== "fiber") return;
  const fiber = state.link.fiber;
  const travelled = distance(previousPosition, state.drone.position);
  fiber.deployed += travelled;

  const lastTrailPoint = fiber.trail[fiber.trail.length - 1];
  if (distance(lastTrailPoint, state.drone.position) >= 0.52) {
    fiber.trail.push(copyVector(state.drone.position));
    if (fiber.trail.length > 112) fiber.trail.splice(1, fiber.trail.length - 112);
  }

  for (const zone of FACILITY.snagZones) {
    if (fiber.snaggedZones.includes(zone.id)) continue;
    if (!insideAabb(state.drone.position, zone.aabb)) continue;
    fiber.snaggedZones.push(zone.id);
    fiber.snags = fiber.snaggedZones.length;
    fiber.tension = Math.min(fiber.maxTension, fiber.tension + zone.severity);
    pushEvent(state, "fiber-snagged", {
      zoneId: zone.id,
      position: copyVector(state.drone.position),
    });
  }

  const controlLoad = Math.hypot(axes.forward, axes.right, axes.up);
  if (collisions > 0 && controlLoad > 0.2) {
    fiber.tension = Math.min(
      fiber.maxTension,
      fiber.tension + collisions * controlLoad * dt * 1.7,
    );
  } else {
    const speedLoad = length(state.drone.velocity) / DRONE_MAX_SPEED;
    const targetTension = clamp(fiber.snags * 0.39 + speedLoad * 0.13, 0, 0.96);
    fiber.tension = moveToward(
      fiber.tension,
      targetTension,
      dt * (fiber.snags > 0 ? 0.26 : 0.8),
    );
  }

  if (fiber.deployed >= fiber.maxLength) {
    applyDetach(state, "fiber-reel-limit");
  } else if (fiber.tension >= fiber.maxTension - EPSILON) {
    applyDetach(state, "fiber-tension");
  }
}

function spawnPlayerProjectile(state) {
  const direction = aimDirection(state.drone.yaw, state.drone.pitch);
  state.projectiles.push({
    id: state.nextProjectileId,
    owner: "player",
    position: {
      x: state.drone.position.x + direction.x * 0.45,
      y: state.drone.position.y + direction.y * 0.45,
      z: state.drone.position.z + direction.z * 0.45,
    },
    velocity: {
      x: direction.x * PLAYER_PROJECTILE_SPEED + state.drone.velocity.x,
      y: direction.y * PLAYER_PROJECTILE_SPEED + state.drone.velocity.y,
      z: direction.z * PLAYER_PROJECTILE_SPEED + state.drone.velocity.z,
    },
    ttl: PLAYER_PROJECTILE_TTL,
    damage: 1,
  });
  state.nextProjectileId += 1;
  state.drone.ammo -= 1;
  state.gun.cooldown = state.gun.interval;
  state.gun.shots += 1;
  state.alert = clamp(state.alert + 0.32, 0, 1);
  pushEvent(state, "gun-fired", { projectileId: state.nextProjectileId - 1 });
}

function spawnHostileProjectile(state, hostile, target, targetType) {
  const direction = normalized({
    x: target.x - hostile.position.x,
    y: target.y - hostile.position.y,
    z: target.z - hostile.position.z,
  });
  state.projectiles.push({
    id: state.nextProjectileId,
    owner: "hostile",
    sourceId: hostile.id,
    targetType,
    position: {
      x: hostile.position.x + direction.x * 0.48,
      y: hostile.position.y + direction.y * 0.48,
      z: hostile.position.z + direction.z * 0.48,
    },
    velocity: {
      x: direction.x * HOSTILE_PROJECTILE_SPEED,
      y: direction.y * HOSTILE_PROJECTILE_SPEED,
      z: direction.z * HOSTILE_PROJECTILE_SPEED,
    },
    ttl: HOSTILE_PROJECTILE_TTL,
    damage: 12,
  });
  state.nextProjectileId += 1;
  pushEvent(state, "sentry-fired", {
    hostileId: hostile.id,
    target: targetType,
  });
}

function updateHostiles(state, dt) {
  let detected = false;
  const securityAwake = state.checkpoint.reached
    || state.link.mode !== "fiber"
    || state.alert > 0.01
    || state.gun.shots > 0;
  for (let index = 0; index < state.hostiles.length; index += 1) {
    const hostile = state.hostiles[index];
    if (!hostile.alive) continue;
    const previous = copyVector(hostile.position);
    const phase = state.time * hostile.patrolSpeed + hostile.patrolPhase;
    const offset = Math.sin(phase) * hostile.patrolAmplitude;
    hostile.position.x = hostile.home.x + hostile.patrolAxis.x * offset;
    hostile.position.y = hostile.home.y + hostile.patrolAxis.y * offset;
    hostile.position.z = hostile.home.z + hostile.patrolAxis.z * offset;
    hostile.velocity.x = (hostile.position.x - previous.x) / dt;
    hostile.velocity.y = (hostile.position.y - previous.y) / dt;
    hostile.velocity.z = (hostile.position.z - previous.z) / dt;
    hostile.fireCooldown = Math.max(0, hostile.fireCooldown - dt);

    const droneDistance = distance(hostile.position, state.drone.position);
    if (securityAwake
      && droneDistance <= 9.5
      && hasLineOfSight(state, hostile.position, state.drone.position)) {
      detected = true;
    }
  }

  state.alert = clamp(
    state.alert + (detected ? 0.38 : -0.075) * dt,
    0,
    1,
  );

  if (state.alert < 0.42) return;
  for (let index = 0; index < state.hostiles.length; index += 1) {
    const hostile = state.hostiles[index];
    if (!hostile.alive || hostile.fireCooldown > 0) continue;

    let target = state.drone.position;
    let targetType = "drone";
    let targetDistance = distance(hostile.position, target);
    if (state.link.mode === "rf" && state.link.rf.relayIntegrity > 0) {
      const relayDistance = distance(hostile.position, state.link.rf.relayPosition);
      if (relayDistance + 1.5 < targetDistance) {
        target = state.link.rf.relayPosition;
        targetType = "relay";
        targetDistance = relayDistance;
      }
    }

    if (targetDistance <= 15
      && hasLineOfSight(state, hostile.position, target)) {
      spawnHostileProjectile(state, hostile, target, targetType);
      hostile.fireCooldown = 1.15 + index * 0.17;
    }
  }
}

function projectileCollision(state, projectile, start, end) {
  let best = null;
  const consider = (t, kind, target, order) => {
    if (t === null || t < 0 || t > 1) return;
    if (!best || t < best.t - EPSILON
      || (Math.abs(t - best.t) <= EPSILON && order < best.order)) {
      best = { t, kind, target, order };
    }
  };

  for (const solid of collisionSolids(state)) {
    consider(segmentAabb(start, end, solid.aabb), "solid", solid, 0);
  }

  if (projectile.owner === "player") {
    for (const hostile of state.hostiles) {
      if (!hostile.alive) continue;
      consider(
        segmentSphere(start, end, hostile.position, hostile.radius),
        "hostile",
        hostile,
        1,
      );
    }
    for (const objective of state.objectives) {
      if (objective.destroyed) continue;
      consider(
        segmentSphere(start, end, objective.position, objective.radius),
        "objective",
        objective,
        2,
      );
    }
  } else {
    consider(
      segmentSphere(start, end, state.drone.position, state.drone.radius),
      "drone",
      state.drone,
      1,
    );
    if (state.link.mode === "rf" && state.link.rf.relayIntegrity > 0) {
      consider(
        segmentSphere(start, end, state.link.rf.relayPosition, 0.62),
        "relay",
        state.link.rf,
        2,
      );
    }
  }
  return best;
}

function resolveProjectileHit(state, projectile, hit) {
  const impact = {
    x: projectile.position.x + projectile.velocity.x * hit.t,
    y: projectile.position.y + projectile.velocity.y * hit.t,
    z: projectile.position.z + projectile.velocity.z * hit.t,
  };
  if (hit.kind === "solid") {
    pushEvent(state, "projectile-impact", {
      projectileId: projectile.id,
      solidId: hit.target.id,
      position: impact,
    });
    return;
  }

  if (projectile.owner === "player") state.gun.hits += 1;
  if (hit.kind === "hostile") {
    hit.target.health = Math.max(0, hit.target.health - projectile.damage);
    if (hit.target.health <= 0) {
      hit.target.alive = false;
      hit.target.velocity = { x: 0, y: 0, z: 0 };
      pushEvent(state, "hostile-disabled", {
        hostileId: hit.target.id,
        position: impact,
      });
    } else {
      pushEvent(state, "hostile-hit", {
        hostileId: hit.target.id,
        position: impact,
      });
    }
  } else if (hit.kind === "objective") {
    hit.target.integrity = Math.max(0, hit.target.integrity - projectile.damage);
    if (hit.target.integrity <= 0) {
      hit.target.destroyed = true;
      pushEvent(state, "objective-disabled", {
        objectiveId: hit.target.id,
        position: impact,
      });
    } else {
      pushEvent(state, "objective-hit", {
        objectiveId: hit.target.id,
        position: impact,
      });
    }
  } else if (hit.kind === "drone") {
    state.drone.integrity = Math.max(0, state.drone.integrity - projectile.damage);
    pushEvent(state, "drone-hit", { position: impact });
  } else if (hit.kind === "relay") {
    state.link.rf.relayIntegrity = Math.max(
      0,
      state.link.rf.relayIntegrity - projectile.damage,
    );
    pushEvent(state, "relay-hit", { position: impact });
  }
}

function updateProjectiles(state, dt) {
  const survivors = [];
  for (const projectile of state.projectiles) {
    const start = copyVector(projectile.position);
    const end = {
      x: start.x + projectile.velocity.x * dt,
      y: start.y + projectile.velocity.y * dt,
      z: start.z + projectile.velocity.z * dt,
    };
    const hit = projectileCollision(state, projectile, start, end);
    if (hit) {
      const segmentScale = dt * hit.t;
      resolveProjectileHit(state, projectile, { ...hit, t: segmentScale });
      continue;
    }
    projectile.position = end;
    projectile.ttl -= dt;
    if (projectile.ttl > 0) survivors.push(projectile);
  }
  state.projectiles = survivors;
}

function updateTerminalState(state) {
  const requiredObjectives = state.objectives.filter((objective) => objective.required);
  if (requiredObjectives.length > 0
    && requiredObjectives.every((objective) => objective.destroyed)) {
    setSuccess(state);
    return;
  }
  if (state.drone.integrity <= 0) {
    setFailure(state, "drone-disabled");
  } else if (state.drone.battery <= 0) {
    setFailure(state, "battery-depleted");
  }
}

function stepSubstep(state, input, dt, allowOneShotInput) {
  state.tick += 1;
  state.time += dt;

  refreshRfLink(state);
  const playerAxes = inputAxes(input);
  const automation = autonomyAxes(state);
  const axes = blendAxes(
    playerAxes,
    automation,
    state.drone.autonomy.authority,
  );
  state.drone.yaw += axes.yaw * YAW_RATE * dt;
  state.drone.pitch = clamp(
    state.drone.pitch + axes.pitch * PITCH_RATE * dt,
    -MAX_PITCH,
    MAX_PITCH,
  );

  const forward = aimDirection(state.drone.yaw, 0);
  const right = { x: Math.cos(state.drone.yaw), y: 0, z: Math.sin(state.drone.yaw) };
  const acceleration = {
    x: forward.x * axes.forward + right.x * axes.right + axes.worldX,
    y: axes.up + axes.worldY,
    z: forward.z * axes.forward + right.z * axes.right + axes.worldZ,
  };
  const accelerationMagnitude = length(acceleration);
  if (accelerationMagnitude > 1) {
    acceleration.x /= accelerationMagnitude;
    acceleration.y /= accelerationMagnitude;
    acceleration.z /= accelerationMagnitude;
  }

  state.drone.velocity.x += acceleration.x * DRONE_ACCELERATION * dt;
  state.drone.velocity.y += acceleration.y * DRONE_ACCELERATION * dt;
  state.drone.velocity.z += acceleration.z * DRONE_ACCELERATION * dt;
  const damping = Math.exp(-DRONE_DRAG * dt);
  state.drone.velocity.x *= damping;
  state.drone.velocity.y *= damping;
  state.drone.velocity.z *= damping;
  const speed = length(state.drone.velocity);
  if (speed > DRONE_MAX_SPEED) {
    const scale = DRONE_MAX_SPEED / speed;
    state.drone.velocity.x *= scale;
    state.drone.velocity.y *= scale;
    state.drone.velocity.z *= scale;
  }

  const previousPosition = copyVector(state.drone.position);
  const collisions = resolveDroneMovement(state, {
    x: state.drone.velocity.x * dt,
    y: state.drone.velocity.y * dt,
    z: state.drone.velocity.z * dt,
  });
  updateCheckpoint(state);

  if (allowOneShotInput && (input?.detach || input?.detachFiber)) {
    applyDetach(state, "manual");
  }
  updateFiber(state, previousPosition, collisions, axes, dt);
  if (allowOneShotInput) tryDoorInteraction(state, input);
  tryAutonomyDoorInteraction(state);

  const movementLoad = Math.min(1, speed / DRONE_MAX_SPEED);
  const linkLoad = state.link.mode === "rf"
    ? 0.045
    : (state.link.mode === "lost" ? 0.065 : 0.02);
  state.drone.battery = Math.max(
    0,
    state.drone.battery - dt * (0.085 + movementLoad * 0.19 + linkLoad),
  );

  state.gun.cooldown = Math.max(0, state.gun.cooldown - dt);
  const autonomyFire = shouldAutonomyFire(state);
  const playerFire = allowOneShotInput
    && input?.fire
    && state.drone.autonomy.authority > EPSILON;
  if ((playerFire || autonomyFire)
    && state.link.mode !== "fiber"
    && state.gun.cooldown <= EPSILON
    && state.drone.ammo > 0) {
    spawnPlayerProjectile(state);
    if (playerFire && !autonomyFire) {
      state.gun.cooldown = state.gun.interval
        / clamp(state.drone.autonomy.authority, 0.18, 1);
    }
  }

  updateHostiles(state, dt);
  updateProjectiles(state, dt);

  if (state.link.mode === "rf") {
    state.link.rf.survivalTimer = Math.max(
      0,
      state.link.rf.survivalTimer - dt * (1 + state.alert * 0.12),
    );
  }
  refreshRfLink(state);
  updateTerminalState(state);
}

/**
 * Advance a mission. Inputs are local axes in [-1, 1]:
 * { forward, right, up, yaw, pitch, fire, interact, detachFiber }.
 * `thrust`, `move`, `look`, and `worldMove` aliases are also accepted.
 *
 * Large dt values are deterministically subdivided; fixed 1/60 updates avoid
 * any hidden accumulation. The input state is left untouched.
 */
export function stepIndoorMission(state, input = {}, dt = MAX_SUBSTEP_SECONDS) {
  const next = cloneState(state);
  if (next.status !== "active") return next;
  if (!Number.isFinite(dt) || dt <= 0) return next;

  const substeps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP_SECONDS - EPSILON));
  const substepDt = dt / substeps;
  for (let index = 0; index < substeps && next.status === "active"; index += 1) {
    stepSubstep(next, input, substepDt, index === 0);
  }
  return next;
}

function rounded(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return value;
    const result = Math.round(value * 1e6) / 1e6;
    return Object.is(result, -0) ? 0 : result;
  }
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, child] of Object.entries(value)) copy[key] = rounded(child);
    return copy;
  }
  return value;
}

/**
 * Produce a detached, number-normalized snapshot for rendering, replay hashes,
 * and tests. FACILITY remains the shared immutable geometry source.
 */
export function missionSnapshot(state) {
  return rounded({
    version: state.version,
    facilityId: state.facilityId,
    tick: state.tick,
    time: state.time,
    status: state.status,
    success: state.success,
    failure: state.failure,
    failureReason: state.failureReason,
    drone: state.drone,
    doors: state.doors,
    checkpoint: state.checkpoint,
    objectives: state.objectives,
    hostiles: state.hostiles,
    link: state.link,
    alert: state.alert,
    gun: state.gun,
    projectiles: state.projectiles,
    events: state.events,
  });
}

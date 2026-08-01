const finitePositive = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
};

const finiteFraction = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
};

const finiteNonNegative = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
};

const maximumFinite = (...values) => {
  let maximum = Number.NaN;
  for (const value of values) {
    const number = finiteNonNegative(value);
    if (Number.isFinite(number) && (!Number.isFinite(maximum) || number > maximum))
      maximum = number;
  }
  return maximum;
};

export const FRAME_PRESSURE_CLASS = Object.freeze({
  SIMULATION: "simulation",
  TERRAIN: "terrain",
  VIEW_GPU: "view/gpu",
  UNATTRIBUTED: "unattributed",
});

export const FRAME_GOVERNOR_ACTION = Object.freeze({
  REDUCE_SIMULATION_WORK: "reduce-simulation-work",
  REDUCE_TERRAIN_WORK: "reduce-terrain-work",
  REDUCE_VIEW_QUALITY: "reduce-view-quality",
  RESTORE_TERRAIN_WORK: "restore-terrain-work",
  RESTORE_VIEW_QUALITY: "restore-view-quality",
  MEASURE: "measure",
});

// Initial attribution ceilings from docs/graphics-and-60fps-contract.md. They identify an owner;
// the end-to-end foreground frame contract remains authoritative. In particular, `view` is only
// "view/GPU": requestAnimationFrame probes cannot separate GPU execution from compositor time.
export const FRAME_PRESSURE_BUDGET_MS = Object.freeze({
  simulation: 8,
  terrain: 2,
  view: 4,
  gpu: 12,
});

const PRESSURE_CLASSES = Object.freeze(Object.values(FRAME_PRESSURE_CLASS));

const emptyPressureWeights = () => ({
  [FRAME_PRESSURE_CLASS.SIMULATION]: 0,
  [FRAME_PRESSURE_CLASS.TERRAIN]: 0,
  [FRAME_PRESSURE_CLASS.VIEW_GPU]: 0,
  [FRAME_PRESSURE_CLASS.UNATTRIBUTED]: 0,
});

const normalizePressureClass = (value) => {
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase().replaceAll("_", "-");
  if (["sim", "simulation", "ai", "kernel"].includes(token))
    return FRAME_PRESSURE_CLASS.SIMULATION;
  if (["terrain", "stream", "streaming", "terrain/streaming"].includes(token))
    return FRAME_PRESSURE_CLASS.TERRAIN;
  if (["view", "gpu", "render", "renderer", "view/gpu"].includes(token))
    return FRAME_PRESSURE_CLASS.VIEW_GPU;
  if (["unattributed", "unknown", "other", "none"].includes(token))
    return FRAME_PRESSURE_CLASS.UNATTRIBUTED;
  return null;
};

const phaseSource = (context) => {
  const source = context?.phaseMs ?? context?.phases ?? context?.phase_ms;
  return source && typeof source === "object" ? source : {};
};

const nestedSource = (value) => value && typeof value === "object" ? value : {};

/**
 * Classify a late frame from optional phase/load evidence. Explicit ownership wins; otherwise
 * phase cost is normalized by its authored budget and the strongest breached owner wins.
 * Terrain queue state only attributes a high `view` phase when work is actually active/queued.
 * Missing or insufficient evidence stays unattributed instead of guessing at the picture.
 */
export function classifyFramePressure(context = {}) {
  const source = nestedSource(context);
  const explicit = normalizePressureClass(
    source.pressureClass
      ?? source.dominantPressure
      ?? source.dominantPhase
      ?? (typeof source.phase === "string" ? source.phase : null),
  );
  if (explicit) return explicit;

  const phases = phaseSource(source);
  const terrain = nestedSource(source.terrain);
  const load = nestedSource(source.load);
  const simulationMs = maximumFinite(
    source.simMs, source.simulationMs, source.sim_ms, source.sim_ms_max,
    phases.sim, phases.simulation, phases.simMs, phases.sim_ms_max,
  );
  const terrainMs = maximumFinite(
    source.terrainMs, source.terrain_ms, source.terrain_ms_max,
    terrain.ms, terrain.buildMs, terrain.decodeMs,
    phases.terrain, phases.streaming, phases.terrainMs, phases.terrain_ms_max,
  );
  const viewMs = maximumFinite(
    source.viewMs, source.renderMs, source.view_ms, source.view_ms_max,
    phases.view, phases.render, phases.renderer, phases.viewMs, phases.view_ms_max,
  );
  const gpuMs = maximumFinite(
    source.gpuMs, source.gpu_ms, source.gpu_ms_max,
    phases.gpu, phases.gpuMs, phases.gpu_ms_max,
  );
  const terrainLoad = maximumFinite(
    source.terrainQueuedBuilds, source.terrain_queued_builds,
    source.terrainQueuedLoads, source.terrain_queued_loads,
    source.terrainActiveLoads, source.terrain_active_loads,
    terrain.queuedBuilds, terrain.queuedLoads, terrain.activeLoads,
    load.terrainQueuedBuilds, load.terrainQueuedLoads, load.terrainActiveLoads,
  );

  // A breached simulation budget is a veto on visual adaptation unless the caller supplied an
  // explicit different owner above. A slow simulation and slow view can coexist; lowering pixels
  // cannot make the synchronous kernel cheaper, so dual-breach evidence stays with simulation.
  if (simulationMs > FRAME_PRESSURE_BUDGET_MS.simulation) {
    return FRAME_PRESSURE_CLASS.SIMULATION;
  }

  const candidates = [];
  if (terrainMs > FRAME_PRESSURE_BUDGET_MS.terrain) {
    candidates.push({
      pressureClass: FRAME_PRESSURE_CLASS.TERRAIN,
      score: terrainMs / FRAME_PRESSURE_BUDGET_MS.terrain,
      specificity: 3,
    });
  } else if (terrainLoad > 0 && viewMs > FRAME_PRESSURE_BUDGET_MS.view) {
    candidates.push({
      pressureClass: FRAME_PRESSURE_CLASS.TERRAIN,
      score: viewMs / FRAME_PRESSURE_BUDGET_MS.view,
      specificity: 2,
    });
  }
  if (viewMs > FRAME_PRESSURE_BUDGET_MS.view || gpuMs > FRAME_PRESSURE_BUDGET_MS.gpu) {
    candidates.push({
      pressureClass: FRAME_PRESSURE_CLASS.VIEW_GPU,
      score: Math.max(
        Number.isFinite(viewMs) ? viewMs / FRAME_PRESSURE_BUDGET_MS.view : 0,
        Number.isFinite(gpuMs) ? gpuMs / FRAME_PRESSURE_BUDGET_MS.gpu : 0,
      ),
      specificity: 1,
    });
  }

  candidates.sort((left, right) =>
    right.score - left.score || right.specificity - left.specificity);
  return candidates[0]?.pressureClass ?? FRAME_PRESSURE_CLASS.UNATTRIBUTED;
}

/** Return the only action owned by a pressure class. Null is deliberately never returned: an
 * unattributed hitch has a real action too — measure it — but that action changes no quality. */
export function frameGovernorActionForPressure(pressureClass, direction = "shed") {
  const normalized = normalizePressureClass(pressureClass)
    ?? FRAME_PRESSURE_CLASS.UNATTRIBUTED;
  if (normalized === FRAME_PRESSURE_CLASS.SIMULATION)
    return FRAME_GOVERNOR_ACTION.REDUCE_SIMULATION_WORK;
  if (normalized === FRAME_PRESSURE_CLASS.TERRAIN) {
    return direction === "recover"
      ? FRAME_GOVERNOR_ACTION.RESTORE_TERRAIN_WORK
      : FRAME_GOVERNOR_ACTION.REDUCE_TERRAIN_WORK;
  }
  if (normalized === FRAME_PRESSURE_CLASS.VIEW_GPU) {
    return direction === "recover"
      ? FRAME_GOVERNOR_ACTION.RESTORE_VIEW_QUALITY
      : FRAME_GOVERNOR_ACTION.REDUCE_VIEW_QUALITY;
  }
  return FRAME_GOVERNOR_ACTION.MEASURE;
}

const actionChangesVisualQuality = (action) => [
  FRAME_GOVERNOR_ACTION.REDUCE_TERRAIN_WORK,
  FRAME_GOVERNOR_ACTION.REDUCE_VIEW_QUALITY,
].includes(action);

const cleanStatusDetail = (detail) => String(detail ?? "")
  .replace(/(?:\s*[·—-]\s*)?holding\s+60(?:\s*fps)?/gi, "")
  .replace(/(?:\s*[·—-]\s*)?60\s*fps\s+(?:contract\s+missed|unverified)/gi, "")
  .trim();

/**
 * Format governor UI without turning an adaptation into evidence. Only an explicit boolean/0|1
 * foreground-contract verdict may say "holding 60"; absent or malformed evidence is unverified.
 */
export function formatFrameGovernorStatus(detail, contract = {}) {
  const status = contract && typeof contract === "object"
    ? contract.contractPass ?? contract.contract_pass
    : contract;
  const base = cleanStatusDetail(detail);
  const suffix = status === true || status === 1
    ? "holding 60"
    : status === false || status === 0
      ? "60 fps contract missed"
      : "60 fps unverified";
  return base ? `${base} · ${suffix}` : suffix;
}

/// Pure frame-budget policy. Rendering side effects stay in app.js; this class owns only the
/// hysteretic decision about when one quality rung may be shed or restored.
export class FrameGovernorPolicy {
  constructor({
    windowMs = 1000,
    lateFrameMs = 22,
    tripFraction = 0.05,
    recoverFraction = 0.01,
    recoverCleanWindows = 8,
    severeFrameMs = Number.POSITIVE_INFINITY,
    severeFrameCount = 3,
    maxLevel = 4,
  } = {}) {
    this.windowMs = finitePositive(windowMs, 1000);
    this.lateFrameMs = finitePositive(lateFrameMs, 22);
    this.tripFraction = finiteFraction(tripFraction, 0.05);
    // A run of severely late frames sheds immediately instead of waiting out the window: a
    // pilot feels three consecutive ~28 ms frames long before a 1 s late-fraction can trip.
    this.severeFrameMs = Number(severeFrameMs) > this.lateFrameMs
      ? Number(severeFrameMs) : Number.POSITIVE_INFINITY;
    this.severeFrameCount = Math.max(
      1, Math.floor(finitePositive(severeFrameCount, 3)));
    this.recoverFraction = Math.min(
      this.tripFraction,
      finiteFraction(recoverFraction, 0.01),
    );
    this.recoverCleanWindows = Math.max(
      1,
      Math.floor(finitePositive(recoverCleanWindows, 8)),
    );
    this.maxLevel = Math.max(1, Math.floor(finitePositive(maxLevel, 4)));
    this.reset();
  }

  observe(deltaMs, nowMs, context = undefined) {
    if (!Number.isFinite(deltaMs) || !Number.isFinite(nowMs)) return null;
    if (!Number.isFinite(this.windowStartedAt)) this.windowStartedAt = nowMs;
    // `observe(delta, now, maybeContext)` is a common migration shape. Undefined/null must retain
    // the established two-argument policy rather than silently becoming unattributed pressure.
    const contextProvided = context !== null
      && typeof context === "object"
      && !Array.isArray(context);
    this.windowFrames += 1;
    if (deltaMs > this.lateFrameMs) {
      this.lateFrames += 1;
      if (contextProvided) {
        this.windowContextFrames += 1;
        const pressureClass = classifyFramePressure(context);
        this.windowPressureWeights[pressureClass] += Math.max(
          1, deltaMs - this.lateFrameMs,
        );
      }
    }
    this.consecutiveSevereFrames = deltaMs > this.severeFrameMs
      ? this.consecutiveSevereFrames + 1 : 0;
    if (deltaMs > this.severeFrameMs && contextProvided) {
      this.severeContextFrames += 1;
      const pressureClass = classifyFramePressure(context);
      this.severePressureWeights[pressureClass] += Math.max(
        1, deltaMs - this.severeFrameMs,
      );
    } else if (!(deltaMs > this.severeFrameMs)) {
      this.severeContextFrames = 0;
      this.severePressureWeights = emptyPressureWeights();
    }
    if (this.consecutiveSevereFrames >= this.severeFrameCount) {
      const contextual = this.severeContextFrames > 0;
      const pressureClass = contextual
        ? this.#dominantPressure(this.severePressureWeights)
        : FRAME_PRESSURE_CLASS.UNATTRIBUTED;
      this.consecutiveSevereFrames = 0;
      this.windowStartedAt = nowMs;
      this.lateFrames = 0;
      this.windowFrames = 0;
      this.cleanWindows = 0;
      this.windowContextFrames = 0;
      this.windowPressureWeights = emptyPressureWeights();
      this.severeContextFrames = 0;
      this.severePressureWeights = emptyPressureWeights();
      return this.#pressureTransition({
        contextual, pressureClass, lateFraction: 1, severe: true,
      });
    }
    if (nowMs - this.windowStartedAt < this.windowMs) return null;

    const lateFraction = this.windowFrames > 0
      ? this.lateFrames / this.windowFrames : 0;
    this.windowStartedAt = nowMs;
    this.lateFrames = 0;
    this.windowFrames = 0;

    if (lateFraction >= this.tripFraction) {
      this.cleanWindows = 0;
      const contextual = this.windowContextFrames > 0;
      const pressureClass = contextual
        ? this.#dominantPressure(this.windowPressureWeights)
        : FRAME_PRESSURE_CLASS.UNATTRIBUTED;
      this.windowContextFrames = 0;
      this.windowPressureWeights = emptyPressureWeights();
      return this.#pressureTransition({ contextual, pressureClass, lateFraction });
    }

    this.windowContextFrames = 0;
    this.windowPressureWeights = emptyPressureWeights();

    if (lateFraction <= this.recoverFraction) {
      this.cleanWindows = Math.min(
        this.recoverCleanWindows,
        this.cleanWindows + 1,
      );
    } else {
      this.cleanWindows = 0;
    }
    if (this.level <= 0 || this.cleanWindows < this.recoverCleanWindows) return null;

    const previousLevel = this.level;
    this.level -= 1;
    this.cleanWindows = 0;
    const pressureClass = this.qualityPressureStack.pop();
    const transition = {
      direction: "recover",
      previousLevel,
      level: this.level,
      lateFraction,
    };
    if (!pressureClass || pressureClass === "legacy") return Object.freeze(transition);
    const action = frameGovernorActionForPressure(pressureClass, "recover");
    return Object.freeze({
      ...transition,
      pressureClass,
      action,
      qualityAction: action,
    });
  }

  #dominantPressure(weights) {
    let dominant = FRAME_PRESSURE_CLASS.UNATTRIBUTED;
    let maximum = 0;
    for (const pressureClass of PRESSURE_CLASSES) {
      const weight = Number(weights?.[pressureClass]) || 0;
      if (weight > maximum) {
        maximum = weight;
        dominant = pressureClass;
      }
    }
    return dominant;
  }

  #pressureTransition({
    contextual,
    pressureClass,
    lateFraction,
    severe = false,
  }) {
    if (!contextual) {
      if (this.level >= this.maxLevel) return null;
      const previousLevel = this.level;
      this.level += 1;
      this.qualityPressureStack.push("legacy");
      return Object.freeze({
        direction: "shed",
        previousLevel,
        level: this.level,
        lateFraction,
        ...(severe ? { severe: true } : {}),
      });
    }

    const action = frameGovernorActionForPressure(pressureClass);
    if (!actionChangesVisualQuality(action)) {
      return Object.freeze({
        direction: "hold",
        previousLevel: this.level,
        level: this.level,
        lateFraction,
        ...(severe ? { severe: true } : {}),
        pressureClass,
        action,
        qualityAction: null,
      });
    }
    if (this.level >= this.maxLevel) return null;
    const previousLevel = this.level;
    this.level += 1;
    this.qualityPressureStack.push(pressureClass);
    return Object.freeze({
      direction: "shed",
      previousLevel,
      level: this.level,
      lateFraction,
      ...(severe ? { severe: true } : {}),
      pressureClass,
      action,
      qualityAction: action,
    });
  }

  idle(nowMs) {
    this.windowStartedAt = Number.isFinite(nowMs) ? nowMs : 0;
    this.lateFrames = 0;
    this.windowFrames = 0;
    this.cleanWindows = 0;
    this.consecutiveSevereFrames = 0;
    this.windowContextFrames = 0;
    this.windowPressureWeights = emptyPressureWeights();
    this.severeContextFrames = 0;
    this.severePressureWeights = emptyPressureWeights();
  }

  reset(nowMs = Number.NaN) {
    this.level = 0;
    this.windowStartedAt = Number.isFinite(nowMs) ? nowMs : Number.NaN;
    this.lateFrames = 0;
    this.windowFrames = 0;
    this.cleanWindows = 0;
    this.consecutiveSevereFrames = 0;
    this.windowContextFrames = 0;
    this.windowPressureWeights = emptyPressureWeights();
    this.severeContextFrames = 0;
    this.severePressureWeights = emptyPressureWeights();
    this.qualityPressureStack = [];
  }
}

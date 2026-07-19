function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function quantize(value) {
  return Math.round((value + 1e-9) * 100) / 100;
}

/**
 * Frame-time controller with asymmetric recovery. Resolution drops quickly
 * under sustained load and returns slowly, avoiding visible oscillation.
 */
export class AdaptiveResolutionController {
  constructor(options = {}) {
    this.onChange = options.onChange ?? (() => {});
    this.configure(options);
    this.scale = this.maxScale;
    this.mode = options.mode ?? "combat";
    this.width = 1;
    this.height = 1;
    this.devicePixelRatio = 1;
    this.emaFrameMs = null;
    this.samples = 0;
    this.samplesSinceChange = 0;
    this.pixelRatio = 1;
  }

  configure(options = {}) {
    this.enabled = options.enabled !== false;
    this.pixelRatioCap = clamp(finite(options.pixelRatioCap, this.pixelRatioCap ?? 1), 0.5, 4);
    this.minScale = clamp(finite(options.minScale, this.minScale ?? 0.72), 0.5, 1);
    this.maxScale = clamp(finite(options.maxScale, this.maxScale ?? 1), this.minScale, 1);
    this.targetFps = clamp(finite(options.targetFps, this.targetFps ?? 60), 24, 240);
    this.downThreshold = clamp(finite(options.downThreshold, this.downThreshold ?? 1.08), 1, 2);
    this.upThreshold = clamp(finite(options.upThreshold, this.upThreshold ?? 0.82), 0.25, 1);
    this.stepDown = clamp(finite(options.stepDown, this.stepDown ?? 0.08), 0.01, 0.5);
    this.stepUp = clamp(finite(options.stepUp, this.stepUp ?? 0.04), 0.01, 0.5);
    this.smoothing = clamp(finite(options.smoothing, this.smoothing ?? 0.08), 0.01, 1);
    this.warmupSamples = Math.round(clamp(finite(options.warmupSamples, this.warmupSamples ?? 45), 1, 600));
    this.cooldownSamples = Math.round(clamp(finite(options.cooldownSamples, this.cooldownSamples ?? 45), 1, 600));
    this.ignoredFrameMs = clamp(finite(options.ignoredFrameMs, this.ignoredFrameMs ?? 250), 34, 2000);
    this.modeTargetFps = { ...(this.modeTargetFps ?? {}), ...(options.modeTargetFps ?? {}) };
    if (this.scale !== undefined) this.scale = clamp(this.scale, this.minScale, this.maxScale);
    return this;
  }

  get targetFrameMs() {
    const modeFps = finite(this.modeTargetFps[this.mode], this.targetFps);
    return 1000 / clamp(modeFps, 24, 240);
  }

  setMode(mode) {
    if (!mode || mode === this.mode) return false;
    this.mode = mode;
    this.emaFrameMs = null;
    this.samples = 0;
    this.samplesSinceChange = 0;
    return true;
  }

  setViewport(width, height, devicePixelRatio = 1, reason = "resize") {
    this.width = Math.max(1, Math.round(finite(width, 1)));
    this.height = Math.max(1, Math.round(finite(height, 1)));
    this.devicePixelRatio = clamp(finite(devicePixelRatio, 1), 0.5, 8);
    return this.apply(reason);
  }

  reset(scale = this.maxScale, reason = "reset") {
    this.scale = clamp(finite(scale, this.maxScale), this.minScale, this.maxScale);
    this.emaFrameMs = null;
    this.samples = 0;
    this.samplesSinceChange = 0;
    return this.apply(reason);
  }

  apply(reason) {
    const effectiveScale = this.enabled ? this.scale : this.maxScale;
    const next = quantize(Math.min(this.devicePixelRatio, this.pixelRatioCap) * effectiveScale);
    if (next === this.pixelRatio && reason !== "resize") return false;
    this.pixelRatio = next;
    this.onChange(next, {
      reason,
      scale: effectiveScale,
      width: this.width,
      height: this.height,
      emaFrameMs: this.emaFrameMs,
      targetFrameMs: this.targetFrameMs,
    });
    return true;
  }

  /** Samples one completed frame. Long tab/background stalls are ignored. */
  sample(frameMs) {
    if (!this.enabled || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > this.ignoredFrameMs) {
      return { changed: false, pixelRatio: this.pixelRatio, ignored: true };
    }

    this.emaFrameMs = this.emaFrameMs === null
      ? frameMs
      : this.emaFrameMs + (frameMs - this.emaFrameMs) * this.smoothing;
    this.samples++;
    this.samplesSinceChange++;

    if (this.samples < this.warmupSamples || this.samplesSinceChange < this.cooldownSamples) {
      return this.status(false);
    }

    const target = this.targetFrameMs;
    let nextScale = this.scale;
    let reason = null;
    if (this.emaFrameMs > target * this.downThreshold && this.scale > this.minScale) {
      nextScale = quantize(Math.max(this.minScale, this.scale - this.stepDown));
      reason = "sustained-slow-frame";
    } else if (this.emaFrameMs < target * this.upThreshold && this.scale < this.maxScale) {
      nextScale = quantize(Math.min(this.maxScale, this.scale + this.stepUp));
      reason = "sustained-fast-frame";
    }

    if (!reason || nextScale === this.scale) return this.status(false);
    this.scale = nextScale;
    this.samplesSinceChange = 0;
    const changed = this.apply(reason);
    return this.status(changed, reason);
  }

  status(changed = false, reason = null) {
    return {
      changed,
      reason,
      pixelRatio: this.pixelRatio,
      scale: this.scale,
      emaFrameMs: this.emaFrameMs,
      targetFrameMs: this.targetFrameMs,
      samples: this.samples,
      ignored: false,
    };
  }
}

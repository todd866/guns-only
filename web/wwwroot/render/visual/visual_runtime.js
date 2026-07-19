import { Fog, FogExp2, Vector2 } from "../../vendor/three.module.js";
import { AdaptiveResolutionController } from "./adaptive_resolution.js";
import { loadVisualProfile, normalizeVisualProfile } from "./profile.js";
import { createThreeR160PostStack } from "./post_stack.js";
import {
  applyTexelStabilizedDirectionalShadow,
  shadowHalfExtentForMode,
} from "./shadow_stabilizer.js";

function detectDeviceClass(options = {}) {
  if (options.deviceClass) return options.deviceClass;
  const coarse = globalThis.matchMedia?.("(pointer: coarse)")?.matches === true;
  const narrow = (globalThis.innerWidth ?? 1920) <= 900;
  return coarse && narrow ? "mobile" : "desktop";
}

function viewportFor(renderer, options) {
  const size = renderer.getSize?.(new Vector2()) ?? { width: 1, height: 1 };
  return {
    width: Math.max(1, Math.round(options.width ?? renderer.domElement?.clientWidth ?? size.width ?? size.x ?? 1)),
    height: Math.max(1, Math.round(options.height ?? renderer.domElement?.clientHeight ?? size.height ?? size.y ?? 1)),
    devicePixelRatio: Math.max(0.5, options.devicePixelRatio ?? globalThis.devicePixelRatio ?? renderer.getPixelRatio?.() ?? 1),
  };
}

function snapshotLight(light) {
  if (!light) return null;
  return {
    intensity: light.intensity,
    color: light.color?.clone?.(),
    castShadow: light.castShadow,
    shadowMapSize: light.shadow?.mapSize?.clone?.(),
  };
}

function restoreLight(light, state) {
  if (!light || !state) return;
  light.intensity = state.intensity;
  if (state.color) light.color.copy(state.color);
  light.castShadow = state.castShadow;
  if (state.shadowMapSize && light.shadow?.mapSize) {
    if (!light.shadow.mapSize.equals(state.shadowMapSize)) {
      light.shadow.mapSize.copy(state.shadowMapSize);
      light.shadow.map?.dispose();
      light.shadow.map = null;
    }
  }
}

/**
 * Owns the renderer-facing lifecycle for one normalized visual profile while
 * leaving game simulation, camera selection, and authored environment/effects
 * implementations behind injected adapters.
 */
export class VisualRuntime {
  constructor(options) {
    if (!options?.renderer || !options.scene || !options.camera || !options.profile || !options.config) {
      throw new TypeError("VisualRuntime requires renderer, scene, camera, profile, and normalized config.");
    }
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.profile = options.profile;
    this.profileUrl = options.profileUrl ?? null;
    this.config = options.config;
    this.options = options;
    this.lights = options.lights ?? {};
    this.mode = options.mode ?? "combat";
    this.elapsedSeconds = 0;
    this.disposed = false;
    this.initialized = false;
    this.onDiagnostic = options.onDiagnostic ?? (() => {});
    this.viewport = viewportFor(this.renderer, options);
    this.adapters = {};
    this.original = {
      fog: this.scene.fog,
      outputColorSpace: this.renderer.outputColorSpace,
      toneMapping: this.renderer.toneMapping,
      toneMappingExposure: this.renderer.toneMappingExposure,
      pixelRatio: this.renderer.getPixelRatio?.() ?? 1,
      ambient: snapshotLight(this.lights.ambient),
      sun: snapshotLight(this.lights.sun),
    };
  }

  async initialize() {
    if (this.initialized) return this;
    this._applyProfileState();
    const initialPixelRatio = Math.min(
      this.viewport.devicePixelRatio,
      this.config.renderer.pixelRatioCap,
    );
    this._setRendererSize(initialPixelRatio);

    const createPostStack = this.options.postStackFactory ?? createThreeR160PostStack;
    this.postStack = createPostStack({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      config: this.config,
      width: this.viewport.width,
      height: this.viewport.height,
      pixelRatio: initialPixelRatio,
      capabilities: this.options.postCapabilities,
      onDiagnostic: this.onDiagnostic,
    });
    if (!this.postStack?.render) {
      throw new TypeError("postStackFactory must return an object with render().");
    }

    const adaptive = this.config.adaptiveResolution;
    this.adaptiveResolution = new AdaptiveResolutionController({
      ...adaptive,
      enabled: adaptive.enabled && this.options.adaptiveResolution !== false,
      pixelRatioCap: this.config.renderer.pixelRatioCap,
      mode: this.mode,
      onChange: (pixelRatio, metadata) => {
        this._setRendererSize(pixelRatio);
        this.postStack?.setSize?.(this.viewport.width, this.viewport.height, pixelRatio);
        this.options.onResolutionChange?.(pixelRatio, metadata);
      },
    });
    this.adaptiveResolution.setViewport(
      this.viewport.width,
      this.viewport.height,
      this.viewport.devicePixelRatio,
    );

    for (const [name, factory] of [
      ["environment", this.options.environmentFactory],
      ["effects", this.options.effectsFactory],
    ]) {
      if (!factory) continue;
      this.adapters[name] = await factory(this.context());
    }
    this.initialized = true;
    this._applyShadowMode();
    return this;
  }

  context(extra = {}) {
    return {
      runtime: this,
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      profile: this.profile,
      profileUrl: this.profileUrl,
      config: this.config,
      qualityTier: this.config.tier,
      mode: this.mode,
      viewport: { ...this.viewport },
      ...extra,
    };
  }

  _applyProfileState() {
    const renderer = this.config.renderer;
    // The post stack applies the exact Three constants; these values cover an
    // injected/test post stack and exposure is always useful immediately.
    this.renderer.toneMappingExposure = renderer.exposure;
    if (this.options.manageFog !== false) {
      const fog = this.config.environment.fog;
      if (fog.mode === "linear") this.scene.fog = new Fog(fog.color, fog.nearMetres, fog.farMetres);
      else if (fog.mode === "exponential") this.scene.fog = new FogExp2(fog.color, fog.density);
      else this.scene.fog = null;
    }

    const lighting = this.config.environment.lighting;
    if (this.lights.ambient) this.lights.ambient.intensity = lighting.ambientIntensity;
    if (this.lights.sun) {
      this.lights.sun.intensity = lighting.sunIntensity;
      this.lights.sun.color?.set?.(lighting.sunColor);
      const size = this.config.tier.settings.shadowMapSize;
      if (size > 0 && this.lights.sun.shadow?.mapSize && this.lights.sun.shadow.mapSize.x !== size) {
        this.lights.sun.shadow.mapSize.set(size, size);
        this.lights.sun.shadow.map?.dispose();
        this.lights.sun.shadow.map = null;
      }
    }
  }

  _setRendererSize(pixelRatio) {
    this.renderer.setPixelRatio?.(pixelRatio);
    if (this.options.manageRendererSize !== false) {
      this.renderer.setSize?.(this.viewport.width, this.viewport.height, false);
    }
  }

  _applyShadowMode() {
    const sun = this.lights.sun;
    if (!sun || this.options.manageShadows === false) return;
    const shadowModes = this.options.shadowModes ?? ["carrier"];
    sun.castShadow = this.config.tier.settings.shadowMapSize > 0 && shadowModes.includes(this.mode);
  }

  setMode(mode) {
    if (!mode || mode === this.mode || this.disposed) return false;
    this.mode = mode;
    this.adaptiveResolution?.setMode(mode);
    this._applyShadowMode();
    this.adapters.environment?.setMode?.(mode, this.context());
    this.adapters.effects?.setMode?.(mode, this.context());
    return true;
  }

  setCamera(camera) {
    if (!camera || camera === this.camera || this.disposed) return false;
    this.camera = camera;
    this.postStack?.setSceneCamera?.(this.scene, camera);
    this.adapters.environment?.setCamera?.(camera, this.context());
    this.adapters.effects?.setCamera?.(camera, this.context());
    return true;
  }

  async setQualityTier(tierId) {
    if (this.disposed || tierId === this.config.tier.id) return false;
    this.config = normalizeVisualProfile(this.profile, { tierId });
    this._applyProfileState();
    this.postStack?.configure?.(this.config);
    this.adaptiveResolution.configure({
      ...this.config.adaptiveResolution,
      enabled: this.config.adaptiveResolution.enabled && this.options.adaptiveResolution !== false,
      pixelRatioCap: this.config.renderer.pixelRatioCap,
    });
    this.adaptiveResolution.setViewport(
      this.viewport.width,
      this.viewport.height,
      this.viewport.devicePixelRatio,
    );
    this._applyShadowMode();
    await this.adapters.environment?.setQualityTier?.(this.config.tier, this.context());
    await this.adapters.effects?.setQualityTier?.(this.config.tier, this.context());
    return true;
  }

  resize(width, height, devicePixelRatio = this.viewport.devicePixelRatio) {
    if (this.disposed) return false;
    this.viewport = {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      devicePixelRatio: Math.max(0.5, devicePixelRatio),
    };
    this.adaptiveResolution.setViewport(width, height, devicePixelRatio);
    this.adapters.environment?.resize?.(this.context());
    this.adapters.effects?.resize?.(this.context());
    return true;
  }

  update(frame = {}) {
    if (this.disposed || !this.initialized) return false;
    if (typeof frame === "number") frame = { deltaSeconds: frame };
    const deltaSeconds = Math.max(0, frame.deltaSeconds ?? 0);
    this.elapsedSeconds = frame.elapsedSeconds ?? (this.elapsedSeconds + deltaSeconds);
    if (frame.mode) this.setMode(frame.mode);

    const updateContext = this.context({ frame: { ...frame, deltaSeconds, elapsedSeconds: this.elapsedSeconds } });
    this.adapters.environment?.update?.(updateContext.frame, updateContext);
    this.adapters.effects?.update?.(updateContext.frame, updateContext);

    if (this.lights.sun?.castShadow && this.options.stabilizeShadows !== false) {
      const focus = frame.shadowFocus ?? this.options.shadowFocus?.(updateContext) ?? this.camera.position;
      const shadowDistance = this.config.environment.lighting.shadowDistanceMetres;
      applyTexelStabilizedDirectionalShadow(this.lights.sun, focus, {
        mapSize: this.config.tier.settings.shadowMapSize,
        halfExtent: shadowHalfExtentForMode(shadowDistance, this.mode, this.options.shadowHalfExtents),
      });
    }

    this.adaptiveResolution.sample(frame.frameTimeMs ?? deltaSeconds * 1000);
    this.options.onUpdate?.(updateContext.frame, updateContext);
    return true;
  }

  render(deltaSeconds = 0) {
    if (this.disposed || !this.initialized) return false;
    return this.postStack.render(deltaSeconds);
  }

  getEffectBinding(eventId) {
    return this.config.effects.byEventId[eventId] ?? null;
  }

  dispatchEffect(eventId, payload = {}) {
    if (this.disposed) return false;
    const binding = this.getEffectBinding(eventId);
    if (!binding) return false;
    return this.adapters.effects?.handleEvent?.(
      { eventId, binding, payload },
      this.context(),
    ) ?? false;
  }

  diagnostics() {
    return {
      profileId: this.config.profileId,
      tierId: this.config.tier.id,
      mode: this.mode,
      viewport: { ...this.viewport },
      post: this.postStack?.diagnostics?.() ?? null,
      resolution: this.adaptiveResolution?.status?.() ?? null,
      disposed: this.disposed,
    };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const errors = [];
    for (const dispose of [
      () => this.adapters.effects?.dispose?.(this.context()),
      () => this.adapters.environment?.dispose?.(this.context()),
      () => this.postStack?.dispose?.(),
    ]) {
      try {
        await dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      if (this.options.restoreStateOnDispose !== false) {
        this.scene.fog = this.original.fog;
        this.renderer.outputColorSpace = this.original.outputColorSpace;
        this.renderer.toneMapping = this.original.toneMapping;
        this.renderer.toneMappingExposure = this.original.toneMappingExposure;
        this._setRendererSize(this.original.pixelRatio);
        restoreLight(this.lights.ambient, this.original.ambient);
        restoreLight(this.lights.sun, this.original.sun);
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "VisualRuntime cleanup failed.");
  }
}

export async function createVisualRuntime(options = {}) {
  const selection = {
    ...options,
    deviceClass: detectDeviceClass(options),
    deviceMemoryGiB: options.deviceMemoryGiB ?? globalThis.navigator?.deviceMemory,
  };
  const loaded = await loadVisualProfile(selection);
  const runtime = new VisualRuntime({ ...options, ...loaded });
  try {
    return await runtime.initialize();
  } catch (error) {
    try {
      await runtime.dispose();
    } catch (cleanupError) {
      if (error && typeof error === "object") error.cleanupError = cleanupError;
      else throw new AggregateError([error, cleanupError], "VisualRuntime initialization and cleanup failed.");
    }
    throw error;
  }
}

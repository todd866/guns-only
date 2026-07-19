import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  SRGBColorSpace,
  Vector2,
} from "../../vendor/three.module.js";
import { EffectComposer } from "../../vendor/three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "../../vendor/three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "../../vendor/three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "../../vendor/three/addons/postprocessing/ShaderPass.js";
import { SMAAPass } from "../../vendor/three/addons/postprocessing/SMAAPass.js";
import { UnrealBloomPass } from "../../vendor/three/addons/postprocessing/UnrealBloomPass.js";
import { FXAAShader } from "../../vendor/three/addons/shaders/FXAAShader.js";

const TONE_MAPPING = {
  none: NoToneMapping,
  linear: LinearToneMapping,
  reinhard: ReinhardToneMapping,
  cineon: CineonToneMapping,
  aces_filmic: ACESFilmicToneMapping,
  agx: AgXToneMapping,
  // Three r160 has no NeutralToneMapping and OutputPass does not execute a
  // CustomToneMapping callback. ACES is the deterministic safe fallback.
  neutral: ACESFilmicToneMapping,
  custom: ACESFilmicToneMapping,
};

export function threeToneMappingForName(name) {
  return TONE_MAPPING[name] ?? ACESFilmicToneMapping;
}

export function applyRendererColorPipeline(renderer, config) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = threeToneMappingForName(config.renderer?.toneMapping);
  renderer.toneMappingExposure = config.renderer?.exposure ?? 1;
}

export function detectPostProcessingCapabilities(renderer, overrides = {}) {
  const hasExtension = (name) => renderer.extensions?.has?.(name) === true;
  const halfFloatColorBuffer = overrides.halfFloatColorBuffer ?? (
    hasExtension("EXT_color_buffer_float") ||
    hasExtension("EXT_color_buffer_half_float") ||
    renderer.extensions === undefined
  );
  return {
    halfFloatColorBuffer,
    supportsSmaa: overrides.supportsSmaa ?? typeof globalThis.Image === "function",
    xr: overrides.xr ?? renderer.xr?.enabled === true,
  };
}

/** Pure pass-plan derivation used by tests and diagnostics. */
export function derivePostStackPlan(config, capabilities = {}) {
  const post = config.postProcessing ?? {};
  if (!post.enabled) {
    return { mode: "direct", passes: ["scene", "renderer-output"], reason: "profile-disabled" };
  }
  if (post.hdr === false) {
    return { mode: "direct", passes: ["scene", "renderer-output"], reason: "profile-hdr-disabled" };
  }
  if (capabilities.xr) {
    return { mode: "direct", passes: ["scene", "renderer-output"], reason: "xr-direct-path" };
  }
  if (capabilities.halfFloatColorBuffer === false) {
    return { mode: "direct", passes: ["scene", "renderer-output"], reason: "half-float-unavailable" };
  }

  let antialiasing = post.antialiasing ?? "none";
  if (antialiasing === "smaa" && capabilities.supportsSmaa === false) antialiasing = "fxaa";
  const passes = ["scene-linear-hdr"];
  if (post.bloom?.enabled) passes.push("threshold-bloom");
  if (antialiasing !== "none") passes.push(antialiasing);
  // OutputPass is intentionally the only tone-map/linear-to-sRGB operation.
  const requestedToneMapping = config.renderer?.toneMapping ?? "aces_filmic";
  const effectiveToneMapping = requestedToneMapping === "neutral" || requestedToneMapping === "custom"
    ? "aces_filmic"
    : requestedToneMapping;
  passes.push(`output-${effectiveToneMapping.replace("_filmic", "")}-srgb`);
  return { mode: "composer", passes, antialiasing, reason: null };
}

/**
 * Restrained Three r160 post stack. Emissive pixels bloom only when they cross
 * the configured linear-luminance threshold; ordinary cockpit/HUD values stay
 * sharp. Mobile and unsupported devices render directly through the renderer.
 */
export class ThreeR160PostStack {
  constructor(options) {
    if (!options?.renderer || !options.scene || !options.camera || !options.config) {
      throw new TypeError("ThreeR160PostStack requires renderer, scene, camera, and config.");
    }
    this.renderer = options.renderer;
    this.scene = options.scene;
    this.camera = options.camera;
    this.width = Math.max(1, Math.round(options.width ?? 1));
    this.height = Math.max(1, Math.round(options.height ?? 1));
    this.pixelRatio = Math.max(0.5, options.pixelRatio ?? this.renderer.getPixelRatio?.() ?? 1);
    this.capabilities = detectPostProcessingCapabilities(this.renderer, options.capabilities);
    this.onDiagnostic = options.onDiagnostic ?? (() => {});
    this.disposed = false;
    this.passes = [];
    this.configure(options.config);
  }

  configure(config) {
    if (this.disposed) return false;
    this.config = config;
    applyRendererColorPipeline(this.renderer, config);
    this._disposeComposer();
    this.plan = derivePostStackPlan(config, this.capabilities);
    if (this.plan.mode === "direct") {
      if (this.plan.reason !== "profile-disabled") {
        this.onDiagnostic({ level: "info", code: "POST_DIRECT_FALLBACK", reason: this.plan.reason });
      }
      return false;
    }

    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);

    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);
    this.passes.push(this.renderPass);

    const bloom = config.postProcessing.bloom;
    if (bloom.enabled) {
      this.bloomPass = new UnrealBloomPass(
        new Vector2(this.width * this.pixelRatio, this.height * this.pixelRatio),
        bloom.strength,
        bloom.radius,
        bloom.threshold,
      );
      this.composer.addPass(this.bloomPass);
      this.passes.push(this.bloomPass);
    }

    if (this.plan.antialiasing === "smaa") {
      this.aaPass = new SMAAPass(this.width * this.pixelRatio, this.height * this.pixelRatio);
      this.composer.addPass(this.aaPass);
      this.passes.push(this.aaPass);
    } else if (this.plan.antialiasing === "fxaa") {
      this.aaPass = new ShaderPass(FXAAShader);
      this._updateFxaaResolution();
      this.composer.addPass(this.aaPass);
      this.passes.push(this.aaPass);
    }

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
    this.passes.push(this.outputPass);
    return true;
  }

  setSceneCamera(scene, camera) {
    this.scene = scene ?? this.scene;
    this.camera = camera ?? this.camera;
    if (this.renderPass) {
      this.renderPass.scene = this.scene;
      this.renderPass.camera = this.camera;
    }
  }

  setSize(width, height, pixelRatio = this.pixelRatio) {
    if (this.disposed) return;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.pixelRatio = Math.max(0.5, pixelRatio);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
      this._updateFxaaResolution();
    }
  }

  _updateFxaaResolution() {
    const resolution = this.aaPass?.material?.uniforms?.resolution?.value;
    resolution?.set(1 / (this.width * this.pixelRatio), 1 / (this.height * this.pixelRatio));
  }

  render(deltaSeconds) {
    if (this.disposed) return false;
    if (this.composer) this.composer.render(deltaSeconds);
    else this.renderer.render(this.scene, this.camera);
    return true;
  }

  diagnostics() {
    return {
      ...this.plan,
      width: this.width,
      height: this.height,
      pixelRatio: this.pixelRatio,
      toneMapping: this.config.renderer.toneMapping,
      exposure: this.config.renderer.exposure,
    };
  }

  _disposeComposer() {
    if (!this.composer) return;
    for (const pass of [...this.passes].reverse()) pass.dispose?.();
    this.passes.length = 0;
    this.composer.dispose();
    this.composer = null;
    this.renderPass = null;
    this.bloomPass = null;
    this.aaPass = null;
    this.outputPass = null;
  }

  dispose() {
    if (this.disposed) return;
    this._disposeComposer();
    this.disposed = true;
  }
}

export function createThreeR160PostStack(options) {
  return new ThreeR160PostStack(options);
}

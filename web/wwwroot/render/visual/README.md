# Profile-driven visual runtime

This directory is the renderer boundary for a selected content pack's
`visual-profile.json`. It does not own simulation state or camera policy. It
normalizes renderer-facing settings, owns their reversible lifecycle, and
coordinates injected environment/effects adapters.

## What it provides

- deterministic quality-tier selection and bounded profile normalization;
- linear half-float post processing on capable devices;
- restrained luminance-threshold bloom on the desktop tier;
- SMAA on desktop, FXAA on balanced, and a direct mobile path;
- exactly one final tone-map and linear-to-sRGB output transform;
- adaptive pixel ratio with hysteresis, asymmetric recovery, and stall rejection;
- carrier/combat shadow extents and directional-shadow texel stabilization;
- idempotent resize, update, mode/quality switching, diagnostics, and disposal;
- event-to-effect binding lookup from the selected visual profile.

The defaults require no schema change. Optional future tuning can live under
`visualProfile.extensions.postProcessing` and
`visualProfile.extensions.adaptiveResolution`, with optional per-tier values in
`tiers.<tier-id>`.

## Production integration

`FlightView` initializes this runtime from `PresentationAssetManager.activePack.profile`, keyed by
the epoch-guarded active pack identity. It passes `manageFog: false` because the live altitude and
in-cloud extinction path owns `FogExp2`; the runtime owns renderer exposure/color, post-processing,
adaptive pixel ratio, profile light levels, and stabilized shadow maps. Until the selected pack has
loaded, the flight view safely uses its direct-render compatibility path.

Create the runtime after the renderer, scene, active camera, and existing
ambient/sun lights. The current authored environment and effects modules can be
adapted without changing either implementation:

```js
import * as THREE from "./vendor/three.module.js";
import { loadKoreaEnvironment } from "./render/environment/korea_environment.js";
import { loadKoreaGunEffects } from "./render/effects/korea_gun_effects.js";
import { createVisualRuntime } from "./render/visual/index.js";

const visualRuntime = await createVisualRuntime({
  renderer,
  scene,
  camera,
  lights: { ambient: hemisphereLight, sun: directionalLight },
  // Use the pack/session-projected URL when available. The Korea profile is
  // the module default during the current single-pack transition.
  profileUrl: "./content/packs/korea-1950s/visual-profile.json",
  mode: "combat",
  environmentFactory: async (context) => {
    const fog = context.config.environment.fog;
    const environment = await loadKoreaEnvironment(THREE, {
      qualityTier: context.qualityTier.id,
      fogColor: fog.color,
      fogNear: fog.nearMetres,
      fogFar: fog.farMetres,
    });
    context.scene.add(environment.group);
    return {
      update(frame, current) {
        environment.update({
          timeSeconds: frame.elapsedSeconds,
          cameraPosition: current.camera.position,
        });
      },
      dispose() { environment.dispose(); },
    };
  },
  effectsFactory: async (context) => {
    const effects = await loadKoreaGunEffects(THREE, {
      qualityTier: context.qualityTier.id,
    });
    context.scene.add(effects.group);
    return {
      update(frame) { effects.update(frame.deltaSeconds); },
      handleEvent({ eventId, payload }) {
        effects.emit(eventId, payload);
        return true;
      },
      dispose() { effects.dispose(); },
    };
  },
});
```

Use one render path in the frame loop:

```js
visualRuntime.update({
  deltaSeconds,
  elapsedSeconds,
  frameTimeMs: deltaSeconds * 1000,
  mode: flightMode,
  shadowFocus: carrierMode ? carrier.position : aircraft.position,
});
visualRuntime.render(deltaSeconds);
```

Do not also call `renderer.render(scene, camera)`. Composer mode renders the
scene to a linear HDR target and `OutputPass` performs the sole ACES/sRGB
transform. Direct/mobile mode lets `WebGLRenderer` perform that transform once.

Forward CSS viewport dimensions and the current device pixel ratio:

```js
visualRuntime.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
```

On a camera swap, update both the runtime and stack:

```js
visualRuntime.setCamera(nextCamera);
```

On shutdown or pack replacement:

```js
await visualRuntime.dispose();
```

Disposal is idempotent and restores the fog, renderer output settings, pixel
ratio, and injected light settings that existed before initialization.

## Bloom and readability constraints

Bloom is luminance-threshold selective, not a blanket blur. Muzzle cores,
tracer heads, sun glints, and explosion cores must emit linear HDR values above
the configured threshold (default `1.12`) to participate. Keep cockpit labels,
target silhouettes, and the gunsight below the threshold. The post stack does
not add motion blur, temporal accumulation, chromatic aberration, or full-scene
SSAO because each can obscure small aircraft and tracers.

## Adaptive resolution

The controller uses a smoothed completed-frame duration, ignores background
stalls above 250 ms, warms up before changing scale, drops resolution in 8%
steps, and recovers in 4% steps. A mode change resets the timing window. The
profile's `pixelRatioCap` remains an absolute cap even when adaptation is
disabled.

By default shadows are enabled only in `carrier` mode. Their orthographic
half-extent is 900 m for carrier work and 3,000 m for combat, capped by the
profile's shadow distance. The light-space origin is snapped to whole shadow
texels to suppress crawling as the focus moves.

## Tests

```sh
cd web/wwwroot/render/visual
npm test
```

The suite covers canonical-profile normalization, tier extensions, pass order,
fallbacks, adaptive-resolution hysteresis, shadow snapping, runtime adapters,
quality changes, resize, effects dispatch, and idempotent cleanup.

# Runtime asset pipeline

This directory contains the renderer-side asset boundary for Three.js r160. It loads a content pack's selected visual profile and asset manifest, resolves stable presentation IDs to asset IDs, chooses model LODs by projected pixel height, and falls back to injected procedural factories when authored files are unavailable.

The core modules have no direct Three.js import, which keeps the registry testable. `three_r160_loader.js` is the browser adapter for the vendored `GLTFLoader`, `KTX2Loader`, and Meshopt decoder.

## Canonical load path

`AssetRegistry.loadPack()` follows the content schema's references in this order:

1. `pack.presentation.profiles[].visualProfile.uri`
2. `visualProfile.assetProfile.manifest.uri`
3. `manifest.assets[]`

It selects `pack.presentation.defaultPresentationProfileId` unless `profileId` is supplied. Relative paths are resolved against the JSON file that declares them, so model sources remain portable inside a staged pack directory.

```js
import { LodSelectionState } from "./render/assets/index.js";
import { createThreeR160AssetRegistry } from "./render/assets/three_r160_loader.js";

const assets = createThreeR160AssetRegistry({
  renderer,
  fallbackFactories: {
    "procedural://fighter/current": ({ parameters }) => buildFighter(parameters),
  },
});

await assets.registry.loadPack(packUrl);

const lodState = new LodSelectionState({ hysteresis: 0.12 });
const fighter = await assets.registry.instantiate(
  "presentation.vehicle.bandit.v1",
  { projectedPixelHeight: targetPixelHeight, lodState },
);
scene.add(fighter.scene);

// When the entity despawns:
fighter.release();

// When the renderer shuts down:
await assets.dispose();
```

Pass the active `WebGLRenderer` when KTX2 support is enabled. The adapter calls `KTX2Loader.detectSupport(renderer)` and uses the vendored Basis transcoder. Set `ktx2: false` for a build that has no KTX2 assets.

## Fallback factory contract

Factories are registered by stable `procedural://` URI. They receive the resolved asset, pack, profile, selected LOD, load failure (if any), the chosen fallback descriptor, and its `parameters` object.

A factory can return:

- an `Object3D`; the instance owns and disposes all resources reachable from that scene;
- `{ scene, ownedResources }`; only the supplied disposable resources are released;
- `{ scene, ownership: "external" }`; the registry does not dispose scene resources; or
- `{ scene, dispose(scene, instance) }`; custom cleanup controls the lifecycle.

Use `ownedResources` or external ownership when procedural instances deliberately share geometry, materials, or textures.

## glTF ownership and caching

The registry caches the in-flight promise and loaded glTF by resolved source URI. Concurrent requests therefore perform one network/decode operation.

Static scenes are cloned per instance. Geometry and textures remain shared with the cached source, while materials are cloned so per-aircraft tint and uniform changes do not leak. Releasing an instance disposes only its cloned materials. The cached source owns the shared geometry, source materials, and textures; those are disposed once the cache is cleared and no live instance still references them.

`SkinnedMesh` cannot be cloned safely with the static path. Supply a `cloneScene` implementation backed by `SkeletonUtils.clone()` if a future asset pack introduces skinned models.

## LOD selection

Canonical model LOD entries use `minProjectedPixels`. The selector chooses the most detailed entry whose threshold is met and always returns the lowest-detail entry below all thresholds. `LodSelectionState` adds 12% hysteresis by default: shrinking objects retain their current LOD until 12% below the boundary, and growing objects must reach 12% above it before upgrading.

`estimateProjectedPixelHeight()` is available when the caller has a world-space silhouette extent, camera distance, vertical field of view, and viewport height. The live renderer measures an orientation-independent bounding-sphere diameter from each loaded scene and multiplies it by the presentation root's largest world-scale component before LOD selection. Exact projected bounds can still be measured elsewhere and passed directly.

## Tests

Run the focused regression suite from this directory:

```sh
npm test
```

The tests cover the canonical pack/profile/manifest chain, stable binding resolution, LOD hysteresis, in-flight request deduplication, procedural fallback parameters, and shared-resource disposal ownership.

// Keep this runtime query in lockstep with app.js. It invalidates the unbundled ES-module graph
// when loader/registry semantics change; authored payloads have their own SHA-256 cache keys.
export { AssetPipelineError } from "./errors.js?v=__RELEASE_BUILD__";
export {
  boundingSphereDiameterFromSize,
  estimateProjectedPixelHeight,
  LodSelectionState,
  lodMinimumPixelHeight,
  maximumAxisScale,
  selectLodByProjectedPixelHeight,
  selectLodWithHysteresis,
} from "./lod.js?v=__RELEASE_BUILD__";
export {
  cloneStaticGltfScene,
  createGltfLoaderAdapter,
  disposeGltfSource,
  disposeResourceSet,
  disposeSceneResources,
  selectGltfScene,
} from "./resource_utils.js?v=__RELEASE_BUILD__";
export {
  AssetInstance,
  AssetRegistry,
  normalizeAssetManifest,
  normalizeVisualProfile,
} from "./asset_registry.js?v=__RELEASE_BUILD__";

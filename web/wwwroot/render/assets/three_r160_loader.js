import { GLTFLoader } from "../../vendor/three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "../../vendor/three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "../../vendor/three/addons/libs/meshopt_decoder.module.js";
import { AssetRegistry } from "./asset_registry.js?runtime=2";
import { AssetPipelineError } from "./errors.js?runtime=2";

const DEFAULT_TRANSCODER_PATH = new URL(
  "../../vendor/three/addons/libs/basis/",
  import.meta.url,
).href;

/**
 * Browser adapter for the exact vendored Three r160 addon set. KTX2 support
 * needs a live renderer so KTX2Loader can select a supported GPU target format.
 */
export function createThreeR160LoaderStack(options = {}) {
  const loader = new GLTFLoader(options.manager);
  if (options.crossOrigin !== undefined) loader.setCrossOrigin(options.crossOrigin);
  if (options.requestHeader !== undefined) loader.setRequestHeader(options.requestHeader);
  if (options.withCredentials !== undefined) loader.setWithCredentials(options.withCredentials);

  if (options.meshopt !== false) loader.setMeshoptDecoder(options.meshoptDecoder ?? MeshoptDecoder);

  const wantsKtx2 = options.ktx2 !== false && (options.renderer !== undefined || options.ktx2 === true);
  let ktx2Loader = null;
  if (wantsKtx2) {
    if (!options.renderer) {
      throw new AssetPipelineError("KTX2_RENDERER_REQUIRED",
        "KTX2Loader.detectSupport() requires the active Three.js WebGLRenderer.");
    }
    ktx2Loader = new KTX2Loader(options.manager)
      .setTranscoderPath(options.transcoderPath ?? DEFAULT_TRANSCODER_PATH);
    if (options.ktx2WorkerLimit !== undefined) ktx2Loader.setWorkerLimit(options.ktx2WorkerLimit);
    ktx2Loader.detectSupport(options.renderer);
    loader.setKTX2Loader(ktx2Loader);
  }

  options.configureLoader?.(loader, { ktx2Loader, meshoptDecoder: options.meshoptDecoder ?? MeshoptDecoder });
  let disposed = false;
  return {
    loader,
    ktx2Loader,
    loadModel: (url) => {
      if (disposed) {
        return Promise.reject(new AssetPipelineError("MODEL_LOADER_DISPOSED",
          "The Three r160 model loader stack has been disposed."));
      }
      return loader.loadAsync(url);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ktx2Loader?.dispose();
    },
  };
}

/** Convenience composition; the registry remains available separately for DI/tests. */
export function createThreeR160AssetRegistry(options = {}) {
  const stack = createThreeR160LoaderStack(options);
  const registry = new AssetRegistry({
    ...options.registryOptions,
    baseUrl: options.baseUrl ?? options.registryOptions?.baseUrl,
    fetchJson: options.fetchJson ?? options.registryOptions?.fetchJson,
    fallbackFactories: options.fallbackFactories ?? options.registryOptions?.fallbackFactories,
    loadModel: stack.loadModel,
  });
  return {
    registry,
    loader: stack.loader,
    ktx2Loader: stack.ktx2Loader,
    async dispose() {
      await registry.dispose();
      stack.dispose();
    },
  };
}

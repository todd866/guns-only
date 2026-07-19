import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AssetRegistry,
  boundingSphereDiameterFromSize,
  estimateProjectedPixelHeight,
  LodSelectionState,
  maximumAxisScale,
  normalizeAssetManifest,
} from "../index.js";

const REPOSITORY_ROOT = new URL("../../../../../", import.meta.url);

class FakeDisposable {
  constructor() {
    this.disposeCount = 0;
  }

  dispose() {
    this.disposeCount++;
  }
}

class FakeTexture extends FakeDisposable {
  constructor() {
    super();
    this.isTexture = true;
  }
}

class FakeMaterial extends FakeDisposable {
  constructor(map = null) {
    super();
    this.map = map;
  }

  clone() {
    return new FakeMaterial(this.map);
  }
}

class FakeGeometry extends FakeDisposable {}

class FakeNode {
  constructor(name = "") {
    this.name = name;
    this.children = [];
    this.parent = null;
    this.userData = {};
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parent = null;
  }

  removeFromParent() {
    this.parent?.remove(this);
  }

  traverse(visitor) {
    visitor(this);
    for (const child of this.children) child.traverse(visitor);
  }

  clone(recursive = true) {
    const clone = this.isMesh
      ? new FakeMesh(this.name, this.geometry, this.material)
      : new FakeNode(this.name);
    clone.userData = { ...this.userData };
    if (recursive) {
      for (const child of this.children) clone.add(child.clone(true));
    }
    return clone;
  }
}

class FakeMesh extends FakeNode {
  constructor(name, geometry, material) {
    super(name);
    this.isMesh = true;
    this.geometry = geometry;
    this.material = material;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function makeSourceGltf() {
  const texture = new FakeTexture();
  const material = new FakeMaterial(texture);
  const geometry = new FakeGeometry();
  const scene = new FakeNode("source")
    .add(new FakeMesh("airframe", geometry, material))
    .add(new FakeMesh("shared-marking", geometry, material));
  return { gltf: { scene, scenes: [scene] }, scene, geometry, material, texture };
}

function makeManifest({ fallbackOnly = false } = {}) {
  const fighter = {
    assetId: "fighter",
    kind: "model",
    fallbacks: [{
      type: "procedural_factory",
      uri: "procedural://fighter",
      parameters: { livery: "hostile-silver" },
    }],
    lods: [
      {
        level: "lod0",
        minProjectedPixels: 200,
        source: {
          uri: "./models/fighter-lod0.glb",
          format: "glb",
          mediaType: "model/gltf-binary",
          sha256: "abc123",
        },
        budgets: { triangles: 120000 },
      },
      {
        level: "lod1",
        minProjectedPixels: 0,
        source: { uri: "./models/fighter-lod1.glb", format: "glb" },
      },
    ],
  };
  const assets = [fighter];
  if (fallbackOnly) {
    assets.push({
      assetId: "fallback-airfield",
      kind: "model",
      status: "fallback_only",
      fallbacks: [{ type: "procedural", uri: "procedural://airfield" }],
    });
  }
  return { manifestId: "core-models", assets };
}

async function loadInlinePack(registry, manifest = makeManifest(), bindings = [
  { presentationId: "bandit.primary", assetId: "fighter" },
]) {
  return registry.loadPack({
    packId: "core",
    presentation: {
      defaultPresentationProfileId: "high",
      profiles: [
        {
          presentationProfileId: "high",
          visualProfile: {
            profileId: "visual-high",
            assetProfile: {
              manifest,
              bindings,
              lodPixelHeightScale: 1.1,
            },
          },
        },
      ],
    },
  });
}

test("loads the canonical pack/profile/manifest chain and preserves LOD source metadata", async () => {
  const packUrl = "https://example.test/game/pack.json";
  const highProfileUrl = "https://example.test/game/profiles/high.json?packVersion=2.3.4";
  const manifestUrl = "https://example.test/game/asset-manifest.json?packVersion=2.3.4&profileVersion=5.6.7";
  const resources = new Map([
    [packUrl, {
      packId: "core",
      packVersion: "2.3.4",
      presentation: {
        defaultPresentationProfileId: "high",
        profiles: [
          { presentationProfileId: "low", visualProfile: { uri: "./profiles/low.json" } },
          { presentationProfileId: "high", visualProfile: { uri: "./profiles/high.json" } },
        ],
      },
    }],
    [highProfileUrl, {
      profileId: "visual-high",
      profileVersion: "5.6.7",
      assetProfile: {
        manifest: { uri: "../asset-manifest.json" },
        lodPixelHeightScale: 1.1,
        bindings: [
          { presentationId: "bandit.primary", assetId: "fighter" },
          { presentationId: "airfield", assetId: "fallback-airfield" },
        ],
      },
    }],
    [manifestUrl, makeManifest({ fallbackOnly: true })],
  ]);
  const fetched = [];
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/game/",
    fetchJson: async (url) => {
      fetched.push(url);
      assert.ok(resources.has(url), `unexpected JSON request: ${url}`);
      return resources.get(url);
    },
  });

  const pack = await registry.loadPack("./pack.json");
  assert.deepEqual(fetched, [packUrl, highProfileUrl, manifestUrl]);
  assert.equal(pack.id, "core");
  assert.equal(pack.manifest.id, "core-models");
  assert.equal(pack.profile.id, "visual-high");

  const fighter = registry.getAssetDescriptor("bandit.primary");
  assert.equal(fighter.lods[0].id, "lod0");
  assert.equal(fighter.lods[0].uri,
    "https://example.test/game/models/fighter-lod0.glb?sha256=abc123");
  assert.equal(fighter.lods[0].source.format, "glb");
  assert.equal(fighter.lods[0].source.sha256, "abc123");
  assert.equal(registry.selectLod("bandit.primary", 190).id, "lod0");
  assert.equal(registry.getAssetDescriptor("airfield").kind, "procedural");
});

test("LOD selection uses 12% hysteresis in both directions", () => {
  const manifest = normalizeAssetManifest(makeManifest(), { baseUrl: "https://example.test/manifest.json" });
  const lods = manifest.assets.fighter.lods;
  const state = new LodSelectionState();

  assert.equal(state.select(lods, 210).id, "lod0");
  assert.equal(state.select(lods, 180).id, "lod0", "retains detail above the -12% boundary");
  assert.equal(state.select(lods, 170).id, "lod1");
  assert.equal(state.select(lods, 220).id, "lod1", "requires +12% before upgrading");
  assert.equal(state.select(lods, 225).id, "lod0");
});

test("LOD projection uses orientation-independent bounds and conservative world scale", () => {
  const diameter = boundingSphereDiameterFromSize({ x: 10, y: 2, z: 8 });
  assert.equal(diameter, Math.hypot(10, 2, 8));
  assert.ok(diameter > 2, "a flat aircraft must not use only its small upright height");

  const worldScale = maximumAxisScale({ x: 1, y: -2.5, z: 0.75 });
  assert.equal(worldScale, 2.5, "mirrored and non-uniform transforms use the largest absolute axis");

  const projection = {
    distance: 500,
    verticalFovRadians: Math.PI / 3,
    viewportHeight: 1080,
  };
  const unscaledPixels = estimateProjectedPixelHeight({
    ...projection,
    worldHeight: diameter,
  });
  const scaledPixels = estimateProjectedPixelHeight({
    ...projection,
    worldHeight: diameter * worldScale,
  });
  assert.ok(Math.abs(scaledPixels / unscaledPixels - worldScale) < 1e-12);

  assert.throws(() => boundingSphereDiameterFromSize([10, -1, 8]),
    (error) => error?.code === "INVALID_BOUNDS_SIZE");
});

test("normalizes every schema-valid passive kind without treating it as a scene model", () => {
  const passiveKinds = [
    "texture",
    "material",
    "shader",
    "font",
    "audio",
    "vfx",
    "icon",
    "environment",
    "ui",
  ];
  const manifest = normalizeAssetManifest({
    manifestId: "resources",
    assets: passiveKinds.map((kind) => ({
      assetId: `passive.${kind}`,
      kind,
      status: kind === "vfx" ? "fallback_only" : "production",
      sources: [{ uri: `./resources/${kind}.bin`, format: "test" }],
      fallbacks: [],
    })),
  }, { baseUrl: "https://example.test/game/asset-manifest.json" });

  for (const kind of passiveKinds) {
    const descriptor = manifest.assets[`passive.${kind}`];
    assert.equal(descriptor.kind, kind);
    assert.equal(descriptor.resourceKind, kind);
    assert.deepEqual(descriptor.lods, []);
    assert.equal(descriptor.sources[0].uri, `https://example.test/game/resources/${kind}.bin`);
  }
});

test("instantiates a passive asset through its declared registered procedural fallback", async () => {
  const manifest = {
    manifestId: "resources",
    assets: [{
      assetId: "environment.sky",
      kind: "environment",
      status: "production",
      sources: [{ uri: "./environment/atmosphere.json", format: "three-material-profile" }],
      fallbacks: [{ type: "generated_shader", uri: "procedural://environment/sky" }],
    }],
  };
  let modelLoads = 0;
  let factoryCalls = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/game/",
    loadModel: async () => {
      modelLoads++;
      throw new Error("passive assets must not reach the model loader");
    },
    fallbackFactories: {
      "procedural://environment/sky": ({ descriptor }) => {
        factoryCalls++;
        assert.equal(descriptor.kind, "environment");
        return { scene: new FakeNode("sky"), ownership: "external" };
      },
    },
  });
  await loadInlinePack(registry, manifest, [
    { presentationId: "environment.primary", assetId: "environment.sky" },
  ]);
  const descriptor = registry.getAssetDescriptor("environment.primary");
  assert.equal(descriptor.kind, "environment");
  assert.equal(descriptor.resourceKind, "environment");
  assert.equal(descriptor.sources[0].uri, "https://example.test/game/environment/atmosphere.json");
  const instance = await registry.instantiate("environment.primary", { projectedPixelHeight: 100 });
  assert.equal(instance.fallback, true);
  assert.equal(instance.fallbackKey, "procedural://environment/sky");
  assert.equal(modelLoads, 0);
  assert.equal(factoryCalls, 1);
  instance.release();
  await registry.dispose();
});

test("rejects passive instantiation with UNSUPPORTED_ASSET_KIND before model loading", async () => {
  let modelLoads = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/game/",
    loadModel: async () => {
      modelLoads++;
      throw new Error("passive assets must not reach the model loader");
    },
  });
  await loadInlinePack(registry, {
    manifestId: "resources",
    assets: [{
      assetId: "environment.sky",
      kind: "environment",
      status: "production",
      sources: [{ uri: "./environment/atmosphere.json" }],
      fallbacks: [{ type: "procedural_factory", uri: "procedural://environment/sky" }],
    }],
  }, [{ presentationId: "environment.primary", assetId: "environment.sky" }]);

  await assert.rejects(registry.instantiate("environment.primary"), (error) => {
    assert.equal(error.code, "UNSUPPORTED_ASSET_KIND");
    assert.equal(error.details.assetId, "environment.sky");
    assert.equal(error.details.kind, "environment");
    assert.equal(error.details.fallbackKey, "procedural://environment/sky");
    return true;
  });
  assert.equal(modelLoads, 0);
  await registry.dispose();
});

test("loads the repository's canonical authored models and passive environment/VFX mix", async () => {
  let modelLoads = 0;
  const registry = new AssetRegistry({
    baseUrl: REPOSITORY_ROOT.href,
    fetchJson: async (url) => JSON.parse(await readFile(new URL(url), "utf8")),
    loadModel: async () => {
      modelLoads++;
      throw new Error("pack loading must not instantiate models");
    },
  });

  const pack = await registry.loadPack("content/packs/korea-1950s/pack.json");
  const assets = pack.manifest.assets;
  assert.equal(assets["vehicle.player.sabre-fury.v1"].kind, "gltf");
  assert.equal(assets["vehicle.bandit.swept-wing.v1"].kind, "gltf");
  assert.equal(assets["cockpit.player.sabre-fury.v1"].kind, "gltf");
  assert.equal(assets["platform.carrier.straight-deck.v1"].kind, "gltf");
  assert.equal(assets["platform.escort.gun-destroyer.v1"].kind, "gltf");
  assert.equal(assets["environment.sky.haze.v1"].kind, "environment");
  assert.equal(assets["environment.ocean.deep.v1"].kind, "environment");
  assert.equal(assets["vfx.gun.fire.v1"].kind, "vfx");
  assert.equal(assets["vfx.gun.impact.v1"].kind, "vfx");
  assert.equal(assets["vfx.vehicle.destroyed.v1"].kind, "vfx");
  assert.equal(assets["vfx.platform.wake.v1"].kind, "vfx");
  assert.deepEqual(
    assets["cockpit.player.sabre-fury.v1"].anchors.find((anchor) => anchor.id === "camera.cockpit"),
    { id: "camera.cockpit", node: "SOCKET_CAMERA_COCKPIT" },
    "semantic cockpit anchors must survive manifest normalization",
  );
  assert.match(assets["environment.sky.haze.v1"].sources[0].uri,
    /\/content\/packs\/korea-1950s\/environment\/atmosphere\.material\.json$/);
  assert.equal(modelLoads, 0);
  await registry.dispose();
});

test("deduplicates in-flight glTF loads and never disposes shared source assets on instance release", async () => {
  const gate = deferred();
  const source = makeSourceGltf();
  let loadCount = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => {
      loadCount++;
      return gate.promise;
    },
  });
  await loadInlinePack(registry);

  const firstPromise = registry.instantiate("bandit.primary", { projectedPixelHeight: 300 });
  const secondPromise = registry.instantiate("bandit.primary", { projectedPixelHeight: 300 });
  await Promise.resolve();
  assert.equal(loadCount, 1);
  gate.resolve(source.gltf);
  const [first, second] = await Promise.all([firstPromise, secondPromise]);

  const firstMesh = first.scene.children[0];
  const secondMesh = second.scene.children[0];
  assert.notEqual(first.scene, second.scene);
  assert.equal(firstMesh.geometry, source.geometry);
  assert.equal(secondMesh.geometry, source.geometry);
  assert.notEqual(firstMesh.material, source.material);
  assert.notEqual(firstMesh.material, secondMesh.material);
  assert.equal(firstMesh.material, first.scene.children[1].material,
    "one instance reuses one clone for a source material shared by multiple meshes");
  assert.equal(secondMesh.material, second.scene.children[1].material);
  assert.equal(firstMesh.material.map, source.texture);
  assert.deepEqual(registry.cacheStats(), {
    entries: 1,
    loading: 0,
    ready: 1,
    references: 2,
    instances: 2,
  });

  first.release();
  second.release();
  assert.equal(firstMesh.material.disposeCount, 1);
  assert.equal(secondMesh.material.disposeCount, 1);
  assert.equal(source.geometry.disposeCount, 0);
  assert.equal(source.material.disposeCount, 0);
  assert.equal(source.texture.disposeCount, 0);

  await registry.dispose();
  assert.equal(source.geometry.disposeCount, 1);
  assert.equal(source.material.disposeCount, 1);
  assert.equal(source.texture.disposeCount, 1);
});

test("cache eviction defers source disposal until the final live instance releases", async () => {
  const source = makeSourceGltf();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => source.gltf,
  });
  await loadInlinePack(registry);
  const instance = await registry.instantiate("fighter", { projectedPixelHeight: 300 });

  await registry.clearModelCache();
  assert.equal(source.geometry.disposeCount, 0);
  assert.equal(registry.cacheStats().entries, 1);

  instance.release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(source.geometry.disposeCount, 1);
  assert.equal(source.material.disposeCount, 1);
  assert.equal(source.texture.disposeCount, 1);
  assert.equal(registry.cacheStats().entries, 0);
  await registry.dispose();
  assert.equal(source.geometry.disposeCount, 1);
});

test("instance release is await-idempotent and registry disposal waits for external releases", async () => {
  const scene = new FakeNode("external-release");
  const releaseGate = deferred();
  let disposeCalls = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    fallbackFactories: {
      "procedural://airfield": () => ({
        scene,
        async dispose(disposedScene, instance) {
          disposeCalls++;
          assert.equal(disposedScene, scene);
          assert.equal(instance.scene, scene);
          await releaseGate.promise;
        },
      }),
    },
  });
  await loadInlinePack(registry, makeManifest({ fallbackOnly: true }), [
    { presentationId: "airfield", assetId: "fallback-airfield" },
  ]);

  const instance = await registry.instantiate("airfield");
  const firstRelease = instance.release();
  const secondRelease = instance.release();
  assert.equal(firstRelease, secondRelease);
  assert.equal(disposeCalls, 1);
  assert.equal(registry.cacheStats().instances, 0);

  let disposed = false;
  const disposal = registry.dispose().then(() => {
    disposed = true;
  });
  await Promise.resolve();
  assert.equal(disposed, false);
  releaseGate.resolve();
  await disposal;
  assert.equal(disposed, true);
  assert.equal(disposeCalls, 1);
});

test("registry dispose is await-idempotent while an async release is pending", async () => {
  const releaseGate = deferred();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    fallbackFactories: {
      "procedural://airfield": () => ({
        scene: new FakeNode("dispose-idempotence"),
        dispose: () => releaseGate.promise,
      }),
    },
  });
  await loadInlinePack(registry, makeManifest({ fallbackOnly: true }), [
    { presentationId: "airfield", assetId: "fallback-airfield" },
  ]);
  await registry.instantiate("airfield");

  const firstDispose = registry.dispose();
  const secondDispose = registry.dispose();
  assert.equal(firstDispose, secondDispose);
  let finished = false;
  firstDispose.then(() => {
    finished = true;
  });
  await Promise.resolve();
  assert.equal(finished, false);
  releaseGate.resolve();
  await secondDispose;
  assert.equal(finished, true);
});

test("cache clearing and registry disposal await in-flight model source disposal", async () => {
  const source = makeSourceGltf();
  const disposalStarted = deferred();
  const disposalGate = deferred();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => source.gltf,
    async disposeModelSource(gltf) {
      assert.equal(gltf, source.gltf);
      disposalStarted.resolve();
      await disposalGate.promise;
      source.geometry.dispose();
      source.material.dispose();
      source.texture.dispose();
    },
  });
  await loadInlinePack(registry);
  await registry.preload("fighter", { projectedPixelHeight: 300 });

  const firstClear = registry.clearModelCache();
  await disposalStarted.promise;
  let secondClearFinished = false;
  let disposeFinished = false;
  const secondClear = registry.clearModelCache().then(() => {
    secondClearFinished = true;
  });
  const disposal = registry.dispose().then(() => {
    disposeFinished = true;
  });
  await Promise.resolve();
  assert.equal(secondClearFinished, false);
  assert.equal(disposeFinished, false);

  disposalGate.resolve();
  await Promise.all([firstClear, secondClear, disposal]);
  assert.equal(secondClearFinished, true);
  assert.equal(disposeFinished, true);
  assert.equal(source.geometry.disposeCount, 1);
  assert.equal(source.material.disposeCount, 1);
  assert.equal(source.texture.disposeCount, 1);
});

test("uses plural procedural fallbacks after model failure and owns their resources", async () => {
  const geometry = new FakeGeometry();
  const texture = new FakeTexture();
  const material = new FakeMaterial(texture);
  const fallbackScene = new FakeNode("procedural").add(new FakeMesh("fighter", geometry, material));
  let fallbackCause;
  let fallbackParameters;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => {
      throw new Error("offline");
    },
    fallbackFactories: {
      "procedural://fighter": ({ cause, parameters }) => {
        fallbackCause = cause;
        fallbackParameters = parameters;
        return fallbackScene;
      },
    },
  });
  await loadInlinePack(registry);

  const instance = await registry.instantiate("bandit.primary", { projectedPixelHeight: 300 });
  assert.equal(instance.fallback, true);
  assert.equal(instance.fallbackKey, "procedural://fighter");
  assert.equal(fallbackCause.code, "MODEL_LOAD_FAILED");
  assert.deepEqual(fallbackParameters, { livery: "hostile-silver" });
  instance.release();
  assert.equal(geometry.disposeCount, 1);
  assert.equal(material.disposeCount, 1);
  assert.equal(texture.disposeCount, 1);
  await registry.dispose();
});

test("instantiates status=fallback_only assets without attempting a model load", async () => {
  let modelLoads = 0;
  let factoryCalls = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => {
      modelLoads++;
      throw new Error("must not load");
    },
    fallbackFactories: {
      "procedural://airfield": () => {
        factoryCalls++;
        return { scene: new FakeNode("airfield"), ownership: "external" };
      },
    },
  });
  await loadInlinePack(registry, makeManifest({ fallbackOnly: true }), [
    { presentationId: "airfield", assetId: "fallback-airfield" },
  ]);

  const instance = await registry.instantiate("airfield");
  assert.equal(instance.fallback, true);
  assert.equal(modelLoads, 0);
  assert.equal(factoryCalls, 1);
  instance.release();
  await registry.dispose();
});

test("invalid structured fallback results clean their declared resources", async () => {
  const owned = new FakeDisposable();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    fallbackFactories: {
      "procedural://airfield": () => ({ scene: null, ownedResources: [owned] }),
    },
  });
  await loadInlinePack(registry, makeManifest({ fallbackOnly: true }), [
    { presentationId: "airfield", assetId: "fallback-airfield" },
  ]);

  await assert.rejects(registry.instantiate("airfield"),
    (error) => error?.code === "INVALID_FALLBACK_RESULT");
  assert.equal(owned.disposeCount, 1);
  assert.equal(registry.cacheStats().instances, 0);
  await registry.dispose();
});

test("late procedural fallbacks are cleaned up instead of entering a disposed registry", async (t) => {
  const scenarios = [
    {
      name: "default scene ownership",
      makeResult(scene, resources) { return scene; },
      verify(resources) {
        assert.equal(resources.geometry.disposeCount, 1);
        assert.equal(resources.material.disposeCount, 1);
        assert.equal(resources.texture.disposeCount, 1);
      },
    },
    {
      name: "explicit owned resources",
      makeResult(scene, resources) {
        resources.owned = new FakeDisposable();
        return { scene, ownedResources: [resources.owned] };
      },
      verify(resources) {
        assert.equal(resources.owned.disposeCount, 1);
        assert.equal(resources.geometry.disposeCount, 0);
      },
    },
    {
      name: "custom async disposer",
      makeResult(scene, resources) {
        resources.customCalls = 0;
        return {
          scene,
          async dispose(disposedScene, instance) {
            resources.customCalls++;
            assert.equal(disposedScene, scene);
            assert.equal(instance, null);
          },
        };
      },
      verify(resources) {
        assert.equal(resources.customCalls, 1);
        assert.equal(resources.geometry.disposeCount, 0);
      },
    },
    {
      name: "external ownership",
      makeResult(scene) { return { scene, ownership: "external" }; },
      verify(resources) { assert.equal(resources.geometry.disposeCount, 0); },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const gate = deferred();
      const started = deferred();
      const texture = new FakeTexture();
      const material = new FakeMaterial(texture);
      const geometry = new FakeGeometry();
      const scene = new FakeNode("late-fallback")
        .add(new FakeMesh("fallback-mesh", geometry, material));
      const parent = new FakeNode("parent").add(scene);
      const resources = { geometry, material, texture };
      const result = scenario.makeResult(scene, resources);
      const registry = new AssetRegistry({
        baseUrl: "https://example.test/manifest.json",
        fallbackFactories: {
          "procedural://airfield": async () => {
            started.resolve();
            return gate.promise;
          },
        },
      });
      await loadInlinePack(registry, makeManifest({ fallbackOnly: true }), [
        { presentationId: "airfield", assetId: "fallback-airfield" },
      ]);

      const pending = registry.instantiate("airfield");
      await started.promise;
      await registry.dispose();
      gate.resolve(result);
      await assert.rejects(pending, (error) => error?.code === "ASSET_REGISTRY_DISPOSED");

      assert.equal(registry.cacheStats().instances, 0);
      assert.equal(parent.children.length, 0);
      scenario.verify(resources);
    });
  }
});

test("late model clones are cleaned up instead of entering a disposed registry", async () => {
  const source = makeSourceGltf();
  const cloneGate = deferred();
  const cloneStarted = deferred();
  const cloneResource = new FakeDisposable();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => source.gltf,
    cloneScene: async () => {
      cloneStarted.resolve();
      return cloneGate.promise;
    },
  });
  await loadInlinePack(registry);

  const pending = registry.instantiate("bandit.primary", { projectedPixelHeight: 300 });
  await cloneStarted.promise;
  await registry.dispose();
  cloneGate.resolve({ scene: new FakeNode("late-clone"), ownedResources: [cloneResource] });
  await assert.rejects(pending, (error) => error?.code === "ASSET_REGISTRY_DISPOSED");
  await Promise.resolve();

  assert.equal(cloneResource.disposeCount, 1);
  assert.equal(source.geometry.disposeCount, 1);
  assert.equal(source.material.disposeCount, 1);
  assert.equal(source.texture.disposeCount, 1);
  assert.equal(registry.cacheStats().entries, 0);
  assert.equal(registry.cacheStats().instances, 0);
});

test("invalid structured clone results clean their declared resources", async () => {
  const source = makeSourceGltf();
  const owned = new FakeDisposable();
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/manifest.json",
    loadModel: async () => source.gltf,
    cloneScene: async () => ({ scene: undefined, ownedResources: [owned] }),
  });
  await loadInlinePack(registry);

  await assert.rejects(
    registry.instantiate("bandit.primary", { projectedPixelHeight: 300 }),
    (error) => error?.code === "INVALID_SCENE_CLONE",
  );
  assert.equal(owned.disposeCount, 1);
  assert.equal(registry.cacheStats().instances, 0);
  await registry.dispose();
});

test("late pack reads cannot repopulate a disposed registry", async () => {
  const fetchGate = deferred();
  let fetchCount = 0;
  const registry = new AssetRegistry({
    baseUrl: "https://example.test/game/",
    fetchJson: async () => {
      fetchCount++;
      return fetchGate.promise;
    },
  });

  const pending = registry.loadPack("pack.json");
  await Promise.resolve();
  await registry.dispose();
  fetchGate.resolve({ packId: "late-pack" });
  await assert.rejects(pending, (error) => error?.code === "ASSET_REGISTRY_DISPOSED");

  assert.equal(fetchCount, 1);
  assert.equal(registry.activePack, null);
  assert.equal(registry.disposed, true);
});

test("production renderer preserves LOD hysteresis and rejects stale async swaps", async () => {
  const appSource = await readFile(new URL("web/wwwroot/app.js", REPOSITORY_ROOT), "utf8");

  assert.match(appSource,
    /registry\.selectLod\(slot\.presentationId, lodPixelHeight, \{\s*pack: this\.activePack,\s*currentLod: slot\.instance\?\.lod \?\? null,/s,
    "the production renderer must carry the active LOD into quality-biased registry selection");
  assert.match(appSource,
    /if \(slot\.activeKey === key\) \{\s*if \(slot\.pendingKey && slot\.pendingKey !== key\) \{\s*slot\.epoch \+= 1;\s*slot\.pendingKey = "";/s,
    "returning to the active LOD must invalidate any obsolete pending load");
  assert.match(appSource,
    /new THREE\.Box3\(\)\.setFromObject\(slot\.object\)[\s\S]*boundingSphereDiameterFromSize\(localSize\)[\s\S]*slot\.boundingSphereDiameterMetres/,
    "the renderer must measure an orientation-independent bounds diameter for LOD selection");
  assert.match(appSource,
    /slot\.root\.getWorldScale\(slot\.lodWorldScale\)[\s\S]*maximumAxisScale\(rootWorldScale\)/,
    "the renderer must account for the presentation root's world scale");
  assert.doesNotMatch(appSource, /slot\.worldHeightMetres|localSize\.y/,
    "the renderer must not regress to Y-only aircraft bounds");
  assert.doesNotMatch(appSource, /descriptor\?\.bounds/,
    "the renderer must not depend on bounds outside the asset-manifest schema");
});

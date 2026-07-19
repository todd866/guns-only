import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
} from "../../../vendor/three.module.js";
import { createVisualRuntime } from "../visual_runtime.js";

const PROFILE_URL = new URL("../../../content/packs/korea-1950s/visual-profile.json", import.meta.url);

class FakeRenderer {
  constructor() {
    this.outputColorSpace = "original-space";
    this.toneMapping = 77;
    this.toneMappingExposure = 0.5;
    this.ratio = 1;
    this.size = new Vector2(800, 600);
  }

  getPixelRatio() { return this.ratio; }
  setPixelRatio(value) { this.ratio = value; }
  getSize(target) { return target.copy(this.size); }
  setSize(width, height) { this.size.set(width, height); }
}

test("VisualRuntime coordinates profile, adapters, quality, resize, and idempotent cleanup", async () => {
  const profile = JSON.parse(await readFile(PROFILE_URL, "utf8"));
  const renderer = new FakeRenderer();
  const scene = new Scene();
  const originalFog = { name: "original-fog" };
  scene.fog = originalFog;
  const camera = new PerspectiveCamera(60, 4 / 3, 0.1, 10000);
  camera.position.set(10, 20, 30);
  const ambient = new AmbientLight("#FFFFFF", 0.3);
  const sun = new DirectionalLight("#FFFFFF", 0.4);
  sun.position.set(-100, 300, 200);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(512, 512);
  scene.add(ambient, sun, sun.target);

  const calls = [];
  const postStackFactory = ({ config }) => ({
    config,
    setSize: (...args) => calls.push(["post-size", ...args]),
    configure(next) { this.config = next; calls.push(["post-configure", next.tier.id]); },
    render: (delta) => { calls.push(["render", delta]); return true; },
    diagnostics: () => ({ mode: "fake" }),
    dispose: () => calls.push(["post-dispose"]),
  });
  const environmentFactory = async () => ({
    update: (frame) => calls.push(["environment-update", frame.elapsedSeconds]),
    resize: () => calls.push(["environment-resize"]),
    setQualityTier: (tier) => calls.push(["environment-tier", tier.id]),
    dispose: () => calls.push(["environment-dispose"]),
  });
  const effectsFactory = async () => ({
    update: (frame) => calls.push(["effects-update", frame.deltaSeconds]),
    handleEvent: ({ eventId }) => { calls.push(["effect", eventId]); return true; },
    dispose: () => calls.push(["effects-dispose"]),
  });

  const runtime = await createVisualRuntime({
    profile,
    renderer,
    scene,
    camera,
    lights: { ambient, sun },
    tierId: "balanced",
    deviceClass: "balanced",
    width: 800,
    height: 600,
    devicePixelRatio: 2,
    postStackFactory,
    environmentFactory,
    effectsFactory,
  });

  assert.equal(runtime.config.tier.id, "balanced");
  assert.equal(renderer.ratio, 1.6);
  assert.equal(scene.fog.isFog, true);
  assert.equal(ambient.intensity, 1.35);
  assert.equal(sun.intensity, 2.4);
  assert.equal(sun.castShadow, false);
  assert.equal(runtime.update({ deltaSeconds: 0.016, frameTimeMs: 16 }), true);
  assert.equal(runtime.render(0.016), true);
  assert.equal(runtime.dispatchEffect("event.weapon.gun-fire.v1", { rounds: 1 }), true);
  assert.equal(runtime.dispatchEffect("event.unknown.v1"), false);

  runtime.setMode("carrier");
  assert.equal(sun.castShadow, true);
  runtime.update({ deltaSeconds: 0.016, frameTimeMs: 16, shadowFocus: new Vector3(0, 0, 0) });
  runtime.resize(1024, 768, 1.5);
  await runtime.setQualityTier("desktop");
  assert.equal(runtime.config.tier.id, "desktop");
  assert.ok(calls.some((call) => call[0] === "post-configure" && call[1] === "desktop"));
  assert.ok(calls.some((call) => call[0] === "environment-tier" && call[1] === "desktop"));

  await runtime.dispose();
  await runtime.dispose();
  assert.equal(scene.fog, originalFog);
  assert.equal(renderer.ratio, 1);
  assert.equal(ambient.intensity, 0.3);
  assert.equal(sun.intensity, 0.4);
  assert.equal(calls.filter((call) => call[0] === "post-dispose").length, 1);
  assert.equal(calls.filter((call) => call[0] === "environment-dispose").length, 1);
  assert.equal(calls.filter((call) => call[0] === "effects-dispose").length, 1);
});

test("cleanup restores renderer state even when an adapter disposer fails", async () => {
  const profile = JSON.parse(await readFile(PROFILE_URL, "utf8"));
  const renderer = new FakeRenderer();
  const scene = new Scene();
  const originalFog = { original: true };
  scene.fog = originalFog;
  const camera = new PerspectiveCamera();
  const calls = [];
  const runtime = await createVisualRuntime({
    profile,
    renderer,
    scene,
    camera,
    tierId: "mobile",
    deviceClass: "mobile",
    postStackFactory: () => ({
      render: () => true,
      setSize: () => {},
      dispose: () => calls.push("post"),
    }),
    environmentFactory: async () => ({ dispose: () => calls.push("environment") }),
    effectsFactory: async () => ({ dispose: () => { calls.push("effects"); throw new Error("effects failed"); } }),
  });
  await assert.rejects(runtime.dispose(), /effects failed/);
  assert.deepEqual(calls, ["effects", "environment", "post"]);
  assert.equal(scene.fog, originalFog);
  assert.equal(renderer.toneMapping, 77);
  assert.equal(renderer.toneMappingExposure, 0.5);
});

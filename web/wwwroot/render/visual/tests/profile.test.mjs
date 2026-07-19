import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  loadVisualProfile,
  normalizeVisualProfile,
  selectVisualQualityTier,
} from "../profile.js";

const PROFILE_URL = new URL("../../../content/packs/korea-1950s/visual-profile.json", import.meta.url);

async function canonicalProfile() {
  return JSON.parse(await readFile(PROFILE_URL, "utf8"));
}

test("normalizes the canonical desktop profile into renderer-facing settings", async () => {
  const profile = await canonicalProfile();
  const config = normalizeVisualProfile(profile, { tierId: "desktop" });
  assert.equal(config.profileId, "visual.korea-1950s.default.v1");
  assert.equal(config.tier.settings.shadowMapSize, 2048);
  assert.equal(config.renderer.toneMapping, "aces_filmic");
  assert.equal(config.renderer.exposure, 1.02);
  assert.equal(config.environment.fog.mode, "linear");
  assert.equal(config.environment.lighting.sunColor, "#FFE3B7");
  assert.equal(config.readability.distantRepresentation.mode, "silhouette_impostor");
  assert.equal(config.postProcessing.antialiasing, "smaa");
  assert.equal(config.postProcessing.bloom.enabled, true);
  assert.equal(config.effects.byEventId["event.weapon.gun-fire.v1"].settings.tracerEveryRounds, 4);
  assert.ok(Object.isFrozen(config.effects.byEventId));
});

test("derives a cheap mobile path without mutating the source profile", async () => {
  const profile = await canonicalProfile();
  const before = JSON.stringify(profile);
  const config = normalizeVisualProfile(profile, { deviceClass: "mobile" });
  assert.equal(config.tier.id, "mobile");
  assert.equal(config.postProcessing.enabled, false);
  assert.equal(config.postProcessing.antialiasing, "none");
  assert.equal(config.renderer.pixelRatioCap, 1.4);
  assert.equal(JSON.stringify(profile), before);
});

test("extension overrides remain bounded and tier-specific", async () => {
  const profile = await canonicalProfile();
  profile.extensions = {
    postProcessing: {
      bloom: { strength: 99 },
      tiers: { balanced: { antialiasing: "smaa", bloom: { enabled: true, strength: 0.25 } } },
    },
    adaptiveResolution: { tiers: { balanced: { minScale: 0.8, targetFps: 55 } } },
  };
  const balanced = normalizeVisualProfile(profile, { tierId: "balanced" });
  const desktop = normalizeVisualProfile(profile, { tierId: "desktop" });
  assert.equal(balanced.postProcessing.antialiasing, "smaa");
  assert.equal(balanced.postProcessing.bloom.enabled, true);
  assert.equal(balanced.postProcessing.bloom.strength, 0.25);
  assert.equal(balanced.adaptiveResolution.minScale, 0.8);
  assert.equal(desktop.postProcessing.bloom.strength, 2);
});

test("loads through an injected fetch and resolves a stable absolute URL", async () => {
  const profile = await canonicalProfile();
  const requests = [];
  const result = await loadVisualProfile({
    profileUrl: "visual-profile.json",
    baseUrl: "https://assets.example.test/packs/korea/entry.js",
    tierId: "balanced",
    fetch: async (url) => {
      requests.push(url);
      return { ok: true, json: async () => profile };
    },
  });
  assert.deepEqual(requests, ["https://assets.example.test/packs/korea/visual-profile.json"]);
  assert.equal(result.profileUrl, requests[0]);
  assert.equal(result.config.tier.id, "balanced");
});

test("quality selection fails explicitly for an unknown requested tier", async () => {
  const profile = await canonicalProfile();
  const tiers = normalizeVisualProfile(profile, { tierId: "desktop" }).tiers;
  assert.throws(() => selectVisualQualityTier(tiers, { tierId: "cinema" }), /Unknown visual quality tier/);
});

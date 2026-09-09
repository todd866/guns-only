import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as THREE from "../../../vendor/three.module.js";
import {
  COBRA_CANYON_ROCK_TEXTURE_URL,
  COBRA_CANYON_CANOPY_TEXTURE_URL,
  disposeCobraCanyonSurfaceTextures,
  loadCobraCanyonSurfaceTextures,
  resolveCobraCanyonSurfaceTextures,
} from "../cobra_canyon_surface_textures.js";
import {
  createCobraCanyonBasinMaterial,
  flatGroundLight,
  flatGroundShadowLight,
} from "../cobra_canyon_terrain_material.js";
import { COBRA_CANYON_VISUAL_PROFILE } from "../cobra_canyon_visual_profile.js";
import { loadSchemas, validateSchema } from "../../../../../tools/assets/lib/schema.mjs";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const SURFACES = "content/packs/cobra-vietnam/environment/surfaces";
const jsonAt = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function webpChunks(bytes) {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length);
  const chunks = new Map();
  for (let offset = 12; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, "truncated WebP chunk header");
    const name = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + size <= bytes.length, `truncated ${name} chunk`);
    chunks.set(name, bytes.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size + (size & 1);
  }
  return chunks;
}

test("both surface textures agree with retained RGB source provenance, rights and schemas", async () => {
  const manifest = await jsonAt(`${SURFACES}/asset-manifest.json`);
  const licenses = await jsonAt(`${SURFACES}/licenses.json`);
  const schemas = await loadSchemas(path.join(ROOT, "content/schemas"));
  for (const [document, schemaName] of [
    [manifest, "asset-manifest.schema.json"], [licenses, "asset-license-set.schema.json"],
  ]) {
    const file = path.join(ROOT, "content/schemas", schemaName);
    assert.deepEqual(validateSchema(document, { file, schema: schemas.byFile.get(file) }, schemas), []);
  }
  assert.equal(manifest.assets.length, 2);
  for (const [id, url] of [
    ["environment.surface.limestone-generated.v1", COBRA_CANYON_ROCK_TEXTURE_URL],
    ["environment.surface.canopy-generated.v1", COBRA_CANYON_CANOPY_TEXTURE_URL],
  ]) {
  const texture = manifest.assets.find((asset) => asset.id === id);
  assert.ok(texture);
  assert.equal(texture.extensions.epistemic, "fiction");
  assert.equal(texture.extensions.encoding, "rgb-albedo-v1");
  assert.equal(texture.extensions.sourceSeamless, false);
  assert.equal(texture.extensions.wrapping, "MirroredRepeatWrapping");
  const runtime = texture.sources[0];
  assert.equal(url, `/${SURFACES}/${runtime.uri}`);
  const bytes = await readFile(path.join(ROOT, SURFACES, runtime.uri));
  assert.equal(bytes.length, runtime.sizeBytes);
  assert.equal(sha256(bytes), runtime.sha256);
  const chunks = webpChunks(bytes);
  assert.equal(chunks.has("ALPH"), false, "the opaque color artwork must not acquire an alpha layer");
  const vp8 = chunks.get("VP8 ");
  assert.ok(vp8, "reviewed lossy WebP encoding must remain VP8");
  assert.equal(vp8.subarray(3, 6).toString("hex"), "9d012a");
  assert.equal(vp8.readUInt16LE(6) & 0x3fff, 1024);
  assert.equal(vp8.readUInt16LE(8) & 0x3fff, 1024);
  const license = licenses.entries.find((entry) => entry.licenseId === texture.licenseRef);
  assert.ok(license.appliesTo.includes(texture.id));
  assert.equal(license.redistribution.allowed, true);
  assert.ok(license.evidence.some((item) => item.type === "author_statement"));

  const provenance = await jsonAt(texture.extensions.provenance);
  assert.equal(provenance.source.hasAlpha, false);
  assert.equal(provenance.runtime.hasAlpha, false);
  assert.equal(provenance.runtime.sha256, runtime.sha256);
  assert.equal(provenance.runtime.sizeBytes, runtime.sizeBytes);
  assert.equal(provenance.model, null, "unreported backend model identity must remain unknown");
  assert.deepEqual(provenance.imageInputs, []);
  const master = await readFile(path.join(ROOT, provenance.source.path));
  assert.equal(master.length, provenance.source.sizeBytes);
  assert.equal(sha256(master), provenance.source.sha256);
  assert.equal(master.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(master.readUInt32BE(16), 1254);
  assert.equal(master.readUInt32BE(20), 1254);
  assert.equal(master[24], 8);
  assert.equal(master[25], 2, "exact generated master is RGB PNG, not a packed height or alpha map");
  for (const name of [runtime.uri, "asset-manifest.json", "licenses.json", "SOURCES.md"]) {
    assert.deepEqual(await readFile(path.join(ROOT, "web/wwwroot", SURFACES, name)),
      await readFile(path.join(ROOT, SURFACES, name)), `${name} canonical/staged copies differ`);
  }
  }
});

test("surface loader uploads both sRGB textures with mirrored mipmapped sampling", async () => {
  const requested = [];
  const rock = new THREE.Texture();
  const canopy = new THREE.Texture();
  const fake = { ...THREE, TextureLoader: class {
    load(url, onLoad) {
      requested.push(url);
      queueMicrotask(() => onLoad(url === COBRA_CANYON_ROCK_TEXTURE_URL ? rock : canopy));
    }
  } };
  const loaded = await loadCobraCanyonSurfaceTextures(fake);
  assert.deepEqual(requested, [COBRA_CANYON_ROCK_TEXTURE_URL, COBRA_CANYON_CANOPY_TEXTURE_URL]);
  assert.strictEqual(loaded.rock, rock);
  assert.strictEqual(loaded.canopy, canopy);
  assert.equal(loaded.url, COBRA_CANYON_ROCK_TEXTURE_URL);
  assert.equal(loaded.canopyUrl, COBRA_CANYON_CANOPY_TEXTURE_URL);
  assert.equal(Object.isFrozen(loaded), true);
  for (const texture of [rock, canopy]) {
    assert.equal(texture.wrapS, THREE.MirroredRepeatWrapping);
    assert.equal(texture.wrapT, THREE.MirroredRepeatWrapping);
    assert.equal(texture.magFilter, THREE.LinearFilter);
    assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(texture.generateMipmaps, true);
    assert.equal(texture.anisotropy, 4);
    assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
    assert.ok(texture.version > 0, "the loaded image must be marked for GPU upload");
  }
  disposeCobraCanyonSurfaceTextures(loaded);
});

test("surface load failures fall back without preventing a sortie", async () => {
  const failure = new Error("surface unavailable");
  const requested = [];
  const fake = { ...THREE, TextureLoader: class {
    load(url, _onLoad, _onProgress, onError) {
      requested.push(url);
      queueMicrotask(() => onError(failure));
    }
  } };
  const custom = "/missing-optional-surface.webp";
  const customCanopy = "/missing-optional-canopy.webp";
  const options = { url: custom, canopyUrl: customCanopy };
  await assert.rejects(loadCobraCanyonSurfaceTextures(fake, options),
    (error) => error instanceof AggregateError && error.errors.length === 2
      && error.errors.every((cause) => cause === failure));
  assert.equal(await resolveCobraCanyonSurfaceTextures(fake, options), null);
  assert.deepEqual(requested, [custom, customCanopy, custom, customCanopy]);
  await assert.rejects(loadCobraCanyonSurfaceTextures({}), TypeError);
  assert.equal(await resolveCobraCanyonSurfaceTextures({}), null);
});

test("one failed surface never discards or disposes the other successful image", async () => {
  for (const failed of ["rock", "canopy"]) {
    const success = new THREE.Texture();
    let disposals = 0;
    success.addEventListener("dispose", () => { disposals++; });
    const fake = { ...THREE, TextureLoader: class {
      load(url, onLoad, _progress, onError) {
        const key = url === COBRA_CANYON_ROCK_TEXTURE_URL ? "rock" : "canopy";
        queueMicrotask(() => key === failed ? onError(new Error("optional image missing")) : onLoad(success));
      }
    } };
    const loaded = await resolveCobraCanyonSurfaceTextures(fake);
    assert.ok(loaded, "a successful partial set must be returned");
    assert.equal(loaded[failed], null);
    assert.strictEqual(loaded[failed === "rock" ? "canopy" : "rock"], success);
    assert.equal(disposals, 0, "a sibling's failure must not discard the successful GPU resource");
    disposeCobraCanyonSurfaceTextures(loaded);
    assert.equal(disposals, 1);
  }
});

test("surface owner disposes aliased resources once and tolerates an absent texture set", () => {
  const shared = new THREE.Texture();
  let disposals = 0;
  shared.addEventListener("dispose", () => { disposals++; });
  disposeCobraCanyonSurfaceTextures({ rock: shared, canopy: shared });
  assert.equal(disposals, 1);
  assert.doesNotThrow(() => disposeCobraCanyonSurfaceTextures(null));
});

test("basin material borrows the shared texture and leaves fallback material independent", () => {
  const rock = new THREE.Texture();
  let textureDisposals = 0;
  rock.addEventListener("dispose", () => { textureDisposals += 1; });
  const textured = createCobraCanyonBasinMaterial(THREE, COBRA_CANYON_VISUAL_PROFILE, { rock });
  const fallback = createCobraCanyonBasinMaterial(THREE, COBRA_CANYON_VISUAL_PROFILE);
  assert.strictEqual(textured.uniforms.uRockSurface.value, rock,
    "uniform construction must not clone the page-owned texture");
  assert.equal(textured.uniforms.uRockSurfaceEnabled.value, 1);
  assert.equal(fallback.uniforms.uRockSurface.value, null);
  assert.equal(fallback.uniforms.uRockSurfaceEnabled.value, 0);
  textured.dispose();
  fallback.dispose();
  assert.equal(textureDisposals, 0, "quality rebuild material disposal must not dispose the shared texture");
  rock.dispose();
  assert.equal(textureDisposals, 1, "the page retains texture disposal ownership");
});

test("river-bank lighting retains open-sky bounce in full sun and cast shadow", () => {
  // A fully sun-facing flat surface reaches tone 1; cast shadow reaches tone 0.2.
  // Analytic channel values include 0.18 * skyFill in BOTH cases. Omitting that fill made
  // the river's gravel darker than the neighbouring basin under the same daylight.
  const fixture = {
    sunDirectionWorld: [0, 1, 0],
    terrainPaint: {
      shadowFloor: 0.2,
      skyFill: [0.2, 0.4, 0.8],
      sunKey: [1.0, 0.9, 0.6],
      toneRampGates: [{ start: 0.2, end: 0.4, weight: 0.4 },
        { start: 0.6, end: 0.8, weight: 0.6 }],
    },
  };
  for (const [actual, expected] of [
    [flatGroundLight(fixture), [1.036, 0.972, 0.744]],
    [flatGroundShadowLight(fixture), [0.108, 0.172, 0.296]],
  ]) {
    for (let channel = 0; channel < 3; channel++) {
      assert.ok(Math.abs(actual[channel] - expected[channel]) < 1e-12,
        `channel ${channel}: ${actual[channel]} differs from ${expected[channel]}`);
    }
  }
});

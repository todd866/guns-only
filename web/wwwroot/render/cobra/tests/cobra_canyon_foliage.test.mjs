import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as THREE from "../../../vendor/three.module.js";
import { planCobraCanyonWorld } from "../cobra_canyon_plan.js";
import { createCobraCanyonAssetKit } from "../cobra_canyon_asset_kit.js";
import {
  COBRA_VIETNAM_FOLIAGE_ATLAS_URL, loadCobraVietnamFoliageTextures,
} from "../cobra_canyon_foliage.js";
import { loadSchemas, validateSchema } from "../../../../../tools/assets/lib/schema.mjs";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const FOLIAGE = "content/packs/cobra-vietnam/environment/foliage";
const readJson = async (name) => JSON.parse(await readFile(path.join(ROOT, FOLIAGE, name), "utf8"));

test("the live generated atlas has reviewed RGB encoding, rights and identical staged bytes", async () => {
  const manifest = await readJson("asset-manifest.json");
  const licenses = await readJson("licenses.json");
  const schemas = await loadSchemas(path.join(ROOT, "content/schemas"));
  for (const [document, schema] of [
    [manifest, "asset-manifest.schema.json"], [licenses, "asset-license-set.schema.json"],
  ]) {
    const file = path.join(ROOT, "content/schemas", schema);
    assert.deepEqual(validateSchema(document, { file, schema: schemas.byFile.get(file) }, schemas), []);
  }
  const texture = manifest.assets.find((asset) => asset.kind === "texture");
  assert.equal(texture.extensions.epistemic, "fiction");
  assert.equal(texture.extensions.encoding, "black-matte-v1");
  const source = texture.sources[0];
  assert.equal(COBRA_VIETNAM_FOLIAGE_ATLAS_URL, `/${FOLIAGE}/${source.uri}`);
  const bytes = await readFile(path.join(ROOT, FOLIAGE, source.uri));
  assert.equal(bytes.length, source.sizeBytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 1024);
  assert.equal(bytes.readUInt32BE(20), 512);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[25], 2, "the source is honestly recorded as RGB, not fabricated alpha");
  const license = licenses.entries.find((entry) => entry.licenseId === texture.licenseRef);
  assert.ok(license.appliesTo.includes(texture.id));
  assert.equal(license.redistribution.allowed, true);
  assert.ok(license.evidence.some((evidence) => evidence.type === "author_statement"));
  for (const name of [source.uri, "asset-manifest.json", "licenses.json", "SOURCES.md"]) {
    assert.deepEqual(await readFile(path.join(ROOT, "web/wwwroot", FOLIAGE, name)),
      await readFile(path.join(ROOT, FOLIAGE, name)), `${name} canonical/staged copies differ`);
  }
});

test("only generated jungle cards interpret black as coverage, including shadows and disposal", async () => {
  const textureLoader = { ...THREE, TextureLoader: class {
    load(url, onLoad) { queueMicrotask(() => onLoad(new THREE.Texture())); }
  } };
  const world = JSON.parse(await readFile(new URL(
    "../../../content/packs/cobra-vietnam/environment/cobra-canyon.world.json", import.meta.url), "utf8"));
  const plan = planCobraCanyonWorld(world, { qualityTier: "mobile" });

  for (const generated of [true, false]) {
    const foliageTextures = await loadCobraVietnamFoliageTextures(textureLoader, generated ? {} : {
      url: "/content/packs/cobra-vietnam/environment/foliage/foliage-atlas.png",
    });
    assert.equal(foliageTextures.atlas.userData.cobraFoliageEncoding === "black-matte-v1", generated);
    const kit = createCobraCanyonAssetKit(THREE, plan, {
      qualityTier: "mobile", maxInstances: 330, foliageTextures,
    });
    const shadowDisposals = [];
    kit.group.traverse((mesh) => {
      if (!mesh.isInstancedMesh) return;
      const encoded = generated && mesh.userData.cobraCanyon.role === "jungle";
      if (mesh.userData.cobraCanyon.role === "jungle") {
        assert.deepEqual(mesh.material.color.toArray(), generated ? [1, 1, 1] : [1.16, 1.22, 1.10],
          "the generated source must not inherit the legacy atlas brightness boost");
      }
      assert.equal(Boolean(mesh.customDepthMaterial), encoded);
      assert.equal(Boolean(mesh.customDistanceMaterial), encoded);
      if (!encoded) return;
      for (const [material, shaderType] of [
        [mesh.material, "basic"], [mesh.customDepthMaterial, "depth"],
        [mesh.customDistanceMaterial, "distanceRGBA"],
      ]) {
        const shader = { fragmentShader: THREE.ShaderLib[shaderType].fragmentShader };
        material.onBeforeCompile(shader);
        assert.equal(shader.fragmentShader.split("texture2D( map,").length - 1, 1,
          "encoded coverage reuses the colour sample in every pass");
        assert.match(shader.fragmentShader, /diffuseColor\.a \*= foliageCoverage/);
        assert.ok(shader.fragmentShader.indexOf("foliageCoverage")
          < shader.fragmentShader.indexOf("#include <alphatest_fragment>"));
        const disposal = { count: 0 };
        material.addEventListener("dispose", () => { disposal.count += 1; });
        shadowDisposals.push(disposal);
      }
    });
    kit.dispose();
    assert.ok(shadowDisposals.every((disposal) => disposal.count === 1));
    foliageTextures.atlas.dispose();
  }
});

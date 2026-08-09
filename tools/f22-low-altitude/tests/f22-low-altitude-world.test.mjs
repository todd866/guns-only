import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildContract,
  CONTRACT_FLOAT_SIGNIFICANT_DIGITS,
} from "../export-f22-low-altitude-world.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUTPUTS = [
  "content/packs/ukraine-modern/presentation/"
    + "f22-low-altitude-world.web-build-299.v1.json",
  "web/wwwroot/content/packs/ukraine-modern/presentation/"
    + "f22-low-altitude-world.web-build-299.v1.json",
  "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/UkraineModern/presentation/"
    + "f22-low-altitude-world.web-build-299.v1.json",
];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

test("frozen F-22 cell is byte-identical to the current Web planner output", () => {
  const expected = buildContract();
  for (const relative of OUTPUTS) {
    assert.equal(fs.readFileSync(path.join(ROOT, relative), "utf8"), expected, relative);
  }
  const pending = [JSON.parse(expected)];
  while (pending.length > 0) {
    const value = pending.pop();
    if (Array.isArray(value)) {
      pending.push(...value);
    } else if (value !== null && typeof value === "object") {
      pending.push(...Object.values(value));
    } else if (typeof value === "number" && !Number.isInteger(value)) {
      assert.equal(value, Number(value.toPrecision(CONTRACT_FLOAT_SIGNIFICANT_DIGITS)));
    }
  }
});

test("contract freezes exact source terrain, foliage and the four start-cell chunks", () => {
  const contract = JSON.parse(buildContract());
  assert.equal(contract.terrain.sha256,
    "ae3f377f360a81e3fc4482d6bc8410190968da69749c5333f038e1d99aa07908");
  assert.equal(contract.foliageAtlas.sha256,
    "9172d362a64332cb87535359b2ed9553db28fb01628de909196446ff34ccfec4");
  assert.deepEqual(contract.coordinateFrame.unityMapping, ["east", "up", "-north"]);
  assert.deepEqual(contract.planner.selectedChunkIds, [
    "e0045-n0025",
    "e0046-n0025",
    "e0045-n0026",
    "e0046-n0026",
  ]);
  assert.equal(contract.chunks.length, 4);
  assert.ok(contract.counts.trees > 2_000);
  assert.ok(contract.counts.buildings > 100);
  assert.ok(contract.counts.roadSegments > 0);
  assert.ok(contract.chunks.every((chunk) => chunk.sourceRecord.sampleCount === 257));
  assert.equal(contract.foliageAtlas.roles.length, 4);
  assert.equal(contract.foliageAtlas.alphaCutoff, 0.38);
});

test("canonical and browser foliage assets remain exact contract bytes", () => {
  const contract = JSON.parse(buildContract());
  for (const relative of [
    "content/packs/ukraine-modern/environment/foliage/ukraine-temperate-foliage-v1.png",
    "web/wwwroot/content/packs/ukraine-modern/environment/foliage/"
      + "ukraine-temperate-foliage-v1.png",
  ]) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, relative))),
      contract.foliageAtlas.sha256, relative);
  }
});

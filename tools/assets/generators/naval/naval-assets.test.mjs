import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "../../../../web/wwwroot/vendor/three.module.js";
import { buildNavalAssetSpecs } from "../naval-assets.mjs";
import { measureScene } from "./geometry.mjs";

function byId(specs, id) {
  const spec = specs.find((value) => value.assetId === id);
  assert.ok(spec, `missing ${id}`);
  return spec;
}

function objectByName(scene, name) {
  const object = scene.getObjectByName(name);
  assert.ok(object, `missing scene node ${name}`);
  return object;
}

function rounded(values) {
  return Array.from(values, (value) => Number(value.toFixed(6)));
}

function semanticSignature(spec) {
  const nodes = [];
  spec.scene.traverse((object) => {
    nodes.push({
      name: object.name,
      type: object.type,
      position: rounded(object.position.toArray()),
      rotation: rounded([object.rotation.x, object.rotation.y, object.rotation.z]),
      scale: rounded(object.scale.toArray()),
      geometry: object.geometry ? {
        name: object.geometry.name,
        positions: object.geometry.getAttribute("position")?.count ?? 0,
        indices: object.geometry.index?.count ?? 0,
      } : null,
      material: Array.isArray(object.material)
        ? object.material.map((value) => value?.name ?? null)
        : object.material?.name ?? null,
      instances: object.isInstancedMesh ? {
        count: object.count,
        matrices: rounded(object.instanceMatrix.array),
      } : null,
      anchorId: object.userData.anchorId ?? null,
    });
  });
  return { assetId: spec.assetId, output: spec.output, anchors: spec.anchors, metadata: spec.metadata, nodes };
}

test("naval builder returns canonical carrier and reusable destroyer specs", () => {
  const specs = buildNavalAssetSpecs(THREE);
  assert.deepEqual(specs.map((spec) => spec.assetId), [
    "platform.carrier.straight-deck.v1",
    "platform.escort.gun-destroyer.v1",
  ]);
  assert.equal(new Set(specs.map((spec) => spec.output)).size, 2);
  for (const spec of specs) {
    assert.equal(spec.scene.isObject3D, true);
    assert.match(spec.output, /^models\/naval\/[a-z0-9-]+\.glb$/);
    assert.deepEqual(spec.metadata.coordinateSystem, {
      units: "metres", upAxis: "+y", forwardAxis: "-z", handedness: "right",
    });
  }
});

test("carrier has real-scale hull, deck, starboard island, markings, lights, and recovery contract", () => {
  const carrier = byId(buildNavalAssetSpecs(THREE), "platform.carrier.straight-deck.v1");
  const metrics = measureScene(THREE, carrier.scene);
  assert.ok(Math.abs(metrics.bounds.size[2] - 266) < 0.01);
  assert.ok(metrics.bounds.size[0] >= carrier.metadata.dimensions.flightDeckWidthMetres);
  assert.ok(metrics.bounds.min[1] < -26 && metrics.bounds.max[1] > 30);
  assert.ok(objectByName(carrier.scene, "FLIGHT_DECK").isMesh);
  assert.ok(objectByName(carrier.scene, "CARRIER_HULL").isMesh);
  assert.ok(objectByName(carrier.scene, "ISLAND_BRIDGE").position.x > 0, "island must be starboard (+X)");
  assert.ok(objectByName(carrier.scene, "LANDING_CENTRE_DASHES").isInstancedMesh);
  assert.ok(objectByName(carrier.scene, "DECK_EDGE_LIGHTS").isInstancedMesh);
  assert.ok(objectByName(carrier.scene, "LSO_DATUM_LIGHTS").isInstancedMesh);

  const deck = objectByName(carrier.scene, "SOCKET_DECK_ORIGIN");
  const threshold = objectByName(carrier.scene, "SOCKET_RECOVERY_THRESHOLD");
  const bow = objectByName(carrier.scene, "SOCKET_BOW_REFERENCE");
  assert.ok(deck.position.y > 0);
  assert.ok(threshold.position.z > deck.position.z, "recovery threshold belongs at the stern approach end (+Z)");
  assert.ok(bow.position.z < deck.position.z, "bow must point along -Z");
  assert.deepEqual(carrier.anchors.slice(0, 2).map(({ id, node }) => ({ id, node })), [
    { id: "deck.origin", node: "SOCKET_DECK_ORIGIN" },
    { id: "recovery.threshold", node: "SOCKET_RECOVERY_THRESHOLD" },
  ]);
});

test("destroyer reads as a period gun escort and preserves the same world frame", () => {
  const escort = byId(buildNavalAssetSpecs(THREE), "platform.escort.gun-destroyer.v1");
  const metrics = measureScene(THREE, escort.scene);
  assert.ok(Math.abs(metrics.bounds.size[2] - 119) < 0.01);
  assert.ok(Math.abs(metrics.bounds.size[0] - 12.9) < 0.01);
  assert.ok(objectByName(escort.scene, "MOUNT_51_HOUSE").position.z < 0);
  assert.ok(objectByName(escort.scene, "MOUNT_53_HOUSE").position.z > 0);
  assert.ok(objectByName(escort.scene, "FORWARD_FUNNEL").isMesh);
  assert.ok(objectByName(escort.scene, "TORPEDO_MOUNT").isMesh);
  assert.ok(objectByName(escort.scene, "SOCKET_BOW_REFERENCE").position.z < 0);
  assert.ok(objectByName(escort.scene, "SOCKET_WAKE_ORIGIN").position.z > 0);
});

test("naval geometry stays inside declared triangle, draw-call, and material budgets", () => {
  for (const spec of buildNavalAssetSpecs(THREE)) {
    const metrics = measureScene(THREE, spec.scene);
    assert.ok(metrics.renderedTriangles <= spec.metadata.budgets.triangles, `${spec.assetId} triangle budget`);
    assert.ok(metrics.drawCalls <= spec.metadata.budgets.drawCalls, `${spec.assetId} draw-call budget`);
    assert.ok(metrics.materials <= spec.metadata.budgets.materials, `${spec.assetId} material budget`);
    assert.equal(metrics.materials, spec.metadata.metrics.materials);
    assert.ok(metrics.renderedTriangles > 1000, `${spec.assetId} unexpectedly lacks authored detail`);
    assert.ok(metrics.drawCalls <= 18, `${spec.assetId} should consolidate static material batches`);
  }
});

test("all render geometry is finite, UV-authored, PBR-ready, named, and free of runtime lights", () => {
  for (const spec of buildNavalAssetSpecs(THREE)) {
    let tangentMeshes = 0;
    const textures = new Set();
    spec.scene.traverse((object) => {
      assert.equal(object.isCamera === true || object.isLight === true, false, `${spec.assetId} contains runtime-owned ${object.type}`);
      if (!object.isMesh) return;
      assert.ok(object.name.length > 0);
      assert.ok(object.geometry.name.length > 0);
      const position = object.geometry.getAttribute("position");
      const normal = object.geometry.getAttribute("normal");
      const uv = object.geometry.getAttribute("uv");
      const tangent = object.geometry.getAttribute("tangent");
      assert.ok(position?.count > 0);
      assert.equal(uv?.count, position.count, `${object.name} UV0 coverage`);
      assert.equal(Array.from(position.array).every(Number.isFinite), true, `${object.name} has invalid positions`);
      assert.equal(Array.from(normal.array).every(Number.isFinite), true, `${object.name} has invalid normals`);
      if (tangent) {
        tangentMeshes++;
        assert.equal(tangent.count, position.count, `${object.name} tangent coverage`);
        assert.equal(Array.from(tangent.array).every(Number.isFinite), true, `${object.name} has invalid tangents`);
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material ?? {})) if (value?.isTexture) textures.add(value);
      }
    });
    assert.ok(tangentMeshes >= 2, `${spec.assetId} should retain tangents on major indexed surfaces`);
    assert.ok(textures.size >= 6, `${spec.assetId} should bind paint and deck PBR texture sets`);
    for (const anchor of spec.anchors) {
      const expected = `SOCKET_${anchor.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
      assert.equal(anchor.node, expected);
      assert.equal(objectByName(spec.scene, anchor.node).userData.anchorId, anchor.id);
    }
  }
});

test("naval asset construction is semantically deterministic", () => {
  const first = buildNavalAssetSpecs(THREE).map(semanticSignature);
  const second = buildNavalAssetSpecs(THREE).map(semanticSignature);
  assert.deepEqual(first, second);
});

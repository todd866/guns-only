import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";

import {
  COBRA_STRUCTURE_SURFACES,
  createCobraStructureMaterial,
} from "../cobra_structure_material.js";

/** Runs the material's onBeforeCompile the way three.js does, returning the patched shader. */
function compiled(material) {
  const shader = {
    uniforms: {},
    vertexShader: [
      "#include <common>",
      "void main() {",
      "  #include <begin_vertex>",
      "  #include <worldpos_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "#include <common>",
      "void main() {",
      "  vec4 diffuseColor = vec4( diffuse, opacity );",
      "  #include <color_fragment>",
      "}",
    ].join("\n"),
  };
  material.onBeforeCompile(shader);
  return shader;
}

test("every authored structure surface is named with a plausible wear scale", () => {
  const roles = Object.keys(COBRA_STRUCTURE_SURFACES);
  for (const role of ["bridge-deck", "bridge-pier", "roads", "heroCells", "landmarks"]) {
    assert.ok(roles.includes(role), `${role} must get surface detail`);
    const surface = COBRA_STRUCTURE_SURFACES[role];
    // Metre-scale grain: a 30 m AGL pass must see change across the deck, not one flat fill.
    assert.ok(surface.grainMetres >= 0.4 && surface.grainMetres <= 12.0,
      `${role} grain ${surface.grainMetres} m is outside human-visible scale`);
    assert.ok(surface.wear >= 0.0 && surface.wear <= 1.0);
  }
});

test("the material injects world-position detail into the fragment shader", () => {
  const material = createCobraStructureMaterial(THREE, "bridge-deck", { color: 0xc9b89a });
  const shader = compiled(material);

  assert.match(shader.fragmentShader, /cobraHash/, "reuses the precision-safe hash");
  assert.match(shader.fragmentShader, /vCobraStructureWorld/, "detail is driven by world position");
  assert.match(shader.vertexShader, /vCobraStructureWorld =/);
  assert.ok(shader.fragmentShader.indexOf("diffuseColor") > 0);
  // The detail must be applied AFTER diffuseColor exists, or it is compiled away.
  assert.ok(
    shader.fragmentShader.indexOf("cobraStructureDetail")
      > shader.fragmentShader.indexOf("vec4 diffuseColor"),
    "detail must modify diffuseColor, not precede it",
  );
});

test("grain scale reaches the shader as a uniform so roles differ visibly", () => {
  const deck = createCobraStructureMaterial(THREE, "bridge-deck", { color: 0xc9b89a });
  const road = createCobraStructureMaterial(THREE, "roads", { color: 0x7d5638 });
  const deckShader = compiled(deck);
  const roadShader = compiled(road);

  assert.ok(deckShader.uniforms.uCobraGrainMetres);
  assert.notEqual(
    deckShader.uniforms.uCobraGrainMetres.value,
    roadShader.uniforms.uCobraGrainMetres.value,
    "a road and a bridge deck must not wear identically",
  );
});

test("detail survives a shader with no conditional worldpos chunk", () => {
  // MeshLambert only emits <worldpos_vertex> under an envmap/shadow/distance define. Keying
  // the injection off it left the varying at the origin and flattened the detail to one tint.
  const material = createCobraStructureMaterial(THREE, "bridge-deck", { color: 0xc9b89a });
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\nvoid main() {\n  #include <begin_vertex>\n}",
    fragmentShader: "#include <common>\nvoid main() {\n  vec4 diffuseColor = vec4(1.0);\n"
      + "  #include <color_fragment>\n}",
  };
  material.onBeforeCompile(shader);

  assert.match(shader.vertexShader, /vCobraStructureWorld = \(modelMatrix/);
  assert.match(shader.vertexShader, /vCobraStructureNormal = normalize/);
});

test("world position folds in the per-instance transform", () => {
  // These props are InstancedMeshes. Without instanceMatrix every instance samples the same
  // noise coordinate and the detail collapses to a single flat tint across the whole mesh —
  // indistinguishable from the shader not running at all.
  const material = createCobraStructureMaterial(THREE, "bridge-deck", { color: 0xc9b89a });
  const shader = compiled(material);

  assert.match(shader.vertexShader, /#ifdef USE_INSTANCING/);
  assert.match(shader.vertexShader, /instanceMatrix \* cobraStructureLocal/);
  assert.ok(
    shader.vertexShader.indexOf("instanceMatrix * cobraStructureLocal")
      < shader.vertexShader.indexOf("vCobraStructureWorld = (modelMatrix"),
    "the instance transform must be applied BEFORE the model matrix",
  );
});

test("an unknown role falls back rather than throwing mid-scene-build", () => {
  const material = createCobraStructureMaterial(THREE, "not-a-role", { color: 0x808080 });
  assert.ok(material.isMaterial);
  assert.ok(compiled(material).uniforms.uCobraGrainMetres);
});

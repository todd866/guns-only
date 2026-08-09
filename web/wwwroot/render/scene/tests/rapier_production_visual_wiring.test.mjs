import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "../../../vendor/three.module.js";
import { RELEASE_BUILD } from "../../release/release_identity.js";
import { createRapier } from "../scene_builders.js";

const wwwroot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function source(relativePath) {
  return readFileSync(join(wwwroot, relativePath), "utf8");
}

test("production Rapier renders the canonical v2 silhouette and installed inlet incidence", () => {
  const rapier = createRapier();
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());
  const intake = rapier.children.find((child) => /intake/i.test(child.name));

  assert.equal(rapier.userData.airframeId, "rapier.shape-first-engineering.v2");
  assert.equal(rapier.userData.definitionRevision, "2.0.0");
  assert.ok(Math.abs(size.x - 7.35) < 0.002, `rendered span ${size.x}`);
  assert.ok(Math.abs(size.z - 13) < 0.02, `rendered length ${size.z}`);
  assert.ok(intake, "canonical inlet mesh is missing");
  assert.ok(Math.abs(intake.rotation.x - 7.5 * Math.PI / 180) < 1e-12,
    `rendered inlet incidence ${intake.rotation.x * 180 / Math.PI} degrees`);
});

test("Build 238 production wiring selects v2, the real balloon, and compact high-Mach glass", () => {
  const app = source("app.js");
  const hud = source("hud.js");
  const builders = source("render/scene/scene_builders.js");
  const renderer = source("render/scene/airframe_from_definition.js");

  assert.match(builders,
    new RegExp(`import rapierV2Definition from "\\.\\.\\/\\.\\.\\/airframes\\/rapier_v2\\.embedded\\.js\\?v=${RELEASE_BUILD}"`));
  assert.match(builders, /context\.definition \?\? rapierV2Definition/);
  assert.match(renderer,
    new RegExp(`from "\\.\\/shape_first_airframe_adapter\\.js\\?v=${RELEASE_BUILD}"`));
  assert.match(renderer, /intake\.rotation\.x = Number\(def\.intake\.rotX\) \|\| 0/);

  assert.match(app,
    new RegExp(`import \\{ createHighAltitudeBalloon \\} from "\\.\\/render\\/scene\\/high_altitude_balloon\\.js\\?v=${RELEASE_BUILD}"`));
  assert.match(app,
    /\["presentation\.vehicle\.high-altitude-weather-balloon\.target\.v1", createHighAltitudeBalloon\]/);
  assert.match(app, /continuous 35 kPa climb/);
  assert.match(app, /24 km M4\.2 shelf/);

  assert.match(hud,
    new RegExp(`from "\\.\\/render\\/mission\\/rapier_high_mach_instruments\\.js\\?v=${RELEASE_BUILD}"`));
  assert.match(hud, /createRapierHighMachHistory\(\)/);
  assert.match(hud, /advanceRapierHighMachInstruments\(/);
  assert.match(hud, /drawRapierHighMachInstruments\(highMach\.presentation\)/);
});

test("live Rapier sensor view consumes the hidden exterior's canonical cockpit datum", () => {
  const app = source("app.js");

  assert.match(app,
    /resolveRapierCockpitCameraAnchor\(\{[\s\S]*?playerPresentationId:[\s\S]*?playerExteriorSlot:[\s\S]*?semanticAnchor:/,
    "live camera must resolve Rapier's canonical exterior socket when the authored cockpit is hidden");
  assert.match(app, /this\.playerExteriorSlot\.root\.visible = false/,
    "resolving Rapier's camera datum must not expose the ownship exterior in live flight");
});

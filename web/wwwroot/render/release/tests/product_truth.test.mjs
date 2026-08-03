import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  EXPERIENCE_CATALOG,
  EXPERIENCE_RELEASE_STATE,
  productionExperiences,
} from "../../progression/campaign_progression.js";
import { RELEASE_BUILD } from "../release_identity.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

test("README describes the current production door, controls and telemetry boundary", async () => {
  const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
  assert.match(readme, /\[guns-only\.com\]\(https:\/\/guns-only\.com\)/);
  assert.doesNotMatch(readme, /guns-only\.vercel\.app/);
  assert.match(readme, /left stick for throttle\/yaw/i);
  assert.match(readme, /right stick for pitch\/roll/i);
  assert.match(readme, /Hosted flight diagnostics are \*\*off by default\*\*/);
  assert.match(readme, /Node\.js 24, matching CI/);
  assert.match(readme, /docs\/STATUS\.md/);
  assert.match(readme, /Rapier[\s\S]*thin-air M4\.2 shelf[\s\S]*high-altitude balloon/);
  assert.doesNotMatch(readme, /Rapier[^\n]*assigned contract/);
});

test("the browser and installed-app descriptions match the three production aircraft", async () => {
  const [catalogue, manifestText] = await Promise.all([
    readFile(path.join(ROOT, "web/wwwroot/index.html"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/manifest.webmanifest"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(catalogue, /Three production aircraft/);
  assert.match(catalogue, /Weekend Ride coming soon/);
  assert.match(catalogue, /F-22 guns-only/);
  assert.match(catalogue, /Rapier intercept/);
  assert.match(catalogue, /AH-1G Cobra Canyon/);
  assert.match(catalogue, /data-program-node="cobra-lab"/);
  assert.match(catalogue, /data-program-node="weekend-ride"/);
  assert.match(catalogue, /art\/jet-cobra\.webp/);
  assert.match(catalogue, /art\/bike-yzf-r1\.webp/);
  assert.match(manifest.description, /F-22 guns-only dogfighting/);
  assert.match(manifest.description, /Rapier high-altitude balloon intercept/);
  assert.match(manifest.description, /AH-1G Cobra Canyon/);
  assert.doesNotMatch(catalogue, /Seven flight experiences/);
});

test("production Rapier copy describes the deterministic finite-ammo balloon sortie", async () => {
  const app = await readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8");
  const rapier = EXPERIENCE_CATALOG.find(({ id }) => id === "rapier-intercept");
  assert.match(rapier.shortObjective, /thin-air M4\.2 shelf/);
  assert.match(rapier.shortObjective, /high-altitude balloon/);
  assert.match(rapier.shortObjective, /midpoint arrestor/);
  assert.match(app,
    /"rapier-intercept": Object\.freeze\(\{[\s\S]*?canonical full fuel[\s\S]*?finite internal gun[\s\S]*?no auxiliary drones/);
  const brief = app.match(
    /"rapier-intercept": Object\.freeze\(\{([\s\S]*?)\n\s*\}\),\n\s*"ace-duel"/,
  )?.[1] ?? "";
  assert.doesNotMatch(brief, /dealt|allocation-credit|TARGET_REWARD|gun-drones|3,600 LB/i);
  assert.doesNotMatch(app,
    /missionBrief\(\)[\s\S]*?Rapier balance \$\{balance\} CR/,
    "the deterministic Card 12 briefing must not advertise the retired economy ledger");
});

test("legacy Rapier v1 documents cannot claim production authority over v2", async () => {
  const [legacy, legacyCost, airframeGuide] = await Promise.all([
    readFile(path.join(ROOT, "docs/airframes/rapier/README.md"), "utf8"),
    readFile(path.join(ROOT, "docs/airframes/rapier/95-cost-ledger.md"), "utf8"),
    readFile(path.join(ROOT, "docs/airframes/README.md"), "utf8"),
  ]);
  assert.match(legacy, /Superseded production authority/);
  assert.match(legacy, /Rapier v2/);
  assert.match(legacyCost, /Historical Rapier v1 record only/);
  assert.match(airframeGuide, /Production Rapier is v2/);
  assert.match(airframeGuide, /airframes\/rapier\.v2\.json.*canonical/s);
});

test("the evergreen status matrix covers the executable experience catalog", async () => {
  const status = await readFile(path.join(ROOT, "docs/STATUS.md"), "utf8");
  assert.match(status, /Production: Build 244, revision `894edfd/);
  assert.match(status, new RegExp(`Next candidate: Build ${RELEASE_BUILD}`));
  for (const experience of EXPERIENCE_CATALOG) {
    assert.equal(status.includes(`\`${experience.id}\``), true,
      `${experience.id} needs a row in docs/STATUS.md`);
    assert.match(status, new RegExp(`\\*\\*${experience.releaseState}\\*\\*`),
      `${experience.releaseState} needs a documented state meaning and matrix entry`);
  }
  assert.deepEqual(productionExperiences().map(({ id }) => id), [
    "first-merge",
    "rapier-intercept",
    "cobra-lab",
  ]);
  assert.equal(EXPERIENCE_CATALOG.some(({ releaseState }) =>
    releaseState === EXPERIENCE_RELEASE_STATE.QUARANTINED), true);
  assert.match(status, /\?preview=1/);
});

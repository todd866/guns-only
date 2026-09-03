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
  assert.match(readme, /six accepted experiences/i);
  assert.match(readme, /\*\*Top Gun:\*\*.*F-14A.*recover.*carrier/s);
  assert.doesNotMatch(readme, /choose the F-14A or MiG-28 seat/);
  assert.match(readme, /Rapier[\s\S]*visible high-speed path[\s\S]*three balloon mines[\s\S]*lethal drone payloads/);
  assert.doesNotMatch(readme, /Rapier[^\n]*assigned contract/);
});

test("the browser and installed-app descriptions match the six production experiences", async () => {
  const [catalogue, manifestText, cobraLab, weekendRide, okanagan] = await Promise.all([
    readFile(path.join(ROOT, "web/wwwroot/index.html"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/manifest.webmanifest"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/cobra-lab/index.html"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/weekend-ride/index.html"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/okanagan/index.html"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.match(catalogue, /data-domain-filter="military"/);
  assert.match(catalogue, /data-domain-filter="civilian"/);
  assert.match(catalogue, /Top Gun/);
  assert.match(catalogue, /data-program-node="cobra-lab"/);
  assert.match(catalogue, /data-program-node="weekend-ride"/);
  assert.match(catalogue, /data-program-node="top-gun"/);
  assert.match(catalogue, /data-program-node="okanagan-fireboss"/);
  assert.match(catalogue, /art\/jet-cobra\.webp/);
  assert.match(catalogue, /art\/bike-yzf-r1\.webp/);
  assert.match(catalogue, /art\/jet-f14\.webp/);
  assert.match(catalogue, /art\/aircraft-fireboss\.webp/);
  assert.match(manifest.description, /F-22 guns-only dogfighting/);
  assert.match(manifest.description, /Rapier high-altitude balloon intercept/);
  assert.match(manifest.description, /AH-1G Cobra Canyon/);
  assert.match(manifest.description, /YZF-R1 Weekend Ride/);
  assert.match(manifest.description, /Top Gun ACM/);
  assert.match(manifest.description, /Okanagan Fire Boss/);
  assert.doesNotMatch(catalogue, /Seven flight experiences/);
  // Subroute shells must not ask Blazor for /<route>/_framework/dotnet.js.
  // Medevac's <base href="/"> is what makes root-absolute blazor.webassembly.js also resolve
  // subsequent boot resources under /_framework/ rather than /<route>/_framework/.
  for (const [label, html] of [["cobra-lab", cobraLab], ["weekend-ride", weekendRide], ["okanagan", okanagan]]) {
    assert.match(html, /<base href="\/">/,
      `${label} needs a site-root document base for Blazor boot resources`);
    assert.match(html, /script\.src = "\/_framework\/blazor\.webassembly\.js\?v=\d+"/,
      `${label} must load Blazor from the site root`);
    assert.doesNotMatch(html, /script\.src = "\.\.\/_framework\/blazor\.webassembly\.js/,
      `${label} must not use a document-relative framework path`);
    assert.match(html, new RegExp(`import\\("/${label}/main\\.js\\?v=\\d+"\\)`),
      `${label} main entry must stay absolute once <base href="/"> is set`);
  }
});

test("every production flight route uses the shared HUD/input/audio language instead of permanent prose cards", async () => {
  const [main, cobra, cobraCss, okanagan, okanaganHtml] = await Promise.all([
    readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/cobra-lab/main.js"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/cobra-lab/styles.css"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/okanagan/main.js"), "utf8"),
    readFile(path.join(ROOT, "web/wwwroot/okanagan/index.html"), "utf8"),
  ]);
  for (const [label, source] of [["main", main], ["cobra", cobra], ["okanagan", okanagan]]) {
    assert.match(source, /createHud/, `${label} must use the shared HUD renderer`);
    assert.match(source, /updateFlightAudio/, `${label} must use the shared flight-audio facade`);
  }
  assert.match(cobraCss, /body\[data-shell="play"\] \.objective-hud\s*\{[\s\S]*?display:\s*none/,
    "Cobra may retain lab diagnostics, but not a prose objective card in play");
  assert.match(okanagan, /standardGamepadState/);
  assert.match(okanagan, /mobileVirtualStickState/);
  assert.match(okanagan, /event\.code === "Tab"[\s\S]*?cycleTarget/);
  assert.match(okanagan, /event\.code === "KeyV"[\s\S]*?togglePadlock/);
  assert.match(okanagan, /hudFrame\.padlock = padlock && Boolean\(target\)/,
    "padlock camera motion must also switch the shared HUD into padlock presentation");
  assert.match(okanagan, /if \(value\) suspendFlightAudio\("okanagan-paused"\)/,
    "Escape/pause must stop the propulsion graph instead of freezing its last gain");
  assert.match(okanaganHtml, /id="target-button"[\s\S]*?id="padlock-button"/,
    "coarse-pointer pilots need target and padlock controls without a keyboard");
  assert.doesNotMatch(okanaganHtml, /id="mission-strip"|id="objective"|class="instrument-panel"/,
    "Fire Boss must not regress to a stack of text-only mission cards");
});

test("production Rapier copy describes the deterministic finite-ammo balloon sortie", async () => {
  const app = await readFile(path.join(ROOT, "web/wwwroot/app.js"), "utf8");
  const rapier = EXPERIENCE_CATALOG.find(({ id }) => id === "rapier-intercept");
  assert.match(rapier.shortObjective, /visible high-speed path/);
  assert.match(rapier.shortObjective, /three balloon mines at 45,000 ft/);
  assert.match(rapier.shortObjective, /lethal drone payloads before deployment/);
  assert.match(rapier.shortObjective, /recover/);
  assert.match(app,
    /"rapier-intercept": Object\.freeze\(\{[\s\S]*?Three balloon mines[\s\S]*?lethal drone payloads[\s\S]*?finite internal gun[\s\S]*?no auxiliary drones/);
  const brief = app.match(
    /"rapier-intercept": Object\.freeze\(\{([\s\S]*?)\n\s*\}\),\n\s*"ace-duel"/,
  )?.[1] ?? "";
  assert.doesNotMatch(brief, /dealt|allocation-credit|TARGET_REWARD|gun-drones|3,600 LB/i);
  assert.doesNotMatch(app,
    /missionBrief\(\)[\s\S]*?Rapier balance \$\{balance\} CR/,
    "the deterministic Card 12 briefing must not advertise the retired economy ledger");
  assert.doesNotMatch(brief, /M4\.2|one gun pass|PILOT CLIMB|time compression/i,
    "the live briefing must not teach the retired zoom-lob or fast-forward flow");
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
  // Live production identity must name the currently shipped build. A candidate line that
  // merely mentions the live number while Production: still pins an ancestor is how Build 350
  // shipped with STATUS still swearing 343. The Production pin must equal RELEASE_BUILD; the
  // next candidate is either none or a different number.
  assert.match(status, new RegExp(
    `Production: Build ${RELEASE_BUILD}, revision \`[0-9a-f]{40}\``,
  ));
  assert.match(status, /Next candidate: (?:none queued|Build \d+)/);
  assert.doesNotMatch(status, new RegExp(`Next candidate: Build ${RELEASE_BUILD}\\b`));
  assert.match(status, new RegExp(`Live production is Build ${RELEASE_BUILD}, revision \`[0-9a-f]{40}\``));
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
    "weekend-ride",
    "top-gun",
    "okanagan-fireboss",
  ]);
  assert.equal(EXPERIENCE_CATALOG.some(({ releaseState }) =>
    releaseState === EXPERIENCE_RELEASE_STATE.QUARANTINED), true);
  assert.match(status, /\?preview=1/);
});

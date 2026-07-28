import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../../../app.js", import.meta.url);
const indexUrl = new URL("../../../index.html", import.meta.url);
const limitsUrl = new URL("../limits_panel.js", import.meta.url);
const [appSource, indexSource, limitsSource] = await Promise.all([
  readFile(appUrl, "utf8"),
  readFile(indexUrl, "utf8"),
  readFile(limitsUrl, "utf8"),
]);

const updateNavSource = appSource.match(
  /function updateNavConsole\(state\) \{([\s\S]*?)\n}\n+function bindCircuitsSystemsActions/,
)?.[1] ?? "";

test("navigation console is recovery-authoritative and never repairs ETA from TAS", () => {
  assert.ok(updateNavSource, "updateNavConsole must remain inspectable");
  assert.match(updateNavSource,
    /const navigation = recoveryNavigationPresentation\(state\)[\s\S]*?const relevant = navigation\.recoveryPointKnown/);
  for (const field of [
    "rtb_closure_kts",
    "rtb_eta_min",
    "fuel_to_home_estimate_lb",
    "fuel_on_arrival_estimate_lb",
    "fuel_reserve_target_lb",
    "fuel_reserve_margin_lb",
  ]) {
    assert.ok(limitsSource.includes(field),
      `navigation presentation must consume ${field}`);
  }
  assert.doesNotMatch(updateNavSource, /true_airspeed_kts|Math\.sin|Math\.cos|\bvx\b|\bvz\b/,
    "the browser must not reconstruct home closure or substitute TAS");
  assert.match(updateNavSource, /travelState === "outbound"[\s\S]*?etaText = "AWAY"/);
  assert.match(updateNavSource, /travelState === "abeam"[\s\S]*?etaText = "ABEAM"/);
  assert.match(updateNavSource, /fuelToHomeLb[\s\S]*?fuelOnArrivalLb[\s\S]*?reserveTargetLb[\s\S]*?reserveMarginLb/);
});

test("navigation values use the systems-console state vocabulary", () => {
  assert.doesNotMatch(updateNavSource, /["'](?:normal|fault)["']/,
    "normal/fault are not styled tokens in the semantic console");
  for (const state of ["nominal", "warning", "caution", "unknown"]) {
    assert.ok(updateNavSource.includes(`"${state}"`),
      `navigation console should use ${state} where applicable`);
  }
});

test("navigation disclosure mirrors native and KeyN state for assistive technology", () => {
  assert.match(appSource,
    /function syncNavConsoleDisclosure\(\)[\s\S]*?setAttribute\("aria-expanded", String\(navConsole\?\.open === true\)\)/);
  assert.match(appSource,
    /navConsole\?\.addEventListener\("toggle", syncNavConsoleDisclosure\)/,
    "native details activation must synchronize aria-expanded");
  assert.match(appSource,
    /event\.code === "KeyN"[\s\S]*?navConsole\.open = !navConsole\.open;[\s\S]*?syncNavConsoleDisclosure\(\)/,
    "the N shortcut must synchronize aria-expanded immediately");
  assert.match(indexSource,
    /id="nav-console"[\s\S]*?<summary[^>]*aria-expanded="false"[^>]*aria-keyshortcuts="N"/);
});

test("semantic navigation surface exposes protected reserve and separate relief score", () => {
  for (const id of [
    "nav-closure",
    "nav-fuel-arrival",
    "nav-fuel-reserve",
    "nav-fuel-margin",
    "nav-handoff",
    "nav-relief-kills",
  ]) {
    assert.match(indexSource, new RegExp(`id="${id}"`), `${id} output is missing`);
    assert.match(appSource, new RegExp(`#${id}`), `${id} output is not wired`);
  }
  assert.match(updateNavSource, /BELOW RES/);
  assert.match(updateNavSource, /ABOVE RES/);
  assert.match(updateNavSource, /UNCREDITED/);
});

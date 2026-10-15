import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../../../app.js", import.meta.url);
const indexUrl = new URL("../../../index.html", import.meta.url);
const [appSource, indexSource] = await Promise.all([
  readFile(appUrl, "utf8"),
  readFile(indexUrl, "utf8"),
]);

test("shell-health always-on beacon is disclosed beside gameplay opt-in", () => {
  assert.match(appSource, /createShellHealthBeacon/);
  assert.match(indexSource, /Minimal shell-health/i);
  assert.match(indexSource, /boot milestones and fatals|boot and fatal/i);
});

test("detailed gameplay telemetry is explicit opt-in with one Settings switch and a complete tooltip disclosure", () => {
  assert.match(appSource,
    /function loadTelemetrySharingPreference[\s\S]*?getItem\?\.\(TELEMETRY_SHARING_STORAGE_KEY\) === "enabled"[\s\S]*?return false/,
    "missing, malformed, or unavailable storage must keep network sharing off");
  const consentRow = indexSource.match(/<label class="settings-toggle" title="Off by default[^]*?<\/label>/)?.[0];
  assert.ok(consentRow, "the settings row must disclose default-off sharing in its tooltip");
  assert.match(consentRow, /controls, aircraft state, multiplayer identifiers, and browser\/device details are sent/);
  assert.match(consentRow, /Turning it off discards anything not yet sent/);
  assert.match(consentRow, /Share flight diagnostics/);
  assert.match(consentRow, /id="setting-telemetry-sharing" type="checkbox" role="switch"/);
  assert.doesNotMatch(indexSource, /ready-telemetry-sharing|ready-telemetry-disclosure/,
    "Settings is the only consent control");
  assert.doesNotMatch(indexSource, /anonymous flight diagnostics/i,
    "browser and multiplayer identifiers mean this data must not be called anonymous");
  assert.doesNotMatch(indexSource, /_vercel\/insights\/script\.js/,
    "page analytics must not bypass the explicit network-sharing preference during preboot");
  assert.match(appSource,
    /settingsTelemetrySharing\?\.addEventListener\("change"[\s\S]*?commitTelemetrySharingPreference\(settingsTelemetrySharing\.checked\)/,
    "the settings switch must own the existing durable preference");
  assert.match(appSource,
    /settingsTelemetrySharing\.checked = telemetrySharingEnabled/,
    "a stored opt-in must restore the switch state");
  assert.match(appSource,
    /function settingsFocusables\(\)[\s\S]*?input:not\(\[disabled\]\)/,
    "the diagnostics switch must participate in the settings focus trap");

});

test("the recorder cannot buffer or transmit while sharing is disabled", () => {
  assert.match(appSource, /const recorder = \{[\s\S]*?enabled: telemetrySharingEnabled/);
  assert.match(appSource,
    /setEnabled\(nextEnabled\)[\s\S]*?if \(!next\) \{[\s\S]*?_fetchAbortController\?\.abort\(\)[\s\S]*?this\.buf = \[\][\s\S]*?this\._pendingBatch = null[\s\S]*?this\._nextPost = Number\.POSITIVE_INFINITY/,
    "opt-out must abort where possible and destroy every unsent batch");
  for (const method of ["event", "context", "sample", "flush"]) {
    assert.match(appSource, new RegExp(`${method}\\([^)]*\\) \\{\\n    if \\(!this\\.enabled\\) return;`),
      `${method} must be a no-op before touching detailed telemetry state`);
  }
  assert.match(appSource,
    /const fetchAbortController = new AbortController\(\)[\s\S]*?fetch\("\/telemetry"[\s\S]*?signal: fetchAbortController\.signal/,
    "an in-flight upload needs a real cancellation signal for opt-out");
  assert.match(appSource,
    /\.then\(\(response\) => \{\s*if \(fetchAbortController\.signal\.aborted \|\| !this\.enabled\) return;[\s\S]*?\.catch\(\(e\) => \{\s*if \(fetchAbortController\.signal\.aborted\) return;/,
    "an aborted pre-opt-out request must not mutate a newly enabled recorder when it settles late");
});

test("local performance diagnostics remain inspectable without entering the upload buffer", () => {
  assert.match(appSource,
    /document\.documentElement\.dataset\.framePerf = JSON\.stringify\(summary\);[\s\S]*?if \(!this\.enabled\) return;[\s\S]*?this\.enqueue\(/,
    "the frame contract may stay local, but disabled sharing must return before enqueue");
  assert.match(appSource,
    /document\.documentElement\.dataset\.telemetrySharing = telemetrySharingEnabled \? "on" : "off"/,
    "QA and assistive reporting need an inspectable sharing state");
});

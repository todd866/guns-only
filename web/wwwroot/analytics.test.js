const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

test("static shell keeps third-party analytics out and makes hosted diagnostics opt-in", async () => {
  const html = await readFile(path.join(__dirname, "index.html"), "utf8");
  assert.doesNotMatch(html, /\/_vercel\/insights\/script\.js/,
    "anonymous page analytics would bypass the explicit flight-diagnostics consent boundary");
  assert.match(html,
    /<input id="ready-telemetry-sharing" type="checkbox">/);
  assert.match(html, /Off by default\. No gameplay diagnostics are sent\./);
});

test("deployment runbook preserves the same diagnostics consent boundary", async () => {
  const setup = await readFile(path.join(__dirname, "SETUP.md"), "utf8");
  assert.match(setup, /Hosted flight diagnostics are off\s+by default/);
  assert.match(setup, /only after a pilot explicitly opts in/);
  assert.match(setup, /Do not add Vercel Web Analytics/);
  assert.doesNotMatch(setup, /Enable \*\*Web Analytics\*\*/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appUrl = new URL("../../../app.js", import.meta.url);
const indexUrl = new URL("../../../index.html", import.meta.url);

test("room transport failures stay in diagnostics instead of becoming persistent flight cues", async () => {
  const [app, index] = await Promise.all([
    readFile(appUrl, "utf8"),
    readFile(indexUrl, "utf8"),
  ]);

  assert.match(index,
    /id="multiplayer-status"[^>]*aria-live="polite"[^>]*hidden/,
    "the room chip must begin quiet before transport status is known");
  assert.match(app,
    /multiplayerStatus\.hidden = presentation\.phase !== "connecting"/,
    "reconnecting, offline, and routine online presence must not remain over the flight HUD");
  assert.match(app,
    /setAttribute\("aria-live", multiplayerStatus\.hidden \? "off" : "polite"\)/,
    "hidden connection churn must also be quiet for assistive technology");
  assert.match(app,
    /multiplayerStatus\.dataset\.phase = status\.phase[\s\S]*?recorder\.context\("multiplayer", presenceTelemetryContext\(status\)\)/,
    "quiet presentation must retain inspectable diagnostics and bounded telemetry truth");
});

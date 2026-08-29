import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const appUrl = new URL("../../../app.js", import.meta.url);

test("WebBridge exports LaunchFoxTwo and staged Top Gun consumes R without restart fallthrough", async () => {
  const [bridge, app] = await Promise.all([
    readFile(bridgeUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);
  assert.match(bridge,
    /\[JSExport\][\s\S]*?bool LaunchFoxTwo\(\)[\s\S]*?Session\.LaunchFoxTwo\(\)/,
    "LaunchFoxTwo must cross the JSExport boundary into SimulationSession");
  assert.match(app, /function tryLaunchFoxTwo\(\)/);
  assert.match(app, /bridge\.LaunchFoxTwo\(\)/);
  assert.match(app,
    /if \(event\.code === "KeyR"\) \{[\s\S]*?if \(topGunOwnsFoxTwoInput\(\)\) \{[\s\S]*?if \(tryLaunchFoxTwo\(\)\) view\.hud\.armAudio\?\.\(\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?repeatSelectedSortieNow\(\)/,
    "Top Gun must return after a rejected or accepted Fox Two command before generic restart");
  const ownershipBody = app.match(
    /function topGunOwnsFoxTwoInput\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(ownershipBody, /session_phase|pauseReasons|frozen/,
    "Ready, Paused, Active, and terminal Top Gun phases all retain R ownership");
  assert.match(app, /R fox-two/);
});

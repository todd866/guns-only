import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bridgeUrl = new URL("../../../../WebBridge.cs", import.meta.url);
const appUrl = new URL("../../../app.js", import.meta.url);

test("WebBridge exports LaunchFoxTwo and app.js binds R on Top Gun only", async () => {
  const [bridge, app] = await Promise.all([
    readFile(bridgeUrl, "utf8"),
    readFile(appUrl, "utf8"),
  ]);
  assert.match(bridge,
    /\[JSExport\][\s\S]*?bool LaunchFoxTwo\(\)[\s\S]*?Session\.LaunchFoxTwo\(\)/,
    "LaunchFoxTwo must cross the JSExport boundary into SimulationSession");
  assert.match(app, /function tryLaunchFoxTwo\(\)/);
  assert.match(app, /bridge\.LaunchFoxTwo\(\)/);
  assert.match(app, /if \(tryLaunchFoxTwo\(\)\)/);
  assert.match(app, /R fox-two/);
});

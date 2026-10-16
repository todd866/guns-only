import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../../app.js", import.meta.url), "utf8");
const settingsSource = await readFile(new URL("../../settings/player_settings.js", import.meta.url), "utf8");

test("Pathfinder Q pulses the ordinal weapon selector without stealing a custom Q binding", () => {
  assert.match(appSource,
    /event\.code === "KeyQ" && latestState\?\.pathfinder && !keyMap\.has\(event\.code\)/);
  assert.match(appSource,
    /event\.code === "KeyQ"[\s\S]*?pressMappedKey\(event\.code, "keyboard", 25\)/);
  assert.match(appSource,
    /touchPathfinderWeapon[\s\S]*?pressMappedKey\(code, "touch:pathfinder-weapon", 25\)/);
});

test("Pathfinder selector keeps edge semantics while F retains the shared trigger path", () => {
  // A held Q must not toggle repeatedly from browser key-repeat; ownership is released only by
  // the matching keyup path, which is shared by every mapped key.
  assert.match(appSource,
    /if \(event\.repeat\) \{[\s\S]*?reassertMappedKeyboardAxis\(event\.code\);[\s\S]*?return;/);
  assert.match(appSource,
    /window\.addEventListener\("keyup"[\s\S]*?keyOwners\.get\(event\.code\)\?\.has\("keyboard"\)[\s\S]*?releaseMappedKey\(event\.code, "keyboard"\)/);
  // F remains the configured gkey 8 and is sent through the normal mapped-key path, so selecting
  // the drone never causes F to fire both weapons.
  assert.match(settingsSource, /action: "fire", label: "Fire", defaultCode: "KeyF", gkey: 8/);
  assert.match(appSource,
    /const gkey = event\.code === "KeyN" && isCasevacState\(\)[\s\S]*?keyMap\.get\(event\.code\)/);
  assert.match(appSource, /pressMappedKey\(event\.code, "keyboard", gkey\)/);
});

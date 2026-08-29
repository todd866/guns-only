import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RELEASE_BUILD } from "../../release/release_identity.js";

const root = new URL("../../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
const versionedSettingsImport = new RegExp(
  String.raw`import \{[^}]*\bloadPlayerSettings,\s*\bsavePlayerSettings,[^}]*\} from "\.\.\/render\/settings\/player_settings\.js\?v=${RELEASE_BUILD}"`,
  "u",
);

test("Cobra inherits the shared saved audio preference before gestures can arm output", async () => {
  const cobra = await source("cobra-lab/main.js");
  assert.match(cobra, versionedSettingsImport);
  assert.match(cobra,
    /let playerSettings = loadPlayerSettings\(safeLocalStorage\(\)\);\s*hud\.setAudioEnabled\(playerSettings\.audio\)/u);
  assert.match(cobra,
    /const armAudioFromGesture = \(\) => \{\s*if \(hud\.audioEnabled\) hud\.armAudio\(\)/u,
    "a saved mute must not create or resume the audio graph on the next ordinary gesture");
  assert.match(cobra,
    /muted:[\s\S]*?hud\.audioEnabled === false/u,
    "Cobra frame updates must keep the saved mute in the continuous-audio contract");
});

test("Okanagan inherits and persists the same shared audio preference", async () => {
  const okanagan = await source("okanagan/main.js");
  assert.match(okanagan, versionedSettingsImport);
  assert.match(okanagan,
    /let playerSettings = loadPlayerSettings\(safeLocalStorage\(\)\)/u);
  assert.match(okanagan,
    /function setOkanaganAudioEnabled[\s\S]*?savePlayerSettings\([\s\S]*?audio: Boolean\(nextEnabled\)[\s\S]*?setFlightAudioEnabled\(playerSettings\.audio\)/u);
  assert.equal(
    (okanagan.match(/setOkanaganAudioEnabled\(!playerSettings\.audio, \{ arm: true \}\)/gu) ?? []).length,
    2,
    "both the sound button and M shortcut must persist through one shared setter",
  );
  assert.doesNotMatch(okanagan, /isFlightAudioEnabled/u,
    "the page must not keep a second, non-persisted audio preference");
  for (const arm of okanagan.matchAll(/armFlightAudio\(/gu)) {
    const before = okanagan.slice(Math.max(0, arm.index - 90), arm.index);
    assert.match(before, /playerSettings\.audio/u,
      `audio arm at source offset ${arm.index} must be guarded by the saved preference`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../../../app.js", import.meta.url), "utf8");

test("audio enable gestures commit the preference before arming the shared bus", () => {
  assert.match(
    appSource,
    /function commitAudioPreferenceFromGesture\(nextEnabled\) \{[\s\S]*?commitPlayerSettings\(\{ \.\.\.playerSettings, audio }\);[\s\S]*?if \(audio\) activeView\?\.hud\.armAudio\(\);[\s\S]*?}/,
    "the gesture path must enable audio before calling AudioContext.resume() through the HUD",
  );
  assert.match(
    appSource,
    /settingsAudio\?\.addEventListener\("change", \(\) => \{[\s\S]*?commitAudioPreferenceFromGesture\(settingsAudio\.checked\);[\s\S]*?}\);/,
    "the settings checkbox must retain user activation while it arms audio",
  );
  assert.match(
    appSource,
    /if \(event\.code === "KeyM"\) \{[\s\S]*?const enablingAudio = !playerSettings\.audio;[\s\S]*?commitPlayerSettings\(\{ \.\.\.playerSettings, audio: !playerSettings\.audio }\);[\s\S]*?if \(enablingAudio\) view\.hud\.armAudio\(\);[\s\S]*?return;/,
    "the keyboard mute toggle must use the same enable-and-arm path",
  );
});

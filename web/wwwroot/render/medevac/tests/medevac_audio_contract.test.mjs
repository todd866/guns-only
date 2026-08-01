import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../../medevac/app.js", import.meta.url), "utf8");

test("Medevac silent QA exercises voice cues without reaching speech synthesis", () => {
  assert.match(source,
    /AUDIO_QA_SILENT = new URLSearchParams\(globalThis\.location\?\.search \?\? ""\)[\s\S]*?get\("audioQa"\) === "silent"/);
  assert.match(source,
    /voiceCueCount \+= 1;[\s\S]*?lastVoiceCue = cue;[\s\S]*?if \(!AUDIO_QA_SILENT[\s\S]*?speechSynthesis\.speak\(utterance\);[\s\S]*?destinationSpeakCount \+= 1/,
    "cue diagnostics must advance before the silent destination guard");
  assert.match(source,
    /if \(!audioEnabled \|\| AUDIO_QA_SILENT\) globalThis\.speechSynthesis\?\.cancel\(\)/,
    "turning voice off or re-enabling it under silent QA must cancel any queued destination speech");
  assert.match(source,
    /get audioDiagnostics\(\)[\s\S]*?silentQa: AUDIO_QA_SILENT[\s\S]*?cueCount: voiceCueCount[\s\S]*?destinationSpeakCount/);
});

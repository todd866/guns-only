import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const script = new URL("./codex_audio_doctor.mjs", import.meta.url);

async function run(registry, args) {
  const { stdout } = await execFileAsync(process.execPath, [script.pathname, ...args], {
    env: {
      ...process.env,
      CODEX_AUDIO_REGISTRY_DIR: registry,
      CODEX_THREAD_ID: "thread-audio-test",
    },
  });
  return JSON.parse(stdout);
}

test("audio doctor registers, inventories, heartbeats, and clears task ownership", async () => {
  const registry = await mkdtemp(join(tmpdir(), "guns-audio-doctor-"));
  try {
    const registered = await run(registry, [
      "register",
      "--label",
      "Build 175 silent QA",
      "--url",
      "https://example.test/?audioQa=silent",
    ]);
    assert.equal(registered.threadId, "thread-audio-test");
    assert.equal(registered.cleanupRequired, true);

    const inventory = await run(registry, ["sessions"]);
    assert.equal(inventory.sessions.length, 1);
    assert.equal(inventory.sessions[0].stale, false);
    assert.equal(inventory.sessions[0].label, "Build 175 silent QA");

    const heartbeat = await run(registry, ["heartbeat"]);
    assert.equal(heartbeat.createdAt, registered.createdAt);
    assert.ok(Date.parse(heartbeat.lastSeen) >= Date.parse(registered.lastSeen));

    assert.deepEqual(await run(registry, ["clear"]), {
      cleared: true,
      threadId: "thread-audio-test",
    });
    assert.deepEqual((await run(registry, ["sessions"])).sessions, []);
  } finally {
    await rm(registry, { recursive: true, force: true });
  }
});

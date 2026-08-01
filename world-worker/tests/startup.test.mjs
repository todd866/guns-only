import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(workerRoot, "node_modules/wrangler/bin/wrangler.js");
const nodeMajor = Number(process.versions.node.split(".")[0]);
const canStartWorkerd = nodeMajor >= 22 && existsSync(wranglerPath);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  for (let attempt = 0; attempt < 20 && child.exitCode === null; attempt += 1) {
    await delay(50);
  }
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("the real Wrangler/workerd runtime starts the Worker entry and serves its Durable Object", {
  skip: canStartWorkerd ? false : "Wrangler startup requires installed dependencies and Node 22+",
  timeout: 30_000,
}, async () => {
  const port = await freeLoopbackPort();
  const inspectorPort = await freeLoopbackPort();
  const temporary = await mkdtemp(path.join(os.tmpdir(), "guns-world-startup-"));
  const output = [];
  const child = spawn(process.execPath, [
    wranglerPath,
    "dev",
    "--local",
    "--ip", "127.0.0.1",
    "--port", String(port),
    "--inspector-port", String(inspectorPort),
  ], {
    cwd: workerRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: path.join(temporary, "wrangler.log"),
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));

  try {
    let healthResponse = null;
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (healthResponse.ok) break;
      } catch { /* workerd is still starting */ }
      await delay(50);
    }
    assert.equal(child.exitCode, null, output.join(""));
    assert.ok(healthResponse?.ok, `workerd did not become healthy:\n${output.join("")}`);
    const health = await healthResponse.json();
    assert.equal(health.status, "ok");
    assert.equal(health.room, "global");

    const room = await fetch(`http://127.0.0.1:${port}/room`, {
      headers: { Origin: "http://127.0.0.1:8877" },
    });
    assert.equal(room.status, 426, "the real Durable Object should require a WebSocket upgrade");
  } finally {
    await stopChild(child);
    await rm(temporary, { recursive: true, force: true });
  }
});

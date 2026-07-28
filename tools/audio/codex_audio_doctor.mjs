#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const registryDir = process.env.CODEX_AUDIO_REGISTRY_DIR
  || join(tmpdir(), "codex-audio-sessions");
const threadId = String(process.env.CODEX_THREAD_ID || "manual").trim() || "manual";
const sessionFile = join(registryDir, `${threadId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);

function option(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
}

function isoNow() {
  return new Date().toISOString();
}

async function loadSessions() {
  await mkdir(registryDir, { recursive: true });
  const files = (await readdir(registryDir))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const sessions = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(join(registryDir, file), "utf8"));
      const ageMs = Date.now() - Date.parse(parsed.lastSeen || parsed.createdAt || 0);
      sessions.push({
        ...parsed,
        ageSeconds: Number.isFinite(ageMs) ? Math.max(0, Math.round(ageMs / 1000)) : null,
        stale: !Number.isFinite(ageMs) || ageMs > 30 * 60 * 1000,
      });
    } catch {
      sessions.push({
        threadId: basename(file, ".json"),
        invalid: true,
        stale: true,
      });
    }
  }
  return sessions;
}

async function register() {
  await mkdir(registryDir, { recursive: true });
  let previous = null;
  try {
    previous = JSON.parse(await readFile(sessionFile, "utf8"));
  } catch {
    // First registration for this task.
  }
  const now = isoNow();
  const session = {
    schemaVersion: 1,
    threadId,
    label: option("--label", previous?.label || "audible browser QA"),
    url: option("--url", previous?.url || ""),
    kind: option("--kind", previous?.kind || "browser"),
    cwd: process.cwd(),
    createdAt: previous?.createdAt || now,
    lastSeen: now,
    cleanupRequired: true,
  };
  await writeFile(sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return session;
}

async function heartbeat() {
  const session = JSON.parse(await readFile(sessionFile, "utf8"));
  session.lastSeen = isoNow();
  await writeFile(sessionFile, `${JSON.stringify(session, null, 2)}\n`, "utf8");
  return session;
}

async function clear() {
  await rm(sessionFile, { force: true });
  return { cleared: true, threadId };
}

function machineAudioProcesses() {
  let output = "";
  try {
    output = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,state=,command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    return {
      available: false,
      error: String(error?.stderr || error?.message || error).trim(),
      hint: "Run with permission to inspect processes; no process was changed.",
    };
  }
  const patterns = [
    /audio\.mojom\.AudioService/i,
    /guns-only/i,
    /jet[_-]preview/i,
    /jet-audio/i,
    /http\.server\s+8876/i,
    /\b(?:afplay|ffplay)\b/i,
  ];
  const processes = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s+([\s\S]+)$/);
      if (!match) return null;
      const pid = Number(match[1]);
      const command = match[4];
      if (pid === process.pid || !patterns.some((pattern) => pattern.test(command))) return null;
      let kind = "candidate";
      if (/audio\.mojom\.AudioService/i.test(command)) {
        kind = /Google Chrome/i.test(command) ? "chrome-audio-service" : "codex-audio-service";
      } else if (/http\.server\s+8876/i.test(command)) {
        kind = "static-file-server";
      } else if (/\b(?:afplay|ffplay)\b/i.test(command)) {
        kind = "media-player";
      } else if (/jet[_-]preview/i.test(command)) {
        kind = "jet-preview";
      } else if (/guns-only/i.test(command)) {
        kind = "guns-only-process";
      }
      return {
        pid,
        parentPid: Number(match[2]),
        state: match[3],
        kind,
        command: command.length > 240 ? `${command.slice(0, 237)}...` : command,
      };
    })
    .filter(Boolean);
  return {
    available: true,
    processes,
    limitation:
      "An idle Chromium AudioService and an actively audible webview look identical here; "
      + "use the task session registry to identify the owning tab.",
  };
}

async function main() {
  const command = process.argv[2] || "snapshot";
  if (command === "register") return register();
  if (command === "heartbeat") return heartbeat();
  if (command === "clear") return clear();
  if (command === "sessions") return { registryDir, sessions: await loadSessions() };
  if (command === "machine") return machineAudioProcesses();
  if (command === "snapshot") {
    return {
      registryDir,
      sessions: await loadSessions(),
      machine: machineAudioProcesses(),
      next: [
        "Match a registered threadId with the Codex task list and ask that task to close its tab.",
        "Prefer ?audioQa=silent for Guns Only production acceptance.",
        "Use a shared AudioService SIGSTOP only as a temporary emergency mute.",
      ],
    };
  }
  throw new Error(
    "usage: audio-doctor [snapshot|sessions|machine|register|heartbeat|clear]"
      + " [--label TEXT] [--url URL] [--kind KIND]",
  );
}

try {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`audio-doctor: ${error?.message || error}\n`);
  process.exitCode = 1;
}

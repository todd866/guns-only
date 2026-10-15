#!/usr/bin/env node

import { gunzip } from "node:zlib";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const gunzipAsync = promisify(gunzip);
const DEFAULT_ENDPOINT = "https://guns-only.com/telemetry-admin";
const MAX_LIST = 100;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

class PullError extends Error {}

export function parseArguments(args = []) {
  if (args.length === 0 || args.includes("--help")) return { help: true };
  let mode = null;
  let count = 10;
  let id = null;
  let endpoint = DEFAULT_ENDPOINT;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = () => {
      i += 1;
      if (i >= args.length || args[i].startsWith("--")) throw new PullError(`${arg} requires a value`);
      return args[i];
    };
    if (arg === "--latest") {
      if (mode) throw new PullError("choose either --latest or --id");
      mode = "latest";
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) count = positive(next(), "N", MAX_LIST);
    } else if (arg === "--id") {
      if (mode) throw new PullError("choose either --latest or --id");
      id = next();
      if (!ID_RE.test(id)) throw new PullError("id is invalid");
      mode = "id";
    } else if (arg === "--endpoint") {
      endpoint = next();
    } else {
      throw new PullError(`unknown option: ${arg}`);
    }
  }
  if (!mode) throw new PullError("one of --latest or --id is required");
  return { mode, count, id, endpoint };
}

function positive(value, name, maximum) {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) throw new PullError(`${name} must be 1-${maximum}`);
  return Number(value);
}

function endpointUrl(endpoint, action, values = {}) {
  let url;
  try { url = new URL(endpoint); } catch { throw new PullError("endpoint is invalid"); }
  if (url.protocol !== "https:" || url.pathname !== "/telemetry-admin" || url.username || url.password || url.hash) {
    throw new PullError("endpoint must be an HTTPS /telemetry-admin URL");
  }
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
  return url;
}

async function fetchBounded(url, token, maximum) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "identity" },
    redirect: "error",
  });
  if (!response.ok) throw new PullError(`operator request returned HTTP ${response.status}`);
  const length = response.headers.get("content-length");
  if (length && Number(length) > maximum) throw new PullError("response exceeded its byte limit");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maximum) throw new PullError("response exceeded its byte limit");
  return { body, response };
}

function reportId(pathname) {
  const match = /^reports\/\d{4}-\d{2}-\d{2}\/([A-Za-z0-9_-]{1,128})\.(?:json\.gz|jpg)$/.exec(pathname || "");
  return match ? match[1] : null;
}

function pickBlob(blobs, id, extension) {
  return blobs.find((blob) => reportId(blob?.pathname) === id && blob.pathname.endsWith(extension));
}

async function listReports(token, endpoint, limit) {
  const { body } = await fetchBounded(endpointUrl(endpoint, "list", { prefix: "reports/", limit }), token, 1024 * 1024);
  let payload;
  try { payload = JSON.parse(body.toString("utf8")); } catch { throw new PullError("list response was invalid JSON"); }
  if (!payload || !Array.isArray(payload.blobs) || payload.blobs.length > limit) throw new PullError("list response exceeded its item limit");
  return payload.blobs.filter((blob) => reportId(blob?.pathname));
}

async function downloadBlob(token, endpoint, blob) {
  if (!blob?.url || !Number.isSafeInteger(Number(blob.size)) || Number(blob.size) < 1 || Number(blob.size) > MAX_OBJECT_BYTES || typeof blob.etag !== "string") {
    throw new PullError("report metadata is invalid");
  }
  const { body } = await fetchBounded(endpointUrl(endpoint, "get", {
    url: blob.url, expectedSize: blob.size, etag: blob.etag,
  }), token, Number(blob.size));
  if (body.byteLength !== Number(blob.size)) throw new PullError("report size changed in transit");
  return body;
}

function stateValue(report, names) {
  const state = report?.state?.s || report?.state || {};
  for (const name of names) if (state[name] !== undefined && state[name] !== null) return state[name];
  return "—";
}

function summary(report, id, screenshotPath) {
  return [
    `Time: ${report.created || "—"}`,
    `Build: ${report.build || "—"} · Revision: ${report.revision || "—"}`,
    `Program: ${report.program || "—"}`,
    `Mission: ${report.mission || "—"}`,
    `Beat: ${report.beat || "—"}`,
    `Altitude: ${stateValue(report, ["altitude_m", "altitude", "alt"])} · Speed: ${stateValue(report, ["speed_mps", "speed", "airspeed_mps"])} · Attitude: ${stateValue(report, ["attitude", "pitch"])}°`,
    `Note: ${String(report.note || "").replace(/[\r\n]+/g, " ").slice(0, 400) || "—"}`,
    `Screenshot: ${screenshotPath}`,
    `Report ID: ${id}`,
    `URL: ${report.url || "—"}`,
  ].join("\n");
}

export async function main(args = process.argv.slice(2), environment = process.env, io = console) {
  const options = parseArguments(args);
  if (options.help) { io.log("Usage: node tools/feedback/pull.mjs --latest [N] | --id ID"); return; }
  const token = environment.GUNS_TELEMETRY_ADMIN_TOKEN || environment.TELEMETRY_ADMIN_TOKEN;
  if (typeof token !== "string" || token.length < 32) throw new PullError("GUNS_TELEMETRY_ADMIN_TOKEN is missing or too short");
  const listed = await listReports(token, options.endpoint, options.mode === "id" ? MAX_LIST : options.count);
  const groups = new Map();
  for (const blob of listed) {
    const id = reportId(blob.pathname);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(blob);
  }
  let ids = [...groups.keys()];
  if (options.mode === "id") ids = ids.filter((value) => value === options.id);
  ids.sort((a, b) => String(groups.get(b)?.[0]?.uploadedAt || "").localeCompare(String(groups.get(a)?.[0]?.uploadedAt || "")));
  ids = ids.slice(0, options.mode === "id" ? 1 : options.count);
  if (!ids.length) throw new PullError("report was not found");
  const root = join(homedir(), ".local", "state", "guns-only-reports");
  for (const id of ids) {
    const group = groups.get(id);
    const jsonBlob = pickBlob(group, id, ".json.gz");
    const jpgBlob = pickBlob(group, id, ".jpg");
    if (!jsonBlob || !jpgBlob) throw new PullError(`report ${id} is missing JSON or screenshot`);
    const directory = join(root, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const compressed = await downloadBlob(token, options.endpoint, jsonBlob);
    const report = JSON.parse((await gunzipAsync(compressed)).toString("utf8"));
    const screenshot = await downloadBlob(token, options.endpoint, jpgBlob);
    const jsonPath = join(directory, "report.json");
    const screenshotPath = join(directory, "screenshot.jpg");
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile(screenshotPath, screenshot, { mode: 0o600 });
    io.log(summary(report, id, screenshotPath));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`feedback pull failed: ${error.message}`); process.exitCode = 1; });
}

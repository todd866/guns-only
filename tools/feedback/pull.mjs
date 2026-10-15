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
const MAX_LIST_PAGES = 100;
const MAX_UNCOMPRESSED_JSON = 16 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "identity" },
      redirect: "error", signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    throw new PullError(error?.name === "AbortError" ? "operator request timed out" : "operator request failed");
  }
  try {
    if (!response.ok) throw new PullError(`operator request returned HTTP ${response.status}`);
    const length = response.headers.get("content-length");
    if (length && Number(length) > maximum) throw new PullError("response exceeded its byte limit");
    const chunks = [];
    let total = 0;
    if (response.body) for await (const chunk of response.body) {
      const buffer = Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > maximum) throw new PullError("response exceeded its byte limit");
      chunks.push(buffer);
    }
    return { body: Buffer.concat(chunks), response };
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}

function reportId(pathname) {
  const match = /^reports\/\d{4}-\d{2}-\d{2}\/([A-Za-z0-9_-]{1,128})\.(?:json\.gz|jpg)$/.exec(pathname || "");
  return match ? match[1] : null;
}

function pickBlob(blobs, id, extension) {
  return blobs.find((blob) => reportId(blob?.pathname) === id && blob.pathname.endsWith(extension));
}

async function listReports(token, endpoint, wantedId = null) {
  const blobs = [];
  let cursor;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const values = { prefix: "reports/", limit: MAX_LIST };
    if (cursor) values.cursor = cursor;
    const { body } = await fetchBounded(endpointUrl(endpoint, "list", values), token, 1024 * 1024);
    let payload;
    try { payload = JSON.parse(body.toString("utf8")); } catch { throw new PullError("list response was invalid JSON"); }
    if (!payload || !Array.isArray(payload.blobs) || payload.blobs.length > MAX_LIST) throw new PullError("list response exceeded its item limit");
    blobs.push(...payload.blobs.filter((blob) => reportId(blob?.pathname)));
    const found = wantedId && blobs.filter((blob) => reportId(blob?.pathname) === wantedId);
    if (wantedId && found?.some((blob) => blob.pathname.endsWith(".json.gz")) && found.some((blob) => blob.pathname.endsWith(".jpg"))) return blobs;
    if (payload.hasMore !== true) return blobs;
    if (typeof payload.cursor !== "string" || !payload.cursor) throw new PullError("report list advertised another page without a cursor");
    cursor = payload.cursor;
  }
  if (cursor) throw new PullError("report list exceeds the bounded 100-page retrieval limit");
  return blobs;
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

function attitudeValue(report) {
  const state = report?.state?.s || report?.state || {};
  const values = ["pitch_deg", "bank_deg", "heading_deg"].map((name) => state[name]);
  if (values.every((value) => value !== undefined && value !== null)) return values.join("/");
  return stateValue(report, ["attitude", "pitch"]);
}

function summary(report, id, screenshotPath) {
  return [
    `Time: ${report.created || "—"}`,
    `Build: ${report.build || "—"} · Revision: ${report.revision || "—"}`,
    `Program: ${report.program || "—"}`,
    `Mission: ${report.mission || "—"}`,
    `Beat: ${report.beat || "—"}`,
    `Altitude: ${stateValue(report, ["alt_ft", "altitude_ft"])} ft · Speed: ${stateValue(report, ["speed_kts", "speed_knots"])} kt · Attitude: ${attitudeValue(report)}° (pitch/bank/heading)`,
    `Note: ${String(report.note || "").replace(/[\r\n]+/g, " ").slice(0, 400) || "—"}`,
    `Screenshot: ${screenshotPath}`,
    `Report ID: ${id}`,
    `URL: ${report.url || "—"}`,
  ].join("\n");
}

export async function main(args = process.argv.slice(2), environment = process.env, io = console, runtime = {}) {
  const options = parseArguments(args);
  if (options.help) { io.log("Usage: node tools/feedback/pull.mjs --latest [N] | --id ID"); return; }
  const token = environment.GUNS_TELEMETRY_ADMIN_TOKEN || environment.TELEMETRY_ADMIN_TOKEN;
  if (typeof token !== "string" || token.length < 32) throw new PullError("GUNS_TELEMETRY_ADMIN_TOKEN is missing or too short");
  const listed = await listReports(token, options.endpoint, options.mode === "id" ? options.id : null);
  const groups = new Map();
  for (const blob of listed) {
    const id = reportId(blob.pathname);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(blob);
  }
  let ids = [...groups.keys()];
  if (options.mode === "id") ids = ids.filter((value) => value === options.id);
  const newest = (id) => groups.get(id).reduce((latest, blob) => {
    const value = String(blob.uploadedAt || "");
    return value > latest ? value : latest;
  }, "");
  ids.sort((a, b) => newest(b).localeCompare(newest(a)));
  ids = ids.filter((id) => pickBlob(groups.get(id), id, ".json.gz") && pickBlob(groups.get(id), id, ".jpg"));
  ids = ids.slice(0, options.mode === "id" ? 1 : options.count);
  if (!ids.length) throw new PullError("report was not found");
  const root = runtime.root || join(homedir(), ".local", "state", "guns-only-reports");
  for (const id of ids) {
    const group = groups.get(id);
    const jsonBlob = pickBlob(group, id, ".json.gz");
    const jpgBlob = pickBlob(group, id, ".jpg");
    if (!jsonBlob || !jpgBlob) throw new PullError(`report ${id} is missing JSON or screenshot`);
    const directory = join(root, id);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const compressed = await downloadBlob(token, options.endpoint, jsonBlob);
    const report = JSON.parse((await gunzipAsync(compressed, { maxOutputLength: MAX_UNCOMPRESSED_JSON })).toString("utf8"));
    if (report?.id !== id) throw new PullError(`report ${id} JSON id does not match its path`);
    const screenshot = await downloadBlob(token, options.endpoint, jpgBlob);
    const jsonPath = join(directory, "report.json");
    const compressedPath = join(directory, "report.json.gz");
    const screenshotPath = join(directory, "screenshot.jpg");
    await writeFile(compressedPath, compressed, { mode: 0o600 });
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    await writeFile(screenshotPath, screenshot, { mode: 0o600 });
    io.log(summary(report, id, screenshotPath));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`feedback pull failed: ${error.message}`); process.exitCode = 1; });
}

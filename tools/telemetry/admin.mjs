#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENDPOINT = "https://guns-only.vercel.app/telemetry-admin";
const MAX_LIST_ITEMS = 100;
const MAX_LIST_BYTES = 1024 * 1024;
const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const HELP = `Usage:
  node tools/telemetry/admin.mjs list [--prefix telemetry/...] [--limit N] [--cursor VALUE] [--output FILE]
  node tools/telemetry/admin.mjs get --url URL --expected-size N --etag VALUE --output FILE

Options:
  --endpoint URL       Operator endpoint (default: ${DEFAULT_ENDPOINT})
  --timeout-ms N       Abort the single request after N milliseconds
  --output FILE        Required for get; optional mode-0600 JSON file for list
  --help               Show this help

TELEMETRY_ADMIN_TOKEN is read only from the environment and never printed. Each
invocation makes exactly one bounded request with no retry, redirect, Range, or
automatic pagination. The Vercel Blob master credential remains inside Vercel.
`;

class AdminRetrievalError extends Error {}

function positiveInteger(raw, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) {
    throw new AdminRetrievalError(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) {
    throw new AdminRetrievalError(`${name} exceeds its maximum`);
  }
  return value;
}

function parseArguments(args) {
  const [operation, ...rest] = args;
  if (operation === "--help" || operation === undefined) return { help: true };
  if (!new Set(["list", "get"]).has(operation)) {
    throw new AdminRetrievalError("operation must be list or get");
  }
  const options = { operation };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const next = () => {
      index += 1;
      if (index >= rest.length || rest[index].startsWith("--")) {
        throw new AdminRetrievalError(`${argument} requires a value`);
      }
      return rest[index];
    };
    switch (argument) {
      case "--help": options.help = true; break;
      case "--endpoint": options.endpoint = next(); break;
      case "--timeout-ms": options.timeoutMs = positiveInteger(next(), "timeout"); break;
      case "--output": options.output = next(); break;
      case "--prefix": options.prefix = next(); break;
      case "--limit": options.limit = positiveInteger(next(), "limit", MAX_LIST_ITEMS); break;
      case "--cursor": options.cursor = next(); break;
      case "--url": options.url = next(); break;
      case "--expected-size": options.expectedSize = positiveInteger(next(), "expected size", MAX_CHUNK_BYTES); break;
      case "--etag": options.etag = next(); break;
      default: throw new AdminRetrievalError(`unknown option: ${argument}`);
    }
  }
  return options;
}

function validateEndpoint(raw) {
  let url;
  try {
    url = new URL(raw || DEFAULT_ENDPOINT);
  } catch {
    throw new AdminRetrievalError("endpoint is invalid");
  }
  const local = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(url.hostname);
  if ((!local && url.protocol !== "https:") || (local && !new Set(["http:", "https:"]).has(url.protocol))) {
    throw new AdminRetrievalError("endpoint must use HTTPS except on localhost");
  }
  if (!local && url.origin !== "https://guns-only.vercel.app") {
    throw new AdminRetrievalError(
      "remote endpoint must be https://guns-only.vercel.app so the operator token cannot leave the project",
    );
  }
  if (url.pathname !== "/telemetry-admin") {
    throw new AdminRetrievalError("endpoint path must be /telemetry-admin");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new AdminRetrievalError("endpoint must not contain credentials, a query, or a fragment");
  }
  return url;
}

async function readBounded(response, maximumBytes) {
  const rawLength = response.headers.get("content-length");
  if (rawLength !== null) {
    if (!/^(0|[1-9]\d*)$/.test(rawLength) || Number(rawLength) > maximumBytes) {
      throw new AdminRetrievalError("response Content-Length exceeds its limit");
    }
  }
  const chunks = [];
  let total = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.byteLength;
      if (total > maximumBytes) throw new AdminRetrievalError("response exceeded its byte limit");
      chunks.push(buffer);
    }
  }
  if (rawLength !== null && total !== Number(rawLength)) {
    throw new AdminRetrievalError("response did not match Content-Length");
  }
  return Buffer.concat(chunks);
}

async function installPrivateFile(path, contents) {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    const existing = await stat(destination);
    if (existing) throw new AdminRetrievalError("output already exists; choose a new path");
  } catch (error) {
    if (!(error && error.code === "ENOENT")) throw error;
  }
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
    // Same-directory hard-linking is an atomic no-replace install. If another process creates the
    // destination after the advisory stat, link fails instead of rename silently replacing it.
    try {
      await link(temporary, destination);
    } catch (error) {
      if (error && error.code === "EEXIST") {
        throw new AdminRetrievalError("output appeared during retrieval; refusing to replace it");
      }
      throw error;
    }
    await unlink(temporary);
  } finally {
    try { await unlink(temporary); } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
  }
  return destination;
}

function normalizeEtag(value) {
  return String(value || "").replace(/^W\//i, "").replace(/^"|"$/g, "");
}

export async function main(args = process.argv.slice(2), environment = process.env, io = console) {
  const options = parseArguments(args);
  if (options.help) {
    io.log(HELP);
    return null;
  }
  const token = environment.TELEMETRY_ADMIN_TOKEN;
  if (typeof token !== "string" || token.length < 32) {
    throw new AdminRetrievalError("TELEMETRY_ADMIN_TOKEN is missing or too short");
  }
  const endpoint = validateEndpoint(options.endpoint);
  endpoint.searchParams.set("action", options.operation);

  let maximumBytes;
  if (options.operation === "list") {
    const prefix = options.prefix || "telemetry/";
    if (!prefix.startsWith("telemetry/") || prefix.length > 1024) {
      throw new AdminRetrievalError("prefix must start with telemetry/");
    }
    endpoint.searchParams.set("prefix", prefix);
    endpoint.searchParams.set("limit", String(options.limit || 50));
    if (options.cursor !== undefined) endpoint.searchParams.set("cursor", options.cursor);
    maximumBytes = MAX_LIST_BYTES;
  } else {
    if (!options.url || !options.expectedSize || !options.etag || !options.output) {
      throw new AdminRetrievalError("get requires --url, --expected-size, --etag, and --output");
    }
    endpoint.searchParams.set("url", options.url);
    endpoint.searchParams.set("expectedSize", String(options.expectedSize));
    endpoint.searchParams.set("etag", options.etag);
    maximumBytes = options.expectedSize;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  let response;
  try {
    try {
      response = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Accept-Encoding": "identity" },
        redirect: "error",
        signal: controller.signal,
      });
    } catch {
      throw new AdminRetrievalError("operator request failed; no retry was attempted");
    }
    if (response.status !== 200) {
      const detail = (await readBounded(response, 4096)).toString("utf8").slice(0, 300);
      throw new AdminRetrievalError(`operator request returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const body = await readBounded(response, maximumBytes);

    if (options.operation === "list") {
      let payload;
      try { payload = JSON.parse(body.toString("utf8")); } catch { throw new AdminRetrievalError("list response was invalid JSON"); }
      if (!payload || !Array.isArray(payload.blobs) || payload.blobs.length > (options.limit || 50)) {
        throw new AdminRetrievalError("list response exceeded its item limit");
      }
      const output = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`);
      if (options.output) {
        const path = await installPrivateFile(options.output, output);
        io.error(`saved one bounded metadata page to ${path}`);
      } else {
        io.log(output.toString("utf8").trimEnd());
      }
      return payload;
    }

    if (body.byteLength !== options.expectedSize) throw new AdminRetrievalError("chunk size changed in transit");
    if (normalizeEtag(response.headers.get("etag")) !== normalizeEtag(options.etag)) {
      throw new AdminRetrievalError("chunk ETag changed in transit");
    }
    const path = await installPrivateFile(options.output, body);
    const sha256 = createHash("sha256").update(body).digest("hex");
    io.log(JSON.stringify({ status: "downloaded", outputPath: path, size: body.byteLength, sha256 }));
    return { outputPath: path, size: body.byteLength, sha256 };
  } finally {
    clearTimeout(timeout);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`telemetry admin retrieval failed: ${error.message}`);
    process.exitCode = 1;
  });
}

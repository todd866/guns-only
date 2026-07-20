import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { main } from "../admin.mjs";

const ENVIRONMENT = {
  TELEMETRY_ADMIN_TOKEN: "test-operator-secret-that-is-longer-than-32-characters",
};

test("operator bearer can only be sent to the canonical project or loopback", async () => {
  const previousFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("unexpected");
  };
  try {
    await assert.rejects(
      () => main([
        "list",
        "--endpoint", "https://example.com/telemetry-admin",
      ], ENVIRONMENT),
      /remote endpoint must be https:\/\/guns-only\.vercel\.app/,
    );
    await assert.rejects(
      () => main([
        "list",
        "--endpoint", "https://guns-only.vercel.app/other-function",
      ], ENVIRONMENT),
      /endpoint path must be \/telemetry-admin/,
    );
    assert.equal(fetchCalls, 0, "invalid endpoints must fail before an Authorization header exists");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("IPv4 and IPv6 loopback remain available for isolated endpoint tests", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const body = JSON.stringify({
      prefix: "telemetry/",
      limit: 1,
      blobs: [],
      hasMore: false,
      cursor: null,
      autoPaginated: false,
    });
    return new Response(body, {
      status: 200,
      headers: { "content-length": String(Buffer.byteLength(body)) },
    });
  };
  try {
    for (const endpoint of [
      "http://127.0.0.1:8765/telemetry-admin",
      "http://[::1]:8765/telemetry-admin",
    ]) {
      await main([
        "list",
        "--endpoint", endpoint,
        "--limit", "1",
      ], ENVIRONMENT, { log() {}, error() {} });
    }
    assert.equal(calls.length, 2);
    assert.equal(new URL(calls[0].url).hostname, "127.0.0.1");
    assert.equal(new URL(calls[1].url).hostname, "[::1]");
    for (const call of calls) {
      assert.equal(call.options.headers.Authorization,
        `Bearer ${ENVIRONMENT.TELEMETRY_ADMIN_TOKEN}`);
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("private output installation is atomic and cannot replace a racing destination", async () => {
  const source = await readFile(new URL("../admin.mjs", import.meta.url), "utf8");
  assert.match(source, /await link\(temporary, destination\)/);
  assert.doesNotMatch(source, /rename\(temporary, destination\)/);
  assert.match(source, /error\.code === "EEXIST"[\s\S]*?refusing to replace/);
});

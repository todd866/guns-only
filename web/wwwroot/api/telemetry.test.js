const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { Readable } = require("node:stream");
const { pathToFileURL } = require("node:url");
const { gunzipSync } = require("node:zlib");
const test = require("node:test");

const telemetry = require("./telemetry.js");

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    statusCode: 0,
    body: undefined,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    end(body) { this.body = body; },
  };
}

async function withTelemetryEnvironment(fetchImplementation, run, vercelEnvironment = "preview") {
  const previousFetch = global.fetch;
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  const previousVercelEnvironment = process.env.VERCEL_ENV;
  global.fetch = fetchImplementation;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test_store_secret";
  if (vercelEnvironment === null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnvironment;
  try {
    await run();
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    if (previousVercelEnvironment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnvironment;
  }
}

test("valid telemetry becomes one private immutable gzip chunk without a Blob read", async () => {
  const calls = [];
  await withTelemetryEnvironment(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json; charset=utf-8",
      },
      body: {
        session: "web/../flight",
        batchId: "batch-test-00000001",
        rows: [{ k: "hdr", build: "test" }, { k: "st", tick: 6 }],
      },
    }, response);

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }, "production");

  assert.equal(calls.length, 1);
  const [{ url, options }] = calls;
  assert.equal(options.method, "PUT");
  assert.equal(url,
    "https://blob.vercel-storage.com/telemetry/web___flight/batch-test-00000001.jsonl.gz");
  assert.equal(options.headers["x-allow-overwrite"], "0");
  assert.equal(options.headers["x-vercel-blob-access"], "private");
  assert.equal(options.headers["Content-Type"], "application/gzip");
  assert.equal(gunzipSync(options.body).toString("utf8"),
    '{"k":"hdr","build":"test"}\n{"k":"st","tick":6}\n');
});

test("an already-existing deterministic batch is acknowledged without a duplicate write", async () => {
  const calls = [];
  await withTelemetryEnvironment(async (url) => {
    calls.push(url);
    return { ok: false, status: 409, text: async () => "blob already exists" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json",
      },
      body: {
        session: "retry-flight",
        batchId: "batch-retry-0000001",
        rows: [{ k: "st", tick: 12 }],
      },
    }, response);

    assert.equal(response.statusCode, 204);
  }, "production");

  assert.deepEqual(calls, [
    "https://blob.vercel-storage.com/telemetry/retry-flight/batch-retry-0000001.jsonl.gz",
  ]);
});

test("cross-origin browser writes are rejected before Blob storage", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: { session: "attack", rows: [{ k: "st" }] },
    }, response);

    assert.equal(response.statusCode, 403);
    assert.match(response.body, /Cross-origin/);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("originless hosted writes are rejected before Blob storage", async () => {
  let fetchCalls = 0;
  for (const environment of ["production", "preview"]) {
    await withTelemetryEnvironment(async () => {
      fetchCalls++;
      return { ok: true, status: 200, text: async () => "" };
    }, async () => {
      const response = responseRecorder();
      await telemetry({
        method: "POST",
        headers: {
          host: "guns-only.vercel.app",
          "content-type": "application/json",
        },
        body: { session: "originless", rows: [{ k: "st" }] },
      }, response);

      assert.equal(response.statusCode, 403);
      assert.match(response.body, /Cross-origin/);
    }, environment);
  }
  assert.equal(fetchCalls, 0);
});

test("originless JSON remains available to true local development", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: { session: "local", rows: [{ k: "st" }] },
    }, response);
    assert.equal(response.statusCode, 204);
  }, null);
  assert.equal(fetchCalls, 1);
});

test("non-JSON writes are rejected before parsing or Blob storage", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "text/plain",
      },
      body: "not-json",
    }, response);

    assert.equal(response.statusCode, 415);
    assert.match(response.body, /application\/json/);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("declared oversized requests are rejected before body parsing", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json",
        "content-length": String(2 * 1024 * 1024 + 64 * 1024 + 1),
      },
      body: { session: "oversized", rows: [{ k: "st" }] },
    }, response);

    assert.equal(response.statusCode, 413);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("streamed requests are bounded even without Content-Length", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const request = Readable.from([
      Buffer.alloc(2 * 1024 * 1024),
      Buffer.alloc(64 * 1024 + 1),
    ]);
    request.method = "POST";
    request.headers = {
      host: "guns-only.vercel.app",
      origin: "https://guns-only.vercel.app",
      "content-type": "application/json",
    };

    const response = responseRecorder();
    await telemetry(request, response);
    assert.equal(response.statusCode, 413);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("Vercel-preparsed requests are bounded even without Content-Length", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json",
      },
      body: {
        session: "preparsed-oversized",
        rows: [{ k: "st" }],
        ignoredPadding: "x".repeat(2 * 1024 * 1024 + 64 * 1024),
      },
    }, response);

    assert.equal(response.statusCode, 413);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("oversized row batches return 413 without a storage operation", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    const response = responseRecorder();
    await telemetry({
      method: "POST",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json",
      },
      body: {
        session: "too-many",
        rows: Array.from({ length: 1_501 }, () => ({ k: "st" })),
      },
    }, response);

    assert.equal(response.statusCode, 413);
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("invalid payloads and batch IDs return 400 instead of a false acknowledgement", async () => {
  let fetchCalls = 0;
  await withTelemetryEnvironment(async () => {
    fetchCalls++;
    return { ok: true, status: 200, text: async () => "" };
  }, async () => {
    for (const body of [
      { session: "missing-rows", rows: [] },
      { session: "bad-batch", batchId: "../../overwrite", rows: [{ k: "st" }] },
      { session: "bad-row", batchId: "batch-valid-00001", rows: ["not-an-object"] },
    ]) {
      const response = responseRecorder();
      await telemetry({
        method: "POST",
        headers: {
          host: "guns-only.vercel.app",
          origin: "https://guns-only.vercel.app",
          "content-type": "application/json",
        },
        body,
      }, response);
      assert.equal(response.statusCode, 400);
    }
  }, "production");
  assert.equal(fetchCalls, 0);
});

test("storage failures return 503 so the browser retains the exact pending batch", async () => {
  let fetchCalls = 0;
  const originalError = console.error;
  console.error = () => {};
  try {
    await withTelemetryEnvironment(async () => {
      fetchCalls++;
      return { ok: false, status: 401, text: async () => "invalid storage token" };
    }, async () => {
      const response = responseRecorder();
      await telemetry({
        method: "POST",
        headers: {
          host: "guns-only.vercel.app",
          origin: "https://guns-only.vercel.app",
          "content-type": "application/json",
        },
        body: {
          session: "storage-outage",
          batchId: "batch-outage-00001",
          rows: [{ k: "st", tick: 24 }],
        },
      }, response);

      assert.equal(response.statusCode, 503);
      assert.equal(response.headers.get("retry-after"), "30");
    }, "production");
  } finally {
    console.error = originalError;
  }
  assert.equal(fetchCalls, 1, "non-retryable storage authentication failure should fail fast");
});

test("deployment config limits immutable caching to SHA-versioned heavy pack assets", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", `file://${__filename}`), "utf8"));
  assert.deepEqual(config.headers.map((rule) => rule.source), [
    "/content/packs/(.*)\\.glb",
    "/content/packs/(.*)\\.terrain",
    "/content/packs/(.*)\\.ktx2",
    "/content/packs/(.*)\\.png",
    "/content/packs/(.*)\\.webp",
  ]);
  for (const rule of config.headers) {
    assert.deepEqual(rule.has, [{ type: "query", key: "sha256", value: "^[0-9a-f]{64}$" }]);
    assert.deepEqual(rule.headers, [{
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    }]);
  }

  const serializedRules = JSON.stringify(config.headers);
  assert.doesNotMatch(serializedRules, /app\.js|hud\.js|_framework|\.json/);
});

test("recorder losslessly encodes retained 20 Hz samples and batches uploads every 30 seconds", async () => {
  const app = await readFile(new URL("../app.js", `file://${__filename}`), "utf8");
  const index = await readFile(new URL("../index.html", `file://${__filename}`), "utf8");
  const scheduler = await import(pathToFileURL(join(__dirname,
    "../render/telemetry/sample_scheduler.js")).href);
  const stride = scheduler.DEFAULT_TELEMETRY_TICK_STRIDE;
  const interval = Number(app.match(/TELEMETRY_FLUSH_INTERVAL_MS = ([\d_]+);/)?.[1].replaceAll("_", ""));
  const bufferLimit = Number(app.match(/TELEMETRY_BUFFER_LIMIT = ([\d_]+);/)?.[1].replaceAll("_", ""));
  const normalSamplesPerBatch = interval / 1000 * 120 / stride;
  assert.equal(stride, 6);
  assert.equal(interval, 30_000);
  assert.equal(normalSamplesPerBatch, 600);
  assert.ok(bufferLimit >= normalSamplesPerBatch * 2, "buffer should retain at least two normal batches");
  assert.match(app, /buildTelemetryBatch\(/);
  assert.match(app, /TelemetryStateEncoder/);
  assert.match(app, /_stateEncoder\.forceKeyframe\(\)/);
  assert.match(app, /releaseTelemetryMaterializedStates\(batch\.rows\)/);
  assert.match(app, /this\.droppedRows \+= overflow/);
  assert.match(app, /ensureTelemetryChunkHeader\(this\.buf, this\.chunkHeader\(batchId\)\)/);
  assert.match(app, /body: batch\.payload/);
  assert.doesNotMatch(app, /keepalive\s*:\s*(?:true|false)/);
  assert.match(app,
    /window\.addEventListener\("pagehide", \(\) => \{[\s\S]*?recorder\.flush\(\{ force: true \}\)[\s\S]*?\}\);/);
  assert.match(app, /document\.hidden\) recorder\.flush\(\{ force: true \}\)/);
  // The shell must cache-bust application changes, but unrelated UI work legitimately advances
  // the revision. Pinning yesterday's exact integer makes a healthy deploy fail this cost guard.
  assert.match(index, /app\.js\?v=[1-9]\d*/);
});

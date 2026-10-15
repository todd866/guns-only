const assert = require("node:assert/strict");
const { gunzipSync, gzipSync } = require("node:zlib");
const { Readable } = require("node:stream");
const test = require("node:test");
const report = require("./report.js");

function responseRecorder() {
  const headers = new Map();
  return { headers, statusCode: 0, body: undefined,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    end(body) { this.body = body; } };
}

const baseReport = () => ({ id: "report-test-000001", created: "2026-10-15T04:05:06.000Z", build: 42 });
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
const reportGzip = (value = baseReport()) => gzipSync(Buffer.from(JSON.stringify(value))).toString("base64");
const headers = () => ({ host: "guns-only.vercel.app", origin: "https://guns-only.vercel.app", "content-type": "application/json" });

async function withEnv(fetchImpl, fn, token = "test-token") {
  const oldFetch = global.fetch;
  const oldToken = process.env.BLOB_READ_WRITE_TOKEN;
  const oldVercel = process.env.VERCEL_ENV;
  global.fetch = fetchImpl;
  if (token === null) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = token;
  process.env.VERCEL_ENV = "production";
  try { await fn(); } finally {
    global.fetch = oldFetch;
    if (oldToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = oldToken;
    if (oldVercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = oldVercel;
  }
}

test("report writes private immutable gzip JSON and JPEG at dated id paths", async () => {
  const calls = [];
  await withEnv(async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200, text: async () => "" }; }, async () => {
    const response = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { reportGzip: reportGzip(), jpeg } }, response);
    assert.equal(response.statusCode, 204);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://blob.vercel-storage.com/reports/2026-10-15/report-test-000001.json.gz");
  assert.equal(calls[1].url, "https://blob.vercel-storage.com/reports/2026-10-15/report-test-000001.jpg");
  assert.equal(gunzipSync(calls[0].options.body).toString(), JSON.stringify(baseReport()));
  assert.equal(calls[0].options.headers["x-vercel-blob-access"], "private");
  assert.equal(calls[0].options.headers["x-allow-overwrite"], "0");
  assert.equal(calls[1].options.headers["Content-Type"], "image/jpeg");
});

test("same-origin and content type checks happen before storage", async () => {
  let writes = 0;
  await withEnv(async () => { writes += 1; return { ok: true, status: 200, text: async () => "" }; }, async () => {
    for (const request of [
      { method: "POST", headers: { ...headers(), origin: "https://attacker.example" }, body: { reportGzip: reportGzip(), jpeg } },
      { method: "POST", headers: { ...headers(), "content-type": "text/plain" }, body: "x" },
      { method: "POST", headers: { host: "guns-only.vercel.app", "content-type": "application/json" }, body: { reportGzip: reportGzip(), jpeg } },
    ]) {
      const response = responseRecorder(); await report(request, response); assert.equal(response.statusCode, request.headers.origin === "https://attacker.example" || !request.headers.origin ? 403 : 415);
    }
  });
  assert.equal(writes, 0);
});

test("hosted originless requests and malformed reports are rejected", async () => {
  await withEnv(async () => ({ ok: true, status: 200, text: async () => "" }), async () => {
    const response = responseRecorder();
    await report({ method: "POST", headers: { host: "guns-only.vercel.app", "content-type": "application/json" }, body: { reportGzip: reportGzip(), jpeg } }, response);
    assert.equal(response.statusCode, 403);
    const bad = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { reportGzip: reportGzip({ ...baseReport(), id: "../escape" }), jpeg } }, bad);
    assert.equal(bad.statusCode, 400);
  });
});

test("GET reports capability never discloses the token", async () => {
  await withEnv(async () => { throw new Error("GET must not write Blob"); }, async () => {
    const enabled = responseRecorder(); await report({ method: "GET", headers: {} }, enabled);
    assert.equal(enabled.statusCode, 200); assert.deepEqual(JSON.parse(enabled.body), { enabled: true });
  });
  await withEnv(async () => { throw new Error("GET must not write Blob"); }, async () => {
    const response = responseRecorder(); await report({ method: "GET", headers: {} }, response);
    assert.equal(response.statusCode, 200); assert.deepEqual(JSON.parse(response.body), { enabled: false });
  }, null);
});

test("missing Blob token disables POST", async () => {
  await withEnv(async () => { throw new Error("must not write"); }, async () => {
    const response = responseRecorder(); await report({ method: "POST", headers: headers(), body: { reportGzip: reportGzip(), jpeg } }, response);
    assert.equal(response.statusCode, 503);
  }, null);
});

test("declared and streamed request limits return 413", async () => {
  await withEnv(async () => { throw new Error("must not write"); }, async () => {
    const response = responseRecorder();
    await report({ method: "POST", headers: { ...headers(), "content-length": String(report._test.MAX_REQUEST_BYTES + 1) }, body: {} }, response);
    assert.equal(response.statusCode, 413);
    const stream = Readable.from([Buffer.alloc(report._test.MAX_REQUEST_BYTES), Buffer.from("x")]); stream.method = "POST"; stream.headers = headers();
    const streamed = responseRecorder(); await report(stream, streamed); assert.equal(streamed.statusCode, 413);
  });
});

test("already existing objects are idempotent and transient writes retry", async () => {
  let attempt = 0;
  await withEnv(async () => { attempt += 1; return attempt === 1 ? { ok: false, status: 503, text: async () => "busy" } : { ok: false, status: 409, text: async () => "already exists" }; }, async () => {
    const response = responseRecorder(); await report({ method: "POST", headers: headers(), body: { reportGzip: reportGzip(), jpeg } }, response);
    assert.equal(response.statusCode, 204);
  });
  assert.equal(attempt, 3, "JSON retry plus JPEG idempotent acknowledgement");
});

test("compressed report and JPEG limits are bounded and classify as 413", async () => {
  await withEnv(async () => { throw new Error("must not write"); }, async () => {
    const oversizedGzip = gzipSync(Buffer.from("x".repeat(report._test.MAX_REPORT_JSON_BYTES + 1))).toString("base64");
    const inflated = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { reportGzip: oversizedGzip, jpeg } }, inflated);
    assert.equal(inflated.statusCode, 413);

    const oversizedJpeg = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(report._test.MAX_JPEG_BYTES)]).toString("base64");
    const image = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { reportGzip: reportGzip(), jpeg: oversizedJpeg } }, image);
    assert.equal(image.statusCode, 413);

    const malformed = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { reportGzip: "not-base64", jpeg } }, malformed);
    assert.equal(malformed.statusCode, 400);
  });
});

test("a partial write returns failure and an identical retry repairs the JPEG", async () => {
  const stored = new Map();
  let failJpeg = true;
  await withEnv(async (url, options) => {
    if (url.endsWith(".jpg") && failJpeg) throw new TypeError("fetch failed");
    if (stored.has(url)) return { ok: false, status: 409, text: async () => "already exists" };
    stored.set(url, Buffer.from(options.body));
    return { ok: true, status: 200 };
  }, async () => {
    const request = { method: "POST", headers: headers(), body: { reportGzip: reportGzip(), jpeg } };
    const failed = responseRecorder();
    await report(request, failed);
    assert.equal(failed.statusCode, 503, "network TypeError is not an invalid-payload 400");
    assert.equal(stored.size, 1);
    failJpeg = false;
    const retried = responseRecorder();
    await report(request, retried);
    assert.equal(retried.statusCode, 204);
    assert.equal(stored.size, 2);
    assert.equal(gunzipSync([...stored.values()][0]).toString(), JSON.stringify(baseReport()));
  });
});

test("method, protocol and parsed/string body guards match telemetry boundaries", async () => {
  await withEnv(async () => { throw new Error("must not store"); }, async () => {
    for (const [request, expected] of [
      [{ method: "OPTIONS", headers: headers() }, 403],
      [{ method: "DELETE", headers: headers() }, 405],
      [{ method: "POST", headers: { ...headers(), origin: "http://guns-only.vercel.app" } }, 403],
      [{ method: "POST", headers: headers(), body: { excess: "x".repeat(report._test.MAX_REQUEST_BYTES) } }, 413],
      [{ method: "POST", headers: headers(), body: "x".repeat(Math.ceil(report._test.MAX_REQUEST_BYTES) + 1) }, 413],
    ]) {
      const response = responseRecorder();
      await report(request, response);
      assert.equal(response.statusCode, expected);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
  });
});

const assert = require("node:assert/strict");
const { gunzipSync } = require("node:zlib");
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
    await report({ method: "POST", headers: headers(), body: { report: baseReport(), jpeg } }, response);
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
      { method: "POST", headers: { ...headers(), origin: "https://attacker.example" }, body: { report: baseReport(), jpeg } },
      { method: "POST", headers: { ...headers(), "content-type": "text/plain" }, body: "x" },
      { method: "POST", headers: { host: "guns-only.vercel.app", "content-type": "application/json" }, body: { report: baseReport(), jpeg } },
    ]) {
      const response = responseRecorder(); await report(request, response); assert.equal(response.statusCode, request.headers.origin === "https://attacker.example" || !request.headers.origin ? 403 : 415);
    }
  });
  assert.equal(writes, 0);
});

test("hosted originless requests and malformed reports are rejected", async () => {
  await withEnv(async () => ({ ok: true, status: 200, text: async () => "" }), async () => {
    const response = responseRecorder();
    await report({ method: "POST", headers: { host: "guns-only.vercel.app", "content-type": "application/json" }, body: { report: baseReport(), jpeg } }, response);
    assert.equal(response.statusCode, 403);
    const bad = responseRecorder();
    await report({ method: "POST", headers: headers(), body: { report: { ...baseReport(), id: "../escape" }, jpeg } }, bad);
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
    const response = responseRecorder(); await report({ method: "POST", headers: headers(), body: { report: baseReport(), jpeg } }, response);
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
    const response = responseRecorder(); await report({ method: "POST", headers: headers(), body: { report: baseReport(), jpeg } }, response);
    assert.equal(response.statusCode, 204);
  });
  assert.equal(attempt, 3, "JSON retry plus JPEG idempotent acknowledgement");
});

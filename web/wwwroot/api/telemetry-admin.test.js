const assert = require("node:assert/strict");
const test = require("node:test");

const telemetryAdmin = require("./telemetry-admin.js");

const ADMIN_TOKEN = "test-operator-secret-that-is-longer-than-32-characters";
const STORE_TOKEN = "vercel_blob_rw_test_store_secret";

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

function request(url, { method = "GET", token = ADMIN_TOKEN } = {}) {
  return {
    method,
    url,
    headers: {
      host: "guns-only.vercel.app",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
    },
  };
}

async function withEnvironment(fetchImplementation, run, environment = "production") {
  const previous = {
    fetch: global.fetch,
    admin: process.env.TELEMETRY_ADMIN_TOKEN,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    vercel: process.env.VERCEL_ENV,
  };
  global.fetch = fetchImplementation;
  process.env.TELEMETRY_ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = STORE_TOKEN;
  process.env.VERCEL_ENV = environment;
  try {
    await run();
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ["TELEMETRY_ADMIN_TOKEN", previous.admin],
      ["BLOB_READ_WRITE_TOKEN", previous.blob],
      ["VERCEL_ENV", previous.vercel],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function jsonResponse(value, status = 200) {
  const body = Buffer.from(JSON.stringify(value));
  return new Response(body, {
    status,
    headers: { "content-length": String(body.byteLength), "content-type": "application/json" },
  });
}

test("admin telemetry is production-only and requires the operator bearer before Blob access", async () => {
  for (const { environment, token, expected } of [
    { environment: "preview", token: ADMIN_TOKEN, expected: 404 },
    { environment: "production", token: null, expected: 401 },
    { environment: "production", token: "wrong-secret", expected: 401 },
  ]) {
    let fetchCalls = 0;
    await withEnvironment(async () => {
      fetchCalls += 1;
      return jsonResponse({ blobs: [] });
    }, async () => {
      const response = responseRecorder();
      await telemetryAdmin(request("/telemetry-admin?action=list", { token }), response);
      assert.equal(response.statusCode, expected);
      assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
    }, environment);
    assert.equal(fetchCalls, 0);
  }
});
test("only GET and the two explicit actions are accepted", async () => {
  await withEnvironment(async () => jsonResponse({ blobs: [] }), async () => {
    const methodResponse = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=list", { method: "POST" }), methodResponse);
    assert.equal(methodResponse.statusCode, 405);
    assert.equal(methodResponse.headers.get("allow"), "GET");

    const actionResponse = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=delete"), actionResponse);
    assert.equal(actionResponse.statusCode, 400);
  });
});

test("list performs exactly one bounded expanded metadata request", async () => {
  const calls = [];
  const listed = {
    pathname: "telemetry/web-123/batch.jsonl.gz",
    url: "https://store.private.blob.vercel-storage.com/telemetry/web-123/batch.jsonl.gz",
    size: 1234,
    uploadedAt: "2026-07-20T01:02:03.000Z",
    etag: "etag-1",
  };
  await withEnvironment(async (url, options) => {
    calls.push({ url: String(url), options });
    return jsonResponse({ blobs: [listed], hasMore: true, cursor: "next" });
  }, async () => {
    const response = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=list&prefix=telemetry%2Fweb-&limit=1"), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    assert.deepEqual(JSON.parse(response.body.toString("utf8")), {
      prefix: "telemetry/web-",
      limit: 1,
      blobs: [listed],
      hasMore: true,
      cursor: "next",
      autoPaginated: false,
    });
  });

  assert.equal(calls.length, 1);
  const [call] = calls;
  const url = new URL(call.url);
  assert.equal(url.origin, "https://blob.vercel-storage.com");
  assert.equal(url.searchParams.get("prefix"), "telemetry/web-");
  assert.equal(url.searchParams.get("limit"), "1");
  assert.equal(url.searchParams.get("mode"), "expanded");
  assert.equal(call.options.redirect, "error");
  assert.equal(call.options.headers.Authorization, `Bearer ${STORE_TOKEN}`);
  assert.equal(call.options.headers["x-api-version"], "12");
});

test("list rejects broad, oversized, and malformed metadata before returning it", async () => {
  for (const url of [
    "/telemetry-admin?action=list&prefix=other%2F&limit=1",
    "/telemetry-admin?action=list&prefix=telemetry%2F&limit=101",
  ]) {
    let fetchCalls = 0;
    await withEnvironment(async () => {
      fetchCalls += 1;
      return jsonResponse({ blobs: [] });
    }, async () => {
      const response = responseRecorder();
      await telemetryAdmin(request(url), response);
      assert.equal(response.statusCode, 400);
    });
    assert.equal(fetchCalls, 0);
  }

  await withEnvironment(async () => jsonResponse({
    blobs: [{ pathname: "other/object", size: 1, url: "https://store.blob.vercel-storage.com/other/object" }],
  }), async () => {
    const response = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=list&prefix=telemetry%2F&limit=1"), response);
    assert.equal(response.statusCode, 502);
  });
});

test("get returns exactly one selected gzip chunk when size and ETag still match", async () => {
  const contents = Buffer.from("selected gzip bytes");
  const blobUrl = "https://store.private.blob.vercel-storage.com/telemetry/web-123/batch.jsonl.gz";
  const calls = [];
  await withEnvironment(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(contents, {
      status: 200,
      headers: {
        "content-length": String(contents.byteLength),
        "content-type": "application/gzip",
        etag: '"etag-1"',
      },
    });
  }, async () => {
    const query = new URLSearchParams({
      action: "get",
      url: blobUrl,
      expectedSize: String(contents.byteLength),
      etag: "etag-1",
    });
    const response = responseRecorder();
    await telemetryAdmin(request(`/telemetry-admin?${query}`), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("content-type"), "application/gzip");
    assert.equal(response.headers.get("content-length"), String(contents.byteLength));
    assert.deepEqual(response.body, contents);
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, blobUrl);
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(calls[0].options.headers["x-api-version"], undefined);
});

test("get rejects non-telemetry URLs, mismatched metadata, partials, and oversized chunks", async () => {
  let fetchCalls = 0;
  await withEnvironment(async () => {
    fetchCalls += 1;
    return new Response(Buffer.from("x"), { status: 200, headers: { etag: "etag" } });
  }, async () => {
    const query = new URLSearchParams({
      action: "get",
      url: "https://example.com/telemetry/session/chunk.jsonl.gz",
      expectedSize: "1",
      etag: "etag",
    });
    const response = responseRecorder();
    await telemetryAdmin(request(`/telemetry-admin?${query}`), response);
    assert.equal(response.statusCode, 400);
  });
  assert.equal(fetchCalls, 0);

  for (const headers of [
    { "content-length": "2", etag: "other" },
    { "content-length": "2", etag: "etag", "content-range": "bytes 0-1/2" },
    { "content-length": String(4 * 1024 * 1024 + 1), etag: "etag" },
  ]) {
    await withEnvironment(async () => new Response(Buffer.from("xx"), { status: 200, headers }), async () => {
      const query = new URLSearchParams({
        action: "get",
        url: "https://store.blob.vercel-storage.com/telemetry/session/chunk.jsonl.gz",
        expectedSize: headers["content-length"],
        etag: "etag",
      });
      const response = responseRecorder();
      await telemetryAdmin(request(`/telemetry-admin?${query}`), response);
      assert.ok([400, 409, 502].includes(response.statusCode));
    });
  }
});

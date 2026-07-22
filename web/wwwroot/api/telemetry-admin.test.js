const assert = require("node:assert/strict");
const test = require("node:test");
const { gzipSync } = require("node:zlib");

const telemetryAdmin = require("./telemetry-admin.js");

const ADMIN_TOKEN = "test-operator-secret-that-is-longer-than-32-characters";
const REPORT_TOKEN = "test-report-secret-that-is-longer-than-32-characters";
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
    report: process.env.TELEMETRY_REPORT_TOKEN,
    blob: process.env.BLOB_READ_WRITE_TOKEN,
    vercel: process.env.VERCEL_ENV,
  };
  global.fetch = fetchImplementation;
  process.env.TELEMETRY_ADMIN_TOKEN = ADMIN_TOKEN;
  process.env.TELEMETRY_REPORT_TOKEN = REPORT_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = STORE_TOKEN;
  process.env.VERCEL_ENV = environment;
  try {
    await run();
  } finally {
    global.fetch = previous.fetch;
    for (const [key, value] of [
      ["TELEMETRY_ADMIN_TOKEN", previous.admin],
      ["TELEMETRY_REPORT_TOKEN", previous.report],
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
test("summary uses a separate report bearer that cannot authorize raw list access", async () => {
  await withEnvironment(async () => jsonResponse({ blobs: [] }), async () => {
    const wrongSummaryToken = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=summary", { token: ADMIN_TOKEN }), wrongSummaryToken);
    assert.equal(wrongSummaryToken.statusCode, 401);

    const wrongListToken = responseRecorder();
    await telemetryAdmin(request("/telemetry-admin?action=list", { token: REPORT_TOKEN }), wrongListToken);
    assert.equal(wrongListToken.statusCode, 401);
  });
});

test("only GET and the three explicit actions are accepted", async () => {
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

test("summary returns bounded, non-identifying session, sortie, and combat aggregates", async () => {
  const chunks = [
    {
      session: "web-private-a",
      etag: "etag-a",
      uploadedAt: "2026-07-22T13:47:00.000Z",
      rows: [
        { k: "hdr", session: "web-private-a", build: "65", ua: "private agent" },
        { k: "in", type: "lifecycle", code: "sortie_started", sortie: "sortie-private-a" },
        { k: "st", q: 0, s: { telemetry_sortie_id: "sortie-private-a", t: 0, rounds_fired: 0,
          hits: 0, kill_count: 0, shots_total: 0, shots_in_window: 0, player_alive: true,
          opponent_alive: true, finished: false, sortie_outcome: "NONE" } },
        { k: "st", q: 1, d: { t: 12.5, rounds_fired: 10, hits: 2, kill_count: 1,
          shots_total: 10, shots_in_window: 8, opponent_alive: false, finished: true,
          sortie_outcome: "VICTORY" } },
        { k: "in", type: "lifecycle", code: "sortie_finished", sortie: "sortie-private-a",
          sortie_outcome: "VICTORY" },
        { k: "in", type: "lifecycle", code: "sortie_ended", sortie: "sortie-private-a",
          reason: "finished", sortie_outcome: "VICTORY" },
      ],
    },
    {
      session: "web-private-b",
      etag: "etag-b",
      uploadedAt: "2026-07-22T13:48:00.000Z",
      rows: [
        { k: "hdr", session: "web-private-b", build: "65", ua: "another private agent" },
        { k: "in", type: "lifecycle", code: "sortie_started", sortie: "sortie-private-b" },
        { k: "st", q: 0, s: { telemetry_sortie_id: "sortie-private-b", t: 0, rounds_fired: 0,
          hits: 0, kill_count: 0, shots_total: 0, shots_in_window: 0, player_alive: true,
          opponent_alive: true, finished: false, sortie_outcome: "NONE" } },
        { k: "st", q: 1, d: { t: 8, rounds_fired: 5, shots_total: 5, shots_in_window: 1,
          player_alive: false, sortie_outcome: "DEFEAT" } },
        { k: "in", type: "lifecycle", code: "sortie_ended", sortie: "sortie-private-b",
          reason: "player_destroyed", sortie_outcome: "DEFEAT" },
      ],
    },
  ].map((chunk) => {
    const body = gzipSync(Buffer.from(`${chunk.rows.map((row) => JSON.stringify(row)).join("\n")}\n`));
    const pathname = `telemetry/${chunk.session}/batch-${chunk.session}.jsonl.gz`;
    return {
      ...chunk,
      body,
      pathname,
      url: `https://store.private.blob.vercel-storage.com/${pathname}`,
    };
  });
  const calls = [];

  await withEnvironment(async (url, options) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(url);
    if (parsed.hostname === "blob.vercel-storage.com") {
      return jsonResponse({
        blobs: chunks.map((chunk) => ({
          pathname: chunk.pathname,
          url: chunk.url,
          size: chunk.body.byteLength,
          uploadedAt: chunk.uploadedAt,
          etag: chunk.etag,
        })),
        hasMore: false,
      });
    }
    const chunk = chunks.find((candidate) => candidate.url === String(url));
    assert.ok(chunk, `unexpected Blob URL ${url}`);
    return new Response(chunk.body, {
      status: 200,
      headers: {
        "content-length": String(chunk.body.byteLength),
        "content-type": "application/gzip",
        etag: `"${chunk.etag}"`,
      },
    });
  }, async () => {
    const response = responseRecorder();
    await telemetryAdmin(request(
      "/telemetry-admin?action=summary&prefix=telemetry%2Fweb-private-&limit=2",
      { token: REPORT_TOKEN },
    ), response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
    const payload = JSON.parse(response.body.toString("utf8"));
    assert.equal(payload.scope.partial, false);
    assert.equal(payload.coverage.chunks_read, 2);
    assert.equal(payload.sessions.observed, 2);
    assert.deepEqual(payload.sessions.builds, { 65: 2 });
    assert.equal(payload.sorties.observed, 2);
    assert.equal(payload.sorties.started_events, 2);
    assert.equal(payload.sorties.finished, 1);
    assert.equal(payload.sorties.completion_rate, 0.5);
    assert.deepEqual(payload.sorties.outcomes, { VICTORY: 1, DEFEAT: 1 });
    assert.equal(payload.combat.rounds_fired, 15);
    assert.equal(payload.combat.hits, 2);
    assert.equal(payload.combat.hit_rate, 0.1333);
    assert.equal(payload.combat.kills, 1);
    assert.equal(payload.combat.player_deaths, 1);
    assert.equal(payload.combat.opponent_deaths, 1);
    assert.equal(payload.combat.gun_window_share, 0.6);
    assert.equal(payload.combat.median_time_to_first_shot_seconds, 10.25);
    assert.equal(payload.privacy.raw_rows_returned, false);
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /web-private|sortie-private|private agent/);
  });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].options.headers["x-api-version"], "12");
  assert.ok(calls.slice(1).every((call) => call.options.redirect === "error"));
});

test("summary enforces its own chunk-count ceiling before Blob access", async () => {
  let fetchCalls = 0;
  await withEnvironment(async () => {
    fetchCalls += 1;
    return jsonResponse({ blobs: [] });
  }, async () => {
    const response = responseRecorder();
    await telemetryAdmin(request(
      "/telemetry-admin?action=summary&prefix=telemetry%2F&limit=21",
      { token: REPORT_TOKEN },
    ), response);
    assert.equal(response.statusCode, 400);
  });
  assert.equal(fetchCalls, 0);
});

test("summary reports legacy flat objects separately and still reads modern chunks on the page", async () => {
  const session = "web-modern";
  const pathname = `telemetry/${session}/batch-modern.jsonl.gz`;
  const url = `https://store.private.blob.vercel-storage.com/${pathname}`;
  const body = gzipSync(Buffer.from(`${JSON.stringify({
    k: "hdr", session, build: "65",
  })}\n`));
  let fetchCalls = 0;
  await withEnvironment(async (requestedUrl) => {
    fetchCalls += 1;
    if (new URL(requestedUrl).hostname === "blob.vercel-storage.com") {
      return jsonResponse({
        blobs: [
          {
            pathname: "telemetry/web-legacy.jsonl.gz",
            url: "https://store.private.blob.vercel-storage.com/telemetry/web-legacy.jsonl.gz",
            size: 100_000_000,
            uploadedAt: "2026-07-20T00:00:00.000Z",
            etag: "legacy",
          },
          {
            pathname,
            url,
            size: body.byteLength,
            uploadedAt: "2026-07-22T00:00:00.000Z",
            etag: "modern",
          },
        ],
        hasMore: false,
      });
    }
    assert.equal(String(requestedUrl), url);
    return new Response(body, {
      status: 200,
      headers: { "content-length": String(body.byteLength), etag: '"modern"' },
    });
  }, async () => {
    const response = responseRecorder();
    await telemetryAdmin(request(
      "/telemetry-admin?action=summary&prefix=telemetry%2Fweb-&limit=2",
      { token: REPORT_TOKEN },
    ), response);
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body.toString("utf8"));
    assert.equal(payload.scope.partial, true);
    assert.equal(payload.coverage.chunks_listed, 2);
    assert.equal(payload.coverage.chunks_read, 1);
    assert.equal(payload.coverage.chunks_unsupported_format, 1);
    assert.equal(payload.coverage.chunks_skipped_by_budget, 0);
    assert.equal(payload.sessions.observed, 1);
  });
  assert.equal(fetchCalls, 2);
});

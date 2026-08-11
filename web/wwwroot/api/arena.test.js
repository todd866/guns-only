const assert = require("node:assert/strict");
const test = require("node:test");

const arena = require("./arena.js");
const { ArenaStore, STARTING_ELO } = require("./arena-logic.js");

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

function resetMemoryStore() {
  delete globalThis.__gunsArenaMemoryStore;
}

async function withArenaEnv(run, { vercelEnvironment = "preview", token = null } = {}) {
  const previousToken = process.env.BLOB_READ_WRITE_TOKEN;
  const previousVercel = process.env.VERCEL_ENV;
  resetMemoryStore();
  if (token === null) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = token;
  if (vercelEnvironment === null) delete process.env.VERCEL_ENV;
  else process.env.VERCEL_ENV = vercelEnvironment;
  try {
    await run();
  } finally {
    resetMemoryStore();
    if (previousToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = previousToken;
    if (previousVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercel;
  }
}

test("same-origin match + complete updates Elo in memory storage", async () => {
  await withArenaEnv(async () => {
    const created = responseRecorder();
    await arena({
      method: "POST",
      url: "/api/arena",
      headers: {
        host: "localhost:8877",
        origin: "http://localhost:8877",
        "content-type": "application/json",
      },
      body: { action: "match", pilotKey: "browser-testkey-arena01" },
    }, created);
    assert.equal(created.statusCode, 200);
    const match = JSON.parse(created.body);
    assert.equal(match.ok, true);
    assert.equal(match.human.elo, STARTING_ELO);
    assert.ok(match.handicap.maxAcquireG > 0);

    const completed = responseRecorder();
    await arena({
      method: "POST",
      url: "/api/arena",
      headers: {
        host: "localhost:8877",
        origin: "http://localhost:8877",
        "content-type": "application/json",
      },
      body: {
        action: "complete",
        matchId: match.matchId,
        pilotKey: "browser-testkey-arena01",
        outcome: "win",
        againVote: 1,
        sanity: { durationS: 90, roundsFired: 40, engagementReached: true },
      },
    }, completed);
    assert.equal(completed.statusCode, 200);
    const result = JSON.parse(completed.body);
    assert.equal(result.rated, true);
    assert.ok(result.human.elo > STARTING_ELO);
  }, { vercelEnvironment: null, token: null });
});

test("hosted cross-origin posts are rejected", async () => {
  await withArenaEnv(async () => {
    const response = responseRecorder();
    await arena({
      method: "POST",
      url: "/api/arena",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: { action: "match", pilotKey: "browser-testkey-arena02" },
    }, response);
    assert.equal(response.statusCode, 403);
  }, { vercelEnvironment: "production", token: null });
});

test("health reports memory storage when Blob token is absent", async () => {
  await withArenaEnv(async () => {
    const response = responseRecorder();
    await arena({
      method: "GET",
      url: "/api/arena",
      headers: { host: "localhost:8877" },
    }, response);
    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.status, "ok");
    assert.equal(body.storage, "memory");
    assert.equal(body.protocol, 1);
  }, { vercelEnvironment: null, token: null });
});

test("hosted arena fails closed when durable storage is not configured", async () => {
  await withArenaEnv(async () => {
    const response = responseRecorder();
    await arena({
      method: "POST",
      url: "/arena",
      headers: {
        host: "guns-only.vercel.app",
        origin: "https://guns-only.vercel.app",
        "content-type": "application/json",
      },
      body: { action: "match", pilotKey: "browser-testkey-arena03" },
    }, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), {
      ok: false,
      reason: "storage",
      detail: "BLOB_READ_WRITE_TOKEN is not configured",
    });
  }, { vercelEnvironment: "preview", token: null });
});

test("blob-backed match reads and writes ladder JSON", async () => {
  const blobs = new Map();
  const previousFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    const path = String(url).replace("https://blob.vercel-storage.com/", "");
    if (options.method === "GET") {
      if (!blobs.has(path)) return { ok: false, status: 404, headers: new Map(), text: async () => "" };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => blobs.get(path),
      };
    }
    if (options.method === "PUT") {
      blobs.set(path, Buffer.isBuffer(options.body) ? options.body.toString("utf8") : String(options.body));
      return { ok: true, status: 200, text: async () => "" };
    }
    throw new Error(`unexpected ${options.method}`);
  };
  try {
    await withArenaEnv(async () => {
      const created = responseRecorder();
      await arena({
        method: "POST",
        url: "/arena",
        headers: {
          host: "guns-only.vercel.app",
          origin: "https://guns-only.vercel.app",
          "content-type": "application/json",
        },
        body: { action: "match", pilotKey: "browser-blob-arena-0001" },
      }, created);
      assert.equal(created.statusCode, 200);
      assert.ok(blobs.has("arena/ladder-v1.json"));
      const ladder = JSON.parse(blobs.get("arena/ladder-v1.json"));
      assert.equal(ladder.protocol, 1);
      assert.ok(ladder.bots.length >= 4);
    }, { vercelEnvironment: "production", token: "vercel_blob_rw_test_store_secret" });
  } finally {
    global.fetch = previousFetch;
  }
});

test("ArenaStore still exposes seeded bots for unit use", () => {
  const store = new ArenaStore({ now: () => 1, random: () => 0 });
  assert.equal(store.bots.size, 4);
  assert.ok([...store.bots.values()].every((bot) => bot.elo > STARTING_ELO));
});

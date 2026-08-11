import {
  ARENA_PROTOCOL,
  ArenaStore,
  normalisePilotKey,
} from "./arena.js";

const json = (value, init = {}) => new Response(JSON.stringify(value), {
  ...init,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(init.headers || {}),
  },
});

function isAllowedOrigin(origin, configured) {
  if (!origin) return true;
  const allowed = String(configured || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !isAllowedOrigin(origin, env.GUNS_ALLOWED_ORIGINS)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin",
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const origin = request.headers.get("Origin");
    if (origin && !isAllowedOrigin(origin, env.GUNS_ALLOWED_ORIGINS)) {
      return new Response("Origin is not allowed", { status: 403 });
    }

    if (url.pathname === "/healthz") {
      const id = env.ARENA.idFromName("global");
      const response = await env.ARENA.get(id).fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders(request, env))) {
        headers.set(key, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }

    if (!url.pathname.startsWith("/v1/")) {
      return new Response("Not found", { status: 404 });
    }

    const id = env.ARENA.idFromName("global");
    const response = await env.ARENA.get(id).fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders(request, env))) {
      headers.set(key, value);
    }
    return new Response(response.body, { status: response.status, headers });
  },
};

export default worker;

export class Arena {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.store = null;
    this.ready = this.hydrate();
  }

  async hydrate() {
    const snapshot = await this.state.storage.get("arena-v1");
    this.store = new ArenaStore({
      now: () => Date.now(),
      random: Math.random,
    });
    if (snapshot && typeof snapshot === "object") {
      this.store.humans = new Map(snapshot.humans || []);
      this.store.bots = new Map(snapshot.bots || []);
      this.store.matches = new Map(snapshot.matches || []);
      this.store._seq = Number(snapshot.seq) || 0;
      // Re-seed any missing stock bots after schema bumps.
      for (const [botId, bot] of new ArenaStore().bots) {
        if (!this.store.bots.has(botId)) this.store.bots.set(botId, bot);
      }
    }
  }

  async persist() {
    await this.state.storage.put("arena-v1", {
      humans: [...this.store.humans.entries()],
      bots: [...this.store.bots.entries()],
      matches: [...this.store.matches.entries()],
      seq: this.store._seq,
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);

    if (url.pathname === "/healthz" && request.method === "GET") {
      return json({ ...this.store.health(), service: "guns-only-arena" });
    }

    if (url.pathname === "/v1/standings" && request.method === "GET") {
      const limit = Number(url.searchParams.get("limit") || 50);
      return json({ protocol: ARENA_PROTOCOL, standings: this.store.standings(limit) });
    }

    if (url.pathname === "/v1/match" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !normalisePilotKey(body.pilotKey)) {
        return json({ ok: false, reason: "invalid-pilot-key" }, { status: 400 });
      }
      const result = await this.store.createMatch({
        pilotKey: body.pilotKey,
        scaffolded: Boolean(body.scaffolded),
      });
      if (!result.ok) {
        return json(result, { status: result.reason === "no-eligible-bot" ? 503 : 400 });
      }
      await this.persist();
      return json(result);
    }

    if (url.pathname === "/v1/match/complete" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !body.matchId || !normalisePilotKey(body.pilotKey)) {
        return json({ ok: false, reason: "invalid-request" }, { status: 400 });
      }
      const result = await this.store.completeMatchRequest({
        matchId: String(body.matchId),
        pilotKey: body.pilotKey,
        outcome: body.outcome,
        completed: body.completed !== false,
        earlyAbandon: Boolean(body.earlyAbandon),
        rematch: Boolean(body.rematch),
        againVote: Number(body.againVote) || 0,
        sanity: body.sanity ?? null,
      });
      if (!result.ok) {
        const status = result.reason === "unknown-match" ? 404
          : result.reason === "already-completed" ? 409
            : 400;
        return json(result, { status });
      }
      await this.persist();
      return json(result);
    }

    return new Response("Not found", { status: 404 });
  }
}

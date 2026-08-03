import test from "node:test";
import assert from "node:assert/strict";
import {
  ArenaClient,
  arenaEnabled,
  resolveArenaUrl,
} from "../arena_client.js";

test("arena is opt-in via query string", () => {
  assert.equal(resolveArenaUrl({
    location: { search: "", hostname: "guns-only.com" },
    configured: "https://guns-only-arena.example",
  }), "");
  assert.equal(arenaEnabled({ search: "", hostname: "guns-only.com" }), false);
  assert.equal(resolveArenaUrl({
    location: { search: "?arena=1", hostname: "guns-only.com" },
    configured: "https://guns-only-arena.example",
  }), "https://guns-only-arena.example");
  assert.equal(resolveArenaUrl({
    location: { search: "?arena=off", hostname: "guns-only.com" },
    configured: "https://guns-only-arena.example",
  }), "");
});

test("requestMatch and completeFromState round-trip through fetch", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/v1/match")) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          matchId: "match_1",
          bot: { botId: "bot:ace", nativeSkill: "ACE", elo: 1600 },
          handicap: { skillBlend: 2, maxAcquireG: 5.5, highSkill: "VETERAN" },
          human: { elo: 1000 },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        rated: true,
        human: { elo: 1020, delta: 20 },
        bot: { elo: 1585, delta: -15 },
      }),
    };
  };

  const client = new ArenaClient({
    baseUrl: "http://arena.test",
    fetchImpl,
    pilotKey: "browser-testkey-arena01",
  });
  const match = await client.requestMatch();
  assert.equal(match.matchId, "match_1");

  const bridge = {
    applied: null,
    ApplyArenaHandicap(json, skill) {
      this.applied = { json, skill };
      return true;
    },
  };
  assert.equal(client.applyHandicapToBridge(bridge), true);
  assert.equal(bridge.applied.skill, "VETERAN");

  client.beginTracking({ shots_total: 0, range_m: 3000 });
  client.observe({ shots_total: 10, range_m: 800, bandit_alive: true, player_alive: true });
  const result = await client.completeFromState({
    shots_total: 40,
    range_m: 400,
    bandit_alive: false,
    player_alive: true,
    fight: "Splash",
    finished: true,
  }, { againVote: 1 });
  assert.equal(result.rated, true);
  assert.equal(calls.length, 2);
  const completeBody = JSON.parse(calls[1].init.body);
  assert.equal(completeBody.outcome, "win");
  assert.equal(completeBody.againVote, 1);
  assert.equal(completeBody.sanity.engagementReached, true);
});

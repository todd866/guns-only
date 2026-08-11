import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ArenaClient,
  arenaEnabled,
  resolveArenaUrl,
  usesVercelArenaApi,
} from "../arena_client.js";

const appSource = readFileSync(new URL("../../../app.js", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../../../index.html", import.meta.url), "utf8");

test("multiplayer forceSameOrigin resolves to /arena without query flag", () => {
  assert.equal(resolveArenaUrl({
    location: { search: "", hostname: "guns-only.com", origin: "https://guns-only.com" },
    forceSameOrigin: true,
  }), "https://guns-only.com/arena");
  assert.equal(usesVercelArenaApi("https://guns-only.com/arena"), true);
  assert.equal(arenaEnabled({ search: "", hostname: "guns-only.com" }), false);
  assert.equal(arenaEnabled(
    { search: "", hostname: "guns-only.com", origin: "https://guns-only.com" },
    { forceSameOrigin: true },
  ), true);
  assert.equal(resolveArenaUrl({
    location: {
      search: "?arena=https://evil.example&arena=off",
      hostname: "guns-only.com",
      origin: "https://guns-only.com",
    },
    configured: "https://other.example",
    forceSameOrigin: true,
  }), "https://guns-only.com/arena",
  "the preview lane cannot be redirected away from its same-origin fail-closed API");
});

test("requestMatch uses action payloads on /arena", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
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
      json: async () => ({ ok: true, rated: true, human: { elo: 1020, delta: 20 } }),
    };
  };

  const client = new ArenaClient({
    baseUrl: "https://guns-only.com/arena",
    fetchImpl,
    pilotKey: "browser-testkey-arena01",
  });
  await client.requestMatch();
  assert.equal(JSON.parse(calls[0].init.body).action, "match");
  client.beginTracking({ shots_total: 0, range_m: 500 });
  await client.completeFromState({
    shots_total: 20,
    bandit_alive: false,
    player_alive: true,
    fight: "Splash",
    finished: true,
  });
  assert.equal(JSON.parse(calls[1].init.body).action, "complete");
});

test("the preview lane cannot launch or retain authority without a ready arena match", () => {
  assert.match(indexSource,
    /<div class="sortie-option"[^>]*data-program-state="preview"[^>]*hidden>[\s\S]*?data-program-node="multiplayer"/,
    "the Multiplayer card must stay out of the production picker");
  assert.match(appSource,
    /function arenaMatchReady\(\)[\s\S]*?arenaMatchState === "ready"[\s\S]*?arenaClient\?\.activeMatch[\s\S]*?!arenaCompletionPromise/,
    "launch readiness must require both a live match and no pending completion");
  assert.match(appSource,
    /function launchMission[\s\S]*?if \(!arenaMatchReady\(\)\)[\s\S]*?ensureArenaMatch\(bridge\)[\s\S]*?return false/,
    "Fly must request or retry matchmaking instead of falling through to the ordinary AI");
  assert.match(appSource,
    /const authorityChanged = stagedArenaLane !== isMultiplayerLane\(\)[\s\S]*?enterReady\(\{ resetBridge: true/,
    "switching between the shared mission-7 lanes must restage bot authority");
  assert.match(appSource,
    /const authorityChanged = stagedArenaLane !== isMultiplayerLane\(\)[\s\S]*?\|\| !sameMissionAuthority\([\s\S]*?stagedMissionAuthority,[\s\S]*?selectedProductionMissionAuthority\(\)/,
    "leaving a staged Top Gun preview must restage the selected production authority");
  assert.match(appSource,
    /if \(standalone\?\.id === TOP_GUN_PROGRAM_ID\)[\s\S]*?selectedProgramNodeId = standalone\.id;\s*syncArenaClientForLane\(\);/,
    "selecting Top Gun must abandon the multiplayer match before staging Top Gun authority");
  assert.match(appSource,
    /function syncArenaClientForLane\(\)[\s\S]*?const previousCompletion = arenaCompletionPromise;[\s\S]*?arenaCompletionPromise = null;[\s\S]*?previousClient\?\.activeMatch && !previousCompletion[\s\S]*?ClearArenaHandicap/,
    "leaving multiplayer must clear its handicap without duplicating an in-flight completion");
  assert.match(appSource,
    /function observeArenaMatch\(state\)[\s\S]*?\.then\([\s\S]*?ClearArenaHandicap[\s\S]*?setArenaMatchState\("idle"\)[\s\S]*?\.catch\([\s\S]*?ClearArenaHandicap[\s\S]*?setArenaMatchState\("unavailable"\)/,
    "terminal success and failure must both retire the completed match handicap");
  assert.match(appSource,
    /function activateReadyAction\(\)[\s\S]*?pauseReasons\.has\("finished"\)[\s\S]*?if \(!isMultiplayerLane\(\)\)[\s\S]*?nextCampaignNode[\s\S]*?return restartMissionNow\(\)/,
    "the primary Fly again action must stay in the rated multiplayer lane");
  assert.match(appSource,
    /installTestFlightConsole\(\);[\s\S]*?syncArenaClientForLane\(\);[\s\S]*?ensureArenaMatch\(bridge\)/,
    "a preview deep link must initialize matchmaking during boot");
});

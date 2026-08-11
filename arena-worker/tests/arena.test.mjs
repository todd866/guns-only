import test from "node:test";
import assert from "node:assert/strict";
import {
  ArenaStore,
  SEED_BOTS,
  STARTING_ELO,
  applyElo,
  expectedScore,
  funScore,
  handicappedSkillBlend,
  kFactor,
  profileAtBlend,
  botEligibleForHumans,
  applyFunSignals,
} from "../src/arena.js";

test("expected score is symmetric and favours the higher rating", () => {
  assert.equal(expectedScore(1000, 1000), 0.5);
  assert.ok(expectedScore(1800, 1000) > 0.9);
  assert.ok(Math.abs(expectedScore(1000, 1800) + expectedScore(1800, 1000) - 1) < 1e-12);
});

test("a high-Elo machine losing to a much weaker human takes a large hit", () => {
  const human = 1000;
  const machine = 1800;
  const { ratingA, ratingB } = applyElo(human, machine, 1, 40, 20);
  assert.ok(ratingA > human);
  assert.ok(machine - ratingB > 15, `expected big bot hit, got ${machine - ratingB}`);
});

test("handicap nerfs an over-Elo bot toward a weaker skill blend", () => {
  const blend = handicappedSkillBlend("MACHINE", 1800, 1000);
  assert.equal(blend, 2,
    "a first match may soften Machine to Veteran, but never collapse it to Novice");
  const profile = profileAtBlend(blend);
  assert.ok(profile.maxAcquireG < 15);
  assert.ok(profile.maxAcquireG > 2.4);
});

test("seeded bots start above humans and are human-eligible", () => {
  const store = new ArenaStore({ now: () => 1_700_000_000_000, random: () => 0 });
  assert.equal(store.bots.size, SEED_BOTS.length);
  for (const bot of store.bots.values()) {
    assert.ok(bot.elo > STARTING_ELO);
    assert.equal(botEligibleForHumans(bot), true);
  }
});

test("create + complete rated match updates both Elos and fun", async () => {
  const store = new ArenaStore({
    now: () => 1_700_000_000_000,
    random: () => 0,
    idFactory: () => "match_test_1",
  });
  const created = await store.createMatch({ pilotKey: "browser-testkey-001" });
  assert.equal(created.ok, true);
  assert.equal(created.human.elo, STARTING_ELO);
  assert.ok(created.handicap.maxAcquireG > 0);

  const completed = await store.completeMatchRequest({
    matchId: created.matchId,
    pilotKey: "browser-testkey-001",
    outcome: "win",
    completed: true,
    againVote: 1,
    sanity: { durationS: 90, roundsFired: 40, engagementReached: true },
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.rated, true);
  assert.ok(completed.human.elo > STARTING_ELO);
  assert.ok(completed.bot.elo < created.bot.elo);
  assert.ok(completed.bot.funScore > funScore(8, 2) - 1e-9);
});

test("insanitary or abandoned fights do not move Elo but still update fun", async () => {
  const store = new ArenaStore({
    now: () => 1,
    random: () => 0,
    idFactory: () => "match_test_2",
  });
  const created = await store.createMatch({ pilotKey: "browser-testkey-002" });
  const botBefore = created.bot.elo;
  const completed = await store.completeMatchRequest({
    matchId: created.matchId,
    pilotKey: "browser-testkey-002",
    outcome: "loss",
    earlyAbandon: true,
    sanity: { durationS: 5, roundsFired: 0, engagementReached: false },
  });
  assert.equal(completed.rated, false);
  assert.equal(completed.human.elo, STARTING_ELO);
  assert.equal(completed.bot.elo, botBefore);
  assert.ok(completed.bot.funScore < funScore(8, 2));
});

test("fun gate hides a bot once exploration is spent and fun collapses", () => {
  let bot = {
    explorationRemaining: 0,
    funAlpha: 1,
    funBeta: 20,
  };
  assert.equal(botEligibleForHumans(bot), false);
  bot = applyFunSignals({ ...bot, funAlpha: 8, funBeta: 2, explorationRemaining: 0 }, {
    completed: true,
    rematch: true,
    againVote: 1,
  });
  assert.equal(botEligibleForHumans(bot), true);
});

test("provisional humans use a higher K than settled players", () => {
  assert.equal(kFactor(0), 40);
  assert.equal(kFactor(20), 20);
  assert.equal(kFactor(5, { scaffolded: true }), 8);
  assert.equal(kFactor(5, { scaffolded: true, forceFullK: true }), 40);
});

test("standings list bots and humans who have played", async () => {
  const store = new ArenaStore({ now: () => 1, random: () => 0, idFactory: () => "m1" });
  const created = await store.createMatch({ pilotKey: "browser-standing-01" });
  await store.completeMatchRequest({
    matchId: created.matchId,
    pilotKey: "browser-standing-01",
    outcome: "loss",
    sanity: { durationS: 60, roundsFired: 10, engagementReached: true },
  });
  const board = store.standings(10);
  assert.ok(board.some((row) => row.kind === "bot"));
  assert.ok(board.some((row) => row.kind === "human"));
  assert.ok(board[0].elo >= board[board.length - 1].elo);
});

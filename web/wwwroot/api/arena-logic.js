"use strict";
const { createHash } = require("crypto");

/**
 * Rated arena: shared Elo for humans and bots, handicap by interpolating
 * BanditSkillProfile knobs, fun score fields ready for the human-traffic gate.
 *
 * Mirrors sim/Doctrine/PilotSkill.cs tier tables. Handicap never changes human physics.
 */

const ARENA_PROTOCOL = 1;
const STARTING_ELO = 1000;
const PROVISIONAL_GAMES = 20;
const PROVISIONAL_K = 40;
const STANDARD_K = 20;
const SCAFFOLDED_K = 8;
const ELO_PER_SKILL_STEP = 200;
const FUN_THRESHOLD = 0.45;
const EXPLORATION_HUMAN_MATCHES = 12;
const REMATCH_WINDOW_MS = 15 * 60 * 1000;
const MINIMUM_RATED_DURATION_S = 20;
const MINIMUM_ROUNDS_FOR_RATED = 1;

/** Skill blend: 0 Novice … 4 Machine (same order as PilotSkill). */
const SKILL_TIERS = Object.freeze([
  "NOVICE",
  "COMPETENT",
  "VETERAN",
  "ACE",
  "MACHINE",
]);

/** BanditSkillProfile knobs aligned with PilotSkill.cs For(...). */
const SKILL_PROFILES = Object.freeze({
  NOVICE: Object.freeze({
    maxAcquireG: 2.4,
    acquireGGain: 1.0,
    forcesOvershoot: false,
    disengagesWhenLosing: false,
    doctrineCount: 1,
    lookaheadHorizonTicks: 0,
    fireConeDeg: 3.0,
    leadFireConeDeg: 0.25,
    lowBlockClearanceM: 260.0,
    lowBlockRecommitSeconds: 0.0,
    energyRetentionWeight: 1.0,
  }),
  COMPETENT: Object.freeze({
    maxAcquireG: 4.8,
    acquireGGain: 1.8,
    forcesOvershoot: true,
    disengagesWhenLosing: false,
    doctrineCount: 1,
    lookaheadHorizonTicks: 100,
    fireConeDeg: 3.5,
    leadFireConeDeg: 0.4,
    lowBlockClearanceM: 260.0,
    lowBlockRecommitSeconds: 5.0,
    energyRetentionWeight: 1.0,
  }),
  VETERAN: Object.freeze({
    maxAcquireG: 5.5,
    acquireGGain: 1.8,
    forcesOvershoot: false,
    disengagesWhenLosing: true,
    doctrineCount: 2,
    lookaheadHorizonTicks: 90,
    fireConeDeg: 5.0,
    leadFireConeDeg: 0.45,
    lowBlockClearanceM: 180.0,
    lowBlockRecommitSeconds: 1.8,
    energyRetentionWeight: 1.0,
  }),
  ACE: Object.freeze({
    maxAcquireG: 9.0,
    acquireGGain: 2.2,
    forcesOvershoot: true,
    disengagesWhenLosing: true,
    doctrineCount: 3,
    lookaheadHorizonTicks: 150,
    fireConeDeg: 3.5,
    leadFireConeDeg: 0.35,
    lowBlockClearanceM: 105.0,
    lowBlockRecommitSeconds: 0.35,
    energyRetentionWeight: 1.0,
  }),
  MACHINE: Object.freeze({
    maxAcquireG: 15.0,
    acquireGGain: 2.2,
    forcesOvershoot: true,
    disengagesWhenLosing: true,
    doctrineCount: 3,
    lookaheadHorizonTicks: 180,
    fireConeDeg: 3.0,
    leadFireConeDeg: 0.35,
    lowBlockClearanceM: 105.0,
    lowBlockRecommitSeconds: 0.35,
    energyRetentionWeight: 1.3,
  }),
});

const SEED_BOTS = Object.freeze([
  Object.freeze({
    botId: "bot:competent",
    displayName: "Competent",
    nativeSkill: "COMPETENT",
    elo: 1200,
    funAlpha: 8,
    funBeta: 2,
    explorationRemaining: EXPLORATION_HUMAN_MATCHES,
  }),
  Object.freeze({
    botId: "bot:veteran",
    displayName: "Veteran",
    nativeSkill: "VETERAN",
    elo: 1400,
    funAlpha: 8,
    funBeta: 2,
    explorationRemaining: EXPLORATION_HUMAN_MATCHES,
  }),
  Object.freeze({
    botId: "bot:ace",
    displayName: "Ace",
    nativeSkill: "ACE",
    elo: 1600,
    funAlpha: 8,
    funBeta: 2,
    explorationRemaining: EXPLORATION_HUMAN_MATCHES,
  }),
  Object.freeze({
    botId: "bot:machine",
    displayName: "Machine",
    nativeSkill: "MACHINE",
    elo: 1800,
    funAlpha: 8,
    funBeta: 2,
    explorationRemaining: EXPLORATION_HUMAN_MATCHES,
  }),
]);

function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

function kFactor(gamesPlayed, { scaffolded = false, forceFullK = false } = {}) {
  if (scaffolded && !forceFullK) return SCAFFOLDED_K;
  return gamesPlayed < PROVISIONAL_GAMES ? PROVISIONAL_K : STANDARD_K;
}

/**
 * Apply Elo. Human upset losses against a much weaker opponent always use full K on the
 * high-rated side (forceFullK), so machine farm Elo stays fragile to humans.
 */
function applyElo(ratingA, ratingB, scoreA, kA, kB) {
  const expA = expectedScore(ratingA, ratingB);
  const expB = 1 - expA;
  return {
    ratingA: ratingA + kA * (scoreA - expA),
    ratingB: ratingB + kB * ((1 - scoreA) - expB),
    expectedA: expA,
  };
}

function funScore(alpha, beta) {
  const a = Math.max(1e-6, alpha);
  const b = Math.max(1e-6, beta);
  return a / (a + b);
}

function botEligibleForHumans(bot) {
  if ((bot.explorationRemaining ?? 0) > 0) return true;
  return funScore(bot.funAlpha, bot.funBeta) >= FUN_THRESHOLD;
}

function nativeSkillBlend(skillName) {
  const index = SKILL_TIERS.indexOf(skillName);
  if (index < 0) throw new Error(`unknown skill ${skillName}`);
  return index;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Map Elo gap onto a skill blend so the expected fight is closer to even. */
function handicappedSkillBlend(nativeSkill, botElo, humanElo) {
  const native = nativeSkillBlend(nativeSkill);
  const steps = (botElo - humanElo) / ELO_PER_SKILL_STEP;
  const adjustment = clamp(steps * 0.5, -2, 2);
  return clamp(native - adjustment, 0, SKILL_TIERS.length - 1);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpBool(a, b, t) {
  return (t < 0.5 ? a : b);
}

function profileAtBlend(blend) {
  const clamped = clamp(blend, 0, SKILL_TIERS.length - 1);
  const lo = Math.floor(clamped);
  const hi = Math.min(SKILL_TIERS.length - 1, Math.ceil(clamped));
  const t = clamped - lo;
  const a = SKILL_PROFILES[SKILL_TIERS[lo]];
  const b = SKILL_PROFILES[SKILL_TIERS[hi]];
  return {
    skillBlend: clamped,
    lowSkill: SKILL_TIERS[lo],
    highSkill: SKILL_TIERS[hi],
    maxAcquireG: lerp(a.maxAcquireG, b.maxAcquireG, t),
    acquireGGain: lerp(a.acquireGGain, b.acquireGGain, t),
    forcesOvershoot: lerpBool(a.forcesOvershoot, b.forcesOvershoot, t),
    disengagesWhenLosing: lerpBool(a.disengagesWhenLosing, b.disengagesWhenLosing, t),
    doctrineCount: Math.round(lerp(a.doctrineCount, b.doctrineCount, t)),
    lookaheadHorizonTicks: Math.round(lerp(a.lookaheadHorizonTicks, b.lookaheadHorizonTicks, t)),
    fireConeDeg: lerp(a.fireConeDeg, b.fireConeDeg, t),
    leadFireConeDeg: lerp(a.leadFireConeDeg, b.leadFireConeDeg, t),
    lowBlockClearanceM: lerp(a.lowBlockClearanceM, b.lowBlockClearanceM, t),
    lowBlockRecommitSeconds: lerp(a.lowBlockRecommitSeconds, b.lowBlockRecommitSeconds, t),
    energyRetentionWeight: lerp(a.energyRetentionWeight, b.energyRetentionWeight, t),
  };
}

function normalisePilotKey(pilotKey) {
  if (typeof pilotKey !== "string") return null;
  const trimmed = pilotKey.trim();
  if (trimmed.length < 8 || trimmed.length > 128) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

function principalIdForPilotKey(pilotKey) {
  return createHash("sha256").update(pilotKey, "utf8").digest("hex").slice(0, 32);
}

function newHumanPrincipal(principalId, nowMs) {
  return {
    kind: "human",
    principalId,
    elo: STARTING_ELO,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    createdAtMs: nowMs,
    lastSeenAtMs: nowMs,
    displayName: null,
    claimed: false,
  };
}

function cloneSeedBot(seed, nowMs) {
  return {
    kind: "bot",
    principalId: seed.botId,
    botId: seed.botId,
    displayName: seed.displayName,
    nativeSkill: seed.nativeSkill,
    elo: seed.elo,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    funAlpha: seed.funAlpha,
    funBeta: seed.funBeta,
    explorationRemaining: seed.explorationRemaining,
    humanMatches: 0,
    createdAtMs: nowMs,
    lastSeenAtMs: nowMs,
  };
}

function pickBot(bots, humanElo, random = Math.random) {
  const eligible = bots.filter(botEligibleForHumans);
  if (eligible.length === 0) return null;
  let best = null;
  let bestDistance = Infinity;
  // Stable order, then small random jitter among near-ties so exploration is not pure sticky.
  const ordered = [...eligible].sort((a, b) => a.botId.localeCompare(b.botId));
  for (const bot of ordered) {
    const distance = Math.abs(bot.elo - humanElo) + random() * 40;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = bot;
    }
  }
  return best;
}

function outcomeScore(outcome) {
  if (outcome === "win") return 1;
  if (outcome === "loss" || outcome === "timeout") return 0;
  if (outcome === "draw") return 0.5;
  return null;
}

function sanityAllowsRated(sanity, { scaffolded = false } = {}) {
  if (!sanity || typeof sanity !== "object") return false;
  const durationS = Number(sanity.durationS);
  const roundsFired = Number(sanity.roundsFired);
  const engagementReached = Boolean(sanity.engagementReached);
  if (!Number.isFinite(durationS) || durationS < MINIMUM_RATED_DURATION_S) return false;
  if (!Number.isFinite(roundsFired) || roundsFired < MINIMUM_ROUNDS_FOR_RATED) return false;
  if (!engagementReached && !scaffolded) return false;
  return true;
}

/**
 * Update fun Beta priors from hybrid signals.
 * againVote: -1 | 0 | 1; rematch and completed boost alpha; early abandon boosts beta.
 */
function applyFunSignals(bot, {
  completed = false,
  earlyAbandon = false,
  rematch = false,
  againVote = 0,
} = {}) {
  let alpha = bot.funAlpha;
  let beta = bot.funBeta;
  if (completed) alpha += 1;
  if (rematch) alpha += 1.5;
  if (againVote > 0) alpha += 2;
  if (againVote < 0) beta += 2;
  if (earlyAbandon) beta += 1.5;
  if (!completed && !earlyAbandon) beta += 0.25;
  return {
    ...bot,
    funAlpha: alpha,
    funBeta: beta,
  };
}

function createMatchRecord({
  matchId,
  human,
  bot,
  handicap,
  scaffolded,
  rated,
  nowMs,
}) {
  return {
    matchId,
    humanPrincipalId: human.principalId,
    botId: bot.botId,
    humanEloBefore: human.elo,
    botEloBefore: bot.elo,
    handicap,
    scaffolded: Boolean(scaffolded),
    rated: Boolean(rated),
    createdAtMs: nowMs,
    completedAtMs: null,
    outcome: null,
  };
}

function completeMatch({
  match,
  human,
  bot,
  outcome,
  signals = {},
  nowMs = Date.now(),
}) {
  const score = outcomeScore(outcome);
  if (score === null) {
    return { ok: false, reason: "invalid-outcome" };
  }

  const rated = match.rated
    && sanityAllowsRated(signals.sanity, { scaffolded: match.scaffolded })
    && !signals.earlyAbandon;

  let nextHuman = { ...human, lastSeenAtMs: nowMs };
  let nextBot = { ...bot, lastSeenAtMs: nowMs };
  let elo = null;

  if (rated) {
    // Upset protection for the ladder's thesis: when the higher-rated side loses to a much
    // lower opponent, that side always takes full K (provisional or standard), never scaffolded K.
    const humanHigher = human.elo >= bot.elo;
    const upsetAgainstFavourite = (score === 1 && !humanHigher) || (score === 0 && humanHigher);
    const humanK = kFactor(human.gamesPlayed, {
      scaffolded: match.scaffolded,
      forceFullK: upsetAgainstFavourite && humanHigher,
    });
    const botK = kFactor(bot.gamesPlayed, {
      scaffolded: match.scaffolded,
      // Human beat a higher bot, or higher bot lost: bot takes full K.
      forceFullK: upsetAgainstFavourite && !humanHigher,
    });
    // Plan: human upset losses always apply full K to the bot.
    const botKFinal = (score === 1 && bot.elo > human.elo)
      ? kFactor(bot.gamesPlayed, { forceFullK: true })
      : botK;

    const updated = applyElo(human.elo, bot.elo, score, humanK, botKFinal);
    elo = {
      humanBefore: human.elo,
      humanAfter: updated.ratingA,
      humanDelta: updated.ratingA - human.elo,
      botBefore: bot.elo,
      botAfter: updated.ratingB,
      botDelta: updated.ratingB - bot.elo,
      expectedHuman: updated.expectedA,
      humanK,
      botK: botKFinal,
    };
    nextHuman = {
      ...nextHuman,
      elo: updated.ratingA,
      gamesPlayed: human.gamesPlayed + 1,
      wins: human.wins + (score === 1 ? 1 : 0),
      losses: human.losses + (score === 0 ? 1 : 0),
    };
    nextBot = {
      ...nextBot,
      elo: updated.ratingB,
      gamesPlayed: bot.gamesPlayed + 1,
      wins: bot.wins + (score === 0 ? 1 : 0),
      losses: bot.losses + (score === 1 ? 1 : 0),
      humanMatches: (bot.humanMatches ?? 0) + 1,
      explorationRemaining: Math.max(0, (bot.explorationRemaining ?? 0) - 1),
    };
  }

  nextBot = applyFunSignals(nextBot, {
    completed: Boolean(signals.completed ?? rated),
    earlyAbandon: Boolean(signals.earlyAbandon),
    rematch: Boolean(signals.rematch),
    againVote: Number(signals.againVote) || 0,
  });

  return {
    ok: true,
    rated,
    human: nextHuman,
    bot: nextBot,
    elo,
    funScore: funScore(nextBot.funAlpha, nextBot.funBeta),
    match: {
      ...match,
      completedAtMs: nowMs,
      outcome,
      ratedApplied: rated,
    },
  };
}

/** In-memory arena store used by tests and the Durable Object façade. */
class ArenaStore {
  constructor({ now = () => Date.now(), random = Math.random, idFactory = null } = {}) {
    this.now = now;
    this.random = random;
    this.idFactory = idFactory;
    this.humans = new Map();
    this.bots = new Map();
    this.matches = new Map();
    this._seq = 0;
    for (const seed of SEED_BOTS) {
      const bot = cloneSeedBot(seed, this.now());
      this.bots.set(bot.botId, bot);
    }
  }

  nextMatchId() {
    if (this.idFactory) return this.idFactory();
    this._seq += 1;
    return `match_${this._seq.toString(16).padStart(8, "0")}`;
  }

  async ensureHuman(pilotKey) {
    const key = normalisePilotKey(pilotKey);
    if (!key) return { ok: false, reason: "invalid-pilot-key" };
    const principalId = principalIdForPilotKey(key);
    let human = this.humans.get(principalId);
    if (!human) {
      human = newHumanPrincipal(principalId, this.now());
      this.humans.set(principalId, human);
    } else {
      human = { ...human, lastSeenAtMs: this.now() };
      this.humans.set(principalId, human);
    }
    return { ok: true, pilotKey: key, human };
  }

  async createMatch({ pilotKey, scaffolded = false }) {
    const ensured = await this.ensureHuman(pilotKey);
    if (!ensured.ok) return ensured;
    const { human } = ensured;
    const bot = pickBot([...this.bots.values()], human.elo, this.random);
    if (!bot) return { ok: false, reason: "no-eligible-bot" };

    const blend = handicappedSkillBlend(bot.nativeSkill, bot.elo, human.elo);
    const handicap = profileAtBlend(blend);
    const matchId = this.nextMatchId();
    const match = createMatchRecord({
      matchId,
      human,
      bot,
      handicap,
      scaffolded,
      rated: true,
      nowMs: this.now(),
    });
    this.matches.set(matchId, match);

    return {
      ok: true,
      matchId,
      rated: true,
      scaffolded: Boolean(scaffolded),
      human: {
        principalId: human.principalId,
        elo: human.elo,
        gamesPlayed: human.gamesPlayed,
      },
      bot: {
        botId: bot.botId,
        displayName: bot.displayName,
        nativeSkill: bot.nativeSkill,
        elo: bot.elo,
        funScore: funScore(bot.funAlpha, bot.funBeta),
        explorationRemaining: bot.explorationRemaining,
      },
      handicap,
    };
  }

  async completeMatchRequest({
    matchId,
    pilotKey,
    outcome,
    completed = true,
    earlyAbandon = false,
    rematch = false,
    againVote = 0,
    sanity = null,
  }) {
    const match = this.matches.get(matchId);
    if (!match) return { ok: false, reason: "unknown-match" };
    if (match.completedAtMs != null) return { ok: false, reason: "already-completed" };

    const ensured = await this.ensureHuman(pilotKey);
    if (!ensured.ok) return ensured;
    if (ensured.human.principalId !== match.humanPrincipalId) {
      return { ok: false, reason: "pilot-mismatch" };
    }

    const human = this.humans.get(match.humanPrincipalId);
    const bot = this.bots.get(match.botId);
    if (!human || !bot) return { ok: false, reason: "missing-principal" };

    const result = completeMatch({
      match,
      human,
      bot,
      outcome,
      signals: { completed, earlyAbandon, rematch, againVote, sanity },
      nowMs: this.now(),
    });
    if (!result.ok) return result;

    this.humans.set(human.principalId, result.human);
    this.bots.set(bot.botId, result.bot);
    this.matches.set(matchId, result.match);

    return {
      ok: true,
      rated: result.rated,
      outcome,
      human: {
        principalId: result.human.principalId,
        elo: result.human.elo,
        gamesPlayed: result.human.gamesPlayed,
        delta: result.elo?.humanDelta ?? 0,
        before: result.elo?.humanBefore ?? human.elo,
      },
      bot: {
        botId: result.bot.botId,
        elo: result.bot.elo,
        delta: result.elo?.botDelta ?? 0,
        before: result.elo?.botBefore ?? bot.elo,
        funScore: result.funScore,
        explorationRemaining: result.bot.explorationRemaining,
      },
      elo: result.elo,
    };
  }

  standings(limit = 50) {
    const rows = [];
    for (const bot of this.bots.values()) {
      rows.push({
        principalId: bot.botId,
        kind: "bot",
        displayName: bot.displayName,
        elo: bot.elo,
        gamesPlayed: bot.gamesPlayed,
        funScore: funScore(bot.funAlpha, bot.funBeta),
      });
    }
    for (const human of this.humans.values()) {
      if (human.gamesPlayed <= 0 && !human.claimed) continue;
      rows.push({
        principalId: human.principalId,
        kind: "human",
        displayName: human.displayName ?? `Pilot ${human.principalId.slice(0, 4)}`,
        elo: human.elo,
        gamesPlayed: human.gamesPlayed,
        claimed: Boolean(human.claimed),
      });
    }
    rows.sort((a, b) => b.elo - a.elo || a.principalId.localeCompare(b.principalId));
    return rows.slice(0, Math.max(1, Math.min(200, limit)));
  }

  health() {
    return {
      status: "ok",
      protocol: ARENA_PROTOCOL,
      bots: this.bots.size,
      humans: this.humans.size,
      openMatches: [...this.matches.values()].filter((m) => m.completedAtMs == null).length,
    };
  }
}

module.exports = {
  ARENA_PROTOCOL,
  STARTING_ELO,
  PROVISIONAL_GAMES,
  PROVISIONAL_K,
  STANDARD_K,
  SCAFFOLDED_K,
  ELO_PER_SKILL_STEP,
  FUN_THRESHOLD,
  EXPLORATION_HUMAN_MATCHES,
  REMATCH_WINDOW_MS,
  MINIMUM_RATED_DURATION_S,
  MINIMUM_ROUNDS_FOR_RATED,
  SKILL_TIERS,
  SKILL_PROFILES,
  SEED_BOTS,
  expectedScore,
  kFactor,
  applyElo,
  funScore,
  botEligibleForHumans,
  nativeSkillBlend,
  clamp,
  handicappedSkillBlend,
  profileAtBlend,
  normalisePilotKey,
  principalIdForPilotKey,
  newHumanPrincipal,
  cloneSeedBot,
  pickBot,
  outcomeScore,
  sanityAllowsRated,
  applyFunSignals,
  createMatchRecord,
  completeMatch,
  ArenaStore,
};

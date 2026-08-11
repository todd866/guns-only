using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;

namespace GunsOnly.ArenaServer;

public static class ArenaConstants {
    public const int Protocol = 1;
    public const double StartingElo = 1000.0;
    public const int ProvisionalGames = 20;
    public const double ProvisionalK = 40.0;
    public const double StandardK = 20.0;
    public const double ScaffoldedK = 8.0;
    public const double EloPerSkillStep = 200.0;
    public const double FunThreshold = 0.45;
    public const int ExplorationHumanMatches = 12;
    public const double MinimumRatedDurationS = 20.0;
    public const int MinimumRoundsForRated = 1;
}

public sealed record SkillProfile(
    double MaxAcquireG,
    double AcquireGGain,
    bool ForcesOvershoot,
    bool DisengagesWhenLosing,
    int DoctrineCount,
    int LookaheadHorizonTicks,
    double FireConeDeg,
    double LeadFireConeDeg,
    double LowBlockClearanceM,
    double LowBlockRecommitSeconds,
    double EnergyRetentionWeight);

public static class SkillTables {
    public static readonly string[] Tiers = ["NOVICE", "COMPETENT", "VETERAN", "ACE", "MACHINE"];

    public static readonly IReadOnlyDictionary<string, SkillProfile> Profiles =
        new Dictionary<string, SkillProfile>(StringComparer.Ordinal) {
            ["NOVICE"] = new(2.4, 1.0, false, false, 1, 0, 3.0, 0.25, 260.0, 0.0, 1.0),
            ["COMPETENT"] = new(4.8, 1.8, true, false, 1, 100, 3.5, 0.40, 260.0, 5.0, 1.0),
            ["VETERAN"] = new(5.5, 1.8, false, true, 2, 90, 5.0, 0.45, 180.0, 1.8, 1.0),
            ["ACE"] = new(9.0, 2.2, true, true, 3, 150, 3.5, 0.35, 105.0, 0.35, 1.0),
            ["MACHINE"] = new(15.0, 2.2, true, true, 3, 180, 3.0, 0.35, 105.0, 0.35, 1.3),
        };

    public static int NativeBlend(string skill) {
        int index = Array.IndexOf(Tiers, skill);
        if (index < 0) throw new ArgumentOutOfRangeException(nameof(skill), skill, "unknown skill");
        return index;
    }

    public static double HandicappedBlend(string nativeSkill, double botElo, double humanElo) {
        double native = NativeBlend(nativeSkill);
        double steps = (botElo - humanElo) / ArenaConstants.EloPerSkillStep;
        double adjustment = Math.Clamp(steps * 0.5, -2.0, 2.0);
        return Math.Clamp(native - adjustment, 0.0, Tiers.Length - 1);
    }

    public static HandicapProfile ProfileAtBlend(double blend) {
        double clamped = Math.Clamp(blend, 0.0, Tiers.Length - 1);
        int lo = (int)Math.Floor(clamped);
        int hi = Math.Min(Tiers.Length - 1, (int)Math.Ceiling(clamped));
        double t = clamped - lo;
        SkillProfile a = Profiles[Tiers[lo]];
        SkillProfile b = Profiles[Tiers[hi]];
        static double Lerp(double x, double y, double u) => x + (y - x) * u;
        static bool LerpBool(bool x, bool y, double u) => u < 0.5 ? x : y;
        return new HandicapProfile(
            SkillBlend: clamped,
            LowSkill: Tiers[lo],
            HighSkill: Tiers[hi],
            MaxAcquireG: Lerp(a.MaxAcquireG, b.MaxAcquireG, t),
            AcquireGGain: Lerp(a.AcquireGGain, b.AcquireGGain, t),
            ForcesOvershoot: LerpBool(a.ForcesOvershoot, b.ForcesOvershoot, t),
            DisengagesWhenLosing: LerpBool(a.DisengagesWhenLosing, b.DisengagesWhenLosing, t),
            DoctrineCount: (int)Math.Round(Lerp(a.DoctrineCount, b.DoctrineCount, t)),
            LookaheadHorizonTicks: (int)Math.Round(Lerp(a.LookaheadHorizonTicks, b.LookaheadHorizonTicks, t)),
            FireConeDeg: Lerp(a.FireConeDeg, b.FireConeDeg, t),
            LeadFireConeDeg: Lerp(a.LeadFireConeDeg, b.LeadFireConeDeg, t),
            LowBlockClearanceM: Lerp(a.LowBlockClearanceM, b.LowBlockClearanceM, t),
            LowBlockRecommitSeconds: Lerp(a.LowBlockRecommitSeconds, b.LowBlockRecommitSeconds, t),
            EnergyRetentionWeight: Lerp(a.EnergyRetentionWeight, b.EnergyRetentionWeight, t));
    }
}

public sealed record HandicapProfile(
    [property: JsonPropertyName("skillBlend")] double SkillBlend,
    [property: JsonPropertyName("lowSkill")] string LowSkill,
    [property: JsonPropertyName("highSkill")] string HighSkill,
    [property: JsonPropertyName("maxAcquireG")] double MaxAcquireG,
    [property: JsonPropertyName("acquireGGain")] double AcquireGGain,
    [property: JsonPropertyName("forcesOvershoot")] bool ForcesOvershoot,
    [property: JsonPropertyName("disengagesWhenLosing")] bool DisengagesWhenLosing,
    [property: JsonPropertyName("doctrineCount")] int DoctrineCount,
    [property: JsonPropertyName("lookaheadHorizonTicks")] int LookaheadHorizonTicks,
    [property: JsonPropertyName("fireConeDeg")] double FireConeDeg,
    [property: JsonPropertyName("leadFireConeDeg")] double LeadFireConeDeg,
    [property: JsonPropertyName("lowBlockClearanceM")] double LowBlockClearanceM,
    [property: JsonPropertyName("lowBlockRecommitSeconds")] double LowBlockRecommitSeconds,
    [property: JsonPropertyName("energyRetentionWeight")] double EnergyRetentionWeight);

public static class Elo {
    public static double Expected(double ratingA, double ratingB) =>
        1.0 / (1.0 + Math.Pow(10.0, (ratingB - ratingA) / 400.0));

    public static double K(int gamesPlayed, bool scaffolded = false, bool forceFullK = false) {
        if (scaffolded && !forceFullK) return ArenaConstants.ScaffoldedK;
        return gamesPlayed < ArenaConstants.ProvisionalGames
            ? ArenaConstants.ProvisionalK
            : ArenaConstants.StandardK;
    }

    public static (double ratingA, double ratingB, double expectedA) Apply(
        double ratingA, double ratingB, double scoreA, double kA, double kB) {
        double expectedA = Expected(ratingA, ratingB);
        double expectedB = 1.0 - expectedA;
        return (
            ratingA + kA * (scoreA - expectedA),
            ratingB + kB * ((1.0 - scoreA) - expectedB),
            expectedA);
    }
}

public static class Fun {
    public static double Score(double alpha, double beta) {
        double a = Math.Max(1e-6, alpha);
        double b = Math.Max(1e-6, beta);
        return a / (a + b);
    }

    public static bool EligibleForHumans(ArenaBot bot) =>
        bot.ExplorationRemaining > 0 || Score(bot.FunAlpha, bot.FunBeta) >= ArenaConstants.FunThreshold;
}

public sealed class ArenaHuman {
    public required string PrincipalId { get; set; }
    public double Elo { get; set; } = ArenaConstants.StartingElo;
    public int GamesPlayed { get; set; }
    public int Wins { get; set; }
    public int Losses { get; set; }
    public long CreatedAtMs { get; set; }
    public long LastSeenAtMs { get; set; }
    public string? DisplayName { get; set; }
    public bool Claimed { get; set; }
}

public sealed class ArenaBot {
    public required string BotId { get; set; }
    public required string DisplayName { get; set; }
    public required string NativeSkill { get; set; }
    public double Elo { get; set; }
    public int GamesPlayed { get; set; }
    public int Wins { get; set; }
    public int Losses { get; set; }
    public double FunAlpha { get; set; } = 8;
    public double FunBeta { get; set; } = 2;
    public int ExplorationRemaining { get; set; } = ArenaConstants.ExplorationHumanMatches;
    public int HumanMatches { get; set; }
    public long CreatedAtMs { get; set; }
    public long LastSeenAtMs { get; set; }
}

public sealed class ArenaMatch {
    public required string MatchId { get; set; }
    public required string HumanPrincipalId { get; set; }
    public required string BotId { get; set; }
    public double HumanEloBefore { get; set; }
    public double BotEloBefore { get; set; }
    public required HandicapProfile Handicap { get; set; }
    public bool Scaffolded { get; set; }
    public bool Rated { get; set; }
    public long CreatedAtMs { get; set; }
    public long? CompletedAtMs { get; set; }
    public string? Outcome { get; set; }
    public bool RatedApplied { get; set; }
}

public sealed class ArenaStore {
    readonly object _gate = new();
    readonly Dictionary<string, ArenaHuman> _humans = new(StringComparer.Ordinal);
    readonly Dictionary<string, ArenaBot> _bots = new(StringComparer.Ordinal);
    readonly Dictionary<string, ArenaMatch> _matches = new(StringComparer.Ordinal);
    readonly Func<long> _now;
    readonly Func<double> _random;
    int _seq;

    public ArenaStore(Func<long>? now = null, Func<double>? random = null) {
        _now = now ?? (() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        _random = random ?? Random.Shared.NextDouble;
        long nowMs = _now();
        foreach (ArenaBot seed in SeedBots(nowMs)) {
            _bots[seed.BotId] = seed;
        }
    }

    static IEnumerable<ArenaBot> SeedBots(long nowMs) => [
        new() {
            BotId = "bot:competent", DisplayName = "Competent", NativeSkill = "COMPETENT", Elo = 1200,
            CreatedAtMs = nowMs, LastSeenAtMs = nowMs,
        },
        new() {
            BotId = "bot:veteran", DisplayName = "Veteran", NativeSkill = "VETERAN", Elo = 1400,
            CreatedAtMs = nowMs, LastSeenAtMs = nowMs,
        },
        new() {
            BotId = "bot:ace", DisplayName = "Ace", NativeSkill = "ACE", Elo = 1600,
            CreatedAtMs = nowMs, LastSeenAtMs = nowMs,
        },
        new() {
            BotId = "bot:machine", DisplayName = "Machine", NativeSkill = "MACHINE", Elo = 1800,
            CreatedAtMs = nowMs, LastSeenAtMs = nowMs,
        },
    ];

    public static string? NormalisePilotKey(string? pilotKey) {
        if (string.IsNullOrWhiteSpace(pilotKey)) return null;
        string trimmed = pilotKey.Trim();
        if (trimmed.Length is < 8 or > 128) return null;
        foreach (char c in trimmed) {
            if (!(char.IsAsciiLetterOrDigit(c) || c is '.' or '_' or ':' or '-')) return null;
        }
        return trimmed;
    }

    public static string PrincipalIdForPilotKey(string pilotKey) {
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(pilotKey));
        return Convert.ToHexString(hash).ToLowerInvariant()[..32];
    }

    public object Health() {
        lock (_gate) {
            return new {
                status = "ok",
                service = "guns-only-arena",
                protocol = ArenaConstants.Protocol,
                bots = _bots.Count,
                humans = _humans.Count,
                openMatches = _matches.Values.Count(m => m.CompletedAtMs is null),
            };
        }
    }

    public object CreateMatch(string pilotKey, bool scaffolded) {
        lock (_gate) {
            string? key = NormalisePilotKey(pilotKey);
            if (key is null) return new { ok = false, reason = "invalid-pilot-key" };
            ArenaHuman human = EnsureHuman(key);
            ArenaBot? bot = PickBot(human.Elo);
            if (bot is null) return new { ok = false, reason = "no-eligible-bot" };

            double blend = SkillTables.HandicappedBlend(bot.NativeSkill, bot.Elo, human.Elo);
            HandicapProfile handicap = SkillTables.ProfileAtBlend(blend);
            string matchId = $"match_{Interlocked.Increment(ref _seq):x8}";
            var match = new ArenaMatch {
                MatchId = matchId,
                HumanPrincipalId = human.PrincipalId,
                BotId = bot.BotId,
                HumanEloBefore = human.Elo,
                BotEloBefore = bot.Elo,
                Handicap = handicap,
                Scaffolded = scaffolded,
                Rated = true,
                CreatedAtMs = _now(),
            };
            _matches[matchId] = match;
            return new {
                ok = true,
                matchId,
                rated = true,
                scaffolded,
                human = new { principalId = human.PrincipalId, elo = human.Elo, gamesPlayed = human.GamesPlayed },
                bot = new {
                    botId = bot.BotId,
                    displayName = bot.DisplayName,
                    nativeSkill = bot.NativeSkill,
                    elo = bot.Elo,
                    funScore = Fun.Score(bot.FunAlpha, bot.FunBeta),
                    explorationRemaining = bot.ExplorationRemaining,
                },
                handicap,
            };
        }
    }

    public object CompleteMatch(
        string matchId,
        string pilotKey,
        string outcome,
        bool completed,
        bool earlyAbandon,
        bool rematch,
        int againVote,
        MatchSanity? sanity) {
        lock (_gate) {
            if (!_matches.TryGetValue(matchId, out ArenaMatch? match))
                return new { ok = false, reason = "unknown-match" };
            if (match.CompletedAtMs is not null)
                return new { ok = false, reason = "already-completed" };

            string? key = NormalisePilotKey(pilotKey);
            if (key is null) return new { ok = false, reason = "invalid-pilot-key" };
            ArenaHuman human = EnsureHuman(key);
            if (human.PrincipalId != match.HumanPrincipalId)
                return new { ok = false, reason = "pilot-mismatch" };
            if (!_bots.TryGetValue(match.BotId, out ArenaBot? bot))
                return new { ok = false, reason = "missing-principal" };

            double? score = outcome switch {
                "win" => 1.0,
                "loss" or "timeout" => 0.0,
                "draw" => 0.5,
                _ => null,
            };
            if (score is null) return new { ok = false, reason = "invalid-outcome" };

            bool rated = match.Rated
                && !earlyAbandon
                && SanityAllowsRated(sanity, match.Scaffolded);

            double humanBefore = human.Elo;
            double botBefore = bot.Elo;
            double humanDelta = 0;
            double botDelta = 0;
            object? elo = null;

            if (rated) {
                bool humanHigher = human.Elo >= bot.Elo;
                bool upset = (score == 1.0 && !humanHigher) || (score == 0.0 && humanHigher);
                double humanK = Elo.K(human.GamesPlayed, match.Scaffolded, upset && humanHigher);
                double botK = Elo.K(bot.GamesPlayed, match.Scaffolded, upset && !humanHigher);
                if (score == 1.0 && bot.Elo > human.Elo)
                    botK = Elo.K(bot.GamesPlayed, scaffolded: false, forceFullK: true);

                var (newHuman, newBot, expectedHuman) = Elo.Apply(human.Elo, bot.Elo, score.Value, humanK, botK);
                humanDelta = newHuman - human.Elo;
                botDelta = newBot - bot.Elo;
                elo = new {
                    humanBefore = human.Elo,
                    humanAfter = newHuman,
                    humanDelta,
                    botBefore = bot.Elo,
                    botAfter = newBot,
                    botDelta,
                    expectedHuman,
                    humanK,
                    botK,
                };
                human.Elo = newHuman;
                human.GamesPlayed += 1;
                if (score == 1.0) human.Wins += 1;
                if (score == 0.0) human.Losses += 1;
                bot.Elo = newBot;
                bot.GamesPlayed += 1;
                if (score == 0.0) bot.Wins += 1;
                if (score == 1.0) bot.Losses += 1;
                bot.HumanMatches += 1;
                bot.ExplorationRemaining = Math.Max(0, bot.ExplorationRemaining - 1);
            }

            ApplyFun(bot, completed || rated, earlyAbandon, rematch, againVote);
            match.CompletedAtMs = _now();
            match.Outcome = outcome;
            match.RatedApplied = rated;
            human.LastSeenAtMs = match.CompletedAtMs.Value;
            bot.LastSeenAtMs = match.CompletedAtMs.Value;

            return new {
                ok = true,
                rated,
                outcome,
                human = new {
                    principalId = human.PrincipalId,
                    elo = human.Elo,
                    gamesPlayed = human.GamesPlayed,
                    delta = humanDelta,
                    before = humanBefore,
                },
                bot = new {
                    botId = bot.BotId,
                    elo = bot.Elo,
                    delta = botDelta,
                    before = botBefore,
                    funScore = Fun.Score(bot.FunAlpha, bot.FunBeta),
                    explorationRemaining = bot.ExplorationRemaining,
                },
                elo,
            };
        }
    }

    public object Standings(int limit) {
        lock (_gate) {
            var rows = new List<object>();
            foreach (ArenaBot bot in _bots.Values) {
                rows.Add(new {
                    principalId = bot.BotId,
                    kind = "bot",
                    displayName = bot.DisplayName,
                    elo = bot.Elo,
                    gamesPlayed = bot.GamesPlayed,
                    funScore = Fun.Score(bot.FunAlpha, bot.FunBeta),
                });
            }
            foreach (ArenaHuman human in _humans.Values) {
                if (human.GamesPlayed <= 0 && !human.Claimed) continue;
                rows.Add(new {
                    principalId = human.PrincipalId,
                    kind = "human",
                    displayName = human.DisplayName ?? $"Pilot {human.PrincipalId[..4]}",
                    elo = human.Elo,
                    gamesPlayed = human.GamesPlayed,
                    claimed = human.Claimed,
                });
            }
            return new {
                protocol = ArenaConstants.Protocol,
                standings = rows
                    .OrderByDescending(r => ((dynamic)r).elo)
                    .ThenBy(r => (string)((dynamic)r).principalId, StringComparer.Ordinal)
                    .Take(Math.Clamp(limit, 1, 200))
                    .ToArray(),
            };
        }
    }

    ArenaHuman EnsureHuman(string pilotKey) {
        string principalId = PrincipalIdForPilotKey(pilotKey);
        if (_humans.TryGetValue(principalId, out ArenaHuman? existing)) {
            existing.LastSeenAtMs = _now();
            return existing;
        }
        var human = new ArenaHuman {
            PrincipalId = principalId,
            CreatedAtMs = _now(),
            LastSeenAtMs = _now(),
        };
        _humans[principalId] = human;
        return human;
    }

    ArenaBot? PickBot(double humanElo) {
        ArenaBot? best = null;
        double bestDistance = double.PositiveInfinity;
        foreach (ArenaBot bot in _bots.Values.OrderBy(b => b.BotId, StringComparer.Ordinal)) {
            if (!Fun.EligibleForHumans(bot)) continue;
            double distance = Math.Abs(bot.Elo - humanElo) + _random() * 40.0;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = bot;
            }
        }
        return best;
    }

    static bool SanityAllowsRated(MatchSanity? sanity, bool scaffolded) {
        if (sanity is null) return false;
        if (!double.IsFinite(sanity.DurationS) || sanity.DurationS < ArenaConstants.MinimumRatedDurationS)
            return false;
        if (sanity.RoundsFired < ArenaConstants.MinimumRoundsForRated) return false;
        if (!sanity.EngagementReached && !scaffolded) return false;
        return true;
    }

    static void ApplyFun(ArenaBot bot, bool completed, bool earlyAbandon, bool rematch, int againVote) {
        if (completed) bot.FunAlpha += 1;
        if (rematch) bot.FunAlpha += 1.5;
        if (againVote > 0) bot.FunAlpha += 2;
        if (againVote < 0) bot.FunBeta += 2;
        if (earlyAbandon) bot.FunBeta += 1.5;
        if (!completed && !earlyAbandon) bot.FunBeta += 0.25;
    }
}

public sealed record MatchSanity(
    [property: JsonPropertyName("durationS")] double DurationS,
    [property: JsonPropertyName("roundsFired")] int RoundsFired,
    [property: JsonPropertyName("engagementReached")] bool EngagementReached);

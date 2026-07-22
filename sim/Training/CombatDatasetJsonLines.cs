using System.Globalization;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// Dependency-free JSON Lines export for Python/Julia/Rust trainers. Every row is projected onto
/// an explicit wire DTO: changing a domain record therefore cannot silently mutate the dataset
/// contract. The deterministic schema row carries enough provenance to reproduce the batch while
/// making the currently unavailable artifact hash explicit rather than inventing an identity.
/// </summary>
public static class CombatDatasetJsonLines {
    public const string Schema = "guns-only.combat-transition.v1";
    public const string ConfigSchema = "guns-only.combat-training-config.v1";
    public const string ScenarioSchema = "guns-only.seeded-offset-merge.v1";
    public const string ObservationSchema = "guns-only.combat-observation.v1";
    public const string ActionSchema = "guns-only.combat-action.v1";
    public const string RewardSchema = "guns-only.combat-reward.v1";
    public const string PolicySchema = "guns-only.reactive-bandit-policy.v1";
    public const string SeedGeneratorSchema =
        "guns-only.seeded-offset-merge.splitmix64.v1";

    static readonly JsonSerializerOptions Options = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void Write(TextWriter writer, CombatTrainingBatch batch) {
        ArgumentNullException.ThrowIfNull(writer);
        ArgumentNullException.ThrowIfNull(batch);

        CombatTrainingBatchConfig config = batch.Config;
        CombatRewardWeights rewardWeights =
            config.RewardWeights ?? CombatRewardWeights.Default;
        WriteRow(writer, new SchemaRow(
            Type: "schema",
            Schema,
            ConfigSchema,
            ScenarioSchema,
            ObservationSchema,
            ActionSchema,
            RewardSchema,
            PolicySchema,
            SeedGeneratorSchema,
            TickHz: AircraftSim.TickHz,
            EpisodeCount: batch.Episodes.Count,
            TransitionCount: batch.TransitionCount,
            FirstSeed: config.FirstSeed,
            MaximumSecondsPerEpisode: config.MaximumSecondsPerEpisode,
            ReferencePolicyId: ReactiveBanditPolicyId(config.ReferenceSkill),
            BehaviorPolicyId: ReactiveBanditPolicyId(config.BehaviorSkill),
            ArtifactHashAlgorithm: "sha256",
            ArtifactHash: null,
            ArtifactIdentityComplete: false,
            RewardWeights: Project(rewardWeights)));

        foreach (CombatEpisode episode in batch.Episodes) {
            WriteRow(writer, new EpisodeRow(
                Type: "episode",
                episode.EpisodeIndex,
                episode.ScenarioId,
                episode.Seed,
                TerminalReason: TerminalReasonName(episode.TerminalReason),
                TransitionCount: episode.Transitions.Count,
                episode.TotalReward));
            foreach (CombatTransition transition in episode.Transitions)
                WriteRow(writer, Project(episode.EpisodeIndex, transition));
        }
    }

    public static string Serialize(CombatTrainingBatch batch) {
        using var writer = new StringWriter(CultureInfo.InvariantCulture);
        Write(writer, batch);
        return writer.ToString();
    }

    static void WriteRow<T>(TextWriter writer, T row) {
        writer.Write(JsonSerializer.Serialize(row, Options));
        writer.Write('\n');
    }

    static TransitionRow Project(int episodeIndex, in CombatTransition transition) => new(
        Type: "transition",
        episodeIndex,
        transition.DecisionIndex,
        Observation: Project(transition.Observation),
        Action: Project(transition.Action),
        transition.Reward,
        RewardComponents: Project(transition.RewardComponents),
        NextObservation: Project(transition.NextObservation),
        transition.Terminal,
        TerminalReason: TerminalReasonName(transition.TerminalReason));

    static ObservationRow Project(in CombatPolicyObservation observation) => new(
        observation.Tick,
        observation.ElapsedSeconds,
        Ownship: Project(observation.Ownship),
        Contact: Project(observation.Contact),
        observation.OwnshipAmmoRemaining,
        observation.WeaponsAuthorized,
        observation.RangeM,
        observation.ClosingSpeedMps,
        observation.GunNoseErrorRad);

    static AircraftStateRow Project(in AircraftState state) => new(
        Position: Project(state.Position),
        SpeedMps: state.Speed,
        GammaRad: state.Gamma,
        ChiRad: state.Chi,
        BankRad: state.Bank,
        MassKg: state.Mass,
        BodyAttitude: Project(state.BodyAttitude),
        BodyRatesRadPerSecond: Project(state.BodyRates));

    static ActorObservationRow Project(in ActorObservation observation) => new(
        Position: Project(observation.Position),
        SpeedMps: observation.Speed,
        GammaRad: observation.Gamma,
        ChiRad: observation.Chi,
        BankRad: observation.Bank,
        observation.SourceTick,
        observation.ObservationAgeTicks,
        observation.Confidence);

    static CombatActionRow Project(in CombatAction action) => new(
        action.GDemand,
        action.BankTargetRad,
        action.Throttle,
        action.Rudder,
        action.ManeuverSelected,
        action.ManeuverApplied,
        action.FireIntentEvaluated,
        action.FireIntentConsumed,
        action.FireAuthorized);

    static RewardComponentsRow Project(in CombatRewardComponents components) => new(
        components.ElapsedSeconds,
        components.GeometryPotentialDelta,
        components.FiringEnvelopeSeconds,
        components.RoundsFired,
        components.HitsScored,
        components.HitsReceived,
        components.OpponentDestroyed,
        components.OwnshipDestroyed);

    static RewardWeightsRow Project(CombatRewardWeights weights) => new(
        weights.OpponentDestroyedReward,
        weights.OwnshipDestroyedPenalty,
        weights.HitScoredReward,
        weights.HitReceivedPenalty,
        weights.FiringEnvelopeRewardPerSecond,
        weights.GeometryPotentialScale,
        weights.RoundFiredPenalty,
        weights.TimePenaltyPerSecond);

    static Vec3Row Project(in Vec3D value) => new(value.X, value.Y, value.Z);
    static QuaternionRow Project(in QuaternionD value) =>
        new(value.W, value.X, value.Y, value.Z);
    static BodyRatesRow Project(in BodyRates value) => new(value.P, value.Q, value.R);

    static string ReactiveBanditPolicyId(PilotSkill skill) => skill switch {
        PilotSkill.Novice => "guns-only.reactive-bandit.v1:novice",
        PilotSkill.Competent => "guns-only.reactive-bandit.v1:competent",
        PilotSkill.Veteran => "guns-only.reactive-bandit.v1:veteran",
        PilotSkill.Ace => "guns-only.reactive-bandit.v1:ace",
        _ => throw new ArgumentOutOfRangeException(nameof(skill))
    };

    static string TerminalReasonName(CombatTerminalReason reason) => reason switch {
        CombatTerminalReason.None => "none",
        CombatTerminalReason.OpponentDestroyed => "opponentDestroyed",
        CombatTerminalReason.OwnshipDestroyed => "ownshipDestroyed",
        CombatTerminalReason.MutualDestruction => "mutualDestruction",
        CombatTerminalReason.TimeLimit => "timeLimit",
        _ => throw new ArgumentOutOfRangeException(nameof(reason))
    };

    readonly record struct SchemaRow(
        string Type,
        string Schema,
        string ConfigSchema,
        string ScenarioSchema,
        string ObservationSchema,
        string ActionSchema,
        string RewardSchema,
        string PolicySchema,
        string SeedGeneratorSchema,
        double TickHz,
        int EpisodeCount,
        int TransitionCount,
        ulong FirstSeed,
        double MaximumSecondsPerEpisode,
        string ReferencePolicyId,
        string BehaviorPolicyId,
        string ArtifactHashAlgorithm,
        string? ArtifactHash,
        bool ArtifactIdentityComplete,
        RewardWeightsRow RewardWeights);

    readonly record struct EpisodeRow(
        string Type,
        int EpisodeIndex,
        string ScenarioId,
        ulong Seed,
        string TerminalReason,
        int TransitionCount,
        double TotalReward);

    readonly record struct TransitionRow(
        string Type,
        int EpisodeIndex,
        long DecisionIndex,
        ObservationRow Observation,
        CombatActionRow Action,
        double Reward,
        RewardComponentsRow RewardComponents,
        ObservationRow NextObservation,
        bool Terminal,
        string TerminalReason);

    readonly record struct ObservationRow(
        long Tick,
        double ElapsedSeconds,
        AircraftStateRow Ownship,
        ActorObservationRow Contact,
        int OwnshipAmmoRemaining,
        bool WeaponsAuthorized,
        double RangeM,
        double ClosingSpeedMps,
        double GunNoseErrorRad);

    readonly record struct AircraftStateRow(
        Vec3Row Position,
        double SpeedMps,
        double GammaRad,
        double ChiRad,
        double BankRad,
        double MassKg,
        QuaternionRow BodyAttitude,
        BodyRatesRow BodyRatesRadPerSecond);

    readonly record struct ActorObservationRow(
        Vec3Row Position,
        double SpeedMps,
        double GammaRad,
        double ChiRad,
        double BankRad,
        long SourceTick,
        int ObservationAgeTicks,
        double Confidence);

    readonly record struct CombatActionRow(
        double GDemand,
        double BankTargetRad,
        double Throttle,
        double Rudder,
        bool ManeuverSelected,
        bool ManeuverApplied,
        bool FireIntentEvaluated,
        bool FireIntentConsumed,
        bool FireAuthorized);

    readonly record struct RewardComponentsRow(
        double ElapsedSeconds,
        double GeometryPotentialDelta,
        double FiringEnvelopeSeconds,
        int RoundsFired,
        int HitsScored,
        int HitsReceived,
        bool OpponentDestroyed,
        bool OwnshipDestroyed);

    readonly record struct RewardWeightsRow(
        double OpponentDestroyedReward,
        double OwnshipDestroyedPenalty,
        double HitScoredReward,
        double HitReceivedPenalty,
        double FiringEnvelopeRewardPerSecond,
        double GeometryPotentialScale,
        double RoundFiredPenalty,
        double TimePenaltyPerSecond);

    readonly record struct Vec3Row(double X, double Y, double Z);
    readonly record struct QuaternionRow(double W, double X, double Y, double Z);
    readonly record struct BodyRatesRow(double P, double Q, double R);
}

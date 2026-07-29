using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// A separate, versioned teacher artifact for planner-score distillation. It deliberately does not
/// extend <see cref="CombatDatasetJsonLines"/>: that transition schema and its pinned bytes remain
/// stable, while this artifact can evolve with the candidate scorer and feature contract.
/// </summary>
public static class PlannerTeacherJsonLines {
    public const string Schema = "guns-only.planner-distillation.v1";
    public const string CandidateSchema =
        "guns-only.reactive-bandit.candidates-9.v1";
    public const string ScoreSchema =
        "guns-only.reactive-bandit-lookahead-score.v1";
    public const string SplitSchema = "guns-only.seed-group-sha256-80-10-10.v1";
    public const string SplitSalt = "guns-only.planner-distillation.v1";
    public const string StandardAtmosphereSchema =
        "guns-only.standard-atmosphere-1976.v1";
    public const string Su27AirframeSchema =
        "guns-only.airframe.su27s-public-data-surrogate.v1";
    public const string UcavAirframeSchema =
        "guns-only.airframe.ucav-interceptor-surrogate.v1";

    static readonly string[] CandidateNames = {
        "hard-3d-pursuit",
        "moderate-3d-pursuit",
        "high-yo-yo",
        "low-yo-yo-split-s",
        "lead-point-unload-extend",
        "reverse",
        "break",
        "orthogonal-reverse",
        "true-separation"
    };

    static readonly JsonSerializerOptions Options = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new CanonicalDoubleConverter() }
    };

    public static void Write(TextWriter writer, PlannerTeacherBatch batch) {
        ArgumentNullException.ThrowIfNull(writer);
        ArgumentNullException.ThrowIfNull(batch);

        CombatTrainingBatchConfig config = batch.Config;
        WriteRow(writer, new SchemaRow(
            Type: "schema",
            Schema,
            FeatureSchema: PlannerDistillationFeatures.Schema,
            NormalizationSchema: PlannerDistillationFeatures.NormalizationSchema,
            CandidateSchema,
            ScoreSchema,
            ScenarioSchema: CombatDatasetJsonLines.ScenarioSchema,
            SeedGeneratorSchema: CombatDatasetJsonLines.SeedGeneratorSchema,
            SplitSchema,
            SplitSalt,
            CandidateCount: BanditDecisionTrace.CandidateCapacity,
            FeatureCount: PlannerDistillationFeatures.FeatureCount,
            CandidateNames,
            FeatureNames: PlannerDistillationFeatures.Names,
            SelectionMode: BanditDecisionTrace.SelectionMode,
            TieBreakRule: BanditDecisionTrace.TieBreakRule,
            TeacherExecution: "synchronous-full",
            TickHz: AircraftSim.TickHz,
            FlatTerrain: true,
            CalmWind: true,
            FormationMode: "independent",
            DoctrineIndex: 0,
            EpisodeCount: batch.Episodes.Count,
            SampleCount: batch.SampleCount,
            TeacherEligibleSampleCount: batch.Episodes.Sum(
                episode => episode.Samples.Count(
                    sample => IsTraceTeacherEligible(sample.DecisionTrace))),
            FirstSeed: config.FirstSeed,
            MaximumSecondsPerEpisode: config.MaximumSecondsPerEpisode,
            ReferencePolicyId: ReactiveBanditPolicyId(config.ReferenceSkill),
            BehaviorPolicyId: ReactiveBanditPolicyId(config.BehaviorSkill),
            BehaviorAirframeSchema: BehaviorAirframeSchema(config.BehaviorSkill),
            BehaviorProfileSchema: BehaviorProfileSchema(config.BehaviorSkill),
            AtmosphereSchema: StandardAtmosphereSchema,
            ArtifactHashAlgorithm: "sha256",
            ArtifactHash: null));

        foreach (PlannerTeacherEpisode episode in batch.Episodes) {
            WriteRow(writer, new EpisodeRow(
                Type: "episode",
                episode.EpisodeIndex,
                episode.ScenarioId,
                episode.Seed,
                ReferenceSkill: SkillName(episode.ReferenceSkill),
                BehaviorSkill: SkillName(episode.BehaviorSkill),
                SampleCount: episode.Samples.Count,
                TeacherEligibleSampleCount: episode.Samples.Count(
                    sample => IsTraceTeacherEligible(sample.DecisionTrace)),
                TerminalReason: TerminalReasonName(
                    episode.CombatEpisode.TerminalReason)));

            foreach (PlannerTeacherSample sample in episode.Samples)
                WriteRow(writer, Project(episode, sample));
        }
    }

    public static string Serialize(PlannerTeacherBatch batch) {
        using var writer = new StringWriter(CultureInfo.InvariantCulture);
        Write(writer, batch);
        return writer.ToString();
    }

    static SampleRow Project(PlannerTeacherEpisode episode,
        in PlannerTeacherSample sample) {
        BanditDecisionTrace trace = sample.DecisionTrace;
        if (trace.CandidateCount is < 1 or > BanditDecisionTrace.CandidateCapacity)
            throw new InvalidOperationException("Teacher trace candidate count is invalid.");
        if (trace.SelectedCandidateIndex < 0
            || trace.SelectedCandidateIndex >= trace.CandidateCount)
            throw new InvalidOperationException("Teacher selected index is outside its table.");

        double[] features = PlannerDistillationFeatures.Project(sample, out var featureQuality);
        var candidates = new CandidateRow[BanditDecisionTrace.CandidateCapacity];
        int availabilityMask = 0;
        int scorePresenceMask = 0;
        int finiteScoreMask = 0;
        int scoreLossMask = 0;
        int selectedMask = 0;
        bool candidateTableComplete =
            trace.CandidateCount == BanditDecisionTrace.CandidateCapacity;
        bool anyRolloutInvalid = false;
        var finiteAvailableScores = new List<double>(
            BanditDecisionTrace.CandidateCapacity);

        for (int index = 0;
            index < BanditDecisionTrace.CandidateCapacity;
            index++) {
            bool present = index < trace.CandidateCount;
            if (!present) {
                candidates[index] = new CandidateRow(
                    index,
                    CandidateNames[index],
                    Present: false,
                    CommandNorm: null,
                    Available: false,
                    HasScore: false,
                    FiniteScore: false,
                    RolloutInvalid: false,
                    RawScore: null,
                    RelativeAdvantage: null,
                    Selected: false);
                candidateTableComplete = false;
                continue;
            }

            BanditDecisionCandidate candidate = trace.CandidateAt(index);
            if (candidate.Id != index) candidateTableComplete = false;
            ValidatePlannerCommand(candidate.Command);
            bool finiteScore = candidate.HasScore && double.IsFinite(candidate.Score);
            bool scoreLoss = candidate.Available && finiteScore;
            bool rolloutInvalid =
                candidate.Available && candidate.HasScore && !finiteScore;
            bool selected = trace.SelectedCandidateIndex == index;
            if (candidate.Available) availabilityMask |= 1 << index;
            if (candidate.HasScore) scorePresenceMask |= 1 << index;
            if (finiteScore) finiteScoreMask |= 1 << index;
            if (scoreLoss) {
                scoreLossMask |= 1 << index;
                finiteAvailableScores.Add(candidate.Score);
            }
            if (selected) selectedMask |= 1 << index;
            anyRolloutInvalid |= rolloutInvalid;
            candidates[index] = new CandidateRow(
                index,
                CandidateNames[index],
                Present: true,
                CommandNorm: ProjectCommand(candidate.Command),
                candidate.Available,
                candidate.HasScore,
                finiteScore,
                rolloutInvalid,
                RawScore: finiteScore ? candidate.Score : null,
                RelativeAdvantage: null,
                selected);
        }

        double bestFinite = finiteAvailableScores.Count == 0
            ? double.NaN
            : finiteAvailableScores.Max();
        double worstFinite = finiteAvailableScores.Count == 0
            ? double.NaN
            : finiteAvailableScores.Min();
        double denominator = finiteAvailableScores.Count == 0
            ? double.NaN
            : System.Math.Max(bestFinite - worstFinite, 1e-9);
        for (int index = 0; index < candidates.Length; index++) {
            CandidateRow candidate = candidates[index];
            if (!candidate.Present || !candidate.Available
                || !candidate.FiniteScore || candidate.RawScore is not double score)
                continue;
            candidates[index] = candidate with {
                RelativeAdvantage = (score - bestFinite) / denominator
            };
        }

        bool selectedScoreFinite =
            (finiteScoreMask & selectedMask) == selectedMask;
        bool selectedAvailable =
            (availabilityMask & selectedMask) == selectedMask;
        bool selectedCommandMatches = sample.DecisionTrace.SelectedCandidateIndex
                < candidates.Length
            && sample.DecisionTrace.SelectedCandidateIndex
                < sample.DecisionTrace.CandidateCount
            && CommandMatches(
                sample.DecisionTrace.SelectedCommand,
                sample.DecisionTrace.CandidateAt(
                    sample.DecisionTrace.SelectedCandidateIndex).Command);
        bool firstMaximumConsistent = FirstMaximumIndex(trace)
            == trace.SelectedCandidateIndex;
        if (candidateTableComplete
            && (!selectedAvailable
                || !selectedScoreFinite
                || !selectedCommandMatches
                || !firstMaximumConsistent))
            throw new InvalidOperationException(
                "Teacher trace contradicts the declared deterministic selection contract.");

        bool snapshotAligned =
            sample.PlanningObservation.Tick
                == sample.PlanningObservation.Contact.SourceTick
            && sample.DecisionIndex >= 0;
        bool fullTeacher = trace.CandidateCount
            == BanditDecisionTrace.CandidateCapacity;
        bool allAvailableScoresFinite =
            (availabilityMask & finiteScoreMask) == availabilityMask;
        bool teacherEligible = sample.IsTeacherEligible
            && snapshotAligned
            && fullTeacher
            && candidateTableComplete
            && selectedAvailable
            && selectedScoreFinite
            && selectedCommandMatches
            && firstMaximumConsistent
            && allAvailableScoresFinite;
        bool contactStale =
            sample.PlanningObservation.Contact.ObservationAgeTicks > 120;
        bool contactLowConfidence =
            sample.PlanningObservation.Contact.Confidence < 0.5;
        bool shadowEligible = teacherEligible
            && featureQuality.AllFinite
            && !featureQuality.AnyClipped
            && !contactStale
            && !contactLowConfidence;

        var reasons = new List<string>();
        if (!snapshotAligned) reasons.Add("planning-snapshot-not-aligned");
        if (!fullTeacher) reasons.Add("not-nine-candidate-teacher");
        if (!candidateTableComplete) reasons.Add("candidate-table-incomplete");
        if (!selectedAvailable) reasons.Add("selected-candidate-unavailable");
        if (!selectedScoreFinite) reasons.Add("selected-score-nonfinite");
        if (!selectedCommandMatches) reasons.Add("selected-command-mismatch");
        if (!firstMaximumConsistent) reasons.Add("first-maximum-mismatch");
        if (!allAvailableScoresFinite) reasons.Add("available-score-nonfinite");
        if (!featureQuality.AllFinite) reasons.Add("feature-source-nonfinite");
        if (featureQuality.AnyClipped) reasons.Add("feature-clipped");
        if (contactStale) reasons.Add("contact-stale");
        if (contactLowConfidence) reasons.Add("contact-low-confidence");

        double teacherMargin = TeacherMargin(candidates);
        double boundaryWeight = double.IsFinite(teacherMargin)
            ? 1.0 + 3.0 * (1.0 - System.Math.Clamp(teacherMargin, 0.0, 1.0))
            : 1.0;
        return new SampleRow(
            Type: "sample",
            episode.EpisodeIndex,
            episode.ScenarioId,
            episode.Seed,
            sample.DecisionIndex,
            PlanningTick: sample.PlanningObservation.Tick,
            SelectionSequence: trace.SelectionSequence,
            BehaviorSkill: SkillName(sample.BehaviorSkill),
            sample.EnginePowerFraction,
            Features: new FeatureRow(
                PlannerDistillationFeatures.Schema,
                features,
                ClipBitsLow: featureQuality.ClipBitsLow.ToString(
                    "X16", CultureInfo.InvariantCulture),
                ClipBitsHigh: featureQuality.ClipBitsHigh.ToString(
                    "X16", CultureInfo.InvariantCulture),
                featureQuality.AnyClipped,
                featureQuality.AllFinite),
            Candidates: candidates,
            trace.SelectedCandidateIndex,
            availabilityMask,
            scorePresenceMask,
            finiteScoreMask,
            scoreLossMask,
            selectedMask,
            TeacherMargin: double.IsFinite(teacherMargin) ? teacherMargin : null,
            BoundaryWeight: boundaryWeight,
            Safety: new SafetyRow(
                teacherEligible,
                shadowEligible,
                snapshotAligned,
                fullTeacher,
                candidateTableComplete,
                selectedScoreFinite,
                TerrainKnown: true,
                TerrainTruthComplete: true,
                anyRolloutInvalid,
                contactStale,
                contactLowConfidence,
                featureQuality.AnyClipped,
                UnknownAirframe: false,
                UnknownProfile: false,
                UnknownAtmosphere: false,
                NonFlatTerrain: false,
                NonCalmWind: false,
                Reasons: reasons.ToArray()));
    }

    static double TeacherMargin(IReadOnlyList<CandidateRow> candidates) {
        double best = double.NegativeInfinity;
        double second = double.NegativeInfinity;
        foreach (CandidateRow candidate in candidates) {
            if (!candidate.Available
                || candidate.RelativeAdvantage is not double advantage)
                continue;
            if (advantage > best) {
                second = best;
                best = advantage;
            } else if (advantage > second) {
                second = advantage;
            }
        }
        return double.IsFinite(best) && double.IsFinite(second)
            ? best - second
            : double.NaN;
    }

    static int FirstMaximumIndex(in BanditDecisionTrace trace) {
        double best = double.NegativeInfinity;
        int bestIndex = -1;
        for (int index = 0; index < trace.CandidateCount; index++) {
            BanditDecisionCandidate candidate = trace.CandidateAt(index);
            if (!candidate.Available
                || !candidate.HasScore
                || !double.IsFinite(candidate.Score))
                continue;
            if (candidate.Score > best) {
                best = candidate.Score;
                bestIndex = index;
            }
        }
        return bestIndex;
    }

    static bool IsTraceTeacherEligible(in BanditDecisionTrace trace) =>
        trace.CandidateCount == BanditDecisionTrace.CandidateCapacity
        && FirstMaximumIndex(trace) == trace.SelectedCandidateIndex;

    static void ValidatePlannerCommand(in PilotCommand command) {
        if (!double.IsFinite(command.GDemand)
            || !double.IsFinite(command.BankTarget)
            || !double.IsFinite(command.Throttle)
            || !double.IsFinite(command.Rudder))
            throw new InvalidOperationException(
                "Planner candidate actuated fields must be finite.");
        if (!double.IsNaN(command.CommandedPitchRad)
            || command.EnvelopeOverride
            || command.RollControl != 0.0
            || !double.IsNaN(command.CommandedAlphaRad)
            || command.SasRollControl != 0.0
            || command.DirectLateralControl)
            throw new InvalidOperationException(
                "Planner command schema v1 only supports G, bank, throttle, and rudder.");
    }

    static bool CommandMatches(in PilotCommand left, in PilotCommand right) =>
        left.GDemand == right.GDemand
        && left.BankTarget == right.BankTarget
        && left.Throttle == right.Throttle
        && left.Rudder == right.Rudder;

    static CandidateCommandRow ProjectCommand(in PilotCommand command) => new(
        GDemand: command.GDemand / 15.0,
        BankTarget: command.BankTarget / System.Math.PI,
        Throttle: command.Throttle / 1.65,
        Rudder: command.Rudder);

    static void WriteRow<T>(TextWriter writer, T row) {
        writer.Write(JsonSerializer.Serialize(row, Options));
        writer.Write('\n');
    }

    static string ReactiveBanditPolicyId(PilotSkill skill) =>
        $"guns-only.reactive-bandit.v1:{SkillName(skill)}";

    static string BehaviorAirframeSchema(PilotSkill skill) =>
        skill == PilotSkill.Machine
            ? UcavAirframeSchema
            : Su27AirframeSchema;

    static string BehaviorProfileSchema(PilotSkill skill) =>
        $"guns-only.bandit-skill-profile.v1:{SkillName(skill)}";

    static string SkillName(PilotSkill skill) => skill switch {
        PilotSkill.Novice => "novice",
        PilotSkill.Competent => "competent",
        PilotSkill.Veteran => "veteran",
        PilotSkill.Ace => "ace",
        PilotSkill.Machine => "machine",
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
        string FeatureSchema,
        string NormalizationSchema,
        string CandidateSchema,
        string ScoreSchema,
        string ScenarioSchema,
        string SeedGeneratorSchema,
        string SplitSchema,
        string SplitSalt,
        int CandidateCount,
        int FeatureCount,
        IReadOnlyList<string> CandidateNames,
        IReadOnlyList<string> FeatureNames,
        string SelectionMode,
        string TieBreakRule,
        string TeacherExecution,
        double TickHz,
        bool FlatTerrain,
        bool CalmWind,
        string FormationMode,
        int DoctrineIndex,
        int EpisodeCount,
        int SampleCount,
        int TeacherEligibleSampleCount,
        ulong FirstSeed,
        double MaximumSecondsPerEpisode,
        string ReferencePolicyId,
        string BehaviorPolicyId,
        string BehaviorAirframeSchema,
        string BehaviorProfileSchema,
        string AtmosphereSchema,
        string ArtifactHashAlgorithm,
        string? ArtifactHash);

    readonly record struct EpisodeRow(
        string Type,
        int EpisodeIndex,
        string ScenarioId,
        ulong Seed,
        string ReferenceSkill,
        string BehaviorSkill,
        int SampleCount,
        int TeacherEligibleSampleCount,
        string TerminalReason);

    readonly record struct SampleRow(
        string Type,
        int EpisodeIndex,
        string ScenarioId,
        ulong Seed,
        long DecisionIndex,
        long PlanningTick,
        long SelectionSequence,
        string BehaviorSkill,
        double EnginePowerFraction,
        FeatureRow Features,
        IReadOnlyList<CandidateRow> Candidates,
        int SelectedIndex,
        int AvailabilityMask,
        int ScorePresenceMask,
        int FiniteScoreMask,
        int ScoreLossMask,
        int SelectedMask,
        double? TeacherMargin,
        double BoundaryWeight,
        SafetyRow Safety);

    readonly record struct FeatureRow(
        string Schema,
        IReadOnlyList<double> Values,
        string ClipBitsLow,
        string ClipBitsHigh,
        bool AnyClipped,
        bool AllFinite);

    readonly record struct CandidateRow(
        int Id,
        string Name,
        bool Present,
        CandidateCommandRow? CommandNorm,
        bool Available,
        bool HasScore,
        bool FiniteScore,
        bool RolloutInvalid,
        double? RawScore,
        double? RelativeAdvantage,
        bool Selected);

    readonly record struct CandidateCommandRow(
        double GDemand,
        double BankTarget,
        double Throttle,
        double Rudder);

    readonly record struct SafetyRow(
        bool TeacherEligible,
        bool ShadowEligible,
        bool SnapshotAligned,
        bool FullTeacher,
        bool CandidateTableComplete,
        bool SelectedScoreFinite,
        bool TerrainKnown,
        bool TerrainTruthComplete,
        bool AnyRolloutInvalid,
        bool ContactStale,
        bool ContactLowConfidence,
        bool FeatureClipped,
        bool UnknownAirframe,
        bool UnknownProfile,
        bool UnknownAtmosphere,
        bool NonFlatTerrain,
        bool NonCalmWind,
        IReadOnlyList<string> Reasons);

    sealed class CanonicalDoubleConverter : JsonConverter<double> {
        public override double Read(ref Utf8JsonReader reader, Type typeToConvert,
            JsonSerializerOptions options) => reader.GetDouble();

        public override void Write(Utf8JsonWriter writer, double value,
            JsonSerializerOptions options) {
            if (!double.IsFinite(value))
                throw new JsonException(
                    "Planner teacher dataset values must be finite or explicit null.");
            writer.WriteRawValue(
                value.ToString("G12", CultureInfo.InvariantCulture),
                skipInputValidation: true);
        }
    }
}

using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>A frozen headless combat setup generated entirely from an explicit seed.</summary>
public readonly record struct CombatTrainingScenario(
    string Id,
    ulong Seed,
    AircraftState ReferenceStart,
    AircraftState LearningFighterStart,
    bool FirstPassSafe);

/// <summary>
/// Stable seed-to-geometry mapping for varied reciprocal visual merges. SplitMix64 is embedded
/// rather than System.Random so the same seed remains bit-reproducible across runtime upgrades.
/// </summary>
public static class CombatTrainingScenarioFactory {
    const double BaseAltitudeM = 5486.4; // 18,000 ft

    public static CombatTrainingScenario SeededOffsetMerge(ulong seed) {
        var random = new SplitMix64(seed);
        double side = (random.NextUInt64() & 1UL) == 0UL ? -1.0 : 1.0;
        double longitudinalSeparationM = Lerp(5600.0, 7200.0, random.NextUnit());
        double lateralSeparationM = Lerp(180.0, 720.0, random.NextUnit());
        double altitudeSeparationM = Lerp(-240.0, 240.0, random.NextUnit());
        double centreAltitudeM = BaseAltitudeM + Lerp(-350.0, 350.0, random.NextUnit());
        double referenceSpeedMps = Lerp(280.0, 320.0, random.NextUnit());
        double learningSpeedMps = Lerp(270.0, 310.0, random.NextUnit());

        double halfLongitudinal = longitudinalSeparationM * 0.5;
        double halfLateral = lateralSeparationM * 0.5;
        double halfVertical = altitudeSeparationM * 0.5;
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = FlightModel.Su27SPublicDataSurrogate;
        var reference = new AircraftState(
            new Vec3D(-side * halfLateral, centreAltitudeM - halfVertical,
                -halfLongitudinal),
            referenceSpeedMps, 0.0, 0.0, 0.0, referenceAir.MassKg);
        var learning = new AircraftState(
            new Vec3D(side * halfLateral, centreAltitudeM + halfVertical,
                halfLongitudinal),
            learningSpeedMps, 0.0, System.Math.PI, 0.0, learningAir.MassKg);
        return new CombatTrainingScenario(
            $"seeded-offset-merge-{seed:x16}",
            seed,
            reference,
            learning,
            FirstPassSafe: true);
    }

    static double Lerp(double low, double high, double unit) =>
        low + (high - low) * unit;

    struct SplitMix64 {
        ulong _state;

        public SplitMix64(ulong seed) => _state = seed;

        public ulong NextUInt64() {
            ulong z = unchecked(_state += 0x9e37_79b9_7f4a_7c15UL);
            z = (z ^ (z >> 30)) * 0xbf58_476d_1ce4_e5b9UL;
            z = (z ^ (z >> 27)) * 0x94d0_49bb_1331_11ebUL;
            return z ^ (z >> 31);
        }

        public double NextUnit() =>
            (NextUInt64() >> 11) * (1.0 / 9007199254740992.0);
    }
}

public sealed record CombatTrainingBatchConfig(
    ulong FirstSeed = 1,
    int EpisodeCount = 4,
    double MaximumSecondsPerEpisode = 25.0,
    PilotSkill ReferenceSkill = PilotSkill.Veteran,
    PilotSkill BehaviorSkill = PilotSkill.Ace,
    CombatRewardWeights? RewardWeights = null);

/// <summary>
/// Per-tier production-geometry threat facts from a deterministic seeded engagement set. "Rear
/// quarter" is the tactically relevant 1,500 m threat volume behind the bandit's 3/9 line using
/// the controller's own -0.45 rear-aspect boundary. PlayerDamageHits are physical GunKill hits
/// scored by the bandit; no burst proxy, camera cone, or fabricated damage enters this report.
/// </summary>
public readonly record struct SeededSkillTierMeasurement(
    PilotSkill Skill,
    int Engagements,
    int EngagementsWithBanditFire,
    int EngagementsWithPlayerDamage,
    int BanditRoundsFired,
    int PlayerDamageHits,
    double PlayerRearQuarterSeconds) {

    public double BanditRoundsPerEngagement =>
        Engagements > 0 ? (double)BanditRoundsFired / Engagements : 0.0;
    public double PlayerRearQuarterSecondsPerEngagement =>
        Engagements > 0 ? PlayerRearQuarterSeconds / Engagements : 0.0;
}

public sealed record SeededSkillTierEvaluationConfig(
    ulong FirstSeed = 0xB4AD_1700UL,
    int EngagementsPerTier = 4,
    double MaximumSecondsPerEngagement = 40.0,
    PilotSkill PlayerSkill = PilotSkill.Competent);

/// <summary>
/// A factory-authenticated seeded-offset-merge batch. Construction stays inside the simulation
/// assembly so the JSON exporter cannot be handed arbitrary episodes while claiming the runner's
/// seed-to-geometry provenance.
/// </summary>
public sealed class CombatTrainingBatch {
    internal CombatTrainingBatch(CombatTrainingBatchConfig config,
        IReadOnlyList<CombatEpisode> episodes) {
        ArgumentNullException.ThrowIfNull(config);
        ArgumentNullException.ThrowIfNull(episodes);
        Config = config;
        Episodes = Array.AsReadOnly(episodes.ToArray());
    }

    public CombatTrainingBatchConfig Config { get; }
    public IReadOnlyList<CombatEpisode> Episodes { get; }

    public int TransitionCount => Episodes.Sum(episode => episode.Transitions.Count);
    public int LearningWins => Episodes.Count(
        episode => episode.TerminalReason == CombatTerminalReason.OpponentDestroyed);
    public int LearningLosses => Episodes.Count(
        episode => episode.TerminalReason == CombatTerminalReason.OwnshipDestroyed);
    public int MutualDestructions => Episodes.Count(
        episode => episode.TerminalReason == CombatTerminalReason.MutualDestruction);
    public int Timeouts => Episodes.Count(
        episode => episode.TerminalReason == CombatTerminalReason.TimeLimit);
    public int RoundsFired => Episodes.Sum(episode => episode.RoundsFired);
    public int HitsScored => Episodes.Sum(episode => episode.HitsScored);
    public int HitsReceived => Episodes.Sum(episode => episode.HitsReceived);
    public double TotalReward => Episodes.Sum(episode => episode.TotalReward);
}

/// <summary>
/// Renderer-free deterministic behavior-data runner. The learning side currently uses a selected
/// ReactiveBandit tier as its behavior policy; a later policy adapter can replace that actor while
/// retaining this scenario, physics, weapon, reward, recorder, and dataset contract.
/// </summary>
public static class SeededCombatBatchRunner {
    public const int MaximumBatchTransitions = 250_000;
    public const double MaximumSupportedEpisodeSeconds = 60.0;
    public const double MinimumSupportedAltitudeM = 200.0;
    public const double MaximumSupportedAltitudeM = 12_000.0;

    const double Dt = SimulationSession.FixedDeltaSeconds;
    const double MergeGateM = 900.0;
    const double OpeningConfirmationSeconds = 0.20;
    const double RearQuarterRangeM = 1500.0;
    const double RearQuarterAspectDot = -0.45;

    /// <summary>
    /// Run the same seeded firing-opportunity and tail-ingress engagements at each human opponent
    /// tier. This is deliberately separate from the long-range learning scenario: that scenario's
    /// first-pass safety consumes its only close pass inside the current controlled horizon, making
    /// it a useful transition contract but a degenerate opponent-threat probe.
    /// </summary>
    public static IReadOnlyList<SeededSkillTierMeasurement> MeasureSkillTiers(
        SeededSkillTierEvaluationConfig? config = null,
        CancellationToken cancellationToken = default) {
        SeededSkillTierEvaluationConfig selected =
            config ?? new SeededSkillTierEvaluationConfig();
        if (selected.EngagementsPerTier is < 1 or > 100)
            throw new ArgumentOutOfRangeException(nameof(config));
        if (!double.IsFinite(selected.MaximumSecondsPerEngagement)
            || selected.MaximumSecondsPerEngagement <= 0.0
            || selected.MaximumSecondsPerEngagement > MaximumSupportedEpisodeSeconds)
            throw new ArgumentOutOfRangeException(nameof(config));
        cancellationToken.ThrowIfCancellationRequested();

        PilotSkill[] tiers = {
            PilotSkill.Novice,
            PilotSkill.Competent,
            PilotSkill.Veteran,
            PilotSkill.Ace
        };
        var measurements = new SeededSkillTierMeasurement[tiers.Length];
        for (int tierIndex = 0; tierIndex < tiers.Length; tierIndex++) {
            PilotSkill skill = tiers[tierIndex];
            int rounds = 0;
            int damageHits = 0;
            int engagementsWithFire = 0;
            int engagementsWithDamage = 0;
            double rearQuarterSeconds = 0.0;
            for (int engagementIndex = 0;
                engagementIndex < selected.EngagementsPerTier;
                engagementIndex++) {
                cancellationToken.ThrowIfCancellationRequested();
                ulong seed = unchecked(
                    selected.FirstSeed + (ulong)engagementIndex);
                CombatTrainingScenario seedGeometry =
                    CombatTrainingScenarioFactory.SeededOffsetMerge(seed);
                int engagementNumber = engagementIndex + 1;
                CombatTrainingScenario scenario = (engagementIndex & 1) == 0
                    ? SeededBanditFiringOpportunity(seedGeometry, engagementNumber)
                    : SeededPlayerTailIngress(seedGeometry, engagementNumber);
                CombatEpisode episode = RunEpisode(
                    engagementIndex,
                    scenario,
                    selected.PlayerSkill,
                    skill,
                    selected.MaximumSecondsPerEngagement,
                    cancellationToken: cancellationToken,
                    engagementNumber: engagementNumber);

                rounds += episode.RoundsFired;
                damageHits += episode.HitsScored;
                if (episode.RoundsFired > 0) engagementsWithFire++;
                if (episode.HitsScored > 0) engagementsWithDamage++;
                rearQuarterSeconds += episode.Transitions.Count(
                    transition => PlayerInBanditRearQuarter(
                        transition.Observation)) * Dt;
            }

            measurements[tierIndex] = new SeededSkillTierMeasurement(
                skill,
                selected.EngagementsPerTier,
                engagementsWithFire,
                engagementsWithDamage,
                rounds,
                damageHits,
                rearQuarterSeconds);
        }
        return Array.AsReadOnly(measurements);
    }

    static CombatTrainingScenario SeededBanditFiringOpportunity(
        in CombatTrainingScenario seedGeometry, int engagementNumber) {
        AircraftParams playerAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams banditAir = FlightModel.Su27SPublicDataSurrogate;
        double side = seedGeometry.ReferenceStart.Position.X < 0.0 ? -1.0 : 1.0;
        double altitudeM = seedGeometry.ReferenceStart.Position.Y;
        // An earned but not mathematically perfect offensive perch: the bandit begins inside gun
        // range with small seeded lateral/vertical errors and modest closure. The player is already
        // free to break; the opponent still has to press and track the fleeting opportunity.
        var player = new AircraftState(
            new Vec3D(
                side * (22.0 + System.Math.Abs(
                    seedGeometry.ReferenceStart.Position.X) * 0.03),
                altitudeM + 12.0,
                620.0),
            258.0 + (seedGeometry.ReferenceStart.Speed - 300.0) * 0.10,
            0.0, 0.0, 0.0, playerAir.MassKg);
        var bandit = new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0),
            278.0 + (seedGeometry.LearningFighterStart.Speed - 290.0) * 0.08,
            0.0, 0.0, 0.0, banditAir.MassKg);
        return new CombatTrainingScenario(
            $"seeded-bandit-firing-opportunity-{seedGeometry.Seed:x16}-{engagementNumber}",
            seedGeometry.Seed,
            player,
            bandit,
            FirstPassSafe: false);
    }

    static CombatTrainingScenario SeededPlayerTailIngress(
        in CombatTrainingScenario seedGeometry, int engagementNumber) {
        AircraftParams playerAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams banditAir = FlightModel.Su27SPublicDataSurrogate;
        double side = seedGeometry.ReferenceStart.Position.X < 0.0 ? -1.0 : 1.0;
        double altitudeM = seedGeometry.ReferenceStart.Position.Y;
        // The player begins just outside the measured rear-quarter volume, faster and offset, and
        // tries to enter it under the same reference policy at every tier. This measures denial of
        // the saddle rather than survival after the saddle is already stabilized.
        var player = new AircraftState(
            new Vec3D(side * 550.0, altitudeM + 60.0, -1450.0),
            282.0 + (seedGeometry.ReferenceStart.Speed - 300.0) * 0.10,
            0.0, 0.0, 0.0, playerAir.MassKg);
        var bandit = new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0),
            248.0 + (seedGeometry.LearningFighterStart.Speed - 290.0) * 0.08,
            0.0, 0.0, 0.0, banditAir.MassKg);
        return new CombatTrainingScenario(
            $"seeded-player-tail-ingress-{seedGeometry.Seed:x16}-{engagementNumber}",
            seedGeometry.Seed,
            player,
            bandit,
            FirstPassSafe: false);
    }

    public static CombatTrainingBatch Run(CombatTrainingBatchConfig? config = null,
        CancellationToken cancellationToken = default) {
        CombatTrainingBatchConfig selected = config ?? new CombatTrainingBatchConfig();
        Validate(selected);
        cancellationToken.ThrowIfCancellationRequested();
        var episodes = new CombatEpisode[selected.EpisodeCount];
        for (int index = 0; index < episodes.Length; index++) {
            cancellationToken.ThrowIfCancellationRequested();
            ulong seed = unchecked(selected.FirstSeed + (ulong)index);
            CombatTrainingScenario scenario =
                CombatTrainingScenarioFactory.SeededOffsetMerge(seed);
            episodes[index] = RunEpisode(index, scenario,
                selected.ReferenceSkill,
                selected.BehaviorSkill,
                selected.MaximumSecondsPerEpisode,
                selected.RewardWeights,
                cancellationToken);
        }
        return new CombatTrainingBatch(selected, episodes);
    }

    public static CombatEpisode RunEpisode(
        int episodeIndex,
        in CombatTrainingScenario scenario,
        PilotSkill referenceSkill,
        PilotSkill behaviorSkill,
        double maximumSeconds,
        CombatRewardWeights? rewardWeights = null,
        CancellationToken cancellationToken = default,
        int engagementNumber = 1) {
        if (episodeIndex < 0) throw new ArgumentOutOfRangeException(nameof(episodeIndex));
        if (engagementNumber < 1)
            throw new ArgumentOutOfRangeException(nameof(engagementNumber));
        if (string.IsNullOrWhiteSpace(scenario.Id))
            throw new ArgumentException("A scenario id is required.", nameof(scenario));
        if (!double.IsFinite(maximumSeconds) || maximumSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maximumSeconds));
        if (maximumSeconds > MaximumSupportedEpisodeSeconds)
            throw new ArgumentOutOfRangeException(nameof(maximumSeconds),
                $"The current controlled-policy runner supports at most "
                + $"{MaximumSupportedEpisodeSeconds} seconds; learned-control crash and "
                + "out-of-bounds terminals are not implemented yet.");
        ValidateSupportedStart(scenario.ReferenceStart, nameof(scenario));
        ValidateSupportedStart(scenario.LearningFighterStart, nameof(scenario));

        int maximumTicks = MaximumTicks(maximumSeconds);
        if (maximumTicks > MaximumBatchTransitions)
            throw new ArgumentOutOfRangeException(nameof(maximumSeconds),
                $"One episode cannot exceed {MaximumBatchTransitions} transitions.");
        cancellationToken.ThrowIfCancellationRequested();

        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = behaviorSkill == PilotSkill.Machine
            ? FlightModel.UcavInterceptorSurrogate
            : FlightModel.Su27SPublicDataSurrogate;
        var reference = new ReactiveBandit(
            scenario.ReferenceStart, referenceAir, referenceSkill,
            engagementNumber: engagementNumber);
        // Scenario factories stage skill-agnostic states; a machine episode restages the
        // learning fighter at UCAV mass so the airframe it flies is the airframe it weighs.
        var learning = new ReactiveBandit(
            behaviorSkill == PilotSkill.Machine
                ? scenario.LearningFighterStart with { Mass = learningAir.MassKg }
                : scenario.LearningFighterStart,
            learningAir, behaviorSkill,
            engagementNumber: engagementNumber);
        CombatConfig combat = CombatConfig.ModernVisualMerge;
        var referenceGun = new GunKill(
            combat.PlayerAmmo,
            combat.OpponentHitsToDefeat,
            combat.PlayerGunProfile.EffectiveHitRadiusM,
            combat.PlayerGunProfile);
        var learningGun = new GunKill(
            combat.OpponentAmmo,
            combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM,
            combat.OpponentGunProfile);
        var recorder = new CombatTransitionRecorder(
            episodeIndex, scenario.Id, scenario.Seed, rewardWeights);

        double minimumRangeM = Geometry.Range(reference.State, learning.State);
        double previousRangeM = minimumRangeM;
        double openingSeconds = 0.0;
        bool firstPassOpened = !scenario.FirstPassSafe;
        for (int tick = 0; tick < maximumTicks; tick++) {
            cancellationToken.ThrowIfCancellationRequested();
            double elapsedSeconds = tick * Dt;
            AircraftState referenceState = reference.State;
            AircraftState learningState = learning.State;

            ActorObservation referenceContact = ActorObservation.Capture(referenceState, tick);
            ActorObservation learningContact = ActorObservation.Capture(learningState, tick);
            bool learningWeaponsAuthorized = WeaponsAuthorized(
                firstPassOpened, combat.OpponentAmmo, learningGun);
            CombatPolicyObservation observation = CombatPolicyObservation.Capture(
                tick,
                elapsedSeconds,
                learningState,
                referenceContact,
                learningGun.AmmoRemaining,
                learningWeaponsAuthorized);
            double geometryPotential = CombatRewardModel.GeometryPotential(observation);
            bool learningInEnvelope =
                CombatRewardModel.InAuthorizedFiringEnvelope(observation);

            bool referenceFireIntentEvaluated = firstPassOpened && combat.PlayerAmmo > 0;
            bool referenceFireIntentConsumed = referenceFireIntentEvaluated
                && reference.WantsToFire(learningContact);
            bool referenceFireAuthorized = referenceFireIntentConsumed
                && referenceGun.AmmoRemaining > 0
                && referenceGun.TargetAlive;
            bool learningFireIntentEvaluated = firstPassOpened && combat.OpponentAmmo > 0;
            bool learningFireIntentConsumed = learningFireIntentEvaluated
                && learning.WantsToFire(referenceContact);
            bool learningFireAuthorized = learningFireIntentConsumed
                && learningGun.AmmoRemaining > 0
                && learningGun.TargetAlive;
            long learningSelectionBefore = learning.DecisionTrace.SelectionSequence;
            int learningRoundsBefore = learningGun.RoundsFired;
            int learningHitsBefore = learningGun.HitCount;
            int referenceHitsBefore = referenceGun.HitCount;

            // Match the production tick boundary exactly: both guns consume the same beginning-
            // of-tick snapshot, then both aircraft advance before gun damage becomes authoritative.
            // A shot which splashes on this tick therefore cannot suppress either same-tick flight
            // command or leave a stale command attached to the terminal transition.
            referenceGun.Step(referenceFireAuthorized, referenceState, learningState, Dt);
            learningGun.Step(learningFireAuthorized, learningState, referenceState, Dt);
            reference.Step(learningContact, Dt);
            learning.Step(referenceContact, Dt);
            EnsureSupportedFlightVolume(reference.State, scenario.Id, "reference");
            EnsureSupportedFlightVolume(learning.State, scenario.Id, "learning");
            bool maneuverSelected =
                learning.DecisionTrace.SelectionSequence > learningSelectionBefore;

            bool learningDestroyed = referenceGun.Outcome == FightOutcome.Splash;
            bool referenceDestroyed = learningGun.Outcome == FightOutcome.Splash;
            CombatTerminalReason terminalReason = learningDestroyed && referenceDestroyed
                ? CombatTerminalReason.MutualDestruction
                : referenceDestroyed
                    ? CombatTerminalReason.OpponentDestroyed
                    : learningDestroyed
                        ? CombatTerminalReason.OwnshipDestroyed
                        : tick == maximumTicks - 1
                            ? CombatTerminalReason.TimeLimit
                            : CombatTerminalReason.None;

            // Advance scenario authority at the completed-tick boundary. Doing this before
            // materialising o(t+1) guarantees that the next tuple begins with the exact same
            // observation, including the first-pass weapons gate.
            double nextRangeM = Geometry.Range(reference.State, learning.State);
            minimumRangeM = System.Math.Min(minimumRangeM, nextRangeM);
            if (!firstPassOpened && minimumRangeM <= MergeGateM) {
                bool opening = nextRangeM > previousRangeM
                    && nextRangeM >= minimumRangeM + 20.0;
                openingSeconds = opening ? openingSeconds + Dt : 0.0;
                firstPassOpened = openingSeconds >= OpeningConfirmationSeconds;
            }
            previousRangeM = nextRangeM;

            ActorObservation nextReferenceContact = ActorObservation.Capture(
                reference.State, tick + 1L);
            bool nextWeaponsAuthorized = terminalReason == CombatTerminalReason.None
                && WeaponsAuthorized(firstPassOpened, combat.OpponentAmmo, learningGun);
            CombatPolicyObservation nextObservation = CombatPolicyObservation.Capture(
                tick + 1L,
                (tick + 1L) * Dt,
                learning.State,
                nextReferenceContact,
                learningGun.AmmoRemaining,
                nextWeaponsAuthorized);
            var components = new CombatRewardComponents(
                ElapsedSeconds: Dt,
                GeometryPotentialDelta:
                    CombatRewardModel.GeometryPotential(nextObservation) - geometryPotential,
                FiringEnvelopeSeconds: learningInEnvelope ? Dt : 0.0,
                RoundsFired: learningGun.RoundsFired - learningRoundsBefore,
                HitsScored: learningGun.HitCount - learningHitsBefore,
                HitsReceived: referenceGun.HitCount - referenceHitsBefore,
                OpponentDestroyed: referenceDestroyed,
                OwnshipDestroyed: learningDestroyed);
            CombatAction action = CombatAction.Capture(
                learning.AppliedCommand,
                maneuverSelected,
                maneuverApplied: true,
                learningFireIntentEvaluated,
                learningFireIntentConsumed,
                learningFireAuthorized);
            if (learningDestroyed != referenceDestroyed) {
                // A single destruction is not yet the authoritative outcome: the destroyed side's
                // already-airborne rounds keep flying (exactly as in the production session) and
                // can still convert this terminal into a mutual destruction. Settle them with
                // fire inhibited before appending the immutable terminal transition, then amend
                // the destruction facts and hit totals to the final result.
                GunKill threatGun = learningDestroyed ? learningGun : referenceGun;
                int settleTicks = (int)System.Math.Ceiling(
                    threatGun.Profile.MaximumFlightSeconds / Dt) + 1;
                for (int settle = 0; settle < settleTicks
                    && threatGun.Outcome == FightOutcome.Flying
                    && threatGun.RoundsInFlight.Count > 0; settle++) {
                    AircraftState referenceSettleState = reference.State;
                    AircraftState learningSettleState = learning.State;
                    long settleTick = tick + 1L + settle;
                    referenceGun.Step(false, referenceSettleState,
                        learningSettleState, Dt);
                    learningGun.Step(false, learningSettleState,
                        referenceSettleState, Dt);
                    reference.Step(ActorObservation.Capture(
                        learningSettleState, settleTick), Dt);
                    learning.Step(ActorObservation.Capture(
                        referenceSettleState, settleTick), Dt);
                }
                learningDestroyed = referenceGun.Outcome == FightOutcome.Splash;
                referenceDestroyed = learningGun.Outcome == FightOutcome.Splash;
                terminalReason = learningDestroyed && referenceDestroyed
                    ? CombatTerminalReason.MutualDestruction
                    : referenceDestroyed
                        ? CombatTerminalReason.OpponentDestroyed
                        : CombatTerminalReason.OwnshipDestroyed;
                components = components with {
                    HitsScored = learningGun.HitCount - learningHitsBefore,
                    HitsReceived = referenceGun.HitCount - referenceHitsBefore,
                    OpponentDestroyed = referenceDestroyed,
                    OwnshipDestroyed = learningDestroyed
                };
            }
            recorder.Append(observation, action, components,
                nextObservation, terminalReason);
            if (terminalReason != CombatTerminalReason.None) break;
        }

        return recorder.Freeze();
    }

    static void Validate(CombatTrainingBatchConfig config) {
        if (config.EpisodeCount is < 1 or > 10_000)
            throw new ArgumentOutOfRangeException(nameof(config.EpisodeCount));
        if (!double.IsFinite(config.MaximumSecondsPerEpisode)
            || config.MaximumSecondsPerEpisode <= 0.0
            || config.MaximumSecondsPerEpisode > MaximumSupportedEpisodeSeconds)
            throw new ArgumentOutOfRangeException(nameof(config.MaximumSecondsPerEpisode));
        if (config.RewardWeights is { IsFinite: false })
            throw new ArgumentOutOfRangeException(nameof(config.RewardWeights));

        int maximumTicks = MaximumTicks(config.MaximumSecondsPerEpisode);
        long maximumTransitions = (long)config.EpisodeCount * maximumTicks;
        if (maximumTransitions > MaximumBatchTransitions)
            throw new ArgumentOutOfRangeException(nameof(config),
                $"A batch cannot exceed {MaximumBatchTransitions} transitions; "
                + $"this configuration permits {maximumTransitions}.");
    }

    static int MaximumTicks(double maximumSeconds) {
        double ticks = System.Math.Ceiling(maximumSeconds / Dt);
        if (!double.IsFinite(ticks) || ticks > int.MaxValue)
            throw new ArgumentOutOfRangeException(nameof(maximumSeconds));
        return (int)ticks;
    }

    static bool WeaponsAuthorized(bool scenarioGateOpen, int configuredAmmo,
        GunKill gun) => scenarioGateOpen
        && configuredAmmo > 0
        && gun.AmmoRemaining > 0
        && gun.TargetAlive;

    static bool PlayerInBanditRearQuarter(
        in CombatPolicyObservation observation) {
        Vec3D toPlayer = observation.Contact.Position
            - observation.Ownship.Position;
        double rangeM = toPlayer.Length;
        return observation.WeaponsAuthorized
            && rangeM > 1.0
            && rangeM <= RearQuarterRangeM
            && observation.Ownship.ForwardDir()
                .Dot(toPlayer * (1.0 / rangeM)) < RearQuarterAspectDot;
    }

    static void ValidateSupportedStart(in AircraftState state, string parameterName) {
        if (!state.Position.IsFinite
            || !double.IsFinite(state.Speed) || state.Speed < 0.0
            || !double.IsFinite(state.Mass) || state.Mass <= 0.0
            || state.Position.Y < MinimumSupportedAltitudeM
            || state.Position.Y > MaximumSupportedAltitudeM)
            throw new ArgumentOutOfRangeException(parameterName,
                "Training starts must be finite, airborne, and inside the supported altitude volume.");
    }

    static void EnsureSupportedFlightVolume(in AircraftState state,
        string scenarioId, string actor) {
        if (state.Position.IsFinite
            && state.Position.Y >= MinimumSupportedAltitudeM
            && state.Position.Y <= MaximumSupportedAltitudeM)
            return;
        throw new InvalidOperationException(
            $"Scenario '{scenarioId}' moved the {actor} actor outside the controlled-policy "
            + "runner's supported flight volume. Add explicit crash/out-of-bounds terminals "
            + $"before using learned controls here. position={state.Position}, "
            + $"speed={state.Speed:F1} m/s");
    }
}

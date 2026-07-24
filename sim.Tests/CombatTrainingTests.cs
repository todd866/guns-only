using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

public class CombatTrainingTests {
    static CombatPolicyObservation Observation(long tick, double x = 0.0) {
        var own = new AircraftState(
            new Vec3D(x, 3000.0, 0.0),
            230.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg,
            QuaternionD.Identity,
            default);
        var contactTruth = new AircraftState(
            new Vec3D(x, 3000.0, 600.0),
            225.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg,
            QuaternionD.Identity,
            default);
        ActorObservation contact = ActorObservation.Capture(contactTruth, tick);
        return CombatPolicyObservation.Capture(
            tick,
            tick * SimulationSession.FixedDeltaSeconds,
            own,
            contact,
            ownshipAmmoRemaining: 40,
            weaponsAuthorized: true);
    }

    [Fact]
    public void EpisodeRecorderBuildsOneContiguousAuditableTerminalChain() {
        var recorder = new CombatTransitionRecorder(
            episodeIndex: 3, scenarioId: "test", seed: 91);
        CombatPolicyObservation first = Observation(0);
        CombatPolicyObservation second = Observation(1, x: 1.0);
        var action = new CombatAction(
            4.0, 0.5, 1.0, 0.0,
            ManeuverSelected: true,
            ManeuverApplied: true,
            FireIntentEvaluated: true,
            FireIntentConsumed: true,
            FireAuthorized: true);
        var components = new CombatRewardComponents(
            ElapsedSeconds: SimulationSession.FixedDeltaSeconds,
            GeometryPotentialDelta: 0.4,
            FiringEnvelopeSeconds: SimulationSession.FixedDeltaSeconds,
            RoundsFired: 1,
            HitsScored: 1,
            HitsReceived: 0,
            OpponentDestroyed: true,
            OwnshipDestroyed: false);

        CombatTransition transition = recorder.Append(
            first, action, components, second,
            CombatTerminalReason.OpponentDestroyed);
        CombatEpisode episode = recorder.Freeze();

        Assert.True(transition.Terminal);
        Assert.Equal(CombatTerminalReason.OpponentDestroyed, transition.TerminalReason);
        Assert.Equal(CombatRewardModel.Score(components), transition.Reward, 12);
        Assert.Equal(transition.Reward, episode.TotalReward, 12);
        Assert.Equal(1, episode.RoundsFired);
        Assert.Equal(1, episode.HitsScored);
        Assert.Null(recorder.Transitions as List<CombatTransition>);
        Assert.Null(episode.Transitions as CombatTransition[]);
        Assert.Throws<NotSupportedException>(() =>
            ((IList<CombatTransition>)recorder.Transitions).Add(transition));
        Assert.Throws<NotSupportedException>(() =>
            ((IList<CombatTransition>)episode.Transitions)[0] = transition);
        Assert.Throws<InvalidOperationException>(() => recorder.Append(
            second, action, components, Observation(2), CombatTerminalReason.TimeLimit));
    }

    [Fact]
    public void EpisodeRecorderRejectsContradictoryRewardAuthority() {
        CombatPolicyObservation first = Observation(0);
        CombatPolicyObservation second = Observation(1);
        CombatAction action = CombatAction.Capture(
            new PilotCommand(1.0, 0.0, 0.85, 0.0),
            maneuverSelected: false,
            maneuverApplied: true,
            fireIntentEvaluated: false,
            fireIntentConsumed: false,
            fireAuthorized: false);
        var valid = new CombatRewardComponents(
            SimulationSession.FixedDeltaSeconds,
            GeometryPotentialDelta: 0.0,
            FiringEnvelopeSeconds: 0.0,
            RoundsFired: 0,
            HitsScored: 0,
            HitsReceived: 0,
            OpponentDestroyed: false,
            OwnshipDestroyed: false);
        var recorder = new CombatTransitionRecorder(0, "strict", 1UL);

        Assert.Throws<InvalidOperationException>(() => recorder.Append(
            first, action,
            valid with { ElapsedSeconds = 2.0 * SimulationSession.FixedDeltaSeconds },
            second));
        Assert.Throws<InvalidOperationException>(() => recorder.Append(
            first, action,
            valid with { FiringEnvelopeSeconds = 2.0 * valid.ElapsedSeconds },
            second));
        Assert.Throws<InvalidOperationException>(() => recorder.Append(
            first, action,
            valid with { OpponentDestroyed = true },
            second,
            CombatTerminalReason.TimeLimit));

        var unboundedWeights = new CombatRewardWeights(
            GeometryPotentialScale: double.MaxValue);
        var unboundedRecorder = new CombatTransitionRecorder(
            0, "unbounded", 2UL, unboundedWeights);
        Assert.Throws<InvalidOperationException>(() => unboundedRecorder.Append(
            first, action,
            valid with { GeometryPotentialDelta = 2.0 },
            second,
            CombatTerminalReason.TimeLimit));
    }

    [Fact]
    public void SeedMappingAndBatchExportAreBitDeterministic() {
        Assert.DoesNotContain(typeof(CombatTrainingBatch).GetConstructors(),
            constructor => constructor.IsPublic);
        CombatTrainingScenario sameA =
            CombatTrainingScenarioFactory.SeededOffsetMerge(0x1234UL);
        CombatTrainingScenario sameB =
            CombatTrainingScenarioFactory.SeededOffsetMerge(0x1234UL);
        CombatTrainingScenario different =
            CombatTrainingScenarioFactory.SeededOffsetMerge(0x1235UL);
        Assert.Equal(sameA, sameB);
        Assert.NotEqual(sameA, different);
        Assert.Equal(236.09893565695216, sameA.ReferenceStart.Position.X);
        Assert.Equal(5445.526919281441, sameA.ReferenceStart.Position.Y);
        Assert.Equal(-3082.1956789564956, sameA.ReferenceStart.Position.Z);
        Assert.Equal(284.7136085401138, sameA.ReferenceStart.Speed);
        Assert.Equal(-236.09893565695216,
            sameA.LearningFighterStart.Position.X);
        Assert.Equal(5529.903259856121,
            sameA.LearningFighterStart.Position.Y);
        Assert.Equal(3082.1956789564956,
            sameA.LearningFighterStart.Position.Z);
        Assert.Equal(277.5694423222721,
            sameA.LearningFighterStart.Speed);

        var config = new CombatTrainingBatchConfig(
            FirstSeed: 0x1234UL,
            EpisodeCount: 2,
            MaximumSecondsPerEpisode: 0.05,
            ReferenceSkill: PilotSkill.Competent,
            BehaviorSkill: PilotSkill.Competent,
            RewardWeights: new CombatRewardWeights(GeometryPotentialScale: 0.125));
        CombatTrainingBatch first = SeededCombatBatchRunner.Run(config);
        CombatTrainingBatch second = SeededCombatBatchRunner.Run(config);

        Assert.Equal(first.TransitionCount, second.TransitionCount);
        Assert.Equal(first.Episodes.Count, second.Episodes.Count);
        for (int index = 0; index < first.Episodes.Count; index++) {
            Assert.Equal(first.Episodes[index].TerminalReason,
                second.Episodes[index].TerminalReason);
            Assert.Equal(first.Episodes[index].Transitions,
                second.Episodes[index].Transitions);
            Assert.Equal(CombatTerminalReason.TimeLimit,
                first.Episodes[index].TerminalReason);
            Assert.True(first.Episodes[index].Transitions[^1].Terminal);
            Assert.DoesNotContain(first.Episodes[index].Transitions.Take(
                    first.Episodes[index].Transitions.Count - 1),
                transition => transition.Terminal);
        }

        string firstJson = CombatDatasetJsonLines.Serialize(first);
        string secondJson = CombatDatasetJsonLines.Serialize(second);
        Assert.Equal(firstJson, secondJson);
        // The pinned hash moves ONLY with deliberate kernel/policy trajectory changes (Build 72
        // alpha model; Build 74 F-22 lateral authority + pushover guard; Build 97 opportunity-keyed
        // trigger and six-denial policy). The serializer, schema, and same-seed bit-equality above
        // are the real invariants. Print-and-update via the assertion when a labelled change lands.
        Assert.Equal(
            "5FE4F29DDF845380CA54F810BAC6F2069875C393A8F49E59B6BD577A571F4B52",
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(firstJson))));
        string[] lines = firstJson.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(1 + first.Episodes.Count + first.TransitionCount, lines.Length);
        using JsonDocument header = JsonDocument.Parse(lines[0]);
        Assert.Equal("schema", header.RootElement.GetProperty("type").GetString());
        Assert.Equal(CombatDatasetJsonLines.Schema,
            header.RootElement.GetProperty("schema").GetString());
        Assert.Equal(CombatDatasetJsonLines.ConfigSchema,
            header.RootElement.GetProperty("configSchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.ScenarioSchema,
            header.RootElement.GetProperty("scenarioSchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.ObservationSchema,
            header.RootElement.GetProperty("observationSchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.ActionSchema,
            header.RootElement.GetProperty("actionSchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.RewardSchema,
            header.RootElement.GetProperty("rewardSchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.PolicySchema,
            header.RootElement.GetProperty("policySchema").GetString());
        Assert.Equal(CombatDatasetJsonLines.SeedGeneratorSchema,
            header.RootElement.GetProperty("seedGeneratorSchema").GetString());
        Assert.Equal(first.TransitionCount,
            header.RootElement.GetProperty("transitionCount").GetInt32());
        Assert.Equal(config.FirstSeed,
            header.RootElement.GetProperty("firstSeed").GetUInt64());
        Assert.Equal(config.MaximumSecondsPerEpisode,
            header.RootElement.GetProperty("maximumSecondsPerEpisode").GetDouble());
        Assert.Equal("guns-only.reactive-bandit.v1:competent",
            header.RootElement.GetProperty("referencePolicyId").GetString());
        Assert.Equal("guns-only.reactive-bandit.v1:competent",
            header.RootElement.GetProperty("behaviorPolicyId").GetString());
        Assert.Equal("sha256",
            header.RootElement.GetProperty("artifactHashAlgorithm").GetString());
        Assert.Equal(JsonValueKind.Null,
            header.RootElement.GetProperty("artifactHash").ValueKind);
        Assert.False(header.RootElement.GetProperty(
            "artifactIdentityComplete").GetBoolean());
        Assert.Equal(config.RewardWeights!.GeometryPotentialScale,
            header.RootElement.GetProperty("rewardWeights")
                .GetProperty("geometryPotentialScale").GetDouble());

        using JsonDocument episodeRow = JsonDocument.Parse(lines[1]);
        Assert.Equal("episode", episodeRow.RootElement.GetProperty("type").GetString());
        Assert.Equal("timeLimit",
            episodeRow.RootElement.GetProperty("terminalReason").GetString());

        using JsonDocument transitionRow = JsonDocument.Parse(lines[2]);
        JsonElement transitionRoot = transitionRow.RootElement;
        Assert.Equal("transition", transitionRoot.GetProperty("type").GetString());
        Assert.False(transitionRoot.TryGetProperty("transition", out _));
        Assert.Equal(JsonValueKind.String,
            transitionRoot.GetProperty("terminalReason").ValueKind);
        JsonElement ownship = transitionRoot.GetProperty("observation")
            .GetProperty("ownship");
        Assert.True(ownship.TryGetProperty("speedMps", out _));
        Assert.False(ownship.TryGetProperty("isFinite", out _));
        JsonElement contact = transitionRoot.GetProperty("observation")
            .GetProperty("contact");
        Assert.False(contact.TryGetProperty("massKg", out _));
        JsonElement actionRow = transitionRoot.GetProperty("action");
        Assert.True(actionRow.TryGetProperty("maneuverSelected", out _));
        Assert.True(actionRow.TryGetProperty("maneuverApplied", out _));
        Assert.True(actionRow.TryGetProperty("fireIntentEvaluated", out _));
        Assert.True(actionRow.TryGetProperty("fireIntentConsumed", out _));
        Assert.True(actionRow.TryGetProperty("fireAuthorized", out _));
        Assert.False(actionRow.TryGetProperty("trigger", out _));
    }

    [Fact]
    public void ContactSideOfTrainingObservationCannotCarryAircraftTruth() {
        Assert.Equal(typeof(ActorObservation),
            typeof(CombatPolicyObservation).GetProperty(
                nameof(CombatPolicyObservation.Contact))!.PropertyType);
        Assert.Null(typeof(ActorObservation).GetProperty(nameof(AircraftState.Mass)));
        Assert.Null(typeof(ActorObservation).GetProperty(nameof(AircraftState.BodyAttitude)));
        Assert.Null(typeof(ActorObservation).GetProperty(nameof(AircraftState.BodyRates)));
    }

    [Fact]
    public void RewardEnvelopeRequiresBothPhysicalGeometryAndWeaponAuthority() {
        CombatPolicyObservation authorized = Observation(0);

        Assert.True(CombatRewardModel.InAuthorizedFiringEnvelope(authorized));
        Assert.False(CombatRewardModel.InAuthorizedFiringEnvelope(
            authorized with { WeaponsAuthorized = false }));
    }

    [Fact]
    public void FirstPassGateIsPartOfTheContiguousTransitionAuthority() {
        CombatTrainingScenario scenario =
            CombatTrainingScenarioFactory.SeededOffsetMerge(7UL);
        CombatEpisode episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0,
            scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 15.0);

        Assert.Contains(episode.Transitions,
            transition => !transition.Observation.WeaponsAuthorized
                && transition.NextObservation.WeaponsAuthorized);
        for (int index = 1; index < episode.Transitions.Count; index++)
            Assert.Equal(episode.Transitions[index - 1].NextObservation,
                episode.Transitions[index].Observation);
    }

    [Fact]
    public void TerminalGunTickStillAdvancesBothActorsAndLabelsCurrentAction() {
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = FlightModel.Su27SPublicDataSurrogate;
        var scenario = new CombatTrainingScenario(
            "close-hot-merge",
            Seed: 42UL,
            ReferenceStart: new AircraftState(
                new Vec3D(0.0, 3000.0, 0.0),
                280.0, 0.0, 0.0, 0.0, referenceAir.MassKg),
            LearningFighterStart: new AircraftState(
                new Vec3D(0.0, 3000.0, 300.0),
                280.0, 0.0, System.Math.PI, 0.0, learningAir.MassKg),
            FirstPassSafe: false);

        CombatEpisode episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0,
            scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 3.0);

        Assert.NotEqual(CombatTerminalReason.TimeLimit, episode.TerminalReason);
        CombatTransition terminal = episode.Transitions[^1];
        Assert.True(terminal.Terminal);
        Assert.True(terminal.Action.ManeuverApplied);
        Assert.True(terminal.Action.FireIntentEvaluated);
        Assert.True(terminal.Action.FireIntentConsumed);
        Assert.True(terminal.Action.FireAuthorized);
        Assert.NotEqual(terminal.Observation.Ownship.Position,
            terminal.NextObservation.Ownship.Position);
        Assert.NotEqual(terminal.Observation.Contact.Position,
            terminal.NextObservation.Contact.Position);
    }

    [Fact]
    public void HeldLookaheadCommandIsAppliedWithoutBeingRelabeledAsASelection() {
        CombatTrainingScenario scenario =
            CombatTrainingScenarioFactory.SeededOffsetMerge(99UL);
        CombatEpisode episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0,
            scenario,
            referenceSkill: PilotSkill.Ace,
            behaviorSkill: PilotSkill.Ace,
            maximumSeconds: 0.15);

        Assert.True(episode.Transitions[0].Action.ManeuverSelected);
        Assert.Contains(episode.Transitions,
            transition => !transition.Action.ManeuverSelected
                && transition.Action.ManeuverApplied);
        Assert.All(episode.Transitions, transition => {
            Assert.True(transition.Action.ManeuverApplied);
            if (transition.Action.FireAuthorized)
                Assert.True(transition.Action.FireIntentConsumed);
            if (transition.Action.FireIntentConsumed)
                Assert.True(transition.Action.FireIntentEvaluated);
        });
    }

    [Fact]
    public void BatchTransitionBudgetAndCancellationAreEnforcedBeforeWork() {
        var oversized = new CombatTrainingBatchConfig(
            EpisodeCount: 100,
            MaximumSecondsPerEpisode: 25.0);
        Assert.Throws<ArgumentOutOfRangeException>(
            () => SeededCombatBatchRunner.Run(oversized));

        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var small = new CombatTrainingBatchConfig(
            EpisodeCount: 1,
            MaximumSecondsPerEpisode: 0.05);
        Assert.Throws<OperationCanceledException>(
            () => SeededCombatBatchRunner.Run(small, cancellation.Token));
        CombatTrainingScenario scenario =
            CombatTrainingScenarioFactory.SeededOffsetMerge(1UL);
        Assert.Throws<OperationCanceledException>(() =>
            SeededCombatBatchRunner.RunEpisode(
                0, scenario, PilotSkill.Competent, PilotSkill.Competent,
                maximumSeconds: 0.05,
                cancellationToken: cancellation.Token));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            SeededCombatBatchRunner.RunEpisode(
                0, scenario, PilotSkill.Competent, PilotSkill.Competent,
                maximumSeconds:
                    SeededCombatBatchRunner.MaximumSupportedEpisodeSeconds + 1.0));
        CombatTrainingScenario unsupportedStart = scenario with {
            ReferenceStart = scenario.ReferenceStart with {
                Position = scenario.ReferenceStart.Position with { Y = 100.0 }
            }
        };
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            SeededCombatBatchRunner.RunEpisode(
                0, unsupportedStart,
                PilotSkill.Competent, PilotSkill.Competent,
                maximumSeconds: 0.05));
    }

    [Fact]
    public void DelayedMutualKillSettlesInFlightRoundsBeforeTheTerminalTransition() {
        // Reciprocal head-on guns pass with both sides firing. The first splash happens while the
        // destroyed side's earlier rounds are still airborne; the runner must settle those rounds
        // (exactly as the production session does) before freezing the terminal transition, so the
        // episode reports the authoritative MUTUAL destruction and both destruction rewards.
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams learningAir = FlightModel.Su27SPublicDataSurrogate;
        var scenario = new CombatTrainingScenario(
            "delayed-mutual-kill",
            Seed: 7UL,
            ReferenceStart: new AircraftState(
                new Vec3D(0.0, 3000.0, 0.0),
                280.0, 0.0, 0.0, 0.0, referenceAir.MassKg),
            LearningFighterStart: new AircraftState(
                new Vec3D(0.0, 3000.0, 300.0),
                280.0, 0.0, System.Math.PI, 0.0, learningAir.MassKg),
            FirstPassSafe: false);

        CombatEpisode episode = SeededCombatBatchRunner.RunEpisode(
            episodeIndex: 0,
            scenario,
            referenceSkill: PilotSkill.Competent,
            behaviorSkill: PilotSkill.Competent,
            maximumSeconds: 3.0);

        Assert.Equal(CombatTerminalReason.MutualDestruction, episode.TerminalReason);
        CombatTransition terminal = episode.Transitions[^1];
        Assert.True(terminal.Terminal);
        Assert.True(terminal.RewardComponents.OpponentDestroyed);
        Assert.True(terminal.RewardComponents.OwnshipDestroyed);
        // Both kill totals are complete: every hit, including the delayed rounds that landed
        // after the first destruction, is accounted for across the episode.
        Assert.Equal(3, episode.Transitions.Sum(
            transition => transition.RewardComponents.HitsScored));
        Assert.Equal(3, episode.Transitions.Sum(
            transition => transition.RewardComponents.HitsReceived));
        Assert.All(episode.Transitions.SkipLast(1), transition => {
            Assert.False(transition.Terminal);
            Assert.False(transition.RewardComponents.OpponentDestroyed);
            Assert.False(transition.RewardComponents.OwnshipDestroyed);
        });
    }

    [Fact]
    public void SeededThreatEngagementsMeasureOpponentFireDamageAndSkillSeparation() {
        IReadOnlyList<SeededSkillTierMeasurement> first =
            SeededCombatBatchRunner.MeasureSkillTiers(
                new SeededSkillTierEvaluationConfig(
                    FirstSeed: 0xB4AD_1700UL,
                    EngagementsPerTier: 4,
                    MaximumSecondsPerEngagement: 25.0,
                    PlayerSkill: PilotSkill.Competent));
        IReadOnlyList<SeededSkillTierMeasurement> second =
            SeededCombatBatchRunner.MeasureSkillTiers(
                new SeededSkillTierEvaluationConfig(
                    FirstSeed: 0xB4AD_1700UL,
                    EngagementsPerTier: 4,
                    MaximumSecondsPerEngagement: 25.0,
                    PlayerSkill: PilotSkill.Competent));

        Assert.Equal(first, second);
        Assert.Equal(
            new[] {
                PilotSkill.Novice,
                PilotSkill.Competent,
                PilotSkill.Veteran,
                PilotSkill.Ace
            },
            first.Select(measurement => measurement.Skill));
        SeededSkillTierMeasurement novice = first[0];
        SeededSkillTierMeasurement ace = first[3];
        string report = string.Join(
            System.Environment.NewLine,
            first.Select(measurement => FormattableString.Invariant(
                $"{measurement.Skill}: rounds/eng={measurement.BanditRoundsPerEngagement:F2}, rear-quarter/eng={measurement.PlayerRearQuarterSecondsPerEngagement:F2}s, player-damage-hits={measurement.PlayerDamageHits}, fire-engagements={measurement.EngagementsWithBanditFire}/{measurement.Engagements}, damage-engagements={measurement.EngagementsWithPlayerDamage}/{measurement.Engagements}")));

        foreach (SeededSkillTierMeasurement capable in first.Skip(1)) {
            Assert.True(
                capable.EngagementsWithBanditFire >= 2,
                $"{capable.Skill} must fire in a meaningful fraction of engagements."
                + $"{System.Environment.NewLine}{report}");
            Assert.True(
                capable.PlayerDamageHits > 0,
                $"zero-damage {capable.Skill} batches are the production bug."
                + $"{System.Environment.NewLine}{report}");
        }
        Assert.True(
            ace.PlayerRearQuarterSecondsPerEngagement
                < novice.PlayerRearQuarterSecondsPerEngagement,
            $"Ace must deny its rear quarter more effectively than Novice.{System.Environment.NewLine}{report}");
        Assert.NotEqual(
            novice.BanditRoundsFired,
            ace.BanditRoundsFired);
        Assert.NotEqual(
            novice.PlayerDamageHits,
            ace.PlayerDamageHits);
        Assert.NotEqual(novice, ace);
    }
}

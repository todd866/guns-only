using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

public class PlannerTeacherDatasetTests {
    [Fact]
    public void ExportIsDeterministicVersionedFiniteAndKeepsAllNineLabels() {
        var config = new CombatTrainingBatchConfig(
            FirstSeed: 0xD157_1110UL,
            EpisodeCount: 2,
            MaximumSecondsPerEpisode: 0.25,
            ReferenceSkill: PilotSkill.Veteran,
            BehaviorSkill: PilotSkill.Ace);
        PlannerTeacherBatch first =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);
        PlannerTeacherBatch second =
            SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);

        string firstJson = PlannerTeacherJsonLines.Serialize(first);
        string secondJson = PlannerTeacherJsonLines.Serialize(second);

        Assert.Equal(firstJson, secondJson);
        Assert.DoesNotContain("NaN", firstJson, StringComparison.Ordinal);
        Assert.DoesNotContain("Infinity", firstJson, StringComparison.Ordinal);
        Assert.DoesNotContain("commandedPitch", firstJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("commandedAlpha", firstJson, StringComparison.OrdinalIgnoreCase);

        string[] lines = firstJson.Split(
            '\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(1 + first.Episodes.Count + first.SampleCount, lines.Length);

        using JsonDocument schemaDocument = JsonDocument.Parse(lines[0]);
        JsonElement schema = schemaDocument.RootElement;
        Assert.Equal("schema", schema.GetProperty("type").GetString());
        Assert.Equal(
            PlannerTeacherJsonLines.Schema,
            schema.GetProperty("schema").GetString());
        Assert.Equal(
            PlannerDistillationFeatures.Schema,
            schema.GetProperty("featureSchema").GetString());
        Assert.Equal(
            PlannerTeacherJsonLines.CandidateSchema,
            schema.GetProperty("candidateSchema").GetString());
        Assert.Equal(
            PlannerTeacherJsonLines.ScoreSchema,
            schema.GetProperty("scoreSchema").GetString());
        Assert.Equal(
            BanditDecisionTrace.CandidateCapacity,
            schema.GetProperty("candidateCount").GetInt32());
        Assert.Equal(
            PlannerDistillationFeatures.FeatureCount,
            schema.GetProperty("featureCount").GetInt32());
        Assert.Equal(
            PlannerDistillationFeatures.FeatureCount,
            schema.GetProperty("featureNames").GetArrayLength());
        Assert.Equal(
            "synchronous-full",
            schema.GetProperty("teacherExecution").GetString());
        Assert.Equal(
            PlannerTeacherJsonLines.Su27AirframeSchema,
            schema.GetProperty("behaviorAirframeSchema").GetString());
        Assert.Equal(
            PlannerTeacherJsonLines.StandardAtmosphereSchema,
            schema.GetProperty("atmosphereSchema").GetString());
        Assert.True(schema.GetProperty("flatTerrain").GetBoolean());
        Assert.True(schema.GetProperty("calmWind").GetBoolean());
        Assert.Equal(
            first.SampleCount,
            schema.GetProperty("sampleCount").GetInt32());

        string sampleLine = lines.First(line =>
            JsonDocument.Parse(line).RootElement
                .GetProperty("type").GetString() == "sample");
        using JsonDocument sampleDocument = JsonDocument.Parse(sampleLine);
        JsonElement sample = sampleDocument.RootElement;
        JsonElement features = sample.GetProperty("features");
        JsonElement candidates = sample.GetProperty("candidates");
        JsonElement safety = sample.GetProperty("safety");
        int selectedIndex = sample.GetProperty("selectedIndex").GetInt32();

        Assert.InRange(
            sample.GetProperty("enginePowerFraction").GetDouble(),
            0.0,
            1.65);
        Assert.Equal(
            PlannerDistillationFeatures.FeatureCount,
            features.GetProperty("values").GetArrayLength());
        Assert.True(features.GetProperty("allFinite").GetBoolean());
        Assert.Equal(
            BanditDecisionTrace.CandidateCapacity,
            candidates.GetArrayLength());
        Assert.True(safety.GetProperty("teacherEligible").GetBoolean());
        Assert.True(safety.GetProperty("snapshotAligned").GetBoolean());
        Assert.True(safety.GetProperty("fullTeacher").GetBoolean());
        Assert.True(safety.GetProperty("candidateTableComplete").GetBoolean());
        Assert.Equal(
            1 << selectedIndex,
            sample.GetProperty("selectedMask").GetInt32());
        Assert.Equal(
            0.0,
            candidates[selectedIndex].GetProperty(
                "relativeAdvantage").GetDouble(),
            precision: 12);
        Assert.True(candidates[selectedIndex].GetProperty("selected").GetBoolean());
        Assert.True(candidates[selectedIndex].GetProperty("available").GetBoolean());
        Assert.True(candidates[selectedIndex].GetProperty("finiteScore").GetBoolean());
        Assert.Equal(
            sample.GetProperty("availabilityMask").GetInt32(),
            sample.GetProperty("scoreLossMask").GetInt32());
    }

    [Fact]
    public void FeatureProjectionIsBodyRelativeAndExcludesWeaponState() {
        PlannerTeacherSample sample = SeededCombatBatchRunner
            .RunWithPlannerTeacherSamples(new CombatTrainingBatchConfig(
                FirstSeed: 0xB0D1_0001UL,
                EpisodeCount: 1,
                MaximumSecondsPerEpisode: 0.05,
                BehaviorSkill: PilotSkill.Ace))
            .Episodes[0]
            .Samples[0];
        double[] baseline = PlannerDistillationFeatures.Project(
            sample, out PlannerFeatureQuality baselineQuality);

        var offset = new Vec3D(10_000.0, 0.0, -8_000.0);
        AircraftState translatedOwnship = sample.PlanningObservation.Ownship with {
            Position = sample.PlanningObservation.Ownship.Position + offset
        };
        ActorObservation translatedContact = sample.PlanningObservation.Contact with {
            Position = sample.PlanningObservation.Contact.Position + offset
        };
        CombatPolicyObservation translated =
            CombatPolicyObservation.Capture(
                sample.PlanningObservation.Tick,
                sample.PlanningObservation.ElapsedSeconds,
                translatedOwnship,
                translatedContact,
                ownshipAmmoRemaining: 0,
                weaponsAuthorized: false);
        var projected = new double[PlannerDistillationFeatures.FeatureCount];
        PlannerDistillationFeatures.Write(
            translated,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            sample.DecisionTrace,
            sample.EnginePowerFraction,
            projected,
            out PlannerFeatureQuality translatedQuality);

        Assert.Equal(baselineQuality, translatedQuality);
        Assert.Equal(baseline.Length, projected.Length);
        for (int index = 0; index < baseline.Length; index++)
            Assert.Equal(baseline[index], projected[index], precision: 12);
    }

    [Fact]
    public void FeatureWriterRequiresThePinnedDestinationSize() {
        PlannerTeacherSample sample = SeededCombatBatchRunner
            .RunWithPlannerTeacherSamples(new CombatTrainingBatchConfig(
                EpisodeCount: 1,
                MaximumSecondsPerEpisode: 0.05,
                BehaviorSkill: PilotSkill.Ace))
            .Episodes[0]
            .Samples[0];
        var undersized = new double[PlannerDistillationFeatures.FeatureCount - 1];

        Assert.Throws<ArgumentException>(() =>
            PlannerDistillationFeatures.Write(
                sample.PlanningObservation,
                sample.PolicyMemoryBefore,
                sample.BehaviorSkill,
                sample.DecisionTrace,
                sample.EnginePowerFraction,
                undersized,
                out _));
    }
}

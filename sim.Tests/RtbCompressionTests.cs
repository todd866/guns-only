using System.Diagnostics;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Web;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

[Collection("snapshot-projection-statics")]
public sealed class RtbCompressionTests(ITestOutputHelper output) {
    static SimulationSession CompletedRtb(int seed = 0, bool completeCombat = true) {
        var random = new Random(seed);
        var source = Beats.ModernVisualMerge();
        var beat = source with {
            Player = source.Player with { Speed = 220 + random.NextDouble() * 10, Bank = 0, Gamma = 0 },
            UsesNeutralMergeBandit = false, UsesReactiveBandit = false,
            VisualMergeEvaluation = null,
            Combat = source.CombatRules with { OpponentHitsToDefeat = 1 },
            ContinuousCombat = source.ContinuousCombat! with {
                MaximumEngagements = 1, MaximumFormationSize = 1, EscalatingWaves = false,
            },
        };
        var s = new SimulationSession(serviceLifeCaptureEnabled: false);
        s.StartBeat(() => beat);
        s.Begin();
        if (completeCombat) {
            GunKill gun = s.PlayerGun;
            long id = gun.SelectedTargetId;
            var shooter = new AircraftState(new Vec3D(0, 5000, 0), 0, 0, 0, 0, beat.PlayerAir.MassKg);
            var target = shooter with { Position = new Vec3D(0, 4999.9, 100) };
            var targets = new[] { new GunTarget(id, target) };
            gun.Step(true, shooter, id, targets, 0);
            for (int i = 0; i < AircraftSim.TickHz && gun.DamageFor(id).HitCount == 0; i++)
                gun.Step(false, shooter, id, targets, SimulationSession.FixedDeltaSeconds);
            Assert.Equal(1, gun.DamageFor(id).HitCount);
        } else Assert.True(s.TryRequestReturnToBase());
        for (int i = 0; i < 10 * AircraftSim.TickHz && !s.PlayerRtbActive; i++) s.StepFixed();
        Assert.Equal(completeCombat, s.FiniteCombatComplete);
        Assert.True(s.PlayerRtbActive);
        var runway = s.ConventionalRunwayRecovery!.Runway;
        s.Player.AdoptExternalKinematics(new AircraftState(
            runway.Threshold - runway.Forward * 30_000 + new Vec3D(0, 3000, 0),
            220 + random.NextDouble() * 10, 0, runway.HeadingRad, 0, s.Player.State.Mass));
        s.StepFixed(120); // publish the real approach cue; drain rounds and the RTB edge
        AlignWithCue(s);
        return s;
    }

    static void AlignWithCue(SimulationSession s) {
        var cue = s.ApproachGuidancePlan.Gates[0];
        var own = s.Player.State;
        double chi = Math.Atan2(cue.EastM - own.Position.X, cue.NorthM - own.Position.Z);
        s.Player.AdoptExternalKinematics(new AircraftState(own.Position, own.Speed, 0, chi, 0, own.Mass));
    }

    static void Engage(SimulationSession s) {
        s.SetTimeCompressionEnabled(true);
        Assert.True(s.RtbAutopilotActive);
        int factor = s.Advance(0, 8);
        Assert.True(factor == 8, $"Expected 8x: {s.TimeCompressionInhibitReason}, cue={s.ApproachGuidancePlan.NextLabel}");
    }

    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(17)]
    public void SameSeedAtOneAndEightTimesHasIdenticalPhysicsAtEqualTickCount(int seed) {
        var fast = CompletedRtb(seed);
        var normal = CompletedRtb(seed);
        Engage(fast);
        Engage(normal); // Same AP and inputs; only the host's tick budget differs.
        long start = fast.Tick;
        for (int frame = 0; frame < 30; frame++) fast.Advance(1.0 / 60, 8);
        while (normal.Tick < fast.Tick) normal.Advance(SimulationSession.FixedDeltaSeconds, 1);
        Assert.True(fast.Tick - start > 60, "The comparison must actually execute compressed ticks");
        Assert.Equal(normal.Tick, fast.Tick);
        Assert.Equal(normal.Player.State, fast.Player.State);
        Assert.Equal(normal.Bandit.State, fast.Bandit.State);
        Assert.Equal(normal.PlayerFuel.FuelLb, fast.PlayerFuel.FuelLb);
        Assert.Equal(normal.PlayerSystems.GearHandle, fast.PlayerSystems.GearHandle);
        Assert.Equal(normal.RecentEvents, fast.RecentEvents);
        Assert.Equal(normal.TimeSeconds, fast.TimeSeconds);
    }

    [Theory]
    [InlineData(GKey.PullUp)] [InlineData(GKey.PushDown)]
    [InlineData(GKey.RollLeft)] [InlineData(GKey.RollRight)]
    [InlineData(GKey.GearToggle)] [InlineData(GKey.FlapDown)] [InlineData(GKey.FlapUp)]
    public void ControlEdgesHandBackImmediatelyEvenWhenReleasedBetweenTicks(GKey key) {
        var s = CompletedRtb(); Engage(s);
        s.FeedKey(key, true); s.FeedKey(key, false);
        Assert.Equal(1, s.TimeCompressionFactor);
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        long before = s.Tick;
        Assert.Equal(1, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
        Assert.Equal(before + 1, s.Tick);
    }

    [Theory]
    [InlineData(true)] [InlineData(false)]
    public void AnalogPitchAndRollBeyondDeadbandHandBack(bool pitch) {
        var s = CompletedRtb(); Engage(s);
        if (pitch) s.SetAnalogPitchControl(.09); else s.SetAnalogRollControl(.09);
        Assert.Equal(1, s.TimeCompressionFactor);
        Assert.Equal(1, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
        s.StepFixed(10);
        Assert.Equal(1, s.Advance(0, 8)); // held intent survives the immediate edge inhibit
    }

    [Fact]
    public void AnalogJitterInsideDeadbandDoesNotHandBack() {
        var s = CompletedRtb(); Engage(s);
        s.SetAnalogPitchControl(.04); s.SetAnalogRollControl(.04);
        Assert.Equal(8, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
    }

    [Theory]
    [InlineData(true)] [InlineData(false)]
    public void EngageTransfersOldStickAndScriptedCommandToAutopilot(bool keyboard) {
        var s = CompletedRtb();
        Assert.False(s.RtbAutopilotActive);
        Assert.Equal(1, s.Advance(0, 8));
        s.SetAnalogPitchControl(.3);
        s.Controls.ScriptedPilotOverride = new PilotCommand(2, .3, .5, 0);
        s.StepFixed(); // Leave a filtered, non-trim command in the detent layer.
        if (keyboard) {
            s.FeedKey(GKey.TimeCompressionToggle, true);
            s.FeedKey(GKey.TimeCompressionToggle, false);
        } else s.SetTimeCompressionEnabled(true);
        Assert.True(s.RtbAutopilotActive);
        Assert.Null(s.Controls.ScriptedPilotOverride);
        Assert.Equal(8, s.Advance(0, 8));
        s.StepFixed(120);
        Assert.True(s.RtbAutopilotActive);
        Assert.Equal(8, s.TimeCompressionFactor);
    }

    [Fact]
    public void StickDisengagesUntilOneKeyPressAndReturnsPlayerControlAtOneTimes() {
        var s = CompletedRtb(); Engage(s);
        s.SetAnalogRollControl(.5);
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        long tick = s.Tick;
        Assert.Equal(1, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
        Assert.Equal(tick + 1, s.Tick);
        Assert.True(s.Player.LastAppliedCommand.RollControl > .1);
        s.SetAnalogRollControl(0);
        s.StepFixed(120);
        Assert.Equal(1, s.Advance(0, 8));
        s.FeedKey(GKey.TimeCompressionToggle, true);
        Assert.True(s.RtbAutopilotActive);
        Assert.Equal(8, s.Advance(0, 8));
    }

    [Fact]
    public void HeldKeyAcrossEngagementHandsBackOnNextTick() {
        var s = CompletedRtb();
        s.FeedKey(GKey.RollRight, true);
        s.FeedKey(GKey.TimeCompressionToggle, true);
        Assert.True(s.RtbAutopilotActive); // Y is an engagement edge, never a hidden inhibit.
        s.StepFixed(); // Holding the stick still expresses pilot ownership.
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        Assert.Equal(TimeCompressionInhibitReason.ControlInput, s.TimeCompressionInhibitReason);
    }

    [Fact]
    public void AutoGcasLeadDropsBothOwnersBeforeTheNextTick() {
        var s = CompletedRtb(); Engage(s);
        var state = s.AutoGcas with { Prediction = s.AutoGcas.Prediction with {
            Valid = true, TimeAvailableToAvoidGroundImpactSeconds = 10
        } };
        typeof(SimulationSession).GetField("_autoGcasState",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(s, state);
        Assert.Equal(1, s.Advance(0, 8));
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        Assert.Equal(TimeCompressionInhibitReason.AutoGcas, s.TimeCompressionInhibitReason);
        s.SetTimeCompressionEnabled(true);
        Assert.False(s.RtbAutopilotActive); // A retry cannot override an uncleared boundary.
    }

    [Fact]
    public void AutopilotStateProjectsThroughColdAndHotSnapshotsAndResets() {
        var s = CompletedRtb(); Engage(s);
        using var json = JsonDocument.Parse(SnapshotProjection.BuildState(s, Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.True(json.RootElement.GetProperty("rtb_autopilot_active").GetBoolean());
        using var layout = JsonDocument.Parse(SnapshotHotFrame.LayoutJson());
        var slot = layout.RootElement.GetProperty("blocks").EnumerateArray()
            .SelectMany(b => b.GetProperty("slots").EnumerateArray())
            .Single(x => x.GetProperty("name").GetString() == "rtb_autopilot_active");
        var frame = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(frame, s, 0, 0, false);
        Assert.Equal(1, frame[slot.GetProperty("index").GetInt32()]);
        s.SetAnalogPitchControl(.2);
        SnapshotHotFrame.Fill(frame, s, 0, 0, false);
        Assert.Equal(0, frame[slot.GetProperty("index").GetInt32()]);
        s.Restart();
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
    }

    [Fact]
    public void ToggleIsEdgeTriggeredAndDiscardsFastTimeCredit() {
        var s = CompletedRtb(); Engage(s);
        s.FeedKey(GKey.TimeCompressionToggle, true);
        s.FeedKey(GKey.TimeCompressionToggle, true);
        Assert.False(s.TimeCompressionPilotEnabled);
        Assert.Equal(1, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
        s.FeedKey(GKey.TimeCompressionToggle, false);
        s.FeedKey(GKey.TimeCompressionToggle, true);
        Assert.True(s.TimeCompressionPilotEnabled);
    }

    [Theory]
    [InlineData(5555)] [InlineData(3000)]
    public void ThreeNauticalMilesFromThresholdDropsBeforeAnotherFastTick(double distance) {
        var s = CompletedRtb(); Engage(s);
        var runway = s.ConventionalRunwayRecovery!.Runway;
        var own = s.Player.State;
        s.Player.AdoptExternalKinematics(own with {
            Position = runway.Threshold - runway.Forward * distance + new Vec3D(0, 1000, 0)
        });
        long tick = s.Tick;
        Assert.Equal(1, s.Advance(SimulationSession.FixedDeltaSeconds, 8));
        Assert.Equal(tick + 1, s.Tick);
        Assert.Equal(TimeCompressionInhibitReason.RecoveryFinal, s.TimeCompressionInhibitReason);
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        // Transit AP leaves landing configuration to the player after hand-back.
        Assert.Equal(LandingGearHandle.Up, s.PlayerSystems.GearHandle);
    }

    [Fact]
    public void InboundRoundsFromDestroyedShooterStillBlockCompression() {
        var s = CompletedRtb(); Engage(s);
        var shooter = s.Player.State with { Position = s.Player.State.Position + new Vec3D(0, 0, -500) };
        s.OpponentGun.Step(true, shooter, s.Player.State, 0);
        Assert.NotEmpty(s.OpponentGun.RoundsInFlight);
        Assert.Equal(1, s.Advance(0, 8));
        Assert.Equal(TimeCompressionInhibitReason.GunSolution, s.TimeCompressionInhibitReason);
    }

    [Theory]
    [InlineData(true)] [InlineData(false)]
    public void AutopilotAcquiresRecoveryRouteFromMisalignmentOrBank(bool bank) {
        var s = CompletedRtb(); Engage(s);
        var own = s.Player.State;
        s.Player.AdoptExternalKinematics(new AircraftState(own.Position, own.Speed, 0,
            own.Chi + (bank ? 0 : .2), bank ? .2 : 0, own.Mass));
        Assert.Equal(8, s.Advance(0, 8));
        Assert.True(s.RtbAutopilotActive);
        s.StepFixed();
        Assert.NotEqual(new PilotCommand(1, 0, .85, 0), s.Player.LastAppliedCommand);
    }

    [Fact]
    public void EndSortieBanksCombatWithoutLandingAndResets() {
        var s = CompletedRtb();
        s.SetPaused(true);
        Assert.True(s.CanEndSortie);
        Assert.True(s.TryEndSortie());
        Assert.Equal(SimulationSession.LifecycleState.Finished, s.Lifecycle);
        Assert.Equal(SortieOutcome.Victory, s.Outcome);
        Assert.True(s.SortieEndedEarly);
        Assert.True(s.FiniteCombatComplete);
        Assert.Equal(SortieOutcome.Victory, Assert.Single(s.EngagementReports).Outcome);
        Assert.False(s.ConventionalRtbRecoveryCompleted);
        Assert.False(s.RunwayTouchdown.Contact);
        Assert.False(s.TryEndSortie());
        long tick = s.Tick; s.Advance(1, 8); Assert.Equal(tick, s.Tick);
        using var json = JsonDocument.Parse(SnapshotProjection.BuildState(s, Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.True(json.RootElement.GetProperty("sortie_ended_early").GetBoolean());
        Assert.False(json.RootElement.GetProperty("runway_recovery_complete").GetBoolean());
        Assert.Single(s.RecentEvents, e => e.Type == SessionEventType.SortieFinished);
        s.Restart();
        Assert.False(s.SortieEndedEarly); Assert.False(s.CanEndSortie);
    }

    [Fact]
    public void EndCannotSkipUnfinishedCombatOrGrantRecoveryForRtbChoice() {
        var s = new SimulationSession();
        s.StartBeat(() => Beats.ModernVisualMerge() with {
            ContinuousCombat = Beats.ModernVisualMerge().ContinuousCombat! with {
                EscalatingWaves = false,
            },
        });
        s.Begin();
        Assert.False(s.TryEndSortie());
        Assert.True(s.TryRequestReturnToBase());
        Assert.False(s.TryEndSortie());
        Assert.False(s.ConventionalRtbRecoveryCompleted);
    }

    [Fact]
    public void QuietFrameRunsExactlyEightTimesTheOrdinaryTicks() {
        var s = CompletedRtb(); Engage(s);
        long before = s.Tick;
        Assert.Equal(8, s.Advance(1.0 / 60, 8));
        Assert.Equal(before + 16, s.Tick);
        Assert.Equal(8, s.TimeCompressionFactor);
    }

    [Fact]
    public void CrossingFinalBoundaryInsideBatchDiscardsRemainingFastTicks() {
        var s = CompletedRtb();
        var runway = s.ConventionalRunwayRecovery!.Runway;
        var own = s.Player.State;
        s.Player.AdoptExternalKinematics(new AircraftState(
            runway.Threshold - runway.Forward * (SimulationSession.RtbCompressionFinalRangeM + 3)
                + new Vec3D(0, 1000, 0), 220, 0, runway.HeadingRad, 0, own.Mass));
        // This fixture puts the active guidance gate straight ahead so the only boundary is range.
        var plan = s.ApproachGuidancePlan with { Gates = new[] {
            new WorldApproachGate("test", "test", runway.Threshold.X, runway.Threshold.Z,
                1000, 500, 1000, 400, 5559, 20, ApproachPatternLeg.PatternEntry, false, true)
        } };
        typeof(SimulationSession).GetField("_approachGuidance",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(s, plan);
        Engage(s);
        long before = s.Tick;
        s.Advance(SimulationSession.FixedDeltaSeconds, 8);
        Assert.InRange(s.Tick - before, 2, 3);
        Assert.Equal(1, s.TimeCompressionFactor);
        long after = s.Tick;
        s.Advance(SimulationSession.FixedDeltaSeconds, 8);
        Assert.Equal(after + 1, s.Tick);
    }

    [Theory]
    [InlineData(9999, 1)] [InlineData(10001, 8)]
    public void PilotSelectedRtbHonoursTenKilometreThreatBoundary(double range, int factor) {
        var s = CompletedRtb(0, completeCombat: false);
        Engage(s);
        var own = s.Player.State;
        s.Player.AdoptExternalKinematics(new AircraftState(
            s.Bandit.State.Position + new Vec3D(0, 0, -range),
            own.Speed, 0, own.Chi, 0, own.Mass));
        AlignWithCue(s);
        Assert.Equal(factor, s.Advance(0, 8));
        if (factor == 1) Assert.Equal(TimeCompressionInhibitReason.ContactThreat, s.TimeCompressionInhibitReason);
    }

    [Fact]
    public void ClearingThreatRequiresOneExplicitReengagement() {
        var s = CompletedRtb(0, completeCombat: false); Engage(s);
        var quiet = s.Player.State;
        s.Player.AdoptExternalKinematics(quiet with {
            Position = s.Bandit.State.Position + new Vec3D(0, 0, -9000)
        });
        Assert.Equal(1, s.Advance(0, 8));
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        s.Player.AdoptExternalKinematics(quiet);
        Assert.Equal(1, s.Advance(0, 8));
        s.FeedKey(GKey.TimeCompressionToggle, true);
        Assert.True(s.RtbAutopilotActive);
        Assert.Equal(8, s.Advance(0, 8));
    }

    [Fact]
    public void EarlyEndInvalidatesHotSnapshotAndPublishesAuthoritativeAvailability() {
        var s = CompletedRtb();
        var frame = new double[SnapshotHotFrame.SlotCount];
        SnapshotHotFrame.Fill(frame, s, 0, 0, false);
        double before = frame[SnapshotHotFrame.ColdVersionIndex];
        using var active = JsonDocument.Parse(SnapshotProjection.BuildState(s, Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.True(active.RootElement.GetProperty("can_end_sortie").GetBoolean());
        Assert.True(s.TryEndSortie());
        SnapshotHotFrame.Fill(frame, s, 0, 0, false);
        Assert.True(frame[SnapshotHotFrame.ColdVersionIndex] > before);
        using var ended = JsonDocument.Parse(SnapshotProjection.BuildState(s, Carrier.DeckConfiguration.Angled, 0, 0, false, null));
        Assert.False(ended.RootElement.GetProperty("can_end_sortie").GetBoolean());
    }

    [Fact]
    public void FinalGuidanceBlocksEvenOutsideThreeNauticalMiles() {
        var s = CompletedRtb(); Engage(s);
        var plan = s.ApproachGuidancePlan with { ActivePatternLeg = ApproachPatternLeg.Final };
        typeof(SimulationSession).GetField("_approachGuidance",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.SetValue(s, plan);
        Assert.Equal(1, s.Advance(0, 8));
        Assert.Equal(TimeCompressionInhibitReason.RecoveryFinal, s.TimeCompressionInhibitReason);
        Assert.False(s.RtbAutopilotActive);
        Assert.False(s.TimeCompressionPilotEnabled);
        // Transit AP leaves landing configuration to the player after hand-back.
        Assert.Equal(LandingGearHandle.Up, s.PlayerSystems.GearHandle);
    }

    [Fact]
    public void PausedSessionRunsNoTicksAndRtbRequestIsNotCombatCompletion() {
        var s = CompletedRtb(0, completeCombat: false); Engage(s);
        Assert.False(s.FiniteCombatComplete); Assert.False(s.TryEndSortie());
        s.SetPaused(true);
        long before = s.Tick;
        Assert.Equal(1, s.Advance(.1, 8)); Assert.Equal(before, s.Tick);
    }

    [Fact]
    public void OutboundFightCannotCompress() {
        var s = new SimulationSession(7); s.Begin();
        Assert.True(s.TimeCompressionAvailable);
        Assert.Equal(1, s.Advance(0, 8));
    }

    [Fact]
    public void HostCanLimitEightTimesToFour() {
        var s = CompletedRtb(); Engage(s);
        Assert.Equal(4, s.Advance(SimulationSession.FixedDeltaSeconds, 4));
        Assert.Equal(4, s.TimeCompressionFactor);
    }

    [Fact]
    public void EightTimesNativeTickCostIsMeasuredWithoutRendererClaims() {
        var s = CompletedRtb();
        s.StepFixed(120); AlignWithCue(s); Engage(s);
        var costs = new List<double>();
        long ticks = s.Tick;
        for (int frame = 0; frame < 120; frame++) {
            var timer = Stopwatch.StartNew();
            s.StepFixed(16); // exactly the production tick workload at 8x / 60 Hz
            costs.Add(timer.Elapsed.TotalMilliseconds);
        }
        costs.Sort();
        output.WriteLine($"Native 16-tick batch (8x / 60 Hz): {s.Tick - ticks} ticks / 120 frames; median={costs[60]:F3} ms p95={costs[114]:F3} ms max={costs[^1]:F3} ms. Renderer/WASM excluded.");
        Assert.Equal(120 * 16, s.Tick - ticks);
    }
}

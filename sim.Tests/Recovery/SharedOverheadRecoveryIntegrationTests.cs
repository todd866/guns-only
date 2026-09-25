using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests.Recovery;

/// <summary>
/// The overhead capture radii and 30° heading gate live on the shared F-22 director.
/// Kestrel's first run and recovery practice both arm that director and have to capture
/// the pattern through to a physical stop. Ace Duel has no handoff, so it must stay off it.
/// </summary>
public sealed class SharedOverheadRecoveryIntegrationTests {
    [Fact]
    public void AceDuelDoesNotEnterTheSharedOverhead() {
        // A lone duel has no continuous fight to hand off, so the shared director never
        // arms. A runway stop must not invent that recovery. See
        // UnsupportedAceDuelRunwayStopDoesNotBypassItsSingleFight.
        var session = new SimulationSession();
        session.StartBeat(() => Beats.ModernAceDuel());
        session.Begin();
        Assert.Equal(CombatHandoffPhase.Unavailable, session.CombatHandoffPhase);
        Assert.False(session.TryRequestReturnToBase());
        session.FeedKey(GKey.KnockItOff, true);
        session.FeedKey(GKey.KnockItOff, false);
        session.StepFixed();
        Assert.False(session.PlayerRtbActive);
        Assert.False(session.ConventionalRtbPatternGuidanceActive);
    }

    [Fact]
    public void KestrelFirstRunOverheadRecoversToAStop() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMergeFirstRun);
        session.Begin();
        session.ForceOpponentDefeatForTest();
        session.ForceOpponentDefeatForTest();
        session.StepFixed();
        Assert.True(session.PlayerRtbActive);
        FlyOverheadToAStop(session);
        Assert.Equal(CombatHandoffPhase.Recovered, session.CombatHandoffPhase);
        Assert.Equal(SortieOutcome.Victory, session.Outcome);
    }

    [Fact]
    public void RecoveryPracticeOverheadRecoversToAStop() {
        var session = new SimulationSession();
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Recovery));
        session.Begin();
        Assert.Equal(CombatHandoffPhase.PlayerRtb, session.CombatHandoffPhase);
        FlyOverheadToAStop(session);
        Assert.Equal(PracticeStatus.Completed, session.Practice!.Status);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
    }

    static void FlyOverheadToAStop(SimulationSession session) {
        Assert.True(session.PlayerRtbActive);
        session.StepFixed();
        Assert.True(session.ConventionalRtbPatternGuidanceActive);
        var recovery = Assert.IsType<ConventionalRunwayRecoveryModel>(
            session.ConventionalRunwayRecovery);
        double approachCalibratedMps = SortieSchedule.ApproachCalibratedAirspeedMps(
            session.Player.State.Mass,
            session.Beat.PlayerAir,
            session.Beat.SystemsProfile
                ?? AirframeSystemsProfile.F86FResearchBasis);
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                recovery.Runway,
                approachCalibratedMps,
                recovery.ReferenceHeightM);

        for (int index = 0; index < schedule.Count - 1; index++) {
            ConventionalRunwayPatternRecoveryDirector.PatternGate gate = schedule[index];
            ConventionalRunwayPatternRecoveryDirector.PatternGate next = schedule[index + 1];
            double headingRad = Math.Atan2(
                next.Position.X - gate.Position.X,
                next.Position.Z - gate.Position.Z);
            AircraftState atGate = session.Player.State with {
                Position = gate.Position,
                Speed = Math.Max(70.0, gate.TargetSpeedMps),
                Gamma = 0.0,
                Chi = headingRad,
                Bank = 0.0,
            };
            string seen = "";
            bool advanced = false;
            for (int tick = 0; tick < 45 && !advanced; tick++) {
                session.Player.AdoptExternalKinematics(atGate);
                session.StepFixed();
                Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
                seen = session.ApproachGuidancePlan.Gates.Count == 0
                    ? ""
                    : session.ApproachGuidancePlan.Gates[0].Id;
                advanced = seen == next.Id;
            }
            Assert.True(advanced,
                $"{session.Beat.Name} did not capture {gate.Id}; guidance stayed on '{seen}'");
        }

        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        AircraftState hold = session.Player.State with {
            Position = recovery.Runway.SurfacePoint(-8_000.0)
                + new Vec3D(0.0, 1_500.0 * 0.3048, 0.0),
        };
        for (int tick = 0; tick < 8 * (int)AircraftSim.TickHz
            && !session.PlayerSystems.AllGearDownAndLocked; tick++) {
            session.Player.AdoptExternalKinematics(hold);
            session.StepFixed();
        }
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);

        ConventionalRunway runway = recovery.Runway;
        Vec3D velocity = runway.Forward * 74.0 + new Vec3D(0.0, -2.2, 0.0);
        session.Player.AdoptExternalKinematics(new AircraftState(
            runway.SurfacePoint(430.0) + new Vec3D(0.0, 1.85, 0.0),
            velocity.Length,
            Math.Asin(velocity.Y / velocity.Length),
            runway.HeadingRad,
            0.0,
            session.Player.State.Mass,
            BodyAttitude: QuaternionD.FromFrame(
                runway.Right, new Vec3D(0.0, 1.0, 0.0), runway.Forward)));
        session.Controls.SetAnalogThrottleControl(0.0);
        for (int tick = 0; tick < 12_000
            && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++)
            session.StepFixed();

        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
        Assert.Equal(SimulationSession.LifecycleState.Finished, session.Lifecycle);
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
    }
}

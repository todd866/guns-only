using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;
using GunsOnly.Sim.Turbulence;
using GunsOnly.Web;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class ShortFinalPracticeTests(ITestOutputHelper output) {
    static SimulationSession Stage() {
        var session = new SimulationSession();
        session.StartBeatWithEnvironment(() => PracticeBeats.Create(PracticeExercise.ShortFinal),
            null, UkraineTerrainTruth.Load());
        return session;
    }

    [Fact]
    public void StartsConfiguredOnTheExistingFinalWithNoCombatActor() {
        var session = Stage();
        var runway = session.ConventionalRunwayRecovery!.Runway;
        var frame = runway.Frame(session.Player.State.Position);
        Assert.Equal(-3704, frame.along, 6);
        Assert.Equal(0, frame.cross, 6);
        Assert.Equal(session.ConventionalRunwayRecovery.ReferenceHeightM
            + (runway.TouchdownAimAlongM - frame.along) * Math.Tan(Math.PI / 60), frame.height, 6);
        Assert.Equal(-Math.PI / 60, session.Player.State.Gamma, 6);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
        Assert.False(session.ConfigurationAutomationEnabled);
        Assert.False(session.OpponentPresent);
        double vref = SortieSchedule.ApproachTrueAirspeedMps(session.Player.State.Mass,
            FlightModel.F22APublicDataSurrogate, AirframeSystemsProfile.ModernConventionalGearSurrogate,
            session.Player.State.Position.Y);
        Assert.Equal(vref, session.Player.AirspeedMps, 6);
        session.Begin();
        Assert.Equal(ApproachPatternLeg.Final, session.ApproachGuidancePlan.ActivePatternLeg);
        Assert.Equal("final", session.ApproachGuidancePlan.Gates[0].Id);
        Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
        Assert.Equal(180, session.Practice!.TimeLimitSeconds);
        Assert.Equal(PracticeStatus.Active, session.Practice.Status);
        Assert.False(session.ConventionalRtbRecoveryCompleted);
        Assert.Equal(RunwayRecoveryPhase.Airborne, session.ConventionalRunwayPhase);
        Assert.False(session.RunwayTouchdown.Contact);
    }

    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)] [InlineData(3)]
    [InlineData(4)] [InlineData(5)] [InlineData(6)] [InlineData(7)]
    public void CompetentPilotFliesTheInputPathToPhysicalStop(int seed) {
        var session = Stage();
        session.Begin();
        // Eight deterministic light-turbulence fields, not eight copies of a still-air card.
        session.Player.Wind = new TurbulenceField(intensityMps: 0.3,
            outerScaleM: 130, intermittency: 0.5, seed: (ulong)(0xC700 + seed));
        var runway = session.ConventionalRunwayRecovery!.Runway;
        double integral = 0;
        while (session.Lifecycle == SimulationSession.LifecycleState.Active
            && session.TimeSeconds < 181) {
            FlyPilot(session, ref integral);
            session.StepFixed(12);
            Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
            if (session.ConventionalRunwayPhase == RunwayRecoveryPhase.Rollout) {
                Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
                Assert.True(session.RunwayTouchdown.Contact && session.RunwayTouchdown.Survivable);
            }
        }
        var td = session.RunwayTouchdown;
        output.WriteLine($"seed {seed}: {session.Practice!.Status}, {session.TimeSeconds:F2}s, "
            + $"TD {td.AlongM:F1}/{td.CrossM:F1}m, sink {td.SinkRateMps:F2}m/s, "
            + $"deviations {td.Deviations}, phase {session.ConventionalRunwayPhase}, "
            + $"end {runway.Frame(session.Player.State.Position)}, speed {session.Player.State.Speed:F1}");
        Assert.Equal(PracticeStatus.Completed, session.Practice.Status);
        Assert.True(td.Contact && td.Survivable);
        Assert.Equal(RunwayRecoveryPhase.Recovered, session.ConventionalRunwayPhase);
        Assert.True(runway.ContainsPavement(session.Player.State.Position));
        Assert.Equal(0, session.Player.State.Speed, 6);
        Assert.Equal(SortieOutcome.Discontinued, session.Outcome);
    }

    [Fact]
    public void MissedApproachTargetsCleanIngressWithoutRetractingTheGear() {
        var session = Stage();
        session.Begin();
        var runway = session.ConventionalRunwayRecovery!.Runway;
        // Controlled missed-approach fixture, not evidence of a flown landing.
        session.Player.AdoptExternalKinematics(session.Player.State with {
            Position = runway.SurfacePoint(runway.TouchdownAimAlongM + 400)
                + new Vec3D(0, 100, 0),
            Gamma = 0,
        });
        session.StepFixed(30);
        Assert.Equal(ApproachPatternLeg.PatternEntry, session.ApproachGuidancePlan.ActivePatternLeg);
        Assert.Equal(FlightConfigurationTarget.Combat, session.ConfigurationTarget);
        Assert.Equal(LandingGearHandle.Down, session.PlayerSystems.GearHandle);
        Assert.False(session.ConfigurationAutomationEnabled);
        session.Restart();
        session.Begin();
        Assert.Equal(FlightConfigurationTarget.Recovery, session.ConfigurationTarget);
    }

    // Test-only pilot observes position/airspeed and sends the same analog controls as a
    // joystick. No kinematic writes, recovery calls, damage changes or protection bypasses.
    static void FlyPilot(SimulationSession session, ref double speedIntegral) {
        if (session.RunwayWeightOnWheels) {
            session.SetAnalogThrottleControl(0);
            session.SetAnalogPitchControl(0);
            session.SetAnalogRollControl(0);
            return;
        }
        var aircraft = session.Player;
        var state = aircraft.State;
        var air = FlightModel.F22APublicDataSurrogate;
        var systems = AirframeSystemsProfile.ModernConventionalGearSurrogate;
        var runway = session.ConventionalRunwayRecovery!.Runway;
        var frame = runway.Frame(state.Position);
        double remaining = runway.TouchdownAimAlongM - frame.along;
        double height = session.ConventionalRunwayRecovery.ReferenceHeightM
            + Math.Max(0, remaining) * Math.Tan(Math.PI / 60);
        double gamma = -Math.PI / 60 + Math.Clamp((height - frame.height) / 250, -.08, .08);
        if (remaining < 240) gamma = -.012 + Math.Clamp((height - frame.height) / 180, -.035, .055);
        double demand = Math.Cos(state.Gamma) + state.Speed / FlightModel.G0
            * (gamma - state.Gamma) * .7;
        double limit = Protection.MaxPerformG(state, air, aircraft.AirspeedMps, aircraft.AtmosphereModel);
        double axis = demand >= 1 ? (demand - 1) / Math.Max(.01, limit - 1) : (demand - 1) / 2;
        session.SetAnalogPitchControl(Math.Clamp(axis, -1, 1));
        double headingError = Math.IEEERemainder(runway.HeadingRad - state.Chi, 2 * Math.PI);
        double bank = Math.Clamp(headingError * 2 - frame.cross * .002, -.15, .15);
        session.SetAnalogRollControl(Math.Clamp((bank - state.Bank) * 2, -.3, .3));
        double vref = SortieSchedule.ApproachTrueAirspeedMps(state.Mass, air, systems, state.Position.Y);
        double error = vref - aircraft.AirspeedMps;
        speedIntegral = Math.Clamp(speedIntegral + error * .1, -20, 20);
        double drag = SortieSchedule.RecoveryDragToWeight(state.Mass, air, systems, state.Position.Y);
        double trim = (drag - Math.Sin(Math.PI / 60)) * state.Mass * FlightModel.G0 / air.ThrustMaxN;
        session.SetAnalogThrottleControl(Math.Clamp(trim + .03 * error + .0025 * speedIntegral, 0, 1));
    }

    [Fact]
    public void TimeoutAndPauseUseTheAttemptEpochAfterAnExpiredAttempt() {
        // High, straight flight isolates the clock from the separate touchdown/loss tests.
        var session = new SimulationSession();
        session.StartBeat(() => {
            var beat = PracticeBeats.Create(PracticeExercise.ShortFinal);
            return beat with {
                Player = beat.Player with { Position = new Vec3D(0, 4000, -4000), Speed = 150, Gamma = 0 },
                StageAtTrimThrottle = true,
            };
        });
        session.Begin();
        session.StepFixed(179 * (int)AircraftSim.TickHz);
        Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
        session.SetPaused(true);
        double paused = session.TimeSeconds;
        session.StepFixed(600);
        Assert.Equal(paused, session.TimeSeconds);
        session.SetPaused(false);
        session.StepFixed(121);
        Assert.Equal(PracticeStatus.TimeLimit, session.Practice.Status);
        Assert.InRange(session.TimeSeconds, 180, 180.02);
        session.Restart();
        double epoch = session.TimeSeconds;
        session.Begin();
        Assert.Equal(epoch, session.Practice!.AttemptStartSeconds);
        session.StepFixed(1200);
        Assert.Equal(PracticeStatus.Active, session.Practice.Status);
        Assert.InRange(session.TimeSeconds - epoch, 9.99, 10.01);
        Assert.InRange(session.Practice.ElapsedSeconds, 9.99, 10.01);
    }

    [Fact]
    public void HandsOffFailsAndRepeatGetsItsOwnBudget() {
        var session = Stage();
        for (int attempt = 0; attempt < 2; attempt++) {
            if (attempt > 0) session.Restart();
            double start = session.TimeSeconds;
            session.Begin();
            session.StepFixed();
            Assert.Equal(PracticeStatus.Active, session.Practice!.Status);
            for (int tick = 1; tick < 182 * AircraftSim.TickHz
                && session.Lifecycle == SimulationSession.LifecycleState.Active; tick++) session.StepFixed();
            output.WriteLine($"hands-off {attempt}: {session.Practice.Status}, "
                + $"elapsed {session.TimeSeconds - start:F2}, phase {session.ConventionalRunwayPhase}");
            Assert.False(session.Practice.Completed);
            Assert.True(session.Practice.Status is PracticeStatus.Lost or PracticeStatus.TimeLimit);
            Assert.InRange(session.TimeSeconds - start, 10, 181);
        }
    }
}

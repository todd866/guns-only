using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class RapierMissionTests {
    static BeatSetup AirborneAttackCard(int formationSize = 2, double startNorthM = 0.0) {
        BeatSetup baseline = Beats.RapierIntercept();
        const double altitudeM = 12_000.0;
        return baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, altitudeM, startNorthM),
                Speed = 350.0,
                Gamma = 0.0,
                Chi = 0.0,
                Bank = 0.0
            },
            Bandit = baseline.Bandit with {
                Position = new Vec3D(0.0, altitudeM, startNorthM + 8_000.0),
                Speed = 210.0,
                Gamma = 0.0,
                Chi = Math.PI,
                Bank = 0.0
            },
            UsesReactiveBandit = false,
            StartsOnCatapult = false,
            Combat = baseline.CombatRules with { OpponentAmmo = 0 },
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: formationSize)
        };
    }

    [Fact]
    public void AuthoredSortieStartsWithADeepInterceptAndTheReclinedCrewProfile() {
        BeatSetup beat = Beats.RapierIntercept();
        double initialRangeM = (beat.Bandit.Position - beat.Player.Position).Length;

        Assert.InRange(initialRangeM, 670_000.0, 690_000.0);
        Assert.Equal(4, beat.ScriptedIntercept?.FormationSize);
        Assert.Same(PilotPhysiologyProfile.RapierReclinedInterceptor,
            beat.PlayerPilotPhysiology);
    }

    [Fact]
    public void AutomationFliesTheAuthoredClimbAndEntersTheMach4InterceptWithRoomToFight() {
        var session = new SimulationSession(10,
            weather: KoreaWeatherPresets.ForBeat(10));
        session.DecisionCaptureEnabled = false;
        session.Begin();

        bool sawAccelerate = false;
        bool sawRamClimb = false;
        double maximumMach = 0.0;
        double rangeAtMach4CorridorM = double.NaN;
        var phaseTimeline = new List<string>();
        RapierMissionPhase lastPhase = RapierMissionPhase.Unavailable;
        int maximumTicks = checked((int)(12 * 60 * AircraftSim.TickHz));
        for (int tick = 0; tick < maximumTicks; tick++) {
            session.StepFixed();
            double mach = session.Player.AirspeedMps
                / StandardAtmosphere1976.Instance.Sample(
                    session.Player.State.Position.Y).SpeedOfSoundMps;
            maximumMach = Math.Max(maximumMach, mach);
            if (session.RapierPhase != lastPhase) {
                lastPhase = session.RapierPhase;
                phaseTimeline.Add($"{session.TimeSeconds:F0}s {lastPhase} "
                    + $"FL{session.Player.State.Position.Y / 30.48:F0} M{mach:F2} "
                    + $"R{(session.Bandit.State.Position - session.Player.State.Position).Length / 1000.0:F0}");
            }
            sawAccelerate |= session.RapierPhase == RapierMissionPhase.Accelerate;
            sawRamClimb |= session.RapierPhase == RapierMissionPhase.RamClimb;
            if (session.RapierPhase == RapierMissionPhase.Intercept && mach >= 3.8) {
                rangeAtMach4CorridorM = (session.Bandit.State.Position
                    - session.Player.State.Position).Length;
                break;
            }
            if (session.PlayerTerminalState != AircraftTerminalState.Flying)
                break;
        }

        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.True(sawAccelerate,
            $"automation never established the FL560 acceleration shelf: "
                + $"{session.RapierPhase} at {session.TimeSeconds:F0}s, "
                + $"FL{session.Player.State.Position.Y / 30.48:F0}, "
                + $"M{maximumMach:F2}, throttle {session.Controls.Throttle:F2}, "
                + $"gamma {session.Player.State.Gamma * 180.0 / Math.PI:F1}°");
        Assert.True(sawRamClimb, "automation never commanded the ram climb to FL700");
        Assert.True(maximumMach >= 3.8,
            $"automation only reached M{maximumMach:F2}");
        Assert.True(double.IsFinite(rangeAtMach4CorridorM),
            $"automation never entered the Mach-4 intercept phase "
                + $"[{string.Join(", ", phaseTimeline)}]");
        Assert.True(rangeAtMach4CorridorM > 60_000.0,
            $"only {rangeAtMach4CorridorM / 1000.0:F0} km remained at dash speed");
    }

    [Fact]
    public void RapierStagesFourShipsAndWaitsForPilotSweepAuthorization() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard(formationSize: 4));
        session.Begin();
        session.StepFixed();

        Assert.True(session.RapierMissionAvailable);
        Assert.True(session.RapierAutomationEnabled);
        Assert.True(session.RapierAutomationActive);
        Assert.Equal(RapierMissionPhase.Attack, session.RapierPhase);
        Assert.Equal(4, session.LiveOpponentCount);
        Assert.Equal(3, session.Wingmen.Count);
        Assert.Equal(4, session.RapierDogfightingDronesRemaining);
        Assert.Equal(0, session.RapierMissilesRemaining);
        Assert.False(session.RapierMissileInFlight);
        Assert.Contains("PRESS F", session.RapierMissionCue);

        // A fast browser tap can put both host edges between fixed simulation ticks. The release
        // command is a cockpit action, so it must remain latched until the next authoritative tick.
        session.FeedKey(GKey.Trigger, true);
        session.FeedKey(GKey.Trigger, false);
        session.StepFixed();

        Assert.Equal(4, session.KillCount);
        Assert.Equal(0, session.LiveOpponentCount);
        Assert.True(session.RapierPursuitActive);
        Assert.Equal(2, session.RapierPursuerCount);
        Assert.Equal(RapierMissionPhase.Escape, session.RapierPhase);
        Assert.Equal(0, session.RapierMissilesRemaining);
        Assert.Equal(0, session.RapierDogfightingDronesRemaining);
    }

    [Fact]
    public void AutomationCanFlyTheWholeAuthoredSortieButLeavesTheAttackDecisionToThePilot() {
        var session = new SimulationSession(10,
            weather: KoreaWeatherPresets.ForBeat(10));
        session.DecisionCaptureEnabled = false;
        session.Begin();

        bool releasedSwarm = false;
        bool sawPursuit = false;
        bool sawRecoveryGate = false;
        string finalEntry = "never";
        var phaseTimeline = new List<string>();
        RapierMissionPhase lastPhase = RapierMissionPhase.Unavailable;
        double maximumAltitudeM = double.NegativeInfinity;
        double maximumAbsVerticalSpeedMps = 0.0;
        double maximumAbsBankRad = 0.0;
        double maximumNz = 0.0;
        double closestInitialM = double.PositiveInfinity;
        string closestInitial = "never";
        Vec3D authoredInitial = session.Carrier!.LandingPoint(
            along: -16_000.0, height: 1_000.0);
        int maximumTicks = checked((int)(60 * 60 * AircraftSim.TickHz));
        for (int tick = 0;
            tick < maximumTicks
                && session.Lifecycle == SimulationSession.LifecycleState.Active;
            tick++) {
            if (!releasedSwarm && session.RapierPhase == RapierMissionPhase.Attack) {
                session.FeedKey(GKey.Trigger, true);
                releasedSwarm = true;
            }
            session.StepFixed();
            maximumAltitudeM = Math.Max(maximumAltitudeM,
                session.Player.State.Position.Y);
            maximumAbsVerticalSpeedMps = Math.Max(maximumAbsVerticalSpeedMps,
                Math.Abs(session.Player.State.VelocityVector().Y));
            maximumAbsBankRad = Math.Max(maximumAbsBankRad,
                Math.Abs(session.Player.State.Bank));
            maximumNz = Math.Max(maximumNz, session.Player.LastNz);
            if (session.RapierPhase != lastPhase) {
                lastPhase = session.RapierPhase;
                phaseTimeline.Add($"{session.TimeSeconds:F0}s {lastPhase}");
            }
            if (releasedSwarm) session.FeedKey(GKey.Trigger, false);
            sawPursuit |= session.RapierPursuitActive;
            if (session.RapierMissionCue.StartsWith("AUTO RECOVERY INITIAL",
                    StringComparison.Ordinal)) {
                double range = (authoredInitial - session.Player.State.Position).Length;
                if (range < closestInitialM) {
                    closestInitialM = range;
                    closestInitial = $"{range:F0} m at "
                        + $"({session.Player.State.Position.X:F0},"
                        + $"{session.Player.State.Position.Y:F0},"
                        + $"{session.Player.State.Position.Z:F0}) "
                        + $"chi {session.Player.State.Chi * 180.0 / Math.PI:F1} "
                        + $"bank {session.Player.State.Bank * 180.0 / Math.PI:F1}";
                }
            }
            if (!sawRecoveryGate
                && session.RapierMissionCue.StartsWith("GATE ",
                    StringComparison.Ordinal)) {
                sawRecoveryGate = true;
                finalEntry = $"({session.Player.State.Position.X:F0},"
                    + $"{session.Player.State.Position.Y:F0},"
                    + $"{session.Player.State.Position.Z:F0}) "
                    + $"chi {session.Player.State.Chi * 180.0 / Math.PI:F1} "
                    + $"bank {session.Player.State.Bank * 180.0 / Math.PI:F1}";
            }
        }

        Assert.True(releasedSwarm, "automation never delivered the formation to the pilot");
        Assert.True(sawPursuit, "the formation sweep never started the egress pursuit");
        Assert.True(sawRecoveryGate,
            $"the return never entered the square-gate recovery: "
                + $"{session.RapierMissionCue} at "
                + $"{session.TimeSeconds:F0} s "
                + $"[{string.Join(", ", phaseTimeline)}] "
                + $"({session.Player.State.Position.X:F0},"
                + $"{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}); "
                + $"closest initial {closestInitial}");
        Assert.True(session.Lifecycle == SimulationSession.LifecycleState.Finished,
            $"sortie remained {session.Lifecycle}/{session.RapierPhase} with "
                + $"{session.PlayerFuel.FuelLb:F0} lb at "
                + $"({session.Player.State.Position.X:F0},"
                + $"{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}); "
                + $"base {(session.Carrier!.Position - session.Player.State.Position).Length / 1000.0:F0} km; "
                + $"{session.RapierMissionCue}; final entry {finalEntry}; "
                + $"chi {session.Player.State.Chi * 180.0 / Math.PI:F1}; "
                + $"bank {session.Player.State.Bank * 180.0 / Math.PI:F1}; "
                + $"command bank {session.Player.LastAppliedCommand.BankTarget * 180.0 / Math.PI:F1}; "
                + $"waypoint ({session.RapierGuidanceWaypoint.X:F0},"
                + $"{session.RapierGuidanceWaypoint.Y:F0},"
                + $"{session.RapierGuidanceWaypoint.Z:F0}); "
                + $"[{string.Join(", ", phaseTimeline)}]");
        Assert.True(session.Outcome == SortieOutcome.Victory,
            $"sortie ended {session.Outcome}/{session.Recovery}/"
                + $"{session.Arrestment.Phase} with {session.PlayerFuel.FuelLb:F0} lb; "
                + $"touchdown {session.Touchdown.Hook}/{session.Touchdown.Wire} "
                + $"sink {session.Touchdown.SinkRateMps:F1} m/s "
                + $"IAS {session.Touchdown.IndicatedAirspeedMps * 1.94384:F0} kt "
                + $"wheel {session.Touchdown.WheelAlongM:F0} m "
                + $"hook {session.Touchdown.HookAlongM:F0} m; "
                + $"final entry {finalEntry}; config {session.ConfigurationTarget}/"
                + $"{session.ConfigurationCue}; gear "
                + $"{session.PlayerSystems.LeftMainGearPosition:F2}/"
                + $"{session.PlayerSystems.RightMainGearPosition:F2}/"
                + $"{session.PlayerSystems.NoseGearPosition:F2}; "
                + $"mass {session.Player.State.Mass:F0} kg");
        Assert.Equal(4, session.KillCount);
        Assert.True(session.Touchdown.Wire == 3,
            $"expected wire three, caught {session.Touchdown.Wire} at "
                + $"wheel {session.Touchdown.WheelAlongM:F1} m / "
                + $"hook {session.Touchdown.HookAlongM:F1} m; "
                + $"mass {session.Player.State.Mass:F0} kg / "
                + $"fuel {session.PlayerFuel.FuelLb:F0} lb");
        Assert.InRange(session.PlayerFuel.FuelLb, 100.0, 1_600.0);
        Assert.True(maximumAltitudeM <= 75_000.0 * 0.3048,
            $"profile climbed to {maximumAltitudeM / 0.3048:F0} ft");
        Assert.True(maximumAbsVerticalSpeedMps <= 60_000.0 * 0.00508,
            $"profile reached {maximumAbsVerticalSpeedMps / 0.00508:F0} ft/min");
        Assert.True(maximumAbsBankRad <= 32.0 * Math.PI / 180.0,
            $"automation banked {maximumAbsBankRad * 180.0 / Math.PI:F1}°");
        Assert.True(maximumNz <= 4.1,
            $"automation/launcher reached {maximumNz:F2} G");
    }

    [Fact]
    public void LastFormationKillTurnsTheSameSortieHomeInsteadOfEndingIt() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard(
            formationSize: 1,
            startNorthM: 50_000.0));
        session.Begin();
        session.ForceOpponentDefeatForTest();
        session.StepFixed();

        Assert.Equal(0, session.LiveOpponentCount);
        Assert.Equal(RapierMissionPhase.Recovery, session.RapierPhase);
        Assert.True(session.TerminalPhaseActive);
        Assert.Equal(SimulationSession.LifecycleState.Active, session.Lifecycle);
        Assert.Contains("AUTO RECOVERY", session.RapierMissionCue);
    }

    [Fact]
    public void RecoveryAutomationFliesTheFinalAndStopsOnTheWire() {
        BeatSetup baseline = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(baseline.Carrier);
        Vec3D initial = strip.LandingPoint(along: -46_000.0, height: 3_700.0);
        BeatSetup recoveryCard = baseline with {
            Player = baseline.Player with {
                Position = initial,
                Speed = 180.0,
                Gamma = -3.5 * Math.PI / 180.0,
                Chi = strip.LandingHeadingRad,
                Bank = 0.0
            },
            Bandit = baseline.Bandit with {
                Position = initial + new Vec3D(0.0, 0.0, 8_000.0)
            },
            UsesReactiveBandit = false,
            StartsOnCatapult = false,
            Combat = baseline.CombatRules with { OpponentAmmo = 0 },
            Fuel = baseline.FuelLoadout with { InitialFuelLb = 1_200.0 },
            ScriptedIntercept = new ScriptedInterceptConfig(FormationSize: 1)
        };
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(10));
        session.StartBeat(() => recoveryCard);
        session.DecisionCaptureEnabled = false;
        session.Begin();
        session.ForceOpponentDefeatForTest();

        string finalEntry = "never";
        int maximumTicks = checked((int)(15 * 60 * AircraftSim.TickHz));
        for (int tick = 0;
            tick < maximumTicks
                && session.Lifecycle == SimulationSession.LifecycleState.Active;
            tick++) {
            session.StepFixed();
            if (finalEntry == "never"
                && session.RapierMissionCue.StartsWith("GATE ",
                    StringComparison.Ordinal)) {
                finalEntry = $"({session.Player.State.Position.X:F0},"
                    + $"{session.Player.State.Position.Y:F0},"
                    + $"{session.Player.State.Position.Z:F0})";
            }
        }

        Assert.True(session.Lifecycle == SimulationSession.LifecycleState.Finished,
            $"recovery stayed {session.Lifecycle}/{session.Recovery}/"
                + $"{session.Arrestment.Phase} at "
                + $"({session.Player.State.Position.X:F0},"
                + $"{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}) "
                + $"{session.Player.AirspeedMps * 1.94384:F0} KTAS "
                + $"gamma {session.Player.State.Gamma * 180.0 / Math.PI:F1}");
        Assert.True(session.Outcome == SortieOutcome.Victory,
            $"recovery ended {session.Outcome}/{session.Recovery}/"
                + $"{session.Touchdown.PrimaryCorrection}/{session.Arrestment.Phase} at "
                + $"({session.Player.State.Position.X:F0},"
                + $"{session.Player.State.Position.Y:F0},"
                + $"{session.Player.State.Position.Z:F0}) "
                + $"{session.Player.AirspeedMps * 1.94384:F0} KTAS · "
                + $"touchdown sink {session.Touchdown.SinkRateMps:F1} m/s, "
                + $"IAS {session.Touchdown.IndicatedAirspeedMps * 1.94384:F0} kt, "
                + $"wheel {session.Touchdown.WheelAlongM:F0} m, "
                + $"hook {session.Touchdown.HookAlongM:F0} m; "
                + $"final entry {finalEntry}; mass {session.Player.State.Mass:F0} kg");
        Assert.Equal(ArrestmentModel.ArrestmentPhase.Stopped,
            session.Arrestment.Phase);
        Assert.True(session.Touchdown.Wire == 3,
            $"expected wire three, caught {session.Touchdown.Wire} at "
                + $"wheel {session.Touchdown.WheelAlongM:F1} m / "
                + $"hook {session.Touchdown.HookAlongM:F1} m; "
                + $"mass {session.Player.State.Mass:F0} kg");
    }

    [Fact]
    public void PilotCanDisengageAndReengageMissionAutomationWithoutRestaging() {
        var session = new SimulationSession();
        session.StartBeat(() => AirborneAttackCard());
        session.Begin();
        session.StepFixed();

        Assert.False(session.ToggleRapierAutomation());
        Assert.False(session.RapierAutomationActive);
        Assert.True(session.ToggleRapierAutomation());
        Assert.True(session.RapierAutomationActive);

        long tick = session.Tick;
        session.FeedKey(GKey.RollLeft, true);
        Assert.False(session.RapierAutomationActive);
        Assert.False(session.RapierAutomationEnabled);
        Assert.Equal(tick, session.Tick);
        session.FeedKey(GKey.RollLeft, false);
        for (int i = 0; i < 6 * AircraftSim.TickHz; i++)
            session.StepFixed();
        Assert.False(session.RapierAutomationEnabled);
        Assert.False(session.RapierAutomationActive);
        Assert.True(session.ToggleRapierAutomation());
        Assert.True(session.RapierAutomationActive);
    }

    [Fact]
    public void AuthoredAtmosphereCeilingEndsTheSortieInsteadOfCrashingTheKernel() {
        BeatSetup baseline = AirborneAttackCard();
        BeatSetup boundaryCard = baseline with {
            Player = baseline.Player with {
                Position = new Vec3D(0.0, 31_760.0, 0.0),
                Speed = 500.0,
                Gamma = 0.25
            }
        };
        var session = new SimulationSession(weather: KoreaWeatherPresets.ForBeat(10));
        session.StartBeat(() => boundaryCard);
        session.Begin();

        Exception? failure = Record.Exception(session.StepFixed);

        Assert.Null(failure);
        Assert.Equal(AircraftTerminalState.SimulationBounded,
            session.PlayerTerminalState);
        Assert.Contains(session.RecentEvents,
            entry => entry.Type == SessionEventType.TerminalLimitReached
                && entry.Surface == ImpactSurface.SimulationBoundary);
    }
}

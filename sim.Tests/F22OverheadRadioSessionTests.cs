using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The overhead calls have to come from a real session's published gate, not a
/// hand-built <see cref="MissionRadioState"/>. Gear up must not say "three greens".
/// </summary>
public sealed class F22OverheadRadioSessionTests {
    [Fact]
    public void SessionOverheadSpeaksInitialThenBreakThenBaseOnlyWithGearLocked() {
        var session = new SimulationSession();
        session.StartBeat(() => PracticeBeats.Create(PracticeExercise.Recovery));
        session.Begin();
        session.StepFixed();
        Assert.True(session.ConventionalRtbPatternGuidanceActive);
        Assert.False(session.PlayerSystems.AllGearDownAndLocked);

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
        var heard = new List<string>();

        HoldUntilGate(session, schedule, "initial", "break", heard);
        Hold(session, schedule, "initial", ticks: 8 * (int)AircraftSim.TickHz, heard);
        Assert.Equal(["pilot-initial", "tower-break-approved"], heard);
        Assert.DoesNotContain(heard, id => id == "pilot-base");

        HoldUntilGate(session, schedule, "break", "downwind", heard);
        HoldUntilGate(session, schedule, "downwind", "perch", heard);
        Hold(session, schedule, "downwind", ticks: 4 * (int)AircraftSim.TickHz, heard);
        Assert.DoesNotContain(heard, id => id == "pilot-base");
        Assert.False(session.PlayerSystems.AllGearDownAndLocked);

        session.FeedKey(GKey.GearToggle, true);
        session.FeedKey(GKey.GearToggle, false);
        Hold(session, schedule, "downwind", ticks: 10 * (int)AircraftSim.TickHz, heard);
        Assert.True(session.PlayerSystems.AllGearDownAndLocked);
        Assert.Equal(
            ["pilot-initial", "tower-break-approved", "pilot-base"],
            heard);
    }

    static void HoldUntilGate(
        SimulationSession session,
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule,
        string gateId,
        string nextId,
        List<string> heard) {
        string seen = "";
        for (int tick = 0; tick < 45 && seen != nextId; tick++) {
            Park(session, schedule, gateId);
            session.StepFixed();
            Note(session, heard);
            Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
            seen = session.ApproachGuidancePlan.Gates.Count == 0
                ? ""
                : session.ApproachGuidancePlan.Gates[0].Id;
        }
        Assert.Equal(nextId, seen);
    }

    static void Hold(
        SimulationSession session,
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule,
        string gateId,
        int ticks,
        List<string> heard) {
        for (int tick = 0; tick < ticks; tick++) {
            Park(session, schedule, gateId);
            session.StepFixed();
            Note(session, heard);
            Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        }
    }

    static void Park(
        SimulationSession session,
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule,
        string gateId) {
        int index = -1;
        for (int i = 0; i < schedule.Count; i++) {
            if (schedule[i].Id == gateId) {
                index = i;
                break;
            }
        }
        Assert.True(index >= 0);
        ConventionalRunwayPatternRecoveryDirector.PatternGate gate = schedule[index];
        ConventionalRunwayPatternRecoveryDirector.PatternGate next =
            schedule[Math.Min(index + 1, schedule.Count - 1)];
        double headingRad = Math.Atan2(
            next.Position.X - gate.Position.X,
            next.Position.Z - gate.Position.Z);
        session.Player.AdoptExternalKinematics(session.Player.State with {
            Position = gate.Position,
            Speed = Math.Max(70.0, gate.TargetSpeedMps),
            Gamma = 0.0,
            Chi = headingRad,
            Bank = 0.0,
        });
    }

    static void Note(SimulationSession session, List<string> heard) {
        MissionRadioTransmission tx = session.MissionRadio;
        if (!tx.Active || string.IsNullOrEmpty(tx.Id)) return;
        if (!session.PlayerSystems.AllGearDownAndLocked) {
            Assert.NotEqual("pilot-base", tx.Id);
            Assert.DoesNotContain(
                "three greens", tx.Text ?? "", StringComparison.OrdinalIgnoreCase);
        }
        if (heard.Count == 0 || heard[^1] != tx.Id)
            heard.Add(tx.Id);
    }
}

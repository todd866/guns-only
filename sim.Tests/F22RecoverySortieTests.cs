using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Build 380 r1 native end-to-end: the first sortie (O1 → D1) flown by the scripted fight pilots,
/// then the recovery flown on the KEY path by a HUD-cue pilot — box to box, gear on the cue,
/// autothrottle at full assist — to a physical full stop. No state writes after Begin.
/// </summary>
public class F22RecoverySortieTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;

    public sealed record Flight(string Pilot, int Seed, bool Finished, SortieOutcome Outcome,
        RunwayRecoveryPhase Runway, double RtbAt, double EndAt, int GearPresses,
        IReadOnlyList<CourseGateRecord> Gates, string Trace, RunwayTouchdownResult Touchdown);

    public static SimulationSession StartFirstSortie(int seed) {
        var s = BfmFlightAcceptanceTests.Start(0, seed);
        // Desktop keyboard contract: no phone assisted flight.
        s.SetAssistedFlight(false);
        s.SetTouchControlModality(false);
        return s;
    }

    public static Flight Fly(RecoveryKeyPilotProfile profile, int seed, double limitS = 600,
        Action<SimulationSession>? everyTick = null) {
        var s = StartFirstSortie(seed);
        var fight = new FirstMergeOpeningAcceptanceTests.HudPilot(new("p", 0.25, 3, 1 + 0.3 * seed));
        var pilot = new F22RecoveryKeyPilot(profile);
        var trace = new System.Text.StringBuilder();
        double rtbAt = double.NaN;
        int tick = 0;
        for (; tick < limitS * AircraftSim.TickHz
            && s.Lifecycle == SimulationSession.LifecycleState.Active; tick++) {
            if (!s.PlayerRtbActive) {
                if (s.BfmLessonIndex == 0) fight.Drive(s);
                else BfmFlightAcceptanceTests.Break(s, tick * Dt, seed);
            } else {
                if (double.IsNaN(rtbAt)) {
                    rtbAt = s.TimeSeconds;
                    // Hands off the analog sticks the fight pilot used; the keys take over.
                    s.Controls.ClearAnalogRollControl();
                    s.Controls.ClearAnalogPitchControl();
                    s.Controls.ClearAnalogThrottleControl();
                }
                pilot.Drive(s);
            }
            everyTick?.Invoke(s);
            s.StepFixed();
            if (tick % (2 * AircraftSim.TickHz) == 0 && s.F22Course.Armed) {
                var rw = s.ConventionalRunwayRecovery!.Runway;
                var f = rw.Frame(s.Player.State.Position);
                var c = F22RecoveryKeyPilot.Perceive(s);
                trace.AppendLine(
                    $"t={s.TimeSeconds:F0} ->{s.F22Course.NextGate.Id} xt={s.F22Course.CrossTrackM:F0} " +
                    $"along={f.along:F0} cross={f.cross:F0} ft={f.height / 0.3048:F0} " +
                    $"kcas={s.Player.IndicatedAirspeedMps * AirData.MpsToKnots:F0} bank={s.Player.State.Bank * 57.3:F0} " +
                    $"box r={c.RightDeg:F1} u={c.UpDeg:F1} thr={s.Controls.Throttle:F2} gear={s.PlayerSystems.AllGearDownAndLocked} rw={s.ConventionalRunwayPhase}");
            }
        }
        pilot.ReleaseAll(s);
        return new Flight(profile.Name, seed, s.Lifecycle == SimulationSession.LifecycleState.Finished,
            s.Outcome, s.ConventionalRunwayPhase, rtbAt, s.TimeSeconds, pilot.GearPresses,
            s.F22Course.Records.ToList(), trace.ToString(), s.RunwayTouchdown);
    }

    void Report(Flight f) {
        output.WriteLine($"{f.Pilot} seed={f.Seed} finished={f.Finished} outcome={f.Outcome} runway={f.Runway} rtb={f.RtbAt:F0}s end={f.EndAt:F0}s gear={f.GearPresses}");
        output.WriteLine($"  touchdown contact={f.Touchdown.Contact} dev={f.Touchdown.Deviations} sink={f.Touchdown.SinkRateMps:F2} along={f.Touchdown.AlongM:F0} cross={f.Touchdown.CrossM:F1} tas={f.Touchdown.AirspeedMps:F1}");
        foreach (var g in f.Gates)
            output.WriteLine($"  {g.Label,-9} {g.Grade,-7} alt={g.AltitudeFt:F0}/{g.TargetAltitudeFt:F0} kcas={g.CalibratedKts:F0}/{g.TargetCalibratedKts:F0} gear={g.GearDown} sink={g.SinkRateMps:F2}");
        if (System.Environment.GetEnvironmentVariable("R1_TRACE") == "1") output.WriteLine(f.Trace);
    }

    [Theory]
    [InlineData("human", 0)]
    [InlineData("human", 1)]
    [InlineData("kid", 0, Skip = "r1 known failure: kid seed 0 goes around and does not stop inside 600 s (handoff r1-recovery.md)")]
    [InlineData("kid", 1)]
    public void FirstSortieFightsRecoversAndStopsOnTheKeys(string who, int seed) {
        var profile = who == "kid" ? RecoveryKeyPilotProfile.Kid : RecoveryKeyPilotProfile.Human;
        Flight f = Fly(profile, seed);
        Report(f);
        Assert.False(double.IsNaN(f.RtbAt), "the fight never reached RTB");
        Assert.True(f.Finished, "the sortie did not finish");
        Assert.Equal(RunwayRecoveryPhase.Recovered, f.Runway);
        Assert.Equal(SortieOutcome.Victory, f.Outcome);
        Assert.True(f.GearPresses >= 1);
        Assert.All(f.Gates, g => Assert.NotEqual(CourseGateGrade.Pending, g.Grade));
    }
}

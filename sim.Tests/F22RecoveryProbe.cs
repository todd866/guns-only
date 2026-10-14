using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public class F22RecoveryProbe(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;

    [Fact]
    public void ProbeAfterFight() {
        if (System.Environment.GetEnvironmentVariable("R1_PROBE") != "1") return;
        var s = BfmFlightAcceptanceTests.Start(0, 1);
        s.SetAssistedFlight(false);
        s.SetTouchControlModality(false);
        var pilot = new FirstMergeOpeningAcceptanceTests.HudPilot(new("p", 0.25, 3, 1));
        int tick = 0;
        for (; tick < 60 * AircraftSim.TickHz && !s.PlayerRtbActive; tick++) {
            if (s.BfmLessonIndex == 0) pilot.Drive(s);
            else BfmFlightAcceptanceTests.Break(s, tick * Dt, 0);
            s.StepFixed();
        }
        output.WriteLine($"approachKcas={GunsOnly.Sim.Recovery.SortieSchedule.ApproachCalibratedAirspeedMps(s.Player.State.Mass, s.Beat.PlayerAir, s.Beat.SystemsProfile!) * 1.944:F1} fuelLb={s.PlayerFuel.FuelLb:F0}");
        output.WriteLine($"rtb at t={s.TimeSeconds:F1} kills={s.KillCount} lesson={s.BfmLessonIndex} {s.BfmLessonOutcome} complete={s.FiniteCombatComplete}");
        var rw = s.ConventionalRunwayRecovery!.Runway;
        for (int i = 0; i < 3; i++) s.StepFixed();
        var st = s.Player.State;
        var f = rw.Frame(st.Position);
        var g = s.ApproachGuidancePlan;
        output.WriteLine($"pos along={f.along:F0} cross={f.cross:F0} h={f.height:F0} spd={st.Speed:F0} chi={st.Chi * 57.3:F0} ext={g.Extension} req={g.TrackRequiredM:F0} avail={g.TrackAvailableM:F0}");
        foreach (var gate in g.Gates) {
            var gf = rw.Frame(new Vec3D(gate.EastM, gate.UpM, gate.NorthM));
            output.WriteLine($"  {gate.Id} {gate.Label} along={gf.along:F0} cross={gf.cross:F0} h={gf.height:F0} ktas={gate.TargetKtas:F0}");
        }
    }
}

public class F22RecoveryEnergyProbe(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    [Theory]
    [InlineData(-3.0)]
    [InlineData(-6.0)]
    [InlineData(-10.0)]
    public void IdleDescent(double gammaDeg) {
        if (System.Environment.GetEnvironmentVariable("R1_PROBE") != "1") return;
        var s = BfmFlightAcceptanceTests.Start(0, 1);
        s.SetAssistedFlight(false);
        var pilot = new FirstMergeOpeningAcceptanceTests.HudPilot(new("p", 0.25, 3, 1));
        for (int tick = 0; tick < 60 * AircraftSim.TickHz && !s.PlayerRtbActive; tick++) {
            if (s.BfmLessonIndex == 0) pilot.Drive(s);
            else BfmFlightAcceptanceTests.Break(s, tick * Dt, 0);
            s.StepFixed();
        }
        double dist = 0;
        for (int tick = 0; tick < 240 * AircraftSim.TickHz; tick++) {
            var st = s.Player.State;
            double g = gammaDeg;
            if (st.Position.Y < 600) g = 0;
            s.SetAnalogThrottleControl(0);
            s.SetAnalogRollControl(Math.Clamp(-st.Bank * 2, -0.5, 0.5));
            s.SetAnalogPitchControl(Math.Clamp((g * Math.PI / 180 - st.Gamma) * 4, -0.5, 0.5));
            s.StepFixed();
            dist += st.Speed * Math.Cos(st.Gamma) * Dt;
            if (tick % (5 * AircraftSim.TickHz) == 0)
                output.WriteLine($"t={tick * Dt:F0} d={dist / 1000:F1}km h={st.Position.Y * 3.28:F0}ft kcas={s.Player.IndicatedAirspeedMps * 1.944:F0} E={st.Position.Y + st.Speed * st.Speed / 19.62:F0}");
            if (s.Player.IndicatedAirspeedMps * 1.944 < 250) break;
        }
    }
}

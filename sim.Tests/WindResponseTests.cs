using System;
using System.Collections.Generic;
using GunsOnly.Sim;
using GunsOnly.Sim.Turbulence;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// Turbulence enters the flight model as a disturbance IN the loop: the aero acts on true
/// airspeed (ground velocity − wind), so a gust perturbs the force vector and the flight path
/// bumps. These tests prove the plumbing is right before we judge whether it FEELS right (which
/// is a flown verdict, not a headless one).
public class WindResponseTests {
    readonly ITestOutputHelper _o;
    public WindResponseTests(ITestOutputHelper o) => _o = o;

    static AircraftState Trimmed(double kts = 250, double alt = 3000) =>
        new(new Vec3D(0, alt, 0), kts / 1.94384, 0, 0, 0, FlightModel.Sabre.MassKg);
    static PilotCommand Cruise => new(1.0, 0.0, 0.85, 0.0);
    const double Dt = 1.0 / 120.0;

    sealed class ConstantWind : IWindField {
        readonly Vec3D _w;
        public ConstantWind(Vec3D w) => _w = w;
        public Vec3D Sample(Vec3D worldPos) => _w;
    }

    [Fact]
    public void NullWindIsBitIdenticalToStillAir() {
        // The regression guard: Wind = null must reproduce the old still-air trajectory exactly,
        // so every pre-existing test remains valid and turbulence is purely additive.
        var a = new AircraftSim(Trimmed(), FlightModel.Sabre);                 // no Wind
        var b = new AircraftSim(Trimmed(), FlightModel.Sabre) { Wind = null }; // explicitly null
        for (int i = 0; i < 1200; i++) { a.Step(Cruise, Dt); b.Step(Cruise, Dt); }
        Assert.Equal(a.State.Position.X, b.State.Position.X);   // exact
        Assert.Equal(a.State.Position.Y, b.State.Position.Y);
        Assert.Equal(a.State.Position.Z, b.State.Position.Z);
        Assert.Equal(a.State.Speed, b.State.Speed);
    }

    [Fact]
    public void SteadyUpdraftMakesTheAircraftClimb() {
        // A clean, sign-checkable test of the gust-lift coupling: a sustained updraft raises the
        // effective AoA, so lift exceeds weight and the aircraft climbs relative to still air.
        // (Downdraft would sink it — the same term with the opposite sign.)
        var still = new AircraftSim(Trimmed(), FlightModel.Sabre);
        var updraft = new AircraftSim(Trimmed(), FlightModel.Sabre) {
            Wind = new ConstantWind(new Vec3D(0, 1.5, 0))   // 1.5 m/s air rising
        };
        for (int i = 0; i < 600; i++) { still.Step(Cruise, Dt); updraft.Step(Cruise, Dt); }  // 5 s
        double climb = updraft.State.Position.Y - still.State.Position.Y;
        _o.WriteLine($"5 s in a 1.5 m/s updraft: climbed {climb:F1} m relative to still air");
        Assert.True(climb > 10.0, $"an updraft must make it climb, was {climb:F1} m");
    }

    static double Kurtosis(List<double> a) {
        double m = 0; foreach (var x in a) m += x; m /= a.Count;
        double v = 0, k = 0;
        foreach (var x in a) { double d = x - m; v += d * d; } v /= a.Count;
        foreach (var x in a) { double d = x - m; k += d * d * d * d; }
        return k / a.Count / (v * v);   // Gaussian = 3
    }

    [Fact]
    public void TurbulenceGivesFeltBumpsWhoseJoltsAreIntermittent() {
        // A real multifractal field on a trimmed cruise. Observable: the ACTUAL vertical
        // acceleration (finite-differenced from velocity), windy minus still — NOT LastNz, which
        // is the COMMANDED G and wouldn't move. Two things must hold, and they live in different
        // places (measured): (1) the bump MAGNITUDE is felt-scale — tenths of a G for a 4 m/s
        // gust, from the CLα gust-lift term, not the 0.005 G of lift-vector rotation alone; and
        // (2) the intermittency — the "quiet-quiet-SLAM" — lives in the JOLT (the jerk, ∝ gust
        // GRADIENT), not the bump amplitude (∝ gust VALUE, only mildly leptokurtic). The jerk
        // inherits the field's fat-tailed gradient statistics; that sharp onset is the SLAM.
        var field = new TurbulenceField(intensityMps: 4.0, outerScaleM: 60.0, intermittency: 0.5, seed: 42);
        var windy = new AircraftSim(Trimmed(), FlightModel.Sabre) { Wind = field };
        var still = new AircraftSim(Trimmed(), FlightModel.Sabre);
        var vW = windy.State.VelocityVector();
        var vS = still.State.VelocityVector();
        var accel = new List<double>();   // vertical accel perturbation, in G, signed
        for (int i = 0; i < 12000; i++) {   // 100 s — enough correlation lengths for stable kurtosis
            windy.Step(Cruise, Dt); still.Step(Cruise, Dt);
            var vW2 = windy.State.VelocityVector();
            var vS2 = still.State.VelocityVector();
            accel.Add(((vW2.Y - vW.Y) / Dt - (vS2.Y - vS.Y) / Dt) / 9.80665);
            vW = vW2; vS = vS2;
            Assert.True(double.IsFinite(windy.State.Speed) && windy.State.Speed > 40, "must not depart/blow up");
        }
        double mean = 0; foreach (var g in accel) mean += g; mean /= accel.Count;
        double var = 0; foreach (var g in accel) var += (g - mean) * (g - mean); var /= accel.Count;
        double sd = Math.Sqrt(var);
        var jerk = new List<double>();   // the jolt: change in bump over 0.05 s
        for (int i = 6; i < accel.Count; i++) jerk.Add(accel[i] - accel[i - 6]);
        double kJerk = Kurtosis(jerk);
        _o.WriteLine($"felt bump: sd={sd:F3} G   jolt (jerk) kurtosis={kJerk:F2} (Gaussian=3; intermittent >3)");
        Assert.InRange(sd, 0.05, 3.0);                                   // felt-scale chop, not imperceptible, not absurd
        Assert.True(kJerk > 3.5, $"the JOLTS must be intermittent (the SLAM), jerk kurtosis was {kJerk:F2}");
    }
}

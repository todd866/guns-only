using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// F-22 keyboard feel (package a8, 2026-10-13: "laptop/keyboard is the core experience").
/// Replays real key edges (press/release timestamps) through KeyGrammar, DetentLayer and
/// AircraftSim at 354 KCAS / 10,000 ft, the feel audit's condition, and measures what a tap and
/// a hold actually do to the aeroplane.
/// </summary>
public class F22KeyboardFeelTests {
    readonly ITestOutputHelper _output;
    public F22KeyboardFeelTests(ITestOutputHelper output) => _output = output;

    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / System.Math.PI;
    const double AltitudeM = 3048.0;

    sealed class Rig {
        public readonly AircraftParams P;
        public readonly AircraftSim Sim;
        public readonly DetentLayer Detent = new(); // production default: DoctrineDeep
        public readonly KeyGrammar Keys = new();
        public double TimeMs;

        public Rig(AircraftParams? p = null) {
            P = p ?? FlightModel.F22APublicDataSurrogate;
            double tas = AirData.TrueAirspeedForCalibratedAirspeedMps(354.0 * 0.514444, AltitudeM);
            Sim = new AircraftSim(new AircraftState(new Vec3D(0, AltitudeM, 0), tas,
                0.0, 0.0, 0.0, P.MassKg), P);
        }

        public void Set(GKey key, bool down) => Keys.Feed(key, down, TimeMs);

        public void Step() {
            Detent.AirspeedMps = Sim.AirspeedMps;
            Detent.MeasuredAngleOfAttackRad = Sim.AngleOfAttackRad;
            Detent.Tick(Keys, TimeMs, Sim.State, P,
                new DoctrineAdvice(3.2, 0.0, "keyboard feel fixture"), Dt);
            Sim.Step(Detent.Command, Dt);
            TimeMs += Dt * 1000.0;
        }

        public void Run(double seconds, System.Action? each = null) {
            int n = (int)System.Math.Round(seconds * AircraftSim.TickHz);
            for (int i = 0; i < n; i++) { Step(); each?.Invoke(); }
        }

        public Vec3D Forward => Sim.State.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
        public Vec3D Up => Sim.State.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
        public double PitchDeg => System.Math.Asin(System.Math.Clamp(Forward.Y, -1, 1)) * Deg;
        /// Bank about the body forward axis relative to the local vertical (level-ish flight).
        public double BankDeg {
            get {
                Vec3D f = Forward;
                Vec3D up0 = (new Vec3D(0, 1, 0) - f * f.Y).Normalized();
                Vec3D right0 = up0.Cross(f).Normalized();
                return System.Math.Atan2(Up.Dot(right0), Up.Dot(up0)) * Deg;
            }
        }
    }

    /// Hold a key for holdMs (tick-quantised as a browser edge would be), then settle.
    static (double bankDeg, double pitchDeg, double peakG, double peakRate) Tap(GKey key, double holdMs,
        double settleS = 2.0, AircraftParams? p = null) {
        var rig = new Rig(p);
        rig.Run(0.25);
        double bank0 = rig.BankDeg, pitch0 = rig.PitchDeg, peakG = 0, peakRate = 0;
        rig.Set(key, true);
        double end = rig.TimeMs + holdMs;
        while (rig.TimeMs < end) {
            rig.Step();
            peakG = System.Math.Max(peakG, rig.Sim.LastNz);
            peakRate = System.Math.Max(peakRate, System.Math.Abs(rig.Sim.State.BodyRates.P * Deg));
        }
        rig.Set(key, false);
        rig.Run(settleS, () => {
            peakG = System.Math.Max(peakG, rig.Sim.LastNz);
            peakRate = System.Math.Max(peakRate, System.Math.Abs(rig.Sim.State.BodyRates.P * Deg));
        });
        // Pitch is reported as the change in nose direction in the pitch plane; at 1 G level the
        // flight path hardly moves in 2 s, so attitude change is the aim correction delivered.
        return (rig.BankDeg - bank0, rig.PitchDeg - pitch0, peakG, peakRate);
    }

    static double[] TimesToG(double[] levels, double holdS = 1.5, AircraftParams? p = null) {
        var rig = new Rig(p);
        rig.Run(0.25);
        rig.Set(GKey.PullUp, true);
        var times = new double[levels.Length];
        for (int i = 0; i < times.Length; i++) times[i] = double.NaN;
        double t = 0;
        rig.Run(holdS, () => {
            t += Dt;
            for (int i = 0; i < levels.Length; i++)
                if (double.IsNaN(times[i]) && rig.Sim.LastNz >= levels[i]) times[i] = t;
        });
        return times;
    }

    static double PeakKeyRollRate(double holdS = 1.0, AircraftParams? p = null) {
        var rig = new Rig(p);
        rig.Run(0.25);
        rig.Set(GKey.RollRight, true);
        double peak = 0;
        rig.Run(holdS, () => peak = System.Math.Max(peak, rig.Sim.State.BodyRates.P * Deg));
        return peak;
    }

    [Fact]
    public void Report() {
        foreach (double ms in new[] { 40.0, 60.0, 80.0, 100.0, 120.0, 150.0, 200.0, 300.0, 500.0 }) {
            var roll = Tap(GKey.RollRight, ms);
            var pull = Tap(GKey.PullUp, ms);
            var push = Tap(GKey.PushDown, ms);
            _output.WriteLine($"{ms,4} ms  roll {roll.bankDeg,7:F2} deg (peak {roll.peakRate,6:F1} deg/s)"
                + $"  pull {pull.pitchDeg,6:F2} deg (peak {pull.peakG:F2} G)  push {push.pitchDeg,6:F2} deg");
        }
        double[] levels = { 2, 5, 8, 8.8 };
        double[] t = TimesToG(levels);
        _output.WriteLine($"full pull: 2/5/8/8.8 G at {t[0]:F3}/{t[1]:F3}/{t[2]:F3}/{t[3]:F3} s");
        _output.WriteLine($"full roll peak {PeakKeyRollRate():F1} deg/s");
    }

    [Fact]
    public void KidHoldsReport() {
        // Held roll 5 s (a child leaning on the arrow), then release.
        var rig = new Rig();
        rig.Run(0.25);
        double alt0 = rig.Sim.State.Position.Y;
        rig.Set(GKey.RollRight, true);
        rig.Run(5.0);
        rig.Set(GKey.RollRight, false);
        double altHold = rig.Sim.State.Position.Y;
        rig.Run(1.0);
        _output.WriteLine($"held roll 5 s: alt {altHold - alt0:F0} m, +1 s {rig.Sim.State.Position.Y - alt0:F0} m, rate after 1 s {rig.Sim.State.BodyRates.P * Deg:F1} deg/s, pitch {rig.PitchDeg:F1}");
        // Held roll + pull 5 s.
        rig = new Rig();
        rig.Run(0.25);
        alt0 = rig.Sim.State.Position.Y;
        rig.Set(GKey.RollRight, true); rig.Set(GKey.PullUp, true);
        double minAlt = alt0;
        rig.Run(5.0, () => minAlt = System.Math.Min(minAlt, rig.Sim.State.Position.Y));
        _output.WriteLine($"held roll+pull 5 s: min alt {minAlt - alt0:F0} m, end {rig.Sim.State.Position.Y - alt0:F0} m, kcas {AirData.IndicatedAirspeedMps(rig.Sim.AirspeedMps, rig.Sim.State.Position.Y) * AirData.MpsToKnots:F0}");
        // Held pull from slow.
        var p = FlightModel.F22APublicDataSurrogate;
        var slow = new Rig();
        slow.Run(0.1);
        double maxAlpha = 0;
        slow.Set(GKey.PullUp, true);
        slow.Run(10.0, () => maxAlpha = System.Math.Max(maxAlpha, slow.Sim.AngleOfAttackRad * Deg));
        _output.WriteLine($"held pull 10 s: max alpha {maxAlpha:F1} deg (CLmax alpha {p.CLMax / p.CLAlpha * Deg:F1}), kcas {AirData.IndicatedAirspeedMps(slow.Sim.AirspeedMps, slow.Sim.State.Position.Y) * AirData.MpsToKnots:F0}, recovery {slow.Detent.HighAlphaRecoveryActive}");
    }

    static readonly AircraftParams BangBang = FlightModel.F22APublicDataSurrogate with {
        KeyboardRollRampSeconds = 0.0, KeyboardPitchRampSeconds = 0.0 };

    [Fact]
    public void AHumanTapIsAFineCorrection() {
        // 100 ms is a quick human key tap. Before (bang-bang): 2.2 deg nose; now about half.
        // Roll deliberately stays bang-bang (child-pilot receipt): ~8.5 deg per 100 ms tap.
        var roll = Tap(GKey.RollRight, 100);
        var pull = Tap(GKey.PullUp, 100);
        Assert.InRange(pull.pitchDeg, 0.6, 1.5);
        Assert.True(Tap(GKey.PullUp, 100, p: BangBang).pitchDeg > 1.8, "sensitivity: old law");
        Assert.Equal(Tap(GKey.RollRight, 100, p: BangBang).bankDeg, roll.bankDeg, 6);
        // Monotonic: a longer press always gives a larger correction.
        double prevRoll = 0, prevPitch = 0;
        foreach (double ms in new[] { 40.0, 80.0, 120.0, 200.0, 300.0, 500.0 }) {
            var r = Tap(GKey.RollRight, ms); var q = Tap(GKey.PullUp, ms);
            Assert.True(r.bankDeg > prevRoll && q.pitchDeg > prevPitch, $"non-monotonic at {ms} ms");
            prevRoll = r.bankDeg; prevPitch = q.pitchDeg;
        }
    }

    [Fact]
    public void AHoldStillReachesFullAuthority() {
        Assert.InRange(PeakKeyRollRate(), 185.0, 205.0);
        double[] t = TimesToG(new double[] { 8.0, 8.8 });
        double[] before = TimesToG(new double[] { 8.0, 8.8 }, p: BangBang);
        // Feel audit: 9 G in ~0.95 s. The ramp may cost at most ~0.1 s of G onset.
        Assert.True(t[0] <= 0.85 && t[1] <= 1.05, $"8/8.8 G at {t[0]:F3}/{t[1]:F3} s");
        Assert.True(t[1] - before[1] <= 0.10, $"8.8 G {t[1]:F3} s vs {before[1]:F3} s before");
    }

    [Fact]
    public void ReleasingAHeldRollStopsPromptly() {
        var rig = new Rig();
        rig.Run(0.25);
        rig.Set(GKey.RollRight, true);
        rig.Run(0.6);
        rig.Set(GKey.RollRight, false);
        double bankAtRelease = rig.BankDeg;
        rig.Run(0.2);
        Assert.True(System.Math.Abs(rig.Sim.State.BodyRates.P * Deg) < 5.0,
            $"still rolling {rig.Sim.State.BodyRates.P * Deg:F1} deg/s 0.2 s after release");
        Assert.True(System.Math.Abs(rig.BankDeg - bankAtRelease) < 15.0, "rolled on past the release");
    }

    [Fact]
    public void AChildLeaningOnTheKeysCannotDepartTheJet() {
        // Owner addendum: the core player is a child. Coarse holds must stay recoverable.
        var p = FlightModel.F22APublicDataSurrogate;
        var rig = new Rig();
        rig.Run(0.25);
        double alt0 = rig.Sim.State.Position.Y;
        rig.Set(GKey.RollRight, true);
        rig.Run(5.0);
        rig.Set(GKey.RollRight, false);
        rig.Run(1.0);
        Assert.True(rig.Sim.State.Position.Y - alt0 > -300.0, "a held roll fell out of the sky");
        Assert.True(System.Math.Abs(rig.Sim.State.BodyRates.P * Deg) < 2.0, "did not stop after release");

        var pull = new Rig();
        pull.Run(0.1);
        double maxAlpha = 0;
        pull.Set(GKey.PullUp, true); pull.Set(GKey.RollRight, true);
        pull.Run(10.0, () => maxAlpha = System.Math.Max(maxAlpha, pull.Sim.AngleOfAttackRad * Deg));
        Assert.True(maxAlpha < p.CLMax / p.CLAlpha * Deg + 2.0, $"held pull reached {maxAlpha:F1} deg alpha");
        Assert.False(pull.Detent.HighAlphaRecoveryActive);
        Assert.False(pull.Detent.Command.EnvelopeOverride);
    }

    [Fact]
    public void OnlyTheF22RampsItsKeys() {
        Assert.Equal(0.0, FlightModel.F35CPublicDataCarrierSurrogate.KeyboardRollRampSeconds);
        Assert.Equal(0.0, FlightModel.RapierPublicDataSurrogate.KeyboardPitchRampSeconds);
        Assert.Equal(0.0, FlightModel.UcavInterceptorSurrogate.KeyboardRollRampSeconds);
        Assert.True(FlightModel.F22APublicDataSurrogate.KeyboardPitchRampSeconds > 0.0);
        Assert.Equal(0.0, FlightModel.F22APublicDataSurrogate.KeyboardRollRampSeconds);
    }
}

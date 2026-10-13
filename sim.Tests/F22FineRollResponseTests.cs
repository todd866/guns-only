using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// F-22 fine-roll centre response (feel audit 2026-10-13, finding 3). The phone flight stick is
/// 112 px across: a 56 px radius with a 12 % radial deadzone and a linear remap in the browser
/// (render/input/mobile_virtual_stick.js). These tests replay that exact projection through the
/// real DetentLayer and AircraftSim at 354 KCAS / 10,000 ft and measure the roll rate per pixel.
/// </summary>
public class F22FineRollResponseTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / System.Math.PI;
    const double AltitudeM = 3048.0;
    const double StickRadiusPx = 56.0;
    const double StickDeadzone = 0.12;

    /// <summary>The browser's mobileVirtualStickState for a pure lateral displacement.</summary>
    static double StickValueForPixels(double px) {
        double magnitude = System.Math.Min(1.0, System.Math.Abs(px) / StickRadiusPx);
        if (magnitude <= StickDeadzone) return 0.0;
        return System.Math.Sign(px) * (magnitude - StickDeadzone) / (1.0 - StickDeadzone);
    }

    static AircraftState Cruise(in AircraftParams p) {
        double tas = AirData.TrueAirspeedForCalibratedAirspeedMps(354.0 * 0.514444, AltitudeM);
        return new AircraftState(new Vec3D(0, AltitudeM, 0), tas, 0.0, 0.0, 0.0, p.MassKg);
    }

    /// <summary>Mean roll rate (deg/s) over the last half second of a 1.5 s analog hold.</summary>
    static double SettledRollRate(in AircraftParams p, double stick) {
        var sim = new AircraftSim(Cruise(p), p);
        var detent = new DetentLayer { Variant = ValleyVariant.PhysicsOnly };
        var keys = new KeyGrammar();
        double timeMs = 0.0, sum = 0.0;
        int samples = 0;
        int ticks = (int)(1.5 * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            detent.SetAnalogRollControl(stick);
            detent.Tick(keys, timeMs, sim.State, p, new DoctrineAdvice(4.2, 0.9, "fine roll"), Dt);
            sim.Step(detent.Command, Dt);
            timeMs += Dt * 1000.0;
            if (i >= ticks - AircraftSim.TickHz / 2) {
                sum += sim.State.BodyRates.P * Deg;
                samples++;
            }
        }
        return sum / samples;
    }

    static double[] PixelSweep(in AircraftParams p, int maxPx = 15) {
        var rates = new double[maxPx + 1];
        for (int px = 0; px <= maxPx; px++) rates[px] = SettledRollRate(p, StickValueForPixels(px));
        return rates;
    }

    static string Describe(double[] rates) =>
        string.Join(", ", System.Linq.Enumerable.Select(rates, (r, i) => $"{i}px {r:F2}"));

    [Fact]
    public void CentreResponseIsMonotonicAndAtMostTwoDegreesPerSecondPerPixel() {
        double[] rates = PixelSweep(FlightModel.F22APublicDataSurrogate);
        for (int px = 1; px < rates.Length; px++) {
            double step = rates[px] - rates[px - 1];
            Assert.True(step >= -0.05, $"non-monotonic at {px}px: {Describe(rates)}");
            Assert.True(step <= 2.0, $"{step:F2} deg/s step at {px}px: {Describe(rates)}");
        }
        // Still a usable roll by the end of the fine region, not a dead stick.
        Assert.True(rates[^1] >= 10.0, $"15 px only reached {rates[^1]:F2} deg/s");
    }

    [Fact]
    public void TheOldLawHadTheGainStepThisGuards() {
        // Sensitivity check: the pre-fix law (0.05 hold fade, linear stick) must fail the same
        // criterion, otherwise the test above could pass for the wrong reason.
        var old = FlightModel.F22APublicDataSurrogate with {
            RollHoldDeadband = 0.05, AnalogRollCentreExpo = 0.0,
        };
        double[] rates = PixelSweep(old);
        double worst = 0.0;
        for (int px = 1; px < rates.Length; px++)
            worst = System.Math.Max(worst, rates[px] - rates[px - 1]);
        Assert.True(worst > 4.0, $"old law no longer reproduces the step: {Describe(rates)}");
    }

    static double PeakFullStickRollRate(in AircraftParams p) {
        var sim = new AircraftSim(Cruise(p), p);
        var detent = new DetentLayer { Variant = ValleyVariant.PhysicsOnly };
        var keys = new KeyGrammar();
        double timeMs = 0.0, peak = 0.0;
        for (int i = 0; i < AircraftSim.TickHz; i++) {
            detent.SetAnalogRollControl(1.0);
            detent.Tick(keys, timeMs, sim.State, p, new DoctrineAdvice(4.2, 0.9, "full roll"), Dt);
            sim.Step(detent.Command, Dt);
            timeMs += Dt * 1000.0;
            peak = System.Math.Max(peak, sim.State.BodyRates.P * Deg);
        }
        return peak;
    }

    [Fact]
    public void FullStickRollAuthorityIsRetained() {
        var p = FlightModel.F22APublicDataSurrogate;
        double peak = PeakFullStickRollRate(p);
        double before = PeakFullStickRollRate(p with {
            RollHoldDeadband = 0.05, AnalogRollCentreExpo = 0.0,
        });
        // Same full-stick authority as before the centre reshaping (the audit's keyboard trial
        // peaked at 188.6 deg/s; this rig's 1 s analog hold peaks slightly higher).
        Assert.InRange(peak, 175.0, 200.0);
        Assert.Equal(before, peak, 1);
    }

    [Fact]
    public void ReleasingAFineRollStopsWithoutHunting() {
        var p = FlightModel.F22APublicDataSurrogate;
        var sim = new AircraftSim(Cruise(p), p);
        var detent = new DetentLayer { Variant = ValleyVariant.PhysicsOnly };
        var keys = new KeyGrammar();
        double timeMs = 0.0;
        void Run(double stick, double seconds, System.Action<double>? observe = null) {
            for (int i = 0; i < (int)(seconds * AircraftSim.TickHz); i++) {
                if (stick == 0.0) detent.ClearAnalogRollControl();
                else detent.SetAnalogRollControl(stick);
                detent.Tick(keys, timeMs, sim.State, p, new DoctrineAdvice(4.2, 0.9, "release"), Dt);
                sim.Step(detent.Command, Dt);
                timeMs += Dt * 1000.0;
                observe?.Invoke(sim.State.BodyRates.P * Deg);
            }
        }
        Run(StickValueForPixels(15), 1.5);
        var after = new System.Collections.Generic.List<double>();
        Run(0.0, 2.0, after.Add);
        int signChanges = 0;
        for (int i = 1; i < after.Count; i++) {
            if (System.Math.Abs(after[i]) > 0.2 && System.Math.Abs(after[i - 1]) > 0.2
                && System.Math.Sign(after[i]) != System.Math.Sign(after[i - 1])) signChanges++;
        }
        Assert.True(System.Math.Abs(after[(int)(0.5 * AircraftSim.TickHz)]) < 1.0,
            $"still rolling {after[(int)(0.5 * AircraftSim.TickHz)]:F2} deg/s 0.5 s after release");
        Assert.True(signChanges <= 1, $"roll hunted through zero {signChanges} times");
        Assert.True(System.Math.Abs(after[^1]) < 0.2, $"residual roll {after[^1]:F2} deg/s");
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(0.3)]
    [InlineData(-0.7)]
    [InlineData(1.0)]
    public void ExpoIsOddMonotonicAndKeepsTheEndpoints(double x) {
        Assert.Equal(x, DetentLayer.ShapeAnalogRoll(x, 0.0), 12);
        double shaped = DetentLayer.ShapeAnalogRoll(x, 0.65);
        Assert.Equal(-shaped, DetentLayer.ShapeAnalogRoll(-x, 0.65), 12);
        Assert.True(System.Math.Abs(shaped) <= System.Math.Abs(x) + 1e-12);
        Assert.Equal(1.0, DetentLayer.ShapeAnalogRoll(1.0, 0.65), 12);
        Assert.True(DetentLayer.ShapeAnalogRoll(x + 0.01, 0.65) > shaped - 1e-12);
    }

    [Fact]
    public void OnlyTheF22OptsIn() {
        Assert.Equal(0.0, FlightModel.Sabre.AnalogRollCentreExpo);
        Assert.Equal(0.0, FlightModel.RapierPublicDataSurrogate.AnalogRollCentreExpo);
        Assert.Equal(0.0, FlightModel.F14APublicDataSurrogate.AnalogRollCentreExpo);
        Assert.Equal(0.05, FlightModel.RapierPublicDataSurrogate.RollHoldDeadband);
        Assert.Equal(0.05, FlightModel.F35CPublicDataCarrierSurrogate.RollHoldDeadband);
        Assert.Equal(0.0, FlightModel.UcavInterceptorSurrogate.AnalogRollCentreExpo);
        Assert.Equal(0.05, FlightModel.UcavInterceptorSurrogate.RollHoldDeadband);
    }
}

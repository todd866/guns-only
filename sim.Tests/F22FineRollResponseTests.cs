using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// F-22 fine-roll centre response (feel audit 2026-10-13, finding 3). The phone flight stick is
/// 112 px across: a 56 px radius with a 12 % radial deadzone and a linear remap in the browser
/// (render/input/mobile_virtual_stick.js). These tests replay that exact projection through the
/// real DetentLayer and AircraftSim at 354 KCAS / 10,000 ft and measure the roll rate per pixel.
/// </summary>
public class F22FineRollResponseTests {
    readonly ITestOutputHelper _output;
    public F22FineRollResponseTests(ITestOutputHelper output) => _output = output;

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
    public void CentreResponseIsMonotonicAndAtMostFourDegreesPerSecondPerPixel() {
        // Approved gameplay trade-off (2026-10-13): the cubic curve met 2 deg/s/px but
        // converted O1 only 1/8. Linear stick measures ~3.9 deg/s/px and converts 8/8.
        // Keep the sub-pixel hold fade, monotonic response and unchanged full authority.
        double[] rates = PixelSweep(FlightModel.F22APublicDataSurrogate);
        for (int px = 1; px < rates.Length; px++) {
            double step = rates[px] - rates[px - 1];
            Assert.True(step >= -0.05, $"non-monotonic at {px}px: {Describe(rates)}");
            Assert.True(step <= 4.0, $"{step:F2} deg/s step at {px}px: {Describe(rates)}");
        }
        _output.WriteLine(Describe(rates));
        // Still a usable roll by the end of the fine region, not a dead stick.
        Assert.True(rates[^1] >= 10.0, $"15 px only reached {rates[^1]:F2} deg/s");
    }

    [Fact]
    public void TheOldLawHadTheGainStepThisGuards() {
        // Sensitivity check: the pre-fix law (0.05 hold fade, linear stick) must fail the same
        // criterion, otherwise the test above could pass for the wrong reason.
        var old = FlightModel.F22APublicDataSurrogate with {
            RollHoldDeadband = 0.05,
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
            RollHoldDeadband = 0.05,
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
        // Linear 15 px input leaves a larger bank than the rejected curve. The turning
        // aircraft has a small residual body-axis rate (-0.21 deg/s in this rig); guard
        // sustained settling and at most one damped crossing rather than requiring an exactly motionless bank.
        double settledPeak = System.Linq.Enumerable.Max(
            System.Linq.Enumerable.Skip(after, (int)(AircraftSim.TickHz / 2)), System.Math.Abs);
        _output.WriteLine($"release: 0.5s={after[(int)(AircraftSim.TickHz / 2)]:F3}, end={after[^1]:F3}, settled peak={settledPeak:F3} deg/s; sign changes={signChanges}");
        Assert.True(settledPeak < 1.0, $"roll did not stay settled: {settledPeak:F3} deg/s");
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(0.3)]
    [InlineData(-0.7)]
    [InlineData(1.0)]
    public void AnalogRollAndAssistIntentRemainLinear(double x) {
        var p = FlightModel.F22APublicDataSurrogate;
        var detent = new DetentLayer { Variant = ValleyVariant.PhysicsOnly };
        detent.SetAnalogRollControl(x);
        detent.Tick(new KeyGrammar(), 0.0, Cruise(p), p,
            new DoctrineAdvice(4.2, 0.9, "linear roll"), Dt);
        Assert.Equal(x, detent.Command.RollControl, 12);
        Assert.Equal(x, detent.PilotRollIntent, 12);
    }

    [Fact]
    public void OnlyTheF22UsesTheSubPixelHoldFade() {
        Assert.Equal(0.005, FlightModel.F22APublicDataSurrogate.RollHoldDeadband);
        Assert.Equal(0.05, FlightModel.RapierPublicDataSurrogate.RollHoldDeadband);
        Assert.Equal(0.05, FlightModel.F35CPublicDataCarrierSurrogate.RollHoldDeadband);
        Assert.Equal(0.05, FlightModel.UcavInterceptorSurrogate.RollHoldDeadband);
    }
}

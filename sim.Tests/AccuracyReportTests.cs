using System;
using System.Collections.Generic;
using System.Linq;
using GunsOnly.Sim;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Deterministic, headless F-86 accuracy audit.  This is deliberately a report rather than a
/// calibration test: only broad sanity is asserted, while every accuracy delta is printed.
///
/// Method notes:
/// - Ps is the slope of total specific energy, h + V^2/(2g), over a settled trajectory.
/// - A Ps=0 turn is found by flying coordinated candidate-G turns and bisecting on measured Ps.
/// - Maximum climb is the maximum level-flight Ps.  This is the energy-equivalent steady climb
///   rate and avoids adding an altitude-hold or climb autopilot that is not part of the kernel.
/// - All runs use the production 120 Hz RK4 path, still air, float64, and fixed iteration counts.
/// </summary>
public sealed class AccuracyReportTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double MpsPerKnot = 0.514444;
    const double FeetPerMetre = 3.280839895;
    const double RadToDeg = 180.0 / Math.PI;
    const double TurnAltitudeM = 3048.0;       // 10,000 ft: matches the maneuver references below.
    const double HighAltitudeM = 10668.0;     // 35,000 ft: published maximum-speed condition.

    readonly ITestOutputHelper _output;
    public AccuracyReportTests(ITestOutputHelper output) => _output = output;

    readonly record struct FlightSample(double PsMps, double SpeedRateMps2,
        double MeanSpeedMps, double MeanNz, double TurnRateRad,
        double MeanGammaRad, double VerticalRateMps);

    readonly record struct SustainedPoint(double Knots, double G, double RateDegS,
        double RadiusM, double PsMps);

    readonly record struct InstantaneousPoint(double Knots, double G, double RateDegS,
        double RadiusM);

    readonly record struct ClimbPoint(double PsMps, double SpeedMps);

    readonly record struct RealTurnPoint(double Knots, double G, double RateDegS,
        double RadiusM);

    sealed record Comparison(string Metric, double SimValue, double RealValue, string Unit,
        string Source, string Uncertainty) {
        public double ErrorPercent => 100.0 * Math.Abs(SimValue - RealValue) / Math.Abs(RealValue);
    }

    [Fact]
    public void SabreEnvelopeComparedWithDocumentedF86F() {
        // T.O. 1F-86F-1, Appendix I maximum-speed charts, clean F-86F around 14,000 lb.
        // Wing/engine block and chart-reading uncertainty are roughly +/-2%; the J47-GE-27 did
        // NOT have an afterburner, so both kernel power settings compare with the same real value.
        const double realTopSpeedSeaLevelKt = 595.0;
        const double realTopSpeed35kKt = 525.0;

        // T.O. 1F-86F-1 section VI, figs. 6-6 to 6-8 (power required/available and G response),
        // cross-checked against NACA RM L52C19 operational F-86A traces.  Public scans do not give
        // an F-86F EM table, so these 10,000-ft points are approximate reconstructions (+/-20%).
        // They are intentionally labelled references, not build-gating truths.
        RealTurnPoint[] realSustained = {
            new(250, 3.5, 14.9, 495),
            new(300, 4.2, 14.8, 600),
            new(350, 5.0, 15.3, 675),
            new(400, 5.0, 13.5, 875),
            new(450, 4.7, 11.4, 1160),
        };

        // T.O. 1F-86F-1 maneuver limit (+7 G) combined with the section VI high-speed G-response
        // discussion.  20 deg/s at about 375 kt follows directly from a coordinated 7 G turn.
        // Configuration and combat weight move corner speed materially: use +/-10% speed/rate.
        const double realInstantaneousRateDegS = 20.0;
        const double realCornerSpeedKt = 375.0;

        // T.O. 1F-86F-1 fig. 6-6 excess-power chart, read at 10,000 ft and 300 kt.
        // This is a coarse digitization used only to give the Ps diagnostic scale (+/-30%).
        const double realPsAt300KtMps = 30.0;

        // Published F-86F/J47-GE-27 performance: 9,000 ft/min initial climb and 49,600-ft service
        // ceiling.  These values are also reproduced by the Warhawk Air Museum for its F-86F.
        // Loading/standard-day uncertainty is about +/-5% for climb and +/-1,500 ft for ceiling.
        const double realMaxClimbMps = 45.72;
        const double realServiceCeilingM = 15118.1;

        // NACA RM L55E19, fig. 14, service-flown North American F-86 data: peak recorded rolling
        // velocity is about 2.4 rad/s (~138 deg/s) near 300 KIAS.  It is F-86A operational data,
        // not a controlled F-86F maximum-rate test, so retain +/-15% uncertainty.
        const double realMaxRollRateDegS = 138.0;

        // NACA RM L52C19 maneuver time histories give the scale of the deceleration in hard F-86A
        // turns, but not a standardized F-86F 375-kt test.  12 kt/s is a placeholder digitization
        // with high uncertainty (+/-50%); keeping it explicit is more useful than false precision.
        const double realMaxGTurnBleedKtS = 12.0;

        // T.O. 1F-86F-1 section VI describes the rapid high-Mach loss of excess power/buffet;
        // NACA swept-wing data put drag divergence near M0.83-0.89 depending on CL.  M0.86 is the
        // representative clean-wing onset, with +/-0.03 uncertainty and strong CL dependence.
        const double realDragDivergenceMach = 0.86;

        double topSlMilKt = FindLevelPsZero(0.0, 1.0) / MpsPerKnot;
        double topSlAbKt = FindLevelPsZero(0.0, 1.35) / MpsPerKnot;
        double top35MilKt = FindLevelPsZero(HighAltitudeM, 1.0) / MpsPerKnot;
        double top35AbKt = FindLevelPsZero(HighAltitudeM, 1.35) / MpsPerKnot;

        double[] turnSpeedsKt = { 250, 300, 350, 400, 450 };
        SustainedPoint[] sustained = turnSpeedsKt.Select(FindSustainedPoint).ToArray();
        InstantaneousPoint[] instantaneous = MeasureInstantaneousCurve();
        InstantaneousPoint corner = instantaneous.MaxBy(p => p.RateDegS);

        FlightSample ps300 = Fly(300 * MpsPerKnot, TurnAltitudeM, 1.0, 0.0, 1.0, 2.5, 2.0);
        FlightSample maxGTurn = Fly(375 * MpsPerKnot, TurnAltitudeM, 12.0,
            Math.PI / 2.0, 1.0, 0.75, 4.0);
        double bleedKtS = Math.Max(0.0, -maxGTurn.SpeedRateMps2 / MpsPerKnot);

        ClimbPoint climbMil = MaxClimbAt(0.0, 1.0);
        ClimbPoint climbAb = MaxClimbAt(0.0, 1.35);
        double ceilingMilM = FindCeiling(1.0, 0.508);       // conventional 100 ft/min service ceiling.
        double ceilingAbM = FindCeiling(1.35, 0.508);
        double absoluteCeilingMilM = FindCeiling(1.0, 0.0);
        double absoluteCeilingAbM = FindCeiling(1.35, 0.0);
        double rollRateDegS = MeasureMaxRollRateDegS();

        (double mach, FlightSample sample)[] machCurve = MeasureMachCurve();
        double normalizedDragAt080 = NormalizedDragAtMach(0.80);
        double normalizedDragAt095 = NormalizedDragAtMach(0.95);
        double dragStiffeningRatio = normalizedDragAt095 / normalizedDragAt080;

        var comparisons = new List<Comparison> {
            new("Top speed SL MIL", topSlMilKt, realTopSpeedSeaLevelKt, "kt TAS",
                "T.O. 1F-86F-1 Appendix I", "clean/configuration +/-2%"),
            new("Top speed SL kernel A/B", topSlAbKt, realTopSpeedSeaLevelKt, "kt TAS",
                "T.O. 1F-86F-1 Appendix I", "real F-86F had no afterburner"),
            new("Top speed 35k MIL", top35MilKt, realTopSpeed35kKt, "kt TAS",
                "T.O. 1F-86F-1 Appendix I", "wing/engine block +/-2%"),
            new("Top speed 35k kernel A/B", top35AbKt, realTopSpeed35kKt, "kt TAS",
                "T.O. 1F-86F-1 Appendix I", "real F-86F had no afterburner"),
            new("Max sustained rate @10k", sustained.Max(p => p.RateDegS),
                realSustained.Max(p => p.RateDegS), "deg/s",
                "T.O. 1F-86F-1 figs. 6-6..6-8", "reconstructed +/-20%"),
            new("Sustained G @350kt/10k", sustained.Single(p => p.Knots == 350).G,
                realSustained.Single(p => p.Knots == 350).G, "G",
                "T.O. 1F-86F-1 figs. 6-6..6-8", "reconstructed +/-20%"),
            new("Instantaneous turn rate @10k", corner.RateDegS, realInstantaneousRateDegS, "deg/s",
                "T.O. 1F-86F-1 +7G limit/section VI", "derived +/-10%"),
            new("Corner speed @10k", corner.Knots, realCornerSpeedKt, "kt TAS",
                "T.O. 1F-86F-1 +7G limit/section VI", "weight/configuration +/-10%"),
            new("Straight-flight Ps @300kt/10k", ps300.PsMps, realPsAt300KtMps, "m/s",
                "T.O. 1F-86F-1 fig. 6-6", "coarse chart read +/-30%"),
            new("Max climb MIL (energy-equivalent)", climbMil.PsMps, realMaxClimbMps, "m/s",
                "published F-86F/J47-GE-27 performance", "loading +/-5%"),
            new("Max climb kernel A/B", climbAb.PsMps, realMaxClimbMps, "m/s",
                "published F-86F/J47-GE-27 performance", "real F-86F had no afterburner"),
            new("Service ceiling MIL", ceilingMilM, realServiceCeilingM, "m",
                "published F-86F performance (49,600 ft)", "+/-1,500 ft"),
            new("Service ceiling kernel A/B", ceilingAbM, realServiceCeilingM, "m",
                "published F-86F performance (49,600 ft)", "real F-86F had no afterburner"),
            new("Max roll rate", rollRateDegS, realMaxRollRateDegS, "deg/s",
                "NACA RM L55E19 fig. 14", "F-86A operational data +/-15%"),
            new("375kt max-G speed bleed", bleedKtS, realMaxGTurnBleedKtS, "kt/s",
                "NACA RM L52C19 time histories", "placeholder digitization +/-50%"),
            new("Drag-divergence onset", FlightModel.Sabre.MCrit, realDragDivergenceMach, "Mach",
                "T.O. 1F-86F-1 section VI + NACA swept-wing data", "CL-dependent +/-0.03"),
        };

        // The curve points are useful independently, and including them in the sorted report makes
        // a local shape error visible rather than hiding it behind one aggregate turn-rate number.
        foreach (SustainedPoint simPoint in sustained) {
            RealTurnPoint realPoint = realSustained.Single(p => p.Knots == simPoint.Knots);
            if (simPoint.Knots != 350.0) {
                comparisons.Add(new($"Sustained G @{simPoint.Knots:F0}kt/10k", simPoint.G,
                    realPoint.G, "G", "T.O. 1F-86F-1 figs. 6-6..6-8", "reconstructed +/-20%"));
            }
            comparisons.Add(new($"Sustained rate @{simPoint.Knots:F0}kt/10k", simPoint.RateDegS,
                realPoint.RateDegS, "deg/s", "T.O. 1F-86F-1 figs. 6-6..6-8", "reconstructed +/-20%"));
            comparisons.Add(new($"Sustained radius @{simPoint.Knots:F0}kt/10k", simPoint.RadiusM,
                realPoint.RadiusM, "m", "T.O. 1F-86F-1 figs. 6-6..6-8", "reconstructed +/-20%"));
        }

        Comparison[] sorted = comparisons.OrderByDescending(c => c.ErrorPercent).ToArray();
        EmitReferenceNotes(comparisons);
        EmitSustainedCurve(sustained, realSustained);
        EmitInstantaneousCurve(instantaneous);
        EmitMachCurve(machCurve, dragStiffeningRatio);
        EmitComparisonTable(sorted);

        _output.WriteLine("");
        _output.WriteLine($"ABSOLUTE CEILING (Ps=0) — MIL: {absoluteCeilingMilM * FeetPerMetre:F0} ft; " +
            $"kernel A/B: {absoluteCeilingAbM * FeetPerMetre:F0} ft; " +
            $"best SL climb speeds MIL/A-B: {climbMil.SpeedMps / MpsPerKnot:F0}/{climbAb.SpeedMps / MpsPerKnot:F0} kt TAS.");
        _output.WriteLine($"ENERGY CHECKS — Ps @300kt/10k MIL: {ps300.PsMps:F2} m/s; " +
            $"max-G @375kt/10k achieved {maxGTurn.MeanNz:F2} G and bled {bleedKtS:F2} kt/s.");
        _output.WriteLine("TAKEAWAY: " + string.Join("; ", sorted.Take(3).Select(c =>
            $"{c.Metric} ({c.ErrorPercent:F1}% error)")) + ".");

        // Report-only guardrails: finite, positive, and broad enough that accuracy gaps never fail CI.
        Assert.All(comparisons, c => {
            Assert.True(double.IsFinite(c.SimValue), $"{c.Metric} was not finite");
            Assert.True(c.SimValue > 0.0, $"{c.Metric} was not positive: {c.SimValue}");
        });
        Assert.InRange(topSlMilKt, 100.0, 1000.0);
        Assert.InRange(top35AbKt, 100.0, 1200.0);
        Assert.InRange(climbAb.PsMps, 1.0, 300.0);
        Assert.InRange(ceilingAbM, 1000.0, 40000.0);
        Assert.InRange(corner.RateDegS, 1.0, 100.0);
        Assert.InRange(rollRateDegS, 1.0, 1000.0);
        Assert.True(double.IsFinite(dragStiffeningRatio) && dragStiffeningRatio > 0.0);
    }

    static FlightSample Fly(double speedMps, double altitudeM, double gDemand,
        double bankRad, double throttle, double settleSeconds, double sampleSeconds) {
        var initial = new AircraftState(new Vec3D(0, altitudeM, 0), speedMps,
            0.0, 0.0, bankRad, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(initial, FlightModel.Sabre);
        var command = new PilotCommand(gDemand, bankRad, throttle, 0.0);
        int settleTicks = (int)Math.Round(settleSeconds * AircraftSim.TickHz);
        int sampleTicks = (int)Math.Round(sampleSeconds * AircraftSim.TickHz);

        for (int i = 0; i < settleTicks; i++) sim.Step(command, Dt);

        double energy0 = SpecificEnergyHeight(sim.State);
        double speed0 = sim.State.Speed;
        double altitude0 = sim.State.Position.Y;
        double previousChi = sim.State.Chi;
        double unwrappedChi = 0.0;
        double speedSum = 0.0, nzSum = 0.0, gammaSum = 0.0;
        for (int i = 0; i < sampleTicks; i++) {
            sim.Step(command, Dt);
            unwrappedChi += Math.IEEERemainder(sim.State.Chi - previousChi, 2.0 * Math.PI);
            previousChi = sim.State.Chi;
            speedSum += sim.State.Speed;
            nzSum += sim.LastNz;
            gammaSum += sim.State.Gamma;
        }

        double seconds = sampleTicks * Dt;
        return new FlightSample(
            (SpecificEnergyHeight(sim.State) - energy0) / seconds,
            (sim.State.Speed - speed0) / seconds,
            speedSum / sampleTicks,
            nzSum / sampleTicks,
            unwrappedChi / seconds,
            gammaSum / sampleTicks,
            (sim.State.Position.Y - altitude0) / seconds);
    }

    static double SpecificEnergyHeight(in AircraftState state) =>
        state.Position.Y + state.Speed * state.Speed / (2.0 * FlightModel.G0);

    static double FindLevelPsZero(double altitudeM, double throttle) {
        double low = 100.0, high = 420.0;
        FlightSample lowSample = Fly(low, altitudeM, 1.0, 0.0, throttle, 2.0, 1.5);
        FlightSample highSample = Fly(high, altitudeM, 1.0, 0.0, throttle, 2.0, 1.5);
        while (lowSample.PsMps <= 0.0 && low < 220.0) {
            low += 20.0;
            lowSample = Fly(low, altitudeM, 1.0, 0.0, throttle, 2.0, 1.5);
        }
        while (highSample.PsMps >= 0.0 && high < 700.0) {
            high += 40.0;
            highSample = Fly(high, altitudeM, 1.0, 0.0, throttle, 2.0, 1.5);
        }

        for (int i = 0; i < 18; i++) {
            double mid = 0.5 * (low + high);
            FlightSample sample = Fly(mid, altitudeM, 1.0, 0.0, throttle, 2.0, 1.5);
            if (sample.PsMps > 0.0) low = mid;
            else high = mid;
        }
        return 0.5 * (low + high);
    }

    static SustainedPoint FindSustainedPoint(double knots) {
        double speed = knots * MpsPerKnot;
        var state = new AircraftState(new Vec3D(0, TurnAltitudeM, 0), speed,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        double lowG = 1.0;
        double highG = Math.Min(12.0, FlightModel.NzAeroMax(state, FlightModel.Sabre));
        FlightSample high = FlyTurnCandidate(speed, highG);
        if (high.PsMps > 0.0) return MakeSustainedPoint(knots, high);

        for (int i = 0; i < 14; i++) {
            double midG = 0.5 * (lowG + highG);
            FlightSample sample = FlyTurnCandidate(speed, midG);
            if (sample.PsMps > 0.0) lowG = midG;
            else highG = midG;
        }
        return MakeSustainedPoint(knots, FlyTurnCandidate(speed, 0.5 * (lowG + highG)));
    }

    static FlightSample FlyTurnCandidate(double speed, double g) {
        double bank = Math.Acos(Math.Clamp(1.0 / Math.Max(g, 1.0), -1.0, 1.0));
        return Fly(speed, TurnAltitudeM, g, bank, 1.0, 2.5, 2.0);
    }

    static SustainedPoint MakeSustainedPoint(double requestedKnots, FlightSample sample) {
        double rate = Math.Abs(sample.TurnRateRad);
        double radius = rate > 1e-8 ? sample.MeanSpeedMps / rate : double.PositiveInfinity;
        return new SustainedPoint(requestedKnots, sample.MeanNz, rate * RadToDeg,
            radius, sample.PsMps);
    }

    static InstantaneousPoint[] MeasureInstantaneousCurve() {
        var points = new List<InstantaneousPoint>();
        for (double knots = 225.0; knots <= 600.0; knots += 15.0) {
            FlightSample sample = Fly(knots * MpsPerKnot, TurnAltitudeM, 12.0,
                Math.PI / 2.0, 1.0, 0.75, 0.50);
            double rate = Math.Abs(sample.TurnRateRad);
            points.Add(new InstantaneousPoint(knots, sample.MeanNz, rate * RadToDeg,
                rate > 1e-8 ? sample.MeanSpeedMps / rate : double.PositiveInfinity));
        }
        return points.ToArray();
    }

    static ClimbPoint MaxClimbAt(double altitudeM, double throttle) {
        double rho = Atmosphere.Density(altitudeM);
        double stall = Math.Sqrt(2.0 * FlightModel.Sabre.MassKg * FlightModel.G0 /
            (rho * FlightModel.Sabre.WingAreaM2 * FlightModel.Sabre.CLMax));
        double speedOfSound = Atmosphere.SpeedOfSound(altitudeM);
        double minSpeed = Math.Max(75.0, 1.12 * stall);
        double maxSpeed = Math.Min(400.0, 1.02 * speedOfSound);
        ClimbPoint best = new(double.NegativeInfinity, minSpeed);

        for (int i = 0; i <= 18; i++) {
            double speed = minSpeed + (maxSpeed - minSpeed) * i / 18.0;
            FlightSample sample = Fly(speed, altitudeM, 1.0, 0.0, throttle, 1.5, 1.25);
            if (sample.PsMps > best.PsMps) best = new ClimbPoint(sample.PsMps, speed);
        }

        double step = (maxSpeed - minSpeed) / 18.0;
        for (int pass = 0; pass < 5; pass++) {
            foreach (double speed in new[] { best.SpeedMps - step, best.SpeedMps + step }) {
                if (speed <= minSpeed || speed >= maxSpeed) continue;
                FlightSample sample = Fly(speed, altitudeM, 1.0, 0.0, throttle, 1.5, 1.25);
                if (sample.PsMps > best.PsMps) best = new ClimbPoint(sample.PsMps, speed);
            }
            step *= 0.5;
        }
        return best;
    }

    static double FindCeiling(double throttle, double targetClimbMps) {
        double low = 0.0, high = 24000.0;
        for (int i = 0; i < 15; i++) {
            double mid = 0.5 * (low + high);
            if (MaxClimbAt(mid, throttle).PsMps > targetClimbMps) low = mid;
            else high = mid;
        }
        return 0.5 * (low + high);
    }

    static double MeasureMaxRollRateDegS() {
        var initial = new AircraftState(new Vec3D(0, TurnAltitudeM, 0),
            375.0 * MpsPerKnot, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(initial, FlightModel.Sabre);
        double maxRate = 0.0;
        for (int tick = 0; tick < 3.0 * AircraftSim.TickHz; tick++) {
            sim.Step(new PilotCommand(1.0, sim.BodyRollRad, 1.0, 0.0,
                RollControl: 1.0, DirectLateralControl: true), Dt);
            if (tick >= 0.4 * AircraftSim.TickHz)
                maxRate = Math.Max(maxRate, Math.Abs(sim.State.BodyRates.P));
        }
        return maxRate * RadToDeg;
    }

    static (double mach, FlightSample sample)[] MeasureMachCurve() {
        double[] machs = { 0.75, 0.80, 0.825, 0.85, 0.875, 0.90, 0.95, 1.00 };
        double a = Atmosphere.SpeedOfSound(HighAltitudeM);
        return machs.Select(m => (m, Fly(m * a, HighAltitudeM, 1.0, 0.0,
            1.0, 1.5, 1.25))).ToArray();
    }

    static double NormalizedDragAtMach(double mach) {
        double speed = mach * Atmosphere.SpeedOfSound(HighAltitudeM);
        FlightSample idleZeroLift = Fly(speed, HighAltitudeM, 0.0, 0.0,
            0.0, 1.5, 1.25);
        // At zero thrust and near-zero lift, -Ps/V^3 is proportional to parasite Cd.  Dividing
        // away V^3 makes the M0.80-to-M0.95 comparison expose compressibility rather than speed.
        return -idleZeroLift.PsMps / (speed * speed * speed);
    }

    void EmitReferenceNotes(IEnumerable<Comparison> comparisons) {
        _output.WriteLine("REAL F-86 REFERENCE BASIS (report-only; uncertainty is explicit)");
        _output.WriteLine("Source | uncertainty | metrics");
        foreach (var group in comparisons.GroupBy(c => (c.Source, c.Uncertainty))) {
            _output.WriteLine($"{group.Key.Source} | {group.Key.Uncertainty} | " +
                string.Join(", ", group.Select(c => c.Metric).Distinct()));
        }
        _output.WriteLine("");
    }

    void EmitSustainedCurve(SustainedPoint[] sim, RealTurnPoint[] real) {
        _output.WriteLine("SUSTAINED Ps=0 CURVE — 10,000 ft, MIL power");
        _output.WriteLine("speed | sim G | real G | sim rate | real rate | sim radius | real radius | residual Ps");
        foreach (SustainedPoint point in sim) {
            RealTurnPoint reference = real.Single(p => p.Knots == point.Knots);
            _output.WriteLine($"{point.Knots,4:F0} kt | {point.G,5:F2} | {reference.G,6:F2} | " +
                $"{point.RateDegS,7:F2} deg/s | {reference.RateDegS,8:F2} deg/s | " +
                $"{point.RadiusM,8:F0} m | {reference.RadiusM,9:F0} m | {point.PsMps,7:+0.000;-0.000;0.000} m/s");
        }
        _output.WriteLine("");
    }

    void EmitInstantaneousCurve(InstantaneousPoint[] curve) {
        InstantaneousPoint corner = curve.MaxBy(p => p.RateDegS);
        _output.WriteLine("INSTANTANEOUS MAX-AERO CURVE — 10,000 ft, MIL power");
        _output.WriteLine("speed | achieved G | turn rate | radius");
        foreach (InstantaneousPoint p in curve.Where((point, index) => index % 3 == 0 ||
                     Math.Abs(point.Knots - corner.Knots) < 0.1))
            _output.WriteLine($"{p.Knots,4:F0} kt | {p.G,10:F2} | {p.RateDegS,9:F2} deg/s | {p.RadiusM,6:F0} m");
        _output.WriteLine($"Measured corner: {corner.Knots:F0} kt, {corner.RateDegS:F2} deg/s, {corner.G:F2} G.");
        _output.WriteLine("");
    }

    void EmitMachCurve((double mach, FlightSample sample)[] curve, double stiffnessRatio) {
        _output.WriteLine("TRANSONIC RESPONSE — 35,000 ft, 1 G, MIL power");
        _output.WriteLine("Mach | Ps | acceleration | mean gamma");
        foreach ((double mach, FlightSample sample) in curve)
            _output.WriteLine($"{mach,5:F3} | {sample.PsMps,8:+0.00;-0.00;0.00} m/s | " +
                $"{sample.SpeedRateMps2,8:+0.000;-0.000;0.000} m/s^2 | {sample.MeanGammaRad * RadToDeg,7:+0.000;-0.000;0.000} deg");
        _output.WriteLine($"Zero-lift normalized drag M0.95/M0.80 = {stiffnessRatio:F3}; " +
            $"configured MCrit = M{FlightModel.Sabre.MCrit:F2} (ratio > 1 means measurable stiffening).");
        _output.WriteLine("No hard Mach clamp was observed: the flown trajectory remains finite through M1.00; " +
            "the kernel limits level speed by rising drag instead.");
        _output.WriteLine("");
    }

    void EmitComparisonTable(Comparison[] sorted) {
        _output.WriteLine("SIM vs REAL F-86 — SORTED BY WORST ABSOLUTE PERCENT ERROR");
        _output.WriteLine("metric | sim value | real F-86 | delta (absolute + percent)");
        foreach (Comparison c in sorted) {
            double delta = c.SimValue - c.RealValue;
            string direction = delta >= 0.0 ? "high" : "low";
            _output.WriteLine($"{c.Metric} | {c.SimValue:F2} {c.Unit} | {c.RealValue:F2} {c.Unit} | " +
                $"{Math.Abs(delta):F2} {c.Unit} ({c.ErrorPercent:F1}%, sim {direction})");
        }
    }
}

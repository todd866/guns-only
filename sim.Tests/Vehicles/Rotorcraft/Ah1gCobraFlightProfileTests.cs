using System.Text;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Vehicles.Rotorcraft;

/// <summary>
/// Flies the AH-1G through a scripted profile and asserts on what the PILOT would see, rather
/// than on a single manoeuvre in isolation.
///
/// The unit tests around this one each hold one control and check one response, which is why a
/// permanently-lit LOW ROTOR RPM annunciation survived them all: nothing flew a whole sortie and
/// looked at the instruments afterwards. This harness exists to close that gap, and the profile
/// below is deliberately ordinary — hover, accelerate, climbing turn, decelerate — because the
/// defects that reach the owner are in ordinary flight, not at the edges.
/// </summary>
public sealed class Ah1gCobraFlightProfileTests
{
    readonly Xunit.Abstractions.ITestOutputHelper _output;

    public Ah1gCobraFlightProfileTests(Xunit.Abstractions.ITestOutputHelper output) =>
        _output = output;

    const double BasicMissionMassKg = 4_051.0;
    const double NominalRotorRpm = 324.0;

    /// <summary>One scripted segment of the profile: a control position held for a duration.</summary>
    readonly record struct Segment(
        string Name,
        long Ticks,
        double CollectiveOffset,
        double ForwardCyclic,
        double RightCyclic,
        double Pedal);

    /// <summary>What the harness observed over one segment, in instrument terms.</summary>
    sealed record SegmentReport(
        string Name,
        double MinRotorRpm,
        double MaxRotorRpm,
        double FinalRotorRpm,
        double MinNrPercent,
        double MaxTorqueFraction)
    {
        public double FinalNrPercent => FinalRotorRpm / NominalRotorRpm * 100.0;

        public override string ToString() =>
            $"{Name,-16} Nr {MinRotorRpm,6:F1}-{MaxRotorRpm,6:F1} rpm "
            + $"({MinNrPercent,5:F1}% min, {FinalNrPercent,5:F1}% final)  "
            + $"TQ max {MaxTorqueFraction * 100.0,5:F1}%";
    }

    static Ah1gCobraDynamics Create(double massKg) =>
        new(
            "profile",
            new Vec3D(0.0, 500.0, 0.0),
            Vec3D.Zero,
            initialYawRad: 0.0,
            initialRecurringBaseMassKg: massKg);

    static PlayerVehicleAdvanceInput Input(
        long tick,
        in VerticalLiftPilotCommand command,
        double massKg) =>
        new(
            tick,
            PlayerVehicleCommand.FromVerticalLift(command),
            massKg,
            0.0,
            PlayerVehicleEnvironmentSample.StandardStillAir,
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None);

    /// <summary>
    /// An ordinary sortie: settle into the hover, nose over and accelerate, pull into a climbing
    /// turn, then decelerate. No edge cases and no departures — this is the flight the owner does
    /// every time he opens the lab.
    /// </summary>
    static IReadOnlyList<Segment> OrdinarySortie() => new[]
    {
        new Segment("hover", 600, 0.00, 0.00, 0.00, 0.0),
        new Segment("accelerate", 900, 0.00, 0.35, 0.00, 0.0),
        new Segment("climbing-turn", 900, 0.15, 0.10, 0.40, 0.0),
        new Segment("decelerate", 600, -0.05, -0.35, 0.00, 0.0),
        // Lower the collective AND fly forward. Recovering on collective alone descends the
        // drooped rotor straight into the modelled vortex ring, where the extra induced power
        // holds the engine saturated and Nr never comes back — so a "re-hover" with zero cyclic
        // tests the wrong technique, not a broken governor.
        new Segment("recover", 900, -0.10, 0.25, 0.00, 0.0),
    };

    static IReadOnlyList<SegmentReport> Fly(double massKg)
    {
        var cobra = Create(massKg);
        double trim = cobra.EstimateHoverCollective(massKg, 1.225);
        var reports = new List<SegmentReport>();
        long tick = 0;

        foreach (var segment in OrdinarySortie())
        {
            double minRpm = double.MaxValue;
            double maxRpm = double.MinValue;
            double finalRpm = 0.0;
            double maxTorque = 0.0;
            var command = new VerticalLiftPilotCommand(
                Math.Clamp(trim + segment.CollectiveOffset, 0.0, 1.0),
                segment.ForwardCyclic,
                segment.RightCyclic,
                segment.Pedal);

            for (long step = 0; step < segment.Ticks; step++, tick++)
            {
                cobra.Advance(Input(tick, command, massKg));
                double rpm = cobra.Telemetry.MainRotorRpm;
                minRpm = Math.Min(minRpm, rpm);
                maxRpm = Math.Max(maxRpm, rpm);
                finalRpm = rpm;
                maxTorque = Math.Max(maxTorque, cobra.Telemetry.TransmissionLimitFraction);
            }

            reports.Add(new SegmentReport(
                segment.Name,
                minRpm,
                maxRpm,
                finalRpm,
                minRpm / NominalRotorRpm * 100.0,
                maxTorque));
        }

        return reports;
    }

    static string Format(IReadOnlyList<SegmentReport> reports)
    {
        var text = new StringBuilder();
        foreach (var report in reports) text.AppendLine(report.ToString());
        return text.ToString();
    }

    /// <summary>
    /// Segments flown steadily inside the power envelope. The other two are deliberate excursions
    /// and are asserted on separately: "climbing-turn" over-pulls +0.15 collective above hover
    /// trim at a weight whose hover alone already draws 93% of the 1,100 shp transmission limit,
    /// and "decelerate" flares, which drives the rotor up autorotatively. A real AH-1G droops when
    /// asked for power it has not got, and speeds up in a flare; neither is a governor defect.
    /// </summary>
    static readonly string[] SteadySegments = { "hover", "accelerate" };

    /// <summary>
    /// The HUD lights LOW ROTOR RPM below 90% Nr and cautions below 97%
    /// (cobra_rotorcraft_hud.js). Steady flight must not reach either: if it does, every sortie
    /// flies under a warning the pilot cannot clear, and he learns to ignore the annunciator that
    /// is supposed to mean something. This is the defect the owner reported.
    /// </summary>
    [Fact]
    public void OrdinaryFlightNeverDroopsIntoTheRotorRpmAnnunciator()
    {
        var reports = Fly(BasicMissionMassKg);
        var steady = reports.Where(r => SteadySegments.Contains(r.Name)).ToList();
        double worstNrPercent = steady.Min(report => report.MinNrPercent);

        Assert.True(
            worstNrPercent >= 97.0,
            $"Nr fell to {worstNrPercent:F1}% of nominal in steady flight, which lights the HUD "
            + $"rotor annunciation (caution < 97%, warning < 90%).\n{Format(reports)}");
    }

    /// <summary>
    /// Drooping under an over-pull is honest; staying drooped is not. Once the collective comes
    /// back inside the envelope the governor must return Nr to nominal, otherwise the annunciator
    /// stays lit for the rest of the sortie.
    /// </summary>
    [Fact]
    public void GovernorRecoversRotorSpeedAfterAnOverPull()
    {
        var reports = Fly(BasicMissionMassKg);
        SegmentReport recovery = reports.Single(report => report.Name == "recover");

        Assert.True(
            Math.Abs(recovery.FinalNrPercent - 100.0) <= 1.0,
            $"Nr settled at {recovery.FinalNrPercent:F1}% of nominal after the over-pull "
            + $"cleared, so the rotor never recovers.\n{Format(reports)}");
    }

    /// <summary>
    /// The flare drives the rotor autorotatively, which is real, but the blade's driving region
    /// shrinks as Nr rises and must arrest it at the autorotation limit. Pinning above that limit
    /// means nothing in the flight model is bounding the rotor and only the numeric backstop is.
    /// </summary>
    [Fact]
    public void AutorotativeOverspeedIsArrestedAtTheAutorotationLimit()
    {
        var reports = Fly(BasicMissionMassKg);
        double peakRpm = reports.Max(report => report.MaxRotorRpm);

        Assert.True(
            peakRpm <= 339.0 + 1e-6,
            $"Nr reached {peakRpm:F1} rpm, above the 339.0 rpm autorotation limit.\n"
            + Format(reports));
    }

    /// <summary>
    /// Diagnostic sweep, not a gate: how much power margin does the airframe have at each
    /// loading? The AH-1G's transmission caps at 1,100 shp of a 1,400 shp engine, so the mission
    /// weight decides whether a climb droops the rotor. Always passes; read its output.
    /// </summary>
    [Fact]
    public void ReportPowerMarginAcrossMissionWeights()
    {
        var text = new StringBuilder();
        foreach (double massKg in new[] { 3_200.0, 3_600.0, 4_051.0, 4_300.0 })
        {
            var reports = Fly(massKg);
            text.AppendLine(
                $"{massKg,6:F0} kg  worst Nr {reports.Min(r => r.MinNrPercent),5:F1}%  "
                + $"hover TQ {reports[0].MaxTorqueFraction * 100.0,5:F1}%  "
                + $"peak Nr {reports.Max(r => r.MaxRotorRpm) / NominalRotorRpm * 100.0,5:F1}%");
        }

        _output.WriteLine($"POWER MARGIN SWEEP\n{text}");

        // The sweep is a report, but one property in it is worth pinning: the autorotative
        // overspeed peak now settles at MaximumAutorotationRpm (339 rpm = 104.6% of nominal)
        // because the driving region fades out as Nr rises. It used to pin against the numeric
        // backstop above that limit (MaximumAutorotationRpm * 1.03 = 107.8%), which meant nothing
        // in the flight model was arresting the rotor at all.
        Assert.Contains("104.6%", text.ToString());
        Assert.DoesNotContain("107.8%", text.ToString());
    }

    [Fact]
    public void GovernorHoldsRotorSpeedAcrossTheProfile()
    {
        var reports = Fly(BasicMissionMassKg);

        foreach (var report in reports.Where(r => SteadySegments.Contains(r.Name)))
        {
            Assert.True(
                report.MaxRotorRpm - report.MinRotorRpm < 20.0,
                $"Nr swung {report.MaxRotorRpm - report.MinRotorRpm:F1} rpm during "
                + $"'{report.Name}'.\n{Format(reports)}");
        }
    }
}

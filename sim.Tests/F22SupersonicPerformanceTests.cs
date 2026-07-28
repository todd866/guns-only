using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Public-data supersonic corridor for the F-22 surrogate. The USAF publishes greater-than-M1.5
/// supercruise and "Mach two class"; these tests bind only those broad capability anchors, not an
/// unpublished drag polar or engine deck.
/// </summary>
public sealed class F22SupersonicPerformanceTests {
    const double FlightLevel450M = 45_000.0 * 0.3048;
    const double MissionSevenMassKg = 19_535.0 + 12_000.0 * 0.45359237;
    const double Dt = 1.0 / AircraftSim.TickHz;
    readonly ITestOutputHelper _output;

    public F22SupersonicPerformanceTests(ITestOutputHelper output) {
        _output = output;
    }

    [Fact]
    public void TransonicCalibrationIsUnchangedBelowPeakAndStopsGrowingAfterPeak() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        const double alpha = 0.05;
        const double belowPeakMach = 1.10;

        double cl = f22.CLAlpha * alpha;
        double originalBelowPeak = f22.CD0
            * (1.0 + f22.WaveDragK
                * Math.Pow(belowPeakMach - f22.MCrit, 2.0))
            + f22.InducedK * cl * cl;
        double actualBelowPeak = FlightModel.ProfileDragCoefficient(
            alpha, belowPeakMach, f22);
        double atPeak = FlightModel.ProfileDragCoefficient(
            alpha, f22.WaveDragPeakMach, f22);
        double atMachTwo = FlightModel.ProfileDragCoefficient(alpha, 2.0, f22);

        Assert.Equal(1.11, f22.WaveDragPeakMach, 12);
        Assert.Equal(originalBelowPeak, actualBelowPeak, 12);
        Assert.Equal(atPeak, atMachTwo, 12);
    }

    [Fact]
    public void MilitaryPowerAtFlightLevel450SustainsPublishedSupercruiseClass() {
        AircraftSim sim = LevelFlightAtMach(1.45);
        sim.SeedEnginePowerFraction(1.0);
        var command = new PilotCommand(0.99, 0.0, 1.0, 0.0);

        Step(sim, command, seconds: 90.0);

        double finalMach = Mach(sim);
        double finalAltitudeFt = sim.State.Position.Y / 0.3048;
        _output.WriteLine($"FL450 MIL: M1.45 -> M{finalMach:F3} in 90 s "
            + $"at {finalAltitudeFt:F0} ft");
        Assert.InRange(finalAltitudeFt, 44_500.0, 45_500.0);
        Assert.InRange(finalMach, 1.50, 1.85);
    }

    [Fact]
    public void FullAugmentationAtFlightLevel450ReachesMachTwoClass() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = LevelFlightAtMach(1.70);
        sim.SeedEnginePowerFraction(f22.MaxThrustFraction);
        var command = new PilotCommand(0.99, 0.0, f22.MaxThrustFraction, 0.0);

        Step(sim, command, seconds: 150.0);

        double finalMach = Mach(sim);
        double finalAltitudeFt = sim.State.Position.Y / 0.3048;
        _output.WriteLine($"FL450 MAX: M1.70 -> M{finalMach:F3} in 150 s "
            + $"at {finalAltitudeFt:F0} ft");
        Assert.InRange(finalAltitudeFt, 44_500.0, 45_500.0);
        Assert.InRange(finalMach, 1.90, 2.15);
    }

    static AircraftSim LevelFlightAtMach(double mach) {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(FlightLevel450M);
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(
            new Vec3D(0.0, FlightLevel450M, 0.0),
            mach * air.SpeedOfSoundMps,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: MissionSevenMassKg);
        return new AircraftSim(state, f22, StandardAtmosphere1976.Instance);
    }

    static void Step(AircraftSim sim, in PilotCommand command, double seconds) {
        int ticks = (int)Math.Round(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks; tick++)
            sim.Step(command, Dt);
    }

    static double Mach(AircraftSim sim) =>
        sim.AirspeedMps
        / sim.AtmosphereModel.Sample(sim.State.Position.Y).SpeedOfSoundMps;
}

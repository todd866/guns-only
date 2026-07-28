namespace GunsOnly.Sim.Tests;

/// <summary>
/// Public-data supersonic corridors for the F-22 surrogate. The USAF publishes greater-than-M1.5
/// supercruise, "Mach two class", and a ceiling above 50,000 ft. These tests bind only those broad
/// capability anchors, not an unpublished drag polar, inlet schedule, or engine deck.
/// </summary>
public sealed class F22SupersonicPerformanceTests {
    const double FeetToMetres = 0.3048;
    const double FlightLevel450M = 45_000.0 * FeetToMetres;
    const double MissionSevenMassKg = 19_535.0 + 12_000.0 * 0.45359237;
    const double Dt = 1.0 / AircraftSim.TickHz;

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

    [Theory]
    [InlineData(40_000.0, 1.50, 1.00, 10.0, true)]
    [InlineData(50_000.0, 1.50, 1.00, 10.0, true)]
    [InlineData(50_000.0, 2.00, 1.35, 10.0, true)]
    [InlineData(50_000.0, 2.30, 1.35, 0.0, false)]
    public void LevelFlightExcessPowerMatchesBroadPublicCorridor(
        double altitudeFt, double mach, double power,
        double boundaryPsMps, bool shouldExceedBoundary) {
        LevelPoint point = EvaluateLevelPoint(
            altitudeFt * FeetToMetres, mach, power,
            FlightModel.F22APublicDataSurrogate.MassKg);

        if (shouldExceedBoundary) {
            Assert.True(point.SpecificExcessPowerMps > boundaryPsMps,
                $"{altitudeFt:F0} ft M{mach:F2} power {power:F2}: "
                + $"Ps {point.SpecificExcessPowerMps:F1} m/s, "
                + $"T {point.AxialThrustN / 1000.0:F1} kN, "
                + $"D {point.DragN / 1000.0:F1} kN");
        } else {
            Assert.True(point.SpecificExcessPowerMps < boundaryPsMps,
                $"{altitudeFt:F0} ft M{mach:F2} power {power:F2}: "
                + $"Ps {point.SpecificExcessPowerMps:F1} m/s, "
                + $"T {point.AxialThrustN / 1000.0:F1} kN, "
                + $"D {point.DragN / 1000.0:F1} kN");
        }
    }

    [Fact]
    public void MilitaryPowerAtFlightLevel450PunchesThroughTheFormerTransonicWall() {
        AircraftSim sim = LevelFlightAtMach(1.05);
        sim.SeedEnginePowerFraction(1.0);
        var command = new PilotCommand(1.0, 0.0, 1.0, 0.0);

        Step(sim, command, seconds: 150.0);

        Assert.InRange(Mach(sim), 1.50, 1.85);
    }

    [Fact]
    public void FullAugmentationAtFlightLevel450ReachesMachTwoClass() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = LevelFlightAtMach(1.70);
        sim.SeedEnginePowerFraction(f22.MaxThrustFraction);
        var command = new PilotCommand(1.0, 0.0, f22.MaxThrustFraction, 0.0);

        Step(sim, command, seconds: 150.0);

        Assert.InRange(Mach(sim), 1.90, 2.15);
    }

    [Fact]
    public void SharedTurbofanThrustContinuesLapsingAboveTheOldThirtyPercentFloor() {
        foreach (AircraftParams airframe in new[] {
            FlightModel.F22APublicDataSurrogate,
            FlightModel.F35CPublicDataCarrierSurrogate,
            FlightModel.Su27SPublicDataSurrogate,
            FlightModel.CheapRapierPublicDataSurrogate
        }) {
            double lapseAt70K = TurbofanLapse(airframe, altitudeFt: 70_000.0);
            double lapseAt100K = TurbofanLapse(airframe, altitudeFt: 100_000.0);

            Assert.InRange(lapseAt100K, 0.10, 0.25);
            Assert.True(lapseAt100K < lapseAt70K,
                $"{airframe.LateralDerivativeProfileId}: lapse did not continue falling "
                + $"from 70k ({lapseAt70K:F3}) to 100k ft ({lapseAt100K:F3})");
        }
    }

    static LevelPoint EvaluateLevelPoint(
        double altitudeM, double mach, double power, double massKg) {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speedMps = mach * air.SpeedOfSoundMps;
        double qS = 0.5 * air.DensityKgM3 * speedMps * speedMps * f22.WingAreaM2;
        double weightN = massKg * FlightModel.G0;
        double cl = weightN / qS;
        double alpha = cl / f22.CLAlpha;
        double dragN = qS * FlightModel.ProfileDragCoefficient(alpha, mach, f22);

        var state = new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0),
            speedMps,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: massKg);
        var sim = new AircraftSim(state, f22, StandardAtmosphere1976.Instance);
        sim.SeedEnginePowerFraction(power);
        sim.AdvanceEngineOnly(power, Dt);
        double axialThrustN = sim.LastEngineOperatingPoint.NetThrustN * Math.Cos(alpha);
        double psMps = speedMps * (axialThrustN - dragN) / weightN;
        return new LevelPoint(axialThrustN, dragN, psMps);
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

    static double TurbofanLapse(AircraftParams airframe, double altitudeFt) {
        double altitudeM = altitudeFt * FeetToMetres;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        var state = new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0),
            2.0 * air.SpeedOfSoundMps,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: airframe.MassKg);
        var sim = new AircraftSim(state, airframe, StandardAtmosphere1976.Instance);
        sim.SeedEnginePowerFraction(1.0);
        sim.AdvanceEngineOnly(1.0, Dt);
        return sim.LastEngineOperatingPoint.NetThrustN / airframe.ThrustMaxN;
    }

    static void Step(AircraftSim sim, in PilotCommand command, double seconds) {
        int ticks = (int)Math.Round(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks; tick++)
            sim.Step(command, Dt);
    }

    static double Mach(AircraftSim sim) =>
        sim.AirspeedMps
        / sim.AtmosphereModel.Sample(sim.State.Position.Y).SpeedOfSoundMps;

    readonly record struct LevelPoint(
        double AxialThrustN,
        double DragN,
        double SpecificExcessPowerMps);
}

using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class AirDataTests {
    [Theory]
    [InlineData(0.0, 120.0)]
    [InlineData(2143.0, 112.66)]
    [InlineData(10000.0, 180.0)]
    public void EquivalentAirspeedPreservesDynamicPressure(double altitudeM,
        double trueAirspeedMps) {
        double equivalent = AirData.EquivalentAirspeedMps(trueAirspeedMps, altitudeM);

        Assert.Equal(
            AirData.TrueDynamicPressurePa(trueAirspeedMps, altitudeM),
            AirData.EquivalentDynamicPressurePa(equivalent),
            precision: 9);
    }

    [Fact]
    public void ReportedHighAltitudePullReadsAbout197KiasAtTheClmaxBoundary() {
        const double trueAirspeedKts = 219.0;
        const double altitudeFt = 7031.0;
        double trueAirspeedMps = trueAirspeedKts / AirData.MpsToKnots;
        double altitudeM = altitudeFt / 3.28084;

        double indicatedKias = AirData.IndicatedAirspeedMps(trueAirspeedMps, altitudeM)
            * AirData.MpsToKnots;
        double positiveLiftLimit = AirData.PositiveLiftLimitG(trueAirspeedMps, altitudeM,
            FlightModel.Sabre.MassKg, FlightModel.Sabre);

        // Ideal CAS is slightly above EAS here because the pitot relation includes compressibility.
        Assert.InRange(indicatedKias, 197.6, 197.9);
        Assert.InRange(positiveLiftLimit, 2.73, 2.76);
    }

    [Theory]
    [InlineData(0.0)]
    [InlineData(80.0)]
    [InlineData(250.0)]
    [InlineData(420.0)]
    public void CalibratedAirspeedEqualsTrueAirspeedAtSeaLevel(double trueAirspeedMps) {
        double calibrated = AirData.CalibratedAirspeedMps(trueAirspeedMps, 0.0);

        Assert.InRange(Math.Abs(calibrated - trueAirspeedMps), 0.0, 2e-5);
    }

    [Fact]
    public void CompressibleCasAndEasAreDistinctAtHighAltitudeAndMach() {
        const double altitudeM = 10_000.0;
        const double trueAirspeedMps = 250.0;

        double equivalent = AirData.EquivalentAirspeedMps(trueAirspeedMps, altitudeM);
        double calibrated = AirData.CalibratedAirspeedMps(trueAirspeedMps, altitudeM);

        Assert.InRange(AirData.MachNumber(trueAirspeedMps, altitudeM), 0.83, 0.84);
        Assert.InRange(equivalent, 145.1, 145.4);
        Assert.InRange(calibrated, 154.0, 154.5);
        Assert.True(calibrated > equivalent + 8.0);
    }

    [Fact]
    public void FixedTasProducesLowerIasAsHeightIncreases() {
        const double trueAirspeedMps = 250.0;
        double seaLevel = AirData.IndicatedAirspeedMps(trueAirspeedMps, 0.0);
        double at3000 = AirData.IndicatedAirspeedMps(trueAirspeedMps, 3_000.0);
        double at6000 = AirData.IndicatedAirspeedMps(trueAirspeedMps, 6_000.0);
        double at10000 = AirData.IndicatedAirspeedMps(trueAirspeedMps, 10_000.0);

        Assert.True(seaLevel > at3000 && at3000 > at6000 && at6000 > at10000,
            $"IAS should fall with height for fixed TAS: {seaLevel}, {at3000}, {at6000}, {at10000}");
    }

    [Fact]
    public void FixedIasRequiresHigherTasAsHeightIncreasesAndRoundTrips() {
        double requestedCasMps = 250.0 / AirData.MpsToKnots;
        double seaLevelTas = AirData.TrueAirspeedForCalibratedAirspeedMps(requestedCasMps, 0.0);
        double at6000Tas = AirData.TrueAirspeedForCalibratedAirspeedMps(requestedCasMps, 6_000.0);
        double at10000Tas = AirData.TrueAirspeedForCalibratedAirspeedMps(requestedCasMps, 10_000.0);

        Assert.True(seaLevelTas < at6000Tas && at6000Tas < at10000Tas);
        Assert.Equal(requestedCasMps,
            AirData.CalibratedAirspeedMps(at10000Tas, 10_000.0), precision: 9);
    }

    [Theory]
    [InlineData(120.0, 5_000.0)]
    [InlineData(250.0, 10_000.0)]
    [InlineData(380.0, 15_000.0)]
    public void PitotSolutionRoundTripsAcrossSubsonicAndSupersonicFlow(double tasMps,
        double altitudeM) {
        double cas = AirData.CalibratedAirspeedMps(tasMps, altitudeM);
        double recoveredTas = AirData.TrueAirspeedForCalibratedAirspeedMps(cas, altitudeM);

        Assert.Equal(tasMps, recoveredTas, precision: 8);
    }

    [Fact]
    public void SabreStallSpeedsUseTheSameOneGAndAcceleratedClmaxBoundary() {
        double oneG = AirData.StallSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre);
        double atTwoPointSevenFiveG = AirData.StallSpeedKias(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, 2.75);

        Assert.InRange(oneG, 118.9, 119.1);
        Assert.InRange(atTwoPointSevenFiveG, 197.2, 197.5);
        Assert.Equal(oneG * Math.Sqrt(2.75), atTwoPointSevenFiveG, precision: 10);
    }

    [Fact]
    public void SabreCornerSpeedIsThePositiveStructuralLimitOnTheKiasClmaxCurve() {
        double oneG = AirData.StallSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre);
        double corner = AirData.PositiveCornerSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre);

        Assert.InRange(corner, 314.7, 314.9);
        Assert.Equal(oneG * Math.Sqrt(FlightModel.Sabre.PositiveStructuralLimitG),
            corner, precision: 10);
    }

    // Independent closed-form omega(v) = g*sqrt(n^2-1)/v with n = min(structural, q*S*CLmax/(m*g)),
    // so the band test verifies physics rather than replaying the production sweep.
    static double SabreTurnRateRadPerSecond(double tasMps, double altitudeM) {
        double load = Math.Min(FlightModel.Sabre.PositiveStructuralLimitG,
            AirData.PositiveLiftLimitG(tasMps, altitudeM,
                FlightModel.Sabre.MassKg, FlightModel.Sabre));
        return load > 1.0 ? FlightModel.G0 * Math.Sqrt(load * load - 1.0) / tasMps : 0.0;
    }

    [Fact]
    public void CornerBandBracketsTheCornerMarkerAtNinetyFivePercentOfPeakTurnRate() {
        const double altitudeM = 3000.0;
        double cornerKias = AirData.PositiveCornerSpeedKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM);
        (double minKias, double maxKias) = AirData.PositiveCornerBandKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM);

        Assert.True(minKias < cornerKias && cornerKias < maxKias);

        // Convert the band edges back through the pitot/static solution and confirm each holds
        // the advertised fraction of the turn rate at the analytic corner (the true peak).
        double peak = SabreTurnRateRadPerSecond(
            AirData.TrueAirspeedForCalibratedAirspeedMps(
                cornerKias / AirData.MpsToKnots, altitudeM), altitudeM);
        double minEdge = SabreTurnRateRadPerSecond(
            AirData.TrueAirspeedForCalibratedAirspeedMps(
                minKias / AirData.MpsToKnots, altitudeM), altitudeM);
        double maxEdge = SabreTurnRateRadPerSecond(
            AirData.TrueAirspeedForCalibratedAirspeedMps(
                maxKias / AirData.MpsToKnots, altitudeM), altitudeM);
        Assert.InRange(minEdge / peak, 0.945, 0.955);
        Assert.InRange(maxEdge / peak, 0.945, 0.955);
    }

    [Fact]
    public void CornerBandIsDeterministicAndDegeneratesWithoutAUsableTurnEnvelope() {
        (double firstMin, double firstMax) = AirData.PositiveCornerBandKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 5000.0);
        (double secondMin, double secondMax) = AirData.PositiveCornerBandKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 5000.0);

        Assert.Equal(firstMin, secondMin);
        Assert.Equal(firstMax, secondMax);

        // A mass that no sampled grid speed can lift above 1 G collapses the band onto the
        // analytic corner marker instead of inventing a range.
        const double leadenMassKg = 400_000.0;
        double corner = AirData.PositiveCornerSpeedKiasAtAltitude(
            leadenMassKg, FlightModel.Sabre, altitudeM: 0.0);
        (double minKias, double maxKias) = AirData.PositiveCornerBandKiasAtAltitude(
            leadenMassKg, FlightModel.Sabre, altitudeM: 0.0);
        Assert.Equal(corner, minKias, precision: 10);
        Assert.Equal(corner, maxKias, precision: 10);
    }

    [Fact]
    public void StallAndCornerCuesAreProjectedOntoTheAltitudeCorrectIasTape() {
        double seaLevelStall = AirData.StallSpeedKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 0.0);
        double highStall = AirData.StallSpeedKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 10_000.0);
        double seaLevelCorner = AirData.PositiveCornerSpeedKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 0.0);
        double highCorner = AirData.PositiveCornerSpeedKiasAtAltitude(
            FlightModel.Sabre.MassKg, FlightModel.Sabre, altitudeM: 10_000.0);

        Assert.Equal(AirData.StallSpeedKias(FlightModel.Sabre.MassKg, FlightModel.Sabre),
            seaLevelStall, precision: 4);
        Assert.Equal(AirData.PositiveCornerSpeedKias(FlightModel.Sabre.MassKg,
            FlightModel.Sabre), seaLevelCorner, precision: 4);
        Assert.True(highStall > seaLevelStall);
        Assert.True(highCorner > seaLevelCorner);
    }
}

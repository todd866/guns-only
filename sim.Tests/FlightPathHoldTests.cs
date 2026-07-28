using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public sealed class FlightPathHoldTests {
    const double Deg = Math.PI / 180.0;
    static FlightPathHoldConfig Rapier => FlightPathHoldConfig.Rapier;

    [Fact]
    public void ZeroAttitudeErrorInThirtySixDegreeClimbMatchesCosGamma() {
        double gamma = 36.0 * Deg;
        double g = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: 0.0,
            currentFlightPathRad: gamma,
            bodyBankRad: 0.0,
            trueAirspeedMps: 250.0,
            Rapier);

        Assert.True(double.IsFinite(g));
        Assert.Equal(Math.Cos(gamma), g, precision: 9);
    }

    [Fact]
    public void LevelSixtyDegreeBankDemandsTwoG() {
        double g = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: 0.0,
            currentFlightPathRad: 0.0,
            bodyBankRad: 60.0 * Deg,
            trueAirspeedMps: 250.0,
            Rapier);

        Assert.InRange(g, 1.999, 2.001);
    }

    [Fact]
    public void InvertedLevelFlightDemandsNegativeOneG() {
        double g = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: 0.0,
            currentFlightPathRad: 0.0,
            bodyBankRad: Math.PI,
            trueAirspeedMps: 250.0,
            Rapier);

        Assert.InRange(g, -1.001, -0.999);
    }

    [Fact]
    public void KnifeEdgeStaysFiniteAndClamped() {
        foreach (double bankDeg in new[] { 90.0, -90.0 }) {
            double g = FlightPathHold.RequiredNormalLoad(
                pitchAttitudeErrorRad: 0.0,
                measuredBodyPitchRateRadPerSecond: 0.0,
                currentFlightPathRad: 0.0,
                bodyBankRad: bankDeg * Deg,
                trueAirspeedMps: 250.0,
                Rapier);

            Assert.True(double.IsFinite(g),
                $"knife-edge bank {bankDeg} deg must stay finite");
            Assert.InRange(g, Rapier.MinG, Rapier.MaxG);
        }
    }

    [Fact]
    public void BeyondKnifeEdgePreservesTheInvertedSign() {
        double g = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: 0.0,
            currentFlightPathRad: 0.0,
            bodyBankRad: 100.0 * Deg,
            trueAirspeedMps: 250.0,
            Rapier);

        Assert.Equal(Rapier.MinG, g, precision: 9);
    }

    [Fact]
    public void NoseAttitudeErrorRequestsBoundedCorrectiveRate() {
        const double airspeedMps = 250.0;
        double g = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 20.0 * Deg,
            measuredBodyPitchRateRadPerSecond: 0.0,
            currentFlightPathRad: 0.0,
            bodyBankRad: 0.0,
            airspeedMps,
            Rapier);
        double expected = Math.Clamp(
            1.0 + Rapier.MaxCommandedPitchRateRadPerSecond
                * airspeedMps / FlightModel.G0,
            Rapier.MinG,
            Rapier.MaxG);

        Assert.Equal(expected, g, precision: 9);
    }

    [Fact]
    public void PitchRateDampingOpposesNoseMotionAroundTheTrimmedAttitude() {
        double pitchingUp = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: 0.1,
            currentFlightPathRad: 0.0,
            bodyBankRad: 0.0,
            trueAirspeedMps: 250.0,
            Rapier);
        double pitchingDown = FlightPathHold.RequiredNormalLoad(
            pitchAttitudeErrorRad: 0.0,
            measuredBodyPitchRateRadPerSecond: -0.1,
            currentFlightPathRad: 0.0,
            bodyBankRad: 0.0,
            trueAirspeedMps: 250.0,
            Rapier);

        Assert.True(pitchingUp < 1.0,
            $"an upward pitch rate should unload the aircraft, got {pitchingUp:F2} G");
        Assert.True(pitchingDown > 1.0,
            $"a downward pitch rate should load the aircraft, got {pitchingDown:F2} G");
    }

    [Fact]
    public void DisabledOrInvalidConfigFailsClosed() {
        Assert.True(double.IsNaN(FlightPathHold.RequiredNormalLoad(
            0.0, 0.0, 0.0, 0.0, 250.0, Rapier with { Enabled = false })));
        Assert.True(double.IsNaN(FlightPathHold.RequiredNormalLoad(
            0.0, 0.0, 0.0, 0.0, 250.0, Rapier with { BankCosineFloor = 1.1 })));
        Assert.True(double.IsNaN(FlightPathHold.RequiredNormalLoad(
            0.0, 0.0, 0.0, 0.0, 250.0, Rapier with { PitchRateDamping = -0.1 })));
    }

    [Fact]
    public void NonFiniteOrStationaryInputFailsClosed() {
        Assert.True(double.IsNaN(FlightPathHold.RequiredNormalLoad(
            double.NaN, 0.0, 0.0, 0.0, 250.0, Rapier)));
        Assert.True(double.IsNaN(FlightPathHold.RequiredNormalLoad(
            0.0, 0.0, 0.0, 0.0, 0.0, Rapier)));
    }
}

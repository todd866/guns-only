namespace GunsOnly.Sim.Tests;

public class PadlockPreferredPlaneTests {
    const double DegreesToRadians = System.Math.PI / 180.0;
    const double HighAltitudeM = 3_000.0;
    const double CornerSpeedMps = 250.0;

    [Fact]
    public void HighAltitudeOnCornerDeadSixKeepsCurrentLiftPlane() {
        PadlockPreferredPlaneResult result = Select(
            QuaternionD.Identity, trueAirspeedMps: CornerSpeedMps,
            radarAltitudeM: HighAltitudeM);

        Assert.True(result.Valid);
        Assert.False(result.AnyPlaneFallback);
        Assert.Equal(0.0, result.GateRadFromLift, 12);
    }

    [Fact]
    public void LowAltitudeEarthwardCurrentLiftPrefersSkywardGate() {
        QuaternionD inverted = new(0.0, 0.0, 0.0, 1.0);

        PadlockPreferredPlaneResult result = Select(
            inverted, trueAirspeedMps: CornerSpeedMps,
            radarAltitudeM: PadlockPreferredPlane.TerrainFloorM - 1.0);

        Assert.True(result.Valid);
        Assert.False(result.AnyPlaneFallback);
        Assert.Equal(System.Math.PI, System.Math.Abs(result.GateRadFromLift), 10);
    }

    [Fact]
    public void SlowAtHighAltitudePrefersHorizontalLiftInsteadOfVerticalPull() {
        PadlockPreferredPlaneResult result = Select(
            QuaternionD.Identity, trueAirspeedMps: 100.0,
            radarAltitudeM: HighAltitudeM);

        Assert.True(result.Valid);
        Assert.False(result.AnyPlaneFallback);
        Assert.Equal(System.Math.PI / 2.0, System.Math.Abs(result.GateRadFromLift), 10);
    }

    [Fact]
    public void LowAndSlowVerticalAttitudeWithNoUpwardLiftFallsBackToAnyPlane() {
        QuaternionD noseUp = new(System.Math.Sqrt(0.5), -System.Math.Sqrt(0.5), 0.0, 0.0);

        PadlockPreferredPlaneResult result = Select(
            noseUp, trueAirspeedMps: 100.0,
            radarAltitudeM: PadlockPreferredPlane.TerrainFloorM - 1.0);

        Assert.False(result.Valid);
        Assert.True(result.AnyPlaneFallback);
    }

    [Fact]
    public void HysteresisHoldsSmallSkywardGateWobbleDuringDwell() {
        QuaternionD smallRightBank = Roll(10.0 * DegreesToRadians);

        PadlockPreferredPlaneResult result = PadlockPreferredPlane.Select(
            smallRightBank,
            trueAirspeedMps: CornerSpeedMps,
            cornerSpeedMps: CornerSpeedMps,
            radarAltitudeM: PadlockPreferredPlane.TerrainFloorM - 1.0,
            gcasWarningOrActive: false,
            planeMagnitude: 0.0,
            targetForward: -1.0,
            previousGateRad: 0.0,
            hadPrevious: true,
            deltaSeconds: PadlockPreferredPlane.HysteresisSeconds / 2.0);

        Assert.True(result.Valid);
        Assert.False(result.AnyPlaneFallback);
        Assert.Equal(0.0, result.GateRadFromLift, 12);
    }

    static PadlockPreferredPlaneResult Select(in QuaternionD attitude,
        double trueAirspeedMps, double radarAltitudeM) =>
        PadlockPreferredPlane.Select(
            attitude,
            trueAirspeedMps,
            CornerSpeedMps,
            radarAltitudeM,
            gcasWarningOrActive: false,
            planeMagnitude: 0.0,
            targetForward: -1.0,
            previousGateRad: 0.0,
            hadPrevious: false,
            deltaSeconds: 0.0);

    static QuaternionD Roll(double radians) => new(
        System.Math.Cos(radians / 2.0), 0.0, 0.0, -System.Math.Sin(radians / 2.0));
}

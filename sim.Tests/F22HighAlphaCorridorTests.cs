namespace GunsOnly.Sim.Tests;

/// <summary>
/// Public-data validation corridors adopted in docs/f22-high-alpha-review.md. These tests pin
/// direction and broad capability bands, not an unpublished F-22 aerodynamic/control-law deck.
/// </summary>
public sealed class F22HighAlphaCorridorTests {
    [Fact]
    public void F22DoesNotInheritGenericSeparatedFlowDepartureInjection() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;

        Assert.Equal(0.0, f22.StallRollCoupling);
        Assert.Equal(0.0, f22.StallYawCoupling);
        Assert.Equal(0.0, f22.StallPitchBreakNm);
        Assert.True(double.IsFinite(f22.PostStallDragMax));

        // Containment is F-22-only. The legacy generic/F-86 and Su-27 surrogate parameters remain
        // unchanged while their existing accuracy/golden tests continue to pin their trajectories.
        Assert.Equal(0.20, FlightModel.Sabre.StallRollCoupling);
        Assert.Equal(0.34, FlightModel.Sabre.StallYawCoupling);
        Assert.Equal(26_000.0, FlightModel.Sabre.StallPitchBreakNm);
        Assert.Equal(0.20, FlightModel.Su27SPublicDataSurrogate.StallRollCoupling);
        Assert.Equal(0.34, FlightModel.Su27SPublicDataSurrogate.StallYawCoupling);
        Assert.Equal(26_000.0, FlightModel.Su27SPublicDataSurrogate.StallPitchBreakNm);
    }
}

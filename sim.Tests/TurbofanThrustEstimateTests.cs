using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim.Tests;

public sealed class TurbofanThrustEstimateTests {
    const double FeetToMetres = 0.3048;
    const double FlightLevel450M = 45_000.0 * FeetToMetres;

    [Fact]
    public void SqrtDensityLapseExceedsLinearDensityAtAltitude() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(FlightLevel450M);
        double densityRatio = air.DensityKgM3 / AirData.SeaLevelDensityKgM3;
        double sqrtLapse = TurbofanPublicDataSurrogate.ThrustLapse(densityRatio, mach: 1.5);
        Assert.True(sqrtLapse > densityRatio * 1.2,
            $"expected √density ram lapse ({sqrtLapse:F3}) well above linear density ({densityRatio:F3})");
    }

    [Fact]
    public void F22LevelFlightTrimThrottleMatchesTurbofanAvailableThrust() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(FlightLevel450M);
        double mach = 1.50;
        double speedMps = mach * air.SpeedOfSoundMps;
        var state = new AircraftState(
            new Vec3D(0.0, FlightLevel450M, 0.0),
            speedMps,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: f22.MassKg);
        AirframeAerodynamicState configuration = default;

        double trim = DetentLayer.LevelFlightTrimThrottle(
            state, f22, speedMps, configuration, StandardAtmosphere1976.Instance);

        double densityRatio = air.DensityKgM3 / AirData.SeaLevelDensityKgM3;
        double availableN = TurbofanPublicDataSurrogate.AvailableThrustN(
            f22.ThrustMaxN, densityRatio, mach, trim);

        double qS = 0.5 * air.DensityKgM3 * speedMps * speedMps * f22.WingAreaM2;
        double weightN = f22.MassKg * FlightModel.G0;
        double cl = weightN / qS;
        double alpha = cl / f22.CLAlpha;
        double dragN = qS * FlightModel.ProfileDragCoefficient(alpha, mach, f22);
        // Speed-hold feed-forward equates required thrust magnitude to drag (γ = 0), then
        // inverts AvailableThrustN at the lever stop — so available at trim must match drag.
        double ratio = availableN / dragN;

        Assert.InRange(trim, 0.15, f22.MaxThrustFraction);
        Assert.InRange(ratio, 0.92, 1.08);
    }
}

using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class HighAltitudeBalloonTests {
    static AircraftParams Balloon =>
        FlightModel.HighAltitudeBalloonPublicDataSurrogate;

    static double NeutralBuoyancyAltitudeM() {
        double targetDensity = Balloon.MassKg / Balloon.BuoyantVolumeM3;
        double low = 25_000.0;
        double high = 40_000.0;
        for (int i = 0; i < 80; i++) {
            double mid = (low + high) * 0.5;
            double density = StandardAtmosphere1976.Instance.Sample(mid).DensityKgM3;
            if (density > targetDensity) low = mid;
            else high = mid;
        }
        return (low + high) * 0.5;
    }

    static AircraftSim At(double altitudeM) => new(
        new AircraftState(
            new Vec3D(0.0, altitudeM, 0.0),
            Speed: 0.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: Balloon.MassKg),
        Balloon,
        StandardAtmosphere1976.Instance);

    static void Coast(AircraftSim sim, double seconds) {
        var neutral = new PilotCommand(0.0, 0.0, 0.0, 0.0);
        int ticks = checked((int)(seconds * AircraftSim.TickHz));
        for (int i = 0; i < ticks; i++)
            sim.Step(neutral, 1.0 / AircraftSim.TickHz);
    }

    [Fact]
    public void PublishedMassAndGasVolumeCloseNearNasaFloatAltitude() {
        double equilibriumM = NeutralBuoyancyAltitudeM();
        double equilibriumFt = equilibriumM / 0.3048;

        Assert.InRange(equilibriumFt, 109_900.0, 110_100.0);
        Assert.Equal(FlightModel.HighAltitudeBalloonFloatAltitudeM,
            equilibriumM, precision: 6);
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(equilibriumM);
        Assert.Equal(Balloon.MassKg,
            air.DensityKgM3 * Balloon.BuoyantVolumeM3,
            precision: 6);
    }

    [Fact]
    public void BuoyancyRestoresTheBalloonTowardItsDensityAltitude() {
        double equilibriumM = NeutralBuoyancyAltitudeM();
        AircraftSim below = At(equilibriumM - 1_500.0);
        AircraftSim above = At(equilibriumM + 1_500.0);

        Coast(below, 5.0);
        Coast(above, 5.0);

        Assert.True(below.State.Position.Y > equilibriumM - 1_500.0,
            "denser air below float altitude must accelerate the balloon upward");
        Assert.True(above.State.Position.Y < equilibriumM + 1_500.0,
            "thinner air above float altitude must let the balloon settle");
    }

    [Fact]
    public void TargetIsARealBalloonRatherThanTheGliderStrikeAirframe() {
        Assert.Equal(FlightModel.HighAltitudeBalloonVolumeM3, Balloon.BuoyantVolumeM3);
        Assert.Equal(System.Math.PI * 57.25 * 57.25, Balloon.WingAreaM2, precision: 6);
        Assert.Equal(114.5, Balloon.WingSpanM);
        Assert.Equal(4_500.0,
            FlightModel.HighAltitudeBalloonEnvelopeAndPayloadMassKg);
        Assert.True(Balloon.MassKg
            > FlightModel.HighAltitudeBalloonEnvelopeAndPayloadMassKg,
            "the fixed-volume actor must include lifting-gas/ballast inertia");
        Assert.Equal(FlightModel.HighAltitudeBalloonTotalMassKg,
            Balloon.MassKg, precision: 9);
        Assert.Equal(0.0, Balloon.ThrustMaxN);
        Assert.NotEqual(FlightModel.GliderStrike.MassKg, Balloon.MassKg);
    }
}

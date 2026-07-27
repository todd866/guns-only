using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;

namespace GunsOnly.Sim.Tests.FlightTest;

public class PointPerformanceTests {
    [Fact]
    public void SustainedGIsThrustLimitedWellBelowAeroMaxAtCornerBand() {
        AircraftParams air = FlightModel.Sabre;
        double altM = 10_000.0 * 0.3048;
        double rho = StandardAtmosphere1976.Instance.Sample(altM).DensityKgM3;
        double speed = 467.0 * 0.514444;
        double q = 0.5 * rho * speed * speed;
        double aero = PointPerformance.AeroMaxG(air.MassKg, air, q);
        double thrust = air.ThrustMaxN;
        double sustained = PointPerformance.SustainedG(air.MassKg, air, q, thrust);
        Assert.True(aero > sustained + 2.0,
            $"aero {aero:F2} G should exceed sustained {sustained:F2} G by >2");
        Assert.True(sustained > 1.0, $"sustained {sustained:F2} G should exceed 1 G");
    }

    [Fact]
    public void MaxClimbGammaIsNinetyWhenThrustBeatsWeightPlusDrag() {
        Assert.Equal(90.0, PointPerformance.MaxClimbGammaDeg(120_000, 10_000, 100_000));
    }

    [Fact]
    public void SpecificExcessPowerIsSpeedTimesThrustMinusDragOverWeight() {
        double ps = PointPerformance.SpecificExcessPowerMps(10_000, 120_000, 20_000, 200.0);
        Assert.Equal(200.0 * 100_000 / (10_000 * 9.80665), ps, precision: 6);
    }
}

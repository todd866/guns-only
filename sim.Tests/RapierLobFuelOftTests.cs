using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Proves the exo lob's fuel win from physics: ballistic coast burns near-zero while covering
/// ground, so lb/100 nm beats steady FL700 ram cruise. No efficiency buff.
/// </summary>
public class RapierLobFuelOftTests {
    const double CruiseAltM = 70_000.0 * 0.3048;
    const double Dt = 1.0 / 60.0;
    const double SampleSeconds = 90.0;

    static (double fuelBurnLb, double groundNm) Fly(
        AircraftState start,
        PilotCommand cmd,
        int ticks) {
        var sim = new AircraftSim(start, FlightModel.RapierPublicDataSurrogate);
        var fuel = new FuelModel(
            initialFuelLb: 3_100.0,
            capacityLb: 9_920.0,
            bingoThresholdLb: 1_000.0,
            consumesFuel: true);
        Vec3D origin = start.Position;
        for (int i = 0; i < ticks; i++) {
            sim.Step(cmd, Dt);
            double flow = sim.LastEngineOperatingPoint.FuelFlowLbPerMinute;
            fuel.Step(Dt, flow);
        }
        double groundM = Math.Sqrt(
            Math.Pow(sim.State.Position.X - origin.X, 2)
            + Math.Pow(sim.State.Position.Z - origin.Z, 2));
        return (3_100.0 - fuel.FuelLb, groundM / 1852.0);
    }

    [Fact]
    public void BallisticCoastBeatsFl700CruiseOnFuelPerDistance() {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(CruiseAltM);
        double cruiseSpeed = 3.5 * air.SpeedOfSoundMps;
        var cruiseStart = new AircraftState(
            new Vec3D(0, CruiseAltM, 0), cruiseSpeed, 0.0, 0.0, 0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);
        var cruiseCmd = new PilotCommand(
            GDemand: 1.0, BankTarget: 0.0, Throttle: 1.08, Rudder: 0.0);

        // Coast from a zoom exit: high, steep, throttle cut — the lob's free range.
        double coastAltM = 45_000.0;
        AtmosphericState coastAir = StandardAtmosphere1976.Instance.Sample(coastAltM);
        double coastSpeed = 3.0 * coastAir.SpeedOfSoundMps;
        var coastStart = new AircraftState(
            new Vec3D(0, coastAltM, 0), coastSpeed, 35.0 * Math.PI / 180.0, 0.0, 0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);
        var coastCmd = new PilotCommand(
            GDemand: 1.0, BankTarget: 0.0, Throttle: 0.0, Rudder: 0.0);

        int ticks = (int)(SampleSeconds / Dt);
        var (cruiseBurn, cruiseNm) = Fly(cruiseStart, cruiseCmd, ticks);
        var (coastBurn, coastNm) = Fly(coastStart, coastCmd, ticks);

        Assert.True(cruiseNm > 5.0, $"cruise should cover ground, got {cruiseNm:F1} nm");
        Assert.True(coastNm > 5.0, $"coast should cover ground, got {coastNm:F1} nm");

        double cruiseLbPer100Nm = cruiseBurn / cruiseNm * 100.0;
        double coastLbPer100Nm = coastBurn / Math.Max(coastNm, 1e-6) * 100.0;

        Assert.True(coastBurn < cruiseBurn * 0.25,
            $"coast burn {coastBurn:F1} lb should be << cruise {cruiseBurn:F1} lb");
        Assert.True(coastLbPer100Nm < cruiseLbPer100Nm * 0.35,
            $"coast {coastLbPer100Nm:F1} lb/100nm should beat cruise {cruiseLbPer100Nm:F1}");
    }
}

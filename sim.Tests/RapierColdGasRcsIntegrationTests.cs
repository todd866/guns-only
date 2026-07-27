namespace GunsOnly.Sim.Tests;

/// <summary>Rapier cold-gas RCS authority handoff at exo-atmospheric q.</summary>
public class RapierColdGasRcsIntegrationTests {
    [Fact]
    public void RapierHasRcsTankAndAuthorityInThinAir() {
        Assert.True(FlightModel.RapierPublicDataSurrogate.ColdGasRcsMaxMomentNm > 0.0);
        Assert.True(FlightModel.RapierPublicDataSurrogate.ColdGasRcsGasCapacityKg > 0.0);

        // ~200 kft: density ~1/300 of SL — elevons are dead, RCS must own the stick.
        double altM = 60_000.0;
        double speed = 800.0;
        var state = new AircraftState(new Vec3D(0, altM, 0), speed, 0.2, 0, 0,
            FlightModel.RapierPublicDataSurrogate.MassKg);
        var sim = new AircraftSim(state, FlightModel.RapierPublicDataSurrogate);
        Assert.Equal(40.0, sim.ColdGasRcsGasKg, 3);

        var cmd = new PilotCommand(
            GDemand: 1.4, BankTarget: 0.15, Throttle: 0.0, Rudder: 0.2,
            DirectLateralControl: true, RollControl: 0.1);
        for (int i = 0; i < 30; i++)
            sim.Step(cmd, 1.0 / 120.0);

        Assert.True(sim.ColdGasRcsAuthority > 0.5,
            $"expected RCS authority in thin air, got {sim.ColdGasRcsAuthority}");
        Assert.True(sim.ColdGasRcsGasKg < 40.0,
            "thrashing the stick in RCS regime should burn gas");
    }
}

using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public sealed class GunOpportunityPilotTests {
    [Theory]
    [InlineData(500.0)]
    [InlineData(800.0)]
    public void OffAxisPilotTurnsThroughTheRealAircraftAndScoresPhysicalHit(double rangeM) {
        const double dt = 1.0 / AircraftSim.TickHz;
        AircraftState initial = new(
            new Vec3D(0.0, 3000.0, 0.0), 160.0, 0.0,
            3.0 * Math.PI / 180.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);
        AircraftState frozen = new(
            new Vec3D(0.0, 3000.0, rangeM), 0.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        var aircraft = new AircraftSim(initial, FlightModel.F22APublicDataSurrogate);
        var gun = new GunKill(ammo: 80, hitsToKill: 1, profile: GunProfiles.M61A2PublicDataSurrogate);
        var pilot = new GunOpportunityPilot();
        bool fired = false;
        double firstBore = double.NaN;
        double minimumBore = double.PositiveInfinity;
        for (int tick = 0; tick < 600 && !gun.SplashedByGunfire; tick++) {
            GunOpportunityDecision decision = pilot.Drive(aircraft.State, frozen);
            if (double.IsNaN(firstBore)) firstBore = decision.BoreErrorRad;
            minimumBore = Math.Min(minimumBore, decision.BoreErrorRad);
            if (decision.Trigger) Assert.True(decision.HasBallisticSolution);
            fired |= decision.Trigger;
            gun.Step(decision.Trigger, aircraft.State, frozen, dt);
            aircraft.Step(decision.Command, dt);
        }

        Assert.True(firstBore > 2.0 * Math.PI / 180.0,
            $"fixture must begin off axis; bore error was {firstBore * 180.0 / Math.PI:F2} degrees");
        Assert.True(fired, $"pilot never reached a physical ballistic firing opportunity; min bore {minimumBore * 180 / Math.PI:F3} deg");
        Assert.True(gun.SplashedByGunfire,
            $"pilot fired {gun.RoundsFired} physical rounds but scored {gun.HitCount} hit(s)");
    }
}

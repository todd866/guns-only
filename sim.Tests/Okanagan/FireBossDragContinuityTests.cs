namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossDragContinuityTests
{
    static readonly AircraftParams FireBoss = FlightModel.At802fFireBossPublicDataSurrogate;

    [Fact]
    public void SampledUncamberedReferencePolarsRemainBitForBitUnchanged()
    {
        // Captured from da061df8 before the cambered-wing correction. These cover attached,
        // separated, positive/negative lift and transonic/supersonic points without copying
        // the production polar implementation into the test.
        (AircraftParams Airframe, double[] Expected)[] references =
        [
            (FlightModel.Sabre,
                [0.19738422132500244, 0.3917425000000003, 0.0166, 0.05305, 2.354379999999999]),
            (FlightModel.F22APublicDataSurrogate,
                [0.10860712256277955, 0.05543050000000005, 0.0175, 0.058972, 1.3557165525512227]),
            (FlightModel.CheapRapierPublicDataSurrogate,
                [0.13070011166005033, 0.17613150000000014, 0.021, 0.08175, 0.7775205810302769]),
        ];
        (double Alpha, double Mach)[] points =
            [(-0.35, 0.2), (-0.1, 1.1), (0.0, 0.2), (0.2, 0.2), (0.4, 1.4)];
        foreach (var reference in references)
        {
            Assert.Equal(0.0, reference.Airframe.ZeroLiftCoefficient);
            for (int i = 0; i < points.Length; i++)
                Assert.Equal(reference.Expected[i], FlightModel.ProfileDragCoefficient(
                    points[i].Alpha, points[i].Mach, reference.Airframe));
        }
    }

    [Fact]
    public void CamberedWingDragIsContinuousThroughZeroIncidence()
    {
        const double epsilon = 1e-8;
        double below = FlightModel.ProfileDragCoefficient(-epsilon, 0.17, FireBoss);
        double above = FlightModel.ProfileDragCoefficient(epsilon, 0.17, FireBoss);
        double centre = FlightModel.ProfileDragCoefficient(0.0, 0.17, FireBoss);

        Assert.True(Math.Abs(below - above) < 1e-6,
            $"A continuous positive lift around alpha=0 must not jump drag: CD-={below:R}, CD+={above:R}");
        Assert.InRange(centre, Math.Min(below, above), Math.Max(below, above));

        // Moving the section's incidence datum must not change drag at the same attached lift.
        // The uncambered reference puts these points on the positive-incidence branch.
        var uncambered = FireBoss with { ZeroLiftCoefficient = 0.0 };
        foreach (double alpha in new[] { -0.10, -0.04, -0.01, 0.0, 0.05 })
        {
            double sameLiftAlpha = alpha + FireBoss.ZeroLiftCoefficient / FireBoss.CLAlpha;
            Assert.Equal(FlightModel.ProfileDragCoefficient(sameLiftAlpha, 0.17, uncambered),
                FlightModel.ProfileDragCoefficient(alpha, 0.17, FireBoss), 12);
        }
    }

    [Fact]
    public void ZeroIncidenceCrossingDoesNotCreateAForceOrEnergyStep()
    {
        const double speed = 60.0, thrustN = 12_000.0;
        AeroResult ForceAt(double alpha)
        {
            var state = new RawState(new Vec3D(0, 1500, 0), new Vec3D(0, 0, speed),
                0.0, FireBoss.MassKg,
                new QuaternionD(Math.Cos(alpha / 2), -Math.Sin(alpha / 2), 0, 0), default);
            return FlightModel.Aerodynamics(state, new PilotCommand(1, 0, 1, 0),
                FireBoss, Vec3D.Zero, thrustN, AirframeAerodynamicState.Clean);
        }
        AeroResult below = ForceAt(-1e-8), above = ForceAt(1e-8);

        Assert.True(Math.Abs(below.DragForceN - above.DragForceN) < 0.01,
            $"Infinitesimal incidence change must not create a speed brake: D-={below.DragForceN:F3} N, D+={above.DragForceN:F3} N");
        Assert.True(below.Accel.Z > 0 && above.Accel.Z > 0,
            "both sides of zero incidence have positive thrust-minus-drag in this probe");
        double powerBelow = FireBoss.MassKg * speed * below.Accel.Z;
        double powerAbove = FireBoss.MassKg * speed * above.Accel.Z;
        Assert.InRange(Math.Abs(powerBelow - powerAbove), 0.0, 1.0);
    }

    [Fact]
    public void FullPowerFlightAcceleratesThroughTheFormerZeroIncidenceBarrier()
    {
        const double initialSpeed = 56.0, altitude = 500.0, mass = 7257.0;
        var aircraft = new AircraftSim(new AircraftState(new Vec3D(0, altitude, 0),
            initialSpeed, 0, 0, 0, mass), FireBoss);
        aircraft.SeedEnginePowerFraction(1.0);
        var command = new PilotCommand(1.0, 0.0, 1.0, 0.0, DirectLateralControl: true);
        double initialEnergy = 0.5 * initialSpeed * initialSpeed + FlightModel.G0 * altitude;
        double maximumDrag = 0.0;
        for (int tick = 0; tick < 60 * AircraftSim.TickHz; tick++)
        {
            aircraft.Step(command, 1.0 / AircraftSim.TickHz);
            maximumDrag = Math.Max(maximumDrag, aircraft.LastAerodynamicDragN);
        }
        double energy = 0.5 * aircraft.State.Speed * aircraft.State.Speed
            + FlightModel.G0 * aircraft.State.Position.Y;

        // This is an internal force/energy regression, not an OEM cruise-performance assertion.
        // At this load the former discontinuity trapped full-power flight around 59 m/s.
        Assert.True(aircraft.AirspeedMps > 70.0,
            $"Full power must cross the artificial drag barrier; actual {aircraft.AirspeedMps:F3} m/s");
        Assert.True(energy > initialEnergy + 500.0,
            $"positive power margin must add mechanical energy; delta {energy - initialEnergy:F3} J/kg");
        Assert.True(maximumDrag < 20_000.0,
            $"ordinary one-G acceleration must not pulse a fictitious speed brake: {maximumDrag:F1} N");
        Assert.True(aircraft.AngleOfAttackRad < 0,
            "the trajectory must actually enter the cambered wing's positive-lift, negative-incidence region");
    }
}

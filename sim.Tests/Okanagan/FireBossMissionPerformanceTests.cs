using GunsOnly.Sim.Okanagan;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossMissionPerformanceTests(ITestOutputHelper output)
{
    [Fact]
    public void LowRouteKeepsTheLegalLoadWhenItAlreadyMeetsTheClimbRequirement()
    {
        FireBossMissionPerformancePlan plan = FireBossMissionPerformance.AtAltitude(700);
        Assert.True(plan.MeetsClimbRequirement);
        Assert.Equal(FireBossDynamics.MaximumGrossMassKg, plan.MaximumGrossMassKg);
        Assert.True(plan.ClimbRateMps >= FireBossMissionPerformance.RequiredClimbMps);
        VerifyActualForceBalance(plan);
    }

    [Fact]
    public void HighTerrainRequiresAPerformanceLoadBelowTheStructuralLimit()
    {
        FireBossMissionPerformancePlan plan = FireBossMissionPerformance.AtAltitude(2450);
        output.WriteLine($"2450m: gross allowance={plan.MaximumGrossMassKg:F2}kg, water at882kg fuel="
            + $"{plan.MaximumGrossMassKg - FireBossDynamics.EmptyOperatingMassKg - 882:F2}kg, "
            + $"climb={plan.ClimbRateMps:F5}m/s at{plan.AirspeedMps:F3}m/s");
        Assert.True(plan.MeetsClimbRequirement);
        Assert.InRange(plan.MaximumGrossMassKg, 6300, 6700);
        Assert.InRange(plan.ClimbRateMps, FireBossMissionPerformance.RequiredClimbMps,
            FireBossMissionPerformance.RequiredClimbMps + 0.001);
        VerifyActualForceBalance(plan);
        Assert.Equal(plan, FireBossMissionPerformance.AtAltitude(2450));
    }

    [Fact]
    public void IncreasingTerrainAltitudeCannotIncreaseThePermittedMass()
    {
        double priorMass = FireBossDynamics.MaximumGrossMassKg;
        foreach (double altitude in new[] { 700.0, 1500, 2450, 3500 })
        {
            FireBossMissionPerformancePlan plan = FireBossMissionPerformance.AtAltitude(altitude);
            Assert.True(double.IsFinite(plan.MaximumGrossMassKg) && double.IsFinite(plan.ClimbRateMps));
            Assert.InRange(plan.MaximumGrossMassKg, 0, priorMass);
            priorMass = plan.MaximumGrossMassKg;
        }
    }

    [Fact]
    public void UnachievableTerrainDoesNotInventPowerOrAnAllowedPayload()
    {
        FireBossMissionPerformancePlan plan = FireBossMissionPerformance.AtAltitude(10_000);
        Assert.False(plan.MeetsClimbRequirement);
        Assert.Equal(0, plan.MaximumGrossMassKg);
        Assert.True(double.IsFinite(plan.ClimbRateMps));
        Assert.True(plan.ClimbRateMps < FireBossMissionPerformance.RequiredClimbMps);
        Assert.Equal(1_193_000, FlightModel.At802fFireBossPublicDataSurrogate.MaximumShaftPowerW);
        Assert.Equal(0.82, FlightModel.At802fFireBossPublicDataSurrogate.PropellerEfficiency);
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    [InlineData(-1)]
    [InlineData(10_001)]
    public void InvalidPlanningAltitudeIsRejected(double altitude) =>
        Assert.Throws<ArgumentOutOfRangeException>(() => FireBossMissionPerformance.AtAltitude(altitude));

    static void VerifyActualForceBalance(FireBossMissionPerformancePlan plan)
    {
        double gamma = plan.FlightPathAngleRad, alpha = plan.AngleOfAttackRad;
        var velocityDirection = new Vec3D(0, Math.Sin(gamma), Math.Cos(gamma));
        var verticalNormal = new Vec3D(0, Math.Cos(gamma), -Math.Sin(gamma));
        Vec3D liftDirection = verticalNormal * Math.Cos(FireBossMissionPerformance.PlanningBankRad)
            + new Vec3D(1, 0, 0) * Math.Sin(FireBossMissionPerformance.PlanningBankRad);
        Vec3D forward = velocityDirection * Math.Cos(alpha) + liftDirection * Math.Sin(alpha);
        Vec3D up = liftDirection * Math.Cos(alpha) - velocityDirection * Math.Sin(alpha);
        QuaternionD attitude = QuaternionD.FromFrame(up.Cross(forward), up, forward);
        var state = new AircraftState(new Vec3D(0, plan.AltitudeM, 0), plan.AirspeedMps,
            gamma, 0, 0, plan.MaximumGrossMassKg, attitude);
        var engine = new AircraftSim(state, FlightModel.At802fFireBossPublicDataSurrogate);
        engine.SeedEnginePowerFraction(1);
        var raw = new RawState(state.Position, state.VelocityVector(), 0, state.Mass, attitude, default);
        AeroResult force = FlightModel.Aerodynamics(raw, new PilotCommand(1, 0, 1, 0, ElevatorControl: 0),
            FlightModel.At802fFireBossPublicDataSurrogate, Vec3D.Zero,
            engine.LastEngineOperatingPoint.NetThrustN, AirframeAerodynamicState.Clean);
        Assert.InRange(Math.Abs(force.Accel.Dot(velocityDirection)), 0, 1e-6);
        Assert.InRange(Math.Abs(force.Accel.Dot(verticalNormal)), 0, 1e-6);
        Assert.True(force.Accel.X > 0, "the planned bank must produce the turn's centripetal acceleration");
        Assert.InRange(Math.Abs(state.VelocityVector().Y - plan.ClimbRateMps), 0, 1e-10);
        Assert.InRange(Math.Abs(force.Beta), 0, 1e-10);
    }
}

using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Deterministic contracts for the player's finite, slew-limited gun mount. These tests exercise
/// the real GunKill step path: after release, rounds retain the barrel velocity they were given.
public sealed class GunGimbalTests {
    const double Deg = Math.PI / 180.0;
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(Vec3D position, QuaternionD attitude = default) =>
        new(position, 0.0, 0.0, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg,
            attitude == default ? QuaternionD.Identity : attitude);

    static QuaternionD AimAt(double yawDeg) {
        double yaw = yawDeg * Deg;
        Vec3D forward = new(Math.Sin(yaw), 0.0, Math.Cos(yaw));
        Vec3D right = new(Math.Cos(yaw), 0.0, -Math.Sin(yaw));
        return QuaternionD.FromFrame(right, new Vec3D(0.0, 1.0, 0.0), forward);
    }

    static GunTarget Target(long id, double yawDeg, double range = 600.0) {
        double yaw = yawDeg * Deg;
        return new GunTarget(id, State(new Vec3D(Math.Sin(yaw) * range, 0.0,
            Math.Cos(yaw) * range)));
    }

    [Fact]
    public void AssistLevelsHaveFinitePhysicalLimits() {
        GunGimbalConfig full = GunGimbalConfig.ForAssist(1.0);
        GunGimbalConfig half = GunGimbalConfig.ForAssist(0.5);
        GunGimbalConfig none = GunGimbalConfig.ForAssist(0.0);

        Assert.Equal(12.0 * Deg, full.ConeHalfAngleRad, 12);
        Assert.Equal(6.0 * Deg, half.ConeHalfAngleRad, 12);
        Assert.Equal(0.0, none.ConeHalfAngleRad, 12);
        Assert.Equal(60.0 * Deg, full.SlewRateRadPerSecond, 12);
        Assert.Equal(full.SlewRateRadPerSecond, half.SlewRateRadPerSecond, 12);
    }

    [Fact]
    public void BarrelSlewIsBoundedAndNeverExceedsCone() {
        var gun = new GunKill(ammo: 4) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 8.0);

        gun.Step(false, own, target.Id, new[] { target }, 0.10);

        Assert.InRange(gun.GimbalOffsetRad, 0.0, 6.000001 * Deg);
        Assert.True(gun.GimbalOffsetRad <= gun.Gimbal!.SlewRateRadPerSecond * 0.10 + 1e-9,
            "the mount must slew at its configured rate");
    }

    [Fact]
    public void BarrelReturnsToBoresightWhenLeadLeavesCone() {
        var gun = new GunKill(ammo: 4) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget inside = Target(1, 4.0);
        GunTarget outside = Target(2, 30.0);

        gun.Step(false, own, inside.Id, new[] { inside }, 1.0);
        Assert.True(gun.GimbalOffsetRad > 0.1 * Deg);
        gun.Step(false, own, outside.Id, new[] { outside }, 1.0);

        Assert.Equal(0.0, gun.GimbalOffsetRad, 9);
        Assert.Equal(own.BodyAttitude.Rotate(new Vec3D(0, 0, 1)), gun.BarrelDirection(own));
    }

    [Fact]
    public void NoAssistLeavesBarrelOnBodyAxis() {
        var gun = new GunKill(ammo: 1) { Gimbal = GunGimbalConfig.ForAssist(0.0) };
        AircraftState own = State(Vec3D.Zero, AimAt(20.0));
        GunTarget target = Target(1, 20.0);

        gun.Step(false, own, target.Id, new[] { target }, 1.0);

        Vec3D bodyForward = own.BodyAttitude.Rotate(new Vec3D(0, 0, 1)).Normalized();
        Assert.Equal(bodyForward.X, gun.BarrelDirection(own).X, 12);
        Assert.Equal(bodyForward.Y, gun.BarrelDirection(own).Y, 12);
        Assert.Equal(bodyForward.Z, gun.BarrelDirection(own).Z, 12);
        Assert.Equal(0.0, gun.GimbalOffsetRad, 12);
    }

    [Fact]
    public void ReleasedRoundKeepsActualGimbalAxisAndIsNeverSteeredInFlight() {
        var gun = new GunKill(ammo: 2) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 5.0);

        gun.Step(true, own, target.Id, new[] { target }, 0.0);
        GunRound round = Assert.Single(gun.RoundsInFlight);
        Vec3D releasedAxis = round.Velocity.Normalized();
        gun.Step(false, own with { BodyAttitude = AimAt(-20.0) }, target.Id,
            new[] { target }, 0.25);

        Assert.Contains(gun.RoundsInFlight, current =>
            current.Id == round.Id && current.Velocity.Normalized().X == releasedAxis.X);
    }

    [Fact]
    public void SwitchingTargetDoesNotRetargetAirborneRounds() {
        var gun = new GunKill(ammo: 2) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget first = Target(101, 4.0);
        GunTarget second = Target(202, -4.0);
        gun.Step(true, own, first.Id, new[] { first, second }, 0.0);
        GunRound round = Assert.Single(gun.RoundsInFlight);

        gun.Step(false, own, second.Id, new[] { first, second }, 0.0);

        Assert.Equal(first.Id, round.AimTargetId);
        Assert.Equal(second.Id, gun.SelectedTargetId);
        Assert.Equal(round, gun.RoundsInFlight[0]);
    }

    [Fact]
    public void PredictedImpactUsesTheReleasedBarrelDirection() {
        var gun = new GunKill(ammo: 2) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 5.0);

        gun.Step(false, own, target.Id, new[] { target }, Dt);
        Vec3D axis = gun.BarrelDirection(own);
        Vec3D expected = own.Position + axis * GunKill.MuzzleOffsetM
            + (own.VelocityVector() + axis * gun.Profile.MuzzleVelocityMps)
                * gun.LeadTimeOfFlight
            + new Vec3D(0, -0.5 * GunKill.GravityMps2
                * gun.LeadTimeOfFlight * gun.LeadTimeOfFlight, 0);

        Assert.Equal(expected.X, gun.PredictedImpact(own).X, 9);
        Assert.Equal(expected.Y, gun.PredictedImpact(own).Y, 9);
        Assert.Equal(expected.Z, gun.PredictedImpact(own).Z, 9);
    }
}

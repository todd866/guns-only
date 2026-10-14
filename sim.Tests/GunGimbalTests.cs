using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

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

    sealed class FlatTerrain(double heightM) : ITerrainSurface {
        public TerrainBounds Bounds { get; } = new(-10_000, 10_000, -10_000, 10_000);
        public double HorizontalResolutionM => 5.0;
        public double MaximumHeightM => heightM;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            sample = new TerrainSample(heightM, new Vec3D(0, 1, 0));
            return Bounds.Contains(eastM, northM);
        }
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
    public void TrackingIsTrueOnlyAfterTheMountSettlesOnAnEligibleLead() {
        var gun = new GunKill(ammo: 2) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 5.0);

        gun.Step(false, own, target.Id, new[] { target }, 0.01);
        Assert.False(gun.GimbalTracking);
        gun.Step(false, own, target.Id, new[] { target }, 1.0);
        Assert.True(gun.GimbalTracking);

        GunTarget outside = Target(2, 20.0);
        gun.Step(false, own, outside.Id, new[] { outside }, 0.01);
        Assert.False(gun.GimbalTracking);
    }

    [Fact]
    public void MuzzleIsAtTheNoseStationAndRotatesWithTheBody() {
        var gun = new GunKill(ammo: 1) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        AircraftState own = State(new Vec3D(20, 30, 40), AimAt(90.0));

        Vec3D muzzle = gun.MuzzlePosition(own);
        Vec3D expected = own.Position + own.BodyAttitude.Rotate(new Vec3D(0, 0, 9.6));

        Assert.Equal(expected.X, muzzle.X, 12);
        Assert.Equal(expected.Y, muzzle.Y, 12);
        Assert.Equal(expected.Z, muzzle.Z, 12);
        Assert.Equal(9.6, (muzzle - own.Position).Length, 12);
    }

    [Fact]
    public void NoseMountCannotShootBackIntoTheF22AcrossTheFullAssistCone() {
        double halfAngle = GunGimbalConfig.ForAssist(1.0).ConeHalfAngleRad;
        Vec3D muzzle = new(0, 0, 9.6);
        for (int azimuth = 0; azimuth < 360; azimuth += 15) {
            double phi = azimuth * Deg;
            Vec3D direction = new(
                Math.Sin(halfAngle) * Math.Cos(phi),
                Math.Sin(halfAngle) * Math.Sin(phi),
                Math.Cos(halfAngle));
            Assert.False(AirframeHitGeometry.F22.TryBodyEntry(
                muzzle, direction * 100.0, out _), $"self hit at azimuth {azimuth}");
        }
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

        gun.Step(false, own, target.Id, new[] { target }, 1.0);
        Assert.True(gun.GimbalTracking);
        gun.Step(true, own, target.Id, new[] { target }, 0.0);
        GunRound round = Assert.Single(gun.RoundsInFlight);
        Vec3D releasedAxis = round.Velocity.Normalized();
        gun.Step(false, own with { BodyAttitude = AimAt(-20.0) }, target.Id,
            new[] { target }, 0.25);

        Assert.Contains(gun.RoundsInFlight, current =>
            current.Id == round.Id
                && Math.Abs(current.Velocity.X - round.Velocity.X) < 1e-12
                && Math.Abs(current.Velocity.Z - round.Velocity.Z) < 1e-12);
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
        Vec3D expected = gun.MuzzlePosition(own)
            + (own.VelocityVector() + axis * gun.Profile.MuzzleVelocityMps)
                * gun.LeadTimeOfFlight
            + new Vec3D(0, -0.5 * GunKill.GravityMps2
                * gun.LeadTimeOfFlight * gun.LeadTimeOfFlight, 0);

        Assert.Equal(expected.X, gun.PredictedImpact(own).X, 9);
        Assert.Equal(expected.Y, gun.PredictedImpact(own).Y, 9);
        Assert.Equal(expected.Z, gun.PredictedImpact(own).Z, 9);
    }

    [Fact]
    public void TrueVolumeTargetCanBeHitByTheActualUnguidedRound() {
        const double range = 550.0;
        const double yaw = 5.0 * Deg;
        double tof = (range - 9.6) / GunKill.MuzzleVelocityMps;
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = new(1, State(new Vec3D(Math.Sin(yaw) * range,
            -0.5 * GunKill.GravityMps2 * tof * tof, Math.Cos(yaw) * range)));
        var gun = new GunKill(ammo: 1, hitsToKill: 1, hitRadiusM: 0.2,
            targetGeometry: AirframeHitGeometry.Su27) {
            Gimbal = GunGimbalConfig.ForAssist(1.0)
        };

        gun.Step(false, own, target.Id, new[] { target }, 1.0);
        Assert.True(gun.GimbalTracking);
        gun.Step(true, own, target.Id, new[] { target }, 0.0);
        for (int tick = 0; tick < 120 && gun.TotalHitCount == 0; tick++)
            gun.Step(false, own, target.Id, new[] { target }, Dt);

        Assert.Equal(1, gun.TotalHitCount);
        Assert.Equal(FightOutcome.Splash, gun.Outcome);

        var none = new GunKill(ammo: 1, hitsToKill: 1, hitRadiusM: 0.2,
            targetGeometry: AirframeHitGeometry.Su27) {
            Gimbal = GunGimbalConfig.ForAssist(0.0)
        };
        none.Step(true, own, target.Id, new[] { target }, 0.0);
        for (int tick = 0; tick < 120 && none.TotalHitCount == 0; tick++)
            none.Step(false, own, target.Id, new[] { target }, Dt);
        Assert.Equal(0, none.TotalHitCount);
    }

    [Fact]
    public void FirePathSafetyInhibitsReleaseAndMarksTheInstrument() {
        var gun = new GunKill(ammo: 2) { Gimbal = GunGimbalConfig.ForAssist(1.0) };
        gun.FirePathClear = (_, _, _) => false;
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 2.0);

        gun.Step(true, own, target.Id, new[] { target }, 0.1);

        Assert.True(gun.GimbalFireInhibited);
        Assert.False(gun.GimbalTracking);
        Assert.Equal(0, gun.RoundsFired);
    }

    [Fact]
    public void FireSafetyRejectsTerrainAndFriendlyAirframePaths() {
        Vec3D muzzle = new(0, 2000, 0);
        Vec3D velocity = new Vec3D(0, 0, 500);
        Assert.True(GunFireSafety.PathClear(muzzle, velocity, 0.25,
            terrain: null, friendly: null));

        AircraftState friendly = State(new Vec3D(0, 2000, 100));
        Assert.False(GunFireSafety.PathClear(muzzle, velocity, 0.25,
            terrain: null, friendly));

        Assert.False(GunFireSafety.PathClear(muzzle, velocity, 1.0,
            new FlatTerrain(2000.0), friendly: null));
    }
    sealed class ProductionResolutionTerrain(bool ridge = false) : ITerrainSurface {
        public TerrainBounds Bounds => new(-10000, 10000, -10000, 10000);
        public double HorizontalResolutionM => 32;
        public double MaximumHeightM => 369.6;
        public int Queries { get; private set; }
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            Queries++;
            sample = new TerrainSample(ridge && northM > 2000 && northM < 2032 ? 150 : 20,
                new Vec3D(0, 1, 0));
            return Bounds.Contains(eastM, northM);
        }
    }

    [Fact]
    public void FullM61LifeAtProductionResolutionClearsLowGroundButDetectsDistantRidge() {
        var clear = new ProductionResolutionTerrain();
        var ridge = new ProductionResolutionTerrain(ridge: true);
        Vec3D muzzle = new(0, 100, 0);
        Vec3D velocity = new(0, 0, 1230); // M61 + 200 m/s aircraft translation
        Assert.True(GunFireSafety.PathClear(muzzle, velocity, 2, clear));
        Assert.InRange(clear.Queries, 309, 4097);
        Assert.False(GunFireSafety.PathClear(muzzle, velocity, 2, ridge));
        Assert.True(ridge.Queries > 250, "must reach the ridge beyond the old 256-sample budget");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public void SessionTerrainInterlockAllowsClearLowFireAndRejectsDistantRidge(int lesson) {
        var session = BfmFlightAcceptanceTests.Start(lesson);
        var own = State(new Vec3D(0, 100, 0)) with { Speed = 200 };
        var target = own with { Position = new Vec3D(0, 100, 550) };
        session.SetTerrainSurface(new ProductionResolutionTerrain());
        session.PlayerGun.Step(true, own, target, 0);
        Assert.False(session.PlayerGun.GimbalFireInhibited);
        Assert.Equal(1, session.PlayerGun.RoundsFired);
        session.SetTerrainSurface(new ProductionResolutionTerrain(ridge: true));
        session.PlayerGun.Step(true, own, target, 0.02);
        Assert.True(session.PlayerGun.GimbalFireInhibited);
        Assert.Equal(1, session.PlayerGun.RoundsFired);
    }

    [Fact]
    public void FireSafetyStillFailsClosedWhenFullTrajectoryExceedsGunBudget() {
        var terrain = new ProductionResolutionTerrain();
        Assert.False(GunFireSafety.PathClear(new Vec3D(0, 100, 0),
            new Vec3D(0, 0, 20000), 2, terrain));
        Assert.Equal(0, terrain.Queries);
    }

    [Theory]
    [InlineData(0, 12)]
    [InlineData(1, 12)]
    [InlineData(2, 6)]
    [InlineData(3, 6)]
    [InlineData(4, 0)]
    [InlineData(6, 0)]
    public void LessonSelectsTheSameGunAssistOnDesktopAndPhone(int lesson, double degrees) {
        var session = BfmFlightAcceptanceTests.Start(lesson);
        Assert.Equal(degrees, session.PlayerGun.GimbalConeHalfAngleRad / Deg, 9);
        session.SetAssistedFlight(false);
        session.SetTouchControlModality(false);
        Assert.Equal(degrees, session.PlayerGun.GimbalConeHalfAngleRad / Deg, 9);
        Assert.False(session.OpponentGun.HasGimbal);
    }

    [Fact]
    public void StagingTheNextOpponentPreservesPhysicalMountPositionAndConfig() {
        var gun = new GunKill { Gimbal = GunGimbalConfig.ForAssist(1) };
        AircraftState own = State(Vec3D.Zero);
        GunTarget target = Target(1, 5);
        gun.Step(false, own, target.Id, new[] { target }, 1);
        Assert.True(gun.ApplyExternalDestruction(target.Id));
        GunKill next = gun.CreateForStagedNextTarget();
        Assert.Equal(gun.BarrelDirection(own), next.BarrelDirection(own));
        Assert.Equal(gun.Gimbal, next.Gimbal);
        Assert.False(next.GimbalTracking);
    }

    [Fact]
    public void FrozenValleyKeepsItsFixedGun() {
        var session = new SimulationSession();
        session.StartBeat(Beats.ModernVisualMergeFirstRun);
        Assert.False(session.PlayerGun.HasGimbal);
    }

}

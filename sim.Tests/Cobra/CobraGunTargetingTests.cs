using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public sealed class CobraGunTargetingTests
{
    static readonly Vec3D Aircraft = new(0.0, 100.0, 0.0);

    [Fact]
    public void DeadAheadInRangeIsInsideEnvelopeWithSolution()
    {
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, 100.0, 500.0));

        Assert.Equal(500.0, assessment.RangeM, 6);
        Assert.Equal(0.0, assessment.AzimuthErrorRad, 6);
        Assert.Equal(0.0, assessment.ElevationRad, 6);
        Assert.True(assessment.WithinTurretEnvelope);
        Assert.True(assessment.HasBallisticSolution);
    }

    [Fact]
    public void TargetBehindTheAircraftIsOutsideTheTurretEnvelope()
    {
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, 100.0, -500.0));

        Assert.Equal(Math.PI, assessment.AzimuthErrorRad, 3);
        Assert.False(assessment.WithinTurretEnvelope);
    }

    [Fact]
    public void BeamTargetInsideAzimuthLimitIsInsideEnvelope()
    {
        // 90° off the nose: inside the M28A1 flexible azimuth envelope even though the
        // pilot-fixed-forward mode could never reach it.
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(500.0, 100.0, 0.0));

        Assert.Equal(Math.PI / 2.0, assessment.AzimuthErrorRad, 3);
        Assert.True(assessment.WithinTurretEnvelope);
        Assert.True(assessment.HasBallisticSolution);
    }

    [Fact]
    public void RearQuarterTargetBeyondAzimuthLimitIsOutsideEnvelope()
    {
        // Bearing 150° off the nose.
        var target = new Vec3D(250.0, 100.0, -433.0127);
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, target);

        Assert.True(assessment.AzimuthErrorRad > CobraGunTargeting.TurretAzimuthLimitRad);
        Assert.False(assessment.WithinTurretEnvelope);
    }

    [Fact]
    public void TargetAboveTheElevationLimitIsOutsideEnvelope()
    {
        // 500 m out, 250 m up: +26.6°, above the +20° flexible elevation limit.
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, 350.0, 500.0));

        Assert.True(assessment.ElevationRad > CobraGunTargeting.TurretMaxElevationRad);
        Assert.False(assessment.WithinTurretEnvelope);
    }

    [Fact]
    public void TypicalDiveProfileTargetStaysInsideElevationLimit()
    {
        // 500 m out, 400 m down: −38.7°, inside the −50° chin-turret depression limit.
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, -300.0, 500.0));

        Assert.True(assessment.ElevationRad < 0.0);
        Assert.True(assessment.ElevationRad > CobraGunTargeting.TurretMinElevationRad);
        Assert.True(assessment.WithinTurretEnvelope);
    }

    [Fact]
    public void ExtremeDiveTargetBelowDepressionLimitIsOutsideEnvelope()
    {
        // 500 m out, 800 m down: −58°.
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, -700.0, 500.0));

        Assert.True(assessment.ElevationRad < CobraGunTargeting.TurretMinElevationRad);
        Assert.False(assessment.WithinTurretEnvelope);
    }

    [Fact]
    public void PointBlankTargetHasNoBallisticSolution()
    {
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, 100.0, 40.0));

        Assert.True(assessment.WithinTurretEnvelope);
        Assert.False(assessment.HasBallisticSolution);
    }

    [Fact]
    public void BeyondRangeTargetHasNoBallisticSolution()
    {
        var assessment = CobraGunTargeting.Assess(Aircraft, aircraftYawRad: 0.0, new Vec3D(0.0, 100.0, 2_500.0));

        Assert.True(assessment.WithinTurretEnvelope);
        Assert.False(assessment.HasBallisticSolution);
    }

    [Fact]
    public void YawConventionFollowsTheCobraMissionFrame()
    {
        // Mission yaw is atan2(east, north): yaw +90° faces east. A target on the nose then
        // carries zero azimuth error.
        var assessment = CobraGunTargeting.Assess(
            Aircraft, aircraftYawRad: Math.PI / 2.0, new Vec3D(500.0, 100.0, 0.0));

        Assert.Equal(0.0, assessment.AzimuthErrorRad, 3);
    }
}

public sealed class CobraGunLineOfSightTests
{
    sealed class RidgeTerrain : ITerrainSurface
    {
        public TerrainBounds Bounds { get; } = new(-1_000.0, 1_000.0, -1_000.0, 1_000.0);
        public double HorizontalResolutionM => 10.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            double heightM = eastM is >= 90.0 and <= 110.0 ? 250.0 : 100.0;
            sample = new TerrainSample(heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    sealed class FlatTerrain : ITerrainSurface
    {
        public TerrainBounds Bounds { get; } = new(-1_000.0, 1_000.0, -1_000.0, 1_000.0);
        public double HorizontalResolutionM => 10.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(100.0, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static CobraResolvedObstacle BoxBetween() => new(
        "test.box",
        CobraCanyonCollisionPrimitive.AxisAlignedBox,
        new Vec3D(90.0, 120.0, -10.0),
        new Vec3D(110.0, 180.0, 10.0),
        0.0);

    [Fact]
    public void TerrainRidgeBetweenGunAndTargetBlocksTheShot()
    {
        var terrain = new RidgeTerrain();
        bool hasLos = CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            new Vec3D(0.0, 150.0, 0.0),
            new Vec3D(200.0, 150.0, 0.0));

        Assert.False(hasLos);
    }

    [Fact]
    public void ClearLineKeepsTheShot()
    {
        var terrain = new RidgeTerrain();
        bool hasLos = CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            new Vec3D(0.0, 150.0, 0.0),
            new Vec3D(50.0, 150.0, 0.0));

        Assert.True(hasLos);
    }

    [Fact]
    public void AuthoredObstacleBetweenGunAndTargetBlocksTheShot()
    {
        var terrain = new FlatTerrain();
        bool hasLos = CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            new[] { BoxBetween() },
            new Vec3D(0.0, 150.0, 0.0),
            new Vec3D(200.0, 150.0, 0.0));

        Assert.False(hasLos);
    }

    [Fact]
    public void ObstacleContainingTheMuzzleIsNotCover()
    {
        var terrain = new FlatTerrain();
        bool hasLos = CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            new[] { BoxBetween() },
            new Vec3D(100.0, 150.0, 0.0),
            new Vec3D(50.0, 150.0, 0.0));

        Assert.True(hasLos);
    }

    [Fact]
    public void UnknownTerrainFailsClosed()
    {
        var terrain = new RidgeTerrain();
        bool hasLos = CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            new Vec3D(-5_000.0, 150.0, 0.0),
            new Vec3D(50.0, 150.0, 0.0));

        Assert.False(hasLos);
    }
}

public sealed class CobraTurretServoTests
{
    [Fact]
    public void TurretDoesNotTeleportOntoTarget()
    {
        var servo = new CobraTurretServo();
        servo.Advance(0.1, targetAzimuthRad: Math.PI / 2.0, targetElevationRad: 0.0);

        Assert.True(servo.AzimuthRad < Math.PI / 2.0);
        Assert.True(servo.ErrorRad(Math.PI / 2.0, 0.0) > 0.06);
    }

    [Fact]
    public void TurretConvergesOnATrackedTarget()
    {
        var servo = new CobraTurretServo();
        for (int tick = 0; tick < 240; tick++)
            servo.Advance(1.0 / 120.0, Math.PI / 2.0, -0.2);

        Assert.Equal(Math.PI / 2.0, servo.AzimuthRad, 3);
        Assert.Equal(-0.2, servo.ElevationRad, 3);
        Assert.True(servo.ErrorRad(Math.PI / 2.0, -0.2) < 0.01);
    }

    [Fact]
    public void TurretStopsAtTheAzimuthEnvelopeLimit()
    {
        var servo = new CobraTurretServo();
        for (int tick = 0; tick < 1_200; tick++)
            servo.Advance(1.0 / 120.0, Math.PI * 0.84, 0.0);

        Assert.Equal(CobraGunTargeting.TurretAzimuthLimitRad, servo.AzimuthRad, 3);
        Assert.True(servo.ErrorRad(Math.PI * 0.84, 0.0) > 0.3);
    }

    [Fact]
    public void ResetStowsTheTurretForward()
    {
        var servo = new CobraTurretServo();
        for (int tick = 0; tick < 240; tick++)
            servo.Advance(1.0 / 120.0, Math.PI / 2.0, -0.2);
        servo.Reset();

        Assert.Equal(0.0, servo.AzimuthRad);
        Assert.Equal(0.0, servo.ElevationRad);
    }
}

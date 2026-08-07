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

public sealed class CobraGunnerObservationTests
{
    const double DtSeconds = 1.0 / 120.0;
    static readonly Vec3D Aircraft = new(0.0, 150.0, 0.0);

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

    static CobraGunnerTargetObservation Observe(
        ITerrainSurface terrain, in Vec3D targetWorldM, CobraTurretServo servo) =>
        CobraGunTargeting.AdvanceGunnerObservation(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            Aircraft,
            aircraftYawRad: 0.0,
            targetId: "hostile-1",
            friendly: false,
            targetWorldM,
            servo,
            DtSeconds);

    static CobraAiGunnerDecision Decide(in CobraGunnerTargetObservation observation) =>
        new CobraAiGunner(new CobraAiGunnerDefinition(
            AcquisitionSeconds: 0.0,
            ReacquisitionSeconds: 0.0,
            SightCoincidenceToleranceRad: 0.06))
        .Advance(new CobraAiGunnerInput(
            AuthorityTick: 0,
            SelectedTargetId: "hostile-1",
            EngagementConsent: true,
            WeaponsArmed: true,
            TurretServiceable: true,
            observation));

    [Fact]
    public void SightedTargetOutsideTheEnvelopeReadsOutOfLimitsNotMasked()
    {
        // Directly astern over flat terrain: the crew can see it; the turret cannot reach it.
        var servo = new CobraTurretServo();
        CobraGunnerTargetObservation observation = Observe(
            new FlatTerrain(), new Vec3D(0.0, 150.0, -500.0), servo);

        Assert.True(observation.HasLineOfSight);
        Assert.False(observation.WithinTurretEnvelope);
        Assert.Equal(0.0, servo.AzimuthRad, 12);
        Assert.Equal(CobraAiGunnerState.OutOfLimits, Decide(observation).State);
    }

    [Fact]
    public void OccludedTargetInsideTheEnvelopeReadsMaskedAndHoldsTheServo()
    {
        var servo = new CobraTurretServo();
        CobraGunnerTargetObservation observation = Observe(
            new RidgeTerrain(), new Vec3D(200.0, 150.0, 0.0), servo);

        Assert.False(observation.HasLineOfSight);
        Assert.True(observation.WithinTurretEnvelope);
        Assert.Equal(0.0, servo.AzimuthRad, 12);
        Assert.Equal(CobraAiGunnerState.Masked, Decide(observation).State);
    }

    [Fact]
    public void SightedReachableTargetSlewsTheServoTowardTheAimPoint()
    {
        var servo = new CobraTurretServo();
        CobraGunnerTargetObservation observation = Observe(
            new FlatTerrain(), new Vec3D(200.0, 150.0, 0.0), servo);

        Assert.True(observation.HasLineOfSight);
        Assert.True(observation.WithinTurretEnvelope);
        Assert.True(servo.AzimuthRad > 0.0);
        Assert.True(observation.SightErrorRad > 0.0);
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

    /// <summary>
    /// Performance invariant. The gunner's line of sight is a terrain march, and on the built-in
    /// analytic canyon a single TrySample costs five height evaluations (centre plus four for a
    /// finite-difference normal the march throws away). Marched at 25 m over the gun's 2 km
    /// envelope that was 41.6 ms of EVERY 120 Hz authority tick once a target was cued and the
    /// ship was high enough that terrain stopped occluding early — measured in the browser, and
    /// the whole of the Build 265 "very laggy" report. The march must count height lookups, not
    /// full surface samples.
    /// </summary>
    [Fact]
    public void LineOfSightMarchesHeightsWithoutBuildingSurfaceNormals()
    {
        var terrain = new CountingTerrain();
        int before = terrain.SampleCalls;
        CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            new Vec3D(0.0, 400.0, 0.0),
            new Vec3D(1_800.0, 380.0, 0.0));

        Assert.True(terrain.HeightCalls > 8, "the march must actually sample the terrain");
        Assert.Equal(before + 2, terrain.SampleCalls);
    }

    /// <summary>
    /// The march must also be bounded: an unbounded step count makes cost scale with range, and
    /// the gun's envelope reaches 2 km.
    /// </summary>
    [Fact]
    public void LineOfSightSampleCountIsBounded()
    {
        var terrain = new CountingTerrain();
        CobraGunTargeting.EvaluateLineOfSight(
            terrain,
            Array.Empty<CobraResolvedObstacle>(),
            new Vec3D(-7_000.0, 900.0, -7_000.0),
            new Vec3D(7_000.0, 880.0, 7_000.0));

        Assert.True(
            terrain.HeightCalls <= CobraMissionRuntime.MaximumLineOfSightSamples + 4,
            $"march took {terrain.HeightCalls} height lookups");
    }

    sealed class CountingTerrain : ITerrainSurface
    {
        public int SampleCalls;
        public int HeightCalls;

        public TerrainBounds Bounds => new(-12_000.0, 12_000.0, -12_000.0, 12_000.0);
        public double HorizontalResolutionM => 25.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            SampleCalls++;
            HeightCalls++;
            sample = new TerrainSample(100.0, new Vec3D(0.0, 1.0, 0.0));
            return Bounds.Contains(eastM, northM);
        }

        public bool TryHeightM(double eastM, double northM, out double heightM)
        {
            HeightCalls++;
            heightM = 100.0;
            return Bounds.Contains(eastM, northM);
        }
    }
}

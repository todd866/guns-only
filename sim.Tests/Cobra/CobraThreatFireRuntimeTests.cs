using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraThreatFireRuntimeTests
{
    static readonly Vec3D TargetWorldM = new(100.0, 220.0, 300.0);

    [Fact]
    public void AirframeGeometryUsesOrientedFuselageAndTailBoomCapsules()
    {
        double halfYaw = Math.PI / 4.0;
        var yawEast = new QuaternionD(Math.Cos(halfYaw), 0.0, Math.Sin(halfYaw), 0.0);
        CobraThreatAirframeGeometry geometry = Geometry(TargetWorldM, yawEast);
        Vec3D fuselagePoint = geometry.BodyPointToWorld(new Vec3D(0.0, 0.0, 1.8));
        Vec3D tailPoint = geometry.BodyPointToWorld(new Vec3D(0.0, 0.2, -7.2));
        Vec3D outsideTail = geometry.BodyPointToWorld(new Vec3D(1.0, 0.2, -7.2));

        Assert.True(geometry.Intersects(fuselagePoint));
        Assert.True(geometry.Intersects(tailPoint));
        Assert.False(geometry.Intersects(outsideTail));
        Assert.True(fuselagePoint.X > TargetWorldM.X,
            "body-forward geometry must rotate with the live airframe attitude");
    }

    [Fact]
    public void FirstBurstIsAnAuthorityOwnedVisibleNearMiss()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", 850.0));
        CobraResolvedThreatObserver[] observers = Resolved("observer.one", Vec3D.Zero);

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds - 0.1,
            exposed,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));

        Assert.True(threat.State.ThreatTracking);
        Assert.False(threat.State.ReceivingFire);
        Assert.Equal("observer.one", threat.State.ActiveObserverId);
        Assert.Empty(threat.RecentBursts);

        threat.Advance(0.1, exposed, observers, ThreatSites(observers), Geometry(TargetWorldM));

        CobraThreatBurstEvent burst = Assert.Single(threat.RecentBursts);
        Assert.Equal(1, burst.Sequence);
        Assert.Equal("observer.one", burst.ObserverId);
        Assert.Equal(Vec3D.Zero, burst.SourceWorldM);
        Assert.Equal(TargetWorldM, burst.TargetWorldM);
        Assert.NotEqual(TargetWorldM, burst.ImpactWorldM);
        Assert.False(burst.WillHit);
        Assert.Equal(CobraThreatBurstSubsystem.None, burst.Subsystem);
        Assert.False(burst.HasImpacted);
        Assert.True(threat.State.ReceivingFire);
        Assert.Equal(0, threat.State.DamagingHits);

        threat.Advance(3.0, exposed, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.True(threat.RecentBursts[0].HasImpacted);
        Assert.Equal(0, threat.State.DamagingHits);
        Assert.False(threat.State.ScasDamaged);
    }

    [Fact]
    public void SecondBurstFirstDamageFallsInsideTheFifteenToTwentyThreeSecondWindow()
    {
        double minimumFirstHitSeconds = CobraThreatFireRuntime.AcquisitionSeconds
            + CobraThreatFireRuntime.BurstIntervalSeconds
            + CobraThreatFireRuntime.BurstImpactBaseDelaySeconds;
        double maximumFirstHitSeconds = minimumFirstHitSeconds
            + CobraThreatFireRuntime.MaximumBurstTravelRangeM
                / CobraThreatFireRuntime.ProvisionalProjectileSpeedMps;
        Assert.InRange(minimumFirstHitSeconds, 15.0, 23.0);
        Assert.InRange(maximumFirstHitSeconds, 15.0, 23.0);

        var threat = new CobraThreatFireRuntime();
        double rangeM = CobraThreatFireRuntime.MaximumBurstTravelRangeM;
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.fringe", rangeM));
        CobraMaskingAssessment masked = Assessment(Blocked("observer.fringe", rangeM));
        CobraResolvedThreatObserver[] observers = Resolved(
            "observer.fringe",
            new Vec3D(-rangeM, 0.0, 0.0));

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds
                + CobraThreatFireRuntime.BurstIntervalSeconds,
            exposed,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));

        Assert.Equal(2, threat.RecentBursts.Count);
        Assert.False(threat.RecentBursts[0].WillHit);
        Assert.False(threat.RecentBursts[1].WillHit,
            "A fired burst cannot claim a hit before it reaches live airframe geometry.");
        Assert.Equal(CobraThreatBurstSubsystem.None, threat.RecentBursts[1].Subsystem);

        double remainingFlightSeconds = maximumFirstHitSeconds
            - CobraThreatFireRuntime.AcquisitionSeconds
            - CobraThreatFireRuntime.BurstIntervalSeconds;
        threat.Advance(
            remainingFlightSeconds - 0.001,
            masked,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));
        Assert.False(threat.State.ScasDamaged);
        Assert.Null(threat.State.ActiveObserverId);

        threat.Advance(
            0.001, masked, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.True(threat.State.ScasDamaged,
            "A fired burst remains physical after the player ducks behind cover.");
        Assert.Equal(1, threat.State.DamagingHits);
        Assert.True(threat.RecentBursts[1].HasImpacted);
        Assert.True(threat.RecentBursts[1].WillHit);
        Assert.Equal(CobraThreatBurstSubsystem.Scas, threat.RecentBursts[1].Subsystem);
    }

    [Fact]
    public void MovingClearBeforeTheSecondBurstArrivesAvoidsSubsystemDamage()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", 850.0));
        CobraMaskingAssessment masked = Assessment(Blocked("observer.one", 850.0));
        CobraResolvedThreatObserver[] observers = Resolved("observer.one", Vec3D.Zero);

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds
                + CobraThreatFireRuntime.BurstIntervalSeconds,
            exposed,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));
        CobraThreatBurstEvent aimedBurst = threat.RecentBursts[1];
        Assert.False(aimedBurst.HasImpacted);
        Assert.True(Geometry(TargetWorldM).Intersects(aimedBurst.ImpactWorldM));
        Assert.NotEqual(TargetWorldM, aimedBurst.ImpactWorldM);

        Vec3D evadedPosition = TargetWorldM + new Vec3D(25.0, 0.0, 0.0);
        threat.Advance(
            4.0, masked, observers, ThreatSites(observers), Geometry(evadedPosition));

        CobraThreatBurstEvent resolved = threat.RecentBursts[1];
        Assert.True(resolved.HasImpacted);
        Assert.False(resolved.WillHit);
        Assert.Equal(CobraThreatBurstSubsystem.None, resolved.Subsystem);
        Assert.Equal(0, threat.State.DamagingHits);
        Assert.False(threat.State.ScasDamaged);
    }

    [Fact]
    public void NearestObserverOwnsTrackAndChangingShooterCannotPoolAcquisition()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment bothVisible = Assessment(
            LineOfSight("observer.far", 1_500.0),
            LineOfSight("observer.near", 600.0));
        CobraMaskingAssessment farOnly = Assessment(
            LineOfSight("observer.far", 1_500.0),
            Blocked("observer.near", 600.0));
        CobraResolvedThreatObserver[] observers = {
            new("observer.far", new Vec3D(-1_500.0, 0.0, 0.0), 2_000.0),
            new("observer.near", new Vec3D(-600.0, 0.0, 0.0), 2_000.0),
        };

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds - 0.25,
            bothVisible,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));
        Assert.Equal("observer.near", threat.State.ActiveObserverId);

        threat.Advance(
            0.1, farOnly, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.Equal("observer.far", threat.State.ActiveObserverId);
        Assert.Equal(0.1, threat.State.ContinuousExposureSeconds, 9);

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds - 0.2,
            farOnly,
            observers,
            ThreatSites(observers),
            Geometry(TargetWorldM));

        Assert.Empty(threat.RecentBursts);
        Assert.False(threat.State.ReceivingFire);
    }

    [Fact]
    public void DestroyedDshkCannotAcquireButItsFiredRoundsRemainPhysical()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", 0.0));
        CobraResolvedThreatObserver[] observers = Resolved("observer.one", Vec3D.Zero);
        GroundUnit[] guns = ThreatSites(observers);

        threat.Advance(
            CobraThreatFireRuntime.AcquisitionSeconds,
            exposed,
            observers,
            guns,
            Geometry(TargetWorldM));
        Assert.Single(threat.RecentBursts);
        guns[0].ApplyDamage(guns[0].MaxHealth);

        threat.Advance(1.0, exposed, observers, guns, Geometry(TargetWorldM));

        Assert.Null(threat.State.ActiveObserverId);
        Assert.Equal(0, threat.State.TrackingObservers);
        Assert.True(threat.State.ReceivingFire,
            "the near-miss already in flight must not disappear with its shooter");

        threat.Advance(2.0, exposed, observers, guns, Geometry(TargetWorldM));

        Assert.False(threat.State.ReceivingFire);
        Assert.Equal(1, threat.State.BurstsFired);
        Assert.True(threat.RecentBursts[0].HasImpacted);
    }

    [Fact]
    public void GroundFireWarningClearsBetweenResolvedBursts()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", 0.0));
        CobraResolvedThreatObserver[] observers = Resolved("observer.one", Vec3D.Zero);
        GroundUnit[] guns = ThreatSites(observers);

        threat.Advance(10.1, exposed, observers, guns, Geometry(TargetWorldM));

        Assert.True(threat.State.ThreatTracking);
        Assert.False(threat.State.ReceivingFire);
        Assert.Equal(1, threat.State.BurstsFired);
        Assert.Equal(0, threat.State.PendingBursts);
    }

    [Fact]
    public void NamedHitsDamageScasThenEngineAndFreshAirframeClearsEvidence()
    {
        var threat = new CobraThreatFireRuntime();
        CobraMaskingAssessment pointBlank = Assessment(LineOfSight("observer.one", 0.0));
        CobraResolvedThreatObserver[] observers = Resolved("observer.one", Vec3D.Zero);

        // Burst 1 at 8 s misses; burst 2 at 13 s hits SCAS at 15 s.
        threat.Advance(
            15.0, pointBlank, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.True(threat.State.ScasDamaged);
        Assert.False(threat.State.EngineDamaged);
        Assert.Equal(1, threat.State.DamagingHits);

        // Burst 3 at 18 s misses; burst 4 at 23 s hits the engine at 25 s.
        threat.Advance(
            10.0, pointBlank, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.Equal(2, threat.State.DamagingHits);
        Assert.True(threat.State.EngineDamaged);
        Assert.Equal(
            new[] { false, true, false, true },
            threat.RecentBursts.Select(burst => burst.WillHit).ToArray());
        Assert.Equal(
            new[] {
                CobraThreatBurstSubsystem.None,
                CobraThreatBurstSubsystem.Scas,
                CobraThreatBurstSubsystem.None,
                CobraThreatBurstSubsystem.Engine,
            },
            threat.RecentBursts.Select(burst => burst.Subsystem).ToArray());

        threat.ResetForFreshAirframe();

        Assert.Empty(threat.RecentBursts);
        Assert.Equal(0, threat.State.BurstsFired);
        Assert.Equal(0, threat.State.DamagingHits);
        Assert.False(threat.State.ScasDamaged);
        Assert.False(threat.State.EngineDamaged);
    }

    [Fact]
    public void FixedSlicesAndBatchedAdvanceResolveTheSameBurstPattern()
    {
        var fixedSlices = new CobraThreatFireRuntime();
        var batched = new CobraThreatFireRuntime();
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", 1_700.0));
        CobraResolvedThreatObserver[] observers = Resolved(
            "observer.one",
            new Vec3D(-1_700.0, 0.0, 0.0));

        for (int tick = 0; tick < 3_000; tick++)
            fixedSlices.Advance(
                0.01, exposed, observers, ThreatSites(observers), Geometry(TargetWorldM));
        batched.Advance(
            30.0, exposed, observers, ThreatSites(observers), Geometry(TargetWorldM));

        Assert.Equal(batched.State.BurstsFired, fixedSlices.State.BurstsFired);
        Assert.Equal(batched.State.PendingBursts, fixedSlices.State.PendingBursts);
        Assert.Equal(batched.State.DamagingHits, fixedSlices.State.DamagingHits);
        Assert.Equal(batched.State.ScasDamaged, fixedSlices.State.ScasDamaged);
        Assert.Equal(batched.State.EngineDamaged, fixedSlices.State.EngineDamaged);
        Assert.Equal(
            batched.RecentBursts.Select(burst => (
                burst.Sequence,
                burst.ObserverId,
                burst.WillHit,
                burst.Subsystem,
                burst.HasImpacted)).ToArray(),
            fixedSlices.RecentBursts.Select(burst => (
                burst.Sequence,
                burst.ObserverId,
                burst.WillHit,
                burst.Subsystem,
                burst.HasImpacted)).ToArray());
        Assert.Equal(batched.RecentBursts.Count, fixedSlices.RecentBursts.Count);
        for (int index = 0; index < batched.RecentBursts.Count; index++)
        {
            Assert.Equal(
                batched.RecentBursts[index].FiredAtSeconds,
                fixedSlices.RecentBursts[index].FiredAtSeconds,
                9);
            Assert.Equal(
                batched.RecentBursts[index].ImpactAtSeconds,
                fixedSlices.RecentBursts[index].ImpactAtSeconds,
                9);
            Assert.Equal(
                batched.RecentBursts[index].ImpactWorldM,
                fixedSlices.RecentBursts[index].ImpactWorldM);
        }
    }

    [Fact]
    public void RecentBurstRingNeverEvictsRoundsStillInFlight()
    {
        var threat = new CobraThreatFireRuntime();
        double rangeM = CobraThreatFireRuntime.MaximumBurstTravelRangeM;
        CobraMaskingAssessment exposed = Assessment(LineOfSight("observer.one", rangeM));
        CobraResolvedThreatObserver[] observers = Resolved(
            "observer.one",
            new Vec3D(-rangeM, 0.0, 0.0));

        threat.Advance(
            100.0, exposed, observers, ThreatSites(observers), Geometry(TargetWorldM));

        CobraThreatBurstEvent[] pending = threat.RecentBursts
            .Where(burst => !burst.HasImpacted)
            .ToArray();
        Assert.Equal(threat.State.PendingBursts, pending.Length);
        Assert.NotEmpty(pending);
        Assert.All(pending, burst =>
            Assert.True(burst.ImpactAtSeconds > 100.0));
        Assert.InRange(
            threat.RecentBursts.Count,
            pending.Length,
            CobraThreatFireRuntime.MaximumRecentBursts);
    }

    static CobraResolvedThreatObserver[] Resolved(string id, Vec3D positionWorldM) =>
        new[] { new CobraResolvedThreatObserver(id, positionWorldM, 7_000.0) };

    static CobraThreatAirframeGeometry Geometry(
        in Vec3D centreWorldM,
        QuaternionD? attitude = null) =>
        new(centreWorldM, attitude ?? QuaternionD.Identity);

    static GroundUnit[] ThreatSites(IReadOnlyList<CobraResolvedThreatObserver> observers) =>
        observers.Select(observer => new GroundUnit(
            observer.Id,
            GroundFaction.Hostile,
            GroundUnitRole.DshkSite,
            maxHealth: 100.0,
            observer.PositionWorldM,
            GroundUnitIntent.Hold,
            homeSiteId: "site.test",
            fortified: true)).ToArray();

    static CobraMaskingAssessment Assessment(params CobraThreatLineOfSight[] observers)
    {
        int inRange = observers.Count(observer => observer.InAssessmentRange);
        int visible = observers.Count(observer => observer.HasLineOfSight);
        CobraMaskingState state = inRange == 0
            ? CobraMaskingState.OutsideThreatCoverage
            : visible > 0
                ? CobraMaskingState.Exposed
                : CobraMaskingState.Masked;
        return new CobraMaskingAssessment(state, inRange, visible, observers);
    }

    static CobraThreatLineOfSight LineOfSight(string id, double rangeM) => new(
        id,
        rangeM,
        InAssessmentRange: true,
        TerrainKnown: true,
        TerrainOccluded: false,
        ObstacleOccluded: false,
        HasLineOfSight: true);

    static CobraThreatLineOfSight Blocked(string id, double rangeM) => new(
        id,
        rangeM,
        InAssessmentRange: true,
        TerrainKnown: true,
        TerrainOccluded: true,
        ObstacleOccluded: false,
        HasLineOfSight: false);
}

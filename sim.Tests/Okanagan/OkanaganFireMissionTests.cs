using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class OkanaganFireMissionTests
{
    [Fact]
    public void AllThreeSortiesBeginAtKelownaWithADepartureRoute()
    {
        foreach (OkanaganSortieType sortie in Enum.GetValues<OkanaganSortieType>())
        {
            OkanaganMissionSnapshot state = OkanaganFireMission.Create(sortie).Snapshot();
            Assert.Equal(OkanaganMissionPhase.Depart, state.Phase);
            Assert.Equal(FireBossSurfaceMode.Runway, state.Aircraft.SurfaceMode);
            Assert.Equal("DEPART 16", state.Route[0].Label);
            Assert.True(OkanaganGeo.IsOverKelownaRunway(state.Aircraft.PositionWorldM));
        }
    }

    [Fact]
    public void KelownaToLakeLegIsLongerThanOneMinuteAtMissionCruise()
    {
        OkanaganMissionSnapshot state = OkanaganFireMission
            .Create(OkanaganSortieType.WaterCircuits).Snapshot();
        double distanceM = (state.Route[^1].PositionWorldM - state.Aircraft.PositionWorldM).Length;

        Assert.True(distanceM / 62.0 > 60.0,
            $"Kelowna-to-lake leg was only {distanceM / 62.0:F1} seconds at mission cruise");
    }

    [Fact]
    public void SoloAttackHasNoConvenientSupportTraffic()
    {
        OkanaganMissionSnapshot solo = OkanaganFireMission
            .Create(OkanaganSortieType.FireAttack).Snapshot();
        OkanaganMissionSnapshot largeForce = OkanaganFireMission
            .Create(OkanaganSortieType.LargeForceEmployment).Snapshot();

        Assert.Empty(solo.Traffic);
        Assert.Contains(largeForce.Traffic, track => track.Kind == "AIR ATTACK");
        Assert.Contains(largeForce.Traffic, track => track.Kind == "HELICOPTER");
        OkanaganTrafficTrack helicopter = Assert.Single(
            largeForce.Traffic,
            track => track.Kind == "HELICOPTER");
        Assert.True(
            helicopter.PositionWorldM.Y
                - OkanaganCdem.SampleSurfaceHeightM(helicopter.PositionWorldM) >= 160.0,
            "HELCO must orbit above the rendered incident terrain");
    }

    [Theory]
    [InlineData(0.0, 400.0, false)]
    [InlineData(11.9, 400.0, false)]
    [InlineData(12.0, 1_400.0, false)]
    [InlineData(12.0, 400.0, true)]
    public void LargeForceHoldWaitsForAirAttackClearance(
        double dwellSeconds, double rangeM, bool cleared)
    {
        Assert.Equal(cleared, OkanaganFireMission.AirAttackHoldClears(dwellSeconds, rangeM));
    }

    [Fact]
    public void LargeForceHelicopterWorksTheWestFlank()
    {
        OkanaganFireMission mission = OkanaganFireMission.Create(
            OkanaganSortieType.LargeForceEmployment);
        Vec3D fire = OkanaganGeo.ToWorld(49.850, -119.655, 810.0);
        var idle = new FireBossPilotCommand(0, 0, 0, 0, false, false);
        double nearestM = double.PositiveInfinity;
        for (int tick = 0; tick < 120 * 40; tick++)
        {
            mission.Step(idle);
            OkanaganTrafficTrack helicopter = Assert.Single(
                mission.Snapshot().Traffic,
                track => track.Kind == "HELICOPTER");
            nearestM = Math.Min(nearestM, HorizontalDistance(helicopter.PositionWorldM, fire));
        }

        Assert.True(nearestM < 400.0,
            $"HELCO stayed {nearestM:F0} m off the west flank");
    }

    [Fact]
    public void WaterCircuitsPublishTheLakePracticeDrop()
    {
        OkanaganMissionSnapshot circuits = OkanaganFireMission
            .Create(OkanaganSortieType.WaterCircuits).Snapshot();
        OkanaganMissionSnapshot attack = OkanaganFireMission
            .Create(OkanaganSortieType.FireAttack).Snapshot();

        Assert.Equal(OkanaganFireMission.TrainingDrop.X, circuits.DropAimWorldM.X);
        Assert.Equal(OkanaganFireMission.TrainingDrop.Z, circuits.DropAimWorldM.Z);
        Assert.Equal(OkanaganFireMission.TrainingDrop.Y, circuits.DropAimWorldM.Y);
        Assert.False(OkanaganGeo.IsOverCentralLake(circuits.DropAimWorldM));
        Assert.Equal(OkanaganGeo.ToWorld(49.850, -119.655, 810.0), attack.DropAimWorldM);
        Assert.False(OkanaganGeo.IsOverCentralLake(attack.DropAimWorldM));
    }

    [Fact]
    public void AttackSortiesStartWithNoCreditedDropThisTick()
    {
        Assert.Equal(0.0, OkanaganFireMission.Create(OkanaganSortieType.FireAttack)
            .Snapshot().DropCreditKg);
        Assert.Equal(0.0, OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits)
            .Snapshot().DropCreditKg);
    }

    [Fact]
    public void BoucherieWindMatchesTheAuthoredWorldFire()
    {
        using Stream world = typeof(OkanaganFireGrid).Assembly.GetManifestResourceStream(
            "GunsOnly.Sim.Data.OkanaganCentral.world.json")!;
        using var document = System.Text.Json.JsonDocument.Parse(world);
        var fire = document.RootElement.GetProperty("fire");
        Assert.Equal(OkanaganFireGrid.AuthoredWindFromDeg, fire.GetProperty("windFromDeg").GetDouble());
        Assert.Equal(OkanaganFireGrid.AuthoredWindSpeedMps, fire.GetProperty("windSpeedMps").GetDouble());
    }

    [Fact]
    public void BoucherieFlankIsOpenGrassOnTheWindwardSideAndTimberDownwind()
    {
        var fire = new OkanaganFireGrid();
        Vec3D centre = OkanaganGeo.ToWorld(49.850, -119.655, 0);
        Vec3D windTo = new(Math.Sin(25.0 * Math.PI / 180.0), 0, Math.Cos(25.0 * Math.PI / 180.0));
        var cells = fire.ActiveCells(400);
        Assert.Contains(cells, cell => cell.FuelType == "O1");
        Assert.Contains(cells, cell => cell.FuelType == "C7");
        Assert.All(cells, cell =>
        {
            double along = (cell.X - centre.X) * windTo.X + (cell.Z - centre.Z) * windTo.Z;
            Assert.Equal(along < 0 ? "O1" : "C7", cell.FuelType);
        });
    }

    [Fact]
    public void WaterAppliedOnTheFictionalWestFlankReducesFireIntensity()
    {
        var fire = new OkanaganFireGrid();
        fire.Step(1.0);
        double before = fire.TotalIntensity;
        Vec3D target = OkanaganGeo.ToWorld(49.850, -119.655, 810.0);
        double credited = fire.ApplyWater(target, 1_000.0);
        fire.Step(0.5);

        Assert.True(credited > 0.0);
        Assert.True(fire.TotalIntensity < before);
        Assert.True(fire.EffectiveWaterKg > 0.0);
    }

    [Fact]
    public void AKnockedDownCellStaysOnTheChartAsAWetLine()
    {
        var fire = new OkanaganFireGrid();
        OkanaganFireCellSnapshot hot = fire.ActiveCells().OrderByDescending(cell => cell.Intensity).First();
        fire.ApplyWater(new Vec3D(hot.X, hot.Y, hot.Z), 2_000.0);

        OkanaganFireCellSnapshot wetted = fire.ActiveCells()
            .First(cell => Math.Abs(cell.X - hot.X) < 1.0 && Math.Abs(cell.Z - hot.Z) < 1.0);
        Assert.True(wetted.Wetness >= 0.40);
        Assert.True(wetted.Intensity < hot.Intensity);
    }

    [Fact]
    public void LocalProjectionRoundTripsTheAirport()
    {
        Vec3D airport = OkanaganGeo.ToWorld(49.9561, -119.3778, 433.0);
        (double latitude, double longitude) = OkanaganGeo.ToGeographic(airport);
        Assert.Equal(49.9561, latitude, precision: 6);
        Assert.Equal(-119.3778, longitude, precision: 6);
    }

    [Fact]
    public void CollisionLakeMatchesTheAuthoredScoopAndKeepsTheFireOnLand()
    {
        Assert.True(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.825, -119.565, 342.0)));
        Assert.True(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.875, -119.515, 342.0)));
        Assert.False(OkanaganGeo.IsOverCentralLake(
            OkanaganGeo.ToWorld(49.850, -119.655, 810.0)));
    }

    [Fact]
    public void OperationalLakeRunwayAndFireShareTheCommittedCdem()
    {
        Vec3D scoopExit = OkanaganGeo.ToWorld(49.875, -119.515, 0.0);
        Assert.InRange(OkanaganCdem.SampleRawHeightM(scoopExit), 300.0, 400.0);
        Assert.Equal(342.0, OkanaganCdem.SampleSurfaceHeightM(scoopExit), precision: 6);

        Vec3D runwayThreshold = OkanaganGeo.ToWorld(49.9670, -119.3778, 0.0);
        Assert.Equal(433.0, OkanaganCdem.SampleSurfaceHeightM(runwayThreshold), precision: 6);

        var fire = new OkanaganFireGrid();
        foreach (OkanaganFireCellSnapshot cell in fire.ActiveCells()) {
            Vec3D point = new(cell.X, 0.0, cell.Z);
            Assert.Equal(OkanaganCdem.SampleSurfaceHeightM(point), cell.Y, precision: 6);
        }
    }

    [Fact]
    public void ReserveMarginForcesImmediateReturnWithoutWaitingForADrop()
    {
        OkanaganFireMission mission = OkanaganFireMission.Create(
            OkanaganSortieType.FireAttack, initialFuelKg: 300.0);
        mission.Step(new FireBossPilotCommand(0, 0, 0, 0.65, false, false));

        Assert.Equal(OkanaganMissionPhase.Rtb, mission.Snapshot().Phase);
        Assert.Equal("rtb-crossing", mission.Snapshot().Route[0].Id);
    }

    [Theory]
    [InlineData(0, OkanaganMissionPhase.JoinScoop)]
    [InlineData(1, OkanaganMissionPhase.Rtb)]
    [InlineData(2, OkanaganMissionPhase.Rtb)]
    public void WaterCircuitContractReturnsAfterTheFirstCreditedCycle(
        int completedCycles,
        OkanaganMissionPhase expected)
    {
        Assert.Equal(expected, OkanaganFireMission.NextWaterCircuitPhase(completedCycles));
    }

    [Fact]
    public void WaterCircuitCompletionPolicyRejectsImpossibleNegativeCounts()
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => OkanaganFireMission.NextWaterCircuitPhase(-1));
    }

    [Fact]
    public void RunwaySixteenRecoveryApproachesTheNorthThresholdFromTheNorthWest()
    {
        Vec3D northThreshold = OkanaganGeo.ToWorld(
            49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);

        Assert.Equal(northThreshold, OkanaganFireMission.AirportThreshold);
        Assert.InRange(HeadingDeg(
            OkanaganFireMission.AirportInitial,
            OkanaganFireMission.AirportFinal), 155.0, 165.0);
        Assert.InRange(HeadingDeg(
            OkanaganFireMission.AirportFinal,
            OkanaganFireMission.AirportThreshold), 155.0, 165.0);
        Assert.True(OkanaganFireMission.AirportInitial.Y
            > OkanaganFireMission.AirportFinal.Y);
        Assert.True(OkanaganFireMission.AirportFinal.Y
            > OkanaganFireMission.AirportThreshold.Y);
    }

    [Fact]
    public void WaterCircuitKeepsItsDescentAndLoadedTakeoffOverMappedWater()
    {
        Vec3D start = OkanaganGeo.ToWorld(
            49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);
        Vec3D[] nominalPath = [
            start,
            OkanaganFireMission.RunwayDeparture,
            OkanaganFireMission.AirportDeparture,
            OkanaganFireMission.LakeArrival,
            OkanaganFireMission.ScoopEntry,
            OkanaganFireMission.ScoopTouchdown,
            OkanaganFireMission.ScoopExit,
            OkanaganFireMission.LoadedLiftoff,
            OkanaganFireMission.CircuitCrosswind,
            OkanaganFireMission.CircuitDownwind,
            OkanaganFireMission.TrainingDrop,
            OkanaganFireMission.RtbCrossing,
            OkanaganFireMission.AirportInitial,
            OkanaganFireMission.AirportFinal,
            OkanaganFireMission.AirportThreshold,
        ];
        double distanceM = nominalPath.Zip(nominalPath.Skip(1), HorizontalDistance).Sum();

        // The authored circuit is about 55.6 km: the lake join runs 5 km south of the scoop
        // entry so the descent happens over water, not over the airport-side hills. The bound
        // still refuses the former 28 km dead recovery dogleg (which would push this past 80 km).
        Assert.InRange(distanceM, 45_000.0, 60_000.0);
        Assert.All(new[] {
            OkanaganFireMission.ScoopEntry,
            OkanaganFireMission.ScoopTouchdown,
            OkanaganFireMission.ScoopExit,
            OkanaganFireMission.CircuitDownwind,
            OkanaganFireMission.LakeArrival,
            OkanaganFireMission.LoadedLiftoff,
        }, point => Assert.True(OkanaganGeo.IsOverCentralLake(point),
            $"authored water-circuit point {point} left Okanagan Lake"));
        Assert.False(OkanaganGeo.IsOverCentralLake(OkanaganFireMission.TrainingDrop));
        Assert.False(OkanaganGeo.IsOverCentralLake(OkanaganFireMission.RtbCrossing));
        Assert.InRange(HorizontalDistance(
            OkanaganFireMission.AirportDeparture,
            OkanaganFireMission.ScoopEntry), 8_000.0, 11_000.0);
    }

    [Fact]
    public void FiniteTrainingDropPointsAtRtbInsteadOfAdvertisingASecondScoop()
    {
        OkanaganRouteGate[] waterCircuit = OkanaganFireMission
            .Create(OkanaganSortieType.WaterCircuits)
            .RouteFor(OkanaganMissionPhase.Downwind)
            .ToArray();
        OkanaganRouteGate[] fireAttack = OkanaganFireMission
            .Create(OkanaganSortieType.FireAttack)
            .RouteFor(OkanaganMissionPhase.Downwind)
            .ToArray();

        Assert.Equal(new[] { "downwind-entry", "training-drop", "circuit-exit" },
            waterCircuit.Select(gate => gate.Id));
        Assert.Equal(OkanaganFireMission.RtbCrossing,
            waterCircuit[^1].PositionWorldM);
        Assert.DoesNotContain(waterCircuit,
            gate => gate.Id == "base-turn" || gate.PositionWorldM == OkanaganFireMission.ScoopEntry);
        Assert.Equal("base-turn", fireAttack[^1].Id);
        Assert.Contains("RTB", OkanaganFireMission.RadioCallFor(
            OkanaganSortieType.WaterCircuits, OkanaganMissionPhase.Downwind));
        Assert.True(OkanaganFireMission.RadioCallFor(
            OkanaganSortieType.FireAttack, OkanaganMissionPhase.Downwind)
            .Contains("scoop", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void TransientRadioCallsStayBelowTheOutsideViewDensityBudget()
    {
        foreach (OkanaganSortieType sortie in Enum.GetValues<OkanaganSortieType>())
        foreach (OkanaganMissionPhase phase in Enum.GetValues<OkanaganMissionPhase>())
        {
            string call = OkanaganFireMission.RadioCallFor(sortie, phase);
            int words = call.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
            Assert.True(words <= 9,
                $"{sortie}/{phase} radio has {words} words: {call}");
            Assert.True(call.Length <= 54,
                $"{sortie}/{phase} radio has {call.Length} characters: {call}");
        }
    }

    [Fact]
    public void TrainingCircuitCountsOnlyAReleaseThatCoversTheShoreMark()
    {
        Assert.Equal(0, TrainingCyclesAfterRelease(OkanaganFireMission.CircuitDownwind));
        Assert.Equal(1, TrainingCyclesAfterRelease(OkanaganFireMission.TrainingDrop));
        Assert.False(OkanaganGeo.IsOverCentralLake(OkanaganFireMission.TrainingDrop));
        Assert.Equal(OkanaganCdem.SampleSurfaceHeightM(OkanaganFireMission.TrainingDrop),
            OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits).Snapshot().DropAimWorldM.Y, 1);
    }

    static int TrainingCyclesAfterRelease(Vec3D at)
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.WaterCircuits);
        double fuel = mission.Snapshot().Aircraft.FuelKg;
        Observe(mission, OkanaganFireMission.RunwayDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.AirportDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, load, FireBossSurfaceMode.Water);
        Observe(mission, OkanaganFireMission.CircuitDownwind, fuel, load);
        Assert.Equal(OkanaganMissionPhase.Downwind, mission.Phase);
        double drop = mission.Snapshot().DropTargetWaterKg;
        Observe(mission, at, fuel, load - drop, released: drop);
        return mission.CompletedCycles;
    }

    [Fact]
    public void AirAttackHoldDumpsWaterWithoutCreditingItUntilTheLineIsClear()
    {
        Vec3D flank = FlankReleasePoint();
        OkanaganFireMission held = ReachLargeForceHold();
        double fuel = held.Snapshot().Aircraft.FuelKg;
        double load = held.Snapshot().Aircraft.WaterLoadKg;
        Observe(held, flank, fuel, 0, released: load);
        Assert.Equal(load, held.WaterReleasedKg, 1);
        Assert.Equal(0, held.EffectiveDrops);
        Assert.Equal(0, held.Snapshot().EffectiveWaterKg);

        OkanaganFireMission cleared = ReachLargeForceHold();
        Vec3D hold = cleared.Snapshot().Route[0].PositionWorldM;
        int dwellTicks = (int)(13 / FireBossDynamics.FixedDeltaSeconds);
        for (int tick = 0; tick < dwellTicks; tick++)
            Observe(cleared, hold, fuel, load);
        Assert.Equal(OkanaganMissionPhase.Ingress, cleared.Phase);
        Observe(cleared, OkanaganGeo.ToWorld(49.850, -119.655, 900), fuel, load);
        Assert.Equal(OkanaganMissionPhase.Drop, cleared.Phase);
        Observe(cleared, flank, fuel, 0, released: load);
        Assert.Equal(1, cleared.EffectiveDrops);
        Assert.True(cleared.Snapshot().EffectiveWaterKg > 0);
    }

    static Vec3D FlankReleasePoint()
    {
        var cells = new OkanaganFireGrid().ActiveCells(400);
        var boundary = cells.First(cell => cell.FuelType == "O1"
            && cells.Any(other => other.FuelType == "C7" && Flat(cell, other) <= 200));
        return new Vec3D(boundary.X, 900, boundary.Z);
    }

    static OkanaganFireMission ReachLargeForceHold()
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.LargeForceEmployment);
        double fuel = mission.Snapshot().Aircraft.FuelKg;
        Observe(mission, OkanaganFireMission.RunwayDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.AirportDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, load, FireBossSurfaceMode.Water);
        Observe(mission, OkanaganFireMission.LoadedLiftoff with { Y = 800 }, fuel, load);
        Assert.Equal(OkanaganMissionPhase.Hold, mission.Phase);
        return mission;
    }

    [Fact]
    public void ADropEntirelyInOneFuelDoesNotCountUntilItCrossesIntoTheOther()
    {
        var cells = new OkanaganFireGrid().ActiveCells(400);
        var grass = IsolatedHotCell(cells, "O1", "C7");
        var timber = IsolatedHotCell(cells, "C7", "O1");
        var boundary = cells.First(cell => cell.FuelType == "O1"
            && cells.Any(other => other.FuelType == "C7" && Flat(cell, other) <= 200));
        Vec3D crossing = new((grass.X + boundary.X) / 2.0, 900, (grass.Z + boundary.Z) / 2.0);
        // The crossing aim has to sit on the flank, not out in the pure grass.
        crossing = new(boundary.X, 900, boundary.Z);

        Assert.Equal(0, DropsAfterRelease(new(grass.X, 900, grass.Z)));
        Assert.Equal(0, DropsAfterRelease(new(timber.X, 900, timber.Z)));
        Assert.Equal(1, DropsAfterRelease(crossing));
    }

    static OkanaganFireCellSnapshot IsolatedHotCell(
        IReadOnlyList<OkanaganFireCellSnapshot> cells, string fuel, string other) =>
        cells.Where(cell => cell.FuelType == fuel && cell.Intensity > 0.2)
            .OrderByDescending(cell => cells.Where(candidate => candidate.FuelType == other)
                .Min(candidate => Flat(cell, candidate)))
            .First();

    static int DropsAfterRelease(Vec3D at)
    {
        var mission = OkanaganFireMission.Create(OkanaganSortieType.FireAttack);
        double fuel = mission.Snapshot().Aircraft.FuelKg;
        Observe(mission, OkanaganFireMission.RunwayDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.AirportDeparture, fuel, 0);
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, 0, FireBossSurfaceMode.Water);
        double load = mission.Snapshot().ScoopTargetWaterKg;
        Observe(mission, OkanaganFireMission.ScoopTouchdown, fuel, load, FireBossSurfaceMode.Water);
        Observe(mission, OkanaganFireMission.ScoopExit with { Y = 800 }, fuel, load);
        Observe(mission, OkanaganGeo.ToWorld(49.850, -119.655, 900), fuel, load);
        Assert.Equal(OkanaganMissionPhase.Drop, mission.Phase);
        Observe(mission, at, fuel, 0, released: load);
        return mission.EffectiveDrops;
    }

    static void Observe(OkanaganFireMission mission, Vec3D position, double fuel, double water,
        FireBossSurfaceMode surface = FireBossSurfaceMode.Airborne, double released = 0) =>
        mission.ObserveFlight(mission.Snapshot().Aircraft with {
            PositionWorldM = position, SurfaceMode = surface, WaterLoadKg = water, FuelKg = fuel,
            GrossMassKg = FireBossDynamics.EmptyOperatingMassKg + fuel + water,
            WaterReleasedThisTickKg = released,
        });

    static double Flat(OkanaganFireCellSnapshot a, OkanaganFireCellSnapshot b)
    {
        double dx = a.X - b.X, dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }

    static double HeadingDeg(in Vec3D from, in Vec3D to)
    {
        double degrees = Math.Atan2(to.X - from.X, to.Z - from.Z) * 180.0 / Math.PI;
        return (degrees + 360.0) % 360.0;
    }

    static double HorizontalDistance(Vec3D from, Vec3D to) => Math.Sqrt(
        Math.Pow(to.X - from.X, 2.0)
            + Math.Pow(to.Z - from.Z, 2.0));
}

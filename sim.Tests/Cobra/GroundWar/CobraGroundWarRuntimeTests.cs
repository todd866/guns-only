using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra.GroundWar;

public class CobraGroundWarRuntimeTests
{
    sealed class FlatTerrain : ITerrainSurface
    {
        readonly double _heightM;

        public FlatTerrain(double heightM = 200.0) => _heightM = heightM;

        public TerrainBounds Bounds => new(-8_000.0, 8_000.0, -8_000.0, 8_000.0);
        public double HorizontalResolutionM => 50.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample)
        {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(_heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static CobraGroundWarRuntime CreateWar(int seed = 42) =>
        new(CobraCanyonDefinition.Create(), new FlatTerrain(), seed);

    [Fact]
    public void CampEmberDepartPadHasNoSeededHostiles()
    {
        CobraGroundWarRuntime war = CreateWar();
        ContestedSite camp = war.Sites.First(site => site.Label == "Camp Ember");
        Assert.DoesNotContain(
            war.LivingUnits().Where(unit => unit.Faction == GroundFaction.Hostile),
            unit => unit.HomeSiteId == camp.Id);
        Assert.Contains(
            war.LivingUnits().Where(unit => unit.Faction == GroundFaction.Friendly),
            unit => unit.HomeSiteId == camp.Id);
    }

    [Fact]
    public void IronBellSeedsADestroyableHostileFight()
    {
        CobraGroundWarRuntime war = CreateWar();
        // Key off the stable id, never the display label: labels are cosmetic and were renamed
        // for era accuracy (2026-08-12), which broke this test for no behavioural reason.
        ContestedSite bridge = war.Sites.First(site => site.Id == "site.iron-bell-bridge.v1");
        GroundUnit[] hostiles = war.LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Hostile && unit.HomeSiteId == bridge.Id)
            .ToArray();

        Assert.True(hostiles.Length >= 5, $"Iron Bell hostiles={hostiles.Length}, need a real fight");
        Assert.Contains(hostiles, unit => unit.Role == GroundUnitRole.HardPoint);
        Assert.True(
            hostiles.Count(unit => unit.Role == GroundUnitRole.SoftVehicle) >= 2,
            "need soft vehicles the M134 can wreck");
        Assert.Contains(hostiles, unit => unit.Role == GroundUnitRole.InfantryClump);
    }

    [Fact]
    public void SeedsContestedSitesWithBothFactionsUnderTheLivingBudget()
    {
        CobraGroundWarRuntime war = CreateWar();

        Assert.Equal(4, war.Sites.Count);
        Assert.Contains(war.Sites, site => site.Id == "site.iron-bell-bridge.v1");
        Assert.Contains(war.Sites, site => site.Label == "Camp Ember");
        Assert.True(war.LivingUnits().Count() >= 16);
        Assert.True(war.LivingUnits().Count() <= CobraGroundWarRuntime.MaxLivingUnits);
        Assert.Contains(war.LivingUnits(), unit => unit.Faction == GroundFaction.Friendly);
        Assert.Contains(war.LivingUnits(), unit => unit.Faction == GroundFaction.Hostile);
        Assert.Contains(war.LivingUnits(), unit => unit.Role == GroundUnitRole.SoftVehicle);
        Assert.Contains(war.LivingUnits(), unit => unit.Role == GroundUnitRole.HardPoint);
    }

    [Fact]
    public void SeededHostilesSitOutsideTheAuthoredMinimumGunSolutionOfTheirHomeSite()
    {
        CobraGroundWarRuntime war = CreateWar();
        Dictionary<string, ContestedSite> sites = war.Sites.ToDictionary(site => site.Id);

        foreach (GroundUnit hostile in war.LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Hostile
                // The conquest garrison stands ON the point by contract — that is what makes the
                // point contested. It is engaged from standoff, not from a hover overhead, so the
                // site-centre proxy this test uses does not apply to it.
                && !unit.Id.EndsWith(
                    CobraGroundWarRuntime.GarrisonUnitIdSuffix, StringComparison.Ordinal))) {
            ContestedSite home = sites[hostile.HomeSiteId];
            double horizontalM = Math.Sqrt(
                Math.Pow(hostile.PositionWorldM.X - home.PositionWorldM.X, 2.0)
                + Math.Pow(hostile.PositionWorldM.Z - home.PositionWorldM.Z, 2.0));
            Assert.True(
                horizontalM + 1e-6 >= CobraGunTargeting.MinimumSolutionRangeM,
                $"hostile {hostile.Id} seeded {horizontalM:F1} m from {home.Label}; "
                + $"need ≥ {CobraGunTargeting.MinimumSolutionRangeM} m");
        }
    }

    [Fact]
    public void MutualCombatAndDriftAreDeterministicForAFixedSeed()
    {
        CobraGroundWarRuntime a = CreateWar(7);
        CobraGroundWarRuntime b = CreateWar(7);
        for (int tick = 0; tick < 240; tick++) {
            a.Advance(PlayerVehicleContract.FixedDeltaSeconds);
            b.Advance(PlayerVehicleContract.FixedDeltaSeconds);
        }

        Assert.Equal(a.Balance.Control, b.Balance.Control);
        Assert.Equal(a.LivingUnits().Count(), b.LivingUnits().Count());
        Assert.Equal(
            a.LivingUnits().Select(unit => (unit.Id, unit.Health, unit.PositionWorldM)),
            b.LivingUnits().Select(unit => (unit.Id, unit.Health, unit.PositionWorldM)));
    }

    [Fact]
    public void PlayerHostileKillsTipControlTowardFriendlyAndExpendAmmo()
    {
        CobraGroundWarRuntime war = CreateWar();
        GroundUnit hostile = war.LivingUnits()
            .First(unit => unit.Faction == GroundFaction.Hostile
                && unit.Role == GroundUnitRole.InfantryClump);
        double before = war.Balance.Control;
        int ammoBefore = war.Magazine.RoundsRemaining;

        bool hit = false;
        for (int tick = 0; tick < 600 && hostile.IsAlive; tick++) {
            hit |= war.ApplyAuthorizedFire(hostile.Id, PlayerVehicleContract.FixedDeltaSeconds);
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);
        }

        Assert.True(hit);
        Assert.True(war.Magazine.RoundsRemaining < ammoBefore);
        Assert.True(war.Debrief.HostileKillsByPlayer >= 1);
        Assert.True(war.Balance.Control > before);
        Assert.True(war.Debrief.RoundsExpended > 0);
    }

    [Fact]
    public void DryMagazineCannotDamageTargets()
    {
        // 240 rps so one 120 Hz window still expends a whole round; sub-rate windows no longer
        // invent rounds (fractional pacing), which is what this fixture previously relied on.
        var magazine = new CobraTurretMagazine(capacityRounds: 1, fireRateRoundsPerSecond: 240.0);
        var war = new CobraGroundWarRuntime(
            CobraCanyonDefinition.Create(), new FlatTerrain(), seed: 3, magazine);
        GroundUnit hostile = war.LivingUnits()
            .First(unit => unit.Faction == GroundFaction.Hostile);
        Assert.True(war.ApplyAuthorizedFire(hostile.Id, PlayerVehicleContract.FixedDeltaSeconds));
        Assert.True(war.Magazine.IsDry);
        double health = hostile.Health;
        Assert.False(war.ApplyAuthorizedFire(hostile.Id, PlayerVehicleContract.FixedDeltaSeconds));
        Assert.Equal(health, hostile.Health);
    }

    [Fact]
    public void CampEmberPadRearmsADryMagazine()
    {
        var magazine = new CobraTurretMagazine(capacityRounds: 50, fireRateRoundsPerSecond: 100.0);
        var war = new CobraGroundWarRuntime(
            CobraCanyonDefinition.Create(), new FlatTerrain(), seed: 11, magazine);
        GroundUnit hostile = war.LivingUnits()
            .First(unit => unit.Faction == GroundFaction.Hostile);
        while (!war.Magazine.IsDry)
            war.ApplyAuthorizedFire(hostile.Id, PlayerVehicleContract.FixedDeltaSeconds);

        Assert.True(war.Magazine.IsDry);
        ContestedSite camp = war.Sites.First(site => site.Label == "Camp Ember");
        Vec3D onPad = new(
            camp.PositionWorldM.X,
            camp.PositionWorldM.Y + 2.0,
            camp.PositionWorldM.Z);
        Assert.True(war.TryResupplyAtFob(onPad));
        Assert.Equal(war.Magazine.CapacityRounds, war.Magazine.RoundsRemaining);
        Assert.Equal(1, war.Debrief.FobRearmCount);
    }

    [Fact]
    public void MissionRuntimeOwnsGroundWarAndKeepsFlyingPastRouteEnd()
    {
        var runtime = new CobraMissionRuntime(
            CobraCanyonDefinition.Create(),
            new FlatTerrain(),
            CobraCanyonRouteChoice.RiverGorge,
            groundWarSeed: 5);
        Assert.True(runtime.GroundWar.LivingUnits().Any());
        double collective = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var command = new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0);
        for (int tick = 0; tick < 120; tick++)
            runtime.Advance(command);

        Assert.Equal(CobraMissionStatus.Active, runtime.Status);
        Assert.True(runtime.GroundWar.AuthorityTick > 0);
        Assert.True(runtime.GroundWar.Magazine.RoundsRemaining > 0);
    }

    /// <summary>
    /// Performance invariant, not decoration. The basin fight is a STRATEGIC layer: stepping it
    /// at the airframe's 120 Hz cost 3.5 ms of every 4.2 ms authority tick in Build 265 (measured
    /// in the browser via a phase-skip build) and was the whole of the "very laggy" report. The
    /// mission runtime must batch it to its own cadence. If someone re-couples the two rates,
    /// this fails before a player ever feels it.
    /// </summary>
    [Fact]
    public void MissionRuntimeStepsGroundWarAtItsStrategicCadenceNotTheAirframeRate()
    {
        var runtime = new CobraMissionRuntime(
            CobraCanyonDefinition.Create(),
            new FlatTerrain(),
            CobraCanyonRouteChoice.RiverGorge,
            groundWarSeed: 5);
        double collective = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var command = new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0);

        int airframeTicksPerSecond = (int)Math.Round(PlayerVehicleContract.FixedStepHz);
        for (int tick = 0; tick < airframeTicksPerSecond; tick++)
            runtime.Advance(command);

        Assert.True(CobraMissionRuntime.GroundWarStepHz < PlayerVehicleContract.FixedStepHz,
            "the ground war must be cheaper than the flight model, not tied to it");
        Assert.Equal(
            (long)Math.Round(CobraMissionRuntime.GroundWarStepHz),
            runtime.GroundWar.AuthorityTick);
    }

    /// <summary>
    /// The ticket bleed must be wall-clock, not a count of Advance calls: the mission runtime
    /// batches this runtime to its own strategic cadence, so a tick-counted bleed would run an
    /// order of magnitude slow at 10 Hz and an order fast at 120 Hz. Same wall-clock window and
    /// same board must spend the same tickets at any step rate. (Replaces the old
    /// HoldTheBridgeTimersAreWallClockAtAnyStepRate, which pinned the same invariant on the
    /// control-hold timers tickets have superseded.)
    /// </summary>
    [Theory]
    [InlineData(120.0)]
    [InlineData(20.0)]
    [InlineData(10.0)]
    public void TicketBleedIsWallClockAtAnyStepRate(double stepHz)
    {
        CobraGroundWarRuntime war = CreateWar();
        foreach (ContestedSite site in war.Sites)
            war.OverrideSiteOccupancyForTests(site.Id, friendly: 1, hostile: 0);
        double stepSeconds = 1.0 / stepHz;
        for (int step = 0; step < (int)Math.Round(25.0 / stepSeconds); step++)
            war.Advance(stepSeconds);
        Assert.Equal(4, war.FriendlyPointsHeld);

        double hostileAtSplit = war.HostileTickets;
        const double windowSeconds = 30.0;
        for (int step = 0; step < (int)Math.Round(windowSeconds / stepSeconds); step++)
            war.Advance(stepSeconds);

        double expected = CobraGroundWarRuntime.TicketBleedPerSecondPerPoint * 4.0 * windowSeconds;
        Assert.Equal(expected, hostileAtSplit - war.HostileTickets, 6);
    }

    [Fact]
    public void StandingGunnerySeamSitsOnTheNoseInsideTheGunWindow()
    {
        CobraGroundWarRuntime war = CreateWar();
        var aircraft = new Vec3D(0.0, 220.0, 0.0);
        double yawRad = 0.0;
        GroundUnit seam = war.SeedStandingGunneryTarget(aircraft, yawRad);

        Assert.Equal(CobraGroundWarRuntime.GunnerySeamUnitId, seam.Id);
        Assert.Equal(GroundFaction.Hostile, seam.Faction);
        Assert.True(seam.IsAlive);
        var assessment = CobraGunTargeting.Assess(aircraft, yawRad, seam.PositionWorldM);
        Assert.True(assessment.WithinTurretEnvelope, $"az {assessment.AzimuthErrorRad} el {assessment.ElevationRad}");
        Assert.True(assessment.HasBallisticSolution, $"range {assessment.RangeM}");
        Assert.True(assessment.AzimuthErrorRad < 0.05);
    }

    [Fact]
    public void StandingGunnerySeamSurvivesFriendlyMutualCombat()
    {
        CobraGroundWarRuntime war = CreateWar();
        GroundUnit seam = war.SeedStandingGunneryTarget(new Vec3D(0.0, 220.0, 0.0), 0.0);
        double healthBefore = seam.Health;
        for (int tick = 0; tick < 120 * 30; tick++)
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);

        GroundUnit? still = war.FindUnit(CobraGroundWarRuntime.GunnerySeamUnitId);
        Assert.NotNull(still);
        Assert.True(still!.IsAlive);
        Assert.Equal(healthBefore, still.Health, 3);
    }

    /// <summary>
    /// The control number must no longer be able to decide anything. Pinning it past the old
    /// victory threshold for far longer than the old 45 s hold must leave the mission Pending.
    /// (Replaces HoldingFriendlyControlWinsHoldTheBridge, which asserted the opposite.)
    /// </summary>
    [Fact]
    public void PinnedControlNoLongerDecidesTheMission()
    {
        CobraGroundWarRuntime war = CreateWar();
        Assert.Equal(HoldTheBridgeOutcome.Pending, war.MissionOutcome);

        const double stepSeconds = 0.25;
        for (int step = 0; step < (int)Math.Round(120.0 / stepSeconds); step++) {
            war.OverrideControlForTests(CobraGroundWarRuntime.VictoryControlThreshold + 0.05);
            war.Advance(stepSeconds);
        }

        Assert.Equal(HoldTheBridgeOutcome.Pending, war.MissionOutcome);
        Assert.True(war.Balance.Control >= CobraGroundWarRuntime.VictoryControlThreshold,
            "control survives as a readout even though it decides nothing");
    }

    /// <summary>
    /// Losing the points loses the battle. (Replaces DeepHostileControlLosesHoldTheBridge, which
    /// drove defeat through the control number.)
    /// </summary>
    [Fact]
    public void LosingEveryPointExhaustsFriendlyTickets()
    {
        CobraGroundWarRuntime war = CreateWar();
        foreach (ContestedSite site in war.Sites)
            war.OverrideSiteOccupancyForTests(site.Id, friendly: 0, hostile: 1);

        const double stepSeconds = 0.25;
        int steps = (int)Math.Round(400.0 / stepSeconds);
        for (int step = 0;
            step < steps && war.MissionOutcome == HoldTheBridgeOutcome.Pending;
            step++)
            war.Advance(stepSeconds);

        Assert.Equal(0, war.FriendlyPointsHeld);
        Assert.Equal(HoldTheBridgeOutcome.Defeat, war.MissionOutcome);
        Assert.Equal("tickets-exhausted", war.MissionOutcomeReason);
    }

    [Fact]
    public void ZeroInputGroundWarLosesTheBasinWithoutFireSupport()
    {
        // The mission must NEED the player: with the turret silent the hostile waves must
        // drown the garrison. A self-winning ground war (Build 261 production defect: victory
        // at ~75 s with the Cobra still on the pad) is the failure this test pins.
        CobraGroundWarRuntime war = CreateWar(seed: 42);
        int ticks = (int)Math.Round(300.0 / PlayerVehicleContract.FixedDeltaSeconds);

        for (int tick = 0; tick < ticks && war.MissionOutcome == HoldTheBridgeOutcome.Pending; tick++)
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);

        Assert.Equal(HoldTheBridgeOutcome.Defeat, war.MissionOutcome);
        Assert.True(
            war.Debrief.PeakFriendlyControl < CobraGroundWarRuntime.VictoryControlThreshold,
            $"friendly control peaked at {war.Debrief.PeakFriendlyControl:F3} with zero input; "
            + $"it must stay below {CobraGroundWarRuntime.VictoryControlThreshold}");
    }

    [Fact]
    public void ScriptedFireSupportHoldsTheBasinAndWins()
    {
        // Simulated competent gunner at the sim API: every tick, kill the hostile push with
        // authorized turret fire and rearm at the Camp Ember pad on bingo. The player's fire
        // must be the difference between this Victory and the zero-input Defeat above.
        //
        // The target priority is garrison-first, and that is the whole conquest loop rather than
        // a convenience: a dug-in garrison is immune to ground fire (GroundUnit.IsFortified), so
        // it is the ONLY thing on the board that cannot be resolved without the turret. The
        // previous policy here — first hostile by ordinal id — sorted every `ground.hostile.*`
        // pusher ahead of every `site.*.garrison` and so, against a 15 s wave cadence, never
        // reached a garrison at all and never took a point. A gunner who only shoots what is
        // shooting back loses this mission; that is the intended lesson.
        CobraGroundWarRuntime war = CreateWar(seed: 42);
        ContestedSite camp = war.Sites.First(site => site.Label == "Camp Ember");
        Vec3D pad = new(
            camp.PositionWorldM.X,
            camp.PositionWorldM.Y + 2.0,
            camp.PositionWorldM.Z);
        // A conquest sortie is longer than a control-meter one: this policy reaches 3-1 at ~100 s
        // and then bleeds 300 hostile tickets down at 1.0/s, landing Victory near 370 s. The
        // window is deliberately generous of that so the gate measures "does competent fire win"
        // rather than "does it win inside a stopwatch".
        int ticks = (int)Math.Round(480.0 / PlayerVehicleContract.FixedDeltaSeconds);

        for (int tick = 0; tick < ticks && war.MissionOutcome == HoldTheBridgeOutcome.Pending; tick++) {
            if (war.Magazine.IsBingo)
                war.TryResupplyAtFob(pad);
            GroundUnit? target = war.LivingUnits()
                .Where(unit => unit.Faction == GroundFaction.Hostile)
                .OrderByDescending(unit => unit.IsFortified)
                .ThenBy(unit => unit.Id, StringComparer.Ordinal)
                .FirstOrDefault();
            if (target is not null)
                war.ApplyAuthorizedFire(target.Id, PlayerVehicleContract.FixedDeltaSeconds);
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);
        }

        Assert.Equal(HoldTheBridgeOutcome.Victory, war.MissionOutcome);
        Assert.True(war.Debrief.HostileKillsByPlayer > 0);
    }

    /// <summary>
    /// Conquest rule, not decoration: a point may only change hands while exactly one faction
    /// stands in it. A contested point (both factions inside the radius) freezes — that freeze is
    /// what makes a hostile garrison worth the player's rounds.
    /// </summary>
    [Fact]
    public void ASiteFlipsOnlyWhileExactlyOneFactionStandsInIt()
    {
        CobraGroundWarRuntime war = CreateWar();
        ContestedSite bridge = war.Sites.First(site => site.Id == "site.iron-bell-bridge.v1");
        Assert.Equal(GroundSiteOwner.Hostile, bridge.Owner);

        const double stepSeconds = 0.25;
        war.OverrideSiteOccupancyForTests(bridge.Id, friendly: 1, hostile: 0);
        for (int step = 0; step < (int)Math.Round(30.0 / stepSeconds); step++)
            war.Advance(stepSeconds);
        Assert.Equal(GroundSiteOwner.Friendly, bridge.Owner);

        war.OverrideSiteOccupancyForTests(bridge.Id, friendly: 1, hostile: 1);
        GroundSiteOwner ownerBefore = bridge.Owner;
        double progressBefore = bridge.CaptureProgress;
        for (int step = 0; step < (int)Math.Round(30.0 / stepSeconds); step++)
            war.Advance(stepSeconds);

        Assert.True(bridge.IsContested);
        Assert.Equal(ownerBefore, bridge.Owner);
        Assert.Equal(progressBefore, bridge.CaptureProgress, 6);
    }

    [Fact]
    public void AnEmptySiteNeverChangesHands()
    {
        CobraGroundWarRuntime war = CreateWar();
        ContestedSite quarry = war.Sites.First(site => site.Id == "site.red-earth-quarry.v1");
        GroundSiteOwner ownerBefore = quarry.Owner;

        war.OverrideSiteOccupancyForTests(quarry.Id, friendly: 0, hostile: 0);
        const double stepSeconds = 0.25;
        for (int step = 0; step < (int)Math.Round(120.0 / stepSeconds); step++)
            war.Advance(stepSeconds);

        Assert.False(quarry.IsContested);
        Assert.Equal(ownerBefore, quarry.Owner);
    }

    [Fact]
    public void CampEmberStartsFriendlyAndTheGorgeSitesStartHostile()
    {
        CobraGroundWarRuntime war = CreateWar();
        Dictionary<string, ContestedSite> sites = war.Sites.ToDictionary(site => site.Id);

        Assert.Equal(GroundSiteOwner.Friendly, sites["site.camp-ember.v1"].Owner);
        Assert.Equal(GroundSiteOwner.Hostile, sites["site.iron-bell-bridge.v1"].Owner);
        Assert.Equal(GroundSiteOwner.Hostile, sites["site.plantation-water-tower.v1"].Owner);
        Assert.Equal(GroundSiteOwner.Hostile, sites["site.red-earth-quarry.v1"].Owner);
    }

    const string GarrisonTestSiteId = "site.plantation-water-tower.v1";
    const int GarrisonTestPushClumps = 6;
    const double GarrisonTestStepSeconds = 0.25;
    const double GarrisonTestPushSeconds = 60.0;

    /// <summary>
    /// The stall is EMERGENT, not special-cased: the garrison stands inside the capture radius, so
    /// both factions are present, so the point is contested and cannot flip. This test and
    /// <see cref="KillingTheGarrisonLetsTheSamePushTakeThePoint"/> are byte-identical apart from
    /// the garrison kill — that difference alone must decide the point.
    ///
    /// Honest about what the garrison is: the friendly push does eventually grind it down on its
    /// own (measured 10.25 s at this push size), so it is not an unbreakable block. What the
    /// turret buys is those ten seconds, and with hostile waves re-entering the radius on a
    /// cadence that head start is the difference between a point that flips and one that never
    /// does — progress here stalls at 0.67 and never completes.
    /// </summary>
    [Fact]
    public void AnIntactGarrisonStallsAFriendlyPush()
    {
        CobraGroundWarRuntime war = CreateWar();
        ContestedSite site = war.Sites.First(candidate => candidate.Id == GarrisonTestSiteId);
        Assert.Equal(GroundSiteOwner.Hostile, site.Owner);
        GroundUnit? garrison = war.FindUnit(CobraGroundWarRuntime.GarrisonUnitId(GarrisonTestSiteId));
        Assert.NotNull(garrison);
        Assert.True(garrison!.IsAlive);

        war.SeedFriendlyPushForTests(GarrisonTestSiteId, GarrisonTestPushClumps);
        for (int step = 0;
            step < (int)Math.Round(GarrisonTestPushSeconds / GarrisonTestStepSeconds);
            step++)
            war.Advance(GarrisonTestStepSeconds);

        // The control variable: the turret never fired a round in this test.
        Assert.Equal(0, war.Debrief.RoundsExpended);
        Assert.Equal(GroundSiteOwner.Hostile, site.Owner);
    }

    /// <summary>
    /// The garrison must be an AIR problem, not merely a slow ground problem. Before it was
    /// fortified the friendly units already seeded at the site ground its 140 hp down in 10-16 s
    /// with no player involvement — the stall above still passed (hostile waves re-contested the
    /// point) but for the wrong reason, and the objective strip's promise to the player was a
    /// lie the AI quietly fulfilled. Ground fire must achieve nothing at all against it.
    /// </summary>
    [Fact]
    public void GroundFireAloneNeverBreaksAGarrison()
    {
        CobraGroundWarRuntime war = CreateWar();
        GroundUnit? garrison = war.FindUnit(CobraGroundWarRuntime.GarrisonUnitId(GarrisonTestSiteId));
        Assert.NotNull(garrison);
        Assert.True(garrison!.IsFortified, "a conquest garrison must be dug in");

        war.SeedFriendlyPushForTests(GarrisonTestSiteId, GarrisonTestPushClumps);
        for (int step = 0; step < (int)Math.Round(240.0 / GarrisonTestStepSeconds); step++)
            war.Advance(GarrisonTestStepSeconds);

        Assert.Equal(0, war.Debrief.RoundsExpended);
        Assert.True(
            garrison.IsAlive,
            "four minutes of massed ground fire must not scratch a dug-in garrison");
        Assert.Equal(garrison.MaxHealth, garrison.Health, 6);
    }

    /// <summary>
    /// Identical to <see cref="AnIntactGarrisonStallsAFriendlyPush"/> except for the one marked
    /// block below, which kills the garrison with authorized turret fire before the clock starts.
    /// Same seed, same push, same duration, same step size.
    /// </summary>
    [Fact]
    public void KillingTheGarrisonLetsTheSamePushTakeThePoint()
    {
        CobraGroundWarRuntime war = CreateWar();
        ContestedSite site = war.Sites.First(candidate => candidate.Id == GarrisonTestSiteId);
        Assert.Equal(GroundSiteOwner.Hostile, site.Owner);
        GroundUnit? garrison = war.FindUnit(CobraGroundWarRuntime.GarrisonUnitId(GarrisonTestSiteId));
        Assert.NotNull(garrison);
        Assert.True(garrison!.IsAlive);

        // --- THE ONLY DIFFERENCE FROM AnIntactGarrisonStallsAFriendlyPush ---
        for (int shot = 0; shot < 2_000 && garrison.IsAlive; shot++)
            war.ApplyAuthorizedFire(
                CobraGroundWarRuntime.GarrisonUnitId(GarrisonTestSiteId),
                PlayerVehicleContract.FixedDeltaSeconds);
        Assert.False(garrison.IsAlive, "the player must be able to break the garrison");
        // --- END OF THE ONLY DIFFERENCE ---

        war.SeedFriendlyPushForTests(GarrisonTestSiteId, GarrisonTestPushClumps);
        for (int step = 0;
            step < (int)Math.Round(GarrisonTestPushSeconds / GarrisonTestStepSeconds);
            step++)
            war.Advance(GarrisonTestStepSeconds);

        Assert.Equal(GroundSiteOwner.Friendly, site.Owner);
    }

    /// <summary>
    /// Pins occupancy and runs the board forward until the requested points have actually changed
    /// hands, so a bleed assertion measures the split it means to measure and not the 20 s flip
    /// window on the way there. Returns nothing — the caller reads the runtime.
    /// </summary>
    static void SettleOccupancy(CobraGroundWarRuntime war, double stepSeconds = 0.25)
    {
        for (int step = 0; step < (int)Math.Round(25.0 / stepSeconds); step++)
            war.Advance(stepSeconds);
    }

    [Fact]
    public void HoldingMorePointsBleedsTheOtherSide()
    {
        CobraGroundWarRuntime war = CreateWar();
        war.OverrideSiteOccupancyForTests("site.camp-ember.v1", friendly: 1, hostile: 0);
        war.OverrideSiteOccupancyForTests("site.iron-bell-bridge.v1", friendly: 1, hostile: 0);
        war.OverrideSiteOccupancyForTests("site.plantation-water-tower.v1", friendly: 1, hostile: 0);
        war.OverrideSiteOccupancyForTests("site.red-earth-quarry.v1", friendly: 0, hostile: 1);
        SettleOccupancy(war);

        Assert.Equal(3, war.FriendlyPointsHeld);
        Assert.Equal(1, war.HostilePointsHeld);
        // The board opens 1-3, so friendly bleeds during the flip window and only then stops. Both
        // facts matter: measure from the settled split.
        double friendlyAtSplit = war.FriendlyTickets;
        double hostileAtSplit = war.HostileTickets;
        Assert.True(
            friendlyAtSplit < CobraGroundWarRuntime.StartingTickets,
            "friendly must have bled while it was still the side down on points");

        const double stepSeconds = 0.25;
        for (int step = 0; step < (int)Math.Round(60.0 / stepSeconds); step++)
            war.Advance(stepSeconds);

        Assert.True(war.HostileTickets < hostileAtSplit - 50.0,
            $"hostile tickets {war.HostileTickets:F1} must bleed at a 3-1 split");
        Assert.Equal(friendlyAtSplit, war.FriendlyTickets, 6);
    }

    [Fact]
    public void AnEvenSplitBleedsNeitherSide()
    {
        CobraGroundWarRuntime war = CreateWar();
        war.OverrideSiteOccupancyForTests("site.camp-ember.v1", friendly: 1, hostile: 0);
        war.OverrideSiteOccupancyForTests("site.iron-bell-bridge.v1", friendly: 1, hostile: 0);
        war.OverrideSiteOccupancyForTests("site.plantation-water-tower.v1", friendly: 0, hostile: 1);
        war.OverrideSiteOccupancyForTests("site.red-earth-quarry.v1", friendly: 0, hostile: 1);
        SettleOccupancy(war);

        Assert.Equal(2, war.FriendlyPointsHeld);
        Assert.Equal(2, war.HostilePointsHeld);
        double friendly = war.FriendlyTickets;
        double hostile = war.HostileTickets;

        const double stepSeconds = 0.25;
        for (int step = 0; step < (int)Math.Round(60.0 / stepSeconds); step++)
            war.Advance(stepSeconds);

        Assert.Equal(friendly, war.FriendlyTickets, 6);
        Assert.Equal(hostile, war.HostileTickets, 6);
    }

    [Fact]
    public void TicketExhaustionEndsTheMission()
    {
        CobraGroundWarRuntime war = CreateWar();
        foreach (ContestedSite site in war.Sites)
            war.OverrideSiteOccupancyForTests(site.Id, friendly: 1, hostile: 0);

        const double stepSeconds = 0.25;
        int steps = (int)Math.Round(400.0 / stepSeconds);
        for (int step = 0;
            step < steps && war.MissionOutcome == HoldTheBridgeOutcome.Pending;
            step++)
            war.Advance(stepSeconds);

        Assert.Equal(HoldTheBridgeOutcome.Victory, war.MissionOutcome);
        Assert.Equal("tickets-exhausted", war.MissionOutcomeReason);
        Assert.True(war.HostileTickets <= 0.0);
        Assert.Equal(1.0, war.VictoryHoldProgress, 6);
    }

    [Fact]
    public void MissionRuntimeTerminalizesOnHoldTheBridgeVictory()
    {
        var runtime = new CobraMissionRuntime(
            CobraCanyonDefinition.Create(),
            new FlatTerrain(),
            CobraCanyonRouteChoice.RiverGorge,
            groundWarSeed: 9);
        double collective = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        var command = new VerticalLiftPilotCommand(collective, 0.0, 0.0, 0.0);
        // Victory is now a ticket question: pin every point friendly and let the bleed run. The
        // whole point of driving it through CobraMissionRuntime is that the ground war steps at
        // its own strategic cadence — a tick-counted bleed would never terminalize here.
        foreach (ContestedSite site in runtime.GroundWar.Sites)
            runtime.GroundWar.OverrideSiteOccupancyForTests(site.Id, friendly: 1, hostile: 0);
        int maxTicks = (int)Math.Round(400.0 / PlayerVehicleContract.FixedDeltaSeconds);
        for (int tick = 0;
            tick < maxTicks && runtime.Status == CobraMissionStatus.Active;
            tick++)
            runtime.Advance(command);

        Assert.Equal(CobraMissionStatus.Victory, runtime.Status);
        Assert.Equal(HoldTheBridgeOutcome.Victory, runtime.GroundWar.MissionOutcome);
    }
}

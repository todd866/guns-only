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
            .Where(unit => unit.Faction == GroundFaction.Hostile)) {
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
    /// The Hold-the-Bridge timers must be wall-clock, not a count of Advance calls: once the
    /// ground war steps at its own cadence, a tick-counted timer would stretch the 45 s hold to
    /// four and a half minutes.
    /// </summary>
    [Theory]
    [InlineData(120.0)]
    [InlineData(20.0)]
    [InlineData(10.0)]
    public void HoldTheBridgeTimersAreWallClockAtAnyStepRate(double stepHz)
    {
        CobraGroundWarRuntime war = CreateWar();
        double stepSeconds = 1.0 / stepHz;
        int steps = (int)Math.Round(CobraGroundWarRuntime.VictoryHoldSeconds / stepSeconds);
        for (int step = 0; step < steps; step++) {
            war.OverrideControlForTests(CobraGroundWarRuntime.VictoryControlThreshold + 0.05);
            war.Advance(stepSeconds);
        }

        Assert.Equal(HoldTheBridgeOutcome.Victory, war.MissionOutcome);
        Assert.Equal(1.0, war.VictoryHoldProgress, 3);
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

    [Fact]
    public void HoldingFriendlyControlWinsHoldTheBridge()
    {
        CobraGroundWarRuntime war = CreateWar();
        Assert.Equal(HoldTheBridgeOutcome.Pending, war.MissionOutcome);

        for (int tick = 0; tick < CobraGroundWarRuntime.VictoryHoldTicks; tick++) {
            war.OverrideControlForTests(CobraGroundWarRuntime.VictoryControlThreshold + 0.05);
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);
        }

        Assert.Equal(HoldTheBridgeOutcome.Victory, war.MissionOutcome);
        Assert.Equal("held-bridge", war.MissionOutcomeReason);
        Assert.Equal(1.0, war.VictoryHoldProgress, 3);
    }

    [Fact]
    public void DeepHostileControlLosesHoldTheBridge()
    {
        CobraGroundWarRuntime war = CreateWar();
        for (int tick = 0; tick < CobraGroundWarRuntime.DefeatHoldTicks; tick++) {
            war.OverrideControlForTests(CobraGroundWarRuntime.DefeatControlThreshold - 0.05);
            war.Advance(PlayerVehicleContract.FixedDeltaSeconds);
        }

        Assert.Equal(HoldTheBridgeOutcome.Defeat, war.MissionOutcome);
        Assert.Equal("lost-basin", war.MissionOutcomeReason);
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
        CobraGroundWarRuntime war = CreateWar(seed: 42);
        ContestedSite camp = war.Sites.First(site => site.Label == "Camp Ember");
        Vec3D pad = new(
            camp.PositionWorldM.X,
            camp.PositionWorldM.Y + 2.0,
            camp.PositionWorldM.Z);
        int ticks = (int)Math.Round(300.0 / PlayerVehicleContract.FixedDeltaSeconds);

        for (int tick = 0; tick < ticks && war.MissionOutcome == HoldTheBridgeOutcome.Pending; tick++) {
            if (war.Magazine.IsBingo)
                war.TryResupplyAtFob(pad);
            GroundUnit? target = war.LivingUnits()
                .Where(unit => unit.Faction == GroundFaction.Hostile)
                .OrderBy(unit => unit.Id, StringComparer.Ordinal)
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
        for (int tick = 0;
            tick < CobraGroundWarRuntime.VictoryHoldTicks
                && runtime.Status == CobraMissionStatus.Active;
            tick++) {
            runtime.GroundWar.OverrideControlForTests(
                CobraGroundWarRuntime.VictoryControlThreshold + 0.05);
            runtime.Advance(command);
        }

        Assert.Equal(CobraMissionStatus.Victory, runtime.Status);
        Assert.Equal(HoldTheBridgeOutcome.Victory, runtime.GroundWar.MissionOutcome);
    }
}

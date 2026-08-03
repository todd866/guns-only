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
    public void SeedsContestedSitesWithBothFactionsUnderTheLivingBudget()
    {
        CobraGroundWarRuntime war = CreateWar();

        Assert.Equal(4, war.Sites.Count);
        Assert.Contains(war.Sites, site => site.Label == "Iron Bell Bridge");
        Assert.Contains(war.Sites, site => site.Label == "Camp Ember");
        Assert.True(war.LivingUnits().Count() >= 16);
        Assert.True(war.LivingUnits().Count() <= CobraGroundWarRuntime.MaxLivingUnits);
        Assert.Contains(war.LivingUnits(), unit => unit.Faction == GroundFaction.Friendly);
        Assert.Contains(war.LivingUnits(), unit => unit.Faction == GroundFaction.Hostile);
        Assert.Contains(war.LivingUnits(), unit => unit.Role == GroundUnitRole.SoftVehicle);
        Assert.Contains(war.LivingUnits(), unit => unit.Role == GroundUnitRole.HardPoint);
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
        var magazine = new CobraTurretMagazine(capacityRounds: 1, fireRateRoundsPerSecond: 100.0);
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
        Assert.True(runtime.GroundWar.AuthorityTick >= 120);
        Assert.True(runtime.GroundWar.Magazine.RoundsRemaining > 0);
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

using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public sealed class FirstRunValleyBeatTests {
    [Fact]
    public void FirstRunValleyIsADistinctOverlayOnFirstMerge() {
        BeatSetup valley = Beats.ModernVisualMergeFirstRun();
        BeatSetup merge = Beats.ModernVisualMerge();

        Assert.Equal(FirstRunValleyRuntime.MissionId, valley.MissionIdentity.Id);
        Assert.NotEqual(merge.MissionIdentity.Id, valley.MissionIdentity.Id);
        Assert.Equal("HEATERS_THEN_GUNS_FREE", valley.MissionIdentity.RulesOfEngagement);
        Assert.Equal("GUNS_ONLY_GUNS_FREE", merge.MissionIdentity.RulesOfEngagement);
        Assert.Null(merge.FirstRunValley);
        Assert.Equal(FirstRunValleyRuntime.PopOutNorthM, valley.FirstRunValley!.PopOutNorthM);
        Assert.Equal(2, valley.FirstRunValley.Aim9Rounds);
        Assert.Equal(merge.CombatRules, valley.CombatRules);
        Assert.NotNull(valley.ContinuousCombat);
        Assert.Equal(Ukraine2030sTheatre.HeroCell.LocationId,
            valley.EnvironmentIdentity.LocationId);
        Assert.Equal(Ukraine2030sTheatre.Shared.LocationId,
            merge.EnvironmentIdentity.LocationId);
    }

    [Fact]
    public void FirstRunValleyStartsInTheSurveyedSoniachneDraw() {
        BeatSetup valley = Beats.ModernVisualMergeFirstRun();
        Assert.Equal(FirstRunValleyRuntime.ValleyEastM, valley.Player.Position.X, 3);
        Assert.Equal(FirstRunValleyRuntime.PlayerNorthM, valley.Player.Position.Z, 3);
        Assert.Equal(0.0, valley.Player.Chi, 6);
        Assert.Equal(FirstRunValleyRuntime.SpawnAltitudeM, valley.Player.Position.Y, 3);
        Assert.Equal(FirstRunValleyRuntime.ValleyEastM, valley.Bandit.Position.X, 3);
        Assert.Equal(FirstRunValleyRuntime.BanditNorthM, valley.Bandit.Position.Z, 3);
        Assert.Equal(0.0, valley.Bandit.Chi, 6);
        Assert.True(valley.Bandit.Position.Z - valley.Player.Position.Z
            > Aim9SurrogateMinLaunchRange());
        Assert.True(valley.FirstRunValley!.PopOutNorthM - valley.Player.Position.Z > 2_000.0);
        Assert.True(valley.Bandit.Position.Z - valley.FirstRunValley.PopOutNorthM
            >= GunsOnly.Sim.Missiles.Aim9Surrogate.MinLaunchRangeM);
    }

    [Fact]
    public void FirstRunValleySpawnClearsTheAtlasFloorInsideTheDraw() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        BeatSetup valley = Beats.ModernVisualMergeFirstRun();
        Assert.True(terrain.TryHeightM(
            valley.Player.Position.X, valley.Player.Position.Z, out double floorM));
        double aglM = valley.Player.Position.Y - floorM;
        Assert.InRange(aglM, 50.0, 90.0);
        Assert.True(terrain.TryHeightM(
            valley.Player.Position.X - 1_200.0, valley.Player.Position.Z, out double westM));
        Assert.True(westM > valley.Player.Position.Y - 15.0,
            "west wall should still read as a ridge beside the jet");
    }

    [Fact]
    public void BuiltInCatalogueStillMapsSevenToTheHighMerge() {
        Assert.Equal(
            Beats.ModernVisualMerge().MissionIdentity.Id,
            Beats.BuiltIn(7).MissionIdentity.Id);
        Assert.Equal(14, Beats.LastBuiltInIndex);
    }

    static double Aim9SurrogateMinLaunchRange() =>
        GunsOnly.Sim.Missiles.Aim9Surrogate.MinLaunchRangeM;
}

using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

public class UkraineTerrainTruthTests {
    [Fact]
    public void SoniachneCoreIsDeterministicTrueScaleAndContainsEveryAuthoredRaidTrack() {
        ITerrainSurface terrain = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        ITerrainSurface replay = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());

        Assert.Equal(new TerrainBounds(-8_192.0, 8_192.0, -8_192.0, 8_192.0),
            terrain.Bounds);
        Assert.Equal(32.0, terrain.HorizontalResolutionM);

        BeatSetup beat = Beats.DroneRaidDefense();
        Assert.True(terrain.TrySample(beat.Player.Position.X, beat.Player.Position.Z,
            out TerrainSample playerGround));
        Assert.True(beat.Player.Position.Y - playerGround.HeightM > 250.0);

        foreach (AircraftState target in beat.DroneRaid!.Targets) {
            Assert.True(terrain.TrySample(target.Position.X, target.Position.Z,
                out TerrainSample ground));
            Assert.True(target.Position.Y - ground.HeightM > 100.0);
            double trackClearanceM = TerrainQueries.MinimumClearanceM(
                terrain,
                target.Position,
                new Vec3D(0.0, target.Position.Y, 0.0),
                maximumHorizontalStepM: 25.0);
            Assert.True(trackClearanceM > 100.0,
                $"raid track clearance was only {trackClearanceM:F1} m");
        }

        Assert.True(terrain.TrySample(2_375.0, -1_690.0, out TerrainSample first));
        Assert.True(replay.TrySample(2_375.0, -1_690.0, out TerrainSample second));
        Assert.Equal(first, second);
    }

    [Fact]
    public void CoarseSafetyApronKeepsAglTruthBeyondTheDetailedCellWithoutClaimingLzDetail() {
        ITerrainSurface core = Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load());
        var apron = new TrainingTerrainApronSurface(core,
            marginM: 92_000.0, flatHeightM: 78.0, transitionM: 4_000.0);

        Assert.True(apron.TrySample(0.0, 0.0, out TerrainSample centre));
        Assert.True(core.TrySample(0.0, 0.0, out TerrainSample coreCentre));
        Assert.Equal(coreCentre, centre);
        Assert.True(apron.TrySample(20_000.0, 0.0, out TerrainSample outside));
        Assert.Equal(78.0, outside.HeightM, 8);
        Assert.Equal(TerrainSurfaceKind.Land, outside.Kind);
        Assert.False(core.TrySample(20_000.0, 0.0, out _));
    }
}

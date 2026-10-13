using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class BfmSpawnSafetyTests {
    static BilinearHeightGrid Ridge(double heightM) {
        var heights = new double[2, 2] { { heightM, heightM }, { heightM, heightM } };
        return new BilinearHeightGrid(-5_000.0, -5_000.0, 10_000.0, 10_000.0, heights);
    }

    static AircraftState ClimbingLowPlayer() => new(
        new Vec3D(0.0, 200.0, 0.0), 180.0, 30.0 * System.Math.PI / 180.0,
        0.0, 0.0, FlightModel.Sabre.MassKg);

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public void BfmSuccessorClearsAdjacentRidgeForBothStartRoles(int lessonIndex) {
        ITerrainSurface terrain = Ridge(500.0);
        AircraftState player = ClimbingLowPlayer();
        AircraftState successor = BfmLesson.Get(lessonIndex).Start(
            player, FlightModel.Sabre, terrain);

        Assert.True(successor.Position.Y >= 1_100.0 - 1e-9,
            $"{BfmLesson.Get(lessonIndex).Id} successor must clear the ridge: y={successor.Position.Y:F1}");
        Assert.True(successor.Position.Y > player.Position.Y,
            "terrain staging must move only the successor, never the player");
    }
}

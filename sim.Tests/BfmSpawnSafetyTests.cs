using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class BfmSpawnSafetyTests {
    sealed class RidgeTerrain(double ridgeHeightM, double ridgeStartZ, double ridgeEndZ,
        TerrainBounds bounds) : ITerrainSurface {
        public TerrainBounds Bounds => bounds;
        public double HorizontalResolutionM => 25.0;
        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) { sample = default; return false; }
            double height = northM >= ridgeStartZ && northM <= ridgeEndZ ? ridgeHeightM : 0.0;
            sample = new(height, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    static AircraftState Player(double altitudeM = 200.0, double gammaDeg = 30.0,
        double z = 0.0) => new(new Vec3D(0.0, altitudeM, z), 180.0,
        gammaDeg * System.Math.PI / 180.0, 0.0, 0.0, FlightModel.Sabre.MassKg);

    static RidgeTerrain RidgeAhead(double heightM = 900.0) => new(heightM, 500.0, 700.0,
        new TerrainBounds(-5_000.0, 5_000.0, -5_000.0, 5_000.0));

    [Fact]
    public void NullTerrainProtectsLowClimbingSuccessorAndPreservesFlightVector() {
        AircraftState player = Player();
        Vec3D offset = player.ForwardDir() * 600 - new Vec3D(20, -10, 0);
        AircraftState successor = BfmLesson.Get(1).Start(player, FlightModel.Sabre);
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
        Assert.Equal(Math.Asin(offset.Y / offset.Length), successor.Gamma, 12);
        Assert.Equal(Math.Atan2(offset.X, offset.Z), successor.Chi, 12);
    }

    [Fact]
    public void RidgeAheadIsClearedWithoutMovingPlayerOrChangingAuthoredAngles() {
        AircraftState player = Player(altitudeM: 900.0, gammaDeg: 10.0, z: 1_000.0);
        AircraftState authored = BfmLesson.Get(1).Start(player, FlightModel.Sabre);
        AircraftState successor = BfmLesson.Get(1).Start(player, FlightModel.Sabre, RidgeAhead());
        Assert.True(successor.Position.Y >= 1_400.0 - 1e-9,
            $"spawn y={successor.Position.Y:F1}, authored y={authored.Position.Y:F1}");
        Assert.Equal(authored.Gamma, successor.Gamma, 12);
        Assert.Equal(authored.Chi, successor.Chi, 12);
    }

    [Fact]
    public void DownhillInitialPathIsRaisedUsingActualFlightVector() {
        AircraftState successor = BfmLesson.Get(2).Start(
            Player(altitudeM: 200.0, gammaDeg: -30.0), FlightModel.Sabre);
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
        Assert.Equal(-30.0 * System.Math.PI / 180.0, successor.Gamma, 12);
        Assert.True((successor.Position + successor.ForwardDir() * 1600).Y >= 600 - 1e-9);
    }

    [Fact]
    public void OutOfBoundsTerrainFallsBackToSeaLevelClearance() {
        AircraftState successor = BfmLesson.Get(1).Start(Player(), FlightModel.Sabre,
            new RidgeTerrain(2_000.0, -1.0, 1.0,
                new TerrainBounds(-10.0, 10.0, -10.0, 10.0)));
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
    }

    [Fact]
    public void PartialTerrainCoverageRetainsKnownRidgeAlongPitchedPath() {
        var terrain = new RidgeTerrain(1800, 200, 400,
            new TerrainBounds(-500, 500, -1000, 500));
        var successor = BfmLesson.Get(1).Start(Player(900, 0), FlightModel.Sabre, terrain);
        // Both endpoints miss the ridge; the run-in then leaves the available terrain.
        for (int metres = 0; metres <= 1600; metres += 10) {
            Vec3D point = successor.Position + successor.ForwardDir() * metres;
            double floor = terrain.TrySample(point.X, point.Z, out var sample) ? sample.HeightM : 0;
            Assert.True(point.Y - floor >= 600 - 1e-9, $"clearance at {metres}m: {point.Y - floor}");
        }
    }

    [Fact]
    public void HighAuthoredSpawnRemainsUnchangedAndBeatThreadsTerrain() {
        AircraftState high = Player(altitudeM: 4_000.0, gammaDeg: 0.0);
        AircraftState authored = BfmLesson.Get(1).Start(high, FlightModel.Sabre);
        AircraftState safe = BfmLesson.Get(1).Start(high, FlightModel.Sabre, RidgeAhead());
        Assert.Equal(authored.Position, safe.Position);

        BeatSetup beat = Beats.ModernVisualMerge();
        IBandit bandit = beat.CreateNextBandit(Player(), 2, RidgeAhead(),
            BfmLesson.Get(1).Spawn(1));
        Assert.True(bandit.State.Position.Y >= 600.0 - 1e-9);
    }
}

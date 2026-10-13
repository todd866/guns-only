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

    static RidgeTerrain RidgeAhead(double heightM = 900.0) => new(heightM, -500.0, 0.0,
        new TerrainBounds(-5_000.0, 5_000.0, -5_000.0, 5_000.0));

    [Fact]
    public void NullTerrainProtectsLowClimbingSuccessorAndPreservesFlightVector() {
        AircraftState player = Player();
        AircraftState authored = BfmLesson.Get(1).Start(player, FlightModel.Sabre);
        AircraftState successor = BfmLesson.Get(1).Start(player, FlightModel.Sabre);
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
        Assert.Equal(authored.Gamma, successor.Gamma, 12);
        Assert.Equal(authored.Chi, successor.Chi, 12);
    }

    [Fact]
    public void RidgeAheadIsClearedWithoutMovingPlayerOrChangingAuthoredAngles() {
        AircraftState player = Player(altitudeM: 2_000.0, gammaDeg: 10.0, z: 1_000.0);
        AircraftState authored = BfmLesson.Get(1).Start(player, FlightModel.Sabre);
        AircraftState successor = BfmLesson.Get(1).Start(player, FlightModel.Sabre, RidgeAhead());
        Assert.True(successor.Position.Y >= 1_500.0 - 1e-9);
        Assert.Equal(authored.Gamma, successor.Gamma, 12);
        Assert.Equal(authored.Chi, successor.Chi, 12);
    }

    [Fact]
    public void DownhillInitialPathIsRaisedUsingActualFlightVector() {
        AircraftState successor = BfmLesson.Get(2).Start(
            Player(altitudeM: 200.0, gammaDeg: -30.0), FlightModel.Sabre);
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
        Assert.Equal(-30.0 * System.Math.PI / 180.0, successor.Gamma, 12);
    }

    [Fact]
    public void OutOfBoundsTerrainFallsBackToSeaLevelClearance() {
        AircraftState successor = BfmLesson.Get(1).Start(Player(), FlightModel.Sabre,
            new RidgeTerrain(2_000.0, -1.0, 1.0,
                new TerrainBounds(-10.0, 10.0, -10.0, 10.0)));
        Assert.True(successor.Position.Y >= 600.0 - 1e-9);
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

using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class LowBlockHuntingTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static BilinearHeightGrid FlatTerrain() =>
        Grid(withRidges: false);

    static BilinearHeightGrid RidgeValleyTerrain() =>
        Grid(withRidges: true);

    static BilinearHeightGrid Grid(bool withRidges) {
        const int northPoints = 36;
        const int eastPoints = 9;
        var heights = new double[northPoints, eastPoints];
        for (int north = 0; north < northPoints; north++) {
            for (int east = 0; east < eastPoints; east++) {
                if (!withRidges) continue;
                double eastM = -8000.0 + east * 2000.0;
                double distanceFromValleyM = Math.Abs(eastM);
                heights[north, east] = distanceFromValleyM switch {
                    >= 4000.0 => 650.0,
                    >= 2000.0 => 180.0,
                    _ => 0.0,
                };
            }
        }
        return new BilinearHeightGrid(
            -8000.0, -20_000.0, 2000.0, 2000.0, heights);
    }

    readonly record struct LowBlockResult(
        double MinimumClearanceM,
        double MinimumSettledClearanceM,
        double MinimumAltitudeAbovePlayerM,
        bool AchievedFiringCone,
        double FiringConeAtSeconds,
        double MinimumClearanceAtSeconds,
        double GammaAtMinimumClearanceDeg,
        double GAtMinimumClearance,
        double MinimumRangeM,
        double MinimumInRangeNoseErrorDeg);

    static LowBlockResult FlyLowBlockIntercept(
        PilotSkill skill, ITerrainSurface terrain, int seed, double seconds) {
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        double side = (seed & 1) == 0 ? -1.0 : 1.0;
        double banditX = side * (150.0 + (seed % 3 - 1) * 45.0);
        double banditZ = -800.0 + (seed % 3 - 1) * 120.0;
        double banditSurfaceM = TerrainQueries.ClearanceM(
            terrain, new Vec3D(banditX, 0.0, banditZ)) * -1.0;
        double interceptHeadingRad = Math.Atan2(
            -banditX, 2600.0 - banditZ);
        var banditStart = new AircraftState(
            new Vec3D(banditX, banditSurfaceM + 1050.0, banditZ),
            280.0, 0.0, interceptHeadingRad, 0.0, air.MassKg);
        var bandit = new ReactiveBandit(banditStart, air, skill, terrain);

        var player = new AircraftState(
            new Vec3D(0.0, 300.0, 2600.0), 220.0,
            0.0, 0.0, 0.0, air.MassKg);
        Vec3D playerVelocity = player.VelocityVector();
        double minimumClearanceM = double.PositiveInfinity;
        double minimumSettledClearanceM = double.PositiveInfinity;
        double minimumAltitudeAbovePlayerM = double.PositiveInfinity;
        bool achievedFiringCone = false;
        double firingConeAtSeconds = double.NaN;
        double minimumClearanceAtSeconds = double.NaN;
        double gammaAtMinimumClearanceDeg = double.NaN;
        double gAtMinimumClearance = double.NaN;
        double minimumRangeM = double.PositiveInfinity;
        double minimumInRangeNoseErrorDeg = double.PositiveInfinity;

        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks; tick++) {
            var observation = ActorObservation.Capture(player, tick);
            bandit.Step(observation, Dt);
            double clearanceM = TerrainQueries.ClearanceM(
                terrain, bandit.State.Position);
            if (clearanceM < minimumClearanceM) {
                minimumClearanceM = clearanceM;
                minimumClearanceAtSeconds = tick * Dt;
                gammaAtMinimumClearanceDeg = bandit.State.Gamma * 180.0 / Math.PI;
                gAtMinimumClearance = bandit.LastCommand.GDemand;
            }
            minimumAltitudeAbovePlayerM = Math.Min(
                minimumAltitudeAbovePlayerM,
                bandit.State.Position.Y - player.Position.Y);
            if (tick >= 5 * AircraftSim.TickHz)
                minimumSettledClearanceM = Math.Min(
                    minimumSettledClearanceM, clearanceM);

            if (!achievedFiringCone
                && BanditFireControl.InFiringEnvelope(
                    bandit.State, observation,
                    BanditSkillProfile.For(skill).FireConeRad)) {
                achievedFiringCone = true;
                firingConeAtSeconds = tick * Dt;
            }
            double rangeM = Geometry.Range(bandit.State, observation);
            minimumRangeM = Math.Min(minimumRangeM, rangeM);
            if (rangeM >= BanditFireControl.MinimumRangeM
                && rangeM <= BanditFireControl.MaximumRangeM) {
                minimumInRangeNoseErrorDeg = Math.Min(
                    minimumInRangeNoseErrorDeg,
                    BanditFireControl.NoseErrorRad(bandit.State, observation)
                        * 180.0 / Math.PI);
            }
            player = player with {
                Position = player.Position + playerVelocity * Dt
            };
        }

        return new LowBlockResult(
            minimumClearanceM,
            minimumSettledClearanceM,
            minimumAltitudeAbovePlayerM,
            achievedFiringCone,
            firingConeAtSeconds,
            minimumClearanceAtSeconds,
            gammaAtMinimumClearanceDeg,
            gAtMinimumClearance,
            minimumRangeM,
            minimumInRangeNoseErrorDeg);
    }

    [Theory]
    [InlineData(false, 0)]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(true, 0)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    public void AceHuntsAValleyRunnerWithoutTradingTheAirframeForTerrain(
        bool withRidges, int seed) {
        ITerrainSurface terrain = withRidges
            ? RidgeValleyTerrain()
            : FlatTerrain();

        LowBlockResult result = FlyLowBlockIntercept(
            PilotSkill.Ace, terrain, seed, seconds: 70.0);

        Assert.True(result.MinimumSettledClearanceM < 180.0,
            $"Ace never entered the low block: min AGL={result.MinimumSettledClearanceM:F0} m");
        Assert.True(result.AchievedFiringCone,
            $"Ace never converted to firing geometry; "
            + $"min AGL={result.MinimumSettledClearanceM:F0} m, "
            + $"min vertical separation={result.MinimumAltitudeAbovePlayerM:F0} m, "
            + $"min range={result.MinimumRangeM:F0} m, "
            + $"best in-range nose error={result.MinimumInRangeNoseErrorDeg:F1} deg");
        Assert.True(result.FiringConeAtSeconds <= 70.0,
            $"firing geometry arrived outside the bounded window: "
            + $"{result.FiringConeAtSeconds:F1} s");
        Assert.True(result.MinimumClearanceM > 75.0,
            $"Ace struck or scraped terrain: min AGL={result.MinimumClearanceM:F1} m "
            + $"at {result.MinimumClearanceAtSeconds:F1} s, "
            + $"gamma={result.GammaAtMinimumClearanceDeg:F1} deg, "
            + $"command={result.GAtMinimumClearance:F1} G");
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void NoviceKeepsTheConservativePerchAgainstTheSameValleyRunner(
        bool withRidges) {
        ITerrainSurface terrain = withRidges
            ? RidgeValleyTerrain()
            : FlatTerrain();

        LowBlockResult result = FlyLowBlockIntercept(
            PilotSkill.Novice, terrain, seed: 1, seconds: 35.0);

        Assert.True(result.MinimumSettledClearanceM > 500.0,
            $"Novice abandoned the conservative perch: "
            + $"min AGL={result.MinimumSettledClearanceM:F0} m");
        Assert.False(result.AchievedFiringCone,
            "Novice must not gain low-block firing geometry in the Ace corridor");
        Assert.True(result.MinimumClearanceM > 0.0,
            $"Novice struck terrain: min AGL={result.MinimumClearanceM:F1} m");
    }
}

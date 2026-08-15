using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests.Cobra;

public class CampEmberOperationsTests
{
    [Fact]
    public void FinalAndGoAroundRemainClearOfAuthorityTerrain()
    {
        CobraCanyonTerrainSurface terrain = CobraCanyonDefinition.Create().CreateTerrainSurface();
        for (int direction = -1; direction <= 1; direction += 2) {
            for (double distanceM = 300.0; distanceM <= CampEmberOperations.ProtectedLengthM;
                distanceM += 100.0) {
                Vec3D centre = CampEmberOperations.PointAlongFinal(direction * distanceM);
                double protectedHeightM = CampEmberOperations.PadElevationM
                    + distanceM * CampEmberOperations.ObstacleSurfaceRisePerM;
                for (double lateralM = -CampEmberOperations.ProtectedHalfWidthM;
                    lateralM <= CampEmberOperations.ProtectedHalfWidthM;
                    lateralM += 60.0) {
                    double lateralHeadingRad = CampEmberOperations.FinalHeadingRad + Math.PI / 2.0;
                    double eastM = centre.X + Math.Sin(lateralHeadingRad) * lateralM;
                    double northM = centre.Z + Math.Cos(lateralHeadingRad) * lateralM;
                    Assert.True(terrain.TrySample(eastM, northM, out TerrainSample sample));
                    Assert.True(sample.HeightM <= protectedHeightM,
                        $"terrain {sample.HeightM:F1} m penetrates the 8:1 surface "
                        + $"{protectedHeightM:F1} m at {distanceM:F0} m / {lateralM:F0} m");
                }
            }
        }
    }

    [Fact]
    public void ArrivalIsASequencedFinalRatherThanOnePointAtTheFob()
    {
        IReadOnlyList<CobraPathGate> gates = CampEmberOperations.BuildArrivalGates();
        Assert.Equal(6, gates.Count);
        Assert.Single(gates, gate => gate.Active);
        Assert.True(gates[0].UpM > gates[^1].UpM + 250.0);
        Assert.Equal(CampEmberOperations.CentreEastM, gates[^1].EastM, 9);
        Assert.Equal(CampEmberOperations.CentreNorthM, gates[^1].NorthM, 9);

        Vec3D established = CampEmberOperations.ArrivalPoint(1_100.0);
        gates = CampEmberOperations.BuildArrivalGates(established);
        Assert.Equal(600.0,
            HorizontalDistance(gates.Single(gate => gate.Active), CampEmberOperations.CentreWorldM),
            precision: 6);
    }

    static double HorizontalDistance(CobraPathGate gate, in Vec3D point) =>
        Math.Sqrt(Math.Pow(gate.EastM - point.X, 2.0) + Math.Pow(gate.NorthM - point.Z, 2.0));
}

using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class FirstRunValleyTerrainSurfaceTests {
    static ITerrainSurface Flat(double heightM = 100.0) => new BilinearHeightGrid(
        -20_000.0, -20_000.0, 40_000.0, 40_000.0,
        new[,] { { heightM, heightM }, { heightM, heightM } });

    [Fact]
    public void CorridorHasTwoAuthorityOwnedWallsAndAnOpenFloor() {
        var terrain = new FirstRunValleyTerrainSurface(Flat());
        double northM = FirstRunValleyRuntime.PlayerNorthM + 600.0;
        double centreEastM = FirstRunValleyTerrainSurface.CentreEastM(northM);

        Assert.True(terrain.TryHeightM(centreEastM, northM, out double floorM));
        Assert.Equal(FirstRunValleyTerrainSurface.FloorHeightM, floorM, 6);
        Assert.True(terrain.TryHeightM(
            centreEastM - FirstRunValleyTerrainSurface.CrestOffsetM,
            northM, out double westWallM));
        Assert.True(terrain.TryHeightM(
            centreEastM + FirstRunValleyTerrainSurface.CrestOffsetM,
            northM, out double eastWallM));
        Assert.True(westWallM > FirstRunValleyRuntime.SpawnAltitudeM + 380.0,
            $"west wall {westWallM:F1} m must tower over the cockpit");
        Assert.True(eastWallM > FirstRunValleyRuntime.SpawnAltitudeM + 320.0,
            $"east wall {eastWallM:F1} m must tower over the cockpit");
        Assert.True(terrain.MaximumHeightM
            >= FirstRunValleyTerrainSurface.FloorHeightM
                + FirstRunValleyTerrainSurface.WestRidgeRiseM * 1.70,
            "terrain broad-phase ceiling must include ridge variation and butte relief");
    }

    [Fact]
    public void CentrelineRunsEighteenKilometresThroughSeveralBroadReversals() {
        double routeLengthM = FirstRunValleyRuntime.PopOutNorthM
            - FirstRunValleyRuntime.PlayerNorthM;
        Assert.InRange(routeLengthM, 17_500.0, 18_500.0);
        Assert.Equal(FirstRunValleyTerrainSurface.CentreCurveWavelengthM,
            routeLengthM, 6);

        int reversals = 0;
        int previousSign = 0;
        double previousEastM = FirstRunValleyTerrainSurface.CentreEastM(
            FirstRunValleyRuntime.PlayerNorthM);
        double minimumEastM = previousEastM;
        double maximumEastM = previousEastM;
        for (int index = 1; index <= 276; index++) {
            double northM = FirstRunValleyRuntime.PlayerNorthM
                + routeLengthM * index / 276.0;
            double eastM = FirstRunValleyTerrainSurface.CentreEastM(northM);
            double deltaM = eastM - previousEastM;
            int sign = Math.Abs(deltaM) < 0.25 ? 0 : Math.Sign(deltaM);
            if (sign != 0 && previousSign != 0 && sign != previousSign) reversals++;
            if (sign != 0) previousSign = sign;
            minimumEastM = Math.Min(minimumEastM, eastM);
            maximumEastM = Math.Max(maximumEastM, eastM);
            previousEastM = eastM;
        }
        Assert.True(reversals >= 3, $"expected several turn reversals, got {reversals}");
        Assert.True(maximumEastM > 380.0);
        Assert.True(minimumEastM < -600.0);
        double minimumRadiusM = double.PositiveInfinity;
        const double curvatureStepM = 20.0;
        for (double northM = FirstRunValleyRuntime.PlayerNorthM + curvatureStepM;
            northM < FirstRunValleyRuntime.PopOutNorthM - curvatureStepM;
            northM += curvatureStepM) {
            double x0 = FirstRunValleyTerrainSurface.CentreEastM(northM - curvatureStepM);
            double x1 = FirstRunValleyTerrainSurface.CentreEastM(northM);
            double x2 = FirstRunValleyTerrainSurface.CentreEastM(northM + curvatureStepM);
            double a = Math.Sqrt(Math.Pow(x1 - x0, 2.0) + Math.Pow(curvatureStepM, 2.0));
            double b = Math.Sqrt(Math.Pow(x2 - x1, 2.0) + Math.Pow(curvatureStepM, 2.0));
            double c = Math.Sqrt(Math.Pow(x2 - x0, 2.0)
                + Math.Pow(curvatureStepM * 2.0, 2.0));
            double areaM2 = Math.Abs((x1 - x0) * curvatureStepM
                - curvatureStepM * (x2 - x1)) * 0.5;
            if (areaM2 > 1e-6)
                minimumRadiusM = Math.Min(minimumRadiusM, a * b * c / (4.0 * areaM2));
        }
        Assert.True(minimumRadiusM > 1_800.0,
            $"tightest meander radius {minimumRadiusM:F0} m is not a broad jet corridor");
        Assert.Equal(FirstRunValleyRuntime.ValleyEastM,
            FirstRunValleyTerrainSurface.CentreEastM(FirstRunValleyRuntime.PlayerNorthM), 9);
        Assert.Equal(FirstRunValleyRuntime.ValleyEastM,
            FirstRunValleyTerrainSurface.CentreEastM(FirstRunValleyRuntime.PopOutNorthM), 9);
    }

    [Fact]
    public void EntireAuthoredCentrelineIsAContinuousPassableRiverFloor() {
        var terrain = new FirstRunValleyTerrainSurface(Flat());
        for (double northM = FirstRunValleyRuntime.PlayerNorthM;
            northM <= FirstRunValleyRuntime.PopOutNorthM; northM += 50.0) {
            double eastM = FirstRunValleyTerrainSurface.CentreEastM(northM);
            Assert.True(terrain.TryHeightM(eastM, northM, out double floorM));
            Assert.True(floorM <= FirstRunValleyTerrainSurface.FloorHeightM + 1e-6,
                $"centreline rose into an obstruction at north {northM:F0}");
            Assert.True(FirstRunValleyRuntime.SpawnAltitudeM - floorM >= 150.0,
                $"centreline clearance collapsed at north {northM:F0}");
        }
    }

    [Theory]
    [InlineData(0.00,     0.0,    0.000000000,  150.000000000)]
    [InlineData(0.08,   -900.0,   45.632178689, 1_030.350072934)]
    [InlineData(0.08,    900.0,   45.632178689,   826.840337640)]
    [InlineData(0.18,   -900.0,  306.060781779,   427.605228636)]
    [InlineData(0.29,  1_728.0,  300.743507573,   599.831428773)]
    [InlineData(0.39,    900.0, -262.691498671,   326.053587511)]
    [InlineData(0.55, -1_824.0, -511.597761018,   639.461581787)]
    [InlineData(0.64,   -900.0,  -68.225174252,   337.867055690)]
    [InlineData(0.74,  1_680.0,  278.616094404,   655.146389698)]
    [InlineData(0.82,    900.0,  233.225558826,   436.193455422)]
    [InlineData(0.90,   -550.0,   66.296004253,   401.507697952)]
    [InlineData(1.00,    900.0,   -0.000000000,   170.214425408)]
    public void VersionedRecipeMatchesTheBrowserGoldenSamples(double progress01,
        double signedOffsetM, double expectedCentreEastM, double expectedHeightM) {
        double northM = FirstRunValleyRuntime.PlayerNorthM
            + FirstRunValleyTerrainSurface.CentreCurveWavelengthM * progress01;
        double centreEastM = FirstRunValleyTerrainSurface.CentreEastM(northM);
        double heightM = FirstRunValleyTerrainSurface.AuthoredHeightM(
            centreEastM + signedOffsetM, northM);

        Assert.InRange(Math.Abs(centreEastM - expectedCentreEastM), 0.0, 1e-6);
        Assert.InRange(Math.Abs(heightM - expectedHeightM), 0.0, 1e-6);
    }

    [Fact]
    public void StratifiedWallsContainBenchesAndAlternatingTributaryOpenings() {
        Assert.True(FirstRunValleyTerrainSurface.StratifiedWallRiseM(430.0) < 430.0,
            "a mid-band wall sample should sit on a visible rock bench");
        Assert.Equal(260.0,
            FirstRunValleyTerrainSurface.StratifiedWallRiseM(260.0), 6);

        double routeLengthM = FirstRunValleyTerrainSurface.CentreCurveWavelengthM;
        double eastCutNorthM = FirstRunValleyRuntime.PlayerNorthM + routeLengthM * 0.39;
        double westCutNorthM = FirstRunValleyRuntime.PlayerNorthM + routeLengthM * 0.64;
        Assert.True(FirstRunValleyTerrainSurface.SideCutOpening01(
            FirstRunValleyTerrainSurface.CrestOffsetM, eastCutNorthM) > 0.70);
        Assert.Equal(0.0, FirstRunValleyTerrainSurface.SideCutOpening01(
            -FirstRunValleyTerrainSurface.CrestOffsetM, eastCutNorthM), 6);
        Assert.True(FirstRunValleyTerrainSurface.SideCutOpening01(
            -FirstRunValleyTerrainSurface.CrestOffsetM, westCutNorthM) > 0.60);

        double butteNorthM = FirstRunValleyRuntime.PlayerNorthM + routeLengthM * 0.55;
        Assert.True(FirstRunValleyTerrainSurface.ButteRiseM(
            -FirstRunValleyTerrainSurface.OuterOffsetM * 0.76, butteNorthM) > 230.0);
        Assert.Equal(0.0, FirstRunValleyTerrainSurface.ButteRiseM(
            FirstRunValleyTerrainSurface.OuterOffsetM * 0.76, butteNorthM), 6);
    }

    [Fact]
    public void RidgesFallAwayAtThePopOutAndOutsideTheBoundedOverlay() {
        var terrain = new FirstRunValleyTerrainSurface(Flat());
        double entryNorthM = FirstRunValleyRuntime.PlayerNorthM;
        double entryCentreM = FirstRunValleyTerrainSurface.CentreEastM(entryNorthM);
        double popOutCentreM = FirstRunValleyTerrainSurface.CentreEastM(
            FirstRunValleyRuntime.PopOutNorthM);

        terrain.TryHeightM(entryCentreM + FirstRunValleyTerrainSurface.CrestOffsetM,
            entryNorthM, out double entryWallM);
        terrain.TryHeightM(popOutCentreM + FirstRunValleyTerrainSurface.CrestOffsetM,
            FirstRunValleyRuntime.PopOutNorthM, out double popOutWallM);
        terrain.TryHeightM(entryCentreM + FirstRunValleyTerrainSurface.OuterOffsetM + 300.0,
            entryNorthM, out double outsideM);

        Assert.True(entryWallM - popOutWallM > 350.0,
            "the ridge must visibly release into an opening before weapons become hot");
        Assert.Equal(100.0, outsideM, 6);
    }

    [Fact]
    public void SurfaceSampleAndHeightUseTheSameComposite() {
        var terrain = new FirstRunValleyTerrainSurface(Flat());
        double northM = FirstRunValleyRuntime.PlayerNorthM + 900.0;
        double eastM = FirstRunValleyTerrainSurface.CentreEastM(northM)
            - FirstRunValleyTerrainSurface.CrestOffsetM;
        Assert.True(terrain.TryHeightM(eastM, northM, out double heightM));
        Assert.True(terrain.TrySample(eastM, northM, out TerrainSample sample));
        Assert.Equal(heightM, sample.HeightM, 9);
        Assert.Equal(TerrainSurfaceKind.Land, sample.Kind);
        Assert.True(double.IsFinite(sample.UpNormal.X));
        Assert.True(double.IsFinite(sample.UpNormal.Y));
        Assert.True(double.IsFinite(sample.UpNormal.Z));
        Assert.True(sample.UpNormal.Y > 0.0);
    }

    [Fact]
    public void SessionAppliesTheValleyOverlayOnlyToTheFirstRunBeat() {
        ITerrainSurface source = Flat();
        var firstRun = new SimulationSession();
        firstRun.StartBeatWithEnvironment(Beats.ModernVisualMergeFirstRun, null, source);
        Assert.IsType<FirstRunValleyTerrainSurface>(firstRun.Terrain);

        var regular = new SimulationSession();
        regular.StartBeatWithEnvironment(Beats.ModernVisualMerge, null, source);
        Assert.Same(source, regular.Terrain);

        firstRun.StartBeat(Beats.ModernVisualMerge);
        Assert.Same(source, firstRun.Terrain);

        firstRun.StartBeatWithEnvironment(Beats.ModernVisualMergeFirstRun, null, source);
        firstRun.StartBeat(7);
        Assert.Same(source, firstRun.Terrain);
    }
}

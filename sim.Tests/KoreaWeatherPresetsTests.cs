using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class KoreaWeatherPresetsTests {
    [Fact]
    public void EveryBuiltInBeatReceivesAStableLayeredWeatherDay() {
        for (int beat = 1; beat <= 8; beat++) {
            WeatherProfile first = KoreaWeatherPresets.ForBeat(beat);
            WeatherProfile replay = KoreaWeatherPresets.ForBeat(beat);
            var clouds = Assert.IsType<LayeredCloudField>(first.Clouds);

            Assert.Same(first, replay);
            Assert.StartsWith("weather.korea-", first.Id);
            Assert.NotEmpty(clouds.Layers);
            Assert.InRange(clouds.ClearAirVisibilityM, 50_000.0, 150_000.0);
        }
    }

    [Fact]
    public void ModernSortiesStartInAPlayableHoleWithCloudMassesNearby() {
        BeatSetup merge = Beats.ModernVisualMerge();
        BeatSetup drone = Beats.DroneRaidDefense();
        WeatherProfile mergeWeather = KoreaWeatherPresets.ForBeat(7);
        WeatherProfile droneWeather = KoreaWeatherPresets.ForBeat(8);

        Assert.True(mergeWeather.Clouds.Sample(merge.Player.Position, 0.0).VisibilityM
            > 50_000.0);
        Assert.True(droneWeather.Clouds.Sample(drone.Player.Position, 0.0).VisibilityM
            > 50_000.0);
        Assert.True(mergeWeather.Clouds.Sample(new Vec3D(-8_000.0, 5_000.0, -12_000.0),
            0.0).VisibilityM < 1_000.0);
        Assert.True(droneWeather.Clouds.Sample(new Vec3D(3_500.0, 2_200.0, 0.0),
            0.0).VisibilityM < 1_000.0);
    }

    [Fact]
    public void WebNoisePortHasAStableCrossRuntimeReferenceVector() {
        double value = Hashing.Value(0.25, -0.5, 1.75, 0x1234_5678_90ab_cdefUL);
        Assert.Equal(0.041854168391723734, value, 14);
    }

    [Fact]
    public void SessionCanStageWeatherAndTerrainWithoutEitherReplacingTheOther() {
        var terrain = new BilinearHeightGrid(-10_000.0, -10_000.0, 10_000.0, 10_000.0,
            new double[,] {
                { 25.0, 25.0 },
                { 25.0, 25.0 }
            });
        WeatherProfile weather = KoreaWeatherPresets.ForBeat(7);
        var session = new SimulationSession();

        session.StartBeatWithEnvironment(7, weather, terrain);

        Assert.Same(weather, session.Weather);
        Assert.Same(terrain, session.Terrain);
        Assert.Equal(7, session.BeatIndex);
    }
}

using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

public class KoreaWeatherPresetsTests {
    [Fact]
    public void EveryBuiltInBeatReceivesAStableLayeredWeatherDay() {
        for (int beat = 1; beat <= 10; beat++) {
            WeatherProfile first = KoreaWeatherPresets.ForBeat(beat);
            WeatherProfile replay = KoreaWeatherPresets.ForBeat(beat);
            var clouds = Assert.IsType<LayeredCloudField>(first.Clouds);

            Assert.Same(first, replay);
            Assert.StartsWith("weather.ukraine-2030s.", first.Id);
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
        Assert.Equal(0.0,
            droneWeather.Clouds.Sample(drone.Player.Position, 0.0).CloudFraction01);
        Assert.All(drone.DroneRaid!.Targets, target =>
            Assert.Equal(0.0,
                droneWeather.Clouds.Sample(target.Position, 0.0).CloudFraction01));
        Assert.Equal("weather.ukraine-2030s.winter-snow-squall.v1",
            droneWeather.Id);
        Assert.True(droneWeather.Clouds.Sample(new Vec3D(-5_100.0, 1_700.0, 5_800.0),
            0.0).VisibilityM < 1_000.0);
        PrecipitationSample localSnow =
            droneWeather.Precipitation.Sample(drone.Player.Position, 0.0);
        Assert.Equal(HydrometeorPhase.Snow, localSnow.Rates.DominantPhase);
        Assert.True(localSnow.VisibilityM < 1_000.0);
        Assert.True(droneWeather.SurfaceConditions
            .Sample(drone.Player.Position.X, drone.Player.Position.Z, 0.0)
            .SnowDepthM > 0.08);

        // Mission 7's deck is deliberately BROKEN at the fight altitude rather than a slab or a
        // decoration parked off in the distance: sweeping the engagement volume must find both
        // solid cloud and clear air. A magic single point would silently pass if the layer were
        // moved out from under the fight again.
        int cloud = 0, clear = 0;
        for (double x = -2_000.0; x <= 6_000.0; x += 400.0)
        for (double z = -6_000.0; z <= 6_000.0; z += 400.0) {
            double visibilityM = mergeWeather.Clouds
                .Sample(new Vec3D(x, merge.Player.Position.Y, z), 0.0).VisibilityM;
            if (visibilityM < 1_000.0) cloud++;
            else if (visibilityM > 50_000.0) clear++;
        }
        Assert.True(cloud > 0.15 * (cloud + clear),
            $"merge altitude is too clear to fly through: {cloud} cloud / {clear} clear");
        Assert.True(clear > 0.15 * (cloud + clear),
            $"merge altitude is solid IMC, not broken: {cloud} cloud / {clear} clear");
    }

    [Fact]
    public void RapierReceivesTheUkraineHighAltitudeColumn() {
        WeatherProfile rapier = KoreaWeatherPresets.ForBeat(10);
        WeatherProfile economicRapier = KoreaWeatherPresets.ForBeat(12);
        WeatherProfile inland = KoreaWeatherPresets.ForBeat(1);

        Assert.Equal("weather.ukraine-2030s.rapier-high-altitude.v1", rapier.Id);
        Assert.Same(rapier, economicRapier);
        Assert.Same(rapier.Atmosphere, inland.Atmosphere);
        Assert.True(rapier.Clouds.Sample(new Vec3D(0.0, 21_500.0, 0.0), 0.0)
            .VisibilityM > 50_000.0);
        Assert.True(rapier.Wind.Sample(new Vec3D(0.0, 21_500.0, 0.0)).Length
            > rapier.Wind.Sample(new Vec3D(0.0, 500.0, 0.0)).Length);

        int cloud = 0, clear = 0;
        for (double x = -70_000.0; x <= 70_000.0; x += 5_000.0)
        for (double z = -70_000.0; z <= 70_000.0; z += 5_000.0) {
            double visibilityM = rapier.Clouds
                .Sample(new Vec3D(x, 10_000.0, z), 0.0).VisibilityM;
            if (visibilityM < 5_000.0) cloud++;
            else if (visibilityM > 50_000.0) clear++;
        }
        Assert.True(cloud > 0,
            $"Rapier deck has no readable cloud islands: {cloud} cloud / {clear} clear");
        Assert.True(clear > 0,
            $"Rapier deck is an unbroken slab: {cloud} cloud / {clear} clear");
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

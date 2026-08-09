using System.Text.Json;
using GunsOnly.Sim.Motorcycle;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.Motorcycle;

/// <summary>
/// Pins the helmet-cam JSON boundary the weekend-ride bridge ships to the browser.
/// Uses the production projection directly, not a test-side copy of the field list.
/// </summary>
public sealed class MotorcycleSnapshotProjectionTests
{
    static MotorcyclePilotCommand HardLaunch =>
        new(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);

    [Fact]
    public void StateJsonCarriesSimAuthoredPitch()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        for (int i = 0; i < 480; i++)
            runtime.StepFixed(HardLaunch);

        WeekendRideSnapshot snapshot = runtime.Snapshot();
        using JsonDocument document = JsonDocument.Parse(
            MotorcycleSnapshotProjection.BuildStateJson(
                runtime, MotorcycleControlMode.Assisted));
        JsonElement root = document.RootElement;

        double pitchRad = root.GetProperty("pitch_rad").GetDouble();
        Assert.Equal(snapshot.PitchRad, pitchRad);
        Assert.True(double.IsFinite(pitchRad));
        Assert.NotEqual(0.0, pitchRad);
    }

    [Fact]
    public void StateJsonKeepsHelmetCamSiblingsIntact()
    {
        var runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        for (int i = 0; i < 120; i++)
            runtime.StepFixed(HardLaunch);

        WeekendRideSnapshot snapshot = runtime.Snapshot();
        using JsonDocument document = JsonDocument.Parse(
            MotorcycleSnapshotProjection.BuildStateJson(
                runtime, MotorcycleControlMode.Raw));
        JsonElement root = document.RootElement;

        Assert.Equal(snapshot.LeanRad, root.GetProperty("lean_rad").GetDouble());
        Assert.Equal(snapshot.ViewAttitude.W, root.GetProperty("view_qw").GetDouble());
        Assert.Equal(snapshot.WheelieBalance, root.GetProperty("wheelie_balance").GetDouble());
        Assert.Equal(snapshot.StoppieBalance, root.GetProperty("stoppie_balance").GetDouble());
        Assert.Equal(snapshot.CircuitProgressM, root.GetProperty("circuit_progress_m").GetDouble());
        Assert.Equal(snapshot.CircuitLengthM, root.GetProperty("circuit_length_m").GetDouble());
        Assert.Equal(snapshot.LastSectorIndex, root.GetProperty("last_sector").GetInt32());
        Assert.Equal(snapshot.NextSectorIndex, root.GetProperty("next_sector").GetInt32());
        Assert.Equal(snapshot.GoldenPathKind, root.GetProperty("golden_path_kind").GetString());
        Assert.Equal(snapshot.GoldenPathToken, root.GetProperty("golden_path_token").GetString());
        Assert.Equal(snapshot.IsOnOpenRoad, root.GetProperty("on_open_road").GetBoolean());
        Assert.Equal(
            snapshot.OpenRoadDistanceM,
            root.GetProperty("open_road_distance_m").GetDouble());
        Assert.Equal("raw", root.GetProperty("control_mode").GetString());
        Assert.Equal("auto", root.GetProperty("clutch_mode").GetString());
        Assert.Equal("active", root.GetProperty("phase").GetString());
    }
}

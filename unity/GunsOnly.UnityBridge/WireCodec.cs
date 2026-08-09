using System.Text.Json;
using System.Text.Json.Serialization;

namespace GunsOnly.UnityBridge;

/// <summary>
/// Length-prefixed JSON frames for the Unity companion host. Keep this contract tiny and stable:
/// Unity Assets deserialize the same shape without referencing GunsOnly.Sim.
/// </summary>
public static class WireCodec {
    public const int DefaultPort = 18765;
    public const string DefaultHost = "127.0.0.1";

    static readonly JsonSerializerOptions Options = new() {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string EncodeFrame(PoseSnapshot pose) =>
        JsonSerializer.Serialize(ToDto(pose), Options);

    public static PoseSnapshot DecodeFrame(string json) {
        WirePoseDto? dto = JsonSerializer.Deserialize<WirePoseDto>(json, Options)
            ?? throw new InvalidOperationException("wire frame deserialized to null");
        return FromDto(dto);
    }

    public static byte[] EncodeLengthPrefixed(PoseSnapshot pose) {
        return EncodeRawLengthPrefixed(EncodeFrame(pose));
    }

    /// <summary>
    /// Frames an immutable startup contract on the same stream as poses. Weekend Ride uses this
    /// once per connection for its route; the per-frame pose remains compact.
    /// </summary>
    public static byte[] EncodeRawLengthPrefixed(string json) {
        if (string.IsNullOrWhiteSpace(json))
            throw new ArgumentException("wire payload must not be empty", nameof(json));
        byte[] utf8 = System.Text.Encoding.UTF8.GetBytes(json);
        if (utf8.Length > 1_000_000)
            throw new InvalidOperationException($"wire payload too large: {utf8.Length}");
        byte[] packet = new byte[4 + utf8.Length];
        BitConverter.TryWriteBytes(packet.AsSpan(0, 4), utf8.Length);
        utf8.CopyTo(packet.AsSpan(4));
        return packet;
    }

    public static bool TryReadLengthPrefixed(Stream stream, out PoseSnapshot pose) {
        pose = default;
        if (!TryReadRawLengthPrefixed(stream, out string json)) return false;
        pose = DecodeFrame(json);
        return true;
    }

    public static bool TryReadRawLengthPrefixed(Stream stream, out string json) {
        json = "";
        Span<byte> lenBuf = stackalloc byte[4];
        if (!ReadExact(stream, lenBuf)) return false;
        int len = BitConverter.ToInt32(lenBuf);
        if (len <= 0 || len > 1_000_000) throw new InvalidOperationException($"bad frame len {len}");
        byte[] body = new byte[len];
        if (!ReadExact(stream, body)) return false;
        json = System.Text.Encoding.UTF8.GetString(body);
        return true;
    }

    public static byte[] EncodeCommand(WireCommand command) {
        byte[] utf8 = System.Text.Encoding.UTF8.GetBytes(
            JsonSerializer.Serialize(command, Options));
        byte[] packet = new byte[4 + utf8.Length];
        BitConverter.TryWriteBytes(packet.AsSpan(0, 4), utf8.Length);
        utf8.CopyTo(packet.AsSpan(4));
        return packet;
    }

    public static bool TryReadCommand(Stream stream, out WireCommand command) {
        command = default!;
        Span<byte> lenBuf = stackalloc byte[4];
        if (!ReadExact(stream, lenBuf)) return false;
        int len = BitConverter.ToInt32(lenBuf);
        if (len <= 0 || len > 64_000) throw new InvalidOperationException($"bad cmd len {len}");
        byte[] body = new byte[len];
        if (!ReadExact(stream, body)) return false;
        command = JsonSerializer.Deserialize<WireCommand>(
            System.Text.Encoding.UTF8.GetString(body), Options)
            ?? throw new InvalidOperationException("command deserialized to null");
        return true;
    }

    static bool ReadExact(Stream stream, Span<byte> buffer) {
        int offset = 0;
        while (offset < buffer.Length) {
            int n = stream.Read(buffer[offset..]);
            if (n <= 0) return false;
            offset += n;
        }
        return true;
    }

    static WirePoseDto ToDto(PoseSnapshot pose) => new(
        pose.Tick,
        pose.SimulationTimeS,
        pose.Lifecycle,
        pose.Player.X, pose.Player.Y, pose.Player.Z,
        pose.PlayerForward.X, pose.PlayerForward.Y, pose.PlayerForward.Z,
        pose.PlayerLeft.X, pose.PlayerLeft.Y, pose.PlayerLeft.Z,
        pose.OpponentPresent,
        pose.Bandit.X, pose.Bandit.Y, pose.Bandit.Z,
        pose.BanditForward.X, pose.BanditForward.Y, pose.BanditForward.Z,
        pose.BanditLeft.X, pose.BanditLeft.Y, pose.BanditLeft.Z,
        pose.PlayerAltitudeFt,
        pose.PlayerHeadingDeg,
        pose.PlayerHealthPermille,
        pose.WeaponsHold,
        pose.IndicatedAirspeedKts,
        pose.PitchDeg,
        pose.BankDeg,
        pose.VerticalSpeedFpm,
        pose.Mach,
        pose.MissionPack,
        pose.AmmoRounds,
        pose.ControlBalance,
        pose.RotorRpm,
        pose.Collective01,
        pose.ClearanceM,
        pose.FobRangeM,
        pose.TorqueNm,
        pose.TorqueLimitFraction,
        pose.Units?.Select(u => new WireUnitDto(u.Faction, u.Role, u.X, u.Y, u.Z, u.Health01)).ToArray(),
        pose.GunStatus,
        pose.VictoryHoldProgress,
        pose.HostileKills,
        pose.CobraTargetSelected,
        pose.RecoveryPlatformPresent,
        pose.RecoveryPlatform.X,
        pose.RecoveryPlatform.Y,
        pose.RecoveryPlatform.Z,
        pose.RecoveryPlatformHeadingRad,
        pose.RecoveryPlatformPitchDeg,
        pose.CatapultActive,
        pose.CatapultProgress,
        pose.VehicleSpeedMps,
        pose.EngineRpm,
        pose.VehicleGear,
        pose.CircuitProgressM,
        pose.CircuitLengthM,
        pose.NextSectorIndex,
        pose.LapCount,
        pose.PadlockSelected,
        pose.GunSolution,
        pose.PlayerHits,
        pose.RapierPhaseCode,
        pose.RapierPhaseToken,
        pose.RapierCircuitLeg,
        pose.RapierRecoveryGate,
        pose.RapierAutomationEnabled,
        pose.RapierAutomationActive,
        pose.RapierJobToken,
        pose.RapierDronesRemaining,
        pose.WeekendCue);

    static PoseSnapshot FromDto(WirePoseDto d) => new(
        d.Tick,
        d.SimulationTimeS,
        d.Lifecycle,
        new Vec3(d.Px, d.Py, d.Pz),
        new Vec3(d.Pfx, d.Pfy, d.Pfz),
        new Vec3(d.Plx, d.Ply, d.Plz),
        d.OpponentPresent,
        new Vec3(d.Bx, d.By, d.Bz),
        new Vec3(d.Bfx, d.Bfy, d.Bfz),
        new Vec3(d.Blx, d.Bly, d.Blz),
        d.PlayerAltitudeFt,
        d.PlayerHeadingDeg,
        d.PlayerHealthPermille,
        d.WeaponsHold,
        d.IndicatedAirspeedKts,
        d.PitchDeg,
        d.BankDeg,
        d.VerticalSpeedFpm,
        d.Mach,
        d.MissionPack,
        d.AmmoRounds,
        d.ControlBalance,
        d.RotorRpm,
        d.Collective01,
        d.ClearanceM,
        d.FobRangeM,
        d.TorqueNm,
        d.TorqueLimitFraction,
        d.Units?.Select(u => new GroundUnitWire(u.Faction, u.Role, u.X, u.Y, u.Z, u.Health01)).ToArray(),
        d.GunStatus,
        d.VictoryHoldProgress,
        d.HostileKills,
        d.CobraTargetSelected,
        d.RecoveryPlatformPresent,
        new Vec3(d.Rpx, d.Rpy, d.Rpz),
        d.RecoveryPlatformHeadingRad,
        d.RecoveryPlatformPitchDeg,
        d.CatapultActive,
        d.CatapultProgress,
        d.VehicleSpeedMps,
        d.EngineRpm,
        d.VehicleGear,
        d.CircuitProgressM,
        d.CircuitLengthM,
        d.NextSectorIndex,
        d.LapCount,
        d.PadlockSelected,
        d.GunSolution,
        d.PlayerHits,
        d.RapierPhaseCode,
        d.RapierPhaseToken,
        d.RapierCircuitLeg,
        d.RapierRecoveryGate,
        d.RapierAutomationEnabled,
        d.RapierAutomationActive,
        d.RapierJobToken,
        d.RapierDronesRemaining,
        d.WeekendCue);

    public sealed record WirePoseDto(
        long Tick,
        double SimulationTimeS,
        string Lifecycle,
        double Px, double Py, double Pz,
        double Pfx, double Pfy, double Pfz,
        double Plx, double Ply, double Plz,
        bool OpponentPresent,
        double Bx, double By, double Bz,
        double Bfx, double Bfy, double Bfz,
        double Blx, double Bly, double Blz,
        double PlayerAltitudeFt,
        double PlayerHeadingDeg,
        int PlayerHealthPermille,
        bool WeaponsHold,
        double IndicatedAirspeedKts = 0,
        double PitchDeg = 0,
        double BankDeg = 0,
        double VerticalSpeedFpm = 0,
        double Mach = 0,
        string? MissionPack = null,
        int AmmoRounds = 0,
        double ControlBalance = 0,
        double RotorRpm = 0,
        double Collective01 = 0,
        double ClearanceM = 0,
        double FobRangeM = 0,
        double TorqueNm = 0,
        double TorqueLimitFraction = 0,
        WireUnitDto[]? Units = null,
        string? GunStatus = null,
        double VictoryHoldProgress = 0,
        int HostileKills = 0,
        bool CobraTargetSelected = false,
        bool RecoveryPlatformPresent = false,
        double Rpx = 0,
        double Rpy = 0,
        double Rpz = 0,
        double RecoveryPlatformHeadingRad = 0,
        double RecoveryPlatformPitchDeg = 0,
        bool CatapultActive = false,
        double CatapultProgress = 0,
        double VehicleSpeedMps = 0,
        double EngineRpm = 0,
        int VehicleGear = 0,
        double CircuitProgressM = 0,
        double CircuitLengthM = 0,
        int NextSectorIndex = 0,
        int LapCount = 0,
        bool PadlockSelected = false,
        bool GunSolution = false,
        int PlayerHits = 0,
        int RapierPhaseCode = 0,
        string? RapierPhaseToken = null,
        string? RapierCircuitLeg = null,
        int RapierRecoveryGate = 0,
        bool RapierAutomationEnabled = false,
        bool RapierAutomationActive = false,
        string? RapierJobToken = null,
        int RapierDronesRemaining = 0,
        string? WeekendCue = null);

    public sealed record WireUnitDto(
        byte Faction,
        byte Role,
        float X,
        float Y,
        float Z,
        float Health01);

    public sealed record WireCommand(
        string Type,
        int Key = 0,
        bool Pressed = false,
        double Throttle = 0,
        double Brake = 0,
        double Steer = 0,
        double RiderLateral = 0,
        double RiderForeAft = 0,
        double Clutch = 1,
        int Direction = 0,
        int Mode = 0);
}

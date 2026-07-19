using System.Text.Json.Serialization;

namespace GunsOnly.Server;

public static class PresenceProtocol {
    public const int Version = 2;
    public const int BroadcastHz = 20;
    public const int MaximumMessageBytes = 8 * 1024;
    public const int MessageRatePerSecond = 30;
    public const int MessageBurstCapacity = 40;
    public const int MaximumInvalidMessages = 6;
    public const int BogeysPerSector = 3;
    public const double SectorSpacingMetres = 40_000.0;
    public const double InterestRadiusMetres = 120_000.0;
    public const int MaximumVisiblePlayers = 64;
    public const int MaximumVisibleSectors = 16;
    public const int MaximumConnections = 64;
    public const long MaximumSafeInteger = 9_007_199_254_740_991;
    public const string DefaultAllowedOrigins = "https://guns-only.vercel.app,"
        + "http://127.0.0.1:8877,http://localhost:8877,http://[::1]:8877";
    public static readonly TimeSpan PoseLifetime = TimeSpan.FromSeconds(15);
    public static readonly TimeSpan HelloTimeout = TimeSpan.FromSeconds(5);

    static readonly HashSet<string> ValidPhases = ["READY", "ACTIVE", "PAUSED", "FINISHED"];
    static readonly HashSet<string> ValidTerminalStates = [
        "FLYING", "DESTROYED_AIRBORNE", "IMPACTED", "SETTLED", "SIMULATION_BOUNDED"
    ];
    static readonly HashSet<string> ValidImpactSurfaces = [
        "NONE", "WATER", "FLIGHT_DECK", "CARRIER_STRUCTURE", "SIMULATION_BOUNDARY"
    ];
    static readonly HashSet<string> PlayerPresentationIds = [
        "presentation.vehicle.player.v1",
        "presentation.vehicle.glider-strike.v1"
    ];

    public static bool IsAllowedOrigin(string? requestOrigin, string? configuredOrigins) {
        string? requested = CanonicalOrigin(requestOrigin);
        if (requested is null) return false;
        return (configuredOrigins ?? DefaultAllowedOrigins)
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(CanonicalOrigin)
            .Any(allowed => string.Equals(allowed, requested, StringComparison.Ordinal));
    }

    public static bool TryValidateHello(HelloMessage message, out string pilotKey) {
        pilotKey = message.PilotKey?.Trim() ?? "";
        return string.Equals(message.Type, "hello", StringComparison.Ordinal)
            && message.Protocol == Version
            && pilotKey.Length is >= 16 and <= 128
            && pilotKey.All(character => char.IsAsciiLetterOrDigit(character)
                || character is '.' or '-' or '_');
    }

    public static bool TryValidatePose(PoseMessage message, long previousSequence,
        out ValidatedPose pose) =>
        TryValidatePose(message, previousSequence, previousPose: null, out pose);

    public static bool TryValidatePose(PoseMessage message, long previousSequence,
        ValidatedPose? previousPose, out ValidatedPose pose) {
        pose = default!;
        if (!string.Equals(message.Type, "pose", StringComparison.Ordinal)
            || message.Protocol != Version
            || message.Sequence <= previousSequence
            || message.Sequence > MaximumSafeInteger
            || message.Tick < 0
            || message.Tick > MaximumSafeInteger
            || !ValidVector(message.Position)
            || !ValidDirection(message.Forward)
            || !ValidDirection(message.Up)
            || !ValidFrame(message.Forward!, message.Up!))
            return false;

        string missionId = CleanToken(message.MissionId, 96, "mission.unknown");
        string phase = NormalisePhase(message.Phase);
        string terminalCandidate = CleanToken(message.TerminalState, 32, "").ToUpperInvariant();
        bool hasTerminalState = ValidTerminalStates.Contains(terminalCandidate);
        bool alive = hasTerminalState ? terminalCandidate == "FLYING" : message.Alive;
        bool bodyPresent = hasTerminalState
            ? terminalCandidate != "SETTLED"
            : message.BodyPresent ?? alive;
        string? entityId = CleanOptionalToken(message.EntityId, 128);
        string presentationId = PresentationForConnection(message.PresentationId, previousPose);
        string terminalState = NormaliseTerminalState(
            message.TerminalState, alive, bodyPresent);
        string impactSurface = NormaliseImpactSurface(message.ImpactSurface, terminalState);
        pose = new ValidatedPose(
            message.Sequence,
            message.Tick,
            missionId,
            presentationId,
            phase,
            alive,
            entityId,
            bodyPresent,
            terminalState,
            impactSurface,
            Copy3(message.Position!),
            Normalized3(message.Forward!),
            Normalized3(message.Up!));
        return true;
    }

    public static double[] SectorOrigin(int index) {
        ArgumentOutOfRangeException.ThrowIfNegative(index);
        if (index == 0) return [0.0, 0.0, 0.0];
        int ring = (int)Math.Ceiling((Math.Sqrt(index + 1.0) - 1.0) / 2.0);
        int sideLength = ring * 2;
        int maximum = (ring * 2 + 1) * (ring * 2 + 1) - 1;
        int offset = maximum - index;
        int x;
        int z;
        if (offset < sideLength) {
            x = ring - offset;
            z = -ring;
        } else if (offset < sideLength * 2) {
            x = -ring;
            z = -ring + offset - sideLength;
        } else if (offset < sideLength * 3) {
            x = -ring + offset - sideLength * 2;
            z = ring;
        } else {
            x = ring;
            z = ring - (offset - sideLength * 3);
        }
        return [x * SectorSpacingMetres, 0.0, z * SectorSpacingMetres];
    }

    public static BogeySnapshot[] BogeysForSector(int sectorIndex,
        DateTimeOffset worldCreatedAt, DateTimeOffset now) {
        double[] origin = SectorOrigin(sectorIndex);
        double elapsedSeconds = Math.Max(0.0, (now - worldCreatedAt).TotalSeconds);
        long sequence = Math.Max(0, now.ToUnixTimeMilliseconds() / (1000 / BroadcastHz));
        return Enumerable.Range(0, BogeysPerSector).Select(slot => {
            double radius = 3_500.0 + SeededUnit(sectorIndex, slot, 1) * 4_500.0;
            double altitude = 1_800.0 + SeededUnit(sectorIndex, slot, 2) * 2_800.0;
            double angularVelocity = (0.012 + SeededUnit(sectorIndex, slot, 3) * 0.014)
                * (slot % 2 == 0 ? 1.0 : -1.0);
            double phase = SeededUnit(sectorIndex, slot, 4) * Math.PI * 2.0
                + elapsedSeconds * angularVelocity;
            double direction = Math.Sign(angularVelocity);
            return new BogeySnapshot(
                $"bogey-{sectorIndex}-{slot}",
                $"BOGEY-{sectorIndex + 1:00}{slot + 1}",
                sequence,
                "presentation.vehicle.bandit.v1",
                true,
                [origin[0] + Math.Cos(phase) * radius, altitude,
                    origin[2] + Math.Sin(phase) * radius],
                [-Math.Sin(phase) * direction, 0.0, Math.Cos(phase) * direction],
                [0.0, 1.0, 0.0],
                $"entity.world.bogey-{sectorIndex}-{slot}",
                true,
                "FLYING",
                "NONE",
                sectorIndex,
                "server-world",
                false);
        }).ToArray();
    }

    static double SeededUnit(int sectorIndex, int slot, int salt) {
        uint value = unchecked((uint)((sectorIndex + 1) * 0x45d9f3b))
            ^ unchecked((uint)((slot + 11) * 0x27d4eb2d))
            ^ unchecked((uint)((salt + 101) * 0x165667b1));
        value ^= value >> 16;
        value = unchecked(value * 0x7feb352d);
        value ^= value >> 15;
        return value / 4294967296.0;
    }

    static bool ValidVector(double[]? values) => values is { Length: 3 }
        && values.All(value => double.IsFinite(value) && Math.Abs(value) <= 1_000_000.0);

    static bool ValidDirection(double[]? values) => ValidVector(values)
        && LengthSquared(values!) is > 0.25 and < 4.0;

    static bool ValidFrame(double[] forward, double[] up) {
        double cosine = Math.Abs(
            (forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2])
            / Math.Sqrt(LengthSquared(forward) * LengthSquared(up)));
        return cosine < 0.98;
    }

    static double LengthSquared(double[] values) =>
        values[0] * values[0] + values[1] * values[1] + values[2] * values[2];

    static double[] Copy3(double[] source) => [source[0], source[1], source[2]];

    static double[] Normalized3(double[] source) {
        double length = Math.Sqrt(LengthSquared(source));
        return [source[0] / length, source[1] / length, source[2] / length];
    }

    static string CleanToken(string? value, int maximumLength, string fallback) {
        if (string.IsNullOrWhiteSpace(value)) return fallback;
        string cleaned = new(value.Trim()
            .Where(character => char.IsAsciiLetterOrDigit(character)
                || character is '.' or '-' or '_' or ':')
            .Take(maximumLength)
            .ToArray());
        return cleaned.Length == 0 ? fallback : cleaned;
    }

    static string? CleanOptionalToken(string? value, int maximumLength) {
        string cleaned = CleanToken(value, maximumLength, "");
        return cleaned.Length == 0 ? null : cleaned;
    }

    static string NormalisePlayerPresentationId(string? value) {
        string candidate = CleanToken(value, 128, "presentation.vehicle.player.v1");
        return PlayerPresentationIds.Contains(candidate)
            ? candidate
            : "presentation.vehicle.player.v1";
    }

    static string PresentationForConnection(string? requestedPresentationId,
        ValidatedPose? previousPose) {
        string requested = NormalisePlayerPresentationId(requestedPresentationId);
        if (previousPose is null) return requested;
        // EntityId is untrusted too. Keep one visual contract for this validated socket lifetime;
        // a future server-owned sortie transition can safely provide a finer-grained edge.
        return NormalisePlayerPresentationId(previousPose.PresentationId);
    }

    static string NormalisePhase(string? value) {
        string candidate = CleanToken(value, 24, "ACTIVE").ToUpperInvariant();
        return ValidPhases.Contains(candidate) ? candidate : "ACTIVE";
    }

    static string NormaliseTerminalState(string? value, bool alive, bool bodyPresent) {
        string fallback = alive ? "FLYING" : bodyPresent ? "DESTROYED_AIRBORNE" : "SETTLED";
        string candidate = CleanToken(value, 32, fallback).ToUpperInvariant();
        return ValidTerminalStates.Contains(candidate) ? candidate : fallback;
    }

    static string NormaliseImpactSurface(string? value, string terminalState) {
        string fallback = terminalState == "SIMULATION_BOUNDED"
            ? "SIMULATION_BOUNDARY" : "NONE";
        string candidate = CleanToken(value, 32, fallback).ToUpperInvariant();
        return ValidImpactSurfaces.Contains(candidate) ? candidate : fallback;
    }

    static string? CanonicalOrigin(string? value) {
        if (string.IsNullOrWhiteSpace(value)
            || !Uri.TryCreate(value.Trim(), UriKind.Absolute, out Uri? uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || (uri.AbsolutePath.Length > 0 && uri.AbsolutePath != "/")
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment)) return null;
        return uri.GetComponents(UriComponents.SchemeAndServer, UriFormat.UriEscaped);
    }
}

public sealed record HelloMessage(
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("protocol")] int Protocol,
    [property: JsonPropertyName("pilotKey")] string? PilotKey);

public sealed record PoseMessage(
    [property: JsonPropertyName("type")] string? Type,
    [property: JsonPropertyName("protocol")] int Protocol,
    [property: JsonPropertyName("sequence")] long Sequence,
    [property: JsonPropertyName("tick")] long Tick,
    [property: JsonPropertyName("missionId")] string? MissionId,
    [property: JsonPropertyName("presentationId")] string? PresentationId,
    [property: JsonPropertyName("phase")] string? Phase,
    [property: JsonPropertyName("alive")] bool Alive,
    [property: JsonPropertyName("position")] double[]? Position,
    [property: JsonPropertyName("forward")] double[]? Forward,
    [property: JsonPropertyName("up")] double[]? Up,
    [property: JsonPropertyName("entityId")] string? EntityId = null,
    [property: JsonPropertyName("bodyPresent")] bool? BodyPresent = null,
    [property: JsonPropertyName("terminalState")] string? TerminalState = null,
    [property: JsonPropertyName("impactSurface")] string? ImpactSurface = null);

public sealed record ValidatedPose(
    long Sequence,
    long Tick,
    string MissionId,
    string PresentationId,
    string Phase,
    bool Alive,
    string? EntityId,
    bool BodyPresent,
    string TerminalState,
    string ImpactSurface,
    double[] Position,
    double[] Forward,
    double[] Up);

public sealed record PlayerIdentity(
    string PlayerId,
    string Callsign,
    int SectorIndex,
    double[] SpawnOrigin);

public sealed record WelcomeMessage(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("protocol")] int Protocol,
    [property: JsonPropertyName("room")] string Room,
    [property: JsonPropertyName("playerId")] string PlayerId,
    [property: JsonPropertyName("callsign")] string Callsign,
    [property: JsonPropertyName("sectorIndex")] int SectorIndex,
    [property: JsonPropertyName("spawnOrigin")] double[] SpawnOrigin,
    [property: JsonPropertyName("worldEpoch")] string WorldEpoch,
    [property: JsonPropertyName("serverTimeMs")] long ServerTimeMs);

public sealed record RoomSnapshot(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("protocol")] int Protocol,
    [property: JsonPropertyName("room")] string Room,
    [property: JsonPropertyName("worldEpoch")] string WorldEpoch,
    [property: JsonPropertyName("serverTimeMs")] long ServerTimeMs,
    [property: JsonPropertyName("connected")] int Connected,
    [property: JsonPropertyName("visiblePlayers")] int VisiblePlayers,
    [property: JsonPropertyName("visibleSectors")] int VisibleSectors,
    [property: JsonPropertyName("players")] IReadOnlyList<PlayerSnapshot> Players,
    [property: JsonPropertyName("bogeys")] IReadOnlyList<BogeySnapshot> Bogeys);

public sealed record PlayerSnapshot(
    [property: JsonPropertyName("playerId")] string PlayerId,
    [property: JsonPropertyName("callsign")] string Callsign,
    [property: JsonPropertyName("sequence")] long Sequence,
    [property: JsonPropertyName("tick")] long Tick,
    [property: JsonPropertyName("missionId")] string MissionId,
    [property: JsonPropertyName("presentationId")] string PresentationId,
    [property: JsonPropertyName("phase")] string Phase,
    [property: JsonPropertyName("alive")] bool Alive,
    [property: JsonPropertyName("position")] double[] Position,
    [property: JsonPropertyName("forward")] double[] Forward,
    [property: JsonPropertyName("up")] double[] Up,
    [property: JsonPropertyName("entityId")] string? EntityId,
    [property: JsonPropertyName("streamId")] string StreamId,
    [property: JsonPropertyName("bodyPresent")] bool BodyPresent,
    [property: JsonPropertyName("terminalState")] string TerminalState,
    [property: JsonPropertyName("impactSurface")] string ImpactSurface,
    [property: JsonPropertyName("sectorIndex")] int SectorIndex,
    [property: JsonPropertyName("authority")] string Authority,
    [property: JsonPropertyName("combatEligible")] bool CombatEligible);

public sealed record BogeySnapshot(
    [property: JsonPropertyName("bogeyId")] string BogeyId,
    [property: JsonPropertyName("callsign")] string Callsign,
    [property: JsonPropertyName("sequence")] long Sequence,
    [property: JsonPropertyName("presentationId")] string PresentationId,
    [property: JsonPropertyName("alive")] bool Alive,
    [property: JsonPropertyName("position")] double[] Position,
    [property: JsonPropertyName("forward")] double[] Forward,
    [property: JsonPropertyName("up")] double[] Up,
    [property: JsonPropertyName("entityId")] string EntityId,
    [property: JsonPropertyName("bodyPresent")] bool BodyPresent,
    [property: JsonPropertyName("terminalState")] string TerminalState,
    [property: JsonPropertyName("impactSurface")] string ImpactSurface,
    [property: JsonPropertyName("sectorIndex")] int SectorIndex,
    [property: JsonPropertyName("authority")] string Authority,
    [property: JsonPropertyName("combatEligible")] bool CombatEligible);

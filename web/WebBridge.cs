using System.Runtime.InteropServices.JavaScript;
using System.Runtime.Versioning;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Web;

/// <summary>
/// Thin JavaScript facade over the presentation-independent SimulationSession. This type owns no
/// gameplay state or tick logic: it translates JS calls and projects the current session as the
/// stable, flat JSON contract consumed by the renderer and HUD.
/// </summary>
[SupportedOSPlatform("browser")]
public static partial class WebBridge {
    static readonly ITerrainSurface? CentralFrontTerrain = KoreaTerrainTruth.Load();
    static readonly SimulationSession Session = new(7, Carrier.DeckConfiguration.Angled,
        KoreaWeatherPresets.ForBeat(7));
    static Carrier.DeckConfiguration _deckConfiguration = Carrier.DeckConfiguration.Angled;
    static double _worldOriginEastM;
    static double _worldOriginNorthM;
    static bool _worldOriginConfigured;

    const double CarrierTerrainPlacementEastM = 100_000.0;
    const double MaximumWorldOriginMagnitudeM = 10_000_000.0;

    [JSExport]
    public static void StartBeat(int index) => Session.StartBeatWithEnvironment(
        index, KoreaWeatherPresets.ForBeat(index), TerrainForBeat(index), _deckConfiguration);

    /// <summary>
    /// Anchor mission-local coordinates to the persistent room's X=east/Z=north origin. The room
    /// transports local poses plus this same origin; translating the terrain by its inverse makes
    /// AGL/collision truth and every observer's rendered substrate agree. Carrier qualifications
    /// remain explicitly local instances because each sortie owns a carrier at local zero.
    /// </summary>
    [JSExport]
    public static bool SetWorldOrigin(double eastM, double northM) {
        if (!double.IsFinite(eastM) || !double.IsFinite(northM)
            || Math.Abs(eastM) > MaximumWorldOriginMagnitudeM
            || Math.Abs(northM) > MaximumWorldOriginMagnitudeM)
            return false;
        _worldOriginEastM = eastM;
        _worldOriginNorthM = northM;
        _worldOriginConfigured = true;
        Session.SetTerrainSurface(TerrainForBeat(Session.BeatIndex));
        return true;
    }

    [JSExport]
    public static void Begin() => Session.Begin();

    [JSExport]
    public static void SetPaused(bool paused) => Session.SetPaused(paused);

    [JSExport]
    public static void FeedKey(int gkey, bool pressed) => Session.FeedKey((GKey)gkey, pressed);

    [JSExport]
    public static void SuppressPendingThrottleTap(bool increase) =>
        Session.SuppressPendingThrottleTap(increase);

    [JSExport]
    public static void FeedDirectThrottle(bool increase, bool pressed) =>
        Session.FeedDirectThrottle(increase, pressed);

    [JSExport]
    public static void SetAnalogRollControl(double value) => Session.SetAnalogRollControl(value);

    [JSExport]
    public static void SetBanditPadlockRollAssist(bool selected) =>
        Session.SetBanditPadlockRollAssist(selected);

    [JSExport]
    public static void SetVariant(int value) => Session.SetVariant(
        value == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep);

    [JSExport]
    public static int GetVariant() => Session.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;

    [JSExport]
    public static int GetCleanTrapCount() => Session.RecoveryProgress.CleanTrapCount;

    [JSExport]
    public static int GetDeckConfiguration() =>
        _deckConfiguration == Carrier.DeckConfiguration.Angled ? 1 : 0;

    /// <summary>
    /// Update the next carrier staging preference without mutating the live or previewed session.
    /// StartBeat remains the single explicit authority boundary for applying the geometry.
    /// </summary>
    [JSExport]
    public static void SetDeckConfiguration(int value) {
        _deckConfiguration = value == 1
            ? Carrier.DeckConfiguration.Angled
            : Carrier.DeckConfiguration.Axial;
    }

    [JSExport]
    public static void Advance(double deltaSeconds) => Session.Advance(deltaSeconds);

    /// <summary>
    /// Pull the frozen carrier-incident clip exactly once. GetState advertises only its small ID;
    /// the browser caches this bounded payload for automatic playback and Replay Again.
    /// </summary>
    [JSExport]
    public static string ConsumeIncidentReplay(int clipId) {
        if (!Session.IncidentReplay.TryConsume(clipId, out IncidentReplayClip clip))
            return "{}";
        return IncidentReplayProjection.ToJson(clip);
    }

    /// One flat state blob per frame. Sim frame is X=east, Y=up, Z=north; the JS side flips Z
    /// for three.js. All aliases below are read-only projection handles from SimulationSession.
    [JSExport]
    public static string GetState() => SnapshotProjection.BuildState(
        Session, _deckConfiguration, _worldOriginEastM, _worldOriginNorthM,
        _worldOriginConfigured, CentralFrontTerrain);

    static bool HasSharedTerrainFrame(int index) => index is not (5 or 6);

    static double TerrainPlacementEastM(int index) => HasSharedTerrainFrame(index)
        ? -_worldOriginEastM : CarrierTerrainPlacementEastM;

    static double TerrainPlacementNorthM(int index) => HasSharedTerrainFrame(index)
        ? -_worldOriginNorthM : 0.0;

    // Null only when a constrained build explicitly opts out of the embedded Korea terrain. The
    // session and projection treat that as sea level; the browser then skips the multi-megabyte
    // visual-terrain fetch because the snapshot reports terrain_present=false.
    static ITerrainSurface? TerrainForBeat(int index) => CentralFrontTerrain is null ? null
        : new TranslatedTerrainSurface(CentralFrontTerrain,
            TerrainPlacementEastM(index), TerrainPlacementNorthM(index));
}

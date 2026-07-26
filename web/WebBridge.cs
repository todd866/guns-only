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
    static readonly ITerrainSurface? UkraineTheatreTerrain =
        UkraineTerrainTruth.Load() is { } theatre
            ? new TrainingTerrainApronSurface(theatre,
                marginM: 400_000.0, flatHeightM: 78.0, transitionM: 8_000.0)
            : null;
    static readonly SimulationSession Session = new(7, Carrier.DeckConfiguration.Angled,
        KoreaWeatherPresets.ForBeat(7));
    static Carrier.DeckConfiguration _deckConfiguration = Carrier.DeckConfiguration.Angled;
    static double _worldOriginEastM;
    static double _worldOriginNorthM;
    static bool _worldOriginConfigured;

    const double MaximumWorldOriginMagnitudeM = 10_000_000.0;

    [JSExport]
    public static void StartBeat(int index) => Session.StartBeatWithEnvironment(
        index, KoreaWeatherPresets.ForBeat(index), TerrainForBeat(index), _deckConfiguration);

    /// <summary>
    /// Fly again after dying WITHOUT throwing away the gauntlet's pacing memory. StartBeat resets
    /// the FightDirector — correct when the pilot picks a mission, wrong when they are respawning
    /// into the same infinite duel, because it sends a player who had fought their way up to Ace
    /// back to the Novice warm-up. The director is explicitly built to carry its estimate across a
    /// death into the next life (see its HasHistory gate); this is the entry point that lets it.
    /// Returns false if the requested mission is not the one already staged, so the caller falls
    /// back to a full StartBeat rather than silently restarting something else.
    /// </summary>
    /// <summary>
    /// The gauntlet cold-started at the 2.4 G Novice warm-up on every page load, so a pilot who
    /// had been walking over Aces met an opponent capped at 2.4 G — against their 8-12 — each time
    /// they reloaded, and a short sortie meant the warm-up was the only opponent they ever saw.
    /// The browser persists this opaque string and hands it back at startup.
    /// </summary>
    [JSExport]
    public static string ExportDirectorState() => Session.ExportDirectorState();

    /// <summary>Restore a persisted estimate. Returns false on anything malformed, in which case
    /// the sortie opens cold exactly as before.</summary>
    [JSExport]
    public static bool ImportDirectorState(string state) =>
        Session.TryImportDirectorState(state);

    [JSExport]
    public static bool RestartSortie(int index) {
        if (index != Session.BeatIndex) return false;
        Session.Restart();
        return true;
    }

    /// <summary>
    /// Anchor mission-local coordinates to the persistent room's X=east/Z=north origin. The room
    /// transports local poses plus this same origin; translating the terrain by its inverse makes
    /// AGL/collision truth and every observer's rendered substrate agree. Authored hero, coastal
    /// and Rapier cells remain local instances, but all publish the same Ukraine theatre identity.
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
    public static void SetTouchControlModality(bool touch) =>
        Session.SetTouchControlModality(touch);

    [JSExport]
    public static void SetAutoGcasEnabled(bool enabled) =>
        Session.SetAutoGcasEnabled(enabled);

    [JSExport]
    public static void SetAssistedFlight(bool enabled) =>
        Session.SetAssistedFlight(enabled);

    [JSExport]
    public static bool ToggleTimeCompression() => Session.ToggleTimeCompression();

    [JSExport]
    public static bool ToggleRapierAutomation() => Session.ToggleRapierAutomation();

    [JSExport]
    public static bool LaunchRapierShortRangeMissile() =>
        Session.LaunchRapierShortRangeMissile();

    [JSExport]
    public static void NudgeAssistedSpeed(int direction) =>
        Session.NudgeAssistedSpeed(direction);

    [JSExport]
    public static void ReleaseWeaponsHold() => Session.ReleaseWeaponsHold();

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

    static readonly double[] HotFrameBuffer = new double[SnapshotHotFrame.SlotCount];

    [JSExport]
    public static int Advance(double deltaSeconds, int maximumCompressionFactor) {
        int selectedFactor = Session.Advance(deltaSeconds, maximumCompressionFactor);
        SnapshotHotFrame.Fill(HotFrameBuffer, Session,
            _worldOriginEastM, _worldOriginNorthM, _worldOriginConfigured);
        return selectedFactor;
    }

    /// Refill the hot frame without stepping the simulation — the JS loop calls this on frames
    /// where it withholds Advance (pause interlocks) so lifecycle edges still reach the buffer
    /// and its cold_version the same frame.
    [JSExport]
    public static void RefreshHotFrame() => SnapshotHotFrame.Fill(HotFrameBuffer, Session,
        _worldOriginEastM, _worldOriginNorthM, _worldOriginConfigured);

    /// One-time layout contract for the per-frame buffer (slot names/kinds/indices, presence
    /// slots, tracer regions). See SnapshotHotFrame.
    [JSExport]
    public static string GetHotLayout() => SnapshotHotFrame.LayoutJson();

    /// The persistent per-frame buffer as a MemoryView over WASM memory. Fetched once at boot;
    /// the browser copies it out each frame (copyTo re-derives the view, so memory growth is
    /// safe) and merges it onto the low-rate GetState JSON.
    [JSExport]
    [return: JSMarshalAs<JSType.MemoryView>]
    public static ArraySegment<double> GetHotFrame() => new(HotFrameBuffer);

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
        _worldOriginConfigured, BaseTerrainForBeat(Session.BeatIndex));

    static MissionEnvironmentContract EnvironmentForBeat(int index) =>
        Beats.BuiltIn(index, _deckConfiguration).EnvironmentIdentity;

    static double TerrainPlacementEastM(int index) {
        MissionEnvironmentContract environment = EnvironmentForBeat(index);
        return environment.MultiplayerTerrainShared
            ? -_worldOriginEastM
            : -environment.TerrainSourceAnchorEastM;
    }

    static double TerrainPlacementNorthM(int index) {
        MissionEnvironmentContract environment = EnvironmentForBeat(index);
        return environment.MultiplayerTerrainShared
            ? -_worldOriginNorthM
            : -environment.TerrainSourceAnchorNorthM;
    }

    static ITerrainSurface? BaseTerrainForBeat(int index) => UkraineTheatreTerrain;

    // Null only when a constrained build explicitly opts out of the selected embedded terrain.
    // The session and projection treat that as sea level; the browser then skips the visual
    // terrain fetch because the snapshot reports terrain_present=false.
    static ITerrainSurface? TerrainForBeat(int index) => BaseTerrainForBeat(index) is { } terrain
        ? new TranslatedTerrainSurface(terrain,
            TerrainPlacementEastM(index), TerrainPlacementNorthM(index))
        : null;
}

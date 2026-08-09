using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.UnityBridge;

/// <summary>
/// Presentation-independent authority adapter for the player-facing Rapier sortie. The adapter
/// owns beat 12 and projects the same catapult/arrestment-supported pose used by the Web bridge;
/// Unity remains a renderer and never advances aircraft dynamics itself.
/// </summary>
public sealed class UnityRapierSession : IDisposable {
    public const int RapierBeatIndex = 12;

    readonly SimulationSession _session;
    bool _disposed;

    UnityRapierSession(SimulationSession session) {
        _session = session;
    }

    public int BeatIndex => _session.BeatIndex;
    public SimulationSession.LifecycleState Lifecycle => _session.Lifecycle;
    public bool OpponentPresent => _session.OpponentPresent;
    public long Tick => _session.Tick;

    public static UnityRapierSession StartBeat12() {
        var session = new SimulationSession(
            RapierBeatIndex,
            Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(RapierBeatIndex));
        session.Begin();
        session.ReleaseWeaponsHold();
        return new UnityRapierSession(session);
    }

    public void FeedKey(GKey key, bool pressed) => _session.FeedKey(key, pressed);

    public void ReleaseWeaponsHold() => _session.ReleaseWeaponsHold();

    public void FeedKeyCode(int keyCode, bool pressed) {
        if (!Enum.IsDefined(typeof(GKey), keyCode)) return;
        FeedKey((GKey)keyCode, pressed);
    }

    public int Advance(double deltaSeconds, int maximumCompressionFactor = 1) =>
        _session.Advance(deltaSeconds, maximumCompressionFactor);

    public void AdvanceSeconds(double seconds) {
        const double step = 1.0 / 60.0;
        double remaining = seconds;
        while (remaining > 1e-9) {
            double dt = Math.Min(step, remaining);
            Advance(dt);
            remaining -= dt;
        }
    }

    public PoseSnapshot CapturePose() {
        bool catapulting = _session.Catapult.IsActive;
        bool arrested = _session.Arrestment.IsActive && !catapulting;
        AircraftState supported = catapulting
            ? _session.Catapult.State
            : _session.Player.State;

        Vec3D playerPosition = arrested
            ? _session.Arrestment.Position
            : supported.Position;
        Vec3D playerForward;
        Vec3D playerLeft;
        double bankRad;
        if (arrested && _session.Carrier is { } arrestedPlatform) {
            double pitch = _session.Arrestment.NosePitchRad;
            playerForward = arrestedPlatform.LandingFwd * Math.Cos(pitch)
                + new Vec3D(0.0, Math.Sin(pitch), 0.0);
            playerLeft = arrestedPlatform.LandingRight * -1.0;
            bankRad = 0.0;
        } else {
            playerForward = supported.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            // This is deliberately body-left, not up x forward (body-right). After the ENU-to-
            // Unity Z reflection, forward x left reconstructs the correct Unity up and preserves
            // bank without transmitting renderer-specific quaternions.
            playerLeft = supported.BodyAttitude.Rotate(new Vec3D(-1.0, 0.0, 0.0));
            bankRad = catapulting ? 0.0 : _session.Player.BodyRollRad;
        }

        Vec3D groundVelocity;
        if (catapulting) {
            groundVelocity = supported.VelocityVector();
        } else if (arrested && _session.Carrier is { } platform) {
            groundVelocity = platform.DeckVelocityWorld
                + platform.LandingFwd * _session.Arrestment.RelativeSpeedMps
                + new Vec3D(0.0, platform.DeckVerticalVelocityMps, 0.0);
        } else {
            groundVelocity = supported.VelocityVector();
        }

        Vec3D airVelocity;
        if (catapulting && _session.Carrier?.IsMaritime == true) {
            airVelocity = groundVelocity - _session.Carrier.SteadyWindWorld;
        } else if (arrested && _session.Carrier?.IsMaritime == true) {
            airVelocity = groundVelocity - _session.Carrier.SteadyWindWorld;
        } else {
            airVelocity = _session.Player.AirVelocity;
        }
        double trueAirspeedMps = airVelocity.Length;
        double indicatedAirspeedMps = AirData.IndicatedAirspeedMps(
            trueAirspeedMps,
            playerPosition.Y,
            _session.Player.AtmosphereModel);
        double mach = AirData.MachNumber(
            trueAirspeedMps,
            playerPosition.Y,
            _session.Player.AtmosphereModel);

        bool opponentPresent = _session.OpponentPresent;
        Vec3 banditPosition = default;
        Vec3 banditForward = new(0.0, 0.0, 1.0);
        Vec3 banditLeft = new(-1.0, 0.0, 0.0);
        if (opponentPresent) {
            AircraftState bandit = _session.SelectedOpponentState;
            banditPosition = ToVec(bandit.Position);
            banditForward = ToVec(
                bandit.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0)));
            banditLeft = ToVec(
                bandit.BodyAttitude.Rotate(new Vec3D(-1.0, 0.0, 0.0)));
        }

        Carrier? recoveryPlatform = _session.Carrier;
        Vec3 platformPosition = recoveryPlatform is null
            ? default
            : ToVec(recoveryPlatform.Position);
        double headingRad = Math.Atan2(playerForward.X, playerForward.Z);
        double pitchRad = Math.Asin(Math.Clamp(playerForward.Y, -1.0, 1.0));
        double launchProgress = _session.Catapult.StrokeM > 0.0
            ? Math.Clamp(
                _session.Catapult.DistanceM / _session.Catapult.StrokeM,
                0.0,
                1.0)
            : 0.0;

        return new PoseSnapshot(
            Tick: _session.Tick,
            SimulationTimeS: _session.TimeSeconds,
            Lifecycle: _session.Lifecycle.ToString(),
            Player: ToVec(playerPosition),
            PlayerForward: ToVec(playerForward),
            PlayerLeft: ToVec(playerLeft),
            OpponentPresent: opponentPresent,
            Bandit: banditPosition,
            BanditForward: banditForward,
            BanditLeft: banditLeft,
            PlayerAltitudeFt: playerPosition.Y * 3.28084,
            PlayerHeadingDeg: NormalizeDegrees(headingRad * (180.0 / Math.PI)),
            PlayerHealthPermille: (int)Math.Round(_session.PlayerHealth * 1000.0),
            WeaponsHold: _session.WeaponsInhibited,
            IndicatedAirspeedKts: indicatedAirspeedMps * AirData.MpsToKnots,
            PitchDeg: pitchRad * (180.0 / Math.PI),
            BankDeg: bankRad * (180.0 / Math.PI),
            VerticalSpeedFpm: groundVelocity.Y * 196.8503937,
            Mach: mach,
            MissionPack: UnityMissionSelection.RapierMissionPack,
            AmmoRounds: opponentPresent ? _session.PlayerGun.AmmoRemaining : 0,
            RecoveryPlatformPresent: recoveryPlatform is not null,
            RecoveryPlatform: platformPosition,
            RecoveryPlatformHeadingRad: recoveryPlatform?.HeadingRad ?? 0.0,
            RecoveryPlatformPitchDeg:
                (recoveryPlatform?.DeckPitchRad ?? 0.0) * (180.0 / Math.PI),
            CatapultActive: catapulting,
            CatapultProgress: launchProgress,
            RapierPhaseCode: (int)_session.RapierPhase,
            RapierPhaseToken: _session.RapierPhase.ToString(),
            RapierCircuitLeg: _session.RapierCircuitLeg,
            RapierRecoveryGate: _session.RapierRecoveryGate,
            RapierAutomationEnabled: _session.RapierAutomationEnabled,
            RapierAutomationActive: _session.RapierAutomationActive,
            RapierJobToken: _session.RapierJobToken,
            RapierDronesRemaining: _session.RapierDogfightingDronesRemaining);
    }

    static Vec3 ToVec(Vec3D value) => new(value.X, value.Y, value.Z);

    static double NormalizeDegrees(double value) =>
        ((value % 360.0) + 360.0) % 360.0;

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        // SimulationSession owns only managed deterministic state today.
    }
}

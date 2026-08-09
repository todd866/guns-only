using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.UnityBridge;

/// <summary>
/// Presentation-independent host for the Unity F-22 fork. Owns one <see cref="SimulationSession"/>
/// staged on beat 7 (<c>ModernVisualMerge</c> / first-merge) and projects poses without browser or
/// UnityEngine types.
/// </summary>
public sealed class UnitySimSession : IDisposable {
    public const int FirstMergeBeatIndex = 7;

    readonly SimulationSession _session;
    bool _padlockSelected;
    bool _disposed;

    UnitySimSession(SimulationSession session) {
        _session = session;
    }

    public int BeatIndex => _session.BeatIndex;
    public SimulationSession.LifecycleState Lifecycle => _session.Lifecycle;
    public bool OpponentPresent => _session.OpponentPresent;
    public long Tick => _session.Tick;

    public static UnitySimSession StartFirstMerge() {
        var session = new SimulationSession(
            FirstMergeBeatIndex,
            Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(FirstMergeBeatIndex));
        session.Begin();
        session.ReleaseWeaponsHold();
        return new UnitySimSession(session);
    }

    public void FeedKey(GKey key, bool pressed) => _session.FeedKey(key, pressed);

    public void ReleaseWeaponsHold() => _session.ReleaseWeaponsHold();

    public void FeedKeyCode(int keyCode, bool pressed) {
        if (!Enum.IsDefined(typeof(GKey), keyCode)) return;
        GKey key = (GKey)keyCode;
        if (key == GKey.Padlock) {
            if (pressed) {
                _padlockSelected = !_padlockSelected;
                _session.SetPlayerGunTargetPadlockRollAssist(_padlockSelected);
            }
            return;
        }
        FeedKey(key, pressed);
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
        AircraftState player = _session.Player.State;
        Vec3 playerPos = ToVec(player.Position);
        Vec3 playerFwd = ToVec(player.ForwardDir());
        Vec3 playerLeft = LeftFromForwardUp(
            playerFwd,
            ToVec(player.BodyAttitude.Rotate(new Vec3D(0, 1, 0))));

        bool opponentPresent = _session.OpponentPresent;
        Vec3 banditPos = default;
        Vec3 banditFwd = new(0, 0, 1);
        Vec3 banditLeft = new(-1, 0, 0);
        if (opponentPresent) {
            AircraftState bandit = _session.SelectedOpponentState;
            banditPos = ToVec(bandit.Position);
            banditFwd = ToVec(bandit.ForwardDir());
            banditLeft = LeftFromForwardUp(
                banditFwd,
                ToVec(bandit.BodyAttitude.Rotate(new Vec3D(0, 1, 0))));
        }

        double headingDeg = ((player.Chi * (180.0 / Math.PI)) % 360.0 + 360.0) % 360.0;
        double pitchDeg = player.Gamma * (180.0 / Math.PI);
        double bankDeg = player.Bank * (180.0 / Math.PI);
        double tasKts = player.Speed * 1.9438444924406;
        double vsFpm = player.Speed * Math.Sin(player.Gamma) * 196.8503937;
        // Sea-level ISA approximation for HUD Mach; browser uses denser atmosphere model.
        double mach = player.Speed / 340.29;
        double iasKts = tasKts;
        if (_session.Player.IndicatedAirspeedMps > 1.0) {
            iasKts = _session.Player.IndicatedAirspeedMps * 1.9438444924406;
        }

        return new PoseSnapshot(
            Tick: _session.Tick,
            SimulationTimeS: _session.TimeSeconds,
            Lifecycle: _session.Lifecycle.ToString(),
            Player: playerPos,
            PlayerForward: playerFwd,
            PlayerLeft: playerLeft,
            OpponentPresent: opponentPresent,
            Bandit: banditPos,
            BanditForward: banditFwd,
            BanditLeft: banditLeft,
            PlayerAltitudeFt: player.Position.Y * 3.28084,
            PlayerHeadingDeg: headingDeg,
            PlayerHealthPermille: (int)Math.Round(_session.PlayerHealth * 1000.0),
            WeaponsHold: _session.WeaponsInhibited,
            IndicatedAirspeedKts: iasKts,
            PitchDeg: pitchDeg,
            BankDeg: bankDeg,
            VerticalSpeedFpm: vsFpm,
            Mach: mach,
            MissionPack: UnityMissionSelection.FirstMergeMissionPack,
            PadlockSelected: _padlockSelected,
            GunSolution: opponentPresent && _session.PlayerGun.GunSolution,
            PlayerHits: _session.SortiePlayerHits);
    }

    static Vec3 ToVec(Vec3D v) => new(v.X, v.Y, v.Z);

    static Vec3 LeftFromForwardUp(Vec3 forward, Vec3 up) {
        // left = up × forward (sim right-handed: X east, Y up, Z north)
        double x = up.Y * forward.Z - up.Z * forward.Y;
        double y = up.Z * forward.X - up.X * forward.Z;
        double z = up.X * forward.Y - up.Y * forward.X;
        double len = Math.Sqrt(x * x + y * y + z * z);
        if (len < 1e-9) return new Vec3(-1, 0, 0);
        return new Vec3(x / len, y / len, z / len);
    }

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        // SimulationSession has no Dispose today; reserved for future host resources.
    }
}

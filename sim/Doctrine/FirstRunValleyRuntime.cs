using GunsOnly.Sim.Missiles;

namespace GunsOnly.Sim.Doctrine;

public enum FirstRunValleyPhase {
    Valley,
    Armed,
}

/// First-visit Soniachne draw: weapons cold until the pop-out gate, then two AIM-9s on Fire
/// before the same button becomes guns. Epistemic: AIM-9 is the existing public-data surrogate.
public sealed class FirstRunValleyRuntime {
    public const string MissionId = "mission.modern.visual-merge.first-run-valley.v1";
    public const double ValleyEastM = 2_400.0;
    public const double PlayerNorthM = -5_500.0;
    public const double PopOutNorthM = -2_000.0;
    public const double BanditNorthM = -600.0;
    public const double SpawnAltitudeM = 190.0;
    public const int DefaultAim9Rounds = 2;

    readonly Aim9Surrogate _aim9;
    readonly double _popOutNorthM;
    bool _popOutAnnounced;
    bool _detonationPending;

    public FirstRunValleyRuntime(FirstRunValleyConfig config) {
        ArgumentNullException.ThrowIfNull(config);
        _popOutNorthM = config.PopOutNorthM;
        _aim9 = new Aim9Surrogate(config.Aim9Rounds);
    }

    public static bool IsFirstRunValleyMission(string? missionId) =>
        missionId == MissionId;

    public FirstRunValleyPhase Phase { get; private set; } = FirstRunValleyPhase.Valley;
    public bool WeaponsCold => Phase == FirstRunValleyPhase.Valley;
    public bool ParkOpponents => WeaponsCold;
    public int Aim9Remaining => _aim9.RoundsRemaining;
    public Aim9Telemetry Aim9Live => _aim9.Live;
    public bool Aim9InFlight => _aim9.Live.State
        is Aim9FlightState.Seeking or Aim9FlightState.Tracking;

    public bool ObservePlayer(in AircraftState player) {
        if (Phase != FirstRunValleyPhase.Valley) return false;
        if (player.Position.Z + 1e-6 < _popOutNorthM) return false;
        Phase = FirstRunValleyPhase.Armed;
        _popOutAnnounced = true;
        return true;
    }

    public bool ConsumePopOutAnnouncement() {
        if (!_popOutAnnounced) return false;
        _popOutAnnounced = false;
        return true;
    }

    public bool TryLaunchFoxTwo(in Aim9Pose shooter, in Aim9Pose target, double nowMs) {
        if (WeaponsCold) return false;
        return _aim9.TryLaunch(shooter, target, nowMs);
    }

    public void Step(double dt, in Aim9Pose target) {
        Aim9FlightState before = _aim9.Live.State;
        _aim9.Step(dt, target);
        if (before != Aim9FlightState.Detonated
            && _aim9.Live.State == Aim9FlightState.Detonated)
            _detonationPending = true;
    }

    public bool ConsumeDetonation() {
        if (!_detonationPending) return false;
        _detonationPending = false;
        return true;
    }
}

public sealed record FirstRunValleyConfig(
    double PopOutNorthM,
    int Aim9Rounds = FirstRunValleyRuntime.DefaultAim9Rounds);

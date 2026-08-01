namespace GunsOnly.Sim;

/// <summary>
/// Inbound recovery procedure selected from the Mesh ND. Gates teach Rapier energy/config into
/// HomePlate. Fiction: docs/superpowers/specs/2026-07-29-mesh-nd-redesign-design.md.
/// </summary>
public enum RecoveryProcedureKind {
    None = 0,
    Overhead = 1,
    DownwindRejoin = 2,
    StraightIn = 3,
}

public readonly record struct RecoveryGate(
    string Id,
    string Label,
    double EastM,
    double NorthM,
    double UpM,
    double HalfM,
    double TargetKtas,
    bool DirtyConfig);

public sealed class RecoveryProcedureDirector {
    public const double EnergyBandKtas = 25.0;
    /// Gate half-widths were authored for a sphere the pilot had to hit. Reused as a lateral
    /// capture corridor they are the same numbers doing an easier job, widened so that passing
    /// a gate is forgiving and only the deviation report is exacting.
    public const double CaptureCorridorScale = 2.0;

    RecoveryProcedureKind _kind = RecoveryProcedureKind.None;
    List<RecoveryGate> _gates = new();
    int _activeIndex;
    bool _inVolume;
    bool _energyOk;
    bool _configOk;
    double _homeHeadingRad;

    public RecoveryProcedureKind Kind => _kind;
    public IReadOnlyList<RecoveryGate> Gates => _gates;
    /// True when the gate just sequenced was passed outside its energy, configuration or
    /// vertical band. Reported so a sloppy recovery is visible; never used to block the ladder.
    public bool LastGateMissed { get; private set; }
    public int ActiveIndex => _activeIndex;
    public bool InVolume => _inVolume;
    public bool EnergyOk => _energyOk;
    public bool ConfigOk => _configOk;
    public double HomeHeadingRad => _homeHeadingRad;
    public RecoveryGate? ActiveGate =>
        _activeIndex >= 0 && _activeIndex < _gates.Count ? _gates[_activeIndex] : null;

    public Vec3D ActiveGateFace {
        get {
            double cos = Math.Cos(_homeHeadingRad);
            double sin = Math.Sin(_homeHeadingRad);
            return new Vec3D(sin, 0.0, cos);
        }
    }

    public void Reset() {
        _kind = RecoveryProcedureKind.None;
        _gates = new List<RecoveryGate>();
        _activeIndex = 0;
        _inVolume = false;
        _energyOk = false;
        _configOk = false;
        _homeHeadingRad = 0.0;
    }

    public bool TrySet(RecoveryProcedureKind kind, in Vec3D home, double homeHeadingRad) {
        if (!home.IsFinite) return false;
        if (!double.IsFinite(homeHeadingRad)) return false;
        if (kind == RecoveryProcedureKind.None) {
            Reset();
            return true;
        }

        _kind = kind;
        _homeHeadingRad = homeHeadingRad;
        _gates = BuildSchedule(kind, home, homeHeadingRad).ToList();
        _activeIndex = 0;
        _inVolume = false;
        _energyOk = false;
        _configOk = false;
        return _gates.Count > 0;
    }

    /// <summary>
    /// Advance the ladder. Sequencing is by PASSING a gate, never by satisfying it.
    ///
    /// This previously required position, speed and configuration to be true on the same tick,
    /// inside a 250-700 m sphere, with no re-sequencing and no skip. Miss the first gate --
    /// which arriving from an intercept you will -- and _activeIndex stuck at 0 for the rest of
    /// the flight, taking every later phase with it. 129,501 recorded state rows across real
    /// sorties contain exactly one value of recovery_gate_active_index (0) and one value of
    /// runway_recovery_phase_name (AIRBORNE): nobody had ever reached a second gate, so nobody
    /// could land. That was read as the recovery being difficult. It was not difficult; it was
    /// not running.
    ///
    /// Energy and configuration are still measured, and still published, but they report
    /// deviation instead of blocking progress. A recovery that silently stops sequencing is
    /// indistinguishable from a broken one, and the pilot has no way to tell which it is.
    /// </summary>
    public void Step(in Vec3D position, double trueAirspeedKnots, bool gearDown, bool flapsDown) {
        if (_gates.Count == 0 || _kind == RecoveryProcedureKind.None) {
            _inVolume = false;
            _energyOk = false;
            _configOk = false;
            LastGateMissed = false;
            return;
        }

        if (_activeIndex < 0) _activeIndex = 0;
        if (_activeIndex >= _gates.Count) _activeIndex = _gates.Count - 1;
        RecoveryGate gate = _gates[_activeIndex];
        double dx = position.X - gate.EastM;
        double dy = position.Y - gate.UpM;
        double dz = position.Z - gate.NorthM;

        // Lateral capture, vertical graded. Arriving 3,000 m high over the gate is a deviation
        // worth showing, not a reason to refuse to sequence.
        double lateralM = Math.Sqrt(dx * dx + dz * dz);
        double corridorM = gate.HalfM * CaptureCorridorScale;
        _inVolume = lateralM <= corridorM && Math.Abs(dy) <= corridorM;
        _energyOk = Math.Abs(trueAirspeedKnots - gate.TargetKtas) <= EnergyBandKtas;
        _configOk = gate.DirtyConfig
            ? gearDown && flapsDown
            : !gearDown && !flapsDown;

        if (lateralM <= corridorM && _activeIndex < _gates.Count - 1) {
            LastGateMissed = !(_energyOk && _configOk && Math.Abs(dy) <= corridorM);
            _activeIndex++;
        }
    }

    public static IReadOnlyList<RecoveryGate> BuildSchedule(
        RecoveryProcedureKind kind,
        in Vec3D home,
        double homeHeadingRad) {
        double homeEast = home.X;
        double homeUp = home.Y;
        double homeNorth = home.Z;
        double cos = Math.Cos(homeHeadingRad);
        double sin = Math.Sin(homeHeadingRad);
        Vec3D Along(double alongM, double crossM, double upM) => new(
            homeEast + sin * alongM + cos * crossM,
            homeUp + upM,
            homeNorth + cos * alongM - sin * crossM);

        return kind switch {
            RecoveryProcedureKind.Overhead => new[] {
                Gate("depart", "DEPART", Along(-2_000, -70, 200), 400, 220, false),
                Gate("initial", "INITIAL", Along(4_000, 0, 550), 500, 300, false),
                Gate("break", "BREAK", Along(1_500, -1_200, 550), 450, 280, false),
                Gate("downwind", "DOWNWIND", Along(-2_000, -4_000, 500), 500, 300, true),
                Gate("base", "BASE", Along(-6_000, -2_000, 350), 450, 220, true),
                Gate("short_final", "SHORT FINAL", Along(-5_500, 0, 180), 400, 180, true),
                Gate("wire_final", "WIRE FINAL", Along(-800, 0, 40), 250, 175, true),
            },
            RecoveryProcedureKind.DownwindRejoin => new[] {
                Gate("join_downwind", "JOIN DOWNWIND", Along(-1_000, -4_200, 500), 550, 280, true),
                Gate("base", "BASE", Along(-6_000, -2_000, 350), 450, 220, true),
                Gate("short_final", "SHORT FINAL", Along(-5_500, 0, 180), 400, 180, true),
                Gate("wire_final", "WIRE FINAL", Along(-800, 0, 40), 250, 175, true),
            },
            RecoveryProcedureKind.StraightIn => new[] {
                Gate("final_8", "FINAL 8 NM", Along(-14_816, 0, 700), 700, 240, false),
                Gate("final_4", "FINAL 4 NM", Along(-7_408, 0, 400), 550, 200, true),
                Gate("short_final", "SHORT FINAL", Along(-5_500, 0, 180), 400, 180, true),
                Gate("wire_final", "WIRE FINAL", Along(-800, 0, 40), 250, 175, true),
            },
            _ => Array.Empty<RecoveryGate>(),
        };
    }

    static RecoveryGate Gate(
        string id, string label, in Vec3D position, double halfM, double targetKtas, bool dirty) =>
        new(id, label, position.X, position.Z, position.Y, halfM, targetKtas, dirty);
}

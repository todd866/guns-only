using System;
using System.Collections.Generic;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Recovery;

public enum CourseGateGrade : byte { Pending = 0, Pass = 1, Fail = 2 }

/// <summary>A named, graded gate of the F-22 overhead course, in world coordinates.</summary>
public readonly record struct CourseGate(
    string Id,
    string Label,
    Vec3D Position,
    double LegHeadingRad,
    double WindowM,
    double TargetCalibratedMps,
    double AltitudeToleranceM,
    double SpeedToleranceMps,
    double MaximumCalibratedMps,
    bool GearRequired,
    ApproachPatternLeg Leg);

/// <summary>What the pilot actually had at a graded gate (or at physical touchdown).</summary>
public readonly record struct CourseGateRecord(
    string Id,
    string Label,
    CourseGateGrade Grade,
    double AltitudeFt,
    double CalibratedKts,
    bool GearDown,
    double TargetAltitudeFt,
    double TargetCalibratedKts,
    bool GearRequired,
    double SinkRateMps = double.NaN);

/// <summary>One sample of the course path: where to be, how fast, and how far along.</summary>
public readonly record struct CoursePoint(
    Vec3D Position,
    double TargetCalibratedMps,
    double StationM,
    ApproachPatternLeg Leg,
    bool GearRequired,
    int GateIndex);

/// <summary>
/// The Build 380 F-22 recovery course (docs/grok-overhaul/design/f22-recovery.md): a transit route
/// to the IP, then a left-hand overhead. The pilot flies one box, a "carrot" a few seconds ahead
/// on the course path (highway in the sky): keep the flight-path marker in it and the jet flies
/// the course. Named gates are graded as the aircraft passes them along the path.
///
/// Guidance and grading only. It never moves the aircraft, never changes its energy and never
/// judges a landing: contact, rollout and stop stay owned by
/// <see cref="ConventionalRunwayRecoveryModel"/>. A pilot who strays far off the path gets a fresh
/// route (the same Dubins solver) to the next gate, so the course never dead-ends. The pattern
/// numbers are authored surrogate tuning for ease, not an F-22 local supplement.
/// </summary>
public sealed class F22OverheadCourse {
    public const double FeetToM = 0.3048;
    public const double KtsToMps = 1.0 / AirData.MpsToKnots;
    const double FinalSlopeRad = 3.0 * Math.PI / 180.0;
    const double PatternOffsetM = 1_852.0;
    const double TurnRadiusM = PatternOffsetM / 2.0;
    const double GoAroundPastAimM = 250.0;
    const double DefaultBreakAlongM = 1_500.0;
    const double ArcStepRad = Math.PI / 12.0;

    public const double IpAlongM = -11_112.0;      // 6 NM
    public const double InitialAlongM = -5_556.0;  // 3 NM
    public const double DownwindAlongM = 900.0;
    public const double FinalAlongM = -1_500.0;    // 0.8 NM

    // Transit: honest idle-descent energy model. 0.26 m of specific energy per metre of track is
    // what this surrogate lost in a 10° idle descent from the post-fight state
    // (sim.Tests F22RecoveryEnergyProbe: 7 223 m → 2 067 m in 20.0 km at −10°).
    public const double TransitEnergyLossPerM = 0.26;
    public const double TransitMaxDescentRad = 10.0 * Math.PI / 180.0;
    public const double TransitCalibratedKts = 330.0;
    public const double TransitBankRad = 55.0 * Math.PI / 180.0;
    const double TransitTerrainClearanceM = 300.0;

    // The carrot: a few seconds ahead on the path. Closer in on final for precision.
    const double CarrotLeadSeconds = 7.0;
    const double CarrotMinimumLeadM = 350.0;
    const double CarrotMaximumLeadM = 1_600.0;
    const double FinalCarrotLeadSeconds = 8.0;
    public const double HighwayBoxSpacingM = 600.0;
    public const int HighwayBoxCount = 3;

    readonly List<CourseGate> _gates = new();
    readonly List<CourseGateRecord> _records = new();
    readonly List<CoursePoint> _path = new();
    ConventionalRunway? _runway;
    double _approachCalibratedMps = double.NaN;
    double _referenceHeightM = 1.8;
    int _nextGate;
    bool _armed;
    bool _complete;
    bool _needsInitialRoute;
    int _revision;
    double _progressM;
    double _crossTrackM;
    ApproachExtensionKind _routeKind;

    public bool Armed => _armed;
    public bool Complete => _complete;
    public int Revision => _revision;
    public IReadOnlyList<CourseGate> Gates => _gates;
    public IReadOnlyList<CourseGateRecord> Records => _records;
    public IReadOnlyList<CoursePoint> Path => _path;
    public ConventionalRunway? Runway => _runway;
    public double ProgressM => _progressM;
    public double CrossTrackM => _crossTrackM;
    /// The box the pilot flies: a point a few seconds ahead on the course path.
    public CoursePoint Carrot { get; private set; }
    /// The next graded gate (what the NEXT row names), or default once past final.
    public CourseGate NextGate => _nextGate < _gates.Count ? _gates[_nextGate] : default;
    public int NextGateIndex => _nextGate;

    public static readonly string[] GradedIds =
        { "ip", "initial", "break", "downwind", "perch", "final", "touchdown" };

    public void Reset() {
        _gates.Clear();
        _records.Clear();
        _path.Clear();
        _runway = null;
        _approachCalibratedMps = double.NaN;
        _nextGate = 0;
        _armed = false;
        _complete = false;
        _needsInitialRoute = false;
        _progressM = 0.0;
        _crossTrackM = 0.0;
        _routeKind = ApproachExtensionKind.None;
        _revision++;
        Carrot = default;
    }

    /// <summary>Arm on the first RTB tick for this runway; the route is planned on the next Step.</summary>
    public void Arm(
        ConventionalRunway runway,
        double approachCalibratedMps,
        double touchdownReferenceHeightM) {
        ArgumentNullException.ThrowIfNull(runway);
        if (!double.IsFinite(approachCalibratedMps) || approachCalibratedMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(approachCalibratedMps));
        Reset();
        _runway = runway;
        _approachCalibratedMps = approachCalibratedMps;
        _referenceHeightM = touchdownReferenceHeightM;
        _gates.AddRange(BuildGates(runway, approachCalibratedMps, touchdownReferenceHeightM,
            DefaultBreakAlongM));
        foreach (CourseGate gate in _gates)
            _records.Add(new CourseGateRecord(gate.Id, RowLabel(gate.Id), CourseGateGrade.Pending,
                double.NaN, double.NaN, false, gate.Position.Y / FeetToM,
                gate.TargetCalibratedMps * AirData.MpsToKnots, gate.GearRequired));
        _records.Add(new CourseGateRecord("touchdown", "TD", CourseGateGrade.Pending,
            double.NaN, double.NaN, false, runway.Threshold.Y / FeetToM,
            approachCalibratedMps * AirData.MpsToKnots, true));
        _armed = true;
        _needsInitialRoute = true;
        _revision++;
    }

    static string RowLabel(string id) => id switch {
        "ip" => "IP",
        "initial" => "INITIAL",
        "break" => "BREAK",
        "downwind" => "DOWNWIND",
        "perch" => "PERCH",
        "final" => "FINAL",
        _ => id.ToUpperInvariant(),
    };

    /// <summary>
    /// The six airborne graded gates, runway frame → world. Heights are above the threshold.
    /// Speeds are calibrated. <paramref name="breakAlongM"/> moves only on a go-around.
    /// </summary>
    public static List<CourseGate> BuildGates(
        ConventionalRunway runway,
        double approachCalibratedMps,
        double touchdownReferenceHeightM,
        double breakAlongM = DefaultBreakAlongM) {
        ArgumentNullException.ThrowIfNull(runway);
        double heading = runway.HeadingRad;
        double recip = WrapPi(heading + Math.PI);
        double aim = runway.TouchdownAimAlongM;
        Vec3D P(double along, double cross, double heightM) =>
            runway.SurfacePoint(along, cross) + new Vec3D(0.0, heightM, 0.0);
        double pattern = 1_500.0 * FeetToM;
        double finalHeight = touchdownReferenceHeightM
            + (aim - FinalAlongM) * Math.Tan(FinalSlopeRad);
        CourseGate G(string id, Vec3D p, double legHeading, double window, double kts,
            double altTolFt, double speedTolKts, double maxKts, bool gear,
            ApproachPatternLeg leg) => new(id, RowLabel(id), p, WrapPi(legHeading), window,
                kts * KtsToMps, altTolFt * FeetToM, speedTolKts * KtsToMps,
                double.IsFinite(maxKts) ? maxKts * KtsToMps : double.NaN, gear, leg);
        double appKts = approachCalibratedMps * AirData.MpsToKnots;
        return new List<CourseGate> {
            G("ip", P(IpAlongM, 0.0, 2_000.0 * FeetToM), heading, 2_500.0, 280, 500, 30,
                double.NaN, false, ApproachPatternLeg.PatternEntry),
            G("initial", P(InitialAlongM, 0.0, pattern), heading, 1_500.0, 250, 300, 30,
                double.NaN, false, ApproachPatternLeg.PatternEntry),
            G("break", P(breakAlongM, 0.0, pattern), heading, 1_000.0, 250, 300, 30,
                double.NaN, false, ApproachPatternLeg.Downwind),
            G("downwind", P(DownwindAlongM, -PatternOffsetM, pattern), recip, 900.0, 190, 300,
                50, 250.0, true, ApproachPatternLeg.Downwind),
            G("perch", P(0.0, -PatternOffsetM, pattern), recip, 900.0, 165, 300, 25,
                double.NaN, true, ApproachPatternLeg.Downwind),
            G("final", P(FinalAlongM, 0.0, finalHeight), heading, 400.0, appKts, 100, 15,
                double.NaN, true, ApproachPatternLeg.Final),
        };
    }

    /// <summary>
    /// The course path from gate <paramref name="fromGate"/> onward: straight legs, the left
    /// 180° break (centre beside the break), downwind, the descending left 180° to a 0.8 NM final,
    /// the 3° line, a ~2° flare segment to 150 m past the aim point, then the runway.
    /// </summary>
    static List<CoursePoint> BuildPatternPath(
        ConventionalRunway runway,
        IReadOnlyList<CourseGate> gates,
        int fromGate,
        double approachCalibratedMps,
        double touchdownReferenceHeightM,
        double startStationM) {
        double aim = runway.TouchdownAimAlongM;
        double pattern = 1_500.0 * FeetToM;
        double breakAlong = runway.Frame(gates[2].Position).along;
        var raw = new List<(double along, double cross, double h, double cas,
            ApproachPatternLeg leg, bool gear, int gate)>();
        void Add(double along, double cross, double h, double kts, ApproachPatternLeg leg,
            bool gear, int gate = -1) =>
            raw.Add((along, cross, h, kts * KtsToMps, leg, gear, gate));
        double app = approachCalibratedMps * AirData.MpsToKnots;
        double finalH = touchdownReferenceHeightM + (aim - FinalAlongM) * Math.Tan(FinalSlopeRad);

        if (fromGate <= 0)
            Add(IpAlongM, 0, 2_000.0 * FeetToM, 280, ApproachPatternLeg.PatternEntry, false, 0);
        if (fromGate <= 1)
            Add(InitialAlongM, 0, pattern, 250, ApproachPatternLeg.PatternEntry, false, 1);
        if (fromGate <= 2) {
            Add(breakAlong, 0, pattern, 250, ApproachPatternLeg.Downwind, false, 2);
            // Left 180: centre (breakAlong, −926). Decelerate 250 → 210 through the turn.
            for (double t = ArcStepRad; t < Math.PI - 1e-9; t += ArcStepRad)
                Add(breakAlong + TurnRadiusM * Math.Sin(t), -TurnRadiusM * (1.0 - Math.Cos(t)),
                    pattern, 250.0 - 50.0 * t / Math.PI, ApproachPatternLeg.Downwind, false);
            Add(breakAlong, -PatternOffsetM, pattern, 200, ApproachPatternLeg.Downwind, false);
        }
        if (fromGate <= 3)
            Add(DownwindAlongM, -PatternOffsetM, pattern, 190, ApproachPatternLeg.Downwind, true, 3);
        if (fromGate <= 4)
            Add(0.0, -PatternOffsetM, pattern, 165, ApproachPatternLeg.Downwind, true, 4);
        // Descend from the perch: 1 500 m straight then the semicircle, linear in track.
        double straight = -FinalAlongM;
        double arc = Math.PI * TurnRadiusM;
        double total = straight + arc;
        if (fromGate <= 5) {
            Add(FinalAlongM, -PatternOffsetM, pattern + (finalH - pattern) * straight / total, 150,
                ApproachPatternLeg.Base, true);
            for (double p = ArcStepRad; p < Math.PI - 1e-9; p += ArcStepRad) {
                double travelled = straight + arc * p / Math.PI;
                double kts = 150.0 + (app + 3.0 - 150.0) * p / Math.PI;
                Add(FinalAlongM - TurnRadiusM * Math.Sin(p), -TurnRadiusM * (1.0 + Math.Cos(p)),
                    pattern + (finalH - pattern) * travelled / total, kts,
                    ApproachPatternLeg.Base, true);
            }
        }
        Add(FinalAlongM, 0, finalH, app, ApproachPatternLeg.Final, true, 5);
        Add(0.0, 0, touchdownReferenceHeightM + aim * Math.Tan(FinalSlopeRad), app,
            ApproachPatternLeg.Threshold, true);
        // Flare: following the box from the threshold flattens the last 550 m to about 1.8°, so
        // near the ground the box sits just above the marker (a gentle pull, never a push).
        // The box rides just under the pavement (wheel height − 4 m): aiming at it puts the jet on the
        // runway rather than floating along it.
        // Past the threshold the autothrottle eases off (a retard in the flare), so the jet
        // settles instead of floating down the pavement.
        Add(aim + 250.0, 0, touchdownReferenceHeightM - 4.0, app - 20,
            ApproachPatternLeg.Threshold, true);
        Add(runway.LengthM, 0, touchdownReferenceHeightM - 4.0, 0,
            ApproachPatternLeg.Threshold, true);

        var path = new List<CoursePoint>(raw.Count);
        double s = startStationM;
        Vec3D? previous = null;
        foreach (var r in raw) {
            Vec3D p = runway.SurfacePoint(r.along, r.cross) + new Vec3D(0.0, r.h, 0.0);
            if (previous is { } q) s += Horizontal(p - q);
            path.Add(new CoursePoint(p, r.cas, s, r.leg, r.gear, r.gate));
            previous = p;
        }
        return path;
    }

    /// <summary>Advance progress, grade passed gates, re-plan if far off the path, publish.</summary>
    public ApproachGuidanceState Step(
        in AircraftState player,
        double calibratedMps,
        double trueAirspeedMps,
        bool gearDownAndLocked,
        IAtmosphereModel? atmosphere = null,
        ITerrainSurface? terrain = null) {
        if (!_armed || _complete || _runway is null || _gates.Count == 0)
            return ApproachGuidanceState.Inactive;
        ConventionalRunway runway = _runway;

        if (_needsInitialRoute) {
            _needsInitialRoute = false;
            Replan(0, player, trueAirspeedMps, atmosphere, terrain);
        }

        // Go-around: airborne beyond the aim point after final. Closed pattern: a new break
        // 1 500 m ahead on the runway heading, then the same downwind. Never a box behind.
        var frame = runway.Frame(player.Position);
        if (_nextGate >= _gates.Count
            && frame.along > runway.TouchdownAimAlongM + GoAroundPastAimM
            && frame.height > _referenceHeightM + 8.0) {
            GoAround(frame.along, player);
        }

        (double along, double cross) = Project(player.Position);
        _progressM = Math.Max(_progressM, along);
        _crossTrackM = cross;

        // Grade every named gate the aircraft has now passed along the path.
        while (_nextGate < _gates.Count && GateStation(_nextGate) is double station
            && _progressM >= station) {
            CourseGate gate = _gates[_nextGate];
            Grade(_nextGate, gate, player, calibratedMps, gearDownAndLocked,
                missedWindow: _crossTrackM > gate.WindowM);
            _nextGate++;
            _revision++;
        }

        // Far off the path: a fresh route to the next gate. Past final there is no re-plan;
        // the go-around rule owns a missed landing.
        double replanAt = _nextGate <= 1 ? 1_500.0 : 900.0;
        if (_crossTrackM > replanAt && _nextGate < _gates.Count) {
            Replan(_nextGate, player, trueAirspeedMps, atmosphere, terrain);
            (along, cross) = Project(player.Position);
            _progressM = Math.Max(_progressM, along);
            _crossTrackM = cross;
        }

        double tas = Math.Max(trueAirspeedMps, 30.0);
        bool onFinal = _nextGate >= _gates.Count - 1
            && frame.along > FinalAlongM - 2_000.0 && Math.Abs(frame.cross) < 600.0;
        double lead = Math.Clamp(tas * (onFinal ? FinalCarrotLeadSeconds : CarrotLeadSeconds),
            CarrotMinimumLeadM, CarrotMaximumLeadM);
        CarrotLeadSeconds_ = lead / tas;
        Carrot = PointAt(_progressM + lead);
        return Publish(player, trueAirspeedMps, lead, atmosphere);
    }

    /// <summary>Physical touchdown result: grades the TD row once and completes the course.</summary>
    public void ObserveTouchdown(in RunwayTouchdownResult touchdown, double calibratedMps,
        bool gearDownAndLocked) {
        if (!_armed || _complete || !touchdown.Contact) return;
        int index = _records.FindIndex(static r => r.Id == "touchdown");
        if (index < 0) return;
        bool pass = touchdown.Survivable
            && touchdown.Deviations == RunwayTouchdownDeviation.None;
        _records[index] = _records[index] with {
            Grade = pass ? CourseGateGrade.Pass : CourseGateGrade.Fail,
            CalibratedKts = calibratedMps * AirData.MpsToKnots,
            GearDown = gearDownAndLocked,
            SinkRateMps = touchdown.SinkRateMps,
        };
        // A gate the jet never reached in order stays a ✗.
        for (int i = 0; i < _records.Count; i++)
            if (_records[i].Grade == CourseGateGrade.Pending)
                _records[i] = _records[i] with { Grade = CourseGateGrade.Fail };
        _complete = true;
        _revision++;
    }

    double? GateStation(int gateIndex) {
        foreach (CoursePoint p in _path)
            if (p.GateIndex == gateIndex) return p.StationM;
        return null;
    }

    void Grade(int gateIndex, in CourseGate gate, in AircraftState player, double calibratedMps,
        bool gear, bool missedWindow) {
        double altErrM = player.Position.Y - gate.Position.Y;
        bool speedOk = double.IsFinite(gate.MaximumCalibratedMps)
            ? calibratedMps <= gate.MaximumCalibratedMps
                && calibratedMps >= gate.TargetCalibratedMps - gate.SpeedToleranceMps
            : Math.Abs(calibratedMps - gate.TargetCalibratedMps) <= gate.SpeedToleranceMps;
        bool pass = !missedWindow
            && Math.Abs(altErrM) <= gate.AltitudeToleranceM
            && speedOk
            && (!gate.GearRequired || gear);
        _records[gateIndex] = _records[gateIndex] with {
            Grade = pass ? CourseGateGrade.Pass : CourseGateGrade.Fail,
            AltitudeFt = player.Position.Y / FeetToM,
            CalibratedKts = calibratedMps * AirData.MpsToKnots,
            GearDown = gear,
        };
    }

    void GoAround(double along, in AircraftState player) {
        ConventionalRunway runway = _runway!;
        double breakAlong = Math.Max(DefaultBreakAlongM, along + 1_500.0);
        List<CourseGate> rebuilt = BuildGates(runway, _approachCalibratedMps, _referenceHeightM,
            breakAlong);
        _gates[2] = rebuilt[2];
        for (int i = 2; i < _records.Count; i++)
            _records[i] = _records[i] with { Grade = CourseGateGrade.Pending,
                AltitudeFt = double.NaN, CalibratedKts = double.NaN, GearDown = false };
        _nextGate = 2;
        _path.Clear();
        _progressM = 0.0;
        _path.Add(new CoursePoint(player.Position, _gates[2].TargetCalibratedMps, 0.0,
            ApproachPatternLeg.Downwind, false, -1));
        _path.AddRange(BuildPatternPath(runway, _gates, 2, _approachCalibratedMps,
            _referenceHeightM, Horizontal(_gates[2].Position - player.Position)));
        _routeKind = ApproachExtensionKind.None;
        _revision++;
    }

    /// <summary>
    /// A fresh path from the aircraft to gate <paramref name="gateIndex"/> (arriving on its leg
    /// heading, long enough to lose the excess energy at idle), then the rest of the pattern.
    /// </summary>
    void Replan(int gateIndex, in AircraftState player, double trueAirspeedMps,
        IAtmosphereModel? atmosphere, ITerrainSurface? terrain) {
        ConventionalRunway runway = _runway!;
        CourseGate target = _gates[gateIndex];
        double targetTas = AirData.TrueAirspeedForCalibratedAirspeedMps(
            target.TargetCalibratedMps, target.Position.Y, atmosphere);
        double excessM = Math.Max(0.0,
            ApproachEnergy.SpecificEnergyM(player.Position.Y, trueAirspeedMps)
            - ApproachEnergy.SpecificEnergyM(target.Position.Y, targetTas));
        double requiredM = excessM / TransitEnergyLossPerM;
        // Size turns for the speed the jet will actually turn at: transit speed, not the
        // post-fight dash speed, at a bank a keyboard pilot can hold.
        // Back to the IP the transit hold is 330 KCAS; a re-plan inside the pattern flies the
        // gate's own speed (never a gear-down dash) at a 30° bank.
        bool toIp = gateIndex == 0;
        double transitCas = toIp
            ? Math.Max(target.TargetCalibratedMps, TransitCalibratedKts * KtsToMps)
            : target.TargetCalibratedMps;
        double turnTas = Math.Max(targetTas, Math.Min(trueAirspeedMps,
            AirData.TrueAirspeedForCalibratedAirspeedMps(transitCas,
                player.Position.Y, atmosphere)));
        double turnRadiusM = Math.Max(900.0, turnTas * turnTas
            / (FlightModel.G0 * Math.Tan(toIp ? TransitBankRad : 30.0 * Math.PI / 180.0)));
        ApproachPathSolution route = ApproachPath.Solve(new ApproachPathInput(
            player.Position, player.Chi, target.Position, target.LegHeadingRad,
            requiredM, turnRadiusM));
        _routeKind = route.Kind;
        _path.Clear();
        _progressM = 0.0;
        double total = Math.Max(route.TotalTrackM, 1.0);
        double startH = Math.Max(player.Position.Y, target.Position.Y);
        // Sample the route every ~250 m. Height falls linearly with track (no steeper than the
        // idle-descent limit near the gate), never below terrain clearance. Speed eases from the
        // transit hold to the gate's target over the last 4 km.
        int samples = Math.Max(2, (int)Math.Ceiling(total / 250.0));
        for (int i = 0; i < samples; i++) {
            double s = total * i / samples;
            Vec3D h = ApproachPath.PointAtDistanceFromStart(route, s);
            double remaining = total - s;
            double y = target.Position.Y + Math.Min(
                (startH - target.Position.Y) * remaining / total,
                remaining * Math.Tan(TransitMaxDescentRad));
            if (terrain is not null && terrain.TryHeightM(h.X, h.Z, out double ground))
                y = Math.Max(y, ground + TransitTerrainClearanceM);
            double blend = Math.Clamp(remaining / 4_000.0, 0.0, 1.0);
            double cas = target.TargetCalibratedMps
                + (transitCas - target.TargetCalibratedMps) * blend;
            _path.Add(new CoursePoint(new Vec3D(h.X, y, h.Z), cas, s,
                ApproachPatternLeg.PatternEntry, target.GearRequired, -1));
        }
        _path.AddRange(BuildPatternPath(runway, _gates, gateIndex, _approachCalibratedMps,
            _referenceHeightM, total));
        _revision++;
    }

    CoursePoint PointAt(double station) {
        if (_path.Count == 0) return default;
        if (station <= _path[0].StationM) return _path[0];
        for (int i = 1; i < _path.Count; i++) {
            CoursePoint b = _path[i];
            if (station > b.StationM) continue;
            CoursePoint a = _path[i - 1];
            double span = Math.Max(1e-6, b.StationM - a.StationM);
            double t = Math.Clamp((station - a.StationM) / span, 0.0, 1.0);
            Vec3D p = a.Position + (b.Position - a.Position) * t;
            double cas = b.TargetCalibratedMps <= 0.0
                ? a.TargetCalibratedMps
                : a.TargetCalibratedMps + (b.TargetCalibratedMps - a.TargetCalibratedMps) * t;
            return new CoursePoint(p, cas, station, b.Leg, a.GearRequired || b.GearRequired, -1);
        }
        CoursePoint last = _path[^1];
        return last with {
            TargetCalibratedMps = _path.Count > 1 ? _path[^2].TargetCalibratedMps : 0.0,
            GateIndex = -1,
        };
    }

    (double along, double crossTrack) Project(in Vec3D point) {
        double best = double.PositiveInfinity, bestAlong = _progressM;
        double windowStart = _progressM - 300.0, windowEnd = _progressM + 3_000.0;
        for (int i = 1; i < _path.Count; i++) {
            CoursePoint a = _path[i - 1], b = _path[i];
            if (b.StationM < windowStart || a.StationM > windowEnd) continue;
            double dx = b.Position.X - a.Position.X, dz = b.Position.Z - a.Position.Z;
            double len2 = dx * dx + dz * dz;
            if (len2 <= 1e-9) continue;
            double t = Math.Clamp(((point.X - a.Position.X) * dx + (point.Z - a.Position.Z) * dz)
                / len2, 0.0, 1.0);
            double nx = a.Position.X + dx * t, nz = a.Position.Z + dz * t;
            double d = Math.Sqrt((point.X - nx) * (point.X - nx) + (point.Z - nz) * (point.Z - nz));
            if (d < best) { best = d; bestAlong = a.StationM + (b.StationM - a.StationM) * t; }
        }
        return (bestAlong, double.IsFinite(best) ? best : 0.0);
    }

    ApproachGuidanceState Publish(in AircraftState player, double trueAirspeedMps, double lead,
        IAtmosphereModel? atmosphere) {
        CoursePoint carrot = Carrot;
        double CasToTas(double cas, double alt) => cas > 0.0
            ? AirData.TrueAirspeedForCalibratedAirspeedMps(cas, alt, atmosphere) : 0.0;
        var gates = new List<WorldApproachGate>(HighwayBoxCount + 1);
        void Add(string id, string label, in CoursePoint p, bool active) {
            double tas = CasToTas(p.TargetCalibratedMps, p.Position.Y);
            gates.Add(new WorldApproachGate(id, label, p.Position.X, p.Position.Z,
                p.Position.Y, 60.0, p.Position.Y, tas * AirData.MpsToKnots, 0.0, 15.0,
                p.Leg, p.GearRequired, active));
        }
        bool pastFinal = _nextGate >= _gates.Count;
        CourseGate next = NextGate;
        string label = pastFinal ? "TOUCHDOWN" : next.Label;
        // Gate 0 is the carrot under the NEXT gate's id, so the existing overhead radio still
        // hears "break" (initial call) and "perch" (base call) exactly when those become next.
        Add(pastFinal ? "touchdown_aim" : next.Id, label, carrot, true);
        for (int i = 1; i <= HighwayBoxCount; i++)
            Add($"highway_{i}", label, PointAt(_progressM + lead + i * HighwayBoxSpacingM), false);
        double markerTas = CasToTas(carrot.TargetCalibratedMps, carrot.Position.Y);
        double targetKtas = markerTas * AirData.MpsToKnots;
        double distance = pastFinal
            ? Horizontal(player.Position - _runway!.TouchdownAimPoint)
            : Horizontal(player.Position - next.Position);
        double remainingTrack = _path.Count > 0
            ? Math.Max(0.0, _path[^1].StationM - _progressM) : 0.0;
        return new ApproachGuidanceState(
            GuidanceActive: true,
            Valid: true,
            ExcessEnergyM: Math.Max(0.0, ApproachEnergy.SpecificEnergyM(player.Position.Y,
                trueAirspeedMps) - ApproachEnergy.SpecificEnergyM(carrot.Position.Y, markerTas)),
            TrackRequiredM: distance,
            TrackAvailableM: remainingTrack,
            Extension: _routeKind,
            InGroove: carrot.Leg is ApproachPatternLeg.Final or ApproachPatternLeg.Threshold,
            NextLabel: label,
            NextAltitudeM: carrot.Position.Y,
            NextTrueAirspeedMps: markerTas,
            AltitudeErrorM: player.Position.Y - carrot.Position.Y,
            TrueAirspeedErrorMps: trueAirspeedMps - markerTas,
            Power01: ApproachSolver.CommandedPower01(player.Position.Y, trueAirspeedMps,
                carrot.Position.Y, markerTas),
            ConventionalPattern: true,
            ActivePatternLeg: carrot.Leg,
            TargetSpeedToleranceKtas: 15.0,
            EnergyState: ApproachGuidance.ClassifyEnergy(trueAirspeedMps * AirData.MpsToKnots,
                targetKtas, 15.0),
            Gates: gates);
    }

    /// <summary>Seconds ahead the box sits on the path (the predictor uses the same horizon).</summary>
    public double CarrotLeadSeconds_ { get; private set; } = CarrotLeadSeconds;

    /// <summary>
    /// The flight-path predictor: where the jet will be in <paramref name="seconds"/> if it holds
    /// its present bank (coordinated turn rate g·tanφ/V) and flight-path angle. Drawn on the HUD
    /// as a dot; the pilot puts the dot in the box. Pure geometry of the present state.
    /// </summary>
    public static Vec3D Predictor(in AircraftState s, double seconds) {
        double v = Math.Max(s.Speed, 30.0);
        double bank = Math.Clamp(s.Bank, -1.40, 1.40);
        double omega = FlightModel.G0 * Math.Tan(bank) / v;
        double horizontal = v * Math.Cos(s.Gamma);
        double dx, dz;
        if (Math.Abs(omega) < 1e-5) {
            dx = horizontal * seconds * Math.Sin(s.Chi);
            dz = horizontal * seconds * Math.Cos(s.Chi);
        } else {
            double r = horizontal / omega;
            double chi1 = s.Chi + omega * seconds;
            dx = r * (Math.Cos(s.Chi) - Math.Cos(chi1));
            dz = r * (Math.Sin(chi1) - Math.Sin(s.Chi));
        }
        return s.Position + new Vec3D(dx, v * Math.Sin(s.Gamma) * seconds, dz);
    }

    /// Calibrated target the autothrottle should hold right now (the carrot's), or NaN.
    public double AutothrottleTargetCalibratedMps =>
        _armed && !_complete && Carrot.TargetCalibratedMps > 0.0
            ? Carrot.TargetCalibratedMps : double.NaN;

    /// Whether the next graded gate wants the gear down (drives the HUD GEAR cue).
    public bool NextGateNeedsGear =>
        _armed && !_complete && (_nextGate >= _gates.Count || _gates[_nextGate].GearRequired);

    /// "SON 015": the field's first three letters and the runway heading.
    public static string FieldLabel(ConventionalRunway runway) {
        string name = (runway.DisplayName ?? "").Trim();
        string field = name.Length >= 3 ? name[..3].ToUpperInvariant() : name.ToUpperInvariant();
        double deg = runway.HeadingRad * 180.0 / Math.PI;
        int hdg = (int)Math.Round(((deg % 360.0) + 360.0) % 360.0) % 360;
        return $"{field} {hdg:000}";
    }

    static double Horizontal(in Vec3D v) => Math.Sqrt(v.X * v.X + v.Z * v.Z);
    static double WrapPi(double a) => Math.Atan2(Math.Sin(a), Math.Cos(a));
}

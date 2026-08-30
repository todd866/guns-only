using System;
using System.Collections.Generic;

namespace GunsOnly.Sim.Recovery;

/// <summary>
/// A taught Case-I-style carrier recovery. Unlike <see cref="ApproachSolver"/>, this director does
/// not invent a path from the aeroplane's current energy. The pilot joins a stable, named pattern
/// and flies the same sequence every time while the geometry translates with the moving ship.
/// </summary>
public sealed class ConventionalCarrierRecoveryDirector {
    public const string ProfileId = "carrier.case-i.training.v1";

    const double FeetToM = 0.3048;
    const double NmToM = 1852.0;
    const int InitialIndex = 0;
    const int DownwindIndex = 2;
    const int GrooveIndex = 6;

    int _activeIndex;
    bool _active;

    public bool Active => _active;
    public int ActiveIndex => _activeIndex;
    public bool DirtyRequested => _active && _activeIndex >= DownwindIndex;

    public void Reset() {
        _active = false;
        _activeIndex = InitialIndex;
    }

    public ApproachGuidanceState Step(bool active, Carrier carrier,
        in AircraftState player, double trueAirspeedMps, double approachSpeedMps) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (!active) {
            Reset();
            return ApproachGuidanceState.Inactive;
        }
        if (!_active) {
            _active = true;
            _activeIndex = InitialIndex;
        }

        IReadOnlyList<PatternGate> schedule = BuildSchedule(carrier, approachSpeedMps);
        _activeIndex = Math.Clamp(_activeIndex, 0, schedule.Count - 1);
        PatternGate current = schedule[_activeIndex];
        if (_activeIndex < schedule.Count - 1
            && HorizontalDistance(player.Position, current.Position) <= current.CaptureM) {
            _activeIndex++;
            current = schedule[_activeIndex];
        }

        var gates = new List<WorldApproachGate>(schedule.Count - _activeIndex);
        double distanceToGoM = 0.0;
        for (int i = schedule.Count - 2; i >= _activeIndex; i--)
            distanceToGoM += HorizontalDistance(schedule[i].Position, schedule[i + 1].Position);
        double remainingM = distanceToGoM;
        for (int i = _activeIndex; i < schedule.Count; i++) {
            PatternGate gate = schedule[i];
            gates.Add(new WorldApproachGate(
                gate.Id,
                gate.Label,
                gate.Position.X,
                gate.Position.Z,
                gate.Position.Y,
                gate.CaptureM,
                gate.Position.Y,
                gate.TargetSpeedMps * AirData.MpsToKnots,
                remainingM,
                ApproachGuidance.DefaultSpeedToleranceKtas,
                PatternLegFor(i),
                gate.Dirty,
                Active: i == _activeIndex));
            if (i < schedule.Count - 1)
                remainingM -= HorizontalDistance(gate.Position, schedule[i + 1].Position);
        }

        double altitudeErrorM = player.Position.Y - current.Position.Y;
        double speedErrorMps = trueAirspeedMps - current.TargetSpeedMps;
        double power = ApproachSolver.CommandedPower01(
            player.Position.Y, trueAirspeedMps,
            current.Position.Y, current.TargetSpeedMps);
        double directM = HorizontalDistance(player.Position, current.Position);
        return new ApproachGuidanceState(
            GuidanceActive: true,
            Valid: true,
            ExcessEnergyM: Math.Max(0.0, ApproachEnergy.SpecificEnergyM(
                player.Position.Y, trueAirspeedMps) - ApproachEnergy.SpecificEnergyM(
                    current.Position.Y, current.TargetSpeedMps)),
            TrackRequiredM: directM,
            TrackAvailableM: directM,
            Extension: ApproachExtensionKind.None,
            InGroove: _activeIndex >= GrooveIndex,
            NextLabel: current.Label,
            NextAltitudeM: current.Position.Y,
            NextTrueAirspeedMps: current.TargetSpeedMps,
            AltitudeErrorM: altitudeErrorM,
            TrueAirspeedErrorMps: speedErrorMps,
            Power01: power,
            ConventionalPattern: false,
            ActivePatternLeg: PatternLegFor(_activeIndex),
            TargetSpeedToleranceKtas: ApproachGuidance.DefaultSpeedToleranceKtas,
            EnergyState: ApproachGuidance.ClassifyEnergy(
                trueAirspeedMps * AirData.MpsToKnots,
                current.TargetSpeedMps * AirData.MpsToKnots),
            Gates: gates);
    }

    public static IReadOnlyList<PatternGate> BuildSchedule(
        Carrier carrier, double approachSpeedMps) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (!double.IsFinite(approachSpeedMps) || approachSpeedMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(approachSpeedMps));

        Vec3D Ship(double alongM, double crossM, double heightFt) =>
            carrier.Position + carrier.Fwd * alongM + carrier.Right * crossM
                + new Vec3D(0.0, heightFt * FeetToM, 0.0);
        Vec3D Landing(double alongM, double crossM, double heightFt) =>
            carrier.LandingPoint(alongM, crossM, heightFt * FeetToM);
        double downwindEntryMps = Math.Min(250.0 / AirData.MpsToKnots,
            Math.Max(approachSpeedMps * 1.18, 180.0 / AirData.MpsToKnots));

        return new[] {
            // Initial, break and downwind are referenced to BRC (the ship's axis). The last part
            // of the approach turn then bends onto the angled landing-area heading; using the
            // angled course for the whole racetrack would rotate the upwind/downwind legs and
            // teach the wrong sight picture.
            new PatternGate("initial", "INITIAL · 3 NM", Ship(-3.0 * NmToM, 150.0, 800.0),
                450.0, 350.0 / AirData.MpsToKnots, false),
            new PatternGate("break", "BREAK LEFT", Ship(450.0, 0.0, 800.0),
                350.0, 350.0 / AirData.MpsToKnots, false),
            new PatternGate("downwind", "DOWNWIND · DIRTY", Ship(750.0, -1.2 * NmToM, 600.0),
                300.0, downwindEntryMps, true),
            new PatternGate("abeam", "ABEAM · START 180", Ship(-200.0, -1.2 * NmToM, 600.0),
                250.0, approachSpeedMps, true),
            new PatternGate("ninety", "90 · 450 FT", Landing(-1.0 * NmToM, -0.62 * NmToM, 450.0),
                220.0, approachSpeedMps, true),
            new PatternGate("forty_five", "45 · 350 FT", Landing(-0.82 * NmToM, -0.28 * NmToM, 350.0),
                180.0, approachSpeedMps, true),
            new PatternGate("groove", "GROOVE · 3/4 NM", Landing(-0.75 * NmToM, 0.0, 280.0),
                160.0, approachSpeedMps, true),
            new PatternGate("wires", "WIRES · NO FLARE", Landing(-180.0, 0.0, 36.0),
                120.0, approachSpeedMps, true),
        };
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double east = a.X - b.X;
        double north = a.Z - b.Z;
        return Math.Sqrt(east * east + north * north);
    }

    static ApproachPatternLeg PatternLegFor(int index) => index switch {
        <= 1 => ApproachPatternLeg.PatternEntry,
        <= 3 => ApproachPatternLeg.Downwind,
        <= 5 => ApproachPatternLeg.Base,
        6 => ApproachPatternLeg.Final,
        _ => ApproachPatternLeg.Threshold,
    };

    public readonly record struct PatternGate(
        string Id,
        string Label,
        Vec3D Position,
        double CaptureM,
        double TargetSpeedMps,
        bool Dirty);
}

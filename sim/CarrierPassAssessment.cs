namespace GunsOnly.Sim;

public enum CarrierPassPhase { None, Start, Middle, InClose, Ramp, Wires }
public enum CarrierPassGrade { None, Ok, Fair, NoGrade, Cut }

[Flags]
public enum CarrierPassDeviation {
    None = 0,
    Glidepath = 1 << 0,
    Lineup = 1 << 1,
    Airspeed = 1 << 2,
    AngleOfAttack = 1 << 3,
    SinkRate = 1 << 4,
    IgnoredWaveOff = 1 << 5,
    Incomplete = 1 << 6
}

public readonly record struct CarrierPassSample(
    double DistanceToTouchdownM,
    double GlideslopeErrorM,
    double LineupErrorM,
    double IndicatedAirspeedMps,
    double AngleOfAttackErrorRad,
    double SinkRateMps,
    bool LsoWaveOff,
    bool PilotWaveOff);

public readonly record struct CarrierPassPhaseResult(
    CarrierPassPhase Phase,
    CarrierPassGrade Grade,
    CarrierPassDeviation Deviations,
    bool Corrected,
    int Samples);

public readonly record struct CarrierPassResult(
    CarrierPassGrade Grade,
    CarrierPassDeviation Deviations,
    Carrier.TouchdownCorrection PrimaryCorrection,
    bool WaveOffRequired,
    bool WaveOffComplied,
    string PhaseSummary,
    IReadOnlyList<CarrierPassPhaseResult> Phases) {
    public static CarrierPassResult None { get; } = new(
        CarrierPassGrade.None,
        CarrierPassDeviation.None,
        Carrier.TouchdownCorrection.None,
        false,
        false,
        "",
        Array.Empty<CarrierPassPhaseResult>());
}

/// <summary>
/// Deterministic phase-coded carrier-pass assessment. Touchdown physics and touchdown grading remain
/// owned by Carrier; this recorder answers the separate question of whether deviations developed,
/// persisted, or were corrected during the pass and whether a wave-off was obeyed.
/// </summary>
public sealed class CarrierPassRecorder {
    sealed class PhaseAccumulator {
        public int Samples;
        public CarrierPassDeviation Ever;
        public CarrierPassDeviation Final;
    }

    readonly PhaseAccumulator[] _phases = Enumerable.Range(0, 6)
        .Select(_ => new PhaseAccumulator()).ToArray();
    bool _waveOffRequired;
    bool _waveOffComplied;

    public CarrierPassResult Result { get; private set; } = CarrierPassResult.None;

    public void Reset() {
        foreach (PhaseAccumulator phase in _phases) {
            phase.Samples = 0;
            phase.Ever = CarrierPassDeviation.None;
            phase.Final = CarrierPassDeviation.None;
        }
        _waveOffRequired = false;
        _waveOffComplied = false;
        Result = CarrierPassResult.None;
    }

    public static CarrierPassPhase PhaseForDistance(double distanceM) {
        if (!double.IsFinite(distanceM) || distanceM > 1800.0 || distanceM < -30.0)
            return CarrierPassPhase.None;
        if (distanceM > 1000.0) return CarrierPassPhase.Start;
        if (distanceM > 500.0) return CarrierPassPhase.Middle;
        if (distanceM > 180.0) return CarrierPassPhase.InClose;
        if (distanceM > 40.0) return CarrierPassPhase.Ramp;
        return CarrierPassPhase.Wires;
    }

    public void Observe(in CarrierPassSample sample) {
        CarrierPassPhase phase = PhaseForDistance(sample.DistanceToTouchdownM);
        if (phase == CarrierPassPhase.None || Result.Grade != CarrierPassGrade.None) return;
        CarrierPassDeviation deviations = Deviations(sample);
        PhaseAccumulator accumulator = _phases[(int)phase];
        accumulator.Samples++;
        accumulator.Ever |= deviations;
        accumulator.Final = deviations;
        _waveOffRequired |= sample.LsoWaveOff;
        if (_waveOffRequired && sample.PilotWaveOff) _waveOffComplied = true;
    }

    public CarrierPassResult Complete(in Carrier.TouchdownResult touchdown) {
        if (Result.Grade != CarrierPassGrade.None) return Result;
        var phaseResults = new List<CarrierPassPhaseResult>(5);
        CarrierPassDeviation deviations = CarrierPassDeviation.None;
        bool corrected = false;
        int observed = 0;
        for (int index = (int)CarrierPassPhase.Start;
            index <= (int)CarrierPassPhase.Wires; index++) {
            CarrierPassPhase phase = (CarrierPassPhase)index;
            PhaseAccumulator accumulator = _phases[index];
            CarrierPassGrade grade;
            bool phaseCorrected = accumulator.Samples > 0
                && accumulator.Ever != CarrierPassDeviation.None
                && accumulator.Final == CarrierPassDeviation.None;
            if (accumulator.Samples == 0) grade = CarrierPassGrade.None;
            else if (accumulator.Final != CarrierPassDeviation.None)
                grade = CarrierPassGrade.NoGrade;
            else if (phaseCorrected) grade = CarrierPassGrade.Fair;
            else grade = CarrierPassGrade.Ok;
            if (accumulator.Samples > 0) observed++;
            corrected |= phaseCorrected;
            deviations |= accumulator.Ever;
            phaseResults.Add(new CarrierPassPhaseResult(
                phase, grade, accumulator.Ever, phaseCorrected, accumulator.Samples));
        }

        bool ignoredWaveOff = _waveOffRequired && !_waveOffComplied;
        if (ignoredWaveOff) deviations |= CarrierPassDeviation.IgnoredWaveOff;
        if (observed < 4) deviations |= CarrierPassDeviation.Incomplete;
        bool unresolved = phaseResults.Any(phase => phase.Grade == CarrierPassGrade.NoGrade);
        CarrierPassGrade resultGrade = touchdown.Grade == Carrier.TouchdownGrade.Cut
            ? CarrierPassGrade.Cut
            : ignoredWaveOff || observed < 4 || unresolved
                || touchdown.Grade == Carrier.TouchdownGrade.NoGrade
                ? CarrierPassGrade.NoGrade
                : corrected || touchdown.Grade == Carrier.TouchdownGrade.Fair
                    ? CarrierPassGrade.Fair
                    : CarrierPassGrade.Ok;
        Carrier.TouchdownCorrection correction = touchdown.PrimaryCorrection
            != Carrier.TouchdownCorrection.None
            ? touchdown.PrimaryCorrection
            : PrimaryCorrection(deviations);
        string summary = string.Join(" | ", phaseResults.Select(phase =>
            $"{PhaseToken(phase.Phase)}:{GradeToken(phase.Grade)}"));
        Result = new CarrierPassResult(
            resultGrade,
            deviations,
            correction,
            _waveOffRequired,
            _waveOffComplied,
            summary,
            phaseResults.AsReadOnly());
        return Result;
    }

    static CarrierPassDeviation Deviations(in CarrierPassSample sample) {
        CarrierPassDeviation result = CarrierPassDeviation.None;
        double glidepathTolerance = Math.Max(2.0, sample.DistanceToTouchdownM * 0.012);
        double lineupTolerance = Math.Max(2.5, sample.DistanceToTouchdownM * 0.008);
        if (Math.Abs(sample.GlideslopeErrorM) > glidepathTolerance)
            result |= CarrierPassDeviation.Glidepath;
        if (Math.Abs(sample.LineupErrorM) > lineupTolerance)
            result |= CarrierPassDeviation.Lineup;
        if (sample.IndicatedAirspeedMps < Carrier.MinTrapAirspeedMps
            || sample.IndicatedAirspeedMps > Carrier.MaxTrapAirspeedMps)
            result |= CarrierPassDeviation.Airspeed;
        if (Math.Abs(sample.AngleOfAttackErrorRad) > Carrier.MaxOnSpeedAoaErrorRad)
            result |= CarrierPassDeviation.AngleOfAttack;
        if (sample.DistanceToTouchdownM < 500.0
            && sample.SinkRateMps > Carrier.HardTrapSinkMps)
            result |= CarrierPassDeviation.SinkRate;
        return result;
    }

    static Carrier.TouchdownCorrection PrimaryCorrection(CarrierPassDeviation deviations) {
        if (deviations.HasFlag(CarrierPassDeviation.IgnoredWaveOff))
            return Carrier.TouchdownCorrection.WaveOffEarlier;
        if (deviations.HasFlag(CarrierPassDeviation.SinkRate)
            || deviations.HasFlag(CarrierPassDeviation.Glidepath))
            return Carrier.TouchdownCorrection.AddPowerEarlier;
        if (deviations.HasFlag(CarrierPassDeviation.Airspeed))
            return Carrier.TouchdownCorrection.StabilizeIas;
        if (deviations.HasFlag(CarrierPassDeviation.Lineup))
            return Carrier.TouchdownCorrection.EstablishLineupEarlier;
        if (deviations.HasFlag(CarrierPassDeviation.AngleOfAttack))
            return Carrier.TouchdownCorrection.FlyOnSpeedAoa;
        return Carrier.TouchdownCorrection.None;
    }

    static string PhaseToken(CarrierPassPhase phase) => phase switch {
        CarrierPassPhase.InClose => "IN CLOSE",
        _ => phase.ToString().ToUpperInvariant()
    };

    static string GradeToken(CarrierPassGrade grade) => grade switch {
        CarrierPassGrade.NoGrade => "NO GRADE",
        CarrierPassGrade.None => "NOT OBSERVED",
        _ => grade.ToString().ToUpperInvariant()
    };
}

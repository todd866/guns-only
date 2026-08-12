namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Keeps what the circuit was already measuring and throwing away. Before this, the ride
/// runtime computed a lap time and zeroed it at the finish line, so a rider had no time, no
/// best, and no reason to take the next corner better than the last one.
///
/// A lap counts as a record only if it was ridden clean: any wheel off the painted course,
/// or a tip-over, invalidates the lap in progress. The time is still reported — you should
/// see what the dirty lap was worth — it simply cannot become the best.
/// </summary>
public sealed class RideLapTiming
{
    /// <summary>
    /// Four sectors, because PaintedCircuit already authors three gates at 0.25 / 0.50 / 0.75
    /// and reports every crossing. This class consumes that signal; it does not invent one.
    /// </summary>
    public const int SectorCount = 4;

    /// <summary>Elapsed samples kept for the best lap, used to interpolate the live delta.</summary>
    public const int SplitSampleCount = 32;

    readonly List<double> _completedLapSeconds = new();
    readonly double[] _currentSectorSeconds = new double[SectorCount];
    readonly double[] _lastLapSectorSeconds = new double[SectorCount];
    readonly double?[] _bestSectorSeconds = new double?[SectorCount];
    readonly double[] _currentSplitProfile = new double[SplitSampleCount];
    double[]? _bestSplitProfile;
    double _currentLapSeconds;
    double _sectorStartSeconds;
    int _sectorIndex;
    bool _currentLapValid = true;

    /// <summary>Elapsed time on the lap in progress, seconds.</summary>
    public double CurrentLapSeconds => _currentLapSeconds;

    /// <summary>The most recently completed lap, seconds; 0 before the first crossing.</summary>
    public double LastLapSeconds { get; private set; }

    /// <summary>Fastest CLEAN lap, or null until one is ridden.</summary>
    public double? BestLapSeconds { get; private set; }

    /// <summary>False once the lap in progress has been spoilt; resets at the line.</summary>
    public bool CurrentLapValid => _currentLapValid;

    /// <summary>Every completed lap in order, dirty ones included.</summary>
    public IReadOnlyList<double> CompletedLapSeconds => _completedLapSeconds;

    /// <summary>Sector times for the lap in progress; 0 for sectors not yet closed.</summary>
    public IReadOnlyList<double> SectorSeconds => _currentSectorSeconds;

    /// <summary>Sector times from the most recently completed lap.</summary>
    public IReadOnlyList<double> LastLapSectorSeconds => _lastLapSectorSeconds;

    /// <summary>Best time per sector, each independent of the lap it came from.</summary>
    public IReadOnlyList<double?> BestSectorSeconds => _bestSectorSeconds;

    /// <summary>
    /// Seconds ahead (negative) or behind (positive) the best lap AT THE SAME POINT on the
    /// circuit — the number a rider actually chases. Null until a clean lap exists.
    /// </summary>
    public double? DeltaToBestSeconds(double progressM, double lapLengthM)
    {
        if (_bestSplitProfile is null) return null;
        if (!double.IsFinite(progressM) || !double.IsFinite(lapLengthM) || lapLengthM <= 0.0)
            return null;

        double fraction = Math.Clamp(progressM / lapLengthM, 0.0, 1.0);
        double scaled = fraction * (SplitSampleCount - 1);
        int lower = (int)Math.Floor(scaled);
        int upper = Math.Min(lower + 1, SplitSampleCount - 1);
        double blend = scaled - lower;
        double bestElapsed = _bestSplitProfile[lower] * (1.0 - blend)
            + _bestSplitProfile[upper] * blend;
        return _currentLapSeconds - bestElapsed;
    }

    /// <param name="timingActive">
    /// The runtime's existing arm condition — on track and above the timing start speed.
    /// </param>
    public void Advance(
        in PaintedCircuitQueryResult sample,
        bool timingActive,
        bool tippedOver,
        double dtSeconds,
        double lapLengthM = 0.0)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));

        if (!sample.OnTrack || tippedOver)
            _currentLapValid = false;
        if (timingActive)
            _currentLapSeconds += dtSeconds;

        // Sample the elapsed time along the lap so a future lap can be compared against this
        // one at the same place. Fixed-size: a split profile, never a position recording.
        if (lapLengthM > 0.0 && double.IsFinite(sample.ProgressM))
        {
            double fraction = Math.Clamp(sample.ProgressM / lapLengthM, 0.0, 1.0);
            int slot = (int)Math.Round(fraction * (SplitSampleCount - 1));
            for (int index = slot; index < SplitSampleCount; index++)
                _currentSplitProfile[index] = _currentLapSeconds;
        }

        if (sample.SectorCrossed >= 0 && _sectorIndex < SectorCount - 1)
        {
            _currentSectorSeconds[_sectorIndex] = _currentLapSeconds - _sectorStartSeconds;
            _sectorStartSeconds = _currentLapSeconds;
            _sectorIndex++;
        }

        if (!sample.CrossedStartFinish)
            return;

        double lapSeconds = _currentLapSeconds;
        _currentSectorSeconds[_sectorIndex] = lapSeconds - _sectorStartSeconds;
        LastLapSeconds = lapSeconds;
        _completedLapSeconds.Add(lapSeconds);
        Array.Copy(_currentSectorSeconds, _lastLapSectorSeconds, SectorCount);
        if (_currentLapValid)
        {
            for (int sector = 0; sector < SectorCount; sector++)
            {
                double sectorSeconds = _currentSectorSeconds[sector];
                if (sectorSeconds <= 0.0) continue;
                if (_bestSectorSeconds[sector] is null
                    || sectorSeconds < _bestSectorSeconds[sector]!.Value)
                    _bestSectorSeconds[sector] = sectorSeconds;
            }
            if (BestLapSeconds is null || lapSeconds < BestLapSeconds.Value)
            {
                BestLapSeconds = lapSeconds;
                _bestSplitProfile ??= new double[SplitSampleCount];
                Array.Copy(_currentSplitProfile, _bestSplitProfile, SplitSampleCount);
            }
        }
        StartFreshLap();
    }

    void StartFreshLap()
    {
        _currentLapSeconds = 0.0;
        _currentLapValid = true;
        _sectorStartSeconds = 0.0;
        _sectorIndex = 0;
        Array.Clear(_currentSectorSeconds);
        Array.Clear(_currentSplitProfile);
    }

    /// <summary>Clears the lap in progress without forgetting the best or the history.</summary>
    public void AbandonCurrentLap() => StartFreshLap();

    /// <summary>
    /// Restores a best carried over from a previous session so the delta chases the rider's
    /// real record, not just today's. Refused unless the profile is the exact expected size —
    /// a short profile would interpolate against garbage and show a confident wrong number.
    /// </summary>
    public bool SeedBest(double bestLapSeconds, IReadOnlyList<double> splitProfile)
    {
        if (!double.IsFinite(bestLapSeconds) || bestLapSeconds <= 0.0) return false;
        if (splitProfile is null || splitProfile.Count != SplitSampleCount) return false;
        foreach (double sample in splitProfile)
            if (!double.IsFinite(sample)) return false;
        if (BestLapSeconds is not null && BestLapSeconds.Value <= bestLapSeconds) return false;

        BestLapSeconds = bestLapSeconds;
        _bestSplitProfile ??= new double[SplitSampleCount];
        for (int index = 0; index < SplitSampleCount; index++)
            _bestSplitProfile[index] = splitProfile[index];
        return true;
    }

    /// <summary>The best lap's split profile, for persisting; empty when there is no best.</summary>
    public IReadOnlyList<double> BestSplitProfile =>
        _bestSplitProfile ?? Array.Empty<double>();
}

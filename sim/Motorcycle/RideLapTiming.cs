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
    readonly List<double> _completedLapSeconds = new();
    double _currentLapSeconds;
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

    /// <param name="timingActive">
    /// The runtime's existing arm condition — on track and above the timing start speed.
    /// </param>
    public void Advance(
        in PaintedCircuitQueryResult sample,
        bool timingActive,
        bool tippedOver,
        double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));

        if (!sample.OnTrack || tippedOver)
            _currentLapValid = false;
        if (timingActive)
            _currentLapSeconds += dtSeconds;
        if (!sample.CrossedStartFinish)
            return;

        double lapSeconds = _currentLapSeconds;
        LastLapSeconds = lapSeconds;
        _completedLapSeconds.Add(lapSeconds);
        if (_currentLapValid && (BestLapSeconds is null || lapSeconds < BestLapSeconds.Value))
            BestLapSeconds = lapSeconds;
        _currentLapSeconds = 0.0;
        _currentLapValid = true;
    }

    /// <summary>Clears the lap in progress without forgetting the best or the history.</summary>
    public void AbandonCurrentLap()
    {
        _currentLapSeconds = 0.0;
        _currentLapValid = true;
    }
}

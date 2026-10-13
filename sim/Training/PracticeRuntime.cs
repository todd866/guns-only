namespace GunsOnly.Sim.Training;

public enum PracticeExercise { None, Valley, Gunnery, Recovery }
public enum PracticeStatus { Ready, Active, Completed, Lost, TimeLimit, Ended }

/// A bounded training attempt. These are exercise results, never campaign victories or aircraft
/// qualifications. Observations come from the same physical simulation as a full sortie.
public sealed class PracticeRuntime(PracticeExercise exercise) {
    public const double CompletionPresentationSeconds = 1.5;
    double _attemptStartSeconds;
    double _elapsedSeconds;
    double? _outcomeElapsedSeconds;
    public PracticeExercise Exercise { get; } = exercise;
    public PracticeStatus Status { get; private set; } = PracticeStatus.Ready;
    public double TimeLimitSeconds => Exercise == PracticeExercise.Recovery ? 600 : 180;
    public bool Completed => Status == PracticeStatus.Completed;
    public double AttemptStartSeconds => _attemptStartSeconds;
    /// Duration shown to the result/logbook. Once the objective is earned it stays at the
    /// objective tick while the physical flight continues through the presentation interval.
    public double ElapsedSeconds => _outcomeElapsedSeconds ?? _elapsedSeconds;
    public bool ResultReady => Status == PracticeStatus.Completed
        && _outcomeElapsedSeconds is { } completedAt
        && _elapsedSeconds - completedAt >= CompletionPresentationSeconds;

    public void Begin(double attemptStartSeconds = 0.0) {
        if (Status != PracticeStatus.Ready) return;
        _attemptStartSeconds = attemptStartSeconds;
        _elapsedSeconds = 0.0;
        _outcomeElapsedSeconds = null;
        Status = PracticeStatus.Active;
    }

    public void Observe(double elapsedSeconds, bool ownshipLost, bool valleyPassed,
        int gunHits, bool physicallyRecovered, bool sessionFinished) {
        if (!double.IsFinite(elapsedSeconds) || elapsedSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(elapsedSeconds));
        if (Status == PracticeStatus.Completed) {
            _elapsedSeconds = Math.Max(_elapsedSeconds, elapsedSeconds);
            if (ownshipLost) {
                Status = PracticeStatus.Lost;
                _outcomeElapsedSeconds = elapsedSeconds;
            }
            return;
        }
        if (Status != PracticeStatus.Active) return;
        _elapsedSeconds = elapsedSeconds;
        // A hit or a gate crossed on a fatal tick cannot grant a clean training completion.
        if (ownshipLost) { Status = PracticeStatus.Lost; return; }
        bool accomplished = Exercise switch {
            PracticeExercise.Valley => valleyPassed,
            PracticeExercise.Gunnery => gunHits >= 2,
            PracticeExercise.Recovery => physicallyRecovered,
            _ => false,
        };
        if (accomplished) {
            _outcomeElapsedSeconds = elapsedSeconds;
            Status = PracticeStatus.Completed;
        }
        else if (sessionFinished) Status = PracticeStatus.Ended;
        else if (elapsedSeconds >= TimeLimitSeconds) {
            _outcomeElapsedSeconds = elapsedSeconds;
            Status = PracticeStatus.TimeLimit;
        }
    }
}

namespace GunsOnly.Sim.Training;

public enum PracticeExercise { None, Valley, Gunnery, Recovery }
public enum PracticeStatus { Ready, Active, Completed, Lost, TimeLimit, Ended }

/// A bounded training attempt. These are exercise results, never campaign victories or aircraft
/// qualifications. Observations come from the same physical simulation as a full sortie.
public sealed class PracticeRuntime(PracticeExercise exercise) {
    public PracticeExercise Exercise { get; } = exercise;
    public PracticeStatus Status { get; private set; } = PracticeStatus.Ready;
    public double TimeLimitSeconds => Exercise == PracticeExercise.Recovery ? 600 : 180;
    public bool Completed => Status == PracticeStatus.Completed;

    public void Begin() {
        if (Status == PracticeStatus.Ready) Status = PracticeStatus.Active;
    }

    public void Observe(double elapsedSeconds, bool ownshipLost, bool valleyPassed,
        int gunHits, bool physicallyRecovered, bool sessionFinished) {
        if (Status != PracticeStatus.Active) return;
        // A hit or a gate crossed on a fatal tick cannot grant a clean training completion.
        if (ownshipLost) { Status = PracticeStatus.Lost; return; }
        bool accomplished = Exercise switch {
            PracticeExercise.Valley => valleyPassed,
            PracticeExercise.Gunnery => gunHits >= 2,
            PracticeExercise.Recovery => physicallyRecovered,
            _ => false,
        };
        if (accomplished) Status = PracticeStatus.Completed;
        else if (sessionFinished) Status = PracticeStatus.Ended;
        else if (elapsedSeconds >= TimeLimitSeconds) Status = PracticeStatus.TimeLimit;
    }
}

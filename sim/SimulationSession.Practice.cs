using GunsOnly.Sim.Training;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public PracticeRuntime? Practice { get; private set; }

    void StagePractice() => Practice = _beat.Practice == PracticeExercise.None
        ? null : new PracticeRuntime(_beat.Practice);

    void BeginPractice() {
        Practice?.Begin(TimeSeconds);
        if (Practice is not null) {
            // The live completion hold can include further physical hits or a kill. Training
            // never submits a combat engagement to the learner or advances the sortie ramp.
            _engagementCounters.Active = false;
            ShowTransition("PRACTICE · ONE OBJECTIVE", 1800);
        }
        if (Practice?.Exercise == PracticeExercise.ShortFinal)
            _conventionalRunwayPatternRecovery.StartOnFinal();
        if (Practice?.Exercise is not (PracticeExercise.Recovery or PracticeExercise.ShortFinal)) return;
        // Training starts in the recovery procedure with no combat actor or relief fiction.
        // Physical touchdown and full stop still belong to the ordinary runway model.
        _returnToBaseReason = MissionRtbReason.PilotKnockItOff;
        _combatHandoffPhase = GunsOnly.Sim.Doctrine.CombatHandoffPhase.PlayerRtb;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        UpdateApproachGuidance();
    }

    void ObservePractice() {
        if (Practice is not { } practice) return;
        practice.Observe(Math.Max(0.0, TimeSeconds - practice.AttemptStartSeconds),
            _playerTerminalState != AircraftTerminalState.Flying,
            _firstRunValleyRuntime?.WeaponsCold == false,
            SortiePlayerHits,
            _conventionalRunwayRecovery is {
                Phase: RunwayRecoveryPhase.Recovered,
                Touchdown.Contact: true, Touchdown.Survivable: true },
            Lifecycle == LifecycleState.Finished);
        // A damaged aircraft retains the normal physical terminal sequence. Only a live,
        // accomplished or timed-out exercise can terminate here, with no sortie-victory claim.
        if (Lifecycle != LifecycleState.Active
            || practice.Status is not (PracticeStatus.Completed or PracticeStatus.TimeLimit)
            || (practice.Status == PracticeStatus.Completed && !practice.ResultReady))
            return;
        _outcome = _pendingOutcome = SortieOutcome.Discontinued;
        EmitEvent(SessionEventType.SortieFinished, CombatRole.None, CombatRole.None,
            outcome: _outcome);
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
        _accumulatorSeconds = 0;
    }
}

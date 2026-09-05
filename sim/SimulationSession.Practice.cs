using GunsOnly.Sim.Training;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    public PracticeRuntime? Practice { get; private set; }

    void StagePractice() => Practice = _beat.Practice == PracticeExercise.None
        ? null : new PracticeRuntime(_beat.Practice);

    void BeginPractice() {
        Practice?.Begin();
        if (Practice is not null) ShowTransition("PRACTICE · ONE OBJECTIVE", 1800);
        if (Practice?.Exercise != PracticeExercise.Recovery) return;
        // Training starts in the recovery procedure with no combat actor or relief fiction.
        // Physical touchdown and full stop still belong to the ordinary runway model.
        _returnToBaseReason = MissionRtbReason.PilotKnockItOff;
        _combatHandoffPhase = GunsOnly.Sim.Doctrine.CombatHandoffPhase.PlayerRtb;
        _nextOpponentSpawnAtMs = double.NegativeInfinity;
        UpdateApproachGuidance();
    }

    void ObservePractice() {
        if (Practice is not { } practice) return;
        practice.Observe(TimeSeconds,
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
            || practice.Status is not (PracticeStatus.Completed or PracticeStatus.TimeLimit))
            return;
        _outcome = _pendingOutcome = SortieOutcome.Discontinued;
        EmitEvent(SessionEventType.SortieFinished, CombatRole.None, CombatRole.None,
            outcome: _outcome);
        ClearHeldInput();
        Lifecycle = LifecycleState.Finished;
        _accumulatorSeconds = 0;
    }
}

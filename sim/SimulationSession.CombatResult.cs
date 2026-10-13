using System.Linq;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim;

// Partial of SimulationSession: the finite F-22 combat result, kept separate from aircraft
// recovery, plus positive physical-hit evidence for the Option A ramp.
public sealed partial class SimulationSession {
    int _sortieContractRung = -1;
    PilotSkill _sortieOpponentSkill;
    BanditMount _sortieOpponentMount;
    int _sortieOpponentCount;
    int _directorHitsCreditedThisEngagement;

    /// <summary>
    /// The finite F-22 combat task is done while the pilot is still flying: either the billed
    /// engagement cap was splashed before any knock-it-off (visual merge), or the Kestrel valley
    /// engagement was won by the player before handoff. This is a COMBAT result only. It never implies a landing; the runway stop
    /// remains the separate recovery record (ConventionalRtbRecoveryCompleted).
    /// </summary>
    public bool FiniteCombatComplete =>
        _billedSortieComplete
        || (_beat.FirstRunValley is not null
            && _beat.Practice == PracticeExercise.None
            // Completed player reports persist through recovery and reset with the sortie.
            // Relief clearing an interrupted engagement can never create a player win.
            && EngagementsWon > 0);

    /// Engagements the finite F-22 task bills: the valley pair is one engagement, the visual merge
    /// is ContinuousCombat.MaximumEngagements. Zero for every other beat.
    public int FiniteEngagementCap =>
        !UsesDifficultyRamp(_beat) || _beat.Practice != PracticeExercise.None ? 0
        : _bfmSortieStartIndex >= 0 && BfmLesson.Get(_bfmSortieStartIndex).Defensive ? 1
        : _beat.FirstRunValley is not null ? 1
        : _beat.ContinuousCombat?.MaximumEngagements ?? 0;

    /// Completed engagements won this sortie (handoff-interrupted fights are not wins).
    public int EngagementsWon => _engagementReports.Count(static report =>
        (report.EndReason == EngagementEndReason.CombatResult
            || report.EndReason == EngagementEndReason.DefensiveSuccess)
        && report.Outcome == SortieOutcome.Victory);

    /// The rung this sortie was staged at. Held for the whole sortie, even when a hit or kill
    /// earns a higher rung for the NEXT one. -1 outside the F-22 ramp.
    public int SortieContractRung => _sortieContractRung;
    public PilotSkill SortieOpponentSkill => _sortieOpponentSkill;
    public BanditMount SortieOpponentMount => _sortieOpponentMount;
    public int SortieOpponentCount => _sortieOpponentCount;
    public int DirectorHits => _fightDirector.Hits;
    public int DirectorKills => _fightDirector.Kills;
    /// The actual opening after next-sortie restore, including boss/release pacing.
    public SpawnSpec EarnedOpening => _fightDirector.PreviewEarnedOpening();

    void CaptureSortieContract(bool stagesOpponent, SpawnSpec? openingSpawn) {
        _directorHitsCreditedThisEngagement = 0;
        _bfmLessonIndex = openingSpawn?.LessonIndex ?? -1;
        _bfmSortieStartIndex = _bfmLessonIndex;
        _bfmLessonOutcome = "open";
        _defensiveSuccess.Reset();
        bool ramp = UsesDifficultyRamp(_beat) && _beat.Practice == PracticeExercise.None;
        _sortieContractRung = ramp ? _fightDirector.Rung : -1;
        SpawnSpec? spawn = openingSpawn ?? _sortieOpeningSpawn;
        _sortieOpponentSkill = spawn?.Skill ?? _beat.BanditSkill;
        _sortieOpponentMount = spawn?.Mount ?? BanditMount.Baseline;
        _sortieOpponentCount = stagesOpponent ? 1 + _wingmen.Count : 0;
    }

    /// Record positive physical-hit evidence on the tick it is banked. Ramp sorties only,
    /// never practice, only inside a live engagement (not after a knock-it-off).
    internal void CreditDirectorHits(int newHits, double timeToFirstHitSeconds) {
        if (newHits <= 0
            || !UsesDifficultyRamp(_beat)
            || _beat.Practice != PracticeExercise.None
            || !_engagementCounters.Active
            || CombatHandoffRequested)
            return;
        // The current sortie's assist contract is frozen. The valley reads the live director
        // rung, so pin it before the credit can move that rung mid-fight.
        _sortiePitchAssist ??= _fightDirector.PitchAssist;
        _sortiePitchAssistRung ??= _fightDirector.Rung;
        _fightDirector.CreditPhysicalHits(newHits, timeToFirstHitSeconds);
        _directorHitsCreditedThisEngagement += newHits;
    }

    int TakeDirectorHitsCreditedThisEngagement() {
        int credited = _directorHitsCreditedThisEngagement;
        _directorHitsCreditedThisEngagement = 0;
        return credited;
    }
}

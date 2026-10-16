using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    readonly DefensiveSuccessObserver _defensiveSuccess = new();
    int _bfmLessonIndex = -1;
    int _bfmSortieStartIndex = -1;
    string _bfmLessonOutcome = "open";
    public int BfmLessonIndex => _bfmLessonIndex;
    public int BfmNextLessonIndex => _fightDirector.LessonIndex;
    public string BfmLessonId => _bfmLessonIndex >= 0 ? BfmLesson.Get(_bfmLessonIndex).Id : "";
    public string BfmNextLessonId => BfmNextLessonIndex >= 0 ? BfmLesson.Get(BfmNextLessonIndex).Id : "";
    public string BfmLessonOutcome => _bfmLessonOutcome;
    public string BfmLessonCriterion => _bfmLessonIndex >= 0 ? BfmLesson.Get(_bfmLessonIndex).Criterion : "";
    public string BfmCorrection => _bfmLessonIndex >= 0 && _bfmLessonOutcome == "failed"
        ? BfmLesson.Get(_bfmLessonIndex).Correction : "";

    void StartBfmLesson() {
        _bfmLessonIndex = LastDirectorSpawn?.LessonIndex ?? -1;
        if (_engagementNumber == 1) _bfmSortieStartIndex = _bfmLessonIndex;
        _bfmLessonOutcome = "open";
        _defensiveSuccess.Reset();
    }

    void ObserveBfmResult(in EngagementReport report) {
        if (_bfmLessonIndex < 0) return;
        _bfmLessonOutcome = report.Outcome == SortieOutcome.Victory && report.GunKills > 0
            ? "passed" : "failed";
    }

    void ObserveDefensiveLesson() {
        if (_bfmLessonIndex < 0 || !_engagementCounters.Active || CombatHandoffRequested)
            return;
        BfmLesson lesson = BfmLesson.Get(_bfmLessonIndex);
        if (!lesson.Defensive) return;
        if (!_defensiveSuccess.Step(_player.State, _bandit.State, _opponentGun.GunSolution,
            _playerTerminalState == AircraftTerminalState.Flying && PrimaryOpponentAlive,
            _engagementCounters.DurationSeconds, lesson.SurviveSeconds, FixedDeltaSeconds,
            lesson.Index, _gunKill.GunSolution)) return;

        // A completed exercise is NOT a destroyed aircraft or a gun kill. Quarantine the
        // training success from the kill-based learner, while retaining an engagement record.
        EngagementReport report = BuildEngagementReport(SortieOutcome.Victory,
            EngagementEndReason.DefensiveSuccess);
        _engagementReports.Add(report);
        _engagementCounters.Active = false;
        TakeDirectorHitsCreditedThisEngagement();
        _fightDirector.CompleteDefensiveLesson();
        _bfmLessonOutcome = "passed";
        if (EscalatingWavesEnabled) {
            // Release the surviving exercise opponent without inventing a kill. Its actor stays
            // in the detached presentation; the next wave receives a new identity and magazine.
            _opponentTerminalState = AircraftTerminalState.SimulationBounded;
            _nextOpponentSpawnAtMs = _simTimeMs + _beat.ContinuousCombat!.ReplacementDelaySeconds * 1000;
            OnWaveWon();
            return;
        }
        _billedSortieComplete = true;
        RequestCombatHandoff(MissionRtbReason.PilotKnockItOff);
    }
}

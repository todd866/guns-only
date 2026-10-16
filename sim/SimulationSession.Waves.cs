using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

namespace GunsOnly.Sim;

public sealed partial class SimulationSession {
    int _sortieSeed;
    SortieWave? _incomingWave;
    double? _incomingWaveBearing;
    double _rtbBounceAt = double.PositiveInfinity;
    bool _rtbBounceActive, _rtbBounceSpawned;
    double _waveScoreMultiplier = 1;
    double _combatScore;

    public bool EscalatingWavesEnabled => IsVisualMergeSortie(_beat)
        && _beat.FirstRunValley is null && _beat.Practice == PracticeExercise.None
        && _beat.ContinuousCombat is { EscalatingWaves: true };
    public double? IncomingWaveBearingRad => _incomingWaveBearing;
    public bool RtbBounceActive => _rtbBounceActive && LiveOpponentCount > 0 && PlayerAlive;
    public bool RtbBounceScheduled => double.IsFinite(_rtbBounceAt);
    public bool RtbBounceSpawned => _rtbBounceSpawned;
    public double WaveScoreMultiplier => _waveScoreMultiplier;
    public double CombatScore => _combatScore;
    // RTB still owns navigation during an interception, but both combatants may defend/fire.
    bool RecoveryCeasefire => (CombatHandoffRequested || PlayerRtbActive) && !RtbBounceActive;

    public void ConfigureSortieSeed(int seed) {
        if (Lifecycle != LifecycleState.Ready)
            throw new InvalidOperationException("Set the sortie seed before Begin.");
        _sortieSeed = seed;
    }

    void ResetSortieWaves() {
        _incomingWave = null;
        _incomingWaveBearing = null;
        _rtbBounceAt = double.PositiveInfinity;
        _rtbBounceActive = _rtbBounceSpawned = false;
        _waveScoreMultiplier = 1;
        _combatScore = 0;
    }

    void OnWaveWon() {
        if (!EscalatingWavesEnabled || CombatHandoffRequested) return;
        _combatScore += 100 * _waveScoreMultiplier;
        if (EngagementsWon >= 2) _billedSortieComplete = true;
        if (_engagementNumber < 2) return;
        SortieWave wave = _fightDirector.NextWave(_engagementNumber + 1, _sortieSeed);
        _incomingWave = wave;
        _waveScoreMultiplier = wave.ScoreMultiplier;
        _incomingWaveBearing = (_player.State.Chi + wave.BearingOffsetRad + 2 * Math.PI) % (2 * Math.PI);
        _nextOpponentSpawnAtMs = _simTimeMs + wave.DelaySeconds * 1000;
        double bearing = _incomingWaveBearing.Value * 180 / Math.PI;
        // The off-stage contact closes during the warning interval. The flown actor takes over
        // at RangeM. This is an authored ingress, never a change to the player's aircraft.
        double miles = (wave.RangeM + 250 * wave.DelaySeconds) / 1852;
        ShowTransition(FormattableString.Invariant(
            $"NEW CONTACT · {bearing:000}° · {miles:0} NM · W{wave.Number} ×{wave.ScoreMultiplier:0.0}"),
            wave.DelaySeconds * 1000);
    }

    void ScheduleRtbBounce() {
        _incomingWave = null;
        _incomingWaveBearing = null;
        if (EscalatingWavesEnabled && FightDirector.RtbBounceForSeed(_sortieSeed))
            _rtbBounceAt = TimeSeconds + 30 + FightDirector.WaveDraw(_sortieSeed, 0, 10) % 16;
    }

    void AdvanceSortieWaves() {
        if (!EscalatingWavesEnabled || !PlayerAlive) return;
        if (_rtbBounceActive && LiveOpponentCount == 0) {
            _rtbBounceActive = false;
            ShowTransition("CONTACT DOWN · CONTINUE RTB", 3200);
        }
        if (!RtbBounceScheduled || !PlayerRtbActive || TimeSeconds < _rtbBounceAt) return;
        // Finish any existing handoff first. The bounce is a NEW lone attacker, not a reversal
        // of the ceasefire or custody of the original wave. Never spawn inside the final approach.
        if (F22RtbOnFinal()) { _rtbBounceAt = double.PositiveInfinity; return; }
        if (LiveOpponentCount > 0 || _retiredOpponentGuns.Count > 0
            || _reliefFighter?.Gun?.RoundsInFlight.Count > 0
            || _reliefTargetingOpponentGuns.Values.Any(g => g.Gun.RoundsInFlight.Count > 0)) return;
        _rtbBounceAt = double.PositiveInfinity;
        _rtbBounceActive = _rtbBounceSpawned = true;
        // The relief mission is over; its target custody must not capture this new interceptor.
        _reliefFighter = null;
        _reliefThreatStateValid = false;
        _reliefTargetingOpponentGuns.Clear();
        var spawn = new SpawnSpec(PilotSkill.Ace,
            (int)(FightDirector.WaveDraw(_sortieSeed, 0, 11) % 3), false, "RTB interception",
            Mount: BanditMount.Baseline, Committed: true,
            ApproachBearingRad: _player.State.Chi + Math.PI * .8,
            ApproachRangeM: 1800);
        _waveScoreMultiplier = 1;
        StageContinuousOpponent(spawn, _engagementNumber + 1);
        UpdateTimeCompressionDecision();
        ShowTransition("BOGEY · CHECK SIX", 5000);
    }
}

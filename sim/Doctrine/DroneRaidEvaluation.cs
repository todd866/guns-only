namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// One-opponent-kernel contract for a defensive raid exercise. Targets are presented as a staged
/// stream: each new raider becomes authoritative only after the previous one is mission-killed or
/// crosses the defended radius. This is deliberately explicit rather than pretending the current
/// simulation can integrate several simultaneous aircraft.
/// </summary>
public sealed class DroneRaidScenarioDefinition {
    readonly AircraftState[] _targets;

    public DroneRaidScenarioDefinition(Vec3D defendedPoint, double defendedRadiusM,
        IEnumerable<AircraftState> targets,
        double desiredNeutralizationSeconds = 25.0,
        double noCreditNeutralizationSeconds = 60.0,
        double desiredRoundsPerKill = 20.0,
        double noCreditRoundsPerKill = 80.0) {
        ArgumentNullException.ThrowIfNull(targets);
        _targets = targets.ToArray();
        if (_targets.Length == 0)
            throw new ArgumentException("A drone raid needs at least one target.", nameof(targets));
        if (!double.IsFinite(defendedRadiusM) || defendedRadiusM <= 0.0
            || !double.IsFinite(desiredNeutralizationSeconds)
            || desiredNeutralizationSeconds <= 0.0
            || !double.IsFinite(noCreditNeutralizationSeconds)
            || noCreditNeutralizationSeconds <= desiredNeutralizationSeconds
            || !double.IsFinite(desiredRoundsPerKill) || desiredRoundsPerKill <= 0.0
            || !double.IsFinite(noCreditRoundsPerKill)
            || noCreditRoundsPerKill <= desiredRoundsPerKill)
            throw new ArgumentOutOfRangeException(nameof(defendedRadiusM));

        DefendedPoint = defendedPoint;
        DefendedRadiusM = defendedRadiusM;
        DesiredNeutralizationSeconds = desiredNeutralizationSeconds;
        NoCreditNeutralizationSeconds = noCreditNeutralizationSeconds;
        DesiredRoundsPerKill = desiredRoundsPerKill;
        NoCreditRoundsPerKill = noCreditRoundsPerKill;
    }

    public const string ResolutionMode = "STAGED_STREAM_MISSION_KILL";
    public Vec3D DefendedPoint { get; }
    public double DefendedRadiusM { get; }
    public IReadOnlyList<AircraftState> Targets => _targets;
    public double DesiredNeutralizationSeconds { get; }
    public double NoCreditNeutralizationSeconds { get; }
    public double DesiredRoundsPerKill { get; }
    public double NoCreditRoundsPerKill { get; }
}

/// <summary>
/// Decision-oriented scoring for the defensive intercept. Sixty percent of the score is target
/// containment (including a twenty-point zero-leaker bonus), twenty-five percent is measured
/// time-to-neutralize, and fifteen percent is fire discipline. A miss or an arbitrary camera cone
/// never awards a kill: neutralizations are fed only from GunKill's physical projectile result.
/// </summary>
public sealed class DroneRaidEvaluation {
    const int ContainmentMaximum = 60;
    const int ZeroLeakerBonus = 20;
    const int TimeMaximum = 25;
    const int FireDisciplineMaximum = 15;

    readonly DroneRaidScenarioDefinition _definition;
    readonly List<double> _neutralizationTimes = new();
    double _targetStartedAtSeconds;
    int _roundsAtMissionStart;
    int _latestCumulativeRounds;

    public DroneRaidEvaluation(DroneRaidScenarioDefinition definition) {
        _definition = definition ?? throw new ArgumentNullException(nameof(definition));
    }

    public DroneRaidScenarioDefinition Definition => _definition;
    public bool Started { get; private set; }
    public bool Finished { get; private set; }
    public bool OwnshipLost { get; private set; }
    public int TotalTargets => _definition.Targets.Count;
    public int TargetsResolved => Kills + Leakers;
    public int Kills { get; private set; }
    public int Leakers { get; private set; }
    public bool ZeroLeakers => Finished && !OwnshipLost
        && TargetsResolved == TotalTargets && Leakers == 0;
    public int ActiveTargetNumber => Finished ? TotalTargets
        : Math.Min(TotalTargets, TargetsResolved + 1);
    public double ActiveTargetElapsedSeconds { get; private set; }
    public double TargetTimeToLeakSeconds { get; private set; } = double.PositiveInfinity;
    public bool TailChaseGeometry { get; private set; }
    public string Cue { get; private set; } = "DEFEND THE INNER RING · INTERCEPT THE RAID TRACK";
    public double AverageTimeToNeutralizeSeconds => _neutralizationTimes.Count == 0
        ? 0.0 : _neutralizationTimes.Average();
    public double RoundsPerKill => Kills == 0 ? 0.0
        : Math.Max(0, _latestCumulativeRounds - _roundsAtMissionStart) / (double)Kills;

    public int ContainmentScore {
        get {
            int perTargetPool = ContainmentMaximum - ZeroLeakerBonus;
            int resolvedScore = (int)Math.Round(
                perTargetPool * Kills / (double)TotalTargets);
            return resolvedScore + (Finished && ZeroLeakers ? ZeroLeakerBonus : 0);
        }
    }

    public int TimeScore => Kills == 0 ? 0 : (int)Math.Round(TimeMaximum * NormalizeLowerIsBetter(
        AverageTimeToNeutralizeSeconds,
        _definition.DesiredNeutralizationSeconds,
        _definition.NoCreditNeutralizationSeconds));

    public int FireDisciplineScore => Kills == 0 ? 0 : (int)Math.Round(
        FireDisciplineMaximum * NormalizeLowerIsBetter(
            RoundsPerKill,
            _definition.DesiredRoundsPerKill,
            _definition.NoCreditRoundsPerKill));

    public int Score => Math.Clamp(
        ContainmentScore + TimeScore + FireDisciplineScore, 0, MaximumScore);
    public int MaximumScore => ContainmentMaximum + TimeMaximum + FireDisciplineMaximum;

    public void Begin(double timeSeconds, int cumulativeRoundsFired) {
        if (Started) return;
        ValidateTimeAndRounds(timeSeconds, cumulativeRoundsFired);
        Started = true;
        _targetStartedAtSeconds = timeSeconds;
        _roundsAtMissionStart = cumulativeRoundsFired;
        _latestCumulativeRounds = cumulativeRoundsFired;
    }

    public void Step(double timeSeconds, in AircraftState player, in AircraftState target,
        bool gunSolution, int cumulativeRoundsFired) {
        if (!Started || Finished) return;
        ValidateTimeAndRounds(timeSeconds, cumulativeRoundsFired);
        _latestCumulativeRounds = Math.Max(_latestCumulativeRounds, cumulativeRoundsFired);
        ActiveTargetElapsedSeconds = Math.Max(0.0, timeSeconds - _targetStartedAtSeconds);

        Vec3D targetToDefended = Horizontal(_definition.DefendedPoint - target.Position);
        double targetDistance = targetToDefended.Length;
        Vec3D targetVelocity = Horizontal(target.VelocityVector());
        double inwardSpeed = targetDistance < 1e-6 ? 0.0
            : targetVelocity.Dot(targetToDefended * (1.0 / targetDistance));
        TargetTimeToLeakSeconds = inwardSpeed <= 0.1 ? double.PositiveInfinity
            : Math.Max(0.0, targetDistance - _definition.DefendedRadiusM) / inwardSpeed;

        double playerDefendedDistance = Horizontal(
            player.Position - _definition.DefendedPoint).Length;
        TailChaseGeometry = playerDefendedDistance > targetDistance + 250.0;
        double rangeM = Geometry.Range(player, target);
        Cue = TargetTimeToLeakSeconds < 12.0
            ? "LEAKER CRITICAL · TAKE THE FIRST VALID SHOT"
            : TailChaseGeometry
                ? "STOP TAIL CHASE · CUT INSIDE THE RAID TRACK"
                : gunSolution
                    ? "VALID SOLUTION · SHORT BURST · CONFIRM EFFECT"
                    : rangeM > 1800.0
                        ? "LEAD THE RAID TRACK · FLY TO THE INTERCEPT POINT"
                        : "CUT ACROSS THE RAID AXIS · CONTROL CLOSURE";
    }

    public bool HasLeaked(in AircraftState target) => Horizontal(
        target.Position - _definition.DefendedPoint).Length <= _definition.DefendedRadiusM;

    public void RecordNeutralized(double timeSeconds, int cumulativeRoundsFired) {
        if (!CanResolve(timeSeconds, cumulativeRoundsFired)) return;
        _neutralizationTimes.Add(Math.Max(0.0, timeSeconds - _targetStartedAtSeconds));
        Kills++;
        CompleteTarget(timeSeconds, cumulativeRoundsFired);
        Cue = Finished
            ? ZeroLeakers ? "RAID DEFEATED · ZERO LEAKERS" : "RAID COMPLETE · REVIEW LEAKERS"
            : $"RAIDER {Kills} DOWN · {TotalTargets - TargetsResolved} REMAIN";
    }

    public void RecordLeaked(double timeSeconds, int cumulativeRoundsFired) {
        if (!CanResolve(timeSeconds, cumulativeRoundsFired)) return;
        Leakers++;
        CompleteTarget(timeSeconds, cumulativeRoundsFired);
        Cue = Finished
            ? "RAID COMPLETE · REVIEW LEAKERS"
            : $"LEAKER · {TotalTargets - TargetsResolved} TARGETS REMAIN";
    }

    public void RecordOwnshipLost(double timeSeconds, int cumulativeRoundsFired) {
        if (!Started || Finished) return;
        ValidateTimeAndRounds(timeSeconds, cumulativeRoundsFired);
        _latestCumulativeRounds = Math.Max(_latestCumulativeRounds, cumulativeRoundsFired);
        // This exercise models one defending aircraft. Once it is lost, every unresolved raider
        // is no longer opposed and therefore counts as a penetration rather than disappearing from
        // the denominator or accidentally earning the zero-leaker bonus.
        Leakers += Math.Max(0, TotalTargets - TargetsResolved);
        OwnshipLost = true;
        Finished = true;
        Cue = "OWN SHIP LOST · RAID DEFENCE FAILED";
    }

    void CompleteTarget(double timeSeconds, int cumulativeRoundsFired) {
        _latestCumulativeRounds = Math.Max(_latestCumulativeRounds, cumulativeRoundsFired);
        ActiveTargetElapsedSeconds = Math.Max(0.0, timeSeconds - _targetStartedAtSeconds);
        Finished = TargetsResolved >= TotalTargets;
        if (!Finished) _targetStartedAtSeconds = timeSeconds;
    }

    bool CanResolve(double timeSeconds, int cumulativeRoundsFired) {
        if (!Started || Finished) return false;
        ValidateTimeAndRounds(timeSeconds, cumulativeRoundsFired);
        return true;
    }

    static double NormalizeLowerIsBetter(double value, double fullCredit, double noCredit) =>
        Math.Clamp((noCredit - value) / (noCredit - fullCredit), 0.0, 1.0);

    static Vec3D Horizontal(in Vec3D value) => new(value.X, 0.0, value.Z);

    static void ValidateTimeAndRounds(double timeSeconds, int cumulativeRoundsFired) {
        if (!double.IsFinite(timeSeconds) || timeSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(timeSeconds));
        if (cumulativeRoundsFired < 0)
            throw new ArgumentOutOfRangeException(nameof(cumulativeRoundsFired));
    }
}

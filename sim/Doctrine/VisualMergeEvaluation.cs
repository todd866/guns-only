namespace GunsOnly.Sim.Doctrine;

/// <summary>Public, deterministic scoring contract for the post-BVR visual-merge exercise.</summary>
public sealed record VisualMergeEvaluationConfig(
    double MergeGateM = 900.0,
    double MinimumSafePassM = 150.0,
    double EnergyFloorKias = 300.0,
    double RearQuarterMinimumRangeM = 150.0,
    double RearQuarterMaximumRangeM = 1200.0,
    double RearQuarterNoseLimitDeg = 18.0,
    double RearQuarterAspectLimitDeg = 60.0,
    double RequiredRearQuarterDwellSeconds = 5.0,
    double DesiredMaximumClosureKts = 250.0);

/// <summary>
/// Scores decisions which the fixed-step simulation actually observes. It does not award a
/// synthetic kill: rounds, intersections, damage, and outcomes remain owned by <see cref="GunKill"/>.
/// Weapons stay inhibited through the first reciprocal pass so the exercise cannot be solved by a
/// head-on trigger pull before BFM begins.
/// </summary>
public sealed class VisualMergeEvaluation {
    const double OpeningConfirmationSeconds = 0.20;
    const double WeaponsHotCueSeconds = 1.8;
    readonly VisualMergeEvaluationConfig _config;
    double _previousRangeM = double.NaN;
    double _openingSeconds;
    bool _wasBehindAtCloseRange;
    bool _playerTriggerInterlocked;
    double _weaponsHotCueRemainingSeconds;

    public VisualMergeEvaluation(VisualMergeEvaluationConfig config) {
        _config = config ?? throw new ArgumentNullException(nameof(config));
        if (!double.IsFinite(config.MergeGateM) || config.MergeGateM <= 0.0
            || !double.IsFinite(config.MinimumSafePassM) || config.MinimumSafePassM <= 0.0
            || !double.IsFinite(config.EnergyFloorKias) || config.EnergyFloorKias <= 0.0
            || !double.IsFinite(config.RequiredRearQuarterDwellSeconds)
            || config.RequiredRearQuarterDwellSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(config));
    }

    public bool FirstPassComplete { get; private set; }
    public bool FirstPassHoldReleasedByPilot { get; private set; }
    public bool WeaponsInhibited => !FirstPassComplete;

    /// <summary>
    /// Pilot authority over the first-pass discipline: tapping the GUNS SAFE annunciation arms
    /// the gun immediately. The release is recorded so the debrief stays honest about it — the
    /// merge score still reflects whatever pass geometry was actually flown.
    /// </summary>
    public void ReleaseFirstPassHold() {
        if (FirstPassComplete) return;
        FirstPassComplete = true;
        FirstPassHoldReleasedByPilot = true;
    }
    public bool PlayerTriggerInterlocked => _playerTriggerInterlocked;
    public bool PlayerWeaponsAuthorized => FirstPassComplete && !_playerTriggerInterlocked;
    public bool WeaponsHotCueActive => PlayerWeaponsAuthorized
        && _weaponsHotCueRemainingSeconds > 0.0;
    public string WeaponsStateCue => WeaponsInhibited
        ? "GUNS SAFE · FIRST PASS"
        : PlayerTriggerInterlocked
            ? "RELEASE TRIGGER TO ARM"
            : WeaponsHotCueActive ? "GUNS HOT" : "";
    public double MinimumMergeRangeM { get; private set; } = double.PositiveInfinity;
    public double MinimumEnergyKias { get; private set; } = double.PositiveInfinity;
    public double PeakClosureKts { get; private set; }
    public double RearQuarterDwellSeconds { get; private set; }
    public bool CurrentRearQuarterValid { get; private set; }
    public int HeadOnTriggerViolations { get; private set; }
    public int HighAspectTriggerViolations { get; private set; }
    public int Overshoots { get; private set; }
    public int ProjectileRoundsFired { get; private set; }
    public int ProjectileHits { get; private set; }
    public double ClosureScore {
        get {
            double closurePenalty = Math.Max(0.0,
                (PeakClosureKts - _config.DesiredMaximumClosureKts) / 15.0);
            return Math.Max(0.0, 20.0 - Overshoots * 10.0 - closurePenalty);
        }
    }

    public int Score {
        get {
            if (!double.IsFinite(MinimumEnergyKias)) return 0;
            double merge = FirstPassComplete
                ? 20.0 * Math.Clamp(MinimumMergeRangeM / _config.MinimumSafePassM, 0.0, 1.0)
                : 0.0;
            double energy = 20.0 * Math.Clamp(
                (MinimumEnergyKias - (_config.EnergyFloorKias - 100.0)) / 100.0, 0.0, 1.0);
            int nonHeadOnInvalid = Math.Max(0,
                HighAspectTriggerViolations - HeadOnTriggerViolations);
            double trigger = Math.Max(0.0,
                20.0 - HeadOnTriggerViolations * 10.0 - nonHeadOnInvalid * 5.0);
            double solution = Math.Min(12.0,
                12.0 * RearQuarterDwellSeconds / _config.RequiredRearQuarterDwellSeconds)
                + Math.Min(8.0, ProjectileHits * 4.0);
            return (int)Math.Round(Math.Clamp(
                merge + energy + trigger + ClosureScore + solution,
                0.0, 100.0));
        }
    }

    public string Cue => WeaponsInhibited
        ? "MERGE · GUNS SAFE · FIRST PASS"
        : PlayerTriggerInterlocked
            ? "GUNS HOT · RELEASE TRIGGER TO ARM"
        : MinimumEnergyKias < _config.EnergyFloorKias
            ? $"ENERGY FLOOR · {MinimumEnergyKias:F0} KIAS MIN"
            : CurrentRearQuarterValid
                ? $"VALID REAR QUARTER · DWELL {RearQuarterDwellSeconds:F1} S"
                : "GUNS HOT · CONTROL CLOSURE · WORK TO THE REAR QUARTER";

    public void ObserveTriggerPressed(in AircraftState player, in AircraftState opponent) {
        bool validRearQuarter = IsValidRearQuarter(player, opponent, out _, out _, out _);
        if (WeaponsInhibited) {
            HeadOnTriggerViolations++;
            _playerTriggerInterlocked = true;
        }
        if (!validRearQuarter) HighAspectTriggerViolations++;
    }

    public void ObserveTriggerReleased() {
        bool releasedInterlock = _playerTriggerInterlocked;
        _playerTriggerInterlocked = false;
        if (FirstPassComplete && releasedInterlock)
            _weaponsHotCueRemainingSeconds = WeaponsHotCueSeconds;
    }

    public void ObserveProjectileState(int roundsFired, int hits) {
        ProjectileRoundsFired = Math.Max(ProjectileRoundsFired, roundsFired);
        ProjectileHits = Math.Max(ProjectileHits, hits);
    }

    public void Step(in AircraftState player, in AircraftState opponent,
        IAtmosphereModel atmosphere, double dt,
        double playerTrueAirspeedMps = double.NaN) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        if (!double.IsFinite(dt) || dt < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));

        Vec3D line = opponent.Position - player.Position;
        double rangeM = line.Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-6) return;
        Vec3D lineUnit = line * (1.0 / rangeM);
        Vec3D relativeVelocity = opponent.VelocityVector() - player.VelocityVector();
        double closureKts = -relativeVelocity.Dot(lineUnit) * AirData.MpsToKnots;

        double trueAirspeedMps = double.IsFinite(playerTrueAirspeedMps)
            && playerTrueAirspeedMps >= 0.0 ? playerTrueAirspeedMps : player.Speed;
        double kias = AirData.IndicatedAirspeedMps(trueAirspeedMps,
            player.Position.Y, atmosphere) * AirData.MpsToKnots;
        MinimumEnergyKias = Math.Min(MinimumEnergyKias, kias);

        if (!FirstPassComplete) {
            MinimumMergeRangeM = Math.Min(MinimumMergeRangeM, rangeM);
            bool passedGate = MinimumMergeRangeM <= _config.MergeGateM;
            bool opening = double.IsFinite(_previousRangeM)
                && rangeM > _previousRangeM
                && closureKts < 0.0
                && rangeM >= MinimumMergeRangeM + 20.0;
            _openingSeconds = passedGate && opening ? _openingSeconds + dt : 0.0;
            if (_openingSeconds >= OpeningConfirmationSeconds) {
                FirstPassComplete = true;
                _weaponsHotCueRemainingSeconds = WeaponsHotCueSeconds;
            }
        }

        if (FirstPassComplete && !_playerTriggerInterlocked
            && _weaponsHotCueRemainingSeconds > 0.0)
            _weaponsHotCueRemainingSeconds = Math.Max(0.0,
                _weaponsHotCueRemainingSeconds - dt);

        bool rearGeometryValid = IsValidRearQuarter(player, opponent,
            out double banditAspect, out double noseAlignment, out double rearRangeM);
        // The reciprocal pass is compulsory setup, not a closure-control decision. Record closure
        // only once ownship is actually pursuing from the opponent's rear hemisphere with the
        // target ahead of the wing line. This also prevents an opening, nose-away post-pass state
        // from arming the later overshoot detector merely because ownship is geometrically astern.
        bool pursuitGeometry = FirstPassComplete
            && rearRangeM <= 1500.0
            && banditAspect < 0.0
            && noseAlignment > 0.0;
        if (pursuitGeometry)
            PeakClosureKts = Math.Max(PeakClosureKts, closureKts);
        CurrentRearQuarterValid = FirstPassComplete && rearGeometryValid;
        if (CurrentRearQuarterValid) RearQuarterDwellSeconds += dt;

        bool close = rearRangeM < 1000.0;
        bool behind = banditAspect < -0.25;
        bool ahead = banditAspect > 0.20;
        if (pursuitGeometry && close && behind) _wasBehindAtCloseRange = true;
        if (_wasBehindAtCloseRange && close && ahead) {
            Overshoots++;
            _wasBehindAtCloseRange = false;
        } else if (!close) {
            _wasBehindAtCloseRange = false;
        }

        _previousRangeM = rangeM;
    }

    bool IsValidRearQuarter(in AircraftState player, in AircraftState opponent,
        out double banditAspect, out double noseAlignment, out double rangeM) {
        Vec3D fromBanditToPlayer = player.Position - opponent.Position;
        rangeM = fromBanditToPlayer.Length;
        if (rangeM < 1e-6) {
            banditAspect = 1.0;
            noseAlignment = -1.0;
            return false;
        }
        Vec3D banditToPlayer = fromBanditToPlayer * (1.0 / rangeM);
        Vec3D playerToBandit = banditToPlayer * -1.0;
        banditAspect = opponent.ForwardDir().Dot(banditToPlayer);
        noseAlignment = player.ForwardDir().Dot(playerToBandit);
        double rearLimit = -Math.Cos(_config.RearQuarterAspectLimitDeg * Math.PI / 180.0);
        double noseLimit = Math.Cos(_config.RearQuarterNoseLimitDeg * Math.PI / 180.0);
        return rangeM >= _config.RearQuarterMinimumRangeM
            && rangeM <= _config.RearQuarterMaximumRangeM
            && banditAspect <= rearLimit
            && noseAlignment >= noseLimit;
    }
}

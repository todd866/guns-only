using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Motorcycle;

public enum WeekendRidePhase
{
    Ready,
    Active,
    Paused,
    Finished
}

public enum WeekendRideSessionLeg
{
    Flying,
    Cooldown
}

/// <summary>
/// Headless mission authority for the Rapier strip weekend motorcycle ride. Owns lifecycle,
/// painted-circuit scoring, lap timing, and grid reset after tip-over.
/// </summary>
public sealed class WeekendRideMissionRuntime
{
    const double RunwayFrictionPerSecond = 2.5;
    // Provisional dry verge grip relative to the runway-plane reference surface.
    const double GrassFrictionPerSecond = 0.75;
    const double FixedDeltaSeconds = PlayerVehicleContract.FixedDeltaSeconds;
    const double LapTimingStartSpeedMps = 0.5;
    /// <summary>
    /// Ordinary ACU/MSUK national pit-lane maximum. Provisional procedure, not a
    /// measured YZF-R1 figure.
    /// </summary>
    public const double PitLaneSpeedLimitMps = 60.0 / 3.6;

    readonly double _gridHeadingRad;
    readonly double _recurringBaseMassKg;
    readonly MotorcycleRiderController _riderController = new();
    PaintedCircuitQueryState _circuitQueryState;
    long _authorityTick;
    readonly RideLapTiming _lapTiming = new();
    double _currentLapElapsedSeconds;
    double _lapProgressM;
    double _sessionSeconds;
    double _offTrackSeconds;
    double _tipRecoveryFlashSeconds;
    bool _lapTimingActive;
    bool _isOnTrack = true;
    bool _pitOccupancyLatched;
    bool _pitWindowLatched;
    bool _pitEntryLegal;
    double _stoppedHoldSeconds;
    bool _hasMatchingCleanLap;
    bool _broughtInBefore;

    WeekendRideMissionRuntime(
        YzfR1Dynamics bike,
        PaintedCircuit circuit,
        Vec3D gridPosition,
        double gridHeadingRad)
    {
        Bike = bike;
        Circuit = circuit;
        GridPosition = gridPosition;
        _gridHeadingRad = gridHeadingRad;
        PitLane = PitLaneBeside(gridPosition);
        _recurringBaseMassKg = YzfR1Definition.CombinedMassKg;
        Phase = WeekendRidePhase.Ready;
    }

    public WeekendRidePhase Phase { get; private set; }
    public YzfR1Dynamics Bike { get; }
    public PaintedCircuit Circuit { get; }
    public Vec3D GridPosition { get; }
    public PitLaneBox PitLane { get; }
    public double GridHeadingRad => _gridHeadingRad;
    public double SessionSeconds => _sessionSeconds;
    public double ProgressM => _lapProgressM;
    public double LapTimeSeconds => _currentLapElapsedSeconds;

    /// <summary>The most recently completed lap, seconds; 0 before the first crossing.</summary>
    public double LastLapSeconds => _lapTiming.LastLapSeconds;

    /// <summary>Fastest lap ridden clean this session, or null.</summary>
    public double? BestLapSeconds => _lapTiming.BestLapSeconds;
    public int CleanFlyingLaps => _lapTiming.CleanFlyingLaps;
    public double LastCleanFlyingLapSeconds => _lapTiming.LastCleanFlyingLapSeconds;

    /// <summary>False once the lap in progress has been spoilt off-track or by a tip-over.</summary>
    public bool CurrentLapValid => _lapTiming.CurrentLapValid;

    /// <summary>Every completed lap in order, dirty ones included.</summary>
    public IReadOnlyList<double> CompletedLapSeconds => _lapTiming.CompletedLapSeconds;

    /// <summary>Sector times for the lap in progress; 0 for sectors not yet closed.</summary>
    public IReadOnlyList<double> SectorSeconds => _lapTiming.SectorSeconds;

    /// <summary>Best time per sector, each independent of the lap it came from.</summary>
    public IReadOnlyList<double?> BestSectorSeconds => _lapTiming.BestSectorSeconds;

    /// <summary>Seconds ahead (negative) or behind the best lap at this point on the circuit.</summary>
    public double? DeltaToBestSeconds =>
        _lapTiming.DeltaToBestSeconds(_lapProgressM, Circuit.CircuitLengthM);
    public int LapCount => _circuitQueryState.LapIndex;
    public WeekendRideSessionLeg SessionLeg { get; private set; } = WeekendRideSessionLeg.Flying;
    public bool PitOpen { get; private set; }
    public double LookAheadLateralM { get; private set; }
    public bool InPit { get; private set; }
    public bool PitEntryLegal => _pitEntryLegal && _pitOccupancyLatched;
    public bool LegalStop { get; private set; }
    public bool CameInEarly { get; private set; }
    public bool HadHotPitEntry { get; private set; }
    public int TipCount { get; private set; }
    public bool ShowApexSpeed { get; private set; } = true;
    /// <summary>1 until a matching clean lap and a legal stop are both on the device; then 0.5.</summary>
    public double ReflexGain { get; private set; } = 1.0;
    /// <summary>
    /// Session-cumulative seconds outside the painted circuit. Grid recovery abandons the
    /// current lap but never erases this debrief evidence; only a new mission begins at zero.
    /// </summary>
    public double OffTrackSeconds => _offTrackSeconds;
    public bool IsOnTrack => _isOnTrack;

    public static WeekendRideMissionRuntime CreateDefault()
    {
        PaintedCircuit circuit = PaintedCircuit.RapierStripWeekend();
        const double headingRad = -Math.PI / 2.0;
        Vec3D gridPosition = circuit.StartFinishCentre;
        var bike = YzfR1Dynamics.AtRestOnRunway(
            "weekend-ride.player",
            gridPosition,
            headingRad);
        return new WeekendRideMissionRuntime(bike, circuit, gridPosition, headingRad);
    }

    public void Begin()
    {
        if (Phase == WeekendRidePhase.Finished)
            throw new InvalidOperationException("A finished weekend ride cannot restart.");

        ResetMissionState();
        ApplyRamp(_hasMatchingCleanLap, _broughtInBefore);
        Phase = WeekendRidePhase.Active;
    }

    /// <summary>
    /// Device evidence for the reflex ramp. No matching lap: full apex card and full gains.
    /// A lap without a legal stop: distance only, full gains. Both: distance only, half gain.
    /// </summary>
    public void ApplyRamp(bool hasMatchingCleanLap, bool broughtIn)
    {
        _hasMatchingCleanLap = hasMatchingCleanLap;
        _broughtInBefore = broughtIn;
        ShowApexSpeed = !hasMatchingCleanLap;
        ReflexGain = hasMatchingCleanLap && broughtIn ? 0.5 : 1.0;
        Bike.LeanHoldGainScale = ReflexGain;
    }

    public void Pause()
    {
        if (Phase == WeekendRidePhase.Active)
            Phase = WeekendRidePhase.Paused;
    }

    public void Resume()
    {
        if (Phase == WeekendRidePhase.Paused)
            Phase = WeekendRidePhase.Active;
    }

    public void Finish() => Phase = WeekendRidePhase.Finished;

    public void StepFixed(in MotorcyclePilotCommand command)
    {
        if (Phase != WeekendRidePhase.Active)
            return;

        _sessionSeconds += FixedDeltaSeconds;
        PlayerVehicleEnvironmentSample environment = CreateEnvironment(Bike.State.PositionWorldM);
        Bike.Advance(new PlayerVehicleAdvanceInput(
            _authorityTick,
            PlayerVehicleCommand.FromMotorcycle(command),
            _recurringBaseMassKg,
            0.0,
            environment,
            VehicleContactState.Unknown,
            VehicleProtectionInterventionEvidence.None));
        _authorityTick++;

        PaintedCircuitQueryResult circuitSample = Circuit.Query(
            Bike.State.PositionWorldM,
            ref _circuitQueryState);
        _isOnTrack = circuitSample.OnTrack;
        double remainingToLineM = Math.Max(0.0, Circuit.CircuitLengthM - circuitSample.ProgressM);
        // The box sits past the stripe. Once the cool-down is inside 120 m on the way in,
        // the window stays open across the line so the arrival is not slammed shut.
        // Progress near 0 at the start of the cool-down is a full lap remaining, not an arrival.
        if (SessionLeg == WeekendRideSessionLeg.Cooldown
            && remainingToLineM <= 120.0
            && circuitSample.ProgressM > 120.0)
            _pitWindowLatched = true;
        PitOpen = SessionLeg == WeekendRideSessionLeg.Cooldown && _pitWindowLatched;
        bool spoilOffPaint = !circuitSample.OnTrack && !PitOpen;
        if (spoilOffPaint)
            _offTrackSeconds += FixedDeltaSeconds;
        if (PitOpen && !circuitSample.OnTrack)
            circuitSample = circuitSample with { OnTrack = true };

        if (!_lapTimingActive
            && circuitSample.OnTrack
            && Bike.Telemetry.SpeedMps >= LapTimingStartSpeedMps)
            _lapTimingActive = true;
        // The lap now survives the finish line: RideLapTiming keeps it, judges whether it was
        // clean, and remembers the best. It owns the elapsed clock; the legacy field mirrors
        // it so existing readers of LapTimeSeconds keep working unchanged.
        bool flyingLap = SessionLeg == WeekendRideSessionLeg.Flying;
        _lapTiming.Advance(
            circuitSample,
            _lapTimingActive,
            Bike.Telemetry.IsTippedOver,
            FixedDeltaSeconds,
            Circuit.CircuitLengthM,
            countsAsRecord: flyingLap);
        if (circuitSample.LapIndex >= 2)
            SessionLeg = WeekendRideSessionLeg.Cooldown;
        _lapProgressM = circuitSample.ProgressM;
        _currentLapElapsedSeconds = _lapTiming.CurrentLapSeconds;

        if (Bike.Telemetry.IsTippedOver)
        {
            TipCount++;
            _tipRecoveryFlashSeconds = 1.5;
            ResetToGrid();
        }
        else if (_tipRecoveryFlashSeconds > 0.0)
            _tipRecoveryFlashSeconds = Math.Max(0.0, _tipRecoveryFlashSeconds - FixedDeltaSeconds);

        UpdateLookAhead();
        JudgePitStop();
    }

    void JudgePitStop()
    {
        bool inPit = PitLane.Contains(Bike.State.PositionWorldM);
        InPit = inPit;
        if (!inPit)
        {
            _pitOccupancyLatched = false;
            _pitEntryLegal = false;
            _stoppedHoldSeconds = 0.0;
            return;
        }

        if (!_pitOccupancyLatched)
        {
            _pitOccupancyLatched = true;
            _pitEntryLegal = Bike.Telemetry.SpeedMps <= PitLaneSpeedLimitMps;
            if (!_pitEntryLegal)
                HadHotPitEntry = true;
            if (SessionLeg == WeekendRideSessionLeg.Flying)
                CameInEarly = true;
        }

        if (_pitEntryLegal && Bike.Telemetry.SpeedMps <= LapTimingStartSpeedMps)
            _stoppedHoldSeconds += FixedDeltaSeconds;
        else
            _stoppedHoldSeconds = 0.0;

        // The box sits beside the stripe. After the checker, a stop is the cool-down
        // only once that lap has armed the pit window. An immediate turn-in is not it.
        if (_pitEntryLegal && _stoppedHoldSeconds >= 0.5 - 1e-9
            && (SessionLeg != WeekendRideSessionLeg.Cooldown || PitOpen))
        {
            LegalStop = true;
            Finish();
        }
    }

    void UpdateLookAhead()
    {
        double speed = Math.Abs(Bike.Telemetry.SpeedMps);
        double lookM = Math.Max(12.0, speed * 0.8);
        Vec3D target = PitOpen
            ? PitLane.Centre
            : Circuit.PointAhead(_lapProgressM, lookM);
        double yaw = Bike.Observation.YawRad;
        double forwardX = Math.Sin(yaw);
        double forwardZ = Math.Cos(yaw);
        double rightX = forwardZ;
        double rightZ = -forwardX;
        Vec3D delta = target - Bike.State.PositionWorldM;
        LookAheadLateralM = delta.X * rightX + delta.Z * rightZ;
    }

    public void StepFixed(
        in MotorcycleRiderIntent intent,
        MotorcycleControlMode controlMode = MotorcycleControlMode.Assisted)
    {
        if (Phase != WeekendRidePhase.Active)
            return;

        MotorcycleTelemetry telemetry = Bike.Telemetry;
        var feedback = new MotorcycleRiderFeedback(
            telemetry.SpeedMps,
            telemetry.LeanRad,
            Bike.State.BodyRates.P,
            telemetry.PitchRad,
            PitchRateRadPerSec: 0.0,
            telemetry.FrontGripUse,
            telemetry.RearGripUse,
            telemetry.WheelieBalance,
            telemetry.StoppieBalance,
            telemetry.IsSliding);
        double reflexGain = controlMode == MotorcycleControlMode.Raw ? 0.0 : ReflexGain;
        MotorcyclePilotCommand command = _riderController.Step(
            intent, feedback, controlMode, reflexGain);
        StepFixed(command);
    }

    public void ResetToGrid()
    {
        Bike.ResetTo(GridPosition, _gridHeadingRad);
        _riderController.Reset();
        // A tip abandons the lap in progress. Laps already crossed stay crossed, or the
        // checker and the debrief would forget the session the rider had already ridden.
        int completedLaps = _circuitQueryState.LapIndex;
        _circuitQueryState = default;
        _circuitQueryState.LapIndex = completedLaps;
        // A recovery drops the lap in progress but never the best or the history: you lose the
        // lap you crashed on, not the session. Off-track time is session evidence too and must
        // survive the recovery so the debrief cannot claim a clean ride after a reset.
        _lapTiming.AbandonCurrentLap();
        _currentLapElapsedSeconds = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
        _pitWindowLatched = false;
        PitOpen = false;
    }

    public void DebugForceTipOver() => Bike.DebugForceTipOver();

    /// <summary>Restores a best lap from a previous session; see RideLapTiming.SeedBest.</summary>
    public bool SeedBestLap(double bestLapSeconds, IReadOnlyList<double> splitProfile) =>
        _lapTiming.SeedBest(bestLapSeconds, splitProfile);

    /// <summary>The best lap's split profile, for persisting.</summary>
    public IReadOnlyList<double> BestSplitProfile => _lapTiming.BestSplitProfile;

    public WeekendRideSnapshot Snapshot()
    {
        MotorcycleTelemetry telemetry = Bike.Telemetry;
        double headingRad = Bike.Observation.YawRad;
        (double slipFront, double slipRear) = WeekendRideSnapshot.SurrogateWheelSlip(telemetry);
        return new WeekendRideSnapshot(
            Phase,
            Bike.State.PositionWorldM,
            Bike.State.GroundVelocityMps,
            telemetry.LeanRad,
            WeekendRideSnapshot.RollFromViewAttitude(telemetry.ViewAttitude, headingRad),
            telemetry.ViewAttitude,
            telemetry.FrontNormalForceN,
            telemetry.RearNormalForceN,
            slipFront,
            slipRear,
            telemetry.WheelieBalance,
            telemetry.StoppieBalance,
            telemetry.PitchReflexAuthority,
            telemetry.LeanHoldAuthority,
            telemetry.KneeDown,
            telemetry.KneeProximity,
            telemetry.PitchRad,
            LapCount,
            LapTimeSeconds,
            OffTrackSeconds,
            telemetry.IsTippedOver,
            telemetry.SpeedMps,
            telemetry.Rpm,
            telemetry.Gear,
            telemetry.Throttle,
            telemetry.Brake,
            telemetry.RiderLateral,
            telemetry.RiderForeAft,
            telemetry.ClutchMode,
            telemetry.ClutchEngagement,
            _tipRecoveryFlashSeconds,
            telemetry.FrontLongitudinalForceN,
            telemetry.RearLongitudinalForceN,
            telemetry.FrontLateralForceN,
            telemetry.RearLateralForceN,
            telemetry.FrontGripUse,
            telemetry.RearGripUse,
            telemetry.CogAlongFromRearM,
            telemetry.CogLateralM,
            telemetry.RiderSkillAuthority,
            telemetry.CogEnvelopeCenterAlongM,
            telemetry.CogEnvelopeHalfAlongM,
            telemetry.CogEnvelopeHalfLateralM,
            telemetry.CogInsideEnvelope,
            telemetry.CerebellarAssistScale,
            _lapProgressM,
            _sessionSeconds,
            NextApex.DistanceM,
            NextApex.SteadySpeedMps,
            NextApex.ReportingExit,
            SessionLeg,
            PitOpen,
            LookAheadLateralM,
            InPit,
            PitEntryLegal,
            LegalStop,
            CameInEarly,
            HadHotPitEntry,
            TipCount,
            ShowApexSpeed,
            ReflexGain,
            CleanFlyingLaps,
            LastCleanFlyingLapSeconds);
    }

    public CircuitApexReference NextApex => Circuit.NextApex(_lapProgressM);

    void ResetMissionState()
    {
        _authorityTick = 0;
        _circuitQueryState = default;
        _currentLapElapsedSeconds = 0.0;
        _lapProgressM = 0.0;
        _sessionSeconds = 0.0;
        _offTrackSeconds = 0.0;
        _tipRecoveryFlashSeconds = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
        _pitOccupancyLatched = false;
        _pitWindowLatched = false;
        _pitEntryLegal = false;
        _stoppedHoldSeconds = 0.0;
        SessionLeg = WeekendRideSessionLeg.Flying;
        PitOpen = false;
        LookAheadLateralM = 0.0;
        InPit = false;
        LegalStop = false;
        CameInEarly = false;
        HadHotPitEntry = false;
        TipCount = 0;
        _riderController.Reset();
        Bike.ResetTo(GridPosition, _gridHeadingRad);
    }

    PlayerVehicleEnvironmentSample CreateEnvironment(in Vec3D positionWorldM)
    {
        // Pavement authority lives with the circuit definition (runway rectangle plus the
        // hairpin apron corridor), so paint and grip cannot drift apart under heading change.
        bool onPavement = Circuit.IsOnPavement(positionWorldM);
        return new(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal(
                surfaceId: onPavement ? "rapier-strip.runway" : "rapier-strip.grass",
                heightM: RapierLaunchSite.OperatingSurfaceElevationM,
                frictionPerSecond: onPavement
                    ? RunwayFrictionPerSecond
                    : GrassFrictionPerSecond));
    }

    /// <summary>
    /// The paddock row <c>track_day_presentation.js</c> already reserves beside the grid:
    /// x = clamp(grid.x - 80 - (index % 3) * 22, -900, 900), z = 54 + floor(index / 3) * 14.
    /// </summary>
    static PitLaneBox PitLaneBeside(Vec3D grid)
    {
        double firstX = Math.Clamp(grid.X - 80.0, -900.0, 900.0);
        double lastX = Math.Clamp(grid.X - 80.0 - 44.0, -900.0, 900.0);
        return new PitLaneBox(
            Math.Min(firstX, lastX) - 14.0,
            Math.Max(firstX, lastX) + 14.0,
            48.0,
            82.0,
            PitLaneSpeedLimitMps);
    }
}

public readonly record struct PitLaneBox(
    double MinX,
    double MaxX,
    double MinZ,
    double MaxZ,
    double SpeedLimitMps)
{
    public bool Contains(Vec3D position) =>
        position.X >= MinX && position.X <= MaxX
        && position.Z >= MinZ && position.Z <= MaxZ;

    public Vec3D Centre => new(
        (MinX + MaxX) * 0.5,
        0.0,
        (MinZ + MaxZ) * 0.5);
}

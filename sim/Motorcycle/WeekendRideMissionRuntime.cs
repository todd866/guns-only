using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Motorcycle;

public enum WeekendRidePhase
{
    Ready,
    Active,
    Paused,
    Finished
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

    readonly double _gridHeadingRad;
    readonly double _recurringBaseMassKg;
    readonly MotorcycleRiderController _riderController = new();
    PaintedCircuitQueryState _circuitQueryState;
    long _authorityTick;
    readonly RideLapTiming _lapTiming = new();
    double _currentLapElapsedSeconds;
    double _lapProgressM;
    double _offTrackSeconds;
    double _tipRecoveryFlashSeconds;
    bool _lapTimingActive;
    bool _isOnTrack = true;

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
        _recurringBaseMassKg = YzfR1Definition.CombinedMassKg;
        Phase = WeekendRidePhase.Ready;
    }

    public WeekendRidePhase Phase { get; private set; }
    public YzfR1Dynamics Bike { get; }
    public PaintedCircuit Circuit { get; }
    public Vec3D GridPosition { get; }
    public double GridHeadingRad => _gridHeadingRad;
    public double LapTimeSeconds => _currentLapElapsedSeconds;

    /// <summary>The most recently completed lap, seconds; 0 before the first crossing.</summary>
    public double LastLapSeconds => _lapTiming.LastLapSeconds;

    /// <summary>Fastest lap ridden clean this session, or null.</summary>
    public double? BestLapSeconds => _lapTiming.BestLapSeconds;

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
        Phase = WeekendRidePhase.Active;
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
        if (!circuitSample.OnTrack)
            _offTrackSeconds += FixedDeltaSeconds;

        if (!_lapTimingActive
            && circuitSample.OnTrack
            && Bike.Telemetry.SpeedMps >= LapTimingStartSpeedMps)
            _lapTimingActive = true;
        // The lap now survives the finish line: RideLapTiming keeps it, judges whether it was
        // clean, and remembers the best. It owns the elapsed clock; the legacy field mirrors
        // it so existing readers of LapTimeSeconds keep working unchanged.
        _lapTiming.Advance(
            circuitSample,
            _lapTimingActive,
            Bike.Telemetry.IsTippedOver,
            FixedDeltaSeconds,
            Circuit.CircuitLengthM);
        _lapProgressM = circuitSample.ProgressM;
        _currentLapElapsedSeconds = _lapTiming.CurrentLapSeconds;

        if (Bike.Telemetry.IsTippedOver)
        {
            _tipRecoveryFlashSeconds = 1.5;
            ResetToGrid();
        }
        else if (_tipRecoveryFlashSeconds > 0.0)
            _tipRecoveryFlashSeconds = Math.Max(0.0, _tipRecoveryFlashSeconds - FixedDeltaSeconds);
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
        MotorcyclePilotCommand command = _riderController.Step(intent, feedback, controlMode);
        StepFixed(command);
    }

    public void ResetToGrid()
    {
        Bike.ResetTo(GridPosition, _gridHeadingRad);
        _riderController.Reset();
        _circuitQueryState = default;
        // A recovery drops the lap in progress but never the best or the history: you lose the
        // lap you crashed on, not the session. Off-track time is session evidence too and must
        // survive the recovery so the debrief cannot claim a clean ride after a reset.
        _lapTiming.AbandonCurrentLap();
        _currentLapElapsedSeconds = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
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
            telemetry.CerebellarAssistScale);
    }

    void ResetMissionState()
    {
        _authorityTick = 0;
        _circuitQueryState = default;
        _currentLapElapsedSeconds = 0.0;
        _offTrackSeconds = 0.0;
        _tipRecoveryFlashSeconds = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
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
}

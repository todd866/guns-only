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
/// Headless mission authority for the Weekend Track Day closed circuit. Owns lifecycle,
/// circuit scoring, lap timing, deterministic grip, and grid reset after tip-over.
/// </summary>
public sealed class WeekendRideMissionRuntime
{
    const double AsphaltFrictionPerSecond = 2.5;
    // Provisional dry verge grip relative to the circuit asphalt reference surface.
    const double GrassFrictionPerSecond = 0.75;
    const double FixedDeltaSeconds = PlayerVehicleContract.FixedDeltaSeconds;
    const double LapTimingStartSpeedMps = 0.5;

    readonly double _gridHeadingRad;
    readonly double _recurringBaseMassKg;
    readonly MotorcycleRiderController _riderController = new();
    PaintedCircuitQueryState _circuitQueryState;
    long _authorityTick;
    double _currentLapElapsedSeconds;
    double _offTrackSeconds;
    double _tipRecoveryFlashSeconds;
    double _lapAcknowledgementRemainingSeconds;
    double _openRoadDistanceM;
    bool _lapTimingActive;
    bool _isOnTrack = true;
    bool _isOnOpenRoad;

    WeekendRideMissionRuntime(
        YzfR1Dynamics bike,
        PaintedCircuit circuit,
        WeekendHinterlandRoadNetwork hinterland,
        Vec3D gridPosition,
        double gridHeadingRad)
    {
        Bike = bike;
        Circuit = circuit;
        Hinterland = hinterland;
        GridPosition = gridPosition;
        _gridHeadingRad = gridHeadingRad;
        _recurringBaseMassKg = YzfR1Definition.CombinedMassKg;
        Phase = WeekendRidePhase.Ready;
    }

    public WeekendRidePhase Phase { get; private set; }
    public YzfR1Dynamics Bike { get; }
    public PaintedCircuit Circuit { get; }
    public WeekendHinterlandRoadNetwork Hinterland { get; }
    public Vec3D GridPosition { get; }
    public double GridHeadingRad => _gridHeadingRad;
    public double LapTimeSeconds => _currentLapElapsedSeconds;
    public int LapCount => _circuitQueryState.LapIndex;
    public double OffTrackSeconds => _offTrackSeconds;
    public bool IsOnTrack => _isOnTrack;
    public bool IsOnOpenRoad => _isOnOpenRoad;
    public double OpenRoadDistanceM => _openRoadDistanceM;

    public static WeekendRideMissionRuntime CreateDefault()
    {
        PaintedCircuit circuit = PaintedCircuit.WeekendTrackDay();
        WeekendHinterlandRoadNetwork hinterland =
            WeekendHinterlandRoadNetwork.CreateDefault(circuit.PaddockAccessPointWorldM);
        double headingRad = circuit.StartHeadingRad;
        Vec3D gridPosition = circuit.StartFinishCentre;
        var bike = YzfR1Dynamics.AtRestOnSurface(
            "weekend-ride.player",
            gridPosition,
            headingRad);
        return new WeekendRideMissionRuntime(bike, circuit, hinterland, gridPosition, headingRad);
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
        if (_lapTimingActive)
            _currentLapElapsedSeconds += FixedDeltaSeconds;
        if (circuitSample.CrossedStartFinish)
        {
            _currentLapElapsedSeconds = 0.0;
            _lapAcknowledgementRemainingSeconds =
                WeekendRideGoldenPath.LapAcknowledgementSeconds;
        }
        else if (_lapAcknowledgementRemainingSeconds > 0.0)
        {
            _lapAcknowledgementRemainingSeconds = Math.Max(
                0.0,
                _lapAcknowledgementRemainingSeconds - FixedDeltaSeconds);
        }

        bool onCircuitPavement = Circuit.IsOnPavement(Bike.State.PositionWorldM);
        bool onHinterlandPavement = Hinterland.IsOnPavement(Bike.State.PositionWorldM);
        _isOnOpenRoad = !onCircuitPavement && onHinterlandPavement;
        if (LapCount > 0 && _isOnOpenRoad)
            _openRoadDistanceM += Bike.Telemetry.SpeedMps * FixedDeltaSeconds;

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
        _currentLapElapsedSeconds = 0.0;
        _offTrackSeconds = 0.0;
        _lapAcknowledgementRemainingSeconds = 0.0;
        _openRoadDistanceM = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
        _isOnOpenRoad = false;
    }

    public void DebugForceTipOver() => Bike.DebugForceTipOver();

    public WeekendRideSnapshot Snapshot()
    {
        MotorcycleTelemetry telemetry = Bike.Telemetry;
        double headingRad = Bike.Observation.YawRad;
        (double slipFront, double slipRear) = WeekendRideSnapshot.SurrogateWheelSlip(telemetry);
        WeekendRideGoldenPathCue goldenPath = WeekendRideGoldenPath.Resolve(
            Circuit,
            Hinterland,
            Bike.State.PositionWorldM,
            headingRad,
            telemetry.SpeedMps,
            LapCount,
            _circuitQueryState.LastProgressM,
            _circuitQueryState.NextSectorIndex,
            _lapAcknowledgementRemainingSeconds,
            _openRoadDistanceM,
            _isOnOpenRoad);
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
            _circuitQueryState.LastProgressM,
            Circuit.CircuitLengthM,
            _circuitQueryState.NextSectorIndex - 1,
            _circuitQueryState.NextSectorIndex,
            goldenPath.Kind,
            goldenPath.Token,
            _isOnOpenRoad,
            _openRoadDistanceM);
    }

    void ResetMissionState()
    {
        _authorityTick = 0;
        _circuitQueryState = default;
        _currentLapElapsedSeconds = 0.0;
        _offTrackSeconds = 0.0;
        _tipRecoveryFlashSeconds = 0.0;
        _lapAcknowledgementRemainingSeconds = 0.0;
        _openRoadDistanceM = 0.0;
        _lapTimingActive = false;
        _isOnTrack = true;
        _isOnOpenRoad = false;
        _riderController.Reset();
        Bike.ResetTo(GridPosition, _gridHeadingRad);
    }

    PlayerVehicleEnvironmentSample CreateEnvironment(in Vec3D positionWorldM)
    {
        // Pavement authority lives with the circuit definition, so rendered road, runoff, and
        // deterministic grip share the same renderer-neutral corridor contract.
        bool onCircuitPavement = Circuit.IsOnPavement(positionWorldM);
        bool onHinterlandPavement = !onCircuitPavement
            && Hinterland.IsOnPavement(positionWorldM);
        bool onPavement = onCircuitPavement || onHinterlandPavement;
        return new(
            1.225,
            Vec3D.Zero,
            VehicleSurfaceSample.Horizontal(
                surfaceId: onCircuitPavement
                    ? "weekend-track.asphalt"
                    : onHinterlandPavement
                        ? "weekend-hinterland.asphalt"
                        : "weekend-track.grass",
                heightM: Circuit.SurfaceElevationM,
                frictionPerSecond: onPavement
                    ? AsphaltFrictionPerSecond
                    : GrassFrictionPerSecond));
    }
}

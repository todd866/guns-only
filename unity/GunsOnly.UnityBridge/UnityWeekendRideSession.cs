using GunsOnly.Sim;
using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.UnityBridge;

/// <summary>
/// Renderer-free Unity adapter over the same Weekend Ride authority used by Web. The adapter
/// mirrors MotorcycleWebBridge's 120 Hz accumulator and exposes the immutable route contract
/// separately so the full centreline is sent once, never on every pose frame.
/// </summary>
public sealed class UnityWeekendRideSession : IDisposable {
    const double FixedDeltaSeconds = 1.0 / PlayerVehicleContract.FixedStepHz;
    const double MaximumFrameDeltaSeconds = 0.1;
    const int MaximumTicksPerAdvance = 12;

    readonly WeekendRideMissionRuntime _runtime;
    readonly string _routeJson;
    MotorcycleRiderIntent _intent = NeutralIntent();
    MotorcycleControlMode _controlMode = MotorcycleControlMode.Assisted;
    int _pendingGearShift;
    long _completedTicks;
    double _accumulatorSeconds;
    bool _disposed;

    UnityWeekendRideSession(WeekendRideMissionRuntime runtime) {
        _runtime = runtime;
        _routeJson = WeekendRouteContract.FromCircuit(runtime.Circuit).ToJson();
    }

    public WeekendRidePhase Phase => _runtime.Phase;
    public long Tick => _completedTicks;
    public string RouteJson => _routeJson;

    public static UnityWeekendRideSession StartTrackDay() {
        WeekendRideMissionRuntime runtime = WeekendRideMissionRuntime.CreateDefault();
        runtime.Begin();
        return new UnityWeekendRideSession(runtime);
    }

    public void SetControls(
        double throttle,
        double brake,
        double steer,
        double riderLateral,
        double riderForeAft,
        double clutch
    ) {
        _intent = _intent with {
            Throttle = ClampFinite(throttle, 0.0, 1.0, nameof(throttle)),
            Brake = ClampFinite(brake, 0.0, 1.0, nameof(brake)),
            Turn = ClampFinite(steer, -1.0, 1.0, nameof(steer)),
            BodyLateralBias = ClampFinite(
                riderLateral, -1.0, 1.0, nameof(riderLateral)),
            BodyForeAftBias = ClampFinite(
                riderForeAft, -1.0, 1.0, nameof(riderForeAft)),
            Clutch = ClampFinite(clutch, 0.0, 1.0, nameof(clutch)),
        };
    }

    public void SetClutchMode(int mode) {
        _intent = _intent with {
            ClutchMode = mode switch {
                0 => MotorcycleClutchMode.Auto,
                1 => MotorcycleClutchMode.Manual,
                _ => throw new ArgumentOutOfRangeException(nameof(mode)),
            },
        };
    }

    public void SetControlMode(int mode) {
        _controlMode = mode switch {
            0 => MotorcycleControlMode.Assisted,
            1 => MotorcycleControlMode.Raw,
            _ => throw new ArgumentOutOfRangeException(nameof(mode)),
        };
    }

    public void FeedShift(int direction) {
        if (direction is < -1 or > 1)
            throw new ArgumentOutOfRangeException(nameof(direction));
        _pendingGearShift = direction;
    }

    public void SetPaused(bool paused) {
        if (paused) {
            _runtime.Pause();
        } else if (_runtime.Phase == WeekendRidePhase.Paused) {
            _runtime.Resume();
        }
    }

    public void ResetToGrid() {
        _runtime.ResetToGrid();
        _accumulatorSeconds = 0.0;
        _pendingGearShift = 0;
    }

    /// <summary>
    /// Compatibility seam for the generic host smoke only. The Unity ride input uses the typed
    /// control command below; aircraft GKeys never become motorcycle simulation authority.
    /// </summary>
    public void FeedKeyCode(int keyCode, bool pressed) {
        switch (keyCode) {
            case 6:
                SetControls(
                    pressed ? 1.0 : 0.0,
                    _intent.Brake,
                    _intent.Turn,
                    _intent.BodyLateralBias,
                    _intent.BodyForeAftBias,
                    _intent.Clutch);
                break;
            case 7:
                SetControls(
                    _intent.Throttle,
                    pressed ? 1.0 : 0.0,
                    _intent.Turn,
                    _intent.BodyLateralBias,
                    _intent.BodyForeAftBias,
                    _intent.Clutch);
                break;
        }
    }

    public long Advance(double deltaSeconds) {
        if (!double.IsFinite(deltaSeconds) || deltaSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(deltaSeconds));
        // Presentation wall time is not simulation debt. A paused ride resumes from its existing
        // fractional fixed-step residue, never with a catch-up burst.
        if (_runtime.Phase != WeekendRidePhase.Active) return Tick;

        _accumulatorSeconds += Math.Min(deltaSeconds, MaximumFrameDeltaSeconds);
        int ticks = 0;
        while (_accumulatorSeconds + 1e-12 >= FixedDeltaSeconds
            && ticks < MaximumTicksPerAdvance
            && _runtime.Phase == WeekendRidePhase.Active) {
            MotorcycleRiderIntent stepIntent = _intent with {
                GearShiftRequest = _pendingGearShift,
            };
            _pendingGearShift = 0;
            _runtime.StepFixed(stepIntent, _controlMode);
            _completedTicks++;
            _accumulatorSeconds -= FixedDeltaSeconds;
            ticks++;
        }
        return Tick;
    }

    public void AdvanceSeconds(double seconds) {
        if (!double.IsFinite(seconds) || seconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(seconds));
        const double presentationStep = 1.0 / 60.0;
        double remaining = seconds;
        while (remaining > 1e-9) {
            double dt = Math.Min(presentationStep, remaining);
            Advance(dt);
            remaining -= dt;
        }
    }

    public PoseSnapshot CapturePose() {
        WeekendRideSnapshot snapshot = _runtime.Snapshot();
        QuaternionD view = snapshot.ViewAttitude;
        Vec3D levelForward = view.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D viewUp = view.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D playerForward = levelForward * Math.Cos(snapshot.PitchRad)
            + viewUp * Math.Sin(snapshot.PitchRad);
        Vec3D playerLeft = view.Rotate(new Vec3D(-1.0, 0.0, 0.0));
        double headingRad = Math.Atan2(levelForward.X, levelForward.Z);
        double pitchRad = Math.Asin(Math.Clamp(playerForward.Y, -1.0, 1.0));

        return new PoseSnapshot(
            Tick: Tick,
            SimulationTimeS: Tick / PlayerVehicleContract.FixedStepHz,
            Lifecycle: snapshot.Phase.ToString(),
            Player: ToVec(snapshot.PositionWorldM),
            PlayerForward: ToVec(playerForward),
            PlayerLeft: ToVec(playerLeft),
            OpponentPresent: false,
            Bandit: default,
            BanditForward: new Vec3(0.0, 0.0, 1.0),
            BanditLeft: new Vec3(-1.0, 0.0, 0.0),
            PlayerAltitudeFt: snapshot.PositionWorldM.Y * 3.28084,
            PlayerHeadingDeg: NormalizeDegrees(headingRad * (180.0 / Math.PI)),
            PlayerHealthPermille: 1000,
            WeaponsHold: true,
            PitchDeg: pitchRad * (180.0 / Math.PI),
            BankDeg: snapshot.ViewRollRad * (180.0 / Math.PI),
            VerticalSpeedFpm: snapshot.GroundVelocityMps.Y * 196.8503937,
            MissionPack: UnityMissionSelection.WeekendRideMissionPack,
            VehicleSpeedMps: snapshot.SpeedMps,
            EngineRpm: snapshot.Rpm,
            VehicleGear: snapshot.Gear,
            CircuitProgressM: snapshot.CircuitProgressM,
            CircuitLengthM: snapshot.CircuitLengthM,
            NextSectorIndex: snapshot.NextSectorIndex,
            LapCount: snapshot.LapCount,
            WeekendCue: snapshot.GoldenPathToken);
    }

    static MotorcycleRiderIntent NeutralIntent() => new(
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0,
        1.0,
        MotorcycleClutchMode.Auto);

    static double ClampFinite(double value, double minimum, double maximum, string name) {
        if (!double.IsFinite(value)) throw new ArgumentOutOfRangeException(name);
        return Math.Clamp(value, minimum, maximum);
    }

    static Vec3 ToVec(Vec3D value) => new(value.X, value.Y, value.Z);

    static double NormalizeDegrees(double value) =>
        ((value % 360.0) + 360.0) % 360.0;

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        // WeekendRideMissionRuntime owns deterministic managed state only.
    }
}

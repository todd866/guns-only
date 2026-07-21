using GunsOnly.Sim.Propulsion;

namespace GunsOnly.Sim;

public sealed class AircraftSim {
    public const double TickHz = 120.0;
    public AircraftState State { get; private set; }
    /// <summary>
    /// Latest pilot head-to-foot normal specific force, in multiples of standard gravity.
    /// Unlike <see cref="LastNz"/>, this is the complete non-gravitational force acceleration
    /// (aerodynamic, propulsive, and side force) projected onto the aircraft body-up axis. This is
    /// the authoritative input for pilot-physiology models; LastNz remains the legacy wing-lift
    /// diagnostic used by the existing flight-model contracts.
    /// </summary>
    public double LastPilotNormalAccelerationG { get; private set; } = 1.0;
    /// <summary>
    /// True when <see cref="LastPilotNormalAccelerationG"/> came from a complete aerodynamic force
    /// evaluation or was supplied explicitly by the owner of an external contact phase. External
    /// kinematics alone do not contain enough information to reconstruct occupant specific force.
    /// </summary>
    public bool HasValidPilotNormalAcceleration { get; private set; }
    public double LastNz { get; private set; } = 1.0;
    /// Stage-averaged rolling moment applied by the rigid-body model during the latest fixed tick.
    public double LastRollMomentNm { get; private set; }
    /// Integrated flight-control allocation at the physical nozzle/resultant-thrust boundary.
    /// Positive angle commands positive-q (nose-up) moment; zero identifies a fixed nozzle or an
    /// attached-flow condition that does not need propulsive control authority.
    public double LastPitchThrustVectorAngleRad { get; private set; }
    public double LastPitchThrustVectorMomentNm { get; private set; }
    /// The exact control command consumed by the most recent aerodynamic Step. Requested detent
    /// state lives elsewhere; this is actuator-path truth for telemetry and replay.
    public PilotCommand LastAppliedCommand { get; private set; } = NeutralExternalCommand(
        default, 0.0);
    /// False while an external contact model owns kinematics (arrestment, catapult, wreck motion)
    /// or before the first aerodynamic Step. LastAppliedCommand is neutralised in those phases so
    /// consumers cannot accidentally present a stale pilot input as applied control authority.
    public bool HasAppliedFlightCommand { get; private set; }
    public bool Buffet { get; private set; }
    const double BuffetEnterFraction = 0.86;
    const double BuffetExitFraction = 0.80;
    const double BuffetEnterDwellSeconds = 0.075;
    const double BuffetExitDwellSeconds = 0.18;
    double _buffetTransitionSeconds;
    /// Below the actual sea surface. The kernel reports physical contact only; shells own the
    /// continuous crash-to-respawn transition.
    public bool BelowGround => State.Position.Y <= 0.0;
    /// The physical lift direction: body up projected perpendicular to the relative wind.
    public Vec3D LiftDir { get; private set; } = new(0, 1, 0);
    readonly AircraftParams _p;
    IAtmosphereModel _atmosphereModel = StandardAtmosphere1976.Instance;
    /// <summary>
    /// Scenario-owned thermodynamic column. It is an instance dependency rather than global
    /// mutable weather, so two aircraft or two sessions can fly different test conditions in the
    /// same process. Replacing it changes subsequent force/engine evaluations without teleporting
    /// the aircraft or rewriting its physical attitude.
    /// </summary>
    public IAtmosphereModel AtmosphereModel {
        get => _atmosphereModel;
        set {
            ArgumentNullException.ThrowIfNull(value);
            _atmosphereModel = value;
            if (_spoolInit) EvaluateEngineOperatingPoint();
        }
    }
    public AtmosphericState AtmosphericState => AtmosphereModel.Sample(State.Position.Y);
    /// Optional wind/gust field. Null = still air (the aircraft flies exactly as before — the
    /// regression guard). Sampled per RK4 stage at that stage's position, so the integrator sees
    /// the field's spatial structure and a frozen gust pocket bumps you as you fly THROUGH it.
    GunsOnly.Sim.Turbulence.IWindField? _wind;
    public GunsOnly.Sim.Turbulence.IWindField? Wind {
        get => _wind;
        set {
            _wind = value;
            // A different field is a discontinuous environment boundary, not another sample from
            // the previous gust history. Seed the alleviation filters from the replacement field on
            // the next tick instead of blending obsolete carrier burble/turbulence into it.
            _gustFiltered = Vec3D.Zero;
            _gustInit = false;
            _rollGustFiltered = 0.0;
            // Object initializers attach the wind field after construction. Refresh air data at
            // that boundary so a staged/paused aircraft already reports the same relative flow
            // the first integration tick will use.
            _airVelocity = State.VelocityVector() - WindAt(State.Position);
        }
    }
    Vec3D WindAt(in Vec3D pos) => _wind is null ? Vec3D.Zero : _wind.Sample(pos);
    readonly GunsOnly.Sim.Turbulence.RotationalBuffet _buffet;
    Vec3D _gustFiltered; bool _gustInit; double _rollGustFiltered;   // gust-alleviation low-pass state
    Vec3D _airVelocity;
    /// Authoritative velocity relative to the local air mass. Position continues to integrate the
    /// inertial/ground velocity stored by AircraftState.
    public Vec3D AirVelocity => _airVelocity;
    public double AirspeedMps => _airVelocity.Length;
    /// Ideal indicated airspeed (CAS until an airframe-specific instrument/position-error card is
    /// available). Physics continues to consume TAS; pilot-facing recovery standards consume IAS.
    public double IndicatedAirspeedMps => AirData.IndicatedAirspeedMps(
        AirspeedMps, State.Position.Y, AtmosphereModel);
    /// Legacy gust-mode diagnostics used by BuffetedFrame. BodyFrame stays the real rigid attitude.
    public double PitchBuffetRad => _buffet.PitchRad;
    public double YawBuffetRad => _buffet.YawRad;
    public double RollBuffetRad => _buffet.RollRad;
    Vec3D _liftRef;          // zero-bank lift reference, kept perpendicular to velocity, transported through verticals
    double _bank;            // compatibility command-bank state; forces/render use BodyAttitude
    double _reportedBank;    // horizon-referenced compatibility value for State.Bank
    bool _init;
    bool _spoolInit;
    double _thrustFrac;      // engine's actual spool state, 0..1 — lags the throttle lever
    /// What the ENGINE is actually delivering, 0..1, as opposed to where the lever is. The gap
    /// between the two is the whole difficulty of flying the back side of the power curve.
    public double ThrustFraction => _thrustFrac;
    /// <summary>The physical engine point used by every RK stage in the most recent fixed tick.</summary>
    public EngineOperatingPoint LastEngineOperatingPoint { get; private set; } =
        EngineOperatingPoint.Stopped;
    /// <summary>Fuel-system and failure models may remove combustion without rewriting controls.</summary>
    public bool EngineFuelAvailable { get; set; } = true;
    public bool EngineCombustionAvailable { get; set; } = true;
    /// <summary>Actual gear/flap/damage configuration consumed by the continuous force model.</summary>
    public AirframeAerodynamicState AerodynamicConfiguration { get; set; } =
        AirframeAerodynamicState.Clean;
    public Vec3D BodyRight => State.BodyAttitude.Rotate(new Vec3D(1, 0, 0));
    public Vec3D BodyUp => State.BodyAttitude.Rotate(new Vec3D(0, 1, 0));
    public Vec3D BodyForward => State.BodyAttitude.Rotate(new Vec3D(0, 0, 1));
    public double BodyPitchRad => System.Math.Asin(System.Math.Clamp(BodyForward.Y, -1.0, 1.0));
    public double BodyYawRad => System.Math.Atan2(BodyForward.X, BodyForward.Z);
    public double BodyRollRad {
        get {
            var f = BodyForward;
            var up0 = new Vec3D(0, 1, 0) - f * f.Y;
            if (up0.Length < 1e-6) return State.Bank;
            up0 = up0.Normalized();
            var right0 = up0.Cross(f).Normalized();
            return System.Math.Atan2(BodyUp.Dot(right0), BodyUp.Dot(up0));
        }
    }
    /// Aerodynamic incidence from the real body attitude and relative wind.
    public double AngleOfAttackRad {
        get {
            var vhat = _airVelocity.Length < 1e-9 ? State.ForwardDir() : _airVelocity.Normalized();
            return System.Math.Atan2(-vhat.Dot(BodyUp), vhat.Dot(BodyForward));
        }
    }
    public double SideslipRad {
        get {
            var vhat = _airVelocity.Length < 1e-9 ? State.ForwardDir() : _airVelocity.Normalized();
            return System.Math.Asin(System.Math.Clamp(vhat.Dot(BodyRight), -1.0, 1.0));
        }
    }
    internal const double HorizonValidY = 0.94; // |vhat.Y| below this (~|gamma| < 70 deg): horizon bank well-defined

    public AircraftSim(AircraftState initial, AircraftParams p,
        IAtmosphereModel? atmosphere = null) {
        State = initial; _p = p;
        _atmosphereModel = atmosphere ?? StandardAtmosphere1976.Instance;
        _airVelocity = initial.VelocityVector();
        _buffet = new GunsOnly.Sim.Turbulence.RotationalBuffet(p);
        InitFrame(initial.ForwardDir());
        if (!initial.BodyAttitude.IsFinite || initial.BodyAttitude.LengthSquared < 1e-12) {
            double q = 0.5 * AtmosphereModel.Sample(initial.Position.Y).DensityKgM3
                * initial.Speed * initial.Speed;
            double cl = initial.Mass * FlightModel.G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
            double alpha = System.Math.Clamp(cl / p.CLAlpha, p.CLMin / p.CLAlpha, p.CLMax / p.CLAlpha);
            var f = initial.ForwardDir();
            var u = LiftDir;
            var bf = (f * System.Math.Cos(alpha) + u * System.Math.Sin(alpha)).Normalized();
            var bu = (u * System.Math.Cos(alpha) - f * System.Math.Sin(alpha)).Normalized();
            State = initial with { BodyAttitude = QuaternionD.FromFrame(bu.Cross(bf).Normalized(), bu, bf) };
        } else {
            State = initial with { BodyAttitude = initial.BodyAttitude.Normalized() };
        }
    }

    /// <summary>Update gross mass without disturbing position, velocity, attitude, or engine state.</summary>
    public void SetMassKg(double massKg) {
        if (!double.IsFinite(massKg) || massKg <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(massKg));
        State = State with { Mass = massKg };
    }

    /// <summary>
    /// Accept kinematics from an authoritative external physical phase (arrestment/catapult-style
    /// contact integration). This is internal so presentation cannot move an aircraft. Air data and
    /// body-frame compatibility state are refreshed from the supplied world state.
    /// </summary>
    internal void AdoptExternalKinematics(in AircraftState state,
        double? pilotNormalAccelerationG = null) {
        if (!IsFinite(state.Position) || !double.IsFinite(state.Speed)
            || state.Speed < 0.0 || !state.BodyAttitude.IsFinite
            || !state.BodyRates.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(state));
        if (pilotNormalAccelerationG.HasValue
            && !double.IsFinite(pilotNormalAccelerationG.Value))
            throw new ArgumentOutOfRangeException(nameof(pilotNormalAccelerationG));
        State = state with { BodyAttitude = state.BodyAttitude.Normalized() };
        _airVelocity = State.VelocityVector() - WindAt(State.Position);
        _bank = _reportedBank = State.Bank;
        Vec3D vhat = _airVelocity.Length < 1e-9 ? State.ForwardDir() : _airVelocity.Normalized();
        Vec3D bodyUp = State.BodyAttitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        Vec3D liftPlane = bodyUp - vhat * bodyUp.Dot(vhat);
        LiftDir = liftPlane.Length < 1e-9 ? bodyUp : liftPlane.Normalized();
        LastNz = 0.0;
        // Position/velocity/attitude do not reveal the external constraint force. Preserve a
        // neutral numeric value for defensive consumers, but make its invalidity explicit unless
        // the contact model supplies its own occupant-normal acceleration (deck support, impact,
        // catapult pitch, and ballistic wreck motion are materially different cases).
        LastPilotNormalAccelerationG = pilotNormalAccelerationG ?? 1.0;
        HasValidPilotNormalAcceleration = pilotNormalAccelerationG.HasValue;
        LastRollMomentNm = 0.0;
        LastPitchThrustVectorAngleRad = 0.0;
        LastPitchThrustVectorMomentNm = 0.0;
        LastAppliedCommand = NeutralExternalCommand(State, LastAppliedCommand.Throttle);
        HasAppliedFlightCommand = false;
        Buffet = false;
        _buffetTransitionSeconds = 0.0;
    }

    /// <summary>
    /// Preserve spool state across a presentation/entity boundary such as a bolter or catapult
    /// handoff. It does not start a failed or fuel-starved engine.
    /// </summary>
    public void SeedEnginePowerFraction(double powerFraction) {
        if (!double.IsFinite(powerFraction))
            throw new ArgumentOutOfRangeException(nameof(powerFraction));
        _thrustFrac = System.Math.Clamp(powerFraction, 0.0,
            System.Math.Clamp(_p.MaxThrustFraction, 0.0, 1.65));
        _spoolInit = true;
        EvaluateEngineOperatingPoint();
    }

    /// <summary>
    /// Advance engine spool during non-flight phases (arrestment and catapult) where another model
    /// owns the aircraft's translation. Fuel flow and systems RPM therefore keep evolving instead of
    /// freezing until the flight integrator resumes.
    /// </summary>
    public void AdvanceEngineOnly(double throttle, double dt) {
        if (!double.IsFinite(throttle))
            throw new ArgumentOutOfRangeException(nameof(throttle));
        if (!double.IsFinite(dt) || dt < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));
        LastAppliedCommand = NeutralExternalCommand(State, throttle);
        HasAppliedFlightCommand = false;
        LastPitchThrustVectorAngleRad = 0.0;
        LastPitchThrustVectorMomentNm = 0.0;
        AdvanceEngine(throttle, dt);
    }

    void InitFrame(in Vec3D vhat) {
        var up = new Vec3D(0, 1, 0);
        var refH = up - vhat * up.Dot(vhat);
        _liftRef = refH.Length < 1e-6 ? new Vec3D(0, 0, -1) : refH.Normalized();
        _bank = State.Bank; _reportedBank = State.Bank; _init = true;
        LiftDir = ComputeLiftDir(vhat);
    }

    public void Step(in PilotCommand cmd, double dt) {
        LastAppliedCommand = cmd;
        HasAppliedFlightCommand = true;
        var s = State;
        var vel0 = s.VelocityVector();
        var vhat0 = vel0.Length < 1e-9 ? s.ForwardDir() : vel0.Normalized();
        if (!_init) InitFrame(vhat0);

        AdvanceEngine(cmd.Throttle, dt);
        var spooled = cmd with { Throttle = _thrustFrac };

        // GUST ALLEVIATION. A real aircraft averages gusts over its size and its lift lags (unsteady
        // aero, the Küssner effect), so it does NOT feel sub-wingspan eddies as sharp jolts — point-
        // sampling the raw field made turbulence "way too twitchy". Low-pass the sampled gust with a
        // time constant of a few chord-lengths of travel (τ = L/V, so faster flight filters the now-
        // higher-frequency gusts proportionally). This smooths the twitch while keeping the bumps.
        var rawGust = WindAt(s.Position);
        double gustTau = 12.0 / System.Math.Max(vel0.Length, 20.0);
        if (!_gustInit) { _gustFiltered = rawGust; _gustInit = true; }
        else _gustFiltered += (rawGust - _gustFiltered) * (1.0 - System.Math.Exp(-dt / gustTau));
        var gust = _gustFiltered;

        var r = new RawState(s.Position, vel0, _bank, s.Mass, s.BodyAttitude, s.BodyRates);
        double thrustN = LastEngineOperatingPoint.NetThrustN;
        var configuration = AerodynamicConfiguration;
        var k1 = FlightModel.Derivatives(r, spooled, _p, _liftRef, gust, thrustN,
            configuration, AtmosphereModel);
        var k2 = FlightModel.Derivatives(Apply(r, k1, dt / 2), spooled, _p, _liftRef, gust,
            thrustN, configuration, AtmosphereModel);
        var k3 = FlightModel.Derivatives(Apply(r, k2, dt / 2), spooled, _p, _liftRef, gust,
            thrustN, configuration, AtmosphereModel);
        var k4 = FlightModel.Derivatives(Apply(r, k3, dt), spooled, _p, _liftRef, gust,
            thrustN, configuration, AtmosphereModel);
        var pos = r.Pos + (k1.DPos + (k2.DPos + k3.DPos) * 2 + k4.DPos) * (dt / 6);
        var vel = r.Vel + (k1.DVel + (k2.DVel + k3.DVel) * 2 + k4.DVel) * (dt / 6);
        _bank = WrapPi(r.Bank + (k1.DBank + 2 * (k2.DBank + k3.DBank) + k4.DBank) * (dt / 6));
        var attitude = (r.Attitude + (k1.DAttitude + (k2.DAttitude + k3.DAttitude) * 2 + k4.DAttitude) * (dt / 6)).Normalized();
        var bodyRates = r.BodyRates + (k1.DBodyRates + (k2.DBodyRates + k3.DBodyRates) * 2 + k4.DBodyRates) * (dt / 6);
        LastRollMomentNm = (k1.RollMomentNm + 2.0 * (k2.RollMomentNm + k3.RollMomentNm)
            + k4.RollMomentNm) / 6.0;

        double speed = vel.Length;
        // Translational state is never rewritten to a minimum flying speed. At the exact zero-vector
        // crossing only its coordinate direction is undefined, so retain the previous direction while
        // gravity/thrust produce the next real velocity. Force magnitudes use actual airspeed.
        var vhat = speed < 1e-9 ? vhat0 : vel * (1.0 / speed);

        // Parallel-transport the lift reference perpendicular to the new velocity.
        var lr = _liftRef - vhat * _liftRef.Dot(vhat);
        _liftRef = lr.Length < 1e-6 ? FallbackRef(vhat) : lr.Normalized();

        // Horizon re-anchor: snap the reference to the horizon frame and re-express the SAME
        // world lift direction, so _bank == horizon bank in normal flight, continuous through verticals.
        if (System.Math.Abs(vhat.Y) < HorizonValidY) {
            var up = new Vec3D(0, 1, 0);
            var upPerpH = (up - vhat * up.Dot(vhat)).Normalized();
            var rightH = upPerpH.Cross(vhat).Normalized(); // physical right (reversed operands, left-handed basis)
            var rightRef = _liftRef.Cross(vhat).Normalized();
            var liftDir = _liftRef * System.Math.Cos(_bank) + rightRef * System.Math.Sin(_bank);
            _bank = System.Math.Atan2(liftDir.Dot(rightH), liftDir.Dot(upPerpH));
            _liftRef = upPerpH;
            _reportedBank = _bank;
        } else {
            // Horizon bank is undefined at the pole. Express the REAL body lift plane in the
            // parallel-transported frame instead; this is continuous through straight up/down and
            // gives DetentLayer the actual body-roll phase needed to keep its manoeuvre plane honest.
            var bodyUp = attitude.Rotate(new Vec3D(0, 1, 0));
            var bodyLiftPlane = bodyUp - vhat * bodyUp.Dot(vhat);
            if (bodyLiftPlane.Length >= 1e-9) {
                var bodyLift = bodyLiftPlane.Normalized();
                var rightRef = _liftRef.Cross(vhat).Normalized();
                _bank = System.Math.Atan2(bodyLift.Dot(rightRef), bodyLift.Dot(_liftRef));
            }
            _reportedBank = _bank; // transported body bank; HUD may treat it as invalid near vertical
        }

        double gamma = System.Math.Asin(System.Math.Clamp(vhat.Y, -1, 1));
        double chi = System.Math.Atan2(vhat.X, vhat.Z); // 0 = north(+Z), positive toward east(+X)
        if (!IsFinite(pos) || !double.IsFinite(speed) || !double.IsFinite(_bank) || !attitude.IsFinite || !bodyRates.IsFinite)
            throw new System.InvalidOperationException("non-finite sim state");
        State = new AircraftState(pos, speed, gamma, chi, _reportedBank, s.Mass, attitude, bodyRates);

        var finalRaw = new RawState(pos, vel, _bank, s.Mass, attitude, bodyRates);
        var aero = FlightModel.Aerodynamics(finalRaw, spooled, _p, gust, thrustN,
            configuration, AtmosphereModel);
        _airVelocity = aero.AirVelocity;
        LastNz = aero.Nz;
        LastPitchThrustVectorAngleRad = aero.PitchThrustVectorAngleRad;
        LastPitchThrustVectorMomentNm = aero.PitchThrustVectorMomentNm;
        var nonGravitationalAcceleration = aero.Accel + new Vec3D(0.0, FlightModel.G0, 0.0);
        LastPilotNormalAccelerationG = nonGravitationalAcceleration.Dot(BodyUp)
            / FlightModel.G0;
        HasValidPilotNormalAcceleration = true;
        LiftDir = aero.LiftDir;
        var (_, nzMax, nzMin) = FlightModel.ClampNz(State, cmd, _p, AirspeedMps,
            configuration, AtmosphereModel);
        UpdateBuffetCue(cmd.GDemand, nzMax, nzMin, dt);

        // Drive the rotational buffet from the gust and its gradient across the airframe. Pitch is
        // forced by the vertical-gust AoA at the CG, yaw by the lateral-gust sideslip, roll by the
        // vertical-gust DIFFERENCE across the span (right wing sees more updraft → rolls left). The
        // modes are integrated EVERY step (not only when there's wind) so they ring DOWN to rest
        // when the air calms — skipping the update would freeze the shudder mid-oscillation.
        double alphaGust = 0.0, betaGust = 0.0, rollGust = 0.0;
        if (Wind is not null) {
            var up = LiftDir;
            var rb = up.Cross(vhat);
            var right = rb.Length < 1e-6 ? new Vec3D(1, 0, 0) : rb.Normalized();
            double v = System.Math.Max(speed, 20.0);
            // Pitch and yaw off the gust-alleviated CG gust (already low-passed above) — so the
            // shudder rides the same smoothed gust as the flight-path bump, not the raw twitch.
            alphaGust = _gustFiltered.Dot(up) / v;
            betaGust = _gustFiltered.Dot(right) / v;
            // Roll off the span differential, itself low-passed at the same rate.
            double halfSpan = System.Math.Sqrt(_p.WingAreaM2);
            var bpos = State.Position;
            double rawRoll = (WindAt(bpos - right * halfSpan).Dot(up) - WindAt(bpos + right * halfSpan).Dot(up)) / v;
            _rollGustFiltered += (rawRoll - _rollGustFiltered) * (1.0 - System.Math.Exp(-dt / (12.0 / v)));
            rollGust = _rollGustFiltered;
        }
        _buffet.Step(alphaGust, betaGust, rollGust, dt);
    }

    static PilotCommand NeutralExternalCommand(in AircraftState state, double throttle) => new(
        GDemand: 0.0,
        BankTarget: state.Bank,
        Throttle: double.IsFinite(throttle) ? throttle : 0.0,
        Rudder: 0.0,
        RollControl: 0.0,
        SasRollControl: 0.0,
        DirectLateralControl: true);

    void UpdateBuffetCue(double gDemand, double nzMax, double nzMin, double dt) {
        double positiveFraction = nzMax > 1e-6 ? gDemand / nzMax : double.NegativeInfinity;
        double negativeFraction = nzMin < -1e-6 ? gDemand / nzMin : double.NegativeInfinity;
        double limitFraction = System.Math.Max(positiveFraction, negativeFraction);
        bool desired = Buffet
            ? limitFraction > BuffetExitFraction
            : limitFraction >= BuffetEnterFraction;
        if (desired == Buffet) {
            _buffetTransitionSeconds = 0.0;
            return;
        }

        _buffetTransitionSeconds += dt;
        double dwell = desired ? BuffetEnterDwellSeconds : BuffetExitDwellSeconds;
        if (_buffetTransitionSeconds < dwell) return;
        Buffet = desired;
        _buffetTransitionSeconds = 0.0;
    }

    void AdvanceEngine(double throttle, double dt) {
        // First aircraft ever built by this sim is trimmed, not spooling up from idle: snap to the
        // opening lever position, then lag every change after that. A failed/starved engine has a
        // zero target; combustion thrust and fuel flow disappear immediately while a future engine
        // dynamics layer can replace the present stopped-RPM approximation with windmilling RPM.
        double leverStop = System.Math.Clamp(_p.MaxThrustFraction, 0.0, 1.65);
        bool canRun = EngineFuelAvailable && EngineCombustionAvailable && _p.ThrustMaxN > 0.0;
        double lever = canRun ? System.Math.Clamp(throttle, 0.0, leverStop) : 0.0;
        if (!_spoolInit) { _thrustFrac = lever; _spoolInit = true; }
        double tau = lever > _thrustFrac ? _p.SpoolUpTau : _p.SpoolDownTau;
        if (tau > 1e-6) {
            _thrustFrac += (lever - _thrustFrac) * (1.0 - System.Math.Exp(-dt / tau));
        } else {
            _thrustFrac = lever;
        }
        EvaluateEngineOperatingPoint();
    }

    void EvaluateEngineOperatingPoint() {
        bool running = EngineFuelAvailable && EngineCombustionAvailable && _p.ThrustMaxN > 0.0;
        if (!running) {
            LastEngineOperatingPoint = EngineOperatingPoint.Stopped;
            return;
        }

        AtmosphericState atmosphericState = AtmosphereModel.Sample(State.Position.Y);
        double mach = AirspeedMps / System.Math.Max(atmosphericState.SpeedOfSoundMps, 1e-6);
        if (_p.PropulsionModel == PropulsionModelKind.J47Ge27) {
            // The checked-in J47 map is explicitly a standard-day altitude surface. Local
            // temperature still supplies the physically correct Mach input, but applying an
            // invented non-standard-day thrust correction would imply data the source does not
            // contain. A future engine deck can consume pressure/temperature through its API.
            LastEngineOperatingPoint = J47PerformanceMap.Evaluate(_thrustFrac,
                State.Position.Y, mach, running: true);
            return;
        }

        double densityRatio = atmosphericState.DensityKgM3 / AirData.SeaLevelDensityKgM3;
        // Transparent generic afterburning-turbofan surrogate: gross thrust lapses approximately
        // with sqrt(density ratio), while bounded inlet ram recovery grows with Mach. This avoids
        // applying the legacy turbojet/toy density-linear lapse to Mission 7, but remains explicitly
        // short of an OEM engine deck. Sea-level over-recovery is capped and no hidden supercruise,
        // nozzle schedule, installation loss, or classified control law is implied.
        double thrustLapse = _p.PropulsionModel
            == PropulsionModelKind.AfterburningTurbofanPublicDataSurrogate
                ? System.Math.Clamp(System.Math.Sqrt(System.Math.Max(0.0, densityRatio))
                    * (1.0 + 0.10 * System.Math.Clamp(mach, 0.0, 1.5)), 0.30, 1.05)
                : densityRatio;
        double thrustN = _thrustFrac * _p.ThrustMaxN * thrustLapse;
        double corePower = System.Math.Clamp(_thrustFrac, 0.0, 1.0);
        double genericLeverStop = System.Math.Clamp(_p.MaxThrustFraction, 0.0, 1.65);
        double fuelFlow = _p.GenericIdleFuelFlowLbPerMinute;
        if (_p.GenericMilitaryFuelFlowLbPerMinute > 0.0) {
            fuelFlow += (_p.GenericMilitaryFuelFlowLbPerMinute
                - _p.GenericIdleFuelFlowLbPerMinute) * corePower;
            if (_thrustFrac > 1.0 && genericLeverStop > 1.0) {
                double afterburner = System.Math.Clamp(
                    (_thrustFrac - 1.0) / (genericLeverStop - 1.0), 0.0, 1.0);
                fuelFlow += (_p.GenericAfterburnerFuelFlowLbPerMinute
                    - _p.GenericMilitaryFuelFlowLbPerMinute) * afterburner;
            }
        }
        LastEngineOperatingPoint = new EngineOperatingPoint(
            Rpm: 100.0 * corePower,
            RpmPercent: 100.0 * corePower,
            NetThrustN: thrustN,
            NetThrustLbf: thrustN / J47PerformanceMap.NewtonsPerPoundForce,
            FuelFlowLbPerMinute: System.Math.Max(0.0, fuelFlow),
            Running: true);
    }

    /// The render attitude WITH the buffet shudder applied: forward and up (canopy) vectors that
    /// include the gust-driven nose saw / wing rock, so a shell that renders from these SEES the
    /// shudder. In still air (buffet ≈ 0) it equals the clean flight-path attitude exactly. Small
    /// exact rotations: roll about the flight axis, then pitch about the right axis, then yaw
    /// about the up axis, re-orthogonalising between each so the result stays a clean basis.
    public void BuffetedFrame(out Vec3D fwd, out Vec3D up) => RenderFrame(0.0, out fwd, out up);

    /// The integrated rigid-body attitude. Nose is the body forward axis; no flight-path/AoA synthesis.
    public void BodyFrame(out Vec3D fwd, out Vec3D up) { fwd = BodyForward; up = BodyUp; }

    /// Compatibility overload: attitude commands now enter the moment controller, never the renderer.
    public void BodyFrame(double _, out Vec3D fwd, out Vec3D up) => BodyFrame(out fwd, out up);

    void RenderFrame(double extraPitch, out Vec3D fwd, out Vec3D up) {
        var f = State.ForwardDir();
        var u0 = LiftDir - f * LiftDir.Dot(f);
        var u = u0.Length < 1e-9 ? FallbackRef(f) : u0.Normalized();
        double pitch = _buffet.PitchRad + extraPitch, yaw = _buffet.YawRad, roll = _buffet.RollRad;

        var right = SafeRight(u, f);                       // physical right (left-handed: up × fwd)
        u = (u * System.Math.Cos(roll) + right * System.Math.Sin(roll)).Normalized();   // right-wing-down → canopy tilts right

        right = SafeRight(u, f);
        var fPitched = (f * System.Math.Cos(pitch) + u * System.Math.Sin(pitch)).Normalized();  // nose-up
        u = (u * System.Math.Cos(pitch) - f * System.Math.Sin(pitch)).Normalized();
        f = fPitched;

        right = SafeRight(u, f);
        f = (f * System.Math.Cos(yaw) + right * System.Math.Sin(yaw)).Normalized();     // nose-right

        fwd = f;
        var cleanUp = u - fwd * u.Dot(fwd);
        up = cleanUp.Length < 1e-9 ? FallbackRef(fwd) : cleanUp.Normalized();
    }
    static Vec3D SafeRight(in Vec3D up, in Vec3D fwd) {
        var r = up.Cross(fwd);
        return r.Length < 1e-9 ? new Vec3D(1, 0, 0) : r.Normalized();
    }

    Vec3D ComputeLiftDir(in Vec3D vhat) {
        var rightRef = _liftRef.Cross(vhat);
        var right = rightRef.Length < 1e-6 ? new Vec3D(1, 0, 0) : rightRef.Normalized();
        return (_liftRef * System.Math.Cos(_bank) + right * System.Math.Sin(_bank)).Normalized();
    }

    static Vec3D FallbackRef(in Vec3D vhat) {
        var alt = new Vec3D(0, 0, 1);
        var lr = alt - vhat * alt.Dot(vhat);
        return lr.Length < 1e-6 ? new Vec3D(1, 0, 0) : lr.Normalized();
    }
    static RawState Apply(in RawState r, in StateDeriv d, double h) =>
        new(r.Pos + d.DPos * h, r.Vel + d.DVel * h, r.Bank + d.DBank * h, r.Mass,
            r.Attitude + d.DAttitude * h, r.BodyRates + d.DBodyRates * h);
    static double WrapPi(double a) => System.Math.IEEERemainder(a, 2 * System.Math.PI); // O(1)
    static bool IsFinite(in Vec3D v) => double.IsFinite(v.X) && double.IsFinite(v.Y) && double.IsFinite(v.Z);
}

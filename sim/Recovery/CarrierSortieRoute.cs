namespace GunsOnly.Sim.Recovery;

/// <summary>
/// Deterministic, carrier-relative route state for a short whole-sortie carrier training card.
/// The route is guidance, never an autopilot: the player still owns every control input.  The
/// fixed outbound fixes are anchored when the sortie is staged, while the return fixes follow the
/// moving ship.  That split gives departure a replay-stable ground track without pretending that
/// HomePlate stops steaming while the aircraft is away.
/// </summary>
public enum CarrierSortieRoutePhase {
    Unavailable = 0,
    OnDeck = 1,
    Departure = 2,
    Outbound = 3,
    Transit = 4,
    AwaitingReturn = 5,
    Return = 6,
    Recovery = 7,
    Groove = 8,
    Complete = 9,
}

public enum CarrierSortieRouteFix {
    None = 0,
    Departure = 1,
    Outbound = 2,
    Transit = 3,
    ReturnInitial = 4,
    RecoveryInitial = 5,
    Groove = 6,
    Deck = 7,
}

public readonly record struct CarrierSortieRouteState(
    bool Active,
    string ProfileId,
    CarrierSortieRoutePhase Phase,
    CarrierSortieRouteFix ActiveFix,
    Vec3D TargetPosition,
    double TargetSpeedMps,
    double CaptureRadiusM,
    double DistanceToTargetM,
    bool RtbAvailable,
    bool RtbRequested) {

    public static CarrierSortieRouteState Unavailable => new(
        Active: false,
        ProfileId: "",
        Phase: CarrierSortieRoutePhase.Unavailable,
        ActiveFix: CarrierSortieRouteFix.None,
        TargetPosition: default,
        TargetSpeedMps: 0.0,
        CaptureRadiusM: 0.0,
        DistanceToTargetM: 0.0,
        RtbAvailable: false,
        RtbRequested: false);
}

/// <summary>
/// Small state machine for the Korea carrier day: catapult, a finite three-fix departure, a
/// deliberate pilot RTB command, then a moving-ship straight-in.  Distances and heights are an
/// explicitly versioned training-card profile, not claimed historical Essex procedure data.
/// </summary>
public sealed class CarrierSortieRouteDirector {
    public const string KoreaDayProfileId = "PROVISIONAL_KOREA_CARRIER_DAY_V1";
    // ReturnInitial is an approach-entry fix, not another transit waypoint.  Keep its commanded
    // speed below the early-jet configuration neighborhood, then make the final step-down explicit
    // at RecoveryInitial.  Both values scale with the loaded aircraft's computed on-speed.
    public const double ReturnEntrySpeedMultiple = 1.45;
    public const double RecoveryEntrySpeedMultiple = 1.35;

    const double DepartureAlongM = 3_500.0;
    const double DepartureHeightM = 600.0;
    const double OutboundAlongM = 8_000.0;
    const double OutboundCrossM = 2_500.0;
    const double OutboundHeightM = 1_300.0;
    const double TransitAlongM = 12_000.0;
    const double TransitCrossM = 5_000.0;
    const double TransitHeightM = 1_800.0;
    const double ReturnInitialAlongM = -8_000.0;
    const double ReturnInitialHeightM = 520.0;
    const double RecoveryInitialAlongM = -3_000.0;
    const double RecoveryInitialHeightM = 185.0;
    const double GrooveAlongM = -800.0;
    const double GrooveHeightM = 49.0;

    Vec3D _departure;
    Vec3D _outbound;
    Vec3D _transit;
    double _climbSpeedMps;
    double _transitSpeedMps;
    double _returnSpeedMps;
    double _approachSpeedMps;
    CarrierSortieRoutePhase _phase;
    bool _rtbRequested;

    public CarrierSortieRouteState State { get; private set; } =
        CarrierSortieRouteState.Unavailable;

    public void Reset() {
        _departure = default;
        _outbound = default;
        _transit = default;
        _climbSpeedMps = 0.0;
        _transitSpeedMps = 0.0;
        _returnSpeedMps = 0.0;
        _approachSpeedMps = 0.0;
        _phase = CarrierSortieRoutePhase.Unavailable;
        _rtbRequested = false;
        State = CarrierSortieRouteState.Unavailable;
    }

    public void Configure(Carrier carrier, double approachSpeedMps,
        bool enabled) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (!double.IsFinite(approachSpeedMps) || approachSpeedMps <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(approachSpeedMps));
        if (!enabled) {
            Reset();
            return;
        }

        Vec3D origin = carrier.Position;
        _departure = origin + carrier.Fwd * DepartureAlongM
            + new Vec3D(0.0, DepartureHeightM, 0.0);
        _outbound = origin + carrier.Fwd * OutboundAlongM
            + carrier.Right * OutboundCrossM
            + new Vec3D(0.0, OutboundHeightM, 0.0);
        _transit = origin + carrier.Fwd * TransitAlongM
            + carrier.Right * TransitCrossM
            + new Vec3D(0.0, TransitHeightM, 0.0);
        _approachSpeedMps = approachSpeedMps;
        _climbSpeedMps = 2.2 * approachSpeedMps;
        _transitSpeedMps = 2.7 * approachSpeedMps;
        _returnSpeedMps = ReturnEntrySpeedMultiple * approachSpeedMps;
        _phase = CarrierSortieRoutePhase.OnDeck;
        _rtbRequested = false;
        Publish(carrier, origin, CarrierSortieRouteFix.Departure,
            _departure, _climbSpeedMps, captureRadiusM: 900.0);
    }

    /// <summary>
    /// Accept the cockpit's existing O/KNOCK-IT-OFF rising edge as RETURN TO SHIP for this
    /// non-combat carrier card.  The request is latched only after the catapult has handed the
    /// aeroplane back to flight, so an accidental pre-launch key cannot skip the departure.
    /// </summary>
    public bool TryRequestRtb(Carrier carrier, in AircraftState player) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (!State.Active || !State.RtbAvailable || _rtbRequested) return false;
        _rtbRequested = true;
        _phase = CarrierSortieRoutePhase.Return;
        Vec3D target = carrier.LandingPoint(
            ReturnInitialAlongM, 0.0, ReturnInitialHeightM);
        Publish(carrier, player.Position, CarrierSortieRouteFix.ReturnInitial,
            target, _returnSpeedMps, captureRadiusM: 1_200.0);
        return true;
    }

    public void Step(Carrier carrier, in AircraftState player,
        bool catapultActive, bool sortieComplete) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (!State.Active) return;
        if (sortieComplete) {
            _phase = CarrierSortieRoutePhase.Complete;
            Publish(carrier, player.Position, CarrierSortieRouteFix.Deck,
                carrier.TouchdownPoint, 0.0, captureRadiusM: 0.0);
            return;
        }

        if (catapultActive) {
            _phase = CarrierSortieRoutePhase.OnDeck;
        } else if (_phase == CarrierSortieRoutePhase.OnDeck) {
            _phase = _rtbRequested
                ? CarrierSortieRoutePhase.Return
                : CarrierSortieRoutePhase.Departure;
        }

        if (_rtbRequested && _phase is >= CarrierSortieRoutePhase.Departure
            and <= CarrierSortieRoutePhase.AwaitingReturn)
            _phase = CarrierSortieRoutePhase.Return;

        Vec3D target;
        CarrierSortieRouteFix fix;
        double targetSpeed;
        double capture;
        switch (_phase) {
            case CarrierSortieRoutePhase.OnDeck:
                target = _departure;
                fix = CarrierSortieRouteFix.Departure;
                targetSpeed = _climbSpeedMps;
                capture = 900.0;
                break;
            case CarrierSortieRoutePhase.Departure:
                target = _departure;
                fix = CarrierSortieRouteFix.Departure;
                targetSpeed = _climbSpeedMps;
                capture = 900.0;
                if (Distance(player.Position, target) <= capture) {
                    _phase = CarrierSortieRoutePhase.Outbound;
                    target = _outbound;
                    fix = CarrierSortieRouteFix.Outbound;
                    targetSpeed = _transitSpeedMps;
                    capture = 1_100.0;
                }
                break;
            case CarrierSortieRoutePhase.Outbound:
                target = _outbound;
                fix = CarrierSortieRouteFix.Outbound;
                targetSpeed = _transitSpeedMps;
                capture = 1_100.0;
                if (Distance(player.Position, target) <= capture) {
                    _phase = CarrierSortieRoutePhase.Transit;
                    target = _transit;
                    fix = CarrierSortieRouteFix.Transit;
                    capture = 1_300.0;
                }
                break;
            case CarrierSortieRoutePhase.Transit:
                target = _transit;
                fix = CarrierSortieRouteFix.Transit;
                targetSpeed = _transitSpeedMps;
                capture = 1_300.0;
                if (Distance(player.Position, target) <= capture)
                    _phase = CarrierSortieRoutePhase.AwaitingReturn;
                break;
            case CarrierSortieRoutePhase.AwaitingReturn:
                target = _transit;
                fix = CarrierSortieRouteFix.Transit;
                targetSpeed = _transitSpeedMps;
                capture = 1_300.0;
                break;
            case CarrierSortieRoutePhase.Return:
                target = carrier.LandingPoint(
                    ReturnInitialAlongM, 0.0, ReturnInitialHeightM);
                fix = CarrierSortieRouteFix.ReturnInitial;
                targetSpeed = _returnSpeedMps;
                capture = 1_200.0;
                var returnFrame = carrier.LandingAircraftSupportFrame(player.Position);
                double returnHeadingError = Math.IEEERemainder(
                    player.Chi - carrier.LandingHeadingRad, 2.0 * Math.PI);
                double returnLateralSpeedMps = carrier.DeckRelativeVelocity(player)
                    .Dot(carrier.LandingRight);
                bool reachedReturnInitial =
                    Math.Abs(returnFrame.along - ReturnInitialAlongM) <= capture
                    && Math.Abs(returnFrame.cross) <= 100.0
                    && Math.Abs(returnFrame.height - ReturnInitialHeightM) <= 400.0
                    && Math.Abs(returnHeadingError) <= 0.12
                    && Math.Abs(returnLateralSpeedMps) <= 15.0;
                if (reachedReturnInitial) {
                    _phase = CarrierSortieRoutePhase.Recovery;
                    target = carrier.LandingPoint(
                        RecoveryInitialAlongM, 0.0, RecoveryInitialHeightM);
                    fix = CarrierSortieRouteFix.RecoveryInitial;
                    targetSpeed = RecoveryEntrySpeedMultiple * _approachSpeedMps;
                    capture = 650.0;
                }
                break;
            case CarrierSortieRoutePhase.Recovery:
                target = carrier.LandingPoint(
                    RecoveryInitialAlongM, 0.0, RecoveryInitialHeightM);
                fix = CarrierSortieRouteFix.RecoveryInitial;
                targetSpeed = RecoveryEntrySpeedMultiple * _approachSpeedMps;
                capture = 650.0;
                // A spherical gate can be "captured" almost entirely abeam: the original 650 m
                // sphere admitted a pass 644 m off centreline, then labelled it Groove even though
                // Carrier.InApproachSlot correctly rejects anything beyond 220 m. Even the edge of
                // that broad capture slot proved too late for a stable handoff, so require a real
                // centreline intercept with the nose and lateral motion already settled before
                // handing authority to the groove.
                var recoveryFrame = carrier.LandingAircraftSupportFrame(player.Position);
                double lineupHeadingError = Math.IEEERemainder(
                    player.Chi - carrier.LandingHeadingRad, 2.0 * Math.PI);
                double lateralSpeedMps = carrier.DeckRelativeVelocity(player)
                    .Dot(carrier.LandingRight);
                bool plausiblyLinedUp =
                    Math.Abs(recoveryFrame.along - RecoveryInitialAlongM) <= capture
                    // Match the carrier's public approach-slot lateral boundary. Heading and
                    // lateral-rate gates below distinguish a stable intercept near that edge from
                    // the earlier 644 m abeam spherical false-positive.
                    && Math.Abs(recoveryFrame.cross) <= 220.0
                    && Math.Abs(recoveryFrame.height - RecoveryInitialHeightM) <= 250.0
                    && Math.Abs(lineupHeadingError) <= 0.12
                    && Math.Abs(lateralSpeedMps) <= 8.0;
                if (plausiblyLinedUp) {
                    _phase = CarrierSortieRoutePhase.Groove;
                    target = carrier.LandingPoint(GrooveAlongM, 0.0, GrooveHeightM);
                    fix = CarrierSortieRouteFix.Groove;
                    targetSpeed = _approachSpeedMps;
                    capture = 300.0;
                }
                break;
            case CarrierSortieRoutePhase.Groove:
                target = carrier.LandingPoint(GrooveAlongM, 0.0, GrooveHeightM);
                fix = CarrierSortieRouteFix.Groove;
                targetSpeed = _approachSpeedMps;
                capture = 300.0;
                break;
            case CarrierSortieRoutePhase.Complete:
                target = carrier.TouchdownPoint;
                fix = CarrierSortieRouteFix.Deck;
                targetSpeed = 0.0;
                capture = 0.0;
                break;
            default:
                Reset();
                return;
        }

        Publish(carrier, player.Position, fix, target, targetSpeed, capture);
    }

    void Publish(Carrier carrier, in Vec3D playerPosition,
        CarrierSortieRouteFix fix, in Vec3D target, double targetSpeedMps,
        double captureRadiusM) {
        bool rtbAvailable = _phase != CarrierSortieRoutePhase.OnDeck
            && _phase != CarrierSortieRoutePhase.Unavailable
            && _phase != CarrierSortieRoutePhase.Complete;
        State = new CarrierSortieRouteState(
            Active: true,
            ProfileId: KoreaDayProfileId,
            Phase: _phase,
            ActiveFix: fix,
            TargetPosition: target,
            TargetSpeedMps: targetSpeedMps,
            CaptureRadiusM: captureRadiusM,
            DistanceToTargetM: Distance(playerPosition, target),
            RtbAvailable: rtbAvailable,
            RtbRequested: _rtbRequested);
    }

    static double Distance(in Vec3D a, in Vec3D b) => (a - b).Length;
}

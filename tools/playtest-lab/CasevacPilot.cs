using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.PlaytestLab;

/// <summary>
/// A deterministic, observation-only CASEVAC pilot for the playtest lab.  Navigation is shared
/// by all profiles and comes from CasevacFlightRuntime.TargetGuidance (the authored route), so the
/// clone profile does not claim that the owner combat clone learned rotary-wing flying.
/// </summary>
public sealed class CasevacPilot
{
    const double ArrivalRadiusM = 11.0;
    const double LandingRadiusM = 3.4;
    const double LandingAglM = 1.45;
    const double CruiseAglM = 34.0;

    readonly string _pilot;
    readonly int _seed;
    readonly double _speedScale;
    readonly double _reaction;
    readonly double _altitudeBiasM;
    GKey? _heldRudder;
    GKey? _heldThrottle;
    bool _quietSkipped;

    public CasevacPilot(string pilot, int seed)
    {
        _pilot = (pilot ?? string.Empty).Trim().ToLowerInvariant();
        if (_pilot is not ("clone" or "novice" or "ace"))
            throw new ArgumentException(
                "CASEVAC pilot must be clone, novice, or ace.", nameof(pilot));
        _seed = seed;

        // Keep the profiles deliberately close: this is a playtest instrument, not a second
        // CASEVAC game mode. Seeded variation makes repeated sorties comparable and replayable.
        double variation = (((seed % 17) + 17) % 17 - 8) * 0.0025;
        (_speedScale, _reaction, _altitudeBiasM) = _pilot switch
        {
            "ace" => (1.00 + variation, 1.0, 0.0),
            "novice" => (0.82 + variation, 0.68, 0.5),
            // The owner clone supplies combat behaviour elsewhere in the lab. CASEVAC uses this
            // common authored navigation policy rather than pretending the clone is rotor-trained.
            _ => (0.94 + variation, 0.88, 0.8)
        };
    }

    /// <summary>Drives one active fixed-step tick and returns a stable semantic mode.</summary>
    public string Drive(SimulationSession session)
    {
        ArgumentNullException.ThrowIfNull(session);
        CasevacFlightRuntime? flight = session.CasevacFlight;
        if (flight is null)
            return "unsupported";

        CasevacPhase phase = flight.Snapshot.Phase;
        if (phase == CasevacPhase.Quiet)
        {
            ReleaseDiscrete(session);
            session.SetAnalogPitchControl(0.0);
            session.SetAnalogRollControl(0.0);
            if (!_quietSkipped)
            {
                _quietSkipped = session.RequestCasevacQuietSkip();
                if (_quietSkipped)
                    return "debrief";
            }
            return "quiet";
        }

        if (phase is CasevacPhase.Complete
            or CasevacPhase.Aborted
            or CasevacPhase.AircraftLost)
        {
            ReleaseDiscrete(session);
            session.SetAnalogPitchControl(0.0);
            session.SetAnalogRollControl(0.0);
            return phase == CasevacPhase.Complete ? "finished" : "dead";
        }

        if (phase is CasevacPhase.Loading or CasevacPhase.Handoff)
        {
            ReleaseDiscrete(session);
            session.SetAnalogPitchControl(0.0);
            session.SetAnalogRollControl(0.0);
            return phase == CasevacPhase.Loading ? "loading" : "handoff";
        }

        CasevacResolvedLocation target = phase switch
        {
            CasevacPhase.AbortReturn => flight.SafeExitLocation,
            CasevacPhase.Outbound or CasevacPhase.DropoffApproach =>
                flight.ReceiverLocation,
            _ => flight.PickupLocation
        };
        CasevacTargetGuidance guidance = flight.TargetGuidance;
        PlayerVehicleObservation observation = flight.VehicleObservation;

        bool terminalApproach = phase is CasevacPhase.PickupApproach
            or CasevacPhase.DropoffApproach;
        double dx = target.EastM - observation.PositionWorldM.X;
        double dz = target.NorthM - observation.PositionWorldM.Z;
        double terminalDistance = Math.Sqrt(dx * dx + dz * dz);
        Vec3D waypoint = guidance.TargetId is null
            || (terminalApproach && terminalDistance <= ArrivalRadiusM)
            ? new Vec3D(target.EastM, target.SurfaceElevationM, target.NorthM)
            : guidance.TargetWorldM;
        dx = waypoint.X - observation.PositionWorldM.X;
        dz = waypoint.Z - observation.PositionWorldM.Z;
        double distance = Math.Sqrt(dx * dx + dz * dz);
        double yaw = observation.YawRad;
        double bearing = distance > 1e-6 ? Math.Atan2(dx, dz) : yaw;
        double yawError = WrapPi(bearing - yaw);

        double eastSpeed = dx * UnitOrZero(distance);
        double northSpeed = dz * UnitOrZero(distance);
        double forwardEast = Math.Sin(yaw);
        double forwardNorth = Math.Cos(yaw);
        double rightEast = Math.Cos(yaw);
        double rightNorth = -Math.Sin(yaw);
        double requestedSpeed = terminalApproach
            ? Math.Min(CasevacFlightRuntime.MaximumForwardSpeedMps,
                terminalDistance * (_pilot == "novice" ? 0.09 : 0.13))
            : CasevacFlightRuntime.MaximumForwardSpeedMps * _speedScale;
        if (terminalApproach && terminalDistance <= LandingRadiusM)
            requestedSpeed = 0.0;

        double forward = (eastSpeed * forwardEast + northSpeed * forwardNorth)
            * requestedSpeed / Math.Max(distance, 1.0)
            / CasevacFlightRuntime.MaximumForwardSpeedMps;
        double right = (eastSpeed * rightEast + northSpeed * rightNorth)
            * requestedSpeed / Math.Max(distance, 1.0)
            / CasevacFlightRuntime.MaximumLateralSpeedMps;
        // Novice reacts more slowly and permits a little more lateral error; the clone and ace
        // still use exactly the same route and target selection.
        forward *= _reaction;
        right *= _reaction;
        session.SetAnalogPitchControl(-Math.Clamp(forward, -1.0, 1.0));
        session.SetAnalogRollControl(Math.Clamp(right, -1.0, 1.0));

        double desiredHeight = target.SurfaceElevationM
            + (terminalApproach && terminalDistance <= ArrivalRadiusM
                ? LandingAglM + _altitudeBiasM
                : CruiseAglM + _altitudeBiasM);
        double heightError = desiredHeight - observation.PositionWorldM.Y;
        SetHeld(session, ref _heldThrottle,
            heightError > 1.1 ? GKey.ThrottleUp
            : heightError < -1.1 ? GKey.ThrottleDown
            : null);
        SetHeld(session, ref _heldRudder,
            yawError > 0.08 ? GKey.RudderRight
            : yawError < -0.08 ? GKey.RudderLeft
            : null);

        return phase switch
        {
            CasevacPhase.Ingress => "ingress",
            CasevacPhase.PickupApproach => "pickup-approach",
            CasevacPhase.Outbound => "outbound",
            CasevacPhase.DropoffApproach => "dropoff-approach",
            CasevacPhase.AbortReturn => "abort-return",
            _ => phase.ToString().ToLowerInvariant()
        };
    }

    void SetHeld(SimulationSession session, ref GKey? current, GKey? desired)
    {
        if (current == desired) return;
        if (current.HasValue) session.FeedKey(current.Value, false);
        if (desired.HasValue) session.FeedKey(desired.Value, true);
        current = desired;
    }

    void ReleaseDiscrete(SimulationSession session)
    {
        if (_heldRudder.HasValue) session.FeedKey(_heldRudder.Value, false);
        if (_heldThrottle.HasValue) session.FeedKey(_heldThrottle.Value, false);
        _heldRudder = null;
        _heldThrottle = null;
    }

    static double UnitOrZero(double value) => value > 1e-6 ? 1.0 : 0.0;

    static double WrapPi(double value)
    {
        while (value > Math.PI) value -= 2.0 * Math.PI;
        while (value < -Math.PI) value += 2.0 * Math.PI;
        return value;
    }
}

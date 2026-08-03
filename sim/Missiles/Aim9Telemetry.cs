namespace GunsOnly.Sim.Missiles;

/// Snapshot-facing missile state for Top Gun heaters.
public readonly record struct Aim9Telemetry(
    Aim9FlightState State,
    Vec3D Position,
    Vec3D Velocity,
    double SimTimeMs,
    double BoresightDeg,
    double TrackRateDegPerSec);

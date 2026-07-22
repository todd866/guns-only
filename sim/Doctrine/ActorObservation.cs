namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// The complete target state an opponent policy is permitted to consume at one decision boundary.
/// This is deliberately not <see cref="AircraftState"/>: target mass, body attitude, body rates,
/// systems, damage internals, and every future truth-only field stay outside the actor boundary.
///
/// Position/flight-path kinematics/bank are the presently idealized contact belief. SourceTick and
/// ObservationAgeTicks make its temporal authority explicit; Confidence is reserved for the
/// fallible-contact layer. The current perfect-contact adapter records confidence 1 and age 0.
/// </summary>
public readonly record struct ActorObservation(
    Vec3D Position,
    double Speed,
    double Gamma,
    double Chi,
    double Bank,
    long SourceTick,
    int ObservationAgeTicks,
    double Confidence) {

    public Vec3D ForwardDir() => new(
        System.Math.Sin(Chi) * System.Math.Cos(Gamma),
        System.Math.Sin(Gamma),
        System.Math.Cos(Chi) * System.Math.Cos(Gamma));
    public Vec3D VelocityVector() => ForwardDir() * Speed;

    public bool IsFinite => Position.IsFinite
        && double.IsFinite(Speed) && Speed >= 0.0
        && double.IsFinite(Gamma)
        && double.IsFinite(Chi)
        && double.IsFinite(Bank)
        && SourceTick >= 0
        && ObservationAgeTicks >= 0
        && double.IsFinite(Confidence)
        && Confidence is >= 0.0 and <= 1.0;

    /// <summary>
    /// Current perfect-contact adapter. This conversion belongs at the session/scenario boundary;
    /// policies receive only the returned value and cannot recover omitted authoritative fields.
    /// </summary>
    public static ActorObservation Capture(in AircraftState truth, long sourceTick = 0,
        int observationAgeTicks = 0, double confidence = 1.0) {
        if (sourceTick < 0) throw new ArgumentOutOfRangeException(nameof(sourceTick));
        if (observationAgeTicks < 0)
            throw new ArgumentOutOfRangeException(nameof(observationAgeTicks));
        if (!double.IsFinite(confidence) || confidence < 0.0 || confidence > 1.0)
            throw new ArgumentOutOfRangeException(nameof(confidence));
        return new ActorObservation(
            truth.Position,
            truth.Speed,
            truth.Gamma,
            truth.Chi,
            truth.Bank,
            sourceTick,
            observationAgeTicks,
            confidence);
    }

    /// <summary>
    /// Compatibility conversion for deterministic test/scenario callers. Production session code
    /// uses Capture explicitly so the authoritative source tick is never implicit.
    /// </summary>
    public static implicit operator ActorObservation(AircraftState truth) => Capture(truth);
}

namespace GunsOnly.Sim;

/// Deterministic post-trap deck-relative kinematics. This is intentionally separate from the
/// aircraft flight model: after the hook catches, the airplane is pinned to the active landing
/// surface while a constant arresting force removes its deck-relative speed.
public sealed class ArrestmentModel {
    public enum ArrestmentPhase { None, Arrested, Stopped }

    // 29.2 m/s² is 2.98 g. A 70 m/s approach over a 3 m/s deck starts near 67 m/s relative and
    // therefore stops in ~2.29 s / ~76.9 m; the scripted hot traps stay just inside 90 m.
    public const double DecelerationMps2 = 29.2;
    public const double NoseSettleSeconds = 0.85;
    const double ParkedNosePitchRad = 0.8 * System.Math.PI / 180.0;

    double _along;
    double _cross;
    double _initialPitchRad;

    public ArrestmentPhase Phase { get; private set; }
    public Vec3D Position { get; private set; }
    public double RelativeSpeedMps { get; private set; }
    public double ElapsedSeconds { get; private set; }
    public double DistanceM { get; private set; }
    public double NosePitchRad { get; private set; }
    public int CaughtWire { get; private set; }
    public bool IsActive => Phase != ArrestmentPhase.None;

    public void Reset() {
        Phase = ArrestmentPhase.None;
        Position = Vec3D.Zero;
        RelativeSpeedMps = 0.0;
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = 0.0;
        CaughtWire = 0;
        _along = _cross = _initialPitchRad = 0.0;
    }

    public void Engage(Carrier carrier, in AircraftState contact, double bodyPitchRad) {
        var (along, cross, _) = carrier.LandingFrame(contact.Position);
        _along = along;
        _cross = cross;
        _initialPitchRad = System.Math.Max(ParkedNosePitchRad, bodyPitchRad);
        Position = carrier.LandingPoint(_along, _cross);
        var shipVelocity = carrier.Fwd * carrier.SpeedMps;
        RelativeSpeedMps = System.Math.Max(0.0,
            (contact.VelocityVector() - shipVelocity).Dot(carrier.LandingFwd));
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = _initialPitchRad;
        CaughtWire = carrier.CaughtWire(contact.Position);
        Phase = RelativeSpeedMps > 0.0 ? ArrestmentPhase.Arrested : ArrestmentPhase.Stopped;
    }

    /// Call after Carrier.Step(dt), so LandingPoint includes this tick's ship translation.
    public void Step(Carrier carrier, double dt) {
        if (Phase != ArrestmentPhase.Arrested || dt <= 0.0) return;
        double timeToStop = RelativeSpeedMps / DecelerationMps2;
        double movingTime = System.Math.Min(dt, timeToStop);
        double distance = RelativeSpeedMps * movingTime
            - 0.5 * DecelerationMps2 * movingTime * movingTime;
        _along += distance;
        DistanceM += distance;
        RelativeSpeedMps = System.Math.Max(0.0, RelativeSpeedMps - DecelerationMps2 * movingTime);
        ElapsedSeconds += movingTime;

        double settle = SmoothStep(System.Math.Min(1.0, ElapsedSeconds / NoseSettleSeconds));
        NosePitchRad = _initialPitchRad + (ParkedNosePitchRad - _initialPitchRad) * settle;
        Position = carrier.LandingPoint(_along, _cross);
        if (RelativeSpeedMps <= 1e-9) {
            RelativeSpeedMps = 0.0;
            NosePitchRad = ParkedNosePitchRad;
            Phase = ArrestmentPhase.Stopped;
        }
    }

    static double SmoothStep(double x) => x * x * (3.0 - 2.0 * x);
}

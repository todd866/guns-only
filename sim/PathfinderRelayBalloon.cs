using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

public enum PathfinderBalloonComponent { Envelope, Gondola }

/// Separate Phase-1 card. Dimensions, payload, leak and drag are provisional/surrogate, not a
/// retuning of the scientific/gallery balloon. See docs/airframes/rapier/08-pathfinder-relay-model.md.
public static class PathfinderRelayCard {
    public const double FloatAltitudeM = 20_600;
    public const double DryMassKg = 1600;
    public const double HeliumToAirDensityRatio = 0.138;
    public static readonly double VolumeM3 = DryMassKg / ((1 - HeliumToAirDensityRatio)
        * StandardAtmosphere1976.Instance.Sample(FloatAltitudeM).DensityKgM3);
    public static readonly double EnvelopeRadiusM = Math.Cbrt(VolumeM3 * 3 / (4 * Math.PI));
    public static readonly Vec3D GondolaHalfExtentsM = new(2.8, 1.4, 2.1);
    public static readonly Vec3D GondolaOffsetM = new(0, -EnvelopeRadiusM - 13, 0);
    public const double MaximumSinkMps = 2;
    public const double SinkResponseSeconds = 8;
    public const double LeakResponseSeconds = 30;
}

public sealed class PathfinderRelayBalloon {
    readonly IWindField _wind;
    readonly Vec3D _driftOffset;
    readonly double _groundY;
    readonly GunTarget[] _targets = new GunTarget[2];
    public int Id { get; }
    public long EnvelopeTargetId => Id * 2L;
    public long GondolaTargetId => Id * 2L + 1;
    public Vec3D Position { get; private set; }
    public Vec3D Velocity { get; private set; }
    public Vec3D GondolaPosition => Position + PathfinderRelayCard.GondolaOffsetM;
    public double LeakFraction { get; private set; }
    /// Fraction of the card's bounded puncture support deficit, not fraction of total gas lost.
    public double LiftLossFraction { get; private set; }
    public bool RelayActive { get; private set; } = true;
    public bool Escaped { get; private set; }
    public void Escape() { if (RelayActive) Escaped = true; }
    public PathfinderDebris? Debris { get; private set; }

    public PathfinderRelayBalloon(int id, Vec3D position, uint seed, IWindField wind, double groundY = 0) {
        if (id <= 0 || !position.IsFinite || !double.IsFinite(groundY)
            || position.Y + PathfinderRelayCard.GondolaOffsetM.Y <= groundY)
            throw new ArgumentOutOfRangeException(nameof(position));
        Id = id; Position = position; _wind = wind ?? throw new ArgumentNullException(nameof(wind));
        _groundY = groundY;
        // Fixed integer mixer, independent of System.Random/runtime version and actor iteration.
        uint state = seed ^ unchecked((uint)id * 0x9e3779b9u);
        double Next() {
            state = unchecked(state * 1664525u + 1013904223u);
            return (state / (double)uint.MaxValue - 0.5) * 1.5;
        }
        _driftOffset = new(Next(), 0, Next());
        var sampled = _wind.Sample(Position) + _driftOffset;
        Velocity = sampled with { Y = 0 };
    }

    public AircraftState GondolaState => StateAt(GondolaPosition);
    AircraftState StateAt(Vec3D position) => Carrier.StateFromVelocity(position, Velocity, PathfinderRelayCard.DryMassKg);

    public GunTarget[] GunTargets() {
        _targets[0] = new(EnvelopeTargetId, StateAt(Position), RelayActive && !Escaped,
            GunHitVolume.Sphere(PathfinderRelayCard.EnvelopeRadiusM), StructuralDamage: false);
        _targets[1] = new(GondolaTargetId, GondolaState, RelayActive && !Escaped,
            new GunHitVolume(PathfinderRelayCard.GondolaHalfExtentsM));
        return _targets;
    }

    /// Returns true only for the first structural disable; punctures never deny a relay.
    public bool Hit(PathfinderBalloonComponent component) {
        if (!Enum.IsDefined(component)) throw new ArgumentOutOfRangeException(nameof(component));
        if (!RelayActive || Escaped) return false;
        if (component == PathfinderBalloonComponent.Envelope) {
            LeakFraction = Math.Min(1, LeakFraction + 0.25);
            return false;
        }
        RelayActive = false;
        Debris = new PathfinderDebris(GondolaPosition, Velocity, _wind, _groundY);
        return true;
    }

    public PathfinderFootprint PredictFootprint() =>
        PathfinderDebris.Predict(GondolaPosition, Velocity, _wind, _groundY);

    public void Step(double dt) {
        if (!double.IsFinite(dt) || dt < 0) throw new ArgumentOutOfRangeException(nameof(dt));
        // Linear buoyancy/drag response: a puncture removes support, drag approaches a bounded
        // terminal sink continuously. The hit itself changes neither altitude nor velocity.
        LiftLossFraction = 1 - (1 - LiftLossFraction)
            * Math.Exp(-LeakFraction * dt / PathfinderRelayCard.LeakResponseSeconds);
        double terminal = -PathfinderRelayCard.MaximumSinkMps * Math.Sqrt(LiftLossFraction);
        double tau = PathfinderRelayCard.SinkResponseSeconds;
        double decay = Math.Exp(-dt / tau);
        var wind = _wind.Sample(Position) + _driftOffset;
        Position += new Vec3D(wind.X * dt,
            terminal * dt + (Velocity.Y - terminal) * tau * (1 - decay), wind.Z * dt);
        Velocity = new(wind.X, terminal + (Velocity.Y - terminal) * decay, wind.Z);
        Debris?.Step(dt);
    }
}

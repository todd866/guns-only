using System;

namespace GunsOnly.Sim.Training;

/// <summary>
/// The canonical feature vector for cloning a HUMAN pilot from recorded flights.
/// </summary>
/// <remarks>
/// ONE DEFINITION, BOTH SIDES. Training rows are exported through this, and
/// <c>ClonedPilotPolicy</c> evaluates through this. If the exporter and the policy computed
/// features separately the clone would learn one function and fly another, and nothing in the
/// pipeline would report it — the loss would look fine and the flying would be wrong. Every change
/// here must bump <see cref="Version"/>, and a manifest carrying a different version is refused
/// rather than silently reinterpreted.
///
/// Everything is expressed in the OWNSHIP BODY FRAME and normalised to roughly unit scale. World
/// position is deliberately absent: a pilot's decision at a merge depends on the geometry he is in,
/// not on where over the map it happens, and feeding absolute coordinates would let a clone memorise
/// map locations instead of learning to fight.
/// </remarks>
public static class HumanPilotFeatures {
    public const int Version = 1;
    public const int FeatureCount = 14;

    static readonly string[] NamesValue = {
        "range_norm",           // contact range / 4 km, clipped
        "closing_norm",         // closing speed / 300 m/s
        "contact_fwd",          // unit line-of-sight in body frame: forward component
        "contact_right",        //   ... right
        "contact_up",           //   ... up
        "contact_vel_fwd",      // contact velocity relative to ownship, body frame / 300 m/s
        "contact_vel_right",
        "contact_vel_up",
        "own_speed_norm",       // ownship speed / 300 m/s
        "own_gamma_norm",       // flight path angle / (pi/2)
        "own_bank_sin",         // bank as a continuous pair, so +/-pi does not tear
        "own_bank_cos",
        "own_altitude_norm",    // altitude / 6 km, clipped
        "gun_nose_error_norm",  // nose error to the contact / pi
    };

    public static System.Collections.Generic.IReadOnlyList<string> Names => NamesValue;

    public static double[] Extract(in CombatPolicyObservation observation) {
        var values = new double[FeatureCount];
        Extract(observation, values);
        return values;
    }

    public static void Extract(in CombatPolicyObservation observation, Span<double> destination) {
        if (destination.Length < FeatureCount)
            throw new ArgumentException(
                $"Pilot feature destination needs {FeatureCount} values.", nameof(destination));

        AircraftState own = observation.Ownship;
        Vec3D line = observation.Contact.Position - own.Position;
        double range = line.Length;
        Vec3D lineHat = range > 1e-6 ? line * (1.0 / range) : new Vec3D(0.0, 0.0, 1.0);

        // Body frame from the flight path and bank, the same basis the bank solver uses.
        Vec3D forward = own.ForwardDir();
        var worldUp = new Vec3D(0.0, 1.0, 0.0);
        Vec3D right = worldUp.Cross(forward);
        right = right.Length > 1e-6 ? right.Normalized() : new Vec3D(1.0, 0.0, 0.0);
        Vec3D up = forward.Cross(right).Normalized();
        // Roll the lateral pair by the bank angle so the clone sees the world the pilot sees.
        double sinBank = Math.Sin(own.Bank), cosBank = Math.Cos(own.Bank);
        Vec3D bodyRight = right * cosBank - up * sinBank;
        Vec3D bodyUp = right * sinBank + up * cosBank;

        Vec3D relativeVelocity = observation.Contact.VelocityVector() - own.VelocityVector();

        int i = 0;
        destination[i++] = Clip(range / 4000.0, 0.0, 2.0);
        destination[i++] = Clip(observation.ClosingSpeedMps / 300.0, -3.0, 3.0);
        destination[i++] = lineHat.Dot(forward);
        destination[i++] = lineHat.Dot(bodyRight);
        destination[i++] = lineHat.Dot(bodyUp);
        destination[i++] = Clip(relativeVelocity.Dot(forward) / 300.0, -3.0, 3.0);
        destination[i++] = Clip(relativeVelocity.Dot(bodyRight) / 300.0, -3.0, 3.0);
        destination[i++] = Clip(relativeVelocity.Dot(bodyUp) / 300.0, -3.0, 3.0);
        destination[i++] = Clip(own.Speed / 300.0, 0.0, 3.0);
        destination[i++] = Clip(own.Gamma / (Math.PI / 2.0), -1.5, 1.5);
        destination[i++] = sinBank;
        destination[i++] = cosBank;
        destination[i++] = Clip(own.Position.Y / 6000.0, 0.0, 3.0);
        destination[i++] = Clip(observation.GunNoseErrorRad / Math.PI, 0.0, 1.0);
        if (i != FeatureCount)
            throw new InvalidOperationException(
                $"Pilot feature writer produced {i} of {FeatureCount} values.");
        for (int k = 0; k < FeatureCount; k++)
            if (!double.IsFinite(destination[k]))
                throw new InvalidOperationException(
                    $"Pilot feature '{NamesValue[k]}' was not finite.");
    }

    static double Clip(double value, double low, double high) =>
        !double.IsFinite(value) ? low : Math.Clamp(value, low, high);
}

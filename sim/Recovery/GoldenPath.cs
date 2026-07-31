using System;

namespace GunsOnly.Sim.Recovery;

/// <summary>
/// What the pilot is being asked to do right now, and why. Everything here is drawn or shown,
/// never spoken: the ribbon carries TargetAltitudeM, the power bug carries CommandedPower01, and
/// Limit is the reason the bug just moved, available on demand rather than shouted.
/// </summary>
public readonly record struct GoldenPathPoint(
    bool Valid,
    double DistanceToGoM,
    double TargetAltitudeM,
    double TargetTrueAirspeedMps,
    double CommandedPower01,
    double ExcessEnergyM,
    double TrackRequiredM,
    DescentLimit Limit);

/// <summary>
/// The golden-path calculator: given where you are and how far home is, what altitude and speed
/// should you be at, how much power does that want, and which limit is shaping it.
///
/// Solved BACKWARDS from the stabilisation point, because that is the only end of the problem
/// that is fixed. Forwards you can fly anything; backwards there is exactly one schedule that
/// arrives on speed without leaving the corridor.
///
/// The approach is always flyable. Excess energy is never a refusal, it is a longer path — the
/// same rule the path synthesiser uses. What this adds is that the path must also stay inside
/// DescentCorridor, which is what makes a Rapier recovery hard and a subsonic one trivial.
///
/// Pure and deterministic. No session, no clock, no I/O.
/// </summary>
public static class GoldenPath {
    /// Energy height: altitude plus the height current speed could buy.
    public static double SpecificEnergyM(double altitudeM, double trueAirspeedMps) =>
        altitudeM + trueAirspeedMps * trueAirspeedMps / (2.0 * 9.80665);

    /// <summary>
    /// Track distance needed to shed an energy-height excess at an achievable drag-to-weight
    /// ratio, from D*s = W*dEs.
    /// </summary>
    public static double TrackRequiredM(double excessEnergyHeightM, double dragToWeight) {
        if (!(excessEnergyHeightM > 0.0) || !double.IsFinite(excessEnergyHeightM)) return 0.0;
        return excessEnergyHeightM / Math.Max(dragToWeight, 1e-3);
    }

    /// <summary>
    /// Solve the schedule at the pilot's current distance-to-go.
    /// </summary>
    /// <param name="distanceToGoM">Track distance remaining to the stabilisation point.</param>
    /// <param name="altitudeM">Current altitude.</param>
    /// <param name="trueAirspeedMps">Current true airspeed.</param>
    /// <param name="atmosphere">Atmosphere to sample the corridor against.</param>
    /// <param name="stabiliseAltitudeM">Altitude at the stabilisation point.</param>
    /// <param name="stabiliseSpeedMps">True airspeed at the stabilisation point.</param>
    /// <param name="dragToWeight">Achievable drag-to-weight in the configuration available.</param>
    /// <param name="configurationCeilingMps">Gear/flap placard as true airspeed, or infinity.</param>
    public static GoldenPathPoint Solve(
        double distanceToGoM,
        double altitudeM,
        double trueAirspeedMps,
        IAtmosphereModel atmosphere,
        double stabiliseAltitudeM,
        double stabiliseSpeedMps,
        double dragToWeight,
        double configurationCeilingMps = double.PositiveInfinity) {
        if (atmosphere is null
            || !double.IsFinite(distanceToGoM) || distanceToGoM < 0.0
            || !double.IsFinite(altitudeM) || !double.IsFinite(trueAirspeedMps)
            || !double.IsFinite(stabiliseAltitudeM) || !double.IsFinite(stabiliseSpeedMps))
            return new GoldenPathPoint(false, 0, 0, 0, 0, 0, 0, DescentLimit.None);

        double stabiliseEnergy = SpecificEnergyM(stabiliseAltitudeM, stabiliseSpeedMps);
        double currentEnergy = SpecificEnergyM(altitudeM, trueAirspeedMps);
        double excess = Math.Max(0.0, currentEnergy - stabiliseEnergy);
        double required = TrackRequiredM(excess, dragToWeight);

        // Backwards from the stabilisation point: the energy you are ALLOWED at this range is
        // whatever can still be shed in the distance that remains.
        double allowedEnergy = stabiliseEnergy + distanceToGoM * Math.Max(dragToWeight, 1e-3);
        double scheduledEnergy = Math.Min(currentEnergy, allowedEnergy);

        // Split that energy between height and speed. Hold the corridor ceiling where it binds,
        // and put whatever is left into altitude -- which is what "decelerate high, then descend"
        // looks like when you write it as a schedule rather than as advice.
        AtmosphericState here = atmosphere.Sample(Math.Max(0.0, altitudeM));
        double a = Math.Sqrt(1.4 * 287.05 * here.TemperatureK);
        (double ceilingMps, DescentLimit limit) = DescentCorridor.Ceiling(
            here.DensityKgM3, here.TemperatureK, a, configurationCeilingMps);

        double unclippedSpeed = Math.Max(stabiliseSpeedMps, ScheduledSpeed(
            distanceToGoM, required, stabiliseSpeedMps, trueAirspeedMps));
        double targetSpeed = Math.Min(
            unclippedSpeed, double.IsFinite(ceilingMps) ? ceilingMps : double.MaxValue);
        // A placard is only the reason when it actually clips the schedule. Reporting the lowest
        // ceiling regardless said "skin temperature" for a jet at M3.7 with a M5.67 ceiling --
        // naming an innocent limit while the real problem was carrying more energy than the
        // distance can absorb. Nothing binding is itself the honest answer there.
        bool clipped = targetSpeed < unclippedSpeed - 1e-9;

        double targetAltitude = Math.Max(
            stabiliseAltitudeM,
            scheduledEnergy - targetSpeed * targetSpeed / (2.0 * 9.80665));

        // The power bug. Above the schedule you are being asked to come off the gas; below it,
        // to add. Deliberately continuous rather than a "PULL POWER" caption: the pilot flies the
        // bug, they do not read an instruction.
        double energyError = currentEnergy - scheduledEnergy;
        double band = Math.Max(200.0, 0.05 * Math.Max(1.0, scheduledEnergy));
        double commandedPower = Math.Clamp(0.5 - energyError / (2.0 * band), 0.0, 1.0);

        return new GoldenPathPoint(
            true, distanceToGoM, targetAltitude, targetSpeed, commandedPower,
            excess, required,
            clipped ? limit : DescentLimit.None);
    }

    /// <summary>
    /// Speed scheduled against the track that remains: you may hold current speed while you still
    /// have all the distance you need to shed it, and you must be at approach speed on arrival.
    /// Monotone in distance-to-go, and exactly stabiliseSpeedMps at zero -- an earlier version
    /// interpolated on an energy ratio and left the schedule asking for 138 m/s at the threshold.
    /// </summary>
    static double ScheduledSpeed(
        double distanceToGoM, double requiredM,
        double stabiliseSpeedMps, double currentSpeedMps) {
        if (currentSpeedMps <= stabiliseSpeedMps) return stabiliseSpeedMps;
        double fraction = Math.Clamp(distanceToGoM / Math.Max(requiredM, 1.0), 0.0, 1.0);
        return stabiliseSpeedMps + (currentSpeedMps - stabiliseSpeedMps) * fraction;
    }
}

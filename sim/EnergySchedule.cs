namespace GunsOnly.Sim;

/// <summary>
/// The en-route energy schedule: what altitude the aircraft should be at for the speed it
/// currently has.
///
/// A supersonic climb is not a level acceleration followed by a climb. It is one continuous
/// trade in which the aircraft rides a roughly constant dynamic pressure -- as it accelerates the
/// air must thin at the same rate, so altitude and Mach rise together. That is why nobody who
/// flies one of these holds a level shelf: you are always going up or down, because the schedule
/// is a curve through the altitude/Mach plane and holding altitude means falling off it.
///
/// Holding q rather than altitude also keeps the airframe honest. q is what the structure feels,
/// so a schedule expressed in q cannot quietly wander past the placard the way an altitude-and-
/// Mach pair can -- and it is the same quantity DescentCorridor limits on the way back down, so
/// the climb out and the recovery are bounded by one number instead of two unrelated ones.
///
/// Pure and deterministic: an atmosphere and two doubles in, an altitude out.
/// </summary>
public static class EnergySchedule {
    /// <summary>
    /// Climb-out schedule pressure. 35 kPa is 465 KEAS.
    ///
    /// This was 50 kPa, chosen against an 80 kPa placard that turned out to be invented. Once Vmo
    /// was derived honestly at 550 KIAS (49.0 kPa) that schedule was riding essentially ON the
    /// never-exceed speed for the whole climb, which is both poor airmanship and slow: holding
    /// 554 KEAS keeps the aircraft down in dense air where the drag is, and the climb to FL400
    /// took nine minutes.
    ///
    /// 465 KEAS carries about 15% margin under Vmo and lets the aircraft go up earlier, which is
    /// where a low-drag airframe wants to be anyway.
    /// </summary>
    public const double ClimbSchedulePa = 35_000.0;

    /// Highest altitude the search will return. Above this the turbine has nothing to work with
    /// and the schedule belongs to the ram climb, which owns its own profile.
    public const double SearchCeilingM = 30_000.0;

    /// <summary>
    /// Altitude at which flying <paramref name="trueAirspeedMps"/> produces <paramref name="qPa"/>.
    /// Density falls monotonically with altitude, so q does too at fixed true airspeed, and a
    /// bisection is exact enough and cannot fail to converge.
    /// </summary>
    public static double AltitudeForDynamicPressureM(
        IAtmosphereModel atmosphere, double qPa, double trueAirspeedMps) {
        if (atmosphere is null || !double.IsFinite(qPa) || qPa <= 0.0
            || !double.IsFinite(trueAirspeedMps) || trueAirspeedMps <= 1.0) return 0.0;

        double v2 = trueAirspeedMps * trueAirspeedMps;
        double QAt(double altM) => 0.5 * atmosphere.Sample(altM).DensityKgM3 * v2;

        // Too slow to make the schedule pressure even at sea level: stay low and keep accelerating.
        if (QAt(0.0) <= qPa) return 0.0;

        double lo = 0.0, hi = SearchCeilingM;
        if (QAt(hi) >= qPa) return hi;
        for (int i = 0; i < 40; i++) {
            double mid = 0.5 * (lo + hi);
            if (QAt(mid) > qPa) lo = mid; else hi = mid;
        }
        return 0.5 * (lo + hi);
    }

    /// <summary>
    /// The climb-out schedule altitude for the speed the aircraft has now, never below
    /// <paramref name="floorM"/> so the transonic push still happens in thick air where the
    /// turbine has thrust rather than at whatever altitude the schedule alone would allow.
    /// </summary>
    public static double ClimbScheduleAltitudeM(
        IAtmosphereModel atmosphere, double trueAirspeedMps, double floorM) =>
        System.Math.Max(floorM,
            AltitudeForDynamicPressureM(atmosphere, ClimbSchedulePa, trueAirspeedMps));
}

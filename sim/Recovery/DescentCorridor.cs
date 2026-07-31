using System;

namespace GunsOnly.Sim.Recovery;

/// <summary>
/// Which limit is stopping you going faster right now. Published so the pilot can ask the
/// aircraft WHY it wants power off, instead of being told to pull it and having to trust that.
/// </summary>
public enum DescentLimit {
    /// Nothing binding; the schedule is shaped by geometry, not by a placard.
    None = 0,
    /// Dynamic pressure. The airframe comes apart before the air slows you down.
    DynamicPressure = 1,
    /// Skin temperature. Stagnation heating, which gets worse as you descend into warmer air.
    SkinTemperature = 2,
    /// Gear and flap placard, which sets the speed the approach has to arrive at.
    Configuration = 3,
}

/// <summary>
/// The corridor a recovery has to stay inside, and the reason it narrows.
///
/// This is the part of a Rapier descent that has no intuitive answer. A dive from M3.7 at FL750
/// flown in the kernel reaches 387 kPa — 4.8x the 80 kPa placard — and nothing currently stops
/// it, because the limit is computed, recorded to service life, published as rapier_over_q, and
/// then ignored. Drag alone only takes M3.74 to M3.30 over thirty seconds of diving; it does not
/// save the airframe.
///
/// Both bounds push the same way: decelerate high, where the air is thin and the metal is cool,
/// and only trade altitude once Mach is off. That is why the energy bleed needs hundreds of
/// miles, and why "when do I pull power" is answered far earlier than instinct suggests.
///
/// Pure functions of atmosphere. No aircraft state, no session, no I/O.
/// </summary>
public static class DescentCorridor {
    /// Matches RapierAerodynamics.HighDynamicPressurePlacardPa. Duplicated deliberately: this
    /// module is about the recovery envelope and must not depend on the Rapier aero surrogate.
    public const double PlacardDynamicPressurePa = 80_000.0;

    /// SiC/SiC-class CMC material capability, the closed repo number from
    /// docs/airframes/rapier/20-thermal-and-materials.md: SkinTemperatureLimitK = 1473.15 K.
    ///
    /// An earlier version of this file used 320 C, taken from a stale aside in the propulsion
    /// map. That is an organic-matrix figure and it is wrong for this airframe: the thermal doc
    /// states there is deliberately NO 650 C operating limit, and screens the CMC at about M5.37
    /// at FL700 against a flown ladder that peaks near M3.6-3.7. With 320 C the corridor reported
    /// skin as the binding limit at M3.7, which is not true and would have had the schedule
    /// taking power off for the wrong reason. Callers should pass the airframe's own
    /// SkinTemperatureLimitK; this default exists only so the corridor is usable without one.
    public const double SkinLimitKelvin = 1473.15;

    /// Recovery ratio for a turbulent boundary layer. The kernel's own skin model uses the same
    /// adiabatic-wall form; this is the inverse of it, solved for Mach.
    const double RecoveryFactor = 0.89;
    const double GammaMinusOneOverTwo = 0.2;

    /// <summary>Highest true airspeed the q placard allows in this density.</summary>
    public static double MaxTrueAirspeedMps(double densityKgM3) {
        if (!double.IsFinite(densityKgM3) || densityKgM3 <= 0.0) return double.PositiveInfinity;
        return Math.Sqrt(2.0 * PlacardDynamicPressurePa / densityKgM3);
    }

    /// <summary>
    /// Highest Mach the skin limit allows in this ambient temperature. Descending lowers this,
    /// because ambient temperature rises: the envelope closes on you as you come down, which is
    /// the opposite of the intuition that thicker air is safer.
    /// </summary>
    public static double MaxMach(double ambientTemperatureK, double skinLimitK = SkinLimitKelvin) {
        if (!double.IsFinite(ambientTemperatureK) || ambientTemperatureK <= 0.0) return 0.0;
        double limitK = double.IsFinite(skinLimitK) && skinLimitK > 0.0 ? skinLimitK : SkinLimitKelvin;
        double ratio = limitK / ambientTemperatureK - 1.0;
        if (ratio <= 0.0) return 0.0;   // ambient alone is already past the limit
        return Math.Sqrt(ratio / (RecoveryFactor * GammaMinusOneOverTwo));
    }

    /// <summary>
    /// The speed ceiling at this altitude and the limit responsible for it. `configurationMps`
    /// is the gear/flap placard converted to true airspeed, or PositiveInfinity when clean.
    /// </summary>
    public static (double CeilingMps, DescentLimit Limit) Ceiling(
        double densityKgM3,
        double ambientTemperatureK,
        double speedOfSoundMps,
        double configurationMps = double.PositiveInfinity,
        double skinLimitK = SkinLimitKelvin) {
        double q = MaxTrueAirspeedMps(densityKgM3);
        double skin = MaxMach(ambientTemperatureK, skinLimitK) * speedOfSoundMps;
        double config = double.IsFinite(configurationMps) && configurationMps > 0.0
            ? configurationMps
            : double.PositiveInfinity;

        double ceiling = Math.Min(q, Math.Min(skin, config));
        if (!double.IsFinite(ceiling)) return (double.PositiveInfinity, DescentLimit.None);
        DescentLimit limit = ceiling == config ? DescentLimit.Configuration
            : ceiling == skin ? DescentLimit.SkinTemperature
            : DescentLimit.DynamicPressure;
        return (ceiling, limit);
    }
}

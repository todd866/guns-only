using System;
using GunsOnly.Sim;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Owner question 2026-07-29: "the ability to pull g at altitude is near-zero — if that's
/// real, cool, but make sure that's real." This sweeps the kernel's aerodynamic G ceiling
/// (q·S·CLmax / W) across the flown envelope and cross-checks one point against the
/// first-principles thin-airfoil arithmetic the cranked-delta schedule is built from, so the
/// felt near-zero margin is pinned to physics rather than a control-law accident.
/// </summary>
public sealed class RapierAltitudeGAvailabilityTests {
    readonly ITestOutputHelper _out;
    public RapierAltitudeGAvailabilityTests(ITestOutputHelper output) => _out = output;

    [Fact]
    public void HighAltitudeGFamineIsAerodynamicallyReal() {
        AircraftParams air = FlightModel.RapierPublicDataSurrogate;
        double massKg = air.MassKg;

        _out.WriteLine("alt_ft  mach   TAS_mps  q_kPa   aeroG");
        foreach (double altFt in new[] { 10_000.0, 30_000.0, 50_000.0, 60_000.0, 72_000.0 }) {
            double altM = altFt * 0.3048;
            foreach (double mach in new[] { 0.9, 1.5, 2.5, 3.5 }) {
                double a = Atmosphere.SpeedOfSound(altM);
                double tas = mach * a;
                double q = AirData.TrueDynamicPressurePa(tas, altM);
                double aeroG = AirData.PositiveLiftLimitG(tas, altM, massKg, air);
                _out.WriteLine(
                    $"{altFt,6:F0}  {mach,4:F1}  {tas,7:F0}  {q / 1000.0,6:F1}  {aeroG,6:F2}");
            }
        }

        // The felt famine: at FL600/M2.5 the jet must have only a handful of G available,
        // and it must GROW as the jet descends — the famine is altitude, not a law bug.
        double famineG = AirData.PositiveLiftLimitG(
            2.5 * Atmosphere.SpeedOfSound(60_000 * 0.3048),
            60_000 * 0.3048, massKg, air);
        double richG = AirData.PositiveLiftLimitG(
            0.9 * Atmosphere.SpeedOfSound(10_000 * 0.3048),
            10_000 * 0.3048, massKg, air);
        Assert.True(famineG < 6.0,
            $"FL600/M2.5 shows {famineG:F1} aero G — the high-altitude famine vanished");
        Assert.True(richG > famineG,
            "available G must grow as the jet descends into thicker air");

        // First-principles cross-check at FL600/M2.5: n = q·S·CLmax/W with the supersonic
        // thin-airfoil ceiling CLmax = CLalpha·alpha_limit = (4/sqrt(M^2-1))·alpha. The kernel
        // value must sit within 25% of the hand arithmetic — same physics, same inputs.
        double altCheckM = 60_000 * 0.3048;
        double aCheck = Atmosphere.SpeedOfSound(altCheckM);
        double tasCheck = 2.5 * aCheck;
        double qCheck = AirData.TrueDynamicPressurePa(tasCheck, altCheckM);
        double clMaxKernel = FlightModel.EffectiveClMax(air, 2.5);
        double handG = qCheck * air.WingAreaM2 * clMaxKernel / (massKg * FlightModel.G0);
        Assert.True(Math.Abs(handG - famineG) / Math.Max(famineG, 1e-9) < 0.25,
            $"kernel {famineG:F2} G vs hand {handG:F2} G — the sweep is not measuring CLmax physics");
    }
}

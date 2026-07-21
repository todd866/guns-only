using GunsOnly.Sim;
using GunsOnly.Sim.Propulsion;
using Xunit;
public class ProtectionTests {
    static AircraftState At(double speed) => new(new Vec3D(0,3000,0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    [Fact] public void SabreFullBackstickProtectionReachesHardMax() {
        var s = At(240);
        Assert.Equal(Protection.HardMaxG(s, FlightModel.Sabre),
            Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
    [Fact] public void SabreProtectionUsesItsDocumentedSevenGLimit() {
        var s2 = At(400);
        double expect = System.Math.Min(FlightModel.Sabre.MaxPerformFraction
            * FlightModel.NzAeroMax(s2, FlightModel.Sabre), Protection.HardMaxG(s2, FlightModel.Sabre));
        Assert.Equal(expect, Protection.MaxPerformG(s2, FlightModel.Sabre), 6);
        Assert.Equal(7.0, Protection.MaxPerformG(s2, FlightModel.Sabre), 6);
    }
    [Fact] public void HardMaxCapsAtStructural() => Assert.Equal(
        FlightModel.Sabre.PositiveStructuralLimitG, Protection.HardMaxG(At(400), FlightModel.Sabre), 6);
    [Fact] public void ModernSurrogateSeparatesNormalNineGProtectionFromOverrideDemand() {
        var parameters = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(new Vec3D(0, 5486.4, 0), 300.0,
            0.0, 0.0, 0.0, parameters.MassKg);

        Assert.Equal(9.0, Protection.MaxPerformG(state, parameters), 6);
        Assert.Equal(9.0, Protection.HardMaxG(state, parameters), 6);
        Assert.Equal(11.0, Protection.OverrideMaxG(state, parameters), 6);
    }
    [Fact] public void SlowFlightProtectionIsAeroLimited() {
        var s = At(110);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < 3.0);
        Assert.Equal(FlightModel.NzAeroMax(s, FlightModel.Sabre),
            Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
    [Fact] public void SustainedGSurvivesEverySpeedAndNeverExceedsProtection() {
        // Guard for a class that has bitten 3x: Clamp(min>max) when the wing can't make 1G.
        foreach (var v in new[] { 41.0, 60.0, 90.0, 150.0, 240.0, 400.0 }) {
            var st = At(v);
            var sus = Protection.SustainedG(st, FlightModel.Sabre);   // must not throw at any speed
            Assert.True(sus > 0);
            Assert.True(sus <= Protection.MaxPerformG(st, FlightModel.Sabre) + 1e-9, $"sustained > protection at {v} m/s");
        }
    }
    [Fact] public void SustainedSitsWellBelowTheWingAtFightingSpeed() {
        // Accurate F-86 energy game: about 5 G sustained under a +7 G instantaneous boundary.
        var st = At(240);
        var sus = Protection.SustainedG(st, FlightModel.Sabre);
        var wing = Protection.MaxPerformG(st, FlightModel.Sabre);
        Assert.InRange(sus, 4.7, 5.3);
        Assert.InRange(wing - sus, 1.7, 2.3);
    }
    [Fact] public void LiveSustainedGUsesJ47SpoolAndTheProductionHighLiftDrag() {
        const double altitudeM = 3048.0;
        double speedMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
            250.0 / AirData.MpsToKnots, altitudeM);
        var state = new AircraftState(new Vec3D(0, altitudeM, 0), speedMps,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        AtmosphericState atmosphere = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double mach = speedMps / atmosphere.SpeedOfSoundMps;
        double fullThrust = J47PerformanceMap.Evaluate(1.0, altitudeM, mach).NetThrustN;
        double partialThrust = J47PerformanceMap.Evaluate(0.85, altitudeM, mach).NetThrustN;

        double legacy = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, StandardAtmosphere1976.Instance);
        double liveFull = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, fullThrust, AirframeAerodynamicState.Clean,
            StandardAtmosphere1976.Instance);
        double livePartial = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, partialThrust, AirframeAerodynamicState.Clean,
            StandardAtmosphere1976.Instance);

        Assert.InRange(liveFull, 3.8, 4.1);
        Assert.True(legacy > liveFull + 0.3,
            $"the old simplified marker should materially overstate the exact polar: {legacy:F2} vs {liveFull:F2}");
        Assert.True(livePartial < liveFull,
            $"less spool/net thrust must lower the live marker: {livePartial:F2} vs {liveFull:F2}");
    }
    [Fact] public void LiveSustainedGAccountsForConfigurationAndHidesWhenOneGIsImpossible() {
        const double altitudeM = 3048.0;
        double speedMps = 250.0 / AirData.MpsToKnots;
        var state = new AircraftState(new Vec3D(0, altitudeM, 0), speedMps,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        AtmosphericState atmosphere = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double mach = speedMps / atmosphere.SpeedOfSoundMps;
        double thrust = J47PerformanceMap.Evaluate(1.0, altitudeM, mach).NetThrustN;
        var gearAndFlaps = new AirframeAerodynamicState(
            LiftCoefficientIncrement: 0.30,
            DragCoefficientIncrement: 0.125,
            PitchMomentCoefficientIncrement: 0.0,
            LateralLiftCoefficientDifference: 0.0);

        double clean = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, thrust, AirframeAerodynamicState.Clean,
            StandardAtmosphere1976.Instance);
        double configured = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, thrust, gearAndFlaps, StandardAtmosphere1976.Instance);
        double stopped = Protection.SustainedG(state, FlightModel.Sabre,
            speedMps, 0.0, AirframeAerodynamicState.Clean,
            StandardAtmosphere1976.Instance);

        Assert.True(configured < clean,
            $"gear/flap drag must lower the live energy-neutral load: {configured:F2} vs {clean:F2}");
        Assert.Equal(0.0, stopped);
    }
    [Fact] public void TierOrderingHoldsAtAllSpeeds() {
        foreach (var v in new[] { 41.0, 45.0, 60.0, 90.0, 150.0, 250.0, 400.0 }) {
            var s = At(v);
            Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) <= Protection.HardMaxG(s, FlightModel.Sabre) + 1e-12,
                $"tier inversion at {v} m/s");
        }
    }
    [Fact] public void VerySlowFlightKeepsOrderingBelowOneG() {
        var s = At(45);
        Assert.True(Protection.HardMaxG(s, FlightModel.Sabre) < 1.0);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) <= Protection.HardMaxG(s, FlightModel.Sabre));
    }
    [Fact] public void ExplicitAirspeedDrivesProtectionInsteadOfGroundspeed() {
        var s = At(55);
        double groundLimited = Protection.MaxPerformG(s, FlightModel.Sabre);
        double airLimited = Protection.MaxPerformG(s, FlightModel.Sabre, airspeedMps: 70.0);
        Assert.True(airLimited > groundLimited * 1.5,
            $"70 m/s airflow should provide materially more authority than 55 m/s groundspeed: {groundLimited:F2} -> {airLimited:F2} G");
        Assert.Equal(FlightModel.NzAeroMax(s, FlightModel.Sabre, 70.0), airLimited, 10);
    }
}

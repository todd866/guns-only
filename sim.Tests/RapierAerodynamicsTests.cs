using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Contract tests for the explicit Rapier aerodynamic design module. These assert geometry
/// arithmetic and schedule properties; integration behavior is covered by the flight-model tests.
/// </summary>
public class RapierAerodynamicsTests {
    [Fact]
    public void ReferenceGeometryMatchesClosedRapierSizing() {
        Assert.Equal(RapierV2Design.ReferenceAreaM2,
            RapierAerodynamics.ReferenceAreaM2, 12);
        Assert.Equal(RapierV2Design.SpanM, RapierAerodynamics.SpanM, 12);
        Assert.Equal(RapierV2Design.AspectRatio,
            RapierAerodynamics.AspectRatio, 12);
        Assert.Equal(
            RapierAerodynamics.SpanM * RapierAerodynamics.SpanM
                / RapierAerodynamics.ReferenceAreaM2,
            RapierAerodynamics.AspectRatio,
            6);
        Assert.Equal(RapierV2Design.MeanAerodynamicChordM,
            RapierAerodynamics.MeanReferenceChordM, 12);
    }

    [Fact]
    public void RenderedAndAerodynamicPlanformShareOneCanonicalShape() {
        Assert.Equal(RapierV2Design.ReferenceAreaM2,
            RapierAerodynamics.RenderedSolidPlanformAreaM2, 12);
        Assert.Equal(0.0, RapierAerodynamics.BodyOverlapNonReferenceAreaM2, 12);
        Assert.Equal(
            RapierAerodynamics.RenderedSolidPlanformAreaM2
                - RapierAerodynamics.ReferenceAreaM2,
            RapierAerodynamics.BodyOverlapNonReferenceAreaM2,
            12);
        Assert.Equal(RapierV2Design.MeanAerodynamicChordM,
            RapierAerodynamics.MeanReferenceChordM, 12);
    }

    [Fact]
    public void NormalLawAlphaLimitIsContinuousAndNonIncreasingAboveTransonic() {
        // Not physical CLmax — provisional cranked-delta high-speed normal-law schedule.
        double previous = RapierAerodynamics.NormalLawAlphaLimitRad(0.95);
        Assert.True(previous > 0.0);

        for (double mach = 0.95; mach <= 3.8; mach += 0.05) {
            double alpha = RapierAerodynamics.NormalLawAlphaLimitRad(mach);
            Assert.True(double.IsFinite(alpha), $"non-finite alpha limit at M{mach:F2}");
            Assert.True(alpha > 0.0, $"alpha limit must stay positive at M{mach:F2}");
            Assert.True(
                alpha <= previous + 1e-12,
                $"normal-law alpha must be non-increasing above transonic: M{mach:F2} rose from {previous} to {alpha}");
            previous = alpha;
        }

        // Continuity: small Mach steps must not jump discontinuously.
        for (double mach = 0.8; mach <= 3.5; mach += 0.1) {
            double a0 = RapierAerodynamics.NormalLawAlphaLimitRad(mach);
            double a1 = RapierAerodynamics.NormalLawAlphaLimitRad(mach + 1e-4);
            Assert.True(
                Math.Abs(a1 - a0) < 5e-4,
                $"alpha-limit discontinuity near M{mach:F2}: {a0} -> {a1}");
        }
    }

    [Fact]
    public void ControlEffectivenessRetainsUnitySubsonicAndHalvesNearMach165() {
        Assert.Equal(1.0, RapierAerodynamics.SupersonicControlEffectiveness(0.0), 6);
        Assert.Equal(1.0, RapierAerodynamics.SupersonicControlEffectiveness(0.9), 6);
        Assert.Equal(1.0, RapierAerodynamics.SupersonicControlEffectiveness(1.0), 6);

        // NACA RM L52H14: elevon/control effectiveness near half by about Mach 1.65.
        double at165 = RapierAerodynamics.SupersonicControlEffectiveness(1.65);
        Assert.InRange(at165, 0.45, 0.55);

        double previous = RapierAerodynamics.SupersonicControlEffectiveness(1.0);
        for (double mach = 1.0; mach <= 3.5; mach += 0.05) {
            double eta = RapierAerodynamics.SupersonicControlEffectiveness(mach);
            Assert.True(double.IsFinite(eta));
            Assert.InRange(eta, 0.0, 1.0);
            Assert.True(
                eta <= previous + 1e-12,
                $"control effectiveness must not rise with Mach: M{mach:F2}");
            previous = eta;
        }

        // Gentle post-1.65 decline — still positive, not a cliff.
        double at25 = RapierAerodynamics.SupersonicControlEffectiveness(2.5);
        Assert.True(at25 < at165);
        Assert.True(at25 > 0.20);
        Assert.True(at165 - at25 < 0.35);
    }

    [Fact]
    public void ZeroDynamicPressureProducesZeroControlMoments() {
        Assert.Equal(0.0, RapierAerodynamics.PitchControlMomentCapacityNm(0.0), 12);
        Assert.Equal(0.0, RapierAerodynamics.YawControlMomentCapacityNm(0.0), 12);
        Assert.Equal(0.0, RapierAerodynamics.RollControlMomentCapacityNm(0.0), 12);
    }

    [Fact]
    public void ControlMomentCapacityScalesWithDynamicPressure() {
        double q1 = 12_000.0;
        double q2 = 24_000.0;
        Assert.Equal(
            2.0 * RapierAerodynamics.PitchControlMomentCapacityNm(q1),
            RapierAerodynamics.PitchControlMomentCapacityNm(q2),
            9);
        Assert.Equal(
            2.0 * RapierAerodynamics.YawControlMomentCapacityNm(q1),
            RapierAerodynamics.YawControlMomentCapacityNm(q2),
            9);
        Assert.Equal(
            2.0 * RapierAerodynamics.RollControlMomentCapacityNm(q1),
            RapierAerodynamics.RollControlMomentCapacityNm(q2),
            9);

        // Pitch uses q·S·c; yaw/roll use q·S·b.
        double pitch = RapierAerodynamics.PitchControlMomentCapacityNm(q1);
        double yaw = RapierAerodynamics.YawControlMomentCapacityNm(q1);
        double roll = RapierAerodynamics.RollControlMomentCapacityNm(q1);
        Assert.Equal(
            q1 * RapierAerodynamics.ReferenceAreaM2 * RapierAerodynamics.MeanReferenceChordM
                * RapierAerodynamics.ProvisionalPitchControlMomentCoefficientMax,
            pitch,
            9);
        Assert.Equal(
            q1 * RapierAerodynamics.ReferenceAreaM2 * RapierAerodynamics.SpanM
                * RapierAerodynamics.ProvisionalYawControlMomentCoefficientMax,
            yaw,
            9);
        Assert.Equal(
            q1 * RapierAerodynamics.ReferenceAreaM2 * RapierAerodynamics.SpanM
                * RapierAerodynamics.ProvisionalRollControlMomentCoefficientMax,
            roll,
            9);
    }

    [Fact]
    public void ControlMomentCapacityScalesWithConfigurationAuthority() {
        double q = 15_000.0;
        Assert.Equal(
            0.5 * RapierAerodynamics.PitchControlMomentCapacityNm(q),
            RapierAerodynamics.PitchControlMomentCapacityNm(q, configurationAuthority: 0.5),
            9);
        Assert.Equal(
            0.0,
            RapierAerodynamics.YawControlMomentCapacityNm(q, configurationAuthority: 0.0),
            12);
        Assert.Equal(
            RapierAerodynamics.RollControlMomentCapacityNm(q),
            RapierAerodynamics.RollControlMomentCapacityNm(q, configurationAuthority: 1.0),
            12);
        // Authority above one does not invent extra aero capacity.
        Assert.Equal(
            RapierAerodynamics.PitchControlMomentCapacityNm(q, 1.0),
            RapierAerodynamics.PitchControlMomentCapacityNm(q, 1.5),
            12);
    }

    [Fact]
    public void SupersonicMomentCapacityUsesThePublishedEffectivenessSchedule() {
        double q = 20_000.0;
        double subsonic = RapierAerodynamics.PitchControlMomentCapacityNm(q, mach: 0.9);
        double earlySupersonic =
            RapierAerodynamics.PitchControlMomentCapacityNm(q, mach: 1.65);
        double highSupersonic =
            RapierAerodynamics.PitchControlMomentCapacityNm(q, mach: 3.5);

        Assert.Equal(0.5 * subsonic, earlySupersonic, 9);
        Assert.True(highSupersonic < earlySupersonic);
        Assert.True(highSupersonic > 0.0);
    }

    [Fact]
    public void InletFlowRecoveryDependsOnMachAndCombinedFlowAngle() {
        // Below ram regime the surrogate reports full recovery regardless of incidence.
        Assert.Equal(1.0, RapierAerodynamics.InletFlowRecovery(0.8, 0.4, 0.3), 6);
        Assert.Equal(1.0, RapierAerodynamics.InletFlowRecovery(1.5, 0.5, 0.5), 6);
        Assert.Equal(
            1.0,
            RapierAerodynamics.InletFlowRecovery(
                RapierAerodynamics.RamRegimeStartMach - 1e-6, 0.6, 0.2),
            6);

        double incidence = RapierAerodynamics.InletDesignFlowIncidenceRad;
        double onDesign = RapierAerodynamics.InletFlowRecovery(2.6, incidence, 0.0);
        Assert.Equal(1.0, onDesign, 6);

        double alphaOff = RapierAerodynamics.InletFlowRecovery(2.6, incidence + 0.25, 0.0);
        double betaOff = RapierAerodynamics.InletFlowRecovery(2.6, incidence, 0.25);
        double bothOff = RapierAerodynamics.InletFlowRecovery(
            2.6, incidence + 0.25, 0.25);
        Assert.True(alphaOff < onDesign);
        Assert.True(betaOff < onDesign);
        Assert.Equal(alphaOff, betaOff, 9);
        Assert.True(bothOff < alphaOff);

        // Higher Mach makes the same off-design angle hurt more (continuous degradation).
        double atRam = RapierAerodynamics.InletFlowRecovery(
            2.1, incidence + 0.20, 0.10);
        double atHigh = RapierAerodynamics.InletFlowRecovery(
            3.2, incidence + 0.20, 0.10);
        Assert.True(atHigh < atRam);
        Assert.True(atHigh > 0.0);
        Assert.True(atRam <= 1.0);

        double justBelow = RapierAerodynamics.InletFlowRecovery(
            RapierAerodynamics.RamRegimeStartMach - 1e-6, incidence + 0.3, 0.2);
        double atOnset = RapierAerodynamics.InletFlowRecovery(
            RapierAerodynamics.RamRegimeStartMach, incidence + 0.3, 0.2);
        double justAbove = RapierAerodynamics.InletFlowRecovery(
            RapierAerodynamics.RamRegimeStartMach + 1e-6, incidence + 0.3, 0.2);
        Assert.Equal(1.0, justBelow, 9);
        Assert.Equal(1.0, atOnset, 9);
        Assert.InRange(Math.Abs(justAbove - atOnset), 0.0, 1e-8);
    }

    [Fact]
    public void NormalLawScheduleSupportsDesignGrossAtFl720Mach35() {
        AircraftParams p = FlightModel.RapierPublicDataSurrogate;
        const double fl720M = 21_945.6;
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(fl720M);
        double mach = 3.5;
        double speedMps = air.SpeedOfSoundMps * mach;
        double q = 0.5 * air.DensityKgM3 * speedMps * speedMps;
        double clAlpha = FlightModel.EffectiveClAlpha(p, mach);
        double floor = RapierAerodynamics.LevelFlightAlphaFloorRad(
            p.MassKg, q, clAlpha, loadFactor: 1.05);
        double schedule = RapierAerodynamics.NormalLawAlphaLimitRad(mach);
        Assert.True(schedule >= floor,
            $"Mach schedule {schedule:F4} rad should clear the 1.05g floor {floor:F4} at FL720/M3.5");
        double cl = clAlpha * schedule;
        double nz = q * RapierAerodynamics.ReferenceAreaM2 * cl / (p.MassKg * 9.80665);
        Assert.InRange(nz, 1.05, 1.20);
    }

    [Fact]
    public void InletUnstartIsStickyAboveRamAndClearsWhenFlowAngleUnloads() {
        const double mach = 2.6;
        double incidence = RapierAerodynamics.InletDesignFlowIncidenceRad;
        Assert.False(RapierAerodynamics.NextInletUnstartState(
            mach, incidence, 0.0, false));
        Assert.False(RapierAerodynamics.NextInletUnstartState(
            RapierAerodynamics.RamRegimeStartMach, incidence + 0.5, 0.0, false));

        Assert.True(RapierAerodynamics.NextInletUnstartState(
            mach, incidence + RapierAerodynamics.InletUnstartTripFlowAngleRad + 1e-9,
            0.0, false));
        Assert.True(RapierAerodynamics.NextInletUnstartState(
            mach, incidence + 0.08, 0.0, previouslyUnstarted: true),
            "sticky unstart holds until clear angle");
        Assert.False(RapierAerodynamics.NextInletUnstartState(
            mach, incidence + RapierAerodynamics.InletUnstartClearFlowAngleRad - 1e-9, 0.0,
            previouslyUnstarted: true));

        double continuous = RapierAerodynamics.InletFlowRecovery(
            mach, incidence + 0.08, 0.0);
        double collapsed = RapierAerodynamics.InletFlowRecovery(
            mach, incidence + 0.08, 0.0, inletUnstarted: true);
        Assert.True(collapsed <= RapierAerodynamics.InletUnstartRecoveryFloor + 1e-9);
        Assert.True(collapsed <= continuous);
    }

    [Theory]
    [InlineData(1.9, 0.30, 0.20, false, 1.0, false)]
    [InlineData(2.3, 0.12, 0.04, false, 0.15, true)]
    [InlineData(2.6, 0.08, 0.03, false, 0.9240406226587864, false)]
    [InlineData(2.6, 0.08, 0.03, true, 0.15, true)]
    [InlineData(4.2, 0.05, 0.04, false, 0.8940458962166633, false)]
    public void InletGoldenVectorsMatchTheShapeFirstEngineeringModel(
        double mach,
        double alphaDeviationRad,
        double betaRad,
        bool previouslyUnstarted,
        double expectedRecovery,
        bool expectedUnstarted) {
        double alphaRad = RapierAerodynamics.InletDesignFlowIncidenceRad
            + alphaDeviationRad;
        bool unstarted = RapierAerodynamics.NextInletUnstartState(
            mach, alphaRad, betaRad, previouslyUnstarted);
        double recovery = RapierAerodynamics.InletFlowRecovery(
            mach, alphaRad, betaRad, unstarted);

        Assert.Equal(expectedUnstarted, unstarted);
        Assert.Equal(expectedRecovery, recovery, precision: 12);
    }

    [Fact]
    public void HighDynamicPressurePlacardIsAuthoredSoftCue() {
        Assert.Equal(55_000.0, RapierAerodynamics.HighDynamicPressurePlacardPa, 9);
        Assert.Equal(RapierV2Design.MaximumDynamicPressurePa,
            RapierAerodynamics.HighDynamicPressurePlacardPa, 12);
        Assert.Equal(RapierV2Design.MaximumScreenedMach,
            RapierAerodynamics.MaximumOperatingMach, 12);
        Assert.False(RapierAerodynamics.IsOverDynamicPressure(
            RapierAerodynamics.HighDynamicPressurePlacardPa));
        Assert.True(RapierAerodynamics.IsOverDynamicPressure(
            RapierAerodynamics.HighDynamicPressurePlacardPa + 1.0));
    }
}

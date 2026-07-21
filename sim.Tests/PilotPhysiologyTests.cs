using GunsOnly.Sim;

public class PilotPhysiologyTests {
    const double Dt = 0.02;

    static PilotPhysiologyState Hold(PilotPhysiologyModel model, double g,
        double seconds, double dt = Dt, double? techniqueEffort01 = null) {
        int steps = checked((int)Math.Round(seconds / dt));
        Assert.Equal(seconds, steps * dt, 10);
        PilotPhysiologyState state = model.State;
        for (int step = 0; step < steps; step++) {
            state = techniqueEffort01 is { } effort
                ? model.Step(dt, new PilotPhysiologyInput(g, effort))
                : model.Step(dt, g);
        }
        return state;
    }

    [Fact]
    public void OneGIsAStableHealthyEquilibriumWithNoExposureDose() {
        var model = new PilotPhysiologyModel();
        PilotPhysiologyState state = Hold(model, 1.0, 60.0);

        Assert.Equal(60.0, state.ElapsedSeconds, 9);
        Assert.Equal(0.0, state.PositiveExposureGSeconds);
        Assert.Equal(0.0, state.NegativeExposureGSeconds);
        Assert.Equal(1.0, state.RetinalResource01, 12);
        Assert.Equal(1.0, state.CerebralResource01, 12);
        Assert.Equal(1.0, state.PeripheralVision01, 12);
        Assert.Equal(1.0, state.VisualAcuity01, 12);
        Assert.Equal(1.0, state.ControlAuthority01, 12);
        Assert.Equal(PilotVisualImpairment.Clear, state.VisualImpairment);
        Assert.Equal(PilotControlImpairment.Normal, state.ControlImpairment);
    }

    [Fact]
    public void ReferenceProfilesExposeCamiThresholdAnchorsInsteadOfOneMagicLimit() {
        var unprotected = new PilotPhysiologyModel(
            PilotPhysiologyProfile.UnprotectedReference).State;
        var modern = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference).State;

        Assert.Equal(4.1, unprotected.EffectivePositivePeripheralLossG, 12);
        Assert.Equal(4.7, unprotected.EffectivePositiveBlackoutG, 12);
        Assert.Equal(5.4, unprotected.EffectivePositiveLossOfConsciousnessG, 12);
        Assert.Equal(8.9, modern.EffectivePositivePeripheralLossG, 12);
        Assert.Equal(9.5, modern.EffectivePositiveBlackoutG, 12);
        Assert.Equal(10.2, modern.EffectivePositiveLossOfConsciousnessG, 12);
    }

    [Fact]
    public void PositiveGProgressivelyConsumesVisionThenControlAndIntegratesDose() {
        var model = new PilotPhysiologyModel(
            PilotPhysiologyProfile.UnprotectedReference);

        PilotPhysiologyState onset = Hold(model, 6.0, 0.02);
        PilotPhysiologyState developing = Hold(model, 6.0, 0.78);
        PilotPhysiologyState severe = Hold(model, 6.0, 0.70);
        PilotPhysiologyState lost = Hold(model, 6.0, 2.0);

        Assert.Equal(PilotVisualImpairment.PeripheralLoss, onset.VisualImpairment);
        Assert.True(developing.EffectiveRetinalResource01
            < onset.EffectiveRetinalResource01);
        Assert.True(severe.VisualAcuity01 < developing.VisualAcuity01);
        Assert.Equal(PilotVisualImpairment.Blackout, lost.VisualImpairment);
        Assert.Equal(PilotControlImpairment.Incapacitated, lost.ControlImpairment);
        Assert.Equal(17.5, lost.PositiveExposureGSeconds, 9);
        Assert.True(lost.AbsoluteIncapacitationRemainingSeconds > 9.0);
        Assert.Equal(0.0, lost.Consciousness01);
        Assert.Equal(0.0, lost.ControlAuthority01);
    }

    [Fact]
    public void RetinalAndCerebralRecoveryRemainSeparateAfterGLoc() {
        var model = new PilotPhysiologyModel(
            PilotPhysiologyProfile.UnprotectedReference);
        PilotPhysiologyState lost = Hold(model, 6.0, 3.5);
        double doseAtRelease = lost.PositiveExposureGSeconds;

        PilotPhysiologyState visionRecovered = Hold(model, 1.0, 2.74);
        Assert.True(visionRecovered.RetinalResource01 >= 0.88,
            $"retinal reserve should recover about 90% by the configured 2.74 s: {visionRecovered.RetinalResource01:F3}");
        Assert.Equal(0.0, visionRecovered.Consciousness01);
        Assert.True(visionRecovered.AbsoluteIncapacitationRemainingSeconds > 0.0);

        PilotPhysiologyState relativeRecovery = Hold(model, 1.0, 9.0);
        Assert.Equal(0.0, relativeRecovery.AbsoluteIncapacitationRemainingSeconds, 9);
        Assert.InRange(relativeRecovery.Consciousness01, 0.5, 0.999);
        Assert.InRange(relativeRecovery.ControlAuthority01, 0.3, 0.999);
        Assert.Equal(doseAtRelease, relativeRecovery.PositiveExposureGSeconds, 9);

        PilotPhysiologyState recovered = Hold(model, 1.0, 30.0);
        Assert.True(recovered.CerebralResource01 > relativeRecovery.CerebralResource01);
        Assert.True(recovered.ControlAuthority01 > 0.99);
    }

    [Fact]
    public void RapidOnsetCreatesMoreTransientDebtThanAOneGPerSecondRamp() {
        var rapid = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        PilotPhysiologyState rapidState = rapid.Step(0.02, 9.0);

        var gradual = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        const double dt = 0.02;
        const int steps = 400;
        PilotPhysiologyState gradualState = gradual.State;
        for (int step = 1; step <= steps; step++) {
            double g = 1.0 + 8.0 * step / steps;
            gradualState = gradual.Step(dt, g);
        }

        Assert.True(rapidState.PositiveOnsetRateGPerSecond > 300.0);
        Assert.Equal(1.0, gradualState.PositiveOnsetRateGPerSecond, 9);
        Assert.True(rapidState.PositiveRetinalOnsetDebt01
            > gradualState.PositiveRetinalOnsetDebt01 * 4.0,
            $"rapid {rapidState.PositiveRetinalOnsetDebt01:F3} vs gradual {gradualState.PositiveRetinalOnsetDebt01:F3}");
        Assert.True(rapidState.EffectiveRetinalResource01
            < gradualState.EffectiveRetinalResource01);
    }

    [Fact]
    public void NegativeGProducesRedoutAndLeavesAPushPullPenalty() {
        var model = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        PilotPhysiologyState negative = Hold(model, -2.5, 4.0);

        Assert.Equal(10.0, negative.NegativeExposureGSeconds, 9);
        Assert.Equal(PilotVisualImpairment.Redout, negative.VisualImpairment);
        Assert.True(negative.Redout01 > 0.5);
        Assert.True(negative.PushPullPenaltyG > 0.5);

        PilotPhysiologyState recovering = Hold(model, 1.0, 6.0);
        Assert.True(recovering.Redout01 < negative.Redout01 * 0.1);
        Assert.InRange(recovering.PushPullPenaltyG,
            negative.PushPullPenaltyG * 0.1,
            negative.PushPullPenaltyG * 0.3);
        Assert.True(recovering.PushPullPenaltyG > recovering.Redout01,
            "visual redout may clear before the negative-to-positive G tolerance penalty");
        Assert.Equal(negative.NegativeExposureGSeconds,
            recovering.NegativeExposureGSeconds, 9);
    }

    [Fact]
    public void NegativeGHistoryReducesTheNextPositiveGPullTolerance() {
        var clean = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        var pushPull = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);

        Hold(pushPull, -2.0, 3.0);
        PilotPhysiologyState cleanPull = Hold(clean, 8.6, 2.0);
        PilotPhysiologyState pushPullState = Hold(pushPull, 8.6, 2.0);

        Assert.True(pushPullState.PushPullPenaltyG > 0.1);
        Assert.True(pushPullState.EffectivePositivePeripheralLossG
            < cleanPull.EffectivePositivePeripheralLossG);
        Assert.True(pushPullState.RetinalResource01 < cleanPull.RetinalResource01,
            $"push-pull retinal reserve {pushPullState.RetinalResource01:F3} vs clean {cleanPull.RetinalResource01:F3}");
        Assert.True(pushPullState.ControlAuthority01 < cleanPull.ControlAuthority01);
    }

    [Fact]
    public void EquipmentAndTechniqueAreExplicitProtectionNotAircraftMagic() {
        var unprotected = new PilotPhysiologyModel(
            PilotPhysiologyProfile.UnprotectedReference);
        var protectedPilot = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);

        PilotPhysiologyState unprotectedState = Hold(unprotected, 8.0, 3.0);
        PilotPhysiologyState protectedState = Hold(protectedPilot, 8.0, 3.0);

        Assert.True(protectedState.EffectivePositivePeripheralLossG
            > unprotectedState.EffectivePositivePeripheralLossG + 4.7);
        Assert.True(protectedState.RetinalResource01
            > unprotectedState.RetinalResource01 + 0.7);
        Assert.True(protectedState.CerebralResource01
            > unprotectedState.CerebralResource01 + 0.7);
        Assert.Equal(PilotVisualImpairment.Clear, protectedState.VisualImpairment);
        Assert.Equal(PilotControlImpairment.Normal, protectedState.ControlImpairment);

        PilotPhysiologyState relaxed = Hold(protectedPilot, 1.0, 4.0,
            techniqueEffort01: 0.0);
        Assert.True(relaxed.TechniqueEngagement01 < 0.1);
        Assert.True(relaxed.EffectivePositivePeripheralLossG < 6.0);
    }

    [Fact]
    public void ModernCalibrationDistinguishesNineGWorkFromBriefAndSustainedElevenG() {
        var nineGModel = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        PilotPhysiologyState nineG = Hold(nineGModel, 9.0, 15.0);
        Assert.Equal(0.0, nineG.AbsoluteIncapacitationRemainingSeconds);
        Assert.Equal(PilotControlImpairment.Normal, nineG.ControlImpairment);
        Assert.True(nineG.Consciousness01 > 0.99);
        Assert.True(nineG.VisualImpairment is PilotVisualImpairment.Clear
            or PilotVisualImpairment.PeripheralLoss);
        PilotPhysiologyState nineGReleased = nineGModel.Step(Dt, 1.0);
        Assert.Equal(0.0, nineGReleased.NegativeOnsetRateGPerSecond);
        Assert.Equal(0.0, nineGReleased.NegativeOnsetDebt01);
        Assert.Equal(PilotControlImpairment.Normal, nineGReleased.ControlImpairment);

        var briefModel = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        PilotPhysiologyState briefElevenG = Hold(briefModel, 11.0, 2.0);
        Assert.Equal(0.0, briefElevenG.AbsoluteIncapacitationRemainingSeconds);
        Assert.True(briefElevenG.Consciousness01 > 0.5,
            "a two-second override may be impaired but must remain a recoverable pilot action");
        Assert.True(briefElevenG.ControlAuthority01 > 0.4);
        PilotPhysiologyState briefReleased = briefModel.Step(Dt, 1.0);
        Assert.Equal(0.0, briefReleased.NegativeOnsetRateGPerSecond);
        Assert.Equal(0.0, briefReleased.NegativeOnsetDebt01);
        Assert.Equal(0.0, briefReleased.AbsoluteIncapacitationRemainingSeconds);
        Assert.True(briefReleased.Consciousness01 >= briefElevenG.Consciousness01,
            "unloading positive G must begin recovery, not create synthetic negative-G debt");

        var sustainedModel = new PilotPhysiologyModel(
            PilotPhysiologyProfile.ModernFastJetReference);
        PilotPhysiologyState fiveSecondElevenG = Hold(sustainedModel, 11.0, 5.0);
        Assert.Equal(0.0, fiveSecondElevenG.AbsoluteIncapacitationRemainingSeconds);
        Assert.True(fiveSecondElevenG.Consciousness01 > 0.0,
            "the rapid-onset research guard forbids deterministic G-LOC before five seconds");
        PilotPhysiologyState sustainedElevenG = fiveSecondElevenG;
        while (sustainedElevenG.AbsoluteIncapacitationRemainingSeconds <= 0.0
            && sustainedElevenG.ElapsedSeconds < 10.0) {
            sustainedElevenG = sustainedModel.Step(Dt, 11.0);
        }
        Assert.Equal(7.42, sustainedElevenG.ElapsedSeconds, 9);
        Assert.True(sustainedElevenG.AbsoluteIncapacitationRemainingSeconds > 0.0);
        Assert.Equal(0.0, sustainedElevenG.Consciousness01);
        Assert.Equal(PilotControlImpairment.Incapacitated,
            sustainedElevenG.ControlImpairment);

        var unprotectedModel = new PilotPhysiologyModel(
            PilotPhysiologyProfile.UnprotectedReference);
        PilotPhysiologyState unprotectedSixG = Hold(unprotectedModel, 6.0, 4.0);
        Assert.True(unprotectedSixG.AbsoluteIncapacitationRemainingSeconds > 0.0,
            "the unprotected reference must lose consciousness well below modern protected thresholds");
    }

    [Fact]
    public void FixedStepRatesProduceTheSameResourceHistory() {
        static PilotPhysiologyState Run(double dt) {
            var model = new PilotPhysiologyModel(
                PilotPhysiologyProfile.ModernFastJetReference);
            Hold(model, 1.0, 1.0, dt);
            Hold(model, 9.0, 4.0, dt);
            Hold(model, 1.0, 3.0, dt);
            Hold(model, -2.0, 2.0, dt);
            return Hold(model, 1.0, 5.0, dt);
        }

        PilotPhysiologyState twentyHz = Run(1.0 / 20.0);
        PilotPhysiologyState sixtyHz = Run(1.0 / 60.0);
        PilotPhysiologyState twoFortyHz = Run(1.0 / 240.0);

        foreach (PilotPhysiologyState candidate in new[] { twentyHz, twoFortyHz }) {
            Assert.Equal(sixtyHz.PositiveExposureGSeconds,
                candidate.PositiveExposureGSeconds, 9);
            Assert.Equal(sixtyHz.NegativeExposureGSeconds,
                candidate.NegativeExposureGSeconds, 9);
            Assert.Equal(sixtyHz.RetinalResource01, candidate.RetinalResource01, 9);
            Assert.Equal(sixtyHz.CerebralResource01, candidate.CerebralResource01, 9);
            Assert.InRange(Math.Abs(sixtyHz.ControlAuthority01
                - candidate.ControlAuthority01), 0.0, 0.001);
            Assert.Equal(sixtyHz.VisualImpairment, candidate.VisualImpairment);
            Assert.Equal(sixtyHz.ControlImpairment, candidate.ControlImpairment);
        }
    }

    [Fact]
    public void OnsetDebtAndGLocLatchConvergeWithinOneSupportedFixedStep() {
        static (double onsetDebt, double gLocSeconds) Run(double dt) {
            var onsetModel = new PilotPhysiologyModel(
                PilotPhysiologyProfile.ModernFastJetReference);
            PilotPhysiologyState onset = Hold(onsetModel, 9.0, 0.2, dt);

            var locModel = new PilotPhysiologyModel(
                PilotPhysiologyProfile.ModernFastJetReference);
            PilotPhysiologyState state = locModel.State;
            while (state.AbsoluteIncapacitationRemainingSeconds <= 0.0
                && state.ElapsedSeconds < 10.0) {
                state = locModel.Step(dt, 11.0);
            }
            return (onset.PositiveRetinalOnsetDebt01, state.ElapsedSeconds);
        }

        var results = new[] { Run(1.0 / 20.0), Run(1.0 / 60.0), Run(1.0 / 240.0) };
        Assert.True(results.Max(result => result.onsetDebt)
            - results.Min(result => result.onsetDebt) < 0.001);
        Assert.InRange(results.Min(result => result.gLocSeconds), 7.40, 7.50);
        Assert.InRange(results.Max(result => result.gLocSeconds), 7.40, 7.50);
        Assert.True(results.Max(result => result.gLocSeconds)
            - results.Min(result => result.gLocSeconds) <= 1.0 / 20.0 + 1e-12);
    }

    [Fact]
    public void InvalidProfilesAndInputsFailInsteadOfBeingSilentlyClamped() {
        PilotPhysiologyProfile invalid = PilotPhysiologyProfile.ModernFastJetReference with {
            Pilot = PilotConstitutionProfile.ReferenceTrainedFastJet with {
                PositiveBlackoutG = 3.0
            }
        };
        Assert.Throws<ArgumentException>(() => new PilotPhysiologyModel(invalid));
        PilotPhysiologyProfile infinite = PilotPhysiologyProfile.ModernFastJetReference with {
            Pilot = PilotConstitutionProfile.ReferenceTrainedFastJet with {
                PositiveLossOfConsciousnessG = double.PositiveInfinity
            }
        };
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new PilotPhysiologyModel(infinite));

        var model = new PilotPhysiologyModel();
        Assert.Throws<ArgumentOutOfRangeException>(() => model.Step(0.0, 1.0));
        Assert.Throws<ArgumentOutOfRangeException>(() => model.Step(0.02, double.NaN));
        Assert.Throws<ArgumentOutOfRangeException>(() => model.Step(0.02,
            new PilotPhysiologyInput(5.0, 1.1)));
    }
}

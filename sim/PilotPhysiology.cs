namespace GunsOnly.Sim;

/// <summary>
/// Presentation-neutral visual consequence of acceleration along the seated pilot's Z axis.
/// Positive Gz is head-to-foot; negative Gz is foot-to-head. These values describe physiology,
/// not a renderer effect: a HUD may choose how to teach the state without literally blacking out
/// the display.
/// </summary>
public enum PilotVisualImpairment {
    Clear,
    PeripheralLoss,
    TunnelVision,
    Greyout,
    Blackout,
    Redout
}

/// <summary>Progressive ability to make a timely, accurate control response.</summary>
public enum PilotControlImpairment { Normal, Strained, Degraded, Incapacitated }

/// <summary>
/// Pilot-only acceleration thresholds and resource-bank time constants. G values are signed-axis
/// load factors expressed in multiples of standard gravity; negative thresholds are magnitudes.
/// Recovery90 values are the time for a depleted first-order resource bank to recover 90% of the
/// distance to its healthy state after the acceleration stress is removed.
///
/// The reference anchors follow FAA CAMI CGEM public results rather than claiming an individual
/// medical prediction: approximately 4.1 G peripheral-light loss, 4.7 G blackout and 5.4 G loss
/// of consciousness when unprotected, with vision recovery around 2.74 seconds and a separate
/// 10-12 second absolute-incapacitation phase after G-LOC.
/// https://www.faa.gov/sites/faa.gov/files/OAM202306.pdf
/// </summary>
public sealed record PilotConstitutionProfile(
    string Id,
    double PositivePeripheralLossG,
    double PositiveBlackoutG,
    double PositiveLossOfConsciousnessG,
    double NegativeRedoutMagnitudeG,
    double NegativeLossOfConsciousnessMagnitudeG,
    double RetinalDepletionTimeSeconds,
    double CerebralDepletionTimeSeconds,
    double VisionRecovery90Seconds,
    double CerebralRecovery90Seconds,
    double AbsoluteIncapacitationSeconds,
    double PushPullMaximumPenaltyG,
    double PushPullRecovery90Seconds) {

    public static readonly PilotConstitutionProfile ReferenceTrainedFastJet = new(
        Id: "pilot.reference-trained-fast-jet.cami-surrogate.v1",
        PositivePeripheralLossG: 4.1,
        PositiveBlackoutG: 4.7,
        PositiveLossOfConsciousnessG: 5.4,
        NegativeRedoutMagnitudeG: 1.0,
        NegativeLossOfConsciousnessMagnitudeG: 3.0,
        RetinalDepletionTimeSeconds: 1.0,
        CerebralDepletionTimeSeconds: 1.4,
        VisionRecovery90Seconds: 2.74,
        CerebralRecovery90Seconds: 30.0,
        AbsoluteIncapacitationSeconds: 11.0,
        PushPullMaximumPenaltyG: 1.5,
        PushPullRecovery90Seconds: 8.0);
}

/// <summary>
/// Fixed aircraft-borne protection. ThresholdBenefitG shifts all positive-G retinal/cerebral
/// thresholds; no negative-G benefit exists because there is no established effective -Gz
/// countermeasure. RapidOnsetAttenuation01 reduces, but cannot eliminate, onset debt.
/// ResourceDepletionTimeMultiplier represents continued perfusion support after a threshold is
/// crossed; 1 means no support. It affects depletion only, never recovery or negative-G response.
/// </summary>
public sealed record PilotProtectionEquipmentProfile(
    string Id,
    double ThresholdBenefitG,
    double RapidOnsetAttenuation01,
    double ResourceDepletionTimeMultiplier) {

    public static readonly PilotProtectionEquipmentProfile None = new(
        "equipment.none.v1", 0.0, 0.0, 1.0);

    public static readonly PilotProtectionEquipmentProfile KoreaAntiGSuitSurrogate = new(
        "equipment.korea-anti-g-suit.surrogate.v1", 1.0, 0.10, 1.25);

    public static readonly PilotProtectionEquipmentProfile ModernFastJetSurrogate = new(
        "equipment.modern-fast-jet-g-protection.surrogate.v1", 1.5, 0.20, 2.5);
}

/// <summary>
/// Pilot anti-G technique. The requested effort passed to Step is filtered through the engagement
/// and release time constants before it earns MaximumThresholdBenefitG. NominalEffort01 is used by
/// the convenience Step overload; an integration can instead drive effort explicitly from training,
/// fatigue, anticipation, injury, workload, or a future player action.
/// </summary>
public sealed record PilotTechniqueProfile(
    string Id,
    double MaximumThresholdBenefitG,
    double NominalEffort01,
    double EngagementTimeSeconds,
    double ReleaseTimeSeconds,
    double RapidOnsetAttenuation01) {

    public static readonly PilotTechniqueProfile Unstrained = new(
        "technique.unstrained.v1", 0.0, 0.0, 0.6, 1.5, 0.0);

    public static readonly PilotTechniqueProfile TrainedAgsmSurrogate = new(
        "technique.agsm-trained.surrogate.v1", 3.3, 1.0, 0.6, 1.5, 0.30);
}

/// <summary>
/// Dimensionless presentation/control thresholds over the explicit retinal and cerebral resource
/// banks. Rapid-onset costs are reserve fractions per G above OnsetRateThresholdGPerSecond. They
/// are separate for retina and cerebrum so rapid G can remove consciousness with little warning,
/// rather than reducing the physiology to one threshold timer.
/// </summary>
public sealed record PilotImpairmentResponseProfile(
    double OnsetRateThresholdGPerSecond,
    double PositiveRetinalOnsetCostPerG,
    double PositiveCerebralOnsetCostPerG,
    double NegativeOnsetCostPerG,
    double OnsetDebtRecoverySeconds,
    double ClearVisionReserve01,
    double TunnelVisionReserve01,
    double GreyoutReserve01,
    double BlackoutReserve01,
    double RedoutBurden01,
    double ControlStrainReserve01,
    double ControlDegradedReserve01,
    double LossOfConsciousnessReserve01,
    double MaximumAdditionalControlDelaySeconds) {

    public static readonly PilotImpairmentResponseProfile Reference = new(
        OnsetRateThresholdGPerSecond: 0.1,
        PositiveRetinalOnsetCostPerG: 0.055,
        PositiveCerebralOnsetCostPerG: 0.020,
        NegativeOnsetCostPerG: 0.090,
        OnsetDebtRecoverySeconds: 1.1,
        ClearVisionReserve01: 0.88,
        TunnelVisionReserve01: 0.62,
        GreyoutReserve01: 0.32,
        BlackoutReserve01: 0.10,
        RedoutBurden01: 0.25,
        ControlStrainReserve01: 0.78,
        ControlDegradedReserve01: 0.48,
        LossOfConsciousnessReserve01: 0.12,
        MaximumAdditionalControlDelaySeconds: 0.45);
}

/// <summary>
/// Complete replaceable physiology calibration. It intentionally keeps pilot constitution,
/// installed equipment, learned technique and response mapping separate so scenario authors do
/// not hide medical capability inside an airframe's aerodynamic coefficients.
/// </summary>
public sealed record PilotPhysiologyProfile(
    string Id,
    PilotConstitutionProfile Pilot,
    PilotProtectionEquipmentProfile Equipment,
    PilotTechniqueProfile Technique,
    PilotImpairmentResponseProfile Response) {

    public static readonly PilotPhysiologyProfile UnprotectedReference = new(
        "physiology.unprotected-reference.cami-surrogate.v1",
        PilotConstitutionProfile.ReferenceTrainedFastJet,
        PilotProtectionEquipmentProfile.None,
        PilotTechniqueProfile.Unstrained,
        PilotImpairmentResponseProfile.Reference);

    public static readonly PilotPhysiologyProfile KoreaFastJetReference = new(
        "physiology.korea-fast-jet.surrogate.v1",
        PilotConstitutionProfile.ReferenceTrainedFastJet,
        PilotProtectionEquipmentProfile.KoreaAntiGSuitSurrogate,
        PilotTechniqueProfile.TrainedAgsmSurrogate,
        PilotImpairmentResponseProfile.Reference);

    public static readonly PilotPhysiologyProfile ModernFastJetReference = new(
        "physiology.modern-fast-jet.surrogate.v1",
        PilotConstitutionProfile.ReferenceTrainedFastJet,
        PilotProtectionEquipmentProfile.ModernFastJetSurrogate,
        PilotTechniqueProfile.TrainedAgsmSurrogate,
        PilotImpairmentResponseProfile.Reference);
}

/// <summary>One deterministic physiology step input.</summary>
/// <param name="NormalAccelerationG">
/// Signed seated-pilot Z-axis load factor: +Gz is head-to-foot and -Gz is foot-to-head.
/// </param>
/// <param name="TechniqueEffort01">Requested anti-G technique effort in [0,1].</param>
public readonly record struct PilotPhysiologyInput(
    double NormalAccelerationG,
    double TechniqueEffort01);

/// <summary>
/// Immutable output snapshot. Exposure values are cumulative integrals since Reset: positive
/// exposure integrates max(Gz-1,0), while negative exposure integrates max(-Gz,0), both in G*s.
/// Resource values are 1=healthy and 0=depleted. Onset debts are temporary reserve deductions.
/// Continuous impairment outputs are authoritative; enums are concise teaching/presentation bands.
/// </summary>
public readonly record struct PilotPhysiologyState(
    double ElapsedSeconds,
    double NormalAccelerationG,
    double PositiveOnsetRateGPerSecond,
    double NegativeOnsetRateGPerSecond,
    double PositiveExposureGSeconds,
    double NegativeExposureGSeconds,
    double TechniqueEngagement01,
    double EffectivePositivePeripheralLossG,
    double EffectivePositiveBlackoutG,
    double EffectivePositiveLossOfConsciousnessG,
    double EffectiveNegativeRedoutMagnitudeG,
    double EffectiveNegativeLossOfConsciousnessMagnitudeG,
    double PushPullPenaltyG,
    double RetinalResource01,
    double CerebralResource01,
    double PositiveRetinalOnsetDebt01,
    double PositiveCerebralOnsetDebt01,
    double NegativeOnsetDebt01,
    double EffectiveRetinalResource01,
    double EffectiveCerebralResource01,
    double Redout01,
    double PeripheralVision01,
    double VisualAcuity01,
    double Consciousness01,
    double CognitiveCapacity01,
    double ControlAuthority01,
    double AdditionalControlDelaySeconds,
    double AbsoluteIncapacitationRemainingSeconds,
    PilotVisualImpairment VisualImpairment,
    PilotControlImpairment ControlImpairment);

/// <summary>
/// Deterministic, allocation-free-after-construction G-physiology core. Resource banks use exact
/// exponential updates for the held input in each step. Onset history converges across ordinary
/// fixed-step rates; threshold crossings and G-LOC latching are quantized by at most one caller
/// step. No random tolerance rolls, frame-count counters, or renderer state exist here.
///
/// This is a transparent training surrogate compatible with the public CAMI CGEM architecture
/// (separate retinal and cerebral resource/resupply state, onset/offset history and push-pull), not
/// a substitute for that aeromedical model or a prediction for an individual pilot.
/// </summary>
public sealed class PilotPhysiologyModel {
    const double LogTen = 2.302585092994046;

    readonly PilotPhysiologyProfile _profile;
    double _elapsedSeconds;
    double _previousG;
    double _positiveExposureGSeconds;
    double _negativeExposureGSeconds;
    double _techniqueEngagement01;
    double _retinalResource01;
    double _cerebralResource01;
    double _negativeBurden01;
    double _pushPullBurden01;
    double _positiveRetinalOnsetDebt01;
    double _positiveCerebralOnsetDebt01;
    double _negativeOnsetDebt01;
    double _absoluteIncapacitationRemainingSeconds;
    PilotPhysiologyState _state;

    public PilotPhysiologyModel(PilotPhysiologyProfile? profile = null) {
        _profile = profile ?? PilotPhysiologyProfile.ModernFastJetReference;
        Validate(_profile);
        Reset();
    }

    public PilotPhysiologyProfile Profile => _profile;
    public PilotPhysiologyState State => _state;

    /// <summary>Restore healthy resource banks and zero cumulative dose/history.</summary>
    public void Reset(double initialNormalAccelerationG = 1.0,
        double? initialTechniqueEffort01 = null) {
        RequireFinite(initialNormalAccelerationG, nameof(initialNormalAccelerationG));
        double effort = initialTechniqueEffort01 ?? _profile.Technique.NominalEffort01;
        RequireUnit(effort, nameof(initialTechniqueEffort01));
        _elapsedSeconds = 0.0;
        _previousG = initialNormalAccelerationG;
        _positiveExposureGSeconds = 0.0;
        _negativeExposureGSeconds = 0.0;
        _techniqueEngagement01 = effort;
        _retinalResource01 = 1.0;
        _cerebralResource01 = 1.0;
        _negativeBurden01 = 0.0;
        _pushPullBurden01 = 0.0;
        _positiveRetinalOnsetDebt01 = 0.0;
        _positiveCerebralOnsetDebt01 = 0.0;
        _negativeOnsetDebt01 = 0.0;
        _absoluteIncapacitationRemainingSeconds = 0.0;
        _state = Project(initialNormalAccelerationG, 0.0, 0.0);
    }

    /// <summary>Advance using the profile's nominal anti-G technique effort.</summary>
    public PilotPhysiologyState Step(double dtSeconds, double normalAccelerationG) =>
        Step(dtSeconds, new PilotPhysiologyInput(normalAccelerationG,
            _profile.Technique.NominalEffort01));

    /// <summary>
    /// Advance by dtSeconds. The caller supplies the fixed simulation step and the mean/held Gz for
    /// that interval. Technique effort is a requested value; engagement remains physiological state.
    /// </summary>
    public PilotPhysiologyState Step(double dtSeconds, in PilotPhysiologyInput input) {
        if (!double.IsFinite(dtSeconds) || dtSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds), "Step must be finite and positive.");
        RequireFinite(input.NormalAccelerationG, nameof(input.NormalAccelerationG));
        RequireUnit(input.TechniqueEffort01, nameof(input.TechniqueEffort01));

        PilotTechniqueProfile technique = _profile.Technique;
        double techniqueTime = input.TechniqueEffort01 >= _techniqueEngagement01
            ? technique.EngagementTimeSeconds : technique.ReleaseTimeSeconds;
        _techniqueEngagement01 = Approach(_techniqueEngagement01,
            input.TechniqueEffort01, techniqueTime, dtSeconds);

        // Onset is the growth rate of the hazardous axis component, not signed-G slew. A rapid
        // 11 -> 1 G unload is positive-G offset and must never masquerade as -Gz exposure; likewise
        // returning from -Gz to ordinary +1 G is not a new high-positive-G pull.
        double previousPositiveExcessG = Math.Max(0.0, _previousG - 1.0);
        double currentPositiveExcessG = Math.Max(0.0, input.NormalAccelerationG - 1.0);
        double positiveHazardDeltaG = currentPositiveExcessG - previousPositiveExcessG;
        double previousNegativeMagnitudeG = Math.Max(0.0, -_previousG);
        double currentNegativeMagnitudeG = Math.Max(0.0, -input.NormalAccelerationG);
        double negativeHazardDeltaG = currentNegativeMagnitudeG - previousNegativeMagnitudeG;
        double positiveOnsetRate = Math.Max(0.0, positiveHazardDeltaG / dtSeconds);
        double negativeOnsetRate = Math.Max(0.0, negativeHazardDeltaG / dtSeconds);
        PilotImpairmentResponseProfile response = _profile.Response;
        double rapidPositiveDeltaG = Math.Max(0.0,
            positiveHazardDeltaG - response.OnsetRateThresholdGPerSecond * dtSeconds);
        double rapidNegativeDeltaG = Math.Max(0.0,
            negativeHazardDeltaG - response.OnsetRateThresholdGPerSecond * dtSeconds);
        double onsetAttenuation = 1.0 - (1.0 - _profile.Equipment.RapidOnsetAttenuation01)
            * (1.0 - technique.RapidOnsetAttenuation01 * _techniqueEngagement01);
        double unattenuated = 1.0 - Clamp01(onsetAttenuation);
        double onsetDecay = Math.Exp(-dtSeconds / response.OnsetDebtRecoverySeconds);
        _positiveRetinalOnsetDebt01 = Clamp01(
            (_positiveRetinalOnsetDebt01 + rapidPositiveDeltaG
                * response.PositiveRetinalOnsetCostPerG * unattenuated) * onsetDecay);
        _positiveCerebralOnsetDebt01 = Clamp01(
            (_positiveCerebralOnsetDebt01 + rapidPositiveDeltaG
                * response.PositiveCerebralOnsetCostPerG * unattenuated) * onsetDecay);
        _negativeOnsetDebt01 = Clamp01(
            (_negativeOnsetDebt01 + rapidNegativeDeltaG
                * response.NegativeOnsetCostPerG) * onsetDecay);

        _positiveExposureGSeconds += Math.Max(0.0, input.NormalAccelerationG - 1.0)
            * dtSeconds;
        _negativeExposureGSeconds += Math.Max(0.0, -input.NormalAccelerationG)
            * dtSeconds;

        PilotConstitutionProfile pilot = _profile.Pilot;
        double negativeMagnitudeG = Math.Max(0.0, -input.NormalAccelerationG);
        double negativeTarget = SmoothStep(pilot.NegativeRedoutMagnitudeG,
            pilot.NegativeLossOfConsciousnessMagnitudeG, negativeMagnitudeG);
        double negativeTime = negativeTarget > _negativeBurden01
            ? pilot.CerebralDepletionTimeSeconds / Math.Max(0.25, negativeTarget)
            : RecoveryTimeConstant(pilot.VisionRecovery90Seconds);
        _negativeBurden01 = Approach(_negativeBurden01,
            negativeTarget, negativeTime, dtSeconds);
        double pushPullTime = negativeTarget > _pushPullBurden01
            ? pilot.CerebralDepletionTimeSeconds / Math.Max(0.25, negativeTarget)
            : RecoveryTimeConstant(pilot.PushPullRecovery90Seconds);
        _pushPullBurden01 = Approach(_pushPullBurden01,
            negativeTarget, pushPullTime, dtSeconds);

        double pushPullPenaltyG = pilot.PushPullMaximumPenaltyG
            * Clamp01(_pushPullBurden01 + 0.5 * _negativeOnsetDebt01);
        double protectionBenefitG = _profile.Equipment.ThresholdBenefitG
            + technique.MaximumThresholdBenefitG * _techniqueEngagement01;
        double peripheralLossG = pilot.PositivePeripheralLossG
            + protectionBenefitG - pushPullPenaltyG;
        double blackoutG = pilot.PositiveBlackoutG
            + protectionBenefitG - pushPullPenaltyG;
        double lossOfConsciousnessG = pilot.PositiveLossOfConsciousnessG
            + protectionBenefitG - pushPullPenaltyG;

        double positiveG = Math.Max(0.0, input.NormalAccelerationG);
        double retinalTarget = 1.0 - SmoothStep(peripheralLossG, blackoutG, positiveG);
        double positiveCerebralTarget = 1.0
            - SmoothStep(blackoutG, lossOfConsciousnessG, positiveG);
        double negativeCerebralTarget = 1.0 - negativeTarget;
        double cerebralTarget = Math.Min(positiveCerebralTarget, negativeCerebralTarget);

        double retinalTime = retinalTarget < _retinalResource01
            ? pilot.RetinalDepletionTimeSeconds
                * _profile.Equipment.ResourceDepletionTimeMultiplier
                / Math.Max(0.25, 1.0 - retinalTarget)
            : RecoveryTimeConstant(pilot.VisionRecovery90Seconds);
        double cerebralProtectionMultiplier = positiveCerebralTarget
            <= negativeCerebralTarget
                ? _profile.Equipment.ResourceDepletionTimeMultiplier : 1.0;
        double cerebralTime = cerebralTarget < _cerebralResource01
            ? pilot.CerebralDepletionTimeSeconds
                * cerebralProtectionMultiplier
                / Math.Max(0.25, 1.0 - cerebralTarget)
            : RecoveryTimeConstant(pilot.CerebralRecovery90Seconds);
        _retinalResource01 = Clamp01(Approach(_retinalResource01,
            retinalTarget, retinalTime, dtSeconds));
        _cerebralResource01 = Clamp01(Approach(_cerebralResource01,
            cerebralTarget, cerebralTime, dtSeconds));

        if (_absoluteIncapacitationRemainingSeconds > 0.0) {
            _absoluteIncapacitationRemainingSeconds = Math.Max(0.0,
                _absoluteIncapacitationRemainingSeconds - dtSeconds);
        }
        double effectiveCerebral = Clamp01(_cerebralResource01
            - _positiveCerebralOnsetDebt01 - _negativeOnsetDebt01);
        if (_absoluteIncapacitationRemainingSeconds <= 0.0
            && effectiveCerebral <= response.LossOfConsciousnessReserve01) {
            _absoluteIncapacitationRemainingSeconds = pilot.AbsoluteIncapacitationSeconds;
        }

        _elapsedSeconds += dtSeconds;
        _previousG = input.NormalAccelerationG;
        _state = Project(input.NormalAccelerationG, positiveOnsetRate, negativeOnsetRate);
        return _state;
    }

    PilotPhysiologyState Project(double normalAccelerationG,
        double positiveOnsetRate, double negativeOnsetRate) {
        PilotConstitutionProfile pilot = _profile.Pilot;
        PilotTechniqueProfile technique = _profile.Technique;
        PilotImpairmentResponseProfile response = _profile.Response;
        double pushPullPenaltyG = pilot.PushPullMaximumPenaltyG
            * Clamp01(_pushPullBurden01 + 0.5 * _negativeOnsetDebt01);
        double benefitG = _profile.Equipment.ThresholdBenefitG
            + technique.MaximumThresholdBenefitG * _techniqueEngagement01;
        double effectiveRetinal = Clamp01(_retinalResource01
            - _positiveRetinalOnsetDebt01 - _negativeOnsetDebt01);
        double effectiveCerebral = Clamp01(_cerebralResource01
            - _positiveCerebralOnsetDebt01 - _negativeOnsetDebt01);
        double redout = Clamp01(_negativeBurden01 + _negativeOnsetDebt01);

        double peripheralVision = SmoothStep(response.BlackoutReserve01,
            response.ClearVisionReserve01, effectiveRetinal) * (1.0 - 0.55 * redout);
        double visualAcuity = SmoothStep(response.BlackoutReserve01,
            response.GreyoutReserve01, effectiveRetinal) * (1.0 - redout);
        bool absoluteIncapacitation = _absoluteIncapacitationRemainingSeconds > 0.0;
        double consciousness = absoluteIncapacitation ? 0.0 : SmoothStep(
            response.LossOfConsciousnessReserve01,
            response.ControlStrainReserve01, effectiveCerebral);
        double controlDegradation = 1.0 - SmoothStep(
            response.LossOfConsciousnessReserve01,
            response.ControlStrainReserve01, effectiveCerebral);
        double cognitiveCapacity = consciousness * (1.0 - 0.55 * controlDegradation);
        double controlAuthority = consciousness * (1.0 - 0.70 * controlDegradation);
        double additionalDelay = response.MaximumAdditionalControlDelaySeconds
            * Math.Max(controlDegradation, 1.0 - consciousness);

        PilotVisualImpairment visual;
        if (absoluteIncapacitation) visual = PilotVisualImpairment.Blackout;
        else if (redout >= response.RedoutBurden01
            && redout > 1.0 - effectiveRetinal) visual = PilotVisualImpairment.Redout;
        else if (effectiveRetinal <= response.BlackoutReserve01)
            visual = PilotVisualImpairment.Blackout;
        else if (effectiveRetinal <= response.GreyoutReserve01)
            visual = PilotVisualImpairment.Greyout;
        else if (effectiveRetinal <= response.TunnelVisionReserve01)
            visual = PilotVisualImpairment.TunnelVision;
        else if (effectiveRetinal <= response.ClearVisionReserve01)
            visual = PilotVisualImpairment.PeripheralLoss;
        else visual = PilotVisualImpairment.Clear;

        PilotControlImpairment control = absoluteIncapacitation
            || effectiveCerebral <= response.LossOfConsciousnessReserve01
            ? PilotControlImpairment.Incapacitated
            : effectiveCerebral <= response.ControlDegradedReserve01
                ? PilotControlImpairment.Degraded
                : effectiveCerebral <= response.ControlStrainReserve01
                    ? PilotControlImpairment.Strained
                    : PilotControlImpairment.Normal;

        return new PilotPhysiologyState(
            ElapsedSeconds: _elapsedSeconds,
            NormalAccelerationG: normalAccelerationG,
            PositiveOnsetRateGPerSecond: positiveOnsetRate,
            NegativeOnsetRateGPerSecond: negativeOnsetRate,
            PositiveExposureGSeconds: _positiveExposureGSeconds,
            NegativeExposureGSeconds: _negativeExposureGSeconds,
            TechniqueEngagement01: _techniqueEngagement01,
            EffectivePositivePeripheralLossG: pilot.PositivePeripheralLossG
                + benefitG - pushPullPenaltyG,
            EffectivePositiveBlackoutG: pilot.PositiveBlackoutG
                + benefitG - pushPullPenaltyG,
            EffectivePositiveLossOfConsciousnessG: pilot.PositiveLossOfConsciousnessG
                + benefitG - pushPullPenaltyG,
            EffectiveNegativeRedoutMagnitudeG: pilot.NegativeRedoutMagnitudeG,
            EffectiveNegativeLossOfConsciousnessMagnitudeG:
                pilot.NegativeLossOfConsciousnessMagnitudeG,
            PushPullPenaltyG: pushPullPenaltyG,
            RetinalResource01: _retinalResource01,
            CerebralResource01: _cerebralResource01,
            PositiveRetinalOnsetDebt01: _positiveRetinalOnsetDebt01,
            PositiveCerebralOnsetDebt01: _positiveCerebralOnsetDebt01,
            NegativeOnsetDebt01: _negativeOnsetDebt01,
            EffectiveRetinalResource01: effectiveRetinal,
            EffectiveCerebralResource01: effectiveCerebral,
            Redout01: redout,
            PeripheralVision01: Clamp01(peripheralVision),
            VisualAcuity01: Clamp01(visualAcuity),
            Consciousness01: Clamp01(consciousness),
            CognitiveCapacity01: Clamp01(cognitiveCapacity),
            ControlAuthority01: Clamp01(controlAuthority),
            AdditionalControlDelaySeconds: additionalDelay,
            AbsoluteIncapacitationRemainingSeconds: _absoluteIncapacitationRemainingSeconds,
            VisualImpairment: visual,
            ControlImpairment: control);
    }

    static double Approach(double current, double target, double timeConstantSeconds,
        double dtSeconds) => target + (current - target)
        * Math.Exp(-dtSeconds / timeConstantSeconds);

    static double RecoveryTimeConstant(double recovery90Seconds) => recovery90Seconds / LogTen;

    static double SmoothStep(double edge0, double edge1, double value) {
        if (value <= edge0) return 0.0;
        if (value >= edge1) return 1.0;
        double t = (value - edge0) / (edge1 - edge0);
        return t * t * (3.0 - 2.0 * t);
    }

    static double Clamp01(double value) => Math.Clamp(value, 0.0, 1.0);

    static void RequireFinite(double value, string name) {
        if (!double.IsFinite(value))
            throw new ArgumentOutOfRangeException(name, "Value must be finite.");
    }

    static void RequirePositive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name, "Value must be finite and positive.");
    }

    static void RequireNonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name, "Value must be finite and non-negative.");
    }

    static void RequireUnit(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0 || value > 1.0)
            throw new ArgumentOutOfRangeException(name, "Value must be in [0,1].");
    }

    static void Validate(PilotPhysiologyProfile profile) {
        ArgumentNullException.ThrowIfNull(profile.Pilot);
        ArgumentNullException.ThrowIfNull(profile.Equipment);
        ArgumentNullException.ThrowIfNull(profile.Technique);
        ArgumentNullException.ThrowIfNull(profile.Response);
        if (string.IsNullOrWhiteSpace(profile.Id)
            || string.IsNullOrWhiteSpace(profile.Pilot.Id)
            || string.IsNullOrWhiteSpace(profile.Equipment.Id)
            || string.IsNullOrWhiteSpace(profile.Technique.Id))
            throw new ArgumentException("Physiology profile IDs must be non-empty.", nameof(profile));

        PilotConstitutionProfile pilot = profile.Pilot;
        RequirePositive(pilot.PositivePeripheralLossG,
            nameof(pilot.PositivePeripheralLossG));
        RequirePositive(pilot.PositiveBlackoutG,
            nameof(pilot.PositiveBlackoutG));
        RequirePositive(pilot.PositiveLossOfConsciousnessG,
            nameof(pilot.PositiveLossOfConsciousnessG));
        if (!(pilot.PositivePeripheralLossG < pilot.PositiveBlackoutG
            && pilot.PositiveBlackoutG < pilot.PositiveLossOfConsciousnessG))
            throw new ArgumentException("Positive-G thresholds must be strictly ordered.",
                nameof(profile));
        RequireNonNegative(pilot.NegativeRedoutMagnitudeG,
            nameof(pilot.NegativeRedoutMagnitudeG));
        RequirePositive(pilot.NegativeLossOfConsciousnessMagnitudeG,
            nameof(pilot.NegativeLossOfConsciousnessMagnitudeG));
        if (pilot.NegativeLossOfConsciousnessMagnitudeG
            <= pilot.NegativeRedoutMagnitudeG)
            throw new ArgumentException("Negative-G thresholds must be strictly ordered.",
                nameof(profile));
        RequirePositive(pilot.RetinalDepletionTimeSeconds,
            nameof(pilot.RetinalDepletionTimeSeconds));
        RequirePositive(pilot.CerebralDepletionTimeSeconds,
            nameof(pilot.CerebralDepletionTimeSeconds));
        RequirePositive(pilot.VisionRecovery90Seconds,
            nameof(pilot.VisionRecovery90Seconds));
        RequirePositive(pilot.CerebralRecovery90Seconds,
            nameof(pilot.CerebralRecovery90Seconds));
        RequirePositive(pilot.AbsoluteIncapacitationSeconds,
            nameof(pilot.AbsoluteIncapacitationSeconds));
        RequireNonNegative(pilot.PushPullMaximumPenaltyG,
            nameof(pilot.PushPullMaximumPenaltyG));
        RequirePositive(pilot.PushPullRecovery90Seconds,
            nameof(pilot.PushPullRecovery90Seconds));

        RequireNonNegative(profile.Equipment.ThresholdBenefitG,
            nameof(profile.Equipment.ThresholdBenefitG));
        RequireUnit(profile.Equipment.RapidOnsetAttenuation01,
            nameof(profile.Equipment.RapidOnsetAttenuation01));
        RequirePositive(profile.Equipment.ResourceDepletionTimeMultiplier,
            nameof(profile.Equipment.ResourceDepletionTimeMultiplier));
        RequireNonNegative(profile.Technique.MaximumThresholdBenefitG,
            nameof(profile.Technique.MaximumThresholdBenefitG));
        RequireUnit(profile.Technique.NominalEffort01,
            nameof(profile.Technique.NominalEffort01));
        RequirePositive(profile.Technique.EngagementTimeSeconds,
            nameof(profile.Technique.EngagementTimeSeconds));
        RequirePositive(profile.Technique.ReleaseTimeSeconds,
            nameof(profile.Technique.ReleaseTimeSeconds));
        RequireUnit(profile.Technique.RapidOnsetAttenuation01,
            nameof(profile.Technique.RapidOnsetAttenuation01));

        PilotImpairmentResponseProfile response = profile.Response;
        RequireNonNegative(response.OnsetRateThresholdGPerSecond,
            nameof(response.OnsetRateThresholdGPerSecond));
        RequireNonNegative(response.PositiveRetinalOnsetCostPerG,
            nameof(response.PositiveRetinalOnsetCostPerG));
        RequireNonNegative(response.PositiveCerebralOnsetCostPerG,
            nameof(response.PositiveCerebralOnsetCostPerG));
        RequireNonNegative(response.NegativeOnsetCostPerG,
            nameof(response.NegativeOnsetCostPerG));
        RequirePositive(response.OnsetDebtRecoverySeconds,
            nameof(response.OnsetDebtRecoverySeconds));
        RequireUnit(response.ClearVisionReserve01, nameof(response.ClearVisionReserve01));
        RequireUnit(response.TunnelVisionReserve01, nameof(response.TunnelVisionReserve01));
        RequireUnit(response.GreyoutReserve01, nameof(response.GreyoutReserve01));
        RequireUnit(response.BlackoutReserve01, nameof(response.BlackoutReserve01));
        if (!(response.ClearVisionReserve01 > response.TunnelVisionReserve01
            && response.TunnelVisionReserve01 > response.GreyoutReserve01
            && response.GreyoutReserve01 > response.BlackoutReserve01))
            throw new ArgumentException("Visual reserve thresholds must be strictly ordered.",
                nameof(profile));
        RequireUnit(response.RedoutBurden01, nameof(response.RedoutBurden01));
        RequireUnit(response.ControlStrainReserve01,
            nameof(response.ControlStrainReserve01));
        RequireUnit(response.ControlDegradedReserve01,
            nameof(response.ControlDegradedReserve01));
        RequireUnit(response.LossOfConsciousnessReserve01,
            nameof(response.LossOfConsciousnessReserve01));
        if (!(response.ControlStrainReserve01 > response.ControlDegradedReserve01
            && response.ControlDegradedReserve01
                > response.LossOfConsciousnessReserve01))
            throw new ArgumentException("Control reserve thresholds must be strictly ordered.",
                nameof(profile));
        RequireNonNegative(response.MaximumAdditionalControlDelaySeconds,
            nameof(response.MaximumAdditionalControlDelaySeconds));
    }
}

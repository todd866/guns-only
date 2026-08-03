namespace GunsOnly.Sim.Motorcycle;

/// <summary>
/// Session cerebellar skill + physics CoG envelope. Skill mostly amplifies reflex
/// stabilization <em>inside</em> the envelope; it only slightly widens the envelope.
/// Outside, assist collapses and the contact model still bites.
/// </summary>
public readonly record struct CerebellumSample(
    double SkillAuthority,
    double EnvelopeCenterAlongFromRearM,
    double EnvelopeHalfAlongM,
    double EnvelopeHalfLateralM,
    bool CogInsideEnvelope,
    double AssistScale,
    double EnvelopeWidenFraction);

public sealed class RiderCerebellum
{
    // Base half-axes (meters) at low speed before skill widen.
    public const double BaseHalfAlongM = 0.28;
    public const double BaseHalfLateralM = 0.10;
    public const double MaxSkillWiden = 0.12;      // envelope only +12% at full skill
    public const double MaxAssistBoost = 0.55;     // assist ×1.55 at full skill inside
    public const double SkillGainPerSecond = 0.045;
    public const double SkillDecayPerSecond = 0.12;
    public const double TipSkillPenalty = 0.35;

    double _skillAuthority;

    public double SkillAuthority => _skillAuthority;

    public void Reset() => _skillAuthority = 0.0;

    public CerebellumSample EvaluateAndIntegrate(
        double cogAlongFromRearM,
        double cogLateralM,
        double speedMps,
        double frontGripUse,
        double rearGripUse,
        bool isSliding,
        bool isTippedOver,
        double dt)
    {
        double peakGrip = Math.Max(frontGripUse, rearGripUse);
        double speedFactor = 1.0 / (1.0 + Math.Abs(speedMps) / 55.0);
        double gripFactor = 1.0 - 0.45 * peakGrip;
        double widen = MaxSkillWiden * _skillAuthority;
        double halfAlongM = BaseHalfAlongM * speedFactor * gripFactor * (1.0 + widen);
        double halfLateralM = BaseHalfLateralM * speedFactor * gripFactor * (1.0 + widen);
        double centerAlongM = YzfR1Definition.WheelbaseM * 0.48; // slightly rear-biased static CG

        double alongError = cogAlongFromRearM - centerAlongM;
        double lateralError = cogLateralM;
        double normalized = (alongError * alongError) / Math.Max(1e-9, halfAlongM * halfAlongM)
            + (lateralError * lateralError) / Math.Max(1e-9, halfLateralM * halfLateralM);
        bool inside = !isTippedOver && normalized <= 1.0;

        if (isTippedOver)
            _skillAuthority = Math.Max(0.0, _skillAuthority - TipSkillPenalty);
        else if (inside && !isSliding)
            _skillAuthority = Math.Min(1.0, _skillAuthority + SkillGainPerSecond * dt);
        else
            _skillAuthority = Math.Max(0.0, _skillAuthority - SkillDecayPerSecond * dt);

        // Assist is strong inside; fades just outside so the edge is learnable.
        double edgeFade = inside
            ? 1.0
            : Math.Clamp(1.25 - Math.Sqrt(normalized), 0.0, 0.35);
        double assistScale = 1.0 + MaxAssistBoost * _skillAuthority * edgeFade;

        return new CerebellumSample(
            _skillAuthority,
            centerAlongM,
            halfAlongM,
            halfLateralM,
            inside,
            assistScale,
            widen);
    }
}

using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class RiderCerebellumTests
{
    [Fact]
    public void StaticCgNearCenterIsInsideBaseEnvelope()
    {
        var cerebellum = new RiderCerebellum();
        double center = YzfR1Definition.WheelbaseM * 0.48;
        CerebellumSample sample = cerebellum.EvaluateAndIntegrate(
            cogAlongFromRearM: center,
            cogLateralM: 0.0,
            speedMps: 5.0,
            frontGripUse: 0.1,
            rearGripUse: 0.1,
            isSliding: false,
            isTippedOver: false,
            dt: 1.0 / 120.0);

        Assert.True(sample.CogInsideEnvelope);
        Assert.True(sample.AssistScale >= 1.0);
        Assert.InRange(sample.EnvelopeWidenFraction, 0.0, RiderCerebellum.MaxSkillWiden);
    }

    [Fact]
    public void HardForwardCogLeavesEnvelope()
    {
        var cerebellum = new RiderCerebellum();
        CerebellumSample sample = cerebellum.EvaluateAndIntegrate(
            cogAlongFromRearM: YzfR1Definition.WheelbaseM * 0.92,
            cogLateralM: 0.0,
            speedMps: 30.0,
            frontGripUse: 0.7,
            rearGripUse: 0.2,
            isSliding: false,
            isTippedOver: false,
            dt: 1.0 / 120.0);

        Assert.False(sample.CogInsideEnvelope);
        Assert.True(sample.AssistScale < 1.2);
    }

    [Fact]
    public void SkillGrowsInsideAndAmplifiesAssistMoreThanEnvelope()
    {
        var cerebellum = new RiderCerebellum();
        double center = YzfR1Definition.WheelbaseM * 0.48;
        CerebellumSample first = default;
        CerebellumSample last = default;
        for (int i = 0; i < 120 * 20; i++)
        {
            last = cerebellum.EvaluateAndIntegrate(
                center,
                0.0,
                speedMps: 12.0,
                frontGripUse: 0.15,
                rearGripUse: 0.15,
                isSliding: false,
                isTippedOver: false,
                dt: 1.0 / 120.0);
            if (i == 0) first = last;
        }

        Assert.True(last.SkillAuthority > first.SkillAuthority + 0.2);
        Assert.True(last.AssistScale > first.AssistScale + 0.08);
        // Envelope widen is the minor channel — stay well below assist boost.
        Assert.True(last.EnvelopeWidenFraction < last.SkillAuthority * RiderCerebellum.MaxAssistBoost);
        Assert.True(last.EnvelopeHalfAlongM > first.EnvelopeHalfAlongM);
        Assert.True(
            (last.EnvelopeHalfAlongM / first.EnvelopeHalfAlongM - 1.0)
            < (last.AssistScale / first.AssistScale - 1.0));
    }

    [Fact]
    public void TipOverPenalisesSkill()
    {
        var cerebellum = new RiderCerebellum();
        double center = YzfR1Definition.WheelbaseM * 0.48;
        for (int i = 0; i < 120 * 15; i++)
        {
            cerebellum.EvaluateAndIntegrate(
                center, 0.0, 10.0, 0.1, 0.1, false, false, 1.0 / 120.0);
        }

        double before = cerebellum.SkillAuthority;
        cerebellum.EvaluateAndIntegrate(
            center, 0.0, 0.0, 0.0, 0.0, false, isTippedOver: true, 1.0 / 120.0);
        Assert.True(cerebellum.SkillAuthority < before - 0.2);
    }
}

using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim.Tests;
public sealed class PressureMeasurementTests {
    static PressureActor Attacking => new(true, false, 500, 0.01, 0.06, true, true);
    [Fact] public void WingmanOnlyAttackCountsOnceAndDeadShooterDoesNotCount() {
        var p = new PressureExposure();
        p.Add(true, 1, [Attacking with { Alive = false }, Attacking]);
        Assert.Equal(0, p.PassiveSeconds);
        Assert.Equal(1, p.GunRangeSeconds);
        p.Add(true, 2, [Attacking with { Alive = false }]);
        Assert.Equal(2, p.PassiveSeconds);
        Assert.Equal(2, p.LongestCredibleGap);
    }
    [Fact] public void TerminalFallAddsNoExposureAndInitialAndFinalGapsCount() {
        var p = new PressureExposure();
        p.Add(true, 20, []);
        p.Add(true, 1, [Attacking]);
        p.Add(true, 30, []);
        p.Add(false, 200, [Attacking]);
        Assert.Equal(51, p.LiveSeconds);
        Assert.Equal(30, p.LongestPassive);
        Assert.Equal(30, p.LongestCredibleGap);
        Assert.Equal(30, p.SecondsSinceCredibleAttack);
        p.Add(true, 1, [Attacking]);
        Assert.Equal(0, p.SecondsSinceCredibleAttack);
    }
    [Fact] public void FiringOutsideTheEnvelopeIsNotACredibleAttack() {
        var p = new PressureExposure();
        p.Add(true, 1, [Attacking with { RangeM = 1000 }]);
        p.Add(true, 1, [Attacking with { NoseRad = 0.2, NearFiring = false }]);
        Assert.Equal(2, p.LongestCredibleGap);
        p.Add(true, 1, [Attacking with { Trigger = false }]);
        Assert.Equal(2, p.FirstCredible);
    }
    [Fact] public void DeflectionShotOnTheLeadIsCredibleOutsideTheBodyCone() {
        var p = new PressureExposure();
        p.Add(true, 1, [Attacking with { NoseRad = 0.2, Trigger = true, NearFiring = true }]);
        Assert.Equal(0, p.FirstCredible);
        Assert.True(p.LastCredible);
    }
    [Fact] public void FunProxiesMergeAttacksAndMeasureReturnTime() {
        var f = new FunProxyTracker();
        f.Add(1, true, false, true, 500, false);
        f.Add(2, true, false, true, 500, false);   // same attack (within 3 s)
        f.Add(30, true, true, false, 600, true);    // second attack, 28 s later; first hit now
        f.Add(30.5, false, true, false, 600, false); // same opportunity episode
        Assert.Equal(2, f.Attacks);
        Assert.Equal(28, f.MedianReturn);
        Assert.Equal(1, f.Opportunities);
        Assert.Equal(2, f.AttacksBeforeFirstHit);
        Assert.Equal(0, f.Overshoots);  // last behind 28 s earlier: not an overshoot
        f.Add(40, false, false, true, 300, false);
        f.Add(40.5, false, false, false, 300, false); // passes the 3-9 line inside 900 m
        Assert.Equal(1, f.Overshoots);
    }
    [Fact] public void BodyConeAloneIsNotNearFiring() {
        var p = new PressureExposure();
        p.Add(true, 4, [Attacking with { Trigger = false, NearFiring = false }]);
        Assert.True(double.IsNaN(p.FirstCredible));
        Assert.Equal(4, p.LongestCredibleGap);
        p.Add(true, 1, [Attacking with { Trigger = false, NearFiring = true }]);
        Assert.Equal(4, p.FirstCredible);
    }
    [Fact] public void SweptPassesAreDistinctPerShooterAndRoundAndUseMovingTarget() {
        var p = new PressureRoundTracker(); var a = new GunKill(); var b = new GunKill();
        void Pass(GunKill gun) => p.ObserveSegment(gun, 1, new(-200, 40, 0), new(200, 40, 0),
            new(0, 0, 0), new(0, 40, 0), 0, 1);
        Pass(a); Pass(a); Pass(b);
        Assert.Equal(2, p.Near100); Assert.Equal(2, p.Near50); Assert.Equal(2, p.Near25);
        Assert.InRange(p.FirstNear100, 0.49, 0.52);
    }
}

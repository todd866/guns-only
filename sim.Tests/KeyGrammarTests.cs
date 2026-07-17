using GunsOnly.Sim; using Xunit;
public class KeyGrammarTests {
    [Fact] public void QuickPressReleaseIsATap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1100);
        Assert.Equal(1, g.TakeTaps(GKey.PullUp));
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.PullUp));
    }
    [Fact] public void LongPressIsHeldNotTap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1300));
        g.Feed(GKey.PullUp, false, 1500);
        Assert.Equal(0, g.TakeTaps(GKey.PullUp));
    }
    [Fact] public void TapThenQuickRepressAndHoldIsDoubleHeld() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1200); // within DoubleGapMs of release
        Assert.Equal(KeyPhase.DoubleHeld, g.PhaseAt(GKey.PullUp, 1450));
        Assert.Equal(0, g.TakeTaps(GKey.PullUp)); // the tap was consumed by the double
    }
    [Fact] public void SlowRepressIsJustANewHold() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1600); // beyond DoubleGapMs
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1900));
        Assert.Equal(1, g.TakeTaps(GKey.PullUp)); // first tap stands
    }
    [Fact] public void TwoQuickTapsCountTwo() {
        var g = new KeyGrammar();
        g.Feed(GKey.RollLeft, true, 0); g.Feed(GKey.RollLeft, false, 90);
        g.Feed(GKey.RollLeft, true, 400); g.Feed(GKey.RollLeft, false, 480);
        Assert.Equal(2, g.TakeTaps(GKey.RollLeft));
    }
    [Fact] public void KeysAreIndependent() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.RollLeft));
    }
}

using GunsOnly.Sim; using Xunit;
public class KeyGrammarTests {
    [Fact] public void TapIsObservableOnlyAfterDoubleWindowExpires() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1100);
        Assert.Equal(0, g.TakeTaps(GKey.PullUp, 1200));
        Assert.Equal(1, g.TakeTaps(GKey.PullUp, 1351));
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.PullUp));
    }
    [Fact] public void LongPressIsHeldNotTap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1300));
        g.Feed(GKey.PullUp, false, 1500);
        Assert.Equal(0, g.TakeTaps(GKey.PullUp, 2000));
    }
    [Fact] public void TapThenQuickRepressAndHoldIsDoubleHeldConsumingTheTap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1200);
        Assert.Equal(KeyPhase.DoubleHeld, g.PhaseAt(GKey.PullUp, 1450));
        Assert.Equal(0, g.TakeTaps(GKey.PullUp, 5000));
    }
    [Fact] public void SlowRepressIsANewHoldAndFirstTapStands() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1600);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1900));
        Assert.Equal(1, g.TakeTaps(GKey.PullUp, 1900));
    }
    [Fact] public void RapidTapTapThenHoldRestoresFirstTapAndGoesDoubleHeld() {
        // Reviewer-found chain: press0/rel100, press200/rel280, press400+hold
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);   g.Feed(GKey.PullUp, false, 100);
        g.Feed(GKey.PullUp, true, 200); g.Feed(GKey.PullUp, false, 280);
        g.Feed(GKey.PullUp, true, 400);
        Assert.Equal(KeyPhase.DoubleHeld, g.PhaseAt(GKey.PullUp, 700));
        Assert.Equal(1, g.TakeTaps(GKey.PullUp, 700));
    }
    [Fact] public void PollingCadenceDoesNotChangeTheOutcome() {
        var g1 = new KeyGrammar(); var g2 = new KeyGrammar();
        foreach (var g in new[] { g1, g2 }) { g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.PullUp, false, 100); g.Feed(GKey.PullUp, true, 200); }
        int early = g1.TakeTaps(GKey.PullUp, 150) + g1.TakeTaps(GKey.PullUp, 210);
        int late = g2.TakeTaps(GKey.PullUp, 210);
        Assert.Equal(early, late);
        Assert.Equal(0, late);
        Assert.Equal(KeyPhase.DoubleHeld, g1.PhaseAt(GKey.PullUp, 210));
    }
    [Fact] public void CompletedDoubleHeldReleaseClearsArming() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.PullUp, false, 100);
        g.Feed(GKey.PullUp, true, 200); g.Feed(GKey.PullUp, false, 800);
        g.Feed(GKey.PullUp, true, 900);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1000));
        Assert.Equal(0, g.TakeTaps(GKey.PullUp, 2000));
    }
    [Fact] public void LongHoldReleaseThenQuickPressIsJustHeld() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.PullUp, false, 500);
        g.Feed(GKey.PullUp, true, 600);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 700));
    }
    [Fact] public void BoundaryTimesAreInclusive() {
        var g = new KeyGrammar();
        g.Feed(GKey.RollLeft, true, 0); g.Feed(GKey.RollLeft, false, 180);
        g.Feed(GKey.RollLeft, true, 430);
        Assert.Equal(KeyPhase.DoubleHeld, g.PhaseAt(GKey.RollLeft, 500));
    }
    [Fact] public void TwoSeparatedTapsCountTwo() {
        var g = new KeyGrammar();
        g.Feed(GKey.RollLeft, true, 0); g.Feed(GKey.RollLeft, false, 90);
        g.Feed(GKey.RollLeft, true, 400); g.Feed(GKey.RollLeft, false, 480);
        Assert.Equal(2, g.TakeTaps(GKey.RollLeft, 731));
    }
    [Fact] public void KeysAreIndependent() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.RollLeft));
    }
    [Fact] public void TakeTapsSinceDiscardsOlderTaps() {
        var g = new KeyGrammar();
        g.Feed(GKey.PushDown, true, 0); g.Feed(GKey.PushDown, false, 80);
        g.Feed(GKey.PushDown, true, 500); g.Feed(GKey.PushDown, false, 580);
        Assert.Equal(1, g.TakeTapsSince(GKey.PushDown, 100, 900)); // only the 580 tap counts; the 80 tap is discarded
        Assert.Equal(0, g.TakeTaps(GKey.PushDown, 900));           // and both are gone
    }
}

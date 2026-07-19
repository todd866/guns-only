using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class DetentLayerTests {
    static AircraftState Fast => new(new Vec3D(0,3000,0), 240, 0, 0, 0, FlightModel.Sabre.MassKg);
    static DoctrineAdvice Advice => new(4.2, 0.9, "test");
    static DetentLayer Run(DetentLayer d, KeyGrammar g, double fromMs, double toMs, AircraftState s) {
        for (double t = fromMs; t < toMs; t += 1000.0/AircraftSim.TickHz)
            d.Tick(g, t, s, FlightModel.Sabre, Advice, 1.0/AircraftSim.TickHz);
        return d;
    }
    [Fact] public void BaselineIsOneG() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        Run(d, g, 0, 2000, Fast);
        Assert.Equal(1.0, d.Command.GDemand, 1);
        Assert.Equal(DemandTier.Baseline, d.Tier);
    }
    [Fact] public void HoldPullSettlesToDoctrineValleyInVariantA() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1500, Fast);
        Assert.Equal(4.2, d.Command.GDemand, 1);
        Assert.Equal(DemandTier.Valley, d.Tier);
    }
    [Fact] public void HoldPullSettlesToMaxPerformInVariantB() {
        var d = new DetentLayer { Variant = ValleyVariant.PhysicsOnly }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1500, Fast);
        Assert.Equal(Protection.MaxPerformG(Fast, FlightModel.Sabre), d.Command.GDemand, 1);
    }
    [Fact] public void EaseTapWhilePullingReducesHeldG() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1000, Fast);
        // quick extra tap while... taps arrive via a second key? No: tap PullUp requires release.
        // Sticky adjustments while pulling come from PushDown taps (ease) and re-taps after micro-release:
        g.Feed(GKey.PushDown, true, 1000); g.Feed(GKey.PushDown, false, 1080); // ease tap
        Run(d, g, 1080, 2500, Fast);
        Assert.Equal(3.7, d.Command.GDemand, 1); // 4.2 - 0.5
        Assert.Equal(-0.5, d.StickyOffsetG, 6);
    }
    [Fact] public void ReleaseSettlesBackToBaselineAndClearsSticky() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1200, Fast);
        g.Feed(GKey.PullUp, false, 1200);
        Run(d, g, 1200, 3200, Fast);
        Assert.Equal(1.0, d.Command.GDemand, 1);
        Assert.Equal(0.0, d.StickyOffsetG, 6);
    }
    [Fact] public void BareArrowsNeverExceedProtection() {
        // No override: even a long hard pull-hold stays at/below the max-perform boundary.
        var d = new DetentLayer { Variant = ValleyVariant.PhysicsOnly }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 3000, Fast);
        Assert.Equal(DemandTier.Valley, d.Tier);
        Assert.True(d.Command.GDemand <= Protection.MaxPerformG(Fast, FlightModel.Sabre) + 1e-6);
        Assert.False(double.IsFinite(d.Command.CommandedAlphaRad));
    }
    [Fact] public void OverrideCannotPullPastSabreStructuralLimit() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        g.Feed(GKey.Override, true, 0);   // hold spacebar: override the protection ceiling
        Run(d, g, 0, 2000, Fast);
        Assert.Equal(DemandTier.OverDemand, d.Tier);
        // The F-86 maps ordinary full backstick to +7 G, so override has no extra positive-G spar.
        Assert.Equal(Protection.HardMaxG(Fast, FlightModel.Sabre), d.Command.GDemand, 6);
        Assert.Equal(FlightModel.Sabre.PostStallAlphaCommandRad,
            d.Command.CommandedAlphaRad, 10);
    }
    [Fact] public void ReleasingOverrideReturnsToProtectedPull() {
        var d = new DetentLayer { Variant = ValleyVariant.PhysicsOnly }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.Override, true, 0);
        Run(d, g, 0, 1500, Fast);
        g.Feed(GKey.Override, false, 1500);
        Run(d, g, 1500, 3500, Fast);
        Assert.Equal(DemandTier.Valley, d.Tier);
        // Settles back into the protected band (asymptotic decay leaves a tiny epsilon; the point
        // is it's well below hard max, not that it hits max-perform to the ULP).
        Assert.True(d.Command.GDemand <= Protection.MaxPerformG(Fast, FlightModel.Sabre) + 0.02);
        // NB: with the pilot's 6G cap gone, protection (0.92x aero) and hard max (aero) are only
        // ~8% apart, so "well below hard max" is no longer a meaningful margin — tier + the
        // protection bound are the real assertions. See the override-teeth note in the spec.
    }
    [Fact] public void RollTapAdoptsAdviceBank() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        g.Feed(GKey.RollRight, true, 0); g.Feed(GKey.RollRight, false, 90);
        Run(d, g, 90, 600, Fast);
        Assert.Equal(0.9, d.Command.BankTarget, 2);
    }
    [Fact] public void ThrottleTapsStepDetents() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        Assert.Equal(0.85, d.Throttle, 6); // default cruise... spec detents idle/cruise/mil
        g.Feed(GKey.ThrottleUp, true, 0); g.Feed(GKey.ThrottleUp, false, 80);
        Run(d, g, 80, 500, Fast); // tap commits after the 250 ms double window
        Assert.Equal(1.0, d.Throttle, 6);
    }
    [Fact] public void SabreThrottleStopsAtMilitaryPower() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        g.Feed(GKey.ThrottleUp, true, 0);
        Run(d, g, 0, 3000, Fast);
        Assert.Equal(1.0, FlightModel.Sabre.MaxThrustFraction, 10);
        Assert.Equal(1.0, d.Throttle, 10);
    }
    [Fact] public void ConfigureForClampsStagedThrottleAndCommandToAirframeStop() {
        var d = new DetentLayer();

        d.ConfigureFor(FlightModel.GliderStrike);
        d.ConfigureFor(FlightModel.GliderStrike); // repeated staging must be idempotent

        Assert.Equal(0.0, FlightModel.GliderStrike.MaxThrustFraction, 10);
        Assert.Equal(0.0, d.Throttle, 10);
        Assert.Equal(0.0, d.Command.Throttle, 10);

        var glider = Fast with { Mass = FlightModel.GliderStrike.MassKg };
        d.Tick(new KeyGrammar(), 0.0, glider, FlightModel.GliderStrike, Advice,
            1.0 / AircraftSim.TickHz);
        Assert.Equal(0.0, d.Throttle, 10);
        Assert.Equal(0.0, d.Command.Throttle, 10);
    }
    [Fact] public void ProtectionUsesSuppliedAirspeed() {
        var d = new DetentLayer { Variant = ValleyVariant.PhysicsOnly, AirspeedMps = 70.0 };
        var g = new KeyGrammar();
        var lowGroundSpeed = Fast with { Speed = 55.0 };
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1500, lowGroundSpeed);
        Assert.Equal(Protection.MaxPerformG(lowGroundSpeed, FlightModel.Sabre, 70.0),
            d.Command.GDemand, 6);
    }
    [Fact] public void IdleTapsHaveNoEffect() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.PullUp, false, 100);   // tap while idle
        Run(d, g, 100, 1500, Fast);                                       // well past commit window
        Assert.Equal(1.0, d.Command.GDemand, 1);
        Assert.Equal(0.0, d.StickyOffsetG, 6);
        Assert.Equal(DemandTier.Baseline, d.Tier);
    }
    [Fact] public void BatchedReleaseRepressStillClearsSticky() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1000, Fast);
        g.Feed(GKey.PushDown, true, 1000); g.Feed(GKey.PushDown, false, 1080); // ease tap
        Run(d, g, 1080, 2500, Fast);
        Assert.Equal(-0.5, d.StickyOffsetG, 6);
        g.Feed(GKey.PullUp, false, 2500); g.Feed(GKey.PullUp, true, 2502);      // release+re-press inside one tick gap
        Run(d, g, 2502, 4000, Fast);
        Assert.Equal(0.0, d.StickyOffsetG, 6);
        Assert.Equal(4.2, d.Command.GDemand, 1);                                 // back to the un-eased valley
    }
    [Fact] public void ContinuousRollHoldPassesInvertedWithoutPinning() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        g.Feed(GKey.RollRight, true, 0);
        bool wentNegative = false;
        for (double t = 0; t < 3500; t += 1000.0/AircraftSim.TickHz) {
            d.Tick(g, t, Fast, FlightModel.Sabre, Advice, 1.0/AircraftSim.TickHz);
            if (d.Command.BankTarget < -0.5) wentNegative = true;
        }
        Assert.True(wentNegative, "bank target should wrap past +pi into negative (through inverted), not pin");
        Assert.InRange(d.Command.BankTarget, -System.Math.PI - 1e-9, System.Math.PI + 1e-9);
    }
    [Fact] public void EaseTapDoesNotSurvivePullRecommit() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1000, Fast);
        g.Feed(GKey.PushDown, true, 1000); g.Feed(GKey.PushDown, false, 1080); // ease tap, commits ~1330
        g.Feed(GKey.PullUp, false, 1200); g.Feed(GKey.PullUp, true, 1202);     // recommit BEFORE the tap commits
        Run(d, g, 1202, 3000, Fast);
        Assert.Equal(0.0, d.StickyOffsetG, 6);   // stale ease must not leak into the new hold
        Assert.Equal(4.2, d.Command.GDemand, 1);
    }
    [Fact] public void IdlePushTapBeforePullDoesNotEase() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PushDown, true, 0); g.Feed(GKey.PushDown, false, 80);  // tap while everything idle
        g.Feed(GKey.PullUp, true, 150);                                     // hold starts after the tap's release
        Run(d, g, 150, 2000, Fast);
        Assert.Equal(0.0, d.StickyOffsetG, 6);
        Assert.Equal(4.2, d.Command.GDemand, 1);
    }
}

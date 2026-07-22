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
    [Theory]
    [InlineData(GKey.ThrottleUp, 1.0)]
    [InlineData(GKey.ThrottleDown, 0.70)]
    public void ThrottleTapsStepDetents(GKey key, double expected) {
        var d = new DetentLayer(); var g = new KeyGrammar();
        Assert.Equal(0.85, d.Throttle, 6); // default cruise... spec detents idle/cruise/mil
        g.Feed(key, true, 0); g.Feed(key, false, 80);
        Run(d, g, 80, 500, Fast); // tap commits after the 250 ms double window
        Assert.Equal(expected, d.Throttle, 6);
    }
    [Theory]
    [InlineData(GKey.ThrottleUp, 0.15)]
    [InlineData(GKey.ThrottleDown, -0.15)]
    public void SampledKeyboardThrottleTapRetainsDeferredFineStep(GKey key, double step) {
        var d = new DetentLayer(); var g = new KeyGrammar();
        g.Feed(key, true, 0);
        Run(d, g, 0, 100, Fast);
        double afterHold = d.Throttle;

        g.Feed(key, false, 100);
        Run(d, g, 100, 600, Fast);

        Assert.Equal(Math.Clamp(afterHold + step, 0.0, FlightModel.Sabre.MaxThrustFraction),
            d.Throttle, 10);
    }
    [Theory]
    [InlineData(GKey.ThrottleUp)]
    [InlineData(GKey.ThrottleDown)]
    public void SuppressedShortThrottleHoldIsNotReplayedAsDeferredTap(GKey key) {
        var d = new DetentLayer(); var g = new KeyGrammar();
        double initial = d.Throttle;
        g.Feed(key, true, 0);
        Run(d, g, 0, 100, Fast);
        double afterHold = d.Throttle;
        Assert.NotEqual(initial, afterHold);

        g.Feed(key, false, 100);
        g.SuppressPendingTap(key); // direct-manipulation rocker release, not a keyboard tap
        Run(d, g, 100, 600, Fast); // crosses the deferred 250 ms tap-classification window

        Assert.Equal(afterHold, d.Throttle, 10);
    }
    [Fact] public void DirectRockerHoldCommitsAPriorKeyboardThrottleTapInsteadOfConsumingIt() {
        // Mixed input sources on one throttle key: a legitimate keyboard tap, then the phone
        // rocker engaged INSIDE the 250 ms double-tap window and held longer than TapMaxMs.
        // The direct hold must never become the tap's double-held arm — the promised keyboard
        // fine step commits — and its release must not replay as a deferred tap. The control
        // run performs the identical tap and identical 300 ms direct hold, only OUTSIDE the
        // window; both schedules must land on exactly the same lever position.
        const double stepMs = 1000.0 / AircraftSim.TickHz;
        static void RunTicks(DetentLayer d, KeyGrammar g, int fromTick, int toTick) {
            for (int i = fromTick; i < toTick; i++)
                d.Tick(g, i * (1000.0 / AircraftSim.TickHz), Fast, FlightModel.Sabre,
                    Advice, 1.0 / AircraftSim.TickHz);
        }
        var mixed = new DetentLayer(); var g1 = new KeyGrammar();
        var control = new DetentLayer(); var g2 = new KeyGrammar();
        g1.Feed(GKey.ThrottleDown, true, 0); g1.Feed(GKey.ThrottleDown, false, 10 * stepMs);
        g2.Feed(GKey.ThrottleDown, true, 0); g2.Feed(GKey.ThrottleDown, false, 10 * stepMs);

        RunTicks(mixed, g1, 0, 24);
        g1.FeedDirect(GKey.ThrottleDown, true, 24 * stepMs);   // 200 ms: inside the double window
        RunTicks(mixed, g1, 24, 60);
        g1.FeedDirect(GKey.ThrottleDown, false, 60 * stepMs);  // 300 ms hold: longer than TapMaxMs
        RunTicks(mixed, g1, 60, 144);

        RunTicks(control, g2, 0, 72);                          // tap classifies normally first
        g2.FeedDirect(GKey.ThrottleDown, true, 72 * stepMs);   // identical 36-tick rocker hold
        RunTicks(control, g2, 72, 108);
        g2.FeedDirect(GKey.ThrottleDown, false, 108 * stepMs);
        RunTicks(control, g2, 108, 144);

        Assert.Equal(control.Throttle, mixed.Throttle, 10);
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
    [Fact] public void FlownRollPublishesPilotAileronAndNeutralDoesNotCaptureAnAttitude() {
        var initial = new AircraftSim(Fast with { Bank = 0.72 }, FlightModel.Sabre);
        var d = new DetentLayer(); var g = new KeyGrammar();

        d.Tick(g, 0.0, initial.State, FlightModel.Sabre, Advice, 1.0 / AircraftSim.TickHz);
        Assert.True(d.Command.DirectLateralControl);
        Assert.Equal(0.0, d.Command.RollControl, 10);
        Assert.Equal(0.0, d.Command.SasRollControl, 10);
        Assert.Equal(initial.BodyRollRad, d.Command.BankTarget, 6);

        g.Feed(GKey.RollRight, true, 10.0);
        d.Tick(g, 10.0, initial.State, FlightModel.Sabre, Advice, 1.0 / AircraftSim.TickHz);
        Assert.Equal(1.0, d.Command.RollControl, 10);
        Assert.Equal(0.0, d.Command.SasRollControl, 10);

        g.Feed(GKey.RollRight, false, 20.0);
        d.Tick(g, 20.0, initial.State, FlightModel.Sabre, Advice, 1.0 / AircraftSim.TickHz);
        Assert.Equal(0.0, d.Command.RollControl, 10);
        Assert.Equal(0.0, d.Command.SasRollControl, 10);
        Assert.Equal(initial.BodyRollRad, d.Command.BankTarget, 6);
    }
    [Fact] public void AnalogRollIsProgressiveAndKeyboardRetainsPriority() {
        var initial = new AircraftSim(Fast, FlightModel.Sabre);
        var d = new DetentLayer();
        var g = new KeyGrammar();
        double dt = 1.0 / AircraftSim.TickHz;

        d.SetAnalogRollControl(0.24);
        d.Tick(g, 0.0, initial.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.24, d.Command.RollControl, 10);

        g.Feed(GKey.RollLeft, true, 10.0);
        d.Tick(g, 10.0, initial.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(-1.0, d.Command.RollControl, 10);

        g.Feed(GKey.RollLeft, false, 20.0);
        d.Tick(g, 20.0, initial.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.24, d.Command.RollControl, 10);

        d.ClearAnalogRollControl();
        d.Tick(g, 30.0, initial.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.0, d.Command.RollControl, 10);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            d.SetAnalogRollControl(double.NaN));
    }
    [Fact] public void DeferredRollTapsReplayOnlyUnseenPressesAndPreserveEveryPulse() {
        var sim = new AircraftSim(Fast, FlightModel.Sabre);
        var d = new DetentLayer();
        var g = new KeyGrammar();
        double dt = 1.0 / AircraftSim.TickHz;

        // This press was observed down, so its later deferred tap classification must not fly it
        // for a second time.
        g.Feed(GKey.RollRight, true, 0.0);
        d.Tick(g, 0.0, sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(1.0, d.Command.RollControl, 10);
        g.Feed(GKey.RollRight, false, 90.0);
        d.Tick(g, 400.0, sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.0, d.Command.RollControl, 10);

        // A later tap occurs entirely between polls. The old sticky sampled boolean suppressed it;
        // the press token now yields exactly one fixed-tick pulse.
        g.Feed(GKey.RollRight, true, 500.0);
        g.Feed(GKey.RollRight, false, 580.0);
        d.Tick(g, 900.0, sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(1.0, d.Command.RollControl, 10);
        d.Tick(g, 900.0 + 1000.0 / AircraftSim.TickHz,
            sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.0, d.Command.RollControl, 10);

        // Two unseen taps committed in one poll remain two ordered pulses instead of collapsing
        // through `rTaps > 0`. A left tap has the corresponding negative sign and no residue.
        g.Feed(GKey.RollRight, true, 1000.0);
        g.Feed(GKey.RollRight, false, 1080.0);
        g.Feed(GKey.RollRight, true, 1400.0);
        g.Feed(GKey.RollRight, false, 1480.0);
        d.Tick(g, 1800.0, sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(1.0, d.Command.RollControl, 10);
        d.Tick(g, 1800.0 + 1000.0 / AircraftSim.TickHz,
            sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(1.0, d.Command.RollControl, 10);
        d.Tick(g, 1800.0 + 2000.0 / AircraftSim.TickHz,
            sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.0, d.Command.RollControl, 10);

        g.Feed(GKey.RollLeft, true, 2000.0);
        g.Feed(GKey.RollLeft, false, 2080.0);
        d.Tick(g, 2400.0, sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(-1.0, d.Command.RollControl, 10);
        d.Tick(g, 2400.0 + 1000.0 / AircraftSim.TickHz,
            sim.State, FlightModel.Sabre, Advice, dt);
        Assert.Equal(0.0, d.Command.RollControl, 10);
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

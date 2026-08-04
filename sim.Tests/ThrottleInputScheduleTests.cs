namespace GunsOnly.Sim.Tests;

public sealed class ThrottleInputScheduleTests {
    [Fact]
    public void ApproachBandIsFineAtLowCasAndLowLever() {
        Assert.Equal(1.0, ThrottleInputSchedule.FineBlend(140.0, 0.08), 12);
        Assert.Equal(ThrottleInputSchedule.FineHoldRatePerSecond,
            ThrottleInputSchedule.HoldRatePerSecond(140.0, 0.08), 12);
        Assert.Equal(ThrottleInputSchedule.FineTapStep,
            ThrottleInputSchedule.TapStep(140.0, 0.08), 12);
    }

    [Fact]
    public void FightAndGoAroundStayCoarse() {
        Assert.Equal(0.0, ThrottleInputSchedule.FineBlend(320.0, 0.08), 12);
        Assert.Equal(0.0, ThrottleInputSchedule.FineBlend(140.0, 0.50), 12);
        Assert.Equal(ThrottleInputSchedule.CoarseHoldRatePerSecond,
            ThrottleInputSchedule.HoldRatePerSecond(320.0, 0.08), 12);
        Assert.Equal(ThrottleInputSchedule.CoarseHoldRatePerSecond,
            ThrottleInputSchedule.HoldRatePerSecond(140.0, 0.50), 12);
        Assert.Equal(ThrottleInputSchedule.CoarseTapStep,
            ThrottleInputSchedule.TapStep(140.0, 0.50), 12);
    }

    [Fact]
    public void TransitionBandBlendsSmoothlyWithNoDeadZone() {
        // Mid-band on both axes: smoothstep(0.5) = 0.5, so rates sit exactly halfway.
        Assert.Equal(0.5, ThrottleInputSchedule.FineBlend(240.0, 0.275), 12);
        Assert.Equal(0.43, ThrottleInputSchedule.HoldRatePerSecond(240.0, 0.275), 12);
        Assert.Equal(0.085, ThrottleInputSchedule.TapStep(240.0, 0.275), 12);

        // The lesser fine demand wins: slow but mid-lever, or fast but low lever,
        // both blend halfway rather than snapping fine or coarse.
        Assert.Equal(0.5, ThrottleInputSchedule.FineBlend(140.0, 0.275), 12);
        Assert.Equal(0.5, ThrottleInputSchedule.FineBlend(240.0, 0.08), 12);
    }

    [Fact]
    public void SabreApproachTrimGetsTheFullFineBand() {
        // The Sabre trims on-speed at 0.28-0.38 PLA. The absolute band (fine <= 0.20) left the
        // airframe with the hardest recoveries almost no finals precision; keyed off approach
        // trim, the band travels with the airframe.
        Assert.True(ThrottleInputSchedule.FineBlend(140.0, 0.33) < 0.1,
            "absolute band should be nearly inert at Sabre trim (documents the defect)");
        Assert.Equal(1.0, ThrottleInputSchedule.FineBlend(140.0, 0.33, 0.33), 12);
        Assert.Equal(ThrottleInputSchedule.FineHoldRatePerSecond,
            ThrottleInputSchedule.HoldRatePerSecond(140.0, 0.33, 0.33), 12);
        Assert.Equal(ThrottleInputSchedule.FineTapStep,
            ThrottleInputSchedule.TapStep(140.0, 0.33, 0.33), 12);
    }

    [Fact]
    public void TrimRelativeBandMatchesTheLegacyBandAtTheReferenceTrim() {
        foreach (double lever in new[] { 0.0, 0.08, 0.20, 0.275, 0.35, 0.50 }) {
            Assert.Equal(
                ThrottleInputSchedule.FineBlend(200.0, lever),
                ThrottleInputSchedule.FineBlend(200.0, lever,
                    ThrottleInputSchedule.ReferenceApproachTrimLever), 12);
        }
    }

    [Fact]
    public void UnknownApproachTrimFallsBackToTheReferenceBand() {
        // DetentLayer publishes ApproachTrimThrottle = 0.0 outside approach mode; non-finite
        // and non-positive trims must both mean "airframe-blind" so behaviour off the approach
        // is unchanged.
        Assert.Equal(
            ThrottleInputSchedule.FineBlend(140.0, 0.275),
            ThrottleInputSchedule.FineBlend(140.0, 0.275, 0.0), 12);
        Assert.Equal(
            ThrottleInputSchedule.FineBlend(140.0, 0.275),
            ThrottleInputSchedule.FineBlend(140.0, 0.275, double.NaN), 12);
    }

    [Fact]
    public void SabreOnSpeedFinalsPublishesTheFineHoldRate() {
        // End-to-end through DetentLayer: on the approach, the published relative hold rate
        // must be fine at the lever the auto-throttle actually trims the Sabre to.
        AircraftParams sabre = FlightModel.Sabre;
        var state = new AircraftState(
            new Vec3D(0.0, 50.0, 0.0), 70.0, 0.0, 0.0, 0.0, sabre.MassKg);
        var d = new DetentLayer();
        d.ConfigureFor(sabre, 0.30);
        d.ApproachMode = true;
        d.AirspeedMps = state.Speed;
        d.ApproachAirspeedMps = state.Speed; // on-speed: no proportional correction
        // Landing configuration per AirframeSystemsProfile.F86FResearchBasis: full 38-degree
        // flap (dCL 0.30, dCD 0.085) plus gear (dCD 0.040). This is what puts the Sabre's
        // approach trim in the 0.28-0.38 band the fix exists for.
        d.AerodynamicConfiguration = new AirframeAerodynamicState(
            LiftCoefficientIncrement: 0.30,
            DragCoefficientIncrement: 0.125,
            PitchMomentCoefficientIncrement: 0.0,
            LateralLiftCoefficientDifference: 0.0);
        var g = new KeyGrammar();
        double dt = 1.0 / AircraftSim.TickHz;
        for (int i = 0; i < 12; i++)
            d.Tick(g, i * dt * 1000.0, state, sabre,
                new Doctrine.DoctrineAdvice(1.0, 0.0, "x"), dt);

        Assert.InRange(d.ApproachTrimThrottle, 0.22, 0.45); // the airframe fact driving the fix
        Assert.Equal(ThrottleInputSchedule.FineHoldRatePerSecond,
            d.RelativeThrottleHoldRatePerSecond, 6);
    }

    [Fact]
    public void TapAcrossFineCoarseBoundaryDoesNotRatchet() {
        // 136 KIAS (fine speed band), lever 0.36 (just coarse). A down-tap crosses into
        // the blend; the up-tap back must return near the start. Sizing steps by the
        // pre-tap lever alone ratchets the round trip down by ~0.13 of lever.
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(
            new Vec3D(0.0, 100.0, 0.0), 70.0, 0.0, 0.0, 0.0, f22.MassKg);
        var d = new DetentLayer();
        d.ConfigureFor(f22, 0.36);
        d.AirspeedMps = state.Speed;
        var g = new KeyGrammar();
        var advice = new Doctrine.DoctrineAdvice(1.0, 0.0, "x");
        double stepMs = 1000.0 / AircraftSim.TickHz;
        double dt = 1.0 / AircraftSim.TickHz;
        void Run(int fromTick, int toTick) {
            for (int i = fromTick; i < toTick; i++)
                d.Tick(g, i * stepMs, state, f22, advice, dt);
        }

        Run(0, 12);
        double before = d.Throttle;

        g.Feed(GKey.ThrottleDown, true, 12 * stepMs);
        Run(12, 15);
        g.Feed(GKey.ThrottleDown, false, 15 * stepMs);
        Run(15, 60); // crosses the 250 ms tap-classification window
        double afterDown = d.Throttle;
        Assert.True(afterDown < before - 0.03,
            $"down-tap should still bite: {before:F3} → {afterDown:F3}");

        g.Feed(GKey.ThrottleUp, true, 60 * stepMs);
        Run(60, 63);
        g.Feed(GKey.ThrottleUp, false, 63 * stepMs);
        Run(63, 110);

        Assert.InRange(d.Throttle, before - 0.075, before + 0.075);
    }

    [Fact]
    public void RelativeHoldDoesNotMoveLeverWithoutPilotInput() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(
            new Vec3D(0.0, 100.0, 0.0), 70.0, 0.0, 0.0, 0.0, f22.MassKg);
        var d = new DetentLayer();
        d.ConfigureFor(f22, 0.08);
        var g = new KeyGrammar();
        double dt = 1.0 / AircraftSim.TickHz;
        for (int i = 0; i < 120; i++)
            d.Tick(g, i * dt * 1000.0, state, f22, new Doctrine.DoctrineAdvice(1.0, 0.0, "x"), dt);
        Assert.Equal(0.08, d.Throttle, 10);
    }

    [Fact]
    public void LowSpeedLowLeverHoldIsSlowerThanCombatHold() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var approach = new AircraftState(
            new Vec3D(0.0, 100.0, 0.0), 70.0, 0.0, 0.0, 0.0, f22.MassKg);
        var combat = new AircraftState(
            new Vec3D(0.0, 3000.0, 0.0), 240.0, 0.0, 0.0, 0.0, f22.MassKg);
        var gUp = new KeyGrammar();
        gUp.Feed(GKey.ThrottleUp, true, 0);
        double dt = 1.0 / AircraftSim.TickHz;
        var advice = new Doctrine.DoctrineAdvice(1.0, 0.0, "x");

        var approachDetents = new DetentLayer();
        approachDetents.ConfigureFor(f22, 0.08);
        approachDetents.AirspeedMps = approach.Speed;
        for (int i = 0; i < (int)AircraftSim.TickHz; i++)
            approachDetents.Tick(gUp, i * dt * 1000.0, approach, f22, advice, dt);

        var combatDetents = new DetentLayer();
        combatDetents.ConfigureFor(f22, 0.50);
        combatDetents.AirspeedMps = combat.Speed;
        var gCombat = new KeyGrammar();
        gCombat.Feed(GKey.ThrottleUp, true, 0);
        for (int i = 0; i < (int)AircraftSim.TickHz; i++)
            combatDetents.Tick(gCombat, i * dt * 1000.0, combat, f22, advice, dt);

        double approachDelta = approachDetents.Throttle - 0.08;
        double combatDelta = combatDetents.Throttle - 0.50;
        Assert.InRange(approachDelta, 0.12, 0.22);
        Assert.InRange(combatDelta, 0.55, 0.85);
        Assert.True(approachDelta < combatDelta * 0.45,
            $"approach Δ={approachDelta:F3} should be much smaller than combat Δ={combatDelta:F3}");
    }

    [Fact]
    public void HalfThrottleStillDeliversHalfMilitaryThrustForTvc() {
        // Regression: nonlinear dry PLA starved mid-lever TVC. Physics must stay linear.
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(
            new Vec3D(0.0, 1500.0, 0.0), 15.0, Math.PI / 2.0, 0.0, 0.0, f22.MassKg);
        var sim = new AircraftSim(state, f22);
        sim.SeedEnginePowerFraction(0.50);
        sim.AdvanceEngineOnly(0.50, 1.0 / AircraftSim.TickHz);
        Assert.InRange(
            sim.LastEngineOperatingPoint.NetThrustN / (0.50 * f22.ThrustMaxN),
            0.85, 1.05);
    }
}

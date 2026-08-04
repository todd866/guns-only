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

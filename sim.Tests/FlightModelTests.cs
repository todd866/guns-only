using GunsOnly.Sim;
using Xunit;

public class FlightModelTests {
    static AircraftState Level(double speed = 180, double alt = 3000) =>
        new(new Vec3D(0, alt, 0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    static PilotCommand Cruise => new(1.0, 0.0, 0.85, 0.0);

    [Fact] public void LevelOneGFlightHoldsAltitudeApproximately() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        for (int i = 0; i < 1200; i++) sim.Step(Cruise, 1.0/AircraftSim.TickHz); // 10 s
        Assert.InRange(sim.State.Position.Y, 2900, 3100);
    }
    [Fact] public void MaxGTurnBleedsAtDocumentedF86Rate() {
        // NACA RM L52C19 time histories put a hard F-86 turn near 12 kt/s (coarse, +/-50%).
        // Use the accuracy report's 375 kt / 10,000 ft / 90-deg-bank measurement window.
        const double mpsPerKnot = 0.514444;
        var sim = new AircraftSim(Level(375 * mpsPerKnot, 3048), FlightModel.Sabre);
        var pull = new PilotCommand(12.0, System.Math.PI / 2.0, 1.0, 0.0);
        for (int i = 0; i < 90; i++) sim.Step(pull, 1.0 / AircraftSim.TickHz); // settle 0.75 s
        double speed0 = sim.State.Speed, nzSum = 0.0;
        for (int i = 0; i < 480; i++) {
            sim.Step(pull, 1.0 / AircraftSim.TickHz); // sample 4 s
            nzSum += sim.LastNz;
        }
        double bleedKtS = (speed0 - sim.State.Speed) / 4.0 / mpsPerKnot;
        double meanNz = nzSum / 480.0;
        Assert.InRange(bleedKtS, 10.5, 13.5); // calibrated report value: ~12.0 kt/s
        Assert.InRange(meanNz, 6.0, 7.1);     // starts on +7 G, then unloads as speed bleeds
    }
    [Fact] public void UnloadedDiveGainsSpeed() {
        var start = Level(160) with { Gamma = -0.20 };
        var sim = new AircraftSim(start, FlightModel.Sabre);
        var unload = new PilotCommand(0.2, 0.0, 1.0, 0.0);
        double v0 = sim.State.Speed;
        for (int i = 0; i < 600; i++) sim.Step(unload, 1.0/AircraftSim.TickHz); // 5 s
        Assert.True(sim.State.Speed > v0 + 15);
    }
    [Fact] public void GAvailableIsLowWhenSlowHighWhenFast() {
        Assert.True(FlightModel.NzAeroMax(Level(90), FlightModel.Sabre) < 2.5);
        Assert.True(FlightModel.NzAeroMax(Level(260), FlightModel.Sabre) > 6.0);
    }
    [Fact] public void BuffetFlagsNearAeroLimit() {
        var sim = new AircraftSim(Level(140), FlightModel.Sabre);
        var hard = new PilotCommand(9.0, 0.0, 1.0, 0.0); // demands far beyond available
        for (int i = 0; i < 120; i++) sim.Step(hard, 1.0/AircraftSim.TickHz);
        Assert.True(sim.Buffet);
    }
    [Fact] public void BankApproachesTargetAtFiniteRate() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, 1.5708, 0.85, 0.0);
        sim.Step(roll, 1.0/AircraftSim.TickHz);
        Assert.True(sim.State.Bank < 0.10); // one tick cannot snap to 90 deg
        for (int i = 0; i < 240; i++) sim.Step(roll, 1.0/AircraftSim.TickHz); // 2 s
        Assert.InRange(sim.State.Bank, 1.35, 1.60);
    }
    [Fact] public void DeterministicGivenSameInputs() {
        var a = new AircraftSim(Level(), FlightModel.Sabre);
        var b = new AircraftSim(Level(), FlightModel.Sabre);
        var cmd = new PilotCommand(4.0, 0.9, 1.0, 0.0);
        for (int i = 0; i < 1000; i++) { a.Step(cmd, 1.0/AircraftSim.TickHz); b.Step(cmd, 1.0/AircraftSim.TickHz); }
        Assert.Equal(a.State, b.State);
    }
    [Fact] public void NearVerticalFlightDoesNotHangOrDiverge() {
        var vertical = new AircraftState(new Vec3D(0, 2000, 0), 150, 1.55, 0, 0.8, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(vertical, FlightModel.Sabre);
        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (int i = 0; i < 600; i++) sim.Step(new PilotCommand(1.0, 0.8, 1.0, 0.0), 1.0/AircraftSim.TickHz);
        sw.Stop();
        Assert.True(double.IsFinite(sim.State.Chi) && double.IsFinite(sim.State.Speed));
        Assert.True(sw.ElapsedMilliseconds < 2000, $"5 s of near-vertical sim took {sw.ElapsedMilliseconds} ms");
    }
    [Fact] public void HardPullClimbsPastFiftyDegreesWithoutSingularity() {
        var sim = new AircraftSim(Level(220, 2000), FlightModel.Sabre);
        double maxGamma = 0;
        for (int i = 0; i < 1440; i++) {
            sim.Step(new PilotCommand(6.5, 0.0, 1.0, 0.0), 1.0/AircraftSim.TickHz);
            maxGamma = System.Math.Max(maxGamma, sim.State.Gamma);
        }
        Assert.True(maxGamma > 0.9, $"max gamma {maxGamma:F2} rad");
        Assert.True(double.IsFinite(sim.State.Chi));
    }
    [Fact] public void OneStepBankResponseMatchesRk4Oracle() {
        // Linear ODE dphi/dt = (0.3 - phi)/tau from 0, one step h = tau (x=1):
        // RK4 one-step factor = 4th-order Taylor of e^-1 = 1 - 1 + 1/2 - 1/6 + 1/24 = 0.375  (VERIFY this arithmetic)
        // so phi = 0.3 * (1 - 0.375) = 0.1875. Euler gives 0.3, RK2 gives 0.15 — this pins RK4.
        var sim = new AircraftSim(Level(180, 3000), FlightModel.Sabre);
        sim.Step(new PilotCommand(1.0, 0.3, 0.85, 0.0), 0.18);
        Assert.Equal(0.1875, sim.State.Bank, 6);
    }
    [Fact] public void NegativeGRespectsAeroLimitWhenSlow() {
        var slow = Level(60, 3000);
        var sim = new AircraftSim(slow, FlightModel.Sabre);
        sim.Step(new PilotCommand(-1.0, 0.0, 0.5, 0.0), 1.0/AircraftSim.TickHz);
        Assert.True(sim.LastNz > -1.0, $"nz {sim.LastNz:F3} should be aero-limited above -1G at 60 m/s");
        Assert.True(sim.LastNz >= FlightModel.NzAeroMin(sim.State, FlightModel.Sabre) - 1e-9); // bound at the state LastNz was computed from
    }
    [Fact] public void LoopAttemptPassesVerticalRegionSmoothly() {
        // Regression pin for the parallel-transported lift frame (sim/AircraftSim.cs _liftRef):
        // before that fix, deriving lift direction per-tick from world-up x velocity flipped the
        // frame whenever the flight path crossed vertical, so lift reversed and gamma chattered
        // at the pole instead of pulling through.
        //
        // Observed 2026-07-17: a sustained 5.5G pull from Level(250, 3500) takes the jet over the
        // top — gamma climbs smoothly to ~1.5706 rad (essentially vertical, pi/2 = 1.5708) with chi
        // flipping ~0 -> ~pi exactly at the crossing (expected azimuth-pole wraparound for this
        // gamma/chi parameterization, not chatter). The pull bleeds enough energy that the jet falls
        // through two more partial "falling-leaf" loops before diving and recovering by t=30s.
        var sim = new AircraftSim(Level(250, 3500), FlightModel.Sabre);
        var pull = new PilotCommand(5.5, 0.0, 1.0, 0.0);
        var recover = new PilotCommand(1.0, 0.0, 1.0, 0.0);
        var gammas = new double[3600];
        double maxGamma = double.NegativeInfinity;
        double minSpeed = double.PositiveInfinity;
        var sw = System.Diagnostics.Stopwatch.StartNew();
        for (int i = 0; i < 3600; i++) {
            sim.Step(i < 1800 ? pull : recover, 1.0 / AircraftSim.TickHz);
            var st = sim.State;
            Assert.True(double.IsFinite(st.Gamma) && double.IsFinite(st.Chi) && double.IsFinite(st.Speed)
                        && double.IsFinite(st.Position.X) && double.IsFinite(st.Position.Y) && double.IsFinite(st.Position.Z),
                        $"non-finite state at tick {i}");
            gammas[i] = st.Gamma;
            maxGamma = System.Math.Max(maxGamma, st.Gamma);
            minSpeed = System.Math.Min(minSpeed, st.Speed);
        }
        sw.Stop();

        Assert.True(maxGamma > 1.35, $"max gamma only {maxGamma:F3} rad — did not pass near vertical");
        Assert.True(sw.ElapsedMilliseconds < 2000, $"3600 ticks took {sw.ElapsedMilliseconds} ms");

        int signChanges = 0;
        int? prevSign = null;
        for (int k = 60; k < gammas.Length; k++) {
            double d = gammas[k] - gammas[k - 60];
            int sign = d > 0 ? 1 : d < 0 ? -1 : 0;
            if (sign == 0) continue;
            if (prevSign.HasValue && sign != prevSign.Value) signChanges++;
            prevSign = sign;
        }
        // The real low-speed fall-through adds a clean reversal; six trends remain far from pole chatter.
        Assert.True(signChanges <= 6, $"{signChanges} sign changes in the gamma trend — looks like chatter, not a clean loop");

        Assert.True(minSpeed < 40.0,
            $"loop never exercised the removed velocity-floor region: minimum {minSpeed:F1} m/s");
        Assert.True(minSpeed > 0.0 && double.IsFinite(minSpeed),
            $"low-speed integration produced an invalid speed {minSpeed}");
        Assert.True(System.Math.Abs(sim.State.Gamma) < 0.9, $"gamma {sim.State.Gamma:F3} not recovered to sane flight");

        // Body-attitude lag changes the exact apex; the invariant is a genuine near-pole passage.
        Assert.InRange(maxGamma, 1.50, 1.5708 + 1e-3);
        // The physical fall-through adds one reversal; single digits still reject chatter.
        Assert.InRange(signChanges, 1, 6);
    }
    [Fact] public void ZeroAirspeedUsesZeroDynamicPressureAndGravityOnly() {
        var raw = new RawState(new Vec3D(0.0, 3000.0, 0.0), Vec3D.Zero, 0.0,
            FlightModel.Sabre.MassKg, QuaternionD.Identity, default);
        var aero = FlightModel.Aerodynamics(raw,
            new PilotCommand(7.0, 0.0, 0.0, 0.0),
            FlightModel.Sabre, Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean);

        Assert.Equal(0.0, aero.DynamicPressure);
        Assert.Equal(0.0, aero.Accel.X);
        Assert.Equal(-FlightModel.G0, aero.Accel.Y);
        Assert.Equal(0.0, aero.Accel.Z);
    }
    [Fact] public void ZeroSpeedFallsNaturallyWithoutAMinimumVelocityRewrite() {
        var initial = new AircraftState(new Vec3D(0.0, 3000.0, 0.0),
            0.0, 0.0, 0.0, 0.0, FlightModel.GliderStrike.MassKg);
        var sim = new AircraftSim(initial, FlightModel.GliderStrike);
        var neutral = new PilotCommand(0.0, 0.0, 0.0, 0.0);

        sim.Step(neutral, 1.0 / AircraftSim.TickHz);
        Assert.InRange(sim.State.Speed, 0.01, 1.0);
        Assert.True(sim.State.Gamma < -1.4,
            $"gravity did not establish a downward velocity: gamma={sim.State.Gamma:F3}");

        for (int i = 1; i < AircraftSim.TickHz; i++)
            sim.Step(neutral, 1.0 / AircraftSim.TickHz);

        Assert.InRange(sim.State.Speed, 5.0, 20.0);
        Assert.True(sim.State.Position.Y < 2998.0,
            $"zero-speed state did not fall: altitude={sim.State.Position.Y:F2} m");
        Assert.True(double.IsFinite(sim.State.Speed)
            && sim.State.BodyAttitude.IsFinite && sim.State.BodyRates.IsFinite);
    }
    [Fact] public void FlyingIntoTheSeaIsDetected() {
        // Nobody had ever flown into the ground: a 12G pull from inverted took the web build to
        // -10,679 ft with the world rendering black. The kernel now reports the fact.
        var sim = new AircraftSim(new AircraftState(new Vec3D(0, 800, 0), 200, -1.2, 0, 0, FlightModel.Sabre.MassKg), FlightModel.Sabre);
        Assert.False(sim.BelowGround);
        for (int i = 0; i < 1200 && !sim.BelowGround; i++) sim.Step(new PilotCommand(1.0, 0, 0.85, 0), 1.0/AircraftSim.TickHz);
        Assert.True(sim.BelowGround, "a sustained dive from 800 m must reach the sea");
    }
    [Fact] public void LowFlightAboveTheActualSeaIsNotAnOutcome() {
        var low = new AircraftState(new Vec3D(0, 100, 0), 200, 0, 0, 0, FlightModel.Sabre.MassKg);
        var sim = new AircraftSim(low, FlightModel.Sabre);
        Assert.False(sim.BelowGround);
        Assert.Null(typeof(AircraftSim).GetProperty("BelowHardDeck"));
        Assert.Null(typeof(AircraftSim).GetField("HardDeckM"));
    }
    [Fact] public void LiftDirTracksBank() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, 0.7854, 0.85, 0.0);
        for (int i = 0; i < 360; i++) sim.Step(roll, 1.0/AircraftSim.TickHz);
        Assert.True(sim.LiftDir.X > 0.5, $"northbound right bank must tilt lift east (X>0), got {sim.LiftDir.X:F2}");
        Assert.True(sim.LiftDir.Y > 0.5);
        Assert.Equal(0.0, sim.LiftDir.Dot(sim.State.VelocityVector().Normalized()), 6);
    }
    [Fact] public void BankErrorWrapsShortestWay() {
        // From +3.10 rad toward advice -3.10 rad: shortest way is CONTINUING right through pi
        // (wrapped error +0.083 rad), not a near-full left roll.
        double rate = 0.0;
        var mi = typeof(FlightModel).GetMethod("BankRate", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        object[] args = { 3.10, -3.10, FlightModel.Sabre };
        rate = (double)mi!.Invoke(null, args)!;
        Assert.True(rate > 0, $"expected positive (rightward) rate, got {rate:F4}");
    }
}

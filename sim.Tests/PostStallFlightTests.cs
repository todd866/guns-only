using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// Qualitative deterministic pins for the continuous separated-flow model. These tests do not
/// inspect or advance a departure mode because none exists: entry and recovery are inferred only
/// from alpha, beta, body rates, airspeed, and altitude.
public sealed class PostStallFlightTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / System.Math.PI;
    const double MpsPerKnot = 0.514444;

    sealed class Rig {
        public readonly AircraftSim Sim;
        public readonly DetentLayer Detent = new() { Variant = ValleyVariant.PhysicsOnly };
        public readonly KeyGrammar Keys = new();
        double _timeMs;

        public Rig(double knots = 170.0, double altitudeM = 6000.0) {
            var initial = new AircraftState(new Vec3D(0.0, altitudeM, 0.0),
                knots * MpsPerKnot, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
            Sim = new AircraftSim(initial, FlightModel.Sabre);
        }

        public void Set(GKey key, bool down) => Keys.Feed(key, down, _timeMs);

        public void Step() {
            Detent.AirspeedMps = Sim.AirspeedMps;
            Detent.Tick(Keys, _timeMs, Sim.State, FlightModel.Sabre,
                new DoctrineAdvice(4.2, 0.9, "post-stall test"), Dt);
            Sim.Step(Detent.Command, Dt);
            _timeMs += Dt * 1000.0;
        }

        public void StepSeconds(double seconds) {
            for (int i = 0; i < (int)System.Math.Round(seconds / Dt); i++) Step();
        }
    }

    [Fact]
    public void BareProtectedPullBuffetsWithoutDeparting() {
        var rig = new Rig();
        rig.Set(GKey.PullUp, true);
        double maxAlpha = 0.0, maxP = 0.0, maxR = 0.0;
        for (int i = 0; i < 1200; i++) {
            rig.Step();
            maxAlpha = System.Math.Max(maxAlpha, System.Math.Abs(rig.Sim.AngleOfAttackRad));
            maxP = System.Math.Max(maxP, System.Math.Abs(rig.Sim.State.BodyRates.P));
            maxR = System.Math.Max(maxR, System.Math.Abs(rig.Sim.State.BodyRates.R));
        }

        output.WriteLine($"protected max alpha={maxAlpha * Deg:F2} deg p={maxP * Deg:F2} deg/s r={maxR * Deg:F2} deg/s");
        Assert.True(rig.Sim.Buffet, "full protected pull should reach buffet");
        Assert.True(maxAlpha * Deg < 18.0, $"protected pull reached {maxAlpha * Deg:F1} deg alpha");
        Assert.True(maxP * Deg < 8.0 && maxR * Deg < 8.0,
            $"symmetric protected pull autorotated: p={maxP * Deg:F1}, r={maxR * Deg:F1} deg/s");
    }

    [Fact]
    public void SymmetricOverridePullCrossesTheBreakWithoutInventingARotation() {
        var rig = new Rig();
        rig.Set(GKey.Override, true);
        rig.Set(GKey.PullUp, true);
        double maxAlpha = 0.0, maxP = 0.0, maxR = 0.0;
        for (int i = 0; i < 840; i++) {
            rig.Step();
            maxAlpha = System.Math.Max(maxAlpha, rig.Sim.AngleOfAttackRad);
            maxP = System.Math.Max(maxP, System.Math.Abs(rig.Sim.State.BodyRates.P));
            maxR = System.Math.Max(maxR, System.Math.Abs(rig.Sim.State.BodyRates.R));
        }

        output.WriteLine($"symmetric override max alpha={maxAlpha * Deg:F2} deg "
            + $"p={maxP * Deg:F3} r={maxR * Deg:F3} deg/s");
        Assert.True(maxAlpha * Deg > 20.0,
            $"override did not refocus beyond stall: max alpha={maxAlpha * Deg:F1} deg");
        Assert.True(maxP * Deg < 0.1 && maxR * Deg < 0.1,
            $"symmetric override injected rotation: p={maxP * Deg:F2}, r={maxR * Deg:F2} deg/s");
    }

    [Fact]
    public void OverridePullAndRudderEnterSustainedAutorotation() {
        var rig = EnterRightSpin();
        double p = rig.Sim.State.BodyRates.P * Deg;
        double r = rig.Sim.State.BodyRates.R * Deg;
        output.WriteLine($"entry alpha={rig.Sim.AngleOfAttackRad * Deg:F1} beta={rig.Sim.SideslipRad * Deg:F1} "
            + $"p={p:F1} r={r:F1} deg/s speed={rig.Sim.AirspeedMps / MpsPerKnot:F0} kt alt={rig.Sim.State.Position.Y:F0} m");

        Assert.True(rig.Sim.AngleOfAttackRad * Deg > 20.0,
            $"override never crossed the lift break: {rig.Sim.AngleOfAttackRad * Deg:F1} deg");
        Assert.True(p > 25.0 && r > 15.0,
            $"no right autorotation: p={p:F1}, r={r:F1} deg/s");

        double minLateralRate = double.PositiveInfinity, minR = double.PositiveInfinity;
        for (int i = 0; i < 240; i++) {
            rig.Step();
            double pNow = rig.Sim.State.BodyRates.P * Deg;
            double rNow = rig.Sim.State.BodyRates.R * Deg;
            minLateralRate = System.Math.Min(minLateralRate,
                System.Math.Sqrt(pNow * pNow + rNow * rNow));
            minR = System.Math.Min(minR, rNow);
        }
        // Once deeply departed, body p can change sign as the rotating body axes tumble through the
        // inertial rotation. Sustained autorotation is the lateral angular-rate magnitude plus the
        // continuing pro-spin yaw component, not a scripted sign latch on body roll rate.
        Assert.True(minLateralRate > 20.0 && minR > 8.0,
            $"autorotation did not sustain for two seconds: min lateral={minLateralRate:F1}, "
            + $"r={minR:F1} deg/s");
    }

    [Fact]
    public void UnloadAndOppositeRudderRecoverThenNeutralise() {
        var rig = EnterRightSpin();
        double entryAltitude = rig.Sim.State.Position.Y;
        double entryYawRate = rig.Sim.State.BodyRates.R;

        rig.Set(GKey.PullUp, false);
        rig.Set(GKey.Override, false);
        rig.Set(GKey.RudderRight, false);
        rig.Set(GKey.PushDown, true);       // unload first
        rig.StepSeconds(0.25);
        rig.Set(GKey.RudderLeft, true);    // then oppose the established rotation
        rig.StepSeconds(2.75);
        double opposedYawRate = System.Math.Abs(rig.Sim.State.BodyRates.R);

        rig.Set(GKey.PushDown, false);
        rig.Set(GKey.RudderLeft, false);   // rotation stopped: neutralise and let 1 G refocus
        rig.StepSeconds(7.0);

        double loss = entryAltitude - rig.Sim.State.Position.Y;
        output.WriteLine($"recovery alpha={rig.Sim.AngleOfAttackRad * Deg:F1} p={rig.Sim.State.BodyRates.P * Deg:F1} "
            + $"r={rig.Sim.State.BodyRates.R * Deg:F1} deg/s speed={rig.Sim.AirspeedMps / MpsPerKnot:F0} kt loss={loss:F0} m");
        Assert.True(opposedYawRate < System.Math.Abs(entryYawRate),
            "opposite rudder did not reduce the established yaw rate");
        Assert.True(System.Math.Abs(rig.Sim.AngleOfAttackRad) * Deg < 14.0,
            $"alpha remained departed at {rig.Sim.AngleOfAttackRad * Deg:F1} deg");
        Assert.True(System.Math.Abs(rig.Sim.State.BodyRates.P) * Deg < 15.0
            && System.Math.Abs(rig.Sim.State.BodyRates.R) * Deg < 15.0,
            $"autorotation persisted: p={rig.Sim.State.BodyRates.P * Deg:F1}, r={rig.Sim.State.BodyRates.R * Deg:F1} deg/s");
        Assert.InRange(loss, 150.0, 2500.0);
        Assert.True(rig.Sim.AirspeedMps > 120.0 * MpsPerKnot,
            $"recovery did not regain flying speed: {rig.Sim.AirspeedMps / MpsPerKnot:F0} kt");
    }

    [Fact]
    public void AircraftHasNoScriptedDepartureOrSpinState() {
        static bool ScriptedName(string name) =>
            name.Contains("spin", StringComparison.OrdinalIgnoreCase)
            || name.Contains("depart", StringComparison.OrdinalIgnoreCase);

        var stateMembers = typeof(AircraftSim).GetMembers(
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public
            | System.Reflection.BindingFlags.NonPublic)
            .Where(m => m.MemberType is System.Reflection.MemberTypes.Field
                or System.Reflection.MemberTypes.Property)
            .Where(m => ScriptedName(m.Name))
            .Select(m => m.Name)
            .ToArray();
        Assert.Empty(stateMembers);
    }

    [Fact]
    public void OverrideMetadataCannotChangeIdenticalPostStallActuatorDemands() {
        var initial = new AircraftState(new Vec3D(0.0, 6000.0, 0.0),
            170.0 * MpsPerKnot, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg);
        var plain = new AircraftSim(initial, FlightModel.Sabre);
        var tagged = new AircraftSim(initial, FlightModel.Sabre);

        static PilotCommand PairCommand(double g, double rudder,
            double commandedAlphaRad = double.NaN) => new(
            GDemand: g,
            BankTarget: 0.0,
            Throttle: 1.0,
            Rudder: rudder,
            EnvelopeOverride: false,
            CommandedAlphaRad: commandedAlphaRad);

        void StepPair(in PilotCommand physicalDemand) {
            plain.Step(physicalDemand, Dt);
            tagged.Step(physicalDemand with { EnvelopeOverride = true }, Dt);
            Assert.Equal(plain.State, tagged.State);
            Assert.Equal(plain.AirVelocity, tagged.AirVelocity);
            Assert.Equal(plain.LastNz, tagged.LastNz);
            Assert.Equal(plain.AngleOfAttackRad, tagged.AngleOfAttackRad);
            Assert.Equal(plain.SideslipRad, tagged.SideslipRad);
        }

        PilotCommand entry = PairCommand(FlightModel.Sabre.PositiveStructuralLimitG,
            rudder: 0.6, commandedAlphaRad: FlightModel.Sabre.PostStallAlphaCommandRad);
        double peakAlpha = 0.0, peakP = 0.0, peakR = 0.0;
        for (int i = 0; i < 7 * AircraftSim.TickHz; i++) {
            StepPair(entry);
            peakAlpha = System.Math.Max(peakAlpha, plain.AngleOfAttackRad);
            peakP = System.Math.Max(peakP, System.Math.Abs(plain.State.BodyRates.P));
            peakR = System.Math.Max(peakR, System.Math.Abs(plain.State.BodyRates.R));
        }

        Assert.True(peakAlpha * Deg > 20.0,
            "paired fixture must genuinely enter separated flow");
        Assert.True(peakP * Deg > 20.0 && peakR * Deg > 10.0,
            $"paired fixture must develop natural differential-wing autorotation: "
            + $"peak p={peakP * Deg:F1}, r={peakR * Deg:F1} deg/s");

        PilotCommand oppose = PairCommand(-1.0, rudder: -0.6);
        for (int i = 0; i < 3 * AircraftSim.TickHz; i++) StepPair(oppose);
        PilotCommand neutral = PairCommand(1.0, rudder: 0.0);
        for (int i = 0; i < 7 * AircraftSim.TickHz; i++) StepPair(neutral);

        Assert.True(System.Math.Abs(plain.AngleOfAttackRad) * Deg < 14.0,
            $"paired recovery remained departed at {plain.AngleOfAttackRad * Deg:F1} deg");
        Assert.True(System.Math.Abs(plain.State.BodyRates.P) * Deg < 15.0
            && System.Math.Abs(plain.State.BodyRates.R) * Deg < 15.0,
            "paired recovery did not arrest autorotation");
    }

    Rig EnterRightSpin() {
        var rig = new Rig();
        rig.Set(GKey.Override, true);
        rig.Set(GKey.PullUp, true);
        rig.Set(GKey.RudderRight, true);
        for (int second = 1; second <= 7; second++) {
            rig.StepSeconds(1.0);
            output.WriteLine($"entry t={second}s alpha={rig.Sim.AngleOfAttackRad * Deg:F1} "
                + $"beta={rig.Sim.SideslipRad * Deg:F1} p={rig.Sim.State.BodyRates.P * Deg:F1} "
                + $"q={rig.Sim.State.BodyRates.Q * Deg:F1} r={rig.Sim.State.BodyRates.R * Deg:F1} "
                + $"v={rig.Sim.AirspeedMps / MpsPerKnot:F0}kt");
        }
        return rig;
    }
}

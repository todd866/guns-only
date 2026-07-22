using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class FightControlTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / System.Math.PI;
    const double MpsPerKnot = 0.514444;

    sealed class FightRig {
        public readonly AircraftSim Sim;
        public readonly DetentLayer Detent = new() { Variant = ValleyVariant.PhysicsOnly };
        public readonly KeyGrammar Keys = new();
        double _timeMs;

        public FightRig(double knots, double bankDeg = 0.0, double gammaDeg = 0.0) {
            var initial = new AircraftState(new Vec3D(0, 3000, 0), knots * MpsPerKnot,
                gammaDeg / Deg, 0, bankDeg / Deg, FlightModel.Sabre.MassKg);
            Sim = new AircraftSim(initial, FlightModel.Sabre);
        }

        public void Set(GKey key, bool down) => Keys.Feed(key, down, _timeMs);

        public void Step() {
            Detent.Tick(Keys, _timeMs, Sim.State, FlightModel.Sabre,
                new DoctrineAdvice(4.2, 0.9, "fight test"), Dt);
            Sim.Step(Detent.Command, Dt);
            _timeMs += Dt * 1000.0;
        }
    }

    [Fact]
    public void FullBackstickAtNinetyDegreesBankProducesStructuralLimitG() {
        // Regression for BUILD 29: finite CommandedPitchRad bypassed GDemand, while the uninitialised
        // bank target simultaneously dragged an already-banked jet toward wings level.
        var rig = new FightRig(375, 90);
        double initialLimit = System.Math.Min(FlightModel.NzAeroMax(rig.Sim.State, FlightModel.Sabre),
            FlightModel.Sabre.PositiveStructuralLimitG);
        rig.Set(GKey.PullUp, true);
        double maxNz = 0.0;

        for (int i = 0; i < 120; i++) {
            rig.Step();
            maxNz = System.Math.Max(maxNz, rig.Sim.LastNz);
        }

        Assert.True(maxNz >= 0.98 * initialLimit,
            $"90-deg-bank full pull only made {maxNz:F2} G of {initialLimit:F2} allowed");
        Assert.True(rig.Sim.LastNz > 6.4, $"G meter no longer holds near +7 G: {rig.Sim.LastNz:F2} G");
        Assert.True(System.Math.Abs(rig.Sim.BodyRollRad) * Deg > 80.0,
            $"fight augmentation dragged bank to {rig.Sim.BodyRollRad * Deg:F1} deg");
    }

    [Fact]
    public void FullBackstickHitsCornerAndSustainedSabreTargets() {
        // F-86 tuning anchors: ~7 G instantaneous near 375 kt; about 5 G after a sustained
        // max-performance pull from 350 kt as induced drag starts collecting the energy bill.
        var corner = new FightRig(375);
        corner.Set(GKey.PullUp, true);
        double cornerPeak = 0.0;
        for (int i = 0; i < 120; i++) {
            corner.Step();
            cornerPeak = System.Math.Max(cornerPeak, corner.Sim.LastNz);
        }

        var sustained = new FightRig(350);
        sustained.Set(GKey.PullUp, true);
        for (int i = 0; i < 240; i++) sustained.Step();

        Assert.InRange(cornerPeak, 6.8, 7.2);              // report: 7.06 G at 375 kt
        Assert.InRange(sustained.Sim.LastNz, 4.9, 5.5);   // real F-86 target: ~5 G
    }

    [Fact]
    public void FullPullBuildsGPromptlyAndReleaseUnloads() {
        var rig = new FightRig(375);
        rig.Set(GKey.PullUp, true);
        int firstSixGTick = -1;
        for (int i = 0; i < 120; i++) {
            rig.Step();
            if (firstSixGTick < 0 && rig.Sim.LastNz >= 6.0) firstSixGTick = i + 1;
        }
        Assert.True(firstSixGTick > 0 && firstSixGTick * Dt <= 0.75,
            $"6 G took {(firstSixGTick < 0 ? double.PositiveInfinity : firstSixGTick * Dt):F2} s");

        rig.Set(GKey.PullUp, false);
        int unloadTick = -1;
        for (int i = 0; i < 90; i++) {
            rig.Step();
            if (unloadTick < 0 && rig.Sim.LastNz <= 2.0) unloadTick = i + 1;
        }
        Assert.True(unloadTick > 0 && unloadTick * Dt <= 0.65,
            $"unload to 2 G took {(unloadTick < 0 ? double.PositiveInfinity : unloadTick * Dt):F2} s");
    }

    [Fact]
    public void FullFightRollReachesRealJetRateWithoutOvershoot() {
        var rig = new FightRig(375);
        rig.Set(GKey.RollRight, true);
        double maxRollRateDeg = 0.0;
        for (int i = 0; i < 180; i++) {
            rig.Step();
            maxRollRateDeg = System.Math.Max(maxRollRateDeg,
                System.Math.Abs(rig.Sim.State.BodyRates.P) * Deg);
        }

        Assert.InRange(maxRollRateDeg, 120.0, 145.0); // NACA-observed F-86 scale: ~140 deg/s
    }

    [Fact]
    public void GliderStrikeHasAUsableExplicitPhysicalAileronResponse() {
        var setup = Beats.BalloonStrike();
        var sim = new AircraftSim(setup.Player, FlightModel.GliderStrike);
        var right = new PilotCommand(1.0, 0.0, 0.0, 0.0,
            RollControl: 1.0, DirectLateralControl: true);
        double maxRollRateDeg = 0.0;
        for (int i = 0; i < 2 * AircraftSim.TickHz; i++) {
            sim.Step(right, Dt);
            maxRollRateDeg = System.Math.Max(maxRollRateDeg,
                sim.State.BodyRates.P * Deg);
        }

        Assert.Equal("glider-strike-geometry-provisional-v1",
            FlightModel.GliderStrike.LateralDerivativeProfileId);
        Assert.InRange(FlightModel.GliderStrike.IxxKgM2, 100.0, 500.0);
        Assert.InRange(FlightModel.GliderStrike.WingSpanM, 5.0, 7.0);
        Assert.InRange(maxRollRateDeg, 80.0, 145.0);
        Assert.True(sim.State.BodyAttitude.IsFinite && sim.State.BodyRates.IsFinite,
            "small-airframe inertias must retain a finite rigid-body response");
    }

    [Fact]
    public void NeutralManualRollDampsRateWithoutCapturingBank() {
        var initial = new AircraftState(new Vec3D(0, 3000, 0), 375 * MpsPerKnot,
            0.0, 0.0, 58.0 / Deg, FlightModel.Sabre.MassKg,
            BodyRates: new BodyRates(0.55, 0.0, 0.0));
        var sim = new AircraftSim(initial, FlightModel.Sabre);
        // Deliberately conflicting BankTarget proves that the physical flown path does not use it
        // as a hidden wings-level command.
        var neutral = new PilotCommand(1.0, 0.0, 0.85, 0.0,
            RollControl: 0.0, SasRollControl: 0.0, DirectLateralControl: true);

        for (int i = 0; i < 240; i++) sim.Step(neutral, Dt);

        // A banked, turning aircraft may retain a few deg/s from beta/r coupling; the invariant is
        // that the original 31.5 deg/s has naturally damped without a bank-capture servo.
        Assert.True(System.Math.Abs(sim.State.BodyRates.P) * Deg < 10.0,
            $"natural lateral derivatives left {sim.State.BodyRates.P * Deg:F1} deg/s roll");
        Assert.True(System.Math.Abs(sim.BodyRollRad) * Deg > 35.0,
            $"neutral manual control captured the conflicting wings-level target: {sim.BodyRollRad * Deg:F1} deg");
    }

    [Fact]
    public void ManualRollDirectionWinsOverAConflictingBankTarget() {
        var sim = new AircraftSim(new AircraftState(new Vec3D(0, 3000, 0),
            375 * MpsPerKnot, 0.0, 0.0, 0.0, FlightModel.Sabre.MassKg), FlightModel.Sabre);
        var rightRoll = new PilotCommand(1.0, -1.0, 0.85, 0.0,
            RollControl: 1.0,
            SasRollControl: 0.0,
            DirectLateralControl: true);

        for (int i = 0; i < 30; i++) sim.Step(rightRoll, Dt);

        Assert.True(sim.State.BodyRates.P > 0.0,
            $"right aileron was overridden by bank target: {sim.State.BodyRates.P * Deg:F1} deg/s");
        Assert.True(sim.BodyRollRad > 0.0,
            $"right aileron produced {sim.BodyRollRad * Deg:F1} deg bank");
    }

    [Fact]
    public void NeutralManualAileronHasNoHiddenServoAndNaturalRollDampingOpposesRate() {
        var initial = new AircraftState(new Vec3D(0, 3000, 0), 375 * MpsPerKnot,
            0.0, 0.0, 0.0, FlightModel.Sabre.MassKg,
            BodyRates: new BodyRates(0.40, 0.0, 0.0));
        var sim = new AircraftSim(initial, FlightModel.Sabre);
        var neutral = new PilotCommand(1.0, 1.25, 0.85, 0.0,
            RollControl: 0.0, SasRollControl: 0.0, DirectLateralControl: true);

        sim.Step(neutral, Dt);

        Assert.True(sim.LastRollMomentNm < 0.0,
            $"natural ClP damping did not oppose positive p: {sim.LastRollMomentNm:F0} Nm");
        Assert.True(sim.State.BodyRates.P < initial.BodyRates.P,
            $"neutral aileron increased p: {initial.BodyRates.P:F3} -> {sim.State.BodyRates.P:F3}");
        Assert.True(sim.BodyRollRad > 0.0,
            "conflicting bank target generated a hidden wings-left servo moment");
    }

    // A hard hands-off pull with a lateral disturbance: return the total body roll the aircraft
    // accumulates about its own roll axis (the integral of the body roll rate, unconfounded by the
    // pull's flight-path-frame rotation) and the roll rate still present at the end. Same command,
    // one airframe with the FBW bank-hold and an otherwise-identical clone with the hold off.
    static (double AccumulatedBodyRollRad, double FinalRollRateRad) HardPullBankDrift(
        in AircraftParams param) {
        var disturbed = new AircraftState(new Vec3D(0, 6000, 0), 250.0, 0.0, 0.0,
            25.0 / Deg, param.MassKg, BodyRates: new BodyRates(0.35, 0.0, 0.0));
        var sim = new AircraftSim(disturbed, param);
        var pull = new PilotCommand(7.0, 25.0 / Deg, 1.0, 0.0,
            RollControl: 0.0, SasRollControl: 0.0, DirectLateralControl: true);
        double accumulated = 0.0;
        for (int i = 0; i < 360; i++) { // 3 s hard pull, hands off the roll axis
            sim.Step(pull, Dt);
            accumulated += sim.State.BodyRates.P * Dt;
        }
        return (accumulated, sim.State.BodyRates.P);
    }

    [Fact]
    public void FbwBankHoldContainsUncommandedRollUnderHardPullYetLeavesCommandedRollFree() {
        var p = FlightModel.F22APublicDataSurrogate;
        // The complaint: pulling hard lets the bank drift, forcing constant aileron. The FBW
        // bank-hold must arrest the uncommanded roll and materially contain the bank versus an
        // identical airframe with the hold switched off.
        var withHold = HardPullBankDrift(p);
        var withoutHold = HardPullBankDrift(p with { RollHoldRateGainNms = 0.0 });

        Assert.True(System.Math.Abs(withHold.FinalRollRateRad) * Deg < 2.0,
            $"bank-hold left {withHold.FinalRollRateRad * Deg:F1} deg/s of uncommanded roll");
        Assert.True(System.Math.Abs(withHold.FinalRollRateRad)
            < 0.25 * System.Math.Abs(withoutHold.FinalRollRateRad),
            $"hold barely damped roll rate: {withHold.FinalRollRateRad * Deg:F1} vs "
                + $"{withoutHold.FinalRollRateRad * Deg:F1} deg/s hands-off");
        Assert.True(System.Math.Abs(withHold.AccumulatedBodyRollRad)
            < 0.6 * System.Math.Abs(withoutHold.AccumulatedBodyRollRad),
            $"hold barely contained body roll: {withHold.AccumulatedBodyRollRad * Deg:F1} vs "
                + $"{withoutHold.AccumulatedBodyRollRad * Deg:F1} deg");

        // A deliberate roll still gets full FBW rate authority: the hold fades out of its way.
        var rolling = new AircraftSim(new AircraftState(new Vec3D(0, 6000, 0), 250.0,
            0.0, 0.0, 0.0, p.MassKg), p);
        var rollRight = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 1.0, DirectLateralControl: true);
        double maxRollRateDeg = 0.0;
        for (int i = 0; i < 120; i++) {
            rolling.Step(rollRight, Dt);
            maxRollRateDeg = System.Math.Max(maxRollRateDeg,
                System.Math.Abs(rolling.State.BodyRates.P) * Deg);
        }
        Assert.True(maxRollRateDeg > 90.0,
            $"commanded roll only reached {maxRollRateDeg:F0} deg/s with the hold present");
    }

    [Fact]
    public void ManualAileronAuthorityScalesWithDynamicPressure() {
        static AircraftSim Rig(double speedMps) => new(new AircraftState(
            new Vec3D(0, 3000, 0), speedMps, 0.0, 0.0, 0.0,
            FlightModel.Sabre.MassKg), FlightModel.Sabre);
        var slow = Rig(100.0);
        var fast = Rig(200.0);
        var right = new PilotCommand(1.0, 0.0, 0.85, 0.0,
            RollControl: 1.0, DirectLateralControl: true);

        slow.Step(right, Dt);
        fast.Step(right, Dt);

        Assert.True(fast.LastRollMomentNm > slow.LastRollMomentNm * 3.5,
            $"aileron moment did not follow q: slow={slow.LastRollMomentNm:F0}, fast={fast.LastRollMomentNm:F0} Nm");
    }

    [Fact]
    public void PositiveRepoBetaProducesNegativeDihedralRollMoment() {
        const double beta = 10.0 / Deg;
        // Repository beta is velocity-to-the-right of the nose. Yaw the body left while inertial
        // velocity remains north so vhat dot bodyRight is positive by construction.
        var forward = new Vec3D(-System.Math.Sin(beta), 0.0, System.Math.Cos(beta));
        var up = new Vec3D(0.0, 1.0, 0.0);
        var attitude = QuaternionD.FromFrame(up.Cross(forward), up, forward);
        var raw = new RawState(new Vec3D(0.0, 3000.0, 0.0),
            new Vec3D(0.0, 0.0, 375.0 * MpsPerKnot), 0.0,
            FlightModel.Sabre.MassKg, attitude, default);
        var command = new PilotCommand(1.0, 0.0, 0.85, 0.0,
            DirectLateralControl: true);

        StateDeriv derivative = FlightModel.Derivatives(raw, command, FlightModel.Sabre,
            up, Vec3D.Zero, 0.0, AirframeAerodynamicState.Clean);

        Assert.True(derivative.RollMomentNm < 0.0,
            $"positive repo beta produced {derivative.RollMomentNm:F0} Nm; ClBeta sign drifted");
    }

    [Fact]
    public void PositiveRepoRudderProducesPositiveRollingMoment() {
        var raw = LevelRaw(bankRad: 0.0);
        var command = new PilotCommand(1.0, 0.0, 0.85, 0.6,
            DirectLateralControl: true);

        StateDeriv derivative = FlightModel.Derivatives(raw, command, FlightModel.Sabre,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            AirframeAerodynamicState.Clean);

        Assert.True(derivative.RollMomentNm > 0.0,
            $"positive repo rudder produced {derivative.RollMomentNm:F0} Nm; ClDeltaR sign drifted");
    }

    [Fact]
    public void SplitFlapRollFadesWithSeparationButStructuralDamagePersists() {
        static RawState AtAlpha(double alpha) {
            var forward = new Vec3D(0.0, System.Math.Sin(alpha), System.Math.Cos(alpha));
            var up = new Vec3D(0.0, System.Math.Cos(alpha), -System.Math.Sin(alpha));
            var right = up.Cross(forward);
            return new RawState(new Vec3D(0.0, 3000.0, 0.0),
                new Vec3D(0.0, 0.0, 180.0), 0.0, FlightModel.Sabre.MassKg,
                QuaternionD.FromFrame(right, up, forward), default);
        }

        var neutral = new PilotCommand(1.0, 0.0, 0.85, 0.0,
            DirectLateralControl: true);
        var splitFlap = new AirframeAerodynamicState(0.0, 0.0, 0.0,
            LateralLiftCoefficientDifference: 0.20);
        var structuralDamage = new AirframeAerodynamicState(0.0, 0.0, 0.0,
            LateralLiftCoefficientDifference: 0.0,
            PersistentLateralLiftCoefficientDifference: 0.20);
        double separatedAlpha = FlightModel.AlphaAeroMax(FlightModel.Sabre) + 0.14;

        double splitAttached = FlightModel.Derivatives(AtAlpha(0.0), neutral,
            FlightModel.Sabre, new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            splitFlap).RollMomentNm;
        double splitSeparated = FlightModel.Derivatives(AtAlpha(separatedAlpha), neutral,
            FlightModel.Sabre, new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            splitFlap).RollMomentNm;
        double damageAttached = FlightModel.Derivatives(AtAlpha(0.0), neutral,
            FlightModel.Sabre, new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            structuralDamage).RollMomentNm;
        double damageSeparated = FlightModel.Derivatives(AtAlpha(separatedAlpha), neutral,
            FlightModel.Sabre, new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            structuralDamage).RollMomentNm;

        Assert.True(splitAttached > 1000.0);
        Assert.Equal(0.0, splitSeparated, 6);
        Assert.Equal(damageAttached, damageSeparated, 6);
        Assert.Equal(splitAttached, damageAttached, 6);
    }

    [Theory]
    [InlineData(-120.0)]
    [InlineData(-45.0)]
    [InlineData(0.0)]
    [InlineData(60.0)]
    [InlineData(145.0)]
    public void NeutralManualLateralControlsProduceExactlyZeroMomentAtAnyBank(double bankDeg) {
        var raw = LevelRaw(bankDeg / Deg);
        // A conflicting legacy target is deliberate: direct manual mode must ignore it.
        var command = new PilotCommand(1.0, -1.7, 0.85, 0.0,
            RollControl: 0.0, SasRollControl: 0.0, DirectLateralControl: true);

        StateDeriv derivative = FlightModel.Derivatives(raw, command, FlightModel.Sabre,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, 0.0,
            AirframeAerodynamicState.Clean);

        Assert.Equal(0.0, derivative.RollMomentNm, 8);
    }

    static RawState LevelRaw(double bankRad) {
        var forward = new Vec3D(0.0, 0.0, 1.0);
        var up = new Vec3D(System.Math.Sin(bankRad), System.Math.Cos(bankRad), 0.0);
        var right = up.Cross(forward);
        return new RawState(new Vec3D(0.0, 3000.0, 0.0),
            forward * (375.0 * MpsPerKnot), bankRad, FlightModel.Sabre.MassKg,
            QuaternionD.FromFrame(right, up, forward), default);
    }

    [Theory]
    [InlineData(85.0)]
    [InlineData(-85.0)]
    public void FullBackstickRollNearVerticalKeepsCommandedBodyDirection(double gammaDeg) {
        var a = new FightRig(375, gammaDeg: gammaDeg);
        var b = new FightRig(375, gammaDeg: gammaDeg);
        a.Set(GKey.PullUp, true);
        a.Set(GKey.RollRight, true);
        b.Set(GKey.PullUp, true);
        b.Set(GKey.RollRight, true);
        double bodyRoll = 0.0, peakPositiveP = 0.0;
        int opposingFrames = 0;

        for (int i = 0; i < 360; i++) {
            a.Step();
            b.Step();
            double p = a.Sim.State.BodyRates.P;
            bodyRoll += p * Dt;
            peakPositiveP = System.Math.Max(peakPositiveP, p);
            if (i >= 12 && p < -0.02) opposingFrames++;
        }

        Assert.True(bodyRoll > 1.5,
            $"{gammaDeg:+0;-0} deg flight path rolled {bodyRoll * Deg:F1} deg opposite/right-insufficient");
        Assert.True(peakPositiveP * Deg > 90.0,
            $"{gammaDeg:+0;-0} deg flight path only reached {peakPositiveP * Deg:F1} deg/s commanded p");
        Assert.True(opposingFrames <= 2,
            $"{gammaDeg:+0;-0} deg flight path produced {opposingFrames} frames opposing right roll");
        Assert.Equal(a.Sim.State, b.Sim.State);
        Assert.Equal(a.Sim.AngleOfAttackRad, b.Sim.AngleOfAttackRad);
    }

    [Fact]
    public void HardPullPinsAeroLimitWithoutDepartureOrRateSpike() {
        var rig = new FightRig(375, 90);
        rig.Set(GKey.PullUp, true);
        double maxAbsAoaDeg = 0.0, maxAbsPitchRateDeg = 0.0;
        for (int i = 0; i < 720; i++) {
            rig.Step();
            maxAbsAoaDeg = System.Math.Max(maxAbsAoaDeg,
                System.Math.Abs(rig.Sim.AngleOfAttackRad) * Deg);
            maxAbsPitchRateDeg = System.Math.Max(maxAbsPitchRateDeg,
                System.Math.Abs(rig.Sim.State.BodyRates.Q) * Deg);
        }

        Assert.True(maxAbsAoaDeg < 18.0,
            $"hard pull departed to {maxAbsAoaDeg:F1} deg AoA");
        Assert.True(maxAbsPitchRateDeg < 40.0,
            $"pitch rate spiked to {maxAbsPitchRateDeg:F1} deg/s");
    }

    [Fact]
    public void ProtectedPullStaysNearTheBreakWhileOverridePushCanCrossIt() {
        var pull = new FightRig(375, gammaDeg: 85.0);
        var push = new FightRig(180, gammaDeg: -85.0);
        pull.Set(GKey.PullUp, true);
        push.Set(GKey.PushDown, true);
        push.Set(GKey.Override, true);
        double maxAlpha = double.NegativeInfinity;
        double minAlpha = double.PositiveInfinity;
        double maxNz = double.NegativeInfinity;

        for (int i = 0; i < 720; i++) {
            pull.Step();
            push.Step();
            maxAlpha = System.Math.Max(maxAlpha, pull.Sim.AngleOfAttackRad);
            minAlpha = System.Math.Min(minAlpha, push.Sim.AngleOfAttackRad);
            maxNz = System.Math.Max(maxNz, pull.Sim.LastNz);
        }

        double alphaMax = FlightModel.Sabre.CLMax / FlightModel.Sabre.CLAlpha;
        double alphaMin = FlightModel.Sabre.CLMin / FlightModel.Sabre.CLAlpha;
        Assert.True(maxAlpha <= alphaMax + 0.03,
            $"protected pull wandered beyond the break: {maxAlpha * Deg:F2} deg");
        Assert.True(minAlpha < alphaMin - 0.03,
            $"override push was still projected onto the negative break: {minAlpha * Deg:F2} deg");
        Assert.True(minAlpha > -0.9,
            $"override push diverged instead of following separated flow: {minAlpha * Deg:F2} deg");
        Assert.True(maxAlpha >= alphaMax - 0.01,
            $"hard pull lost authority: only {maxAlpha * Deg:F2} of {alphaMax * Deg:F2} deg alpha");
        Assert.True(minAlpha <= alphaMin + 0.01,
            $"override push did not reach the negative aero boundary: {minAlpha * Deg:F2} deg");
        Assert.True(maxNz > 6.5, $"bounded pull no longer reaches the Sabre limit: {maxNz:F2} G");
    }
}

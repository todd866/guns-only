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

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

        public FightRig(double knots, double bankDeg = 0.0) {
            var initial = new AircraftState(new Vec3D(0, 3000, 0), knots * MpsPerKnot,
                0, 0, bankDeg / Deg, FlightModel.Sabre.MassKg);
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
    public void FullBackstickAtNinetyDegreesBankProducesAeroLimitG() {
        // Regression for BUILD 29: finite CommandedPitchRad bypassed GDemand, while the uninitialised
        // bank target simultaneously dragged an already-banked jet toward wings level.
        var rig = new FightRig(375, 90);
        double initialAeroLimit = FlightModel.NzAeroMax(rig.Sim.State, FlightModel.Sabre);
        rig.Set(GKey.PullUp, true);
        double maxNz = 0.0;

        for (int i = 0; i < 120; i++) {
            rig.Step();
            maxNz = System.Math.Max(maxNz, rig.Sim.LastNz);
        }

        Assert.True(maxNz >= 0.90 * initialAeroLimit,
            $"90-deg-bank full pull only made {maxNz:F2} G of {initialAeroLimit:F2} available");
        Assert.True(rig.Sim.LastNz > 6.4, $"G meter still reads only {rig.Sim.LastNz:F2} G");
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

        Assert.InRange(cornerPeak, 6.5, 7.3);
        Assert.InRange(sustained.Sim.LastNz, 4.9, 5.8);
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
}

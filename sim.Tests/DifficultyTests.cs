using System;
using System.Linq;
using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class DifficultyTests {
    const double Dt = 1.0 / 120.0;

    static Carrier Ship() => new(
        new Vec3D(0, 20, 0), headingRad: 0.0, speedMps: 3.0,
        deckAltM: 20.0, deckLengthM: 250.0, deckWidthM: 30.0);

    static AircraftState Contact(
        Carrier ship, double speedMps = 70.0, double gammaRad = -0.061,
        double crossM = 0.0) {
        var airState = new AircraftState(
            ship.LandingPoint(ship.WireAlongM(3) + Carrier.HookToMainGearM, crossM),
            speedMps, gammaRad, ship.LandingHeadingRad,
            Bank: 0.0, Mass: FlightModel.Sabre.MassKg);
        return ship.ToWorldStateFromAir(airState, DetentLayer.OnSpeedAoARad);
    }

    [Fact]
    public void LevelZeroIsExactBaselineAndStillTraps() {
        var baseline = DifficultyModel.ForLevel(0);
        Assert.Equal(0, baseline.Level);
        Assert.Equal("CALM", baseline.Label);
        Assert.Equal(3.0, baseline.BurbleIntensityMps);
        Assert.Equal(1.8, baseline.BurbleSinkMps);
        Assert.Equal(0.0, baseline.DeckPitchAmplitudeRad);
        Assert.Equal(0.0, baseline.DeckHeaveAmplitudeM);

        var originalPath = Ship();
        var difficultyPath = Ship();
        difficultyPath.ApplyDifficulty(baseline);
        for (int i = 0; i < 360; i++) {
            originalPath.Step(Dt);
            difficultyPath.Step(Dt);
        }
        Assert.Equal(originalPath.Position, difficultyPath.Position);
        Assert.Equal(0.0, difficultyPath.DeckPitchRad);
        Assert.Equal(0.0, difficultyPath.DeckHeaveM);

        // The carrier-physics window now applies even on the calm first pass: merely crossing the
        // contact plane is not a trap. Difficulty still layers its narrower earned window on top.
        var poorButPhysicalContact = Contact(difficultyPath,
            speedMps: 110.0, gammaRad: -0.18, crossM: 14.0);
        Assert.NotEqual(Carrier.Recovery.Trap, difficultyPath.Classify(poorButPhysicalContact));
        Assert.NotEqual(Carrier.Recovery.Trap,
            difficultyPath.Classify(poorButPhysicalContact, baseline));
    }

    [Fact]
    public void CleanTrapCounterPersistsAcrossNextAttempt() {
        var progress = new RecoveryProgress();
        var first = progress.BeginAttempt();
        Assert.Equal(0, first.Level);

        // WebBridge invokes this once, and only once, on the ARRESTED -> STOPPED transition.
        progress.RecordCleanTrap();
        Assert.Equal(1, progress.CleanTrapCount);
        Assert.Equal(1, progress.CleanStreak);

        var restarted = progress.BeginAttempt();
        Assert.Equal(1, progress.CleanTrapCount);
        Assert.Equal(1, progress.CleanStreak);
        Assert.Equal(1, restarted.SkillBaselineLevel);
        Assert.Equal(1, restarted.AttemptIndex);
    }

    [Fact]
    public void WeatherSequenceIsDeterministicNonMonotonicAndChangesEveryPass() {
        var firstRun = Enumerable.Range(0, 16)
            .Select(i => DifficultyModel.ForAttempt(7, 0, 0, i)).ToArray();
        var replay = Enumerable.Range(0, 16)
            .Select(i => DifficultyModel.ForAttempt(7, 0, 0, i)).ToArray();

        for (int i = 0; i < firstRun.Length; i++) {
            Assert.Equal(firstRun[i].Level, replay[i].Level);
            Assert.Equal(firstRun[i].Variation, replay[i].Variation);
            Assert.Equal(firstRun[i].TurbulenceSeed, replay[i].TurbulenceSeed);
        }

        Assert.Contains(true, firstRun.Zip(firstRun.Skip(1), (a, b) => b.Level > a.Level));
        Assert.Contains(true, firstRun.Zip(firstRun.Skip(1), (a, b) => b.Level < a.Level));
        Assert.All(firstRun.Zip(firstRun.Skip(1)), pair =>
            Assert.NotEqual(pair.First.TurbulenceSeed, pair.Second.TurbulenceSeed));
    }

    [Fact]
    public void SetbackEasesNextPassAndCleanStreakCanSpike() {
        var ordinary = DifficultyModel.ForAttempt(
            cleanTrapCount: 7, cleanStreak: 0, recentSetbacks: 0, attemptIndex: 3);
        var afterTwoSetbacks = DifficultyModel.ForAttempt(
            cleanTrapCount: 7, cleanStreak: 0, recentSetbacks: 2, attemptIndex: 3);
        Assert.True(afterTwoSetbacks.IsEased);
        Assert.True(afterTwoSetbacks.Level < ordinary.Level);
        Assert.True(afterTwoSetbacks.Level >= afterTwoSetbacks.FloorLevel);

        var withoutStreak = DifficultyModel.ForAttempt(
            cleanTrapCount: 5, cleanStreak: 2, recentSetbacks: 0, attemptIndex: 4);
        var streakSpike = DifficultyModel.ForAttempt(
            cleanTrapCount: 5, cleanStreak: 3, recentSetbacks: 0, attemptIndex: 4);
        Assert.True(streakSpike.IsSpike);
        Assert.True(streakSpike.Level > withoutStreak.Level);
        Assert.True(streakSpike.Level <= DifficultyModel.MaxLevel);
    }

    [Fact]
    public void EveryConditionStaysInsideWinnableBandAndEarnedFloor() {
        for (int traps = 0; traps <= 30; traps++) {
            for (int streak = 0; streak <= 9; streak++) {
                for (int setbacks = 0; setbacks <= 3; setbacks++) {
                    for (int attempt = 0; attempt < 24; attempt++) {
                        var d = DifficultyModel.ForAttempt(traps, streak, setbacks, attempt);
                        Assert.InRange(d.Level, 0, DifficultyModel.MaxLevel);
                        Assert.True(d.Level >= d.FloorLevel);
                        Assert.True(d.DeckPitchAmplitudeRad <= 1.25 * Math.PI / 180.0);
                        Assert.True(d.DeckHeaveAmplitudeM <= 0.80);
                        Assert.True(d.MaxTrapSinkMps >= 5.4);
                        Assert.True(d.MaxTrapLineupErrorM >= 8.0);
                        Assert.InRange(70.0, d.MinTrapSpeedMps, d.MaxTrapSpeedMps);
                    }
                }
            }
        }

        var baselines = Enumerable.Range(0, 16)
            .Select(traps => DifficultyModel.ForAttempt(traps, 0, 0, 2).SkillBaselineLevel)
            .ToArray();
        Assert.True(baselines.Zip(baselines.Skip(1), (a, b) => b >= a).All(x => x));
        Assert.Equal(DifficultyModel.MaxLevel, baselines[^1]);
    }

    [Fact]
    public void EarnedTrapGateUsesSinkLineupAndOnSpeedWindows() {
        var ship = Ship();
        var rough = DifficultyModel.ForLevel(DifficultyModel.MaxLevel);
        ship.ApplyDifficulty(rough);

        Assert.Equal(Carrier.Recovery.Trap,
            ship.Classify(Contact(ship), rough));
        Assert.Equal(Carrier.Recovery.HardLanding,
            ship.Classify(Contact(ship, gammaRad: -0.15), rough));
        Assert.Equal(Carrier.Recovery.Bolter,
            ship.Classify(Contact(ship, crossM: 10.0), rough));
        Assert.Equal(Carrier.Recovery.Bolter,
            ship.Classify(Contact(ship, speedMps: 60.0), rough));
    }

    [Fact]
    public void DeckMotionIsDeterministicFunctionOfTimeAndDifficulty() {
        var difficulty = DifficultyModel.ForLevel(4);
        var a = Ship();
        var b = Ship();
        a.ApplyDifficulty(difficulty);
        b.ApplyDifficulty(difficulty);

        for (int i = 0; i < 277; i++) {
            a.Step(Dt);
            b.Step(Dt);
            Assert.Equal(a.DeckPitchRad, b.DeckPitchRad);
            Assert.Equal(a.DeckHeaveM, b.DeckHeaveM);
        }

        Assert.NotEqual(0.0, a.DeckPitchRad);
        Assert.NotEqual(0.0, a.DeckHeaveM);
        Assert.InRange(Math.Abs(a.DeckPitchRad), 0.0, difficulty.DeckPitchAmplitudeRad);
        Assert.InRange(Math.Abs(a.DeckHeaveM), 0.0, difficulty.DeckHeaveAmplitudeM);

        var baseline = Ship();
        baseline.ApplyDifficulty(DifficultyModel.ForLevel(0));
        for (int i = 0; i < 277; i++) baseline.Step(Dt);
        Assert.Equal(0.0, baseline.DeckPitchRad);
        Assert.Equal(0.0, baseline.DeckHeaveM);
    }
}

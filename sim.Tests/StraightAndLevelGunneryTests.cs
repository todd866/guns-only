using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The easiest gun solution in the game, and the one the owner named directly: a target that flies
/// straight and level. It is not a BFM problem — the target never manoeuvres, so the lead solution
/// is exact and closed-form, and any bandit that cannot convert it cannot convert anything.
///
/// Owner, 2026-08-02, flying Build 242: "AI takes a *long* time to kill me when I'm flying
/// straight and level, should be a lot more efficient at that" and "I want AI to reliably shoot a
/// straight and level adversary".
///
/// The production funnel (GunConversionFunnelTests) measures a neutral merge, where the target
/// manoeuvres and the bandit's failure is entangled with BFM quality. This isolates tracking.
public sealed class StraightAndLevelGunneryTests {
    const double Dt = 1.0 / 120.0;

    readonly ITestOutputHelper _output;

    public StraightAndLevelGunneryTests(ITestOutputHelper output) => _output = output;

    /// The target holds heading, altitude and speed for the whole run — it is a flying barn door.
    /// The bandit starts in a firing position behind it. Everything the bandit needs is given.
    static (int Rounds, int Hits, double MedianLeadErrorDeg, double SecondsToFirstHit)
        Measure(PilotSkill tier, double seconds = 90.0) {
        AircraftParams targetAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams banditAir = FlightModel.Su27SPublicDataSurrogate;

        // Straight, level, co-speed, bandit 500 m astern — inside the 120-900 m gun envelope.
        var targetState = new AircraftState(
            new Vec3D(0.0, 3000.0, 0.0), 235.0, 0.0, 0.0, 0.0, targetAir.MassKg);
        var banditStart = new AircraftState(
            new Vec3D(0.0, 3000.0, -500.0), 235.0, 0.0, 0.0, 0.0, banditAir.MassKg);

        var bandit = new ReactiveBandit(banditStart, banditAir, tier);
        CombatConfig combat = CombatConfig.ModernVisualMerge;
        var banditGun = new GunKill(
            combat.OpponentAmmo, combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);

        var leadErrors = new System.Collections.Generic.List<double>();
        double secondsToFirstHit = double.NaN;
        int previousHits = 0;
        int ticks = (int)Math.Ceiling(seconds / Dt);

        for (int tick = 0; tick < ticks; tick++) {
            // The target is FROZEN in level flight: same position advance every tick, no turn,
            // no climb, no speed change. This is deliberately not an AI-flown aircraft — an
            // evading target would reintroduce the BFM variable this test exists to remove.
            targetState = targetState with {
                Position = targetState.Position
                    + targetState.ForwardDir() * (targetState.Speed * Dt),
            };

            ActorObservation targetObservation = ActorObservation.Capture(targetState, tick);
            AircraftState banditState = bandit.State;

            double rangeM = Geometry.Range(banditState, targetState);
            if (rangeM >= BanditFireControl.MinimumRangeM
                && rangeM <= BanditFireControl.MaximumRangeM) {
                leadErrors.Add(
                    BanditFireControl.LeadNoseErrorRad(banditState, targetObservation)
                    * 180.0 / Math.PI);
            }

            bool trigger = banditGun.TargetAlive && bandit.WantsToFire(targetObservation);
            banditGun.Step(trigger, banditState, targetState, Dt);
            if (banditGun.HitCount > previousHits && double.IsNaN(secondsToFirstHit)) {
                secondsToFirstHit = tick * Dt;
            }
            previousHits = banditGun.HitCount;
            if (banditGun.Outcome == FightOutcome.Splash) break;

            bandit.Step(targetObservation, Dt);
        }

        leadErrors.Sort();
        double median = leadErrors.Count == 0
            ? double.NaN
            : leadErrors[leadErrors.Count / 2];
        return (banditGun.RoundsFired, banditGun.HitCount, median, secondsToFirstHit);
    }

    [Fact]
    public void ReportStraightAndLevelConversionPerTier() {
        foreach (PilotSkill tier in new[] {
            PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran, PilotSkill.Ace,
        }) {
            var r = Measure(tier);
            _output.WriteLine(
                $"{tier,-9} rounds={r.Rounds,4} hits={r.Hits,3} "
                + $"h/r={(r.Rounds > 0 ? (double)r.Hits / r.Rounds : 0.0),6:P1}  "
                + $"leadErr med={r.MedianLeadErrorDeg,6:F1}deg  "
                + $"firstHit={(double.IsNaN(r.SecondsToFirstHit) ? "never" : r.SecondsToFirstHit.ToString("F1") + "s")}");
        }
    }

    /// The contract the owner asked for. A bandit given ninety seconds directly behind a target
    /// that never manoeuvres must actually hit it. This is deliberately a low bar: it does not ask
    /// for a kill, a hit rate, or a time limit — only that the easiest shot in the game converts
    /// at all. It failed for every tier before the tracking work.
    [Theory]
    [InlineData(PilotSkill.Veteran)]
    [InlineData(PilotSkill.Ace)]
    public void ABanditBehindANonManoeuvringTargetLandsHits(PilotSkill tier) {
        var r = Measure(tier);
        Assert.True(r.Hits > 0,
            $"{tier} fired {r.Rounds} rounds at a straight-and-level target over 90 s and hit "
            + $"it {r.Hits} times (median lead error {r.MedianLeadErrorDeg:F1} deg)");
    }
}

using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Outcome of a headless basic-fighter-manoeuvres duel. *SolutionSeconds accumulate the time each
/// side held a valid gun window on the other (CameraSolver.GunWindow) — the yardstick for whether
/// one pilot out-fights another. This is a test-only harness; it drives two IBandit-backed fighters
/// against each other on the same deterministic time sample.
///
/// DECISIVE-BURST WIN RULE (the win-latch definition -- FROZEN once used for tuning probes):
///   Track, per side, the CURRENT continuous gun-window duration: reset to 0 on any tick that side
///   lacks the window, add Dt on any tick it holds it. A side "wins by burst" the first tick its
///   current continuous window reaches >= BanditFireControl.BurstSeconds (0.35 s). This is
///   first-to-latch: the outcome is decided on that first crossing and never revised, even though
///   the flight continues so the *SolutionSeconds/*Max fields cover the full duration. If BOTH sides
///   first cross on the SAME tick (neither had latched), it is a DRAW (both WonByBurst false). If
///   neither side reaches the threshold within the flight time, it is a DRAW (both false).
public readonly record struct BfmDuelResult(
    double ASolutionSeconds, double BSolutionSeconds, double MinRangeM,
    double AExitSpeedMps, double BExitSpeedMps,
    bool AWonByBurst, bool BWonByBurst,
    double AMaxContinuousWindowSeconds, double BMaxContinuousWindowSeconds);

public static class BfmDuel {
    const double Dt = 1.0 / AircraftSim.TickHz;

    /// Continuous gun-window threshold that decides a decisive-burst win. Equal to the bandit fire
    /// control's natural burst length: a sustained window this long is the kill proxy.
    public const double BurstSeconds = BanditFireControl.BurstSeconds;

    public static BfmDuelResult Fly(ReactiveBandit a, ReactiveBandit b, double seconds) {
        double aSol = 0.0, bSol = 0.0, minRange = double.PositiveInfinity;
        double aCont = 0.0, bCont = 0.0, aMaxCont = 0.0, bMaxCont = 0.0;
        bool decided = false, aWon = false, bWon = false;
        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            // Both fighters read the other's beginning-of-tick state, then advance on the same sample.
            var aState = a.State;
            var bState = b.State;
            a.Step(bState, Dt);
            b.Step(aState, Dt);

            bool aWindow = CameraSolver.GunWindow(a.State, b.State);
            bool bWindow = CameraSolver.GunWindow(b.State, a.State);
            if (aWindow) aSol += Dt;
            if (bWindow) bSol += Dt;

            // Current continuous window per side: accumulate while held, reset the moment it drops.
            aCont = aWindow ? aCont + Dt : 0.0;
            bCont = bWindow ? bCont + Dt : 0.0;
            if (aCont > aMaxCont) aMaxCont = aCont;
            if (bCont > bMaxCont) bMaxCont = bCont;

            // First-to-latch decisive-burst outcome. A simultaneous first crossing is a draw.
            if (!decided) {
                bool aReached = aCont >= BurstSeconds;
                bool bReached = bCont >= BurstSeconds;
                if (aReached && bReached) { decided = true; }          // simultaneous -> draw
                else if (aReached) { decided = true; aWon = true; }
                else if (bReached) { decided = true; bWon = true; }
            }

            double range = Geometry.Range(a.State, b.State);
            if (range < minRange) minRange = range;
        }
        return new BfmDuelResult(aSol, bSol, minRange, a.State.Speed, b.State.Speed,
            aWon, bWon, aMaxCont, bMaxCont);
    }

    /// FROZEN tuning instrument: the reference player against which enemy tiers are probed. Its tier
    /// and the win-latch definition above must NOT drift once used to produce a win% matrix -- the
    /// whole point is a stable yardstick, so a later curve change is measured against the same ruler.
    /// Default tier Veteran models a competent-but-not-superhuman human stand-in.
    public static ReactiveBandit ReferencePlayer(in AircraftState start, AircraftParams parameters,
        PilotSkill tier = PilotSkill.Veteran) =>
        new ReactiveBandit(start, parameters, tier);

    /// Aggregate outcome of a deterministic seeded sweep of reference-vs-enemy merges.
    /// WinRate is the decisive-burst outcome (first-to-latch; symmetric merges draw). The
    /// Mean*MaxContinuousWindowSeconds are the finer-grained discriminator: how long each side can
    /// SUSTAIN a tracking gun solution -- this separates tiers even when the burst-latch ties.
    public readonly record struct SweepResult(
        int Merges, double ReferenceWinRate, double EnemyWinRate, double DrawRate,
        double MeanReferenceSolutionSeconds, double MeanEnemySolutionSeconds,
        double MeanReferenceMaxContinuousSeconds, double MeanEnemyMaxContinuousSeconds);

    /// Deterministic win% sweep for one (referenceTier, enemyTier) pair. Flies `merges` seeded
    /// engagements: geometry varies ONLY by SpawnForMerge's engagement number (no RNG, wall clock, or
    /// date). The reference is the fixed frozen player; the enemy is spawned into a fair offset merge
    /// at the given tier. Reference "wins" a merge when the reference side wins by burst and the enemy
    /// does not. Returns the reference win-rate plus mean gun-solution seconds for each side.
    public static SweepResult Sweep(PilotSkill referenceTier, PilotSkill enemyTier,
        AircraftParams parameters, int merges = 24, double seconds = 40.0,
        double referenceSpeedMps = 220.0, double enemySpeedMps = 200.0) {
        // Fixed player anchor: SpawnForMerge positions the enemy relative to this state, so varying the
        // engagement number is what varies the geometry deterministically.
        var playerStart = new AircraftState(new Vec3D(0.0, 3000.0, 0.0),
            referenceSpeedMps, 0.0, 0.0, 0.0, parameters.MassKg);

        int refWins = 0, enemyWins = 0, draws = 0;
        double refSolSum = 0.0, enemySolSum = 0.0, refMaxSum = 0.0, enemyMaxSum = 0.0;
        for (int e = 1; e <= merges; e++) {
            var reference = ReferencePlayer(playerStart, parameters, referenceTier);
            var enemy = ReactiveBandit.SpawnForMerge(playerStart, parameters, e, enemySpeedMps, enemyTier);
            var r = Fly(reference, enemy, seconds);
            refSolSum += r.ASolutionSeconds;
            enemySolSum += r.BSolutionSeconds;
            refMaxSum += r.AMaxContinuousWindowSeconds;
            enemyMaxSum += r.BMaxContinuousWindowSeconds;
            if (r.AWonByBurst && !r.BWonByBurst) refWins++;
            else if (r.BWonByBurst && !r.AWonByBurst) enemyWins++;
            else draws++;
        }
        return new SweepResult(merges,
            (double)refWins / merges, (double)enemyWins / merges, (double)draws / merges,
            refSolSum / merges, enemySolSum / merges,
            refMaxSum / merges, enemyMaxSum / merges);
    }
}

using System.Collections.Concurrent;
using System.Text;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// Deterministic win% instrument for tuning the enemy skill-escalation curve with DATA. It flies the
/// FROZEN reference player (BfmDuel.ReferencePlayer) against seeded enemy merges at each tier.
///
/// KEY EMPIRICAL FINDING (see ExposeWinRateMatrix output): under the spec'd first-to-latch
/// decisive-burst rule, every self-play merge is a DRAW. SpawnForMerge stages a symmetric head-on
/// reciprocal merge, so on the pass BOTH fighters get nose-on and cross the 0.35 s continuous-window
/// latch on the SAME tick -- a mutual burst, i.e. a mutual kill, which is a draw by definition. The
/// win% column is therefore degenerate for symmetric self-play. The DISCRIMINATING signal that DOES
/// escalate cleanly with enemy tier is the per-side MAX-CONTINUOUS gun-window (a required BfmDuel
/// field) and solution-seconds: how long a side can SUSTAIN a tracking solution after the merge.
///
/// CAVEATS: AI-vs-AI self-play under perfect information, no human reaction lag, and SpawnForMerge
/// yields only 3 distinct merge geometries (cycled). Valid for RELATIVE tier tuning, NOT a
/// human-win% oracle.
public class AiThreatTests {
    readonly ITestOutputHelper _output;
    public AiThreatTests(ITestOutputHelper output) => _output = output;

    static readonly AircraftParams Air = FlightModel.F22APublicDataSurrogate;
    const int Merges = 24;
    const double Seconds = 40.0;

    static readonly PilotSkill[] EnemyTiers =
        { PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran, PilotSkill.Ace };
    static readonly PilotSkill[] ReferenceTiers =
        { PilotSkill.Competent, PilotSkill.Veteran };

    // Each (referenceTier, enemyTier) cell is heavy (two lookahead pilots x 24 merges x 40 s). Memoize
    // so the three tests share one computation of each cell rather than recomputing it.
    static readonly ConcurrentDictionary<(PilotSkill, PilotSkill), BfmDuel.SweepResult> Cache = new();
    static BfmDuel.SweepResult Run(PilotSkill referenceTier, PilotSkill enemyTier) =>
        Cache.GetOrAdd((referenceTier, enemyTier),
            k => BfmDuel.Sweep(k.Item1, k.Item2, Air, Merges, Seconds));

    // The whole point: the AI genuinely shoots at the player. A Veteran enemy AND an Ace enemy each
    // accrue enemy-side gun-solution seconds > 0 against the reference over the seeded set.
    [Fact]
    public void VeteranAndAceEnemiesGenuinelyThreatenTheReference() {
        foreach (var enemyTier in new[] { PilotSkill.Veteran, PilotSkill.Ace }) {
            var r = Run(PilotSkill.Veteran, enemyTier);
            _output.WriteLine($"reference=Veteran enemy={enemyTier}: " +
                $"meanEnemySol={r.MeanEnemySolutionSeconds:F2}s meanEnemyMaxWindow={r.MeanEnemyMaxContinuousSeconds:F2}s " +
                $"meanRefSol={r.MeanReferenceSolutionSeconds:F2}s refWin={r.ReferenceWinRate:P0} enemyWin={r.EnemyWinRate:P0}");
            Assert.True(r.MeanEnemySolutionSeconds > 0.0,
                $"{enemyTier} enemy must accrue solution seconds against the reference: " +
                $"{r.MeanEnemySolutionSeconds:F3}s");
        }
    }

    // Difficulty should be monotonic-ish: harder tiers are harder. The spec's headline metric is the
    // reference's win-rate vs Novice >= vs Ace; because self-play merges all draw, that holds
    // trivially (0 >= 0). The REAL, non-degenerate difficulty signal is the enemy's sustained
    // tracking time, which MUST rise (within tolerance) from Novice to Ace -- that is the enemy
    // getting genuinely harder. We do NOT force it: a real inversion beyond tolerance fails and is
    // reported, rather than being masked.
    [Fact]
    public void HarderTiersAreHarderForTheReference() {
        const double winTol = 0.10;   // absorb seeded-geometry noise on the (degenerate) win-rate
        const double threatTol = 0.20; // seconds of enemy tracking-time slack between adjacent tiers

        foreach (var referenceTier in ReferenceTiers) {
            var vsNovice = Run(referenceTier, PilotSkill.Novice);
            var vsAce = Run(referenceTier, PilotSkill.Ace);
            // Spec-faithful (degenerate) headline check.
            Assert.True(vsNovice.ReferenceWinRate >= vsAce.ReferenceWinRate - winTol,
                $"reference={referenceTier} non-monotonic win-rate: vs Novice " +
                $"{vsNovice.ReferenceWinRate:P0} < vs Ace {vsAce.ReferenceWinRate:P0} (tol {winTol:P0})");
        }

        // The meaningful check: enemy sustained tracking time is monotonic non-decreasing across the
        // tier ladder against the frozen reference (Veteran), so the ladder genuinely escalates.
        double prev = double.NegativeInfinity;
        var sb = new StringBuilder("enemy sustained-threat ladder (reference=Veteran), mean enemy max-continuous window:\n");
        foreach (var enemyTier in EnemyTiers) {
            var r = Run(PilotSkill.Veteran, enemyTier);
            double threat = r.MeanEnemyMaxContinuousSeconds;
            sb.AppendLine($"  enemy={enemyTier,-9} enemyMaxWindow={threat:F2}s enemySol={r.MeanEnemySolutionSeconds:F2}s");
            Assert.True(threat >= prev - threatTol,
                $"enemy threat not monotonic at {enemyTier}: {threat:F2}s < previous {prev:F2}s (tol {threatTol:F2}s)");
            prev = threat;
        }
        _output.WriteLine(sb.ToString());
    }

    // The deliverable: the full win% matrix, referenceTier x enemyTier, plus the discriminating
    // sustained-tracking data. Exposed via test output.
    [Fact]
    public void ExposeWinRateMatrix() {
        var cells = new BfmDuel.SweepResult[ReferenceTiers.Length, EnemyTiers.Length];
        for (int i = 0; i < ReferenceTiers.Length; i++)
            for (int j = 0; j < EnemyTiers.Length; j++)
                cells[i, j] = Run(ReferenceTiers[i], EnemyTiers[j]);

        var sb = new StringBuilder();
        sb.AppendLine($"Decisive-burst win% matrix ({Merges} seeded merges x {Seconds:F0}s, " +
            $"first-to-latch >= {BfmDuel.BurstSeconds:F2}s continuous). Cell = reference win-rate.");
        sb.Append("reference\\enemy".PadRight(18));
        foreach (var enemy in EnemyTiers) sb.Append(enemy.ToString().PadLeft(11));
        sb.AppendLine();
        for (int i = 0; i < ReferenceTiers.Length; i++) {
            sb.Append(ReferenceTiers[i].ToString().PadRight(18));
            for (int j = 0; j < EnemyTiers.Length; j++)
                sb.Append($"{cells[i, j].ReferenceWinRate:P0}".PadLeft(11));
            sb.AppendLine();
        }

        sb.AppendLine();
        sb.AppendLine("Per-cell detail: refWin/enemyWin/draw ; meanRefSol/meanEnemySol s ; " +
            "meanRefMaxWindow/meanEnemyMaxWindow s");
        for (int i = 0; i < ReferenceTiers.Length; i++)
            for (int j = 0; j < EnemyTiers.Length; j++) {
                var r = cells[i, j];
                sb.AppendLine($"  ref={ReferenceTiers[i],-9} enemy={EnemyTiers[j],-9} " +
                    $"{r.ReferenceWinRate:P0}/{r.EnemyWinRate:P0}/{r.DrawRate:P0} ; " +
                    $"{r.MeanReferenceSolutionSeconds:F2}/{r.MeanEnemySolutionSeconds:F2} ; " +
                    $"{r.MeanReferenceMaxContinuousSeconds:F2}/{r.MeanEnemyMaxContinuousSeconds:F2}");
            }
        sb.AppendLine();
        sb.AppendLine("NOTE: win% is all-draw because symmetric self-play merges flash-latch mutually. " +
            "The escalation signal is the enemy max-continuous window (rightmost).");
        _output.WriteLine(sb.ToString());

        for (int i = 0; i < ReferenceTiers.Length; i++)
            for (int j = 0; j < EnemyTiers.Length; j++) {
                Assert.InRange(cells[i, j].ReferenceWinRate, 0.0, 1.0);
                Assert.Equal(Merges, cells[i, j].Merges);
            }
    }
}

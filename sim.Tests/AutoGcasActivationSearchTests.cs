using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Drives <see cref="AutoGcasActivationSearch"/> over its corner-case grid, prints the activation
/// map, and pins two things the "GCAS fires way too early" reports need separated:
///
/// 1. Predictor honesty (a hard invariant, enforced): a fly-up must never fire while an immediate
///    12 G recovery would still clear the ground by a comfortable margin. If it does, the predictor
///    is calling a recoverable state unrecoverable — the real "too early" bug.
///
/// 2. Classification sensitivity (reported, not asserted): activations that fire only because the
///    pilot was scored PASSIVE (hands-off / greying-out) and would NOT have fired for an attentive
///    pilot. These are legitimate backstops IF the passive score is right — so this list is where a
///    misclassified active pilot (the video: pulling to the structural limit while greying out)
///    turns into a felt false fly-up. The fix for those lives in the session's activity gate, not
///    in the predictor.
/// </summary>
public class AutoGcasActivationSearchTests {
    readonly ITestOutputHelper _output;
    public AutoGcasActivationSearchTests(ITestOutputHelper output) => _output = output;

    // A 12 G recovery from any attitude in this envelope loses at most ~1.5 km. Firing while the
    // recovery still has more clearance than that is the predictor mis-calling a recoverable state.
    const double ComfortableRecoveryMarginM = 1_000.0;

    static string Row(AutoGcasActivationSearch.Sample s) {
        var c = s.Scenario;
        return $"{c.AglM,5:F0} {c.SpeedMps,4:F0} {c.GammaDeg,5:F0} {c.BankDeg,5:F0} " +
            $"{c.RollRateDegPerSec,5:F0} {c.PilotGDemand,5:F1} {c.PilotActivelyFlying,5} | " +
            $"{s.Phase,-7} tAvail={s.TimeAvailableS,6:F2} immRecMin={s.ImmediateRecoveryClearanceM,7:F0}";
    }

    [Fact]
    public void PredictorNeverFiresWhenAnImmediateRecoveryWouldClearComfortably() {
        List<AutoGcasActivationSearch.Sample> samples =
            AutoGcasActivationSearch.Sweep(AutoGcasActivationSearch.DefaultGrid()).ToList();

        var falseSaves = samples
            .Where(s => s.Activated
                && s.ImmediateRecoveryClearanceM > ComfortableRecoveryMarginM)
            .OrderByDescending(s => s.ImmediateRecoveryClearanceM)
            .ToList();

        _output.WriteLine($"scenarios={samples.Count} activated=" +
            $"{samples.Count(s => s.Activated)} " +
            $"falseSaves(immRecMin>{ComfortableRecoveryMarginM:F0})={falseSaves.Count}");
        foreach (var s in falseSaves.Take(40)) _output.WriteLine(Row(s));

        Assert.True(falseSaves.Count == 0,
            $"Auto-GCAS fired {falseSaves.Count} fly-up(s) while an immediate 12 G recovery would " +
            $"still clear by more than {ComfortableRecoveryMarginM:F0} m — the predictor is calling " +
            "recoverable states unrecoverable. See test output.");
    }

    [Fact]
    public void PassiveClassificationIsWhereTheFeltFalseFlyUpsLive() {
        // Same-scenario A/B: for every grid point, compare the attentive vs passive verdict. This
        // is diagnostic output, not an assertion — it shows how much of the activation envelope is
        // owned by the passive score, i.e. how much rides on the session getting the pilot-activity
        // classification right for a conscious pilot who is pulling hard.
        var grid = AutoGcasActivationSearch.DefaultGrid()
            .Where(s => s.PilotActivelyFlying)
            .ToList();
        int passiveOnly = 0, both = 0, neither = 0, attentiveOnly = 0;
        var samples = new List<(AutoGcasActivationSearch.Sample passive,
            AutoGcasActivationSearch.Sample attentive)>();
        foreach (var attentiveScenario in grid) {
            var passiveScenario = attentiveScenario with { PilotActivelyFlying = false };
            var a = AutoGcasActivationSearch.Evaluate(attentiveScenario);
            var p = AutoGcasActivationSearch.Evaluate(passiveScenario);
            if (p.Activated && a.Activated) both++;
            else if (p.Activated) { passiveOnly++; samples.Add((p, a)); }
            else if (a.Activated) attentiveOnly++;
            else neither++;
        }
        _output.WriteLine($"gridPoints={grid.Count} bothFire={both} " +
            $"passiveOnly={passiveOnly} attentiveOnly={attentiveOnly} neitherFire={neither}");
        _output.WriteLine("--- passive-only fires (attentive pilot would NOT get a fly-up here) ---");
        foreach (var (p, _) in samples
            .OrderByDescending(x => x.passive.Scenario.AglM).Take(30))
            _output.WriteLine(Row(p));

        // An attentive fire must always imply a passive fire (attentive defers strictly longer).
        Assert.Equal(0, attentiveOnly);
    }
}

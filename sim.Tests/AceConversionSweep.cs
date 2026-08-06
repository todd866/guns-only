using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Calibration sweep, not a contract — the values it selected are pinned by
/// <see cref="GunConversionContractTests"/>. It exists so the Ace's trigger cone and finisher
/// authority are CHOSEN from measurement rather than guessed, and so the next person retuning the
/// ladder can re-derive them instead of re-litigating them.
///
/// Two other levers were swept here and REFUTED; do not re-propose them without new evidence.
///   - Firing-range discipline (declining shots beyond 700/550/450/350/275 m): 24 cells, every one
///     at 0 hits and 0.0% on-solution. Pressing closer starved the trigger without improving the
///     angle, because the Ace's ballistic lead error was ~17 deg in EVERY range bucket.
///   - Retuning the closed-loop finisher's authority (9.0/5.5/4.0 G) with the body gate still in
///     place: 0 hits in every cell. The finisher cannot rescue a trigger that is being authorised
///     by the wrong gate.
///
/// The lever that worked was scoring and firing on the ballistic SOLUTION rather than on the
/// target's body — see BanditSkillProfile.FiresOnBodyGate.
/// </summary>
public class AceConversionSweep {
    readonly ITestOutputHelper _out;
    public AceConversionSweep(ITestOutputHelper output) => _out = output;

    [Fact(Skip = "Calibration sweep — run explicitly when retuning the ladder.")]
    public void SweepAceTriggerConeAndFinisherAuthority() {
        BanditSkillProfile ace = BanditSkillProfile.For(PilotSkill.Ace);
        double[] leadConesDeg = { 0.75, 1.25, 2.0 };
        double[] finisherG = { 0.0, 5.5 };   // 0.0 => finisher stays off
        foreach (double leadConeDeg in leadConesDeg) {
            foreach (double authority in finisherG) {
                BanditSkillProfile candidate = ace with {
                    LeadFireConeDeg = leadConeDeg,
                    FiresOnBodyGate = false,
                    FineTrackMaxG = authority > 0.0 ? 99.0 : 5.5,
                    FineTrackAuthorityG = authority,
                };
                GunConversionFunnelResult r =
                    GunConversionFunnel.MeasureEnemy(PilotSkill.Ace, enemyProfile: candidate);
                _out.WriteLine(
                    $"leadCone={leadConeDeg,4:F2}deg finisherG={authority,4:F1}  "
                    + $"trigger={r.TriggerSeconds,5:F2}s rounds={r.RoundsFired,4} "
                    + $"hits={r.Hits,3} h/r={r.HitsPerRound,6:P1} kills={r.Kills} "
                    + $"engagementsWithHits={r.EngagementsWithHits}/{r.Engagements}  "
                    + $"trigLead p10/med={r.TenthPercentileLeadErrorAtTriggerDeg,6:F2}/"
                    + $"{r.MedianLeadErrorAtTriggerDeg,7:F2}deg  "
                    + $"onSol={r.SolutionConversion,6:P1}");
            }
        }
    }
}

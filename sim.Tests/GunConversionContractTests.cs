using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Per-tier gun-conversion CONTRACT. These are the bands the ladder must stay inside, measured on
/// <see cref="GunConversionFunnel"/> over six deterministic offset-neutral merges against a frozen
/// Veteran reference pilot.
///
/// They exist because the Ace has now twice regressed to toothless without a single test going
/// red. Build 264's owner sortie was 13 minutes, 3 engagements, 6 kills, 0 deaths, and player
/// health never left 1.0 — the bandits fought and shot (8 tracer bursts, 18 rounds airborne, p50
/// firing range 786 m) and landed zero hits. Structural green proved nothing because nothing
/// asserted on conversion.
///
/// Doctrine these pin ([[difficulty-doctrine-sports-are-hard]], [[ladder-variety-doctrine]]):
///   - ACE must be able to kill the player. Hard to earn the six, trivial to convert it.
///   - The ladder must stay VARIED. Novice/Competent/Veteran must remain distinguishable from the
///     Ace and from each other; "every tier is lethal" is as much a failure as a toothless Ace.
///
/// Bands are deliberately wider than the measured values so honest BFM work can move the numbers,
/// but a tier that stops converting — or a mid-tier that starts converting like an Ace — fails.
/// </summary>
public class GunConversionContractTests {
    readonly ITestOutputHelper _out;
    public GunConversionContractTests(ITestOutputHelper output) => _out = output;

    const int Engagements = 6;

    static GunConversionFunnelResult Measure(PilotSkill tier) =>
        GunConversionFunnel.MeasureEnemy(tier, engagements: Engagements);

    /// THE HEADLINE CONTRACT. The Ace converts: it lands hits in a MAJORITY of engagements and
    /// wins some of them outright. Measured at the pinned calibration: 4/6 engagements with hits,
    /// 3 kills, 39 rounds for 11 hits (28%). Before the fix: 0/6, 0 kills, 147 rounds for 0 hits.
    [Fact]
    public void TheAceConvertsItsGunPositionIntoHitsAndKills() {
        GunConversionFunnelResult ace = Measure(PilotSkill.Ace);
        _out.WriteLine(ace.ToString());
        _out.WriteLine(ace.TriggerLine);

        Assert.True(ace.EngagementsWithHits * 2 > Engagements,
            $"ACE must land hits in a MAJORITY of engagements; got "
            + $"{ace.EngagementsWithHits}/{Engagements}. {ace.TriggerLine}");
        Assert.True(ace.Kills >= 2,
            $"ACE must be able to KILL the player (3 hits defeats a ship); got {ace.Kills} kills "
            + $"in {Engagements} engagements. {ace.TriggerLine}");
        Assert.True(ace.HitsPerRound >= 0.15,
            $"ACE gunnery must be efficient, not spray; got {ace.HitsPerRound:P1} hits/round. "
            + ace.TriggerLine);
    }

    /// THE CAUSE, PINNED. The Ace's rounds miss when its gun axis is not on the ballistic lead
    /// point at the moment the trigger is down. This asserts on the mechanism rather than the
    /// outcome, so a regression is diagnosable and not merely visible.
    [Fact]
    public void TheAceFiresAtTheBallisticSolutionRatherThanAtTheTarget() {
        GunConversionFunnelResult ace = Measure(PilotSkill.Ace);
        _out.WriteLine(ace.TriggerLine);

        Assert.True(ace.MedianLeadErrorAtTriggerDeg <= 2.0,
            $"ACE median ballistic lead error at the trigger must stay inside 2 deg (the shot "
            + $"needs ~0.56 deg at its median firing range); got "
            + $"{ace.MedianLeadErrorAtTriggerDeg:F2} deg. {ace.TriggerLine}");
        Assert.True(ace.SolutionConversion >= 0.20,
            $"At least a fifth of ACE trigger-down time must be ON SOLUTION — inside the angle "
            + $"the effective hit radius subtends at that range; got {ace.SolutionConversion:P1}. "
            + ace.TriggerLine);
        Assert.True(ace.LeadGateSeconds > 0.5,
            $"ACE must actually reach its own lead gate; got {ace.LeadGateSeconds:F2} s. "
            + "0.00 s here is the Build 264 failure exactly: a bandit firing 147 rounds on the "
            + "wide body gate with a solution it never once achieved.");
    }

    /// THE LADDER STAYS VARIED. A fix for the Ace that lifts the whole ladder is a different
    /// failure, not a success: the mid-ladder's job is tracer pressure and near misses, and the
    /// Novice's job is to be survivable.
    [Fact]
    public void TheLadderKeepsItsTiersDistinct() {
        GunConversionFunnelResult novice = Measure(PilotSkill.Novice);
        GunConversionFunnelResult competent = Measure(PilotSkill.Competent);
        GunConversionFunnelResult veteran = Measure(PilotSkill.Veteran);
        GunConversionFunnelResult ace = Measure(PilotSkill.Ace);
        foreach (GunConversionFunnelResult r in new[] { novice, competent, veteran, ace })
            _out.WriteLine(r.TriggerLine);

        Assert.Equal(0, novice.Hits);
        Assert.Equal(0, novice.Kills);
        Assert.True(competent.HitsPerRound <= 0.12,
            $"Competent must stay tracer pressure, not an Ace; got {competent.HitsPerRound:P1}.");
        Assert.True(veteran.HitsPerRound <= 0.15,
            $"Veteran must stay below Ace gunnery; got {veteran.HitsPerRound:P1}.");
        Assert.True(competent.Kills <= 2, $"Competent kills {competent.Kills}, expected <= 2.");
        Assert.True(veteran.Kills <= 2, $"Veteran kills {veteran.Kills}, expected <= 2.");

        // The separation itself, not just the absolute levels.
        Assert.True(ace.HitsPerRound >= 2.5 * System.Math.Max(
                competent.HitsPerRound, veteran.HitsPerRound),
            $"ACE must convert at least 2.5x the best mid-ladder tier; ace "
            + $"{ace.HitsPerRound:P1} vs competent {competent.HitsPerRound:P1} / veteran "
            + $"{veteran.HitsPerRound:P1}.");
        Assert.True(ace.EngagementsWithHits > veteran.EngagementsWithHits,
            $"ACE must touch more engagements than Veteran; {ace.EngagementsWithHits} vs "
            + $"{veteran.EngagementsWithHits}.");
        Assert.True(novice.EngagementsWithHits < ace.EngagementsWithHits);
    }

    /// Determinism: the funnel is a pure function of the seeded scenario set. If this fails, a
    /// wall clock or an unseeded RNG has entered the kernel and every number above is worthless.
    [Fact]
    public void TheFunnelIsDeterministic() {
        GunConversionFunnelResult first = Measure(PilotSkill.Ace);
        GunConversionFunnelResult second = Measure(PilotSkill.Ace);
        Assert.Equal(first.RoundsFired, second.RoundsFired);
        Assert.Equal(first.Hits, second.Hits);
        Assert.Equal(first.Kills, second.Kills);
        Assert.Equal(first.TriggerSeconds, second.TriggerSeconds, 9);
        Assert.Equal(first.MedianLeadErrorAtTriggerDeg,
            second.MedianLeadErrorAtTriggerDeg, 9);
    }
}

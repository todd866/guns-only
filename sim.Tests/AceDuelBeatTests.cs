using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The Raptor programme's on-thesis capstone: a lone F-22A guns-only duel against a forced Ace-tier
/// Su-27S surrogate. These tests pin the beat's identity (same honest merge as the flagship, minus
/// the continuous replacement stream, plus a forced Ace), its kernel wiring at beat index 9, and the
/// fact that the deferred F-35C carrier beat still constructs even though the campaign no longer
/// links it.
/// </summary>
public class AceDuelBeatTests {
    [Fact]
    public void AceDuelReusesTheGunsOnlyF22MergeButForcesALoneAceBandit() {
        BeatSetup beat = Beats.ModernAceDuel();

        Assert.Equal(PilotSkill.Ace, beat.BanditSkill);
        Assert.True(beat.UsesNeutralMergeBandit);
        // A single decisive fight: no continuous-operations replacement stream.
        Assert.Null(beat.ContinuousCombat);
        Assert.Equal("aircraft.f22a.public-data-surrogate.v1", beat.PlayerAircraft.Id);
        Assert.Equal("aircraft.su27s.public-data-surrogate.v1", beat.BanditAircraft.Id);
        Assert.Equal("GUNS_ONLY_FIRST_PASS_SAFE", beat.MissionIdentity.RulesOfEngagement);
        Assert.True(beat.MissionIdentity.PublicDataSurrogate);
        Assert.Equal(
            "mission.modern.ace-duel.f22a-vs-su27s.public-data-surrogate.v1",
            beat.MissionIdentity.Id);
        Assert.NotNull(beat.VisualMergeEvaluation);

        var bandit = Assert.IsType<NeutralMergeBandit>(beat.CreateBandit());
        Assert.Equal(PilotSkill.Ace, bandit.BriefedSkill);
    }

    [Fact]
    public void SimulationSessionStagesTheAceDuelAsBeatNine() {
        var session = new SimulationSession(9);

        Assert.Equal(9, session.BeatIndex);
        Assert.NotNull(session.VisualMergeEvaluation);
        Assert.IsType<NeutralMergeBandit>(session.Bandit);
    }

    [Fact]
    public void F35CCarrierBeatStillConstructsThoughTheCampaignNoLongerLinksIt() {
        // Deferred content, like the Korea beats: unlinked from the campaign ladder, still whole in
        // the kernel and stageable through the beat-5 selector.
        BeatSetup beat = Beats.F35CCarrierApproach();
        Assert.Equal("aircraft.f35c.public-data-carrier-surrogate.v1", beat.PlayerAircraft.Id);
        Assert.True(beat.RecoveryCompletesSortie);

        var session = new SimulationSession(5);
        Assert.Equal(5, session.BeatIndex);
    }
}

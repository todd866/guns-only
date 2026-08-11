using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class ArenaHandicapTests {
    [Fact]
    public void ProfileFromJsonReadsMatchmakerHandicapKnobs() {
        const string json = """
            {
              "skillBlend": 2.5,
              "maxAcquireG": 7.25,
              "acquireGGain": 2.0,
              "forcesOvershoot": true,
              "disengagesWhenLosing": true,
              "doctrineCount": 3,
              "lookaheadHorizonTicks": 120,
              "fireConeDeg": 4.0,
              "leadFireConeDeg": 0.4,
              "lowBlockClearanceM": 140.0,
              "lowBlockRecommitSeconds": 1.0,
              "energyRetentionWeight": 1.1
            }
            """;
        BanditSkillProfile profile = ArenaHandicap.ProfileFromJson(json);
        Assert.Equal(7.25, profile.MaxAcquireG);
        Assert.Equal(2.0, profile.AcquireGGain);
        Assert.True(profile.ForcesOvershoot);
        Assert.Equal(3, profile.DoctrineCount);
        Assert.Equal(1.1, profile.EnergyRetentionWeight);
    }

    [Fact]
    public void SkillFromBlendRoundsToNearestPilotSkill() {
        Assert.Equal(PilotSkill.Novice, ArenaHandicap.SkillFromBlend(0.2));
        Assert.Equal(PilotSkill.Veteran, ArenaHandicap.SkillFromBlend(2.4));
        Assert.Equal(PilotSkill.Machine, ArenaHandicap.SkillFromBlend(4.0));
    }

    [Fact]
    public void ProfileFromJsonBoundsEveryNumericKnobToThePublishedSkillEnvelope() {
        const string json = """
            {
              "maxAcquireG": 900.0,
              "acquireGGain": -20.0,
              "doctrineCount": 99,
              "lookaheadHorizonTicks": -50,
              "fireConeDeg": 90.0,
              "leadFireConeDeg": -1.0,
              "lowBlockClearanceM": -500.0,
              "lowBlockRecommitSeconds": 60.0,
              "energyRetentionWeight": 8.0
            }
            """;

        BanditSkillProfile profile = ArenaHandicap.ProfileFromJson(json);

        Assert.Equal(15.0, profile.MaxAcquireG);
        Assert.Equal(1.0, profile.AcquireGGain);
        Assert.Equal(3, profile.DoctrineCount);
        Assert.Equal(0, profile.LookaheadHorizonTicks);
        Assert.Equal(5.0, profile.FireConeDeg);
        Assert.Equal(0.25, profile.LeadFireConeDeg);
        Assert.Equal(105.0, profile.LowBlockClearanceM);
        Assert.Equal(5.0, profile.LowBlockRecommitSeconds);
        Assert.Equal(1.3, profile.EnergyRetentionWeight);
    }

    [Fact]
    public void SetArenaHandicapOverridesSkillDrivenBanditAndClearsWingmen() {
        var session = new SimulationSession(7, Carrier.DeckConfiguration.Angled,
            KoreaWeatherPresets.ForBeat(7));
        session.StartBeat(7);
        Assert.True(session.OpponentPresent);

        BanditSkillProfile nerfed = BanditSkillProfile.For(PilotSkill.Competent) with {
            MaxAcquireG = 3.1,
            LookaheadHorizonTicks = 40,
        };
        Assert.True(session.SetArenaHandicap(nerfed, PilotSkill.Competent));
        Assert.True(session.ArenaHandicapActive);
        Assert.True(session.Bandit is ReactiveBandit or NeutralMergeBandit);
        PilotSkill skill = session.Bandit switch {
            ReactiveBandit reactive => reactive.Skill,
            NeutralMergeBandit merge => merge.Skill,
            _ => PilotSkill.Novice,
        };
        Assert.Equal(PilotSkill.Competent, skill);
    }
}

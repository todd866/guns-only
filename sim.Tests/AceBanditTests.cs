using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class AceBanditTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(double x, double y, double z, double speed, double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    [Fact]
    public void CompetentProfileReproducesTheDefaultBanditTickForTick() {
        var player = State(1500.0, 1000.0, 1200.0, 160.0);
        var legacy = new ReactiveBandit(State(0.0, 1000.0, 0.0, 165.0), FlightModel.Sabre);
        var explicitCompetent = new ReactiveBandit(
            State(0.0, 1000.0, 0.0, 165.0), FlightModel.Sabre, PilotSkill.Competent);
        for (int i = 0; i < 5 * AircraftSim.TickHz; i++) {
            legacy.Step(player, Dt);
            explicitCompetent.Step(player, Dt);
            Assert.Equal(legacy.State, explicitCompetent.State);
            Assert.Equal(legacy.LastCommand, explicitCompetent.LastCommand);
        }
        Assert.Equal(PilotSkill.Competent, legacy.Skill);
    }

    [Fact]
    public void SkillProfileTableGatesMaxAcquireGByTier() {
        Assert.True(BanditSkillProfile.For(PilotSkill.Ace).MaxAcquireG
            > BanditSkillProfile.For(PilotSkill.Competent).MaxAcquireG);
        Assert.False(BanditSkillProfile.For(PilotSkill.Competent).ForcesOvershoot);
        Assert.True(BanditSkillProfile.For(PilotSkill.Ace).ForcesOvershoot);
    }

    static AircraftState F22(double x, double y, double z, double speed, double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);

    [Fact]
    public void AcePullsToMaxPerformWhereTheCompetentBanditIsCappedAt320G() {
        // A large initial angle-off (a target behind and fleeing) is where the ace's higher gain and
        // 9 G ceiling separate from the competent bandit's hard 3.20 G cap. This validates the
        // capability (pull); converting it into a kill is the tactical tasks' job (see the Task-8
        // outcome test below).
        var player = F22(0.0, 3000.0, -3000.0, 220.0, chi: Math.PI);
        var start = F22(0.0, 3000.0, 0.0, 240.0, chi: 0.0);
        var competent = new ReactiveBandit(start, FlightModel.F22APublicDataSurrogate, PilotSkill.Competent);
        var ace = new ReactiveBandit(start, FlightModel.F22APublicDataSurrogate, PilotSkill.Ace);
        double competentMaxG = 0.0, aceMaxG = 0.0;
        for (int i = 0; i < 3 * AircraftSim.TickHz; i++) {
            competent.Step(player, Dt);
            ace.Step(player, Dt);
            if (competent.Tactic == BanditTactic.Acquire)
                competentMaxG = Math.Max(competentMaxG, competent.LastCommand.GDemand);
            if (ace.Tactic == BanditTactic.Acquire)
                aceMaxG = Math.Max(aceMaxG, ace.LastCommand.GDemand);
        }
        Assert.True(competentMaxG <= 3.21, $"competent must stay capped: {competentMaxG:F2}");
        Assert.True(aceMaxG > competentMaxG + 1.5, $"ace={aceMaxG:F2} competent={competentMaxG:F2}");
    }

    // TASK-8 ACCEPTANCE TARGET (currently failing by design): a high-skill AI must out-fight a weak
    // one. Task 2 measured that raising G alone leaves the ace TIED with a novice (1.5s vs 1.5s) --
    // it wins the head-on window but never converts to a sustained solution. Enabling this requires
    // the tactical behaviours (overshoot-forcing defence, disengage/re-engage, doctrine) and the
    // win% tuning of Tasks 4-8. Unskip and satisfy it in Task 8.
    [Fact(Skip = "Task-8 outcome: needs the ace tactical behaviours (Tasks 4-6) + tuning, not just G")]
    public void AceOutFightsANoviceHeadToHead() {
        var p = FlightModel.F22APublicDataSurrogate;
        var ace = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 220.0, chi: 0.0), p, PilotSkill.Ace);
        var novice = new ReactiveBandit(F22(0.0, 3000.0, 4000.0, 220.0, chi: Math.PI), p, PilotSkill.Novice);
        var result = BfmDuel.Fly(ace, novice, 45.0);
        Assert.True(result.ASolutionSeconds > result.BSolutionSeconds + 1.0,
            $"ace={result.ASolutionSeconds:F1}s novice={result.BSolutionSeconds:F1}s");
    }
}

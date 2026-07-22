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
}

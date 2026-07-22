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

    // A high-skill AI must out-fight a weak one. Raising G alone left the ace TIED with a novice
    // (~1.5s vs ~1.5s): it won the head-on window but never converted to a sustained solution. The
    // short-horizon lookahead decision layer (ReactiveBandit.LookaheadCommand) converts the merge --
    // it pulls nose-low after the pass, gets its nose on, and holds a long gun solution.
    [Fact]
    public void AceOutFightsANoviceHeadToHead() {
        var p = FlightModel.F22APublicDataSurrogate;
        var ace = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 220.0, chi: 0.0), p, PilotSkill.Ace);
        var novice = new ReactiveBandit(F22(0.0, 3000.0, 4000.0, 220.0, chi: Math.PI), p, PilotSkill.Novice);
        var result = BfmDuel.Fly(ace, novice, 45.0);
        Assert.True(result.ASolutionSeconds > result.BSolutionSeconds + 1.0,
            $"ace={result.ASolutionSeconds:F1}s novice={result.BSolutionSeconds:F1}s");
    }

    // A fixed-turn reference target: a throwaway airframe held in a steady rate turn, driven on the
    // same deterministic sample as the bandit. Returns (gun-solution seconds the bandit held on it,
    // own altitude excursion max-min). Reads only the target's beginning-of-tick state — honest.
    static (double solutionSeconds, double altitudeExcursion) FlyAgainstSteadyTurnTarget(
        ReactiveBandit bandit, double seconds) {
        var p = FlightModel.F22APublicDataSurrogate;
        // Target ahead of and slightly across the bandit, holding a sustained 4 G right turn.
        var target = new AircraftSim(F22(700.0, 3000.0, 1600.0, 210.0, chi: 0.0), p);
        var steadyTurn = new PilotCommand(4.0, 0.8, 0.85, 0.0);
        double sol = 0.0, minY = double.PositiveInfinity, maxY = double.NegativeInfinity;
        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            var targetState = target.State;
            bandit.Step(targetState, Dt);
            target.Step(steadyTurn, Dt);
            if (CameraSolver.GunWindow(bandit.State, target.State)) sol += Dt;
            minY = Math.Min(minY, bandit.State.Position.Y);
            maxY = Math.Max(maxY, bandit.State.Position.Y);
        }
        return (sol, maxY - minY);
    }

    [Fact]
    public void AceConvertsAgainstASteadyTurnWhereACompetentBanditGetsNothing() {
        var p = FlightModel.F22APublicDataSurrogate;
        var ace = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 240.0, chi: 0.0), p, PilotSkill.Ace);
        var competent = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 240.0, chi: 0.0), p, PilotSkill.Competent);
        var aceResult = FlyAgainstSteadyTurnTarget(ace, 30.0);
        var competentResult = FlyAgainstSteadyTurnTarget(competent, 30.0);
        Assert.True(competentResult.solutionSeconds < 0.5,
            $"flat competent should barely convert: {competentResult.solutionSeconds:F2}s");
        Assert.True(aceResult.solutionSeconds > 1.0,
            $"ace must accrue a real gun solution: {aceResult.solutionSeconds:F2}s");
        Assert.True(aceResult.solutionSeconds > competentResult.solutionSeconds + 1.0,
            $"ace={aceResult.solutionSeconds:F2}s competent={competentResult.solutionSeconds:F2}s");
    }

    [Fact]
    public void AceUsesTheVerticalMoreThanAFlatCompetentBandit() {
        var p = FlightModel.F22APublicDataSurrogate;
        var ace = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 240.0, chi: 0.0), p, PilotSkill.Ace);
        var competent = new ReactiveBandit(F22(0.0, 3000.0, 0.0, 240.0, chi: 0.0), p, PilotSkill.Competent);
        double aceExcursion = FlyAgainstSteadyTurnTarget(ace, 30.0).altitudeExcursion;
        double competentExcursion = FlyAgainstSteadyTurnTarget(competent, 30.0).altitudeExcursion;
        Assert.True(aceExcursion > competentExcursion + 200.0,
            $"ace must fight in the vertical: ace={aceExcursion:F0} m competent={competentExcursion:F0} m");
    }
}

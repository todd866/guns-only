using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FormationCoordinationSessionTests {
    [Fact]
    public void OpeningPairSplitsPressureAndBracketRolesOnFirstTick() {
        var session = new SimulationSession(7);
        session.Begin();

        Assert.Single(session.Wingmen);
        session.StepFixed();

        FormationTacticalRole primary = session.PrimaryFormationRole;
        FormationTacticalRole wingman = session.WingmanFormationRole(0);
        Assert.Equal(1, (primary == FormationTacticalRole.Pressure ? 1 : 0)
            + (wingman == FormationTacticalRole.Pressure ? 1 : 0));
        Assert.Equal(1, (primary == FormationTacticalRole.Bracket ? 1 : 0)
            + (wingman == FormationTacticalRole.Bracket ? 1 : 0));
        Assert.DoesNotContain(
            FormationTacticalRole.Independent,
            new[] { primary, wingman });
    }

    [Fact]
    public void IdenticalSessionsKeepRolesAircraftAndDelayedPictureBitIdentical() {
        var first = new SimulationSession(7);
        var second = new SimulationSession(7);
        first.Begin();
        second.Begin();

        bool observedDelayedPicture = false;
        bool observedUsablePicture = false;
        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++) {
            first.StepFixed();
            second.StepFixed();

            Assert.Equal(first.PrimaryFormationRole, second.PrimaryFormationRole);
            Assert.Equal(
                first.FormationCoordinationAgeSeconds,
                second.FormationCoordinationAgeSeconds);
            Assert.Equal(
                first.FormationCoordinationStale,
                second.FormationCoordinationStale);
            Assert.Equal(first.Player.State, second.Player.State);
            Assert.Equal(first.Bandit.State, second.Bandit.State);
            Assert.Equal(first.Wingmen.Count, second.Wingmen.Count);
            for (int index = 0; index < first.Wingmen.Count; index++) {
                Assert.Equal(
                    first.WingmanFormationRole(index),
                    second.WingmanFormationRole(index));
                Assert.Equal(
                    first.Wingmen[index].Bandit.State,
                    second.Wingmen[index].Bandit.State);
            }

            if (first.FormationCoordinationAgeSeconds is double ageSeconds)
                observedDelayedPicture |= ageSeconds
                    > SimulationSession.FixedDeltaSeconds;
            observedUsablePicture |= !first.FormationCoordinationStale;
        }

        Assert.True(observedDelayedPicture,
            "the coordinator never exposed a communication-aged picture");
        Assert.True(observedUsablePicture,
            "the coordinator never received a usable delayed update");
    }

    [Fact]
    public void LeaderPromotionCollapsesTheSurvivorToIndependent() {
        var session = new SimulationSession(7);
        session.Begin();
        session.StepFixed();
        IBandit survivor = Assert.Single(session.Wingmen).Bandit;

        session.ForceOpponentDefeatForTest();

        Assert.Same(survivor, session.Bandit);
        Assert.Empty(session.Wingmen);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(
            FormationTacticalRole.Independent,
            session.PrimaryFormationRole);
        Assert.Equal(AircraftTerminalState.Flying, session.OpponentTerminalState);
        Assert.False(session.TerminalPhaseActive);
    }

    [Fact]
    public void WingmanDeathCollapsesTheLeaderToIndependent() {
        var session = new SimulationSession(7);
        session.Begin();
        session.StepFixed();
        IBandit leader = session.Bandit;
        Wingman wingman = Assert.Single(session.Wingmen);

        wingman.Bandit.ApplyCatastrophicDamage(handedness: -1);
        session.StepFixed();

        Assert.Same(leader, session.Bandit);
        Assert.True(wingman.Defeated);
        Assert.Equal(1, session.LiveOpponentCount);
        Assert.Equal(
            FormationTacticalRole.Independent,
            session.PrimaryFormationRole);
        Assert.Equal(
            FormationTacticalRole.Independent,
            session.WingmanFormationRole(0));
    }

    [Fact]
    public void ModernAceDuelRemainsIndependent() {
        var session = new SimulationSession(9);
        session.Begin();

        Assert.Empty(session.Wingmen);
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            session.StepFixed();
            Assert.Equal(
                FormationTacticalRole.Independent,
                session.PrimaryFormationRole);
        }
    }

    [Fact]
    public void CoordinatedOpeningStillCompletesTheNeutralMerge() {
        var session = new SimulationSession(7);
        var merge = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        session.Begin();

        for (int tick = 0;
            tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete;
            tick++)
            session.StepFixed();

        Assert.True(merge.FirstPassComplete,
            "formation coordination prevented the authored neutral-merge handoff");
    }
}

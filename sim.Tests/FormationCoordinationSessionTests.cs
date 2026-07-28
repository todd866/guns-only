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
    public void PlayerDestructionClearsThePairOnTheTerminalTransition() {
        var session = new SimulationSession(7);
        session.Begin();
        session.StepFixed();

        Assert.NotNull(session.FormationCoordinationAgeSeconds);
        Assert.NotEqual(
            FormationTacticalRole.Independent,
            session.PrimaryFormationRole);
        Assert.NotEqual(
            FormationTacticalRole.Independent,
            session.WingmanFormationRole(0));

        session.RecordPlayerHitsForTest(
            session.Beat.CombatRules.PlayerHitsToDefeat);
        session.StepFixed();

        Assert.NotEqual(
            AircraftTerminalState.Flying,
            session.PlayerTerminalState);
        Assert.Null(session.FormationCoordinationAgeSeconds);
        Assert.False(session.FormationCoordinationStale);
        Assert.Equal(
            FormationTacticalRole.Independent,
            session.PrimaryFormationRole);
        Assert.Equal(
            FormationTacticalRole.Independent,
            session.WingmanFormationRole(0));
    }

    [Fact]
    public void ProductionTickCadenceExposesAndRefreshesTheStaleWindow() {
        var session = new SimulationSession(7);
        session.Begin();
        bool observedStaleWindow = false;
        bool observedRadioRefresh = false;

        for (int tick = 0; tick < 260; tick++) {
            session.StepFixed();
            observedStaleWindow |= session.FormationCoordinationStale;
            if (observedStaleWindow
                && !session.FormationCoordinationStale
                && session.FormationCoordinationAgeSeconds is not null) {
                observedRadioRefresh = true;
                break;
            }
        }

        Assert.True(observedStaleWindow,
            "ordinary SimulationSession stepping never reached the conservative fallback");
        Assert.True(observedRadioRefresh,
            "the delayed collection did not restore a fresh shared picture");
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
        var support = Assert.IsType<ReactiveBandit>(
            Assert.Single(session.Wingmen).Bandit);
        int primaryPhase = Assert.IsType<int>(merge.LookaheadCadencePhase);
        int supportPhase = Assert.IsType<int>(support.LookaheadCadencePhase);
        int phaseSeparation = Math.Abs(primaryPhase - supportPhase);
        phaseSeparation = Math.Min(
            phaseSeparation,
            ReactiveBandit.LookaheadDecisionCadenceTicks - phaseSeparation);
        Assert.True(phaseSeparation > 2,
            $"formation lookahead lanes are only {phaseSeparation} ticks apart");
        session.Begin();

        for (int tick = 0;
            tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete;
            tick++)
            session.StepFixed();

        Assert.True(merge.FirstPassComplete,
            "formation coordination prevented the authored neutral-merge handoff");
        Assert.Equal(primaryPhase, merge.LookaheadCadencePhase);
    }
}

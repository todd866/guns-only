using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

static class FrontDoorRampFixtures {
    public static string EarnedPairState() {
        var director = new FightDirector();
        for (int engagement = 1; engagement <= 2; engagement++) {
            EngagementReport kill = new(
                engagement, PilotSkill.Competent, false, SortieOutcome.Victory,
                30.0, 0.0, 0, 4, 4, 0, 340.0, 0);
            director.Observe(in kill);
        }
        return director.ExportState();
    }

    /// The pair is rung 3. Tests of wingman mechanics stage that rung; the cold door does not.
    public static SimulationSession EarnedPairSession(
        Carrier.DeckConfiguration deck = Carrier.DeckConfiguration.Axial,
        WeatherProfile? weather = null) {
        var session = new SimulationSession(1, deck, weather);
        session.ArmDirectorStateForNextStage(EarnedPairState());
        session.StartBeat(7, deck);
        return session;
    }
}

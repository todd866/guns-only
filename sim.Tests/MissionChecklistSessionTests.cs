using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// The checklist runs itself: a Rapier sortie with zero player input progresses the
/// LAUNCH checklist from sim truth alone, resets with the beat, and narrates the
/// gear-up milestone on the radio.
/// </summary>
public sealed class MissionChecklistSessionTests {
    [Fact]
    public void RapierSortieRunsTheLaunchChecklistWithoutPlayerInput() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.RapierIntercept());
        session.Begin();

        // The checklist computes at tick boundaries; give the sortie its first seconds.
        for (int tick = 0; tick < AircraftSim.TickHz * 2; tick++) session.StepFixed();
        Assert.Equal(MissionChecklistId.Launch, session.MissionChecklist.Id);

        // Ride the automatic catapult + cleanup. 30 sim-seconds is far past the
        // stroke and the automated gear/flap retraction.
        for (int tick = 0; tick < AircraftSim.TickHz * 28; tick++) session.StepFixed();

        Assert.True(session.MissionChecklist.Done >= 2,
            $"launch checklist stuck at {session.MissionChecklist.Done}/"
            + $"{session.MissionChecklist.Total} ({session.MissionChecklist.NextItem})");
    }

    [Fact]
    public void RestartResetsTheChecklistToTheTop() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.RapierIntercept());
        session.Begin();
        for (int tick = 0; tick < AircraftSim.TickHz * 30; tick++) session.StepFixed();
        int doneBefore = session.MissionChecklist.Done;
        Assert.True(doneBefore > 0, "test needs progress before restart");

        session.Restart();
        session.Begin();
        Assert.Equal(0, session.MissionChecklist.Done);
    }

    [Fact]
    public void GearUpMilestoneCompletesButStaysOffTheRadio() {
        // Post-launch "gear up" is flight-intercom chatter, not a radio call (AFI 11-2F-16V3
        // 3.15 via PHRASEOLOGY.md): the checklist milestone still completes, silently.
        var session = new SimulationSession();
        session.StartBeat(() => Beats.RapierIntercept());
        session.Begin();

        bool narrated = false;
        for (int tick = 0; tick < AircraftSim.TickHz * 60; tick++) {
            session.StepFixed();
            narrated |= session.MissionRadio.Active
                && session.MissionRadio.Id == "pilot-checklist-gear-up";
        }
        Assert.False(narrated, "cut gear-up call resurfaced on the radio");
        Assert.True(session.MissionChecklist.Done > 0,
            "gear-up checklist milestone never completed");
    }
}

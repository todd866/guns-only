using System.Text.Json;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Rapier computer-casualty contract. Keyboard input is upstream of the aircraft's computers:
/// mission-computer loss still leaves FBW/RCS manual control, while losing every flight-control
/// computer cannot create a hidden direct keyboard-to-actuator fallback.
/// </summary>
[Collection("snapshot-projection-statics")]
public sealed class RapierComputerFailureTests {
    const double FailureAltitudeM = 250_000.0 * 0.3048;

    static BeatSetup HighZoomCoastCard(int seed) {
        BeatSetup baseline = Beats.RapierGoFly(jobSeed: seed);
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(FailureAltitudeM);
        double speedMps = 3.4 * air.SpeedOfSoundMps;
        var player = new AircraftState(
            new Vec3D(0.0, FailureAltitudeM, 0.0),
            speedMps,
            40.0 * Math.PI / 180.0,
            0.0,
            0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);
        return baseline with {
            Player = player,
            StartsOnCatapult = false,
            InitialThrottle = 0.0
        };
    }

    static SimulationSession StartAtFailureAltitude(int seed) {
        BeatSetup card = HighZoomCoastCard(seed);
        var session = new SimulationSession();
        session.StartBeat(() => card);
        session.Begin();
        session.StepFixed();
        Assert.Equal(RapierMissionPhase.ZoomCoast, session.RapierPhase);
        Assert.Equal(RapierComputerFailure.None, session.RapierComputerFailureActive);
        return session;
    }

    [Fact]
    public void DealVariesComputerCasualtyWithoutChangingTheJob() {
        BeatSetup nominal = Beats.RapierGoFly(jobSeed: 1);
        BeatSetup missionComputer = Beats.RapierGoFly(jobSeed: 5);
        BeatSetup flightControls = Beats.RapierGoFly(jobSeed: 9);

        Assert.Equal(RapierJobKind.Awacs, nominal.ScriptedIntercept!.Job);
        Assert.Equal(nominal.ScriptedIntercept.Job,
            missionComputer.ScriptedIntercept!.Job);
        Assert.Equal(nominal.ScriptedIntercept.Job,
            flightControls.ScriptedIntercept!.Job);
        Assert.Equal(RapierComputerFailure.None,
            nominal.ScriptedIntercept.ComputerFailureAtZoomCoast);
        Assert.Equal(RapierComputerFailure.MissionComputer,
            missionComputer.ScriptedIntercept.ComputerFailureAtZoomCoast);
        Assert.Equal(RapierComputerFailure.FlightControlComputers,
            flightControls.ScriptedIntercept.ComputerFailureAtZoomCoast);
        Assert.Contains("SYSTEMS NOMINAL", nominal.Name);
        Assert.Contains("MISSION COMPUTER FAILURE", missionComputer.Name);
        Assert.Contains("FLIGHT CONTROL FAILURE", flightControls.Name);
    }

    [Fact]
    public void MissionComputerLossLeavesManualFbwAndRcsButAutomationCannotReengage() {
        SimulationSession session = StartAtFailureAltitude(seed: 5);

        session.StepFixed();

        Assert.Equal(RapierComputerFailure.MissionComputer,
            session.RapierComputerFailureActive);
        Assert.False(session.RapierMissionComputerAvailable);
        Assert.True(session.RapierFlightControlComputersAvailable);
        Assert.False(session.RapierAutomationEnabled);
        Assert.False(session.RapierAutomationActive);
        Assert.False(session.ToggleRapierAutomation());
        Assert.Equal(AircraftTerminalState.Flying, session.PlayerTerminalState);
        Assert.False(session.TerminalPhaseActive);
        Assert.False(session.AutoGcas.Active);
        Assert.Contains("FBW + RCS REMAIN", session.RapierMissionCue);
        Assert.Equal(1, session.TimeCompressionFactor);

        session.FeedKey(GKey.RollRight, true);
        session.StepFixed();
        Assert.True(session.Player.LastAppliedCommand.RollControl > 0.0);
    }

    [Fact]
    public void TotalFlightControlComputerLossAt250KFeetIsUniversallyFatal() {
        SimulationSession session = StartAtFailureAltitude(seed: 9);
        double failureAltitudeFt = session.Player.State.Position.Y / 0.3048;
        Assert.InRange(failureAltitudeFt, 249_000.0, 252_000.0);

        session.StepFixed();

        Assert.Equal(RapierComputerFailure.FlightControlComputers,
            session.RapierComputerFailureActive);
        Assert.True(session.RapierMissionComputerAvailable);
        Assert.False(session.RapierFlightControlComputersAvailable);
        Assert.True(session.RapierUncontrolledReentry);
        Assert.False(session.RapierAutomationEnabled);
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.PlayerTerminalState);
        Assert.True(session.TerminalPhaseActive);
        Assert.Contains("NO PILOT-TO-ACTUATOR PATH", session.RapierMissionCue);
        Assert.Contains("UNCONTROLLED REENTRY", session.TransitionCue);
        Assert.Contains(session.RecentEvents, entry =>
            entry.Type == SessionEventType.Destroyed
            && entry.Source == CombatRole.None
            && entry.Target == CombatRole.Player);

        // A keyboard edge after the loss cannot revive a secret mechanical control path.
        session.FeedKey(GKey.PullUp, true);
        session.StepFixed();
        Assert.Equal(AircraftTerminalState.DestroyedAirborne,
            session.PlayerTerminalState);
        Assert.False(session.RapierFlightControlComputersAvailable);
    }

    [Fact]
    public void SnapshotPublishesThePlannedAndActiveComputerCasualty() {
        SimulationSession session = StartAtFailureAltitude(seed: 5);
        session.StepFixed();

        string json = SnapshotProjection.BuildState(
            session,
            Carrier.DeckConfiguration.Angled,
            0.0,
            0.0,
            false,
            terrain: null);
        using JsonDocument document = JsonDocument.Parse(json);
        JsonElement root = document.RootElement;

        Assert.Equal("MISSION_COMPUTER",
            root.GetProperty("rapier_computer_failure_plan").GetString());
        Assert.Equal("MISSION_COMPUTER",
            root.GetProperty("rapier_computer_failure_active").GetString());
        Assert.False(root.GetProperty("rapier_mission_computer_available").GetBoolean());
        Assert.True(root.GetProperty(
            "rapier_flight_control_computers_available").GetBoolean());
        Assert.False(root.GetProperty("rapier_uncontrolled_reentry").GetBoolean());
    }
}

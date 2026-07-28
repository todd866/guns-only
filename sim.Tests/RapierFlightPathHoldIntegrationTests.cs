using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public sealed class RapierFlightPathHoldIntegrationTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly DoctrineAdvice Advice = new(4.2, 0.0, "hold integration");

    static AircraftSim RapierAt(double gammaDeg = 0.0, double bankDeg = 0.0) =>
        new(new AircraftState(
            new Vec3D(0.0, 15_000.0, 0.0),
            Speed: 600.0,
            Gamma: gammaDeg * Math.PI / 180.0,
            Chi: 0.0,
            Bank: bankDeg * Math.PI / 180.0,
            FlightModel.RapierPublicDataSurrogate.MassKg),
            FlightModel.RapierPublicDataSurrogate);

    static void Tick(DetentLayer detents, KeyGrammar keys, AircraftSim sim,
        AircraftParams parameters, double timeMs = 0.0) {
        detents.AirspeedMps = sim.AirspeedMps;
        detents.Tick(keys, timeMs, sim.State, parameters, Advice, Dt);
    }

    [Fact]
    public void RapierNeutralCapturesSteepNoseAttitudeWithoutSelectingAbsolutePitch() {
        AircraftSim sim = RapierAt(gammaDeg: 36.0);
        var detents = new DetentLayer();

        var keys = new KeyGrammar();
        for (int tick = 0; tick < AircraftSim.TickHz; tick++)
            Tick(detents, keys, sim, FlightModel.RapierPublicDataSurrogate,
                tick * Dt * 1000.0);

        Assert.True(detents.FlightPathHoldActive);
        Assert.Equal(sim.BodyPitchRad, detents.CapturedPitchRad, precision: 9);
        Assert.Equal(Math.Cos(sim.State.Gamma),
            detents.Command.GDemand, precision: 2);
        Assert.True(double.IsNaN(detents.Command.CommandedPitchRad));
    }

    [Fact]
    public void NearVerticalNeutralCaptureStaysFinite() {
        AircraftSim sim = RapierAt(gammaDeg: 89.0);
        var detents = new DetentLayer();

        Tick(detents, new KeyGrammar(), sim,
            FlightModel.RapierPublicDataSurrogate);

        Assert.True(detents.FlightPathHoldActive);
        Assert.Equal(sim.BodyPitchRad, detents.CapturedPitchRad, precision: 9);
        Assert.True(detents.CapturedPitchRad > 88.0 * Math.PI / 180.0);
        Assert.True(double.IsFinite(detents.Command.GDemand));
        Assert.InRange(detents.Command.GDemand,
            FlightPathHoldConfig.Rapier.MinG,
            FlightPathHoldConfig.Rapier.MaxG);
    }

    [Fact]
    public void LegacyAirframeKeepsTheOneGBaseline() {
        AircraftSim sim = RapierAt(gammaDeg: 36.0);
        var detents = new DetentLayer();

        Tick(detents, new KeyGrammar(), sim, FlightModel.Sabre);

        Assert.False(detents.FlightPathHoldActive);
        Assert.Equal(1.0, detents.Command.GDemand, precision: 9);
    }

    [Fact]
    public void ApproachAndAssistedModesPreemptFlightPathHold() {
        AircraftSim sim = RapierAt(gammaDeg: -3.5);
        var approach = new DetentLayer {
            ApproachMode = true,
            AirspeedMps = 70.0,
            ApproachAirspeedMps = 70.0
        };

        Tick(approach, new KeyGrammar(), sim,
            FlightModel.RapierPublicDataSurrogate);
        Assert.False(approach.FlightPathHoldActive);
        Assert.True(double.IsFinite(approach.Command.CommandedPitchRad));

        var assisted = new DetentLayer {
            AssistedFlight = true,
            AssistedTargetWithinNoseCone = false
        };
        Tick(assisted, new KeyGrammar(), sim,
            FlightModel.RapierPublicDataSurrogate);
        Assert.False(assisted.FlightPathHoldActive);
        Assert.True(double.IsNaN(assisted.Command.CommandedPitchRad));
    }

    [Fact]
    public void CapturedGIsNotMisclassifiedAsPilotInputByAutoGcasStandby() {
        BeatSetup source = Beats.RapierIntercept();
        AircraftState player = source.Player with {
            Position = new Vec3D(0.0, 250.0, 0.0),
            Speed = 300.0,
            Gamma = 60.0 * Math.PI / 180.0,
            Chi = 0.0,
            Bank = 0.0
        };
        BeatSetup beat = source with {
            Carrier = null,
            StartsOnCatapult = false,
            ScriptedIntercept = null,
            Player = player,
            // Exercise the safety coupling even though today's Rapier scenario does not enable
            // Auto-GCAS. The control-law output must remain distinct from physical pilot input.
            PlayerCapability = AircraftCapability.F22ASurrogate
        };
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.SetTerrainSurface(new BilinearHeightGrid(
            -10_000.0, -10_000.0, 20_000.0, 20_000.0,
            new double[,] { { 0.0, 0.0 }, { 0.0, 0.0 } }));
        session.Begin();
        session.SetRapierAutomationEnabled(false);

        session.StepFixed();
        Assert.True(session.Controls.FlightPathHoldActive);
        Assert.True(Math.Abs(session.Controls.Command.GDemand - 1.0) > 0.05);
        Assert.False(session.AutoGcasLowLevelStandby,
            "a generated hold G is not a hand on the pitch control");

        session.FeedKey(GKey.PullUp, true);
        session.StepFixed();
        Assert.False(session.Controls.FlightPathHoldActive,
            "manual pitch input must preempt neutral attitude trim immediately");
        Assert.True(session.AutoGcasLowLevelStandby,
            "an actual held pitch key must still claim the low block");
    }
}

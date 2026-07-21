using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class GunneryPitchAssistTests {
    const double AltitudeM = 5486.4;
    const double DegreesToRadians = Math.PI / 180.0;

    static AircraftSim ModernAircraft(double speedMps = 250.0) {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        return new AircraftSim(new AircraftState(
            new Vec3D(0.0, AltitudeM, 0.0), speedMps,
            0.0, 0.0, 0.0, parameters.MassKg), parameters);
    }

    static Vec3D PitchLead(AircraftSim aircraft, double degrees) {
        double radians = degrees * DegreesToRadians;
        return (aircraft.BodyForward * Math.Cos(radians)
            + aircraft.BodyUp * Math.Sin(radians)).Normalized();
    }

    static GunneryPitchAssistResult Apply(AircraftSim aircraft,
        in PilotCommand command, in Vec3D lead, double rangeM = 600.0,
        bool enabled = true, bool hasLead = true, AircraftParams? parameters = null) =>
        GunneryPitchAssist.Apply(command, aircraft.State,
            parameters ?? FlightModel.F22APublicDataSurrogate,
            aircraft.LiftDir, aircraft.AirspeedMps, aircraft.AtmosphereModel,
            lead, hasLead, rangeM, enabled);

    [Fact]
    public void RequestsBoundedProtectedPitchRateTowardBallisticLead() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(
            GDemand: 1.0,
            BankTarget: 0.45,
            Throttle: 1.2,
            Rudder: -0.2,
            RollControl: 0.35,
            SasRollControl: -0.08,
            DirectLateralControl: true);

        GunneryPitchAssistResult result = Apply(aircraft, pilot,
            PitchLead(aircraft, 7.5));

        Assert.True(result.State.Active);
        Assert.InRange(result.State.PitchLeadErrorRad,
            7.49 * DegreesToRadians, 7.51 * DegreesToRadians);
        Assert.Equal(FlightModel.F22APublicDataSurrogate.GunneryPitchAssistMaxRateRad,
            result.State.RequestedPitchRateRadPerSecond, 10);
        Assert.InRange(result.State.LoadFactorCorrectionG, 0.01,
            FlightModel.F22APublicDataSurrogate.GunneryPitchAssistMaxCorrectionG);
        Assert.Equal(pilot.GDemand + result.State.LoadFactorCorrectionG,
            result.Command.GDemand, 10);
        Assert.True(result.Command.GDemand <= Protection.MaxPerformG(
            aircraft.State, FlightModel.F22APublicDataSurrogate,
            aircraft.AirspeedMps, aircraft.AtmosphereModel));

        Assert.Equal(pilot.BankTarget, result.Command.BankTarget);
        Assert.Equal(pilot.Throttle, result.Command.Throttle);
        Assert.Equal(pilot.Rudder, result.Command.Rudder);
        Assert.Equal(pilot.RollControl, result.Command.RollControl);
        Assert.Equal(pilot.SasRollControl, result.Command.SasRollControl);
        Assert.Equal(pilot.DirectLateralControl,
            result.Command.DirectLateralControl);
    }

    [Fact]
    public void PhysicalFlightPathConvergesInsteadOfSnappingToThePipper() {
        AircraftSim aircraft = ModernAircraft();
        Vec3D fixedLead = PitchLead(aircraft, 6.0);
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            DirectLateralControl: true);
        double initialError = Math.Acos(Math.Clamp(
            aircraft.BodyForward.Dot(fixedLead), -1.0, 1.0));
        double peakPitchRate = 0.0;

        for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
            GunneryPitchAssistResult result = Apply(aircraft, pilot, fixedLead);
            Assert.True(result.State.Active);
            aircraft.Step(result.Command, 1.0 / AircraftSim.TickHz);
            peakPitchRate = Math.Max(peakPitchRate,
                Math.Abs(aircraft.State.BodyRates.Q));
        }

        double finalError = Math.Acos(Math.Clamp(
            aircraft.BodyForward.Dot(fixedLead), -1.0, 1.0));
        Assert.InRange(peakPitchRate, 0.04,
            FlightModel.F22APublicDataSurrogate.GunneryPitchAssistMaxRateRad + 0.10);
        Assert.True(finalError < initialError * 0.70,
            $"pitch convergence only reduced lead error from {initialError / DegreesToRadians:F2} to {finalError / DegreesToRadians:F2} deg");
    }

    [Fact]
    public void LateralLeadErrorNeverManufacturesRollOrYawInput() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(1.0, -0.70, 1.0, 0.30,
            RollControl: -0.55, SasRollControl: 0.12,
            DirectLateralControl: true);
        double radians = 5.0 * DegreesToRadians;
        Vec3D lateralLead = (aircraft.BodyForward * Math.Cos(radians)
            + aircraft.BodyRight * Math.Sin(radians)).Normalized();

        GunneryPitchAssistResult result = Apply(aircraft, pilot, lateralLead);

        Assert.True(result.State.Active);
        Assert.Equal(0.0, result.State.PitchLeadErrorRad, 10);
        Assert.Equal(0.0, result.State.RequestedPitchRateRadPerSecond, 10);
        Assert.Equal(pilot.BankTarget, result.Command.BankTarget);
        Assert.Equal(pilot.Rudder, result.Command.Rudder);
        Assert.Equal(pilot.RollControl, result.Command.RollControl);
        Assert.Equal(pilot.SasRollControl, result.Command.SasRollControl);
    }

    [Fact]
    public void DisengagesOutsideShotGateAndDuringPitchOverride() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(4.0, 0.20, 1.0, 0.0,
            RollControl: 0.15, DirectLateralControl: true);
        Vec3D validLead = PitchLead(aircraft, 4.0);

        AssertInactiveUnchanged(Apply(aircraft, pilot, validLead,
            enabled: false), pilot);
        AssertInactiveUnchanged(Apply(aircraft, pilot, validLead,
            hasLead: false), pilot);
        AssertInactiveUnchanged(Apply(aircraft, pilot, validLead,
            rangeM: 1000.01), pilot);
        AssertInactiveUnchanged(Apply(aircraft, pilot,
            PitchLead(aircraft, 8.01)), pilot);
        AssertInactiveUnchanged(Apply(aircraft,
            pilot with { EnvelopeOverride = true }, validLead),
            pilot with { EnvelopeOverride = true });
        AssertInactiveUnchanged(Apply(aircraft,
            pilot with { CommandedAlphaRad = 0.8 }, validLead),
            pilot with { CommandedAlphaRad = 0.8 });
        AssertInactiveUnchanged(Apply(aircraft, pilot, validLead,
            parameters: FlightModel.Sabre), pilot);
    }

    [Fact]
    public void SessionUsesLeadWithoutFiringForThePlayer() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftState player = new(
            new Vec3D(0.0, AltitudeM, 0.0), 250.0,
            0.0, 0.0, 0.0, f22.MassKg);
        var stagedAircraft = new AircraftSim(player, f22);
        Vec3D targetDirection = PitchLead(stagedAircraft, 4.0);
        AircraftState bandit = new(
            player.Position + targetDirection * 600.0,
            250.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        BeatSetup beat = Beats.Perch() with {
            Name = "gunnery pitch assist integration",
            Player = player,
            Bandit = bandit,
            PlayerParams = f22,
            BanditParams = FlightModel.Su27SPublicDataSurrogate,
            PlayerCapability = AircraftCapability.F22ASurrogate,
            BanditCapability = AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile = PilotPhysiologyProfile.ModernFastJetReference,
            Combat = CombatConfig.ModernDroneDefense,
            BanditTimeline = new() {
                (0.0, new PilotCommand(1.0, 0.0, 1.0, 0.0))
            },
            InitialThrottle = 1.0
        };
        var session = new SimulationSession();
        session.StartBeat(() => beat);
        session.Begin();

        session.StepFixed(); // establishes the authoritative ballistic lead sample
        session.StepFixed(); // consumes that one-tick-old sample in the flight-control path

        Assert.True(session.PlayerGun.HasLeadSolution);
        Assert.True(session.GunneryPitchAssist.Active);
        Assert.True(session.GunneryPitchAssist.RequestedPitchRateRadPerSecond > 0.0);
        Assert.True(session.Player.LastAppliedCommand.GDemand
            > session.Controls.Command.GDemand);
        Assert.False(session.TriggerDown);
        Assert.Equal(0, session.PlayerGun.RoundsFired);

        // Space is an envelope override only while the pilot is also commanding pitch. Holding
        // the modifier by itself must not manufacture a control-law mode change.
        session.FeedKey(GKey.PullUp, true);
        session.FeedKey(GKey.Override, true);
        session.StepFixed();

        Assert.False(session.GunneryPitchAssist.Active);
        Assert.True(session.Player.LastAppliedCommand.EnvelopeOverride);
        Assert.Equal(0, session.PlayerGun.RoundsFired);
    }

    static void AssertInactiveUnchanged(in GunneryPitchAssistResult result,
        in PilotCommand expected) {
        Assert.False(result.State.Active);
        Assert.Equal(expected, result.Command);
    }
}

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

    static Vec3D LateralLead(AircraftSim aircraft, double degrees) {
        double radians = degrees * DegreesToRadians;
        return (aircraft.BodyForward * Math.Cos(radians)
            + aircraft.BodyRight * Math.Sin(radians)).Normalized();
    }

    static Vec3D TwoAxisLead(AircraftSim aircraft,
        double pitchDegrees, double lateralDegrees) =>
        (aircraft.BodyForward
            + aircraft.BodyUp * Math.Tan(pitchDegrees * DegreesToRadians)
            + aircraft.BodyRight * Math.Tan(lateralDegrees * DegreesToRadians))
        .Normalized();

    static GunneryPitchAssistResult Apply(AircraftSim aircraft,
        in PilotCommand command, in Vec3D lead, double rangeM = 600.0,
        bool enabled = true, bool hasLead = true, AircraftParams? parameters = null,
        double closureMps = 0.0) =>
        GunneryPitchAssist.Apply(command, aircraft.State,
            parameters ?? FlightModel.F22APublicDataSurrogate,
            aircraft.AirspeedMps, aircraft.AtmosphereModel,
            lead, hasLead, rangeM, enabled, closureMps: closureMps);

    /// <summary>
    /// The aid must be able to say "ease" once the nose is PAST the lead line, even while the
    /// pilot is pulling hard.
    ///
    /// Gating the ease authority on `GDemand >= 2.0` made the assist one-sided for the whole
    /// tracking task. Owner flight, Build 323 (session web-1786607256301-334574): median 5.7 G,
    /// at the envelope cap 56% of the time, so the clamp was live on essentially every firing
    /// pass. Lead error converged at -1.21 deg/s while the aid acted and DIVERGED at +1.62 deg/s
    /// while it was clamped. 808 rounds fired, 6 hits. This is the control experiment for that:
    /// it fails against the absolute-G clamp, because the correction there is exactly zero.
    /// </summary>
    [Fact]
    public void EasesThePullOnceTheNoseHasGonePastTheLeadLine() {
        AircraftSim aircraft = ModernAircraft();
        // Nose above the lead line: the target is BELOW where we are pointing.
        Vec3D lead = PitchLead(aircraft, -4.0);
        var pulling = new PilotCommand(GDemand: 5.5, BankTarget: 0.0, Throttle: 1.0, Rudder: 0.0);

        GunneryPitchAssistResult result = Apply(aircraft, pulling, lead);

        Assert.True(result.State.Active, "the aid must be engaged for this geometry");
        Assert.True(result.State.LoadFactorCorrectionG < 0.0,
            $"past the lead line at {pulling.GDemand} G the aid must ease, got {result.State.LoadFactorCorrectionG:F3} G");
    }

    /// <summary>
    /// The other half of the same rule, and the reason the absolute-G clamp existed at all: with
    /// the target still ABOVE the nose, a deliberate pull toward it must never be opposed
    /// ("impossible to pull to the shoot cue without spacebar", Build 80).
    /// </summary>
    [Fact]
    public void NeverOpposesAPullThatIsStillChasingTheLeadLine() {
        AircraftSim aircraft = ModernAircraft();
        Vec3D lead = PitchLead(aircraft, 4.0);
        var pulling = new PilotCommand(GDemand: 5.5, BankTarget: 0.0, Throttle: 1.0, Rudder: 0.0);

        GunneryPitchAssistResult result = Apply(aircraft, pulling, lead);

        Assert.True(result.State.LoadFactorCorrectionG >= 0.0,
            $"the aid must not fight a pull toward the solution, got {result.State.LoadFactorCorrectionG:F3} G");
    }

    /// <summary>The ease is bounded well under the pull-side authority: trim an overshoot, never
    /// take the aircraft off a target the pilot is chasing.</summary>
    [Fact]
    public void ThePastLineEaseIsBoundedWellUnderTheFullCorrectionAuthority() {
        AircraftSim aircraft = ModernAircraft();
        Vec3D lead = PitchLead(aircraft, -20.0);
        var pulling = new PilotCommand(GDemand: 7.0, BankTarget: 0.0, Throttle: 1.0, Rudder: 0.0);

        GunneryPitchAssistResult result = Apply(aircraft, pulling, lead);

        Assert.True(result.State.LoadFactorCorrectionG >= -1.0001,
            $"ease authority must stay bounded, got {result.State.LoadFactorCorrectionG:F3} G");
    }

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
        Assert.Equal(0.0, result.State.MeasuredPitchRateRadPerSecond, 10);
        Assert.Equal(result.State.RequestedPitchRateRadPerSecond,
            result.State.PitchRateErrorRadPerSecond, 10);
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
    public void SubtractsMeasuredBodyPitchRateBeforeAddingAnyG() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        AircraftSim trimmed = ModernAircraft();
        const double measuredPitchRate = 0.24;
        var aircraft = new AircraftSim(trimmed.State with {
            BodyRates = new BodyRates(0.0, measuredPitchRate, 0.0)
        }, parameters);
        // Hands-off-class demand: the two-sided damping applies only below a deliberate pull
        // (>= 2 G the negative authority is zero — the assist may never steal a pull).
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            DirectLateralControl: true);

        GunneryPitchAssistResult result = Apply(aircraft, pilot,
            PitchLead(aircraft, 4.0));

        Assert.True(result.State.Active);
        Assert.Equal(measuredPitchRate,
            result.State.MeasuredPitchRateRadPerSecond, 10);
        Assert.Equal(result.State.RequestedPitchRateRadPerSecond - measuredPitchRate,
            result.State.PitchRateErrorRadPerSecond, 10);
        double expectedCorrection = Math.Clamp(
            result.State.PitchRateErrorRadPerSecond * aircraft.AirspeedMps
                / FlightModel.G0,
            -parameters.GunneryPitchAssistMaxCorrectionG,
            parameters.GunneryPitchAssistMaxCorrectionG);
        Assert.Equal(expectedCorrection, result.State.LoadFactorCorrectionG, 10);
        Assert.True(result.State.PitchRateErrorRadPerSecond < 0.0);
        Assert.True(result.State.LoadFactorCorrectionG < 0.0);
        Assert.True(result.Command.GDemand < pilot.GDemand);
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
    public void LateralLeadErrorWalksTheNoseWithBoundedRollAndYawTowardTheSolution() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        AircraftSim aircraft = ModernAircraft();
        // Neutral pilot lateral inputs so the assist contribution is measured in isolation.
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 0.0, SasRollControl: 0.12,
            DirectLateralControl: true);
        double radians = 5.0 * DegreesToRadians;
        // Lead five degrees to the RIGHT of the boresight: a purely lateral miss.
        Vec3D lateralLead = (aircraft.BodyForward * Math.Cos(radians)
            + aircraft.BodyRight * Math.Sin(radians)).Normalized();

        GunneryPitchAssistResult result = Apply(aircraft, pilot, lateralLead);

        Assert.True(result.State.Active);
        // A purely lateral miss leaves the pitch load-factor request untouched ...
        Assert.Equal(0.0, result.State.PitchLeadErrorRad, 10);
        Assert.Equal(0.0, result.State.RequestedPitchRateRadPerSecond, 10);
        Assert.Equal(pilot.GDemand, result.Command.GDemand, 10);
        // ... but the nose is now walked toward the solution in BOTH lateral axes, toward the side
        // the lead sits on, and each stays inside the airframe's bounded lateral-assist authority.
        Assert.True(result.Command.RollControl > 0.0,
            $"expected right-roll assist toward the lead, got {result.Command.RollControl:F3}");
        Assert.True(result.Command.Rudder > 0.0,
            $"expected right-rudder assist toward the lead, got {result.Command.Rudder:F3}");
        Assert.InRange(result.Command.RollControl, 0.0,
            parameters.GunneryLateralAssistMaxRoll);
        Assert.InRange(result.Command.Rudder, 0.0,
            parameters.GunneryLateralAssistMaxYaw);
        // The assist never touches the aileron-SAS channel or the legacy bank tracker.
        Assert.Equal(pilot.SasRollControl, result.Command.SasRollControl);
        Assert.Equal(pilot.BankTarget, result.Command.BankTarget);

        // A mirror-image lead to the LEFT drives the assist the other way (sign symmetry, no bias).
        Vec3D leftLead = (aircraft.BodyForward * Math.Cos(radians)
            - aircraft.BodyRight * Math.Sin(radians)).Normalized();
        GunneryPitchAssistResult left = Apply(aircraft, pilot, leftLead);
        Assert.True(left.Command.RollControl < 0.0);
        Assert.True(left.Command.Rudder < 0.0);
    }

    [Fact]
    public void PadlockMayOwnRollWithoutDisablingPitchOrRudderConvergence() {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 0.13, DirectLateralControl: true);
        double radians = 5.0 * DegreesToRadians;
        Vec3D lateralLead = (aircraft.BodyForward * Math.Cos(radians)
            + aircraft.BodyRight * Math.Sin(radians)).Normalized();

        GunneryPitchAssistResult result = GunneryPitchAssist.Apply(
            pilot, aircraft.State, parameters, aircraft.AirspeedMps,
            aircraft.AtmosphereModel, lateralLead, hasBallisticLead: true,
            rangeM: 600.0, enabled: true, lateralRollEnabled: false);

        Assert.True(result.State.Active);
        Assert.Equal(pilot.RollControl, result.Command.RollControl, 12);
        Assert.True(result.Command.Rudder > pilot.Rudder,
            "terminal yaw walk remains available while padlock owns the roll plane");
        Assert.Equal(pilot.GDemand, result.Command.GDemand, 12);
    }

    [Fact]
    public void StablePursuitShoulderAcquiresBeforeKeyboardFineTuningRange() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 0.0, DirectLateralControl: true);
        Vec3D lead = LateralLead(aircraft, 16.0);

        // Build-237 telemetry: the useful pursuit sat at 1,371 -> 1,003 m with at least ten
        // seconds to pass. The old 1,000 m gate stayed dark while the pilot made twelve manual
        // corrections. This geometry must now get a bounded, partial acquisition pull.
        GunneryPitchAssistResult outer = Apply(aircraft, pilot, lead,
            rangeM: 1370.0, closureMps: 15.0);
        GunneryPitchAssistResult nearer = Apply(aircraft, pilot, lead,
            rangeM: 900.0, closureMps: 15.0);

        Assert.True(outer.State.Active);
        Assert.True(outer.Command.RollControl > pilot.RollControl);
        Assert.True(outer.Command.Rudder > pilot.Rudder);
        Assert.InRange(outer.Command.RollControl, 0.0, nearer.Command.RollControl);
        Assert.InRange(outer.Command.Rudder, 0.0, nearer.Command.Rudder);
        Assert.Equal(pilot.GDemand, outer.Command.GDemand, 12);
    }

    [Fact]
    public void HighClosurePassDoesNotAcquireTheSafePursuitShoulder() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 0.0, DirectLateralControl: true);

        // The same trace crossed 636 m at 484 m/s closure with a 22.3-degree miss. Chasing that
        // 1.3-second fly-by would wrench the aircraft, so new shoulder geometry stays inactive.
        AssertInactiveUnchanged(Apply(aircraft, pilot,
            LateralLead(aircraft, 22.3), rangeM: 636.0, closureMps: 484.0), pilot);

        // Existing <=14-degree/<=1 km behaviour remains available during a pass. Its historical
        // roll time-to-pass fade still applies, while yaw keeps the legacy full-authority law.
        GunneryPitchAssistResult legacy = Apply(aircraft, pilot,
            LateralLead(aircraft, 13.0), rangeM: 636.0, closureMps: 484.0);
        Assert.True(legacy.State.Active);
        Assert.True(legacy.Command.RollControl > 0.0);
        Assert.True(legacy.Command.Rudder > 0.0);
    }

    [Fact]
    public void SafePursuitRangeShoulderFadesPitchRollAndYawTogether() {
        AircraftSim aircraft = ModernAircraft();
        var pilot = new PilotCommand(1.0, 0.0, 1.0, 0.0,
            RollControl: 0.0, DirectLateralControl: true);
        Vec3D lead = TwoAxisLead(aircraft, pitchDegrees: 5.0, lateralDegrees: 5.0);

        GunneryPitchAssistResult full = Apply(aircraft, pilot, lead,
            rangeM: 900.0, closureMps: 100.0);
        GunneryPitchAssistResult shoulder = Apply(aircraft, pilot, lead,
            rangeM: 1250.0, closureMps: 100.0);

        Assert.True(full.State.Active);
        Assert.True(shoulder.State.Active);
        Assert.InRange(shoulder.State.LoadFactorCorrectionG,
            0.0, full.State.LoadFactorCorrectionG);
        Assert.InRange(shoulder.Command.RollControl,
            0.0, full.Command.RollControl);
        Assert.InRange(shoulder.Command.Rudder,
            0.0, full.Command.Rudder);
        Assert.InRange(
            shoulder.State.LoadFactorCorrectionG / full.State.LoadFactorCorrectionG,
            0.70, 0.72);
        Assert.InRange(shoulder.Command.RollControl / full.Command.RollControl,
            0.70, 0.72);
        Assert.InRange(shoulder.Command.Rudder / full.Command.Rudder,
            0.70, 0.72);
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
            rangeM: 1500.01), pilot);
        AssertInactiveUnchanged(Apply(aircraft, pilot,
            PitchLead(aircraft, 24.01)), pilot);
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
    [Fact]
    public void AssistNeverReducesADeliberateHighGPull() {
        // Pilot report (Build 80): pulling to the shoot cue was impossible without Space
        // because the damping residual subtracted from a hard pull whenever measured pitch
        // rate exceeded the assist's capture rate.
        AircraftParams air = FlightModel.F22APublicDataSurrogate;
        var state = new AircraftState(new Vec3D(0.0, 3000.0, 0.0), 250.0,
            0.0, 0.0, 0.0, air.MassKg,
            QuaternionD.Identity, new BodyRates(0.0, 0.35, 0.0));
        var pilot = new PilotCommand(8.0, 0.0, 0.9, 0.0);
        var aircraftSim = new AircraftSim(state, air);
        GunneryPitchAssistResult result = GunsOnly.Sim.GunneryPitchAssist.Apply(
            pilot, state, air, 250.0, aircraftSim.AtmosphereModel,
            new Vec3D(0.0, 0.01, 1.0), hasBallisticLead: true,
            rangeM: 600.0, enabled: true);
        Assert.True(result.Command.GDemand >= 8.0 - 1e-9,
            $"assist reduced a deliberate 8 G pull to {result.Command.GDemand:F2}");
    }

}

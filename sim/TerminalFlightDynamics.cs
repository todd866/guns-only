namespace GunsOnly.Sim;

/// <summary>
/// The deterministic physical state used after damage has made an aircraft non-controllable.
/// It is deliberately expressed through the normal engine, aerodynamic-configuration and rigid-
/// body paths: no position animation, velocity rewrite, or fall-rate shortcut lives here.
/// </summary>
internal static class TerminalFlightDynamics {
    const double CatastrophicDragIncrement = 0.24;
    const double CatastrophicNoseDownMoment = -0.055;
    const double CatastrophicAsymmetricLift = 0.18;

    public static AirframeAerodynamicState Configuration(
        in AirframeAerodynamicState survivingConfiguration, int handedness) {
        double side = handedness < 0 ? -1.0 : 1.0;
        return survivingConfiguration with {
            DragCoefficientIncrement = survivingConfiguration.DragCoefficientIncrement
                + CatastrophicDragIncrement,
            PitchMomentCoefficientIncrement =
                survivingConfiguration.PitchMomentCoefficientIncrement
                + CatastrophicNoseDownMoment,
            PersistentLateralLiftCoefficientDifference =
                survivingConfiguration.PersistentLateralLiftCoefficientDifference
                + side * CatastrophicAsymmetricLift
        };
    }

    /// <summary>
    /// Controls are no longer accepting pilot demand. Zero normal-load demand, a dead throttle and
    /// the instantaneous bank plane leave the ordinary moment model to react to the damaged shape;
    /// they do not prescribe a trajectory or angular rate.
    /// </summary>
    public static PilotCommand UncontrolledCommand(in AircraftState state) => new(
        GDemand: 0.0,
        BankTarget: state.Bank,
        Throttle: 0.0,
        Rudder: 0.0,
        RollControl: 0.0,
        SasRollControl: 0.0,
        // Uncontrolled means neutral physical surfaces plus damaged-airframe moments. It must not
        // silently re-enter the legacy bank-attitude servo merely because pilot authority ended.
        DirectLateralControl: true);

    public static void Step(AircraftSim aircraft,
        in AirframeAerodynamicState survivingConfiguration,
        int handedness, double dt) {
        ArgumentNullException.ThrowIfNull(aircraft);
        aircraft.EngineCombustionAvailable = false;
        aircraft.AerodynamicConfiguration = Configuration(
            survivingConfiguration, handedness);
        aircraft.Step(UncontrolledCommand(aircraft.State), dt);
    }
}

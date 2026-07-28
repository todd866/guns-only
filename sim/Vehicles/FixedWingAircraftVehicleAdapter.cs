namespace GunsOnly.Sim.Vehicles;

/// <summary>
/// Player-vehicle authority adapter for the existing fixed-wing simulation. The adapter owns no
/// alternate aerodynamics: after applying recurring mass truth it delegates exactly one production
/// fixed step to <see cref="AircraftSim"/>.
/// </summary>
public sealed class FixedWingAircraftVehicleAdapter : IPlayerVehicleDynamics {
    public const string ProviderId = "aircraft-sim.fixed-wing-adapter.v1";
    public const string DefaultCapabilityVersion = "player-vehicle.fixed-wing.v1";

    readonly AircraftSim _aircraft;
    long? _lastTick;

    public FixedWingAircraftVehicleAdapter(
        string vehicleId,
        AircraftSim aircraft,
        double maximumGrossMassKg,
        double maximumAdditivePayloadMassKg,
        string capabilityVersion = DefaultCapabilityVersion) {
        ArgumentNullException.ThrowIfNull(aircraft);
        PlayerVehicleValidation.Required(vehicleId, nameof(vehicleId));
        PlayerVehicleValidation.Required(capabilityVersion, nameof(capabilityVersion));
        PlayerVehicleValidation.Positive(maximumGrossMassKg,
            nameof(maximumGrossMassKg));
        PlayerVehicleValidation.NonNegative(maximumAdditivePayloadMassKg,
            nameof(maximumAdditivePayloadMassKg));
        if (maximumAdditivePayloadMassKg > maximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(maximumAdditivePayloadMassKg),
                "The payload allowance cannot exceed maximum gross mass.");
        if (aircraft.State.Mass > maximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(maximumGrossMassKg),
                "Initial AircraftSim mass exceeds the advertised maximum gross mass.");

        _aircraft = aircraft;
        Capability = new PlayerVehicleCapability(
            PlayerVehicleContract.SchemaVersion,
            capabilityVersion,
            vehicleId,
            ProviderId,
            PlayerVehicleKind.FixedWing,
            VehicleCommandFamily.FixedWingPilot,
            VehicleContactAuthority.ExternalResolver,
            PlayerVehicleContract.FixedStepHz,
            maximumGrossMassKg,
            maximumAdditivePayloadMassKg,
            ReportsPowerMargin: false,
            ReportsWindResponse: true,
            ReportsProtectionInterventionEvidence: true,
            FidelityDisclosure:
                "Delegates one 120 Hz step to the existing AircraftSim without changing its "
                + "aerodynamic, propulsion, wind, or ground-contact behavior. Power margin is "
                + "not assessed by this adapter; contact truth remains externally resolved.");
        PlayerVehicleValidation.Capability(Capability);

        VehicleContactState initialContact = aircraft.BelowGround
            ? new VehicleContactState(
                VehicleContactKind.SurfaceContact,
                "legacy-ground",
                new Vec3D(0.0, 1.0, 0.0),
                0.0)
            : VehicleContactState.Airborne;
        State = BuildState(
            tick: -1,
            recurringBaseMassKg: aircraft.State.Mass,
            additivePayloadMassKg: 0.0,
            initialContact);
        Observation = BuildObservation(
            tick: -1,
            initialContact,
            VehicleProtectionInterventionEvidence.None);
    }

    public PlayerVehicleCapability Capability { get; }

    /// <summary>The wrapped legacy simulation, exposed for existing session integration.</summary>
    public AircraftSim Aircraft => _aircraft;

    public PlayerVehicleState State { get; private set; }
    public PlayerVehicleObservation Observation { get; private set; }

    public PlayerVehicleAdvanceResult Advance(in PlayerVehicleAdvanceInput input) {
        PlayerVehicleValidation.AdvanceInput(
            input,
            VehicleCommandFamily.FixedWingPilot,
            _lastTick);
        ValidateMass(input.RecurringBaseMassKg, input.AdditivePayloadMassKg);

        double grossMassKg =
            input.RecurringBaseMassKg + input.AdditivePayloadMassKg;
        _aircraft.SetMassKg(grossMassKg);
        _aircraft.Step(
            input.Command.FixedWing,
            PlayerVehicleContract.FixedDeltaSeconds);

        State = BuildState(
            input.Tick,
            input.RecurringBaseMassKg,
            input.AdditivePayloadMassKg,
            input.ExternalContact);
        Observation = BuildObservation(
            input.Tick,
            input.ExternalContact,
            input.ProtectionIntervention);
        _lastTick = input.Tick;
        return new PlayerVehicleAdvanceResult(State, Observation);
    }

    void ValidateMass(double recurringBaseMassKg, double additivePayloadMassKg) {
        if (additivePayloadMassKg > Capability.MaximumAdditivePayloadMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(additivePayloadMassKg),
                "Payload mass exceeds the vehicle capability.");
        double grossMassKg = recurringBaseMassKg + additivePayloadMassKg;
        if (!double.IsFinite(grossMassKg)
            || grossMassKg > Capability.MaximumGrossMassKg)
            throw new ArgumentOutOfRangeException(
                nameof(recurringBaseMassKg),
                "Recurring base plus payload exceeds maximum gross mass.");
    }

    PlayerVehicleState BuildState(
        long tick,
        double recurringBaseMassKg,
        double additivePayloadMassKg,
        in VehicleContactState contact) {
        AircraftState aircraftState = _aircraft.State;
        return new PlayerVehicleState(
            PlayerVehicleContract.SchemaVersion,
            tick,
            Capability.VehicleId,
            aircraftState.Position,
            aircraftState.VelocityVector(),
            aircraftState.BodyAttitude,
            aircraftState.BodyRates,
            recurringBaseMassKg,
            additivePayloadMassKg,
            aircraftState.Mass,
            contact,
            IsFlyable(contact));
    }

    PlayerVehicleObservation BuildObservation(
        long tick,
        in VehicleContactState contact,
        in VehicleProtectionInterventionEvidence protectionIntervention) {
        AircraftState aircraftState = _aircraft.State;
        Vec3D groundVelocity = aircraftState.VelocityVector();
        Vec3D airVelocity = _aircraft.AirVelocity;
        Vec3D windVelocity = groundVelocity - airVelocity;
        return new PlayerVehicleObservation(
            PlayerVehicleContract.SchemaVersion,
            tick,
            Capability.VehicleId,
            aircraftState.Position,
            groundVelocity,
            airVelocity,
            windVelocity,
            groundVelocity.Length,
            _aircraft.AirspeedMps,
            groundVelocity.Y,
            _aircraft.BodyPitchRad,
            _aircraft.BodyRollRad,
            _aircraft.BodyYawRad,
            aircraftState.Mass,
            VehiclePowerObservation.NotAssessed,
            contact,
            protectionIntervention,
            IsFlyable(contact));
    }

    bool IsFlyable(in VehicleContactState contact) =>
        !_aircraft.BelowGround
        && contact.Kind != VehicleContactKind.HardImpact;
}

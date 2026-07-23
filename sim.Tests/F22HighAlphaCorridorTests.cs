namespace GunsOnly.Sim.Tests;

/// <summary>
/// Public-data validation corridors adopted in docs/f22-high-alpha-review.md. These tests pin
/// direction and broad capability bands, not an unpublished F-22 aerodynamic/control-law deck.
/// </summary>
public sealed class F22HighAlphaCorridorTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Degrees = 180.0 / Math.PI;
    const double MpsPerKnot = 0.514444;
    const double CorridorAltitudeM = 1000.0;
    const double CorridorMassKg = 22_000.0;

    static AircraftSim AtAlpha(double alphaDegrees, double casKnots,
        double betaDegrees = 0.0, double altitudeM = CorridorAltitudeM) {
        double alpha = alphaDegrees / Degrees;
        double beta = betaDegrees / Degrees;
        var bodyRight = new Vec3D(Math.Cos(beta), 0.0, Math.Sin(beta));
        var bodyUp = new Vec3D(Math.Sin(alpha) * Math.Sin(beta), Math.Cos(alpha),
            -Math.Sin(alpha) * Math.Cos(beta));
        var bodyForward = bodyRight.Cross(bodyUp).Normalized();
        var attitude = QuaternionD.FromFrame(bodyRight, bodyUp, bodyForward);
        double tas = AirData.TrueAirspeedForCalibratedAirspeedMps(
            casKnots * MpsPerKnot, altitudeM);
        var state = new AircraftState(new Vec3D(0.0, altitudeM, 0.0), tas,
            0.0, 0.0, 0.0, CorridorMassKg, attitude, default);
        return new AircraftSim(state, FlightModel.F22APublicDataSurrogate);
    }

    static PilotCommand AlphaCommand(double alphaDegrees, double throttle,
        double roll = 0.0, double rudder = 0.0) => new(
            GDemand: 1.0,
            BankTarget: 0.0,
            Throttle: throttle,
            Rudder: rudder,
            RollControl: roll,
            CommandedAlphaRad: alphaDegrees / Degrees,
            DirectLateralControl: true);

    [Fact]
    public void F22DoesNotInheritGenericSeparatedFlowDepartureInjection() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;

        Assert.Equal(0.0, f22.StallRollCoupling);
        Assert.Equal(0.0, f22.StallYawCoupling);
        Assert.Equal(0.0, f22.StallPitchBreakNm);
        Assert.True(double.IsFinite(f22.PostStallDragMax));

        // Containment is F-22-only. The legacy generic/F-86 and Su-27 surrogate parameters remain
        // unchanged while their existing accuracy/golden tests continue to pin their trajectories.
        Assert.Equal(0.20, FlightModel.Sabre.StallRollCoupling);
        Assert.Equal(0.34, FlightModel.Sabre.StallYawCoupling);
        Assert.Equal(26_000.0, FlightModel.Sabre.StallPitchBreakNm);
        Assert.Equal(0.20, FlightModel.Su27SPublicDataSurrogate.StallRollCoupling);
        Assert.Equal(0.34, FlightModel.Su27SPublicDataSurrogate.StallYawCoupling);
        Assert.Equal(26_000.0, FlightModel.Su27SPublicDataSurrogate.StallPitchBreakNm);
    }

    [Theory]
    [InlineData(18.0, 1.4720, -0.3240)]
    [InlineData(36.0, 2.4500, 0.1000)]
    [InlineData(45.0, 2.3500, 0.3000)]
    [InlineData(60.0, 2.0000, 0.2500)]
    [InlineData(90.0, 1.2500, 0.0000)]
    public void BodyAxisForceScheduleHasTransparentReviewKnots(double alphaDegrees,
        double expectedCn, double expectedCa) {
        var (cn, ca) = FlightModel.F22BodyAxisCoefficients(alphaDegrees / Degrees);

        Assert.Equal(expectedCn, cn, 10);
        Assert.Equal(expectedCa, ca, 10);
    }

    [Fact]
    public void GenericPostStallPolarRemainsBitIdenticalForSabreAndSu27() {
        // Exact pre-change values at the adopted review stations. The F-22-only CN/CA branch must
        // never perturb the existing generic exponential curve used by these two airframes.
        Assert.Equal(0.39082327904804254,
            FlightModel.LiftCoefficient(36.0 / Degrees, FlightModel.Sabre));
        Assert.Equal(0.09522108451578758,
            FlightModel.LiftCoefficient(60.0 / Degrees, FlightModel.Sabre));
        Assert.Equal(0.7398380108124869,
            FlightModel.LiftCoefficient(36.0 / Degrees,
                FlightModel.Su27SPublicDataSurrogate));
        Assert.Equal(0.18025583820688437,
            FlightModel.LiftCoefficient(60.0 / Degrees,
                FlightModel.Su27SPublicDataSurrogate));
    }

    [Fact]
    public void EngineOutZeroQPitchAndYawAuthorityCollapseToZero() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var attitude = QuaternionD.Identity;
        var raw = new RawState(new Vec3D(0.0, CorridorAltitudeM, 0.0), Vec3D.Zero,
            0.0, CorridorMassKg, attitude, default);
        var command = AlphaCommand(60.0, throttle: 0.0, rudder: 1.0);

        StateDeriv unpowered = FlightModel.Derivatives(raw, command, f22,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            pitchThrustVectorAngleRad: f22.PitchThrustVectorMaxRad);
        StateDeriv powered = FlightModel.Derivatives(raw, command, f22,
            new Vec3D(0.0, 1.0, 0.0), Vec3D.Zero, netThrustN: f22.ThrustMaxN,
            AirframeAerodynamicState.Clean, StandardAtmosphere1976.Instance,
            pitchThrustVectorAngleRad: f22.PitchThrustVectorMaxRad);

        Assert.Equal(0.0, unpowered.DBodyRates.Q, 12);
        Assert.Equal(0.0, unpowered.DBodyRates.R, 12);
        Assert.True(powered.DBodyRates.Q > 0.5,
            "current thrust must be the only zero-q source of pitch control authority");
    }

    [Fact]
    public void NozzleEngagesFromAeroDeficiencyAndObeysTravelAndRateStops() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = AtAlpha(alphaDegrees: 10.0, casKnots: 30.0);
        PilotCommand command = AlphaCommand(60.0, f22.MaxThrustFraction);

        sim.Step(command, Dt);
        double firstStep = Math.Abs(sim.LastPitchThrustVectorAngleRad);
        Assert.InRange(firstStep, 1e-6,
            f22.PitchThrustVectorNozzleRateRadPerSecond * Dt + 1e-12);
        Assert.Equal(PullLimitReason.TvcSaturated, sim.PullLimit.Reason);

        double previous = firstStep;
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
            sim.Step(command, Dt);
            double current = Math.Abs(sim.LastPitchThrustVectorAngleRad);
            Assert.True(current - previous
                <= f22.PitchThrustVectorNozzleRateRadPerSecond * Dt + 1e-12);
            Assert.True(current <= f22.PitchThrustVectorMaxRad + 1e-12);
            previous = current;
        }
    }

    [Fact]
    public void PullLimitStatusDistinguishesAeroStructuralAndTvcLimits() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim aeroLimited = AtAlpha(5.0, 70.0);
        aeroLimited.Step(new PilotCommand(9.0, 0.0, 1.0, 0.0,
            DirectLateralControl: true), Dt);
        Assert.Equal(PullLimitReason.AerodynamicClMax, aeroLimited.PullLimit.Reason);

        AircraftSim structural = AtAlpha(5.0, 500.0);
        structural.Step(new PilotCommand(f22.PositiveStructuralLimitG, 0.0, 1.0, 0.0,
            DirectLateralControl: true), Dt);
        Assert.Equal(PullLimitReason.Structural, structural.PullLimit.Reason);

        AircraftSim tvcLimited = AtAlpha(10.0, 30.0);
        tvcLimited.Step(AlphaCommand(60.0, f22.MaxThrustFraction), Dt);
        Assert.Equal(PullLimitReason.TvcSaturated, tvcLimited.PullLimit.Reason);
    }

    [Fact]
    public void ThirtySixDegreeSlowPassStaysInPublishedMilPowerCorridor() {
        AircraftSim sim = AtAlpha(alphaDegrees: 36.0, casKnots: 80.0);
        PilotCommand command = AlphaCommand(36.0, throttle: 1.0);
        double minAlpha = double.PositiveInfinity;
        double maxAlpha = double.NegativeInfinity;
        double minCas = double.PositiveInfinity;
        double maxCas = 0.0;

        for (int tick = 0; tick < 6 * AircraftSim.TickHz; tick++) {
            sim.Step(command, Dt);
            minAlpha = Math.Min(minAlpha, sim.AngleOfAttackRad * Degrees);
            maxAlpha = Math.Max(maxAlpha, sim.AngleOfAttackRad * Degrees);
            double cas = sim.IndicatedAirspeedMps / MpsPerKnot;
            minCas = Math.Min(minCas, cas);
            maxCas = Math.Max(maxCas, cas);
        }

        Assert.InRange(minAlpha, 30.0, 36.5);
        Assert.InRange(maxAlpha, 35.0, 40.0); // AFMAN demo limit, not a point target.
        Assert.InRange(minCas, 70.0, 85.0);
        Assert.InRange(maxCas, 80.0, 100.0);
        Assert.InRange(sim.State.Position.Y - CorridorAltitudeM, -150.0, 250.0);
    }

    [Fact]
    public void MaxThrustRetainsControlledTrimNearSixtyDegrees() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = AtAlpha(alphaDegrees: 60.0, casKnots: 90.0);
        // The adopted hard-stop target is 60-63 degrees; command the upper edge and assert the
        // achieved, controlled state stays near sixty rather than treating 63 as an exact result.
        PilotCommand command = AlphaCommand(63.0, f22.MaxThrustFraction);
        double settledMinAlpha = double.PositiveInfinity;
        double settledMaxAlpha = double.NegativeInfinity;
        double maxBeta = 0.0;

        for (int tick = 0; tick < 5 * AircraftSim.TickHz; tick++) {
            sim.Step(command, Dt);
            if (tick >= AircraftSim.TickHz) {
                settledMinAlpha = Math.Min(settledMinAlpha,
                    sim.AngleOfAttackRad * Degrees);
                settledMaxAlpha = Math.Max(settledMaxAlpha,
                    sim.AngleOfAttackRad * Degrees);
            }
            maxBeta = Math.Max(maxBeta, Math.Abs(sim.SideslipRad) * Degrees);
        }

        Assert.InRange(settledMinAlpha, 50.0, 61.0);
        Assert.InRange(settledMaxAlpha, 57.0, 63.0);
        Assert.True(maxBeta < 5.0, $"symmetric trim generated {maxBeta:F1} deg beta");
        Assert.True(sim.State.BodyAttitude.IsFinite && sim.State.BodyRates.IsFinite);
    }

    [Fact]
    public void LoadedRollUsesRealStabilityAxisRateWithoutDeparture() {
        AircraftSim sim = AtAlpha(alphaDegrees: 33.0, casKnots: 130.0);
        PilotCommand command = AlphaCommand(33.0, throttle: 1.0, roll: 1.0, rudder: 0.5);
        double maxStabilityRollRate = 0.0;
        double maxBeta = 0.0;
        double minAlpha = double.PositiveInfinity;
        double maxAlpha = double.NegativeInfinity;

        for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
            sim.Step(command, Dt);
            double alpha = sim.AngleOfAttackRad;
            double stabilityRollRate = sim.State.BodyRates.P * Math.Cos(alpha)
                + sim.State.BodyRates.R * Math.Sin(alpha);
            maxStabilityRollRate = Math.Max(maxStabilityRollRate,
                Math.Abs(stabilityRollRate) * Degrees);
            maxBeta = Math.Max(maxBeta, Math.Abs(sim.SideslipRad) * Degrees);
            minAlpha = Math.Min(minAlpha, alpha * Degrees);
            maxAlpha = Math.Max(maxAlpha, alpha * Degrees);
        }

        Assert.InRange(maxStabilityRollRate, 45.0, 150.0);
        Assert.InRange(minAlpha, 28.0, 36.0);
        Assert.InRange(maxAlpha, 30.0, 40.0);
        Assert.True(maxBeta < 12.0, $"loaded roll departed to {maxBeta:F1} deg beta");
    }

    [Fact]
    public void PerturbedBetaJTurnDoesNotSpontaneouslyAutorotate() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        AircraftSim sim = AtAlpha(alphaDegrees: 18.0, casKnots: 90.0, betaDegrees: 5.0);
        PilotCommand entry = AlphaCommand(60.0, f22.MaxThrustFraction,
            roll: 0.55, rudder: 0.65);
        double maxBeta = 0.0;
        double maxAlpha = 0.0;
        double maxStabilityRollRate = 0.0;

        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            sim.Step(entry, Dt);
            double alpha = sim.AngleOfAttackRad;
            maxAlpha = Math.Max(maxAlpha, alpha * Degrees);
            maxBeta = Math.Max(maxBeta, Math.Abs(sim.SideslipRad) * Degrees);
            double stabilityRollRate = sim.State.BodyRates.P * Math.Cos(alpha)
                + sim.State.BodyRates.R * Math.Sin(alpha);
            maxStabilityRollRate = Math.Max(maxStabilityRollRate,
                Math.Abs(stabilityRollRate) * Degrees);
        }

        Assert.InRange(maxAlpha, 50.0, 63.0);
        Assert.InRange(maxStabilityRollRate, 15.0, 120.0);
        Assert.True(maxBeta < 25.0, $"J-turn exceeded bounded beta at {maxBeta:F1} deg");
        Assert.True(sim.State.BodyAttitude.IsFinite && sim.State.BodyRates.IsFinite);
    }

    [Fact]
    public void TailSlideCrossesZeroWithPitchControlAndBoundedBeta() {
        AircraftParams f22 = FlightModel.F22APublicDataSurrogate;
        var bodyForward = new Vec3D(0.0, 1.0, 0.0);
        var bodyUp = new Vec3D(0.0, 0.0, -1.0);
        var attitude = QuaternionD.FromFrame(bodyUp.Cross(bodyForward), bodyUp, bodyForward);
        var state = new AircraftState(new Vec3D(0.0, 1500.0, 0.0), 15.0,
            Math.PI / 2.0, 0.0, 0.0, CorridorMassKg, attitude, default);
        var sim = new AircraftSim(state, f22);
        PilotCommand command = AlphaCommand(60.0, throttle: 0.50);
        double minimumSpeed = double.PositiveInfinity;
        double tvcMomentNearestZero = 0.0;
        double maxBeta = 0.0;
        double minimumVerticalVelocity = double.PositiveInfinity;

        for (int tick = 0; tick < 8 * AircraftSim.TickHz; tick++) {
            sim.Step(command, Dt);
            double speed = sim.AirspeedMps;
            if (speed < minimumSpeed) {
                minimumSpeed = speed;
                tvcMomentNearestZero = Math.Abs(sim.LastPitchThrustVectorMomentNm);
            }
            minimumVerticalVelocity = Math.Min(minimumVerticalVelocity, sim.AirVelocity.Y);
            maxBeta = Math.Max(maxBeta, Math.Abs(sim.SideslipRad) * Degrees);
        }

        Assert.True(minimumSpeed < 5.0,
            $"tail slide never traversed the zero-speed corridor: {minimumSpeed:F1} m/s");
        Assert.True(minimumVerticalVelocity < -5.0,
            $"aircraft never reversed into the slide: Vy {minimumVerticalVelocity:F1} m/s");
        Assert.True(tvcMomentNearestZero > 50_000.0,
            $"pitch control vanished near zero q: {tvcMomentNearestZero:F0} N m");
        Assert.True(maxBeta < 30.0, $"tail slide diverged to {maxBeta:F1} deg beta");
        Assert.True(sim.State.BodyAttitude.IsFinite && sim.State.BodyRates.IsFinite);
    }
}

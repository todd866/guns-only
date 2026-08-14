using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Deterministic closed-loop flight cards. The aircraft starts at the landing-configuration
/// placard and flies the production SortieSchedule through deceleration, groove, flare, contact,
/// and rollout. Every subsequent position, speed and attitude comes from AircraftSim or the runway
/// rollout model. There are no teleports after the card begins.
/// </summary>
public sealed class RecoveryProfileFlightTests(ITestOutputHelper output) {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double GlideslopeRad = 3.0 * Math.PI / 180.0;

    [Fact]
    public void F22ProfileFliesFromStabilisedFinalToAFullStop() =>
        FlyToStop(
            "F-22",
            FlightModel.F22APublicDataSurrogate,
            AirframeSystemsProfile.ModernConventionalGearSurrogate);

    [Fact]
    public void RapierProfileFliesFromStabilisedFinalToAFullStop() =>
        FlyToStop(
            "Rapier",
            FlightModel.RapierPublicDataSurrogate,
            AirframeSystemsProfile.RapierSurrogate);

    void FlyToStop(
        string label,
        AircraftParams air,
        AirframeSystemsProfile systems) {
        var runway = new ConventionalRunway(
            $"runway.{label.ToLowerInvariant()}.flight-test.v1",
            $"{label} deterministic recovery card",
            threshold: Vec3D.Zero,
            headingRad: 0.0,
            lengthM: 3_200.0,
            widthM: 45.0,
            touchdownAimAlongM: 450.0);
        double onSpeedKcasMps = SortieSchedule.ApproachCalibratedAirspeedMps(
            air.MassKg, air, systems);
        var recovery = new ConventionalRunwayRecoveryModel(runway,
            new ConventionalLandingEnvelope(
                MinimumAirspeedMps: 0.82 * onSpeedKcasMps,
                MaximumAirspeedMps: 1.25 * onSpeedKcasMps));

        AirframeAerodynamicState landing = systems.FullLandingAerodynamicState;
        const double stabiliseDistanceM = 1_500.0;
        double stabiliseHeightM = stabiliseDistanceM * Math.Tan(GlideslopeRad);
        double onSpeed = SortieSchedule.ApproachTrueAirspeedMps(
            air.MassKg, air, systems, stabiliseHeightM);
        double dragToWeight = SortieSchedule.RecoveryDragToWeight(
            air.MassKg, air, systems, stabiliseHeightM);
        var reference = new SortieReference(
            ApproachSpeedMps: onSpeed,
            ClimbSpeedMps: 2.2 * onSpeed,
            TransitSpeedMps: 2.7 * onSpeed,
            TransitHeightM: 4_500.0,
            StabiliseHeightM: stabiliseHeightM,
            GlideslopeRad: GlideslopeRad,
            DragToWeight: dragToWeight,
            SpoolUpTauS: air.SpoolUpTau,
            ConfigurationCeilingMps: AirData.TrueAirspeedForCalibratedAirspeedMps(
                systems.GearAndFlapLimitKias / AirData.MpsToKnots,
                stabiliseHeightM),
            FlareTrackM: 600.0,
            RecoveryProfileFitted: true);
        double decelerationTrackM = SortieSchedule.RecoveryDecelerationTrackM(reference);
        double distanceToAimM = stabiliseDistanceM + decelerationTrackM;
        double startAlongM = runway.TouchdownAimAlongM - distanceToAimM;
        double startHeightM = recovery.ReferenceHeightM + stabiliseHeightM
            + decelerationTrackM * Math.Tan(GlideslopeRad);
        var initial = new AircraftState(
            runway.SurfacePoint(startAlongM) + new Vec3D(0.0, startHeightM, 0.0),
            Speed: SortieSchedule.RecoveryEntrySpeedMps(reference),
            Gamma: -GlideslopeRad,
            Chi: runway.HeadingRad,
            Bank: 0.0,
            Mass: air.MassKg);
        var aircraft = new AircraftSim(initial, air, StandardAtmosphere1976.Instance) {
            AerodynamicConfiguration = landing
        };

        double trimThrustFraction = Math.Max(0.0,
            dragToWeight - Math.Sin(GlideslopeRad));
        double trimThrottle = Math.Clamp(
            trimThrustFraction * air.MassKg * FlightModel.G0
                / Math.Max(air.ThrustMaxN, 1.0),
            0.04,
            0.80);
        aircraft.SeedEnginePowerFraction(trimThrottle);

        double speedIntegral = 0.0;
        double peakGlideErrorM = 0.0;
        double peakSpeedErrorMps = 0.0;
        double peakSlowMps = 0.0;
        double peakFastMps = 0.0;
        double firstSurfaceCrossAlongM = double.NaN;
        double previousHeightM = startHeightM;
        int airborneTicks = 0;
        for (; airborneTicks < 300 * AircraftSim.TickHz
            && recovery.Phase == RunwayRecoveryPhase.Airborne; airborneTicks++) {
            AircraftState previous = aircraft.State;
            var frame = runway.Frame(previous.Position);
            if (!double.IsFinite(firstSurfaceCrossAlongM)
                && previousHeightM > recovery.ReferenceHeightM
                && frame.height <= recovery.ReferenceHeightM)
                firstSurfaceCrossAlongM = frame.along;
            previousHeightM = frame.height;
            double remainingM = runway.TouchdownAimAlongM - frame.along;
            SortieLeg leg = remainingM <= stabiliseDistanceM
                ? SortieLeg.Groove
                : SortieLeg.Recovery;
            double scheduleDistanceM = leg == SortieLeg.Groove
                ? Math.Max(0.0, remainingM)
                : Math.Max(0.0, remainingM - stabiliseDistanceM);
            SortieScheduleState schedule = SortieSchedule.Solve(
                leg,
                frame.height,
                aircraft.AirspeedMps,
                scheduleDistanceM,
                reference);
            Assert.True(schedule.Valid);
            double targetHeightM = recovery.ReferenceHeightM + schedule.TargetHeightM;
            double heightErrorM = targetHeightM - frame.height;
            peakGlideErrorM = Math.Max(peakGlideErrorM, Math.Abs(heightErrorM));

            double speedErrorMps = schedule.TargetSpeedMps - aircraft.AirspeedMps;
            peakSpeedErrorMps = Math.Max(peakSpeedErrorMps, Math.Abs(speedErrorMps));
            peakSlowMps = Math.Max(peakSlowMps, speedErrorMps);
            peakFastMps = Math.Max(peakFastMps, -speedErrorMps);
            speedIntegral = Math.Clamp(speedIntegral + speedErrorMps * Dt, -20.0, 20.0);
            double throttle = Math.Clamp(
                trimThrottle
                    + 0.45 * (schedule.CommandedPower01 - 0.5)
                    + 0.018 * speedErrorMps
                    + 0.0025 * speedIntegral,
                0.0,
                1.0);

            double desiredGamma = -GlideslopeRad
                + Math.Clamp(heightErrorM / 250.0, -0.080, 0.080);
            if (remainingM < 240.0)
                desiredGamma = -0.012 + Math.Clamp(heightErrorM / 180.0, -0.035, 0.055);

            AtmosphericState atmosphere = aircraft.AtmosphericState;
            double q = 0.5 * atmosphere.DensityKgM3
                * aircraft.AirspeedMps * aircraft.AirspeedMps;
            double requiredCl = air.MassKg * FlightModel.G0
                / Math.Max(q * air.WingAreaM2, 1.0);
            double trimAlpha = (requiredCl - landing.LiftCoefficientIncrement)
                / Math.Max(air.CLAlpha, 1e-6);
            double commandedPitch = Math.Clamp(
                desiredGamma + trimAlpha,
                -5.0 * Math.PI / 180.0,
                20.0 * Math.PI / 180.0);

            aircraft.Step(new PilotCommand(
                GDemand: 1.0,
                BankTarget: 0.0,
                Throttle: throttle,
                Rudder: 0.0,
                CommandedPitchRad: commandedPitch), Dt);

            recovery.TryTouchdown(
                previous,
                aircraft.State,
                gearDownAndLocked: true,
                airspeedMps: aircraft.IndicatedAirspeedMps);
        }

        var finalAirborneFrame = runway.Frame(aircraft.State.Position);
        Assert.True(recovery.Phase == RunwayRecoveryPhase.Rollout,
            $"{label} remained {recovery.Phase} after {airborneTicks * Dt:F1}s: "
            + $"along {finalAirborneFrame.along:F0} m, height {finalAirborneFrame.height:F1} m, "
            + $"TAS {aircraft.AirspeedMps * AirData.MpsToKnots:F1} kt, "
            + $"gamma {aircraft.State.Gamma * 180.0 / Math.PI:F1} deg, "
            + $"first surface crossing {firstSurfaceCrossAlongM:F0} m, "
            + $"peak path error {peakGlideErrorM:F1} m");
        Assert.True(recovery.Touchdown.Survivable,
            $"{label} touchdown: {recovery.Touchdown.Deviations}");
        Assert.InRange(recovery.Touchdown.AlongM, 0.0, 1_200.0);
        Assert.InRange(recovery.Touchdown.SinkRateMps, 0.0, 4.0);
        Assert.InRange(recovery.Touchdown.AirspeedMps,
            0.82 * onSpeedKcasMps, 1.25 * onSpeedKcasMps);
        Assert.InRange(peakGlideErrorM, 0.0, 25.0);
        Assert.InRange(peakSpeedErrorMps * AirData.MpsToKnots, 0.0, 20.0);

        int rolloutTicks = 0;
        for (; rolloutTicks < 120 * AircraftSim.TickHz
            && recovery.Phase == RunwayRecoveryPhase.Rollout; rolloutTicks++)
            recovery.Step(Dt, throttleFraction: 0.0);

        Assert.Equal(RunwayRecoveryPhase.Recovered, recovery.Phase);
        Assert.True(runway.ContainsPavement(recovery.State.Position));
        Assert.Equal(0.0, recovery.State.Speed, precision: 8);
        output.WriteLine(
            $"{label}: Vref {onSpeedKcasMps * AirData.MpsToKnots:F1} KIAS, "
            + $"landing D/W {dragToWeight:F3}, touchdown {recovery.Touchdown.AlongM:F0} m, "
            + $"{recovery.Touchdown.AirspeedMps * AirData.MpsToKnots:F1} kt, "
            + $"sink {recovery.Touchdown.SinkRateMps:F2} m/s, stop "
            + $"{runway.Frame(recovery.State.Position).along:F0} m, "
            + $"peak glide error {peakGlideErrorM:F1} m, "
            + $"decel track {decelerationTrackM / 1_852.0:F1} NM, "
            + $"peak slow/fast {peakSlowMps * AirData.MpsToKnots:F1}/"
            + $"{peakFastMps * AirData.MpsToKnots:F1} kt, "
            + $"airborne {airborneTicks * Dt:F1} s, rollout {rolloutTicks * Dt:F1} s.");
    }
}

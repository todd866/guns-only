namespace GunsOnly.Sim;

/// <summary>
/// Observable state of the bounded player gunnery aid. RequestedPitchRate is the rate needed to
/// converge the body-fixed gun line on the ballistic lead direction. PitchRateError is that rate
/// minus measured body q; only this residual is converted into a protected load-factor correction.
/// </summary>
public readonly record struct GunneryPitchAssistState(
    bool Active,
    double TotalLeadErrorRad,
    double PitchLeadErrorRad,
    double RequestedPitchRateRadPerSecond,
    double MeasuredPitchRateRadPerSecond,
    double PitchRateErrorRadPerSecond,
    double AssistedLoadFactorG,
    double LoadFactorCorrectionG) {
    public static GunneryPitchAssistState Inactive(double pilotLoadFactorG = 1.0) =>
        new(false, 0.0, 0.0, 0.0, 0.0, 0.0, pilotLoadFactorG, 0.0);
}

public readonly record struct GunneryPitchAssistResult(
    PilotCommand Command,
    GunneryPitchAssistState State);

/// <summary>
/// Bounded two-axis lead convergence: a pitch load-factor correction plus an optional lateral
/// (roll + rudder) pull, both driven off the ballistic lead direction. It cannot acquire a target,
/// fire, exceed the protected envelope, or operate during an explicit pitch/alpha override, and the
/// lateral half stays off entirely for any airframe that leaves its lateral gains at zero.
/// </summary>
public static class GunneryPitchAssist {
    public static GunneryPitchAssistResult Apply(
        in PilotCommand pilotCommand,
        in AircraftState aircraft,
        in AircraftParams parameters,
        double airspeedMps,
        IAtmosphereModel atmosphere,
        in Vec3D ballisticLeadDirection,
        bool hasBallisticLead,
        double rangeM,
        bool enabled,
        bool lateralRollEnabled = true) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        GunneryPitchAssistResult inactive = new(pilotCommand,
            GunneryPitchAssistState.Inactive(pilotCommand.GDemand));

        if (!enabled || !hasBallisticLead
            || parameters.GunneryPitchAssistMaxRateRad <= 0.0
            || parameters.GunneryPitchAssistCaptureAngleRad <= 0.0
            || parameters.GunneryPitchAssistMaxRangeM <= 0.0
            || parameters.GunneryPitchAssistGainPerSecond <= 0.0
            || parameters.GunneryPitchAssistMaxCorrectionG <= 0.0
            || pilotCommand.EnvelopeOverride
            || double.IsFinite(pilotCommand.CommandedAlphaRad)
            || double.IsFinite(pilotCommand.CommandedPitchRad)
            || !double.IsFinite(rangeM) || rangeM <= 0.0
            || rangeM > parameters.GunneryPitchAssistMaxRangeM
            || !double.IsFinite(airspeedMps) || airspeedMps <= 1.0
            || !aircraft.BodyRates.IsFinite
            || !aircraft.BodyAttitude.IsFinite
            || aircraft.BodyAttitude.LengthSquared < 1e-12
            || !IsFinite(ballisticLeadDirection)
            || ballisticLeadDirection.Length < 1e-9)
            return inactive;

        Vec3D lead = ballisticLeadDirection.Normalized();
        QuaternionD attitude = aircraft.BodyAttitude.Normalized();
        Vec3D bodyForward = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        double forwardProjection = lead.Dot(bodyForward);
        double totalError = System.Math.Acos(System.Math.Clamp(forwardProjection, -1.0, 1.0));
        if (forwardProjection <= 0.0
            || totalError > parameters.GunneryPitchAssistCaptureAngleRad)
            return inactive;

        // Removing the body-right component is implicit in atan2(up, forward): lateral miss angle
        // gates capture through totalError, but only the vertical component may alter the command.
        double pitchError = System.Math.Atan2(lead.Dot(bodyUp), forwardProjection);
        double requestedPitchRate = System.Math.Clamp(
            parameters.GunneryPitchAssistGainPerSecond * pitchError,
            -parameters.GunneryPitchAssistMaxRateRad,
            parameters.GunneryPitchAssistMaxRateRad);
        double measuredPitchRate = aircraft.BodyRates.Q;
        double pitchRateError = requestedPitchRate - measuredPitchRate;

        // The production law has the incremental relation delta-q = delta-n * g / V. Subtract
        // measured q from desired convergence rate, then add only that residual to the player's
        // protected G request. This behaves as a damped augmentation rather than replacing the
        // pilot's pull with a second absolute pitch-rate controller.
        double rateCorrectionG = pitchRateError * airspeedMps / FlightModel.G0;
        double protectedMaximum = Protection.MaxPerformG(
            aircraft, parameters, airspeedMps, atmosphere);
        double protectedMinimum = System.Math.Max(FlightModel.NzAeroMin(
            aircraft, parameters, airspeedMps, atmosphere), -1.5);
        double lower = System.Math.Min(protectedMinimum, protectedMaximum);
        double correction = System.Math.Clamp(rateCorrectionG,
            -parameters.GunneryPitchAssistMaxCorrectionG,
            parameters.GunneryPitchAssistMaxCorrectionG);
        double assistedLoadFactor = System.Math.Clamp(
            pilotCommand.GDemand + correction, lower, protectedMaximum);
        correction = assistedLoadFactor - pilotCommand.GDemand;

        // Lateral (roll + yaw) convergence: the horizontal analogue of the pitch aid. The signed
        // lateral miss angle is the lead's body-right component; a positive value (lead to the right)
        // asks for right roll and right rudder, both proportional to that angle and therefore exactly
        // zero when the nose is already aligned. Each is clamped, then added to the pilot's own
        // lateral commands (themselves clamped to unit authority). This banks toward the target and
        // walks the nose across, so a keyboard pilot converts by pointing roughly at the bandit -- it
        // never fires and never alters the ballistic path the fired rounds actually fly.
        Vec3D bodyRight = attitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        double lateralError = System.Math.Atan2(lead.Dot(bodyRight), forwardProjection);
        double rollAssist = lateralRollEnabled
            ? System.Math.Clamp(
                parameters.GunneryLateralAssistRollGain * lateralError,
                -parameters.GunneryLateralAssistMaxRoll,
                parameters.GunneryLateralAssistMaxRoll)
            : 0.0;
        double yawAssist = System.Math.Clamp(
            parameters.GunneryLateralAssistYawGain * lateralError,
            -parameters.GunneryLateralAssistMaxYaw,
            parameters.GunneryLateralAssistMaxYaw);
        double assistedRoll = System.Math.Clamp(pilotCommand.RollControl + rollAssist, -1.0, 1.0);
        double assistedRudder = System.Math.Clamp(pilotCommand.Rudder + yawAssist, -1.0, 1.0);

        var state = new GunneryPitchAssistState(
            Active: true,
            TotalLeadErrorRad: totalError,
            PitchLeadErrorRad: pitchError,
            RequestedPitchRateRadPerSecond: requestedPitchRate,
            MeasuredPitchRateRadPerSecond: measuredPitchRate,
            PitchRateErrorRadPerSecond: pitchRateError,
            AssistedLoadFactorG: assistedLoadFactor,
            LoadFactorCorrectionG: correction);
        return new GunneryPitchAssistResult(
            pilotCommand with {
                GDemand = assistedLoadFactor,
                RollControl = assistedRoll,
                Rudder = assistedRudder,
            }, state);
    }

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}

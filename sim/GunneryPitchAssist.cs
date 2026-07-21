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
/// Pure pitch-only lead convergence. It cannot acquire a target, roll into the gun plane, fire,
/// exceed the protected envelope, or operate during an explicit pitch/alpha override.
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
        bool enabled) {
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
            pilotCommand with { GDemand = assistedLoadFactor }, state);
    }

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}

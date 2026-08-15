namespace GunsOnly.Sim;

/// <summary>
/// Observable state of the bounded player gunnery aid. RequestedPitchRate is the rate needed to
/// converge the body-fixed gun line on the ballistic lead direction. PitchRateError is that rate
/// minus measured body q; only this residual is converted into a protected load-factor correction.
/// </summary>
public readonly record struct GunneryPitchAssistState(
    bool Active,
    string Status,
    double TotalLeadErrorRad,
    double PitchLeadErrorRad,
    double LateralLeadErrorRad,
    double RequestedPitchRateRadPerSecond,
    double MeasuredPitchRateRadPerSecond,
    double PitchRateErrorRadPerSecond,
    double AssistedLoadFactorG,
    double LoadFactorCorrectionG,
    double Authority01,
    double RollCorrection,
    double YawCorrection,
    double TimeToPassSeconds) {
    public int StatusCode => Status switch {
        "DISABLED" => 1,
        "NO_LEAD" => 2,
        "UNAVAILABLE" => 3,
        "PILOT_OVERRIDE" => 4,
        "OUT_OF_RANGE" => 5,
        "INVALID_GEOMETRY" => 6,
        "TARGET_BEHIND" => 7,
        "OUTSIDE_CONE" => 8,
        "UNSAFE_CLOSURE" => 9,
        "ACTIVE_SHOULDER" => 10,
        "ACTIVE_FULL" => 11,
        _ => 0,
    };
    public static GunneryPitchAssistState Inactive(
        double pilotLoadFactorG = 1.0,
        string status = "INACTIVE") =>
        new(false, status, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
            pilotLoadFactorG, 0.0, 0.0, 0.0, 0.0, double.PositiveInfinity);
}

public readonly record struct GunneryPitchAssistResult(
    PilotCommand Command,
    GunneryPitchAssistState State);

/// <summary>
/// Bounded two-axis lead convergence: a pitch load-factor correction plus an optional lateral
/// (roll + rudder) pull, both driven off the ballistic lead direction. It cannot acquire a target,
/// fire, exceed the protected envelope, or operate during an explicit pitch/alpha override, and the
/// lateral half stays off entirely for any airframe that leaves its lateral gains at zero. The
/// airframe's declared range/cone remain the full-authority gate; a soft, closure-gated shoulder
/// begins helping a stable pursuit before coarse keyboard corrections carry it through that gate.
/// </summary>
public static class GunneryPitchAssist {
    // Build-237 owner telemetry (web-1785563337923): during one stable pursuit the pilot made
    // twelve corrections in 4.47 s while closing 1,371 -> 1,003 m with >=10 s to pass. The lead
    // sat mostly 3.9-15.6 deg off, but the 1,000 m range gate kept the assist inactive. The earlier
    // close pass was radically different (0.7-2.2 s to pass) and must not be chased. Extend only a
    // soft acquisition shoulder, never the full-authority law or its existing caps.
    /// <summary>
    /// How much "ease off the pull" the aid may command once the nose has gone PAST the lead
    /// line while the pilot is pulling. Deliberately smaller than the pull-side authority: the
    /// aid should trim an overshoot, never take the aircraft off a target the pilot is chasing.
    /// </summary>
    const double PastLineEaseAuthorityG = 1.0;
    const double SafePursuitRangeMultiplier = 1.5;
    const double SafePursuitOuterCaptureAngleRad = 24.0 * System.Math.PI / 180.0;
    const double SafePursuitFadeStartTimeToPassSeconds = 2.5;
    const double SafePursuitFullTimeToPassSeconds = 6.0;

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
        bool lateralRollEnabled = true,
        double closureMps = 0.0,
        GunneryLeadRateEstimator? leadRate = null,
        PilotLateralCommitmentState? lateralCommitment = null,
        double deltaSeconds = 0.0) {
        ArgumentNullException.ThrowIfNull(atmosphere);
        PilotCommand unchangedCommand = pilotCommand;
        GunneryPitchAssistResult Inactive(string status) => new(unchangedCommand,
            GunneryPitchAssistState.Inactive(unchangedCommand.GDemand, status));

        if (!enabled) {
            leadRate?.Reset();
            return Inactive("DISABLED");
        }
        if (!hasBallisticLead) {
            leadRate?.Reset();
            return Inactive("NO_LEAD");
        }
        if (parameters.GunneryPitchAssistMaxRateRad <= 0.0
            || parameters.GunneryPitchAssistCaptureAngleRad <= 0.0
            || parameters.GunneryPitchAssistMaxRangeM <= 0.0
            || parameters.GunneryPitchAssistGainPerSecond <= 0.0
            || parameters.GunneryPitchAssistMaxCorrectionG <= 0.0) {
            leadRate?.Reset();
            return Inactive("UNAVAILABLE");
        }
        if (pilotCommand.EnvelopeOverride
            || double.IsFinite(pilotCommand.CommandedAlphaRad)
            || double.IsFinite(pilotCommand.CommandedPitchRad)) {
            leadRate?.Reset();
            return Inactive("PILOT_OVERRIDE");
        }
        if (!double.IsFinite(rangeM) || rangeM <= 0.0
            || rangeM > parameters.GunneryPitchAssistMaxRangeM
                * SafePursuitRangeMultiplier) {
            leadRate?.Reset();
            return Inactive("OUT_OF_RANGE");
        }
        if (!double.IsFinite(airspeedMps) || airspeedMps <= 1.0
            || !aircraft.BodyRates.IsFinite
            || !aircraft.BodyAttitude.IsFinite
            || aircraft.BodyAttitude.LengthSquared < 1e-12
            || !IsFinite(ballisticLeadDirection)
            || ballisticLeadDirection.Length < 1e-9) {
            leadRate?.Reset();
            return Inactive("INVALID_GEOMETRY");
        }

        Vec3D lead = ballisticLeadDirection.Normalized();
        QuaternionD attitude = aircraft.BodyAttitude.Normalized();
        Vec3D bodyForward = attitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
        Vec3D bodyUp = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        double forwardProjection = lead.Dot(bodyForward);
        double totalError = System.Math.Acos(System.Math.Clamp(forwardProjection, -1.0, 1.0));
        double fullAuthorityRangeM = parameters.GunneryPitchAssistMaxRangeM;
        double fullAuthorityCaptureAngleRad =
            parameters.GunneryPitchAssistCaptureAngleRad;
        double outerRangeM = fullAuthorityRangeM * SafePursuitRangeMultiplier;
        double outerCaptureAngleRad = System.Math.Max(
            fullAuthorityCaptureAngleRad,
            SafePursuitOuterCaptureAngleRad);
        if (forwardProjection <= 0.0) {
            leadRate?.Reset();
            return Inactive("TARGET_BEHIND");
        }
        if (totalError >= outerCaptureAngleRad) {
            leadRate?.Reset();
            return Inactive("OUTSIDE_CONE");
        }

        double timeToPassS = closureMps > 50.0
            ? rangeM / closureMps : double.PositiveInfinity;
        double mergeFade = System.Math.Clamp(
            timeToPassS / SafePursuitFadeStartTimeToPassSeconds, 0.0, 1.0);
        bool insideFullAuthorityGate = rangeM <= fullAuthorityRangeM
            && totalError <= fullAuthorityCaptureAngleRad;
        double shoulderAuthority = 1.0;
        if (!insideFullAuthorityGate) {
            double rangeAuthority = rangeM <= fullAuthorityRangeM
                ? 1.0
                : System.Math.Sqrt(System.Math.Clamp(
                    (outerRangeM - rangeM) / (outerRangeM - fullAuthorityRangeM),
                    0.0, 1.0));
            double angleAuthority = totalError <= fullAuthorityCaptureAngleRad
                ? 1.0
                : System.Math.Clamp(
                    (outerCaptureAngleRad - totalError)
                        / (outerCaptureAngleRad - fullAuthorityCaptureAngleRad),
                    0.0, 1.0);
            double pursuitAuthority = SmoothStep01(
                (timeToPassS - SafePursuitFadeStartTimeToPassSeconds)
                    / (SafePursuitFullTimeToPassSeconds
                        - SafePursuitFadeStartTimeToPassSeconds));
            shoulderAuthority = rangeAuthority * angleAuthority * pursuitAuthority;
            if (shoulderAuthority <= 0.0) {
                leadRate?.Reset();
                return Inactive("UNSAFE_CLOSURE");
            }
        }

        // Removing the body-right component is implicit in atan2(up, forward): lateral miss angle
        // gates capture through totalError, but only the vertical component may alter the command.
        double pitchError = System.Math.Atan2(lead.Dot(bodyUp), forwardProjection);
        double measuredPitchRate = aircraft.BodyRates.Q;

        // The reference is the lead line's OWN inertial pitch rate plus a bounded error-nulling
        // term. Without the first half (Build 264 and earlier) the law referenced a stationary
        // line: in any tracking turn the pilot's measured q already exceeds the whole capture
        // rate, the residual goes negative, and the correction clamps to zero — the aid was
        // structurally silent in exactly the window that converts. Re-basing leaves the declared
        // capture rate as what it always was, a cap on the CORRECTION, not on the tracking task.
        // Fail-closed: no estimator, or no valid history, gives exactly the old reference.
        double leadRateFeedForward = leadRate?.Update(
            pitchError, measuredPitchRate, deltaSeconds) ?? 0.0;
        double requestedPitchRate = leadRateFeedForward + System.Math.Clamp(
            parameters.GunneryPitchAssistGainPerSecond * pitchError,
            -parameters.GunneryPitchAssistMaxRateRad,
            parameters.GunneryPitchAssistMaxRateRad);
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
        // The damped augmentation must never OPPOSE a deliberate pull: with the pilot at high
        // G the measured pitch rate exceeds the assist's gentle capture rate, and the negative
        // residual was subtracting up to the full correction authority — "impossible to pull to
        // the shoot cue without spacebar" (Space disables the assist, which is why it 'fixed'
        // it). Hands-off, the full two-sided damping keeps the smooth capture.
        // ...but gate that on GEOMETRY, not on how hard the pilot is pulling. Keying it to
        // `GDemand >= 2.0` made the aid one-sided through the entire tracking task: an owner
        // flight on Build 323 (session web-1786607256301-334574) held a median 5.7 G and sat at
        // the envelope cap 56% of the time, so the clamp was live for essentially every firing
        // pass, and the assist could then only ever say "pull harder". The final degree of
        // tracking almost always needs "ease" — inside 1° of lead, 71% of the required
        // corrections were negative and the aid was silent for 66% of them. Measured in that
        // same flight: lead error converged at −1.21°/s while the assist acted and DIVERGED at
        // +1.62°/s while it was clamped (+2.22°/s inside 3°), leaving the pilot parked around 3°
        // of error — 32 m of miss against a 7 m hit radius. 808 rounds, 6 hits.
        //
        // The original intent stands and is kept: never oppose a deliberate pull TOWARD the
        // solution. `pitchError < 0` means the nose has gone PAST the lead line, which is the
        // only case where easing is what the pilot is actually asking for. Hands-off (below the
        // same 2 G) keeps the full two-sided damping that gives the smooth capture.
        double easeAuthorityG = pilotCommand.GDemand < 2.0
            ? parameters.GunneryPitchAssistMaxCorrectionG
            : (pitchError < 0.0
                ? System.Math.Min(
                    parameters.GunneryPitchAssistMaxCorrectionG, PastLineEaseAuthorityG)
                : 0.0);
        double negativeAuthority = -easeAuthorityG;
        double correction = shoulderAuthority * System.Math.Clamp(rateCorrectionG,
            negativeAuthority,
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
        // Do not fight the merge (pilot report, desktop, Build 77): inside ~2.5 seconds of a
        // high-closure pass the line of sight swings faster than any capture is worth, and full
        // lateral authority just wrenches the roll axis. Fade the lateral assist with
        // time-to-pass. The legacy full-authority pitch/yaw law remains exact inside its declared
        // gate; newly admitted shoulder geometry uses shoulderAuthority, whose 2.5-6 s fade keeps
        // all three axes out of the unsafe fly-by observed in Build 237.
        double rollAuthority = insideFullAuthorityGate
            ? mergeFade : shoulderAuthority;
        double pitchAndYawAuthority = insideFullAuthorityGate
            ? 1.0 : shoulderAuthority;
        double rollAssist = lateralRollEnabled
            ? rollAuthority * System.Math.Clamp(
                parameters.GunneryLateralAssistRollGain * lateralError,
                -parameters.GunneryLateralAssistMaxRoll,
                parameters.GunneryLateralAssistMaxRoll)
            : 0.0;
        double yawAssist = pitchAndYawAuthority * System.Math.Clamp(
            parameters.GunneryLateralAssistYawGain * lateralError,
            -parameters.GunneryLateralAssistMaxYaw,
            parameters.GunneryLateralAssistMaxYaw);
        // The lateral half carries up to half of full aileron with no pilot-input fade of its own,
        // which is how it came to fight commanded reversals. Intent, not geometry, owns this axis:
        // through a commanded reversal it is off entirely, and it may never push opposite a lateral
        // input the pilot is actively holding. Pitch is untouched — a reversal is a roll, and the
        // pull is what the pilot wants anyway.
        if (lateralCommitment is { } commitment) {
            rollAssist = commitment.Gate(rollAssist);
            yawAssist = commitment.Gate(yawAssist);
        }
        double assistedRoll = System.Math.Clamp(pilotCommand.RollControl + rollAssist, -1.0, 1.0);
        double assistedRudder = System.Math.Clamp(pilotCommand.Rudder + yawAssist, -1.0, 1.0);

        var state = new GunneryPitchAssistState(
            Active: true,
            Status: insideFullAuthorityGate ? "ACTIVE_FULL" : "ACTIVE_SHOULDER",
            TotalLeadErrorRad: totalError,
            PitchLeadErrorRad: pitchError,
            LateralLeadErrorRad: lateralError,
            RequestedPitchRateRadPerSecond: requestedPitchRate,
            MeasuredPitchRateRadPerSecond: measuredPitchRate,
            PitchRateErrorRadPerSecond: pitchRateError,
            AssistedLoadFactorG: assistedLoadFactor,
            LoadFactorCorrectionG: correction,
            Authority01: shoulderAuthority,
            RollCorrection: assistedRoll - pilotCommand.RollControl,
            YawCorrection: assistedRudder - pilotCommand.Rudder,
            TimeToPassSeconds: timeToPassS);
        return new GunneryPitchAssistResult(
            pilotCommand with {
                GDemand = assistedLoadFactor,
                RollControl = assistedRoll,
                Rudder = assistedRudder,
            }, state);
    }

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);

    static double SmoothStep01(double value) {
        double x = System.Math.Clamp(value, 0.0, 1.0);
        return x * x * (3.0 - 2.0 * x);
    }
}

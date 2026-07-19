namespace GunsOnly.Sim;

/// <summary>Pilot actions available to the F-86 emergency landing-gear procedure.</summary>
public enum F86EmergencyGearAction {
    SelectNormalGearDown,
    ConfirmNormalExtensionFailure,
    EmergencyGearRelease,
    InspectMechanicalDownlocks
}

/// <summary>What the pilot can read in the cockpit at one point in the test flight.</summary>
public readonly record struct F86EmergencyGearCockpitEvidence(
    double IndicatedAirspeedKnots,
    LandingGearHandle GearHandle,
    LandingGearIndication NoseGearIndication,
    LandingGearIndication LeftMainGearIndication,
    LandingGearIndication RightMainGearIndication,
    bool GearUnsafeLight,
    bool GearWarningHorn,
    bool EmergencyGearReleaseHeld) {
    public bool ThreeDownIndications =>
        NoseGearIndication == LandingGearIndication.DownLocked
        && LeftMainGearIndication == LandingGearIndication.DownLocked
        && RightMainGearIndication == LandingGearIndication.DownLocked;
}

/// <summary>
/// Result of an explicitly requested external/mechanical check. This is not silently available to
/// the pilot: the trace must contain an InspectMechanicalDownlocks action before this evidence can
/// satisfy the verification gate.
/// </summary>
public readonly record struct F86PhysicalGearInspectionEvidence(
    bool NoseDownlockConfirmed,
    bool LeftMainDownlockConfirmed,
    bool RightMainDownlockConfirmed) {
    public bool ThreeDownlocksConfirmed =>
        NoseDownlockConfirmed && LeftMainDownlockConfirmed && RightMainDownlockConfirmed;
}

/// <summary>
/// Observable procedure state. In particular, it contains no AirframeSystemFailure value or
/// Failures collection. A hidden cause and the evidence it produces are deliberately different
/// types and live on opposite sides of the grading seam.
/// </summary>
public sealed record F86EmergencyGearEvidence(
    F86EmergencyGearCockpitEvidence Cockpit,
    F86PhysicalGearInspectionEvidence? PhysicalInspection = null);

/// <summary>
/// Projection from the current systems model into pilot-visible evidence. Keeping this separate
/// from the procedure evaluator makes it impossible for grading to diagnose by reading the hidden
/// failure injection rather than the indications and actions available to the pilot.
/// </summary>
public static class F86EmergencyGearEvidenceProjection {
    const double FullyExtendedTolerance = 1e-4;

    public static F86EmergencyGearEvidence CaptureCockpit(AirframeSystems systems) {
        ArgumentNullException.ThrowIfNull(systems);
        return new F86EmergencyGearEvidence(CaptureCockpitValues(systems));
    }

    public static F86EmergencyGearEvidence CapturePhysicalInspection(AirframeSystems systems) {
        ArgumentNullException.ThrowIfNull(systems);

        // AirframeSystems currently exposes the individual leg positions and an aggregate physical
        // lock truth. With an unpowered indicator circuit, a successful aggregate lock plus each
        // fully extended leg is the conservative evidence available at this seam. A future
        // per-downlock inspection model can fill the same three fields without changing grading.
        bool allMechanicallyLocked = systems.AllGearDownAndLocked;
        var inspection = new F86PhysicalGearInspectionEvidence(
            allMechanicallyLocked
                && systems.NoseGearPosition >= 1.0 - FullyExtendedTolerance,
            allMechanicallyLocked
                && systems.LeftMainGearPosition >= 1.0 - FullyExtendedTolerance,
            allMechanicallyLocked
                && systems.RightMainGearPosition >= 1.0 - FullyExtendedTolerance);
        return new F86EmergencyGearEvidence(CaptureCockpitValues(systems), inspection);
    }

    static F86EmergencyGearCockpitEvidence CaptureCockpitValues(AirframeSystems systems) => new(
        systems.IndicatedAirspeedKnots,
        systems.GearHandle,
        systems.NoseGearIndication,
        systems.LeftMainGearIndication,
        systems.RightMainGearIndication,
        systems.GearUnsafeLight,
        systems.GearWarningHorn,
        systems.EmergencyGearReleaseHeld);
}

/// <summary>
/// Evidence-driven grading for the F-86F emergency landing-gear functional check. Procedure basis:
/// T.O. 1F-86F-1 requires normal DOWN selection, airspeed below 175 KIAS, full emergency-release
/// travel held during extension, and positive verification of the three gear locks. The normal
/// system's 10-second extension time and 185-KIAS gear operating limit come from the same Dash-1.
/// Electrically powered indicators may remain striped after a primary-bus failure, so the final
/// gate accepts an explicit physical three-downlock inspection rather than inventing green lights.
/// </summary>
public static class F86EmergencyGearTestFlightProcedure {
    public const double GearOperationLimitKias = 185.0;
    public const double EmergencyExtensionLimitKias = 175.0;
    public const double NormalExtensionEvidenceSeconds = 10.0;
    public const double MaximumEvidenceAgeSeconds = 1.0;

    public const string NormalSelectionGate = "normal-down-selection";
    public const string FailureRecognitionGate = "normal-extension-failure-recognized";
    public const string BelowEmergencyLimitGate = "below-175-kias";
    public const string EmergencyReleaseEngagedGate = "emergency-release-engaged";
    public const string EmergencyReleaseHeldGate = "emergency-release-held-through-extension";
    public const string ThreeDownlocksGate = "three-mechanical-downlocks-verified";

    public static MaintenanceProcedureDefinition Definition { get; } = CreateDefinition();

    public static MaintenanceProcedureEvaluation Evaluate(
        MaintenanceTestFlightLog<F86EmergencyGearAction, F86EmergencyGearEvidence> trace) {
        ArgumentNullException.ThrowIfNull(trace);

        var grade = new MaintenanceProcedureGradeBuilder(Definition);
        MaintenanceStateObservationRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence>? latestObservation = null;
        double? normalSelectionActionAt = null;
        bool releaseActionActive = false;
        bool inspectionRequested = false;

        foreach (MaintenanceTestFlightRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence> record in trace.Records) {
            switch (record) {
                case MaintenanceStateObservationRecord<F86EmergencyGearAction,
                    F86EmergencyGearEvidence> observation:
                    latestObservation = observation;
                    EvaluateObservation(
                        observation,
                        normalSelectionActionAt,
                        releaseActionActive,
                        ref inspectionRequested,
                        grade);
                    break;

                case MaintenancePilotActionRecord<F86EmergencyGearAction,
                    F86EmergencyGearEvidence> action:
                    EvaluateAction(
                        action,
                        latestObservation,
                        ref normalSelectionActionAt,
                        ref releaseActionActive,
                        ref inspectionRequested,
                        grade);
                    break;
            }
        }

        return grade.Build();
    }

    static void EvaluateObservation(
        MaintenanceStateObservationRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence> observation,
        double? normalSelectionActionAt,
        bool releaseActionActive,
        ref bool inspectionRequested,
        MaintenanceProcedureGradeBuilder grade) {
        F86EmergencyGearEvidence evidence = observation.Observation;
        double timestamp = observation.TimestampSeconds;

        if (normalSelectionActionAt is not null
            && timestamp >= normalSelectionActionAt
            && evidence.Cockpit.GearHandle == LandingGearHandle.Down)
            grade.TrySatisfy(NormalSelectionGate, timestamp);

        if (grade.IsSatisfied(FailureRecognitionGate)
            && evidence.Cockpit.IndicatedAirspeedKnots <= EmergencyExtensionLimitKias)
            grade.TrySatisfy(BelowEmergencyLimitGate, timestamp);

        if (releaseActionActive
            && evidence.Cockpit.EmergencyGearReleaseHeld
            && evidence.Cockpit.IndicatedAirspeedKnots <= EmergencyExtensionLimitKias)
            grade.TrySatisfy(EmergencyReleaseEngagedGate, timestamp);

        if (evidence.PhysicalInspection is not F86PhysicalGearInspectionEvidence inspection)
            return;

        if (!inspectionRequested) {
            grade.AddDemerit(
                "unrequested-physical-inspection",
                "Physical gear evidence was used without the pilot requesting the inspection.",
                5,
                timestamp);
            return;
        }
        inspectionRequested = false;

        if (!inspection.ThreeDownlocksConfirmed) {
            grade.AddDemerit(
                "premature-downlock-verification",
                "The pilot requested downlock verification before all three mechanical locks were confirmed.",
                10,
                timestamp);
            return;
        }

        bool heldAtVerification = releaseActionActive
            && evidence.Cockpit.EmergencyGearReleaseHeld
            && grade.IsSatisfied(EmergencyReleaseEngagedGate);
        if (!heldAtVerification) {
            grade.AddDemerit(
                "release-not-held-through-extension",
                "All three legs reached the down position, but the emergency release was not held through extension.",
                15,
                timestamp);
            return;
        }

        grade.TrySatisfy(EmergencyReleaseHeldGate, timestamp);
        grade.TrySatisfy(ThreeDownlocksGate, timestamp);
    }

    static void EvaluateAction(
        MaintenancePilotActionRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence> action,
        MaintenanceStateObservationRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence>? latestObservation,
        ref double? normalSelectionActionAt,
        ref bool releaseActionActive,
        ref bool inspectionRequested,
        MaintenanceProcedureGradeBuilder grade) {
        bool currentEvidence = latestObservation is not null
            && action.TimestampSeconds - latestObservation.TimestampSeconds
                <= MaximumEvidenceAgeSeconds;

        switch (action.Action) {
            case F86EmergencyGearAction.SelectNormalGearDown:
                if (action.Transition != MaintenanceActionTransition.Perform) {
                    AddInvalidTransition(action, grade);
                    break;
                }
                normalSelectionActionAt = action.TimestampSeconds;
                if (!currentEvidence) {
                    grade.AddDemerit(
                        "normal-selection-without-current-airspeed",
                        "Normal gear DOWN was selected without a current IAS observation.",
                        5,
                        action.TimestampSeconds);
                } else if (latestObservation!.Observation.Cockpit.IndicatedAirspeedKnots
                    > GearOperationLimitKias) {
                    grade.AddDemerit(
                        "normal-gear-selection-above-limit",
                        "Normal gear DOWN was selected above the 185-KIAS operating limit.",
                        15,
                        action.TimestampSeconds);
                }
                break;

            case F86EmergencyGearAction.ConfirmNormalExtensionFailure:
                if (action.Transition != MaintenanceActionTransition.Perform) {
                    AddInvalidTransition(action, grade);
                    break;
                }
                bool expectedTravelElapsed = normalSelectionActionAt is not null
                    && action.TimestampSeconds - normalSelectionActionAt
                        >= NormalExtensionEvidenceSeconds;
                bool noSuccessfulExtensionIndication = currentEvidence
                    && latestObservation!.Observation.Cockpit.GearHandle
                        == LandingGearHandle.Down
                    && !latestObservation.Observation.Cockpit.ThreeDownIndications;
                if (grade.IsSatisfied(NormalSelectionGate)
                    && expectedTravelElapsed
                    && noSuccessfulExtensionIndication) {
                    grade.TrySatisfy(FailureRecognitionGate, action.TimestampSeconds);
                } else {
                    grade.AddDemerit(
                        "premature-normal-extension-diagnosis",
                        "Normal extension failure was called before the selected handle, expected travel time, and failed indications supported it.",
                        10,
                        action.TimestampSeconds);
                }
                break;

            case F86EmergencyGearAction.EmergencyGearRelease:
                if (action.Transition == MaintenanceActionTransition.Begin) {
                    releaseActionActive = true;
                    if (!grade.IsSatisfied(FailureRecognitionGate))
                        grade.AddDemerit(
                            "emergency-release-before-diagnosis",
                            "The emergency release was pulled before normal extension failure was established.",
                            10,
                            action.TimestampSeconds);
                    if (!currentEvidence)
                        grade.AddDemerit(
                            "emergency-release-without-current-airspeed",
                            "The emergency release was pulled without a current IAS observation.",
                            10,
                            action.TimestampSeconds);
                    else if (latestObservation!.Observation.Cockpit.IndicatedAirspeedKnots
                        > EmergencyExtensionLimitKias)
                        grade.AddDemerit(
                            "emergency-release-above-limit",
                            "The emergency release was pulled above the 175-KIAS airload limit.",
                            25,
                            action.TimestampSeconds);
                } else if (action.Transition == MaintenanceActionTransition.End) {
                    if (releaseActionActive && !grade.IsSatisfied(EmergencyReleaseHeldGate))
                        grade.AddDemerit(
                            "emergency-release-ended-early",
                            "The emergency release was let go before extension and downlock verification.",
                            10,
                            action.TimestampSeconds);
                    releaseActionActive = false;
                } else {
                    AddInvalidTransition(action, grade);
                }
                break;

            case F86EmergencyGearAction.InspectMechanicalDownlocks:
                if (action.Transition != MaintenanceActionTransition.Perform) {
                    AddInvalidTransition(action, grade);
                    break;
                }
                inspectionRequested = true;
                if (!grade.IsSatisfied(EmergencyReleaseEngagedGate))
                    grade.AddDemerit(
                        "downlock-inspection-before-emergency-extension",
                        "Mechanical downlock inspection was requested before emergency extension was established.",
                        10,
                        action.TimestampSeconds);
                break;
        }
    }

    static void AddInvalidTransition(
        MaintenancePilotActionRecord<F86EmergencyGearAction,
            F86EmergencyGearEvidence> action,
        MaintenanceProcedureGradeBuilder grade) => grade.AddDemerit(
            "invalid-action-transition",
            $"{action.Action} does not use the {action.Transition} transition.",
            5,
            action.TimestampSeconds);

    static MaintenanceProcedureDefinition CreateDefinition() {
        static IReadOnlyList<string> After(params string[] gates) => Array.AsReadOnly(gates);

        var sources = new[] {
            new MaintenanceProcedureSource(
                "T.O. 1F-86F-1, Flight Handbook USAF Series F-86F Aircraft",
                "Landing Gear System and Landing Gear Emergency Operation",
                "https://fliphtml5.com/dqyy/tprw/T.O._1F-86F-1_Flight_Manual_F-86F/164/")
        };
        var phases = new[] {
            new MaintenanceProcedurePhaseDefinition(
                "normal-check", "NORMAL CHECK", "Command the normal system within its limit."),
            new MaintenanceProcedurePhaseDefinition(
                "recognize", "RECOGNIZE", "Use elapsed time and indications to establish the malfunction."),
            new MaintenanceProcedurePhaseDefinition(
                "configure", "CONFIGURE", "Reduce IAS below the emergency-extension airload limit."),
            new MaintenanceProcedurePhaseDefinition(
                "emergency-extension", "EMERGENCY EXTEND", "Pull fully and hold until extension is complete."),
            new MaintenanceProcedurePhaseDefinition(
                "verify", "VERIFY", "Positively establish all three mechanical downlocks.")
        };
        var gates = new[] {
            new MaintenanceProcedureGateDefinition(
                NormalSelectionGate, "normal-check", "Gear handle selected DOWN", 10, After()),
            new MaintenanceProcedureGateDefinition(
                FailureRecognitionGate, "recognize",
                "No successful extension indication after normal travel time", 15,
                After(NormalSelectionGate)),
            new MaintenanceProcedureGateDefinition(
                BelowEmergencyLimitGate, "configure", "IAS at or below 175 KIAS", 15,
                After(FailureRecognitionGate)),
            new MaintenanceProcedureGateDefinition(
                EmergencyReleaseEngagedGate, "emergency-extension",
                "Emergency release pulled fully below the limit", 15,
                After(BelowEmergencyLimitGate)),
            new MaintenanceProcedureGateDefinition(
                EmergencyReleaseHeldGate, "emergency-extension",
                "Emergency release held through completed extension", 20,
                After(EmergencyReleaseEngagedGate)),
            new MaintenanceProcedureGateDefinition(
                ThreeDownlocksGate, "verify",
                "Nose, left-main, and right-main mechanical downlocks confirmed", 25,
                After(EmergencyReleaseHeldGate))
        };
        return new MaintenanceProcedureDefinition(
            "f86f-emergency-gear-functional-check-v1",
            "F-86F Emergency Landing-Gear Functional Check",
            sources,
            phases,
            gates);
    }
}

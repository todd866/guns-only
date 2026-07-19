using System.Reflection;
using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public sealed class MaintenanceTestFlightProcedureTests {
    const double Dt = 1.0 / 120.0;

    static void StepFor(
        AirframeSystems systems,
        ref double elapsedSeconds,
        double durationSeconds,
        double indicatedAirspeedKnots) {
        int ticks = (int)Math.Ceiling(durationSeconds / Dt);
        var input = new AirframeSystemsInput(
            EngineRpmPercent: 80.0,
            IndicatedAirspeedKnots: indicatedAirspeedKnots,
            WeightOnWheels: false);
        for (int i = 0; i < ticks; i++) {
            systems.Step(Dt, input);
            elapsedSeconds += Dt;
        }
    }

    static HiddenMaintenanceFaultInjection<AirframeSystems> PrimaryBusAndUtilityFailure() =>
        new(
            "post-takeoff-primary-and-utility-loss",
            triggerTimeSeconds: 0.0,
            systems => {
                systems.SetFailure(AirframeSystemFailure.PrimaryBus);
                systems.SetFailure(AirframeSystemFailure.UtilityHydraulicPump);
            });

    [Fact]
    public void CorrectEmergencyGearProcedureCompletesFromObservableEvidenceWithStripedIndicators() {
        var systems = new AirframeSystems();
        var hiddenFault = PrimaryBusAndUtilityFailure();
        var trace = new MaintenanceTestFlightLog<F86EmergencyGearAction,
            F86EmergencyGearEvidence>();
        double elapsed = 0.0;

        Assert.True(hiddenFault.InjectIfDue(elapsed, systems));
        Assert.False(hiddenFault.InjectIfDue(elapsed, systems));
        StepFor(systems, ref elapsed, 0.5, indicatedAirspeedKnots: 180.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));

        systems.CommandGear(LandingGearHandle.Down);
        trace.RecordAction(elapsed, F86EmergencyGearAction.SelectNormalGearDown);
        StepFor(systems, ref elapsed,
            F86EmergencyGearTestFlightProcedure.NormalExtensionEvidenceSeconds + 0.1,
            indicatedAirspeedKnots: 180.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.ConfirmNormalExtensionFailure);

        StepFor(systems, ref elapsed, 0.1, indicatedAirspeedKnots: 170.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));

        systems.SetEmergencyGearRelease(true);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.Begin);
        StepFor(systems, ref elapsed, 0.1, indicatedAirspeedKnots: 170.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));

        StepFor(systems, ref elapsed,
            systems.Profile.EmergencyGearExtensionSeconds
                + systems.Profile.GearDoorTravelSeconds + 0.5,
            indicatedAirspeedKnots: 170.0);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.InspectMechanicalDownlocks);
        F86EmergencyGearEvidence physicalEvidence =
            F86EmergencyGearEvidenceProjection.CapturePhysicalInspection(systems);
        trace.RecordObservation(elapsed, physicalEvidence);

        systems.SetEmergencyGearRelease(false);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.End);

        MaintenanceProcedureEvaluation evaluation =
            F86EmergencyGearTestFlightProcedure.Evaluate(trace);

        Assert.True(systems.AllGearDownAndLocked);
        Assert.Equal(LandingGearIndication.Striped,
            physicalEvidence.Cockpit.NoseGearIndication);
        Assert.Equal(LandingGearIndication.Striped,
            physicalEvidence.Cockpit.LeftMainGearIndication);
        Assert.Equal(LandingGearIndication.Striped,
            physicalEvidence.Cockpit.RightMainGearIndication);
        Assert.True(physicalEvidence.PhysicalInspection!.Value.ThreeDownlocksConfirmed);

        Assert.True(evaluation.Complete);
        Assert.Equal(100, evaluation.MaximumScore);
        Assert.Equal(100, evaluation.Score);
        Assert.Empty(evaluation.Demerits);
        Assert.All(evaluation.Gates,
            gate => Assert.Equal(MaintenanceGateStatus.Satisfied, gate.Status));
        Assert.All(evaluation.Phases,
            phase => Assert.Equal(MaintenancePhaseStatus.Complete, phase.Status));
        Assert.Null(evaluation.CurrentPhaseId);
    }

    [Fact]
    public void UnsafeAndPrematureActionsRemainDemeritsAfterPilotRecoversProcedure() {
        var systems = new AirframeSystems();
        PrimaryBusAndUtilityFailure().InjectIfDue(0.0, systems);
        var trace = new MaintenanceTestFlightLog<F86EmergencyGearAction,
            F86EmergencyGearEvidence>();
        double elapsed = 0.0;

        StepFor(systems, ref elapsed, 0.5, indicatedAirspeedKnots: 190.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));
        systems.CommandGear(LandingGearHandle.Down);
        trace.RecordAction(elapsed, F86EmergencyGearAction.SelectNormalGearDown);

        // Pulling immediately is both premature and above the Dash-1 emergency-extension limit.
        systems.SetEmergencyGearRelease(true);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.Begin);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.InspectMechanicalDownlocks);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CapturePhysicalInspection(systems));
        systems.SetEmergencyGearRelease(false);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.End);

        // The pilot then recovers: waits for normal travel time, recognizes the evidence, slows,
        // repeats the emergency extension correctly, and verifies all three physical locks.
        StepFor(systems, ref elapsed,
            F86EmergencyGearTestFlightProcedure.NormalExtensionEvidenceSeconds + 0.1,
            indicatedAirspeedKnots: 180.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.ConfirmNormalExtensionFailure);
        StepFor(systems, ref elapsed, 0.1, indicatedAirspeedKnots: 170.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));

        systems.SetEmergencyGearRelease(true);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.Begin);
        StepFor(systems, ref elapsed, 0.1, indicatedAirspeedKnots: 170.0);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CaptureCockpit(systems));
        StepFor(systems, ref elapsed,
            systems.Profile.EmergencyGearExtensionSeconds
                + systems.Profile.GearDoorTravelSeconds + 0.5,
            indicatedAirspeedKnots: 170.0);
        trace.RecordAction(elapsed,
            F86EmergencyGearAction.InspectMechanicalDownlocks);
        trace.RecordObservation(elapsed,
            F86EmergencyGearEvidenceProjection.CapturePhysicalInspection(systems));

        MaintenanceProcedureEvaluation evaluation =
            F86EmergencyGearTestFlightProcedure.Evaluate(trace);
        string[] codes = evaluation.Demerits.Select(demerit => demerit.Code).ToArray();

        Assert.True(evaluation.Complete);
        Assert.True(evaluation.Score < evaluation.MaximumScore);
        Assert.Contains("normal-gear-selection-above-limit", codes);
        Assert.Contains("emergency-release-before-diagnosis", codes);
        Assert.Contains("emergency-release-above-limit", codes);
        Assert.Contains("downlock-inspection-before-emergency-extension", codes);
        Assert.Contains("premature-downlock-verification", codes);
        Assert.Contains("emergency-release-ended-early", codes);

        MaintenanceProcedureEvaluation repeated =
            F86EmergencyGearTestFlightProcedure.Evaluate(trace);
        Assert.Equal(evaluation.Score, repeated.Score);
        Assert.Equal(evaluation.Demerits, repeated.Demerits);
        Assert.Equal(
            evaluation.Gates.Select(gate => (gate.Status, gate.SatisfiedAtSeconds)),
            repeated.Gates.Select(gate => (gate.Status, gate.SatisfiedAtSeconds)));
    }

    [Fact]
    public void GraderSurfaceCannotReceiveAirframeSystemsOrHiddenFailureCollection() {
        Type evidenceType = typeof(F86EmergencyGearEvidence);
        Assert.DoesNotContain(evidenceType.GetProperties(), property =>
            property.Name.Contains("Failure", StringComparison.OrdinalIgnoreCase)
            || property.PropertyType == typeof(AirframeSystemFailure)
            || property.PropertyType == typeof(IReadOnlySet<AirframeSystemFailure>));

        MethodInfo[] evaluatorMethods = typeof(F86EmergencyGearTestFlightProcedure)
            .GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        Assert.DoesNotContain(evaluatorMethods.SelectMany(method => method.GetParameters()),
            parameter => parameter.ParameterType == typeof(AirframeSystems)
                || parameter.ParameterType == typeof(AirframeSystemFailure)
                || parameter.ParameterType == typeof(IReadOnlySet<AirframeSystemFailure>));

        // A grade is a pure function of the immutable trace. Changing the live hidden failures
        // after observation capture cannot retroactively alter what the pilot knew or the score.
        var trace = CompletedSyntheticTrace();
        MaintenanceProcedureEvaluation before =
            F86EmergencyGearTestFlightProcedure.Evaluate(trace);
        var unrelatedLiveSystem = new AirframeSystems();
        foreach (AirframeSystemFailure failure in Enum.GetValues<AirframeSystemFailure>())
            unrelatedLiveSystem.SetFailure(failure);
        MaintenanceProcedureEvaluation after =
            F86EmergencyGearTestFlightProcedure.Evaluate(trace);

        Assert.True(before.Complete);
        Assert.Equal(before.Score, after.Score);
        Assert.Equal(before.Demerits, after.Demerits);
    }

    [Fact]
    public void TraceRejectsTimeTravelAndHiddenFaultTriggersExactlyOnce() {
        var trace = new MaintenanceTestFlightLog<F86EmergencyGearAction,
            F86EmergencyGearEvidence>();
        trace.RecordObservation(2.0, CockpitEvidence(
            ias: 180.0,
            handle: LandingGearHandle.Up));
        Assert.Throws<ArgumentException>(() => trace.RecordAction(
            1.99,
            F86EmergencyGearAction.SelectNormalGearDown));

        int injections = 0;
        var hidden = new HiddenMaintenanceFaultInjection<object>(
            "deterministic-trigger",
            3.0,
            _ => injections++);
        var system = new object();
        Assert.False(hidden.InjectIfDue(2.99, system));
        Assert.True(hidden.InjectIfDue(3.0, system));
        Assert.False(hidden.InjectIfDue(30.0, system));
        Assert.Equal(1, injections);
    }

    static MaintenanceTestFlightLog<F86EmergencyGearAction,
        F86EmergencyGearEvidence> CompletedSyntheticTrace() {
        var trace = new MaintenanceTestFlightLog<F86EmergencyGearAction,
            F86EmergencyGearEvidence>();
        trace.RecordObservation(0.0, CockpitEvidence(
            ias: 180.0,
            handle: LandingGearHandle.Up));
        trace.RecordAction(0.0, F86EmergencyGearAction.SelectNormalGearDown);
        trace.RecordObservation(10.1, CockpitEvidence(
            ias: 180.0,
            handle: LandingGearHandle.Down));
        trace.RecordAction(10.1,
            F86EmergencyGearAction.ConfirmNormalExtensionFailure);
        trace.RecordObservation(11.0, CockpitEvidence(
            ias: 170.0,
            handle: LandingGearHandle.Down));
        trace.RecordAction(11.0,
            F86EmergencyGearAction.EmergencyGearRelease,
            MaintenanceActionTransition.Begin);
        trace.RecordObservation(11.1, CockpitEvidence(
            ias: 170.0,
            handle: LandingGearHandle.Down,
            releaseHeld: true));
        trace.RecordAction(24.0,
            F86EmergencyGearAction.InspectMechanicalDownlocks);
        trace.RecordObservation(24.0, new F86EmergencyGearEvidence(
            CockpitEvidence(
                ias: 170.0,
                handle: LandingGearHandle.Down,
                releaseHeld: true).Cockpit,
            new F86PhysicalGearInspectionEvidence(true, true, true)));
        return trace;
    }

    static F86EmergencyGearEvidence CockpitEvidence(
        double ias,
        LandingGearHandle handle,
        bool releaseHeld = false) => new(
            new F86EmergencyGearCockpitEvidence(
                ias,
                handle,
                LandingGearIndication.Striped,
                LandingGearIndication.Striped,
                LandingGearIndication.Striped,
                GearUnsafeLight: false,
                GearWarningHorn: false,
                EmergencyGearReleaseHeld: releaseHeld));
}

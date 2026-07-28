using GunsOnly.Sim.Casevac;

namespace GunsOnly.Sim.Tests;

public sealed class CasevacAssessmentTests {
    const string ScenarioId = "scenario.casevac.assessment.test.v1";
    const string AircraftId = "aircraft.casevac.test.v1";
    const string CapsuleId = "capsule.casevac.test.v1";
    const string PickupSite = "site.casevac.pickup.test.v1";
    const string ReceiverSite = "site.casevac.receiver.test.v1";
    const long Epoch = 10;

    [Fact]
    public void CompletedFlightReportsFourIndependentDimensionsWithoutCompositeGrade() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(recorder);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(CasevacAssessmentStatus.Pass, assessment.Safe.Status);
        Assert.True(
            assessment.Controlled.Status == CasevacAssessmentStatus.Pass,
            assessment.Controlled.EvidenceText);
        Assert.Equal(
            CasevacAssessmentStatus.Assessed,
            assessment.Masked.Status);
        Assert.Equal(CasevacAssessmentStatus.Assessed, assessment.Timely.Status);
        Assert.Equal(
            new[] {
                CasevacAssessmentDimensionKind.Safe,
                CasevacAssessmentDimensionKind.Controlled,
                CasevacAssessmentDimensionKind.Masked,
                CasevacAssessmentDimensionKind.Timely
            },
            assessment.Dimensions.Select(dimension => dimension.Kind));
        Assert.All(assessment.Dimensions, dimension =>
            Assert.False(string.IsNullOrWhiteSpace(dimension.EvidenceText)));
        Assert.True(assessment.Safe.IsAssessed);
        Assert.True(assessment.Controlled.IsAssessed);
        Assert.True(assessment.Masked.IsAssessed);
        Assert.True(assessment.Timely.IsAssessed);
        Assert.Contains("Call-to-pickup: 103 ticks", assessment.Timely.EvidenceText);
        Assert.Contains("pickup-to-handoff: 3 ticks", assessment.Timely.EvidenceText);
        Assert.Contains("call-to-handoff: 106 ticks", assessment.Timely.EvidenceText);
        Assert.False(assessment.PrimaryCorrection.IsAvailable);
        Assert.Null(typeof(CasevacAssessment).GetProperty("Score"));
        Assert.Null(typeof(CasevacAssessment).GetProperty("OverallStatus"));
    }

    [Fact]
    public void LateFlightKeepsTimingNeutralAndExcludesDwellFromRouteMasking() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            disposition: CasevacDisposition.TransferredAfterRequestedTime,
            requestedHandoffAgeTicks: 105,
            maskingStates: new[] {
                CasevacMaskingState.Exposed,
                CasevacMaskingState.Masked,
                CasevacMaskingState.Exposed,
                CasevacMaskingState.Masked,
                CasevacMaskingState.Exposed,
                CasevacMaskingState.Masked
            });

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(
            CasevacAssessmentStatus.Assessed,
            assessment.Masked.Status);
        Assert.Equal(CasevacAssessmentStatus.Assessed, assessment.Timely.Status);
        Assert.Contains(
            "Route MASKED/EXPOSED/NOT ASSESSED ticks: 1/2/0",
            assessment.Masked.EvidenceText);
        Assert.Contains("route-phase ticks: 3",
            assessment.Masked.EvidenceText);
        Assert.Contains(
            "handoff 1 ticks after the requested marker",
            assessment.Timely.EvidenceText);
        Assert.DoesNotContain("Victory", AllText(assessment));
        Assert.DoesNotContain("Defeat", AllText(assessment));
    }

    [Fact]
    public void AnyUnavailableMaskingAuthorityMakesMaskedNotAssessedWithoutDroppingFacts() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            maskingStates: new[] {
                CasevacMaskingState.Masked,
                CasevacMaskingState.Masked,
                CasevacMaskingState.NotAssessed,
                CasevacMaskingState.Exposed,
                CasevacMaskingState.Masked,
                CasevacMaskingState.Exposed
            });

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(
            CasevacAssessmentStatus.NotAssessed,
            assessment.Masked.Status);
        Assert.False(assessment.Masked.IsAssessed);
        Assert.Contains(
            "Route MASKED/EXPOSED/NOT ASSESSED ticks: 1/1/1",
            assessment.Masked.EvidenceText);
    }

    [Fact]
    public void RouteOnlyAuthoritativeMaskingCanBeNeutrallyAssessed() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveTick(
            Observation(1, maskingState: CasevacMaskingState.Masked),
            Snapshot(
                1,
                1,
                CasevacPhase.Ingress,
                requestedHandoffAgeTicks: 110));
        CasevacMissionSnapshot latest = Snapshot(
            2,
            2,
            CasevacPhase.PickupApproach,
            requestedHandoffAgeTicks: 110,
            targetSiteId: PickupSite);
        recorder.ObserveTick(
            Observation(
                2,
                maskingState: CasevacMaskingState.Exposed,
                withinSafeMaskingBand: false),
            latest);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, latest);

        Assert.Equal(
            CasevacAssessmentStatus.Assessed,
            assessment.Masked.Status);
        Assert.Contains("route-phase ticks: 2", assessment.Masked.EvidenceText);
        Assert.Contains(
            "Route MASKED/EXPOSED/NOT ASSESSED ticks: 1/1/0",
            assessment.Masked.EvidenceText);
    }

    [Fact]
    public void PendingSnapshotWithNoEvidenceDoesNotInventAnyAssessment() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = Snapshot(
            sourceTick: 0,
            activeTicks: 0,
            CasevacPhase.Ingress,
            disposition: CasevacDisposition.Pending,
            requestedHandoffAgeTicks: 110);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.All(assessment.Dimensions, dimension =>
            Assert.Equal(
                CasevacAssessmentStatus.NotAssessed,
                dimension.Status));
        Assert.False(assessment.PrimaryCorrection.IsAvailable);
        Assert.Contains("minimum recorded clearance: not recorded",
            assessment.Safe.EvidenceText);
        Assert.Contains("not recorded", assessment.Timely.EvidenceText);
    }

    [Fact]
    public void LoadingPauseRemainsPassEvidenceButCanSelectFocusedCorrection() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            issue: CasevacEventKind.LoadingPaused);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(
            CasevacAssessmentStatus.Pass,
            assessment.Controlled.Status);
        Assert.Contains("loading pauses/resets: 1/0",
            assessment.Controlled.EvidenceText);
        Assert.Equal(
            CasevacPrimaryCorrectionKind.StabilizePickupContact,
            assessment.PrimaryCorrection.Kind);
        Assert.Equal(2, assessment.PrimaryCorrection.StartSourceTick);
        Assert.Equal(2, assessment.PrimaryCorrection.EndSourceTick);
        Assert.Equal(
            CasevacEvidenceStream.PickupTerminal,
            assessment.PrimaryCorrection.Stream);
        Assert.Contains("source tick 2", assessment.PrimaryCorrection.CorrectionText);
    }

    [Fact]
    public void LoadingResetIsDevelopingAndSelectsExactPickupCorrection() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            issue: CasevacEventKind.LoadingReset);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(
            CasevacAssessmentStatus.Developing,
            assessment.Controlled.Status);
        Assert.Contains("loading pauses/resets: 0/1",
            assessment.Controlled.EvidenceText);
        Assert.Equal(
            CasevacPrimaryCorrectionKind.StabilizePickupContact,
            assessment.PrimaryCorrection.Kind);
        Assert.Equal(2, assessment.PrimaryCorrection.StartSourceTick);
        Assert.Contains("loading reset",
            assessment.PrimaryCorrection.CorrectionText);
    }

    [Fact]
    public void DiscontinuedApproachIsReportedButDoesNotPenalizeSafeGoAround() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            issue: CasevacEventKind.ApproachDiscontinued,
            firstPickupGate: BreakGate(PickupSite));

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.True(
            assessment.Controlled.Status == CasevacAssessmentStatus.Pass,
            assessment.Controlled.EvidenceText);
        Assert.Contains("approaches discontinued: 1",
            assessment.Controlled.EvidenceText);
        Assert.False(assessment.PrimaryCorrection.IsAvailable);
    }

    [Fact]
    public void AircraftLossIsDevelopingAndOutranksEarlierMarkedOrProtectionEvidence() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            Epoch,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            Epoch + 1,
            CasevacEventKind.CasevacAircraftLost,
            sourceTick: 2,
            activeTicks: 2));
        recorder.ObserveTick(
            Observation(
                1,
                protectionInterventionActive: true,
                maskingState: CasevacMaskingState.Exposed),
            Snapshot(
                1,
                1,
                CasevacPhase.Ingress,
                disposition: CasevacDisposition.Pending,
                requestedHandoffAgeTicks: 110));
        recorder.ConsiderCorrection(new CasevacCorrectionRange(
            CasevacEvidenceStream.Route,
            StartSourceTick: 1,
            EndSourceTick: 1,
            Priority: 0,
            Reason: "route-margin-review"));
        CasevacMissionSnapshot lost = Snapshot(
            2,
            2,
            CasevacPhase.AircraftLost,
            disposition: CasevacDisposition.AircraftLostEmpty,
            requestedHandoffAgeTicks: 110);
        recorder.ObserveTick(
            Observation(2, vehicleFlyable: false),
            lost);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, lost);

        Assert.Equal(CasevacAssessmentStatus.Developing, assessment.Safe.Status);
        Assert.Equal(
            CasevacPrimaryCorrectionKind.PreserveAircraftMargin,
            assessment.PrimaryCorrection.Kind);
        Assert.Equal(2, assessment.PrimaryCorrection.StartSourceTick);
        Assert.Contains(
            "aircraft-loss disposition latched",
            assessment.PrimaryCorrection.CorrectionText);
    }

    [Fact]
    public void AggregateSafetyFindingWithoutExactReplayMomentDoesNotFabricateCorrection() {
        var recorder = new CasevacEvidenceRecorder(
            authorityTickHz: 12,
            captureSamples: false);
        recorder.ObserveTick(
            Observation(1, protectionInterventionActive: true),
            Snapshot(
                1,
                1,
                CasevacPhase.Ingress,
                disposition: CasevacDisposition.Pending,
                requestedHandoffAgeTicks: 110));
        CasevacMissionSnapshot aborted = Snapshot(
            2,
            2,
            CasevacPhase.Aborted,
            disposition: CasevacDisposition.ControlledAbort,
            requestedHandoffAgeTicks: 110);
        recorder.ObserveTick(Observation(2), aborted);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, aborted);

        Assert.Equal(CasevacAssessmentStatus.Developing, assessment.Safe.Status);
        Assert.Contains("1/1", assessment.Safe.EvidenceText);
        Assert.False(assessment.PrimaryCorrection.IsAvailable);
    }

    [Fact]
    public void SurfaceClearanceRemainsDiagnosticAndDoesNotCreateAFalseSafetyFinding() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot handoff = RecordCompleted(recorder);
        CasevacMissionSnapshot complete = handoff with {
            Phase = CasevacPhase.Complete,
            LastSourceTick = 7
        };
        recorder.ObserveTick(
            Observation(7, clearanceM: 0.0),
            complete);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, complete);

        Assert.Equal(CasevacAssessmentStatus.Pass, assessment.Safe.Status);
        Assert.Contains(
            "minimum recorded clearance: 0.0 m",
            assessment.Safe.EvidenceText);
        Assert.False(assessment.PrimaryCorrection.IsAvailable);
    }

    [Fact]
    public void MarkedCorrectionSelectionIsDeterministicAndDoesNotRenderReasonText() {
        var first = new CasevacEvidenceRecorder(authorityTickHz: 12);
        var second = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot firstSnapshot = RecordCompleted(first);
        CasevacMissionSnapshot secondSnapshot = RecordCompleted(second);
        CasevacCorrectionRange[] ranges = {
            new(
                CasevacEvidenceStream.Route,
                StartSourceTick: 1,
                EndSourceTick: 1,
                Priority: 1,
                Reason: "opaque-private-reason"),
            new(
                CasevacEvidenceStream.ReceiverTerminal,
                StartSourceTick: 4,
                EndSourceTick: 5,
                Priority: 0,
                Reason: "receiver-review"),
            new(
                CasevacEvidenceStream.PickupTerminal,
                StartSourceTick: 1,
                EndSourceTick: 2,
                Priority: 0,
                Reason: "pickup-review")
        };
        foreach (CasevacCorrectionRange range in ranges)
            first.ConsiderCorrection(range);
        foreach (CasevacCorrectionRange range in ranges.Reverse())
            second.ConsiderCorrection(range);

        CasevacPrimaryCorrection forward =
            CasevacAssessmentEngine.Assess(first, firstSnapshot).PrimaryCorrection;
        CasevacPrimaryCorrection reverse =
            CasevacAssessmentEngine.Assess(second, secondSnapshot).PrimaryCorrection;

        Assert.Equal(forward, reverse);
        Assert.Equal(
            CasevacPrimaryCorrectionKind.StabilizePickupContact,
            forward.Kind);
        Assert.Equal(1, forward.StartSourceTick);
        Assert.Equal(2, forward.EndSourceTick);
        Assert.DoesNotContain("pickup-review", forward.CorrectionText);
        Assert.DoesNotContain("opaque-private-reason", forward.CorrectionText);
    }

    [Fact]
    public void IncoherentTimingFieldsAreNotAssessedRatherThanReinterpreted() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        CasevacMissionSnapshot snapshot = RecordCompleted(
            recorder,
            disposition: CasevacDisposition.TransferredOnTime,
            requestedHandoffAgeTicks: 105);

        CasevacAssessment assessment =
            CasevacAssessmentEngine.Assess(recorder, snapshot);

        Assert.Equal(
            CasevacAssessmentStatus.NotAssessed,
            assessment.Timely.Status);
        Assert.Contains(
            "handoff 1 ticks after the requested marker",
            assessment.Timely.EvidenceText);
    }

    [Fact]
    public void EvidenceAndSnapshotFromDifferentEpochsAreRejected() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveTick(
            Observation(1),
            Snapshot(
                1,
                1,
                CasevacPhase.Ingress,
                requestedHandoffAgeTicks: 110));
        CasevacMissionSnapshot otherEpoch = Snapshot(
            1,
            1,
            CasevacPhase.Ingress,
            requestedHandoffAgeTicks: 110) with {
                MissionEpochSequence = Epoch + 1
            };

        Assert.Throws<InvalidOperationException>(() =>
            CasevacAssessmentEngine.Assess(recorder, otherEpoch));
    }

    static CasevacMissionSnapshot RecordCompleted(
        CasevacEvidenceRecorder recorder,
        CasevacDisposition disposition = CasevacDisposition.TransferredOnTime,
        long requestedHandoffAgeTicks = 110,
        CasevacMaskingState[]? maskingStates = null,
        CasevacEventKind? issue = null,
        LandingZoneObservation? firstPickupGate = null) {
        recorder.ObserveEvent(Event(
            Epoch,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        if (issue.HasValue) {
            long issueTick = issue is CasevacEventKind.HandoffPaused
                or CasevacEventKind.HandoffReset
                    ? 5
                    : issue == CasevacEventKind.ApproachDiscontinued
                        ? 1
                        : 2;
            recorder.ObserveEvent(Event(
                Epoch + 1,
                issue.Value,
                issueTick,
                issueTick,
                siteId: issueTick == 5 ? ReceiverSite : PickupSite,
                approachAttemptId: issueTick == 5 ? 2 : 1));
        }

        maskingStates ??= Enumerable.Repeat(
            CasevacMaskingState.Masked, 6).ToArray();
        if (maskingStates.Length != 6)
            throw new ArgumentException("Exactly six masking states are required.");
        LandingZoneObservation pickupSecond =
            issue == CasevacEventKind.LoadingPaused
                ? HoldGate(PickupSite)
                : issue == CasevacEventKind.LoadingReset
                    ? BreakGate(PickupSite)
                    : AdvanceGate(PickupSite);
        LandingZoneObservation receiverSecond =
            issue == CasevacEventKind.HandoffPaused
                ? HoldGate(ReceiverSite)
                : issue == CasevacEventKind.HandoffReset
                    ? BreakGate(ReceiverSite)
                    : AdvanceGate(ReceiverSite);

        var snapshots = new[] {
            Snapshot(
                1,
                1,
                CasevacPhase.PickupApproach,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1),
            Snapshot(
                2,
                2,
                CasevacPhase.Loading,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1),
            Snapshot(
                3,
                3,
                CasevacPhase.Outbound,
                custody: CapsuleCustody.InAircraft,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                targetSiteId: ReceiverSite,
                latestAttemptId: 1,
                capsuleSecuredCallAgeTicks: 103),
            Snapshot(
                4,
                4,
                CasevacPhase.DropoffApproach,
                custody: CapsuleCustody.InAircraft,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                targetSiteId: ReceiverSite,
                currentAttemptId: 2,
                latestAttemptId: 2,
                capsuleSecuredCallAgeTicks: 103),
            Snapshot(
                5,
                5,
                CasevacPhase.Handoff,
                custody: CapsuleCustody.InAircraft,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                targetSiteId: ReceiverSite,
                currentAttemptId: 2,
                latestAttemptId: 2,
                capsuleSecuredCallAgeTicks: 103),
            Snapshot(
                6,
                6,
                CasevacPhase.Quiet,
                custody: CapsuleCustody.AtReceiver,
                disposition: disposition,
                clockRunning: false,
                requestedHandoffAgeTicks: requestedHandoffAgeTicks,
                latestAttemptId: 2,
                capsuleSecuredCallAgeTicks: 103,
                handoffCallAgeTicks: 106)
        };
        LandingZoneObservation[] gates = {
            firstPickupGate ?? AdvanceGate(PickupSite),
            pickupSecond,
            LandingZoneObservation.None,
            AdvanceGate(ReceiverSite),
            receiverSecond,
            LandingZoneObservation.None
        };
        for (int index = 0; index < snapshots.Length; index++) {
            CasevacMaskingState masking = maskingStates[index];
            recorder.ObserveTick(
                Observation(
                    index + 1,
                    gates[index],
                    maskingState: masking,
                    withinSafeMaskingBand:
                        masking == CasevacMaskingState.Masked),
                snapshots[index]);
        }
        return snapshots[^1];
    }

    static CasevacMissionSnapshot Snapshot(
        long sourceTick,
        long activeTicks,
        CasevacPhase phase,
        CapsuleCustody custody = CapsuleCustody.AtPickup,
        CasevacDisposition disposition = CasevacDisposition.Pending,
        bool clockRunning = true,
        long requestedHandoffAgeTicks = 110,
        string? targetSiteId = null,
        long currentAttemptId = 0,
        long latestAttemptId = 0,
        long? capsuleSecuredCallAgeTicks = null,
        long? handoffCallAgeTicks = null) =>
        new(
            CasevacContract.SchemaVersion,
            ScenarioId,
            Epoch,
            phase,
            custody,
            disposition,
            MissionBeginSourceTick: 0,
            LastSourceTick: sourceTick,
            ActiveMissionTicks: activeTicks,
            CallAgeTicks: 100 + activeTicks,
            RequestedHandoffAgeTicks: requestedHandoffAgeTicks,
            RequestedHandoffWindowPassed:
                100 + activeTicks >= requestedHandoffAgeTicks,
            clockRunning,
            targetSiteId,
            currentAttemptId,
            latestAttemptId,
            StableContact: false,
            StabilizationProgressTicks: 0,
            OperationProgressTicks: 0,
            OperationRequiredTicks: 0,
            QuietProgressTicks: 0,
            PayloadMassKg: custody == CapsuleCustody.InAircraft ? 250.0 : 0.0,
            capsuleSecuredCallAgeTicks,
            handoffCallAgeTicks);

    static CasevacTickObservation Observation(
        long sourceTick,
        LandingZoneObservation? landingZone = null,
        bool vehicleFlyable = true,
        double clearanceM = 30.0,
        CasevacMaskingState maskingState = CasevacMaskingState.Masked,
        bool withinSafeMaskingBand = true,
        bool protectionInterventionActive = false) =>
        new(
            sourceTick,
            vehicleFlyable,
            insideSafeExitVolume: false,
            new Vec3D(sourceTick, 30.0, -sourceTick),
            clearanceM,
            maskingState,
            withinSafeMaskingBand,
            protectionInterventionActive,
            landingZone ?? LandingZoneObservation.None);

    static CasevacMissionEventRecord Event(
        long sequence,
        CasevacEventKind kind,
        long sourceTick,
        long activeTicks,
        string? siteId = null,
        long approachAttemptId = 0) =>
        new(
            CasevacContract.SchemaVersion,
            sequence,
            sourceTick,
            activeTicks,
            Epoch,
            kind,
            ScenarioId,
            AircraftId,
            CapsuleId,
            siteId,
            approachAttemptId);

    static LandingZoneObservation AdvanceGate(string siteId) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 0.2,
            verticalSpeedMps: -0.1,
            pitchRad: 0.01,
            bankRad: -0.01,
            LandingZoneGateViolation.None,
            LandingZoneGateViolation.None,
            LandingZoneGateClass.Advance,
            approachAttemptId: siteId == PickupSite ? 1 : 2);

    static LandingZoneObservation HoldGate(string siteId) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 0.8,
            verticalSpeedMps: -0.1,
            pitchRad: 0.01,
            bankRad: -0.01,
            LandingZoneGateViolation.LateralGroundSpeed,
            LandingZoneGateViolation.None,
            LandingZoneGateClass.Hold,
            approachAttemptId: siteId == PickupSite ? 1 : 2);

    static LandingZoneObservation BreakGate(string siteId) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 2.0,
            verticalSpeedMps: -0.1,
            pitchRad: 0.01,
            bankRad: -0.01,
            LandingZoneGateViolation.LateralGroundSpeed,
            LandingZoneGateViolation.LateralGroundSpeed,
            LandingZoneGateClass.Break,
            approachAttemptId: siteId == PickupSite ? 1 : 2);

    static string AllText(CasevacAssessment assessment) =>
        string.Join(
            " | ",
            assessment.Dimensions.Select(dimension => dimension.EvidenceText)
                .Append(assessment.PrimaryCorrection.CorrectionText));
}

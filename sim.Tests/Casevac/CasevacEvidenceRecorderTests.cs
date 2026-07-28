using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;

namespace GunsOnly.Sim.Tests.Casevac;

public sealed class CasevacEvidenceRecorderTests {
    const string ScenarioId = "casevac-evidence-test";
    const string AircraftId = "aircraft-1";
    const string CapsuleId = "capsule-1";
    const string PickupSite = "PICKUP-LZ";
    const string ReceiverSite = "RECEIVER-LZ";
    const long EpochSequence = 10;

    [Fact]
    public void ConstructorValidatesRatesAndSamplingUsesObservedTickCadence() {
        var defaults = new CasevacEvidenceRecorder();
        Assert.Equal(120, defaults.AuthorityTickHz);
        Assert.Equal(60, defaults.RouteStrideTicks);
        Assert.Equal(10, defaults.TerminalStrideTicks);

        Assert.Throws<ArgumentOutOfRangeException>(
            () => new CasevacEvidenceRecorder(0));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new CasevacEvidenceRecorder(6));
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new CasevacEvidenceRecorder(10));

        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 24);
        Assert.Equal(12, recorder.RouteStrideTicks);
        Assert.Equal(2, recorder.TerminalStrideTicks);

        for (long tick = 1; tick <= 25; tick++)
            recorder.ObserveTick(
                Observation(tick, AdvanceGate(PickupSite)),
                Snapshot(
                    tick,
                    tick,
                    CasevacPhase.PickupApproach,
                    targetSiteId: PickupSite,
                    currentAttemptId: 1,
                    latestAttemptId: 1));

        Assert.Equal(
            new long[] { 1, 13, 25 },
            recorder.RouteSamples.ToArray().Select(sample => sample.SourceTick));
        Assert.Equal(
            Enumerable.Range(0, 13).Select(index => 1L + index * 2L),
            recorder.PickupTerminalSamples.ToArray()
                .Select(sample => sample.SourceTick));
    }

    [Fact]
    public void IdenticalInputsProduceIdenticalEvidence() {
        var first = new CasevacEvidenceRecorder(authorityTickHz: 24);
        var second = new CasevacEvidenceRecorder(authorityTickHz: 24);
        CasevacMissionEventRecord[] events = {
            Event(
                EpochSequence,
                CasevacEventKind.CasevacTaskStarted,
                sourceTick: 0,
                activeTicks: 0),
            Event(
                20,
                CasevacEventKind.PickupApproachEntered,
                sourceTick: 1,
                activeTicks: 1,
                siteId: PickupSite),
            Event(
                30,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: 1,
                activeTicks: 1,
                siteId: PickupSite,
                attemptId: 1)
        };
        CasevacCorrectionRange[] corrections = {
            new(CasevacEvidenceStream.Route, 1, 1, 1, "route-height"),
            new(CasevacEvidenceStream.PickupTerminal, 2, 3, 0, "contact")
        };

        foreach (CasevacEvidenceRecorder recorder in new[] { first, second }) {
            foreach (CasevacMissionEventRecord missionEvent in events)
                recorder.ObserveEvent(missionEvent);
            for (long tick = 1; tick <= 8; tick++) {
                bool hold = tick % 3 == 0;
                recorder.ObserveTick(
                    Observation(
                        tick,
                        hold ? HoldGate(PickupSite) : AdvanceGate(PickupSite),
                        clearanceM: 40.0 - tick,
                        maskingState: tick % 2 == 0
                            ? CasevacMaskingState.Exposed
                            : CasevacMaskingState.Masked,
                        withinSafeMaskingBand: tick % 2 != 0,
                        protectionInterventionActive: tick is 3 or 4),
                    Snapshot(
                        tick,
                        tick,
                        hold ? CasevacPhase.Loading : CasevacPhase.PickupApproach,
                        targetSiteId: PickupSite,
                        currentAttemptId: 1,
                        latestAttemptId: 1,
                        stableContact: !hold,
                        stabilizationProgressTicks: hold ? 0 : 1,
                        operationProgressTicks: hold ? 2 : 0,
                        operationRequiredTicks: hold ? 5 : 0));
            }
            foreach (CasevacCorrectionRange correction in corrections)
                recorder.ConsiderCorrection(correction);
        }

        AssertFullyEquivalent(first, second);
    }

    [Fact]
    public void RouteTraceStopsAtCapacityWhileAggregatesContinue() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        const long observedTicks =
            (CasevacEvidenceRecorder.RouteSampleCapacity * 6L) + 1L;

        for (long tick = 1; tick <= observedTicks; tick++)
            recorder.ObserveTick(
                Observation(tick, clearanceM: 100.0 - tick / 1_000.0),
                Snapshot(tick, tick, CasevacPhase.Ingress));

        Assert.Equal(
            CasevacEvidenceRecorder.RouteSampleCapacity,
            recorder.RouteSampleCount);
        Assert.Equal(1, recorder.RouteSamplesSkippedDueToCapacity);
        Assert.True(recorder.SampleDetailTruncated);
        Assert.True(recorder.EvidenceIncomplete);
        Assert.Equal(observedTicks, recorder.ObservedTickCount);
        Assert.Equal(observedTicks, recorder.ClockRunningTickCount);
        Assert.Equal(observedTicks, recorder.MaskedTicks);
        Assert.Equal(observedTicks, recorder.GetPhaseTicks(CasevacPhase.Ingress));
        Assert.Equal(observedTicks, recorder.HighestActiveMissionTicks);
        Assert.Equal(100.0 - observedTicks / 1_000.0, recorder.MinimumClearanceM);
        Assert.Equal(
            1L + (CasevacEvidenceRecorder.RouteSampleCapacity - 1L) * 6L,
            recorder.RouteSamples.Span[^1].SourceTick);
    }

    [Fact]
    public void TerminalDetailUsesIndependentPickupAndReceiverQuotas() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        const int ticksPerLeg =
            CasevacEvidenceRecorder.PickupTerminalSampleCapacity + 1;
        long sourceTick = 0;

        for (int index = 0; index < ticksPerLeg; index++) {
            sourceTick++;
            recorder.ObserveTick(
                Observation(sourceTick, AdvanceGate(PickupSite)),
                Snapshot(
                    sourceTick,
                    sourceTick,
                    CasevacPhase.PickupApproach,
                    targetSiteId: PickupSite,
                    currentAttemptId: 1,
                    latestAttemptId: 1));
        }
        for (int index = 0; index < ticksPerLeg; index++) {
            sourceTick++;
            recorder.ObserveTick(
                Observation(
                    sourceTick,
                    AdvanceGate(ReceiverSite, approachAttemptId: 2)),
                Snapshot(
                    sourceTick,
                    sourceTick,
                    CasevacPhase.DropoffApproach,
                    custody: CapsuleCustody.InAircraft,
                    targetSiteId: ReceiverSite,
                    currentAttemptId: 2,
                    latestAttemptId: 2,
                    payloadMassKg: 275.0));
        }

        Assert.Equal(
            CasevacEvidenceRecorder.PickupTerminalSampleCapacity,
            recorder.PickupTerminalSampleCount);
        Assert.Equal(
            CasevacEvidenceRecorder.ReceiverTerminalSampleCapacity,
            recorder.ReceiverTerminalSampleCount);
        Assert.Equal(1, recorder.PickupTerminalSamplesSkippedDueToCapacity);
        Assert.Equal(1, recorder.ReceiverTerminalSamplesSkippedDueToCapacity);
        Assert.Equal(1, recorder.PickupTerminalSamples.Span[0].SourceTick);
        Assert.Equal(
            CasevacEvidenceRecorder.PickupTerminalSampleCapacity,
            recorder.PickupTerminalSamples.Span[^1].SourceTick);
        Assert.Equal(ticksPerLeg + 1L,
            recorder.ReceiverTerminalSamples.Span[0].SourceTick);
        Assert.Equal(ticksPerLeg * 2L - 1L,
            recorder.ReceiverTerminalSamples.Span[^1].SourceTick);
        Assert.Equal(ticksPerLeg,
            recorder.GetLandingZoneEvidence(
                CasevacTerminalLeg.Pickup).ObservedTicks);
        Assert.Equal(ticksPerLeg,
            recorder.GetLandingZoneEvidence(
                CasevacTerminalLeg.Receiver).ObservedTicks);
    }

    [Fact]
    public void EventSequenceGapsAndSameTickOrderAreAcceptedButRegressionIsAtomic() {
        var recorder = new CasevacEvidenceRecorder();
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 5,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            CasevacEventKind.PickupApproachEntered,
            sourceTick: 5,
            activeTicks: 0,
            siteId: PickupSite));
        recorder.ObserveEvent(Event(
            40,
            CasevacEventKind.ApproachAttemptStarted,
            sourceTick: 5,
            activeTicks: 0,
            siteId: PickupSite,
            attemptId: 1));

        Assert.Equal(
            new long[] { 10, 20, 40 },
            recorder.ReadMissionEvents().Select(missionEvent =>
                missionEvent.Sequence));
        Assert.Equal(
            new[] {
                CasevacEventKind.CasevacTaskStarted,
                CasevacEventKind.PickupApproachEntered,
                CasevacEventKind.ApproachAttemptStarted
            },
            recorder.ReadMissionEvents().Select(missionEvent =>
                missionEvent.Kind));

        CasevacMissionEventRecord[] before = recorder.ReadMissionEvents();
        long attemptCountBefore = recorder.ApproachAttemptCount;
        long highestAttemptBefore = recorder.HighestApproachAttemptId;
        Assert.Throws<InvalidOperationException>(() => recorder.ObserveEvent(
            Event(
                40,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: 6,
                activeTicks: 1,
                siteId: PickupSite,
                attemptId: 2)));
        Assert.Throws<InvalidOperationException>(() => recorder.ObserveEvent(
            Event(
                30,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: 6,
                activeTicks: 1,
                siteId: PickupSite,
                attemptId: 2)));

        Assert.Equal(before, recorder.ReadMissionEvents());
        Assert.Equal(40, recorder.LastMissionEventSequence);
        Assert.Equal(attemptCountBefore, recorder.ApproachAttemptCount);
        Assert.Equal(highestAttemptBefore, recorder.HighestApproachAttemptId);
    }

    [Fact]
    public void EventRingReportsExactOverflowWhileAttemptAggregatesNeverDrop() {
        var recorder = new CasevacEvidenceRecorder();
        const int totalEvents = CasevacEvidenceRecorder.MissionEventCapacity + 5;
        recorder.ObserveEvent(Event(
            sequence: 1,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0,
            epochSequence: 1));

        for (long sequence = 2; sequence <= totalEvents; sequence++)
            recorder.ObserveEvent(Event(
                sequence,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: sequence - 1,
                activeTicks: sequence - 1,
                siteId: PickupSite,
                attemptId: sequence - 1,
                epochSequence: 1));

        Assert.Equal(
            CasevacEvidenceRecorder.MissionEventCapacity,
            recorder.MissionEventCount);
        Assert.Equal(5, recorder.DroppedMissionEventCount);
        Assert.True(recorder.MissionEventOverflowed);
        Assert.True(recorder.EvidenceIncomplete);
        Assert.Equal(totalEvents - 1L, recorder.ApproachAttemptCount);
        Assert.Equal(totalEvents - 1L, recorder.HighestApproachAttemptId);
        Assert.Equal(1, recorder.GetFirstEventSourceTick(
            CasevacEventKind.ApproachAttemptStarted));
        Assert.Equal(1, recorder.GetFirstEventActiveMissionTick(
            CasevacEventKind.ApproachAttemptStarted));

        CasevacMissionEventOverflow overflow =
            Assert.IsType<CasevacMissionEventOverflow>(
                recorder.MissionEventOverflow);
        Assert.Equal(5, overflow.DroppedCount);
        Assert.Equal(1, overflow.FirstDroppedSequence);
        Assert.Equal(5, overflow.LastDroppedSequence);
        Assert.Equal(0, overflow.FirstDroppedSourceTick);
        Assert.Equal(4, overflow.LastDroppedSourceTick);

        CasevacMissionEventRecord[] retained = recorder.ReadMissionEvents();
        Assert.Equal(6, retained[0].Sequence);
        Assert.Equal(totalEvents, retained[^1].Sequence);
        Assert.True(retained
            .Zip(retained.Skip(1))
            .All(pair => pair.First.Sequence < pair.Second.Sequence));
    }

    [Fact]
    public void AggregatesRetainGateMaskingPhaseClearanceAndProtectionFacts() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        var observations = new[] {
            Observation(
                1,
                AdvanceGate(
                    PickupSite,
                    lateralGroundSpeedMps: 0.2,
                    verticalSpeedMps: -0.3,
                    pitchRad: -0.04,
                    bankRad: 0.05),
                clearanceM: 40.0,
                maskingState: CasevacMaskingState.Masked,
                withinSafeMaskingBand: true),
            Observation(
                2,
                HoldGate(
                    PickupSite,
                    lateralGroundSpeedMps: 2.5,
                    verticalSpeedMps: -0.5,
                    pitchRad: 0.07,
                    bankRad: -0.08),
                clearanceM: 20.0,
                maskingState: CasevacMaskingState.Exposed,
                withinSafeMaskingBand: false,
                protectionInterventionActive: true),
            Observation(
                3,
                BreakGate(
                    PickupSite,
                    LandingZoneGateViolation.VerticalSpeed
                        | LandingZoneGateViolation.Bank,
                    lateralGroundSpeedMps: 1.5,
                    verticalSpeedMps: -3.0,
                    pitchRad: 0.1,
                    bankRad: -0.4),
                clearanceM: 7.0,
                maskingState: CasevacMaskingState.NotAssessed,
                withinSafeMaskingBand: true,
                protectionInterventionActive: true),
            Observation(
                4,
                AdvanceGate(
                    ReceiverSite,
                    lateralGroundSpeedMps: 0.7,
                    verticalSpeedMps: -0.1,
                    pitchRad: 0.01,
                    bankRad: 0.02,
                    approachAttemptId: 2),
                clearanceM: 30.0,
                maskingState: CasevacMaskingState.Masked),
            Observation(
                5,
                BreakGate(
                    ReceiverSite,
                    LandingZoneGateViolation.LateralGroundSpeed
                        | LandingZoneGateViolation.Pitch,
                    lateralGroundSpeedMps: 4.5,
                    verticalSpeedMps: -0.2,
                    pitchRad: -0.6,
                    bankRad: 0.1,
                    approachAttemptId: 2),
                vehicleFlyable: false,
                clearanceM: 15.0,
                maskingState: CasevacMaskingState.Exposed,
                withinSafeMaskingBand: false,
                protectionInterventionActive: true)
        };
        CasevacMissionSnapshot[] snapshots = {
            Snapshot(
                1, 1, CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1),
            Snapshot(
                2, 2, CasevacPhase.Loading,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1),
            Snapshot(
                3, 3, CasevacPhase.Loading,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1),
            Snapshot(
                4, 4, CasevacPhase.DropoffApproach,
                custody: CapsuleCustody.InAircraft,
                targetSiteId: ReceiverSite,
                currentAttemptId: 2,
                latestAttemptId: 2,
                payloadMassKg: 275.0),
            Snapshot(
                5, 5, CasevacPhase.Handoff,
                custody: CapsuleCustody.InAircraft,
                targetSiteId: ReceiverSite,
                currentAttemptId: 2,
                latestAttemptId: 2,
                payloadMassKg: 275.0)
        };

        for (int index = 0; index < observations.Length; index++)
            recorder.ObserveTick(observations[index], snapshots[index]);

        Assert.Equal(5, recorder.ObservedTickCount);
        Assert.Equal(5, recorder.ClockRunningTickCount);
        Assert.Equal(2, recorder.MaskedTicks);
        Assert.Equal(2, recorder.ExposedTicks);
        Assert.Equal(1, recorder.MaskingNotAssessedTicks);
        Assert.Equal(3, recorder.WithinSafeMaskingBandTicks);
        Assert.Equal(2, recorder.RouteObservedTicks);
        Assert.Equal(2, recorder.RouteMaskedTicks);
        Assert.Equal(0, recorder.RouteExposedTicks);
        Assert.Equal(0, recorder.RouteMaskingNotAssessedTicks);
        Assert.Equal(2, recorder.RouteWithinSafeMaskingBandTicks);
        Assert.Equal(1, recorder.VehicleUnflyableTicks);
        Assert.Equal(3, recorder.ProtectionInterventionActiveTicks);
        Assert.Equal(2, recorder.ProtectionInterventionEdges);
        Assert.Equal(7.0, recorder.MinimumClearanceM);
        Assert.Equal(1, recorder.GetPhaseTicks(CasevacPhase.PickupApproach));
        Assert.Equal(2, recorder.GetPhaseTicks(CasevacPhase.Loading));
        Assert.Equal(1, recorder.GetPhaseTicks(CasevacPhase.DropoffApproach));
        Assert.Equal(1, recorder.GetPhaseTicks(CasevacPhase.Handoff));
        Assert.Equal(2, recorder.HighestApproachAttemptId);

        CasevacLandingZoneEvidence pickup =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        Assert.Equal(3, pickup.ObservedTicks);
        Assert.Equal(1, pickup.AdvanceTicks);
        Assert.Equal(1, pickup.HoldTicks);
        Assert.Equal(1, pickup.BreakTicks);
        Assert.Equal(2, pickup.EnterViolationTicks);
        Assert.Equal(1, pickup.ExitViolationTicks);
        Assert.Equal(
            LandingZoneGateViolation.LateralGroundSpeed
                | LandingZoneGateViolation.VerticalSpeed
                | LandingZoneGateViolation.Bank,
            pickup.ObservedEnterViolations);
        Assert.Equal(
            LandingZoneGateViolation.VerticalSpeed
                | LandingZoneGateViolation.Bank,
            pickup.ObservedExitViolations);
        Assert.Equal(2.5, pickup.MaximumLateralGroundSpeedMps);
        Assert.Equal(3.0, pickup.MaximumAbsoluteVerticalSpeedMps);
        Assert.Equal(0.1, pickup.MaximumAbsolutePitchRad);
        Assert.Equal(0.4, pickup.MaximumAbsoluteBankRad);
        Assert.Equal(1, recorder.GetEnterViolationTicks(
            CasevacTerminalLeg.Pickup,
            LandingZoneGateViolation.LateralGroundSpeed));
        Assert.Equal(1, recorder.GetEnterViolationTicks(
            CasevacTerminalLeg.Pickup,
            LandingZoneGateViolation.VerticalSpeed));
        Assert.Equal(1, recorder.GetExitViolationTicks(
            CasevacTerminalLeg.Pickup,
            LandingZoneGateViolation.Bank));

        CasevacLandingZoneEvidence receiver =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Receiver);
        Assert.Equal(2, receiver.ObservedTicks);
        Assert.Equal(1, receiver.AdvanceTicks);
        Assert.Equal(0, receiver.HoldTicks);
        Assert.Equal(1, receiver.BreakTicks);
        Assert.Equal(1, receiver.EnterViolationTicks);
        Assert.Equal(1, receiver.ExitViolationTicks);
        Assert.Equal(
            LandingZoneGateViolation.LateralGroundSpeed
                | LandingZoneGateViolation.Pitch,
            receiver.ObservedEnterViolations);
        Assert.Equal(receiver.ObservedEnterViolations,
            receiver.ObservedExitViolations);
        Assert.Equal(4.5, receiver.MaximumLateralGroundSpeedMps);
        Assert.Equal(0.2, receiver.MaximumAbsoluteVerticalSpeedMps);
        Assert.Equal(0.6, receiver.MaximumAbsolutePitchRad);
        Assert.Equal(0.1, receiver.MaximumAbsoluteBankRad);
    }

    [Fact]
    public void OmittingObserveTickIsAPauseForCountersAndCadence() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 24);
        recorder.ObserveTick(
            Observation(1, AdvanceGate(PickupSite)),
            Snapshot(
                1, 1, CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1));

        long observedBeforePause = recorder.ObservedTickCount;
        int routeSamplesBeforePause = recorder.RouteSampleCount;
        int terminalSamplesBeforePause = recorder.PickupTerminalSampleCount;

        Assert.Equal(observedBeforePause, recorder.ObservedTickCount);
        Assert.Equal(routeSamplesBeforePause, recorder.RouteSampleCount);
        Assert.Equal(terminalSamplesBeforePause,
            recorder.PickupTerminalSampleCount);

        recorder.ObserveTick(
            Observation(10_000, AdvanceGate(PickupSite)),
            Snapshot(
                10_000, 2, CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1));

        Assert.Equal(2, recorder.ObservedTickCount);
        Assert.Equal(2, recorder.ClockRunningTickCount);
        Assert.Equal(1, recorder.RouteSampleCount);
        Assert.Equal(1, recorder.PickupTerminalSampleCount);
        Assert.Equal(2, recorder.HighestActiveMissionTicks);
        Assert.Equal(10_000, recorder.LastObservedSourceTick);
    }

    [Fact]
    public void CorrectionSelectionIsBoundedAndIndependentOfInsertionOrder() {
        CasevacCorrectionRange[] candidates = {
            new(CasevacEvidenceStream.Route, 10, 19, 0, "beta"),
            new(CasevacEvidenceStream.ReceiverTerminal, 10, 19, 0, "alpha"),
            new(CasevacEvidenceStream.PickupTerminal, 5, 8, 0, "zulu"),
            new(CasevacEvidenceStream.Route, 1, 3, 1, "later-priority"),
            new(CasevacEvidenceStream.Route, 1, 3, 2, "lowest-priority")
        };
        var forward = new CasevacEvidenceRecorder(authorityTickHz: 12);
        var reverse = new CasevacEvidenceRecorder(authorityTickHz: 12);
        SeedCorrectionEvidence(forward);
        SeedCorrectionEvidence(reverse);

        foreach (CasevacCorrectionRange correction in candidates)
            forward.ConsiderCorrection(correction);
        forward.ConsiderCorrection(candidates[0]);
        foreach (CasevacCorrectionRange correction in candidates.Reverse())
            reverse.ConsiderCorrection(correction);

        CasevacCorrectionRange[] expected = {
            candidates[2],
            candidates[1],
            candidates[0]
        };
        Assert.Equal(
            CasevacEvidenceRecorder.CorrectionRangeCapacity,
            forward.CorrectionRangeCount);
        Assert.Equal(expected, forward.CorrectionRanges.ToArray());
        Assert.Equal(expected, reverse.CorrectionRanges.ToArray());
    }

    [Fact]
    public void CorrectionsMustReferenceRetainedReplayEvidence() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ConsiderCorrection(new CasevacCorrectionRange(
                CasevacEvidenceStream.Route, 1, 1, 0, "no-evidence")));

        SeedCorrectionEvidence(recorder);
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ConsiderCorrection(new CasevacCorrectionRange(
                CasevacEvidenceStream.PickupTerminal,
                10,
                11,
                0,
                "wrong-stream-range")));
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ConsiderCorrection(new CasevacCorrectionRange(
                CasevacEvidenceStream.Route,
                20,
                21,
                0,
                "future-range")));
        Assert.Equal(0, recorder.CorrectionRangeCount);
    }

    [Fact]
    public void DiscontinuedApproachDoesNotAccumulateBreaksDuringGoAround() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveTick(
            Observation(1, BreakGate(PickupSite)),
            Snapshot(
                1,
                1,
                CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 0,
                latestAttemptId: 1));
        for (long tick = 2; tick <= 101; tick++)
            recorder.ObserveTick(
                Observation(tick, LandingZoneObservation.None),
                Snapshot(
                    tick,
                    tick,
                    CasevacPhase.PickupApproach,
                    targetSiteId: PickupSite,
                    currentAttemptId: 0,
                    latestAttemptId: 1));

        CasevacLandingZoneEvidence pickup =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        Assert.Equal(1, pickup.ObservedTicks);
        Assert.Equal(1, pickup.BreakTicks);
    }

    [Fact]
    public void CompletionTicksRetainTheirPreTransitionApproachAttribution() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            CasevacEventKind.PickupApproachEntered,
            sourceTick: 0,
            activeTicks: 0,
            siteId: PickupSite));
        recorder.ObserveEvent(Event(
            30,
            CasevacEventKind.ApproachAttemptStarted,
            sourceTick: 0,
            activeTicks: 0,
            siteId: PickupSite,
            attemptId: 1));
        recorder.ObserveTick(
            Observation(1, AdvanceGate(PickupSite)),
            Snapshot(
                1,
                1,
                CasevacPhase.Outbound,
                custody: CapsuleCustody.InAircraft,
                targetSiteId: ReceiverSite,
                latestAttemptId: 1,
                payloadMassKg: 275.0));

        recorder.ObserveEvent(Event(
            40,
            CasevacEventKind.DropoffApproachEntered,
            sourceTick: 2,
            activeTicks: 2,
            siteId: ReceiverSite));
        recorder.ObserveEvent(Event(
            50,
            CasevacEventKind.ApproachAttemptStarted,
            sourceTick: 2,
            activeTicks: 2,
            siteId: ReceiverSite,
            attemptId: 2));
        recorder.ObserveTick(
            Observation(
                2,
                AdvanceGate(ReceiverSite, approachAttemptId: 2)),
            Snapshot(
                2,
                2,
                CasevacPhase.Quiet,
                custody: CapsuleCustody.AtReceiver,
                disposition: CasevacDisposition.TransferredOnTime,
                clockRunning: false,
                latestAttemptId: 2,
                handoffCallAgeTicks: 102));

        CasevacLandingZoneEvidence pickup =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        CasevacLandingZoneEvidence receiver =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Receiver);
        Assert.Equal(1, pickup.ObservedTicks);
        Assert.Equal(1, pickup.AdvanceTicks);
        Assert.Equal(1, receiver.ObservedTicks);
        Assert.Equal(1, receiver.AdvanceTicks);
    }

    [Fact]
    public void EntryTickDoesNotBelongToTheAttemptStartedAfterItsObservation() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveTick(
            Observation(
                1,
                AdvanceGate(PickupSite, approachAttemptId: 0)),
            Snapshot(
                1,
                1,
                CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1));

        CasevacLandingZoneEvidence pickup =
            recorder.GetLandingZoneEvidence(CasevacTerminalLeg.Pickup);
        Assert.Equal(0, pickup.ObservedTicks);
    }

    [Fact]
    public void OutsideAbortAndLossTicksRetainMappedAttemptAttribution() {
        var abort = RecorderWithMappedAttempt(
            CasevacTerminalLeg.Pickup, attemptId: 1);
        abort.ObserveTick(
            Observation(1, OutsideGate(approachAttemptId: 1)),
            Snapshot(
                1,
                1,
                CasevacPhase.AbortReturn,
                targetSiteId: "SAFE-EXIT",
                latestAttemptId: 1));

        var loss = RecorderWithMappedAttempt(
            CasevacTerminalLeg.Receiver, attemptId: 2);
        loss.ObserveTick(
            Observation(1, OutsideGate(approachAttemptId: 2)),
            Snapshot(
                1,
                1,
                CasevacPhase.AircraftLost,
                custody: CapsuleCustody.InAircraft,
                disposition: CasevacDisposition.AircraftLostOccupied,
                clockRunning: false,
                latestAttemptId: 2,
                payloadMassKg: 275.0));

        Assert.Equal(
            1,
            abort.GetLandingZoneEvidence(
                CasevacTerminalLeg.Pickup).BreakTicks);
        Assert.Equal(
            1,
            loss.GetLandingZoneEvidence(
                CasevacTerminalLeg.Receiver).BreakTicks);
    }

    [Fact]
    public void UnknownTerminalDoesNotConsumeEitherAuthoredSiteQuota() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveTick(
            Observation(
                1,
                AdvanceGate(ReceiverSite, approachAttemptId: 0)),
            Snapshot(
                1,
                1,
                CasevacPhase.Ingress,
                targetSiteId: PickupSite));

        Assert.Equal(0, recorder.PickupTerminalSampleCount);
        Assert.Equal(0, recorder.ReceiverTerminalSampleCount);
        Assert.Null(recorder.PickupSiteId);
        Assert.Null(recorder.ReceiverSiteId);
        Assert.Equal(1, recorder.RouteSampleCount);
        Assert.Equal(ReceiverSite,
            recorder.RouteSamples.Span[0].LandingZoneSiteId);
    }

    [Fact]
    public void FinalDispositionAndTerminalEventTicksRemainExact() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            CasevacEventKind.HandoffCompleted,
            sourceTick: 7,
            activeTicks: 7,
            siteId: ReceiverSite,
            attemptId: 2));
        recorder.ObserveTick(
            Observation(
                7,
                AdvanceGate(ReceiverSite, approachAttemptId: 2)),
            Snapshot(
                7,
                7,
                CasevacPhase.Quiet,
                custody: CapsuleCustody.AtReceiver,
                disposition: CasevacDisposition.TransferredOnTime,
                clockRunning: false,
                targetSiteId: ReceiverSite,
                latestAttemptId: 2,
                handoffCallAgeTicks: 107));
        recorder.ObserveTick(
            Observation(100, landingZone: LandingZoneObservation.None),
            Snapshot(
                100,
                7,
                CasevacPhase.Complete,
                custody: CapsuleCustody.AtReceiver,
                disposition: CasevacDisposition.TransferredOnTime,
                clockRunning: false,
                latestAttemptId: 2,
                handoffCallAgeTicks: 107));

        Assert.Equal(
            CasevacDisposition.TransferredOnTime,
            recorder.FinalDisposition);
        Assert.Equal(7, recorder.TerminalDispositionSourceTick);
        Assert.Equal(7, recorder.GetFirstEventSourceTick(
            CasevacEventKind.HandoffCompleted));
        Assert.Equal(7, recorder.GetFirstEventActiveMissionTick(
            CasevacEventKind.HandoffCompleted));
        Assert.Equal(1, recorder.GetEventCount(
            CasevacEventKind.HandoffCompleted));
        Assert.Equal(7, recorder.ClockRunningTickCount);
        Assert.Equal(1, recorder.GetPhaseTicks(CasevacPhase.Quiet));
        Assert.Equal(1, recorder.GetPhaseTicks(CasevacPhase.Complete));

        Assert.Throws<InvalidOperationException>(() => recorder.ObserveTick(
            Observation(101, landingZone: LandingZoneObservation.None),
            Snapshot(
                101,
                7,
                CasevacPhase.Complete,
                custody: CapsuleCustody.AtReceiver,
                disposition: CasevacDisposition.Pending,
                clockRunning: false,
                latestAttemptId: 2,
                handoffCallAgeTicks: 107)));
        Assert.Equal(
            CasevacDisposition.TransferredOnTime,
            recorder.FinalDisposition);
        Assert.Equal(2, recorder.ObservedTickCount);
        Assert.Equal(100, recorder.LastObservedSourceTick);
    }

    [Fact]
    public void AircraftLossCauseRequiresAndRetainsTheExactUnflyableEventTick() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            CasevacEventKind.CasevacAircraftLost,
            sourceTick: 2,
            activeTicks: 2));
        CasevacMissionSnapshot lost = Snapshot(
            2,
            2,
            CasevacPhase.AircraftLost,
            disposition: CasevacDisposition.AircraftLostEmpty,
            clockRunning: false);

        recorder.ObserveTick(
            Observation(2, vehicleFlyable: false),
            lost,
            CasevacAircraftLossCause.UsableEnergyDepleted);

        Assert.Equal(
            CasevacAircraftLossCause.UsableEnergyDepleted,
            recorder.AircraftLossCause);
        Assert.Equal(2, recorder.AircraftLossSourceTick);
        Assert.Equal(2, recorder.TerminalDispositionSourceTick);

        var mismatch = new CasevacEvidenceRecorder(authorityTickHz: 12);
        mismatch.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        mismatch.ObserveEvent(Event(
            20,
            CasevacEventKind.CasevacAircraftLost,
            sourceTick: 1,
            activeTicks: 1));
        Assert.Throws<InvalidOperationException>(() =>
            mismatch.ObserveTick(
                Observation(2, vehicleFlyable: false),
                lost,
                CasevacAircraftLossCause.CollisionAuthorityContact));
        Assert.Equal(0, mismatch.ObservedTickCount);
        Assert.Equal(CasevacAircraftLossCause.None,
            mismatch.AircraftLossCause);
    }

    [Fact]
    public void AircraftLossCauseRejectsAnActiveTickMismatchBeforeMutation() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            CasevacEventKind.CasevacAircraftLost,
            sourceTick: 2,
            activeTicks: 3));
        CasevacMissionSnapshot lost = Snapshot(
            2,
            2,
            CasevacPhase.AircraftLost,
            disposition: CasevacDisposition.AircraftLostEmpty,
            clockRunning: false);

        Assert.Throws<InvalidOperationException>(() =>
            recorder.ObserveTick(
                Observation(2, vehicleFlyable: false),
                lost,
                CasevacAircraftLossCause.VehicleAuthorityUnflyable));

        Assert.Equal(0, recorder.ObservedTickCount);
        Assert.Equal(-1, recorder.LastObservedSourceTick);
        Assert.Equal(CasevacDisposition.Pending,
            recorder.FinalDisposition);
        Assert.Null(recorder.TerminalDispositionSourceTick);
        Assert.Equal(CasevacAircraftLossCause.None,
            recorder.AircraftLossCause);
        Assert.Null(recorder.AircraftLossSourceTick);
    }

    [Fact]
    public void DisablingSamplesPreservesEveryAggregate() {
        var captured =
            new CasevacEvidenceRecorder(authorityTickHz: 24, captureSamples: true);
        var aggregateOnly =
            new CasevacEvidenceRecorder(authorityTickHz: 24, captureSamples: false);

        for (long tick = 1; tick <= 24; tick++) {
            CasevacTickObservation observation = Observation(
                tick,
                tick % 4 == 0
                    ? HoldGate(PickupSite)
                    : AdvanceGate(PickupSite),
                clearanceM: 50.0 - tick,
                maskingState: tick % 3 == 0
                    ? CasevacMaskingState.Exposed
                    : CasevacMaskingState.Masked,
                withinSafeMaskingBand:
                    tick % 3 != 0 || tick % 2 == 0,
                protectionInterventionActive: tick is >= 8 and <= 10);
            CasevacMissionSnapshot snapshot = Snapshot(
                tick,
                tick,
                tick % 4 == 0
                    ? CasevacPhase.Loading
                    : CasevacPhase.PickupApproach,
                targetSiteId: PickupSite,
                currentAttemptId: 1,
                latestAttemptId: 1);
            captured.ObserveTick(observation, snapshot);
            aggregateOnly.ObserveTick(observation, snapshot);
        }

        Assert.True(captured.RouteSampleCount > 0);
        Assert.True(captured.PickupTerminalSampleCount > 0);
        Assert.Equal(0, aggregateOnly.RouteSampleCount);
        Assert.Equal(0, aggregateOnly.PickupTerminalSampleCount);
        Assert.Equal(0, aggregateOnly.ReceiverTerminalSampleCount);
        Assert.False(aggregateOnly.SampleDetailTruncated);
        AssertAggregateEquivalent(captured, aggregateOnly);
    }

    [Fact]
    public void InvalidEventAndSnapshotCoherenceFailBeforeMutation() {
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));

        CasevacMissionEventRecord[] eventsBefore =
            recorder.ReadMissionEvents();
        Assert.Throws<InvalidOperationException>(() => recorder.ObserveEvent(
            Event(
                20,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: 1,
                activeTicks: 1,
                siteId: PickupSite,
                attemptId: 1,
                epochSequence: EpochSequence + 1)));
        Assert.Throws<InvalidOperationException>(() => recorder.ObserveEvent(
            Event(
                20,
                CasevacEventKind.ApproachAttemptStarted,
                sourceTick: 1,
                activeTicks: 1,
                siteId: PickupSite,
                attemptId: 1,
                aircraftId: "different-aircraft")));
        Assert.Equal(eventsBefore, recorder.ReadMissionEvents());
        Assert.Equal(0, recorder.ApproachAttemptCount);
        Assert.Equal(EpochSequence, recorder.LastMissionEventSequence);

        recorder.ObserveTick(
            Observation(1),
            Snapshot(1, 1, CasevacPhase.Ingress));
        long ticksBefore = recorder.ObservedTickCount;
        int samplesBefore = recorder.RouteSampleCount;
        long ingressTicksBefore =
            recorder.GetPhaseTicks(CasevacPhase.Ingress);

        Assert.Throws<ArgumentOutOfRangeException>(() => recorder.ObserveTick(
            Observation(2),
            Snapshot(3, 2, CasevacPhase.Ingress)));
        Assert.Throws<InvalidOperationException>(() => recorder.ObserveTick(
            Observation(2),
            Snapshot(2, 2, CasevacPhase.Ingress) with {
                ScenarioId = "different-scenario"
            }));

        Assert.Equal(ticksBefore, recorder.ObservedTickCount);
        Assert.Equal(samplesBefore, recorder.RouteSampleCount);
        Assert.Equal(ingressTicksBefore,
            recorder.GetPhaseTicks(CasevacPhase.Ingress));
        Assert.Equal(1, recorder.LastObservedSourceTick);
        Assert.Equal(ScenarioId, recorder.ScenarioId);
        Assert.Equal(EpochSequence, recorder.MissionEpochSequence);
    }

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
            new Vec3D(sourceTick, sourceTick * 0.5, -sourceTick),
            clearanceM,
            maskingState,
            withinSafeMaskingBand,
            protectionInterventionActive,
            landingZone ?? LandingZoneObservation.None);

    static CasevacEvidenceRecorder RecorderWithMappedAttempt(
        CasevacTerminalLeg leg,
        long attemptId) {
        string siteId = leg == CasevacTerminalLeg.Pickup
            ? PickupSite
            : ReceiverSite;
        CasevacEventKind enteredKind = leg == CasevacTerminalLeg.Pickup
            ? CasevacEventKind.PickupApproachEntered
            : CasevacEventKind.DropoffApproachEntered;
        var recorder = new CasevacEvidenceRecorder(authorityTickHz: 12);
        recorder.ObserveEvent(Event(
            EpochSequence,
            CasevacEventKind.CasevacTaskStarted,
            sourceTick: 0,
            activeTicks: 0));
        recorder.ObserveEvent(Event(
            20,
            enteredKind,
            sourceTick: 0,
            activeTicks: 0,
            siteId: siteId));
        recorder.ObserveEvent(Event(
            30,
            CasevacEventKind.ApproachAttemptStarted,
            sourceTick: 0,
            activeTicks: 0,
            siteId: siteId,
            attemptId: attemptId));
        return recorder;
    }

    static void SeedCorrectionEvidence(CasevacEvidenceRecorder recorder) {
        for (long tick = 1; tick <= 9; tick++)
            recorder.ObserveTick(
                Observation(tick, AdvanceGate(PickupSite)),
                Snapshot(
                    tick,
                    tick,
                    CasevacPhase.PickupApproach,
                    targetSiteId: PickupSite,
                    currentAttemptId: 1,
                    latestAttemptId: 1));
        for (long tick = 10; tick <= 20; tick++)
            recorder.ObserveTick(
                Observation(
                    tick,
                    AdvanceGate(ReceiverSite, approachAttemptId: 2)),
                Snapshot(
                    tick,
                    tick,
                    CasevacPhase.DropoffApproach,
                    custody: CapsuleCustody.InAircraft,
                    targetSiteId: ReceiverSite,
                    currentAttemptId: 2,
                    latestAttemptId: 2,
                    payloadMassKg: 275.0));
    }

    static CasevacMissionSnapshot Snapshot(
        long sourceTick,
        long activeTicks,
        CasevacPhase phase,
        CapsuleCustody custody = CapsuleCustody.AtPickup,
        CasevacDisposition disposition = CasevacDisposition.Pending,
        bool clockRunning = true,
        string? targetSiteId = null,
        long currentAttemptId = 0,
        long latestAttemptId = 0,
        bool stableContact = false,
        int stabilizationProgressTicks = 0,
        int operationProgressTicks = 0,
        int operationRequiredTicks = 0,
        int quietProgressTicks = 0,
        double payloadMassKg = 0.0,
        long? capsuleSecuredCallAgeTicks = null,
        long? handoffCallAgeTicks = null) =>
        new(
            CasevacContract.SchemaVersion,
            ScenarioId,
            EpochSequence,
            phase,
            custody,
            disposition,
            MissionBeginSourceTick: 0,
            LastSourceTick: sourceTick,
            ActiveMissionTicks: activeTicks,
            CallAgeTicks: 100 + activeTicks,
            RequestedHandoffAgeTicks: 10_000,
            RequestedHandoffWindowPassed: false,
            clockRunning,
            targetSiteId,
            currentAttemptId,
            latestAttemptId,
            stableContact,
            stabilizationProgressTicks,
            operationProgressTicks,
            operationRequiredTicks,
            quietProgressTicks,
            payloadMassKg,
            capsuleSecuredCallAgeTicks,
            handoffCallAgeTicks);

    static CasevacMissionEventRecord Event(
        long sequence,
        CasevacEventKind kind,
        long sourceTick,
        long activeTicks,
        string? siteId = null,
        long attemptId = 0,
        long epochSequence = EpochSequence,
        string aircraftId = AircraftId) =>
        new(
            CasevacContract.SchemaVersion,
            sequence,
            sourceTick,
            activeTicks,
            epochSequence,
            kind,
            ScenarioId,
            aircraftId,
            CapsuleId,
            siteId,
            attemptId);

    static LandingZoneObservation AdvanceGate(
        string siteId,
        double lateralGroundSpeedMps = 0.2,
        double verticalSpeedMps = -0.1,
        double pitchRad = 0.01,
        double bankRad = -0.01,
        long approachAttemptId = 1) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            LandingZoneGateViolation.None,
            LandingZoneGateViolation.None,
            LandingZoneGateClass.Advance,
            approachAttemptId);

    static LandingZoneObservation HoldGate(
        string siteId,
        double lateralGroundSpeedMps = 0.8,
        double verticalSpeedMps = -0.2,
        double pitchRad = 0.02,
        double bankRad = -0.02,
        long approachAttemptId = 1) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            LandingZoneGateViolation.LateralGroundSpeed,
            LandingZoneGateViolation.None,
            LandingZoneGateClass.Hold,
            approachAttemptId);

    static LandingZoneObservation BreakGate(
        string siteId,
        LandingZoneGateViolation violations =
            LandingZoneGateViolation.VerticalSpeed,
        double lateralGroundSpeedMps = 1.2,
        double verticalSpeedMps = -0.5,
        double pitchRad = 0.04,
        double bankRad = -0.04,
        long approachAttemptId = 1) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: true,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            violations,
            violations,
            LandingZoneGateClass.Break,
            approachAttemptId);

    static LandingZoneObservation OutsideGate(long approachAttemptId) =>
        new(
            siteId: null,
            insideTerminalVolume: false,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: false,
            lateralGroundSpeedMps: 1.2,
            verticalSpeedMps: -0.5,
            pitchRad: 0.04,
            bankRad: -0.04,
            LandingZoneGateViolation.OutsideTerminalVolume
                | LandingZoneGateViolation.OutsideEnterFootprint
                | LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact,
            LandingZoneGateViolation.OutsideTerminalVolume
                | LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact,
            LandingZoneGateClass.Break,
            approachAttemptId);

    static void AssertFullyEquivalent(
        CasevacEvidenceRecorder expected,
        CasevacEvidenceRecorder actual) {
        AssertAggregateEquivalent(expected, actual);
        Assert.Equal(expected.RouteSampleCount, actual.RouteSampleCount);
        Assert.Equal(expected.PickupTerminalSampleCount,
            actual.PickupTerminalSampleCount);
        Assert.Equal(expected.ReceiverTerminalSampleCount,
            actual.ReceiverTerminalSampleCount);
        Assert.Equal(expected.RouteSamplesSkippedDueToCapacity,
            actual.RouteSamplesSkippedDueToCapacity);
        Assert.Equal(expected.PickupTerminalSamplesSkippedDueToCapacity,
            actual.PickupTerminalSamplesSkippedDueToCapacity);
        Assert.Equal(expected.ReceiverTerminalSamplesSkippedDueToCapacity,
            actual.ReceiverTerminalSamplesSkippedDueToCapacity);
        Assert.Equal(expected.RouteSamples.ToArray(),
            actual.RouteSamples.ToArray());
        Assert.Equal(expected.PickupTerminalSamples.ToArray(),
            actual.PickupTerminalSamples.ToArray());
        Assert.Equal(expected.ReceiverTerminalSamples.ToArray(),
            actual.ReceiverTerminalSamples.ToArray());
        Assert.Equal(expected.ReadMissionEvents(), actual.ReadMissionEvents());
        Assert.Equal(expected.MissionEventOverflow,
            actual.MissionEventOverflow);
        Assert.Equal(expected.CorrectionRanges.ToArray(),
            actual.CorrectionRanges.ToArray());
    }

    static void AssertAggregateEquivalent(
        CasevacEvidenceRecorder expected,
        CasevacEvidenceRecorder actual) {
        Assert.Equal(expected.AuthorityTickHz, actual.AuthorityTickHz);
        Assert.Equal(expected.ScenarioId, actual.ScenarioId);
        Assert.Equal(expected.PickupSiteId, actual.PickupSiteId);
        Assert.Equal(expected.ReceiverSiteId, actual.ReceiverSiteId);
        Assert.Equal(expected.MissionEpochSequence,
            actual.MissionEpochSequence);
        Assert.Equal(expected.ObservedTickCount, actual.ObservedTickCount);
        Assert.Equal(expected.ClockRunningTickCount,
            actual.ClockRunningTickCount);
        Assert.Equal(expected.HighestActiveMissionTicks,
            actual.HighestActiveMissionTicks);
        Assert.Equal(expected.LastObservedSourceTick,
            actual.LastObservedSourceTick);
        Assert.Equal(expected.LastPhase, actual.LastPhase);
        Assert.Equal(expected.FinalDisposition, actual.FinalDisposition);
        Assert.Equal(expected.TerminalDispositionSourceTick,
            actual.TerminalDispositionSourceTick);
        Assert.Equal(expected.MaskedTicks, actual.MaskedTicks);
        Assert.Equal(expected.ExposedTicks, actual.ExposedTicks);
        Assert.Equal(expected.MaskingNotAssessedTicks,
            actual.MaskingNotAssessedTicks);
        Assert.Equal(expected.WithinSafeMaskingBandTicks,
            actual.WithinSafeMaskingBandTicks);
        Assert.Equal(expected.RouteObservedTicks,
            actual.RouteObservedTicks);
        Assert.Equal(expected.RouteWithinSafeMaskingBandTicks,
            actual.RouteWithinSafeMaskingBandTicks);
        Assert.Equal(expected.VehicleUnflyableTicks,
            actual.VehicleUnflyableTicks);
        Assert.Equal(expected.ProtectionInterventionActiveTicks,
            actual.ProtectionInterventionActiveTicks);
        Assert.Equal(expected.ProtectionInterventionEdges,
            actual.ProtectionInterventionEdges);
        Assert.Equal(expected.MinimumClearanceM, actual.MinimumClearanceM);
        Assert.Equal(expected.HighestApproachAttemptId,
            actual.HighestApproachAttemptId);
        Assert.Equal(expected.ApproachAttemptCount,
            actual.ApproachAttemptCount);

        foreach (CasevacPhase phase in Enum.GetValues<CasevacPhase>())
            Assert.Equal(expected.GetPhaseTicks(phase),
                actual.GetPhaseTicks(phase));
        foreach (CasevacMaskingState state
                 in Enum.GetValues<CasevacMaskingState>())
            Assert.Equal(expected.GetMaskingTicks(state),
                actual.GetMaskingTicks(state));
        foreach (CasevacMaskingState state
                 in Enum.GetValues<CasevacMaskingState>())
            Assert.Equal(expected.GetRouteMaskingTicks(state),
                actual.GetRouteMaskingTicks(state));
        foreach (CasevacEventKind kind in Enum.GetValues<CasevacEventKind>()) {
            Assert.Equal(expected.GetEventCount(kind),
                actual.GetEventCount(kind));
            Assert.Equal(expected.GetFirstEventSourceTick(kind),
                actual.GetFirstEventSourceTick(kind));
            Assert.Equal(expected.GetFirstEventActiveMissionTick(kind),
                actual.GetFirstEventActiveMissionTick(kind));
        }
        foreach (CasevacTerminalLeg leg
                 in Enum.GetValues<CasevacTerminalLeg>()) {
            Assert.Equal(expected.GetLandingZoneEvidence(leg),
                actual.GetLandingZoneEvidence(leg));
            foreach (LandingZoneGateViolation violation in ViolationFlags) {
                Assert.Equal(
                    expected.GetEnterViolationTicks(leg, violation),
                    actual.GetEnterViolationTicks(leg, violation));
                Assert.Equal(
                    expected.GetExitViolationTicks(leg, violation),
                    actual.GetExitViolationTicks(leg, violation));
            }
        }
    }

    static readonly LandingZoneGateViolation[] ViolationFlags = {
        LandingZoneGateViolation.OutsideTerminalVolume,
        LandingZoneGateViolation.OutsideEnterFootprint,
        LandingZoneGateViolation.OutsideExitFootprint,
        LandingZoneGateViolation.NoSurfaceContact,
        LandingZoneGateViolation.LateralGroundSpeed,
        LandingZoneGateViolation.VerticalSpeed,
        LandingZoneGateViolation.Pitch,
        LandingZoneGateViolation.Bank
    };
}

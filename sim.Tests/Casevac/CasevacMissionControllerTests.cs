using GunsOnly.Sim;
using GunsOnly.Sim.Casevac;

namespace GunsOnly.Sim.Tests.Casevac;

public sealed class CasevacMissionControllerTests {
    const string PickupSite = "PICKUP-LZ";
    const string ReceiverSite = "RECEIVER-LZ";
    const string SafeExit = "SAFE-EXIT";

    [Fact]
    public void BeginUsesFirstGlobalSequenceAsEpochAndPublishesIdentity() {
        var harness = new Harness(sequenceBeforeFirst: 40);

        CasevacMissionSnapshot snapshot = harness.Begin(sourceTick: 700);

        Assert.Equal(CasevacPhase.Ingress, snapshot.Phase);
        Assert.Equal(41, snapshot.MissionEpochSequence);
        Assert.Equal(700, snapshot.MissionBeginSourceTick);
        Assert.Equal(700, snapshot.LastSourceTick);
        Assert.Equal(0, snapshot.ActiveMissionTicks);
        Assert.Equal(harness.Definition.InitialCallAgeTicks, snapshot.CallAgeTicks);
        Assert.True(snapshot.ClockRunning);
        Assert.Equal(PickupSite, snapshot.TargetSiteId);
        Assert.Equal(CapsuleCustody.AtPickup, snapshot.Custody);
        Assert.Equal(CasevacDisposition.Pending, snapshot.Disposition);
        Assert.Equal(0.0, snapshot.PayloadMassKg);

        CasevacMissionEventRecord started = Assert.Single(harness.Events);
        Assert.Equal(CasevacContract.SchemaVersion, started.SchemaVersion);
        Assert.Equal(41, started.Sequence);
        Assert.Equal(41, started.MissionEpochSequence);
        Assert.Equal(700, started.SourceTick);
        Assert.Equal(0, started.ActiveMissionTicks);
        Assert.Equal(CasevacEventKind.CasevacTaskStarted, started.Kind);
        Assert.Equal(harness.Definition.Id, started.ScenarioId);
        Assert.Equal(harness.Definition.AircraftId, started.AircraftId);
        Assert.Equal(harness.Definition.CapsuleId, started.CapsuleId);
        Assert.Null(started.SiteId);
        Assert.Equal(0, started.ApproachAttemptId);
        Assert.Throws<InvalidOperationException>(() => harness.Controller.Begin(701));
    }

    [Fact]
    public void AdvanceRequiresBeginAndStrictlyIncreasingSourceTicksWhileNoCallIsPause() {
        var unstarted = new Harness();
        Assert.Throws<InvalidOperationException>(() =>
            unstarted.Controller.Advance(Observation(1, LandingZoneObservation.None)));

        var harness = new Harness();
        harness.Begin(sourceTick: 10);
        CasevacMissionSnapshot paused = harness.Controller.Snapshot;

        Assert.Equal(paused, harness.Controller.Snapshot);
        CasevacMissionSnapshot afterGap = harness.Step(
            LandingZoneObservation.None, sourceTick: 1_000);

        Assert.Equal(1, afterGap.ActiveMissionTicks);
        Assert.Equal(harness.Definition.InitialCallAgeTicks + 1, afterGap.CallAgeTicks);
        Assert.Equal(1_000, afterGap.LastSourceTick);
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            harness.Controller.Advance(
                Observation(1_000, LandingZoneObservation.None)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            harness.Controller.Advance(
                Observation(999, LandingZoneObservation.None)));

        CasevacMissionSnapshot resumed = harness.Step(
            LandingZoneObservation.None, sourceTick: 5_000);
        Assert.Equal(2, resumed.ActiveMissionTicks);
        Assert.Equal(harness.Definition.InitialCallAgeTicks + 2,
            resumed.CallAgeTicks);
    }

    [Fact]
    public void RequestedWindowCrossesExactlyOnceBeforeSameTickPhaseEvents() {
        var definition = Definition(
            initialCallAgeTicks: 4,
            requestedHandoffAgeTicks: 6,
            stabilizationDwellTicks: 1);
        var harness = new Harness(definition);
        harness.Begin(sourceTick: 100);

        CasevacMissionSnapshot before = harness.Step(
            LandingZoneObservation.None, sourceTick: 150);
        Assert.Equal(5, before.CallAgeTicks);
        Assert.False(before.RequestedHandoffWindowPassed);

        CasevacMissionSnapshot crossing = harness.Step(
            AdvanceGate(PickupSite), sourceTick: 900);

        Assert.Equal(6, crossing.CallAgeTicks);
        Assert.True(crossing.RequestedHandoffWindowPassed);
        Assert.Equal(CasevacPhase.PickupApproach, crossing.Phase);
        Assert.Equal(
            new[] {
                CasevacEventKind.CasevacTaskStarted,
                CasevacEventKind.RequestedHandoffWindowPassed,
                CasevacEventKind.PickupApproachEntered,
                CasevacEventKind.ApproachAttemptStarted
            },
            harness.Events.Select(missionEvent => missionEvent.Kind));
        Assert.All(harness.Events.Skip(1), missionEvent => {
            Assert.Equal(900, missionEvent.SourceTick);
            Assert.Equal(2, missionEvent.ActiveMissionTicks);
        });

        harness.Step(AdvanceGate(PickupSite));
        harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(1, harness.Events.Count(missionEvent =>
            missionEvent.Kind
                == CasevacEventKind.RequestedHandoffWindowPassed));
    }

    [Fact]
    public void TerminalEntryDoesNotCountTowardStabilizationAndDwellUsesNMinusOneThenN() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 2,
            loadingDwellTicks: 2));
        harness.Begin();

        CasevacMissionSnapshot entered = harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.PickupApproach, entered.Phase);
        Assert.False(entered.StableContact);
        Assert.Equal(0, entered.StabilizationProgressTicks);
        Assert.Equal(1, entered.CurrentApproachAttemptId);

        CasevacMissionSnapshot stabilizationNMinusOne =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.PickupApproach,
            stabilizationNMinusOne.Phase);
        Assert.True(stabilizationNMinusOne.StableContact);
        Assert.Equal(1, stabilizationNMinusOne.StabilizationProgressTicks);

        CasevacMissionSnapshot stabilizationN =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Loading, stabilizationN.Phase);
        Assert.Equal(0, stabilizationN.OperationProgressTicks);
        Assert.Equal(2, stabilizationN.OperationRequiredTicks);
        Assert.Equal(CapsuleCustody.AtPickup, stabilizationN.Custody);

        CasevacMissionSnapshot loadingNMinusOne =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Loading, loadingNMinusOne.Phase);
        Assert.Equal(1, loadingNMinusOne.OperationProgressTicks);
        Assert.Equal(CapsuleCustody.AtPickup, loadingNMinusOne.Custody);

        CasevacMissionSnapshot loadingN =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Outbound, loadingN.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, loadingN.Custody);
    }

    [Fact]
    public void AirborneTicksInsideTerminalDoNotDiscontinueTheApproachBeforeContact() {
        var harness = new Harness(Definition(stabilizationDwellTicks: 2));
        harness.Begin();

        CasevacMissionSnapshot entered = harness.Step(BreakGate(PickupSite));
        CasevacMissionSnapshot descending =
            harness.Step(BreakGate(PickupSite));

        Assert.Equal(CasevacPhase.PickupApproach, descending.Phase);
        Assert.Equal(entered.CurrentApproachAttemptId,
            descending.CurrentApproachAttemptId);
        Assert.Equal(1, descending.CurrentApproachAttemptId);
        Assert.DoesNotContain(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.ApproachDiscontinued);

        harness.Step(AdvanceGate(PickupSite));
        CasevacMissionSnapshot loading =
            harness.Step(AdvanceGate(PickupSite));

        Assert.Equal(CasevacPhase.Loading, loading.Phase);
        Assert.Equal(1, loading.CurrentApproachAttemptId);
    }

    [Fact]
    public void ContactOnTerminalEntryMakesLaterContactLossADiscontinuation() {
        var harness = new Harness(Definition(stabilizationDwellTicks: 2));
        harness.Begin();

        CasevacMissionSnapshot entered =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(1, entered.CurrentApproachAttemptId);

        CasevacMissionSnapshot contactLost =
            harness.Step(BreakGate(PickupSite));

        Assert.Equal(CasevacPhase.PickupApproach, contactLost.Phase);
        Assert.Equal(0, contactLost.CurrentApproachAttemptId);
        Assert.Contains(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.ApproachDiscontinued
            && missionEvent.ApproachAttemptId == 1);
    }

    [Fact]
    public void DwellOfOneStillRequiresASeparateTickForEachPrimaryTransition() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 1,
            handoffDwellTicks: 1,
            quietAftermathTicks: 1));
        harness.Begin();

        Assert.Equal(CasevacPhase.PickupApproach,
            harness.Step(AdvanceGate(PickupSite)).Phase);
        CasevacMissionSnapshot loading =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Loading, loading.Phase);
        Assert.Equal(CapsuleCustody.AtPickup, loading.Custody);

        CasevacMissionSnapshot outbound =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Outbound, outbound.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, outbound.Custody);

        CasevacMissionSnapshot dropoffApproach =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.DropoffApproach, dropoffApproach.Phase);
        Assert.Equal(0, dropoffApproach.StabilizationProgressTicks);

        CasevacMissionSnapshot handoff =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Handoff, handoff.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, handoff.Custody);
        Assert.Equal(0, handoff.OperationProgressTicks);

        CasevacMissionSnapshot quiet =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Quiet, quiet.Phase);
        Assert.Equal(CapsuleCustody.AtReceiver, quiet.Custody);

        Assert.Equal(CasevacPhase.Complete,
            harness.Step(LandingZoneObservation.None).Phase);
    }

    [Fact]
    public void ApproachHoldResetsStabilizationAndBreakRequiresExitBeforeNewAttempt() {
        var harness = new Harness(Definition(stabilizationDwellTicks: 2));
        harness.Begin();
        harness.Step(AdvanceGate(PickupSite));

        CasevacMissionSnapshot advancing =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(1, advancing.StabilizationProgressTicks);
        Assert.True(advancing.StableContact);

        CasevacMissionSnapshot holding = harness.Step(HoldGate(PickupSite));
        Assert.Equal(CasevacPhase.PickupApproach, holding.Phase);
        Assert.Equal(0, holding.StabilizationProgressTicks);
        Assert.False(holding.StableContact);
        Assert.Equal(1, holding.CurrentApproachAttemptId);

        harness.Step(AdvanceGate(PickupSite));
        CasevacMissionSnapshot broken = harness.Step(BreakGate(PickupSite));
        Assert.Equal(CasevacPhase.PickupApproach, broken.Phase);
        Assert.Equal(0, broken.StabilizationProgressTicks);
        Assert.Equal(0, broken.CurrentApproachAttemptId);
        Assert.Equal(1, broken.LatestApproachAttemptId);

        CasevacMissionSnapshot stillInside =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(0, stillInside.CurrentApproachAttemptId);
        Assert.Equal(1, stillInside.LatestApproachAttemptId);

        CasevacMissionSnapshot exited =
            harness.Step(LandingZoneObservation.None);
        Assert.Equal(0, exited.CurrentApproachAttemptId);
        CasevacMissionSnapshot reentered =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(2, reentered.CurrentApproachAttemptId);
        Assert.Equal(2, reentered.LatestApproachAttemptId);
        Assert.Equal(1, reentered.StabilizationProgressTicks);

        Assert.Equal(
            new long[] { 1, 2 },
            harness.Events
                .Where(missionEvent => missionEvent.Kind
                    == CasevacEventKind.ApproachAttemptStarted)
                .Select(missionEvent => missionEvent.ApproachAttemptId));
        CasevacMissionEventRecord discontinued = Assert.Single(
            harness.Events, missionEvent => missionEvent.Kind
                == CasevacEventKind.ApproachDiscontinued);
        Assert.Equal(1, discontinued.ApproachAttemptId);
        Assert.Equal(PickupSite, discontinued.SiteId);
    }

    [Fact]
    public void WrongSiteIsABreakAndCannotAdvanceTheTargetProcess() {
        var harness = new Harness(Definition(stabilizationDwellTicks: 2));
        harness.Begin();
        harness.Step(AdvanceGate(PickupSite));
        harness.Step(AdvanceGate(PickupSite));

        CasevacMissionSnapshot wrongSite =
            harness.Step(AdvanceGate(ReceiverSite));

        Assert.Equal(CasevacPhase.PickupApproach, wrongSite.Phase);
        Assert.Equal(PickupSite, wrongSite.TargetSiteId);
        Assert.Equal(0, wrongSite.StabilizationProgressTicks);
        Assert.Equal(0, wrongSite.CurrentApproachAttemptId);
        Assert.Equal(1, wrongSite.LatestApproachAttemptId);
        CasevacMissionEventRecord discontinued = Assert.Single(
            harness.Events, missionEvent => missionEvent.Kind
                == CasevacEventKind.ApproachDiscontinued);
        Assert.Equal(PickupSite, discontinued.SiteId);

        CasevacMissionSnapshot correctSite =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(2, correctSite.CurrentApproachAttemptId);
        Assert.Equal(1, correctSite.StabilizationProgressTicks);
    }

    [Fact]
    public void LoadingHoldPausesResumeContinuesAndBreakResetsTheOperation() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 2,
            loadingDwellTicks: 3));
        harness.Begin();
        ReachLoading(harness);

        Assert.Equal(1,
            harness.Step(AdvanceGate(PickupSite)).OperationProgressTicks);
        CasevacMissionSnapshot paused = harness.Step(HoldGate(PickupSite));
        Assert.Equal(1, paused.OperationProgressTicks);
        Assert.False(paused.StableContact);
        int eventsAfterFirstHold = harness.Events.Count;

        CasevacMissionSnapshot heldAgain = harness.Step(HoldGate(PickupSite));
        Assert.Equal(1, heldAgain.OperationProgressTicks);
        Assert.Equal(eventsAfterFirstHold, harness.Events.Count);

        long resumeTick = harness.NextSourceTick;
        CasevacMissionSnapshot resumed =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(2, resumed.OperationProgressTicks);
        Assert.True(resumed.StableContact);
        Assert.Equal(
            new[] {
                CasevacEventKind.StableContactEntered,
                CasevacEventKind.LoadingResumed
            },
            harness.Events
                .Where(missionEvent => missionEvent.SourceTick == resumeTick)
                .Select(missionEvent => missionEvent.Kind));

        CasevacMissionSnapshot reset = harness.Step(BreakGate(PickupSite));
        Assert.Equal(CasevacPhase.PickupApproach, reset.Phase);
        Assert.Equal(0, reset.OperationProgressTicks);
        Assert.Equal(0, reset.CurrentApproachAttemptId);
        Assert.Equal(CapsuleCustody.AtPickup, reset.Custody);
        Assert.Equal(0.0, reset.PayloadMassKg);
        Assert.Contains(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.LoadingReset);
    }

    [Fact]
    public void LoadingCompletionAtomicallyMovesCustodyAndAddsPayloadMass() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 2));
        harness.Begin();
        ReachLoading(harness);

        CasevacMissionSnapshot beforeCompletion =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Loading, beforeCompletion.Phase);
        Assert.Equal(CapsuleCustody.AtPickup, beforeCompletion.Custody);
        Assert.Equal(0.0, beforeCompletion.PayloadMassKg);

        CasevacMissionSnapshot completed =
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Outbound, completed.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, completed.Custody);
        Assert.Equal(harness.Definition.CapsuleMassKg, completed.PayloadMassKg);
        Assert.Equal(completed.CallAgeTicks,
            completed.CapsuleSecuredCallAgeTicks);

        CasevacMissionEventRecord secured = Assert.Single(
            harness.Events, missionEvent => missionEvent.Kind
                == CasevacEventKind.CapsuleSecured);
        Assert.Equal(PickupSite, secured.SiteId);
        Assert.Equal(1, secured.ApproachAttemptId);
        Assert.Equal(completed.ActiveMissionTicks, secured.ActiveMissionTicks);
    }

    [Fact]
    public void EventObserversSeeSettledPostTickStateAtCustodyTransitions() {
        var observed = new Dictionary<
            CasevacEventKind,
            CasevacMissionSnapshot>();
        Harness? harness = null;
        harness = new Harness(
            Definition(
                stabilizationDwellTicks: 1,
                loadingDwellTicks: 1,
                handoffDwellTicks: 1),
            eventObserver: missionEvent => {
                if (missionEvent.Kind is CasevacEventKind.CapsuleSecured
                    or CasevacEventKind.HandoffCompleted)
                    observed[missionEvent.Kind] = harness!.Controller.Snapshot;
            });
        harness.Begin();
        ReachQuiet(harness);

        CasevacMissionSnapshot secured =
            observed[CasevacEventKind.CapsuleSecured];
        Assert.Equal(CasevacPhase.Outbound, secured.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, secured.Custody);
        Assert.True(secured.ClockRunning);

        CasevacMissionSnapshot handedOff =
            observed[CasevacEventKind.HandoffCompleted];
        Assert.Equal(CasevacPhase.Quiet, handedOff.Phase);
        Assert.Equal(CapsuleCustody.AtReceiver, handedOff.Custody);
        Assert.False(handedOff.ClockRunning);
    }

    [Fact]
    public void HandoffHoldPausesResumeContinuesAndBreakRequiresAReceiverReentry() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 2,
            loadingDwellTicks: 1,
            handoffDwellTicks: 3));
        harness.Begin();
        ReachHandoff(harness);

        Assert.Equal(1,
            harness.Step(AdvanceGate(ReceiverSite)).OperationProgressTicks);
        Assert.Equal(1,
            harness.Step(HoldGate(ReceiverSite)).OperationProgressTicks);

        long resumeTick = harness.NextSourceTick;
        Assert.Equal(2,
            harness.Step(AdvanceGate(ReceiverSite)).OperationProgressTicks);
        Assert.Equal(
            new[] {
                CasevacEventKind.StableContactEntered,
                CasevacEventKind.HandoffResumed
            },
            harness.Events
                .Where(missionEvent => missionEvent.SourceTick == resumeTick)
                .Select(missionEvent => missionEvent.Kind));

        CasevacMissionSnapshot reset =
            harness.Step(BreakGate(ReceiverSite));
        Assert.Equal(CasevacPhase.DropoffApproach, reset.Phase);
        Assert.Equal(0, reset.OperationProgressTicks);
        Assert.Equal(0, reset.CurrentApproachAttemptId);
        Assert.Equal(2, reset.LatestApproachAttemptId);

        Assert.Equal(0,
            harness.Step(AdvanceGate(ReceiverSite)).CurrentApproachAttemptId);
        harness.Step(LandingZoneObservation.None);
        CasevacMissionSnapshot reentered =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(3, reentered.CurrentApproachAttemptId);
        Assert.Equal(1, reentered.StabilizationProgressTicks);

        harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Handoff, harness.Controller.Phase);
        harness.Step(AdvanceGate(ReceiverSite));
        harness.Step(AdvanceGate(ReceiverSite));
        CasevacMissionSnapshot completed =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Quiet, completed.Phase);
        Assert.Equal(CapsuleCustody.AtReceiver, completed.Custody);
        Assert.Contains(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.HandoffReset);
    }

    [Fact]
    public void HandoffStopsClockAndQuietUsesItsOwnTicksBeforeComplete() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 1,
            handoffDwellTicks: 2,
            quietAftermathTicks: 2));
        harness.Begin();
        ReachHandoff(harness);
        harness.Step(AdvanceGate(ReceiverSite));
        harness.Step(HoldGate(ReceiverSite));

        CasevacMissionSnapshot handoff =
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Quiet, handoff.Phase);
        Assert.Equal(CapsuleCustody.AtReceiver, handoff.Custody);
        Assert.Equal(0.0, handoff.PayloadMassKg);
        Assert.False(handoff.ClockRunning);
        Assert.Equal(handoff.CallAgeTicks, handoff.HandoffCallAgeTicks);
        long stoppedActiveTicks = handoff.ActiveMissionTicks;
        long stoppedCallAge = handoff.CallAgeTicks;

        CasevacMissionSnapshot quietOne = harness.Step(
            LandingZoneObservation.None, vehicleFlyable: false);
        Assert.Equal(CasevacPhase.Quiet, quietOne.Phase);
        Assert.Equal(1, quietOne.QuietProgressTicks);
        Assert.Equal(stoppedActiveTicks, quietOne.ActiveMissionTicks);
        Assert.Equal(stoppedCallAge, quietOne.CallAgeTicks);
        Assert.Equal(CapsuleCustody.AtReceiver, quietOne.Custody);

        CasevacMissionSnapshot complete =
            harness.Step(LandingZoneObservation.None);
        Assert.Equal(CasevacPhase.Complete, complete.Phase);
        Assert.True(harness.Controller.IsTerminal);
        Assert.Equal(stoppedActiveTicks, complete.ActiveMissionTicks);
        Assert.Equal(stoppedCallAge, complete.CallAgeTicks);

        int eventCount = harness.Events.Count;
        CasevacMissionSnapshot afterTerminal = harness.Controller.Advance(
            Observation(0, LandingZoneObservation.None,
                vehicleFlyable: false),
            CasevacSemanticCommand.RequestAbort);
        Assert.Equal(complete, afterTerminal);
        Assert.Equal(eventCount, harness.Events.Count);
    }

    [Theory]
    [InlineData(20, CasevacDisposition.TransferredOnTime)]
    [InlineData(19, CasevacDisposition.TransferredAfterRequestedTime)]
    public void HandoffAtTargetIsOnTimeAndHandoffAfterTargetIsLate(
        long requestedHandoffAgeTicks,
        CasevacDisposition expectedDisposition) {
        var harness = new Harness(Definition(
            initialCallAgeTicks: 10,
            requestedHandoffAgeTicks: requestedHandoffAgeTicks,
            stabilizationDwellTicks: 2,
            loadingDwellTicks: 2,
            handoffDwellTicks: 2));
        harness.Begin();
        ReachQuiet(harness);

        CasevacMissionSnapshot snapshot = harness.Controller.Snapshot;
        Assert.Equal(10, snapshot.ActiveMissionTicks);
        Assert.Equal(20, snapshot.CallAgeTicks);
        Assert.Equal(20, snapshot.HandoffCallAgeTicks);
        Assert.Equal(expectedDisposition, snapshot.Disposition);
        Assert.True(snapshot.RequestedHandoffWindowPassed);

        CasevacMissionEventRecord handoff = Assert.Single(
            harness.Events, missionEvent => missionEvent.Kind
                == CasevacEventKind.HandoffCompleted);
        Assert.Equal(10, handoff.ActiveMissionTicks);
        if (requestedHandoffAgeTicks == 20) {
            CasevacMissionEventRecord marker = Assert.Single(
                harness.Events, missionEvent => missionEvent.Kind
                    == CasevacEventKind.RequestedHandoffWindowPassed);
            Assert.Equal(handoff.SourceTick, marker.SourceTick);
            Assert.True(marker.Sequence < handoff.Sequence);
        }
    }

    [Fact]
    public void SameTickAuthorityIsLossThenEligibleAbortThenNormalTransition() {
        CasevacScenarioDefinition definition = Definition(
            stabilizationDwellTicks: 1);

        var loss = new Harness(definition);
        loss.Begin();
        loss.Step(AdvanceGate(PickupSite));
        long lossTick = loss.NextSourceTick;
        CasevacMissionSnapshot lost = loss.Step(
            AdvanceGate(PickupSite),
            vehicleFlyable: false,
            command: CasevacSemanticCommand.RequestAbort);

        Assert.Equal(CasevacPhase.AircraftLost, lost.Phase);
        Assert.Equal(CasevacDisposition.AircraftLostEmpty, lost.Disposition);
        Assert.Equal(
            new[] { CasevacEventKind.CasevacAircraftLost },
            loss.Events
                .Where(missionEvent => missionEvent.SourceTick == lossTick)
                .Select(missionEvent => missionEvent.Kind));
        Assert.DoesNotContain(loss.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.AbortReturnStarted);
        Assert.DoesNotContain(loss.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.LoadingStarted);

        var abort = new Harness(definition);
        abort.Begin();
        abort.Step(AdvanceGate(PickupSite));
        long abortTick = abort.NextSourceTick;
        CasevacMissionSnapshot returning = abort.Step(
            AdvanceGate(PickupSite),
            command: CasevacSemanticCommand.RequestAbort);

        Assert.Equal(CasevacPhase.AbortReturn, returning.Phase);
        Assert.Equal(
            new[] {
                CasevacEventKind.ApproachDiscontinued,
                CasevacEventKind.AbortReturnStarted
            },
            abort.Events
                .Where(missionEvent => missionEvent.SourceTick == abortTick)
                .Select(missionEvent => missionEvent.Kind));
        Assert.DoesNotContain(abort.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.LoadingStarted);
    }

    [Fact]
    public void AbortRequestIsIgnoredOnceCapsuleIsInAircraftAndNormalTransitionRuns() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 1));
        harness.Begin();
        ReachOutbound(harness);

        CasevacMissionSnapshot snapshot = harness.Step(
            AdvanceGate(ReceiverSite),
            command: CasevacSemanticCommand.RequestAbort);

        Assert.Equal(CasevacPhase.DropoffApproach, snapshot.Phase);
        Assert.Equal(CapsuleCustody.InAircraft, snapshot.Custody);
        Assert.Equal(harness.Definition.CapsuleMassKg,
            snapshot.PayloadMassKg);
        Assert.DoesNotContain(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.AbortReturnStarted);
    }

    [Fact]
    public void AbortAtStableContactDoesNotInventAStableContactExit() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 2));
        harness.Begin();
        ReachLoading(harness);
        int exitsBeforeAbort = harness.Events.Count(missionEvent =>
            missionEvent.Kind == CasevacEventKind.StableContactExited);

        CasevacMissionSnapshot returning = harness.Step(
            AdvanceGate(PickupSite),
            command: CasevacSemanticCommand.RequestAbort);

        Assert.Equal(CasevacPhase.AbortReturn, returning.Phase);
        Assert.Equal(exitsBeforeAbort, harness.Events.Count(missionEvent =>
            missionEvent.Kind == CasevacEventKind.StableContactExited));
        Assert.Contains(harness.Events, missionEvent =>
            missionEvent.Kind == CasevacEventKind.ApproachDiscontinued);
    }

    [Fact]
    public void AircraftLossPreservesOccupiedCustodyAndPayloadMass() {
        var harness = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 1));
        harness.Begin();
        ReachOutbound(harness);
        long beforeLossAge = harness.Controller.CallAgeTicks;

        CasevacMissionSnapshot lost = harness.Step(
            LandingZoneObservation.None,
            vehicleFlyable: false,
            command: CasevacSemanticCommand.RequestAbort);

        Assert.Equal(CasevacPhase.AircraftLost, lost.Phase);
        Assert.Equal(CasevacDisposition.AircraftLostOccupied,
            lost.Disposition);
        Assert.Equal(CapsuleCustody.InAircraft, lost.Custody);
        Assert.Equal(harness.Definition.CapsuleMassKg, lost.PayloadMassKg);
        Assert.Equal(beforeLossAge + 1, lost.CallAgeTicks);
        Assert.False(lost.ClockRunning);
        Assert.Equal(CasevacEventKind.CasevacAircraftLost,
            harness.Events[^1].Kind);
    }

    [Fact]
    public void AbortRequiresALaterOutsideToInsideSafeExitEntry() {
        var armedInside = new Harness();
        armedInside.Begin();
        CasevacMissionSnapshot returning = armedInside.Step(
            LandingZoneObservation.None,
            insideSafeExitVolume: true,
            command: CasevacSemanticCommand.RequestAbort);
        Assert.Equal(CasevacPhase.AbortReturn, returning.Phase);

        Assert.Equal(CasevacPhase.AbortReturn,
            armedInside.Step(
                LandingZoneObservation.None,
                insideSafeExitVolume: true).Phase);
        Assert.Equal(CasevacPhase.AbortReturn,
            armedInside.Step(
                LandingZoneObservation.None,
                insideSafeExitVolume: false).Phase);
        CasevacMissionSnapshot completed = armedInside.Step(
            LandingZoneObservation.None,
            insideSafeExitVolume: true);
        Assert.Equal(CasevacPhase.Aborted, completed.Phase);
        Assert.Equal(CasevacDisposition.ControlledAbort,
            completed.Disposition);

        var armedOutside = new Harness();
        armedOutside.Begin();
        Assert.Equal(CasevacPhase.AbortReturn,
            armedOutside.Step(
                LandingZoneObservation.None,
                insideSafeExitVolume: false,
                command: CasevacSemanticCommand.RequestAbort).Phase);
        Assert.Equal(CasevacPhase.Aborted,
            armedOutside.Step(
                LandingZoneObservation.None,
                insideSafeExitVolume: true).Phase);
    }

    [Fact]
    public void AbsorbingTerminalStatesAreIdempotent() {
        var aborted = new Harness();
        aborted.Begin();
        aborted.Step(
            LandingZoneObservation.None,
            insideSafeExitVolume: false,
            command: CasevacSemanticCommand.RequestAbort);
        aborted.Step(
            LandingZoneObservation.None,
            insideSafeExitVolume: true);

        var lost = new Harness();
        lost.Begin();
        lost.Step(LandingZoneObservation.None, vehicleFlyable: false);

        var complete = new Harness(Definition(
            stabilizationDwellTicks: 1,
            loadingDwellTicks: 1,
            handoffDwellTicks: 1,
            quietAftermathTicks: 1));
        complete.Begin();
        ReachQuiet(complete);
        complete.Step(LandingZoneObservation.None);

        foreach (Harness harness in new[] { aborted, lost, complete }) {
            Assert.True(harness.Controller.IsTerminal);
            CasevacMissionSnapshot before = harness.Controller.Snapshot;
            int eventCount = harness.Events.Count;
            CasevacMissionSnapshot after = harness.Controller.Advance(
                Observation(0, AdvanceGate(PickupSite),
                    vehicleFlyable: false,
                    insideSafeExitVolume: true),
                CasevacSemanticCommand.RequestAbort);
            Assert.Equal(before, after);
            Assert.Equal(eventCount, harness.Events.Count);
        }
    }

    [Fact]
    public void IdenticalInputStreamsProduceIdenticalSnapshotsAndEvents() {
        CasevacScenarioDefinition definition = Definition(
            stabilizationDwellTicks: 2,
            loadingDwellTicks: 2,
            handoffDwellTicks: 2,
            quietAftermathTicks: 2);
        var first = new Harness(definition, sequenceBeforeFirst: 100);
        var second = new Harness(definition, sequenceBeforeFirst: 100);

        IReadOnlyList<CasevacMissionSnapshot> firstSnapshots =
            RunDeterministicScript(first);
        IReadOnlyList<CasevacMissionSnapshot> secondSnapshots =
            RunDeterministicScript(second);

        Assert.Equal(firstSnapshots, secondSnapshots);
        Assert.Equal(first.Controller.Snapshot, second.Controller.Snapshot);
        Assert.Equal(first.Events, second.Events);
        Assert.Equal(CasevacPhase.Complete, first.Controller.Phase);
    }

    [Fact]
    public void ExternalSequenceGapsAreAcceptedButDuplicateOrDecreaseIsRejected() {
        var gappedSequences = new Queue<long>(new long[] { 10, 20, 40 });
        var gapped = new Harness(Definition(),
            () => gappedSequences.Dequeue());
        gapped.Begin();
        gapped.Step(AdvanceGate(PickupSite));
        Assert.Equal(new long[] { 10, 20, 40 },
            gapped.Events.Select(missionEvent => missionEvent.Sequence));
        Assert.Equal(10, gapped.Controller.MissionEpochSequence);

        var duplicateSequences =
            new Queue<long>(new long[] { 10, 10, 20, 30 });
        var duplicate = new Harness(Definition(),
            () => duplicateSequences.Dequeue());
        duplicate.Begin();
        CasevacMissionSnapshot beforeRejectedTick =
            duplicate.Controller.Snapshot;
        Assert.Throws<InvalidOperationException>(() =>
            duplicate.Step(AdvanceGate(PickupSite)));
        Assert.Equal(beforeRejectedTick, duplicate.Controller.Snapshot);
        Assert.Equal(CasevacPhase.PickupApproach,
            duplicate.Step(AdvanceGate(PickupSite)).Phase);
        Assert.Equal(new long[] { 10, 20, 30 },
            duplicate.Events.Select(missionEvent => missionEvent.Sequence));

        var decreasingSequences = new Queue<long>(new long[] { 10, 9 });
        var decreasing = new Harness(Definition(),
            () => decreasingSequences.Dequeue());
        decreasing.Begin();
        Assert.Throws<InvalidOperationException>(() =>
            decreasing.Step(AdvanceGate(PickupSite)));
    }

    static IReadOnlyList<CasevacMissionSnapshot> RunDeterministicScript(
        Harness harness) {
        var snapshots = new List<CasevacMissionSnapshot> {
            harness.Begin(sourceTick: 200),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 250),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 260),
            harness.Step(HoldGate(PickupSite), sourceTick: 300),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 301),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 302),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 310),
            harness.Step(HoldGate(PickupSite), sourceTick: 311),
            harness.Step(AdvanceGate(PickupSite), sourceTick: 312),
            harness.Step(AdvanceGate(ReceiverSite), sourceTick: 400),
            harness.Step(AdvanceGate(ReceiverSite), sourceTick: 401),
            harness.Step(AdvanceGate(ReceiverSite), sourceTick: 402),
            harness.Step(AdvanceGate(ReceiverSite), sourceTick: 403),
            harness.Step(AdvanceGate(ReceiverSite), sourceTick: 404),
            harness.Step(LandingZoneObservation.None, sourceTick: 500),
            harness.Step(LandingZoneObservation.None, sourceTick: 900)
        };
        return snapshots;
    }

    static void ReachLoading(Harness harness) {
        harness.Step(AdvanceGate(PickupSite));
        for (int tick = 0;
             tick < harness.Definition.StabilizationDwellTicks;
             tick++)
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Loading, harness.Controller.Phase);
    }

    static void ReachOutbound(Harness harness) {
        ReachLoading(harness);
        for (int tick = 0;
             tick < harness.Definition.LoadingDwellTicks;
             tick++)
            harness.Step(AdvanceGate(PickupSite));
        Assert.Equal(CasevacPhase.Outbound, harness.Controller.Phase);
    }

    static void ReachHandoff(Harness harness) {
        ReachOutbound(harness);
        harness.Step(AdvanceGate(ReceiverSite));
        for (int tick = 0;
             tick < harness.Definition.StabilizationDwellTicks;
             tick++)
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Handoff, harness.Controller.Phase);
    }

    static void ReachQuiet(Harness harness) {
        ReachHandoff(harness);
        for (int tick = 0;
             tick < harness.Definition.HandoffDwellTicks;
             tick++)
            harness.Step(AdvanceGate(ReceiverSite));
        Assert.Equal(CasevacPhase.Quiet, harness.Controller.Phase);
    }

    static CasevacScenarioDefinition Definition(
        long initialCallAgeTicks = 10,
        long requestedHandoffAgeTicks = 100,
        int stabilizationDwellTicks = 2,
        int loadingDwellTicks = 2,
        int handoffDwellTicks = 2,
        int quietAftermathTicks = 2) =>
        new(
            id: "casevac-test",
            aircraftId: "aircraft-1",
            capsuleId: "capsule-1",
            pickup: SiteDefinition(PickupSite),
            receiver: SiteDefinition(ReceiverSite),
            safeExitVolumeId: SafeExit,
            exposureField: ExposureDefinition(),
            initialCallAgeTicks,
            requestedHandoffAgeTicks,
            stabilizationDwellTicks,
            loadingDwellTicks,
            handoffDwellTicks,
            quietAftermathTicks,
            capsuleMassKg: 275.0);

    static LandingZoneDefinition SiteDefinition(string id) => new(
        id,
        surfaceTruthId: $"{id}.surface",
        surfaceAuthorityHash: $"{id}.surface.hash",
        obstacleAuthorityHash: $"{id}.obstacles.hash",
        approachPathId: $"{id}.approach",
        escapePathId: $"{id}.escape",
        gateProfile: new LandingZoneGateProfileDefinition(
            id: "gate-profile-1",
            version: 1,
            maximumEnterLateralGroundSpeedMps: 0.5,
            maximumExitLateralGroundSpeedMps: 1.0,
            maximumEnterAbsoluteVerticalSpeedMps: 0.3,
            maximumExitAbsoluteVerticalSpeedMps: 0.6,
            maximumEnterAbsolutePitchRad: 0.1,
            maximumExitAbsolutePitchRad: 0.2,
            maximumEnterAbsoluteBankRad: 0.1,
            maximumExitAbsoluteBankRad: 0.2));

    static ExposureFieldDefinition ExposureDefinition() => new(
        id: "exposure-1",
        version: 1,
        terrainAuthorityHash: "terrain-hash",
        obstacleAuthorityHash: "obstacle-hash",
        safeBandMinimumAglM: 8.0,
        safeBandMaximumAglM: 35.0,
        samplingRule: ExposureSamplingRule.SectorTerrainRaycastV1,
        sectors: [new ExposureObservationSectorDefinition(
            "sector-east", 0.0, 0.5, 4_000.0, 16)]);

    static CasevacTickObservation Observation(
        long sourceTick,
        in LandingZoneObservation landingZone,
        bool vehicleFlyable = true,
        bool insideSafeExitVolume = false) =>
        new(
            sourceTick,
            vehicleFlyable,
            insideSafeExitVolume,
            Vec3D.Zero,
            clearanceM: 30.0,
            CasevacMaskingState.Masked,
            withinSafeMaskingBand: true,
            protectionInterventionActive: false,
            landingZone);

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
            LandingZoneGateClass.Advance);

    static LandingZoneObservation HoldGate(string siteId) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: false,
            insideExitFootprint: true,
            surfaceContact: true,
            lateralGroundSpeedMps: 0.8,
            verticalSpeedMps: -0.2,
            pitchRad: 0.02,
            bankRad: -0.02,
            LandingZoneGateViolation.OutsideEnterFootprint,
            LandingZoneGateViolation.None,
            LandingZoneGateClass.Hold);

    static LandingZoneObservation BreakGate(string siteId) =>
        new(
            siteId,
            insideTerminalVolume: true,
            insideEnterFootprint: false,
            insideExitFootprint: false,
            surfaceContact: false,
            lateralGroundSpeedMps: 1.2,
            verticalSpeedMps: -0.5,
            pitchRad: 0.04,
            bankRad: -0.04,
            LandingZoneGateViolation.OutsideEnterFootprint
                | LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact,
            LandingZoneGateViolation.OutsideExitFootprint
                | LandingZoneGateViolation.NoSurfaceContact,
            LandingZoneGateClass.Break);

    sealed class Harness {
        long _lastSourceTick;

        public Harness(
            CasevacScenarioDefinition? definition = null,
            long sequenceBeforeFirst = 0,
            Action<CasevacMissionEventRecord>? eventObserver = null) {
            Definition = definition ?? CasevacMissionControllerTests.Definition();
            long sequence = sequenceBeforeFirst;
            Controller = new CasevacMissionController(
                Definition,
                () => checked(++sequence),
                missionEvent => {
                    Events.Add(missionEvent);
                    eventObserver?.Invoke(missionEvent);
                });
        }

        public Harness(
            CasevacScenarioDefinition definition,
            Func<long> sequenceAllocator) {
            Definition = definition;
            Controller = new CasevacMissionController(
                Definition,
                sequenceAllocator,
                Events.Add);
        }

        public CasevacScenarioDefinition Definition { get; }
        public CasevacMissionController Controller { get; }
        public List<CasevacMissionEventRecord> Events { get; } = new();
        public long NextSourceTick => checked(_lastSourceTick + 1);

        public CasevacMissionSnapshot Begin(long sourceTick = 100) {
            CasevacMissionSnapshot snapshot = Controller.Begin(sourceTick);
            _lastSourceTick = sourceTick;
            return snapshot;
        }

        public CasevacMissionSnapshot Step(
            in LandingZoneObservation landingZone,
            bool vehicleFlyable = true,
            bool insideSafeExitVolume = false,
            CasevacSemanticCommand command = CasevacSemanticCommand.None,
            long? sourceTick = null) {
            long nextSourceTick = sourceTick ?? NextSourceTick;
            CasevacMissionSnapshot snapshot = Controller.Advance(
                Observation(
                    nextSourceTick,
                    landingZone,
                    vehicleFlyable,
                    insideSafeExitVolume),
                command);
            _lastSourceTick = nextSourceTick;
            return snapshot;
        }
    }
}

using GunsOnly.Sim.Korea;

namespace GunsOnly.Sim.Tests.Korea;

public sealed class NarrativeEvidenceRecorderTests {
    [Fact]
    public void RecorderKeepsBoundedTenSecondPreContactAndTwoSecondPostContactWindows() {
        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        recorder.ObserveEvent(Event(
            sequence: 1,
            epoch: 1,
            sourceTick: 0,
            simulationTick: 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));

        for (int tick = 1; tick <= 1_204; tick++)
            Observe(recorder, tick, epoch: 1);
        recorder.ObserveEvent(Event(
            sequence: 2,
            epoch: 1,
            sourceTick: 1_205,
            simulationTick: 1_205,
            ArmstrongCableStrikeEventKind.CableContact));
        for (int tick = 1_205; tick <= 1_500; tick++)
            Observe(recorder, tick, epoch: 1);

        ArmstrongNarrativeEvidenceBundle bundle = recorder.Freeze(
            Snapshot(
                sourceTick: 1_500,
                simulationTick: 1_500,
                activeTicks: 1_500,
                epoch: 1,
                retryCount: 0,
                complete: true));

        Assert.Equal(NarrativeEvidenceRecorder.PreContactHighRateCapacity,
            bundle.PreContactHighRateSamples.Count);
        Assert.Equal(5, bundle.PreContactHighRateSamples[0].SourceTick);
        Assert.Equal(1_204, bundle.PreContactHighRateSamples[^1].SourceTick);
        Assert.Equal(NarrativeEvidenceRecorder.PostContactHighRateCapacity,
            bundle.PostContactHighRateSamples.Count);
        Assert.Equal(1_205, bundle.PostContactHighRateSamples[0].SourceTick);
        Assert.Equal(1_444, bundle.PostContactHighRateSamples[^1].SourceTick);
        Assert.Equal(150, bundle.GeneralSamples.Count);
        Assert.False(bundle.EvidenceIncomplete);
    }

    [Fact]
    public void RetryStartsFreshSampleWindowsWithoutReplayingStaleOneShotEvents() {
        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        recorder.ObserveEvent(Event(
            1, 1, 0, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        Observe(recorder, sourceTick: 1, epoch: 1);
        recorder.ObserveEvent(Event(
            2, 1, 2, 2,
            ArmstrongCableStrikeEventKind.CableContact));
        Observe(recorder, sourceTick: 2, epoch: 1);
        recorder.ObserveEvent(Event(
            3, 1, 3, 3,
            ArmstrongCableStrikeEventKind.CheckpointRestoreRequested));
        recorder.ObserveEvent(Event(
            4, 4, 3, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        recorder.ObserveTick(
            Snapshot(
                sourceTick: 3,
                simulationTick: 0,
                activeTicks: 0,
                epoch: 4,
                retryCount: 1),
            Observation(sourceTick: 3, simulationTick: 3),
            AirframeAerodynamicState.Clean);
        Observe(recorder, sourceTick: 4, epoch: 4, simulationTick: 1);

        ArmstrongNarrativeEvidenceBundle bundle = recorder.Freeze(
            Snapshot(
                sourceTick: 4,
                simulationTick: 1,
                activeTicks: 1,
                epoch: 4,
                retryCount: 1,
                complete: true));

        ArmstrongNarrativeEvidenceSample pre = Assert.Single(
            bundle.PreContactHighRateSamples);
        Assert.Equal(4, pre.ReconstructionEpochSequence);
        Assert.Empty(bundle.PostContactHighRateSamples);
        Assert.Equal(2, bundle.AllEvents.Count);
        ArmstrongCableStrikeEventRecord retry = Assert.Single(
            bundle.RetrySummaryEvents);
        Assert.Equal(3, retry.Sequence);
        Assert.Equal(
            ArmstrongCableStrikeEventKind.CheckpointRestoreRequested,
            retry.Kind);
        ArmstrongCableStrikeEventRecord completedEvent = Assert.Single(
            bundle.CompletedEpochEvents);
        Assert.Equal(4, completedEvent.Sequence);
        Assert.Equal(
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted,
            completedEvent.Kind);
        Assert.Equal(1, bundle.RetryCount);
        Assert.False(bundle.RetrySummaryIncomplete);
    }

    [Fact]
    public void EvidenceRejectsStaleIdentityAndNonMonotonicEvents() {
        var unbound = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        Assert.Throws<InvalidOperationException>(() =>
            unbound.ObserveEvent(Event(
                1, 1, 0, 0,
                ArmstrongCableStrikeEventKind.CableCorridorEntered)));

        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        ArmstrongCableStrikeEventRecord wrongScenario = Event(
            1, 1, 0, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted) with {
                ScenarioId = "scenario.wrong.v1"
            };
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ObserveEvent(wrongScenario));

        recorder.ObserveEvent(Event(
            1, 1, 0, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ObserveEvent(Event(
                1, 1, 1, 1,
                ArmstrongCableStrikeEventKind.CableCorridorEntered)));
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ObserveTick(
                Snapshot(1, 1, 1, epoch: 99, retryCount: 0),
                Observation(1, 1),
                AirframeAerodynamicState.Clean));
    }

    [Fact]
    public void AbandonedEpochSamplesCannotMakeCompletedEpochIncomplete() {
        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        recorder.ObserveEvent(Event(
            1, 1, 0, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        long abandonedSampleCount =
            NarrativeEvidenceRecorder.GeneralSampleCapacity + 1L;
        long abandonedTicks = abandonedSampleCount
            * NarrativeEvidenceRecorder.GeneralSampleIntervalTicks;
        for (long sampleIndex = 1;
            sampleIndex <= abandonedSampleCount;
            sampleIndex++) {
            long tick = sampleIndex
                * NarrativeEvidenceRecorder.GeneralSampleIntervalTicks;
            Observe(recorder, tick, epoch: 1);
        }
        Assert.True(recorder.EvidenceIncomplete);

        long restoreTick = abandonedTicks + 1;
        recorder.ObserveEvent(Event(
            2, 1, restoreTick, restoreTick,
            ArmstrongCableStrikeEventKind.CheckpointRestoreRequested));
        recorder.ObserveEvent(Event(
            3, 3, restoreTick, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        Assert.False(recorder.EvidenceIncomplete);
        recorder.ObserveTick(
            Snapshot(
                restoreTick,
                simulationTick: 0,
                activeTicks: 0,
                epoch: 3,
                retryCount: 1),
            Observation(restoreTick, restoreTick),
            AirframeAerodynamicState.Clean);
        for (int activeTick = 1; activeTick <= 10; activeTick++) {
            long sourceTick = restoreTick + activeTick;
            recorder.ObserveTick(
                Snapshot(
                    sourceTick,
                    simulationTick: activeTick,
                    activeTicks: activeTick,
                    epoch: 3,
                    retryCount: 1),
                Observation(sourceTick, activeTick),
                AirframeAerodynamicState.Clean);
        }

        ArmstrongNarrativeEvidenceBundle bundle = recorder.Freeze(
            Snapshot(
                restoreTick + 10,
                simulationTick: 10,
                activeTicks: 10,
                epoch: 3,
                retryCount: 1,
                complete: true));

        Assert.False(bundle.EvidenceIncomplete);
        ArmstrongNarrativeEvidenceSample sample = Assert.Single(
            bundle.GeneralSamples);
        Assert.Equal(3, sample.ReconstructionEpochSequence);
    }

    [Fact]
    public void CompletingEpochEventsRemainDurableWhenRetrySummaryOverflows() {
        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        long sequence = 1;
        long epoch = sequence;
        long sourceTick = 0;
        recorder.ObserveEvent(Event(
            sequence,
            epoch,
            sourceTick,
            simulationTick: 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));

        int retryAttempts = NarrativeEvidenceRecorder.RetrySummaryCapacity + 25;
        for (int retry = 0; retry < retryAttempts; retry++) {
            sourceTick++;
            recorder.ObserveEvent(Event(
                ++sequence,
                epoch,
                sourceTick,
                simulationTick: retry + 1,
                ArmstrongCableStrikeEventKind.CheckpointRestoreRequested));
            epoch = ++sequence;
            recorder.ObserveEvent(Event(
                sequence,
                epoch,
                sourceTick,
                simulationTick: 0,
                ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        }

        int completingEventCount =
            NarrativeEvidenceRecorder.EventCapacity + 37;
        for (int index = 1; index <= completingEventCount; index++) {
            sourceTick++;
            recorder.ObserveEvent(Event(
                ++sequence,
                epoch,
                sourceTick,
                simulationTick: index,
                ArmstrongCableStrikeEventKind.CableCorridorEntered));
        }

        ArmstrongNarrativeEvidenceBundle bundle = recorder.Freeze(
            Snapshot(
                sourceTick,
                simulationTick: completingEventCount,
                activeTicks: completingEventCount,
                epoch,
                retryCount: retryAttempts,
                complete: true,
                latestEventSequence: sequence));

        Assert.False(bundle.EvidenceIncomplete);
        Assert.True(bundle.RetrySummaryIncomplete);
        Assert.Equal(25, bundle.DroppedRetrySummaryCount);
        Assert.Equal(NarrativeEvidenceRecorder.RetrySummaryCapacity,
            bundle.RetrySummaryEvents.Count);
        Assert.Equal(completingEventCount + 1,
            bundle.CompletedEpochEvents.Count);
        Assert.All(bundle.CompletedEpochEvents, missionEvent =>
            Assert.Equal(epoch, missionEvent.ReconstructionEpochSequence));
        Assert.Equal(epoch, bundle.CompletedEpochEvents[0].Sequence);
        Assert.Equal(sequence, bundle.CompletedEpochEvents[^1].Sequence);
        Assert.Equal(
            bundle.RetrySummaryEvents.Concat(bundle.CompletedEpochEvents),
            bundle.AllEvents);
    }

    [Fact]
    public void FreezeIsIdempotentAndMakesEvidenceImmutable() {
        var recorder = new NarrativeEvidenceRecorder(
            ArmstrongCableStrikeContract.ScenarioId);
        recorder.ObserveEvent(Event(
            1, 1, 0, 0,
            ArmstrongCableStrikeEventKind.ReconstructionEpochStarted));
        Observe(recorder, sourceTick: 1, epoch: 1);
        ArmstrongCableStrikeSnapshot completed = Snapshot(
            1, 1, 1, epoch: 1, retryCount: 0, complete: true);

        ArmstrongNarrativeEvidenceBundle first = recorder.Freeze(completed);
        ArmstrongNarrativeEvidenceBundle second = recorder.Freeze(completed);

        Assert.Same(first, second);
        Assert.True(recorder.IsFrozen);
        Assert.Throws<InvalidOperationException>(() =>
            recorder.ObserveEvent(Event(
                2, 1, 2, 2,
                ArmstrongCableStrikeEventKind.CableCorridorEntered)));
        Assert.Throws<NotSupportedException>(() =>
            ((IList<ArmstrongCableStrikeEventRecord>)first.AllEvents).Add(Event(
                2, 1, 2, 2,
                ArmstrongCableStrikeEventKind.CableCorridorEntered)));
    }

    static void Observe(
        NarrativeEvidenceRecorder recorder,
        long sourceTick,
        long epoch,
        long? simulationTick = null) {
        long simTick = simulationTick ?? sourceTick;
        ArmstrongCableStrikeObservation observation = Observation(sourceTick, simTick);
        recorder.ObserveTick(
            Snapshot(
                sourceTick,
                simTick,
                activeTicks: sourceTick,
                epoch,
                retryCount: epoch == 1 ? 0 : 1),
            observation,
            AirframeAerodynamicState.Clean with {
                DragCoefficientIncrement = 0.04
            });
    }

    static ArmstrongCableStrikeObservation Observation(
        long sourceTick,
        long simulationTick) => new(
        sourceTick,
        simulationTick,
        PlayerPosition: new Vec3D(1.0, 300.0, simulationTick),
        PlayerVelocity: new Vec3D(0.0, 0.0, 150.0),
        RollRateRadS: 0.1,
        PilotLateralInput: 0.4);

    static ArmstrongCableStrikeSnapshot Snapshot(
        long sourceTick,
        long simulationTick,
        long activeTicks,
        long epoch,
        int retryCount,
        bool complete = false,
        long? latestEventSequence = null) => new(
        ArmstrongCableStrikeContract.SchemaVersion,
        ArmstrongCableStrikeContract.ScenarioId,
        complete
            ? ArmstrongCableStrikePhase.Southbound
            : ArmstrongCableStrikePhase.AttackRun,
        "objective.armstrong.test.v1",
        complete
            ? ArmstrongCableStrikeContract.SouthboundCheckpointId
            : ArmstrongCableStrikeContract.AttackRunCheckpointId,
        epoch,
        retryCount,
        EpochBeginSourceTick: 0,
        LastSourceTick: sourceTick,
        SimulationTick: simulationTick,
        ActiveEpochTicks: activeTicks,
        LatestEventSequence: latestEventSequence ?? epoch,
        CableContactObserved: false,
        VisibleAirframeDamage.None,
        DamagedFlightStabilized: false,
        PersistentLateralDemandObserved: false,
        ArmstrongRollMarginBand.NotAssessed,
        DamageInspectionSnapshot.None,
        NoLandingDecisionCommitted: complete,
        SouthboundCheckpointReached: complete);

    static ArmstrongCableStrikeEventRecord Event(
        long sequence,
        long epoch,
        long sourceTick,
        long simulationTick,
        ArmstrongCableStrikeEventKind kind) => new(
        ArmstrongCableStrikeContract.SchemaVersion,
        sequence,
        sourceTick,
        simulationTick,
        epoch,
        kind,
        kind == ArmstrongCableStrikeEventKind.ReconstructionEpochStarted
            ? ArmstrongCableStrikePhase.AttackRun
            : ArmstrongCableStrikePhase.CableCorridor,
        ArmstrongCableStrikeContract.ScenarioId,
        ArmstrongCableStrikeContract.AttackRunCheckpointId);
}

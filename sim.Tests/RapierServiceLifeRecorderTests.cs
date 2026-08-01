using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public sealed class RapierServiceLifeRecorderTests {
    static RapierServiceLifeSample Sample(
        long tick,
        long eventSequence = 0,
        double g = 1.0,
        double structuralLimitG = 9.0,
        bool overrideSelected = false,
        double dynamicPressurePa = 40_000.0,
        bool overDynamicPressure = false,
        double stagnationTemperatureK = 600.0,
        double thermalCapabilityK = 1_200.0,
        RapierServiceLifePropulsionRegime regime =
            RapierServiceLifePropulsionRegime.Turbine,
        bool inletUnstarted = false,
        double fuelLb = 100.0,
        int roundsFired = 0,
        double rcsGasKg = 2.0) =>
        new(
            Tick: tick,
            EventSequence: eventSequence,
            NormalLoadFactor: g,
            StructuralLimitG: structuralLimitG,
            OverrideSelected: overrideSelected,
            DynamicPressurePa: dynamicPressurePa,
            OverDynamicPressure: overDynamicPressure,
            Mach: regime switch {
                RapierServiceLifePropulsionRegime.Turbine => 1.5,
                RapierServiceLifePropulsionRegime.Transition => 2.4,
                RapierServiceLifePropulsionRegime.RamCombined => 3.0,
                _ => 4.0
            },
            SkinTemperatureK: stagnationTemperatureK - 100.0,
            StagnationTemperatureK: stagnationTemperatureK,
            ThermalCapabilityK: thermalCapabilityK,
            PropulsionRegime: regime,
            InletUnstarted: inletUnstarted,
            FuelLb: fuelLb,
            RoundsFired: roundsFired,
            RcsGasKg: rcsGasKg);

    static void Begin(
        RapierServiceLifeRecorder recorder,
        long sessionSortieSequence = 1,
        long startTick = 0,
        long eventSequence = 2) =>
        recorder.Begin(
            sessionSortieSequence,
            "mission.modern.rapier-intercept.public-data-surrogate.v1",
            "aircraft.rapier.public-data-surrogate.v1",
            "embedded-aircraft-capability-v1",
            startTick,
            eventSequence,
            initialFuelLb: 100.0,
            initialRoundsFired: 0,
            initialRcsGasKg: 2.0);

    [Fact]
    public void FixedTickEvidenceReconcilesWithoutInventingDamageOrCost() {
        var recorder = new RapierServiceLifeRecorder();
        Begin(recorder);
        recorder.Observe(Sample(tick: 1, eventSequence: 2));
        recorder.Observe(Sample(
            tick: 2,
            eventSequence: 5,
            g: 10.0,
            overrideSelected: true,
            dynamicPressurePa: 90_000.0,
            overDynamicPressure: true,
            stagnationTemperatureK: 1_300.0,
            regime: RapierServiceLifePropulsionRegime.Transition,
            inletUnstarted: true,
            fuelLb: 99.5,
            roundsFired: 12,
            rcsGasKg: 1.9));

        RapierServiceLifeSortieRecord record = Assert.IsType<
            RapierServiceLifeSortieRecord>(recorder.Finalize(
                RapierServiceLifeTerminationReason.SortieFinished,
                endTickExclusive: 2,
                eventSequence: 5));

        Assert.Equal(RapierServiceLifeRecorder.SchemaId, record.SchemaId);
        Assert.Equal(2, record.Mechanical.ObservedTicks);
        Assert.Equal(2, record.Mechanical.LoadFactorBinTicks.Sum());
        Assert.Equal(2, record.Mechanical.DynamicPressureBinTicks.Sum());
        Assert.Equal(1, record.Mechanical.StructuralLimitExceedanceTicks);
        Assert.Equal(1, record.Mechanical.OverrideSelectedTicks);
        Assert.Equal(1, record.Mechanical.DynamicPressureLimitExceedanceTicks);
        Assert.Equal(10_000, record.Mechanical.MaximumLoadMilliG);
        Assert.Equal(90_000, record.Mechanical.MaximumDynamicPressurePa);
        Assert.Equal(2, record.ThermalProxy.StagnationTemperatureBinTicks.Sum());
        Assert.Equal(1, record.ThermalProxy.NegativeThermalMarginTicks);
        Assert.Equal(-100_000, record.ThermalProxy.MinimumThermalMarginMilliK);
        Assert.Equal(1, record.Propulsion.RegimeTransitions);
        Assert.Equal(1, record.Propulsion.InletUnstartEntries);
        Assert.Equal(500, record.Consumables.FuelUsedMilliLb);
        Assert.Equal(12, record.Consumables.RoundsExpended);
        Assert.Equal(100_000, record.Consumables.RcsGasUsedMilliGram);
        Assert.Equal(3, record.SourceEventSequenceFirst);
        Assert.Equal(5, record.SourceEventSequenceLast);
        Assert.True(record.ExceedanceReviewRequired);
        Assert.Equal(64, record.RecordSha256.Length);
        Assert.Equal(RapierServiceLifeRecorder.DamageAssessment, "not_computed");
        Assert.Equal(RapierServiceLifeRecorder.CostProjection, "not_computed");
        Assert.Contains("validated_fatigue_damage", record.MissingChannelIds);
        Assert.Contains("authoritative_cost_projection", record.MissingChannelIds);
    }

    [Fact]
    public void CanonicalHashIsDeterministicForIdenticalEvidence() {
        static RapierServiceLifeSortieRecord Record() {
            var recorder = new RapierServiceLifeRecorder();
            Begin(recorder);
            recorder.Observe(Sample(tick: 1, eventSequence: 3, g: 8.25));
            return Assert.IsType<RapierServiceLifeSortieRecord>(
                recorder.Finalize(
                    RapierServiceLifeTerminationReason.Restaged,
                    endTickExclusive: 1,
                    eventSequence: 3));
        }

        RapierServiceLifeSortieRecord first = Record();
        RapierServiceLifeSortieRecord second = Record();
        Assert.Equal(first.RecordSha256, second.RecordSha256);
        Assert.Equal(
            first.Mechanical.LoadFactorBinTicks,
            second.Mechanical.LoadFactorBinTicks);
        Assert.Equal(
            first.ThermalProxy.StagnationTemperatureBinTicks,
            second.ThermalProxy.StagnationTemperatureBinTicks);
        Assert.Equal(
            first.Propulsion.RegimeDwellTicks,
            second.Propulsion.RegimeDwellTicks);
    }

    [Fact]
    public void TickGapsAndSlowReadersAreExplicit() {
        var recorder = new RapierServiceLifeRecorder(recordCapacity: 2);
        for (int sortie = 1; sortie <= 3; sortie++) {
            Begin(recorder, sessionSortieSequence: sortie, startTick: 0,
                eventSequence: 0);
            recorder.Observe(Sample(tick: sortie == 1 ? 3 : 1));
            RapierServiceLifeSortieRecord record = Assert.IsType<
                RapierServiceLifeSortieRecord>(recorder.Finalize(
                    RapierServiceLifeTerminationReason.Restaged,
                    endTickExclusive: sortie == 1 ? 3 : 1,
                    eventSequence: 0));
            if (sortie == 1) {
                Assert.Equal(RapierServiceLifeEvidenceStatus.Gap,
                    record.EvidenceStatus);
                Assert.Equal(2, record.GapTickCount);
            }
        }

        RapierServiceLifeReadBatch read = recorder.ReadAfter(0, 2);
        Assert.True(read.HasGap);
        Assert.Equal(new RapierServiceLifeRecordGap(1, 1), read.Gap);
        Assert.Equal([2L, 3L], read.Records.Select(
            record => record.RecordSequence).ToArray());
        Assert.Equal(1, recorder.DroppedRecordCount);
    }

    [Fact]
    public void FinalizationCannotPrecedeTheLatestAuthoritySample() {
        var recorder = new RapierServiceLifeRecorder();
        Begin(recorder);
        recorder.Observe(Sample(tick: 4, eventSequence: 2));

        Assert.Throws<ArgumentOutOfRangeException>(() => recorder.Finalize(
            RapierServiceLifeTerminationReason.Restaged,
            endTickExclusive: 3,
            eventSequence: 2));
        Assert.True(recorder.Active);
    }

    [Fact]
    public void CaptureCanBeDisabledWithoutCreatingFlightEvidence() {
        var recorder = new RapierServiceLifeRecorder(captureEnabled: false);
        Begin(recorder);
        recorder.Observe(Sample(tick: 1));
        Assert.Null(recorder.Finalize(
            RapierServiceLifeTerminationReason.Restaged,
            endTickExclusive: 1,
            eventSequence: 0));
        Assert.False(recorder.Active);
        Assert.Equal(0, recorder.RecordCount);
    }

    [Fact]
    public void SessionCaptureIsPassiveAndRestartFinalizesTheRapierRecord() {
        var captured = new SimulationSession(
            beatIndex: 10,
            weather: null,
            serviceLifeCaptureEnabled: true);
        var control = new SimulationSession(
            beatIndex: 10,
            weather: null,
            serviceLifeCaptureEnabled: false);
        captured.Begin();
        control.Begin();

        captured.StepFixed(240);
        control.StepFixed(240);

        Assert.Equal(control.Tick, captured.Tick);
        Assert.Equal(control.TimeMilliseconds, captured.TimeMilliseconds);
        Assert.Equal(control.Player.State, captured.Player.State);
        Assert.Equal(control.PlayerFuel.FuelLb, captured.PlayerFuel.FuelLb);
        Assert.Equal(control.PlayerGun.RoundsFired, captured.PlayerGun.RoundsFired);
        Assert.Equal(control.Outcome, captured.Outcome);
        Assert.Equal(control.RecentEvents, captured.RecentEvents);
        Assert.True(captured.RapierServiceLife.Active);
        Assert.False(control.RapierServiceLife.Active);

        captured.Restart();
        control.Restart();

        RapierServiceLifeSortieRecord record = Assert.IsType<
            RapierServiceLifeSortieRecord>(
                captured.RapierServiceLife.LatestRecord);
        Assert.Equal(
            RapierServiceLifeTerminationReason.Restaged,
            record.TerminationReason);
        Assert.Equal(240, record.Mechanical.ObservedTicks);
        Assert.Equal(240, record.Mechanical.LoadFactorBinTicks.Sum());
        Assert.Null(control.RapierServiceLife.LatestRecord);
    }
}

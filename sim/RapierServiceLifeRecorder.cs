using System.Collections.ObjectModel;
using System.Security.Cryptography;
using System.Text;

namespace GunsOnly.Sim;

public enum RapierServiceLifeEvidenceStatus {
    Complete,
    Partial,
    Gap
}

public enum RapierServiceLifeTerminationReason {
    None,
    SortieFinished,
    OwnshipDestroyed,
    Restaged
}

public enum RapierServiceLifePropulsionRegime {
    Turbine,
    Transition,
    RamCombined,
    RamOnly
}

/// <summary>
/// One allocation-free fixed-tick observation for the Rapier's first measure-only lifecycle
/// profile. Every value is authoritative simulation state or an explicitly named proxy; no damage
/// or cost conclusion is allowed back into the flight model.
/// </summary>
public readonly record struct RapierServiceLifeSample(
    long Tick,
    long EventSequence,
    double NormalLoadFactor,
    double StructuralLimitG,
    bool OverrideSelected,
    double DynamicPressurePa,
    bool OverDynamicPressure,
    double Mach,
    double SkinTemperatureK,
    double StagnationTemperatureK,
    double ThermalCapabilityK,
    RapierServiceLifePropulsionRegime PropulsionRegime,
    bool InletUnstarted,
    double FuelLb,
    int RoundsFired,
    double RcsGasKg);

public sealed record RapierMechanicalExposure(
    IReadOnlyList<long> LoadFactorBinTicks,
    IReadOnlyList<long> DynamicPressureBinTicks,
    long ObservedTicks,
    long ReversalCount,
    long MinimumLoadMilliG,
    long MaximumLoadMilliG,
    long MaximumStructuralLimitMilliG,
    long StructuralLimitExceedanceTicks,
    long OverrideSelectedTicks,
    long MaximumDynamicPressurePa,
    long DynamicPressureLimitExceedanceTicks);

public sealed record RapierThermalProxyExposure(
    IReadOnlyList<long> StagnationTemperatureBinTicks,
    long ObservedTicks,
    long TemperatureBandTransitions,
    long MaximumSkinTemperatureMilliK,
    long MaximumStagnationTemperatureMilliK,
    long MinimumThermalMarginMilliK,
    long NegativeThermalMarginTicks);

public sealed record RapierPropulsionExposure(
    IReadOnlyList<long> RegimeDwellTicks,
    long RegimeTransitions,
    long InletUnstartEntries,
    long InletUnstartTicks);

public sealed record RapierConsumablesExposure(
    long InitialFuelMilliLb,
    long FinalFuelMilliLb,
    long FuelUsedMilliLb,
    int InitialRoundsFired,
    int FinalRoundsFired,
    int RoundsExpended,
    long InitialRcsGasMilliGram,
    long FinalRcsGasMilliGram,
    long RcsGasUsedMilliGram);

/// <summary>
/// Immutable, hash-addressed sortie exposure. This is deliberately configuration-level evidence:
/// it contains no component damage, residual-strength, dispatch, maintenance, or cost verdict.
/// </summary>
public sealed record RapierServiceLifeSortieRecord(
    string SchemaId,
    long RecordSequence,
    long SessionSortieSequence,
    string? LedgerSortieId,
    string MissionContractId,
    string AirframeDefinitionId,
    string AirframeDefinitionRevision,
    string? InstalledManifestSha256,
    string MeasurementProfileId,
    string SimulationModelRevision,
    int AuthorityTickHz,
    long StartTick,
    long EndTickExclusive,
    RapierServiceLifeTerminationReason TerminationReason,
    RapierServiceLifeEvidenceStatus EvidenceStatus,
    IReadOnlyList<string> MissingChannelIds,
    long GapTickCount,
    RapierMechanicalExposure Mechanical,
    RapierThermalProxyExposure ThermalProxy,
    RapierPropulsionExposure Propulsion,
    RapierConsumablesExposure Consumables,
    long SourceEventSequenceFirst,
    long SourceEventSequenceLast,
    string RecordSha256) {

    /// <summary>
    /// An operational review cue only. It does not assert damage or ground the aircraft.
    /// </summary>
    public bool ExceedanceReviewRequired =>
        Mechanical.StructuralLimitExceedanceTicks > 0
        || Mechanical.DynamicPressureLimitExceedanceTicks > 0
        || ThermalProxy.NegativeThermalMarginTicks > 0
        || Propulsion.InletUnstartEntries > 0;
}

public readonly record struct RapierServiceLifeRecordGap(
    long DroppedSequenceFirst,
    long DroppedSequenceLast);

public sealed record RapierServiceLifeReadBatch(
    long RequestedAfterSequence,
    long OldestSequence,
    long LatestSequence,
    RapierServiceLifeRecordGap? Gap,
    IReadOnlyList<RapierServiceLifeSortieRecord> Records) {

    public bool HasGap => Gap.HasValue;
}

/// <summary>
/// Fixed-size Rapier exposure accumulator and finalized-record ring. The 120 Hz observe path only
/// mutates preallocated counters. Arrays, canonical encoding, and SHA-256 are created solely at a
/// sortie boundary.
/// </summary>
public sealed class RapierServiceLifeRecorder {
    public const string SchemaId = "guns-only.service-life-sortie.v1";
    public const string MeasurementProfileId =
        "rapier.measurement.mechanical-aerothermal-propulsion.v1";
    public const string SimulationModelRevision = "rapier-service-life-measure-only-v1";
    public const string DamageAssessment = "not_computed";
    public const string CostProjection = "not_computed";
    public const int DefaultRecordCapacity = 16;
    public const int MaximumReadCount = 16;

    // Bin edges are fixed-point and belong to MeasurementProfileId. Each array contains one more
    // bin than its edge array: (-∞, edge0), [edge0, edge1), ... [last, +∞).
    static readonly long[] LoadFactorEdgesMilliG =
        [-2_000, 0, 2_000, 4_000, 6_000, 8_000, 9_000, 12_000];
    static readonly long[] DynamicPressureEdgesPa =
        [25_000, 50_000, 80_000, 120_000, 160_000, 200_000, 250_000, 300_000];
    static readonly long[] StagnationTemperatureEdgesMilliK =
        [300_000, 500_000, 700_000, 900_000, 1_100_000, 1_300_000, 1_600_000];
    static readonly string[] UnsupportedChannelIds = [
        "component_stress_strain",
        "validated_fatigue_damage",
        "residual_strength",
        "authoritative_cost_projection",
        "installed_component_attribution",
        "qualified_launch_recovery_component_loads"
    ];

    readonly RapierServiceLifeSortieRecord?[] _records;
    readonly long[] _loadFactorBinTicks =
        new long[LoadFactorEdgesMilliG.Length + 1];
    readonly long[] _dynamicPressureBinTicks =
        new long[DynamicPressureEdgesPa.Length + 1];
    readonly long[] _stagnationTemperatureBinTicks =
        new long[StagnationTemperatureEdgesMilliK.Length + 1];
    readonly long[] _propulsionRegimeTicks =
        new long[Enum.GetValues<RapierServiceLifePropulsionRegime>().Length];
    readonly bool _captureEnabled;

    int _recordCount;
    long _latestRecordSequence;
    bool _active;
    long _sessionSortieSequence;
    string _missionContractId = "";
    string _airframeDefinitionId = "";
    string _airframeDefinitionRevision = "";
    long _startTick;
    long _eventSequenceAtBegin;
    long _lastObservedTick = -1;
    long _lastObservedEventSequence;
    long _gapTickCount;
    long _observedTicks;
    long _reversalCount;
    int _lastLoadSign;
    long _minimumLoadMilliG;
    long _maximumLoadMilliG;
    long _maximumStructuralLimitMilliG;
    long _structuralLimitExceedanceTicks;
    long _overrideSelectedTicks;
    long _maximumDynamicPressurePa;
    long _dynamicPressureLimitExceedanceTicks;
    long _temperatureBandTransitions;
    int _lastTemperatureBand = -1;
    long _maximumSkinTemperatureMilliK;
    long _maximumStagnationTemperatureMilliK;
    long _minimumThermalMarginMilliK;
    long _negativeThermalMarginTicks;
    long _regimeTransitions;
    int _lastRegime = -1;
    bool _lastInletUnstarted;
    long _inletUnstartEntries;
    long _inletUnstartTicks;
    long _initialFuelMilliLb;
    long _finalFuelMilliLb;
    int _initialRoundsFired;
    int _finalRoundsFired;
    long _initialRcsGasMilliGram;
    long _finalRcsGasMilliGram;

    public RapierServiceLifeRecorder(
        int recordCapacity = DefaultRecordCapacity,
        bool captureEnabled = true) {
        if (recordCapacity < 1)
            throw new ArgumentOutOfRangeException(nameof(recordCapacity));
        RecordCapacity = recordCapacity;
        _records = new RapierServiceLifeSortieRecord?[recordCapacity];
        _captureEnabled = captureEnabled;
    }

    public int RecordCapacity { get; }
    public bool CaptureEnabled => _captureEnabled;
    public bool Active => _active;
    public int RecordCount => _recordCount;
    public long LatestSequence => _latestRecordSequence;
    public long OldestSequence =>
        _recordCount == 0 ? 0 : _latestRecordSequence - _recordCount + 1L;
    public long DroppedRecordCount =>
        Math.Max(0L, _latestRecordSequence - _recordCount);
    public RapierServiceLifeSortieRecord? LatestRecord =>
        _recordCount == 0
            ? null
            : _records[(int)((_latestRecordSequence - 1L) % RecordCapacity)];

    public static IReadOnlyList<long> LoadFactorBinEdgesMilliG =>
        Array.AsReadOnly(LoadFactorEdgesMilliG);
    public static IReadOnlyList<long> DynamicPressureBinEdgesPa =>
        Array.AsReadOnly(DynamicPressureEdgesPa);
    public static IReadOnlyList<long> StagnationTemperatureBinEdgesMilliK =>
        Array.AsReadOnly(StagnationTemperatureEdgesMilliK);

    public void Begin(
        long sessionSortieSequence,
        string missionContractId,
        string airframeDefinitionId,
        string airframeDefinitionRevision,
        long startTick,
        long eventSequence,
        double initialFuelLb,
        int initialRoundsFired,
        double initialRcsGasKg) {
        if (!_captureEnabled) return;
        if (_active)
            throw new InvalidOperationException(
                "The active service-life sortie must be finalized before another can begin.");
        if (sessionSortieSequence <= 0
            || string.IsNullOrWhiteSpace(missionContractId)
            || string.IsNullOrWhiteSpace(airframeDefinitionId)
            || string.IsNullOrWhiteSpace(airframeDefinitionRevision)
            || startTick < 0
            || eventSequence < 0
            || !double.IsFinite(initialFuelLb)
            || initialFuelLb < 0.0
            || initialRoundsFired < 0
            || !double.IsFinite(initialRcsGasKg)
            || initialRcsGasKg < 0.0)
            throw new ArgumentOutOfRangeException(nameof(sessionSortieSequence));

        Array.Clear(_loadFactorBinTicks);
        Array.Clear(_dynamicPressureBinTicks);
        Array.Clear(_stagnationTemperatureBinTicks);
        Array.Clear(_propulsionRegimeTicks);
        _sessionSortieSequence = sessionSortieSequence;
        _missionContractId = missionContractId;
        _airframeDefinitionId = airframeDefinitionId;
        _airframeDefinitionRevision = airframeDefinitionRevision;
        _startTick = startTick;
        _eventSequenceAtBegin = eventSequence;
        _lastObservedTick = startTick;
        _lastObservedEventSequence = eventSequence;
        _gapTickCount = 0;
        _observedTicks = 0;
        _reversalCount = 0;
        _lastLoadSign = 0;
        _minimumLoadMilliG = long.MaxValue;
        _maximumLoadMilliG = long.MinValue;
        _maximumStructuralLimitMilliG = 0;
        _structuralLimitExceedanceTicks = 0;
        _overrideSelectedTicks = 0;
        _maximumDynamicPressurePa = 0;
        _dynamicPressureLimitExceedanceTicks = 0;
        _temperatureBandTransitions = 0;
        _lastTemperatureBand = -1;
        _maximumSkinTemperatureMilliK = 0;
        _maximumStagnationTemperatureMilliK = 0;
        _minimumThermalMarginMilliK = long.MaxValue;
        _negativeThermalMarginTicks = 0;
        _regimeTransitions = 0;
        _lastRegime = -1;
        _lastInletUnstarted = false;
        _inletUnstartEntries = 0;
        _inletUnstartTicks = 0;
        _initialFuelMilliLb = ToFixed(initialFuelLb, 1_000.0);
        _finalFuelMilliLb = _initialFuelMilliLb;
        _initialRoundsFired = initialRoundsFired;
        _finalRoundsFired = initialRoundsFired;
        _initialRcsGasMilliGram = ToFixed(initialRcsGasKg, 1_000_000.0);
        _finalRcsGasMilliGram = _initialRcsGasMilliGram;
        _active = true;
    }

    public void Observe(in RapierServiceLifeSample sample) {
        if (!_active) return;
        ValidateSample(sample);
        if (sample.Tick <= _lastObservedTick)
            throw new ArgumentOutOfRangeException(nameof(sample),
                "Service-life samples must use strictly increasing authority ticks.");
        if (sample.EventSequence < _lastObservedEventSequence)
            throw new ArgumentOutOfRangeException(nameof(sample),
                "Session event sequence cannot move backwards.");
        if (sample.Tick > _lastObservedTick + 1L)
            _gapTickCount = checked(
                _gapTickCount + sample.Tick - _lastObservedTick - 1L);

        long loadMilliG = ToFixed(sample.NormalLoadFactor, 1_000.0);
        long structuralLimitMilliG = ToFixed(sample.StructuralLimitG, 1_000.0);
        long dynamicPressurePa = ToFixed(sample.DynamicPressurePa, 1.0);
        long skinTemperatureMilliK = ToFixed(sample.SkinTemperatureK, 1_000.0);
        long stagnationTemperatureMilliK =
            ToFixed(sample.StagnationTemperatureK, 1_000.0);
        long thermalCapabilityMilliK =
            ToFixed(sample.ThermalCapabilityK, 1_000.0);
        long thermalMarginMilliK =
            thermalCapabilityMilliK - stagnationTemperatureMilliK;

        int loadBin = Bin(loadMilliG, LoadFactorEdgesMilliG);
        int pressureBin = Bin(dynamicPressurePa, DynamicPressureEdgesPa);
        int temperatureBin = Bin(
            stagnationTemperatureMilliK, StagnationTemperatureEdgesMilliK);
        _loadFactorBinTicks[loadBin]++;
        _dynamicPressureBinTicks[pressureBin]++;
        _stagnationTemperatureBinTicks[temperatureBin]++;
        _propulsionRegimeTicks[(int)sample.PropulsionRegime]++;
        _observedTicks++;

        int loadSign = Math.Sign(loadMilliG);
        if (_lastLoadSign != 0 && loadSign != 0 && loadSign != _lastLoadSign)
            _reversalCount++;
        if (loadSign != 0) _lastLoadSign = loadSign;
        _minimumLoadMilliG = Math.Min(_minimumLoadMilliG, loadMilliG);
        _maximumLoadMilliG = Math.Max(_maximumLoadMilliG, loadMilliG);
        _maximumStructuralLimitMilliG = Math.Max(
            _maximumStructuralLimitMilliG, structuralLimitMilliG);
        if (loadMilliG > structuralLimitMilliG)
            _structuralLimitExceedanceTicks++;
        if (sample.OverrideSelected) _overrideSelectedTicks++;
        _maximumDynamicPressurePa = Math.Max(
            _maximumDynamicPressurePa, dynamicPressurePa);
        if (sample.OverDynamicPressure)
            _dynamicPressureLimitExceedanceTicks++;

        if (_lastTemperatureBand >= 0 && temperatureBin != _lastTemperatureBand)
            _temperatureBandTransitions++;
        _lastTemperatureBand = temperatureBin;
        _maximumSkinTemperatureMilliK = Math.Max(
            _maximumSkinTemperatureMilliK, skinTemperatureMilliK);
        _maximumStagnationTemperatureMilliK = Math.Max(
            _maximumStagnationTemperatureMilliK, stagnationTemperatureMilliK);
        _minimumThermalMarginMilliK = Math.Min(
            _minimumThermalMarginMilliK, thermalMarginMilliK);
        if (thermalMarginMilliK < 0) _negativeThermalMarginTicks++;

        int regime = (int)sample.PropulsionRegime;
        if (_lastRegime >= 0 && regime != _lastRegime) _regimeTransitions++;
        _lastRegime = regime;
        if (sample.InletUnstarted && !_lastInletUnstarted)
            _inletUnstartEntries++;
        if (sample.InletUnstarted) _inletUnstartTicks++;
        _lastInletUnstarted = sample.InletUnstarted;

        _finalFuelMilliLb = ToFixed(sample.FuelLb, 1_000.0);
        _finalRoundsFired = sample.RoundsFired;
        _finalRcsGasMilliGram = ToFixed(sample.RcsGasKg, 1_000_000.0);
        _lastObservedTick = sample.Tick;
        _lastObservedEventSequence = sample.EventSequence;
    }

    public RapierServiceLifeSortieRecord? Finalize(
        RapierServiceLifeTerminationReason reason,
        long endTickExclusive,
        long eventSequence) {
        if (!_active) return null;
        if (reason == RapierServiceLifeTerminationReason.None
            || endTickExclusive < _startTick
            || endTickExclusive < _lastObservedTick
            || eventSequence < _lastObservedEventSequence)
            throw new ArgumentOutOfRangeException(nameof(reason));

        long sequence = checked(_latestRecordSequence + 1L);
        var draft = new RapierServiceLifeSortieRecord(
            SchemaId,
            sequence,
            _sessionSortieSequence,
            LedgerSortieId: null,
            _missionContractId,
            _airframeDefinitionId,
            _airframeDefinitionRevision,
            InstalledManifestSha256: null,
            MeasurementProfileId,
            SimulationModelRevision,
            (int)AircraftSim.TickHz,
            _startTick,
            endTickExclusive,
            reason,
            _gapTickCount > 0
                ? RapierServiceLifeEvidenceStatus.Gap
                : RapierServiceLifeEvidenceStatus.Complete,
            ReadOnlyStrings(UnsupportedChannelIds),
            _gapTickCount,
            new RapierMechanicalExposure(
                ReadOnly(_loadFactorBinTicks),
                ReadOnly(_dynamicPressureBinTicks),
                _observedTicks,
                _reversalCount,
                _observedTicks > 0 ? _minimumLoadMilliG : 0,
                _observedTicks > 0 ? _maximumLoadMilliG : 0,
                _maximumStructuralLimitMilliG,
                _structuralLimitExceedanceTicks,
                _overrideSelectedTicks,
                _maximumDynamicPressurePa,
                _dynamicPressureLimitExceedanceTicks),
            new RapierThermalProxyExposure(
                ReadOnly(_stagnationTemperatureBinTicks),
                _observedTicks,
                _temperatureBandTransitions,
                _maximumSkinTemperatureMilliK,
                _maximumStagnationTemperatureMilliK,
                _observedTicks > 0 ? _minimumThermalMarginMilliK : 0,
                _negativeThermalMarginTicks),
            new RapierPropulsionExposure(
                ReadOnly(_propulsionRegimeTicks),
                _regimeTransitions,
                _inletUnstartEntries,
                _inletUnstartTicks),
            new RapierConsumablesExposure(
                _initialFuelMilliLb,
                _finalFuelMilliLb,
                Math.Max(0L, _initialFuelMilliLb - _finalFuelMilliLb),
                _initialRoundsFired,
                _finalRoundsFired,
                Math.Max(0, _finalRoundsFired - _initialRoundsFired),
                _initialRcsGasMilliGram,
                _finalRcsGasMilliGram,
                Math.Max(0L,
                    _initialRcsGasMilliGram - _finalRcsGasMilliGram)),
            eventSequence > _eventSequenceAtBegin
                ? _eventSequenceAtBegin + 1L : 0L,
            eventSequence > _eventSequenceAtBegin ? eventSequence : 0L,
            RecordSha256: "");
        RapierServiceLifeSortieRecord stored = draft with {
            RecordSha256 = Hash(draft)
        };

        int index = (int)((sequence - 1L) % RecordCapacity);
        _records[index] = stored;
        if (_recordCount < RecordCapacity) _recordCount++;
        _latestRecordSequence = sequence;
        _active = false;
        return stored;
    }

    public RapierServiceLifeReadBatch ReadAfter(long sequence, int maximumCount) {
        if (sequence < 0) throw new ArgumentOutOfRangeException(nameof(sequence));
        if (maximumCount is < 1 or > MaximumReadCount)
            throw new ArgumentOutOfRangeException(nameof(maximumCount));
        if (_recordCount == 0)
            return new RapierServiceLifeReadBatch(
                sequence, 0, 0, null, Array.Empty<RapierServiceLifeSortieRecord>());

        long oldest = OldestSequence;
        bool hasGap = sequence < oldest - 1L;
        if (sequence >= _latestRecordSequence)
            return new RapierServiceLifeReadBatch(
                sequence, oldest, _latestRecordSequence, null,
                Array.Empty<RapierServiceLifeSortieRecord>());
        long first = Math.Max(sequence + 1L, oldest);
        int available = checked((int)(_latestRecordSequence - first + 1L));
        int take = Math.Min(available, maximumCount);
        var selected = new RapierServiceLifeSortieRecord[take];
        for (int offset = 0; offset < take; offset++) {
            long current = first + offset;
            selected[offset] = _records[
                (int)((current - 1L) % RecordCapacity)]
                ?? throw new InvalidOperationException(
                    "The finalized service-life record ring is internally inconsistent.");
        }
        return new RapierServiceLifeReadBatch(
            sequence,
            oldest,
            _latestRecordSequence,
            hasGap
                ? new RapierServiceLifeRecordGap(sequence + 1L, oldest - 1L)
                : null,
            selected);
    }

    static void ValidateSample(in RapierServiceLifeSample sample) {
        if (sample.Tick < 0
            || sample.EventSequence < 0
            || !double.IsFinite(sample.NormalLoadFactor)
            || !double.IsFinite(sample.StructuralLimitG)
            || sample.StructuralLimitG < 0.0
            || !double.IsFinite(sample.DynamicPressurePa)
            || sample.DynamicPressurePa < 0.0
            || !double.IsFinite(sample.Mach)
            || sample.Mach < 0.0
            || !double.IsFinite(sample.SkinTemperatureK)
            || sample.SkinTemperatureK < 0.0
            || !double.IsFinite(sample.StagnationTemperatureK)
            || sample.StagnationTemperatureK < 0.0
            || !double.IsFinite(sample.ThermalCapabilityK)
            || sample.ThermalCapabilityK < 0.0
            || !Enum.IsDefined(sample.PropulsionRegime)
            || !double.IsFinite(sample.FuelLb)
            || sample.FuelLb < 0.0
            || sample.RoundsFired < 0
            || !double.IsFinite(sample.RcsGasKg)
            || sample.RcsGasKg < 0.0)
            throw new ArgumentOutOfRangeException(nameof(sample));
    }

    static int Bin(long value, long[] edges) {
        int index = 0;
        while (index < edges.Length && value >= edges[index]) index++;
        return index;
    }

    static long ToFixed(double value, double scale) =>
        checked((long)Math.Round(
            value * scale, MidpointRounding.AwayFromZero));

    static ReadOnlyCollection<long> ReadOnly(long[] source) =>
        Array.AsReadOnly((long[])source.Clone());

    static ReadOnlyCollection<string> ReadOnlyStrings(string[] source) =>
        Array.AsReadOnly((string[])source.Clone());

    static string Hash(RapierServiceLifeSortieRecord record) {
        using var stream = new MemoryStream(4096);
        using (var writer = new BinaryWriter(
            stream, new UTF8Encoding(false), leaveOpen: true)) {
            writer.Write(record.SchemaId);
            writer.Write(record.RecordSequence);
            writer.Write(record.SessionSortieSequence);
            WriteNullable(writer, record.LedgerSortieId);
            writer.Write(record.MissionContractId);
            writer.Write(record.AirframeDefinitionId);
            writer.Write(record.AirframeDefinitionRevision);
            WriteNullable(writer, record.InstalledManifestSha256);
            writer.Write(record.MeasurementProfileId);
            writer.Write(record.SimulationModelRevision);
            writer.Write(record.AuthorityTickHz);
            writer.Write(record.StartTick);
            writer.Write(record.EndTickExclusive);
            writer.Write((int)record.TerminationReason);
            writer.Write((int)record.EvidenceStatus);
            WriteStrings(writer, record.MissingChannelIds);
            writer.Write(record.GapTickCount);
            WriteLongs(writer, record.Mechanical.LoadFactorBinTicks);
            WriteLongs(writer, record.Mechanical.DynamicPressureBinTicks);
            writer.Write(record.Mechanical.ObservedTicks);
            writer.Write(record.Mechanical.ReversalCount);
            writer.Write(record.Mechanical.MinimumLoadMilliG);
            writer.Write(record.Mechanical.MaximumLoadMilliG);
            writer.Write(record.Mechanical.MaximumStructuralLimitMilliG);
            writer.Write(record.Mechanical.StructuralLimitExceedanceTicks);
            writer.Write(record.Mechanical.OverrideSelectedTicks);
            writer.Write(record.Mechanical.MaximumDynamicPressurePa);
            writer.Write(record.Mechanical.DynamicPressureLimitExceedanceTicks);
            WriteLongs(writer, record.ThermalProxy.StagnationTemperatureBinTicks);
            writer.Write(record.ThermalProxy.ObservedTicks);
            writer.Write(record.ThermalProxy.TemperatureBandTransitions);
            writer.Write(record.ThermalProxy.MaximumSkinTemperatureMilliK);
            writer.Write(record.ThermalProxy.MaximumStagnationTemperatureMilliK);
            writer.Write(record.ThermalProxy.MinimumThermalMarginMilliK);
            writer.Write(record.ThermalProxy.NegativeThermalMarginTicks);
            WriteLongs(writer, record.Propulsion.RegimeDwellTicks);
            writer.Write(record.Propulsion.RegimeTransitions);
            writer.Write(record.Propulsion.InletUnstartEntries);
            writer.Write(record.Propulsion.InletUnstartTicks);
            writer.Write(record.Consumables.InitialFuelMilliLb);
            writer.Write(record.Consumables.FinalFuelMilliLb);
            writer.Write(record.Consumables.FuelUsedMilliLb);
            writer.Write(record.Consumables.InitialRoundsFired);
            writer.Write(record.Consumables.FinalRoundsFired);
            writer.Write(record.Consumables.RoundsExpended);
            writer.Write(record.Consumables.InitialRcsGasMilliGram);
            writer.Write(record.Consumables.FinalRcsGasMilliGram);
            writer.Write(record.Consumables.RcsGasUsedMilliGram);
            writer.Write(record.SourceEventSequenceFirst);
            writer.Write(record.SourceEventSequenceLast);
        }
        return Convert.ToHexString(SHA256.HashData(stream.GetBuffer().AsSpan(
            0, checked((int)stream.Length)))).ToLowerInvariant();
    }

    static void WriteNullable(BinaryWriter writer, string? value) {
        writer.Write(value is not null);
        if (value is not null) writer.Write(value);
    }

    static void WriteLongs(BinaryWriter writer, IReadOnlyList<long> values) {
        writer.Write(values.Count);
        for (int i = 0; i < values.Count; i++) writer.Write(values[i]);
    }

    static void WriteStrings(BinaryWriter writer, IReadOnlyList<string> values) {
        writer.Write(values.Count);
        for (int i = 0; i < values.Count; i++) writer.Write(values[i]);
    }
}

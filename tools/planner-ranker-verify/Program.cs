using System.Buffers.Binary;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;

const string ModelSchema = "guns-only.planner-ranker.int8.v1";
const string DatasetSchema = "guns-only.planner-distillation.v1";

try {
    (string? modelArgument, string? datasetArgument, int benchmarkIterations,
        bool showHelp) = ParseArguments(args);
    if (showHelp) {
        Console.WriteLine(
            "Usage: dotnet run --project tools/planner-ranker-verify -- "
            + "MODEL.json DATASET.jsonl [--benchmark-iterations N]\n"
            + "\n"
            + "The optional benchmark times only the allocation-free integer "
            + "ranker after warmup.");
        return 0;
    }
    if (modelArgument is null || datasetArgument is null)
        throw new ArgumentException(
            "MODEL.json and DATASET.jsonl are required. Use --help for usage.");

    string modelPath = Path.GetFullPath(modelArgument);
    string datasetPath = Path.GetFullPath(datasetArgument);
    string modelJson = File.ReadAllText(modelPath, Encoding.UTF8);
    using JsonDocument modelDocument = JsonDocument.Parse(modelJson);
    JsonElement manifest = modelDocument.RootElement;
    RequireString(manifest, "schema", ModelSchema);
    RequireString(manifest, "sourceDatasetSchema", DatasetSchema);

    string expectedDatasetHash = RequiredString(
        manifest, "sourceDatasetSha256");
    using (FileStream datasetStream = File.OpenRead(datasetPath)) {
        string actualDatasetHash = Convert.ToHexString(
            SHA256.HashData(datasetStream)).ToLowerInvariant();
        if (!actualDatasetHash.Equals(
            expectedDatasetHash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException(
                "Dataset bytes do not match the model's sourceDatasetSha256.");
    }

    JsonElement model = manifest.GetProperty("model");
    VerifyModelPayloadHash(model);
    int inputCount = RequiredInt(model, "inputCount");
    if (RequiredInt(model, "hiddenUnitCount")
        != PlannerIntegerRanker.HiddenUnitCount)
        throw new InvalidDataException("Unsupported hidden-unit count.");
    if (RequiredInt(model, "candidateCount")
        != PlannerIntegerRanker.CandidateCount)
        throw new InvalidDataException("Unsupported candidate count.");
    if (!model.GetProperty("availabilityMaskRequired").GetBoolean())
        throw new InvalidDataException("Model must require an availability mask.");

    string[] featureNames = ReadStringArray(model, "featureNames");
    string[] candidateNames = ReadStringArray(model, "candidateNames");
    if (featureNames.Length != inputCount)
        throw new InvalidDataException("Model feature-name count is inconsistent.");
    if (candidateNames.Length != PlannerIntegerRanker.CandidateCount)
        throw new InvalidDataException("Model candidate-name count is inconsistent.");

    JsonElement quantization = model.GetProperty("quantization");
    JsonElement inputQuantization = quantization.GetProperty("input");
    RequireString(inputQuantization, "dtype", "int16");
    RequireString(inputQuantization, "rounding", "nearest-even");
    double inputScale = inputQuantization.GetProperty("scale").GetDouble();
    if (!double.IsFinite(inputScale) || inputScale <= 0.0)
        throw new InvalidDataException("Model input scale must be finite and positive.");
    RequireString(
        quantization.GetProperty("inputToHiddenWeights"),
        "layout",
        "hidden-major");
    RequireString(
        quantization.GetProperty("hiddenToOutputWeights"),
        "layout",
        "candidate-major");

    var ranker = new PlannerIntegerRanker(
        inputCount,
        ReadSByteArray(model, "inputToHiddenWeights"),
        ReadIntArray(model, "hiddenBiases"),
        RequiredInt(model, "hiddenScaleShift"),
        ReadSByteArray(model, "hiddenToOutputWeights"),
        ReadIntArray(model, "outputBiases"),
        RequiredInt(model, "outputScaleShift"));

    JsonElement sourceContracts = manifest.GetProperty("sourceContracts");
    RequireString(sourceContracts, "datasetSchema", DatasetSchema);
    VerifyStringArray(
        sourceContracts.GetProperty("featureNames"), featureNames, "features");
    VerifyStringArray(
        sourceContracts.GetProperty("candidateNames"), candidateNames, "candidates");

    int eligibleCount = 0;
    int top1Count = 0;
    int top3Count = 0;
    double positiveRegretSum = 0.0;
    bool headerSeen = false;
    var inputBuffer = new short[inputCount];
    var logitsBuffer = new int[PlannerIntegerRanker.CandidateCount];
    var topBuffer = new int[3];
    short[]? benchmarkInputs = null;
    ushort benchmarkAvailabilityMask = 0;
    using IncrementalHash predictionHash =
        IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
    foreach (string line in File.ReadLines(datasetPath, Encoding.UTF8)) {
        if (string.IsNullOrWhiteSpace(line)) continue;
        using JsonDocument rowDocument = JsonDocument.Parse(line);
        JsonElement row = rowDocument.RootElement;
        string type = RequiredString(row, "type");
        if (type == "schema") {
            if (headerSeen)
                throw new InvalidDataException("Dataset has duplicate schema headers.");
            headerSeen = true;
            RequireString(row, "schema", DatasetSchema);
            if (RequiredInt(row, "featureCount") != inputCount
                || RequiredInt(row, "candidateCount")
                    != PlannerIntegerRanker.CandidateCount)
                throw new InvalidDataException(
                    "Dataset dimensions do not match the model.");
            VerifyStringArray(row.GetProperty("featureNames"),
                featureNames, "features");
            VerifyStringArray(row.GetProperty("candidateNames"),
                candidateNames, "candidates");
            RequireString(row, "featureSchema",
                RequiredString(sourceContracts, "featureSchema"));
            RequireString(row, "normalizationSchema",
                RequiredString(sourceContracts, "normalizationSchema"));
            RequireString(row, "candidateSchema",
                RequiredString(sourceContracts, "candidateSchema"));
            RequireString(row, "scoreSchema",
                RequiredString(sourceContracts, "scoreSchema"));
            RequireString(row, "behaviorPolicyId",
                RequiredString(sourceContracts, "behaviorPolicyId"));
            RequireString(row, "behaviorAirframeSchema",
                RequiredString(sourceContracts, "behaviorAirframeSchema"));
            RequireString(row, "behaviorProfileSchema",
                RequiredString(sourceContracts, "behaviorProfileSchema"));
            RequireString(row, "atmosphereSchema",
                RequiredString(sourceContracts, "atmosphereSchema"));
            RequireString(row, "teacherExecution",
                RequiredString(sourceContracts, "teacherExecution"));
            RequireString(row, "formationMode",
                RequiredString(sourceContracts, "formationMode"));
            if (row.GetProperty("flatTerrain").GetBoolean()
                    != sourceContracts.GetProperty("flatTerrain").GetBoolean()
                || row.GetProperty("calmWind").GetBoolean()
                    != sourceContracts.GetProperty("calmWind").GetBoolean()
                || RequiredInt(row, "doctrineIndex")
                    != RequiredInt(sourceContracts, "doctrineIndex"))
                throw new InvalidDataException(
                    "Dataset runtime domain does not match model provenance.");
            continue;
        }
        if (type != "sample") continue;
        if (!headerSeen)
            throw new InvalidDataException("Sample precedes the dataset header.");
        JsonElement safety = row.GetProperty("safety");
        if (!safety.GetProperty("teacherEligible").GetBoolean()) continue;

        JsonElement values = row.GetProperty("features").GetProperty("values");
        if (values.GetArrayLength() != inputCount)
            throw new InvalidDataException("Sample feature count changed.");
        if (inputCount > PlannerIntegerRanker.MaximumInputCount)
            throw new InvalidDataException("Runtime input bound exceeded.");
        Span<short> inputs = inputBuffer;
        int featureIndex = 0;
        foreach (JsonElement valueElement in values.EnumerateArray()) {
            double value = valueElement.GetDouble();
            if (!double.IsFinite(value) || value is < -1.0 or > 1.0)
                throw new InvalidDataException(
                    "Sample contains an invalid normalized feature.");
            double quantized = System.Math.Round(
                value / inputScale, MidpointRounding.ToEven);
            inputs[featureIndex++] = (short)System.Math.Clamp(
                quantized, short.MinValue, short.MaxValue);
        }

        int maskValue = RequiredInt(row, "availabilityMask");
        if (maskValue is <= 0 or > PlannerIntegerRanker.AllCandidatesMask)
            throw new InvalidDataException("Sample availability mask is invalid.");
        ushort availabilityMask = (ushort)maskValue;
        if (benchmarkIterations > 0 && benchmarkInputs is null) {
            benchmarkInputs = inputBuffer.ToArray();
            benchmarkAvailabilityMask = availabilityMask;
        }
        int exactIndex = RequiredInt(row, "selectedIndex");
        if ((availabilityMask & (1 << exactIndex)) == 0)
            throw new InvalidDataException(
                "Teacher selected an unavailable candidate.");

        Span<int> logits = logitsBuffer;
        PlannerIntegerRankerResult result =
            ranker.Evaluate(inputs, availabilityMask, logits);
        Span<int> top = topBuffer;
        top.Fill(-1);
        for (int candidateIndex = 0;
            candidateIndex < PlannerIntegerRanker.CandidateCount;
            candidateIndex++) {
            if ((availabilityMask & (1 << candidateIndex)) == 0) continue;
            for (int place = 0; place < top.Length; place++) {
                if (top[place] >= 0
                    && logits[candidateIndex] <= logits[top[place]])
                    continue;
                for (int move = top.Length - 1; move > place; move--)
                    top[move] = top[move - 1];
                top[place] = candidateIndex;
                break;
            }
        }

        JsonElement candidates = row.GetProperty("candidates");
        double exactAdvantage = candidates[exactIndex]
            .GetProperty("relativeAdvantage").GetDouble();
        double predictedAdvantage = candidates[result.SelectedCandidateIndex]
            .GetProperty("relativeAdvantage").GetDouble();
        positiveRegretSum += System.Math.Max(
            0.0, exactAdvantage - predictedAdvantage);
        eligibleCount++;
        if (result.SelectedCandidateIndex == exactIndex) top1Count++;
        if (top.Contains(exactIndex)) top3Count++;
        AppendPredictionHash(
            predictionHash,
            row.GetProperty("seed").GetUInt64(),
            row.GetProperty("decisionIndex").GetInt64(),
            availabilityMask,
            exactIndex,
            result.SelectedCandidateIndex,
            logits);
    }

    if (!headerSeen || eligibleCount == 0)
        throw new InvalidDataException(
            "Dataset did not contain a header and eligible samples.");
    string rollingHash = Convert.ToHexString(
        predictionHash.GetHashAndReset()).ToLowerInvariant();
    object? benchmark = benchmarkIterations > 0
        ? RunBenchmark(
            ranker,
            benchmarkInputs
                ?? throw new InvalidDataException(
                    "No eligible sample was available for benchmarking."),
            benchmarkAvailabilityMask,
            benchmarkIterations)
        : null;
    double top1Accuracy = (double)top1Count / eligibleCount;
    double top3Accuracy = (double)top3Count / eligibleCount;
    double meanPositiveRelativeRegret =
        positiveRegretSum / eligibleCount;
    if (benchmark is null) {
        Console.WriteLine(JsonSerializer.Serialize(new {
            schema = "guns-only.planner-ranker-verification.v1",
            eligibleCount,
            top1Accuracy,
            top3Accuracy,
            meanPositiveRelativeRegret,
            predictionRollingSha256 = rollingHash
        }));
    } else {
        Console.WriteLine(JsonSerializer.Serialize(new {
            schema = "guns-only.planner-ranker-verification.v1",
            eligibleCount,
            top1Accuracy,
            top3Accuracy,
            meanPositiveRelativeRegret,
            predictionRollingSha256 = rollingHash,
            benchmark
        }));
    }
    return 0;
} catch (Exception error) when (
    error is ArgumentException
    or IOException
    or JsonException
    or CryptographicException) {
    Console.Error.WriteLine($"planner-ranker-verify: {error.Message}");
    return 2;
}

static (string? Model, string? Dataset, int BenchmarkIterations, bool ShowHelp)
    ParseArguments(IReadOnlyList<string> arguments) {
    string? model = null;
    string? dataset = null;
    int benchmarkIterations = 0;
    for (int index = 0; index < arguments.Count; index++) {
        string argument = arguments[index];
        switch (argument) {
            case "--help":
            case "-h":
                return (null, null, 0, true);
            case "--benchmark-iterations":
                if (++index >= arguments.Count
                    || !int.TryParse(
                        arguments[index],
                        out benchmarkIterations)
                    || benchmarkIterations is < 1 or > 100_000_000)
                    throw new ArgumentException(
                        "--benchmark-iterations must be between 1 and 100000000.");
                break;
            default:
                if (argument.StartsWith("-", StringComparison.Ordinal))
                    throw new ArgumentException($"Unknown option: {argument}");
                if (model is null)
                    model = argument;
                else if (dataset is null)
                    dataset = argument;
                else
                    throw new ArgumentException(
                        "Only MODEL.json and DATASET.jsonl positional paths are allowed.");
                break;
        }
    }
    return (model, dataset, benchmarkIterations, false);
}

static object RunBenchmark(
    PlannerIntegerRanker ranker,
    short[] inputs,
    ushort availabilityMask,
    int iterations) {
    var logits = new int[PlannerIntegerRanker.CandidateCount];
    const int WarmupIterations = 10_000;
    int checksum = 17;
    for (int index = 0; index < WarmupIterations; index++) {
        PlannerIntegerRankerResult result =
            ranker.Evaluate(inputs, availabilityMask, logits);
        checksum = unchecked(
            checksum * 31 + result.SelectedCandidateIndex + result.BestLogit);
    }

    GC.Collect();
    GC.WaitForPendingFinalizers();
    GC.Collect();
    long allocatedBefore = GC.GetAllocatedBytesForCurrentThread();
    long start = Stopwatch.GetTimestamp();
    for (int index = 0; index < iterations; index++) {
        PlannerIntegerRankerResult result =
            ranker.Evaluate(inputs, availabilityMask, logits);
        checksum = unchecked(
            checksum * 31 + result.SelectedCandidateIndex + result.BestLogit);
    }
    long elapsedTicks = Stopwatch.GetTimestamp() - start;
    long allocatedBytes =
        GC.GetAllocatedBytesForCurrentThread() - allocatedBefore;
    GC.KeepAlive(checksum);
    return new {
        schema = "guns-only.planner-ranker-microbenchmark.v1",
        iterations,
        elapsedSeconds = elapsedTicks / (double)Stopwatch.Frequency,
        nanosecondsPerEvaluation =
            elapsedTicks * 1_000_000_000.0
            / Stopwatch.Frequency
            / iterations,
        allocatedBytes,
        checksum
    };
}

static void VerifyModelPayloadHash(JsonElement model) {
    RequireString(model, "payloadHashAlgorithm", "sha256");
    string expected = RequiredString(model, "payloadSha256");
    string raw = model.GetRawText();
    string marker = $"\"payloadSha256\":\"{expected}\",";
    int markerIndex = raw.IndexOf(marker, StringComparison.Ordinal);
    if (markerIndex < 0
        || raw.IndexOf(marker, markerIndex + marker.Length,
            StringComparison.Ordinal) >= 0)
        throw new InvalidDataException(
            "Canonical model payload hash field is malformed.");
    string unhashedPayload = raw.Remove(markerIndex, marker.Length);
    string actual = Convert.ToHexString(
        SHA256.HashData(Encoding.UTF8.GetBytes(unhashedPayload)))
        .ToLowerInvariant();
    if (!actual.Equals(expected, StringComparison.OrdinalIgnoreCase))
        throw new InvalidDataException("Model payload SHA-256 does not match.");
}

static void AppendPredictionHash(
    IncrementalHash hash,
    ulong seed,
    long decisionIndex,
    ushort availabilityMask,
    int exactIndex,
    int predictedIndex,
    ReadOnlySpan<int> logits) {
    Span<byte> bytes = stackalloc byte[
        8 + 8 + 2 + 1 + 1
        + PlannerIntegerRanker.CandidateCount * sizeof(int)];
    int offset = 0;
    BinaryPrimitives.WriteUInt64LittleEndian(bytes[offset..], seed);
    offset += 8;
    BinaryPrimitives.WriteInt64LittleEndian(bytes[offset..], decisionIndex);
    offset += 8;
    BinaryPrimitives.WriteUInt16LittleEndian(bytes[offset..], availabilityMask);
    offset += 2;
    bytes[offset++] = checked((byte)exactIndex);
    bytes[offset++] = checked((byte)predictedIndex);
    for (int index = 0; index < PlannerIntegerRanker.CandidateCount; index++) {
        BinaryPrimitives.WriteInt32LittleEndian(bytes[offset..], logits[index]);
        offset += sizeof(int);
    }
    hash.AppendData(bytes);
}

static sbyte[] ReadSByteArray(JsonElement owner, string propertyName) {
    JsonElement values = owner.GetProperty(propertyName);
    var result = new sbyte[values.GetArrayLength()];
    int index = 0;
    foreach (JsonElement value in values.EnumerateArray())
        result[index++] = checked((sbyte)value.GetInt32());
    return result;
}

static int[] ReadIntArray(JsonElement owner, string propertyName) {
    JsonElement values = owner.GetProperty(propertyName);
    var result = new int[values.GetArrayLength()];
    int index = 0;
    foreach (JsonElement value in values.EnumerateArray())
        result[index++] = value.GetInt32();
    return result;
}

static string[] ReadStringArray(JsonElement owner, string propertyName) {
    JsonElement values = owner.GetProperty(propertyName);
    var result = new string[values.GetArrayLength()];
    int index = 0;
    foreach (JsonElement value in values.EnumerateArray())
        result[index++] = value.GetString()
            ?? throw new InvalidDataException(
                $"{propertyName} contains a null name.");
    return result;
}

static void VerifyStringArray(
    JsonElement actual,
    IReadOnlyList<string> expected,
    string label) {
    if (actual.GetArrayLength() != expected.Count)
        throw new InvalidDataException($"{label} names changed.");
    int index = 0;
    foreach (JsonElement value in actual.EnumerateArray()) {
        if (value.GetString() != expected[index++])
            throw new InvalidDataException($"{label} names changed.");
    }
}

static void RequireString(
    JsonElement owner,
    string propertyName,
    string expected) {
    string actual = RequiredString(owner, propertyName);
    if (actual != expected)
        throw new InvalidDataException(
            $"{propertyName} expected {expected}, got {actual}.");
}

static string RequiredString(JsonElement owner, string propertyName) =>
    owner.GetProperty(propertyName).GetString()
    ?? throw new InvalidDataException($"{propertyName} must be a string.");

static int RequiredInt(JsonElement owner, string propertyName) =>
    owner.GetProperty(propertyName).GetInt32();

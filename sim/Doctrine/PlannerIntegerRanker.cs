namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Result of one integer planner-ranker evaluation. Candidate ties are resolved in declared
/// order. When only one candidate is available, <see cref="RunnerUpCandidateIndex"/> is -1 and
/// <see cref="Margin"/> is zero.
/// </summary>
public readonly record struct PlannerIntegerRankerResult(
    int SelectedCandidateIndex,
    int RunnerUpCandidateIndex,
    int BestLogit,
    int RunnerUpLogit,
    long Margin);

/// <summary>
/// A small, deterministic, dependency-free inference kernel for planner distillation.
///
/// The model is input -> 16 ReLU units -> 9 candidate logits. Inputs and hidden activations are
/// signed 16-bit integers, weights are signed 8-bit integers, and both layers accumulate in
/// signed 32-bit integers. Power-of-two scale shifts make the wire format and native/WASM
/// evaluation agree without floating-point behavior. Input-to-hidden weights are hidden-major;
/// hidden-to-output weights are candidate-major.
///
/// Construction copies and validates the model once. A valid evaluation performs no heap
/// allocation. The caller supplies the availability mask separately so a learned ranker cannot
/// make an unavailable maneuver legal.
/// </summary>
public sealed class PlannerIntegerRanker {
    public const int HiddenUnitCount = 16;
    public const int CandidateCount = 9;
    public const int MaximumInputCount = 128;
    public const int MaximumScaleShift = 30;
    public const int MaximumBiasMagnitude = 1_000_000_000;
    public const ushort AllCandidatesMask = (1 << CandidateCount) - 1;

    readonly sbyte[] _inputToHiddenWeights;
    readonly int[] _hiddenBiases;
    readonly sbyte[] _hiddenToOutputWeights;
    readonly int[] _outputBiases;

    public int InputCount { get; }
    public int HiddenScaleShift { get; }
    public int OutputScaleShift { get; }

    /// <param name="inputCount">Exact number of inputs expected by <see cref="Evaluate"/>.</param>
    /// <param name="inputToHiddenWeights">
    /// Hidden-major weights, with <c>HiddenUnitCount * inputCount</c> elements.
    /// </param>
    /// <param name="hiddenBiases">One bias per hidden unit.</param>
    /// <param name="hiddenScaleShift">
    /// Non-negative power-of-two shift applied after hidden accumulation and ReLU.
    /// </param>
    /// <param name="hiddenToOutputWeights">
    /// Candidate-major weights, with <c>CandidateCount * HiddenUnitCount</c> elements.
    /// </param>
    /// <param name="outputBiases">One bias per candidate logit.</param>
    /// <param name="outputScaleShift">
    /// Non-negative arithmetic power-of-two shift applied to each output accumulator.
    /// </param>
    public PlannerIntegerRanker(
        int inputCount,
        ReadOnlySpan<sbyte> inputToHiddenWeights,
        ReadOnlySpan<int> hiddenBiases,
        int hiddenScaleShift,
        ReadOnlySpan<sbyte> hiddenToOutputWeights,
        ReadOnlySpan<int> outputBiases,
        int outputScaleShift) {
        if (inputCount is < 1 or > MaximumInputCount)
            throw new ArgumentOutOfRangeException(nameof(inputCount),
                $"Input count must be between 1 and {MaximumInputCount}.");
        ValidateScaleShift(hiddenScaleShift, nameof(hiddenScaleShift));
        ValidateScaleShift(outputScaleShift, nameof(outputScaleShift));
        ValidateLength(inputToHiddenWeights.Length, HiddenUnitCount * inputCount,
            nameof(inputToHiddenWeights));
        ValidateLength(hiddenBiases.Length, HiddenUnitCount, nameof(hiddenBiases));
        ValidateLength(hiddenToOutputWeights.Length, CandidateCount * HiddenUnitCount,
            nameof(hiddenToOutputWeights));
        ValidateLength(outputBiases.Length, CandidateCount, nameof(outputBiases));
        ValidateBiases(hiddenBiases, nameof(hiddenBiases));
        ValidateBiases(outputBiases, nameof(outputBiases));

        Span<int> maximumHiddenActivations = stackalloc int[HiddenUnitCount];
        ValidateHiddenBounds(
            inputCount,
            inputToHiddenWeights,
            hiddenBiases,
            hiddenScaleShift,
            maximumHiddenActivations);
        ValidateOutputBounds(
            hiddenToOutputWeights,
            outputBiases,
            maximumHiddenActivations);

        InputCount = inputCount;
        HiddenScaleShift = hiddenScaleShift;
        OutputScaleShift = outputScaleShift;
        _inputToHiddenWeights = inputToHiddenWeights.ToArray();
        _hiddenBiases = hiddenBiases.ToArray();
        _hiddenToOutputWeights = hiddenToOutputWeights.ToArray();
        _outputBiases = outputBiases.ToArray();
    }

    /// <summary>
    /// Evaluates a model and discards the individual logits. This overload remains allocation-free;
    /// its temporary buffers live on the stack.
    /// </summary>
    public PlannerIntegerRankerResult Evaluate(
        ReadOnlySpan<short> inputs,
        ushort availabilityMask) {
        Span<int> logits = stackalloc int[CandidateCount];
        return Evaluate(inputs, availabilityMask, logits);
    }

    /// <summary>
    /// Evaluates all nine logits, writes them in declared candidate order, and selects only among
    /// candidates enabled by <paramref name="availabilityMask"/>.
    /// </summary>
    public PlannerIntegerRankerResult Evaluate(
        ReadOnlySpan<short> inputs,
        ushort availabilityMask,
        Span<int> logits) {
        if (inputs.Length != InputCount)
            throw new ArgumentException(
                $"Expected exactly {InputCount} inputs, but received {inputs.Length}.",
                nameof(inputs));
        if (logits.Length < CandidateCount)
            throw new ArgumentException(
                $"Logit destination must contain at least {CandidateCount} elements.",
                nameof(logits));
        ValidateAvailabilityMask(availabilityMask);

        Span<short> hidden = stackalloc short[HiddenUnitCount];
        for (int hiddenIndex = 0; hiddenIndex < HiddenUnitCount; hiddenIndex++) {
            int accumulator = _hiddenBiases[hiddenIndex];
            int weightOffset = hiddenIndex * InputCount;
            for (int inputIndex = 0; inputIndex < InputCount; inputIndex++)
                accumulator += inputs[inputIndex]
                    * _inputToHiddenWeights[weightOffset + inputIndex];

            hidden[hiddenIndex] = accumulator <= 0
                ? (short)0
                : (short)(accumulator >> HiddenScaleShift);
        }

        for (int candidateIndex = 0; candidateIndex < CandidateCount; candidateIndex++) {
            int accumulator = _outputBiases[candidateIndex];
            int weightOffset = candidateIndex * HiddenUnitCount;
            for (int hiddenIndex = 0; hiddenIndex < HiddenUnitCount; hiddenIndex++)
                accumulator += hidden[hiddenIndex]
                    * _hiddenToOutputWeights[weightOffset + hiddenIndex];
            logits[candidateIndex] = accumulator >> OutputScaleShift;
        }

        int bestIndex = -1;
        int runnerUpIndex = -1;
        int bestLogit = 0;
        int runnerUpLogit = 0;
        for (int candidateIndex = 0; candidateIndex < CandidateCount; candidateIndex++) {
            if ((availabilityMask & (1 << candidateIndex)) == 0)
                continue;

            int logit = logits[candidateIndex];
            if (bestIndex < 0) {
                bestIndex = candidateIndex;
                bestLogit = logit;
            } else if (logit > bestLogit) {
                runnerUpIndex = bestIndex;
                runnerUpLogit = bestLogit;
                bestIndex = candidateIndex;
                bestLogit = logit;
            } else if (runnerUpIndex < 0 || logit > runnerUpLogit) {
                runnerUpIndex = candidateIndex;
                runnerUpLogit = logit;
            }
        }

        long margin = runnerUpIndex < 0
            ? 0L
            : (long)bestLogit - runnerUpLogit;
        return new PlannerIntegerRankerResult(
            bestIndex,
            runnerUpIndex,
            bestLogit,
            runnerUpIndex < 0 ? 0 : runnerUpLogit,
            margin);
    }

    static void ValidateLength(int actual, int expected, string parameterName) {
        if (actual != expected)
            throw new ArgumentException(
                $"Expected exactly {expected} elements, but received {actual}.",
                parameterName);
    }

    static void ValidateScaleShift(int shift, string parameterName) {
        if (shift is < 0 or > MaximumScaleShift)
            throw new ArgumentOutOfRangeException(parameterName,
                $"Scale shift must be between 0 and {MaximumScaleShift}.");
    }

    static void ValidateBiases(ReadOnlySpan<int> biases, string parameterName) {
        for (int index = 0; index < biases.Length; index++) {
            if ((long)biases[index] < -MaximumBiasMagnitude
                || biases[index] > MaximumBiasMagnitude)
                throw new ArgumentOutOfRangeException(parameterName,
                    $"Bias {index} exceeds the +/-{MaximumBiasMagnitude} model bound.");
        }
    }

    static void ValidateHiddenBounds(
        int inputCount,
        ReadOnlySpan<sbyte> weights,
        ReadOnlySpan<int> biases,
        int scaleShift,
        Span<int> maximumActivations) {
        for (int hiddenIndex = 0; hiddenIndex < HiddenUnitCount; hiddenIndex++) {
            long minimum = biases[hiddenIndex];
            long maximum = biases[hiddenIndex];
            int weightOffset = hiddenIndex * inputCount;
            for (int inputIndex = 0; inputIndex < inputCount; inputIndex++) {
                int weight = weights[weightOffset + inputIndex];
                if (weight >= 0) {
                    minimum += (long)short.MinValue * weight;
                    maximum += (long)short.MaxValue * weight;
                } else {
                    minimum += (long)short.MaxValue * weight;
                    maximum += (long)short.MinValue * weight;
                }
            }

            if (minimum < int.MinValue || maximum > int.MaxValue)
                throw new ArgumentException(
                    $"Hidden accumulator {hiddenIndex} can overflow Int32.",
                    nameof(weights));

            long maximumActivation = maximum <= 0
                ? 0
                : maximum >> scaleShift;
            if (maximumActivation > short.MaxValue)
                throw new ArgumentException(
                    $"Hidden unit {hiddenIndex} can exceed Int16 after scaling; "
                    + "increase hiddenScaleShift or requantize the model.",
                    nameof(scaleShift));
            maximumActivations[hiddenIndex] = (int)maximumActivation;
        }
    }

    static void ValidateOutputBounds(
        ReadOnlySpan<sbyte> weights,
        ReadOnlySpan<int> biases,
        ReadOnlySpan<int> maximumHiddenActivations) {
        for (int candidateIndex = 0; candidateIndex < CandidateCount; candidateIndex++) {
            long minimum = biases[candidateIndex];
            long maximum = biases[candidateIndex];
            int weightOffset = candidateIndex * HiddenUnitCount;
            for (int hiddenIndex = 0; hiddenIndex < HiddenUnitCount; hiddenIndex++) {
                int weight = weights[weightOffset + hiddenIndex];
                long product = (long)maximumHiddenActivations[hiddenIndex] * weight;
                if (weight >= 0)
                    maximum += product;
                else
                    minimum += product;
            }

            if (minimum < int.MinValue || maximum > int.MaxValue)
                throw new ArgumentException(
                    $"Output accumulator {candidateIndex} can overflow Int32.",
                    nameof(weights));
        }
    }

    static void ValidateAvailabilityMask(ushort availabilityMask) {
        if (availabilityMask == 0
            || (availabilityMask & ~AllCandidatesMask) != 0)
            throw new ArgumentOutOfRangeException(nameof(availabilityMask),
                $"Availability must be a non-zero {CandidateCount}-bit mask.");
    }
}

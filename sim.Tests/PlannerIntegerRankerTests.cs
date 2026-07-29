using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

[Collection(PlannerAllocationSensitiveCollection.Name)]
public class PlannerIntegerRankerTests {
    const int InputCount = 32;

    [Fact]
    public void GoldenModelProducesExpectedLogitsSelectionAndMargin() {
        var inputToHidden = new sbyte[
            PlannerIntegerRanker.HiddenUnitCount * InputCount];
        inputToHidden[0 * InputCount + 0] = 2;
        inputToHidden[0 * InputCount + 1] = -1;
        inputToHidden[1 * InputCount + 2] = 4;

        var hiddenToOutput = new sbyte[
            PlannerIntegerRanker.CandidateCount
            * PlannerIntegerRanker.HiddenUnitCount];
        hiddenToOutput[0 * PlannerIntegerRanker.HiddenUnitCount + 0] = 2;
        hiddenToOutput[0 * PlannerIntegerRanker.HiddenUnitCount + 1] = 1;
        hiddenToOutput[1 * PlannerIntegerRanker.HiddenUnitCount + 0] = 1;
        hiddenToOutput[1 * PlannerIntegerRanker.HiddenUnitCount + 1] = 3;
        hiddenToOutput[2 * PlannerIntegerRanker.HiddenUnitCount + 0] = -1;
        hiddenToOutput[2 * PlannerIntegerRanker.HiddenUnitCount + 1] = 1;
        int[] outputBiases = { 1, 0, 20, -100, -100, -100, -100, -100, -100 };
        var model = new PlannerIntegerRanker(
            InputCount,
            inputToHidden,
            new int[PlannerIntegerRanker.HiddenUnitCount],
            hiddenScaleShift: 2,
            hiddenToOutput,
            outputBiases,
            outputScaleShift: 0);
        var inputs = new short[InputCount];
        inputs[0] = 10;
        inputs[1] = -4;
        inputs[2] = 3;
        Span<int> logits = stackalloc int[PlannerIntegerRanker.CandidateCount];

        PlannerIntegerRankerResult result = model.Evaluate(
            inputs,
            PlannerIntegerRanker.AllCandidatesMask,
            logits);

        Assert.Equal(new[] { 16, 15, 17, -100, -100, -100, -100, -100, -100 },
            logits.ToArray());
        Assert.Equal(2, result.SelectedCandidateIndex);
        Assert.Equal(0, result.RunnerUpCandidateIndex);
        Assert.Equal(17, result.BestLogit);
        Assert.Equal(16, result.RunnerUpLogit);
        Assert.Equal(1, result.Margin);
    }

    [Fact]
    public void StrictComparisonKeepsFirstMaximumInDeclaredOrder() {
        int[] outputBiases = { 42, 42, 41, 42, 0, 0, 0, 0, 0 };
        PlannerIntegerRanker model = ZeroWeightModel(outputBiases);

        PlannerIntegerRankerResult all = model.Evaluate(
            new short[InputCount],
            PlannerIntegerRanker.AllCandidatesMask);
        PlannerIntegerRankerResult subset = model.Evaluate(
            new short[InputCount],
            (1 << 1) | (1 << 3));

        Assert.Equal(0, all.SelectedCandidateIndex);
        Assert.Equal(1, all.RunnerUpCandidateIndex);
        Assert.Equal(0, all.Margin);
        Assert.Equal(1, subset.SelectedCandidateIndex);
        Assert.Equal(3, subset.RunnerUpCandidateIndex);
        Assert.Equal(0, subset.Margin);
    }

    [Fact]
    public void AvailabilityMaskCanExcludeTheGlobalMaximum() {
        int[] outputBiases = { 100, 90, 20, 80, 10, 70, 60, 50, 40 };
        PlannerIntegerRanker model = ZeroWeightModel(outputBiases);

        PlannerIntegerRankerResult result = model.Evaluate(
            new short[InputCount],
            (1 << 2) | (1 << 4));
        PlannerIntegerRankerResult single = model.Evaluate(
            new short[InputCount],
            1 << 7);

        Assert.Equal(2, result.SelectedCandidateIndex);
        Assert.Equal(4, result.RunnerUpCandidateIndex);
        Assert.Equal(10, result.Margin);
        Assert.Equal(7, single.SelectedCandidateIndex);
        Assert.Equal(-1, single.RunnerUpCandidateIndex);
        Assert.Equal(0, single.Margin);
    }

    [Fact]
    public void ConstructorRejectsMalformedOrUnsafeModelsClosed() {
        sbyte[] inputWeights = new sbyte[
            PlannerIntegerRanker.HiddenUnitCount * InputCount];
        int[] hiddenBiases = new int[PlannerIntegerRanker.HiddenUnitCount];
        sbyte[] outputWeights = new sbyte[
            PlannerIntegerRanker.CandidateCount
            * PlannerIntegerRanker.HiddenUnitCount];
        int[] outputBiases = new int[PlannerIntegerRanker.CandidateCount];

        Assert.Throws<ArgumentOutOfRangeException>(() => new PlannerIntegerRanker(
            0, inputWeights, hiddenBiases, 0, outputWeights, outputBiases, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PlannerIntegerRanker(
            PlannerIntegerRanker.MaximumInputCount + 1,
            inputWeights, hiddenBiases, 0, outputWeights, outputBiases, 0));
        Assert.Throws<ArgumentException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights[..^1], hiddenBiases, 0,
            outputWeights, outputBiases, 0));
        Assert.Throws<ArgumentException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases[..^1], 0,
            outputWeights, outputBiases, 0));
        Assert.Throws<ArgumentException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, 0,
            outputWeights[..^1], outputBiases, 0));
        Assert.Throws<ArgumentException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, 0,
            outputWeights, outputBiases[..^1], 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, -1,
            outputWeights, outputBiases, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, 0,
            outputWeights, outputBiases,
            PlannerIntegerRanker.MaximumScaleShift + 1));

        hiddenBiases[0] = PlannerIntegerRanker.MaximumBiasMagnitude + 1;
        Assert.Throws<ArgumentOutOfRangeException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, 0,
            outputWeights, outputBiases, 0));
        hiddenBiases[0] = 0;

        // The Int32 sum is legal, but casting this unscaled activation to Int16 would not be.
        inputWeights[0] = sbyte.MaxValue;
        Assert.Throws<ArgumentException>(() => new PlannerIntegerRanker(
            InputCount, inputWeights, hiddenBiases, 0,
            outputWeights, outputBiases, 0));
    }

    [Fact]
    public void EvaluationRejectsMalformedDimensionsAndMasks() {
        PlannerIntegerRanker model = ZeroWeightModel(new int[
            PlannerIntegerRanker.CandidateCount]);
        var inputs = new short[InputCount];
        var logits = new int[PlannerIntegerRanker.CandidateCount];

        Assert.Throws<ArgumentException>(() =>
            model.Evaluate(inputs[..^1], 1, logits));
        Assert.Throws<ArgumentException>(() =>
            model.Evaluate(inputs, 1, logits.AsSpan(0, logits.Length - 1)));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            model.Evaluate(inputs, 0, logits));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            model.Evaluate(inputs, 1 << PlannerIntegerRanker.CandidateCount, logits));
    }

    [Fact]
    public void RepeatedEvaluationIsDeterministicAndAllocationFree() {
        int[] outputBiases = { 9, 8, 7, 6, 5, 4, 3, 2, 1 };
        PlannerIntegerRanker model = ZeroWeightModel(outputBiases);
        var inputs = new short[InputCount];
        var logits = new int[PlannerIntegerRanker.CandidateCount];
        long checksum = 0;

        for (int warmup = 0; warmup < 2_048; warmup++)
            checksum += model.Evaluate(
                inputs,
                PlannerIntegerRanker.AllCandidatesMask,
                logits).BestLogit;

        _ = GC.GetAllocatedBytesForCurrentThread();
        long before = GC.GetAllocatedBytesForCurrentThread();
        for (int iteration = 0; iteration < 10_000; iteration++) {
            PlannerIntegerRankerResult result = model.Evaluate(
                inputs,
                PlannerIntegerRanker.AllCandidatesMask,
                logits);
            checksum += result.BestLogit + result.SelectedCandidateIndex;
        }
        long allocated = GC.GetAllocatedBytesForCurrentThread() - before;

        GC.KeepAlive(checksum);
        Assert.Equal(12_048L * outputBiases[0], checksum);
        Assert.Equal(0, allocated);
    }

    static PlannerIntegerRanker ZeroWeightModel(int[] outputBiases) =>
        new(
            InputCount,
            new sbyte[PlannerIntegerRanker.HiddenUnitCount * InputCount],
            new int[PlannerIntegerRanker.HiddenUnitCount],
            hiddenScaleShift: 0,
            new sbyte[
                PlannerIntegerRanker.CandidateCount
                * PlannerIntegerRanker.HiddenUnitCount],
            outputBiases,
            outputScaleShift: 0);
}

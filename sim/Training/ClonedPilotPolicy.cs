using System;
using System.Collections.Generic;
using System.Text.Json;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// A pilot learned from recorded human flying, flown through the ordinary policy seam.
/// </summary>
/// <remarks>
/// This exists so the fight can be trained and graded against a MODEL OF THE PILOT rather than a
/// scripted stand-in. A replay of his inputs is open loop and stops being him the moment the
/// opponent diverges from the tape; a policy responds to what the opponent actually does, which is
/// what makes it usable as a training adversary.
///
/// Features come from <see cref="HumanPilotFeatures"/> — the same code that produced the training
/// rows. The manifest carries its feature version and a set of reference cases, and this refuses to
/// load a manifest whose version differs or whose reference outputs it cannot reproduce. A clone
/// that learned one function and flies another would otherwise be invisible: the training metrics
/// would look exactly the same.
/// </remarks>
public sealed class ClonedPilotPolicy : ICombatLearningPolicy {
    const double ReferenceTolerance = 1e-6;

    readonly double[] _inputMean, _inputScale, _outputMean, _outputScale;
    readonly double[,] _w1, _w2, _w3;
    readonly double[] _b1, _b2, _b3;
    readonly int _hidden;
    readonly double _firingThreshold;

    public ClonedPilotPolicy(string manifestPath, double firingThreshold = 0.5) {
        using JsonDocument document = JsonDocument.Parse(System.IO.File.ReadAllText(manifestPath));
        JsonElement root = document.RootElement;

        int version = root.GetProperty("feature_version").GetInt32();
        if (version != HumanPilotFeatures.Version)
            throw new InvalidOperationException(
                $"Pilot clone manifest was trained on feature version {version}, but this build "
                + $"computes version {HumanPilotFeatures.Version}. Re-export and retrain rather "
                + "than flying a clone against features it never saw.");

        _hidden = root.GetProperty("hidden").GetInt32();
        _inputMean = Vector(root, "input_mean");
        _inputScale = Vector(root, "input_scale");
        _outputMean = Vector(root, "output_mean");
        _outputScale = Vector(root, "output_scale");
        _w1 = Matrix(root, "w1"); _b1 = Vector(root, "b1");
        _w2 = Matrix(root, "w2"); _b2 = Vector(root, "b2");
        _w3 = Matrix(root, "w3"); _b3 = Vector(root, "b3");
        _firingThreshold = firingThreshold;

        if (_inputMean.Length != HumanPilotFeatures.FeatureCount)
            throw new InvalidOperationException(
                $"Manifest expects {_inputMean.Length} features; this build computes "
                + $"{HumanPilotFeatures.FeatureCount}.");
        VerifyAgainstReferenceCases(root);
    }

    /// <summary>The clone's controls for this observation, and whether it would shoot.</summary>
    public CombatPolicyDecision Decide(in CombatPolicyObservation observation) {
        Span<double> features = stackalloc double[HumanPilotFeatures.FeatureCount];
        HumanPilotFeatures.Extract(observation, features);
        (double g, double bank, double throttle, double firingLogit) = Evaluate(features);
        // The kernel remains the authority on what the airframe will do with these.
        return new CombatPolicyDecision(
            new PilotCommand(g, bank, throttle, 0.0),
            Sigmoid(firingLogit) >= _firingThreshold);
    }

    internal (double G, double Bank, double Throttle, double FiringLogit) Evaluate(
        ReadOnlySpan<double> features) {
        Span<double> standardised = stackalloc double[features.Length];
        for (int i = 0; i < features.Length; i++)
            standardised[i] = (features[i] - _inputMean[i]) / _inputScale[i];

        Span<double> h1 = stackalloc double[_hidden];
        for (int j = 0; j < _hidden; j++) {
            double sum = _b1[j];
            for (int i = 0; i < features.Length; i++) sum += standardised[i] * _w1[i, j];
            h1[j] = Math.Tanh(sum);
        }
        Span<double> h2 = stackalloc double[_hidden];
        for (int j = 0; j < _hidden; j++) {
            double sum = _b2[j];
            for (int i = 0; i < _hidden; i++) sum += h1[i] * _w2[i, j];
            h2[j] = Math.Tanh(sum);
        }
        Span<double> outputs = stackalloc double[4];
        for (int j = 0; j < 4; j++) {
            double sum = _b3[j];
            for (int i = 0; i < _hidden; i++) sum += h2[i] * _w3[i, j];
            outputs[j] = sum;
        }
        return (outputs[0] * _outputScale[0] + _outputMean[0],
            outputs[1] * _outputScale[1] + _outputMean[1],
            outputs[2] * _outputScale[2] + _outputMean[2],
            outputs[3]);
    }

    void VerifyAgainstReferenceCases(JsonElement root) {
        if (!root.TryGetProperty("reference_cases", out JsonElement cases)
            || cases.ValueKind != JsonValueKind.Array || cases.GetArrayLength() == 0)
            throw new InvalidOperationException(
                "Pilot clone manifest carries no reference cases, so its forward pass cannot be "
                + "checked against the trainer's. Re-export it.");
        int index = 0;
        foreach (JsonElement reference in cases.EnumerateArray()) {
            double[] features = Vector(reference, "x");
            (double g, double bank, double throttle, double logit) = Evaluate(features);
            Check("g", g, reference.GetProperty("g").GetDouble(), index);
            Check("bank", bank, reference.GetProperty("bank").GetDouble(), index);
            Check("throttle", throttle, reference.GetProperty("throttle").GetDouble(), index);
            Check("firing_logit", logit, reference.GetProperty("firing_logit").GetDouble(), index);
            index++;
        }
    }

    static void Check(string head, double actual, double expected, int index) {
        if (Math.Abs(actual - expected) > ReferenceTolerance)
            throw new InvalidOperationException(
                $"Pilot clone reference case {index} head '{head}' evaluated to {actual} here but "
                + $"{expected} in the trainer. The clone would fly a different function from the "
                + "one that was trained.");
    }

    static double Sigmoid(double value) => 1.0 / (1.0 + Math.Exp(-value));

    static double[] Vector(JsonElement root, string name) {
        JsonElement element = root.GetProperty(name);
        var values = new double[element.GetArrayLength()];
        int i = 0;
        foreach (JsonElement value in element.EnumerateArray()) values[i++] = value.GetDouble();
        return values;
    }

    static double[,] Matrix(JsonElement root, string name) {
        JsonElement element = root.GetProperty(name);
        int rows = element.GetArrayLength();
        int columns = rows == 0 ? 0 : element[0].GetArrayLength();
        var values = new double[rows, columns];
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < columns; c++)
                values[r, c] = element[r][c].GetDouble();
        return values;
    }
}

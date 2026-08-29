using System.IO;
using Xunit;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// A fact that needs a recorded-flight dataset, and skips rather than fails when it is absent.
/// </summary>
/// <remarks>
/// The pilot datasets are a person's own flight telemetry and are large. They are deliberately not
/// committed, so a clone of this repository has the code and not the flights. A test that hard-
/// failed on their absence would tell every other checkout that the build is broken when nothing
/// is; skipping says the truth, which is that the evidence is not present here.
/// </remarks>
public sealed class FactIfDataAttribute : FactAttribute {
    public FactIfDataAttribute(string relativePath) {
        if (!File.Exists(relativePath))
            Skip = $"needs {relativePath}; regenerate with tools/telemetry/owner_engagements.py";
    }
}

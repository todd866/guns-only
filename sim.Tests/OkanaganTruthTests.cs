using System.Security.Cryptography;
using System.Text;
using GunsOnly.Sim.Okanagan;

namespace GunsOnly.Sim.Tests;

public class OkanaganTruthTests
{
    static readonly string[] Names = ["OkanaganCentral.cdem.json", "OkanaganCentral.world.json", "OkanaganResorts.osm.json"];
    static string[] Originals() => Names.Select(name => {
        using var stream = typeof(OkanaganTruth).Assembly.GetManifestResourceStream("GunsOnly.Sim.Data." + name)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }).ToArray();

    [Fact]
    public void PantherStillUsesEagerUkraineTruth()
    {
        var environment = GunsOnly.Sim.Doctrine.Beats.KoreaSortie().EnvironmentIdentity;
        Assert.Equal(GunsOnly.Sim.Doctrine.Ukraine2030sTheatre.TerrainProfileId, environment.TerrainProfileId);
    }

    [Fact]
    public void MissingTruthFailsClosed()
    {
        var payload = new OkanaganTruthPayload();
        Assert.False(payload.IsLoaded);
        Assert.Throws<InvalidOperationException>(() => payload.Open("GunsOnly.Sim.Data." + Names[0]));
    }

    [Theory]
    [InlineData(0)] [InlineData(1)] [InlineData(2)]
    public void CorruptPartialInstallIsRejectedAndRetryPreservesExactBytes(int corrupt)
    {
        var payload = new OkanaganTruthPayload();
        string[] original = Originals(), bad = (string[])original.Clone();
        bad[corrupt] += " "; // valid JSON still fails exact truth identity
        Assert.Throws<InvalidDataException>(() => payload.Install(bad[0], bad[1], bad[2]));
        Assert.False(payload.IsLoaded);
        payload.Install(original[0], original[1], original[2]);
        Assert.True(payload.IsLoaded);
        Assert.Throws<InvalidDataException>(() => payload.Install(bad[0], bad[1], bad[2]));
        for (int i = 0; i < Names.Length; i++) {
            using Stream stream = payload.Open("GunsOnly.Sim.Data." + Names[i]);
            Assert.Equal(SHA256.HashData(Encoding.UTF8.GetBytes(original[i])), SHA256.HashData(stream));
            Assert.False(stream.CanWrite);
        }
    }
}

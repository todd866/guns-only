using System.Security.Cryptography;
using System.Text;

namespace GunsOnly.Sim.Okanagan;

/// <summary>Exact committed truth bytes. Browser installation is atomic and precedes any sortie;
/// native tools retain embedded data. No fallback terrain is permitted in the browser.</summary>
public static class OkanaganTruth
{
    static readonly OkanaganTruthPayload Payload = new();

    public static void Install(string terrain, string world, string resorts) =>
        Payload.Install(terrain, world, resorts);

    public static void RequireLoaded()
    {
        if (OperatingSystem.IsBrowser() && !Payload.IsLoaded)
            throw new InvalidOperationException("Fire Boss truth has not loaded.");
    }

    public static Stream Open(string resourceName)
    {
        if (Payload.IsLoaded) return Payload.Open(resourceName);
        RequireLoaded();
        return typeof(OkanaganTruth).Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Missing Okanagan truth {resourceName}.");
    }
}

/// <summary>Isolated payload store also exercised by native integrity/atomicity tests.</summary>
public sealed class OkanaganTruthPayload
{
    public const string TerrainHash = "1761332f521f506476d01fa31c9b669a5d5ee56bf5af56d17c6b44a19de1b7cd";
    public const string WorldHash = "23175fcfc405f0e6c6bf0ca0c7f638ad0b892fecb76a3640552bc34865c01963";
    public const string ResortsHash = "16cae455f25b343c85deb3bba4ad75e20031f769e5dc18a0a76fccde0284cf29";
    Dictionary<string, byte[]>? _data;
    public bool IsLoaded => _data is not null;

    public void Install(string terrain, string world, string resorts)
    {
        // Validate every byte before publishing any part. Rejected/retried loads cannot replace
        // an existing valid surface or poison the static terrain/incident initializers.
        var data = new Dictionary<string, byte[]> {
            ["GunsOnly.Sim.Data.OkanaganCentral.cdem.json"] = Verify(terrain, TerrainHash),
            ["GunsOnly.Sim.Data.OkanaganCentral.world.json"] = Verify(world, WorldHash),
            ["GunsOnly.Sim.Data.OkanaganResorts.osm.json"] = Verify(resorts, ResortsHash),
        };
        _data ??= data;
    }

    public Stream Open(string name) => _data is not null && _data.TryGetValue(name, out var bytes)
        ? new MemoryStream(bytes, writable: false)
        : throw new InvalidOperationException($"Okanagan truth is unavailable: {name}.");

    static byte[] Verify(string text, string expected)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        if (!StringComparer.OrdinalIgnoreCase.Equals(Convert.ToHexString(SHA256.HashData(bytes)), expected))
            throw new InvalidDataException("Fire Boss truth SHA-256 mismatch.");
        return bytes;
    }
}

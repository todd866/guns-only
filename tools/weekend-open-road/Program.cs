using System.Security.Cryptography;
using System.Text;
using GunsOnly.Sim.Motorcycle;

string repositoryRoot = FindRepositoryRoot();
bool write = args.Contains("--write", StringComparer.Ordinal);
bool check = args.Contains("--check", StringComparer.Ordinal);
if (write == check)
{
    Console.Error.WriteLine("usage: WeekendOpenRoadExporter (--write|--check)");
    return 2;
}

string json = WeekendRoadNetworkContract.FromDefaultWeekendWorld()
    .ToJson(indented: true) + "\n";
string[] outputs = {
    Path.Combine(repositoryRoot,
        "content/packs/weekend-ride/environment/roads/"
        + "weekend-hinterland-road-network.v1.json"),
    Path.Combine(repositoryRoot,
        "web/wwwroot/content/packs/weekend-ride/environment/roads/"
        + "weekend-hinterland-road-network.v1.json"),
    Path.Combine(repositoryRoot,
        "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/WeekendRide/OpenRoad/"
        + "weekend-hinterland-road-network-v1.json"),
};

foreach (string output in outputs)
{
    if (write)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        File.WriteAllText(output, json, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
        Console.WriteLine("wrote " + Path.GetRelativePath(repositoryRoot, output));
    }
    else if (!File.Exists(output) || File.ReadAllText(output) != json)
    {
        Console.Error.WriteLine(
            "stale " + Path.GetRelativePath(repositoryRoot, output));
        return 1;
    }
}

Console.WriteLine(
    "sha256=" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)))
        .ToLowerInvariant()
    + " bytes=" + Encoding.UTF8.GetByteCount(json));
return 0;

static string FindRepositoryRoot()
{
    string? directory = Directory.GetCurrentDirectory();
    for (int depth = 0; depth < 12 && directory != null; depth++)
    {
        if (File.Exists(Path.Combine(directory, "global.json"))
            && Directory.Exists(Path.Combine(directory, "sim")))
        {
            return directory;
        }
        directory = Directory.GetParent(directory)?.FullName;
    }
    throw new DirectoryNotFoundException("guns-only repository root not found");
}

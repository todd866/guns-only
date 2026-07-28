namespace GunsOnly.Sim.Tests;

internal static class TestRepository {
    static readonly Lazy<string> RootValue = new(FindRoot);

    public static string Root => RootValue.Value;

    static string FindRoot() {
        // bin/check builds with --artifacts-path in a scratch directory OUTSIDE the repo, and the
        // test host sets its working directory to the assembly's directory, so under the gate no
        // walk can reach the repo — the gate scripts export GUNS_REPO_ROOT for exactly this case.
        // The walks cover in-tree dotnet test and IDE runs.
        string? exported = System.Environment.GetEnvironmentVariable("GUNS_REPO_ROOT");
        if (exported is not null
            && File.Exists(Path.Combine(exported, "GunsOnly.sln")))
            return exported;
        foreach (string start in new[] {
            AppContext.BaseDirectory, Directory.GetCurrentDirectory()
        }) {
            DirectoryInfo? directory = new(start);
            while (directory is not null) {
                if (File.Exists(Path.Combine(directory.FullName, "GunsOnly.sln")))
                    return directory.FullName;
                directory = directory.Parent;
            }
        }

        throw new DirectoryNotFoundException(
            "Could not find GunsOnly.sln above "
            + $"{AppContext.BaseDirectory} or {Directory.GetCurrentDirectory()}");
    }
}

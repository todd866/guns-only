namespace GunsOnly.Sim.Tests;

internal static class TestRepository {
    static readonly Lazy<string> RootValue = new(FindRoot);

    public static string Root => RootValue.Value;

    static string FindRoot() {
        // bin/check builds with --artifacts-path in a scratch directory OUTSIDE the repo, so the
        // assembly location alone cannot anchor the walk; the gate always runs from the repo, so
        // the working directory covers it, and BaseDirectory covers in-tree dotnet test / IDEs.
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

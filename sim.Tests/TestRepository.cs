namespace GunsOnly.Sim.Tests;

internal static class TestRepository {
    static readonly Lazy<string> RootValue = new(FindRoot);

    public static string Root => RootValue.Value;

    static string FindRoot() {
        DirectoryInfo? directory = new(AppContext.BaseDirectory);
        while (directory is not null) {
            if (File.Exists(Path.Combine(directory.FullName, "GunsOnly.sln")))
                return directory.FullName;
            directory = directory.Parent;
        }

        throw new DirectoryNotFoundException(
            $"Could not find GunsOnly.sln above {AppContext.BaseDirectory}");
    }
}

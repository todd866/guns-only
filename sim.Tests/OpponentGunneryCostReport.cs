using System.Diagnostics;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

// Run this class alone. Compare the same file built on the base and changed kernel.
// Each fresh flight samples two active seconds (before the earliest observed kill); session
// creation is outside the timer. No post-defeat ticks can lower the changed kernel's average.
public sealed class OpponentGunneryCostReport(ITestOutputHelper output) {
    [Fact]
    public void ReportActiveTickCost() {
        if (System.Environment.GetEnvironmentVariable("C12_CPU") != "1") return;
        foreach (int lesson in new[] { 1, 3, 6, 7 }) {
            for (int trial = -1; trial < 5; trial++) {
                const int repeats = 12, ticks = 240;
                var (cpuUs, wallUs) = Measure(lesson, repeats);
                if (trial >= 0) output.WriteLine($"CPU lesson={lesson} trial={trial} ticks={repeats*ticks} process-us/tick={cpuUs:F3} wall-us/tick={wallUs:F3}");
            }
        }
    }

    // Also callable from an external runner loading base/current into isolated AssemblyLoadContexts,
    // so trials can alternate inside one process under the same runtime and scheduler conditions.
    public static (double CpuUs, double WallUs) Measure(int lesson, int repeats) {
        using var process = Process.GetCurrentProcess();
        const int ticks = 240;
        double cpuUs = 0, wallUs = 0;
        for (int repeat = 0; repeat < repeats; repeat++) {
            var s = BfmFlightAcceptanceTests.Start(lesson, repeat % 8);
            s.SetAssistedFlight(false);
            TimeSpan before = process.TotalProcessorTime;
            long start = Stopwatch.GetTimestamp();
            for (int tick = 0; tick < ticks; tick++) s.StepFixed();
            wallUs += Stopwatch.GetElapsedTime(start).TotalMicroseconds;
            cpuUs += (process.TotalProcessorTime - before).TotalMicroseconds;
            Assert.Equal(AircraftTerminalState.Flying, s.PlayerTerminalState);
        }
        return (cpuUs / (repeats * ticks), wallUs / (repeats * ticks));
    }
}

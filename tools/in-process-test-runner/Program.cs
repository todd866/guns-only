using Xunit;
using Xunit.Abstractions;
using Xunit.Sdk;

bool server = args.Contains("--server");
var assembly = server
    ? typeof(GunsOnly.Server.Tests.PresenceProtocolTests).Assembly
    : typeof(GunsOnly.Sim.Tests.ReactiveBanditTests).Assembly;
var filters = args.Where(argument => argument != "--server").ToArray();
using var framework = new XunitTestFramework(new NullMessageSink());
using var discoverer = framework.GetDiscoverer(new ReflectionAssemblyInfo(assembly));
var discovery = new DiscoverySink();
discoverer.Find(false, discovery, new Options());
discovery.Finished.WaitOne();
var selected = discovery.Cases.Where(test =>
    filters.Length == 0 || filters.Any(filter => test.DisplayName.Contains(
        filter, StringComparison.OrdinalIgnoreCase))).ToArray();
Console.WriteLine($"Discovered {discovery.Cases.Count} tests; running {selected.Length} in process.");
using var executor = framework.GetExecutor(assembly.GetName());
var execution = new ExecutionSink();
executor.RunTests(selected, execution, new Options());
execution.Finished.WaitOne();
Console.WriteLine($"Passed {execution.TestsRun - execution.TestsFailed - execution.TestsSkipped}; "
    + $"failed {execution.TestsFailed}; skipped {execution.TestsSkipped}; total {execution.TestsRun}.");
return execution.TestsFailed == 0 ? 0 : 1;

sealed class Options : ITestFrameworkDiscoveryOptions, ITestFrameworkExecutionOptions {
    readonly Dictionary<string, object?> values = new();

    public TValue GetValue<TValue>(string name) =>
        values.TryGetValue(name, out object? value) && value is TValue typed
            ? typed : default!;

    public void SetValue<TValue>(string name, TValue value) => values[name] = value;
}

sealed class DiscoverySink : LongLivedMarshalByRefObject, IMessageSink {
    public List<ITestCase> Cases { get; } = [];
    public ManualResetEvent Finished { get; } = new(false);

    public bool OnMessage(IMessageSinkMessage message) {
        if (message is ITestCaseDiscoveryMessage discovered)
            Cases.Add(discovered.TestCase);
        else if (message is IDiscoveryCompleteMessage)
            Finished.Set();
        return true;
    }
}

sealed class ExecutionSink : LongLivedMarshalByRefObject, IMessageSink {
    int completed;
    public ManualResetEvent Finished { get; } = new(false);
    public int TestsRun { get; private set; }
    public int TestsFailed { get; private set; }
    public int TestsSkipped { get; private set; }

    public bool OnMessage(IMessageSinkMessage message) {
        if (message is ITestFailed failed) {
            Console.Error.WriteLine($"FAIL {failed.Test.DisplayName}");
            for (int index = 0; index < failed.Messages.Length; index++) {
                Console.Error.WriteLine(failed.Messages[index]);
                Console.Error.WriteLine(failed.StackTraces[index]);
            }
        } else if (message is ITestOutput output) {
            Console.Write(output.Output);
        } else if (message is ITestFinished) {
            int count = Interlocked.Increment(ref completed);
            if (count % 50 == 0)
                Console.WriteLine($"Completed {count} tests...");
        } else if (message is ITestAssemblyFinished finished) {
            TestsRun = finished.TestsRun;
            TestsFailed = finished.TestsFailed;
            TestsSkipped = finished.TestsSkipped;
            Finished.Set();
        }
        return true;
    }
}

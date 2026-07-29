using GunsOnly.AncaAudit;

if (args is ["--help"] or ["-h"]) {
    PrintHelp();
    return 0;
}

string? only = null;
string? outPath = null;
bool list = false;
bool selfTest = false;
bool selfTestFull = false;
bool strict = false;
for (int i = 0; i < args.Length; i++) {
    string arg = args[i];
    if (arg is "--list") list = true;
    else if (arg is "--self-test") selfTest = true;
    else if (arg is "--self-test-full") { selfTest = true; selfTestFull = true; }
    else if (arg is "--strict") strict = true;
    else if (arg is "--scenario" or "-s") {
        if (i + 1 >= args.Length) {
            Console.Error.WriteLine("--scenario needs an id");
            return 2;
        }
        only = args[++i];
    } else if (arg is "--out" or "-o") {
        if (i + 1 >= args.Length) {
            Console.Error.WriteLine("--out needs a path");
            return 2;
        }
        outPath = args[++i];
    } else if (arg.StartsWith('-')) {
        Console.Error.WriteLine($"unknown flag: {arg}");
        PrintHelp();
        return 2;
    } else {
        only = arg;
    }
}

if (list) {
    foreach (AuditScenario scenario in Scenarios.All) {
        string req = scenario.RequireRadioIds is { Length: > 0 } ids
            ? $"  requires[{string.Join(",", ids)}]"
            : "";
        Console.WriteLine($"{scenario.Id}\tbeat {scenario.BeatIndex}\t{scenario.Title}{req}");
    }
    return 0;
}

if (selfTest)
    return SelfTest.Run(fullMatrix: selfTestFull);

IEnumerable<AuditScenario> selected;
if (string.IsNullOrEmpty(only)) {
    selected = Scenarios.All;
} else if (!Scenarios.TryFind(only, out AuditScenario match)) {
    Console.Error.WriteLine($"unknown scenario '{only}'. Use --list.");
    return 2;
} else {
    selected = [match];
}

TextWriter writer;
StreamWriter? fileWriter = null;
if (string.IsNullOrEmpty(outPath)) {
    writer = Console.Out;
} else {
    fileWriter = new StreamWriter(outPath);
    writer = fileWriter;
}

try {
    int samples = 0;
    int failures = 0;
    foreach (AuditScenario scenario in selected) {
        using var buffer = new StringWriter();
        HashSet<string> heard = Runner.RunCollectingRadio(scenario, buffer);
        string chunk = buffer.ToString();
        writer.Write(chunk);
        samples += chunk.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length;

        if (strict && scenario.RequireRadioIds is { Length: > 0 } required) {
            foreach (string id in required) {
                if (heard.Contains(id)) continue;
                Console.Error.WriteLine($"strict: {scenario.Id} missing radio '{id}'");
                failures++;
            }
        }
        if (strict && chunk.Contains("timeout-", StringComparison.Ordinal)) {
            Console.Error.WriteLine($"strict: {scenario.Id} timed out");
            failures++;
        }
    }
    if (!string.IsNullOrEmpty(outPath))
        Console.Error.WriteLine($"wrote {samples} samples → {outPath}");
    if (failures > 0) return 1;
    return samples > 0 ? 0 : 1;
} finally {
    fileWriter?.Dispose();
}

static void PrintHelp() {
    Console.WriteLine(
        """
        Usage: anca-audit [--list] [--scenario ID] [--out path.jsonl]
                          [--self-test] [--self-test-full] [--strict]

        Drives real SimulationSession beats with scripted actions and emits JSONL
        samples of ANCA-relevant wire state plus R/T heard since the last sample.

          ./bin/anca-audit --scenario rapier-guns | node tools/anca-audit/format.mjs
          ./bin/anca-audit --self-test-full
          ./bin/anca-audit --strict   # full matrix; fail if required R/T missing
        """);
    Console.WriteLine();
    Console.WriteLine("Scenarios:");
    foreach (AuditScenario scenario in Scenarios.All) {
        Console.WriteLine($"  {scenario.Id,-24} {scenario.Title}");
    }
}

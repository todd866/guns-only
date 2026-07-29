using System.Globalization;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;

try {
    ExportOptions options = ExportOptions.Parse(args);
    if (options.ShowHelp) {
        Console.WriteLine(ExportOptions.Help);
        return 0;
    }

    var config = new CombatTrainingBatchConfig(
        FirstSeed: options.FirstSeed,
        EpisodeCount: options.EpisodeCount,
        MaximumSecondsPerEpisode: options.MaximumSeconds,
        ReferenceSkill: options.ReferenceSkill,
        BehaviorSkill: options.BehaviorSkill);
    PlannerTeacherBatch batch =
        SeededCombatBatchRunner.RunWithPlannerTeacherSamples(config);

    string fullPath = Path.GetFullPath(options.OutputPath);
    string? directory = Path.GetDirectoryName(fullPath);
    if (!string.IsNullOrEmpty(directory))
        Directory.CreateDirectory(directory);
    using (var writer = new StreamWriter(
        fullPath,
        append: false,
        new System.Text.UTF8Encoding(encoderShouldEmitUTF8Identifier: false))) {
        PlannerTeacherJsonLines.Write(writer, batch);
    }

    int eligible = batch.Episodes.Sum(episode =>
        episode.Samples.Count(sample => sample.IsTeacherEligible));
    Console.WriteLine(
        $"wrote {batch.SampleCount} samples ({eligible} full teacher choices) "
        + $"from {batch.Episodes.Count} episodes to {fullPath}");
    return 0;
} catch (Exception error) when (
    error is ArgumentException
    or FormatException
    or IOException
    or UnauthorizedAccessException) {
    Console.Error.WriteLine($"planner-teacher-export: {error.Message}");
    Console.Error.WriteLine("Use --help for usage.");
    return 2;
}

internal sealed record ExportOptions(
    string OutputPath,
    ulong FirstSeed,
    int EpisodeCount,
    double MaximumSeconds,
    PilotSkill ReferenceSkill,
    PilotSkill BehaviorSkill,
    bool ShowHelp) {

    public const string Help =
        """
        Export exact ReactiveBandit planner decisions for offline distillation.

        Usage:
          dotnet run --project tools/planner-teacher-export -- [options]

        Required:
          --output PATH            Destination .jsonl file.

        Options:
          --first-seed N           First deterministic seed (default: 1).
          --episodes N             Episode count (default: 64).
          --seconds N              Maximum seconds per episode (default: 25).
          --reference-skill NAME   novice|competent|veteran|ace|machine (default: veteran).
          --behavior-skill NAME    competent|veteran|ace|machine (default: ace).
          --help                    Show this text.
        """;

    public static ExportOptions Parse(IReadOnlyList<string> arguments) {
        string? output = null;
        ulong firstSeed = 1;
        int episodes = 64;
        double seconds = 25.0;
        PilotSkill reference = PilotSkill.Veteran;
        PilotSkill behavior = PilotSkill.Ace;
        bool help = false;

        for (int index = 0; index < arguments.Count; index++) {
            string argument = arguments[index];
            string NextValue() {
                if (++index >= arguments.Count)
                    throw new ArgumentException($"{argument} requires a value.");
                return arguments[index];
            }

            switch (argument) {
                case "--output":
                    output = NextValue();
                    break;
                case "--first-seed":
                    firstSeed = ulong.Parse(
                        NextValue(), NumberStyles.Integer, CultureInfo.InvariantCulture);
                    break;
                case "--episodes":
                    episodes = int.Parse(
                        NextValue(), NumberStyles.Integer, CultureInfo.InvariantCulture);
                    break;
                case "--seconds":
                    seconds = double.Parse(
                        NextValue(), NumberStyles.Float, CultureInfo.InvariantCulture);
                    break;
                case "--reference-skill":
                    reference = ParseSkill(NextValue());
                    break;
                case "--behavior-skill":
                    behavior = ParseSkill(NextValue());
                    break;
                case "--help":
                case "-h":
                    help = true;
                    break;
                default:
                    throw new ArgumentException($"Unknown argument: {argument}");
            }
        }

        if (help)
            return new ExportOptions("", firstSeed, episodes, seconds,
                reference, behavior, ShowHelp: true);
        if (string.IsNullOrWhiteSpace(output))
            throw new ArgumentException("--output is required.");
        if (episodes is < 1 or > 10_000)
            throw new ArgumentOutOfRangeException(
                nameof(arguments), "--episodes must be between 1 and 10000.");
        if (!double.IsFinite(seconds)
            || seconds <= 0.0
            || seconds > SeededCombatBatchRunner.MaximumSupportedEpisodeSeconds)
            throw new ArgumentOutOfRangeException(
                nameof(arguments),
                $"--seconds must be in (0, "
                + $"{SeededCombatBatchRunner.MaximumSupportedEpisodeSeconds}].");
        if (BanditSkillProfile.For(behavior).LookaheadHorizonTicks <= 0)
            throw new ArgumentException(
                "--behavior-skill must use the nine-candidate lookahead planner.");
        return new ExportOptions(
            output, firstSeed, episodes, seconds, reference, behavior, help);
    }

    static PilotSkill ParseSkill(string value) =>
        value.ToLowerInvariant() switch {
            "novice" => PilotSkill.Novice,
            "competent" => PilotSkill.Competent,
            "veteran" => PilotSkill.Veteran,
            "ace" => PilotSkill.Ace,
            "machine" => PilotSkill.Machine,
            _ => throw new ArgumentException($"Unknown pilot skill: {value}")
        };
}

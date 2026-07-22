namespace GunsOnly.Sim.Training;

/// <summary>
/// Strict append-only episode recorder. It rejects gaps, forks, post-terminal writes, and invalid
/// terminal labels at the boundary where quiet dataset corruption would otherwise begin.
/// </summary>
public sealed class CombatTransitionRecorder {
    readonly List<CombatTransition> _transitions = new();
    readonly System.Collections.ObjectModel.ReadOnlyCollection<CombatTransition>
        _transitionView;
    readonly CombatRewardWeights _rewardWeights;
    bool _terminalRecorded;
    CombatTerminalReason _terminalReason;

    public CombatTransitionRecorder(int episodeIndex, string scenarioId, ulong seed,
        CombatRewardWeights? rewardWeights = null) {
        if (episodeIndex < 0) throw new ArgumentOutOfRangeException(nameof(episodeIndex));
        if (string.IsNullOrWhiteSpace(scenarioId))
            throw new ArgumentException("A scenario id is required.", nameof(scenarioId));
        EpisodeIndex = episodeIndex;
        ScenarioId = scenarioId;
        Seed = seed;
        _rewardWeights = rewardWeights ?? CombatRewardWeights.Default;
        if (!_rewardWeights.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(rewardWeights));
        _transitionView = _transitions.AsReadOnly();
    }

    public int EpisodeIndex { get; }
    public string ScenarioId { get; }
    public ulong Seed { get; }
    public int Count => _transitions.Count;
    public bool IsComplete => _terminalRecorded;
    public IReadOnlyList<CombatTransition> Transitions => _transitionView;

    public CombatTransition Append(
        in CombatPolicyObservation observation,
        in CombatAction action,
        in CombatRewardComponents rewardComponents,
        in CombatPolicyObservation nextObservation,
        CombatTerminalReason terminalReason = CombatTerminalReason.None) {
        if (_terminalRecorded)
            throw new InvalidOperationException("A terminal episode cannot accept another transition.");
        if (!observation.IsFinite || !nextObservation.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (!action.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(action));
        if (!rewardComponents.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(rewardComponents));
        if (nextObservation.Tick <= observation.Tick
            || nextObservation.ElapsedSeconds <= observation.ElapsedSeconds)
            throw new InvalidOperationException(
                "The next observation must have strictly newer simulation authority.");
        double authoritativeSpan = nextObservation.ElapsedSeconds
            - observation.ElapsedSeconds;
        double spanTolerance = System.Math.Max(1e-12,
            System.Math.Abs(nextObservation.ElapsedSeconds) * 1e-12);
        if (System.Math.Abs(rewardComponents.ElapsedSeconds - authoritativeSpan)
                > spanTolerance
            || rewardComponents.FiringEnvelopeSeconds
                > rewardComponents.ElapsedSeconds + spanTolerance)
            throw new InvalidOperationException(
                "Reward durations must agree with the observation authority span.");
        if (_transitions.Count > 0
            && _transitions[^1].NextObservation != observation)
            throw new InvalidOperationException(
                "Transitions must form one contiguous observation chain.");

        bool terminal = terminalReason != CombatTerminalReason.None;
        bool terminalFactsMatch = terminalReason switch {
            CombatTerminalReason.None => !rewardComponents.OpponentDestroyed
                && !rewardComponents.OwnshipDestroyed,
            CombatTerminalReason.OpponentDestroyed =>
                rewardComponents.OpponentDestroyed
                && !rewardComponents.OwnshipDestroyed,
            CombatTerminalReason.OwnshipDestroyed =>
                !rewardComponents.OpponentDestroyed
                && rewardComponents.OwnshipDestroyed,
            CombatTerminalReason.MutualDestruction =>
                rewardComponents.OpponentDestroyed
                && rewardComponents.OwnshipDestroyed,
            CombatTerminalReason.TimeLimit => !rewardComponents.OpponentDestroyed
                && !rewardComponents.OwnshipDestroyed,
            _ => false
        };
        if (!terminalFactsMatch)
            throw new InvalidOperationException(
                "Terminal reason and destruction reward facts must agree.");
        double reward = CombatRewardModel.Score(rewardComponents, _rewardWeights);
        if (!double.IsFinite(reward))
            throw new InvalidOperationException("The scalar reward must remain finite.");
        var transition = new CombatTransition(
            _transitions.Count,
            observation,
            action,
            reward,
            rewardComponents,
            nextObservation,
            terminal,
            terminalReason);
        _transitions.Add(transition);
        if (terminal) {
            _terminalRecorded = true;
            _terminalReason = terminalReason;
        }
        return transition;
    }

    public CombatEpisode Freeze() {
        if (!_terminalRecorded)
            throw new InvalidOperationException(
                "An episode is not complete until it has one terminal transition.");
        return new CombatEpisode(
            EpisodeIndex,
            ScenarioId,
            Seed,
            _terminalReason,
            Array.AsReadOnly(_transitions.ToArray()));
    }
}

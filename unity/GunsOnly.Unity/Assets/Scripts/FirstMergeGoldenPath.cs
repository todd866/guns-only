#nullable enable
using System;

namespace GunsOnly.UnityBridge {

public readonly struct FirstMergeGoldenPathCue {
    public FirstMergeGoldenPathCue(string id, string text) {
        Id = id;
        Text = text;
    }

    public string Id { get; }
    public string Text { get; }
}

/// <summary>
/// Pure, renderer-neutral first-success guidance. Every transition comes from host authority or
/// an actual held control; no elapsed-time tutorial state can drift between Web and Unity.
/// </summary>
public static class FirstMergeGoldenPath {
    public static readonly FirstMergeGoldenPathCue AcquirePadlock =
        new FirstMergeGoldenPathCue("acquire-padlock", "V · PADLOCK TARGET");
    public static readonly FirstMergeGoldenPathCue FireGuns =
        new FirstMergeGoldenPathCue("fire-guns", "HOLD F · GUNS");

    public static FirstMergeGoldenPathCue? Resolve(
        string? lifecycle,
        bool opponentPresent,
        bool weaponsHold,
        bool padlockSelected,
        bool gunSolution,
        int playerHits,
        bool triggerHeld) {
        if (!string.Equals(lifecycle, "Active", StringComparison.OrdinalIgnoreCase)
            || !opponentPresent
            || weaponsHold
            || playerHits > 0
            || triggerHeld) {
            return null;
        }

        if (!padlockSelected) return AcquirePadlock;
        return gunSolution ? FireGuns : (FirstMergeGoldenPathCue?)null;
    }
}

}

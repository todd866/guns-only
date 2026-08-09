using System;

namespace GunsOnly.UnityBridge {

public readonly struct CobraGoldenPathCue {
    public CobraGoldenPathCue(string id, string text) {
        Id = id;
        Text = text;
    }

    public string Id { get; }
    public string Text { get; }
}

public readonly struct CobraGoldenPathState {
    public CobraGoldenPathState(
        string lifecycle,
        double collective01,
        bool targetSelected,
        string gunStatus,
        double victoryHoldProgress) {
        Lifecycle = lifecycle;
        Collective01 = collective01;
        TargetSelected = targetSelected;
        GunStatus = gunStatus;
        VictoryHoldProgress = victoryHoldProgress;
    }

    public string Lifecycle { get; }
    public double Collective01 { get; }
    public bool TargetSelected { get; }
    public string GunStatus { get; }
    public double VictoryHoldProgress { get; }
}

/// <summary>
/// First-success guidance for Hold the Bridge. Conditions come only from host-owned mission
/// state; the small amount of memory makes each cue retire after the authoritative action rather
/// than returning later as a persistent tutorial.
/// </summary>
public sealed class CobraGoldenPathTracker {
    // River Gorge starts at the AH-1G's ~0.59 hover trim. A deliberate W pull clears this before
    // the helicopter has translated far enough for a presentation-derived altitude guess.
    public const double LiftCompleteCollective01 = 0.64;
    public const int CycleTargetInputCode = 1001;

    public static readonly CobraGoldenPathCue Lift =
        new("lift", "HOLD W — COLLECTIVE UP");
    public static readonly CobraGoldenPathCue AcquireTarget =
        new("acquire-target", "TAB TO TARGET · HOLD F TO ENGAGE");
    public static readonly CobraGoldenPathCue Fire =
        new("fire", "HOLD F · GUNS");

    bool _liftComplete;
    bool _engagementComplete;

    public CobraGoldenPathCue? Advance(CobraGoldenPathState state) {
        if (!string.Equals(state.Lifecycle, "Active", StringComparison.OrdinalIgnoreCase))
            return null;

        string gun = (state.GunStatus ?? string.Empty).Trim().ToLowerInvariant();
        if (gun == "firing" || state.VictoryHoldProgress > 0.0) {
            _liftComplete = true;
            _engagementComplete = true;
            return null;
        }
        if (gun == "dry")
            return null;

        if (state.Collective01 >= LiftCompleteCollective01)
            _liftComplete = true;

        if (!_liftComplete)
            return Lift;
        if (_engagementComplete)
            return null;
        if (!state.TargetSelected)
            return AcquireTarget;
        return gun == "tracking" ? Fire : null;
    }
}

}

#nullable enable
using System;

namespace GunsOnly.UnityBridge {

public readonly struct RapierGoldenPathCue {
    public RapierGoldenPathCue(string id, string text, bool actionable) {
        Id = id;
        Text = text;
        Actionable = actionable;
    }

    public string Id { get; }
    public string Text { get; }
    public bool Actionable { get; }
}

/// <summary>
/// Renderer-neutral Rapier mode line. Integer phase codes are the wire values of the sim enum;
/// this shared Unity source intentionally has no simulation assembly dependency.
/// </summary>
public static class RapierGoldenPath {
    const int Unavailable = 0;
    const int Launch = 1;
    const int Climb = 2;
    const int Accelerate = 3;
    const int RamClimb = 4;
    const int ZoomPull = 5;
    const int ZoomCoast = 6;
    const int ReenterAlign = 7;
    const int DipRelight = 8;
    const int Intercept = 9;
    const int Attack = 10;
    const int Escape = 11;
    const int ReturnToBase = 12;
    const int Recovery = 13;
    const int Complete = 14;

    public static RapierGoldenPathCue? Resolve(
        int phaseCode,
        bool automationEnabled,
        bool automationActive,
        string? circuitLeg,
        int recoveryGate,
        string? jobToken,
        int dronesRemaining,
        bool triggerHeld) {
        if (phaseCode < Unavailable || phaseCode > Complete || phaseCode == Unavailable)
            return null;

        string authority = automationActive
            ? "AUTO"
            : automationEnabled ? "AUTO STBY" : "PILOT";
        if (phaseCode == Complete)
            return new RapierGoldenPathCue("complete", "MISSION COMPLETE", false);

        if (phaseCode == Attack && !triggerHeld) {
            string job = (jobToken ?? string.Empty).Trim().ToUpperInvariant();
            string action = job == "TRANSPORT" || job == "BALLOON"
                ? "HOLD F · GUNS"
                : "HOLD F · RELEASE SWARM · " + Math.Max(0, dronesRemaining);
            return new RapierGoldenPathCue("attack-action", action, true);
        }

        if (phaseCode == Recovery) {
            string leg = NormalizeLeg(circuitLeg);
            string gate = recoveryGate > 0 ? "GATE " + recoveryGate + "/4" : string.Empty;
            string detail = leg.Length > 0 && gate.Length > 0
                ? leg + " · " + gate
                : leg.Length > 0 ? leg : gate;
            return new RapierGoldenPathCue(
                "recovery",
                detail.Length > 0 ? authority + " · " + detail : authority + " · RECOVERY",
                false);
        }

        return new RapierGoldenPathCue(
            "phase",
            authority + " · " + PhaseLabel(phaseCode),
            false);
    }

    static string PhaseLabel(int phaseCode) {
        switch (phaseCode) {
            case Launch: return "LAUNCH";
            case Climb: return "CLIMB";
            case Accelerate: return "ACCEL";
            case RamClimb: return "RAM CLIMB";
            case ZoomPull: return "ZOOM PULL";
            case ZoomCoast: return "ZOOM COAST";
            case ReenterAlign: return "REENTER";
            case DipRelight: return "DIP RELIGHT";
            case Intercept: return "INTERCEPT";
            case Attack: return "ATTACK";
            case Escape: return "EGRESS · HOME";
            case ReturnToBase: return "RETURN · HOME";
            case Recovery: return "RECOVERY";
            case Complete: return "COMPLETE";
            default: return "MISSION";
        }
    }

    static string NormalizeLeg(string? circuitLeg) =>
        (circuitLeg ?? string.Empty).Trim().ToUpperInvariant().Replace('_', ' ');
}

}

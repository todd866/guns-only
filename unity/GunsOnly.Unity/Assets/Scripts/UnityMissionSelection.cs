using System;

namespace GunsOnly.UnityBridge {

/// <summary>
/// Shared command-line contract for the Unity player and its simulation sidecar. Cobra remains
/// the default so existing launchers and parity automation keep their current behaviour.
/// </summary>
public enum UnityMissionKind {
    Cobra,
    FirstMerge,
    Rapier,
    WeekendRide,
}

public static class UnityMissionSelection {
    public const string CobraArgument = "cobra";
    public const string FirstMergeArgument = "first-merge";
    public const string RapierArgument = "rapier";
    public const string WeekendRideArgument = "weekend-ride";
    public const string CobraMissionPack = "cobra-vietnam";
    public const string FirstMergeMissionPack = "korea-1950s";
    public const string RapierMissionPack = "ukraine-modern";
    public const string WeekendRideMissionPack = "weekend-ride";
    public const string WeekendRouteSchema = "guns-only.weekend-route.v1";
    public const string WeekendCircuitId = "weekend-track-day.closed-circuit.v1";

    const int ThrottleUp = 6;
    const int ThrottleDown = 7;

    public static UnityMissionKind FromCommandLine(string[] args) {
        if (args == null) return UnityMissionKind.Cobra;

        UnityMissionKind selected = UnityMissionKind.Cobra;
        bool explicitlySelected = false;
        for (int index = 0; index < args.Length; index++) {
            string arg = args[index] ?? "";
            string value = "";
            bool foundSelection = false;
            if (arg.Equals("--mission", StringComparison.OrdinalIgnoreCase)
                || arg.Equals("-mission", StringComparison.OrdinalIgnoreCase)) {
                if (index + 1 >= args.Length || string.IsNullOrWhiteSpace(args[index + 1])) {
                    throw new ArgumentException(
                        arg + " requires cobra, first-merge, rapier, or weekend-ride");
                }
                value = args[++index];
                foundSelection = true;
            } else if (arg.StartsWith("--mission=", StringComparison.OrdinalIgnoreCase)) {
                value = arg.Substring("--mission=".Length);
                foundSelection = true;
            } else if (arg.StartsWith("-gunsOnlyMission=", StringComparison.OrdinalIgnoreCase)) {
                value = arg.Substring("-gunsOnlyMission=".Length);
                foundSelection = true;
            }

            if (!foundSelection) continue;
            UnityMissionKind parsed = FromName(value);
            if (explicitlySelected && parsed != selected) {
                throw new ArgumentException("conflicting Unity mission selections");
            }
            selected = parsed;
            explicitlySelected = true;
        }
        return selected;
    }

    public static UnityMissionKind FromName(string value) {
        string normal = (value ?? "").Trim().ToLowerInvariant();
        switch (normal) {
            case "cobra":
            case "cobra-vietnam":
            case "river-gorge":
                return UnityMissionKind.Cobra;
            case "first-merge":
            case "first_merge":
            case "f22":
            case "modern-visual-merge":
                return UnityMissionKind.FirstMerge;
            case "rapier":
            case "ukraine-modern":
            case "rapier-balloon-intercept":
            case "beat-12":
                return UnityMissionKind.Rapier;
            case "weekend":
            case "weekend-ride":
            case "weekend_ride":
            case "r1":
            case "track-day":
                return UnityMissionKind.WeekendRide;
            default:
                throw new ArgumentException(
                    "unknown Unity mission '" + value
                    + "' (expected cobra, first-merge, rapier, or weekend-ride)");
        }
    }

    public static string Argument(UnityMissionKind mission) {
        switch (mission) {
            case UnityMissionKind.Cobra:
                return CobraArgument;
            case UnityMissionKind.FirstMerge:
                return FirstMergeArgument;
            case UnityMissionKind.Rapier:
                return RapierArgument;
            case UnityMissionKind.WeekendRide:
                return WeekendRideArgument;
            default:
                throw new ArgumentOutOfRangeException(nameof(mission), mission, null);
        }
    }

    public static string ExpectedMissionPack(UnityMissionKind mission) {
        switch (mission) {
            case UnityMissionKind.Cobra:
                return CobraMissionPack;
            case UnityMissionKind.FirstMerge:
                return FirstMergeMissionPack;
            case UnityMissionKind.Rapier:
                return RapierMissionPack;
            case UnityMissionKind.WeekendRide:
                return WeekendRideMissionPack;
            default:
                throw new ArgumentOutOfRangeException(nameof(mission), mission, null);
        }
    }

    public static bool MatchesMissionPack(UnityMissionKind mission, string missionPack) =>
        string.Equals(
            ExpectedMissionPack(mission),
            missionPack ?? "",
            StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Maps the physical W/S pair without changing GKey authority: fixed-wing W advances the
    /// throttle, while Cobra W pushes the collective away from the pilot (decrease).
    /// </summary>
    public static int ThrottleKeyForPhysicalInput(UnityMissionKind mission, bool wKey) {
        switch (mission) {
            case UnityMissionKind.Cobra:
                return wKey ? ThrottleDown : ThrottleUp;
            case UnityMissionKind.FirstMerge:
            case UnityMissionKind.Rapier:
            case UnityMissionKind.WeekendRide:
                return wKey ? ThrottleUp : ThrottleDown;
            default:
                throw new ArgumentOutOfRangeException(nameof(mission), mission, null);
        }
    }
}

}

namespace GunsOnly.Sim;

public enum MissionIntention {
    SurviveAviate = 0,
    ReachFightGeometry = 1,
    Employ = 2,
    Separate = 3,
    Recover = 4,
}

public enum ReachFightStrategy {
    None = 0,
    ClimbBuild = 1,
    LevelDash = 2,
    ZoomLob = 3,
    DirectJoin = 4,
}

public readonly record struct ReachFightDecision(
    MissionIntention Intention,
    ReachFightStrategy Strategy,
    RapierMissionPhase SuggestedPhase,
    string PhaseReason);

/// <summary>
/// Extracts the authored pre-attack reach-fight ladder from <see cref="RapierMissionDirector"/>.
/// Zoom-lob sub-phase transitions remain in the mission director, which owns the flight-state
/// inputs and skip progression required by <c>UpdateZoomLobPhase</c>.
/// </summary>
public sealed class ReachFightDirector {
    public const double ClimbTopM = 56_000.0 * 0.3048;
    public const double CruiseAltitudeM = 70_000.0 * 0.3048;
    public const double AttackRangeM = 30_000.0;
    public const double AccelMach = 2.2;
    public const double SoftEmployMach = 0.9;

    public ReachFightDecision Decide(
        RapierMissionPhase currentPhase,
        double altitudeM,
        double mach,
        double qPa,
        double gammaRad,
        double contactRangeM,
        double fuelLb,
        double reserveFuelLb,
        bool zoomLobPreferred,
        int lobSkip,
        bool inZoomPhases) {
        if (contactRangeM <= AttackRangeM
            && (!zoomLobPreferred
                || (int)currentPhase >= (int)RapierMissionPhase.DipRelight)) {
            return new(MissionIntention.Employ, ReachFightStrategy.None,
                RapierMissionPhase.Attack, "contact_leq_30km");
        }

        if (altitudeM < ClimbTopM - 40.0
            && (int)currentPhase <= (int)RapierMissionPhase.Climb) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.Climb, "climb_to_fl560");
        }

        if (mach < AccelMach
            && (int)currentPhase <= (int)RapierMissionPhase.Accelerate) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.Accelerate, "accel_to_m2.2");
        }

        if (altitudeM < CruiseAltitudeM - 200.0
            && (int)currentPhase <= (int)RapierMissionPhase.RamClimb
            && !inZoomPhases) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.RamClimb, "ram_climb_to_fl700");
        }

        if (zoomLobPreferred || inZoomPhases) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ZoomLob,
                inZoomPhases ? currentPhase : RapierMissionPhase.ZoomPull,
                inZoomPhases ? "" : "zoom_pull_entry");
        }

        return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.LevelDash,
            RapierMissionPhase.Intercept, "intercept_dash");
    }

    public static string Token(MissionIntention intention) => intention switch {
        MissionIntention.ReachFightGeometry => "reach_fight",
        MissionIntention.Employ => "employ",
        _ => ""
    };

    public static string Token(ReachFightStrategy strategy) => strategy switch {
        ReachFightStrategy.ClimbBuild => "climb_build",
        ReachFightStrategy.LevelDash => "level_dash",
        ReachFightStrategy.ZoomLob => "zoom_lob",
        ReachFightStrategy.DirectJoin => "direct_join",
        _ => ""
    };
}

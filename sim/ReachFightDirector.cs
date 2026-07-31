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
    /// The transonic acceleration shelf, and the single source of truth for it: RapierMission
    /// used to keep its own copy, and when this one said FL560 while that one commanded FL400 the
    /// director held the aircraft in Climb past the shelf, so Accelerate was skipped entirely.
    ///
    /// FL560 was authored against an 84 kN core. On the honest 50 kN core FL560 is the ceiling at
    /// M0.9 -- the climb asymptoted at FL554/M0.84 and never armed the next phase. FL400 is where
    /// the drag rise is actually cheap to punch through (M1.2 in 27 s versus 185 s at FL560) and
    /// is where a real TBCC accelerates before climbing on ram.
    public const double ClimbTopM = 40_000.0 * 0.3048;
    public const double CruiseAltitudeM = 70_000.0 * 0.3048;
    public const double AttackRangeM = 30_000.0;
    public const double AccelMach = 2.2;
    public const double LevelDashMinAltM = ClimbTopM;
    public const double LevelDashMinMach = 2.2;
    public const double DirectJoinMinMach = 2.0;
    /// <summary>
    /// Soft floor for Employ handoff. Below this, stay on ReachFight even inside 30 km
    /// (dead-slow / parking). ~M0.85 covers reactive Attack cards at low altitude (~285 m/s
    /// near 3 km); the dead-slow unit test pins rejection at M0.80.
    /// </summary>
    public const double SoftEmployMach = 0.85;
    public const double StrategySwitchMargin = 15.0;
    public const double ScoredZoomLobMinRangeM = 90_000.0;
    public const double ScoredZoomLobMaxRangeM = 250_000.0;
    public const double LevelDashScoreRangeCapM = 200_000.0;

    ReachFightStrategy? _incumbentStrategy;

    static bool ScoredZoomLobEligible(double contactRangeM, double mach) =>
        mach >= LevelDashMinMach
        && contactRangeM > ScoredZoomLobMinRangeM
        && contactRangeM <= ScoredZoomLobMaxRangeM;

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
        bool employHandoff = contactRangeM <= AttackRangeM
            && mach >= SoftEmployMach;
        if (employHandoff) {
            _incumbentStrategy = null;
            return new(MissionIntention.Employ, ReachFightStrategy.None,
                RapierMissionPhase.Attack, "contact_leq_30km");
        }

        bool needsClimbTop = altitudeM < ClimbTopM - 40.0
            && (int)currentPhase <= (int)RapierMissionPhase.Climb;
        if (needsClimbTop) {
            _incumbentStrategy = null;
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.Climb, "climb_to_shelf");
        }

        bool needsAccel = mach < AccelMach
            && (int)currentPhase <= (int)RapierMissionPhase.Accelerate;
        if (needsAccel) {
            _incumbentStrategy = null;
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.Accelerate, "accel_to_m2.2");
        }

        bool levelDashEligible = mach >= LevelDashMinMach
            && altitudeM >= LevelDashMinAltM - 40.0;
        bool zoomLobEligible = ScoredZoomLobEligible(contactRangeM, mach);
        bool directJoinEligible = levelDashEligible
            || currentPhase is RapierMissionPhase.Intercept
                or RapierMissionPhase.Attack
            || inZoomPhases && currentPhase >= RapierMissionPhase.DipRelight;

        if (zoomLobPreferred || inZoomPhases) {
            _incumbentStrategy = ReachFightStrategy.ZoomLob;
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ZoomLob,
                inZoomPhases ? currentPhase : RapierMissionPhase.ZoomPull,
                inZoomPhases ? "" : "zoom_pull_entry");
        }

        ReachFightStrategy bestStrategy = ReachFightStrategy.ClimbBuild;
        double bestScore = double.NegativeInfinity;
        if (levelDashEligible) {
            double score = ScoreLevelDash(contactRangeM, mach, fuelLb, reserveFuelLb);
            if (score > bestScore) {
                bestScore = score;
                bestStrategy = ReachFightStrategy.LevelDash;
            }
        }

        if (zoomLobEligible) {
            double score = ScoreZoomLob(contactRangeM, mach, fuelLb, reserveFuelLb, lobSkip);
            if (score > bestScore) {
                bestScore = score;
                bestStrategy = ReachFightStrategy.ZoomLob;
            }
        }

        if (directJoinEligible) {
            double score = ScoreDirectJoin(contactRangeM, mach, fuelLb, reserveFuelLb);
            if (score > bestScore) {
                bestScore = score;
                bestStrategy = ReachFightStrategy.DirectJoin;
            }
        }

        ReachFightStrategy chosen = bestStrategy;
        if (bestScore > double.NegativeInfinity
            && _incumbentStrategy is ReachFightStrategy incumbent) {
            double incumbentScore = ScoreForStrategy(
                incumbent, contactRangeM, mach, fuelLb, reserveFuelLb, lobSkip,
                levelDashEligible, zoomLobEligible, directJoinEligible);
            if (incumbentScore > double.NegativeInfinity
                && bestScore < incumbentScore + StrategySwitchMargin) {
                chosen = incumbent;
            }
        }

        if (bestScore <= double.NegativeInfinity) {
            _incumbentStrategy = null;
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
                RapierMissionPhase.RamClimb, "ram_climb_to_fl700");
        }

        _incumbentStrategy = chosen;

        if (chosen == ReachFightStrategy.LevelDash) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.LevelDash,
                RapierMissionPhase.Intercept, "intercept_dash");
        }

        if (chosen == ReachFightStrategy.DirectJoin) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.DirectJoin,
                RapierMissionPhase.Intercept, "direct_join");
        }

        if (chosen == ReachFightStrategy.ZoomLob) {
            return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ZoomLob,
                RapierMissionPhase.ZoomPull, "zoom_pull_entry");
        }

        return new(MissionIntention.ReachFightGeometry, ReachFightStrategy.ClimbBuild,
            RapierMissionPhase.RamClimb, "ram_climb_to_fl700");
    }

    static double ScoreLevelDash(
        double contactRangeM, double mach, double fuelLb, double reserveFuelLb) =>
        (LevelDashScoreRangeCapM - Math.Min(contactRangeM, LevelDashScoreRangeCapM)) / 1_000.0
        + (mach - 2.2) * 10.0
        + (fuelLb > reserveFuelLb ? 20.0 : -50.0);

    static double ScoreZoomLob(
        double contactRangeM, double mach, double fuelLb, double reserveFuelLb, int lobSkip) =>
        (ScoredZoomLobEligible(contactRangeM, mach) ? 80.0 : -40.0)
        + (mach >= 2.2 ? 30.0 : -100.0)
        + (fuelLb > reserveFuelLb + 200.0 ? 25.0 : -80.0)
        + (lobSkip >= 3 ? -100.0 : 0.0);

    static double ScoreDirectJoin(
        double contactRangeM, double mach, double fuelLb, double reserveFuelLb) =>
        contactRangeM <= 100_000.0 && mach >= DirectJoinMinMach
            ? 60.0 + (100_000.0 - contactRangeM) / 2_000.0
            : -100.0;

    static double ScoreForStrategy(
        ReachFightStrategy strategy,
        double contactRangeM,
        double mach,
        double fuelLb,
        double reserveFuelLb,
        int lobSkip,
        bool levelDashEligible,
        bool zoomLobEligible,
        bool directJoinEligible) => strategy switch {
        ReachFightStrategy.LevelDash when levelDashEligible =>
            ScoreLevelDash(contactRangeM, mach, fuelLb, reserveFuelLb),
        ReachFightStrategy.ZoomLob when zoomLobEligible =>
            ScoreZoomLob(contactRangeM, mach, fuelLb, reserveFuelLb, lobSkip),
        ReachFightStrategy.DirectJoin when directJoinEligible =>
            ScoreDirectJoin(contactRangeM, mach, fuelLb, reserveFuelLb),
        _ => double.NegativeInfinity,
    };

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

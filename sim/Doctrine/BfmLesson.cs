namespace GunsOnly.Sim.Doctrine;

/// Authored training geometry, not measured aircraft data. See f22-bfm-ladder.md.
public readonly record struct BfmLesson(
    int Index, string Id, bool Defensive, PilotSkill Skill, BanditMount Mount,
    double AlongM, double LateralM, double VerticalM, double AngleOffDeg,
    double ClosureMps, double SurviveSeconds) {
    public int Rung => Index < 6 ? Index / 2 : Index == 6 ? 2 : 3;
    public string Criterion => Index switch {
        1 => "Survive 12 s; defeat the close attack",
        3 => "Survive 20 s; force a close overshoot",
        5 => "Survive 30 s; reverse into a gun solution",
        7 => "Defeat the pair with guns",
        _ => "Gun kill",
    };
    public string Correction => Index switch {
        1 => "Break into him",
        3 => "Force the overshoot",
        5 => "Reverse into his six",
        _ => Index < 4 ? "Track the lead" : "Control closure",
    };
    public SpawnSpec Spawn(int engagement) => new(Skill, (engagement - 1)
        % System.Math.Max(1, BanditSkillProfile.For(Skill).DoctrineCount), false,
        $"BFM {Id}", Mount: Mount, FormationSize: Index == 7 ? 2 : 1,
        Sparring: Index is 0 or 2 or 4, LessonIndex: Index);
    public static BfmLesson Get(int index) => index switch {
        0 => new(0, "O1", false, PilotSkill.Competent, BanditMount.Baseline, 650, 45, 25, 0, -12, 0),
        1 => new(1, "D1", true, PilotSkill.Veteran, BanditMount.Baseline, -600, 20, -10, 0, 35, 12),
        2 => new(2, "O2", false, PilotSkill.Veteran, BanditMount.Baseline, 700, 60, 30, 5, -6, 0),
        3 => new(3, "D2", true, PilotSkill.Ace, BanditMount.Baseline, -800, 150, 60, 0, 20, 20),
        4 => new(4, "O3", false, PilotSkill.Ace, BanditMount.Baseline, 750, 75, 40, 10, 0, 0),
        5 => new(5, "D3", true, PilotSkill.Ace, BanditMount.Uprated, -1100, 400, 100, 0, 8, 30),
        6 => new(6, "N", false, PilotSkill.Ace, BanditMount.Baseline, 0, 0, 0, 180, 0, 0),
        7 => new(7, "A2", false, PilotSkill.Ace, BanditMount.Uprated, 0, 0, 0, 180, 0, 0),
        _ => throw new System.ArgumentOutOfRangeException(nameof(index)),
    };

    const double TerrainSpawnClearanceM = 600.0;
    const double InitialFlightPathM = 1600.0;

    public AircraftState Start(in AircraftState player, AircraftParams air,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null) {
        Vec3D forward = player.ForwardDir();
        Vec3D right = new(System.Math.Cos(player.Chi), 0, -System.Math.Sin(player.Chi));
        Vec3D position = player.Position + forward * AlongM + right * LateralM
            + new Vec3D(0, VerticalM, 0);
        Vec3D towardPlayer = player.Position - position;
        Vec3D initialHeading = Defensive
            ? new Vec3D(towardPlayer.X, 0.0, towardPlayer.Z).Normalized()
            : new Vec3D(System.Math.Sin(player.Chi + AngleOffDeg * System.Math.PI / 180.0),
                0.0, System.Math.Cos(player.Chi + AngleOffDeg * System.Math.PI / 180.0));
        position = TerrainAwarePosition(position, initialHeading, terrain);
        towardPlayer = player.Position - position;
        double chi = Defensive ? System.Math.Atan2(towardPlayer.X, towardPlayer.Z)
            : player.Chi + AngleOffDeg * System.Math.PI / 180;
        double gamma = Defensive ? System.Math.Asin(towardPlayer.Y / towardPlayer.Length) : player.Gamma;
        return new(position, System.Math.Max(80, player.Speed + ClosureMps), gamma, chi, 0, air.MassKg);
    }

    static Vec3D TerrainAwarePosition(in Vec3D authoredPosition, in Vec3D flightDirection,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain) {
        if (terrain is null) return authoredPosition;
        Vec3D pathEnd = authoredPosition + flightDirection * InitialFlightPathM;
        try {
            double clearance = GunsOnly.Sim.Environment.TerrainQueries.MinimumClearanceM(
                terrain, authoredPosition, pathEnd, maximumHorizontalStepM: 60.0);
            if (clearance >= TerrainSpawnClearanceM) return authoredPosition;
            return authoredPosition with { Y = authoredPosition.Y
                + TerrainSpawnClearanceM - clearance };
        } catch (ArgumentOutOfRangeException) {
            return authoredPosition;
        }
    }

}

/// A held geometric proof, independent of the AI's tactical state and of frame rate.
public sealed class DefensiveSuccessObserver {
    double _safeSeconds;
    double _deniedSeconds;
    bool _defeatedAttack;
    bool _attackSeen;
    public void Reset() { _safeSeconds = _deniedSeconds = 0; _defeatedAttack = _attackSeen = false; }
    public bool Step(in AircraftState player, in AircraftState bandit, bool gunSolution,
        bool alive, double elapsedSeconds, double requiredSeconds, double dt,
        int lessonIndex = 1, bool playerGunSolution = false) {
        Vec3D delta = bandit.Position - player.Position;
        double range = delta.Length;
        double alignment = player.ForwardDir().Dot(bandit.ForwardDir());
        // A real rear attack must precede the proof: no free graduation from an idle AI.
        bool rearAttack = range >= 120 && range <= 900
            && delta.Dot(player.ForwardDir()) < 0
            && bandit.ForwardDir().Dot(delta * (-1.0 / range)) > System.Math.Cos(10 * System.Math.PI / 180);
        if (alive && (gunSolution || rearAttack)) _attackSeen = true;
        bool overshot = delta.Dot(player.ForwardDir()) > 0 && range < 900;
        bool angleOff = alignment < System.Math.Cos(System.Math.PI / 4);
        bool geometry = lessonIndex switch {
            3 => overshot,
            5 => range < 900 && playerGunSolution,
            _ => overshot || angleOff,
        };
        bool safe = _attackSeen && alive && !gunSolution && range <= 1500 && geometry;
        _safeSeconds = safe ? _safeSeconds + dt : 0;
        _deniedSeconds = alive && !gunSolution ? _deniedSeconds + dt : 0;
        double proofSeconds = lessonIndex == 5 ? 0.5 : lessonIndex == 3 ? 1 : 3;
        if (_safeSeconds >= proofSeconds) _defeatedAttack = true;
        if (!alive) _defeatedAttack = false;
        return alive && elapsedSeconds >= requiredSeconds && _defeatedAttack && _deniedSeconds >= 3;
    }
}

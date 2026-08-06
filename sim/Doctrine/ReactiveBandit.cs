namespace GunsOnly.Sim.Doctrine;

/// A flyable bandit contract. Scripted beats ignore ownship; reactive beats receive the player's
/// belief-limited beginning-of-tick observation so both aircraft still advance on the same
/// deterministic time sample without exposing authoritative target internals to the policy.
public interface IBandit {
    AircraftState State { get; }
    Vec3D LiftDir { get; }
    GunsOnly.Sim.Turbulence.IWindField? Wind { get; set; }
    IAtmosphereModel Atmosphere { get; set; }
    double T { get; }
    bool CatastrophicallyDamaged { get; }
    /// True while this actor is deliberately setting the player up rather than fighting them.
    /// Default false: only the opening sparring pair ever answers otherwise.
    bool Presenting => false;
    /// Formation-level graduation. A co-operative opening ends for the whole pair the moment any
    /// member of it is fighting — the session propagates that here, so a presenting wingman can
    /// never be orphaned waiting for a gun funnel the player is spending on its leader. One-way
    /// and idempotent; the default is a no-op for actors that never present.
    void EndPresentation() { }
    bool WreckSettled { get; }
    ImpactSurface WreckSurface { get; }
    bool WreckSurfaceChangedThisStep { get; }
    /// Tactical trigger intent only. The session owns ammunition, cadence, projectiles, damage,
    /// and outcomes; an opponent controller cannot manufacture a hit.
    bool WantsToFire(in ActorObservation player);
    /// Irreversible combat-damage boundary. Subsequent Step calls still integrate the same entity,
    /// but through its failed engine and damaged aerodynamic state rather than its tactical law.
    void ApplyCatastrophicDamage(int handedness);
    /// `terrain` is what lets a downed opponent come to rest on the hillside under it instead of
    /// sliding for kilometres on an invisible plane pinned to the altitude it was hit at.
    void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null);
    void Step(in ActorObservation player, double dt);
}

/// Deterministic, intentionally conservative gun employment shared by scripted and reactive
/// opponents. It decides only whether the pilot holds the trigger; GunKill still resolves the
/// physical body-axis shot and swept target intersection.
public static class BanditFireControl {
    public const double MinimumRangeM = 120.0;
    public const double MaximumRangeM = 900.0;
    public const double MaximumNoseErrorRad = 3.0 * System.Math.PI / 180.0;
    public const double BurstSeconds = 0.35;
    public const double BurstCycleSeconds = 1.25;
    // The current armed reactive opponents use the GSh-301 surrogate (860 m/s); the Korea six-.50
    // profile is 870 m/s, close enough that the same belief-limited sight is honest for both. This
    // is fire-control prediction only. GunKill consumes the mission's actual GunProfile and remains
    // the projectile/hit authority.
    public const double ReferenceMuzzleVelocityMps = 860.0;
    public const double ReferenceMaximumFlightSeconds = 2.0;

    public static bool WantsToFire(in AircraftState own, in ActorObservation player,
        double engagementSeconds, double? noseErrorGateRad = null) {
        if (!double.IsFinite(engagementSeconds) || engagementSeconds < 0.0) return false;
        if (!InFiringEnvelope(own, player, noseErrorGateRad)) return false;

        double burstPhase = engagementSeconds % BurstCycleSeconds;
        return burstPhase < BurstSeconds;
    }

    /// <summary>Physical range/body-axis envelope, independent of the burst clock. The nose-error
    /// gate defaults to the historical 3 degrees; skill profiles may widen their own trigger
    /// discipline (rounds remain honest ballistics, so a wide-gate burst is tracer pressure and
    /// near misses, not free hits).</summary>
    public static bool InFiringEnvelope(in AircraftState own, in ActorObservation player,
        double? noseErrorGateRad = null) {
        var line = player.Position - own.Position;
        double range = line.Length;
        if (!double.IsFinite(range) || range < MinimumRangeM || range > MaximumRangeM)
            return false;

        return NoseErrorRad(own, player) <= (noseErrorGateRad ?? MaximumNoseErrorRad);
    }

    /// <summary>Angular error between the physical gun axis and the observed contact.</summary>
    public static double NoseErrorRad(in AircraftState own, in ActorObservation player) {
        var line = player.Position - own.Position;
        double range = line.Length;
        if (!double.IsFinite(range) || range < 1e-9) return 0.0;
        double dot = GunKill.GunDirection(own).Dot(line * (1.0 / range));
        return System.Math.Acos(System.Math.Clamp(dot, -1.0, 1.0));
    }

    /// <summary>A deterministic ballistic lead derived only from the observed contact
    /// position/velocity and ownship state.</summary>
    public static Vec3D LeadDirection(
        in AircraftState own, in ActorObservation player) {
        Vec3D relativePosition = player.Position - own.Position;
        double rangeM = relativePosition.Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-9)
            return GunKill.GunDirection(own);
        Vec3D relativeVelocity =
            player.VelocityVector() - own.VelocityVector();
        double timeOfFlight = System.Math.Clamp(
            rangeM / ReferenceMuzzleVelocityMps,
            0.0,
            ReferenceMaximumFlightSeconds);
        Vec3D required = relativePosition;
        for (int iteration = 0; iteration < 5; iteration++) {
            required = relativePosition
                + relativeVelocity * timeOfFlight
                + new Vec3D(0.0,
                    0.5 * GunKill.GravityMps2 * timeOfFlight * timeOfFlight,
                    0.0);
            timeOfFlight = System.Math.Clamp(
                required.Length / ReferenceMuzzleVelocityMps,
                0.0,
                ReferenceMaximumFlightSeconds);
        }
        return required.Normalized();
    }

    /// <summary>
    /// The world point the gun must be pointed AT for the rounds to arrive — the same ballistic
    /// solution <see cref="LeadDirection"/> expresses as a direction.
    ///
    /// Guidance MUST steer to this. It previously steered to a kinematic
    /// `player.Position + player.VelocityVector() * clamp(range/900, 0.35, 1.35)`, which uses the
    /// target's ABSOLUTE velocity, while fire control judged the shot against a lead built from
    /// RELATIVE velocity and true time of flight. The pilot therefore flew to one aim point and was
    /// scored against another: it parked its nose near the target, satisfied the wide body-axis
    /// gate, fired pressure bursts, and its actual ballistic solution was tens of degrees away.
    /// Measured on Build 100 — the Ace cleared its lead gate for 0.9 s out of 47.3 s in range and
    /// put 58 rounds into empty sky. One solution, shared, is the fix.
    /// </summary>
    public static Vec3D LeadPoint(in AircraftState own, in ActorObservation player) {
        double rangeM = (player.Position - own.Position).Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-9) return player.Position;
        return own.Position + LeadDirection(own, player) * rangeM;
    }

    /// <summary>Angular error between the physical gun axis and a deterministic ballistic lead
    /// derived only from the observed contact position/velocity and ownship state.</summary>
    public static double LeadNoseErrorRad(
        in AircraftState own, in ActorObservation player) {
        double dot = GunKill.GunDirection(own).Dot(
            LeadDirection(own, player));
        return System.Math.Acos(System.Math.Clamp(dot, -1.0, 1.0));
    }

    /// <summary>How much lead this shot actually REQUIRES: the angle between the line of sight to
    /// the contact and the ballistic solution. It is a property of the geometry, not of the
    /// shooter's tracking — near zero in a low-aspect tail chase, tens of degrees across a
    /// crossing turn — and it is what decides whether pointing at the target is the same thing as
    /// pointing at the solution.</summary>
    public static double RequiredLeadAngleRad(
        in AircraftState own, in ActorObservation player) {
        Vec3D line = player.Position - own.Position;
        double rangeM = line.Length;
        if (!double.IsFinite(rangeM) || rangeM < 1e-9) return 0.0;
        double dot = (line * (1.0 / rangeM)).Dot(LeadDirection(own, player));
        return System.Math.Acos(System.Math.Clamp(dot, -1.0, 1.0));
    }

    public static bool InLeadFiringEnvelope(
        in AircraftState own, in ActorObservation player, double leadErrorGateRad) {
        Vec3D line = player.Position - own.Position;
        double rangeM = line.Length;
        return double.IsFinite(rangeM)
            && rangeM >= MinimumRangeM
            && rangeM <= MaximumRangeM
            && LeadNoseErrorRad(own, player) <= leadErrorGateRad;
    }
}

/// Present is the co-operative opening tactic: a stable reference line the newcomer joins up on.
/// It is NOT a weak fighter — the bandit underneath stays whatever tier it was fielded at, per the
/// standing doctrine that the opening fight is the hardest one. It is simply not fighting yet.
/// One-way: once the player demonstrates a gun position the bandit graduates and never presents
/// again for that instance.
public enum BanditTactic { Acquire, Defend, Energy, Return, Present }

/// Deterministic, deliberately beatable BFM opponent. It owns a normal AircraftSim and supplies
/// only pilot controls: no kinematic shortcuts, wall clock, or random source enters the kernel.
public sealed class ReactiveBandit :
    IBandit,
    IBanditDecisionTraceSource,
    IFormationDirectiveSink,
    IAdaptiveAiPlanner {
    const double FloorM = 260.0;
    const double CeilingM = 3200.0;
    // Believable guns knife-fight ceiling (~37,700 ft). The per-fight ceiling may sit LOWER (it
    // tracks the merge altitude to preserve the low-level fight volume) but must never FLOAT above
    // this: a real gun dogfight does not climb into the stratosphere. It bounds both the merge spawn
    // altitude and the high-skill lookahead vertical, so the fight cannot ratchet up to FL600.
    const double CombatCeilingM = 11500.0;
    const double ReturnRadiusM = 5200.0;
    const double ThreatRangeM = 1500.0;
    /// Beyond this the bandit stops manoeuvring and turns back into the player, whatever else it
    /// was doing. This is a TRAINING opponent: it cannot kill anyone while it is pointing away, so
    /// past the range where BFM means anything there is exactly one correct move — convert back to
    /// a merge. It also bounds the worst case the player can be handed, which the fight-centre
    /// leash does not: that leash measures from the bandit's spawn, so a fight the player drags
    /// downrange can open indefinitely while both aircraft sit "inside the arena".
    const double ReengageRangeM = 3500.0;
    /// Past this the player has left, not extended, and the bandit holds its arena instead of
    /// tail-chasing across the theatre. Real telemetry made the case: a recorded sortie wanders to
    /// 346 NM on a return to base, and a re-engage rule written only in terms of "point at the
    /// player" followed it forever. 8 NM is comfortably outside any guns geometry while still
    /// well inside the ranges the corpus shows a live fight recovering from.
    const double AbandonChaseRangeM = 15_000.0;
    /// A fresh Bracket/Extend order may recover mutual support beyond the independent pilot's
    /// 8 NM abandon boundary, but it is not permission to follow a departing player forever.
    /// Twice the ordinary ceiling comfortably contains the reproduced 13 NM support gap while
    /// retaining a finite theatre guard for RTB/departure tracks.
    const double FormationSupportAbandonChaseRangeM = 2.0 * AbandonChaseRangeM;
    const double MergeSpawnClearanceM = 600.0;
    const double LowTargetClearanceM = 400.0;
    const double LowBlockCaptureClearanceM = 480.0;
    const double CompetentPerchClearanceM = 650.0;
    const double CompetentAttackSeconds = 8.0;
    const double TerrainRecoveryRollSeconds = 1.0;
    const double DefendSeconds = 3.4;
    const double DefendCooldownSeconds = 3.8;
    // Uneven timing, direction, and G make the break readable as a jink rather than an orbit.
    // This is a fixed deterministic sequence, advanced only while a real defensive threat exists.
    static readonly double[] JinkDurations = { 0.92, 0.63, 1.08, 0.77, 0.86 };
    static readonly int[] JinkDirections = { 1, 1, -1, 1, -1 };
    static readonly double[] JinkG = { 3.15, 2.70, 3.30, 2.85, 3.05 };

    readonly AircraftSim _sim;
    readonly AircraftParams _parameters;
    readonly Vec3D _fightCentre;
    readonly double _ceilingM;
    // Authoritative terrain, when the mission supplies one. Every floor number in this controller
    // is an offset above the LOCAL surface, not sea level; without terrain the surface is 0 and
    // the historical sea-level behaviour is reproduced exactly. Mutable because the session can
    // re-anchor the world origin mid-sortie (SetWorldOrigin): a bandit holding the previous
    // translation would silently sample the wrong ground.
    GunsOnly.Sim.Environment.ITerrainSurface? _terrain;
    readonly double _energyEntryMps;
    readonly double _energyExitMps;
    readonly double _lowSpeedMps;
    readonly double _highSpeedMps;
    readonly double _maximumThrottle;
    readonly double _defensivePower;
    double _defendUntil = double.NegativeInfinity;
    double _defendCooldownUntil = double.NegativeInfinity;
    double _nextJinkAt = double.PositiveInfinity;
    /// Latched state of the anti-camp ceiling denial. Latched rather than recomputed per tick
    /// because entry and exit need different thresholds — see SelectTactic.
    bool _ceilingDenial;
    int _jinkIndex;
    int _breakSign = 1;
    int _damageHandedness = 1;
    WreckContactMotion? _wreckMotion;
    readonly BanditSkillProfile _profile;
    readonly int _doctrine;
    bool _lowAttackActive;
    double _lowAttackEndAt = double.NegativeInfinity;
    double _lowAttackRecommitAt = double.NegativeInfinity;
    double _fireBurstUntil = double.NegativeInfinity;
    double _nextFireBurstAt = double.NegativeInfinity;
    bool _terrainRecoveryActive;

    // Lookahead decision cache. Rolling a small candidate set forward over the horizon every
    // tick is wasteful, so the choice is recomputed on a fixed deterministic cadence and held
    // between recomputes. The cadence counts real ticks (never wall-clock), keeping determinism.
    internal const int LookaheadDecisionCadenceTicks = 12; // ~0.1 s at 120 Hz
    PilotCommand _lookaheadCommand = new(1.0, 0.0, 0.85, 0.0);
    int _lookaheadHoldTicks;
    int? _absoluteLookaheadCadencePhase;
    long _lastAbsoluteLookaheadDecisionTick = long.MinValue;
    bool _lookaheadForceNextLane;
    long _selectionSequence;
    FormationDirective _formationDirective;
    AiComputeLevel _computeLevel = AiComputeLevel.Full;
    bool _incrementalAiPlanning;
    bool _lookaheadPlanPending;
    bool _lookaheadPlanUsesLowAttack;
    bool _lookaheadCommandUsesLowAttack;
    bool _lookaheadCommandValid = true;
    bool _lookaheadContextBound;
    long _lookaheadPlanContactIdentity;
    long _lookaheadCommandContactIdentity;
    readonly PilotCommand[] _lookaheadCandidates =
        new PilotCommand[BanditDecisionTrace.CandidateCapacity];
    readonly bool[] _lookaheadCandidateAvailable =
        new bool[BanditDecisionTrace.CandidateCapacity];
    readonly double[] _lookaheadCandidateScores =
        new double[BanditDecisionTrace.CandidateCapacity];
    readonly double[] _lookaheadDoctrineBiases =
        new double[BanditDecisionTrace.CandidateCapacity];
    readonly double[] _lookaheadTailBiases =
        new double[BanditDecisionTrace.CandidateCapacity];
    readonly double[] _lookaheadFormationBiases =
        new double[BanditDecisionTrace.CandidateCapacity];
    AircraftState _lookaheadPlanOwn;
    ActorObservation _lookaheadPlanPlayer;
    GunsOnly.Sim.Environment.ITerrainSurface? _lookaheadPlanTerrain;
    IAtmosphereModel? _lookaheadPlanAtmosphere;
    GunsOnly.Sim.Turbulence.IWindField? _lookaheadPlanWind;
    double _lookaheadPlanThrustFraction;
    bool _lookaheadPlanBossCommitted;
    int _lookaheadPlanPredictionSubstepTicks;
    int _lookaheadNextCandidateIndex;
    double _lookaheadBestScore;
    PilotCommand _lookaheadBestCommand;
    int _lookaheadBestIndex;
    long _plansStarted;
    long _plansCompleted;
    long _candidateEvaluations;
    long _forecastSteps;
    long _terrainSweeps;

    public PilotSkill Skill { get; }
    public AircraftParams AircraftParameters => _parameters;
    internal int? LookaheadCadencePhase => _absoluteLookaheadCadencePhase;
    public AiComputeLevel ComputeLevel => _computeLevel;
    public AiWorkloadCounters AiWorkload => new(
        _plansStarted,
        _plansCompleted,
        _candidateEvaluations,
        _forecastSteps,
        _terrainSweeps);

    public ReactiveBandit(AircraftState initial, AircraftParams parameters,
        PilotSkill skill = PilotSkill.Competent,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        int engagementNumber = 1, BanditSkillProfile? profile = null,
        int? doctrineIndex = null, bool presenting = false) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));
        Skill = skill;
        _profile = profile ?? BanditSkillProfile.For(skill);
        int doctrineCount = System.Math.Max(1, _profile.DoctrineCount);
        if (doctrineIndex is < 0 || doctrineIndex >= doctrineCount)
            throw new System.ArgumentOutOfRangeException(nameof(doctrineIndex));
        _doctrine = doctrineIndex ?? (engagementNumber - 1) % doctrineCount;
        // FORMATION MEMBERS MUST NOT THINK ON THE SAME TICK.
        //
        // The lookahead recomputes on a fixed 12-tick cadence and holds between recomputes, so a
        // whole 9-candidate rollout lands inside ONE tick. Every bandit used to start that counter
        // at zero, which put every member of a formation permanently in phase: a pair of Aces
        // therefore put both rollouts in the same tick, and production telemetry attributed 60.4 ms
        // of an average sub-36 fps frame to the kernel against 2.99 ms for everything else combined.
        // Measured natively over terrain with real relief, one Ace decision tick costs 24.1 ms and a
        // synchronised pair costs 44.6 ms — three frames of work inside one frame.
        //
        // Staggering the START of the counter changes WHICH tick each aircraft decides on and
        // nothing about how it decides: the rollout, its horizon and its result are untouched. The
        // multiplier is 5 rather than 1 because the session stages a wingman at engagementNumber + 1
        // (WingmanSpawnStride), and a one-tick separation still lands both inside a single rendered
        // frame at 60 fps, where the sim advances about two ticks per frame.
        Presenting = presenting;
        if (presenting) Tactic = BanditTactic.Present;
        _lookaheadHoldTicks = (engagementNumber - 1) * 5 % LookaheadDecisionCadenceTicks;
        _parameters = parameters;
        _terrain = terrain;
        _sim = new AircraftSim(initial, parameters);
        _fightCentre = initial.Position;
        // Scale the controller's energy gates from the staged fight speed. The original 180 m/s
        // reference reproduces the Sabre thresholds; a modern public-data surrogate no longer
        // chops power until it decelerates into a Korean-War speed band.
        double referenceSpeedMps = System.Math.Max(180.0, initial.Speed);
        _energyEntryMps = referenceSpeedMps * (112.0 / 180.0);
        _energyExitMps = referenceSpeedMps * (142.0 / 180.0);
        _lowSpeedMps = referenceSpeedMps * (145.0 / 180.0);
        _highSpeedMps = referenceSpeedMps * (205.0 / 180.0);
        _maximumThrottle = System.Math.Clamp(parameters.MaxThrustFraction, 0.0, 1.65);
        _defensivePower = System.Math.Min(_maximumThrottle,
            _maximumThrottle > 1.35 ? 1.35 : 1.05);
        // Preserve the original low-level fight volume while allowing a replacement fighter to meet a
        // higher ownship near its present altitude (for example, after the AWACS beat) -- but cap the
        // effective ceiling at the believable combat ceiling so it can never float into the
        // stratosphere and drag a knife-fight to FL600.
        //
        // 2,500 m of headroom, not 1,000 m. The old figure gave the modern merge a 13,478 ft cap
        // over 10,000 ft staging: less vertical than ONE honest manoeuvre. A high yo-yo or a
        // vertical reverse put the player over the anti-camp trigger at 14,626 ft, and the bandit
        // answered normal BFM by extending away as though the player were plinking from the
        // stratosphere. This is a CAP, not a target — the bandit is still pulled back down by
        // Return, whose aim point tracks _fightCentre (the merge altitude), so the fight continues
        // to live where the valleys are. It only means the bandit will follow the player up
        // through a vertical fight instead of declining it.
        _ceilingM = System.Math.Min(CombatCeilingM,
            System.Math.Max(CeilingM, initial.Position.Y + 2500.0));
    }

    /// Deterministically put a fresh fighter into a real offset, reciprocal merge. Engagement
    /// number replaces randomness: successive bogeys alternate sides and cycle modest variations
    /// in spacing/altitude while retaining fighting energy and a fair head-on presentation.
    public static ReactiveBandit SpawnForMerge(in AircraftState player,
        AircraftParams parameters, int engagementNumber,
        double speedMps = 180.0, PilotSkill skill = PilotSkill.Competent,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        BanditSkillProfile? profile = null, int? doctrineIndex = null,
        bool presenting = false, AircraftState? wingLead = null) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));
        if (!double.IsFinite(speedMps) || speedMps <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(speedMps));

        int variation = (engagementNumber - 1) % 3;
        double side = (engagementNumber & 1) == 1 ? 1.0 : -1.0;
        var forward = new Vec3D(System.Math.Sin(player.Chi), 0.0, System.Math.Cos(player.Chi));
        var right = new Vec3D(System.Math.Cos(player.Chi), 0.0, -System.Math.Sin(player.Chi));
        // The introduction opens INSIDE visual range. At the 3,716 m median firing range the
        // tapes recorded, an 11.3 m span subtends 0.17 deg — 1.1 px on a 390 px phone. There is
        // nothing to see, judge or lead, which is why 69% of visitor rounds were fired beyond the
        // gun's 2,060 m reach. At 1,000 m the contact is ~4 px and growing, and reads as an
        // aeroplane with an aspect. The join-up is the lesson; put them where seeing works.
        double alongM = presenting ? 1000.0 : 2200.0 + variation * 220.0;
        double offsetM = side * (560.0 + variation * 110.0);
        double altitudeOffsetM = variation switch { 0 => 120.0, 1 => -80.0, _ => 40.0 };
        // Keep the merge near ownship, but never spawn a fresh bandit above the believable combat
        // ceiling: if the player has climbed out of band, the successor still merges in-band so the
        // fight is drawn back down rather than staged in the stratosphere.
        double altitudeM = System.Math.Clamp(player.Position.Y + altitudeOffsetM,
            FloorM + 260.0, CombatCeilingM);
        var position = player.Position + forward * alongM + right * offsetM;
        // FIGHTING WING, NOT A SECOND HEAD-ON CONTACT.
        //
        // A formation wingman is positioned off its LEADER. Previously it was handed an
        // independent player-relative merge slot with a stepped engagement number, and because
        // `side` alternates with that number the pair arrived line-abreast on OPPOSITE sides of
        // the player: two separate contacts to be met head-on rather than one formation to split,
        // which is what StageWingmen's own comment says the pair is for. Owner, after flying it:
        // "dash-2 is way too close", "dash-2 should be behind dash-1", "not literally trail,
        // probably 45 degree offset".
        //
        // Equal aft and lateral components put dash-2 on the leader's 45 degree cone. It is
        // deliberately NOT welded trail: a wingman parked on the leader's tail has nowhere to
        // manoeuvre and dies to the same guns pass. The side term alternates so successive
        // wingmen of a multi-ship stack across the cone instead of on top of each other.
        if (wingLead is { } lead) {
            // MUST stay above FormationCoordination.ExtendPairSeparationM (850 m). That threshold
            // reads a tight pair as "too close" and assigns the support member Extend, whose
            // command is to fly 1600 m DIRECTLY AWAY from the player. Spawning a snug 760 m wing
            // therefore ordered dash-2 to leave on the first coordination tick — the owner's
            // "dash-2 just flies off into the sunset", manufactured at spawn. Bracket is the role
            // that wants angles on a player already committed against the leader, which is the
            // whole reason a second enemy exists.
            const double FightingWingRangeM = 1200.0;
            const double FortyFiveDegreeComponent = 0.70710678118654752;
            var leadForward = new Vec3D(
                System.Math.Sin(lead.Chi), 0.0, System.Math.Cos(lead.Chi));
            var leadRight = new Vec3D(
                System.Math.Cos(lead.Chi), 0.0, -System.Math.Sin(lead.Chi));
            double component = FightingWingRangeM * FortyFiveDegreeComponent;
            position = lead.Position
                - leadForward * component
                + leadRight * (side * component);
            // Step off the LEADER, not the player: the pair must read as one formation.
            altitudeM = System.Math.Clamp(lead.Position.Y + altitudeOffsetM,
                FloorM + 260.0, CombatCeilingM);
        }
        // A replacement that tracks a low-flying player must still merge with real room above the
        // actual ground under and ahead of it — a fresh fighter materialising 8 seconds from a
        // ridge it cannot out-turn is a spawn defect, not a fight. Sweep the whole early run-in
        // toward the merge at terrain resolution so a ridge BETWEEN two endpoint samples cannot
        // hide; fall back to endpoint sampling if the sweep leaves terrain truth bounds.
        var runInM = new Vec3D(position.X - forward.X * 1600.0, 0.0,
            position.Z - forward.Z * 1600.0);
        double surfaceM = System.Math.Max(
            SurfaceHeightM(terrain, position.X, position.Z),
            SurfaceHeightM(terrain, runInM.X, runInM.Z));
        if (terrain is not null) {
            try {
                double sweptClearanceM = GunsOnly.Sim.Environment.TerrainQueries
                    .MinimumClearanceM(terrain, position with { Y = 0.0 }, runInM,
                        maximumHorizontalStepM: 60.0);
                surfaceM = System.Math.Max(surfaceM,
                    System.Math.Max(0.0, -sweptClearanceM));
            } catch (System.ArgumentOutOfRangeException) {
                // Out-of-bounds run-in: keep the endpoint estimate.
            }
        }
        altitudeM = System.Math.Clamp(altitudeM,
            System.Math.Min(surfaceM + MergeSpawnClearanceM, CombatCeilingM),
            CombatCeilingM);
        position = position with { Y = altitudeM };

        // Aim slightly beyond ownship's current position. This is an offset head-on merge, not a
        // stationary target parked in the pipper, and the reactive pilot takes over immediately.
        var mergePoint = player.Position + forward * 420.0;
        var toMerge = mergePoint - position;
        double horizontalM = System.Math.Sqrt(toMerge.X * toMerge.X + toMerge.Z * toMerge.Z);
        double chi = System.Math.Atan2(toMerge.X, toMerge.Z);
        double gamma = System.Math.Atan2(toMerge.Y, System.Math.Max(1.0, horizontalM));
        var initial = new AircraftState(position, speedMps, gamma, chi, 0.0, parameters.MassKg);
        return new ReactiveBandit(
            initial, parameters, skill, terrain, engagementNumber, profile,
            doctrineIndex, presenting);
    }

    static double SurfaceHeightM(GunsOnly.Sim.Environment.ITerrainSurface? terrain,
        double x, double z) =>
        terrain is not null
            && terrain.TrySample(x, z, out GunsOnly.Sim.Environment.TerrainSample sample)
            && double.IsFinite(sample.HeightM)
            ? System.Math.Max(0.0, sample.HeightM) : 0.0;

    /// The controller's floor at a horizontal location: the historical sea-level floor raised by
    /// the real ground. Every avoidance offset in this file is measured above THIS, so over open
    /// water (or with no terrain supplied) behaviour is bit-identical to the legacy constants.
    double LocalFloorM(double x, double z) => FloorM + SurfaceHeightM(_terrain, x, z);

    readonly record struct LowAttackPlan(
        Vec3D AimPoint,
        double AvailableG);

    bool TrySurfaceHeightM(double x, double z, out double heightM) {
        if (_terrain is null) {
            heightM = 0.0;
            return true;
        }
        if (_terrain.TrySample(x, z,
            out GunsOnly.Sim.Environment.TerrainSample sample)
            && double.IsFinite(sample.HeightM)) {
            heightM = System.Math.Max(0.0, sample.HeightM);
            return true;
        }
        heightM = 0.0;
        return false;
    }

    bool IsLowTarget(in ActorObservation player) =>
        TrySurfaceHeightM(player.Position.X, player.Position.Z, out double surfaceM)
        && player.Position.Y - surfaceM <= LowTargetClearanceM;

    /// The G this aircraft can really produce now, bounded by both the skill profile and the
    /// kernel's aerodynamic/structural clamp at the current airspeed, mass, configuration, and
    /// atmosphere. Safety calculations reserve eighteen percent of the excess-over-1G authority;
    /// commands use the full honest bound and AircraftSim remains the final force authority.
    double AvailableAcquireG(bool safetyReserve) {
        var requested = new PilotCommand(_profile.MaxAcquireG, 0.0, 0.0, 0.0);
        var (_, aerodynamicMaxG, _) = FlightModel.ClampNz(
            State, requested, _parameters, _sim.AirspeedMps,
            _sim.EffectiveAerodynamicConfiguration, _sim.AtmosphereModel);
        double availableG = System.Math.Min(_profile.MaxAcquireG,
            System.Math.Max(0.0, aerodynamicMaxG));
        return safetyReserve
            ? 1.0 + System.Math.Max(0.0, availableG - 1.0) * 0.82
            : availableG;
    }

    /// Build the actual low-block attack corridor. The terminal point is raised by the pull-out
    /// height required at the G available NOW, then the entire descending segment is swept against
    /// terrain truth. A ridge between safe endpoints therefore vetoes the attack. Leaving terrain
    /// bounds is also a veto: absence of truth is never interpreted as flat ground.
    bool TryLowAttackPlan(in ActorObservation player, out LowAttackPlan plan) {
        plan = default;
        if (_profile.LowBlockDoctrine == LowBlockDoctrine.Conservative
            || T < _lowAttackRecommitAt
            || !IsLowTarget(player))
            return false;

        var own = State;
        double rangeM = (player.Position - own.Position).Length;
        // Outside the gun band, lead the moving valley runner to shape an intercept. Inside the
        // conversion gate, put the physical gun axis on the observed aircraft: BanditFireControl
        // (and the honest projectile model behind it) requires current-line firing geometry.
        double leadSeconds = rangeM <= 1200.0
            ? 0.0
            : System.Math.Clamp(rangeM / 900.0, 0.35, 1.35);
        var predictedTarget = player.Position + player.VelocityVector() * leadSeconds;
        if (!TrySurfaceHeightM(predictedTarget.X, predictedTarget.Z,
            out double targetSurfaceM))
            return false;

        double availableG = AvailableAcquireG(safetyReserve: true);
        if (availableG <= 1.05) return false;

        double horizontalM = HorizontalDistance(own.Position, predictedTarget);
        double desiredFloorM = _profile.LowBlockClearanceM;
        double baseAimY = System.Math.Max(predictedTarget.Y,
            targetSurfaceM + desiredFloorM);
        double aimY = baseAimY;
        double pullOutM = 0.0;
        double rollInM = 0.0;
        // Raising the endpoint shallows the descent and changes its pull-out height. A few fixed
        // iterations converge this tiny monotone calculation without state or timing dependence.
        for (int iteration = 0; iteration < 4; iteration++) {
            double pathDescentAngleRad = System.Math.Atan2(
                System.Math.Max(0.0, own.Position.Y - aimY),
                System.Math.Max(1.0, horizontalM));
            // A bandit already diving more steeply than the straight attack line must buy recovery
            // for its real flight-path angle, not the gentler geometry it hopes to establish.
            double descentAngleRad = System.Math.Max(pathDescentAngleRad,
                System.Math.Max(0.0, -own.Gamma));
            double radialAccelMps2 = (availableG - 1.0) * FlightModel.G0;
            pullOutM = own.Speed * own.Speed
                * (1.0 - System.Math.Cos(descentAngleRad))
                / System.Math.Max(radialAccelMps2, 0.1);
            // The lift vector cannot teleport upright. Reserve the terrain-relative distance
            // closed during one representative roll/reorientation second before max-G pull starts.
            rollInM = own.Speed * System.Math.Sin(descentAngleRad)
                * TerrainRecoveryRollSeconds;
            aimY = System.Math.Max(baseAimY,
                targetSurfaceM + desiredFloorM + pullOutM + rollInM + 15.0);
        }
        var aimPoint = predictedTarget with { Y = aimY };

        double minimumClearanceM;
        if (_terrain is null) {
            minimumClearanceM = System.Math.Min(own.Position.Y, aimPoint.Y);
        } else {
            try {
                minimumClearanceM = GunsOnly.Sim.Environment.TerrainQueries
                    .MinimumClearanceM(_terrain, own.Position, aimPoint,
                        maximumHorizontalStepM: 60.0);
            } catch (System.ArgumentOutOfRangeException) {
                return false;
            }
        }

        double requiredClearanceM = desiredFloorM + pullOutM + rollInM;
        if (minimumClearanceM < requiredClearanceM) return false;
        plan = new LowAttackPlan(aimPoint, availableG);
        return true;
    }

    /// Last-instance terrain check: does the trajectory over the next 2.5 seconds still leave
    /// room for a pull-out at the G this airframe can actually achieve? Clearance closure is
    /// measured TERRAIN-relative (surface sampled now, mid-horizon, and at the horizon along the
    /// current velocity), so level flight into rising ground registers exactly like a dive over
    /// flat ground — world vertical speed alone cannot see a ridge. Deterministic, belief-free,
    /// and cheap: three bilinear terrain samples.
    bool NeedsTerrainRecovery() {
        var own = State;
        var velocity = own.VelocityVector();
        double speed = System.Math.Max(own.Speed, 1.0);
        double clearanceHereM = own.Position.Y
            - SurfaceHeightM(_terrain, own.Position.X, own.Position.Z);
        var mid = own.Position + velocity * 1.25;
        var far = own.Position + velocity * 2.5;
        if (!TrySurfaceHeightM(own.Position.X, own.Position.Z, out double surfaceHereM)
            || !TrySurfaceHeightM(mid.X, mid.Z, out double surfaceMidM)
            || !TrySurfaceHeightM(far.X, far.Z, out double surfaceFarM))
            return true;
        clearanceHereM = own.Position.Y - surfaceHereM;
        double clearanceMidM = mid.Y - surfaceMidM;
        double clearanceFarM = far.Y - surfaceFarM;
        double worstAheadM = System.Math.Min(clearanceMidM, clearanceFarM);
        if (_terrain is not null) {
            try {
                worstAheadM = System.Math.Min(worstAheadM,
                    GunsOnly.Sim.Environment.TerrainQueries.MinimumClearanceM(
                        _terrain, own.Position, far, maximumHorizontalStepM: 60.0));
            } catch (System.ArgumentOutOfRangeException) {
                return true;
            }
        }
        // A low-altitude reflex, not a maneuvering governor: the straight-line projection is
        // deliberately pessimistic, which is right at the bottom of the sky and wrong about a
        // Split-S entered with a mile of air below. Above this band the lookahead scoring (and
        // the state machine's floor logic) own vertical judgement.
        if (System.Math.Min(clearanceHereM, worstAheadM) > 1500.0) return false;
        double closureMps = System.Math.Max(
            (clearanceHereM - clearanceMidM) / 1.25,
            (clearanceHereM - clearanceFarM) / 2.5);
        if (closureMps <= 0.0) return false;
        // Pull-out through the terrain-relative closure angle at the G actually available:
        // the profile's tactical limit, further bounded by what the wing can generate at this
        // airspeed — a slow bandit cannot buy its published G out of thin air.
        double sinGammaEff = System.Math.Clamp(closureMps / speed, 0.0, 1.0);
        double cosGammaEff = System.Math.Sqrt(1.0 - sinGammaEff * sinGammaEff);
        double usableG = AvailableAcquireG(safetyReserve: true);
        if (usableG <= 1.0) return true;
        double radialAccel = System.Math.Max((usableG - 1.0) * FlightModel.G0, 0.1);
        double pullOutM = speed * speed * (1.0 - cosGammaEff) / radialAccel;
        double recoveryFloorM = _profile.LowBlockDoctrine == LowBlockDoctrine.Conservative
            ? 120.0
            : _profile.LowBlockClearanceM;
        double rollInM = closureMps * TerrainRecoveryRollSeconds;
        return worstAheadM < pullOutM + rollInM + recoveryFloorM;
    }

    public AircraftState State => _sim.State;
    public Vec3D LiftDir => _sim.LiftDir;
    public GunsOnly.Sim.Turbulence.IWindField? Wind {
        get => _sim.Wind;
        set => _sim.Wind = value;
    }
    public IAtmosphereModel Atmosphere {
        get => _sim.AtmosphereModel;
        set => _sim.AtmosphereModel = value;
    }
    public double T { get; private set; }
    public bool CatastrophicallyDamaged { get; private set; }
    public bool WreckSettled => _wreckMotion?.Settled ?? false;
    public ImpactSurface WreckSurface => _wreckMotion?.Surface ?? ImpactSurface.None;
    public bool WreckSurfaceChangedThisStep =>
        _wreckMotion?.SurfaceChangedThisStep ?? false;
    public double ThrustFraction => _sim.ThrustFraction;
    public BanditTactic Tactic { get; private set; } = BanditTactic.Acquire;

    /// Two burst lengths of sustained tracking. FightDirector judges the reciprocal question about
    /// the bandit's own gun with WalkoverSolutionSecondsConceded = 0.75; this is the player-side
    /// equivalent with margin. It is the primary tuning knob for the whole introduction.
    public const double PresentHoldSeconds = 2.0;
    const double PresentFunnelRangeM = 900.0;      // gun_funnel.js EFFECTIVE_CEILING_M
    const double PresentFunnelAngleRad = 0.2094;   // 12 deg, matching CameraSolver.GunWindow

    /// True while this bandit is deliberately setting the player up rather than fighting them.
    public bool Presenting { get; private set; }
    double _presentHeldSeconds;
    public PilotCommand LastCommand { get; private set; } = new(1.0, 0.0, 0.85, 0.0);
    public PilotCommand AppliedCommand => LastCommand;
    public BanditDecisionTrace DecisionTrace { get; private set; }
    public FormationDirective FormationDirective => _formationDirective;
    public BanditPolicyMemory PolicyMemory => new(
        Tactic,
        T,
        System.Math.Max(0.0, _defendUntil - T),
        System.Math.Max(0.0, _defendCooldownUntil - T),
        _jinkIndex,
        _breakSign,
        _lookaheadHoldTicks,
        EffectiveFormationRole,
        _formationDirective.LateralSign,
        _formationDirective.AssignmentSequence,
        _formationDirective.SharedContact.SourceTick,
        _formationDirective.SharedContact.ObservationAgeTicks,
        _formationDirective.SharedContact.Confidence);

    /// <summary>
    /// Receives a held formation assignment without disturbing the pilot's independent decision
    /// cadence. In particular, radio updates must not re-synchronise two expensive lookahead
    /// rollouts onto the same fixed tick.
    /// </summary>
    public void AcceptFormationDirective(in FormationDirective directive) {
        if (!System.Enum.IsDefined(directive.Role))
            throw new System.ArgumentOutOfRangeException(nameof(directive));
        if (directive.LateralSign is < -1 or > 1)
            throw new System.ArgumentOutOfRangeException(nameof(directive));
        if (directive.AssignmentSequence < 0)
            throw new System.ArgumentOutOfRangeException(nameof(directive));
        if (directive.Role != FormationTacticalRole.Independent
            && !directive.SharedContact.IsFinite)
            throw new System.ArgumentException(
                "An active formation directive requires a finite shared contact.",
                nameof(directive));
        _formationDirective = directive;
    }

    /// <summary>
    /// Select how speculative lookahead work is distributed. Directly constructed bandits retain
    /// the historical all-candidates-on-the-decision-tick path until a host explicitly opts into
    /// incremental planning.
    /// </summary>
    public void ConfigureAiPlanning(AiComputeLevel level, bool incremental) {
        if (!System.Enum.IsDefined(level))
            throw new System.ArgumentOutOfRangeException(nameof(level));
        if (_computeLevel == level && _incrementalAiPlanning == incremental) return;

        CancelPendingLookaheadPlan();
        // Forecast fidelity is part of maneuver selection. A command published under a different
        // level (or synchronous/amortized policy) must not remain authoritative until the next
        // cadence lane; the next Step installs a cheap, current-context hold without doing
        // unscheduled candidate work.
        if (_lookaheadContextBound)
            _lookaheadCommandValid = false;
        _computeLevel = level;
        _incrementalAiPlanning = incremental;
    }

    /// <summary>
    /// Anchor expensive formation lookahead to an actor-specific lane on the authoritative
    /// observation tick. A neutral-merge controller may begin many seconds after its wingman, and
    /// local countdowns can otherwise coincide after tactical preemption or handoff. Absolute
    /// lanes keep the pair dephased without wall time or replay-dependent local countdowns.
    /// </summary>
    internal void ConfigureLookaheadCadencePhase(int phase) {
        if (phase < 0 || phase >= LookaheadDecisionCadenceTicks)
            throw new System.ArgumentOutOfRangeException(nameof(phase));
        CancelPendingLookaheadPlan();
        _absoluteLookaheadCadencePhase = phase;
        _lastAbsoluteLookaheadDecisionTick = long.MinValue;
    }

    FormationTacticalRole EffectiveFormationRole =>
        _formationDirective.Role != FormationTacticalRole.Independent
        && _formationDirective.SharedContact.IsFinite
        && _formationDirective.SharedContact.Confidence > 0.05
        && _formationDirective.SharedContact.ObservationAgeTicks
            <= EnemyPairCoordinator.SharedContactStaleAfterTicks
            ? _formationDirective.Role
            : FormationTacticalRole.Independent;

    /// <summary>
    /// Preserve the real engine spool state when scenario geometry hands this controller an
    /// already-flying aircraft. The controller changes pilot intent; it must not replace the
    /// physical engine with a freshly initialized one.
    /// </summary>
    internal void SeedEnginePowerFraction(double powerFraction) =>
        _sim.SeedEnginePowerFraction(powerFraction);

    /// <summary>
    /// Preserve the command already being flown when scenario geometry hands this controller an
    /// existing aircraft. In particular, an incremental post-merge plan must not replace the
    /// authored reciprocal-pass hold with the generic constructor default while it is scored.
    /// </summary>
    internal void SeedHeldCommand(
        in PilotCommand command,
        long contactIdentity = 0) {
        if (contactIdentity < 0)
            throw new System.ArgumentOutOfRangeException(nameof(contactIdentity));
        _lookaheadCommand = command;
        _lookaheadCommandUsesLowAttack = false;
        _lookaheadCommandContactIdentity = contactIdentity;
        _lookaheadCommandValid = true;
        _lookaheadContextBound = true;
        LastCommand = command;
    }

    /// <summary>Follow a session terrain replacement (world-origin re-anchor or data-pack swap)
    /// so floor sense and the recovery reflex keep sampling the currently authoritative ground.
    /// </summary>
    public void UpdateTerrain(GunsOnly.Sim.Environment.ITerrainSurface? terrain) {
        if (ReferenceEquals(_terrain, terrain)) return;
        CancelPendingLookaheadPlan();
        if (_lookaheadContextBound)
            _lookaheadCommandValid = false;
        _terrain = terrain;
    }

    public bool WantsToFire(in ActorObservation player) {
        // A bandit that is setting the player up does not shoot them. Step's presenting gate
        // cannot cover this: the session asks the actor to fire on a separate path.
        if (Presenting) return false;
        if (CatastrophicallyDamaged || _terrainRecoveryActive) return false;
        bool onSolution = BanditFireControl.InLeadFiringEnvelope(
            State, player, EffectiveLeadFireConeRad);
        // The body gate is not wrong everywhere — it is wrong exactly where it DISAGREES with the
        // solution. In a low-aspect tail chase the required lead is a fraction of a degree, so the
        // target IS the solution and pointing at it is correct airmanship; across a crossing turn
        // the solution is 17 deg away and the same gate authorises a shot into empty sky. A pilot
        // with solution discipline therefore keeps the wide gate only where the two agree, which
        // is a geometric test on the shot, not a tracking test on the pilot.
        bool onBody = (_profile.FiresOnBodyGate
                || BanditFireControl.RequiredLeadAngleRad(State, player)
                    <= EffectiveLeadFireConeRad)
            && BanditFireControl.InFiringEnvelope(State, player, EffectiveFireConeRad);
        if (!onSolution && !onBody) return false;

        // Start the burst when a usable opportunity actually appears. The historical absolute
        // engagement clock discarded short post-merge windows whenever they happened to arrive
        // during its arbitrary 0.9-second "off" phase, which made a physically nose-on bandit
        // decline the only shot of an engagement. This state is driven only by deterministic sim
        // time and still enforces the same burst length/cycle; GunKill remains cadence, ammunition,
        // projectile, hit, and damage authority.
        if (T >= _nextFireBurstAt) {
            _fireBurstUntil = T + BanditFireControl.BurstSeconds;
            _nextFireBurstAt = T + BanditFireControl.BurstCycleSeconds;
        }
        return T < _fireBurstUntil;
    }

    /// A committed boss shoots with the standard Ace gate; a stalking boss holds its raised
    /// quality bar. Every other tier reads its profile cone unchanged.
    double EffectiveFireConeRad => _profile.IsBoss && !BossCommitted
        ? _profile.FireConeRad
        : _profile.IsBoss
            ? BanditSkillProfile.For(PilotSkill.Ace).FireConeRad
            : _profile.FireConeRad;

    double EffectiveLeadFireConeRad => _profile.IsBoss && !BossCommitted
        ? _profile.LeadFireConeRad * 0.75
        : _profile.IsBoss
            ? BanditSkillProfile.For(PilotSkill.Ace).LeadFireConeRad
            : _profile.LeadFireConeRad;

    /// Latched roll-in state for the boss overlay. Deterministic and observation-only: the
    /// trigger reads exactly the player observation every bandit gets.
    public bool BossCommitted { get; private set; }
    double _bossDominanceSeconds;

    void UpdateBossCommitment(in ActorObservation player, double dt) {
        var los = player.Position - State.Position;
        double rangeM = los.Length;
        if (rangeM < 1e-6) return;
        var losDir = los * (1.0 / rangeM);
        double playerNoseErrorRad = System.Math.Acos(System.Math.Clamp(
            player.ForwardDir().Dot(losDir * -1.0), -1.0, 1.0));

        // (a) Energy collapse: the player is slow and the boss holds a real reserve.
        if (player.Speed < 140.0 && State.Speed >= player.Speed + 30.0) {
            BossCommitted = true;
            return;
        }
        // (b) Caught nose-off inside pounce range: the player turned away too close to the cat
        // WHILE the cat is pointed at them. The own-nose gate keeps a neutral merge crossing —
        // where both noses sweep off at the pass — from reading as a caught mistake; without it
        // every reciprocal-merge boss committed at the first closest approach and the stalk
        // phase never existed in production.
        double ownNoseErrorRad = System.Math.Acos(System.Math.Clamp(
            State.ForwardDir().Dot(losDir), -1.0, 1.0));
        if (playerNoseErrorRad > 60.0 * System.Math.PI / 180.0
            && ownNoseErrorRad < 30.0 * System.Math.PI / 180.0
            && rangeM < 1200.0) {
            BossCommitted = true;
            return;
        }
        // (c) Sustained dominance: behind the 3-9 line and closing, long enough that the point
        // is made. The accumulator resets the moment the geometry is contested.
        bool behindThreeNine = playerNoseErrorRad > System.Math.PI / 2.0;
        double closureMps = (State.VelocityVector() - player.VelocityVector()).Dot(losDir);
        if (behindThreeNine && closureMps >= 0.0) {
            _bossDominanceSeconds += dt;
            if (_bossDominanceSeconds >= _profile.CommitDominanceSeconds)
                BossCommitted = true;
        } else {
            _bossDominanceSeconds = 0.0;
        }
    }

    public void ApplyCatastrophicDamage(int handedness) {
        if (CatastrophicallyDamaged) return;
        CancelPendingLookaheadPlan();
        CatastrophicallyDamaged = true;
        _damageHandedness = handedness < 0 ? -1 : 1;
        _sim.EngineCombustionAvailable = false;
        _sim.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
            AirframeAerodynamicState.Clean, _damageHandedness);
    }

    public void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null) {
        if (_wreckMotion is not null) return;
        CancelPendingLookaheadPlan();
        ApplyCatastrophicDamage(_damageHandedness);
        _wreckMotion = new WreckContactMotion(_sim.State, surface,
            surfaceVelocity, surfaceHeightM, carrier, terrain: terrain ?? _terrain);
        _sim.AdoptExternalKinematics(_wreckMotion.State);
    }

    public void Step(in ActorObservation player, double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(dt));

        if (_wreckMotion is not null) {
            CancelPendingLookaheadPlan();
            _sim.AdvanceEngineOnly(0.0, dt);
            _wreckMotion.Step(dt);
            _sim.AdoptExternalKinematics(_wreckMotion.State);
            T += dt;
            return;
        }

        if (CatastrophicallyDamaged) {
            CancelPendingLookaheadPlan();
            LastCommand = TerminalFlightDynamics.UncontrolledCommand(_sim.State);
            TerminalFlightDynamics.Step(_sim, AirframeAerodynamicState.Clean,
                _damageHandedness, dt);
            T += dt;
            return;
        }

        _terrainRecoveryActive = false;
        bool lowTarget = IsLowTarget(player);
        if (!lowTarget) _lowAttackActive = false;
        bool hasLowAttackPlan = TryLowAttackPlan(player, out LowAttackPlan lowAttackPlan);
        double ownClearanceM = State.Position.Y
            - SurfaceHeightM(_terrain, State.Position.X, State.Position.Z);
        bool deliberateDescentMayOverrideRecovery = hasLowAttackPlan
            && ownClearanceM
                > _profile.LowBlockClearanceM + 60.0;

        // Terrain recovery pre-empts every tactical layer unless a deliberate low-block attack has
        // a fresh swept corridor with an aero-honest pull-out reserve. A committed attack whose
        // corridor disappears (typically a ridge entering the path) enters this SAME reflex even
        // before the old straight-flight gate would have fired.
        bool attackPathWentBad = _lowAttackActive && lowTarget && !hasLowAttackPlan;
        if (attackPathWentBad
            || (NeedsTerrainRecovery()
                && !deliberateDescentMayOverrideRecovery)) {
            FlyTerrainRecovery(dt);
            return;
        }

        // High-skill tiers replace the flat-turn state machine with a short-horizon lookahead: roll
        // candidate maneuvers forward in the deterministic kernel and fly the one that best improves
        // the future firing position. The vertical fight emerges from the score, it is not scripted.
        // Novice keeps LookaheadHorizonTicks == 0 and the state machine below.
        // The co-operative opening. Short-circuits BOTH the lookahead and simple paths: a
        // presenting bandit does not acquire, does not defend, does not commit as a boss, and does
        // not fire. Withdrawal is evaluated first so the graduating tick already fights.
        // A presenting bandit THINKS exactly as it would in a fight — same planner cadence, same
        // lanes, same per-tick frame cost — and only FLIES differently. Suppressing the planner
        // instead breaks the measured pair budget (AiPlannerWorkloadBudgetTests exists to catch
        // planning silently stopping) and would make graduation a cost cliff, with two Aces
        // beginning to plan inside a single frame at the most demanding moment of a first sortie.
        // Only the pilot's decision is withheld, never the thinking behind it.
        if (Presenting) UpdatePresentWithdrawal(player, dt);

        if (_profile.IsBoss && !BossCommitted) UpdateBossCommitment(player, dt);

        if (_profile.LookaheadHorizonTicks > 0) {
            // Competent retains the deliberately staged boom-and-zoom low-block doctrine. Its
            // lookahead is for BFM conversion and tail denial, not permission to turn the middle
            // rung into the Ace's continuous valley hunt.
            if (Skill == PilotSkill.Competent && lowTarget) {
                CancelPendingLookaheadPlan();
                LastCommand = CompetentLowBlockCommand(
                    player, hasLowAttackPlan, lowAttackPlan);
                Tactic = BanditTactic.Acquire;
                RecordSingleCandidateDecision(LastCommand);
                _sim.Step(CommandForFlight(), dt);
                T += dt;
                return;
            }
            // Lookahead owns maneuver selection, not energy amnesty. Earlier high-skill controllers
            // could keep optimizing after speed collapsed. Honor the same low-energy gate as the
            // simple pilot; the rollout's terrain/ceiling score continues to own fight-volume
            // shaping so an arbitrary spawn-centre Return does not interrupt a live engagement.
            if (!lowTarget) {
                SelectTactic(player);
                if (Tactic == BanditTactic.Energy
                    && Skill != PilotSkill.Machine) {
                    CancelPendingLookaheadPlan();
                    LastCommand = EnergyCommand(player);
                    RecordSingleCandidateDecision(LastCommand);
                    _sim.Step(CommandForFlight(), dt);
                    T += dt;
                    return;
                }
            }
            if (lowTarget && hasLowAttackPlan) {
                _lowAttackActive = true;
                if (ownClearanceM <= LowBlockCaptureClearanceM) {
                    CancelPendingLookaheadPlan();
                    LastCommand = LowLevelHuntCommand(player, lowAttackPlan);
                    RecordSingleCandidateDecision(LastCommand);
                } else {
                    LastCommand = LookaheadCommand(player, lowAttackPlan);
                }
                Tactic = BanditTactic.Acquire; // firing remains governed by BanditFireControl
            } else if (lowTarget) {
                CancelPendingLookaheadPlan();
                _lowAttackActive = false;
                LastCommand = LowBlockPerchCommand(player);
                Tactic = BanditTactic.Return;
                RecordSingleCandidateDecision(LastCommand);
            } else if ((Tactic == BanditTactic.Return || IsOpeningBeyondReengageRange(player))
                && Geometry.Range(State, player) > ReengageRangeM) {
                // CONTAINMENT NEVER OUTRANKS AN ACTUAL ENGAGEMENT.
                //
                // The range guard is the whole point. Below it this branch fired whenever the
                // tactic was Return, and the command chosen at the bottom is ReturnCommand() for
                // every range at or under ReengageRangeM (3.5 km) — so a bandit that had drifted
                // outside the 5.2 km arena turned cold and drove for a geometric centre point with
                // the player inside 1.9 NM. Gun range is 120-900 m, so that is the merge: the
                // closer the player got, the more likely the bandit was to leave. Reported
                // repeatedly as "the bandits are still running away", and it is the same defect
                // each time.
                //
                // Fighting the aircraft in front of you outranks tidying the arena. Containment
                // still applies when nobody is engaged — the bandit wandering off with the player
                // far away, which is the case the leash was actually built for. WantsToFire does
                // not gate on Tactic, so falling through to ordinary BFM keeps the guns live.
                // THE LEASH, FOR THE TIERS THAT ACTUALLY FLY THE LOOKAHEAD.
                //
                // The branch below discards whatever SelectTactic decided and force-sets Acquire,
                // on the reasoning that "the rollout's terrain/ceiling score continues to own
                // fight-volume shaping". It does not, on either count. BanditTactic.Return was
                // unreachable for every lookahead tier, so from Veteran up there was no containment
                // of any kind: the scorer optimises a firing solution over a short horizon and is
                // perfectly content to fly away for a better one later, which at Ace produced a
                // bandit 7.0 NM out and opening — a stern chase in a sim with nothing to shoot at
                // that range. And the rollout's ceiling term guards CombatCeilingM (11.5 km), never
                // the per-fight _ceilingM, so it permits a bandit to float thousands of metres out
                // of its own fight volume; traced at 13,437 m against a 5,608 m ceiling.
                //
                // So BOTH leashes are honoured here. SelectTactic's Return (radius from the fight
                // centre, or ownship above the per-fight ceiling) is no longer thrown away, and the
                // player-relative opening test adds the case a spawn-centred radius cannot see: a
                // fight the player has dragged downrange, where both aircraft are far from the
                // centre and the range is opening anyway.
                CancelPendingLookaheadPlan();
                // Point at the PLAYER whenever he is far, not merely when the gap is opening. Using
                // ReturnCommand for the geographic case flew the bandit at the spawn-centred fight
                // volume while the player sat somewhere else entirely — measured, that put it nose-
                // cold beyond 4 NM for 24 continuous seconds, which is the reported complaint wearing
                // a different hat. The fight volume is only the right target when the player is
                // already close and it is the BANDIT that has strayed out of bounds.
                double leashRangeM = Geometry.Range(State, player);
                bool sharedFightSupport = (EffectiveFormationRole is
                    FormationTacticalRole.Bracket or FormationTacticalRole.Extend)
                    && leashRangeM <= FormationSupportAbandonChaseRangeM;
                // A fresh support order extends the ordinary abandon ceiling enough to recover
                // the reproduced 13 NM mutual-support gap, but the separate finite support guard
                // still rejects a coordinator that keeps refreshing while the player departs.
                LastCommand = sharedFightSupport
                        || (leashRangeM > ReengageRangeM
                            && leashRangeM <= AbandonChaseRangeM)
                    ? ReengageCommand(player)
                    : ReturnCommand();
                Tactic = BanditTactic.Return;
                RecordSingleCandidateDecision(LastCommand);
            } else if (ShouldFineTrack(player)) {
                // A firing opportunity is not a firing solution. Hand the last few degrees to a
                // direct tracking law instead of the horizon optimiser, which is content to sit in
                // the wide body gate and shoot at nothing.
                CancelPendingLookaheadPlan();
                LastCommand = GunTrackCommand(player);
                Tactic = BanditTactic.Acquire;
                RecordSingleCandidateDecision(LastCommand);
            } else {
                bool defending = Tactic == BanditTactic.Defend;
                LastCommand = LookaheadCommand(player);
                Tactic = defending
                    ? BanditTactic.Defend
                    : BanditTactic.Acquire;
            }
            _sim.Step(CommandForFlight(), dt);
            T += dt;
            return;
        }

        CancelPendingLookaheadPlan();
        SelectTactic(player);
        LastCommand = Tactic switch {
            BanditTactic.Defend => DefendCommand(),
            BanditTactic.Energy => EnergyCommand(player),
            BanditTactic.Return when (EffectiveFormationRole is
                FormationTacticalRole.Bracket or FormationTacticalRole.Extend)
                && Geometry.Range(State, player) <= FormationSupportAbandonChaseRangeM =>
                    ReengageCommand(player),
            BanditTactic.Return => ReturnCommand(),
            _ when _profile.LowBlockDoctrine == LowBlockDoctrine.BoomAndZoom && lowTarget
                => CompetentLowBlockCommand(player, hasLowAttackPlan, lowAttackPlan),
            _ => AcquireCommand(player)
        };
        RecordSingleCandidateDecision(LastCommand);
        _sim.Step(CommandForFlight(), dt);
        T += dt;
    }

    void FlyTerrainRecovery(double dt) {
        CancelPendingLookaheadPlan();
        _lowAttackActive = false;
        _terrainRecoveryActive = true;
        _lowAttackRecommitAt = System.Math.Max(_lowAttackRecommitAt,
            T + _profile.LowBlockRecommitSeconds);
        _lookaheadHoldTicks = 0;
        LastCommand = new PilotCommand(_profile.MaxAcquireG, 0.0,
            _maximumThrottle, 0.0);
        Tactic = BanditTactic.Return; // never firing while recovering from the dirt
        RecordSingleCandidateDecision(LastCommand);
        _sim.Step(CommandForFlight(), dt);
        T += dt;
    }

    void SelectTactic(in ActorObservation player) {
        var own = State;
        double radius = HorizontalDistance(own.Position, _fightCentre);

        // KEEP DEFENDING WHILE THE ATTACKER IS STILL THERE. The break used to end after DefendSeconds
        // (3.4 s) and then a cooldown blocked re-entry, so a human who stayed on its six watched it
        // stop breaking and settle into a trackable turn -- "barely defends". While it is defending
        // AND the attacker is still a gun threat, roll the defence window forward so the break
        // continues (the jink sequence keeps advancing) instead of expiring under the guns.
        if (Tactic == BanditTactic.Defend && T >= _defendUntil && IsGunThreat(player))
            _defendUntil = T + DefendSeconds;
        if (Tactic == BanditTactic.Defend && T < _defendUntil) return;
        if (Tactic == BanditTactic.Defend) {
            _defendCooldownUntil = T + DefendCooldownSeconds;
            _nextJinkAt = double.PositiveInfinity;
        }

        // Deny the stratosphere plink. A player camping above the believable combat ceiling turns
        // a ceiling-limited bandit into a stationary target; real BFM answers that by unloading,
        // extending away, and rebuilding energy below — dragging the fight back down instead of
        // hovering at the cap waiting to be shot from above.
        //
        // HYSTERESIS, because a single threshold on own.Y made this oscillate. Entry and exit both
        // tested `own.Y > _ceilingM - 900`, so Energy's unload dropped the bandit a few metres
        // below the line, Acquire's pull put it straight back above, and the bandit chattered
        // Energy<->Acquire every few seconds pinned to that altitude — never committing to the
        // fight, never finishing the extension. Arm high, disarm 500 m lower, exactly as the speed
        // gate below already separates _energyEntryMps from _energyExitMps.
        // AND IT ONLY ARMS FOR A BANDIT THAT ACTUALLY NEEDS THE ENERGY. This is a training
        // opponent: it cannot kill the player while it is pointing away, so running is never the
        // hardest it can try. A bandit still carrying fighting speed answers a high player by
        // climbing into him — the ordinary Acquire lookahead already does that, and the raised
        // ceiling now gives it the room. The extension is reserved for the case it was written
        // for: energy-poor, near the cap, genuinely unable to reach the player from here.
        bool needsEnergyToReach = own.Speed < _highSpeedMps;
        if (player.Position.Y <= _ceilingM + 350.0 || !needsEnergyToReach) _ceilingDenial = false;
        else if (own.Position.Y > _ceilingM - 900.0) _ceilingDenial = true;
        else if (own.Position.Y < _ceilingM - 1400.0) _ceilingDenial = false;

        // Energy state outranks arena housekeeping. Previously a slow bandit outside the return
        // radius stayed in Return's nose-high 2.8 G turn instead of unloading, decelerated into a
        // deep stall, and wallowed for the rest of the engagement. Rebuild honest flying energy
        // first; Return can bend the recovered aircraft back into the fight on a later tick.
        if (own.Speed < _energyEntryMps
            || (Tactic == BanditTactic.Energy && own.Speed < _energyExitMps)) {
            Tactic = BanditTactic.Energy;
            return;
        }

        // THE ARENA LEASH OUTRANKS EVERY DISCRETIONARY REASON TO FLY AWAY.
        //
        // This check used to sit BELOW the ceiling-denial branch, which returned early — so while
        // the player was above the fight ceiling the 5.2 km leash was not merely loose, it was
        // switched off entirely. A player who climbed 350 m over the cap (in the modern merge that
        // is 14,626 ft, under one high yo-yo above the 10,000 ft staging) put the bandit into an
        // unbounded max-throttle extension: reproduced at 5.7 NM and reported from production at
        // 7.0 NM, with Return never selected once in three minutes. A guns-only opponent that can
        // open the range without limit is not a fight, it is a fuel-burning tail chase.
        //
        // Denial now sets its intent and FALLS THROUGH to here: the bandit may extend, dive and
        // rebuild energy, but it does all of that inside the arena, and crossing the leash sends
        // it home regardless of how high the player is sitting. The low-energy gate above still
        // outranks the leash, for the documented stall reason.
        if (radius > ReturnRadiusM || own.Position.Y > _ceilingM + 350.0) {
            Tactic = BanditTactic.Return;
            return;
        }

        if (_ceilingDenial) {
            Tactic = BanditTactic.Energy;
            return;
        }

        if (T >= _defendCooldownUntil && IsGunThreat(player)) {
            EnterDefence(player);
            return;
        }

        Tactic = BanditTactic.Acquire;
    }

    bool IsGunThreat(in ActorObservation player) {
        var own = State;
        var ownToPlayer = player.Position - own.Position;
        double range = ownToPlayer.Length;
        double threatRangeM = Skill == PilotSkill.Novice
            ? 1050.0
            : ThreatRangeM + 300.0;
        if (range < 1.0 || range > threatRangeM) return false;

        var toPlayer = ownToPlayer * (1.0 / range);
        var playerToOwn = toPlayer * -1.0;
        double rearAspect = own.ForwardDir().Dot(toPlayer);
        double attackerAngle = player.ForwardDir().Dot(playerToOwn);
        double closing = (player.VelocityVector() - own.VelocityVector()).Dot(playerToOwn);
        if (Skill == PilotSkill.Novice)
            return rearAspect < -0.60
                && attackerAngle > 0.94
                && closing > 0.0;

        // A competent pilot contests the ATTEMPT to enter the saddle instead of waiting for the
        // attacker's pipper to stabilize. The wider positional/nose gates still require a real
        // rear-quarter attacker; they do not grant omniscient reactions to beam or forward contacts.
        return rearAspect < -0.20
            && attackerAngle > 0.60
            && closing > -20.0;
    }

    void EnterDefence(in ActorObservation player) {
        var own = State;
        var forward = own.ForwardDir();
        var right = new Vec3D(0.0, 1.0, 0.0).Cross(forward);
        double side = right.Length < 1e-6 ? 0.0 : (player.Position - own.Position).Dot(right.Normalized());
        _breakSign = side < -1.0 ? -1 : 1;
        _jinkIndex = 0;
        _nextJinkAt = T + JinkDurations[0];
        _defendUntil = T + DefendSeconds;
        Tactic = BanditTactic.Defend;
    }

    PilotCommand CompetentLowBlockCommand(in ActorObservation player,
        bool hasPlan, in LowAttackPlan plan) {
        var own = State;
        var line = player.Position - own.Position;
        double rangeM = line.Length;
        bool passedTarget = rangeM < 900.0
            && line.Dot(own.ForwardDir()) < 0.0;
        if (_lowAttackActive
            && (T >= _lowAttackEndAt || passedTarget)) {
            _lowAttackActive = false;
            _lowAttackRecommitAt = T + _profile.LowBlockRecommitSeconds;
        }

        double ownClearanceM = own.Position.Y
            - SurfaceHeightM(_terrain, own.Position.X, own.Position.Z);
        if (!_lowAttackActive) {
            // A Competent pilot makes honest diving passes, but only from a rebuilt perch. It does
            // not settle into the Ace's continuous valley chase after an overshoot.
            if (!hasPlan || ownClearanceM < CompetentPerchClearanceM - 100.0)
                return LowBlockPerchCommand(player);
            _lowAttackActive = true;
            _lowAttackEndAt = T + CompetentAttackSeconds;
        }

        return CompetentAttackCommand(plan);
    }

    /// Terminal fine tracking, and the reason bandits could not kill anything.
    ///
    /// The rollout planner optimises a short horizon and is perfectly content to park the nose
    /// NEAR the lead point — it scores a firing opportunity, not a firing solution. Measured on
    /// GunConversionFunnel that leaves a median lead error of 27 deg at Ace and 135 deg at
    /// Competent. The gun needs roughly 1 deg: an 8 m effective hit radius at 500 m subtends
    /// 0.9 deg. So the bandit sat inside the wide 3-5 deg BODY gate, fired, and put every round
    /// into empty sky — 187 rounds for 0 hits even at the uprated Ace.
    ///
    /// Inside gun range with the target already roughly ahead, stop optimising and close the loop
    /// directly on the SAME ballistic lead point BanditFireControl scores the shot against. One
    /// solution, shared by guidance and fire control, is the whole point.
    PilotCommand GunTrackCommand(in ActorObservation player) {
        var own = State;
        var aim = BanditFireControl.LeadPoint(own, player);
        double authority = System.Math.Clamp(
            _profile.EffectiveFineTrackAuthorityG / 5.5, 0.75, 2.0);
        double tau = 0.6 / authority;
        // LEAD THE LEAD POINT. A first-order law chasing a moving aim point settles a whole lag
        // behind it — aim rate times the loop's time constant, ~3-4 deg against a turning
        // target, which is ten gate widths: the pipper parks just off the solution and every
        // burst lands where the lead point WAS. Feed the aim point's measured world-space rate
        // forward by the loop lag. That rate is dominated by ownship's own translation, which
        // reads as a bounded lag-pursuit bias along the current heading — measured on the
        // funnel, that bias is what lets the Competent and Veteran loops settle onto the gate
        // at all (10 and 4 hits against none without it). Capped relative to range so a
        // handoff tick or a hard target reversal cannot command a wild lurch.
        var trackAim = aim;
        double sincePrev = T - _trackAimT;
        double rangeM = (aim - own.Position).Length;
        if (sincePrev > 0.0 && sincePrev <= 4.0 / AircraftSim.TickHz) {
            var feedforward = (aim - _trackAim) * ((tau + 0.25) / sincePrev);
            double feedforwardM = feedforward.Length;
            double maxFeedforwardM = 0.5 * rangeM;
            trackAim = feedforwardM > maxFeedforwardM && feedforwardM > 1e-9
                ? aim + feedforward * (maxFeedforwardM / feedforwardM)
                : aim + feedforward;
        }
        _trackAim = aim;
        _trackAimT = T;

        var toAim = trackAim - own.Position;
        double horizontalM = System.Math.Sqrt(toAim.X * toAim.X + toAim.Z * toAim.Z);
        // toAim is already a delta. The low-attack commands below subtract own.Position.Y from it
        // a second time; do not copy that.
        double desiredGamma = System.Math.Atan2(toAim.Y, System.Math.Max(1.0, horizontalM));
        // Tight tracking wants the lift vector on the target, so allow past-vertical roll.
        double bank = LimitedBankTo(trackAim, 1.35);
        // Shorter time constant than the low-attack pass: this is a gun solution, not a descent.
        //
        // PER-TIER AUTHORITY. One global gain traded three tiers' competence for one tier's
        // lethality when this law first flew ungated (branch bandit-threat, measured on the
        // funnel: Veteran 79.3 -> 11.0 deg and its first six hits, Ace 27.0 -> 50.7 deg). The
        // law is a straitjacket when its rate limit sits below what the airframe and pilot can
        // fly — the Ace's 9 G planner out-turns a 0.45 rad/s clamp and the law fought it — and
        // too hot for a tier without the authority to fly it. Scale the loop to the tier's
        // honest G: Veteran is the reference the gains were validated on.
        double rateLimit = 0.45 * authority;
        double desiredGammaRate = System.Math.Clamp(
            (desiredGamma - own.Gamma) / tau, -rateLimit, rateLimit);
        double cosBank = System.Math.Max(0.30, System.Math.Cos(bank));
        double g = (System.Math.Cos(own.Gamma)
            + desiredGammaRate * own.Speed / FlightModel.G0) / cosBank;
        g = System.Math.Clamp(g, -0.20,
            System.Math.Max(-0.20, AvailableAcquireG(safetyReserve: false)));
        // Hold the gun cross on: chasing throttle mid-burst walks the pipper off.
        double throttle = own.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : own.Speed > _highSpeedMps
                ? System.Math.Min(_maximumThrottle, 0.60)
                : System.Math.Min(_maximumThrottle, 0.92);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    /// Is this a shot worth closing the loop on? Deliberately generous on angle and strict on
    /// range: outside gun reach the rollout's energy and geometry work is still the better plan.
    bool ShouldFineTrack(in ActorObservation player) {
        // ONLY WHERE THE PLANNER IS THE ONE FLYING. This is the component with the defect: a tier
        // with no lookahead horizon flies the reactive laws and already tracks a non-manoeuvring
        // target at 4.2 deg with hits on the board, while the lookahead tiers sit at 50.4 deg
        // (Veteran) and 88.1 deg (Ace) against the same target flying in a straight line. Applying
        // a pursuit law on top of a law that already works only makes it worse — ungated, it drove
        // Novice from 7.3 to 157 deg of median lead error in the merge.
        if (_profile.LookaheadHorizonTicks <= 0) {
            _fineTrackLatched = false;
            return false;
        }
        double rangeM = Geometry.Range(State, player);
        if (!double.IsFinite(rangeM)
            || rangeM < BanditFireControl.MinimumRangeM
            || rangeM > BanditFireControl.MaximumRangeM) {
            _fineTrackLatched = false;
            return false;
        }
        // AGAINST A TARGET THAT IS NOT MANOEUVRING, always.
        //
        // A level turn requires bank, so near-zero bank IS straight and level. Against such a
        // target the lead solution is exact and closed-form and this law converges: measured, it
        // takes Veteran from never hitting to a kill in 3.2 s, and Ace from 88.1 deg of median
        // lead error to 4.3 deg (StraightAndLevelGunneryTests).
        if (double.IsFinite(player.Bank)
            && System.Math.Abs(player.Bank) <= NonManoeuvringBankRad) {
            _fineTrackLatched = false;
            return BanditFireControl.NoseErrorRad(State, player) <= GunTrackEntryRad;
        }
        // AGAINST A MANOEUVRING TARGET, only as the finisher the planner cannot be — and only
        // for the tiers the law's fixed form actually fits.
        //
        // The planner re-picks among nine constant commands every 0.1 s; between picks nothing
        // corrects the drift, so it arrives near the solution and dithers around it. A burst is
        // 0.35 s. Closing and HOLDING the last few degrees wants a loop closed every tick, not
        // a plan re-rolled every twelve.
        //
        // Measured on the funnel, scorer aiming at the lead point, per-tier authority gains:
        // the law takes Competent and Veteran from 0-1 hits to 4 and 10 (45% of Veteran rounds
        // on), while EVERY variant tried against the Ace — no feedforward, direction-space,
        // target-velocity — scores worse than its own 150-tick planner alone (0-3 hits against
        // 4). At 9 G with the long horizon the planner's anticipation IS the better tracker;
        // the fixed law only replaces its mid-game with a worse one. So the finisher serves the
        // middle of the ladder, and the top of the ladder keeps its planner. This is the
        // per-tier authority limiting the original ungated trial prescribed.
        //
        // Enter on LEAD error — the solution itself, not the target's body — and only when the
        // planner has already brought the pipper inside a few cone widths: from there the law
        // refines and holds. Any wider and the fixed-form law replaces the planner's superior
        // mid-game, which is exactly the regression the ungated trial measured (Ace 27.0 ->
        // 50.7 deg). Hysteresis keeps the handoff from chattering at the boundary; the latch is
        // a pure function of sim state, replay-safe within a run, and like _ceilingDenial it is
        // not in PolicyMemory — a mid-fight restore can desync inside the hysteresis band.
        // ManoeuvringFinisher=false is the frozen BfmDuel reference yardstick: it flies the same
        // Veteran planner but declines this law, so a tier ladder is measured against a ruler
        // that does not itself improve with the bandit build.
        if (!_profile.ManoeuvringFinisher
            || _profile.MaxAcquireG > _profile.FineTrackMaxG) {
            _fineTrackLatched = false;
            return false;
        }
        double leadErrorRad = BanditFireControl.LeadNoseErrorRad(State, player);
        if (_fineTrackLatched) {
            if (leadErrorRad <= GunTrackLeadExitRad) return true;
            _fineTrackLatched = false;
            return false;
        }
        if (leadErrorRad <= GunTrackLeadEntryRad) {
            _fineTrackLatched = true;
            return true;
        }
        return false;
    }

    /// 15 degrees of bank is about 1.04 g — level flight within instrument tolerance, not a turn.
    const double NonManoeuvringBankRad = 0.2618;

    /// Wide enough that the bandit commits to tracking from a realistic post-merge position,
    /// narrow enough that it is not flying pursuit at a target behind its wing line.
    const double GunTrackEntryRad = 0.2094; // 12 degrees

    /// Manoeuvring-target entry: the planner delivers the pipper inside ~17 cone widths of the
    /// Ace gate (6 deg) and the closed loop takes it from there. Exit a little wider than entry
    /// so a target's own reversals hand the fight back to the planner instead of oscillating at
    /// one boundary.
    const double GunTrackLeadEntryRad = 0.1047; // 6 degrees
    const double GunTrackLeadExitRad = 0.1745; // 10 degrees
    bool _fineTrackLatched;
    // Last tick's ballistic aim point and its timestamp, for the tracking law's rate
    // feedforward. Sim-state driven only; not in PolicyMemory, same restore caveat as
    // _ceilingDenial.
    Vec3D _trackAim;
    double _trackAimT = double.NegativeInfinity;

    PilotCommand CompetentAttackCommand(in LowAttackPlan plan) {
        var own = State;
        var toAim = plan.AimPoint - own.Position;
        double horizontalM = System.Math.Sqrt(
            toAim.X * toAim.X + toAim.Z * toAim.Z);
        double desiredGamma = System.Math.Atan2(
            toAim.Y - own.Position.Y, System.Math.Max(1.0, horizontalM));
        double bankLimit = toAim.Length < 1200.0 ? 1.25 : 0.85;
        double bank = LimitedBankTo(plan.AimPoint, bankLimit);

        // Track the swept path angle directly. This is the deliberate exception to the generic
        // Acquire pushover guard: a safe pass may unload into the descent, while the Energy tactic's
        // anti-zoom bunt remains untouched. Converting gamma error to normal-G demand is the
        // coordinated-flight relation inverted at the aircraft's ACTUAL speed.
        double desiredGammaRate = System.Math.Clamp(
            (desiredGamma - own.Gamma) / 1.2, -0.25, 0.25);
        double cosBank = System.Math.Max(0.30, System.Math.Cos(bank));
        double g = (System.Math.Cos(own.Gamma)
            + desiredGammaRate * own.Speed / FlightModel.G0) / cosBank;
        g = System.Math.Clamp(g, -0.20,
            System.Math.Max(-0.20, AvailableAcquireG(safetyReserve: false)));

        double throttle = own.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : own.Speed > _highSpeedMps
                ? System.Math.Min(_maximumThrottle, 0.45)
                : System.Math.Min(_maximumThrottle, 0.90);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    PilotCommand LowLevelHuntCommand(
        in ActorObservation player, in LowAttackPlan plan) {
        var own = State;
        var toAim = plan.AimPoint - own.Position;
        double horizontalM = System.Math.Sqrt(
            toAim.X * toAim.X + toAim.Z * toAim.Z);
        double desiredGamma = System.Math.Atan2(
            toAim.Y - own.Position.Y, System.Math.Max(1.0, horizontalM));

        // Near the hard deck, stop asking the long-horizon optimizer to discover a pull-out one
        // second at a time. Track the already-swept corridor directly while retaining enough bank
        // authority to hunt through a valley turn. The inverted coordinated-flight equation makes
        // the commanded G exactly the amount required to establish/hold that flight-path angle,
        // then caps it at what the wing can generate at this tick's airspeed.
        var lateralAim = plan.AimPoint with { Y = own.Position.Y };
        double bank = LimitedBankTo(lateralAim, 1.38);
        double desiredGammaRate = System.Math.Clamp(
            (desiredGamma - own.Gamma) / 0.75, -0.30, 0.30);
        double cosBank = System.Math.Max(0.25, System.Math.Cos(bank));
        double g = (System.Math.Cos(own.Gamma)
            + desiredGammaRate * own.Speed / FlightModel.G0) / cosBank;
        double rangeM = (player.Position - own.Position).Length;
        if (rangeM <= 1200.0)
            g = System.Math.Max(g, 3.5);
        g = System.Math.Clamp(g, -0.20,
            System.Math.Max(-0.20, plan.AvailableG));

        var line = player.Position - own.Position;
        rangeM = line.Length;
        double closureMps = rangeM > 1.0
            ? (own.VelocityVector() - player.VelocityVector())
                .Dot(line * (1.0 / rangeM))
            : 0.0;
        double throttle = rangeM < 1600.0 && closureMps > 20.0
            ? System.Math.Min(_maximumThrottle, 0.18)
            : own.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : own.Speed > _highSpeedMps
                ? System.Math.Min(_maximumThrottle, 0.45)
                : System.Math.Min(_maximumThrottle, 0.92);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    PilotCommand LowBlockPerchCommand(in ActorObservation player) {
        var own = State;
        var horizontal = new Vec3D(
            player.Position.X - own.Position.X, 0.0,
            player.Position.Z - own.Position.Z);
        if (horizontal.Length < 1.0)
            horizontal = own.ForwardDir() with { Y = 0.0 };
        if (horizontal.Length > 1800.0)
            horizontal = horizontal.Normalized() * 1800.0;
        var perchPoint = own.Position + horizontal;

        double highestSurfaceM = System.Math.Max(
            SurfaceHeightM(_terrain, own.Position.X, own.Position.Z),
            SurfaceHeightM(_terrain, perchPoint.X, perchPoint.Z));
        if (_terrain is not null) {
            try {
                var zeroStart = own.Position with { Y = 0.0 };
                var zeroEnd = perchPoint with { Y = 0.0 };
                double zeroPathClearanceM =
                    GunsOnly.Sim.Environment.TerrainQueries.MinimumClearanceM(
                        _terrain, zeroStart, zeroEnd, maximumHorizontalStepM: 60.0);
                highestSurfaceM = System.Math.Max(
                    highestSurfaceM, System.Math.Max(0.0, -zeroPathClearanceM));
            } catch (System.ArgumentOutOfRangeException) {
                // With no terrain truth ahead, climb in place rather than inventing a valley.
                perchPoint = own.Position + own.ForwardDir() * 800.0;
            }
        }
        perchPoint = perchPoint with {
            Y = System.Math.Max(perchPoint.Y,
                highestSurfaceM + CompetentPerchClearanceM)
        };

        double bank = LimitedBankTo(perchPoint, 0.72);
        double angle = AngleTo(perchPoint);
        double requestedG = System.Math.Clamp(1.55 + angle * 0.90, 1.55, 3.20);
        double g = System.Math.Min(requestedG,
            AvailableAcquireG(safetyReserve: false));
        return new PilotCommand(g, bank, _maximumThrottle, 0.0);
    }

    PilotCommand AcquireCommand(in ActorObservation player) {
        var own = State;
        double range = (player.Position - own.Position).Length;
        double leadSeconds = System.Math.Clamp(range / 900.0, 0.35, 1.35);
        var independentAim =
            player.Position + player.VelocityVector() * leadSeconds;
        bool followingFormationDirective =
            ShouldFollowFormationDirective(player);
        var aim = followingFormationDirective
            ? FormationAimPoint(player, independentAim)
            : independentAim;
        aim = KeepAimInFightVolume(aim);

        double bank = LimitedBankTo(aim, 1.08);
        double angle = AngleTo(aim);
        if (followingFormationDirective
            && EffectiveFormationRole == FormationTacticalRole.Extend) {
            // Extension is separation, not another max-performance turn. AircraftSim still owns
            // the energy actually gained and the terrain reflex above still pre-empts this order.
            return new PilotCommand(
                System.Math.Min(AvailableAcquireG(safetyReserve: false), 1.05),
                System.Math.Clamp(bank, -0.45, 0.45),
                _maximumThrottle,
                0.0);
        }
        // The legacy bank cap (±62°) cannot place the lift vector below the horizon, so a steep
        // climbing pursuit of a target BELOW adds climb instead of converting: gamma-dot =
        // (n·cosφ − cosγ)·g/V stays positive and modern thrust sustains it — production
        // telemetry showed a Novice "fleeing" 10,000 ft upward exactly this way. When climbing
        // steeply at a lower target, unload below cos(gamma) and let gravity bring the nose down
        // before resuming the rate fight.
        var velocity = own.VelocityVector();
        double gamma = System.Math.Asin(System.Math.Clamp(
            velocity.Y / System.Math.Max(own.Speed, 1.0), -1.0, 1.0));
        if (gamma > 0.35 && aim.Y < own.Position.Y - 200.0) {
            // A firm bunt at reduced power: gamma-dot must go decisively negative, and thrust
            // must stop underwriting the climb, or the pushover takes tens of seconds at
            // fighter thrust-to-weight.
            return new PilotCommand(-0.20, bank,
                System.Math.Min(_maximumThrottle, 0.35), 0.0);
        }
        // Rate fighter: point and threaten. Competent stays below an ace's max-performance pull
        // (gain 1.45, cap 3.20); higher skill tiers pull harder via their profile.
        double g = System.Math.Clamp(1.15 + angle * _profile.AcquireGGain, 1.15, _profile.MaxAcquireG);
        double throttle = State.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : State.Speed > _highSpeedMps ? System.Math.Min(_maximumThrottle, 0.45)
            : System.Math.Min(_maximumThrottle, 0.84);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    bool ShouldFollowFormationDirective(in ActorObservation player) {
        FormationTacticalRole role = EffectiveFormationRole;
        if (role is FormationTacticalRole.Independent
                or FormationTacticalRole.Pressure
            || Tactic == BanditTactic.Defend
            || IsGunThreat(player))
            return false;

        // A supporting fighter does not fly past an honest shot merely to touch an abstract
        // station. Once the real, current contact is close to a usable lead solution, ordinary
        // pursuit and fire-control take over. Only the shared formation picture is delayed.
        double rangeM = (player.Position - State.Position).Length;
        double opportunityGateRad = System.Math.Max(
            EffectiveLeadFireConeRad * 1.5,
            6.0 * System.Math.PI / 180.0);
        return rangeM < BanditFireControl.MinimumRangeM
            || rangeM > BanditFireControl.MaximumRangeM
            || BanditFireControl.LeadNoseErrorRad(State, player)
                > opportunityGateRad;
    }

    Vec3D FormationAimPoint(
        in ActorObservation player,
        in Vec3D independentAim) {
        ActorObservation shared = _formationDirective.SharedContact;
        Vec3D sharedForward = shared.ForwardDir();
        var horizontalForward = new Vec3D(
            sharedForward.X, 0.0, sharedForward.Z);
        if (horizontalForward.Length < 1e-6) {
            Vec3D ownForward = State.ForwardDir();
            horizontalForward = new Vec3D(
                ownForward.X, 0.0, ownForward.Z);
        }
        horizontalForward = horizontalForward.Normalized();

        if (EffectiveFormationRole == FormationTacticalRole.Bracket) {
            int sign = _formationDirective.LateralSign == 0
                ? 1
                : _formationDirective.LateralSign;
            // A lateral/aft station forces the player to choose which nose to honour. It is built
            // only from the last delivered shared contact, so a stale radio picture can be wrong
            // without granting either pilot hidden current truth.
            var right = new Vec3D(
                horizontalForward.Z, 0.0, -horizontalForward.X);
            return shared.Position
                + right * (sign * 1300.0)
                - horizontalForward * 350.0;
        }

        if (EffectiveFormationRole == FormationTacticalRole.Extend) {
            Vec3D away = State.Position - shared.Position;
            away = new Vec3D(away.X, 0.0, away.Z);
            if (away.Length < 1e-6) away = horizontalForward * -1.0;
            return State.Position
                + away.Normalized() * 1600.0
                + new Vec3D(
                    0.0,
                    System.Math.Clamp(
                        shared.Position.Y - State.Position.Y,
                        -120.0,
                        120.0),
                    0.0);
        }

        return independentAim;
    }

    PilotCommand DefendCommand() {
        while (T >= _nextJinkAt && T < _defendUntil) {
            _jinkIndex = (_jinkIndex + 1) % JinkDurations.Length;
            _nextJinkAt += JinkDurations[_jinkIndex];
        }

        int direction = _breakSign * JinkDirections[_jinkIndex];
        double bank = direction * 1.18;
        // This simple path serves the deliberately beatable Novice tier. Skilled production tiers
        // defend through LookaheadCommand's airframe-limited max-G candidates; keeping that policy
        // in its real execution path avoids a dead second ceiling here.
        double g = System.Math.Min(
            JinkG[_jinkIndex],
            AvailableAcquireG(safetyReserve: false));
        double throttle = _defensivePower;

        // Near the surface, keep the hard turn but bias it upward rather than pulling into the
        // ground. The floor is the LOCAL one: sample both here and along the escape direction so
        // a jink flown toward rising ground climbs over it instead of trusting sea level.
        var escapeAhead = State.Position + State.ForwardDir() * 800.0;
        double defendFloor = System.Math.Max(
            LocalFloorM(State.Position.X, State.Position.Z),
            LocalFloorM(escapeAhead.X, escapeAhead.Z));
        if (State.Position.Y < defendFloor + 140.0) {
            var safe = new Vec3D(State.Position.X, defendFloor + 420.0, State.Position.Z)
                + State.ForwardDir() * 800.0;
            bank = LimitedBankTo(safe, 0.92);
            g = 2.35;
        }
        return new PilotCommand(g, bank, throttle, direction * 0.10);
    }

    PilotCommand EnergyCommand(in ActorObservation player) {
        var own = State;
        double hereFloor = LocalFloorM(own.Position.X, own.Position.Z);
        // Unload into a shallow descending extension. Once speed is back, SelectTactic sends the
        // bandit straight back to acquire; low altitude instead commands a safe climbing turn.
        if (own.Position.Y < hereFloor + 180.0) {
            var climb = KeepAimInFightVolume(player.Position with { Y = hereFloor + 650.0 });
            return new PilotCommand(1.85, LimitedBankTo(climb, 0.65),
                _maximumThrottle, 0.0);
        }
        // THE EXTENSION IS AIMED AT THE PLAYER, NOSE-LOW -- NOT STRAIGHT AHEAD. Straight ahead
        // (own forward + 1200 m) points AWAY from a player behind the bandit, so once the nose was
        // level the "energy rebuild" flew the range open nose-cold -- traced opening to 4 km, and
        // in the merge the reported "all dots fleeing". Owner doctrine 2026-08-01: an extension is
        // a re-attack, never an escape. Aim at the player's horizontal position instead, so the
        // nose tracks the fight while the descent rebuilds speed; SelectTactic exits Energy the
        // instant speed is back, so this lasts a couple of seconds. The gamma>0.09 nose-high slice
        // BELOW is unchanged -- it still gets a steeply-nose-high bandit's nose down with a fixed
        // bank first; this only redirects what it does ONCE ROUGHLY LEVEL.
        //
        // Held at least 200 m below own altitude and never above the player (nose-LOW is what
        // rebuilds speed and makes a low-speed pull safe), and nudged sideways in WORLD-HORIZONTAL,
        // perpendicular to the player bearing on a constant side, so a player dead ahead-and-below
        // does not sit in the vertical plane where BankToPlaceLiftVectorOn returns +/-pi and the
        // bank chatters. Scaled to the drop so the aim stays a clean diagonal.
        double extensionY = System.Math.Min(own.Position.Y - 200.0, player.Position.Y);
        var extension = KeepAimInFightVolume(player.Position with { Y = extensionY });
        double aheadFloor = LocalFloorM(extension.X, extension.Z);
        if (extension.Y < aheadFloor + 180.0)
            extension = extension with { Y = aheadFloor + 180.0 };
        var extensionFlat = new Vec3D(extension.X - own.Position.X, 0.0,
            extension.Z - own.Position.Z);
        if (extensionFlat.Length > 1e-6) {
            double extensionDropM = System.Math.Max(0.0, own.Position.Y - extension.Y);
            var extensionPerp = new Vec3D(-extensionFlat.Z, 0.0, extensionFlat.X).Normalized();
            extension += extensionPerp
                * (System.Math.Max(500.0, 1.5 * extensionDropM) * _breakSign);
        }
        // A real energy extension is flown toward the horizon, not along whatever flight path
        // Energy was entered with. Nose-high at 0.55 G on an afterburning airframe is an
        // accidental sustained zoom: gamma-dot ~ (n - cos(gamma))*g/V barely moves while thrust
        // holds the speed below the Energy exit gate — production telemetry showed a "fleeing"
        // bandit climbing 10,000 ft that way. Climbing: deep unload at part power so gravity
        // brings the nose down promptly; only then the ordinary max-throttle extension.
        var velocity = own.VelocityVector();
        double gamma = System.Math.Asin(System.Math.Clamp(
            velocity.Y / System.Math.Max(own.Speed, 1.0), -1.0, 1.0));
        if (gamma > 0.09) {
            // Get the nose down the way a pilot does: ROLL, then pull. The old answer here pushed
            // -0.10 G at 40% power wings-level, which is the worst of both worlds. gamma-dot is
            // (n - cos gamma) * g / V, so at n = -0.1 from a 40-degree climb the nose takes about
            // twelve seconds to reach the horizon — and the jet spends all twelve of them climbing
            // at 20,000+ fpm on reduced thrust. Measured: 2,600 ft gained and 28 m/s LOST while
            // nominally "unloading to extend", which is precisely the fleeing-bandit zoom the
            // comment above claims to have fixed.
            //
            // Rolling most of the lift vector off vertical drops the supported component below 1 G
            // so gravity brings the nose down promptly, while the pull keeps the wing working and
            // the throttle keeps the energy. Bank is capped short of inverted: this is a slice to
            // level, not a split-S into the terrain.
            //
            // The roll direction is CHOSEN, not solved for. Aiming it at the extension point is a
            // singularity: that point sits in the vertical plane below the flight path, which is
            // precisely where BankToPlaceLiftVectorOn's atan2 returns +/-pi and the sign is decided
            // by rounding noise. Traced, it alternated between +1.35 and -1.35 rad on consecutive
            // ticks — the jet never rolled at all and pitched to 79 degrees nose-up while nominally
            // recovering. Which way it rolls does not matter here; that it is the same way on the
            // next tick is the entire requirement. Hold the established bank, and break the tie
            // with the same deterministic sign the defensive break uses.
            double side = System.Math.Abs(own.Bank) > 0.05
                ? System.Math.Sign(own.Bank)
                : _breakSign;
            // WHEN FAST AND HIGH, PUT THE NOSE DOWN DECISIVELY. The 1.35 rad (77 deg) cap leaves
            // 0.49 G supporting the climb, so gamma falls only ~2 deg/s -- a bandit that enters
            // nose-high at merge speed MUSHES upward for the whole extension, traced climbing 5.3
            // to 11.5 km while "rebuilding energy", the owner's fleeing zoom. Rolling past vertical
            // (2.0 rad, 115 deg) at 4 G puts the lift vector below the horizon and the nose comes
            // down through level in a second or two. Only above ~135 m/s (below it the pull just
            // scrubs the little speed there is -- the slow nose-high test keeps the gentle version)
            // and with real clearance beneath, since it is a slice toward the ground.
            double clearanceM = own.Position.Y - hereFloor;
            if (clearanceM > 1500.0 && own.Speed > 135.0)
                return new PilotCommand(4.0, side * 2.0, _maximumThrottle, 0.0);
            return new PilotCommand(2.2, side * 1.35, _maximumThrottle, 0.0);
        }
        // The aim point has been clamped back inside the arena and now sits well off the nose, so
        // the shallow 22-degree extension bank cannot get there: at 0.55 G that is 0.4 deg/s, which
        // is not a turn, it is a rounding error. Commit to a real descending energy turn instead.
        // Nose-LOW is what makes this safe to do at low speed — the deep stall that made the
        // low-energy gate outrank the leash in the first place came from Return's nose-HIGH 2.8 G
        // pull, and this is the opposite manoeuvre at full power.
        if (AngleTo(extension) > 0.45) {
            return new PilotCommand(2.6, LimitedBankTo(extension, 1.05), _maximumThrottle, 0.0);
        }
        return new PilotCommand(0.55, LimitedBankTo(extension, 0.38),
            _maximumThrottle, 0.0);
    }

    /// The pair-level counterpart of the funnel below: the session calls this when this
    /// aircraft's formation partner is already fighting, so the pair turns together instead of
    /// one ship parading on after the lesson has visibly ended. Same one-way latch.
    public void EndPresentation() => Presenting = false;

    /// Pure function of kernel state — range, angle-off and accumulated time. No director state,
    /// no wall clock, no randomness, so replays reproduce and FightDirector never counter-picks.
    /// Setting Presenting false is one-way; nothing sets it true again.
    void UpdatePresentWithdrawal(in ActorObservation player, double dt) {
        double range = Geometry.Range(player, State);
        double angleOff = Geometry.AngleOff(player, State);
        bool tracking = range <= PresentFunnelRangeM && angleOff <= PresentFunnelAngleRad;
        _presentHeldSeconds = tracking ? _presentHeldSeconds + dt : 0.0;
        if (_presentHeldSeconds >= PresentHoldSeconds) Presenting = false;
    }

    /// A shallow, constant, predictable turn the newcomer can join up on. It does not react to the
    /// player at all — that is exactly what makes it presenting rather than defending. The task it
    /// sets is closure and station-keeping: formation flying, which is the same motor skill as gun
    /// tracking, learned without anyone being told they are being taught.
    /// What the aircraft actually flies. The planned command is computed and recorded normally;
    /// while presenting it is simply not the one that reaches the airframe.
    PilotCommand CommandForFlight() => Presenting ? PresentCommand() : LastCommand;

    PilotCommand PresentCommand() {
        const double bank = 0.26;                                  // 15 deg: readable, under 2 G
        double g = 1.0 / System.Math.Cos(bank);                    // sustains the turn level
        double throttle = State.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.00)
            : System.Math.Min(_maximumThrottle, 0.70);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    /// The leash trigger: beyond gun-fight range AND the gap is still growing.
    ///
    /// RANGE RATE, not range alone. Range alone looked right and was wrong: the staged opening is a
    /// 9 km run-in, so an unqualified range test fired through the entire merge, cancelled the
    /// lookahead for its whole duration, and flew the opening on a single scripted command. That
    /// also starved the planner-teacher pipeline — PlannerShadowRoutingCoordinatorTests seeds its
    /// fixture from the first sample of an Ace episode, and there were no samples left to take.
    /// What was actually reported was not distance, it was distance INCREASING, which is this.
    bool IsOpeningBeyondReengageRange(in ActorObservation player) {
        var own = State;
        var toPlayer = player.Position - own.Position;
        double range = toPlayer.Length;
        if (range <= ReengageRangeM) return false;
        // Small positive deadband so a bandit holding range does not flicker in and out of the
        // leash on numerical noise.
        double openingMps = (player.VelocityVector() - own.VelocityVector())
            .Dot(toPlayer * (1.0 / range));
        return openingMps > 5.0;
    }

    /// Nose onto the player and accelerate. Deliberately NOT ReturnCommand: that one flies to the
    /// spawn-centred fight volume, which is the wrong answer once the player is the thing that has
    /// moved — it can open the range while dutifully "returning". The floor guard is the same one
    /// the defensive jink uses, so a re-engage that points downhill still clears the ground.
    PilotCommand ReengageCommand(in ActorObservation player) {
        var own = State;
        var aim = KeepAimInFightVolume(player.Position);
        double floorHere = LocalFloorM(own.Position.X, own.Position.Z);
        if (aim.Y < floorHere + 300.0) aim = aim with { Y = floorHere + 300.0 };
        // Keep the aim point within a bounded vertical step of our own altitude. A target far below
        // the flight path drives BankToPlaceLiftVectorOn toward +/-pi — the same ill-conditioned
        // geometry the nose-high recovery hits — and the bank limit then turns the "descend and
        // re-engage" into a 75-degree banked LEVEL turn that holds altitude indefinitely. Traced,
        // that floated the bandit to 44,000 ft while nominally re-engaging a player at 15,000 ft.
        // Walking the aim down in steps keeps the solution well conditioned and the descent honest.
        aim = aim with {
            Y = own.Position.Y + System.Math.Clamp(aim.Y - own.Position.Y, -900.0, 900.0)
        };
        // Clamping the vertical delta shortens the descent; it does NOT move the aim out of the
        // vertical plane through the velocity vector, which is the actual singular geometry. A
        // player dead ahead-and-below (or dead astern-and-below) still drives the bank solution to
        // +/-pi, where the sign is rounding noise and the command chatters left/right every tick.
        // Nudge the aim sideways — toward the side the player already lies on — so the solution is
        // always well conditioned. The offset is small enough not to bend the intercept.
        var flatToPlayer = new Vec3D(player.Position.X - own.Position.X, 0.0,
            player.Position.Z - own.Position.Z);
        if (flatToPlayer.Length < 400.0) {
            var wing = new Vec3D(0.0, 1.0, 0.0).Cross(own.ForwardDir());
            if (wing.Length > 1e-6)
                aim += wing.Normalized() * (400.0 * _breakSign);
        }
        // Sample the floor along the path we are about to fly, not just under our feet. Defend and
        // Energy both do this; this command did not, so a re-engage toward a low player over rising
        // ground cleared the aim point and flew the jet into the ridge in between.
        double aheadFloorM = LocalFloorM(
            own.Position.X + own.ForwardDir().X * 900.0,
            own.Position.Z + own.ForwardDir().Z * 900.0);
        double pathFloorM = System.Math.Max(floorHere, aheadFloorM);
        if (aim.Y < pathFloorM + 300.0) aim = aim with { Y = pathFloorM + 300.0 };
        double angle = AngleTo(aim);
        // Hard enough to actually convert the geometry, soft enough not to scrub to the corner and
        // arrive at the merge slow: past 90 degrees off it is a max-perform reversal, inside that
        // it tightens with the angle.
        // AvailableAcquireG can fall below the 1.4 floor in thin air or at low speed, so this is a
        // Min against a floored ceiling, not a Clamp — Clamp throws when min exceeds max.
        double g = System.Math.Min(1.4 + angle * 2.6,
            System.Math.Max(1.05, AvailableAcquireG(safetyReserve: true)));
        return new PilotCommand(g, LimitedBankTo(aim, 1.30), _maximumThrottle, 0.0);
    }

    PilotCommand ReturnCommand() {
        // The per-fight ceiling (not the legacy low-level constant) bounds the return target, and
        // the floor is the local surface at the fight centre.
        double centreFloor = LocalFloorM(_fightCentre.X, _fightCentre.Z);
        double lowY = centreFloor + 300.0;
        double highY = System.Math.Max(lowY, _ceilingM - 300.0);
        var target = _fightCentre with {
            Y = System.Math.Clamp(_fightCentre.Y + 250.0, lowY, highY)
        };
        double angle = AngleTo(target);
        // NEVER CLIMB HOME. When the centre is well below -- the ordinary case after a fight was
        // dragged up -- the 0.95 rad (54 deg) cap leaves 1.65 G of vertical lift at 2.8 G, so the
        // "return" was a shallow CLIMBING turn (traced gamma +57 deg, 6.4 to 8.8 km), the reported
        // fleeing. Roll steeper (77 deg) so the pull slices the nose DOWN toward the centre below
        // and trade the altitude back into speed. The centre is horizontally offset from a strayed
        // bandit, so the bank is well-conditioned without a nudge. Owner doctrine: descend back
        // into the fight, never fly away from it.
        double altExcessM = State.Position.Y - target.Y;
        if (altExcessM > 400.0) {
            double diveBank = LimitedBankTo(target, 1.35);
            double diveG = System.Math.Clamp(2.0 + angle * 1.2, 2.0, 3.8);
            return new PilotCommand(diveG, diveBank, _maximumThrottle, 0.0);
        }
        double bank = LimitedBankTo(target, 0.95);
        double g = System.Math.Clamp(1.2 + angle * 1.15, 1.2, 2.8);
        double throttle = State.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : System.Math.Min(_maximumThrottle, 0.72);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    Vec3D KeepAimInFightVolume(in Vec3D aim) {
        // A SUPPORT FIGHTER'S ARENA IS THE FIGHT, NOT ITS SPAWN. This clamp used to pin every aim
        // to within 4.7 km of _fightCentre = the bandit's OWN spawn. For the primary that is fine
        // (the player stays with it, so its bubble is where the fight is). For a WINGMAN it is the
        // whole bug: after the opening bracket/extend displaces it, the player maneuvers off with
        // the primary, the fight drifts past 4.7 km of the wingman's spawn, and then Reengage/
        // Acquire/Energy -- ALL of which route through here -- get clamped back toward that empty
        // spawn bubble instead of the player. The wingman flies home to nowhere and the range opens
        // without bound (telemetry: 0.7 -> 13 NM, zero mutual support). Diagnosed by an independent
        // review 2026-08-01. So for a support role (Bracket/Extend -- which EffectiveFormationRole
        // only reports when the shared contact is valid, finite and fresh) the clamp recentres on
        // the SHARED CONTACT (the player everyone is fighting), up to the finite formation-support
        // abandon range. Beyond that it returns to _fightCentre even if the coordinator keeps a
        // fresh role alive, preventing a departing player from pulling both opponents across the
        // theatre. Pressure (the primary) and Independent bandits keep _fightCentre, so nothing
        // about the primary changes. When the aim is already inside the radius the result is
        // aim.X/aim.Z regardless of centre, so every close-range formation test stays bit-identical.
        bool supportFightInRange = (EffectiveFormationRole is FormationTacticalRole.Bracket
                or FormationTacticalRole.Extend)
            && Geometry.Range(State, _formationDirective.SharedContact)
                <= FormationSupportAbandonChaseRangeM;
        Vec3D centre = supportFightInRange
            ? _formationDirective.SharedContact.Position
            : _fightCentre;
        var horizontal = new Vec3D(aim.X - centre.X, 0.0, aim.Z - centre.Z);
        if (horizontal.Length > ReturnRadiusM - 500.0)
            horizontal = horizontal.Normalized() * (ReturnRadiusM - 500.0);
        double x = centre.X + horizontal.X;
        double z = centre.Z + horizontal.Z;
        double floorY = LocalFloorM(x, z) + 180.0;
        double y = System.Math.Clamp(aim.Y, floorY,
            System.Math.Max(floorY, _ceilingM - 180.0));
        return new Vec3D(x, y, z);
    }

    double LimitedBankTo(in Vec3D target, double limit) =>
        System.Math.Clamp(Geometry.BankToPlaceLiftVectorOn(State, target), -limit, limit);

    double AngleTo(in Vec3D target) {
        var line = (target - State.Position).Normalized();
        return System.Math.Acos(System.Math.Clamp(State.ForwardDir().Dot(line), -1.0, 1.0));
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double dx = a.X - b.X, dz = a.Z - b.Z;
        return System.Math.Sqrt(dx * dx + dz * dz);
    }

    // ---- Lookahead BFM decision layer -----------------------------------------------------------

    /// Choose the maneuver that best improves the future firing position. A small candidate set
    /// spans the fight (hard/moderate lead-turn, a pull into the vertical, a nose-low reposition, an
    /// unload/extend, and a reverse); each is rolled forward LookaheadHorizonTicks in a throwaway
    /// probe of the real kernel while the player is predicted by honest physical extension of the
    /// OBSERVED state only. The choice is recomputed on a fixed tick cadence and held between
    /// recomputes so the rollout cost stays bounded and the whole layer stays deterministic.
    PilotCommand LookaheadCommand(in ActorObservation player,
        LowAttackPlan? lowAttackPlan = null) {
        bool usesLowAttack = lowAttackPlan.HasValue;
        bool contextChanged =
            !_lookaheadCommandValid
            || _lookaheadCommandUsesLowAttack != usesLowAttack
            || _lookaheadCommandContactIdentity != player.ContactIdentity
            || (_lookaheadPlanPending
                && (_lookaheadPlanUsesLowAttack != usesLowAttack
                    || _lookaheadPlanContactIdentity
                        != player.ContactIdentity));
        bool invalidatesBoundContext =
            contextChanged && _lookaheadContextBound;
        if (!contextChanged && !_lookaheadContextBound) {
            // Contact identity zero is a valid session identity, but it also matches the
            // constructor defaults. Bind that first observed generic context even off cadence so
            // a subsequent pre-plan contact switch is treated as a real invalidation.
            _lookaheadCommandUsesLowAttack = usesLowAttack;
            _lookaheadCommandContactIdentity = player.ContactIdentity;
            _lookaheadContextBound = true;
        }
        if (contextChanged) {
            // Generic BFM and a terrain-certified low-block corridor are different tactical
            // contracts. Never finish or continue holding one as the other merely because the
            // context changed between cadence lanes. Hold a safe command instead of starting
            // unscheduled work which could overlap the actor's formation partner.
            CancelPendingLookaheadPlan();
            // The constructor's generic first-contact hold is already a bounded command. Preserve
            // it while the first incremental plan is frozen so opt-in does not create an
            // unrecorded maneuver change. A low-block context is the exception: its safe perch is
            // terrain-specific and must replace the generic hold immediately.
            if (invalidatesBoundContext || usesLowAttack)
                _lookaheadCommand = usesLowAttack
                    ? LowBlockPerchCommand(player)
                    : AcquireCommand(player);
            _lookaheadCommandUsesLowAttack = usesLowAttack;
            _lookaheadCommandContactIdentity =
                player.ContactIdentity;
            _lookaheadCommandValid = true;
            _lookaheadContextBound = true;
        }

        if (_lookaheadPlanPending) {
            // Keep cadence telemetry advancing while the frozen plan is evaluated. Every current
            // level completes its nine slots before another twelve-tick boundary can arrive.
            _ = LookaheadDecisionDue(player.SourceTick);
            EvaluatePendingLookahead(
                MaximumCandidateEvaluationsPerTick(_computeLevel));
            return _lookaheadCommand;
        }

        if (!LookaheadDecisionDue(player.SourceTick)) {
            if (invalidatesBoundContext)
                RecordSingleCandidateDecision(
                    _lookaheadCommand,
                    invalidatesLookaheadHold: false);
            return _lookaheadCommand;
        }

        StartLookaheadPlan(player, lowAttackPlan);
        EvaluatePendingLookahead(_incrementalAiPlanning
            ? MaximumCandidateEvaluationsPerTick(_computeLevel)
            : int.MaxValue);
        if (invalidatesBoundContext && _lookaheadPlanPending)
            RecordSingleCandidateDecision(
                _lookaheadCommand,
                invalidatesLookaheadHold: false);
        return _lookaheadCommand;
    }

    void StartLookaheadPlan(
        in ActorObservation player,
        LowAttackPlan? lowAttackPlan) {
        // Freeze every mutable input before the first candidate runs. Authoritative ownship and
        // contact motion continue on later ticks, but every candidate in this plan receives this
        // exact same decision-boundary snapshot.
        _lookaheadPlanOwn = State;
        _lookaheadPlanPlayer = player;
        _lookaheadPlanTerrain = _terrain;
        _lookaheadPlanAtmosphere = _sim.AtmosphereModel;
        _lookaheadPlanWind = _sim.Wind;
        _lookaheadPlanThrustFraction = _sim.ThrustFraction;
        _lookaheadPlanBossCommitted = BossCommitted;
        _lookaheadPlanPredictionSubstepTicks = _incrementalAiPlanning
            ? PredictionSubstepTicks(_computeLevel)
            : PredictionSubstepTicks(AiComputeLevel.Full);
        _lookaheadPlanUsesLowAttack = lowAttackPlan.HasValue;
        _lookaheadPlanContactIdentity = player.ContactIdentity;
        _lookaheadContextBound = true;

        double range = (player.Position - State.Position).Length;
        // Steer to the SAME ballistic solution fire control scores the shot against. The low-attack
        // plan keeps its own aim point: that one is a terrain-certified descent path, not a gun
        // solution, and overriding it here would fly the bandit into the ground.
        var independentLeadPoint = lowAttackPlan?.AimPoint
            ?? BanditFireControl.LeadPoint(State, player);
        bool followingFormationDirective = lowAttackPlan is null
            && ShouldFollowFormationDirective(player);
        var leadPoint = followingFormationDirective
            ? FormationAimPoint(player, independentLeadPoint)
            : independentLeadPoint;

        // Throttle schedule mirrors the acquire law's energy management so lookahead never
        // manufactures thrust the airframe cannot deliver.
        double fastThrottle = System.Math.Min(_maximumThrottle, 1.05);
        double cruiseThrottle = System.Math.Min(_maximumThrottle, 0.84);
        double maxG = AvailableAcquireG(safetyReserve: false);

        // Full 3D pursuit uses the UNCLAMPED lift-vector-on-target roll: the bank that places the
        // lift vector on the aim point may exceed 90 deg (rolling toward inverted) so the ace can
        // pull its nose DOWN onto a target below and behind -- a Split-S / nose-low recommit the old
        // 74 deg-clamped state machine could never fly. Whether the pull ends up level, nose-high, or
        // nose-low is decided by the score, not scripted.
        double bankOnLead = Geometry.BankToPlaceLiftVectorOn(State, leadPoint);
        // Pull into the vertical: place the lift vector up-and-across (a high yo-yo).
        var verticalAim = leadPoint + new Vec3D(0.0, System.Math.Max(900.0, range * 0.9), 0.0);
        // Nose-low reposition (low yo-yo): tighten in-plane and regain energy when fast and high.
        var lowAim = lowAttackPlan?.AimPoint
            ?? leadPoint + new Vec3D(0.0, -System.Math.Max(500.0, range * 0.5), 0.0);

        // Defensive lift-vector placements. Project an up-and-across direction onto the plane
        // perpendicular to the observed attacker LOS, then give the scorer both sides of that
        // out-of-plane exit. These are possibilities, not scripted reactions: they still compete
        // with every offensive candidate through the same rollout score.
        var attackerLos = player.Position - State.Position;
        var attackerLosDir = attackerLos.Length > 1e-6
            ? attackerLos.Normalized()
            : State.ForwardDir() * -1.0;
        var worldUp = new Vec3D(0.0, 1.0, 0.0);
        var across = worldUp.Cross(attackerLosDir);
        if (across.Length < 1e-6)
            across = new Vec3D(1.0, 0.0, 0.0);
        else
            across = across.Normalized();
        var upAcross = worldUp + across;
        upAcross -= attackerLosDir * upAcross.Dot(attackerLosDir);
        if (upAcross.Length < 1e-6) upAcross = across;
        upAcross = upAcross.Normalized();
        var reverseAcross = worldUp * 0.35 - across;
        reverseAcross -= attackerLosDir * reverseAcross.Dot(attackerLosDir);
        if (reverseAcross.Length < 1e-6) reverseAcross = across * -1.0;
        reverseAcross = reverseAcross.Normalized();
        double defensiveOffsetM = System.Math.Max(900.0, range);
        var breakAim = State.Position + upAcross * defensiveOffsetM;
        var reverseAim = State.Position + reverseAcross * defensiveOffsetM;
        Vec3D separationContact = followingFormationDirective
                && EffectiveFormationRole == FormationTacticalRole.Extend
            ? _formationDirective.SharedContact.Position
            : player.Position;
        var awayFromPlayer = State.Position - separationContact;
        if (awayFromPlayer.Length < 1e-6)
            awayFromPlayer = State.ForwardDir();
        var separateAim = State.Position + awayFromPlayer.Normalized() * 1400.0;
        double breakBank = Geometry.BankToPlaceLiftVectorOn(State, breakAim);
        double orthogonalReverseBank = Geometry.BankToPlaceLiftVectorOn(State, reverseAim);
        // Fixed storage is owned by the controller and reused plan after plan. The candidate order
        // is the historical declaration order because it is also the deterministic tie-break.
        _lookaheadCandidates[0] =
            new(maxG, bankOnLead, fastThrottle, 0.0);
        _lookaheadCandidates[1] =
            new(System.Math.Min(maxG, 4.0), bankOnLead, cruiseThrottle, 0.0);
        _lookaheadCandidates[2] =
            new(System.Math.Min(maxG, 6.5),
                Geometry.BankToPlaceLiftVectorOn(State, verticalAim),
                fastThrottle, 0.0);
        _lookaheadCandidates[3] =
            new(System.Math.Min(maxG, 5.5),
                Geometry.BankToPlaceLiftVectorOn(State, lowAim),
                fastThrottle, 0.0);
        _lookaheadCandidates[4] =
            new(System.Math.Min(maxG, 1.05), LimitedBankTo(leadPoint, 0.45),
                _maximumThrottle, 0.0);
        _lookaheadCandidates[5] =
            new(System.Math.Min(maxG, 4.5), -bankOnLead, cruiseThrottle, 0.0);
        _lookaheadCandidates[6] =
            new(maxG, breakBank, fastThrottle, 0.0);
        _lookaheadCandidates[7] =
            new(System.Math.Min(maxG, 4.5), orthogonalReverseBank,
                cruiseThrottle, 0.0);
        _lookaheadCandidates[8] =
            new(1.05, LimitedBankTo(separateAim, 0.45), _maximumThrottle, 0.0);

        for (int i = 0; i < BanditDecisionTrace.CandidateCapacity; i++) {
            bool available = i < 6
                || ((i is 6 or 7) && _profile.ForcesOvershoot)
                || (i == 8 && (_profile.DisengagesWhenLosing
                    || (followingFormationDirective
                        && EffectiveFormationRole == FormationTacticalRole.Extend)));
            _lookaheadCandidateAvailable[i] = available;
            _lookaheadCandidateScores[i] = 0.0;
            // Store each term separately so completing an incremental Full plan performs the same
            // left-to-right floating-point additions as the historical synchronous expression.
            _lookaheadDoctrineBiases[i] = DoctrineOpenerBias(i, player);
            _lookaheadTailBiases[i] = TailContestBias(i, player);
            _lookaheadFormationBiases[i] =
                FormationRoleBias(i, followingFormationDirective);
        }

        _lookaheadNextCandidateIndex = 0;
        _lookaheadBestScore = double.NegativeInfinity;
        _lookaheadBestCommand = _lookaheadCandidates[0];
        _lookaheadBestIndex = 0;
        _lookaheadPlanPending = true;
        _plansStarted++;
    }

    void EvaluatePendingLookahead(int maximumCandidateEvaluations) {
        if (!_lookaheadPlanPending) return;

        int evaluated = 0;
        while (_lookaheadNextCandidateIndex
                < BanditDecisionTrace.CandidateCapacity
            && evaluated < maximumCandidateEvaluations) {
            int index = _lookaheadNextCandidateIndex++;
            if (!_lookaheadCandidateAvailable[index]) continue;

            double score = ScoreCandidate(
                _lookaheadCandidates[index],
                _lookaheadPlanOwn,
                _lookaheadPlanPlayer,
                _lookaheadPlanTerrain,
                _lookaheadPlanAtmosphere!,
                _lookaheadPlanWind,
                _lookaheadPlanThrustFraction,
                _lookaheadPlanBossCommitted,
                _lookaheadPlanPredictionSubstepTicks,
                out int forecastSteps,
                out int terrainSweeps);
            score += _lookaheadDoctrineBiases[index];
            score += _lookaheadTailBiases[index];
            score += _lookaheadFormationBiases[index];
            _lookaheadCandidateScores[index] = score;
            _candidateEvaluations++;
            _forecastSteps += forecastSteps;
            _terrainSweeps += terrainSweeps;
            evaluated++;

            if (score > _lookaheadBestScore) {
                _lookaheadBestScore = score;
                _lookaheadBestCommand = _lookaheadCandidates[index];
                _lookaheadBestIndex = index;
            }
        }

        while (_lookaheadNextCandidateIndex
                < BanditDecisionTrace.CandidateCapacity
            && !_lookaheadCandidateAvailable[_lookaheadNextCandidateIndex])
            _lookaheadNextCandidateIndex++;

        if (_lookaheadNextCandidateIndex
            < BanditDecisionTrace.CandidateCapacity)
            return;

        bool completedPlanUsesLowAttack =
            _lookaheadPlanUsesLowAttack;
        long completedPlanContactIdentity =
            _lookaheadPlanContactIdentity;
        _lookaheadPlanPending = false;
        _lookaheadPlanUsesLowAttack = false;
        _lookaheadPlanContactIdentity = 0;
        _plansCompleted++;
        _lookaheadCommand = _lookaheadBestCommand;
        _lookaheadCommandUsesLowAttack =
            completedPlanUsesLowAttack;
        _lookaheadCommandContactIdentity =
            completedPlanContactIdentity;
        _lookaheadCommandValid = true;
        DecisionTrace = new BanditDecisionTrace(
            ++_selectionSequence,
            Skill,
            _lookaheadBestCommand,
            _lookaheadBestIndex,
            BanditDecisionTrace.CandidateCapacity,
            new BanditDecisionCandidate(
                0, _lookaheadCandidates[0], _lookaheadCandidateScores[0],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                1, _lookaheadCandidates[1], _lookaheadCandidateScores[1],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                2, _lookaheadCandidates[2], _lookaheadCandidateScores[2],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                3, _lookaheadCandidates[3], _lookaheadCandidateScores[3],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                4, _lookaheadCandidates[4], _lookaheadCandidateScores[4],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                5, _lookaheadCandidates[5], _lookaheadCandidateScores[5],
                HasScore: true, Available: true),
            new BanditDecisionCandidate(
                6, _lookaheadCandidates[6], _lookaheadCandidateScores[6],
                HasScore: _lookaheadCandidateAvailable[6],
                Available: _lookaheadCandidateAvailable[6]),
            new BanditDecisionCandidate(
                7, _lookaheadCandidates[7], _lookaheadCandidateScores[7],
                HasScore: _lookaheadCandidateAvailable[7],
                Available: _lookaheadCandidateAvailable[7]),
            new BanditDecisionCandidate(
                8, _lookaheadCandidates[8], _lookaheadCandidateScores[8],
                HasScore: _lookaheadCandidateAvailable[8],
                Available: _lookaheadCandidateAvailable[8]));
    }

    static int MaximumCandidateEvaluationsPerTick(AiComputeLevel level) =>
        level == AiComputeLevel.Full ? 2 : 1;

    static int PredictionSubstepTicks(AiComputeLevel level) => level switch {
        AiComputeLevel.Full => 4,
        AiComputeLevel.Balanced => 6,
        AiComputeLevel.Constrained => 8,
        AiComputeLevel.Emergency => 12,
        _ => throw new System.ArgumentOutOfRangeException(nameof(level))
    };

    void CancelPendingLookaheadPlan() {
        // A cancel is an EVENT -- contact change, low-attack context change, level change. The
        // cadence stride throttles routine replanning only; making the jet slow to react to a
        // new contact would buy frames by making the AI wrong, which is not a trade worth taking.
        _lookaheadForceNextLane = true;
        _lookaheadPlanPending = false;
        _lookaheadPlanUsesLowAttack = false;
        _lookaheadPlanContactIdentity = 0;
        _lookaheadNextCandidateIndex = 0;
    }

    /// How many eligible cadence lanes to skip between replans. The compute governor previously
    /// varied only candidate count (2 at Full, 1 everywhere else) and prediction substeps, never
    /// how OFTEN the expensive lookahead ran — so demoting bought almost nothing. Recorded tapes
    /// bear that out: across 41 demotions the median frame p95 went 18.0 ms to 18.4 ms, and 73%
    /// of demotions failed to improve it at all.
    ///
    /// Full and Balanced are deliberately 1, so the default machine's AI is bit-identical and
    /// only an already-struggling machine trades tactical freshness for frames. Derived from the
    /// tick, never wall time, so replay determinism holds.
    static int LookaheadCadenceStride(AiComputeLevel level) => level switch {
        AiComputeLevel.Full => 1,
        AiComputeLevel.Balanced => 1,
        AiComputeLevel.Constrained => 2,
        AiComputeLevel.Emergency => 3,
        _ => 1
    };

    bool LookaheadDecisionDue(long sourceTick) {
        int stride = LookaheadCadenceStride(_computeLevel);
        if (_absoluteLookaheadCadencePhase is int absolutePhase) {
            int observedPhase = (int)(sourceTick % LookaheadDecisionCadenceTicks);
            int ticksUntilDecision =
                (absolutePhase - observedPhase + LookaheadDecisionCadenceTicks)
                % LookaheadDecisionCadenceTicks;
            // At a degraded level, take only every `stride`-th eligible lane. The lane phase
            // itself is untouched, so pair dephasing survives a demotion.
            bool strideAllows = stride <= 1
                || _lookaheadForceNextLane
                || (sourceTick / LookaheadDecisionCadenceTicks) % stride == 0;
            bool due = ticksUntilDecision == 0
                && strideAllows
                && _lastAbsoluteLookaheadDecisionTick != sourceTick;
            if (due) {
                _lookaheadForceNextLane = false;
                _lastAbsoluteLookaheadDecisionTick = sourceTick;
                _lookaheadHoldTicks = LookaheadDecisionCadenceTicks - 1;
                return true;
            }

            // Preserve the telemetry meaning: held decision ticks remaining after this tick.
            _lookaheadHoldTicks = ticksUntilDecision == 0
                ? LookaheadDecisionCadenceTicks - 1
                : ticksUntilDecision - 1;
            return false;
        }

        if (_lookaheadHoldTicks > 0) {
            _lookaheadHoldTicks--;
            return false;
        }
        _lookaheadHoldTicks =
            LookaheadDecisionCadenceTicks * (_lookaheadForceNextLane ? 1 : stride) - 1;
        _lookaheadForceNextLane = false;
        return true;
    }

    double FormationRoleBias(
        int candidateIndex,
        bool followingFormationDirective) {
        if (!followingFormationDirective) return 0.0;
        return EffectiveFormationRole switch {
            // The target point already carries the delayed lateral station. Prefer a sustainable
            // pull toward it, but leave the physical rollout free to reject unsafe geometry.
            FormationTacticalRole.Bracket when candidateIndex == 1 => 28.0,
            FormationTacticalRole.Bracket when candidateIndex == 4 => 12.0,
            FormationTacticalRole.Bracket when candidateIndex is 2 or 3 => 7.0,
            // Candidate 8 is the true separation manoeuvre. A secondary reward on the historical
            // unload lets terrain/energy scoring choose the safer of two extension shapes.
            FormationTacticalRole.Extend when candidateIndex == 8 => 45.0,
            FormationTacticalRole.Extend when candidateIndex == 4 => 20.0,
            _ => 0.0
        };
    }

    double DoctrineOpenerBias(int candidateIndex, in ActorObservation player) {
        if (_doctrine == 0 || T >= 2.0 || IsGunThreat(player)) return 0.0;
        double fade = 1.0 - T / 2.0;
        // Ace/Machine lead scoring measures sub-degree ballistic error in cone widths, so their
        // established two-second opener needs the same score scale to remain observable. Veteran
        // uses ordinary LOS scoring and keeps the historical light touch: a large energy-opener
        // bias there would override its honest response to an attacker already on its tail.
        double scale = Skill is PilotSkill.Ace or PilotSkill.Machine ? 60.0 : 1.0;
        return _doctrine switch {
            // One-circle / energy opener: favour the sustainable pull and the historical unload.
            1 when candidateIndex == 1 => scale * fade,
            1 when candidateIndex == 4 => 3.0 * scale * fade,
            // Vertical entry: favour the existing high-yo-yo candidate.
            2 when candidateIndex == 2 => 4.0 * scale * fade,
            _ => 0.0
        };
    }

    double TailContestBias(int candidateIndex, in ActorObservation player) {
        if (Skill == PilotSkill.Machine
            || !_profile.ForcesOvershoot
            || !IsGunThreat(player))
            return 0.0;

        // Contest entry to the saddle before the attacker's three-degree solution exists. Waiting
        // for the rollout's gun-window penalty alone reacts only after the player is already
        // stabilized. Alternate the two honest out-of-plane candidates on deterministic sim time,
        // so the defender breaks and reverses instead of settling into a predictable orbit.
        int preferred = ((int)System.Math.Floor(T / 0.85) & 1) == 0 ? 6 : 7;
        if (candidateIndex == preferred) return 22.0;
        if (candidateIndex is 6 or 7) return 17.0;
        if (candidateIndex == 5) return 7.0;
        if (candidateIndex == 8 && _profile.DisengagesWhenLosing) return 9.0;
        return 0.0;
    }

    void RecordSingleCandidateDecision(
        in PilotCommand command,
        bool invalidatesLookaheadHold = true) {
        if (invalidatesLookaheadHold)
            _lookaheadCommandValid = false;
        var selected = new BanditDecisionCandidate(
            0, command, Score: 0.0, HasScore: false, Available: true);
        DecisionTrace = new BanditDecisionTrace(
            ++_selectionSequence,
            Skill,
            command,
            SelectedCandidateIndex: 0,
            CandidateCount: 1,
            selected,
            default,
            default,
            default,
            default,
            default);
    }

    /// Roll one held candidate command forward in a throwaway probe of the deterministic kernel while
    /// predicting the player by a coordinated-turn extension of the OBSERVED state (belief-limited and
    /// honest: no hidden opponent internals are read). Higher return is a better future firing
    /// position. Pure function of the two passed states — no wall clock, RNG, or hidden truth.
    /// How many authority ticks each PREDICTION step covers. The lookahead is a forecast, not the
    /// authoritative sim, and it does not need 120 Hz fidelity to decide which of nine manoeuvres
    /// ends up with the better sight picture a second from now.
    ///
    /// This is a frame-pacing fix, not a tuning knob. The decision fires on one tick in twelve and
    /// holds for the other eleven, so the whole 9-candidate rollout detonates inside a SINGLE tick —
    /// and therefore a single rendered frame, on the browser's main thread. Measured: median tick
    /// 0.002 ms, worst tick 2.76 ms for the Ace — a 1,400x spike, roughly a whole 16.7 ms frame
    /// budget once WASM's penalty is applied. Production tapes show exactly that: p95 stepping
    /// 17 -> 33 -> 50 ms with Novice -> Competent -> Ace, and snapping back to 16.9 ms the instant
    /// the bandit dies. Coarser prediction steps cut the PEAK without touching decision cadence,
    /// command freshness, or the horizon in seconds.
    ///
    /// Terrain safety is unaffected: the swept clearance query below samples each segment at
    /// maximumHorizontalStepM regardless of how long the segment is, so a longer step still checks
    /// every intervening grid cell rather than skipping over a ridge.
    // Full preserves the established 30 Hz forecast. Pressure levels cover the same horizon with
    // progressively coarser throwaway integration; authoritative flight remains fixed at 120 Hz.
    double ScoreCandidate(
        in PilotCommand command,
        in AircraftState own,
        in ActorObservation player,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain,
        IAtmosphereModel atmosphere,
        GunsOnly.Sim.Turbulence.IWindField? wind,
        double thrustFraction,
        bool bossCommitted,
        int predictionSubstepTicks,
        out int forecastSteps,
        out int terrainSweeps) {
        const double threatWeight = 26.0;
        forecastSteps = 0;
        terrainSweeps = 0;
        // Optimize the envelope the trigger can ACTUALLY use. The old 12-degree camera window made
        // the lookahead tests look threatening while first-pass-safe production fights never fired:
        // every selected "solution" remained outside BanditFireControl's real 3-degree gate. The
        // optimizer deliberately keeps chasing 3-degree solutions even for a profile with a wider
        // TRIGGER cone: the wide gate is opportunistic tracer pressure on the way through, not a
        // license to fly sloppier geometry (widening the shaping cone here re-flattens the angle
        // gradient and the controller goes back to orbiting outside the gate).
        const double gunConeRad = BanditFireControl.MaximumNoseErrorRad;
        var probe = new AircraftSim(own, _parameters, atmosphere) { Wind = wind };
        probe.SeedEnginePowerFraction(thrustFraction);

        // Belief-limited player prediction: a coordinated turn extrapolated from the OBSERVED state
        // only (speed, flight-path angle, and the reported flight-path bank). This is honest -- it
        // reads no hidden opponent internals -- and, unlike a straight-line guess, it anticipates a
        // maneuvering target curving back into the fight instead of appearing to flee forever.
        var predictedPos = player.Position;
        double predChi = player.Chi;
        double predGamma = player.Gamma;
        double predSpeed = player.Speed;
        double predTurnRate = predSpeed > 1.0
            ? FlightModel.G0 * System.Math.Tan(System.Math.Clamp(player.Bank, -1.3, 1.3)) / predSpeed
            : 0.0;
        var initialPlayerToProbe = own.Position - player.Position;
        double initialPlayerRangeM = initialPlayerToProbe.Length;
        double initialPlayerAngleOffRad = initialPlayerRangeM > 1e-6
            ? System.Math.Acos(System.Math.Clamp(
                player.ForwardDir().Dot(initialPlayerToProbe * (1.0 / initialPlayerRangeM)),
                -1.0, 1.0))
            : 0.0;
        double initialPlayerClosureMps = initialPlayerRangeM > 1e-6
            ? -(own.VelocityVector() - player.VelocityVector())
                .Dot(initialPlayerToProbe * (1.0 / initialPlayerRangeM))
            : 0.0;

        double windowSeconds = 0.0;
        double threatSeconds = 0.0;
        double minClearanceM = own.Position.Y
            - SurfaceHeightM(terrain, own.Position.X, own.Position.Z);
        double maxY = own.Position.Y;
        var previousProbePosition = own.Position;
        // Same horizon in SECONDS, fewer prediction steps to cover it. The last step is shortened
        // when a tier's exact horizon is not divisible by the selected pressure-level substep,
        // rather than silently extending the forecast.
        for (int elapsedTicks = 0; elapsedTicks < _profile.LookaheadHorizonTicks;) {
            int stepTicks = System.Math.Min(
                predictionSubstepTicks,
                _profile.LookaheadHorizonTicks - elapsedTicks);
            double dt = stepTicks / (double)AircraftSim.TickHz;
            probe.StepPrediction(command, dt);
            forecastSteps++;
            predChi += predTurnRate * dt;
            var predVel = new Vec3D(
                System.Math.Sin(predChi) * System.Math.Cos(predGamma),
                System.Math.Sin(predGamma),
                System.Math.Cos(predChi) * System.Math.Cos(predGamma)) * predSpeed;
            predictedPos += predVel * dt;
            var probeState = probe.State;
            // Sweep every rolled-out segment, not just its endpoints. This uses the same terrain
            // query as merge-spawn safety and means every candidate which can become a new descent
            // decision has been checked across the intervening grid cells.
            double segmentClearanceM;
            if (terrain is null) {
                segmentClearanceM = System.Math.Min(
                    previousProbePosition.Y, probeState.Position.Y);
            } else {
                try {
                    terrainSweeps++;
                    segmentClearanceM =
                        GunsOnly.Sim.Environment.TerrainQueries.MinimumClearanceM(
                            terrain, previousProbePosition, probeState.Position,
                            maximumHorizontalStepM: 60.0);
                } catch (System.ArgumentOutOfRangeException) {
                    return double.NegativeInfinity;
                }
            }
            minClearanceM = System.Math.Min(minClearanceM, segmentClearanceM);
            previousProbePosition = probeState.Position;
            maxY = System.Math.Max(maxY, probeState.Position.Y);
            // The lead solve reads the target's VELOCITY, so the predicted contact must carry the
            // extrapolated flight path, not just the extrapolated position: scoring a turning
            // target with its old velocity aims where the turn used to be going. Same belief
            // data, honestly extended -- the threat term below already reads predVel directly.
            var predictedPlayer = player with
                { Position = predictedPos, Chi = predChi, Gamma = predGamma };
            // Reward exactly the envelope the trigger can use — BOTH of its gates. Counting only
            // the body cone scored a firing OPPORTUNITY (nose on the target) while a hit requires
            // a firing SOLUTION (nose on the ballistic lead point); against a turning target those
            // sit tens of degrees apart. Measured on GunConversionFunnel, Build 252: median
            // in-range lead error 26.1 deg at Ace and 75.0 at Veteran against a 0.35-0.45 deg
            // trigger gate — 81 and 18 rounds respectively into empty sky, zero hits at any tier.
            // Counting any nose-on sample below maximum range also rewarded geometry inside the
            // no-fire minimum range, so a close overshoot could outscore a genuinely usable
            // solution.
            //
            // SCORE THE SOLUTION, NOT THE OPPORTUNITY. Adding the lead term as an OR alongside the
            // body term left the EASIER term dominating: the body cone is satisfied by pure
            // pursuit, which is precisely the geometry a gun cannot use, so the optimiser kept
            // flying nose-on and the solution never arrived. Measured on GunConversionFunnel, the
            // Ace's ballistic lead error at the trigger was p10 9.2 deg / median 17.3 deg against
            // a 0.58 deg requirement, and its lead gate was met for 0.00 s of 62.1 s in range —
            // its only near-solution moments were head-on merge passes, where crossing rate is low
            // and the first-pass ROE forbids the shot anyway.
            //
            // For a pilot whose trigger is gated on the solution, the ROLLOUT must be too, or the
            // BFM never produces the geometry the trigger is waiting for. The shaping cone stays
            // at the 3 deg gun cone rather than the tier's much tighter TRIGGER cone: shaping on
            // the trigger cone flattens the angle gradient to nothing over a short horizon and the
            // controller orbits outside it, which is the same failure the body-cone comment above
            // records.
            bool scoredWindow = _profile.FiresOnBodyGate
                ? BanditFireControl.InFiringEnvelope(probeState, predictedPlayer)
                    || BanditFireControl.InLeadFiringEnvelope(
                        probeState, predictedPlayer, _profile.LeadFireConeRad)
                : BanditFireControl.InLeadFiringEnvelope(
                    probeState, predictedPlayer, gunConeRad);
            if (scoredWindow) windowSeconds += dt;
            // Score the same geometry from the attacker's side. The predicted player direction
            // and position come only from ActorObservation; the probe is this candidate's honest
            // kernel rollout. A projected player gun line should compete point-for-point with
            // earning our own gun line instead of letting a doomed offensive solution win.
            var playerToProbe = probeState.Position - predictedPos;
            double threatRangeM = playerToProbe.Length;
            if (threatRangeM < BanditFireControl.MaximumRangeM
                && threatRangeM > 1e-6) {
                double playerNoseDot = predVel.Normalized()
                    .Dot(playerToProbe * (1.0 / threatRangeM));
                double playerNoseErrorRad = System.Math.Acos(
                    System.Math.Clamp(playerNoseDot, -1.0, 1.0));
                if (playerNoseErrorRad < 12.0 * System.Math.PI / 180.0)
                    threatSeconds += dt;
            }
            elapsedTicks += stepTicks;
        }

        var terminal = probe.State;
        var terminalPlayer = player with
            { Position = predictedPos, Chi = predChi, Gamma = predGamma };
        var terminalPredictedPlayerVelocity = new Vec3D(
            System.Math.Sin(predChi) * System.Math.Cos(predGamma),
            System.Math.Sin(predGamma),
            System.Math.Cos(predChi) * System.Math.Cos(predGamma)) * predSpeed;
        double termRange = Geometry.Range(terminal, terminalPlayer);
        const double idealRangeM = 450.0; // centre of the gun band: pull the fight inside firing range

        // Terminal shaping stays on the target's BODY, not the ballistic lead point. A lead
        // terminal was tried — it is the honest firing solution, and on the funnel it did move
        // the Ace onto the solution — but the ballistic solve extrapolates the target's CURRENT
        // velocity, so for a target that will turn it answers "it will be ahead after it passes":
        // a small lead error for flying AWAY. Scoring that removed the body term's re-engagement
        // pressure exactly where containment needs it, and the ceiling-corridor and
        // low-altitude-stalemate tests both regrew 15-24 s nose-cold outbound legs at every range
        // gate that was wide enough to help the funnel (900 m, 1200 m; 600 m pleased the tests
        // and converted nobody). The lead-shaping that IS safe lives in the window term above
        // (trigger-eligible seconds, range-gated to the gun envelope) and in the finisher law,
        // which closes the last few degrees onto the lead point directly. The terminal term's
        // job is the coarser one: keep the nose on the target and the fight inside gun range.
        //
        // A current-engagement-GATED lead terminal (nose on target, in range, high tiers only)
        // was also tried: it left the Ace's best-case lead error untouched at 2.7 deg. That floor
        // is not the terminal objective but the planner itself — nine constant commands re-picked
        // every 12 ticks cannot hold a 0.35 deg solution no matter what the terminal rewards.
        // Closing it wants a loop closed every tick, which is the finisher's job and why the
        // finisher-less top of the ladder keeps its 0-hit funnel row.
        //
        // The reference cone stays the 3-degree gun cone, NOT the sub-degree lead gate: the gate
        // is the trigger's business, and a cone-width gradient referenced to 0.35 deg would
        // multiply this term by ~9 and drown every energy, range, and threat signal on the way
        // in. The previous per-radian penalty was almost flat around a three-degree solution
        // (only ~0.2 score at the edge), so range management dominated and the controller
        // happily orbited just outside the trigger gate. Keep a smooth gradient toward the real
        // envelope without widening it.
        double termAngle = BanditFireControl.NoseErrorRad(terminal, terminalPlayer);
        double coneErrors = termAngle / gunConeRad;
        double score = -0.75 * coneErrors;
        // Direct conversion reward: seconds of trigger-eligible gun window accrued over the
        // rollout.
        score += 10.0 * windowSeconds;
        // Defensive conversion denial: projected seconds inside the observed player's gun-quality
        // geometry carry the same magnitude as earning our own window.
        score -= threatWeight * threatSeconds;
        // Overshoot-forcing only means something against an actual attacker: when the observed
        // player is broadly pointing at us. Against a runner these terms are pure noise that
        // dilutes pursuit commitment (post-merge regression: the valley-hunt Ace tracked 4.1 deg
        // instead of converting).
        if (_profile.ForcesOvershoot && initialPlayerAngleOffRad < System.Math.PI / 2.0) {
            // Reward candidates which make the observed attacker's nose fall behind the LOS, plus
            // the actual closure reversal that marks an overshoot. These are rollout outcomes, not
            // a defensive mode switch: every available maneuver still competes in the same score.
            var terminalPlayerToProbe = terminal.Position - predictedPos;
            double terminalPlayerRangeM = terminalPlayerToProbe.Length;
            if (terminalPlayerRangeM > 1e-6) {
                var terminalLos = terminalPlayerToProbe * (1.0 / terminalPlayerRangeM);
                double terminalPlayerAngleOffRad = System.Math.Acos(System.Math.Clamp(
                    terminalPredictedPlayerVelocity.Normalized().Dot(terminalLos), -1.0, 1.0));
                score += 8.0 * System.Math.Max(
                    0.0, terminalPlayerAngleOffRad - initialPlayerAngleOffRad);
                double terminalPlayerClosureMps =
                    -(terminal.VelocityVector() - terminalPredictedPlayerVelocity).Dot(terminalLos);
                if (initialPlayerClosureMps > 0.0 && terminalPlayerClosureMps <= 0.0)
                    score += 2.0;
            }
        }
        // Range management: pull the fight INTO firing range rather than zooming away or overshooting
        // through the merge. Distance from the band centre is penalised both long and short.
        score -= 0.004 * System.Math.Abs(termRange - idealRangeM);
        // Speed (kinetic-energy) retention only -- NOT raw altitude, which would reward an endless
        // zoom climb out of the fight. Vertical maneuvers still emerge when they improve the angle.
        score += 0.010 * _profile.EnergyRetentionWeight
            * System.Math.Min(terminal.Speed, 320.0);
        // A stalking boss doubles the energy-reserve weight: conservative-dominant flying — keep
        // smash in hand, refuse the gamble — until the commit trigger removes the bias.
        if (_profile.IsBoss && !bossCommitted)
            score += 0.010 * System.Math.Min(terminal.Speed, 320.0);
        // Floor avoidance: a hard penalty as the rollout approaches the local surface, and an
        // outright disqualifier for a path that actually reaches it. The gradient alone maxes out
        // near the magnitude of a full gun-window reward, which let a kill-shot candidate accept
        // flying into a hill; no firing solution is worth controlled flight into terrain.
        double hardFloorM = _profile.LowBlockClearanceM;
        double softFloorM = hardFloorM + 120.0;
        if (minClearanceM < softFloorM)
            score -= 0.025 * (softFloorM - minClearanceM);
        if (minClearanceM < hardFloorM)
            score -= 80.0 + 0.75 * (hardFloorM - minClearanceM);
        // Ceiling discipline: the mirror of floor avoidance. A guns knife-fight must not chase the
        // player into the stratosphere, so climbing past the believable combat ceiling is penalised.
        // This is a CEILING, not an altitude reward -- it is zero in-band and only ever pushes the
        // fight back down, so vertical maneuvers still emerge purely when they improve the angle.
        //
        // The PER-FIGHT ceiling, not the family constant. Guarding CombatCeilingM (11.5 km) meant
        // the term was silent for the entire altitude band any modern merge actually occupies: the
        // Su-27 fight staged at 10,000 ft has _ceilingM = 5,608 m, so a bandit could climb 5.7 km
        // out of its own fight volume before the scorer objected at all. Traced at 13,437 m. This
        // is the only ceiling pressure a lookahead tier gets — SelectTactic's Return was discarded
        // on that path — so it has to be the one that means something.
        double scoreCeilingM = System.Math.Min(_ceilingM, CombatCeilingM);
        if (maxY > scoreCeilingM - 200.0)
            score -= 0.02 * (maxY - (scoreCeilingM - 200.0));
        return score;
    }
}

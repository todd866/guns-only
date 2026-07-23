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
    bool WreckSettled { get; }
    ImpactSurface WreckSurface { get; }
    bool WreckSurfaceChangedThisStep { get; }
    /// Tactical trigger intent only. The session owns ammunition, cadence, projectiles, damage,
    /// and outcomes; an opponent controller cannot manufacture a hit.
    bool WantsToFire(in ActorObservation player);
    /// Irreversible combat-damage boundary. Subsequent Step calls still integrate the same entity,
    /// but through its failed engine and damaged aerodynamic state rather than its tactical law.
    void ApplyCatastrophicDamage(int handedness);
    void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null);
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
}

public enum BanditTactic { Acquire, Defend, Energy, Return }

/// Deterministic, deliberately beatable BFM opponent. It owns a normal AircraftSim and supplies
/// only pilot controls: no kinematic shortcuts, wall clock, or random source enters the kernel.
public sealed class ReactiveBandit : IBandit, IBanditDecisionTraceSource {
    const double FloorM = 260.0;
    const double CeilingM = 3200.0;
    // Believable guns knife-fight ceiling (~37,700 ft). The per-fight ceiling may sit LOWER (it
    // tracks the merge altitude to preserve the low-level fight volume) but must never FLOAT above
    // this: a real gun dogfight does not climb into the stratosphere. It bounds both the merge spawn
    // altitude and the high-skill lookahead vertical, so the fight cannot ratchet up to FL600.
    const double CombatCeilingM = 11500.0;
    const double ReturnRadiusM = 5200.0;
    const double ThreatRangeM = 1500.0;
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
    int _jinkIndex;
    int _breakSign = 1;
    int _damageHandedness = 1;
    WreckContactMotion? _wreckMotion;
    readonly BanditSkillProfile _profile;
    readonly int _doctrine;
    bool _lowAttackActive;
    double _lowAttackEndAt = double.NegativeInfinity;
    double _lowAttackRecommitAt = double.NegativeInfinity;

    // Lookahead decision cache. Rolling a small candidate set forward over the horizon every
    // tick is wasteful, so the choice is recomputed on a fixed deterministic cadence and held
    // between recomputes. The cadence counts real ticks (never wall-clock), keeping determinism.
    const int LookaheadDecisionCadenceTicks = 12; // ~0.1 s at 120 Hz
    PilotCommand _lookaheadCommand = new(1.0, 0.0, 0.85, 0.0);
    int _lookaheadHoldTicks;
    long _selectionSequence;

    public PilotSkill Skill { get; }
    public AircraftParams AircraftParameters => _parameters;

    public ReactiveBandit(AircraftState initial, AircraftParams parameters,
        PilotSkill skill = PilotSkill.Competent,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        int engagementNumber = 1, BanditSkillProfile? profile = null) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));
        Skill = skill;
        _profile = profile ?? BanditSkillProfile.For(skill);
        _doctrine = (engagementNumber - 1) % System.Math.Max(1, _profile.DoctrineCount);
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
        _ceilingM = System.Math.Min(CombatCeilingM,
            System.Math.Max(CeilingM, initial.Position.Y + 1000.0));
    }

    /// Deterministically put a fresh fighter into a real offset, reciprocal merge. Engagement
    /// number replaces randomness: successive bogeys alternate sides and cycle modest variations
    /// in spacing/altitude while retaining fighting energy and a fair head-on presentation.
    public static ReactiveBandit SpawnForMerge(in AircraftState player,
        AircraftParams parameters, int engagementNumber,
        double speedMps = 180.0, PilotSkill skill = PilotSkill.Competent,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        BanditSkillProfile? profile = null) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));
        if (!double.IsFinite(speedMps) || speedMps <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(speedMps));

        int variation = (engagementNumber - 1) % 3;
        double side = (engagementNumber & 1) == 1 ? 1.0 : -1.0;
        var forward = new Vec3D(System.Math.Sin(player.Chi), 0.0, System.Math.Cos(player.Chi));
        var right = new Vec3D(System.Math.Cos(player.Chi), 0.0, -System.Math.Sin(player.Chi));
        double alongM = 2200.0 + variation * 220.0;
        double offsetM = side * (560.0 + variation * 110.0);
        double altitudeOffsetM = variation switch { 0 => 120.0, 1 => -80.0, _ => 40.0 };
        // Keep the merge near ownship, but never spawn a fresh bandit above the believable combat
        // ceiling: if the player has climbed out of band, the successor still merges in-band so the
        // fight is drawn back down rather than staged in the stratosphere.
        double altitudeM = System.Math.Clamp(player.Position.Y + altitudeOffsetM,
            FloorM + 260.0, CombatCeilingM);
        var position = player.Position + forward * alongM + right * offsetM;
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
            initial, parameters, skill, terrain, engagementNumber, profile);
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
    public PilotCommand LastCommand { get; private set; } = new(1.0, 0.0, 0.85, 0.0);
    public PilotCommand AppliedCommand => LastCommand;
    public BanditDecisionTrace DecisionTrace { get; private set; }
    public BanditPolicyMemory PolicyMemory => new(
        Tactic,
        T,
        System.Math.Max(0.0, _defendUntil - T),
        System.Math.Max(0.0, _defendCooldownUntil - T),
        _jinkIndex,
        _breakSign,
        _lookaheadHoldTicks);

    /// <summary>
    /// Preserve the real engine spool state when scenario geometry hands this controller an
    /// already-flying aircraft. The controller changes pilot intent; it must not replace the
    /// physical engine with a freshly initialized one.
    /// </summary>
    internal void SeedEnginePowerFraction(double powerFraction) =>
        _sim.SeedEnginePowerFraction(powerFraction);

    /// <summary>Follow a session terrain replacement (world-origin re-anchor or data-pack swap)
    /// so floor sense and the recovery reflex keep sampling the currently authoritative ground.
    /// </summary>
    public void UpdateTerrain(GunsOnly.Sim.Environment.ITerrainSurface? terrain) =>
        _terrain = terrain;

    public bool WantsToFire(in ActorObservation player) => !CatastrophicallyDamaged
        && Tactic == BanditTactic.Acquire
        && BanditFireControl.WantsToFire(State, player, T, EffectiveFireConeRad);

    /// A committed boss shoots with the standard Ace gate; a stalking boss holds its raised
    /// quality bar. Every other tier reads its profile cone unchanged.
    double EffectiveFireConeRad => _profile.IsBoss && !BossCommitted
        ? _profile.FireConeRad
        : _profile.IsBoss
            ? BanditSkillProfile.For(PilotSkill.Ace).FireConeRad
            : _profile.FireConeRad;

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
        CatastrophicallyDamaged = true;
        _damageHandedness = handedness < 0 ? -1 : 1;
        _sim.EngineCombustionAvailable = false;
        _sim.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
            AirframeAerodynamicState.Clean, _damageHandedness);
    }

    public void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null) {
        if (_wreckMotion is not null) return;
        ApplyCatastrophicDamage(_damageHandedness);
        _wreckMotion = new WreckContactMotion(_sim.State, surface,
            surfaceVelocity, surfaceHeightM, carrier);
        _sim.AdoptExternalKinematics(_wreckMotion.State);
    }

    public void Step(in ActorObservation player, double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(dt));

        if (_wreckMotion is not null) {
            _sim.AdvanceEngineOnly(0.0, dt);
            _wreckMotion.Step(dt);
            _sim.AdoptExternalKinematics(_wreckMotion.State);
            T += dt;
            return;
        }

        if (CatastrophicallyDamaged) {
            LastCommand = TerminalFlightDynamics.UncontrolledCommand(_sim.State);
            TerminalFlightDynamics.Step(_sim, AirframeAerodynamicState.Clean,
                _damageHandedness, dt);
            T += dt;
            return;
        }

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
        // Novice/Competent keep LookaheadHorizonTicks == 0 and the state machine below UNCHANGED.
        if (_profile.IsBoss && !BossCommitted) UpdateBossCommitment(player, dt);

        if (_profile.LookaheadHorizonTicks > 0) {
            if (lowTarget && hasLowAttackPlan) {
                _lowAttackActive = true;
                if (ownClearanceM <= LowBlockCaptureClearanceM) {
                    LastCommand = LowLevelHuntCommand(player, lowAttackPlan);
                    RecordSingleCandidateDecision(LastCommand);
                } else {
                    LastCommand = LookaheadCommand(player, lowAttackPlan);
                }
                Tactic = BanditTactic.Acquire; // firing remains governed by BanditFireControl
            } else if (lowTarget) {
                _lowAttackActive = false;
                LastCommand = LowBlockPerchCommand(player);
                Tactic = BanditTactic.Return;
                RecordSingleCandidateDecision(LastCommand);
            } else {
                LastCommand = LookaheadCommand(player);
                Tactic = BanditTactic.Acquire;
            }
            _sim.Step(LastCommand, dt);
            T += dt;
            return;
        }

        SelectTactic(player);
        LastCommand = Tactic switch {
            BanditTactic.Defend => DefendCommand(),
            BanditTactic.Energy => EnergyCommand(player),
            BanditTactic.Return => ReturnCommand(),
            _ when _profile.LowBlockDoctrine == LowBlockDoctrine.BoomAndZoom && lowTarget
                => CompetentLowBlockCommand(player, hasLowAttackPlan, lowAttackPlan),
            _ => AcquireCommand(player)
        };
        RecordSingleCandidateDecision(LastCommand);
        _sim.Step(LastCommand, dt);
        T += dt;
    }

    void FlyTerrainRecovery(double dt) {
        _lowAttackActive = false;
        _lowAttackRecommitAt = System.Math.Max(_lowAttackRecommitAt,
            T + _profile.LowBlockRecommitSeconds);
        _lookaheadHoldTicks = 0;
        LastCommand = new PilotCommand(_profile.MaxAcquireG, 0.0,
            _maximumThrottle, 0.0);
        Tactic = BanditTactic.Return; // never firing while recovering from the dirt
        RecordSingleCandidateDecision(LastCommand);
        _sim.Step(LastCommand, dt);
        T += dt;
    }

    void SelectTactic(in ActorObservation player) {
        var own = State;
        double radius = HorizontalDistance(own.Position, _fightCentre);

        if (Tactic == BanditTactic.Defend && T < _defendUntil) return;
        if (Tactic == BanditTactic.Defend) {
            _defendCooldownUntil = T + DefendCooldownSeconds;
            _nextJinkAt = double.PositiveInfinity;
        }

        if (radius > ReturnRadiusM || own.Position.Y > _ceilingM + 350.0) {
            Tactic = BanditTactic.Return;
            return;
        }

        // Deny the stratosphere plink. A player camping above the believable combat ceiling turns
        // a ceiling-limited bandit into a stationary target; real BFM answers that by unloading,
        // extending away, and rebuilding energy below — dragging the fight back down instead of
        // hovering at the cap waiting to be shot from above.
        if (player.Position.Y > _ceilingM + 350.0
            && own.Position.Y > _ceilingM - 900.0) {
            Tactic = BanditTactic.Energy;
            return;
        }

        if (own.Speed < _energyEntryMps
            || (Tactic == BanditTactic.Energy && own.Speed < _energyExitMps)) {
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
        if (range < 1.0 || range > ThreatRangeM) return false;

        var toPlayer = ownToPlayer * (1.0 / range);
        var playerToOwn = toPlayer * -1.0;
        double rearAspect = own.ForwardDir().Dot(toPlayer);
        double attackerAngle = player.ForwardDir().Dot(playerToOwn);
        double closing = (player.VelocityVector() - own.VelocityVector()).Dot(playerToOwn);
        return rearAspect < -0.45 && attackerAngle > 0.91 && closing > -5.0;
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
        var aim = player.Position + player.VelocityVector() * leadSeconds;
        aim = KeepAimInFightVolume(aim);

        double bank = LimitedBankTo(aim, 1.08);
        double angle = AngleTo(aim);
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

    PilotCommand DefendCommand() {
        while (T >= _nextJinkAt && T < _defendUntil) {
            _jinkIndex = (_jinkIndex + 1) % JinkDurations.Length;
            _nextJinkAt += JinkDurations[_jinkIndex];
        }

        int direction = _breakSign * JinkDirections[_jinkIndex];
        double bank = direction * 1.18;
        double g = JinkG[_jinkIndex];

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
        return new PilotCommand(g, bank, _defensivePower, direction * 0.10);
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
        var extension = own.Position + own.ForwardDir() * 1200.0 + new Vec3D(0.0, -280.0, 0.0);
        // The descending extension must not descend into rising ground ahead.
        double aheadFloor = LocalFloorM(extension.X, extension.Z);
        if (extension.Y < aheadFloor + 180.0)
            extension = extension with { Y = aheadFloor + 180.0 };
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
            return new PilotCommand(-0.10, LimitedBankTo(extension, 0.38),
                System.Math.Min(_maximumThrottle, 0.40), 0.0);
        }
        return new PilotCommand(0.55, LimitedBankTo(extension, 0.38),
            _maximumThrottle, 0.0);
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
        double bank = LimitedBankTo(target, 0.95);
        double angle = AngleTo(target);
        double g = System.Math.Clamp(1.2 + angle * 1.15, 1.2, 2.8);
        double throttle = State.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : System.Math.Min(_maximumThrottle, 0.72);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    Vec3D KeepAimInFightVolume(in Vec3D aim) {
        var horizontal = new Vec3D(aim.X - _fightCentre.X, 0.0, aim.Z - _fightCentre.Z);
        if (horizontal.Length > ReturnRadiusM - 500.0)
            horizontal = horizontal.Normalized() * (ReturnRadiusM - 500.0);
        double x = _fightCentre.X + horizontal.X;
        double z = _fightCentre.Z + horizontal.Z;
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
        if (_lookaheadHoldTicks > 0) {
            _lookaheadHoldTicks--;
            return _lookaheadCommand;
        }
        _lookaheadHoldTicks = LookaheadDecisionCadenceTicks - 1;

        double range = (player.Position - State.Position).Length;
        double leadSeconds = System.Math.Clamp(range / 900.0, 0.35, 1.35);
        var leadPoint = lowAttackPlan?.AimPoint
            ?? player.Position + player.VelocityVector() * leadSeconds;

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
        var awayFromPlayer = State.Position - player.Position;
        if (awayFromPlayer.Length < 1e-6)
            awayFromPlayer = State.ForwardDir();
        var separateAim = State.Position + awayFromPlayer.Normalized() * 1400.0;
        double breakBank = Geometry.BankToPlaceLiftVectorOn(State, breakAim);
        double orthogonalReverseBank = Geometry.BankToPlaceLiftVectorOn(State, reverseAim);
        var candidates = new PilotCommand[] {
            // Hard 3D pursuit: max-perform pull with the lift vector planted on the lead point.
            new(maxG, bankOnLead, fastThrottle, 0.0),
            // Moderate 3D pursuit: a sustainable rate pull that trades less energy.
            new(System.Math.Min(maxG, 4.0), bankOnLead, cruiseThrottle, 0.0),
            // Pull into the vertical (high yo-yo).
            new(System.Math.Min(maxG, 6.5), Geometry.BankToPlaceLiftVectorOn(State, verticalAim),
                fastThrottle, 0.0),
            // Nose-low reposition (low yo-yo / Split-S recommit).
            new(System.Math.Min(maxG, 5.5), Geometry.BankToPlaceLiftVectorOn(State, lowAim),
                fastThrottle, 0.0),
            // Unload / extend: near-1 G, max throttle, wings toward the target — rebuild energy.
            new(System.Math.Min(maxG, 1.05), LimitedBankTo(leadPoint, 0.45),
                _maximumThrottle, 0.0),
            // Reverse: bank the opposite way for a scissors/reposition flavour.
            new(System.Math.Min(maxG, 4.5), -bankOnLead, cruiseThrottle, 0.0),
            // Break: max-perform, up-and-across out of the attacker's projected gun line.
            new(maxG, breakBank, fastThrottle, 0.0),
            // Orthogonal reverse: give the scorer the opposite out-of-plane exit at moderate G.
            new(System.Math.Min(maxG, 4.5),
                orthogonalReverseBank,
                cruiseThrottle, 0.0),
            // True separation: unload and accelerate toward the point diametrically away from
            // the player. Candidate 4 intentionally remains the historical lead-point extension.
            new(1.05, LimitedBankTo(separateAim, 0.45), _maximumThrottle, 0.0),
        };
        Span<bool> available = stackalloc bool[] {
            true, true, true, true, true, true,
            _profile.ForcesOvershoot,
            _profile.ForcesOvershoot,
            _profile.DisengagesWhenLosing
        };

        double bestScore = double.NegativeInfinity;
        var bestCommand = candidates[0];
        int bestIndex = 0;
        Span<double> scores = stackalloc double[candidates.Length];
        scores.Clear();
        for (int i = 0; i < candidates.Length; i++) {
            if (!available[i]) continue;
            double s = ScoreCandidate(candidates[i], player) + DoctrineOpenerBias(i);
            scores[i] = s;
            if (s > bestScore) {
                bestScore = s;
                bestCommand = candidates[i];
                bestIndex = i;
            }
        }
        _lookaheadCommand = bestCommand;
        DecisionTrace = new BanditDecisionTrace(
            ++_selectionSequence,
            Skill,
            bestCommand,
            bestIndex,
            candidates.Length,
            new BanditDecisionCandidate(
                0, candidates[0], scores[0], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                1, candidates[1], scores[1], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                2, candidates[2], scores[2], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                3, candidates[3], scores[3], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                4, candidates[4], scores[4], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                5, candidates[5], scores[5], HasScore: true, Available: true),
            new BanditDecisionCandidate(
                6, candidates[6], scores[6],
                HasScore: available[6], Available: available[6]),
            new BanditDecisionCandidate(
                7, candidates[7], scores[7],
                HasScore: available[7], Available: available[7]),
            new BanditDecisionCandidate(
                8, candidates[8], scores[8],
                HasScore: available[8], Available: available[8]));
        return bestCommand;
    }

    double DoctrineOpenerBias(int candidateIndex) {
        if (_doctrine == 0 || T >= 2.0) return 0.0;
        double fade = 1.0 - T / 2.0;
        return _doctrine switch {
            // One-circle / energy opener: favour the sustainable pull and the historical unload.
            1 when candidateIndex == 1 => 1.00 * fade,
            1 when candidateIndex == 4 => 3.00 * fade,
            // Vertical entry: favour the existing high-yo-yo candidate.
            2 when candidateIndex == 2 => 4.00 * fade,
            _ => 0.0
        };
    }

    void RecordSingleCandidateDecision(in PilotCommand command) {
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
    double ScoreCandidate(in PilotCommand command, in ActorObservation player) {
        const double dt = 1.0 / AircraftSim.TickHz;
        const double threatWeight = 24.0;
        // Optimize the envelope the trigger can ACTUALLY use. The old 12-degree camera window made
        // the lookahead tests look threatening while first-pass-safe production fights never fired:
        // every selected "solution" remained outside BanditFireControl's real 3-degree gate. The
        // optimizer deliberately keeps chasing 3-degree solutions even for a profile with a wider
        // TRIGGER cone: the wide gate is opportunistic tracer pressure on the way through, not a
        // license to fly sloppier geometry (widening the shaping cone here re-flattens the angle
        // gradient and the controller goes back to orbiting outside the gate).
        const double gunConeRad = BanditFireControl.MaximumNoseErrorRad;
        var probe = new AircraftSim(State, _parameters, _sim.AtmosphereModel) { Wind = _sim.Wind };
        probe.SeedEnginePowerFraction(_sim.ThrustFraction);

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
        var initialPlayerToProbe = State.Position - player.Position;
        double initialPlayerRangeM = initialPlayerToProbe.Length;
        double initialPlayerAngleOffRad = initialPlayerRangeM > 1e-6
            ? System.Math.Acos(System.Math.Clamp(
                player.ForwardDir().Dot(initialPlayerToProbe * (1.0 / initialPlayerRangeM)),
                -1.0, 1.0))
            : 0.0;
        double initialPlayerClosureMps = initialPlayerRangeM > 1e-6
            ? -(State.VelocityVector() - player.VelocityVector())
                .Dot(initialPlayerToProbe * (1.0 / initialPlayerRangeM))
            : 0.0;

        double windowSeconds = 0.0;
        double threatSeconds = 0.0;
        double minClearanceM = State.Position.Y
            - SurfaceHeightM(_terrain, State.Position.X, State.Position.Z);
        double maxY = State.Position.Y;
        var previousProbePosition = State.Position;
        int horizon = _profile.LookaheadHorizonTicks;
        for (int t = 0; t < horizon; t++) {
            probe.Step(command, dt);
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
            if (_terrain is null) {
                segmentClearanceM = System.Math.Min(
                    previousProbePosition.Y, probeState.Position.Y);
            } else {
                try {
                    segmentClearanceM =
                        GunsOnly.Sim.Environment.TerrainQueries.MinimumClearanceM(
                            _terrain, previousProbePosition, probeState.Position,
                            maximumHorizontalStepM: 60.0);
                } catch (System.ArgumentOutOfRangeException) {
                    return double.NegativeInfinity;
                }
            }
            minClearanceM = System.Math.Min(minClearanceM, segmentClearanceM);
            previousProbePosition = probeState.Position;
            maxY = System.Math.Max(maxY, probeState.Position.Y);
            var predictedPlayer = player with { Position = predictedPos };
            // Reward exactly the envelope the trigger can use. Counting any nose-on sample below
            // maximum range also rewarded geometry inside the no-fire minimum range, so a close
            // overshoot could outscore a genuinely usable solution.
            if (BanditFireControl.InFiringEnvelope(probeState, predictedPlayer))
                windowSeconds += dt;
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
        }

        var terminal = probe.State;
        var terminalPlayer = player with { Position = predictedPos };
        var terminalPredictedPlayerVelocity = new Vec3D(
            System.Math.Sin(predChi) * System.Math.Cos(predGamma),
            System.Math.Sin(predGamma),
            System.Math.Cos(predChi) * System.Math.Cos(predGamma)) * predSpeed;
        double termRange = Geometry.Range(terminal, terminalPlayer);
        double termAngle = GunAngleOff(terminal, terminalPlayer);
        const double idealRangeM = 450.0; // centre of the gun band: pull the fight inside firing range

        // Nose-on shaping is expressed in physical gun-cone widths. The previous per-radian
        // penalty was almost flat around a three-degree solution (only ~0.2 score at the edge),
        // so range management dominated and the controller happily orbited just outside the
        // trigger gate. Keep a smooth gradient toward the real envelope without widening it.
        double coneErrors = termAngle / gunConeRad;
        double score = -0.75 * coneErrors;
        // Direct conversion reward: seconds of gun window accrued over the rollout.
        score += 10.0 * windowSeconds;
        // Defensive conversion denial: projected seconds inside the observed player's gun-quality
        // geometry carry the same magnitude as earning our own window.
        score -= threatWeight * threatSeconds;
        if (_profile.ForcesOvershoot) {
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
        score += 0.010 * System.Math.Min(terminal.Speed, 320.0);
        // A stalking boss doubles the energy-reserve weight: conservative-dominant flying — keep
        // smash in hand, refuse the gamble — until the commit trigger removes the bias.
        if (_profile.IsBoss && !BossCommitted)
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
        if (maxY > CombatCeilingM - 200.0)
            score -= 0.02 * (maxY - (CombatCeilingM - 200.0));
        return score;
    }

    static double GunAngleOff(in AircraftState own, in ActorObservation contact) {
        return BanditFireControl.NoseErrorRad(own, contact);
    }
}

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
        double engagementSeconds) {
        if (!double.IsFinite(engagementSeconds) || engagementSeconds < 0.0) return false;
        if (!InFiringEnvelope(own, player)) return false;

        double burstPhase = engagementSeconds % BurstCycleSeconds;
        return burstPhase < BurstSeconds;
    }

    /// <summary>Physical range/body-axis envelope, independent of the burst clock.</summary>
    public static bool InFiringEnvelope(in AircraftState own, in ActorObservation player) {
        var line = player.Position - own.Position;
        double range = line.Length;
        if (!double.IsFinite(range) || range < MinimumRangeM || range > MaximumRangeM)
            return false;

        return NoseErrorRad(own, player) <= MaximumNoseErrorRad;
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

    // Lookahead decision cache. Rolling ~5-7 candidate maneuvers forward over the horizon every
    // tick is wasteful, so the choice is recomputed on a fixed deterministic cadence and held
    // between recomputes. The cadence counts real ticks (never wall-clock), keeping determinism.
    const int LookaheadDecisionCadenceTicks = 12; // ~0.1 s at 120 Hz
    PilotCommand _lookaheadCommand = new(1.0, 0.0, 0.85, 0.0);
    int _lookaheadHoldTicks;
    long _selectionSequence;

    public PilotSkill Skill { get; }

    public ReactiveBandit(AircraftState initial, AircraftParams parameters,
        PilotSkill skill = PilotSkill.Competent) {
        Skill = skill;
        _profile = BanditSkillProfile.For(skill);
        _parameters = parameters;
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
        double speedMps = 180.0, PilotSkill skill = PilotSkill.Competent) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));
        if (!double.IsFinite(speedMps) || speedMps <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(speedMps));

        int variation = (engagementNumber - 1) % 3;
        double side = (engagementNumber & 1) == 1 ? 1.0 : -1.0;
        var forward = new Vec3D(System.Math.Sin(player.Chi), 0.0, System.Math.Cos(player.Chi));
        var right = new Vec3D(System.Math.Cos(player.Chi), 0.0, -System.Math.Sin(player.Chi));
        double alongM = 3200.0 + variation * 260.0;
        double offsetM = side * (560.0 + variation * 110.0);
        double altitudeOffsetM = variation switch { 0 => 120.0, 1 => -80.0, _ => 40.0 };
        // Keep the merge near ownship, but never spawn a fresh bandit above the believable combat
        // ceiling: if the player has climbed out of band, the successor still merges in-band so the
        // fight is drawn back down rather than staged in the stratosphere.
        double altitudeM = System.Math.Clamp(player.Position.Y + altitudeOffsetM,
            FloorM + 260.0, CombatCeilingM);
        var position = player.Position + forward * alongM + right * offsetM;
        position = position with { Y = altitudeM };

        // Aim slightly beyond ownship's current position. This is an offset head-on merge, not a
        // stationary target parked in the pipper, and the reactive pilot takes over immediately.
        var mergePoint = player.Position + forward * 420.0;
        var toMerge = mergePoint - position;
        double horizontalM = System.Math.Sqrt(toMerge.X * toMerge.X + toMerge.Z * toMerge.Z);
        double chi = System.Math.Atan2(toMerge.X, toMerge.Z);
        double gamma = System.Math.Atan2(toMerge.Y, System.Math.Max(1.0, horizontalM));
        var initial = new AircraftState(position, speedMps, gamma, chi, 0.0, parameters.MassKg);
        return new ReactiveBandit(initial, parameters, skill);
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

    public bool WantsToFire(in ActorObservation player) => !CatastrophicallyDamaged
        && Tactic == BanditTactic.Acquire
        && BanditFireControl.WantsToFire(State, player, T);

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

        // High-skill tiers replace the flat-turn state machine with a short-horizon lookahead: roll
        // candidate maneuvers forward in the deterministic kernel and fly the one that best improves
        // the future firing position. The vertical fight emerges from the score, it is not scripted.
        // Novice/Competent keep LookaheadHorizonTicks == 0 and the state machine below UNCHANGED.
        if (_profile.LookaheadHorizonTicks > 0) {
            LastCommand = LookaheadCommand(player);
            Tactic = BanditTactic.Acquire; // in-envelope firing is governed by BanditFireControl
            _sim.Step(LastCommand, dt);
            T += dt;
            return;
        }

        SelectTactic(player);
        LastCommand = Tactic switch {
            BanditTactic.Defend => DefendCommand(),
            BanditTactic.Energy => EnergyCommand(player),
            BanditTactic.Return => ReturnCommand(),
            _ => AcquireCommand(player)
        };
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

    PilotCommand AcquireCommand(in ActorObservation player) {
        var own = State;
        double range = (player.Position - own.Position).Length;
        double leadSeconds = System.Math.Clamp(range / 900.0, 0.35, 1.35);
        var aim = player.Position + player.VelocityVector() * leadSeconds;
        aim = KeepAimInFightVolume(aim);

        double bank = LimitedBankTo(aim, 1.08);
        double angle = AngleTo(aim);
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

        // Near the water, keep the hard turn but bias it upward rather than pulling into the sea.
        if (State.Position.Y < FloorM + 140.0) {
            var safe = new Vec3D(State.Position.X, FloorM + 420.0, State.Position.Z)
                + State.ForwardDir() * 800.0;
            bank = LimitedBankTo(safe, 0.92);
            g = 2.35;
        }
        return new PilotCommand(g, bank, _defensivePower, direction * 0.10);
    }

    PilotCommand EnergyCommand(in ActorObservation player) {
        var own = State;
        // Unload into a shallow descending extension. Once speed is back, SelectTactic sends the
        // bandit straight back to acquire; low altitude instead commands a safe climbing turn.
        if (own.Position.Y < FloorM + 180.0) {
            var climb = KeepAimInFightVolume(player.Position with { Y = FloorM + 650.0 });
            return new PilotCommand(1.85, LimitedBankTo(climb, 0.65),
                _maximumThrottle, 0.0);
        }
        var extension = own.Position + own.ForwardDir() * 1200.0 + new Vec3D(0.0, -280.0, 0.0);
        return new PilotCommand(0.55, LimitedBankTo(extension, 0.38),
            _maximumThrottle, 0.0);
    }

    PilotCommand ReturnCommand() {
        var target = _fightCentre with { Y = System.Math.Clamp(_fightCentre.Y + 250.0, FloorM + 300.0, CeilingM - 300.0) };
        double bank = LimitedBankTo(target, 0.95);
        double angle = AngleTo(target);
        double g = System.Math.Clamp(1.2 + angle * 1.15, 1.2, 2.8);
        double throttle = State.Speed < _lowSpeedMps
            ? System.Math.Min(_maximumThrottle, 1.05)
            : System.Math.Min(_maximumThrottle, 0.72);
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    Vec3D KeepAimInFightVolume(in Vec3D aim) {
        double y = System.Math.Clamp(aim.Y, FloorM + 180.0, _ceilingM - 180.0);
        var horizontal = new Vec3D(aim.X - _fightCentre.X, 0.0, aim.Z - _fightCentre.Z);
        if (horizontal.Length > ReturnRadiusM - 500.0)
            horizontal = horizontal.Normalized() * (ReturnRadiusM - 500.0);
        return new Vec3D(_fightCentre.X + horizontal.X, y, _fightCentre.Z + horizontal.Z);
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
    PilotCommand LookaheadCommand(in ActorObservation player) {
        if (_lookaheadHoldTicks > 0) {
            _lookaheadHoldTicks--;
            return _lookaheadCommand;
        }
        _lookaheadHoldTicks = LookaheadDecisionCadenceTicks - 1;

        double range = (player.Position - State.Position).Length;
        double leadSeconds = System.Math.Clamp(range / 900.0, 0.35, 1.35);
        var leadPoint = player.Position + player.VelocityVector() * leadSeconds;

        // Throttle schedule mirrors the acquire law's energy management so lookahead never
        // manufactures thrust the airframe cannot deliver.
        double fastThrottle = System.Math.Min(_maximumThrottle, 1.05);
        double cruiseThrottle = System.Math.Min(_maximumThrottle, 0.84);
        double maxG = _profile.MaxAcquireG;

        // Full 3D pursuit uses the UNCLAMPED lift-vector-on-target roll: the bank that places the
        // lift vector on the aim point may exceed 90 deg (rolling toward inverted) so the ace can
        // pull its nose DOWN onto a target below and behind -- a Split-S / nose-low recommit the old
        // 74 deg-clamped state machine could never fly. Whether the pull ends up level, nose-high, or
        // nose-low is decided by the score, not scripted.
        double bankOnLead = Geometry.BankToPlaceLiftVectorOn(State, leadPoint);
        // Pull into the vertical: place the lift vector up-and-across (a high yo-yo).
        var verticalAim = leadPoint + new Vec3D(0.0, System.Math.Max(900.0, range * 0.9), 0.0);
        // Nose-low reposition (low yo-yo): tighten in-plane and regain energy when fast and high.
        var lowAim = leadPoint + new Vec3D(0.0, -System.Math.Max(500.0, range * 0.5), 0.0);

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
            new(1.05, LimitedBankTo(leadPoint, 0.45), _maximumThrottle, 0.0),
            // Reverse: bank the opposite way for a scissors/reposition flavour.
            new(System.Math.Min(maxG, 4.5), -bankOnLead, cruiseThrottle, 0.0),
        };

        double bestScore = double.NegativeInfinity;
        var bestCommand = candidates[0];
        int bestIndex = 0;
        Span<double> scores = stackalloc double[candidates.Length];
        for (int i = 0; i < candidates.Length; i++) {
            double s = ScoreCandidate(candidates[i], player);
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
                5, candidates[5], scores[5], HasScore: true, Available: true));
        return bestCommand;
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
        // Optimize the envelope the trigger can ACTUALLY use. The old 12-degree camera window made
        // the lookahead tests look threatening while first-pass-safe production fights never fired:
        // every selected "solution" remained outside BanditFireControl's real 3-degree gate.
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

        double windowSeconds = 0.0;
        double minY = double.PositiveInfinity;
        double maxY = double.NegativeInfinity;
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
            minY = System.Math.Min(minY, probeState.Position.Y);
            maxY = System.Math.Max(maxY, probeState.Position.Y);
            var predictedPlayer = player with { Position = predictedPos };
            // Reward exactly the envelope the trigger can use. Counting any nose-on sample below
            // maximum range also rewarded geometry inside the no-fire minimum range, so a close
            // overshoot could outscore a genuinely usable solution.
            if (BanditFireControl.InFiringEnvelope(probeState, predictedPlayer))
                windowSeconds += dt;
        }

        var terminal = probe.State;
        var terminalPlayer = player with { Position = predictedPos };
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
        // Range management: pull the fight INTO firing range rather than zooming away or overshooting
        // through the merge. Distance from the band centre is penalised both long and short.
        score -= 0.004 * System.Math.Abs(termRange - idealRangeM);
        // Speed (kinetic-energy) retention only -- NOT raw altitude, which would reward an endless
        // zoom climb out of the fight. Vertical maneuvers still emerge when they improve the angle.
        score += 0.010 * System.Math.Min(terminal.Speed, 320.0);
        // Floor avoidance: a hard penalty as the rollout approaches the water.
        if (minY < FloorM + 200.0)
            score -= 0.02 * (FloorM + 200.0 - minY);
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

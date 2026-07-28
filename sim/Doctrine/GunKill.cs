using System.Collections.Generic;

namespace GunsOnly.Sim.Doctrine;

public enum FightOutcome { Flying, Splash }

/// <summary>
/// Deterministic barrel limits for the player's infinite-ammunition gun. Time advances only
/// through <see cref="GunKill.Step"/>; no presentation or wall-clock state enters the model.
/// </summary>
public sealed record GunHeatConfig(
    double ContinuousFireSecondsToOverheat = 5.0,
    double FullCooldownSeconds = 12.0,
    double RearmHeatThreshold = 0.5) {
    public static GunHeatConfig PlayerInfiniteAmmo { get; } = new();
}

/// One deterministic gun round in world space. Velocity includes the firing aircraft's
/// translational velocity; gravity is integrated by GunKill while the round is alive. The impact
/// radius is fixed at trigger time so a round cannot gain rear-quarter forgiveness after a
/// high-aspect launch.
public readonly record struct GunRound(
    int Id,
    Vec3D Position,
    Vec3D Velocity,
    double AgeSeconds,
    double EffectiveHitRadiusM,
    long AimTargetId = 0);

/// One physical actor the gun's airborne rounds may intersect during this fixed step.
public readonly record struct GunTarget(
    long Id,
    AircraftState State,
    bool Damageable = true);

/// Immutable public view of one target's damage ledger.
public readonly record struct GunTargetDamage(
    int HitCount,
    int HitsThisStep,
    FightOutcome Outcome) {
    public bool TargetAlive => Outcome == FightOutcome.Flying;
    public double KillProgress(int hitsToKill) =>
        System.Math.Clamp((double)HitCount / System.Math.Max(1, hitsToKill), 0.0, 1.0);
}

/// A round/actor intersection resolved during the current fixed step.
public readonly record struct GunImpact(
    int RoundId,
    long TargetId,
    double StepFraction);

/// Deterministic fixed-gun ballistics and fight damage. Nothing here knows about wall-clock time,
/// rendering, input devices, or the old camera cone: only a round/target intersection can do damage.
public sealed class GunKill {
    public const double MuzzleVelocityMps = GunsSaddleLaw.BulletSpeed;
    public const double RoundsPerSecond = 15.0;
    public const int DefaultAmmo = 400;
    public const int DefaultHitsToKill = 2;
    // Effective target/aim envelope: eight metres retains an earned body-forward shot while
    // covering the fighter silhouette and the small six-gun beaten-zone/aim error that made a
    // real 100 m burst miss a 6 m point sphere.
    public const double DefaultHitRadiusM = 8.0;
    // Keyboard pilots cannot trim away a final one-degree sight error. Inside an earned,
    // low-aspect tail chase this 12 m beaten zone covers that residual at roughly 600 m without
    // steering the projectile or changing damage. The radius is selected only at trigger time.
    public const double TailChaseHitRadiusM = 12.0;
    public const double TailChaseMaximumRangeM = 650.0;
    public const double TailChaseAspectLimitDeg = 30.0;
    public const double MaxFlightSeconds = 1.75;
    public const double GravityMps2 = 9.80665;
    // Physical muzzle station: rounds leave 4 m ahead of the aircraft reference point on the gun line.
    public const double MuzzleOffsetM = 4.0;
    // Effective wingspan-ranging flight time for the HUD funnel trajectory: past this the rounds
    // have bled too much energy to range on. Mirrors EFFECTIVE_TOF_S in render/hud/gun_funnel.js.
    public const double EffectiveRangingFlightSeconds = 0.9;

    const double GunSolutionAcquireSeconds = 0.08;
    const double GunSolutionReleaseSeconds = 0.12;
    const int LeadSearchSteps = 128;
    const int LeadBisectionSteps = 48;
    const long LegacyTargetId = 0;
    static readonly Vec3D Gravity = new(0.0, -GravityMps2, 0.0);

    readonly List<GunRound> _rounds = new(48);
    readonly List<GunImpact> _impactsThisStep = new(8);
    readonly Dictionary<long, TargetDamageState> _targetDamage = new();
    readonly GunTarget[] _singleTargetBuffer = new GunTarget[1];
    readonly int _hitsToKill;
    readonly double _hitRadiusM;
    readonly GunProfile _profile;
    readonly GunHeatConfig? _heatConfig;
    bool _triggerWasHeld;
    double _secondsToNextShot;
    double _gunSolutionTransitionSeconds;
    int _nextRoundId = 1;
    long _selectedTargetId = LegacyTargetId;

    sealed class TargetDamageState {
        public int HitCount;
        public int HitsThisStep;
        public FightOutcome Outcome;
    }

    public GunKill(int ammo = DefaultAmmo, int hitsToKill = DefaultHitsToKill,
        double hitRadiusM = DefaultHitRadiusM, GunProfile? profile = null,
        GunHeatConfig? heatConfig = null) {
        if (ammo < 0) throw new System.ArgumentOutOfRangeException(nameof(ammo));
        if (hitsToKill <= 0) throw new System.ArgumentOutOfRangeException(nameof(hitsToKill));
        _profile = profile ?? GunProfiles.SixM3FiftyCal;
        if (!double.IsFinite(_profile.MuzzleVelocityMps) || _profile.MuzzleVelocityMps <= 0.0
            || !double.IsFinite(_profile.RoundsPerSecond) || _profile.RoundsPerSecond <= 0.0
            || !double.IsFinite(_profile.MaximumFlightSeconds)
            || _profile.MaximumFlightSeconds <= 0.0
            || !double.IsFinite(_profile.EffectiveHitRadiusM)
            || _profile.EffectiveHitRadiusM <= 0.0
            || !double.IsFinite(_profile.TailChaseEffectiveHitRadiusM)
            || _profile.TailChaseEffectiveHitRadiusM < 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(profile));
        double selectedHitRadius = profile is not null && hitRadiusM == DefaultHitRadiusM
            ? profile.EffectiveHitRadiusM
            : hitRadiusM;
        if (!double.IsFinite(selectedHitRadius) || selectedHitRadius <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(hitRadiusM));
        if (heatConfig is not null
            && (!double.IsFinite(heatConfig.ContinuousFireSecondsToOverheat)
                || heatConfig.ContinuousFireSecondsToOverheat <= 0.0
                || !double.IsFinite(heatConfig.FullCooldownSeconds)
                || heatConfig.FullCooldownSeconds <= 0.0
                || !double.IsFinite(heatConfig.RearmHeatThreshold)
                || heatConfig.RearmHeatThreshold <= 0.0
                || heatConfig.RearmHeatThreshold >= 1.0))
            throw new System.ArgumentOutOfRangeException(nameof(heatConfig));
        AmmoRemaining = ammo;
        _hitsToKill = hitsToKill;
        _hitRadiusM = selectedHitRadius;
        _heatConfig = heatConfig;
        _targetDamage.Add(LegacyTargetId, new TargetDamageState());
    }

    public IReadOnlyList<GunRound> RoundsInFlight => _rounds;
    public GunProfile Profile => _profile;
    public GunHeatConfig? HeatConfig => _heatConfig;
    public bool HasInfiniteAmmo => _heatConfig is not null;
    public int AmmoRemaining { get; private set; }
    public int RoundsFired { get; private set; }
    public bool FiredThisStep { get; private set; }
    public double BarrelHeat { get; private set; }
    public bool BarrelOverheated { get; private set; }
    public long SelectedTargetId => _selectedTargetId;
    public IReadOnlyList<GunImpact> ImpactsThisStep => _impactsThisStep;
    public int TotalHitCount => _targetDamage.Values.Sum(static damage => damage.HitCount);
    public int HitCount => SelectedDamage.HitCount;
    public int HitsThisStep => _impactsThisStep.Count;
    public bool HitThisStep => HitsThisStep != 0;
    public double KillProgress => System.Math.Clamp((double)HitCount / _hitsToKill, 0.0, 1.0);
    public double TargetHealth => 1.0 - KillProgress;
    public bool TargetAlive => SelectedDamage.Outcome == FightOutcome.Flying;
    // Compatibility aliases for the current flat web projection. The kernel itself now uses the
    // generic target names because the same physical gun model can be owned by either combatant.
    public double BanditHealth => TargetHealth;
    public bool BanditAlive => TargetAlive;
    public FightOutcome Outcome => SelectedDamage.Outcome;

    TargetDamageState SelectedDamage => EnsureTarget(_selectedTargetId);

    /// True when a finite ballistic intercept exists inside the round lifetime.
    public bool HasLeadSolution { get; private set; }
    /// True only when the fixed gun axis is on the computed ballistic lead solution.
    public bool GunSolution { get; private set; }
    /// Instantaneous geometric result before the display qualification dwell is applied.
    public bool InstantaneousGunSolution { get; private set; }
    /// Point on the required gun line, at target range, for world-to-screen pipper projection.
    public Vec3D LeadPipper { get; private set; }
    public Vec3D LeadDirection { get; private set; }
    public double LeadTimeOfFlight { get; private set; }

    /// Register a concurrent physical target before it becomes selectable. Re-registering is a
    /// no-op so staging code can be idempotent.
    public void RegisterTarget(long targetId) {
        EnsureTarget(targetId);
    }

    /// Change which registered target owns lead symbology and the compatibility damage properties.
    /// Airborne rounds remain untouched and continue to collide with every supplied target.
    public void SelectTarget(long targetId) {
        EnsureTarget(targetId);
        if (_selectedTargetId == targetId) return;
        _selectedTargetId = targetId;
        HasLeadSolution = false;
        GunSolution = false;
        InstantaneousGunSolution = false;
        LeadPipper = default;
        LeadDirection = default;
        LeadTimeOfFlight = 0.0;
        _gunSolutionTransitionSeconds = 0.0;
    }

    public GunTargetDamage DamageFor(long targetId) {
        TargetDamageState damage = EnsureTarget(targetId);
        return new GunTargetDamage(damage.HitCount, damage.HitsThisStep, damage.Outcome);
    }

    public double TargetHealthFor(long targetId) {
        GunTargetDamage damage = DamageFor(targetId);
        return 1.0 - damage.KillProgress(_hitsToKill);
    }

    /// Continue this physical gun against a fresh target. Magazine state, rounds already in
    /// flight, shot identity, and held-trigger cadence carry forward; damage and lead solution
    /// state belong to the previous target and start clean.
    public GunKill CreateForNextTarget() {
        if (Outcome != FightOutcome.Splash)
            throw new System.InvalidOperationException(
                "A gun can move to the next target only after the current target is splashed.");
        return CreateReplacementTarget(preserveRoundsInFlight: true);
    }

    /// Continue cumulative magazine/fire evidence after a splashed target in a staged stream.
    /// Unlike a genuinely concurrent world, the successor did not exist while the old rounds were
    /// airborne; discarding those rounds prevents them from being reassigned to a later spawn.
    public GunKill CreateForStagedNextTarget() {
        if (Outcome != FightOutcome.Splash)
            throw new System.InvalidOperationException(
                "A staged successor is valid only after the current target is splashed.");
        return CreateReplacementTarget(preserveRoundsInFlight: false);
    }

    /// Continue the same magazine after a still-flying target leaves the simulated engagement.
    /// This is intentionally narrower than CreateForNextTarget: a leaked raid target is no longer
    /// authoritative, so rounds pursuing it are discarded rather than teleported onto its staged
    /// successor. Cumulative ammunition and fire-discipline evidence remain continuous.
    public GunKill CreateForRetargetedTarget() {
        if (Outcome != FightOutcome.Flying)
            throw new System.InvalidOperationException(
                "A live retarget is only valid while the current target is still flying.");
        return CreateReplacementTarget(preserveRoundsInFlight: false);
    }

    /// <summary>
    /// Hand a still-living target to a physically fresh shooter. Damage already inflicted on the
    /// target survives, while the replacement aircraft receives its own magazine, cadence, rounds,
    /// and gun profile. This keeps target health from being accidentally repaired when a continuous
    /// combat mission stages a successor opponent.
    /// </summary>
    public GunKill CreateForFreshShooterAgainstSameTarget(int ammo,
        double hitRadiusM, GunProfile profile) {
        if (Outcome != FightOutcome.Flying)
            throw new System.InvalidOperationException(
                "A fresh shooter cannot inherit a target which has already been splashed.");
        var next = new GunKill(ammo, _hitsToKill, hitRadiusM, profile);
        TargetDamageState inherited = next.EnsureTarget(LegacyTargetId);
        inherited.HitCount = HitCount;
        inherited.Outcome = Outcome;
        return next;
    }

    GunKill CreateReplacementTarget(bool preserveRoundsInFlight) {
        var next = new GunKill(
            AmmoRemaining, _hitsToKill, _hitRadiusM, _profile, _heatConfig) {
            RoundsFired = RoundsFired,
            _triggerWasHeld = _triggerWasHeld,
            _secondsToNextShot = _secondsToNextShot,
            _nextRoundId = _nextRoundId,
            BarrelHeat = BarrelHeat,
            BarrelOverheated = BarrelOverheated,
        };
        if (preserveRoundsInFlight) next._rounds.AddRange(_rounds);
        return next;
    }

    /// Advance rounds and fire at exact deterministic cadence. The compatibility overload retains
    /// the historical single-target contract while sharing the same physical multi-target path.
    public FightOutcome Step(bool triggerHeld, in AircraftState own,
        in AircraftState bandit, double dt) {
        _singleTargetBuffer[0] = new GunTarget(
            LegacyTargetId, bandit, Damageable: true);
        return Step(triggerHeld, own, LegacyTargetId, _singleTargetBuffer, dt);
    }

    /// Advance one physical weapon against every concurrent target. Selection controls only lead
    /// symbology and which actor a new burst is aimed at; an airborne round remains unguided and is
    /// swept against all damageable actors, with the earliest intersection winning.
    public FightOutcome Step(bool triggerHeld, in AircraftState own,
        long selectedTargetId, ReadOnlySpan<GunTarget> targets, double dt) {
        if (!double.IsFinite(dt) || dt < 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(dt));
        if (targets.IsEmpty)
            throw new System.ArgumentException(
                "At least one physical gun target is required.", nameof(targets));

        int selectedIndex = -1;
        for (int index = 0; index < targets.Length; index++) {
            EnsureTarget(targets[index].Id);
            if (targets[index].Id == selectedTargetId) selectedIndex = index;
            for (int previous = 0; previous < index; previous++) {
                if (targets[previous].Id == targets[index].Id)
                    throw new System.ArgumentException(
                        "Gun target IDs must be unique inside one fixed step.", nameof(targets));
            }
        }
        if (selectedIndex < 0)
            throw new System.ArgumentOutOfRangeException(
                nameof(selectedTargetId), "The selected target is not present in this step.");

        SelectTarget(selectedTargetId);
        foreach (TargetDamageState damage in _targetDamage.Values)
            damage.HitsThisStep = 0;
        _impactsThisStep.Clear();
        FiredThisStep = false;

        GunTarget selected = targets[selectedIndex];
        TargetDamageState selectedDamage = EnsureTarget(selectedTargetId);
        double firingHitRadiusM = EffectiveHitRadius(own, selected.State);
        UpdateLead(own, selected.State, firingHitRadiusM, dt);
        bool selectedMayBeFiredOn =
            selected.Damageable && selectedDamage.Outcome == FightOutcome.Flying;
        bool barrelAllowsFire = StepBarrelHeat(
            triggerHeld && selectedMayBeFiredOn && AmmoRemaining > 0, dt);

        var ownVelocity = own.VelocityVector();
        var gunForward = GunDirection(own);
        double elapsed = 0.0;

        if (!triggerHeld || !selectedMayBeFiredOn
            || AmmoRemaining == 0 || !barrelAllowsFire) {
            AdvanceRounds(dt, targets, elapsedAtStart: 0.0, fixedStepDuration: dt);
            SortImpactsThisStep();
            _triggerWasHeld = triggerHeld;
            _secondsToNextShot = 0.0;
            return selectedDamage.Outcome;
        }

        // A trigger press fires immediately. A held trigger retains phase across any dt partition.
        if (!_triggerWasHeld) _secondsToNextShot = 0.0;
        while (elapsed <= dt && AmmoRemaining > 0
            && selectedDamage.Outcome == FightOutcome.Flying) {
            double untilShot = System.Math.Max(0.0, _secondsToNextShot);
            double remaining = dt - elapsed;
            if (untilShot > remaining + 1e-12) {
                AdvanceRounds(remaining, targets, elapsed, dt);
                _secondsToNextShot = System.Math.Max(
                    0.0, _secondsToNextShot - remaining);
                elapsed = dt;
                break;
            }

            if (untilShot > 0.0) {
                AdvanceRounds(untilShot, targets, elapsed, dt);
                elapsed += untilShot;
                // The cadence boundary has elapsed even when an in-flight round splashes the
                // selected target at that boundary.
                _secondsToNextShot = System.Math.Max(
                    0.0, _secondsToNextShot - untilShot);
                if (selectedDamage.Outcome != FightOutcome.Flying) break;
            }

            var firingPosition = own.Position + ownVelocity * elapsed
                + gunForward * MuzzleOffsetM;
            Fire(firingPosition,
                ownVelocity + gunForward * _profile.MuzzleVelocityMps,
                firingHitRadiusM, selectedTargetId);
            _secondsToNextShot = 1.0 / _profile.RoundsPerSecond;

            // Avoid firing at t=dt and again at the next step's t=0. The shot at this boundary is
            // owned by this step and the full interval remains on the cadence clock.
            if (elapsed >= dt - 1e-12) break;
        }

        if (elapsed < dt) {
            double remaining = dt - elapsed;
            AdvanceRounds(remaining, targets, elapsed, dt);
            _secondsToNextShot = System.Math.Max(
                0.0, _secondsToNextShot - remaining);
        }
        _triggerWasHeld = true;
        SortImpactsThisStep();
        return selectedDamage.Outcome;
    }

    void SortImpactsThisStep() {
        _impactsThisStep.Sort(static (left, right) => {
            int byTime = left.StepFraction.CompareTo(right.StepFraction);
            if (byTime != 0) return byTime;
            int byRound = left.RoundId.CompareTo(right.RoundId);
            return byRound != 0 ? byRound : left.TargetId.CompareTo(right.TargetId);
        });
    }

    void Fire(in Vec3D position, in Vec3D velocity,
        double effectiveHitRadiusM, long aimTargetId) {
        _rounds.Add(new GunRound(
            _nextRoundId++, position, velocity, 0.0,
            effectiveHitRadiusM, aimTargetId));
        if (!HasInfiniteAmmo) AmmoRemaining--;
        RoundsFired++;
        FiredThisStep = true;
    }

    bool StepBarrelHeat(bool firingRequested, double dt) {
        if (_heatConfig is null) return true;

        // A latched gun cools even if the pilot keeps squeezing the trigger because no rounds are
        // leaving the weapon. Crossing the strict re-arm threshold takes effect on the next step,
        // keeping the whole current tick on one deterministic thermal branch.
        if (BarrelOverheated) {
            BarrelHeat = System.Math.Max(0.0,
                BarrelHeat - dt / _heatConfig.FullCooldownSeconds);
            if (BarrelHeat < _heatConfig.RearmHeatThreshold)
                BarrelOverheated = false;
            return false;
        }

        if (!firingRequested) {
            BarrelHeat = System.Math.Max(0.0,
                BarrelHeat - dt / _heatConfig.FullCooldownSeconds);
            return true;
        }

        BarrelHeat = System.Math.Min(1.0,
            BarrelHeat + dt / _heatConfig.ContinuousFireSecondsToOverheat);
        if (BarrelHeat >= 1.0) {
            BarrelHeat = 1.0;
            BarrelOverheated = true;
            return false;
        }
        return true;
    }

    void AdvanceRounds(double dt, ReadOnlySpan<GunTarget> targets,
        double elapsedAtStart, double fixedStepDuration) {
        if (dt <= 0.0 || _rounds.Count == 0) return;
        double halfDtSquared = 0.5 * dt * dt;

        for (int i = _rounds.Count - 1; i >= 0; i--) {
            var round = _rounds[i];
            var nextPosition = round.Position + round.Velocity * dt + Gravity * halfDtSquared;
            var nextVelocity = round.Velocity + Gravity * dt;

            long hitTargetId = long.MaxValue;
            double hitFraction = double.PositiveInfinity;
            for (int targetIndex = 0; targetIndex < targets.Length; targetIndex++) {
                GunTarget target = targets[targetIndex];
                TargetDamageState damage = EnsureTarget(target.Id);
                // A target splashed by another round earlier in this processing loop is still a
                // physical airframe for the rest of the same sweep. Keep testing it so reverse
                // list iteration cannot let an older round ghost through the wreck into an
                // aircraft behind it.
                if (!target.Damageable) continue;

                Vec3D targetVelocity = target.State.VelocityVector();
                Vec3D targetStart = target.State.Position
                    + targetVelocity * elapsedAtStart;
                Vec3D targetEnd = targetStart + targetVelocity * dt;

                // Continuous intersection between the round chord and this target's moving chord.
                // At 120 Hz the gravity/chord deviation is under 0.1 mm. Resolve the sphere
                // ENTRY time rather than the time of closest approach so two intersected aircraft
                // cannot be ordered by their centres after the round has already touched one.
                Vec3D relativeStart = round.Position - targetStart;
                Vec3D relativeDelta = (nextPosition - targetEnd) - relativeStart;
                double hitRadiusM = target.Id == round.AimTargetId
                    ? round.EffectiveHitRadiusM : _hitRadiusM;
                if (!TrySweptSphereEntryFraction(
                        relativeStart, relativeDelta, hitRadiusM, out double fraction))
                    continue;
                if (fraction < hitFraction - 1e-12
                    || (System.Math.Abs(fraction - hitFraction) <= 1e-12
                        && target.Id < hitTargetId)) {
                    hitFraction = fraction;
                    hitTargetId = target.Id;
                }
            }

            if (hitTargetId != long.MaxValue) {
                _rounds.RemoveAt(i);
                TargetDamageState damage = EnsureTarget(hitTargetId);
                if (damage.Outcome == FightOutcome.Flying) {
                    damage.HitCount++;
                    damage.HitsThisStep++;
                    if (damage.HitCount >= _hitsToKill)
                        damage.Outcome = FightOutcome.Splash;
                    double fixedStepFraction = fixedStepDuration > 0.0
                        ? System.Math.Clamp(
                            (elapsedAtStart + hitFraction * dt) / fixedStepDuration,
                            0.0,
                            1.0)
                        : 0.0;
                    _impactsThisStep.Add(new GunImpact(
                        round.Id, hitTargetId, fixedStepFraction));
                }
                continue;
            }

            double age = round.AgeSeconds + dt;
            if (age >= _profile.MaximumFlightSeconds || nextPosition.Y < -100.0) {
                _rounds.RemoveAt(i);
                continue;
            }
            _rounds[i] = round with { Position = nextPosition, Velocity = nextVelocity, AgeSeconds = age };
        }
    }

    static bool TrySweptSphereEntryFraction(
        in Vec3D relativeStart,
        in Vec3D relativeDelta,
        double radiusM,
        out double fraction) {
        double radiusSquared = radiusM * radiusM;
        double c = relativeStart.Dot(relativeStart) - radiusSquared;
        if (c <= 0.0) {
            fraction = 0.0;
            return true;
        }

        double a = relativeDelta.Dot(relativeDelta);
        if (a < 1e-18) {
            fraction = 0.0;
            return false;
        }
        double b = 2.0 * relativeStart.Dot(relativeDelta);
        double discriminant = b * b - 4.0 * a * c;
        if (discriminant < 0.0) {
            fraction = 0.0;
            return false;
        }

        double root = System.Math.Sqrt(discriminant);
        double inverseTwoA = 0.5 / a;
        double entry = (-b - root) * inverseTwoA;
        double exit = (-b + root) * inverseTwoA;
        if (exit < 0.0 || entry > 1.0) {
            fraction = 0.0;
            return false;
        }
        fraction = System.Math.Clamp(entry, 0.0, 1.0);
        return true;
    }

    TargetDamageState EnsureTarget(long targetId) {
        if (_targetDamage.TryGetValue(targetId, out TargetDamageState? damage))
            return damage;
        damage = new TargetDamageState();
        _targetDamage.Add(targetId, damage);
        return damage;
    }

    void UpdateLead(in AircraftState own, in AircraftState bandit,
        double effectiveHitRadiusM, double dt) {
        var gunForward = GunDirection(own);
        var muzzle = own.Position + gunForward * MuzzleOffsetM;
        var relativePosition = bandit.Position - muzzle;
        var relativeVelocity = bandit.VelocityVector() - own.VelocityVector();

        HasLeadSolution = TrySolveLead(relativePosition, relativeVelocity, out var direction, out var tof);
        LeadDirection = HasLeadSolution ? direction : gunForward;
        LeadTimeOfFlight = HasLeadSolution ? tof : 0.0;
        double range = relativePosition.Length;
        LeadPipper = muzzle + LeadDirection * System.Math.Max(range, 1.0);

        double angularRadius = System.Math.Atan2(
            effectiveHitRadiusM, System.Math.Max(range, 1.0));
        InstantaneousGunSolution = HasLeadSolution
            && gunForward.Dot(LeadDirection) >= System.Math.Cos(angularRadius);
        UpdateQualifiedGunSolution(InstantaneousGunSolution, dt);
    }

    double EffectiveHitRadius(in AircraftState own, in AircraftState bandit) {
        double tailRadius = _profile.TailChaseEffectiveHitRadiusM;
        if (tailRadius <= _hitRadiusM) return _hitRadiusM;

        Vec3D ownToBandit = bandit.Position - own.Position;
        double range = ownToBandit.Length;
        if (!double.IsFinite(range) || range < 1e-6 || range > TailChaseMaximumRangeM)
            return _hitRadiusM;

        Vec3D lineOfSight = ownToBandit * (1.0 / range);
        double minimumTailAlignment = System.Math.Cos(
            TailChaseAspectLimitDeg * System.Math.PI / 180.0);
        return bandit.ForwardDir().Dot(lineOfSight) >= minimumTailAlignment
            ? tailRadius
            : _hitRadiusM;
    }

    void UpdateQualifiedGunSolution(bool instantaneous, double dt) {
        if (instantaneous == GunSolution) {
            _gunSolutionTransitionSeconds = 0.0;
            return;
        }
        _gunSolutionTransitionSeconds += dt;
        double dwell = instantaneous ? GunSolutionAcquireSeconds : GunSolutionReleaseSeconds;
        if (_gunSolutionTransitionSeconds < dwell) return;
        GunSolution = instantaneous;
        _gunSolutionTransitionSeconds = 0.0;
    }

    bool TrySolveLead(in Vec3D relativePosition, in Vec3D relativeVelocity,
        out Vec3D direction, out double timeOfFlight) {
        direction = Vec3D.Zero;
        timeOfFlight = 0.0;
        if (relativePosition.Length < 1e-6) return false;

        double lo = 0.0;
        double fLo = LeadEquation(relativePosition, relativeVelocity, lo);
        for (int i = 1; i <= LeadSearchSteps; i++) {
            double hi = _profile.MaximumFlightSeconds * i / LeadSearchSteps;
            double fHi = LeadEquation(relativePosition, relativeVelocity, hi);
            if (fHi <= 0.0 && fLo > 0.0) {
                for (int iteration = 0; iteration < LeadBisectionSteps; iteration++) {
                    double mid = 0.5 * (lo + hi);
                    double fMid = LeadEquation(relativePosition, relativeVelocity, mid);
                    if (fMid > 0.0) lo = mid;
                    else hi = mid;
                }
                timeOfFlight = 0.5 * (lo + hi);
                // Required muzzle-relative displacement includes gravity compensation: bullets
                // fall, so the gun line must point above the future target position.
                var required = relativePosition + relativeVelocity * timeOfFlight
                    - Gravity * (0.5 * timeOfFlight * timeOfFlight);
                direction = required.Normalized();
                return direction.Length > 0.5 && IsFinite(direction);
            }
            lo = hi;
            fLo = fHi;
        }
        return false;
    }

    double LeadEquation(in Vec3D relativePosition, in Vec3D relativeVelocity, double t) {
        var required = relativePosition + relativeVelocity * t - Gravity * (0.5 * t * t);
        double muzzleDistance = _profile.MuzzleVelocityMps * t;
        return required.Dot(required) - muzzleDistance * muzzleDistance;
    }

    /// <summary>
    /// Closed-form world position, NOW, of a round fired <paramref name="ageSeconds"/> ago — the
    /// "bullets in the air" locus a real EEGS funnel draws. The firing state is retrodicted from
    /// the CURRENT shooter state alone (position, velocity, gun line, world angular velocity),
    /// assuming the recent history was the current steady rotation: the gun line and velocity are
    /// rotated back through -omega*age (exact Rodrigues rotation), the flown path is the exact
    /// closed-form integral of that rotating velocity, and the round then flies ballistically:
    /// p = muzzle + v0*age + 0.5*g*age^2 — no stepping anywhere. Deterministic pure function of
    /// the arguments; age 0 is the muzzle station. With zero angular velocity the shooter's own
    /// displacement cancels exactly and the locus reduces to
    /// p + MuzzleOffset*f + muzzleVelocity*f*age + 0.5*g*age^2: relative to the shooter the
    /// rounds ride the gun line and fall with gravity — the classic tracer droop. (The
    /// instantaneous path p0 + v0*t + 0.5*g*t^2 of a round fired NOW is a near-ray from the eye
    /// and projects to a single point; only the fired-ago locus has real screen extent.)
    /// </summary>
    public static Vec3D BallisticFunnelPoint(in Vec3D shooterPosition, in Vec3D shooterVelocity,
        in Vec3D gunForward, in Vec3D worldAngularVelocityRadPerSecond,
        double muzzleVelocityMps, double ageSeconds) {
        double age = System.Math.Max(0.0, ageSeconds);
        double omega = worldAngularVelocityRadPerSecond.Length;
        Vec3D firedForward = gunForward;
        Vec3D firedVelocity = shooterVelocity;
        Vec3D flownPath = shooterVelocity * age;
        if (omega > 1e-9) {
            Vec3D axis = worldAngularVelocityRadPerSecond * (1.0 / omega);
            double angle = omega * age;
            firedForward = RotateAbout(gunForward, axis, -angle);
            firedVelocity = RotateAbout(shooterVelocity, axis, -angle);
            // Exact integral of R(-omega*s) * v over s in [0, age]:
            // planar*sin(wt)/w + (axis x v)*(cos(wt)-1)/w + axial*t.
            double sin = System.Math.Sin(angle);
            double cos = System.Math.Cos(angle);
            Vec3D axial = axis * axis.Dot(shooterVelocity);
            Vec3D planar = shooterVelocity - axial;
            Vec3D binormal = axis.Cross(shooterVelocity);
            flownPath = planar * (sin / omega)
                + binormal * ((cos - 1.0) / omega)
                + axial * age;
        }
        Vec3D muzzle = shooterPosition - flownPath + firedForward * MuzzleOffsetM;
        Vec3D initialVelocity = firedVelocity + firedForward * muzzleVelocityMps;
        return muzzle + initialVelocity * age + Gravity * (0.5 * age * age);
    }

    /// World angular velocity from body rates and the world images of the body axes, matching the
    /// attitude integrator convention (FlightModel/WreckContactMotion: omega quaternion
    /// (0, -Q, R, -P) in the (right, up, forward) body basis).
    public static Vec3D WorldAngularVelocity(in Vec3D bodyForward, in Vec3D bodyUp,
        in BodyRates rates) {
        Vec3D bodyRight = bodyUp.Cross(bodyForward);
        return bodyRight * -rates.Q + bodyUp * rates.R + bodyForward * -rates.P;
    }

    static Vec3D RotateAbout(in Vec3D v, in Vec3D unitAxis, double angleRad) {
        double cos = System.Math.Cos(angleRad);
        double sin = System.Math.Sin(angleRad);
        return v * cos + unitAxis.Cross(v) * sin + unitAxis * (unitAxis.Dot(v) * (1.0 - cos));
    }

    /// <summary>The physical body-axis gun direction used by both fire control and projectiles.</summary>
    public static Vec3D GunDirection(in AircraftState state) {
        if (state.BodyAttitude.IsFinite && state.BodyAttitude.LengthSquared >= 1e-12) {
            var bodyForward = state.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            if (IsFinite(bodyForward) && bodyForward.Length > 0.5) return bodyForward.Normalized();
        }
        return state.ForwardDir();
    }

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}

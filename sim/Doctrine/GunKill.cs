using System.Collections.Generic;

namespace GunsOnly.Sim.Doctrine;

public enum FightOutcome { Flying, Splash }

/// One deterministic .50-calibre round in world space. Velocity includes the firing aircraft's
/// translational velocity; gravity is integrated by GunKill while the round is alive.
public readonly record struct GunRound(int Id, Vec3D Position, Vec3D Velocity, double AgeSeconds);

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
    public const double MaxFlightSeconds = 1.75;
    public const double GravityMps2 = 9.80665;

    const double GunSolutionAcquireSeconds = 0.08;
    const double GunSolutionReleaseSeconds = 0.12;
    const int LeadSearchSteps = 128;
    const int LeadBisectionSteps = 48;
    static readonly Vec3D Gravity = new(0.0, -GravityMps2, 0.0);

    readonly List<GunRound> _rounds = new(48);
    readonly int _hitsToKill;
    readonly double _hitRadiusM;
    readonly GunProfile _profile;
    bool _triggerWasHeld;
    double _secondsToNextShot;
    double _gunSolutionTransitionSeconds;
    int _nextRoundId = 1;

    public GunKill(int ammo = DefaultAmmo, int hitsToKill = DefaultHitsToKill,
        double hitRadiusM = DefaultHitRadiusM, GunProfile? profile = null) {
        if (ammo < 0) throw new System.ArgumentOutOfRangeException(nameof(ammo));
        if (hitsToKill <= 0) throw new System.ArgumentOutOfRangeException(nameof(hitsToKill));
        _profile = profile ?? GunProfiles.SixM3FiftyCal;
        if (!double.IsFinite(_profile.MuzzleVelocityMps) || _profile.MuzzleVelocityMps <= 0.0
            || !double.IsFinite(_profile.RoundsPerSecond) || _profile.RoundsPerSecond <= 0.0
            || !double.IsFinite(_profile.MaximumFlightSeconds)
            || _profile.MaximumFlightSeconds <= 0.0
            || !double.IsFinite(_profile.EffectiveHitRadiusM)
            || _profile.EffectiveHitRadiusM <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(profile));
        double selectedHitRadius = profile is not null && hitRadiusM == DefaultHitRadiusM
            ? profile.EffectiveHitRadiusM
            : hitRadiusM;
        if (!double.IsFinite(selectedHitRadius) || selectedHitRadius <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(hitRadiusM));
        AmmoRemaining = ammo;
        _hitsToKill = hitsToKill;
        _hitRadiusM = selectedHitRadius;
    }

    public IReadOnlyList<GunRound> RoundsInFlight => _rounds;
    public GunProfile Profile => _profile;
    public int AmmoRemaining { get; private set; }
    public int RoundsFired { get; private set; }
    public int HitCount { get; private set; }
    public int HitsThisStep { get; private set; }
    public bool HitThisStep => HitsThisStep != 0;
    public double KillProgress => System.Math.Clamp((double)HitCount / _hitsToKill, 0.0, 1.0);
    public double TargetHealth => 1.0 - KillProgress;
    public bool TargetAlive => Outcome == FightOutcome.Flying;
    // Compatibility aliases for the current flat web projection. The kernel itself now uses the
    // generic target names because the same physical gun model can be owned by either combatant.
    public double BanditHealth => TargetHealth;
    public bool BanditAlive => TargetAlive;
    public FightOutcome Outcome { get; private set; } = FightOutcome.Flying;

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

    GunKill CreateReplacementTarget(bool preserveRoundsInFlight) {
        var next = new GunKill(AmmoRemaining, _hitsToKill, _hitRadiusM, _profile) {
            RoundsFired = RoundsFired,
            _triggerWasHeld = _triggerWasHeld,
            _secondsToNextShot = _secondsToNextShot,
            _nextRoundId = _nextRoundId,
        };
        if (preserveRoundsInFlight) next._rounds.AddRange(_rounds);
        return next;
    }

    /// Advance rounds and fire at exact deterministic cadence. Ownship and bandit are sampled at
    /// the beginning of dt; their velocities linearly carry both firing points and target motion
    /// between any shot events inside the step.
    public FightOutcome Step(bool triggerHeld, in AircraftState own, in AircraftState bandit, double dt) {
        if (!double.IsFinite(dt) || dt < 0.0) throw new System.ArgumentOutOfRangeException(nameof(dt));
        HitsThisStep = 0;
        UpdateLead(own, bandit, dt);
        if (Outcome != FightOutcome.Flying) return Outcome;

        var ownVelocity = own.VelocityVector();
        var banditVelocity = bandit.VelocityVector();
        var gunForward = GunForward(own);
        double elapsed = 0.0;

        if (!triggerHeld || AmmoRemaining == 0) {
            AdvanceRounds(dt, bandit.Position, banditVelocity);
            _triggerWasHeld = triggerHeld;
            _secondsToNextShot = 0.0;
            return Outcome;
        }

        // A trigger press fires immediately. A held trigger retains phase across any dt partition.
        if (!_triggerWasHeld) _secondsToNextShot = 0.0;
        while (elapsed <= dt && AmmoRemaining > 0 && Outcome == FightOutcome.Flying) {
            double untilShot = System.Math.Max(0.0, _secondsToNextShot);
            double remaining = dt - elapsed;
            if (untilShot > remaining + 1e-12) {
                AdvanceRounds(remaining, bandit.Position + banditVelocity * elapsed, banditVelocity);
                _secondsToNextShot = System.Math.Max(0.0, _secondsToNextShot - remaining);
                elapsed = dt;
                break;
            }

            if (untilShot > 0.0) {
                AdvanceRounds(untilShot, bandit.Position + banditVelocity * elapsed, banditVelocity);
                elapsed += untilShot;
                // The cadence boundary has elapsed even when an in-flight round splashes the
                // current target at that boundary. A successor target may therefore take the
                // shot scheduled at the shared instant without losing a full firing interval.
                _secondsToNextShot = System.Math.Max(0.0, _secondsToNextShot - untilShot);
                if (Outcome != FightOutcome.Flying) break;
            }

            var firingPosition = own.Position + ownVelocity * elapsed + gunForward * 4.0;
            Fire(firingPosition, ownVelocity + gunForward * _profile.MuzzleVelocityMps);
            _secondsToNextShot = 1.0 / _profile.RoundsPerSecond;

            // Avoid firing at t=dt and again at the next step's t=0. The shot at this boundary is
            // owned by this step and the full interval remains on the cadence clock.
            if (elapsed >= dt - 1e-12) break;
        }

        if (elapsed < dt && Outcome == FightOutcome.Flying) {
            double remaining = dt - elapsed;
            AdvanceRounds(remaining, bandit.Position + banditVelocity * elapsed, banditVelocity);
            _secondsToNextShot = System.Math.Max(0.0, _secondsToNextShot - remaining);
        }
        _triggerWasHeld = true;
        return Outcome;
    }

    void Fire(in Vec3D position, in Vec3D velocity) {
        _rounds.Add(new GunRound(_nextRoundId++, position, velocity, 0.0));
        AmmoRemaining--;
        RoundsFired++;
    }

    void AdvanceRounds(double dt, in Vec3D banditStart, in Vec3D banditVelocity) {
        if (dt <= 0.0 || _rounds.Count == 0) return;
        var banditEnd = banditStart + banditVelocity * dt;
        double halfDtSquared = 0.5 * dt * dt;

        for (int i = _rounds.Count - 1; i >= 0; i--) {
            var round = _rounds[i];
            var nextPosition = round.Position + round.Velocity * dt + Gravity * halfDtSquared;
            var nextVelocity = round.Velocity + Gravity * dt;

            // Continuous closest approach between the round chord and the target's moving chord.
            // At 120 Hz the gravity/chord deviation is under 0.1 mm, while this avoids tunnelling
            // through an 870 m/s target sphere between ticks.
            var relativeStart = round.Position - banditStart;
            var relativeDelta = (nextPosition - banditEnd) - relativeStart;
            double relativeDeltaSq = relativeDelta.Dot(relativeDelta);
            double fraction = relativeDeltaSq < 1e-18
                ? 0.0
                : System.Math.Clamp(-relativeStart.Dot(relativeDelta) / relativeDeltaSq, 0.0, 1.0);
            var closest = relativeStart + relativeDelta * fraction;
            if (closest.Dot(closest) <= _hitRadiusM * _hitRadiusM) {
                _rounds.RemoveAt(i);
                HitCount++;
                HitsThisStep++;
                if (HitCount >= _hitsToKill) Outcome = FightOutcome.Splash;
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

    void UpdateLead(in AircraftState own, in AircraftState bandit, double dt) {
        var gunForward = GunForward(own);
        var muzzle = own.Position + gunForward * 4.0;
        var relativePosition = bandit.Position - muzzle;
        var relativeVelocity = bandit.VelocityVector() - own.VelocityVector();

        HasLeadSolution = TrySolveLead(relativePosition, relativeVelocity, out var direction, out var tof);
        LeadDirection = HasLeadSolution ? direction : gunForward;
        LeadTimeOfFlight = HasLeadSolution ? tof : 0.0;
        double range = relativePosition.Length;
        LeadPipper = muzzle + LeadDirection * System.Math.Max(range, 1.0);

        double angularRadius = System.Math.Atan2(_hitRadiusM, System.Math.Max(range, 1.0));
        InstantaneousGunSolution = HasLeadSolution
            && gunForward.Dot(LeadDirection) >= System.Math.Cos(angularRadius);
        UpdateQualifiedGunSolution(InstantaneousGunSolution, dt);
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

    static Vec3D GunForward(in AircraftState state) {
        if (state.BodyAttitude.IsFinite && state.BodyAttitude.LengthSquared >= 1e-12) {
            var bodyForward = state.BodyAttitude.Rotate(new Vec3D(0.0, 0.0, 1.0));
            if (IsFinite(bodyForward) && bodyForward.Length > 0.5) return bodyForward.Normalized();
        }
        return state.ForwardDir();
    }

    static bool IsFinite(in Vec3D value) => double.IsFinite(value.X)
        && double.IsFinite(value.Y) && double.IsFinite(value.Z);
}

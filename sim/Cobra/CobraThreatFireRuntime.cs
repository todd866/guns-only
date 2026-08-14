using GunsOnly.Sim.Cobra.GroundWar;

namespace GunsOnly.Sim.Cobra;

public enum CobraThreatBurstSubsystem
{
    None,
    Scas,
    Engine
}

/// <summary>
/// Reduced-order live airframe geometry used only for burst intersection. Dimensions are
/// provisional gameplay envelopes, not a sourced vulnerability model: an oriented fuselage
/// capsule plus a narrower tail-boom capsule replaces the old 15 m-wide sphere at the CG.
/// </summary>
public readonly record struct CobraThreatAirframeGeometry(
    Vec3D CentreWorldM,
    QuaternionD BodyAttitude)
{
    public const double FuselageRadiusM = 1.35;
    public const double TailBoomRadiusM = 0.58;
    public static readonly Vec3D FuselageFirstBodyM = new(0.0, -0.15, 2.8);
    public static readonly Vec3D FuselageSecondBodyM = new(0.0, -0.10, -3.5);
    public static readonly Vec3D TailBoomFirstBodyM = new(0.0, 0.0, -3.2);
    public static readonly Vec3D TailBoomSecondBodyM = new(0.0, 0.35, -8.4);

    public bool IsFinite => CentreWorldM.IsFinite && BodyAttitude.IsFinite;

    public Vec3D BodyPointToWorld(in Vec3D bodyPointM) =>
        CentreWorldM + BodyAttitude.Normalized().Rotate(bodyPointM);

    public bool Intersects(in Vec3D pointWorldM)
    {
        Vec3D fuselageFirst = BodyPointToWorld(FuselageFirstBodyM);
        Vec3D fuselageSecond = BodyPointToWorld(FuselageSecondBodyM);
        if (DistanceSquaredPointToSegment(pointWorldM, fuselageFirst, fuselageSecond)
            <= FuselageRadiusM * FuselageRadiusM)
            return true;
        Vec3D tailFirst = BodyPointToWorld(TailBoomFirstBodyM);
        Vec3D tailSecond = BodyPointToWorld(TailBoomSecondBodyM);
        return DistanceSquaredPointToSegment(pointWorldM, tailFirst, tailSecond)
            <= TailBoomRadiusM * TailBoomRadiusM;
    }

    static double DistanceSquaredPointToSegment(
        in Vec3D point,
        in Vec3D first,
        in Vec3D second)
    {
        Vec3D segment = second - first;
        double lengthSquared = segment.Dot(segment);
        double fraction = lengthSquared <= 1e-12
            ? 0.0
            : Math.Clamp((point - first).Dot(segment) / lengthSquared, 0.0, 1.0);
        Vec3D offset = point - (first + segment * fraction);
        return offset.Dot(offset);
    }
}

/// <summary>
/// Authority-owned burst evidence. Presentation can draw the exact muzzle-to-impact path without
/// inventing a shooter, timing, hit verdict or subsystem result in the browser.
/// </summary>
public readonly record struct CobraThreatBurstEvent(
    long Sequence,
    string ObserverId,
    Vec3D SourceWorldM,
    Vec3D TargetWorldM,
    Vec3D ImpactWorldM,
    double FiredAtSeconds,
    double ImpactAtSeconds,
    bool WillHit,
    CobraThreatBurstSubsystem Subsystem,
    bool HasImpacted);

/// <summary>
/// Mission-owned, presentation-safe result of hostile observer fire against the current Cobra.
/// Damage is expressed only as named subsystem failures; there is deliberately no vehicle
/// hitpoint pool. The timing and effects are provisional gameplay values, not a sourced AH-1G
/// vulnerability or DShK ballistics model.
/// </summary>
public readonly record struct CobraBattleDamageState(
    string? ActiveObserverId,
    double ContinuousExposureSeconds,
    double AcquisitionProgress,
    int TrackingObservers,
    bool ThreatTracking,
    bool ReceivingFire,
    int BurstsFired,
    int PendingBursts,
    int DamagingHits,
    double? SecondsToNextImpact,
    bool ScasDamaged,
    bool EngineDamaged);

/// <summary>
/// Deterministic provisional DShK pressure derived exclusively from authored observer line of
/// sight. Exactly one nearest observer owns an acquisition track; masking or changing shooter
/// resets that track, so sites cannot pool progress. The first burst always misses visibly. The
/// second can damage SCAS, and a later warned hit can fail the engine through the provider seam.
/// Fired rounds retain their explicit travel after the player masks. No random hit rolls or
/// browser-owned damage exist in this authority.
/// </summary>
public sealed class CobraThreatFireRuntime
{
    /// <summary>Provisional time for one emplacement crew to track and open fire.</summary>
    public const double AcquisitionSeconds = 8.0;
    /// <summary>Provisional deliberate burst cadence after acquisition.</summary>
    public const double BurstIntervalSeconds = 5.0;
    /// <summary>
    /// Represents reaction, burst duration and a nonzero impact floor. Since the first burst is a
    /// near miss, the first damaging hit lands 15.0-22.7 s after uninterrupted initial exposure.
    /// </summary>
    public const double BurstImpactBaseDelaySeconds = 2.0;
    public const double ProvisionalProjectileSpeedMps = 850.0;
    public const double MaximumBurstTravelRangeM = 6_500.0;
    public const int MaximumRecentBursts = 16;
    public const double NearMissOffsetM = 24.0;
    public const double MinimumDispersionM = 0.12;
    public const double MaximumDispersionM = 0.48;

    readonly List<CobraThreatBurstEvent> _recentBursts = new();
    readonly Dictionary<long, CobraThreatBurstSubsystem> _plannedSubsystems = new();
    double _authorityTimeSeconds;
    string? _activeObserverId;
    double _continuousExposureSeconds;
    double _nextBurstExposureSeconds = AcquisitionSeconds;
    int _engagementBurstIndex;
    long _nextBurstSequence = 1;
    int _burstsFired;
    int _damagingHits;
    bool _scasDamaged;
    bool _engineDamaged;

    public CobraBattleDamageState State { get; private set; } = HealthyState();
    public IReadOnlyList<CobraThreatBurstEvent> RecentBursts => _recentBursts;

    public void Advance(
        double dtSeconds,
        CobraMaskingAssessment assessment,
        IReadOnlyList<CobraResolvedThreatObserver> resolvedObservers,
        IReadOnlyList<GroundUnit> groundUnits,
        in CobraThreatAirframeGeometry target)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        ArgumentNullException.ThrowIfNull(assessment);
        ArgumentNullException.ThrowIfNull(resolvedObservers);
        ArgumentNullException.ThrowIfNull(groundUnits);
        if (!target.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(target));

        double previousAuthorityTimeSeconds = _authorityTimeSeconds;
        _authorityTimeSeconds += dtSeconds;
        CobraThreatLineOfSight? firingSight = SelectFiringSight(assessment, groundUnits);
        CobraResolvedThreatObserver? firingObserver = firingSight is CobraThreatLineOfSight sight
            ? ResolveObserver(sight.ObserverId, resolvedObservers)
            : null;

        bool sameTrack = firingSight is CobraThreatLineOfSight selected
            && string.Equals(_activeObserverId, selected.ObserverId, StringComparison.Ordinal);
        if (!sameTrack)
        {
            ResetAcquisition();
            if (firingSight is CobraThreatLineOfSight newTrack)
                _activeObserverId = newTrack.ObserverId;
        }

        if (firingSight is CobraThreatLineOfSight activeSight
            && firingObserver is CobraResolvedThreatObserver activeObserver)
        {
            double previousExposureSeconds = _continuousExposureSeconds;
            _continuousExposureSeconds += dtSeconds;
            while (_nextBurstExposureSeconds <= _continuousExposureSeconds + 1e-12)
            {
                double secondsFromStepStart = Math.Max(
                    0.0,
                    _nextBurstExposureSeconds - previousExposureSeconds);
                double firedAtSeconds = previousAuthorityTimeSeconds + secondsFromStepStart;
                FireBurst(activeSight, activeObserver, target, firedAtSeconds);
                _nextBurstExposureSeconds += BurstIntervalSeconds;
            }
        }

        ResolveImpacts(target);
        TrimRecentBursts();
        int trackingObservers = 0;
        foreach (CobraThreatLineOfSight observer in assessment.Observers)
            if (observer.HasLineOfSight && IsOperationalAirThreat(observer.ObserverId, groundUnits))
                trackingObservers++;
        PublishState(trackingObservers);
    }

    public void ResetForFreshAirframe()
    {
        _recentBursts.Clear();
        _plannedSubsystems.Clear();
        _authorityTimeSeconds = 0.0;
        _nextBurstSequence = 1;
        _burstsFired = 0;
        _damagingHits = 0;
        _scasDamaged = false;
        _engineDamaged = false;
        ResetAcquisition();
        State = HealthyState();
    }

    CobraThreatLineOfSight? SelectFiringSight(
        CobraMaskingAssessment assessment,
        IReadOnlyList<GroundUnit> groundUnits)
    {
        CobraThreatLineOfSight? active = assessment.Observers.FirstOrDefault(observer =>
            observer.HasLineOfSight
            && IsOperationalAirThreat(observer.ObserverId, groundUnits)
            && string.Equals(observer.ObserverId, _activeObserverId, StringComparison.Ordinal));
        if (active is CobraThreatLineOfSight held && held.HasLineOfSight)
            return held;

        return assessment.Observers
            .Where(observer => observer.HasLineOfSight
                && IsOperationalAirThreat(observer.ObserverId, groundUnits))
            .OrderBy(observer => observer.RangeM)
            .ThenBy(observer => observer.ObserverId, StringComparer.Ordinal)
            .Cast<CobraThreatLineOfSight?>()
            .FirstOrDefault();
    }

    static bool IsOperationalAirThreat(
        string observerId,
        IReadOnlyList<GroundUnit> groundUnits)
    {
        foreach (GroundUnit unit in groundUnits)
        {
            if (!string.Equals(unit.Id, observerId, StringComparison.Ordinal)) continue;
            return unit.IsAlive
                && unit.Faction == GroundFaction.Hostile
                && unit.Role == GroundUnitRole.DshkSite;
        }
        return false;
    }

    static CobraResolvedThreatObserver ResolveObserver(
        string observerId,
        IReadOnlyList<CobraResolvedThreatObserver> observers)
    {
        foreach (CobraResolvedThreatObserver observer in observers)
        {
            if (string.Equals(observer.Id, observerId, StringComparison.Ordinal))
                return observer;
        }
        throw new InvalidOperationException(
            $"Visible threat observer '{observerId}' has no resolved emplacement position.");
    }

    void FireBurst(
        in CobraThreatLineOfSight sight,
        in CobraResolvedThreatObserver observer,
        in CobraThreatAirframeGeometry target,
        double firedAtSeconds)
    {
        _engagementBurstIndex++;
        long sequence = _nextBurstSequence++;
        // Every engagement opens with a telegraphed near miss. Burst 2 aims at SCAS and burst 4
        // aims at the engine, but neither is a hit until live airframe geometry intersects it at
        // arrival. Keeping the planned verdict private prevents presentation from claiming a hit.
        CobraThreatBurstSubsystem plannedSubsystem = _engagementBurstIndex switch {
            2 => CobraThreatBurstSubsystem.Scas,
            4 => CobraThreatBurstSubsystem.Engine,
            _ => CobraThreatBurstSubsystem.None,
        };
        double rangeM = Math.Clamp(sight.RangeM, 0.0, MaximumBurstTravelRangeM);
        double impactAtSeconds = firedAtSeconds + BurstImpactBaseDelaySeconds
            + rangeM / ProvisionalProjectileSpeedMps;
        Vec3D impactWorldM;
        if (plannedSubsystem != CobraThreatBurstSubsystem.None)
        {
            Vec3D bodyAimM = plannedSubsystem == CobraThreatBurstSubsystem.Engine
                ? new Vec3D(0.0, 0.15, -1.35)
                : new Vec3D(0.0, -0.05, 0.85);
            impactWorldM = target.BodyPointToWorld(bodyAimM)
                + SeededDispersion(observer.Id, sequence, rangeM, target.BodyAttitude);
        }
        else
        {
            impactWorldM = NearMissPosition(
                observer.PositionWorldM,
                target.CentreWorldM,
                sequence);
        }
        _recentBursts.Add(new CobraThreatBurstEvent(
            sequence,
            observer.Id,
            observer.PositionWorldM,
            target.CentreWorldM,
            impactWorldM,
            firedAtSeconds,
            impactAtSeconds,
            WillHit: false,
            Subsystem: CobraThreatBurstSubsystem.None,
            HasImpacted: false));
        _plannedSubsystems[sequence] = plannedSubsystem;
        _burstsFired++;
    }

    void ResolveImpacts(in CobraThreatAirframeGeometry currentTarget)
    {
        for (int index = 0; index < _recentBursts.Count; index++)
        {
            CobraThreatBurstEvent burst = _recentBursts[index];
            if (burst.HasImpacted || burst.ImpactAtSeconds > _authorityTimeSeconds + 1e-12)
                continue;
            CobraThreatBurstSubsystem plannedSubsystem = _plannedSubsystems.GetValueOrDefault(
                burst.Sequence,
                CobraThreatBurstSubsystem.None);
            bool intersectsAirframe = plannedSubsystem != CobraThreatBurstSubsystem.None
                && currentTarget.Intersects(burst.ImpactWorldM);
            CobraThreatBurstSubsystem resolvedSubsystem = intersectsAirframe
                ? plannedSubsystem
                : CobraThreatBurstSubsystem.None;
            _recentBursts[index] = burst with {
                HasImpacted = true,
                WillHit = intersectsAirframe,
                Subsystem = resolvedSubsystem,
            };
            _plannedSubsystems.Remove(burst.Sequence);
            if (!intersectsAirframe) continue;
            _damagingHits++;
            if (resolvedSubsystem == CobraThreatBurstSubsystem.Scas)
                _scasDamaged = true;
            else if (resolvedSubsystem == CobraThreatBurstSubsystem.Engine)
                _engineDamaged = true;
        }
    }

    void ResetAcquisition()
    {
        _activeObserverId = null;
        _continuousExposureSeconds = 0.0;
        _nextBurstExposureSeconds = AcquisitionSeconds;
        _engagementBurstIndex = 0;
    }

    void TrimRecentBursts()
    {
        while (_recentBursts.Count > MaximumRecentBursts)
        {
            int removable = _recentBursts.FindIndex(burst => burst.HasImpacted);
            if (removable < 0) break;
            _plannedSubsystems.Remove(_recentBursts[removable].Sequence);
            _recentBursts.RemoveAt(removable);
        }
    }

    void PublishState(int trackingObservers)
    {
        int pendingBursts = _recentBursts.Count(burst => !burst.HasImpacted);
        double? nextImpactSeconds = _recentBursts
            .Where(burst => !burst.HasImpacted)
            .Select(burst => burst.ImpactAtSeconds)
            .DefaultIfEmpty(double.NaN)
            .Min();
        if (nextImpactSeconds is double next && double.IsNaN(next))
            nextImpactSeconds = null;
        bool threatTracking = _activeObserverId is not null;
        State = new CobraBattleDamageState(
            _activeObserverId,
            _continuousExposureSeconds,
            AcquisitionProgress: threatTracking
                ? Math.Clamp(_continuousExposureSeconds / AcquisitionSeconds, 0.0, 1.0)
                : 0.0,
            TrackingObservers: trackingObservers,
            ThreatTracking: threatTracking,
            // The player-facing warning means rounds are physically in flight, not that a crew
            // has merely completed acquisition between bursts.
            ReceivingFire: pendingBursts > 0,
            BurstsFired: _burstsFired,
            PendingBursts: pendingBursts,
            DamagingHits: _damagingHits,
            SecondsToNextImpact: nextImpactSeconds is double impactSeconds
                ? Math.Max(0.0, impactSeconds - _authorityTimeSeconds)
                : null,
            ScasDamaged: _scasDamaged,
            EngineDamaged: _engineDamaged);
    }

    static Vec3D NearMissPosition(
        in Vec3D sourceWorldM,
        in Vec3D targetWorldM,
        long sequence)
    {
        Vec3D path = targetWorldM - sourceWorldM;
        double horizontalLength = Math.Sqrt(path.X * path.X + path.Z * path.Z);
        Vec3D perpendicular = horizontalLength > 1e-9
            ? new Vec3D(-path.Z / horizontalLength, 0.0, path.X / horizontalLength)
            : new Vec3D(1.0, 0.0, 0.0);
        double side = sequence % 4 is 0 or 1 ? 1.0 : -1.0;
        return targetWorldM + perpendicular * (side * NearMissOffsetM)
            + new Vec3D(0.0, -4.0, 0.0);
    }

    /// <summary>
    /// Stable FNV-derived two-axis dispersion. It grows with range but remains small enough that
    /// a stationary aimed burst can intersect the fuselage; maneuvering changes the live capsule
    /// location and is the actual evasion gate. No frame-rate or browser randomness enters.
    /// </summary>
    static Vec3D SeededDispersion(
        string observerId,
        long sequence,
        double rangeM,
        in QuaternionD bodyAttitude)
    {
        uint hash = 2_166_136_261;
        foreach (char character in observerId)
        {
            hash ^= character;
            hash *= 16_777_619;
        }
        unchecked
        {
            hash ^= (uint)sequence;
            hash *= 16_777_619;
            hash ^= (uint)(sequence >> 32);
            hash *= 16_777_619;
        }
        double rightSample = (hash & 0xffff) / 65_535.0 * 2.0 - 1.0;
        double upSample = ((hash >> 16) & 0xffff) / 65_535.0 * 2.0 - 1.0;
        double rangeFraction = Math.Clamp(rangeM / MaximumBurstTravelRangeM, 0.0, 1.0);
        double dispersionM = MinimumDispersionM
            + (MaximumDispersionM - MinimumDispersionM) * rangeFraction;
        QuaternionD attitude = bodyAttitude.Normalized();
        return attitude.Rotate(new Vec3D(
            rightSample * dispersionM,
            upSample * dispersionM,
            0.0));
    }

    static CobraBattleDamageState HealthyState() => new(
        ActiveObserverId: null,
        ContinuousExposureSeconds: 0.0,
        AcquisitionProgress: 0.0,
        TrackingObservers: 0,
        ThreatTracking: false,
        ReceivingFire: false,
        BurstsFired: 0,
        PendingBursts: 0,
        DamagingHits: 0,
        SecondsToNextImpact: null,
        ScasDamaged: false,
        EngineDamaged: false);
}

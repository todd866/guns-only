namespace GunsOnly.Sim;

/// <summary>
/// Mission-authored home/recovery intent. This is deliberately independent of <see cref="Carrier"/>:
/// a mission may know where home and its protected arrival reserve are before the simulation owns
/// conventional runway-contact physics for that site.
/// </summary>
public sealed record RecoveryPlan {
    public string Id { get; }
    public string DisplayName { get; }
    public Vec3D Position { get; }
    public double RequiredLandingReserveLb { get; }
    public ConventionalRunwayGeometry? ConventionalRunway { get; }

    public RecoveryPlan(string id, string displayName, in Vec3D position,
        double requiredLandingReserveLb,
        ConventionalRunwayGeometry? conventionalRunway = null) {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("recovery plan id is required", nameof(id));
        if (string.IsNullOrWhiteSpace(displayName))
            throw new ArgumentException("recovery display name is required",
                nameof(displayName));
        if (!position.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(position));
        if (!double.IsFinite(requiredLandingReserveLb)
            || requiredLandingReserveLb < 0.0)
            throw new ArgumentOutOfRangeException(nameof(requiredLandingReserveLb));
        conventionalRunway?.ValidateAimPoint(position);

        Id = id;
        DisplayName = displayName;
        Position = position;
        RequiredLandingReserveLb = requiredLandingReserveLb;
        ConventionalRunway = conventionalRunway;
    }
}

/// <summary>
/// Conventional runway surface in the simulation's X=east, Y=up, Z=north metre frame.
/// <see cref="ThresholdPosition"/> is the centre of the landing threshold at pavement elevation.
/// <see cref="LandingHeadingRad"/> points from that threshold toward the far end, so it is also the
/// rollout direction. A recovery plan's navigation <c>Position</c> is the touchdown aim point and
/// must lie on this rectangle; runway physics can therefore consume the geometry without guessing
/// whether "home" meant the centre, threshold, or airport reference point.
/// </summary>
public sealed record ConventionalRunwayGeometry {
    public Vec3D ThresholdPosition { get; }
    public double LandingHeadingRad { get; }
    public double LengthM { get; }
    public double WidthM { get; }
    public double ElevationM => ThresholdPosition.Y;
    public Vec3D RolloutDirection => new(
        Math.Sin(LandingHeadingRad), 0.0, Math.Cos(LandingHeadingRad));
    public Vec3D FarEndPosition => ThresholdPosition + RolloutDirection * LengthM;

    public ConventionalRunwayGeometry(in Vec3D thresholdPosition,
        double landingHeadingRad, double lengthM, double widthM) {
        if (!thresholdPosition.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(thresholdPosition));
        if (!double.IsFinite(landingHeadingRad))
            throw new ArgumentOutOfRangeException(nameof(landingHeadingRad));
        if (!double.IsFinite(lengthM) || lengthM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(lengthM));
        if (!double.IsFinite(widthM) || widthM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(widthM));

        ThresholdPosition = thresholdPosition;
        LandingHeadingRad = Math.Atan2(
            Math.Sin(landingHeadingRad), Math.Cos(landingHeadingRad));
        LengthM = lengthM;
        WidthM = widthM;
    }

    internal void ValidateAimPoint(in Vec3D aimPoint) {
        Vec3D offset = aimPoint - ThresholdPosition;
        Vec3D forward = RolloutDirection;
        Vec3D right = new(forward.Z, 0.0, -forward.X);
        double alongM = offset.X * forward.X + offset.Z * forward.Z;
        double crossM = offset.X * right.X + offset.Z * right.Z;
        if (Math.Abs(offset.Y) > 0.01
            || alongM < 0.0 || alongM > LengthM
            || Math.Abs(crossM) > WidthM * 0.5)
            throw new ArgumentOutOfRangeException(nameof(aimPoint),
                "touchdown aim must lie on the runway centre-surface rectangle");
    }
}

/// <summary>
/// Current-condition recovery estimate. Closure is signed: positive means making progress toward
/// home, zero is abeam/stationary, and negative is opening. Time and fuel projections are absent
/// unless closure exceeds the deliberately small one-knot progress floor. They are estimates at
/// the present ground vector and damped cockpit fuel-flow indication, not a route or engine-deck
/// forecast.
/// </summary>
public readonly record struct RecoveryNavigationProjection(
    bool RecoveryPointKnown,
    RtbGuidance Guidance,
    double? ClosureKts,
    double? EtaMinutes,
    double? FuelToHomeEstimateLb,
    double? FuelOnArrivalEstimateLb,
    double? ReserveTargetLb,
    double? ReserveMarginLb) {
    public static RecoveryNavigationProjection Unknown => new(
        RecoveryPointKnown: false,
        Guidance: default,
        ClosureKts: null,
        EtaMinutes: null,
        FuelToHomeEstimateLb: null,
        FuelOnArrivalEstimateLb: null,
        ReserveTargetLb: null,
        ReserveMarginLb: null);
}

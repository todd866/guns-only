using System.Collections.ObjectModel;

namespace GunsOnly.Sim.Korea;

public enum CableHistoryLabel {
    Measured,
    Reconstructed,
    Fiction
}

[Flags]
public enum CableCollisionLayer {
    None = 0,
    PlayerAirframe = 1 << 0,
    OtherAircraft = 1 << 1,
    GroundVehicle = 1 << 2
}

public readonly record struct CableActivationBounds(Vec3D Minimum, Vec3D Maximum) {
    public bool Contains(in Vec3D point) =>
        point.X >= Minimum.X && point.X <= Maximum.X
        && point.Y >= Minimum.Y && point.Y <= Maximum.Y
        && point.Z >= Minimum.Z && point.Z <= Maximum.Z;

    public CableActivationBounds Expanded(double marginM) {
        if (!double.IsFinite(marginM) || marginM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(marginM));
        var margin = new Vec3D(marginM, marginM, marginM);
        return new CableActivationBounds(Minimum - margin, Maximum + margin);
    }
}

/// <summary>
/// Immutable cable truth shared by renderer and collision. Presentation may make it more legible,
/// but cannot substitute a different centerline.
/// </summary>
public sealed class CableDefinition {
    readonly ReadOnlyCollection<Vec3D> _supportPoints;
    readonly ReadOnlyCollection<string> _historicalSourceIds;

    public CableDefinition(
        string id,
        IEnumerable<Vec3D> supportPoints,
        double radiusM,
        string materialProfileId,
        string renderProfileId,
        CableHistoryLabel historyLabel,
        IEnumerable<string> historicalSourceIds,
        string geometryRecordId,
        CableCollisionLayer collisionLayers,
        string requiredStreamingResidencyId) {
        ArmstrongContractValidation.StableId(id, nameof(id));
        ArmstrongContractValidation.StableId(
            materialProfileId, nameof(materialProfileId));
        ArmstrongContractValidation.StableId(renderProfileId, nameof(renderProfileId));
        ArmstrongContractValidation.StableId(
            geometryRecordId, nameof(geometryRecordId));
        ArmstrongContractValidation.StableId(
            requiredStreamingResidencyId, nameof(requiredStreamingResidencyId));
        if (!Enum.IsDefined(historyLabel))
            throw new ArgumentOutOfRangeException(nameof(historyLabel));
        if (!double.IsFinite(radiusM) || radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (collisionLayers == CableCollisionLayer.None
            || (collisionLayers & ~AllLayers) != 0)
            throw new ArgumentOutOfRangeException(nameof(collisionLayers));

        Vec3D[] points = supportPoints?.ToArray()
            ?? throw new ArgumentNullException(nameof(supportPoints));
        if (points.Length < 2)
            throw new ArgumentException(
                "Cable truth requires at least two support points.",
                nameof(supportPoints));
        foreach (Vec3D point in points)
            ArmstrongContractValidation.Finite(point, nameof(supportPoints));
        for (int index = 1; index < points.Length; index++) {
            if ((points[index] - points[index - 1]).Length <= 1e-6)
                throw new ArgumentException(
                    "Adjacent cable support points must be distinct.",
                    nameof(supportPoints));
        }

        string[] sources = historicalSourceIds?.ToArray()
            ?? throw new ArgumentNullException(nameof(historicalSourceIds));
        if (sources.Length == 0 && historyLabel != CableHistoryLabel.Fiction)
            throw new ArgumentException(
                "Measured or reconstructed cable history requires at least one source "
                    + "distinct from its geometry record.",
                nameof(historicalSourceIds));
        foreach (string sourceId in sources)
            ArmstrongContractValidation.StableId(
                sourceId, nameof(historicalSourceIds));

        Id = id;
        RadiusM = radiusM;
        MaterialProfileId = materialProfileId;
        RenderProfileId = renderProfileId;
        HistoryLabel = historyLabel;
        GeometryRecordId = geometryRecordId;
        CollisionLayers = collisionLayers;
        RequiredStreamingResidencyId = requiredStreamingResidencyId;
        _supportPoints = Array.AsReadOnly(points);
        _historicalSourceIds = Array.AsReadOnly(sources);
        ActivationBounds = Bounds(points, radiusM);
    }

    static CableCollisionLayer AllLayers => CableCollisionLayer.PlayerAirframe
        | CableCollisionLayer.OtherAircraft
        | CableCollisionLayer.GroundVehicle;

    public string Id { get; }
    public IReadOnlyList<Vec3D> SupportPoints => _supportPoints;
    public double RadiusM { get; }
    public string MaterialProfileId { get; }
    public string RenderProfileId { get; }
    public CableHistoryLabel HistoryLabel { get; }
    /// <summary>
    /// Sources for the historical claim which motivated this hazard. They do not source the
    /// authored support points, radius, height, material, or obstacle purpose.
    /// </summary>
    public IReadOnlyList<string> HistoricalSourceIds => _historicalSourceIds;
    /// <summary>
    /// Stable record for the measured, reconstructed, or fictional geometry itself. Keeping this
    /// separate prevents a historical source from appearing to contain authored coordinates.
    /// </summary>
    public string GeometryRecordId { get; }
    public CableCollisionLayer CollisionLayers { get; }
    public string RequiredStreamingResidencyId { get; }
    /// <summary>
    /// Centerline streaming bounds expanded by cable radius. This is not an aircraft-collision
    /// broadphase: expand it by the querying component radius via <see cref="CollisionBounds"/>.
    /// </summary>
    public CableActivationBounds ActivationBounds { get; }

    public CableActivationBounds CollisionBounds(double componentRadiusM) {
        if (!double.IsFinite(componentRadiusM) || componentRadiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(componentRadiusM));
        return ActivationBounds.Expanded(componentRadiusM);
    }

    static CableActivationBounds Bounds(Vec3D[] points, double margin) {
        double minX = points.Min(point => point.X) - margin;
        double minY = points.Min(point => point.Y) - margin;
        double minZ = points.Min(point => point.Z) - margin;
        double maxX = points.Max(point => point.X) + margin;
        double maxY = points.Max(point => point.Y) + margin;
        double maxZ = points.Max(point => point.Z) + margin;
        return new CableActivationBounds(
            new Vec3D(minX, minY, minZ),
            new Vec3D(maxX, maxY, maxZ));
    }
}

public readonly record struct CablePreContactState(
    Vec3D AircraftPosition,
    Vec3D AircraftVelocity,
    QuaternionD BodyAttitude,
    double PilotLateralInput,
    double RudderInput,
    double NormalLoadDemandG,
    double Throttle);

/// <summary>A swept spherical component volume over one fixed authority tick.</summary>
public readonly record struct AircraftComponentSweep(
    string ComponentId,
    Vec3D PreviousWorldCenter,
    Vec3D CurrentWorldCenter,
    double RadiusM,
    double TickDurationS,
    CableCollisionLayer Layer,
    CablePreContactState PreContactState,
    string DamageProfileId,
    CableContactResponseProfile ResponseProfile);

/// <summary>
/// Explicit reconstruction response. It produces evidence for an integration owner to apply; the
/// hazard field itself never changes aircraft velocity or damage state.
/// </summary>
public sealed record CableContactResponseProfile {
    public CableContactResponseProfile(
        string id,
        double equivalentSnagMassKg,
        double maximumImpulseNs) {
        ArmstrongContractValidation.StableId(id, nameof(id));
        if (!double.IsFinite(equivalentSnagMassKg) || equivalentSnagMassKg <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(equivalentSnagMassKg));
        if (!double.IsFinite(maximumImpulseNs) || maximumImpulseNs <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maximumImpulseNs));
        Id = id;
        EquivalentSnagMassKg = equivalentSnagMassKg;
        MaximumImpulseNs = maximumImpulseNs;
    }

    public string Id { get; }
    public double EquivalentSnagMassKg { get; }
    public double MaximumImpulseNs { get; }
}

/// <summary>
/// Scenario-owned component geometry. Two real aircraft poses produce the same outer-wing volume
/// in world space at both ends of an authority tick; callers cannot substitute a story trigger.
/// </summary>
public sealed class AirframeComponentCollisionVolume {
    public AirframeComponentCollisionVolume(
        string componentId,
        in Vec3D bodyLocalCenterM,
        double radiusM,
        CableCollisionLayer layer,
        string damageProfileId,
        CableContactResponseProfile responseProfile) {
        ArmstrongContractValidation.StableId(componentId, nameof(componentId));
        ArmstrongContractValidation.Finite(bodyLocalCenterM, nameof(bodyLocalCenterM));
        if (!double.IsFinite(radiusM) || radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (layer == CableCollisionLayer.None)
            throw new ArgumentOutOfRangeException(nameof(layer));
        ArmstrongContractValidation.StableId(damageProfileId, nameof(damageProfileId));
        ComponentId = componentId;
        BodyLocalCenterM = bodyLocalCenterM;
        RadiusM = radiusM;
        Layer = layer;
        DamageProfileId = damageProfileId;
        ResponseProfile = responseProfile
            ?? throw new ArgumentNullException(nameof(responseProfile));
    }

    public string ComponentId { get; }
    public Vec3D BodyLocalCenterM { get; }
    public double RadiusM { get; }
    public CableCollisionLayer Layer { get; }
    public string DamageProfileId { get; }
    public CableContactResponseProfile ResponseProfile { get; }

    public AircraftComponentSweep Sweep(
        in AircraftState previous,
        in AircraftState current,
        double tickDurationS,
        double pilotLateralInput,
        double rudderInput,
        double normalLoadDemandG,
        double throttle) {
        if (!double.IsFinite(tickDurationS) || tickDurationS <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(tickDurationS));
        Vec3D previousCenter = previous.Position
            + previous.BodyAttitude.Rotate(BodyLocalCenterM);
        Vec3D currentCenter = current.Position
            + current.BodyAttitude.Rotate(BodyLocalCenterM);
        return new AircraftComponentSweep(
            ComponentId,
            previousCenter,
            currentCenter,
            RadiusM,
            tickDurationS,
            Layer,
            new CablePreContactState(
                previous.Position,
                previous.VelocityVector(),
                previous.BodyAttitude,
                pilotLateralInput,
                rudderInput,
                normalLoadDemandG,
                throttle),
            DamageProfileId,
            ResponseProfile);
    }
}

public readonly record struct CableContactRecord(
    string CableId,
    int SegmentIndex,
    string AircraftComponentId,
    Vec3D WorldContactPoint,
    Vec3D CableTangent,
    Vec3D RelativeVelocityMps,
    double ParametricTimeWithinTick,
    double TimeWithinTickS,
    CablePreContactState PreContactState,
    Vec3D AppliedImpulseNs,
    string ContactResponseProfileId,
    string ResultingDamageProfileId);

/// <summary>
/// Deterministic continuous collision of a moving component sphere against static cable capsules.
/// Both endpoints may be clear: the swept path remains authoritative at fast-jet tick speeds.
/// </summary>
public sealed class CableHazardField {
    const double TieTolerance = 1e-12;
    readonly ReadOnlyCollection<CableDefinition> _cables;

    public CableHazardField(IEnumerable<CableDefinition> cables) {
        CableDefinition[] copy = cables?.ToArray()
            ?? throw new ArgumentNullException(nameof(cables));
        if (copy.Length == 0)
            throw new ArgumentException(
                "A cable field requires at least one cable.", nameof(cables));
        if (copy.Any(cable => cable is null))
            throw new ArgumentException("Cable definitions cannot be null.", nameof(cables));
        if (copy.Select(cable => cable.Id).Distinct(StringComparer.Ordinal).Count()
            != copy.Length)
            throw new ArgumentException("Cable IDs must be unique.", nameof(cables));
        _cables = Array.AsReadOnly(copy);
    }

    public IReadOnlyList<CableDefinition> Cables => _cables;

    public bool TrySweepFirst(
        in AircraftComponentSweep sweep,
        out CableContactRecord contact) {
        ValidateSweep(sweep);
        bool found = false;
        CableContactRecord earliest = default;

        foreach (CableDefinition cable in _cables) {
            if ((cable.CollisionLayers & sweep.Layer) == 0) continue;
            for (int segment = 0; segment + 1 < cable.SupportPoints.Count; segment++) {
                if (!TrySegmentContact(
                    cable, segment, sweep, out CableContactRecord candidate))
                    continue;
                if (!found || ComesBefore(candidate, earliest)) {
                    earliest = candidate;
                    found = true;
                }
            }
        }

        contact = earliest;
        return found;
    }

    static bool ComesBefore(
        in CableContactRecord candidate,
        in CableContactRecord current) {
        double delta = candidate.ParametricTimeWithinTick
            - current.ParametricTimeWithinTick;
        if (delta < -TieTolerance) return true;
        if (System.Math.Abs(delta) > TieTolerance) return false;
        int idOrder = StringComparer.Ordinal.Compare(candidate.CableId, current.CableId);
        return idOrder < 0
            || (idOrder == 0 && candidate.SegmentIndex < current.SegmentIndex);
    }

    static bool TrySegmentContact(
        CableDefinition cable,
        int segmentIndex,
        in AircraftComponentSweep sweep,
        out CableContactRecord contact) {
        Vec3D cableStart = cable.SupportPoints[segmentIndex];
        Vec3D cableEnd = cable.SupportPoints[segmentIndex + 1];
        double combinedRadius = cable.RadiusM + sweep.RadiusM;
        (double closestTime, _) = ClosestSegmentParameters(
            sweep.PreviousWorldCenter,
            sweep.CurrentWorldCenter,
            cableStart,
            cableEnd);
        double closestDistanceSquared = DistanceSquaredAt(
            sweep, cableStart, cableEnd, closestTime, out _);
        if (closestDistanceSquared > combinedRadius * combinedRadius) {
            contact = default;
            return false;
        }

        double contactTime;
        double startDistanceSquared = DistanceSquaredAt(
            sweep, cableStart, cableEnd, 0.0, out _);
        if (startDistanceSquared <= combinedRadius * combinedRadius) {
            contactTime = 0.0;
        } else {
            double low = 0.0;
            double high = closestTime;
            // Distance to a convex segment is non-increasing before its first minimizer. Fixed
            // iterations make the result deterministic across machines and frame schedules.
            for (int iteration = 0; iteration < 56; iteration++) {
                double middle = 0.5 * (low + high);
                double distanceSquared = DistanceSquaredAt(
                    sweep, cableStart, cableEnd, middle, out _);
                if (distanceSquared <= combinedRadius * combinedRadius)
                    high = middle;
                else
                    low = middle;
            }
            contactTime = high;
        }

        Vec3D path = sweep.CurrentWorldCenter - sweep.PreviousWorldCenter;
        Vec3D componentCenter = sweep.PreviousWorldCenter + path * contactTime;
        _ = DistanceSquaredAt(
            sweep, cableStart, cableEnd, contactTime, out Vec3D cablePoint);
        Vec3D toCable = cablePoint - componentCenter;
        Vec3D normal = toCable.Length > 1e-9
            ? toCable.Normalized()
            : (cableEnd - cableStart).Normalized().Cross(new Vec3D(0.0, 1.0, 0.0));
        if (normal.Length <= 1e-9) normal = new Vec3D(1.0, 0.0, 0.0);
        Vec3D componentSurface = componentCenter + normal * sweep.RadiusM;
        Vec3D cableSurface = cablePoint - normal * cable.RadiusM;
        Vec3D worldContact = (componentSurface + cableSurface) * 0.5;
        Vec3D relativeVelocity = path * (1.0 / sweep.TickDurationS);
        double impulseMagnitude = System.Math.Min(
            sweep.ResponseProfile.MaximumImpulseNs,
            relativeVelocity.Length * sweep.ResponseProfile.EquivalentSnagMassKg);
        Vec3D impulse = relativeVelocity.Length <= 1e-9
            ? Vec3D.Zero
            : relativeVelocity.Normalized() * -impulseMagnitude;

        contact = new CableContactRecord(
            cable.Id,
            segmentIndex,
            sweep.ComponentId,
            worldContact,
            (cableEnd - cableStart).Normalized(),
            relativeVelocity,
            contactTime,
            contactTime * sweep.TickDurationS,
            sweep.PreContactState,
            impulse,
            sweep.ResponseProfile.Id,
            sweep.DamageProfileId);
        return true;
    }

    static double DistanceSquaredAt(
        in AircraftComponentSweep sweep,
        in Vec3D cableStart,
        in Vec3D cableEnd,
        double time,
        out Vec3D cablePoint) {
        Vec3D componentPoint = sweep.PreviousWorldCenter
            + (sweep.CurrentWorldCenter - sweep.PreviousWorldCenter) * time;
        Vec3D cable = cableEnd - cableStart;
        double lengthSquared = cable.Dot(cable);
        double parameter = lengthSquared <= 1e-18
            ? 0.0
            : System.Math.Clamp((componentPoint - cableStart).Dot(cable)
                / lengthSquared, 0.0, 1.0);
        cablePoint = cableStart + cable * parameter;
        Vec3D separation = componentPoint - cablePoint;
        return separation.Dot(separation);
    }

    // Closest pair on two finite segments, adapted from the standard region-clamped solution in
    // Real-Time Collision Detection. Only the first parameter is used for root bracketing.
    static (double First, double Second) ClosestSegmentParameters(
        in Vec3D firstStart,
        in Vec3D firstEnd,
        in Vec3D secondStart,
        in Vec3D secondEnd) {
        Vec3D first = firstEnd - firstStart;
        Vec3D second = secondEnd - secondStart;
        Vec3D separation = firstStart - secondStart;
        double a = first.Dot(first);
        double e = second.Dot(second);
        double f = second.Dot(separation);
        if (a <= 1e-18) {
            double t = e <= 1e-18 ? 0.0 : System.Math.Clamp(f / e, 0.0, 1.0);
            return (0.0, t);
        }

        double c = first.Dot(separation);
        if (e <= 1e-18)
            return (System.Math.Clamp(-c / a, 0.0, 1.0), 0.0);

        double b = first.Dot(second);
        double denominator = a * e - b * b;
        double s = System.Math.Abs(denominator) > 1e-18
            ? System.Math.Clamp((b * f - c * e) / denominator, 0.0, 1.0)
            : 0.0;
        double tCandidate = (b * s + f) / e;
        double secondParameter;
        if (tCandidate < 0.0) {
            secondParameter = 0.0;
            s = System.Math.Clamp(-c / a, 0.0, 1.0);
        } else if (tCandidate > 1.0) {
            secondParameter = 1.0;
            s = System.Math.Clamp((b - c) / a, 0.0, 1.0);
        } else {
            secondParameter = tCandidate;
        }
        return (s, secondParameter);
    }

    static void ValidateSweep(in AircraftComponentSweep sweep) {
        ArmstrongContractValidation.StableId(
            sweep.ComponentId, nameof(sweep.ComponentId));
        ArmstrongContractValidation.StableId(
            sweep.DamageProfileId, nameof(sweep.DamageProfileId));
        ArmstrongContractValidation.Finite(
            sweep.PreviousWorldCenter, nameof(sweep.PreviousWorldCenter));
        ArmstrongContractValidation.Finite(
            sweep.CurrentWorldCenter, nameof(sweep.CurrentWorldCenter));
        if (!double.IsFinite(sweep.RadiusM) || sweep.RadiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(sweep.RadiusM));
        if (!double.IsFinite(sweep.TickDurationS) || sweep.TickDurationS <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(sweep.TickDurationS));
        if (sweep.Layer == CableCollisionLayer.None)
            throw new ArgumentOutOfRangeException(nameof(sweep.Layer));
        ArgumentNullException.ThrowIfNull(sweep.ResponseProfile);
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.AircraftPosition, nameof(sweep.PreContactState));
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.AircraftVelocity, nameof(sweep.PreContactState));
        if (!sweep.PreContactState.BodyAttitude.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(sweep.PreContactState));
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.PilotLateralInput, nameof(sweep.PreContactState));
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.RudderInput, nameof(sweep.PreContactState));
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.NormalLoadDemandG, nameof(sweep.PreContactState));
        ArmstrongContractValidation.Finite(
            sweep.PreContactState.Throttle, nameof(sweep.PreContactState));
    }
}

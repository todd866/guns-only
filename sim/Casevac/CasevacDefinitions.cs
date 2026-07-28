using System.Collections.ObjectModel;

namespace GunsOnly.Sim.Casevac;

/// <summary>
/// A deterministic horizontal world coordinate. Surface elevation remains explicit on the site or
/// volume that owns it so terrain staging cannot silently move authored gameplay geometry.
/// </summary>
public readonly record struct CasevacHorizontalPoint {
    public CasevacHorizontalPoint(double xM, double zM) {
        if (!double.IsFinite(xM))
            throw new ArgumentOutOfRangeException(nameof(xM));
        if (!double.IsFinite(zM))
            throw new ArgumentOutOfRangeException(nameof(zM));
        XM = xM;
        ZM = zM;
    }

    public double XM { get; }
    public double ZM { get; }

    public double HorizontalDistanceSquared(in CasevacHorizontalPoint other) {
        double dx = XM - other.XM;
        double dz = ZM - other.ZM;
        return dx * dx + dz * dz;
    }

    public static CasevacHorizontalPoint Zero { get; } = new(0.0, 0.0);
}

/// <summary>
/// The deterministic rule used to sample the authored exposure field. New rules require a schema
/// change rather than silently changing the meaning of an existing frozen course.
/// </summary>
public enum ExposureSamplingRule {
    SectorTerrainRaycastV1
}

/// <summary>
/// Versioned terminal-flight limits. The enter gate is deliberately tighter than the exit gate so
/// small excursions pause an operation instead of chattering between advance and reset.
/// </summary>
public sealed class LandingZoneGateProfileDefinition {
    public LandingZoneGateProfileDefinition(
        string id,
        int version,
        double maximumEnterLateralGroundSpeedMps,
        double maximumExitLateralGroundSpeedMps,
        double maximumEnterAbsoluteVerticalSpeedMps,
        double maximumExitAbsoluteVerticalSpeedMps,
        double maximumEnterAbsolutePitchRad,
        double maximumExitAbsolutePitchRad,
        double maximumEnterAbsoluteBankRad,
        double maximumExitAbsoluteBankRad) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        if (version <= 0)
            throw new ArgumentOutOfRangeException(nameof(version));
        ValidateTighterPositivePair(
            maximumEnterLateralGroundSpeedMps,
            maximumExitLateralGroundSpeedMps,
            nameof(maximumEnterLateralGroundSpeedMps),
            nameof(maximumExitLateralGroundSpeedMps));
        ValidateTighterPositivePair(
            maximumEnterAbsoluteVerticalSpeedMps,
            maximumExitAbsoluteVerticalSpeedMps,
            nameof(maximumEnterAbsoluteVerticalSpeedMps),
            nameof(maximumExitAbsoluteVerticalSpeedMps));
        ValidateTighterPositivePair(
            maximumEnterAbsolutePitchRad,
            maximumExitAbsolutePitchRad,
            nameof(maximumEnterAbsolutePitchRad),
            nameof(maximumExitAbsolutePitchRad));
        ValidateTighterPositivePair(
            maximumEnterAbsoluteBankRad,
            maximumExitAbsoluteBankRad,
            nameof(maximumEnterAbsoluteBankRad),
            nameof(maximumExitAbsoluteBankRad));

        Id = id;
        Version = version;
        MaximumEnterLateralGroundSpeedMps =
            maximumEnterLateralGroundSpeedMps;
        MaximumExitLateralGroundSpeedMps =
            maximumExitLateralGroundSpeedMps;
        MaximumEnterAbsoluteVerticalSpeedMps =
            maximumEnterAbsoluteVerticalSpeedMps;
        MaximumExitAbsoluteVerticalSpeedMps =
            maximumExitAbsoluteVerticalSpeedMps;
        MaximumEnterAbsolutePitchRad = maximumEnterAbsolutePitchRad;
        MaximumExitAbsolutePitchRad = maximumExitAbsolutePitchRad;
        MaximumEnterAbsoluteBankRad = maximumEnterAbsoluteBankRad;
        MaximumExitAbsoluteBankRad = maximumExitAbsoluteBankRad;
    }

    public string Id { get; }
    public int Version { get; }
    public double MaximumEnterLateralGroundSpeedMps { get; }
    public double MaximumExitLateralGroundSpeedMps { get; }
    public double MaximumEnterAbsoluteVerticalSpeedMps { get; }
    public double MaximumExitAbsoluteVerticalSpeedMps { get; }
    public double MaximumEnterAbsolutePitchRad { get; }
    public double MaximumExitAbsolutePitchRad { get; }
    public double MaximumEnterAbsoluteBankRad { get; }
    public double MaximumExitAbsoluteBankRad { get; }

    static void ValidateTighterPositivePair(
        double enter,
        double exit,
        string enterParameterName,
        string exitParameterName) {
        if (!double.IsFinite(enter) || enter <= 0.0)
            throw new ArgumentOutOfRangeException(enterParameterName);
        if (!double.IsFinite(exit) || exit <= enter)
            throw new ArgumentOutOfRangeException(
                exitParameterName,
                "The exit threshold must be finite and looser than the enter threshold.");
    }
}

/// <summary>
/// Immutable reference to collision-authoritative landing-site content. Presentation geometry is
/// intentionally absent: only IDs and hashes that can establish simulation authority live here.
/// </summary>
public sealed class LandingZoneDefinition {
    public LandingZoneDefinition(
        string id,
        string surfaceTruthId,
        string surfaceAuthorityHash,
        string obstacleAuthorityHash,
        string approachPathId,
        string escapePathId,
        LandingZoneGateProfileDefinition gateProfile)
        : this(
            id,
            surfaceTruthId,
            surfaceAuthorityHash,
            obstacleAuthorityHash,
            approachPathId,
            escapePathId,
            gateProfile,
            CasevacHorizontalPoint.Zero,
            surfaceDatumM: 0.0,
            enterFootprintRadiusM: 6.0,
            exitFootprintRadiusM: 8.0,
            terminalRadiusM: 180.0,
            terminalHeightM: 120.0) {
    }

    public LandingZoneDefinition(
        string id,
        string surfaceTruthId,
        string surfaceAuthorityHash,
        string obstacleAuthorityHash,
        string approachPathId,
        string escapePathId,
        LandingZoneGateProfileDefinition gateProfile,
        in CasevacHorizontalPoint centre,
        double surfaceDatumM,
        double enterFootprintRadiusM,
        double exitFootprintRadiusM,
        double terminalRadiusM,
        double terminalHeightM) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        CasevacDefinitionValidation.StableId(
            surfaceTruthId, nameof(surfaceTruthId));
        CasevacDefinitionValidation.StableId(
            surfaceAuthorityHash, nameof(surfaceAuthorityHash));
        CasevacDefinitionValidation.StableId(
            obstacleAuthorityHash, nameof(obstacleAuthorityHash));
        CasevacDefinitionValidation.StableId(
            approachPathId, nameof(approachPathId));
        CasevacDefinitionValidation.StableId(
            escapePathId, nameof(escapePathId));
        GateProfile = gateProfile
            ?? throw new ArgumentNullException(nameof(gateProfile));
        if (!double.IsFinite(surfaceDatumM))
            throw new ArgumentOutOfRangeException(nameof(surfaceDatumM));
        ValidateNestedPositiveRadius(
            enterFootprintRadiusM,
            exitFootprintRadiusM,
            nameof(enterFootprintRadiusM),
            nameof(exitFootprintRadiusM));
        ValidateNestedPositiveRadius(
            exitFootprintRadiusM,
            terminalRadiusM,
            nameof(exitFootprintRadiusM),
            nameof(terminalRadiusM));
        if (!double.IsFinite(terminalHeightM) || terminalHeightM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(terminalHeightM));

        Id = id;
        SurfaceTruthId = surfaceTruthId;
        SurfaceAuthorityHash = surfaceAuthorityHash;
        ObstacleAuthorityHash = obstacleAuthorityHash;
        ApproachPathId = approachPathId;
        EscapePathId = escapePathId;
        Centre = centre;
        SurfaceDatumM = surfaceDatumM;
        EnterFootprintRadiusM = enterFootprintRadiusM;
        ExitFootprintRadiusM = exitFootprintRadiusM;
        TerminalRadiusM = terminalRadiusM;
        TerminalHeightM = terminalHeightM;
    }

    public string Id { get; }
    public string SurfaceTruthId { get; }
    public string SurfaceAuthorityHash { get; }
    public string ObstacleAuthorityHash { get; }
    public string ApproachPathId { get; }
    public string EscapePathId { get; }
    public LandingZoneGateProfileDefinition GateProfile { get; }
    public CasevacHorizontalPoint Centre { get; }
    public double SurfaceDatumM { get; }
    public double EnterFootprintRadiusM { get; }
    public double ExitFootprintRadiusM { get; }
    public double TerminalRadiusM { get; }
    public double TerminalHeightM { get; }

    public bool IsInsideTerminal(in Vec3D worldPosition) {
        ValidatePosition(worldPosition, nameof(worldPosition));
        double heightAboveSurface = worldPosition.Y - SurfaceDatumM;
        return heightAboveSurface >= 0.0
            && heightAboveSurface <= TerminalHeightM
            && HorizontalDistanceSquared(worldPosition) <=
                TerminalRadiusM * TerminalRadiusM;
    }

    public bool IsInsideEnterFootprint(in Vec3D worldPosition) {
        ValidatePosition(worldPosition, nameof(worldPosition));
        return HorizontalDistanceSquared(worldPosition) <=
            EnterFootprintRadiusM * EnterFootprintRadiusM;
    }

    public bool IsInsideExitFootprint(in Vec3D worldPosition) {
        ValidatePosition(worldPosition, nameof(worldPosition));
        return HorizontalDistanceSquared(worldPosition) <=
            ExitFootprintRadiusM * ExitFootprintRadiusM;
    }

    /// <summary>
    /// Resolve raw authoritative geometry and vehicle facts into one hysteretic gate observation.
    /// Footprint and contact booleans must come from the authored surface/collision provider.
    /// </summary>
    public LandingZoneObservation Observe(
        bool insideTerminalVolume,
        bool insideEnterFootprint,
        bool insideExitFootprint,
        bool surfaceContact,
        double lateralGroundSpeedMps,
        double verticalSpeedMps,
        double pitchRad,
        double bankRad,
        long approachAttemptId = 0) =>
        LandingZoneObservation.Resolve(
            Id,
            insideTerminalVolume,
            insideEnterFootprint,
            insideExitFootprint,
            surfaceContact,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            GateProfile,
            approachAttemptId);

    /// <summary>
    /// Resolve geometry directly from a world-space vehicle sample. Surface contact remains an
    /// authoritative vehicle/collision fact rather than a distance guess.
    /// </summary>
    public LandingZoneObservation Observe(
        in Vec3D worldPosition,
        bool surfaceContact,
        double lateralGroundSpeedMps,
        double verticalSpeedMps,
        double pitchRad,
        double bankRad,
        long approachAttemptId = 0) {
        bool insideTerminal = IsInsideTerminal(worldPosition);
        return Observe(
            insideTerminal,
            insideTerminal && IsInsideEnterFootprint(worldPosition),
            insideTerminal && IsInsideExitFootprint(worldPosition),
            insideTerminal && surfaceContact,
            lateralGroundSpeedMps,
            verticalSpeedMps,
            pitchRad,
            bankRad,
            approachAttemptId);
    }

    double HorizontalDistanceSquared(in Vec3D worldPosition) {
        double dx = worldPosition.X - Centre.XM;
        double dz = worldPosition.Z - Centre.ZM;
        return dx * dx + dz * dz;
    }

    static void ValidatePosition(in Vec3D position, string parameterName) {
        if (!double.IsFinite(position.X)
            || !double.IsFinite(position.Y)
            || !double.IsFinite(position.Z))
            throw new ArgumentOutOfRangeException(parameterName);
    }

    static void ValidateNestedPositiveRadius(
        double inner,
        double outer,
        string innerParameterName,
        string outerParameterName) {
        if (!double.IsFinite(inner) || inner <= 0.0)
            throw new ArgumentOutOfRangeException(innerParameterName);
        if (!double.IsFinite(outer) || outer <= inner)
            throw new ArgumentOutOfRangeException(
                outerParameterName,
                "The outer authoritative volume must be looser than the inner volume.");
    }
}

/// <summary>A declared flown destination for a controlled pre-pickup return.</summary>
public sealed class CasevacSafeExitVolumeDefinition {
    public CasevacSafeExitVolumeDefinition(
        string id,
        in CasevacHorizontalPoint centre,
        double surfaceDatumM,
        double radiusM,
        double heightM) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        if (!double.IsFinite(surfaceDatumM))
            throw new ArgumentOutOfRangeException(nameof(surfaceDatumM));
        if (!double.IsFinite(radiusM) || radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (!double.IsFinite(heightM) || heightM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(heightM));
        Id = id;
        Centre = centre;
        SurfaceDatumM = surfaceDatumM;
        RadiusM = radiusM;
        HeightM = heightM;
    }

    public string Id { get; }
    public CasevacHorizontalPoint Centre { get; }
    public double SurfaceDatumM { get; }
    public double RadiusM { get; }
    public double HeightM { get; }

    public bool Contains(in Vec3D worldPosition) {
        if (!double.IsFinite(worldPosition.X)
            || !double.IsFinite(worldPosition.Y)
            || !double.IsFinite(worldPosition.Z))
            throw new ArgumentOutOfRangeException(nameof(worldPosition));
        var horizontal = new CasevacHorizontalPoint(
            worldPosition.X, worldPosition.Z);
        double heightAboveSurface = worldPosition.Y - SurfaceDatumM;
        return heightAboveSurface >= 0.0
            && heightAboveSurface <= HeightM
            && Centre.HorizontalDistanceSquared(horizontal) <= RadiusM * RadiusM;
    }
}

public enum CasevacRouteLeg {
    Ingress,
    Outbound
}

/// <summary>One immutable, resolver-friendly control point in an authored route corridor.</summary>
public sealed class CasevacRouteControlPointDefinition {
    public CasevacRouteControlPointDefinition(
        string id,
        in CasevacHorizontalPoint position,
        double targetAglM,
        double corridorRadiusM) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        if (!double.IsFinite(targetAglM) || targetAglM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(targetAglM));
        if (!double.IsFinite(corridorRadiusM) || corridorRadiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(corridorRadiusM));
        Id = id;
        Position = position;
        TargetAglM = targetAglM;
        CorridorRadiusM = corridorRadiusM;
    }

    public string Id { get; }
    public CasevacHorizontalPoint Position { get; }
    public double TargetAglM { get; }
    public double CorridorRadiusM { get; }
}

/// <summary>
/// One disclosed reference route. Routes are evidence/reference geometry, not invisible rails and
/// not a declaration that one authored path is the uniquely correct answer.
/// </summary>
public sealed class CasevacRouteDefinition {
    readonly ReadOnlyCollection<CasevacRouteControlPointDefinition> _points;

    public CasevacRouteDefinition(
        string id,
        CasevacRouteLeg leg,
        string startLocationId,
        string endLocationId,
        IEnumerable<CasevacRouteControlPointDefinition> points) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        CasevacDefinitionValidation.StableId(
            startLocationId, nameof(startLocationId));
        CasevacDefinitionValidation.StableId(
            endLocationId, nameof(endLocationId));
        if (!Enum.IsDefined(leg))
            throw new ArgumentOutOfRangeException(nameof(leg));
        if (StringComparer.Ordinal.Equals(startLocationId, endLocationId))
            throw new ArgumentException(
                "A route must connect distinct authored locations.");
        if (points is null)
            throw new ArgumentNullException(nameof(points));
        CasevacRouteControlPointDefinition[] copied = points.ToArray();
        if (copied.Length < 2)
            throw new ArgumentException(
                "An authored route requires at least two control points.",
                nameof(points));
        if (copied.Any(point => point is null))
            throw new ArgumentException(
                "Route control points cannot contain null entries.",
                nameof(points));
        if (copied.Select(point => point.Id)
            .Distinct(StringComparer.Ordinal).Count() != copied.Length)
            throw new ArgumentException(
                "Route control-point identities must be distinct.",
                nameof(points));

        Id = id;
        Leg = leg;
        StartLocationId = startLocationId;
        EndLocationId = endLocationId;
        _points = Array.AsReadOnly(copied);
        double horizontalLengthM = 0.0;
        for (int index = 1; index < copied.Length; index++) {
            horizontalLengthM += System.Math.Sqrt(
                copied[index - 1].Position.HorizontalDistanceSquared(
                    copied[index].Position));
        }
        HorizontalLengthM = horizontalLengthM;
    }

    public string Id { get; }
    public CasevacRouteLeg Leg { get; }
    public string StartLocationId { get; }
    public string EndLocationId { get; }
    public IReadOnlyList<CasevacRouteControlPointDefinition> Points => _points;
    public double HorizontalLengthM { get; }
}

/// <summary>One declared observer sector in a deterministic exposure field.</summary>
public sealed class ExposureObservationSectorDefinition {
    public ExposureObservationSectorDefinition(
        string id,
        double centreAzimuthRad,
        double halfWidthRad,
        double maximumRangeM,
        int raySampleCount)
        : this(
            id,
            CasevacHorizontalPoint.Zero,
            centreAzimuthRad,
            halfWidthRad,
            maximumRangeM,
            raySampleCount) {
    }

    public ExposureObservationSectorDefinition(
        string id,
        in CasevacHorizontalPoint observerOrigin,
        double centreAzimuthRad,
        double halfWidthRad,
        double maximumRangeM,
        int raySampleCount) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        if (!double.IsFinite(centreAzimuthRad)
            || centreAzimuthRad < -System.Math.PI
            || centreAzimuthRad > System.Math.PI)
            throw new ArgumentOutOfRangeException(nameof(centreAzimuthRad));
        if (!double.IsFinite(halfWidthRad)
            || halfWidthRad <= 0.0
            || halfWidthRad > System.Math.PI)
            throw new ArgumentOutOfRangeException(nameof(halfWidthRad));
        if (!double.IsFinite(maximumRangeM) || maximumRangeM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maximumRangeM));
        if (raySampleCount <= 0)
            throw new ArgumentOutOfRangeException(nameof(raySampleCount));

        Id = id;
        ObserverOrigin = observerOrigin;
        CentreAzimuthRad = centreAzimuthRad;
        HalfWidthRad = halfWidthRad;
        MaximumRangeM = maximumRangeM;
        RaySampleCount = raySampleCount;
    }

    public string Id { get; }
    public CasevacHorizontalPoint ObserverOrigin { get; }
    public double CentreAzimuthRad { get; }
    public double HalfWidthRad { get; }
    public double MaximumRangeM { get; }
    public int RaySampleCount { get; }
}

/// <summary>
/// Versioned provenance and sampling contract for the route-masking evidence axis.
/// Mismatched authority hashes fail closed to <see cref="CasevacMaskingState.NotAssessed"/>.
/// </summary>
public sealed class ExposureFieldDefinition {
    readonly ReadOnlyCollection<ExposureObservationSectorDefinition> _sectors;

    public ExposureFieldDefinition(
        string id,
        int version,
        string terrainAuthorityHash,
        string obstacleAuthorityHash,
        double safeBandMinimumAglM,
        double safeBandMaximumAglM,
        ExposureSamplingRule samplingRule,
        IEnumerable<ExposureObservationSectorDefinition> sectors) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        CasevacDefinitionValidation.StableId(
            terrainAuthorityHash, nameof(terrainAuthorityHash));
        CasevacDefinitionValidation.StableId(
            obstacleAuthorityHash, nameof(obstacleAuthorityHash));
        if (version <= 0)
            throw new ArgumentOutOfRangeException(nameof(version));
        if (!double.IsFinite(safeBandMinimumAglM)
            || safeBandMinimumAglM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(safeBandMinimumAglM));
        if (!double.IsFinite(safeBandMaximumAglM)
            || safeBandMaximumAglM <= safeBandMinimumAglM)
            throw new ArgumentOutOfRangeException(nameof(safeBandMaximumAglM));
        if (!Enum.IsDefined(samplingRule))
            throw new ArgumentOutOfRangeException(nameof(samplingRule));
        if (sectors is null)
            throw new ArgumentNullException(nameof(sectors));

        ExposureObservationSectorDefinition[] copied = sectors.ToArray();
        if (copied.Length == 0)
            throw new ArgumentException(
                "An exposure field requires at least one observation sector.",
                nameof(sectors));
        if (copied.Any(sector => sector is null))
            throw new ArgumentException(
                "Exposure sectors cannot contain null entries.", nameof(sectors));
        if (copied.Select(sector => sector.Id)
            .Distinct(StringComparer.Ordinal).Count() != copied.Length)
            throw new ArgumentException(
                "Exposure-sector identities must be distinct.", nameof(sectors));

        Id = id;
        Version = version;
        TerrainAuthorityHash = terrainAuthorityHash;
        ObstacleAuthorityHash = obstacleAuthorityHash;
        SafeBandMinimumAglM = safeBandMinimumAglM;
        SafeBandMaximumAglM = safeBandMaximumAglM;
        SamplingRule = samplingRule;
        _sectors = Array.AsReadOnly(copied);
    }

    public string Id { get; }
    public int Version { get; }
    public string TerrainAuthorityHash { get; }
    public string ObstacleAuthorityHash { get; }
    public double SafeBandMinimumAglM { get; }
    public double SafeBandMaximumAglM { get; }
    public ExposureSamplingRule SamplingRule { get; }
    public IReadOnlyList<ExposureObservationSectorDefinition> Sectors => _sectors;

    public bool AuthorityMatches(
        string terrainAuthorityHash,
        string obstacleAuthorityHash) =>
        StringComparer.Ordinal.Equals(
            TerrainAuthorityHash, terrainAuthorityHash)
        && StringComparer.Ordinal.Equals(
            ObstacleAuthorityHash, obstacleAuthorityHash);

    /// <summary>
    /// Combine deterministic sector-ray results. A route sample is masked only inside the declared
    /// safe band with every authored observation sector occluded.
    /// </summary>
    public CasevacExposureObservation Observe(
        double aglM,
        string terrainAuthorityHash,
        string obstacleAuthorityHash,
        IReadOnlyList<bool> sectorOccluded) {
        if (!double.IsFinite(aglM) || aglM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(aglM));
        CasevacDefinitionValidation.StableId(
            terrainAuthorityHash, nameof(terrainAuthorityHash));
        CasevacDefinitionValidation.StableId(
            obstacleAuthorityHash, nameof(obstacleAuthorityHash));
        if (sectorOccluded is null)
            throw new ArgumentNullException(nameof(sectorOccluded));
        if (sectorOccluded.Count != _sectors.Count)
            throw new ArgumentException(
                "Exposure samples must match the authored sector count.",
                nameof(sectorOccluded));

        bool withinSafeBand =
            aglM >= SafeBandMinimumAglM && aglM <= SafeBandMaximumAglM;
        CasevacMaskingState state =
            !AuthorityMatches(terrainAuthorityHash, obstacleAuthorityHash)
                ? CasevacMaskingState.NotAssessed
                : withinSafeBand && sectorOccluded.All(value => value)
                    ? CasevacMaskingState.Masked
                    : CasevacMaskingState.Exposed;
        return new CasevacExposureObservation(state, withinSafeBand);
    }
}

/// <summary>One observer-safe exposure result for an authority tick.</summary>
public readonly record struct CasevacExposureObservation(
    CasevacMaskingState MaskingState,
    bool WithinSafeMaskingBand);

public enum CasevacCollisionPrimitive {
    CapsuleSegment,
    AxisAlignedBox
}

/// <summary>
/// One collision-authoritative primitive. Capsule segments cover poles and wires; boxes cover
/// authored structures and exclusion volumes. Decorative scenery never enters this list.
/// </summary>
public sealed class CasevacCollisionObstacleDefinition {
    CasevacCollisionObstacleDefinition(
        string id,
        CasevacCollisionPrimitive primitive,
        in Vec3D first,
        in Vec3D second,
        double radiusM) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        ValidatePoint(first, nameof(first));
        ValidatePoint(second, nameof(second));
        if (!Enum.IsDefined(primitive))
            throw new ArgumentOutOfRangeException(nameof(primitive));
        if (!double.IsFinite(radiusM) || radiusM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (primitive == CasevacCollisionPrimitive.CapsuleSegment
            && radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(
                nameof(radiusM),
                "A collision capsule requires positive thickness.");
        if (primitive == CasevacCollisionPrimitive.AxisAlignedBox
            && (radiusM != 0.0
                || second.X <= first.X
                || second.Y <= first.Y
                || second.Z <= first.Z))
            throw new ArgumentException(
                "An axis-aligned box requires strict min/max bounds and zero radius.");

        Id = id;
        Primitive = primitive;
        First = first;
        Second = second;
        RadiusM = radiusM;
    }

    public string Id { get; }
    public CasevacCollisionPrimitive Primitive { get; }
    public Vec3D First { get; }
    public Vec3D Second { get; }
    public double RadiusM { get; }

    public static CasevacCollisionObstacleDefinition CapsuleSegment(
        string id,
        in Vec3D start,
        in Vec3D end,
        double radiusM) => new(
        id,
        CasevacCollisionPrimitive.CapsuleSegment,
        start,
        end,
        radiusM);

    public static CasevacCollisionObstacleDefinition AxisAlignedBox(
        string id,
        in Vec3D minimum,
        in Vec3D maximum) => new(
        id,
        CasevacCollisionPrimitive.AxisAlignedBox,
        minimum,
        maximum,
        radiusM: 0.0);

    /// <summary>Exact primitive/sphere overlap for the collision resolver.</summary>
    public bool IntersectsSphere(in Vec3D centre, double sphereRadiusM) {
        ValidatePoint(centre, nameof(centre));
        if (!double.IsFinite(sphereRadiusM) || sphereRadiusM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(sphereRadiusM));
        return Primitive switch {
            CasevacCollisionPrimitive.CapsuleSegment =>
                DistanceSquaredToSegment(centre, First, Second)
                    <= Square(RadiusM + sphereRadiusM),
            CasevacCollisionPrimitive.AxisAlignedBox =>
                DistanceSquaredToBox(centre, First, Second)
                    <= Square(sphereRadiusM),
            _ => throw new InvalidOperationException(
                "Unsupported CASEVAC collision primitive.")
        };
    }

    static double DistanceSquaredToSegment(
        in Vec3D point,
        in Vec3D start,
        in Vec3D end) {
        double dx = end.X - start.X;
        double dy = end.Y - start.Y;
        double dz = end.Z - start.Z;
        double lengthSquared = dx * dx + dy * dy + dz * dz;
        if (lengthSquared == 0.0) {
            double px = point.X - start.X;
            double py = point.Y - start.Y;
            double pz = point.Z - start.Z;
            return px * px + py * py + pz * pz;
        }
        double t = ((point.X - start.X) * dx
            + (point.Y - start.Y) * dy
            + (point.Z - start.Z) * dz) / lengthSquared;
        t = System.Math.Clamp(t, 0.0, 1.0);
        double nearestX = start.X + t * dx;
        double nearestY = start.Y + t * dy;
        double nearestZ = start.Z + t * dz;
        double offsetX = point.X - nearestX;
        double offsetY = point.Y - nearestY;
        double offsetZ = point.Z - nearestZ;
        return offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
    }

    static double DistanceSquaredToBox(
        in Vec3D point,
        in Vec3D minimum,
        in Vec3D maximum) {
        double dx = System.Math.Max(
            System.Math.Max(minimum.X - point.X, 0.0),
            point.X - maximum.X);
        double dy = System.Math.Max(
            System.Math.Max(minimum.Y - point.Y, 0.0),
            point.Y - maximum.Y);
        double dz = System.Math.Max(
            System.Math.Max(minimum.Z - point.Z, 0.0),
            point.Z - maximum.Z);
        return dx * dx + dy * dy + dz * dz;
    }

    static double Square(double value) => value * value;

    static void ValidatePoint(in Vec3D point, string parameterName) {
        if (!double.IsFinite(point.X)
            || !double.IsFinite(point.Y)
            || !double.IsFinite(point.Z))
            throw new ArgumentOutOfRangeException(parameterName);
    }
}

/// <summary>An immutable obstacle set bound to one version-pinned content signature.</summary>
public sealed class CasevacCollisionAuthorityDefinition {
    readonly ReadOnlyCollection<CasevacCollisionObstacleDefinition> _obstacles;

    public CasevacCollisionAuthorityDefinition(
        string id,
        string authorityHash,
        IEnumerable<CasevacCollisionObstacleDefinition> obstacles) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        CasevacDefinitionValidation.StableId(
            authorityHash, nameof(authorityHash));
        if (obstacles is null)
            throw new ArgumentNullException(nameof(obstacles));
        CasevacCollisionObstacleDefinition[] copied = obstacles.ToArray();
        if (copied.Length == 0)
            throw new ArgumentException(
                "CASEVAC world authority requires collision obstacles.",
                nameof(obstacles));
        if (copied.Any(obstacle => obstacle is null))
            throw new ArgumentException(
                "Collision obstacles cannot contain null entries.",
                nameof(obstacles));
        if (copied.Select(obstacle => obstacle.Id)
            .Distinct(StringComparer.Ordinal).Count() != copied.Length)
            throw new ArgumentException(
                "Collision-obstacle identities must be distinct.",
                nameof(obstacles));
        Id = id;
        AuthorityHash = authorityHash;
        _obstacles = Array.AsReadOnly(copied);
    }

    public string Id { get; }
    public string AuthorityHash { get; }
    public IReadOnlyList<CasevacCollisionObstacleDefinition> Obstacles =>
        _obstacles;

    public bool IntersectsAnySphere(in Vec3D centre, double radiusM) {
        foreach (CasevacCollisionObstacleDefinition obstacle in _obstacles) {
            if (obstacle.IntersectsSphere(centre, radiusM))
                return true;
        }
        return false;
    }
}

/// <summary>
/// Immutable world truth consumed by mission staging. It binds real horizontal geometry, surface
/// data, terminal volumes, safe return, exposure provenance, and disclosed route references.
/// </summary>
public sealed class CasevacWorldDefinition {
    readonly ReadOnlyCollection<CasevacRouteDefinition> _routes;

    public CasevacWorldDefinition(
        string id,
        string startLocationId,
        in CasevacHorizontalPoint startPosition,
        double startSurfaceDatumM,
        double startAglM,
        LandingZoneDefinition pickup,
        LandingZoneDefinition receiver,
        CasevacSafeExitVolumeDefinition safeExit,
        ExposureFieldDefinition exposureField,
        CasevacCollisionAuthorityDefinition collisionAuthority,
        IEnumerable<CasevacRouteDefinition> routes) {
        CasevacDefinitionValidation.StableId(id, nameof(id));
        CasevacDefinitionValidation.StableId(
            startLocationId, nameof(startLocationId));
        if (!double.IsFinite(startSurfaceDatumM))
            throw new ArgumentOutOfRangeException(nameof(startSurfaceDatumM));
        if (!double.IsFinite(startAglM) || startAglM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(startAglM));
        Pickup = pickup ?? throw new ArgumentNullException(nameof(pickup));
        Receiver = receiver ?? throw new ArgumentNullException(nameof(receiver));
        SafeExit = safeExit ?? throw new ArgumentNullException(nameof(safeExit));
        ExposureField = exposureField
            ?? throw new ArgumentNullException(nameof(exposureField));
        CollisionAuthority = collisionAuthority
            ?? throw new ArgumentNullException(nameof(collisionAuthority));
        if (routes is null)
            throw new ArgumentNullException(nameof(routes));
        if (StringComparer.Ordinal.Equals(Pickup.Id, Receiver.Id)
            || StringComparer.Ordinal.Equals(Pickup.Id, SafeExit.Id)
            || StringComparer.Ordinal.Equals(Receiver.Id, SafeExit.Id)
            || StringComparer.Ordinal.Equals(startLocationId, Pickup.Id)
            || StringComparer.Ordinal.Equals(startLocationId, Receiver.Id)
            || StringComparer.Ordinal.Equals(startLocationId, SafeExit.Id))
            throw new ArgumentException(
                "Start, pickup, receiver, and safe-exit identities must be distinct.");
        if (Pickup.Centre.Equals(Receiver.Centre))
            throw new ArgumentException(
                "Pickup and receiver must occupy distinct horizontal positions.");
        if (!StringComparer.Ordinal.Equals(
                Pickup.ObstacleAuthorityHash,
                CollisionAuthority.AuthorityHash)
            || !StringComparer.Ordinal.Equals(
                Receiver.ObstacleAuthorityHash,
                CollisionAuthority.AuthorityHash)
            || !StringComparer.Ordinal.Equals(
                ExposureField.ObstacleAuthorityHash,
                CollisionAuthority.AuthorityHash))
            throw new ArgumentException(
                "Landing sites, exposure, and collision geometry must share obstacle authority.");

        CasevacRouteDefinition[] copied = routes.ToArray();
        if (copied.Any(route => route is null))
            throw new ArgumentException(
                "Authored routes cannot contain null entries.", nameof(routes));
        if (copied.Select(route => route.Id)
            .Distinct(StringComparer.Ordinal).Count() != copied.Length)
            throw new ArgumentException(
                "Authored route identities must be distinct.", nameof(routes));
        foreach (CasevacRouteDefinition route in copied) {
            string expectedStart = route.Leg == CasevacRouteLeg.Ingress
                ? startLocationId
                : Pickup.Id;
            string expectedEnd = route.Leg == CasevacRouteLeg.Ingress
                ? Pickup.Id
                : Receiver.Id;
            if (!StringComparer.Ordinal.Equals(
                    route.StartLocationId, expectedStart)
                || !StringComparer.Ordinal.Equals(
                    route.EndLocationId, expectedEnd))
                throw new ArgumentException(
                    "Route endpoints do not match their CASEVAC leg.",
                    nameof(routes));
            CasevacHorizontalPoint expectedStartPosition =
                route.Leg == CasevacRouteLeg.Ingress
                    ? startPosition
                    : Pickup.Centre;
            CasevacHorizontalPoint expectedEndPosition =
                route.Leg == CasevacRouteLeg.Ingress
                    ? Pickup.Centre
                    : Receiver.Centre;
            if (!route.Points[0].Position.Equals(expectedStartPosition)
                || !route.Points[^1].Position.Equals(expectedEndPosition))
                throw new ArgumentException(
                    "The first and last route points must match their authored endpoint geometry.",
                    nameof(routes));
        }
        if (!copied.Any(route => route.Leg == CasevacRouteLeg.Ingress)
            || !copied.Any(route => route.Leg == CasevacRouteLeg.Outbound))
            throw new ArgumentException(
                "World truth requires at least one ingress and one outbound route.",
                nameof(routes));

        Id = id;
        StartLocationId = startLocationId;
        StartPosition = startPosition;
        StartSurfaceDatumM = startSurfaceDatumM;
        StartAglM = startAglM;
        _routes = Array.AsReadOnly(copied);
    }

    public string Id { get; }
    public string StartLocationId { get; }
    public CasevacHorizontalPoint StartPosition { get; }
    public double StartSurfaceDatumM { get; }
    public double StartAglM { get; }
    public LandingZoneDefinition Pickup { get; }
    public LandingZoneDefinition Receiver { get; }
    public CasevacSafeExitVolumeDefinition SafeExit { get; }
    public ExposureFieldDefinition ExposureField { get; }
    public CasevacCollisionAuthorityDefinition CollisionAuthority { get; }
    public IReadOnlyList<CasevacRouteDefinition> Routes => _routes;
}

static class CasevacDefinitionValidation {
    public static void StableId(string value, string parameterName) {
        if (string.IsNullOrWhiteSpace(value))
            throw new ArgumentException(
                "A stable non-blank identity is required.", parameterName);
    }
}

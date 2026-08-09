using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Exact Unity port of Build 299's <c>sampleCobraCanyonTerrain</c> authority mirror.
/// Coordinates entering this class are always left-handed authority east/up/north metres;
/// renderer conversion happens only at the final Unity boundary.
/// </summary>
public static class CobraTerrainModel {
    public const float MinimumEastM = -8000f;
    public const float MaximumEastM = 8000f;
    public const float MinimumNorthM = -8000f;
    public const float MaximumNorthM = 8000f;
    public const int DesktopSegments = 184;

    public const float RiverHalfWidthM = 185f;
    public const float RiverBlendWidthM = 190f;
    public const float RiverBankRiseM = 46f;
    public const float RiverFloorFraction = 0.66f;
    public const float RiverPresentationWidthM = 70.3f;
    public const float RiverBankPresentationWidthM = 8f;

    public static readonly Vector3[] River = {
        new(-6500f, 162f, -6200f), new(-5400f, 147f, -5050f),
        new(-4550f, 126f, -3650f), new(-3800f, 108f, -2100f),
        new(-2750f, 92f, -550f), new(-1450f, 102f, 1050f),
        new(0f, 126f, 2700f), new(1550f, 151f, 4100f),
        new(3350f, 178f, 5200f), new(5150f, 210f, 6020f),
        new(6500f, 232f, 5600f),
    };

    public static readonly Vector3[] Ridge = {
        new(-6500f, 178f, -6200f), new(-6200f, 258f, -4500f),
        new(-5700f, 348f, -2550f), new(-5100f, 423f, -550f),
        new(-4380f, 472f, 1500f), new(-3300f, 505f, 3380f),
        new(-1750f, 526f, 5000f), new(250f, 488f, 6200f),
        new(2450f, 421f, 6480f), new(4400f, 348f, 6200f),
        new(6500f, 258f, 5600f),
    };

    public static readonly Vector3[] Road = {
        new(-6500f, 170f, -6200f), new(-4450f, 188f, -5900f),
        new(-2650f, 203f, -5220f), new(-900f, 214f, -4350f),
        new(950f, 226f, -3300f), new(2750f, 242f, -1820f),
        new(4100f, 254f, -50f), new(5200f, 250f, 1970f),
        new(5850f, 241f, 3920f), new(6500f, 232f, 5600f),
    };

    const float BaseElevationM = 248f;
    const float BasinRadiusM = 5100f;
    const float RimRiseM = 610f;
    const float MacroUndulationM = 52f;
    const float MesoUndulationM = 26f;
    const float RidgeReliefM = 152f;
    const float RidgeWavelengthM = 2350f;
    const float RidgeBearingRad = 0.66f;
    const float CrossRidgeReliefM = 82f;
    const float CrossRidgeWavelengthM = 1450f;
    const float CrossRidgeBearingRad = -0.82f;

    const float GorgeInnerM = 180f;
    const float GorgeCrestM = 660f;
    const float GorgeFalloffM = 2300f;
    const float GorgeFalloffRetain = 0.24f;
    const float GorgeLeftRiseM = 218f;
    const float GorgeRightRiseM = 92f;
    const float GorgeSideBlendM = 380f;

    public static Vector3 AuthorityToUnity(float eastM, float upM, float northM) =>
        new(eastM, upM, -northM);

    public static float Sample(float eastM, float northM) {
        float east = Mathf.Clamp(eastM, MinimumEastM, MaximumEastM);
        float north = Mathf.Clamp(northM, MinimumNorthM, MaximumNorthM);
        float radius = Mathf.Sqrt(east * east + north * north);
        float rim = SmoothStep(BasinRadiusM, 10600f, radius);
        NearestRibbon(River, east, north, out float riverDistance, out _, out float riverSigned);

        float heightM = BaseElevationM
            + RimRiseM * rim * rim
            + MacroUndulationM
                * Mathf.Sin((east + north * 0.37f) / 1430f)
                * Mathf.Cos((north - east * 0.21f) / 1170f)
            + MesoUndulationM
                * Mathf.Sin((east - north) / 510f)
                * Mathf.Cos((east + north) / 690f)
            + RidgeReliefM
                * (RidgeFold(east, north, RidgeBearingRad, RidgeWavelengthM) - 0.5f)
            + CrossRidgeReliefM
                * (RidgeFold(east, north, CrossRidgeBearingRad, CrossRidgeWavelengthM) - 0.5f)
            + GorgeRimRise(riverDistance, riverSigned);

        // Web carve order: land corridors, hero cells, then river last.
        CarveRibbon(Ridge, 205f, 430f, 54f, 0f, east, north, ref heightM);
        CarveRibbon(Road, 235f, 470f, 24f, 0.34f, east, north, ref heightM);

        ApplyCell(east, north, -3150f, 112f, -650f, 340f, 250f, 8f, ref heightM);
        ApplyCell(east, north, -3850f, 482f, 2050f, 560f, 300f, 11f, ref heightM);
        ApplyCell(east, north, 350f, 224f, -3850f, 780f, 380f, 6f, ref heightM);

        CarveRibbon(
            River,
            RiverHalfWidthM,
            RiverBlendWidthM,
            RiverBankRiseM,
            RiverFloorFraction,
            east,
            north,
            ref heightM);
        return heightM;
    }

    /// <summary>Build 299 conservative render vertex: the minimum of five authority samples.</summary>
    public static float RenderedVertexHeight(
        float eastM,
        float northM,
        float eastStepM,
        float northStepM) {
        float eastBias = eastStepM * 0.42f;
        float northBias = northStepM * 0.42f;
        return Mathf.Min(
            Sample(eastM, northM),
            Sample(eastM - eastBias, northM),
            Sample(eastM + eastBias, northM),
            Sample(eastM, northM - northBias),
            Sample(eastM, northM + northBias));
    }

    /// <summary>Samples the exact two-triangle desktop basin surface emitted by Web and Unity.</summary>
    public static float RenderedSurfaceHeight(float eastM, float northM) {
        int segments = DesktopSegments;
        float eastStepM = (MaximumEastM - MinimumEastM) / segments;
        float northStepM = (MaximumNorthM - MinimumNorthM) / segments;
        float east = Mathf.Clamp(eastM, MinimumEastM, MaximumEastM);
        float north = Mathf.Clamp(northM, MinimumNorthM, MaximumNorthM);
        int eastCell = Mathf.Clamp(
            Mathf.FloorToInt((east - MinimumEastM) / eastStepM), 0, segments - 1);
        int northCell = Mathf.Clamp(
            Mathf.FloorToInt((north - MinimumNorthM) / northStepM), 0, segments - 1);
        float east0 = MinimumEastM + eastCell * eastStepM;
        float north0 = MinimumNorthM + northCell * northStepM;
        float eastBlend = Mathf.Clamp01((east - east0) / eastStepM);
        float northBlend = Mathf.Clamp01((north - north0) / northStepM);
        float northWest = RenderedVertexHeight(east0, north0, eastStepM, northStepM);
        float northEast = RenderedVertexHeight(east0 + eastStepM, north0, eastStepM, northStepM);
        float southWest = RenderedVertexHeight(east0, north0 + northStepM, eastStepM, northStepM);
        float southEast = RenderedVertexHeight(
            east0 + eastStepM, north0 + northStepM, eastStepM, northStepM);
        if (eastBlend >= northBlend) {
            return northWest
                + eastBlend * (northEast - northWest)
                + northBlend * (southEast - northEast);
        }
        return northWest
            + eastBlend * (southEast - southWest)
            + northBlend * (southWest - northWest);
    }

    public static bool IsWater(float eastM, float northM) {
        NearestRibbon(River, eastM, northM, out float distanceM, out _, out _);
        return distanceM <= RiverPresentationWidthM * 0.5f;
    }

    public static void NearestRibbon(
        Vector3[] path,
        float eastM,
        float northM,
        out float distanceM,
        out float elevationM,
        out float signedOffsetM) {
        float bestSquared = float.MaxValue;
        elevationM = path[0].y;
        signedOffsetM = 0f;
        for (int index = 1; index < path.Length; index++) {
            Vector3 from = path[index - 1];
            Vector3 to = path[index];
            float segmentEast = to.x - from.x;
            float segmentNorth = to.z - from.z;
            float lengthSquared = segmentEast * segmentEast + segmentNorth * segmentNorth;
            float blend = lengthSquared > 0f
                ? Mathf.Clamp01(((eastM - from.x) * segmentEast
                    + (northM - from.z) * segmentNorth) / lengthSquared)
                : 0f;
            float nearestEast = from.x + segmentEast * blend;
            float nearestNorth = from.z + segmentNorth * blend;
            float deltaEast = eastM - nearestEast;
            float deltaNorth = northM - nearestNorth;
            float squared = deltaEast * deltaEast + deltaNorth * deltaNorth;
            if (squared >= bestSquared) continue;
            bestSquared = squared;
            elevationM = Mathf.Lerp(from.y, to.y, blend);
            float lengthM = Mathf.Max(1e-9f, Mathf.Sqrt(lengthSquared));
            signedOffsetM = (deltaEast * -segmentNorth + deltaNorth * segmentEast) / lengthM;
        }
        distanceM = Mathf.Sqrt(bestSquared);
    }

    static float RidgeFold(
        float eastM,
        float northM,
        float bearingRad,
        float wavelengthM) {
        float along = (eastM * Mathf.Cos(bearingRad) + northM * Mathf.Sin(bearingRad))
            / wavelengthM;
        return 1f - Mathf.Abs(Mathf.Sin(along * Mathf.PI));
    }

    static float GorgeRimRise(float distanceM, float signedOffsetM) {
        float side = Mathf.Clamp(signedOffsetM / GorgeSideBlendM, -1f, 1f);
        float riseM = Mathf.Lerp(GorgeRightRiseM, GorgeLeftRiseM, side * 0.5f + 0.5f);
        float lip = SmoothStep(GorgeInnerM, GorgeCrestM, distanceM)
            * (1f - SmoothStep(GorgeCrestM * 1.4f, GorgeFalloffM, distanceM)
                * (1f - GorgeFalloffRetain));
        return riseM * lip;
    }

    static void CarveRibbon(
        Vector3[] path,
        float halfWidthM,
        float blendWidthM,
        float bankRiseM,
        float floorFraction,
        float eastM,
        float northM,
        ref float heightM) {
        NearestRibbon(path, eastM, northM, out float distanceM, out float pathElevationM, out _);
        float floorEdgeM = halfWidthM * floorFraction;
        float normalizedCrossing = halfWidthM > floorEdgeM
            ? Mathf.Clamp01((distanceM - floorEdgeM) / (halfWidthM - floorEdgeM))
            : 1f;
        float targetElevationM = pathElevationM
            + bankRiseM * normalizedCrossing * normalizedCrossing;
        float blend = 1f - SmoothStep(halfWidthM, halfWidthM + blendWidthM, distanceM);
        heightM += (targetElevationM - heightM) * blend;
    }

    static void ApplyCell(
        float eastM,
        float northM,
        float centreEastM,
        float centreElevationM,
        float centreNorthM,
        float radiusM,
        float blendWidthM,
        float undulationM,
        ref float heightM) {
        float distanceM = Mathf.Sqrt(
            (eastM - centreEastM) * (eastM - centreEastM)
            + (northM - centreNorthM) * (northM - centreNorthM));
        float blend = 1f - SmoothStep(radiusM * 0.72f, radiusM + blendWidthM, distanceM);
        if (blend <= 0f) return;
        float localRelief = undulationM * 0.5f
            * (Mathf.Sin((eastM - centreEastM) / 185f)
                + Mathf.Cos((northM - centreNorthM) / 225f));
        heightM += (centreElevationM + localRelief - heightM) * blend;
    }

    static float SmoothStep(float minimum, float maximum, float value) {
        if (maximum <= minimum) return value >= maximum ? 1f : 0f;
        float unit = Mathf.Clamp01((value - minimum) / (maximum - minimum));
        return unit * unit * (3f - 2f * unit);
    }
}

}

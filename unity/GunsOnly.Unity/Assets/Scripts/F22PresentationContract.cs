using System;

namespace GunsOnly.UnityBridge {

/// <summary>
/// Renderer-free constants and geometry math for the Web first-merge presentation. Unity consumes
/// these values directly; .NET tests compile this same source file to guard camera, canopy, and
/// loft parity without introducing UnityEngine into the simulation bridge.
/// </summary>
public static class F22PresentationContract {
    public const float CockpitVerticalFovDeg = 66f;
    public const float CockpitNearClipM = 0.06f;
    public const float CockpitFarClipM = 680000f;
    public const float ChaseVerticalFovDeg = 55f;
    public const float ToneMappingExposure = 1.02f;
    public const float HemisphereIntensity = 0.78f;
    public const float SunIntensity = 2.65f;
    public const float ShadowDistanceM = 3600f;
    public const float ClearAirVisibilityM = 100000f;

    public const float CanopyShellOpacity = 0.08f;
    public const float CanopyFresnelOpacity = 0.055f;
    public const float CanopyFresnelPower = 2.4f;
    public const float ReflectionOpacity = 0.11f;
    public const float ReflectionBaseX = 0f;
    public const float ReflectionBaseY = 0.18f;
    // Web local -Z is forward. Its corrected -1.28 m maps to Unity local +1.28 m.
    public const float ReflectionBaseZUnity = 1.28f;
    public const float ReflectionTravelX = 0.34f;
    public const float ReflectionRetreatZ = 0.14f;
    public const float ReflectionYawFraction = 0.18f;
    public const float ReflectionPitchRadUnity = 0.28f;

    public const int FuselageRadialSegments = 18;
    public const int NacelleRadialSegments = 14;

    public static readonly LinearRgb HemisphereSky = LinearRgb.FromSrgbHex(0xb5cad0);
    public static readonly LinearRgb HemisphereGround = LinearRgb.FromSrgbHex(0x102229);
    public static readonly LinearRgb SunColor = LinearRgb.FromSrgbHex(0xffe2b4);
    public static readonly LinearRgb FogLow = LinearRgb.FromSrgbHex(0x6f8790);
    public static readonly LinearRgb FogHigh = LinearRgb.FromSrgbHex(0x263d55);
    public static readonly LinearRgb CanopyColor = LinearRgb.FromSrgbHex(0x9db8c7);
    public static readonly LinearRgb CanopyFresnelColor = LinearRgb.FromSrgbHex(0xc6d9df);
    public static readonly LinearRgb ReflectionColor = LinearRgb.FromSrgbHex(0xd9e7e6);

    public static float ClearAirFogDensity =>
        (float)(Math.Sqrt(-Math.Log(0.02)) / ClearAirVisibilityM);

    public static F22Vector3 SunDirectionUnity {
        get {
            const double x = 0.50;
            const double y = 0.28;
            const double z = -0.82;
            double length = Math.Sqrt(x * x + y * y + z * z);
            return new F22Vector3((float)(x / length), (float)(y / length), (float)(z / length));
        }
    }

    public static ReflectionPose ReflectionForAzimuth(float azimuthRad) {
        return new ReflectionPose(
            ReflectionBaseX + (float)Math.Sin(azimuthRad) * ReflectionTravelX,
            ReflectionBaseY,
            ReflectionBaseZUnity
                + (1f - (float)Math.Cos(azimuthRad)) * ReflectionRetreatZ,
            ReflectionPitchRadUnity,
            azimuthRad * ReflectionYawFraction);
    }

    public static LoftStation[] CreateFuselageStations() => new[] {
        new LoftStation(-6.65f, 0.025f, 0.025f, 0.02f),
        new LoftStation(-5.65f, 0.34f, 0.30f, 0.04f),
        new LoftStation(-4.35f, 0.62f, 0.54f, 0.08f),
        new LoftStation(-2.60f, 0.78f, 0.72f, 0.11f),
        new LoftStation(-0.20f, 0.82f, 0.76f, 0.10f),
        new LoftStation(2.55f, 0.70f, 0.64f, 0.09f),
        new LoftStation(4.65f, 0.48f, 0.43f, 0.10f),
        new LoftStation(5.65f, 0.18f, 0.17f, 0.10f),
    };

    public static LoftStation[] CreateNacelleStations() => new[] {
        new LoftStation(-2.75f, 0.48f, 0.38f, -0.12f),
        new LoftStation(-1.80f, 0.62f, 0.48f, -0.08f),
        new LoftStation(2.90f, 0.58f, 0.45f, -0.04f),
        new LoftStation(4.65f, 0.43f, 0.36f, 0.00f),
    };

    public static LoftData BuildLoft(LoftStation[] stations, int radialSegments) {
        if (stations == null || stations.Length < 2)
            throw new ArgumentException("loft requires at least two stations", nameof(stations));
        if (radialSegments < 3)
            throw new ArgumentOutOfRangeException(nameof(radialSegments));

        var vertices = new F22Vector3[stations.Length * radialSegments];
        for (int stationIndex = 0; stationIndex < stations.Length; stationIndex++) {
            LoftStation station = stations[stationIndex];
            for (int segment = 0; segment < radialSegments; segment++) {
                double theta = segment / (double)radialSegments * Math.PI * 2.0;
                // Three local -Z forward maps to Unity local +Z forward.
                vertices[stationIndex * radialSegments + segment] = new F22Vector3(
                    (float)Math.Cos(theta) * station.RadiusX,
                    station.CenterY + (float)Math.Sin(theta) * station.RadiusY,
                    -station.ZThree);
            }
        }

        var indices = new int[(stations.Length - 1) * radialSegments * 6];
        int cursor = 0;
        for (int stationIndex = 0; stationIndex < stations.Length - 1; stationIndex++) {
            int first = stationIndex * radialSegments;
            int second = first + radialSegments;
            for (int segment = 0; segment < radialSegments; segment++) {
                int next = (segment + 1) % radialSegments;
                // Reverse Three's winding after reflecting Z so Unity normals remain outward.
                indices[cursor++] = first + segment;
                indices[cursor++] = second + segment;
                indices[cursor++] = first + next;
                indices[cursor++] = first + next;
                indices[cursor++] = second + segment;
                indices[cursor++] = second + next;
            }
        }
        return new LoftData(vertices, indices, stations.Length, radialSegments);
    }
}

public readonly struct LinearRgb {
    public readonly float R;
    public readonly float G;
    public readonly float B;

    public LinearRgb(float r, float g, float b) {
        R = r;
        G = g;
        B = b;
    }

    public static LinearRgb FromSrgbHex(int rgb) => new LinearRgb(
        Decode(((rgb >> 16) & 0xff) / 255f),
        Decode(((rgb >> 8) & 0xff) / 255f),
        Decode((rgb & 0xff) / 255f));

    static float Decode(float value) => value <= 0.04045f
        ? value / 12.92f
        : (float)Math.Pow((value + 0.055f) / 1.055f, 2.4f);
}

public readonly struct F22Vector3 {
    public readonly float X;
    public readonly float Y;
    public readonly float Z;

    public F22Vector3(float x, float y, float z) {
        X = x;
        Y = y;
        Z = z;
    }
}

public readonly struct ReflectionPose {
    public readonly float X;
    public readonly float Y;
    public readonly float ZUnity;
    public readonly float PitchRadUnity;
    public readonly float YawRadUnity;

    public ReflectionPose(float x, float y, float zUnity, float pitchRadUnity, float yawRadUnity) {
        X = x;
        Y = y;
        ZUnity = zUnity;
        PitchRadUnity = pitchRadUnity;
        YawRadUnity = yawRadUnity;
    }
}

public readonly struct LoftStation {
    public readonly float ZThree;
    public readonly float RadiusX;
    public readonly float RadiusY;
    public readonly float CenterY;

    public LoftStation(float zThree, float radiusX, float radiusY, float centerY) {
        ZThree = zThree;
        RadiusX = radiusX;
        RadiusY = radiusY;
        CenterY = centerY;
    }
}

public sealed class LoftData {
    public F22Vector3[] Vertices { get; }
    public int[] Indices { get; }
    public int StationCount { get; }
    public int RadialSegments { get; }

    public LoftData(F22Vector3[] vertices, int[] indices, int stationCount, int radialSegments) {
        Vertices = vertices;
        Indices = indices;
        StationCount = stationCount;
        RadialSegments = radialSegments;
    }
}

}

using System;

namespace GunsOnly.UnityBridge {

/// <summary>
/// Renderer-only contract for the frozen Web F-22 presentation over the Ukraine theatre. None of
/// these values affect flight, collision, weather, or visibility authority.
/// </summary>
public static class F22UkraineVisualContract {
    public const string RegionalPaintSha256 =
        "4c062b6923becc4492f78ae1588a394f941aeddb0a9b27f47d176b285c379c4d";
    public const string ArtManifestSha256 =
        "69bf29de2dde5970bb2fce142d7a4f645a0b8780701539882fdd95e7e9a8ee40";
    public const string RuntimePngSha256 =
        "8e04ddcbc6bc5d5489b0f3537aa3299b1fc1002582d41b1f4b2fd4b6d3bfe45c";

    public const float ToneMappingExposure = 1.10f;
    public const float HemisphereIntensity = 0.90f;
    public const float SunIntensity = 2.95f;

    public const float TerrainHeroScaleM = 9200f;
    public const float TerrainHeroPhaseX = -0.27f;
    public const float TerrainHeroPhaseY = 0.18f;
    public const float TerrainHeroCategoryLumaMin = 0.075f;
    public const float TerrainHeroCategoryLumaMax = 0.34f;
    public const float TerrainHeroSourceLumaFloor = 0.025f;
    public const float TerrainHeroMeanLuma = 0.089f;
    public const float TerrainHeroValueMin = 0.58f;
    public const float TerrainHeroValueMax = 1.42f;
    public const float TerrainHeroValueBlend = 0.58f;
    public const float TerrainHeroRgbMin = 0.018f;
    public const float TerrainHeroRgbMax = 0.58f;
    public const float TerrainHeroBlend = 0.72f;
    public const float TerrainAlbedoScalar = 0.72f;
    public const float TerrainDetailFullAglM = 2500f;
    public const float TerrainDetailZeroAglM = 7500f;
    public const float TerrainWorldEdgeM = 64000f;

    public const float RegionalPaintScaleM = 160000f;
    public const float RegionalPaintPhaseX = 0.19f;
    public const float RegionalPaintPhaseY = -0.37f;

    public const float BaseFogDensityPerM = 0.000052f;
    public const float AtmosphereDensityScale = 0.32f;
    public const float AtmosphereHazeMix = 0.72f;
    public const float ShadowFloor = 0.16f;
    public const float CloudShadowStrength = 0.34f;

    public const float SkyAltitudeFloorM = 2500f;
    public const float SkyAltitudeCeilingM = 18000f;
    public const float SkyCurveLow = 0.18f;
    public const float SkyCurveHigh = 0.13f;
    public const float SkyHorizonShoulderFalloff = 48f;
    public const float SkyHorizonShoulderGain = 1.14f;
    public const float SkyHorizonShoulderMix = 0.48f;
    public const float SkySunPresentation = 0.62f;

    public static readonly LinearRgb FogLow = LinearRgb.FromSrgbHex(0xa8814b);
    public static readonly LinearRgb FogHigh = LinearRgb.FromSrgbHex(0x8a8470);
    public static readonly LinearRgb HemisphereSky = LinearRgb.FromSrgbHex(0xe8d8b8);
    public static readonly LinearRgb HemisphereGround = LinearRgb.FromSrgbHex(0x3a3428);
    public static readonly LinearRgb SunColor = LinearRgb.FromSrgbHex(0xffe2b4);
    // Web ShaderMaterial literals are already linear scene values.
    public static readonly LinearRgb AtmosphereHaze = new(0.48f, 0.59f, 0.68f);
    public static readonly LinearRgb CombatHorizonLow = new(0.34f, 0.38f, 0.32f);
    public static readonly LinearRgb CombatHorizonHigh = new(0.18f, 0.26f, 0.34f);
    public static readonly LinearRgb CombatZenithLow = new(0.035f, 0.105f, 0.34f);
    public static readonly LinearRgb CombatZenithHigh = new(0.018f, 0.052f, 0.16f);

    public static float TerrainDetail01(float cameraAglM) =>
        1f - SmoothStep(TerrainDetailFullAglM, TerrainDetailZeroAglM, cameraAglM);

    public static float SkyAltitudeMix(float altitudeM) =>
        SmoothStep(SkyAltitudeFloorM, SkyAltitudeCeilingM, Math.Max(altitudeM, 0f));

    public static LinearRgb CombatHorizon(float altitudeM) =>
        Lerp(CombatHorizonLow, CombatHorizonHigh, SkyAltitudeMix(altitudeM));

    public static LinearRgb CombatZenith(float altitudeM) =>
        Lerp(CombatZenithLow, CombatZenithHigh, SkyAltitudeMix(altitudeM));

    public static LinearRgb FogForAltitude(float altitudeM) =>
        Lerp(FogLow, FogHigh, SmoothStep(1800f, 14000f, Math.Max(altitudeM, 0f)));

    /// <summary>CPU oracle for the accepted Web hero-pigment luma match and blend.</summary>
    public static LinearRgb BlendAuthoredHero(
        LinearRgb rewildCover,
        LinearRgb authoredHero,
        float rewildFloor,
        float terrainDetail01) {
        const float lr = 0.2126f;
        const float lg = 0.7152f;
        const float lb = 0.0722f;
        float authoredLuma = authoredHero.R * lr + authoredHero.G * lg + authoredHero.B * lb;
        float categoryLuma = Clamp(
            rewildCover.R * lr + rewildCover.G * lg + rewildCover.B * lb,
            TerrainHeroCategoryLumaMin,
            TerrainHeroCategoryLumaMax);
        float inverseLuma = 1f / Math.Max(authoredLuma, TerrainHeroSourceLumaFloor);
        float authoredValue = Clamp(
            authoredLuma / TerrainHeroMeanLuma,
            TerrainHeroValueMin,
            TerrainHeroValueMax);
        float valueGain = 1f + (authoredValue - 1f) * TerrainHeroValueBlend;
        var matched = new LinearRgb(
            Clamp(
                authoredHero.R * inverseLuma * categoryLuma * valueGain,
                TerrainHeroRgbMin,
                TerrainHeroRgbMax),
            Clamp(
                authoredHero.G * inverseLuma * categoryLuma * valueGain,
                TerrainHeroRgbMin,
                TerrainHeroRgbMax),
            Clamp(
                authoredHero.B * inverseLuma * categoryLuma * valueGain,
                TerrainHeroRgbMin,
                TerrainHeroRgbMax));
        float weight = rewildFloor * terrainDetail01 * TerrainHeroBlend;
        return Lerp(rewildCover, matched, weight);
    }

    static float SmoothStep(float low, float high, float value) {
        float unit = Clamp((value - low) / Math.Max(high - low, 0.000001f), 0f, 1f);
        return unit * unit * (3f - 2f * unit);
    }

    static LinearRgb Lerp(LinearRgb from, LinearRgb to, float t) => new(
        from.R + (to.R - from.R) * t,
        from.G + (to.G - from.G) * t,
        from.B + (to.B - from.B) * t);

    static float Clamp(float value, float low, float high) =>
        Math.Max(low, Math.Min(high, value));
}

}

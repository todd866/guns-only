using System;
using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>
/// Loads the renderer-authored Korea/Ukraine pigments and binds their exact Web world-space
/// mapping contracts. Textures are presentation-only: the terrain mesh remains independent.
/// </summary>
public static class KoreaHighlandSurface {
    public enum Presentation {
        KoreaModern,
        F22UkraineCombat,
    }

    public const string TextureResourcePath =
        "GunsOnly/Korea1950s/environment/textures/korea-highland-ground-v1";
    public const string UkraineTextureResourcePath =
        "GunsOnly/UkraineModern/environment/textures/ukraine-temperate-ground-v2";
    public const string UkraineManifestResourcePath =
        "GunsOnly/UkraineModern/environment/textures/rapier-art-manifest.v1";
    public const string ShaderResourcePath = "GunsOnly/Korea1950s/KoreaHighlandTerrain";

    // Kept in renderer code on both tracks: these are texture-projection semantics, not sim truth.
    public const float SurfaceScaleM = 7200f;
    public const float WebBaseFogDensityPerM = 0.000055f;
    public const float ModernFogDensityScale = 0.45f;
    public const float ShadowFloor = 0.12f;
    public const float CloudShadowStrength = 0.34f;

    public static readonly Vector2 TopPhase = new(0.17f, -0.31f);
    public static readonly Vector2 EastPhase = new(-0.23f, 0.41f);
    public static readonly Vector2 NorthPhase = new(0.37f, 0.11f);

    public static Material CreateMaterial(Presentation presentation = Presentation.KoreaModern) {
        string texturePath;
        switch (presentation) {
            case Presentation.KoreaModern:
                texturePath = TextureResourcePath;
                break;
            case Presentation.F22UkraineCombat:
                texturePath = UkraineTextureResourcePath;
                break;
            default:
                throw new ArgumentOutOfRangeException(
                    nameof(presentation), presentation, null);
        }

        Texture2D surface = Resources.Load<Texture2D>(texturePath);
        if (surface == null) {
            throw new InvalidOperationException(
                "Missing imported terrain surface at Resources/" + texturePath);
        }

        Shader shader = Resources.Load<Shader>(ShaderResourcePath)
            ?? Shader.Find("GunsOnly/KoreaHighlandTerrain");
        if (shader == null) {
            throw new InvalidOperationException(
                "Missing retained Korean highland terrain shader at Resources/"
                + ShaderResourcePath);
        }

        // Import settings are build-validated; these runtime values also protect Editor previews
        // after a Library reset and document the exact Web MirroredRepeat/linear-filter contract.
        surface.wrapMode = TextureWrapMode.Mirror;
        surface.filterMode = FilterMode.Trilinear;
        surface.anisoLevel = Mathf.Max(8, surface.anisoLevel);

        var material = new Material(shader);
        switch (presentation) {
            case Presentation.KoreaModern:
                material.name = "KOREA_HIGHLAND_WEB_SURFACE_V1";
                material.SetTexture("_KoreaSurfaceMap", surface);
                material.SetFloat("_UkraineCombatPresentation", 0f);
                break;
            case Presentation.F22UkraineCombat:
                material.name = "F22_UKRAINE_TEMPERATE_GROUND_V2";
                material.SetTexture("_UkraineSurfaceMap", surface);
                material.SetFloat("_UkraineCombatPresentation", 1f);
                break;
            default:
                throw new ArgumentOutOfRangeException(
                    nameof(presentation), presentation, null);
        }
        material.SetFloat("_KoreaSurfaceScaleM", SurfaceScaleM);
        material.SetVector("_KoreaTopPhase", ToVector(TopPhase));
        material.SetVector("_KoreaEastPhase", ToVector(EastPhase));
        material.SetVector("_KoreaNorthPhase", ToVector(NorthPhase));
        material.SetFloat(
            "_FogDensity",
            presentation == Presentation.F22UkraineCombat
                ? F22UkraineVisualContract.BaseFogDensityPerM
                : WebBaseFogDensityPerM);
        material.SetFloat("_ModernFogDensityScale", ModernFogDensityScale);
        material.SetFloat(
            "_ShadowFloor",
            presentation == Presentation.F22UkraineCombat
                ? F22UkraineVisualContract.ShadowFloor
                : ShadowFloor);
        material.SetFloat(
            "_CloudShadowStrength",
            presentation == Presentation.F22UkraineCombat
                ? F22UkraineVisualContract.CloudShadowStrength
                : CloudShadowStrength);

        F22Vector3 sun = F22PresentationContract.SunDirectionUnity;
        material.SetVector("_SunDirection", new Vector4(sun.X, sun.Y, sun.Z, 0f));
        // GLSL literals are already linear values. SetVector avoids Unity gamma-decoding them.
        material.SetVector("_HazeColor", new Vector4(0.36f, 0.52f, 0.68f, 1f));
        if (presentation == Presentation.F22UkraineCombat) {
            material.SetFloat(
                "_AtmosphereDensityScale",
                F22UkraineVisualContract.AtmosphereDensityScale);
            material.SetVector(
                "_AtmosphereHazeColor",
                ToVector(F22UkraineVisualContract.AtmosphereHaze));
            material.SetFloat(
                "_AtmosphereHazeMix",
                F22UkraineVisualContract.AtmosphereHazeMix);
            material.SetFloat(
                "_TerrainWorldEdgeM",
                F22UkraineVisualContract.TerrainWorldEdgeM);
            ApplyF22UkraineAltitude(material, 3000f);
        }
        return material;
    }

    public static void ApplyF22UkraineAltitude(Material material, float cameraAglM) {
        if (material == null || material.GetFloat("_UkraineCombatPresentation") <= 0.5f) return;
        material.SetFloat(
            "_TerrainDetail01",
            F22UkraineVisualContract.TerrainDetail01(cameraAglM));
        material.SetVector(
            "_FogColor",
            ToVector(F22UkraineVisualContract.FogForAltitude(cameraAglM)));
    }

    static Vector4 ToVector(Vector2 value) => new(value.x, value.y, 0f, 0f);
    static Vector4 ToVector(LinearRgb value) => new(value.R, value.G, value.B, 1f);
}

}

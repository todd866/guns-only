Shader "GunsOnly/KoreaHighlandTerrain"
{
    Properties
    {
        _KoreaSurfaceMap ("Korea Highland Surface", 2D) = "white" {}
        _KoreaSurfaceScaleM ("Web Surface Scale M", Float) = 7200
        _KoreaTopPhase ("Web Top Phase", Vector) = (0.17,-0.31,0,0)
        _KoreaEastPhase ("Web East Phase", Vector) = (-0.23,0.41,0,0)
        _KoreaNorthPhase ("Web North Phase", Vector) = (0.37,0.11,0,0)
        _UkraineSurfaceMap ("Ukraine Temperate Ground", 2D) = "white" {}
        _UkraineCombatPresentation ("F22 Ukraine Combat", Float) = 0
        _TerrainDetail01 ("Web Hero Detail", Range(0,1)) = 1
        _TerrainWorldEdgeM ("Web Visible World Edge M", Float) = 64000
        _SunDirection ("Surface To Sun", Vector) = (0.4998,0.2799,-0.8197,0)
        _FogDensity ("Web Base Fog Density", Float) = 0.000055
        _ModernFogDensityScale ("Korea Modern Fog Scale", Float) = 0.45
        _HazeColor ("Korea Modern Haze Linear", Vector) = (0.36,0.52,0.68,1)
        _FogColor ("Ukraine Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _AtmosphereDensityScale ("Ukraine Fog Density Scale", Float) = 0.32
        _AtmosphereHazeColor ("Ukraine Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _AtmosphereHazeMix ("Ukraine Haze Mix", Range(0,1)) = 0.72
        _ShadowFloor ("Web Shadow Floor", Range(0,1)) = 0.12
        _CloudShadowStrength ("Web Cloud Shadow", Range(0,1)) = 0.34
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Off
        ZWrite On
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _KoreaSurfaceMap;
            sampler2D _UkraineSurfaceMap;
            float _KoreaSurfaceScaleM;
            float4 _KoreaTopPhase;
            float4 _KoreaEastPhase;
            float4 _KoreaNorthPhase;
            float _UkraineCombatPresentation;
            float _TerrainDetail01;
            float _TerrainWorldEdgeM;
            float4 _SunDirection;
            float _FogDensity;
            float _ModernFogDensityScale;
            float4 _HazeColor;
            float4 _FogColor;
            float _AtmosphereDensityScale;
            float4 _AtmosphereHazeColor;
            float _AtmosphereHazeMix;
            float _ShadowFloor;
            float _CloudShadowStrength;

            struct appdata {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                fixed4 color : COLOR;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float water : TEXCOORD2;
                float2 landcover : TEXCOORD3;
            };

            float Smooth(float low, float high, float value) {
                float unit = saturate((value - low) / max(0.000001, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
            }

            float TerrainCloudHash(float2 p) {
                return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453123);
            }

            float TerrainCloudNoise(float2 p) {
                float2 i = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(
                    lerp(TerrainCloudHash(i), TerrainCloudHash(i + float2(1, 0)), u.x),
                    lerp(TerrainCloudHash(i + float2(0, 1)),
                        TerrainCloudHash(i + float2(1, 1)), u.x),
                    u.y);
            }

            // Unity's imported PNG V axis is opposite Three's texture upload convention.
            float2 UnityTextureUv(float2 authoredUv) {
                return float2(authoredUv.x, 1.0 - authoredUv.y);
            }

            v2f vert(appdata input) {
                v2f output;
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                output.water = input.color.a;
                output.landcover = input.color.rg;
                return output;
            }

            float4 frag(v2f input) : SV_Target {
                float3 normal = normalize(input.worldNormal);
                if (normal.y < 0.0) normal = -normal;
                float elevation = Smooth(70.0, 1250.0, input.worldPosition.y);
                float highRidge = Smooth(680.0, 1500.0, input.worldPosition.y);
                float steepness = 1.0 - saturate(normal.y);
                float valleyFloor = (1.0 - Smooth(240.0, 560.0, input.worldPosition.y))
                    * (1.0 - Smooth(0.035, 0.11, steepness));
                float upperSlope = Smooth(320.0, 980.0, input.worldPosition.y);
                float slopeFace = Smooth(0.035, 0.19, steepness);
                float exposedFace = Smooth(0.10, 0.30, steepness)
                    * (0.24 + 0.76 * Smooth(420.0, 1050.0, input.worldPosition.y));

                // One retained shader, two explicit presentation branches. Korea/default keeps
                // its established path; the F-22 branch below is the frozen Web Ukraine material.
                float bandStep = Smooth(0.12, 0.22, elevation) * 0.34
                    + Smooth(0.42, 0.55, elevation) * 0.33
                    + Smooth(0.75, 0.88, elevation) * 0.33;
                float combatPresentation = saturate(_UkraineCombatPresentation);
                float3 sValley = lerp(
                    float3(0.15, 0.24, 0.055),
                    float3(0.32, 0.46, 0.21),
                    combatPresentation);
                float3 sFoothill = lerp(
                    float3(0.070, 0.13, 0.032),
                    float3(0.24, 0.37, 0.17),
                    combatPresentation);
                float3 sUpland = lerp(
                    float3(0.040, 0.075, 0.030),
                    float3(0.17, 0.29, 0.13),
                    combatPresentation);
                float3 sRock = lerp(
                    float3(0.25, 0.15, 0.060),
                    float3(0.36, 0.32, 0.24),
                    combatPresentation);
                float3 sRidge = lerp(
                    float3(0.31, 0.29, 0.23),
                    float3(0.40, 0.38, 0.32),
                    combatPresentation);
                float3 sAlbedo = lerp(sValley, sFoothill, bandStep);
                sAlbedo = lerp(sAlbedo, sUpland, upperSlope * 0.76);

                const float3 LUMA = float3(0.2126, 0.7152, 0.0722);
                float ukraineElevationBand = 0.0;
                if (combatPresentation > 0.5) {
                    ukraineElevationBand = Smooth(38.0, 78.0, input.worldPosition.y) * 0.20
                        + Smooth(112.0, 182.0, input.worldPosition.y) * 0.31
                        + Smooth(228.0, 380.0, input.worldPosition.y) * 0.49;
                    sAlbedo = lerp(sValley, sFoothill, ukraineElevationBand * 0.68);
                    sAlbedo = lerp(sAlbedo, sUpland,
                        Smooth(128.0, 158.0, input.worldPosition.y) * 0.20);

                    float2 softLandcover = saturate(input.landcover);
                    float succession = softLandcover.x;
                    float fieldHistory = softLandcover.y;
                    float fieldTone = Smooth(0.10, 0.90, fieldHistory);
                    float3 meadowCover = lerp(
                        float3(0.23, 0.45, 0.12),
                        float3(0.70, 0.57, 0.22),
                        fieldTone);
                    float3 rewildCover = lerp(
                        meadowCover,
                        float3(0.28, 0.46, 0.20),
                        Smooth(0.30, 0.62, succession));
                    rewildCover = lerp(
                        rewildCover,
                        float3(0.16, 0.32, 0.14),
                        Smooth(0.64, 0.90, succession));
                    float rewildFloor = (1.0 - Smooth(0.05, 0.20, steepness))
                        * (1.0 - Smooth(380.0, 520.0, input.worldPosition.y));
                    float openField = rewildFloor
                        * (1.0 - Smooth(0.48, 0.70, succession));
                    float trackCue = (1.0 - Smooth(0.06, 0.18, fieldHistory)) * openField;
                    rewildCover = lerp(
                        rewildCover, float3(0.43, 0.35, 0.20), trackCue * 0.55);
                    float dryMeadow = Smooth(0.68, 0.92, fieldHistory)
                        * (1.0 - Smooth(0.48, 0.68, succession));
                    rewildCover = lerp(
                        rewildCover, float3(0.58, 0.56, 0.30), dryMeadow * 0.34);

                    // Frozen Web F-22 hero sample: one mirrored 9.2 km top-down sample, luma
                    // matched to the worker category, bounded, then blended at exactly 0.72.
                    float3 authoredHero = tex2D(
                        _UkraineSurfaceMap,
                        UnityTextureUv(input.worldPosition.xz * (1.0 / 9200.0)
                            + float2(-0.27, 0.18))).rgb;
                    float authoredHeroLuma = dot(authoredHero, LUMA);
                    float categoryLuma = clamp(dot(rewildCover, LUMA), 0.075, 0.34);
                    float3 authoredHeroChroma = authoredHero
                        / max(authoredHeroLuma, 0.025);
                    float authoredHeroValue = clamp(
                        authoredHeroLuma / 0.089, 0.58, 1.42);
                    float3 authoredHeroMatched = authoredHeroChroma
                        * categoryLuma
                        * lerp(1.0, authoredHeroValue, 0.58);
                    authoredHeroMatched = clamp(
                        authoredHeroMatched, float3(0.018, 0.018, 0.018),
                        float3(0.58, 0.58, 0.58));
                    rewildCover = lerp(
                        rewildCover,
                        authoredHeroMatched,
                        rewildFloor * _TerrainDetail01 * 0.72);

                    // The same authored map supplies the regional handoff at altitude. This is
                    // still pigment only: the stand-in mesh remains the renderer's geometry.
                    float3 regionalAlbedo = sAlbedo;
                    float regionalDistanceMix = 1.0 - _TerrainDetail01;
                    if (regionalDistanceMix > 0.001) {
                        float3 authoredPaint = tex2D(
                            _UkraineSurfaceMap,
                            UnityTextureUv(input.worldPosition.xz * (1.0 / 160000.0)
                                + float2(0.19, -0.37))).rgb;
                        float authoredLuma = dot(authoredPaint, LUMA);
                        float regionalStructure = 1.0 - authoredLuma;
                        float regionalWoodland = Smooth(0.54, 0.73, regionalStructure);
                        float regionalOpen = 1.0 - Smooth(0.32, 0.57, regionalStructure);
                        float3 regionalPaint = regionalAlbedo;
                        regionalPaint *= lerp(
                            float3(1.0, 1.0, 1.0),
                            float3(0.57, 0.78, 0.60),
                            regionalWoodland);
                        regionalPaint *= lerp(
                            float3(1.0, 1.0, 1.0),
                            float3(1.12, 1.04, 0.78),
                            regionalOpen * 0.52);
                        float regionalGround = 1.0 - Smooth(0.11, 0.28, steepness);
                        float baseLuma = dot(regionalPaint, LUMA);
                        float3 authoredMatched = authoredPaint
                            * (baseLuma / max(authoredLuma, 0.12));
                        regionalPaint = lerp(regionalPaint, authoredMatched, 0.62);
                        regionalPaint *= lerp(
                            0.86, 1.14, Smooth(0.16, 0.76, authoredLuma));
                        regionalAlbedo = lerp(
                            regionalAlbedo,
                            regionalPaint,
                            regionalDistanceMix * regionalGround * 0.62);
                    }
                    float coverValueScale = dot(regionalAlbedo, LUMA)
                        / max(dot(rewildCover, LUMA), 0.04);
                    float3 matchedCover = rewildCover
                        * clamp(coverValueScale, 0.80, 1.22);
                    float heroMix = rewildFloor
                        * (0.72 + (1.0 - ukraineElevationBand) * 0.12)
                        * _TerrainDetail01;
                    sAlbedo = lerp(
                        lerp(regionalAlbedo, matchedCover, heroMix),
                        lerp(regionalAlbedo, rewildCover, heroMix),
                        _TerrainDetail01);
                    sAlbedo *= lerp(1.06, 0.92, ukraineElevationBand);
                    sAlbedo *= 0.72;
                } else {
                    float patchwork = 0.5 + 0.5 * sin(input.worldPosition.x * 0.00023
                        + sin(input.worldPosition.z * 0.00017) * 2.3);
                    float3 cultivation = lerp(
                        float3(0.17, 0.25, 0.050),
                        float3(0.32, 0.29, 0.075),
                        Smooth(0.32, 0.68, patchwork));
                    sAlbedo = lerp(
                        sAlbedo, cultivation, valleyFloor * (0.34 + patchwork * 0.30));

                    // Exact Web 7.2 km triplanar projection. Mirrored repeat is an import contract.
                    float3 weights = pow(abs(normal), 4.0);
                    weights /= max(weights.x + weights.y + weights.z, 0.0001);
                    float3 authoredTop = tex2D(
                        _KoreaSurfaceMap,
                        UnityTextureUv(input.worldPosition.xz / _KoreaSurfaceScaleM
                            + _KoreaTopPhase.xy)).rgb;
                    float3 authoredEast = tex2D(
                        _KoreaSurfaceMap,
                        UnityTextureUv(input.worldPosition.zy / _KoreaSurfaceScaleM
                            + _KoreaEastPhase.xy)).rgb;
                    float3 authoredNorth = tex2D(
                        _KoreaSurfaceMap,
                        UnityTextureUv(input.worldPosition.xy / _KoreaSurfaceScaleM
                            + _KoreaNorthPhase.xy)).rgb;
                    float3 authoredSurface = authoredEast * weights.x
                        + authoredTop * weights.y
                        + authoredNorth * weights.z;
                    float authoredLuma = dot(authoredSurface, LUMA);
                    float baseLuma = dot(sAlbedo, LUMA);
                    float3 authoredChroma = authoredSurface / max(authoredLuma, 0.025);
                    float authoredValue = clamp(authoredLuma / 0.045, 0.62, 1.38);
                    float3 lumaMatched = authoredChroma * baseLuma
                        * lerp(1.0, authoredValue, 0.68);
                    lumaMatched = clamp(lumaMatched, sAlbedo * 0.64, sAlbedo * 1.38);
                    sAlbedo = lerp(sAlbedo, lumaMatched, 0.54);
                }

                sAlbedo = lerp(sAlbedo, sRock, slopeFace * (0.20 + upperSlope * 0.48));
                sAlbedo = lerp(
                    sAlbedo,
                    sRidge,
                    max(highRidge * 0.55, exposedFace * 0.62));

                float halfLambert = dot(normal, normalize(_SunDirection.xyz)) * 0.5 + 0.5;
                halfLambert *= halfLambert;
                float toneRamp = combatPresentation > 0.5
                    ? _ShadowFloor + (1.0 - _ShadowFloor)
                        * lerp(0.28, 1.0, halfLambert)
                    : _ShadowFloor + (1.0 - _ShadowFloor)
                        * (0.42 * Smooth(0.26, 0.40, halfLambert)
                            + 0.58 * Smooth(0.58, 0.76, halfLambert));
                float3 skyFill = float3(0.62, 0.74, 1.00);
                float3 sunKey = float3(1.06, 1.01, 0.92);
                float3 viewDirection = normalize(_WorldSpaceCameraPos - input.worldPosition);
                float rim = pow(1.0 - saturate(dot(normal, viewDirection)), 3.0);
                float3 rimTint = lerp(
                    float3(0.055, 0.075, 0.11),
                    float3(0.18, 0.14, 0.07),
                    combatPresentation);
                float3 lit = sAlbedo * lerp(skyFill, sunKey, toneRamp) * toneRamp
                    + rim * rimTint
                        * (0.4 + 0.6 * saturate(normal.y));
                if (combatPresentation > 0.5) {
                    float2 regionalSunDirection = normalize(_SunDirection.xz + float2(0.0001, 0.0001));
                    float reliefGain = lerp(2.2, 7.5, _TerrainDetail01);
                    float regionalReliefLight = clamp(
                        0.96 + dot(normal.xz, regionalSunDirection) * reliefGain,
                        0.70,
                        1.12);
                    lit *= regionalReliefLight;
                }

                float2 cloudUv = input.worldPosition.xz * (1.0 / 2600.0);
                float cloudNoise = TerrainCloudNoise(cloudUv) * 0.65
                    + TerrainCloudNoise(cloudUv * 2.7 + float2(13.7, 41.3)) * 0.35;
                lit *= 1.0 - _CloudShadowStrength * Smooth(0.50, 0.80, cloudNoise);

                // Preserve the stand-in's basin mask while speaking the Web analytic water style.
                float waterFacing = saturate(dot(normal, viewDirection));
                float waterFresnel = pow(1.0 - waterFacing, 3.0);
                float waterRipple = sin(input.worldPosition.x * 0.012
                        + input.worldPosition.z * 0.006)
                    + 0.55 * sin(input.worldPosition.x * -0.005
                        + input.worldPosition.z * 0.017 + 1.7);
                float3 waterLit = lerp(
                    float3(0.025, 0.13, 0.17),
                    float3(0.10, 0.30, 0.34),
                    0.24 + waterFresnel * 0.58);
                waterLit *= 0.94 + waterRipple * 0.035;
                float3 waterHalf = normalize(viewDirection + normalize(_SunDirection.xyz));
                waterLit += float3(0.88, 0.82, 0.66)
                    * pow(max(dot(normal, waterHalf), 0.0), 96.0) * 0.42;
                if (combatPresentation > 0.5) {
                    waterLit = lerp(
                        float3(0.06, 0.18, 0.20),
                        float3(0.16, 0.34, 0.36),
                        0.30 + waterFresnel * 0.48);
                    waterLit *= 0.96 + waterRipple * 0.028;
                    waterLit += float3(0.90, 0.84, 0.68)
                        * pow(max(dot(normal, waterHalf), 0.0), 72.0) * 0.28;
                }
                lit = lerp(lit, waterLit, saturate(input.water));

                // Same Gaussian aerial perspective. Ukraine stays continuous and buries the edge;
                // Korea/default retains its established six-band treatment.
                float fogDensity = _FogDensity * lerp(
                    _ModernFogDensityScale,
                    _AtmosphereDensityScale,
                    combatPresentation);
                float distanceToCamera = length(_WorldSpaceCameraPos - input.worldPosition);
                float aerial = 1.0 - exp(
                    -fogDensity * fogDensity * distanceToCamera * distanceToCamera);
                float3 hazeColor = _HazeColor.rgb;
                if (combatPresentation > 0.5) {
                    hazeColor = lerp(
                        _FogColor.rgb,
                        _AtmosphereHazeColor.rgb,
                        _AtmosphereHazeMix);
                    float edgeHide = Smooth(
                        _TerrainWorldEdgeM * 0.36,
                        _TerrainWorldEdgeM * 0.72,
                        distanceToCamera);
                    aerial = max(aerial, edgeHide);
                } else {
                    float banded = floor(aerial * 6.0) / 6.0;
                    aerial = lerp(aerial, banded, 0.65);
                }
                return float4(lerp(lit, hazeColor, saturate(aerial)), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}

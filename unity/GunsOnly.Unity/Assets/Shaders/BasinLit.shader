Shader "GunsOnly/BasinLit"
{
    Properties
    {
        _GroundMacro ("Ground Macro", 2D) = "white" {}
        _HasGroundMacro ("Has Ground Macro", Float) = 1
        _GroundMacroRepeatM ("Ground Macro Repeat M", Float) = 6200
        _GroundMacroPhase ("Ground Macro Phase", Vector) = (0.17,-0.11,0,0)
        _GroundNearRepeatM ("Ground Near Repeat M", Float) = 850
        _GroundNearRotation ("Ground Near Rotation", Vector) = (0.866,-0.5,0.5,0.866)
        _GroundNearWeightExponent ("Ground Near Weight Exponent", Float) = 4
        _GroundNearPhaseHorizontal ("Ground Near Horizontal Phase", Vector) = (0.31,0.23,0,0)
        _GroundNearPhaseEastFacing ("Ground Near East-Facing Phase", Vector) = (0.61,-0.17,0,0)
        _GroundNearPhaseNorthSouthFacing ("Ground Near North-South Phase", Vector) = (-0.23,0.47,0,0)
        _SunDirection ("Surface To Sun", Vector) = (0.4998,0.279888,-0.819672,0)
        _FogColor ("Fog Linear", Vector) = (0.254,0.347,0.376,1)
        _FogDensity ("Fog Density", Float) = 0.00019
        _ShadowFloor ("Shadow Floor", Range(0,1)) = 0.36
        _OcclusionRange ("Occlusion Range", Vector) = (0.92,1.06,0,0)
        _SlopeFaceWindow ("Slope Face", Vector) = (0.035,0.19,0,0)
        _ToneGateLow ("Tone Low", Vector) = (0.26,0.40,0,0)
        _ToneGateHigh ("Tone High", Vector) = (0.58,0.76,0,0)
        _ToneGateWeights ("Tone Weights", Vector) = (0.42,0.58,0,0)
        _ReliefGain ("Relief", Float) = 0.18
        _CloudShadowStrength ("Cloud Shadow", Float) = 0.08
        _MicroNormalStrength ("Micro Normal", Float) = 0.12
        _ParcelPitchM ("Parcel Pitch", Vector) = (118,86,0,0)
        _SkyFill ("Sky Fill Linear", Vector) = (0.70,0.79,0.92,1)
        _SunKey ("Sun Key Linear", Vector) = (1.06,1.01,0.92,1)
        _ValleyFloor ("Valley Linear", Vector) = (0.145,0.225,0.09,1)
        _CultivationGold ("Cultivation Linear", Vector) = (0.205,0.235,0.155,1)
        _JungleMid ("Jungle Linear", Vector) = (0.05,0.185,0.06,1)
        _LateriteSlope ("Laterite Linear", Vector) = (0.3,0.145,0.055,1)
        _RidgeSage ("Ridge Linear", Vector) = (0.105,0.195,0.098,1)
        _RimRock ("Rim Rock Linear", Vector) = (0.3,0.285,0.235,1)
        _ElevationBands ("Elevation Bands", Vector) = (150,300,600,900)
        _Exposure ("ACES Exposure", Float) = 1.12
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

            sampler2D _GroundMacro;
            float _HasGroundMacro;
            float _GroundMacroRepeatM;
            float4 _GroundMacroPhase;
            float _GroundNearRepeatM;
            float4 _GroundNearRotation;
            float _GroundNearWeightExponent;
            float4 _GroundNearPhaseHorizontal;
            float4 _GroundNearPhaseEastFacing;
            float4 _GroundNearPhaseNorthSouthFacing;
            float4 _SunDirection;
            float4 _FogColor;
            float _FogDensity;
            float _ShadowFloor;
            float4 _OcclusionRange;
            float4 _SlopeFaceWindow;
            float4 _ToneGateLow;
            float4 _ToneGateHigh;
            float4 _ToneGateWeights;
            float _ReliefGain;
            float _CloudShadowStrength;
            float _MicroNormalStrength;
            float4 _ParcelPitchM;
            float4 _SkyFill;
            float4 _SunKey;
            float4 _ValleyFloor;
            float4 _CultivationGold;
            float4 _JungleMid;
            float4 _LateriteSlope;
            float4 _RidgeSage;
            float4 _RimRock;
            float4 _ElevationBands;
            float _Exposure;

            struct appdata {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 concavity : TEXCOORD1;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 terrainNormal : TEXCOORD1;
                float concavity : TEXCOORD2;
            };

            float CobraHash(float2 p) {
                float3 p3 = frac(float3(p.x, p.y, p.x) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.x + p3.y) * p3.z);
            }
            float CobraNoise(float2 p) {
                float2 cell = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(
                    lerp(CobraHash(cell), CobraHash(cell + float2(1, 0)), u.x),
                    lerp(CobraHash(cell + float2(0, 1)), CobraHash(cell + float2(1, 1)), u.x),
                    u.y);
            }
            float CobraFbm(float2 p) {
                return CobraNoise(p) * 0.58
                    + CobraNoise(p * 2.07 + float2(17.7, -9.2)) * 0.28
                    + CobraNoise(p * 4.19 + float2(-4.1, 23.6)) * 0.14;
            }
            float Smooth(float low, float high, float value) {
                float unit = saturate((value - low) / max(1e-6, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
            }
            float2 RotateAuthored(float2 value) {
                return float2(
                    dot(_GroundNearRotation.xy, value),
                    dot(_GroundNearRotation.zw, value));
            }
            float2 UnityTextureUv(float2 authoredUv) {
                return float2(authoredUv.x, 1.0 - authoredUv.y);
            }
            float3 RrtAndOdtFit(float3 value) {
                float3 a = value * (value + 0.0245786) - 0.000090537;
                float3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
                return a / b;
            }
            float3 AcesFilmic(float3 color) {
                const float3x3 inputMatrix = float3x3(
                    0.59719, 0.35458, 0.04823,
                    0.07600, 0.90834, 0.01566,
                    0.02840, 0.13383, 0.83777);
                const float3x3 outputMatrix = float3x3(
                    1.60475, -0.53108, -0.07367,
                    -0.10208, 1.10813, -0.00605,
                    -0.00327, -0.07276, 1.07602);
                color *= _Exposure / 0.6;
                color = mul(inputMatrix, color);
                color = RrtAndOdtFit(color);
                color = mul(outputMatrix, color);
                return saturate(color);
            }

            v2f vert(appdata input) {
                v2f output;
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.terrainNormal = UnityObjectToWorldNormal(input.normal);
                output.concavity = input.concavity.x;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target {
                float2 groundUv = input.worldPosition.xz;
                float viewDistanceM = distance(_WorldSpaceCameraPos, input.worldPosition);
                float nearDetail = 1.0 - Smooth(240.0, 1700.0, viewDistanceM);
                float3 geometryNormal = normalize(input.terrainNormal);
                float3 normal = geometryNormal;
                float2 bumpUv = groundUv * 0.038;
                float bump = CobraNoise(bumpUv);
                normal = normalize(normal + float3(
                    bump - CobraNoise(bumpUv + float2(0.52, 0)),
                    0,
                    bump - CobraNoise(bumpUv + float2(0, 0.52)))
                    * _MicroNormalStrength * nearDetail);

                float elevationM = input.worldPosition.y;
                float steepness = 1.0 - saturate(geometryNormal.y);
                float slopeFace = Smooth(_SlopeFaceWindow.x, _SlopeFaceWindow.y, steepness);
                float flatGround = 1.0 - Smooth(
                    _SlopeFaceWindow.x * 0.55,
                    _SlopeFaceWindow.x * 2.4,
                    steepness);
                float lowland = 1.0 - Smooth(_ElevationBands.x, _ElevationBands.y, elevationM);
                float upland = Smooth(_ElevationBands.y, _ElevationBands.z, elevationM);
                float rimBand = Smooth(_ElevationBands.z, _ElevationBands.w, elevationM);
                float macro = CobraFbm(groundUv * 0.00078);
                float meso = CobraFbm(groundUv * 0.0034 + float2(8.3, -4.7));
                float canopyMass = Smooth(0.48, 0.72, macro * 0.76 + meso * 0.24);

                // GLSL mat2 constructors are column-major. These explicit HLSL rows reproduce
                // Web's mat2(0.94, 0.34, -0.34, 0.94) exactly rather than mirroring the fields.
                float2 parcelUv = mul(float2x2(0.94, -0.34, 0.34, 0.94), groundUv);
                float2 parcelGrid = parcelUv / _ParcelPitchM.xy;
                float2 parcelCell = floor(parcelGrid);
                float2 parcelLocal = frac(parcelGrid);
                float parcelSeed = CobraHash(parcelCell);
                float parcelShade = CobraHash(parcelCell + float2(37.1, 11.7));
                float distanceToBund = min(
                    min(parcelLocal.x, 1.0 - parcelLocal.x),
                    min(parcelLocal.y, 1.0 - parcelLocal.y));
                float fieldInterior = Smooth(0.025, 0.085, distanceToBund);
                float fieldCluster = Smooth(0.43, 0.62, macro * 0.64 + meso * 0.36);
                float cultivation = lowland * flatGround * fieldCluster * Smooth(0.42, 0.62, parcelSeed);

                float3 albedo = lerp(_ValleyFloor.rgb, _RidgeSage.rgb, upland);
                albedo = lerp(albedo, _JungleMid.rgb,
                    canopyMass * (1.0 - cultivation * 0.78) * 0.68);
                float3 fieldColor = lerp(
                    _CultivationGold.rgb * 0.84,
                    _CultivationGold.rgb * 1.12,
                    parcelShade);
                albedo = lerp(albedo, fieldColor, cultivation * fieldInterior * 0.44);
                albedo = lerp(
                    albedo,
                    _JungleMid.rgb * 0.82,
                    cultivation * (1.0 - fieldInterior) * 0.12);
                float drainage = 1.0 - Smooth(0.30, 0.52, input.concavity);
                albedo = lerp(albedo, _JungleMid.rgb * 0.88, drainage * 0.22);
                albedo = lerp(albedo, _LateriteSlope.rgb, slopeFace * (0.30 + 0.38 * upland));
                albedo = lerp(albedo, _RimRock.rgb, rimBand * 0.70);

                float2 authoredMacroUv = groundUv / _GroundMacroRepeatM
                    + _GroundMacroPhase.xy;
                float2 authoredNearUv = RotateAuthored(groundUv) / _GroundNearRepeatM
                    + _GroundNearPhaseHorizontal.xy;
                float3 authoredMacro = tex2D(
                    _GroundMacro, UnityTextureUv(authoredMacroUv)).rgb;
                float3 weights = pow(abs(geometryNormal), _GroundNearWeightExponent);
                weights /= max(0.001, weights.x + weights.y + weights.z);
                float3 authoredNearXZ = tex2D(
                    _GroundMacro, UnityTextureUv(authoredNearUv)).rgb;
                float3 authoredNearZY = tex2D(
                    _GroundMacro,
                    UnityTextureUv(RotateAuthored(input.worldPosition.zy) / _GroundNearRepeatM
                        + _GroundNearPhaseEastFacing.xy)).rgb;
                float3 authoredNearXY = tex2D(
                    _GroundMacro,
                    UnityTextureUv(RotateAuthored(input.worldPosition.xy) / _GroundNearRepeatM
                        + _GroundNearPhaseNorthSouthFacing.xy)).rgb;
                float3 authoredNear = authoredNearZY * weights.x
                    + authoredNearXZ * weights.y
                    + authoredNearXY * weights.z;
                float3 authoredGround = lerp(authoredMacro, authoredNear, nearDetail * 0.22);
                float3 authoredTint = authoredGround * float3(0.98, 1.035, 0.91);
                float authoredWeight = _HasGroundMacro * (0.50 - cultivation * 0.14);
                albedo = lerp(albedo, authoredTint, authoredWeight);
                float macroLuma = dot(authoredMacro, float3(0.2126, 0.7152, 0.0722));
                float nearLuma = dot(authoredNear, float3(0.2126, 0.7152, 0.0722));
                float authoredDetail = clamp((nearLuma + 0.035) / (macroLuma + 0.035), 0.84, 1.16);
                albedo *= lerp(1.0, authoredDetail, _HasGroundMacro * nearDetail * 0.38);

                float fine = CobraNoise(groundUv * 0.047 + float2(11, -3));
                float valueVariation = 0.94 + (macro - 0.5) * 0.14 + (meso - 0.5) * 0.08
                    + (fine - 0.5) * 0.08 * nearDetail;
                albedo *= clamp(valueVariation, 0.84, 1.10);

                float3 sunDirection = normalize(_SunDirection.xyz);
                float halfLambert = dot(normal, sunDirection) * 0.5 + 0.5;
                halfLambert *= halfLambert;
                float toneRamp = _ShadowFloor + (1.0 - _ShadowFloor) * (
                    _ToneGateWeights.x * Smooth(_ToneGateLow.x, _ToneGateLow.y, halfLambert)
                    + _ToneGateWeights.y * Smooth(_ToneGateHigh.x, _ToneGateHigh.y, halfLambert));
                float3 lit = albedo * lerp(_SkyFill.rgb, _SunKey.rgb, toneRamp)
                    * (0.72 + toneRamp * 0.28);
                float2 sunPlanform = normalize(sunDirection.xz + 0.0001);
                lit *= clamp(0.98 + dot(geometryNormal.xz, sunPlanform) * _ReliefGain, 0.90, 1.08);
                lit *= lerp(_OcclusionRange.x, _OcclusionRange.y, saturate(input.concavity));
                float cloudNoise = CobraNoise(groundUv * 0.00036) * 0.68
                    + CobraNoise(groundUv * 0.00108 + float2(13.7, 41.3)) * 0.32;
                lit *= 1.0 - _CloudShadowStrength * Smooth(0.52, 0.80, cloudNoise);
                float aerial = 1.0 - exp(
                    -_FogDensity * _FogDensity * viewDistanceM * viewDistanceM);
                float3 color = lerp(lit, _FogColor.rgb, Smooth(0.0, 1.0, aerial));
                return float4(AcesFilmic(color), 1);
            }
            ENDCG
        }
    }
    FallBack Off
}

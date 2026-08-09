Shader "GunsOnly/RapierTableauLit"
{
    Properties
    {
        _BaseColor ("Base Linear", Vector) = (0.25,0.25,0.25,1)
        _EmissiveColor ("Emissive Linear", Vector) = (0,0,0,1)
        _SpecularColor ("Specular Linear", Vector) = (0.69,0.76,0.77,1)
        _Roughness ("Roughness", Range(0.01,1)) = 0.72
        _Metalness ("Metalness", Range(0,1)) = 0.08
        _Ior ("IOR", Range(1,2.5)) = 1.48
        _SpecularIntensity ("Specular Intensity", Range(0,1)) = 0.62
        _Clearcoat ("Clearcoat", Range(0,1)) = 0
        _ClearcoatRoughness ("Clearcoat Roughness", Range(0,1)) = 0.48
        _EnvMapIntensity ("Environment Intensity", Float) = 0.74
        _FinishGrain ("Finish Grain", Float) = 0.08
        _FinishScale ("Finish Scale", Float) = 1.2
        _PanelStrength ("Panel Strength", Float) = 0
        _PanelScale ("Panel Scale", Float) = 0.5
        _Opacity ("Opacity", Range(0,1)) = 1
        _Unlit ("Unlit", Float) = 0
        _ToneMapped ("Three toneMapped", Float) = 1
        _SunDirection ("Sun Direction", Vector) = (0.5,0.28,0.82,0)
        _SunColor ("Sun Linear", Vector) = (1,0.76,0.46,1)
        _SunIntensity ("Sun Intensity", Float) = 2.95
        _SkyColor ("Hemisphere Sky Linear", Vector) = (0.81,0.69,0.48,1)
        _GroundColor ("Hemisphere Ground Linear", Vector) = (0.04,0.03,0.02,1)
        _HemisphereIntensity ("Hemisphere Intensity", Float) = 0.9
        _FogColor ("Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _FogDensity ("Fog Density", Float) = 0.000019778835
        _FogDensityScale ("Soft World Fog Scale", Float) = 0.32
        _HazeColor ("Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _HazeMix ("Haze Mix", Range(0,1)) = 0.72
        _Exposure ("Three ACES Exposure", Float) = 1.1
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("ZTest", Float) = 4
        [Toggle] _ZWrite ("ZWrite", Float) = 1
        _OffsetFactor ("Polygon Offset Factor", Float) = 0
        _OffsetUnits ("Polygon Offset Units", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Name "FORWARD"
            Tags { "LightMode"="ForwardBase" }
            Cull [_Cull]
            ZTest [_ZTest]
            ZWrite [_ZWrite]
            Offset [_OffsetFactor], [_OffsetUnits]

            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "AutoLight.cginc"

            float4 _BaseColor;
            float4 _EmissiveColor;
            float4 _SpecularColor;
            float _Roughness;
            float _Metalness;
            float _Ior;
            float _SpecularIntensity;
            float _Clearcoat;
            float _ClearcoatRoughness;
            float _EnvMapIntensity;
            float _FinishGrain;
            float _FinishScale;
            float _PanelStrength;
            float _PanelScale;
            float _Opacity;
            float _Unlit;
            float _ToneMapped;
            float4 _SunDirection;
            float4 _SunColor;
            float _SunIntensity;
            float4 _SkyColor;
            float4 _GroundColor;
            float _HemisphereIntensity;
            float4 _FogColor;
            float _FogDensity;
            float _FogDensityScale;
            float4 _HazeColor;
            float _HazeMix;
            float _Exposure;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float3 finishPosition : TEXCOORD1;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 finishPosition : TEXCOORD2;
                SHADOW_COORDS(3)
            };

            float FinishNoise(float3 p)
            {
                float a = sin(dot(p, float3(1.73, 3.17, 2.11)));
                float b = sin(dot(p, float3(-4.13, 1.37, 3.71)) + a * 1.31);
                float c = sin(dot(p, float3(7.07, -2.43, 1.19)) + b * 0.83);
                return 0.5 + 0.25 * b + 0.25 * c;
            }

            float FinishPanel(float3 p)
            {
                float3 cell = abs(frac(p) - 0.5);
                float edge = max(max(cell.x, cell.y), cell.z);
                return smoothstep(0.472, 0.497, edge);
            }

            float3 RrtAndOdtFit(float3 value)
            {
                float3 a = value * (value + 0.0245786) - 0.000090537;
                float3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
                return a / b;
            }

            float3 AcesFilmic(float3 color)
            {
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
                return saturate(mul(outputMatrix, color));
            }

            float3 ApplySoftWorldFog(float3 color, float distanceToCamera)
            {
                float density = _FogDensity * _FogDensityScale;
                float fog = 1.0 - exp(-density * density
                    * distanceToCamera * distanceToCamera);
                float3 haze = lerp(_FogColor.rgb, _HazeColor.rgb, _HazeMix);
                return lerp(color, haze, saturate(fog));
            }

            v2f vert(appdata input)
            {
                v2f output;
                output.pos = UnityObjectToClipPos(input.vertex);
                output.worldPosition = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                output.finishPosition = input.finishPosition;
                TRANSFER_SHADOW_WPOS(output, output.worldPosition);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float finishValue = FinishNoise(input.finishPosition * _FinishScale);
                float panelValue = FinishPanel(input.finishPosition * _PanelScale);
                float3 albedo = _BaseColor.rgb
                    * (1.0 + (finishValue - 0.5) * _FinishGrain * 0.32)
                    * (1.0 - panelValue * _PanelStrength);
                float roughness = saturate(_Roughness
                    + (finishValue - 0.5) * _FinishGrain
                    + panelValue * _PanelStrength * 0.7);
                float3 color;
                if (_Unlit > 0.5)
                {
                    color = albedo + _EmissiveColor.rgb;
                }
                else
                {
                    float3 normal = normalize(input.worldNormal);
                    float3 viewDirection = normalize(_WorldSpaceCameraPos.xyz - input.worldPosition);
                    float3 lightDirection = normalize(_SunDirection.xyz);
                    float3 halfDirection = normalize(viewDirection + lightDirection);
                    float nDotL = saturate(dot(normal, lightDirection));
                    float nDotV = saturate(dot(normal, viewDirection));
                    float nDotH = saturate(dot(normal, halfDirection));
                    float vDotH = saturate(dot(viewDirection, halfDirection));
                    float hemisphere = normal.y * 0.5 + 0.5;
                    float3 ambient = lerp(_GroundColor.rgb, _SkyColor.rgb, hemisphere)
                        * _HemisphereIntensity;
                    float shadow = SHADOW_ATTENUATION(input);
                    float3 direct = _SunColor.rgb * _SunIntensity * nDotL * shadow / UNITY_PI;
                    float dielectricF0 = pow((_Ior - 1.0) / max(_Ior + 1.0, 1e-4), 2.0);
                    float3 f0 = lerp(dielectricF0 * _SpecularColor.rgb * _SpecularIntensity,
                        albedo, _Metalness);
                    float3 fresnel = f0 + (1.0 - f0) * pow(1.0 - vDotH, 5.0);
                    float alpha = max(0.0025, roughness * roughness);
                    float alpha2 = alpha * alpha;
                    float denominator = nDotH * nDotH * (alpha2 - 1.0) + 1.0;
                    float distribution = alpha2 / max(UNITY_PI * denominator * denominator, 1e-5);
                    float k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
                    float visibility = (nDotL / max(nDotL * (1.0 - k) + k, 1e-5))
                        * (nDotV / max(nDotV * (1.0 - k) + k, 1e-5));
                    float3 specular = fresnel * distribution * visibility * direct;
                    float3 diffuse = albedo * (1.0 - _Metalness) * (ambient + direct);
                    float3 environment = ambient * f0 * _EnvMapIntensity
                        * (1.0 - roughness * 0.62);
                    float clearcoatLobe = _Clearcoat * pow(nDotH,
                        lerp(256.0, 8.0, _ClearcoatRoughness)) * nDotL;
                    color = diffuse + specular + environment
                        + _SunColor.rgb * clearcoatLobe * shadow + _EmissiveColor.rgb;
                }
                color = ApplySoftWorldFog(color,
                    distance(_WorldSpaceCameraPos.xyz, input.worldPosition));
                if (_ToneMapped > 0.5) color = AcesFilmic(max(color, 0.0));
                return float4(color, _BaseColor.a * _Opacity);
            }
            ENDCG
        }

        Pass
        {
            Name "SHADOWCASTER"
            Tags { "LightMode"="ShadowCaster" }
            Cull [_Cull]
            ZWrite On
            ZTest LEqual
            Offset [_OffsetFactor], [_OffsetUnits]
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vertShadow
            #pragma fragment fragShadow
            #pragma multi_compile_shadowcaster
            #include "UnityCG.cginc"

            struct v2f { V2F_SHADOW_CASTER; };
            // Unity's TRANSFER_SHADOW_CASTER_NORMALOFFSET macro references the input as `v`.
            v2f vertShadow(appdata_base v)
            {
                v2f output;
                TRANSFER_SHADOW_CASTER_NORMALOFFSET(output)
                return output;
            }
            float4 fragShadow(v2f input) : SV_Target
            {
                SHADOW_CASTER_FRAGMENT(input)
            }
            ENDCG
        }
    }
    Fallback Off
}

Shader "GunsOnly/WeekendCircuitParity"
{
    Properties
    {
        _MainTex ("sRGB Web Albedo", 2D) = "white" {}
        _BaseColor ("Three Linear Color", Vector) = (1,1,1,1)
        _UseTexture ("Use Texture", Float) = 0
        _UseVertexColor ("Use Vertex/Instance Color", Float) = 0
        _AlphaTest ("Three Alpha Test", Range(0,1)) = 0
        _FlipTextureY ("Web flipY=false Atlas", Float) = 0
        _Unlit ("MeshBasic Material", Float) = 0
        _Roughness ("Three Roughness", Range(0,1)) = 1
        _Metalness ("Three Metalness", Range(0,1)) = 0
        _SkyColor ("Hemisphere Sky Linear", Vector) = (1,1,1,1)
        _GroundColor ("Hemisphere Ground Linear", Vector) = (0,0,0,1)
        _HemisphereIntensity ("Hemisphere Intensity", Float) = 1.65
        _SunPosition ("Web Directional Position", Vector) = (-1200,2400,900,0)
        _SunColor ("Sun Linear", Vector) = (1,1,1,1)
        _SunIntensity ("Sun Intensity", Float) = 2.05
        _FogDensity ("Three Exp2 Fog Density", Float) = 0.00016
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
        [Toggle] _ZWrite ("ZWrite", Float) = 1
        _OffsetFactor ("Polygon Offset Factor", Float) = 0
        _OffsetUnits ("Polygon Offset Units", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Cull [_Cull]
            ZWrite [_ZWrite]
            ZTest LEqual
            Offset [_OffsetFactor], [_OffsetUnits]

            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _BaseColor;
            float _UseTexture;
            float _UseVertexColor;
            float _AlphaTest;
            float _FlipTextureY;
            float _Unlit;
            float _Roughness;
            float _Metalness;
            float4 _SkyColor;
            float4 _GroundColor;
            float _HemisphereIntensity;
            float4 _SunPosition;
            float4 _SunColor;
            float _SunIntensity;
            float _FogDensity;

            static const float RECIPROCAL_PI = 0.3183098861837907;
            static const float THREE_EPSILON = 1e-6;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
                float4 color : COLOR;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float3 viewPosition : TEXCOORD0;
                float3 viewNormal : TEXCOORD1;
                float2 uv : TEXCOORD2;
                float4 color : COLOR;
            };

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.viewPosition = UnityObjectToViewPos(input.vertex);
                output.viewNormal = mul((float3x3)UNITY_MATRIX_IT_MV, input.normal);
                output.uv = TRANSFORM_TEX(input.uv, _MainTex);
                output.color = input.color;
                return output;
            }

            float3 F_Schlick(float3 f0, float f90, float dotVH)
            {
                float fresnel = exp2((-5.55473 * dotVH - 6.98316) * dotVH);
                return f0 * (1.0 - fresnel) + f90 * fresnel;
            }

            float V_GGX_SmithCorrelated(float alpha, float dotNL, float dotNV)
            {
                float a2 = alpha * alpha;
                float gv = dotNL * sqrt(a2 + (1.0 - a2) * dotNV * dotNV);
                float gl = dotNV * sqrt(a2 + (1.0 - a2) * dotNL * dotNL);
                return 0.5 / max(gv + gl, THREE_EPSILON);
            }

            float D_GGX(float alpha, float dotNH)
            {
                float a2 = alpha * alpha;
                float denominator = dotNH * dotNH * (a2 - 1.0) + 1.0;
                return RECIPROCAL_PI * a2 / (denominator * denominator);
            }

            float3 BRDF_GGX(
                float3 lightDirection,
                float3 viewDirection,
                float3 normal,
                float3 specularColor,
                float roughness)
            {
                float alpha = roughness * roughness;
                float3 halfDirection = normalize(lightDirection + viewDirection);
                float dotNL = saturate(dot(normal, lightDirection));
                float dotNV = saturate(dot(normal, viewDirection));
                float dotNH = saturate(dot(normal, halfDirection));
                float dotVH = saturate(dot(viewDirection, halfDirection));
                float3 F = F_Schlick(specularColor, 1.0, dotVH);
                float V = V_GGX_SmithCorrelated(alpha, dotNL, dotNV);
                float D = D_GGX(alpha, dotNH);
                return F * (V * D);
            }

            float4 frag(v2f input, float facing : VFACE) : SV_Target
            {
                float2 sampledUv = float2(
                    input.uv.x,
                    lerp(input.uv.y, 1.0 - input.uv.y, saturate(_FlipTextureY)));
                float4 texel = tex2D(_MainTex, sampledUv);
                float useTexture = saturate(_UseTexture);
                float3 sampled = lerp(float3(1,1,1), texel.rgb, useTexture);
                float sampledAlpha = lerp(1.0, texel.a, useTexture) * _BaseColor.a;
                clip(sampledAlpha - _AlphaTest);
                float3 vertexColor = lerp(float3(1,1,1), input.color.rgb,
                    saturate(_UseVertexColor));
                float3 albedo = sampled * _BaseColor.rgb * vertexColor;
                float3 normal = normalize(input.viewNormal) * (facing >= 0.0 ? 1.0 : -1.0);
                float3 viewUp = normalize(mul((float3x3)UNITY_MATRIX_V, float3(0,1,0)));
                float hemisphereMix = dot(normal, viewUp) * 0.5 + 0.5;
                float3 hemisphere = lerp(_GroundColor.rgb, _SkyColor.rgb, hemisphereMix)
                    * _HemisphereIntensity;
                float3 lightDirection = normalize(
                    mul((float3x3)UNITY_MATRIX_V, normalize(_SunPosition.xyz)));
                float3 viewDirection = normalize(-input.viewPosition);
                float dotNL = saturate(dot(normal, lightDirection));
                float metalness = saturate(_Metalness);
                float3 diffuseColor = albedo * (1.0 - metalness);
                float3 specularColor = lerp(float3(0.04,0.04,0.04), albedo, metalness);
                float3 normalDerivative = max(abs(ddx(normal)), abs(ddy(normal)));
                float geometryRoughness = max(
                    max(normalDerivative.x, normalDerivative.y), normalDerivative.z);
                float roughness = min(max(saturate(_Roughness), 0.0525)
                    + geometryRoughness, 1.0);
                float3 sunIrradiance = dotNL * _SunColor.rgb * _SunIntensity;
                float3 directDiffuse = sunIrradiance * diffuseColor * RECIPROCAL_PI;
                float3 directSpecular = sunIrradiance * BRDF_GGX(
                    lightDirection, viewDirection, normal, specularColor, roughness);
                float3 indirectDiffuse = hemisphere * diffuseColor * RECIPROCAL_PI;
                float3 lit = directDiffuse + directSpecular + indirectDiffuse;
                // Three computes Exp2 from its perspective-interpolated vFogDepth. Preserve the
                // exact factor in signed HDR alpha so the shared output pass does not depend on
                // Unity's camera-global depth texture (and alpha=1 third-party near-field stays
                // distinguishable from retained Weekend world geometry).
                float eyeDepth = max(-input.viewPosition.z, 0.0);
                float fogFactor = 1.0 - exp(
                    -_FogDensity * _FogDensity * eyeDepth * eyeDepth);
                return float4(
                    max(lerp(lit, albedo, saturate(_Unlit)), 0.0),
                    -saturate(fogFactor));
            }
            ENDCG
        }
        Pass
        {
            Name "ShadowCaster"
            Tags { "LightMode"="ShadowCaster" }
            Cull [_Cull]
            ZWrite On
            ZTest LEqual
            ColorMask 0
            Offset [_OffsetFactor], [_OffsetUnits]

            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vertShadow
            #pragma fragment fragShadow
            #pragma multi_compile_shadowcaster
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _BaseColor;
            float _UseTexture;
            float _AlphaTest;
            float _FlipTextureY;

            struct shadowAppdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct shadowV2f
            {
                V2F_SHADOW_CASTER;
                float2 uv : TEXCOORD1;
            };

            shadowV2f vertShadow(shadowAppdata v)
            {
                shadowV2f output;
                TRANSFER_SHADOW_CASTER_NORMALOFFSET(output)
                output.uv = TRANSFORM_TEX(v.uv, _MainTex);
                return output;
            }

            float4 fragShadow(shadowV2f input) : SV_Target
            {
                float2 sampledUv = float2(
                    input.uv.x,
                    lerp(input.uv.y, 1.0 - input.uv.y, saturate(_FlipTextureY)));
                float sampledAlpha = lerp(1.0, tex2D(_MainTex, sampledUv).a,
                    saturate(_UseTexture)) * _BaseColor.a;
                clip(sampledAlpha - _AlphaTest);
                SHADOW_CASTER_FRAGMENT(input)
            }
            ENDCG
        }
    }
    Fallback Off
}

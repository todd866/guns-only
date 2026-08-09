Shader "GunsOnly/WeekendR1NearField"
{
    Properties
    {
        _Color ("Linear Base Color", Color) = (1,1,1,1)
        _Emission ("Linear Emission", Color) = (0,0,0,1)
        _Metallic ("Metallic", Range(0,1)) = 0
        _Smoothness ("Smoothness", Range(0,1)) = 0.5
        _Unlit ("Unlit", Range(0,1)) = 0
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Source Blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Destination Blend", Float) = 0
        [Toggle] _ZWrite ("Depth Write", Float) = 1
    }

    SubShader
    {
        Tags { "Queue"="Geometry" "RenderType"="Opaque" }
        LOD 180
        Cull [_Cull]
        Blend [_SrcBlend] [_DstBlend]
        ZWrite [_ZWrite]

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            float4 _Color;
            float4 _Emission;
            float _Metallic;
            float _Smoothness;
            float _Unlit;

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.worldPosition = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                return output;
            }

            float4 frag(v2f input) : SV_Target
            {
                if (_Unlit > 0.5)
                    return float4(_Color.rgb + _Emission.rgb, _Color.a);

                float3 normal = normalize(input.worldNormal);
                float3 lightDirection = normalize(UnityWorldSpaceLightDir(input.worldPosition));
                float3 viewDirection = normalize(UnityWorldSpaceViewDir(input.worldPosition));
                float3 halfDirection = normalize(lightDirection + viewDirection);
                float nDotL = saturate(dot(normal, lightDirection));
                float nDotH = saturate(dot(normal, halfDirection));
                float specularPower = exp2(4.0 + _Smoothness * 7.0);
                float3 f0 = lerp(float3(0.04, 0.04, 0.04), _Color.rgb, _Metallic);
                float3 diffuse = _Color.rgb * (1.0 - _Metallic) * nDotL;
                float3 specular = f0 * pow(nDotH, specularPower) * nDotL;
                float3 ambient = max(0.0, ShadeSH9(float4(normal, 1.0)))
                    * _Color.rgb * lerp(1.0, 0.35, _Metallic);
                float3 lit = ambient + _LightColor0.rgb * (diffuse + specular) + _Emission.rgb;
                return float4(lit, _Color.a);
            }
            ENDCG
        }
    }

    FallBack Off
}

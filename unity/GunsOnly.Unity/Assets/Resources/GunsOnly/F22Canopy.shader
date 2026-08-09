Shader "GunsOnly/F22Canopy"
{
    Properties
    {
        _BaseColor ("Base Linear", Vector) = (0.34,0.48,0.57,1)
        _FresnelColor ("Fresnel Linear", Vector) = (0.56,0.69,0.74,1)
        _BaseOpacity ("Base Opacity", Range(0,1)) = 0.08
        _FresnelOpacity ("Fresnel Opacity", Range(0,1)) = 0.055
        _FresnelPower ("Fresnel Power", Float) = 2.4
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 1
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" }
        Cull [_Cull]
        ZWrite Off
        ZTest LEqual
        Blend SrcAlpha OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            float4 _BaseColor;
            float4 _FresnelColor;
            float _BaseOpacity;
            float _FresnelOpacity;
            float _FresnelPower;

            struct AppData {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };
            struct Varyings {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
            };

            Varyings vert(AppData input) {
                Varyings output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.worldPosition = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                return output;
            }

            float4 frag(Varyings input) : SV_Target {
                float3 viewDirection = normalize(_WorldSpaceCameraPos.xyz - input.worldPosition);
                float facing = saturate(abs(dot(normalize(input.worldNormal), viewDirection)));
                float fresnel = pow(1.0 - facing, max(0.01, _FresnelPower));
                float3 color = lerp(_BaseColor.rgb, _FresnelColor.rgb, fresnel);
                float alpha = saturate(_BaseOpacity + fresnel * _FresnelOpacity);
                return float4(color, alpha);
            }
            ENDCG
        }
    }
    Fallback Off
}

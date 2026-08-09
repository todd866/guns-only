Shader "GunsOnly/F22OutputTransform"
{
    Properties
    {
        _MainTex ("Source", 2D) = "white" {}
        _Exposure ("Three ACES Exposure", Float) = 1.02
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Overlay" }
        Cull Off ZWrite Off ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float _Exposure;

            float3 RrtAndOdtFit(float3 value) {
                float3 a = value * (value + 0.0245786) - 0.000090537;
                float3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
                return a / b;
            }

            float3 AcesFilmic(float3 color) {
                // Matrix rows are the exact Three r160 column vectors expressed for HLSL mul(M,v).
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

            float4 frag(v2f_img input) : SV_Target {
                float4 source = tex2D(_MainTex, input.uv);
                return float4(AcesFilmic(max(source.rgb, 0.0)), source.a);
            }
            ENDCG
        }
    }
    Fallback Off
}

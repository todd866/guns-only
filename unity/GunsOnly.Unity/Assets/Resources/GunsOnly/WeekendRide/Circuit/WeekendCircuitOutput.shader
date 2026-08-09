Shader "GunsOnly/WeekendCircuitOutput"
{
    Properties
    {
        _MainTex ("Linear Scene", 2D) = "white" {}
        _Exposure ("Three ACES Exposure", Float) = 1.04
        _FogColor ("Three Output-sRGB Fog Uniform", Vector) = (0.6588235,0.7215686,0.7176471,1)
        _FogDensity ("Three Exp2 Fog Density", Float) = 0.00016
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
            float4 _FogColor;
            float _FogDensity;

            float3 RrtAndOdtFit(float3 value)
            {
                float3 a = value * (value + 0.0245786) - 0.000090537;
                float3 b = value * (0.983729 * value + 0.4329510) + 0.238081;
                return a / b;
            }

            float3 AcesFilmic(float3 color)
            {
                // Exact Three r160 ACES matrices expressed as HLSL rows for mul(M, v).
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

            float3 LinearTosRGB(float3 value)
            {
                float3 low = value * 12.92;
                float3 high = pow(max(value, 0.0), 0.41666) * 1.055 - 0.055;
                return lerp(high, low, step(value, 0.0031308));
            }

            float3 sRGBToLinear(float3 value)
            {
                // Return to Unity's linear backbuffer contract after reproducing Three's
                // display-space fog mix; the hardware OETF restores the exact display value.
                float3 low = value / 12.92;
                float3 high = pow(max((value + 0.055) / 1.055, 0.0), 2.4);
                return lerp(high, low, step(value, 0.04045));
            }

            float4 frag(v2f_img input) : SV_Target
            {
                float4 source = tex2D(_MainTex, input.uv);
                // Three r160 built-ins order tone mapping, output color conversion, then fog.
                float3 display = LinearTosRGB(AcesFilmic(max(source.rgb, 0.0)));
                // Retained Weekend materials store -ThreeExp2FogFactor in HDR alpha; sky stores
                // zero and third-party near-field shaders conventionally store positive alpha.
                // This deterministic auxiliary channel survives off-screen capture without a
                // camera-global depth texture and preserves Three's display-space fog ordering.
                float fogFactor = saturate(-source.a);
                display = lerp(display, _FogColor.rgb, fogFactor);
                return float4(sRGBToLinear(max(display, 0.0)), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}

Shader "GunsOnly/CobraFoliage"
{
    Properties
    {
        _MainTex ("Painted Foliage Atlas", 2D) = "white" {}
        _Cutoff ("Alpha Cutoff", Range(0,1)) = 0.38
        _FogColor ("Fog Linear", Vector) = (0.254,0.347,0.376,1)
        _FogDensity ("Fog Density", Float) = 0.00019
        _Exposure ("ACES Exposure", Float) = 1.12
    }
    SubShader
    {
        Tags { "Queue"="AlphaTest" "RenderType"="TransparentCutout" }
        Cull Off
        ZWrite On
        AlphaToMask On
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float _Cutoff;
            float4 _FogColor;
            float _FogDensity;
            float _Exposure;
            struct appdata {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float2 uv : TEXCOORD1;
                float fogDepth : TEXCOORD2;
                fixed4 color : COLOR;
            };
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
                return saturate(mul(outputMatrix, color));
            }
            float3 LinearToSrgb(float3 value) {
                float3 high = pow(max(value, 0.0), 0.41666) * 1.055 - 0.055;
                float3 low = value * 12.92;
                return float3(
                    value.r <= 0.0031308 ? low.r : high.r,
                    value.g <= 0.0031308 ? low.g : high.g,
                    value.b <= 0.0031308 ? low.b : high.b);
            }
            float3 SrgbToLinear(float3 value) {
                float3 high = pow(max((value + 0.055) / 1.055, 0.0), 2.4);
                float3 low = value / 12.92;
                return float3(
                    value.r <= 0.04045 ? low.r : high.r,
                    value.g <= 0.04045 ? low.g : high.g,
                    value.b <= 0.04045 ? low.b : high.b);
            }
            float3 ThreeBuiltInOutput(float3 linearColor, float fogDepth) {
                float3 display = LinearToSrgb(AcesFilmic(linearColor));
                float fog = 1.0 - exp(-_FogDensity * _FogDensity * fogDepth * fogDepth);
                return SrgbToLinear(lerp(display, LinearToSrgb(_FogColor.rgb), saturate(fog)));
            }
            v2f vert(appdata input) {
                v2f output;
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.uv = input.uv;
                output.fogDepth = -UnityObjectToViewPos(input.vertex).z;
                output.color = input.color;
                return output;
            }
            fixed4 frag(v2f input) : SV_Target {
                fixed4 texel = tex2D(_MainTex, input.uv);
                clip(texel.a - _Cutoff);
                float3 lit = texel.rgb * input.color.rgb;
                return float4(ThreeBuiltInOutput(lit, input.fogDepth), 1);
            }
            ENDCG
        }
    }
    FallBack Off
}

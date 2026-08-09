Shader "GunsOnly/CobraMist"
{
    Properties
    {
        _MainTex ("Web Mist Data Texture", 2D) = "white" {}
        _HasMask ("Has Mist Mask", Float) = 1
        _BaseColor ("Role Base Linear", Vector) = (0.687,0.784,0.753,1)
        _Opacity ("Opacity", Range(0,1)) = 0.14
        _FogColor ("Fog Linear", Vector) = (0.254,0.347,0.376,1)
        _FogDensity ("Fog Density", Float) = 0.00019
        _Exposure ("ACES Exposure", Float) = 1.12
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" }
        Cull Off
        ZWrite Off
        // Three.js r160 writes display-sRGB into the WebGL canvas before normal alpha
        // blending, so its transparent cards composite in display space. Unity's Linear
        // project blends in linear space. Capture the current destination and compensate the
        // source term so the hardware blend reproduces Three's display-space result exactly.
        GrabPass { }
        Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            sampler2D _GrabTexture;
            float _HasMask;
            float4 _BaseColor;
            float _Opacity;
            float4 _FogColor;
            float _FogDensity;
            float _Exposure;
            struct appdata {
                float4 vertex : POSITION;
                float2 uv : TEXCOORD0;
                float4 color : COLOR;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float2 uv : TEXCOORD0;
                float fogDepth : TEXCOORD1;
                float4 color : COLOR;
                float4 grabPosition : TEXCOORD2;
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
            v2f vert(appdata input) {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.uv = input.uv;
                output.fogDepth = -UnityObjectToViewPos(input.vertex).z;
                output.color = input.color;
                output.grabPosition = ComputeGrabScreenPos(output.position);
                return output;
            }
            float4 frag(v2f input) : SV_Target {
                float4 mask = tex2D(_MainTex, input.uv);
                mask = lerp(float4(1, 1, 1, 1), mask, _HasMask);
                float3 linearColor = _BaseColor.rgb * input.color.rgb * mask.rgb;
                float3 display = LinearToSrgb(AcesFilmic(linearColor));
                float fog = 1.0 - exp(
                    -_FogDensity * _FogDensity * input.fogDepth * input.fogDepth);
                display = lerp(display, LinearToSrgb(_FogColor.rgb), saturate(fog));
                float alpha = _Opacity * mask.a;
                if (alpha <= 0.00001) return float4(0, 0, 0, 0);
                // Water glints and sub-byte mist-mask tails do not need destination-aware
                // compensation; avoiding division by their tiny alpha also keeps half-float
                // arithmetic stable at the card boundary.
                if (_HasMask < 0.5 || alpha <= 0.006) {
                    return float4(SrgbToLinear(display), alpha);
                }
                float3 backgroundLinear = tex2Dproj(
                    _GrabTexture, UNITY_PROJ_COORD(input.grabPosition)).rgb;
                float3 backgroundDisplay = LinearToSrgb(backgroundLinear);
                float3 desiredLinear = SrgbToLinear(
                    lerp(backgroundDisplay, display, alpha));
                float3 compensatedSource =
                    (desiredLinear - backgroundLinear * (1.0 - alpha)) / alpha;
                return float4(max(compensatedSource, 0.0), alpha);
            }
            ENDCG
        }
    }
    FallBack Off
}

Shader "GunsOnly/SkyDome"
{
    Properties
    {
        _Zenith ("Zenith Linear", Vector) = (0.035,0.16,0.34,1)
        _Horizon ("Horizon Linear", Vector) = (0.34,0.47,0.52,1)
        _BelowHorizon ("Below Horizon Linear", Vector) = (0.022,0.075,0.095,1)
        _CloudColor ("Cloud Linear", Vector) = (0.62,0.67,0.69,1)
        _CloudShelf ("Cloud Shelf", Vector) = (0.045,0.34,0,0)
        _SkyCurveExponent ("Sky Curve", Float) = 0.42
        _ShoulderFalloff ("Horizon Shoulder Falloff", Float) = 70
        _ShoulderWeight ("Horizon Shoulder Weight", Float) = 0.46
        _SunDir ("Sun Direction", Vector) = (0.4998,0.279888,-0.819672,0)
        _Exposure ("ACES Exposure", Float) = 1.12
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" }
        Cull Front
        ZWrite Off
        ZTest LEqual
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float4 _Zenith;
            float4 _Horizon;
            float4 _BelowHorizon;
            float4 _CloudColor;
            float4 _CloudShelf;
            float _SkyCurveExponent;
            float _ShoulderFalloff;
            float _ShoulderWeight;
            float4 _SunDir;
            float _Exposure;
            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 position : SV_POSITION; float3 direction : TEXCOORD0; };

            float SkyHash(float2 p) {
                float3 p3 = frac(float3(p.x, p.y, p.x) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.x + p3.y) * p3.z);
            }
            float SkyNoise(float2 p) {
                float2 cell = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(
                    lerp(SkyHash(cell), SkyHash(cell + float2(1, 0)), u.x),
                    lerp(SkyHash(cell + float2(0, 1)), SkyHash(cell + float2(1, 1)), u.x),
                    u.y);
            }
            float Smooth(float low, float high, float value) {
                float unit = saturate((value - low) / max(1e-6, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
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
                return saturate(mul(outputMatrix, color));
            }
            v2f vert(appdata input) {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.direction = normalize(input.vertex.xyz);
                return output;
            }
            fixed4 frag(v2f input) : SV_Target {
                float3 direction = normalize(input.direction);
                float aboveHorizon = max(direction.y, 0.0);
                float skyCurve = pow(aboveHorizon, _SkyCurveExponent);
                float3 color = lerp(_Horizon.rgb, _Zenith.rgb, skyCurve);
                float horizonShoulder = exp(-abs(direction.y) * _ShoulderFalloff);
                color = lerp(color, _Horizon.rgb * 1.08, horizonShoulder * _ShoulderWeight);
                float azimuth = atan2(direction.z, direction.x);
                float shelf = Smooth(_CloudShelf.x, _CloudShelf.x + 0.035, direction.y)
                    * (1.0 - Smooth(_CloudShelf.y * 0.62, _CloudShelf.y, direction.y));
                float2 cloudUv = float2(azimuth * 0.88, direction.y * 4.2);
                float puff = SkyNoise(cloudUv) * 0.68
                    + SkyNoise(cloudUv * 2.07 + float2(7.4, -3.1)) * 0.32;
                float cloudMask = shelf * Smooth(0.43, 0.72, puff);
                color = lerp(color, _CloudColor.rgb, cloudMask * 0.42);
                float sunDot = max(dot(direction, normalize(_SunDir.xyz)), 0.0);
                color += float3(1.0, 0.72, 0.42)
                    * (pow(sunDot, 20.0) * 0.055 + pow(sunDot, 420.0) * 0.48);
                if (direction.y < 0.0) {
                    color = lerp(_BelowHorizon.rgb, _Horizon.rgb, exp(direction.y * 16.0));
                }
                return float4(AcesFilmic(color), 1);
            }
            ENDCG
        }
    }
    FallBack Off
}

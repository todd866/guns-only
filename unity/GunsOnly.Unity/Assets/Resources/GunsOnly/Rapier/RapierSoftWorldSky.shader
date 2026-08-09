Shader "GunsOnly/RapierSoftWorldSky"
{
    Properties
    {
        _HorizonLow ("Horizon Low Linear", Vector) = (0.94,0.86,0.70,1)
        _HorizonHigh ("Horizon High Linear", Vector) = (0.76,0.72,0.60,1)
        _ZenithLow ("Zenith Low Linear", Vector) = (0.08,0.17,0.46,1)
        _ZenithHigh ("Zenith High Linear", Vector) = (0.033,0.072,0.199,1)
        _FogColor ("Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _HazeColor ("Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _HazeMix ("Haze Mix", Float) = 0.72
        _SunDirection ("Sun Direction", Vector) = (0.5,0.28,0.82,0)
        _AltitudeM ("Camera Altitude M", Float) = 192
        _AltitudeBlendM ("Altitude Blend M", Vector) = (2500,18000,0,0)
        _SkyCurveLow ("Sky Curve Low", Float) = 0.18
        _SkyCurveHigh ("Sky Curve High", Float) = 0.13
        _ShoulderFalloff ("Shoulder Falloff", Float) = 48
        _ShoulderGain ("Shoulder Gain", Float) = 1.14
        _ShoulderWeight ("Shoulder Weight", Float) = 0.48
        _BelowFalloff ("Below Horizon Falloff", Float) = 34
        _SunCoreExponent ("Sun Core Exponent", Float) = 1800
        _SunBloomExponent ("Sun Bloom Exponent", Float) = 42
        _SunHaloExponent ("Sun Halo Exponent", Float) = 8
        _SunCoreGain ("Sun Core Gain", Float) = 1.35
        _SunBloomGain ("Sun Bloom Gain", Float) = 0.55
        _SunHaloGain ("Sun Halo Gain", Float) = 0.12
        _Exposure ("Three ACES Exposure", Float) = 1.1
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

            float4 _HorizonLow;
            float4 _HorizonHigh;
            float4 _ZenithLow;
            float4 _ZenithHigh;
            float4 _FogColor;
            float4 _HazeColor;
            float _HazeMix;
            float4 _SunDirection;
            float _AltitudeM;
            float4 _AltitudeBlendM;
            float _SkyCurveLow;
            float _SkyCurveHigh;
            float _ShoulderFalloff;
            float _ShoulderGain;
            float _ShoulderWeight;
            float _BelowFalloff;
            float _SunCoreExponent;
            float _SunBloomExponent;
            float _SunHaloExponent;
            float _SunCoreGain;
            float _SunBloomGain;
            float _SunHaloGain;
            float _Exposure;

            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 position : SV_POSITION; float3 direction : TEXCOORD0; };

            float Smooth(float low, float high, float value)
            {
                float unit = saturate((value - low) / max(1e-6, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
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

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.direction = normalize(input.vertex.xyz);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float3 direction = normalize(input.direction);
                float altitudeMix = Smooth(_AltitudeBlendM.x, _AltitudeBlendM.y,
                    max(_AltitudeM, 0.0));
                float3 horizon = lerp(_HorizonLow.rgb, _HorizonHigh.rgb, altitudeMix);
                float3 zenith = lerp(_ZenithLow.rgb, _ZenithHigh.rgb, altitudeMix);
                float skyCurve = pow(max(direction.y, 0.0),
                    lerp(_SkyCurveLow, _SkyCurveHigh, altitudeMix));
                float3 color = lerp(horizon, zenith, skyCurve);
                float horizonShoulder = exp(-abs(direction.y) * _ShoulderFalloff);
                color = lerp(color, horizon * _ShoulderGain,
                    horizonShoulder * _ShoulderWeight);

                float sunDot = max(dot(direction, normalize(_SunDirection.xyz)), 0.0);
                float sunCore = pow(sunDot, _SunCoreExponent);
                float sunBloom = pow(sunDot, _SunBloomExponent);
                float sunHalo = pow(sunDot, _SunHaloExponent);
                float above = Smooth(-0.02, 0.08, direction.y);
                float3 sunColor = lerp(float3(1.0,0.82,0.55), float3(1.0,0.94,0.82), sunCore);
                color += sunColor * (sunCore * _SunCoreGain + sunBloom * _SunBloomGain
                    + sunHalo * _SunHaloGain) * above * (1.0 - altitudeMix * 0.35);

                if (direction.y < 0.0)
                {
                    float3 below = lerp(_FogColor.rgb, _HazeColor.rgb, _HazeMix);
                    color = lerp(below, horizon, exp(direction.y * _BelowFalloff));
                }
                return float4(AcesFilmic(max(color, 0.0)), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}

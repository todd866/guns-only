Shader "GunsOnly/F22UkraineCombatSky"
{
    Properties
    {
        _AltitudeM ("Camera Altitude M", Float) = 3000
        _SunDirection ("Surface To Sun", Vector) = (0.4998,0.2799,-0.8197,0)
        _FogColor ("Terrain Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _AtmosphereHazeColor ("Ukraine Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _AtmosphereHazeMix ("Ukraine Haze Mix", Range(0,1)) = 0.72
    }
    SubShader
    {
        Tags { "Queue"="Background" "RenderType"="Background" }
        Cull Front
        ZWrite Off
        ZTest Always
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _AltitudeM;
            float4 _SunDirection;
            float4 _FogColor;
            float4 _AtmosphereHazeColor;
            float _AtmosphereHazeMix;

            struct appdata {
                float4 vertex : POSITION;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 direction : TEXCOORD0;
            };

            float Smooth(float low, float high, float value) {
                float unit = saturate((value - low) / max(0.000001, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
            }

            v2f vert(appdata input) {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.direction = normalize(
                    mul((float3x3)unity_ObjectToWorld, input.vertex.xyz));
                return output;
            }

            float4 frag(v2f input) : SV_Target {
                float3 direction = normalize(input.direction);
                float aboveHorizon = max(direction.y, 0.0);
                float altitudeMix = Smooth(2500.0, 18000.0, max(_AltitudeM, 0.0));
                float3 horizonWarmCombat = lerp(
                    float3(0.34, 0.38, 0.32),
                    float3(0.18, 0.26, 0.34),
                    altitudeMix);
                float3 zenithWarmCombat = lerp(
                    float3(0.035, 0.105, 0.34),
                    float3(0.018, 0.052, 0.16),
                    altitudeMix);
                float skyCurve = pow(
                    aboveHorizon,
                    lerp(0.18, 0.13, altitudeMix));
                float3 color = lerp(horizonWarmCombat, zenithWarmCombat, skyCurve);

                float horizonShoulder = exp(-abs(direction.y) * 48.0);
                color = lerp(
                    color,
                    horizonWarmCombat * 1.14,
                    horizonShoulder * 0.48);

                float3 sunDir = normalize(_SunDirection.xyz);
                float sunDot = max(dot(direction, sunDir), 0.0);
                float sunCore = pow(sunDot, 1800.0);
                float sunBloom = pow(sunDot, 42.0);
                float sunHalo = pow(sunDot, 8.0);
                float above = Smooth(-0.02, 0.08, direction.y);
                float3 sunColor = lerp(
                    float3(1.0, 0.82, 0.55),
                    float3(1.0, 0.94, 0.82),
                    sunCore);
                float sunPresentation = 0.62;
                color += sunColor
                    * (sunCore * 1.35 + sunBloom * 0.55 + sunHalo * 0.12)
                    * above
                    * sunPresentation
                    * (1.0 - altitudeMix * 0.35);

                if (direction.y < 0.0) {
                    float3 belowWarm = lerp(
                        _FogColor.rgb,
                        _AtmosphereHazeColor.rgb,
                        _AtmosphereHazeMix);
                    float groundRamp = exp(direction.y * 34.0);
                    color = lerp(belowWarm, horizonWarmCombat, groundRamp);
                }
                return float4(color, 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}

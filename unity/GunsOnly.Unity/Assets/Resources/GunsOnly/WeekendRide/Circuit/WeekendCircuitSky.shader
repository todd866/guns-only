Shader "GunsOnly/WeekendCircuitSky"
{
    Properties
    {
        _TopColor ("Top Linear", Vector) = (0.0953075,0.2831487,0.4178851,1)
        _HorizonColor ("Horizon Linear", Vector) = (0.5583404,0.6653873,0.6653873,1)
        _LowerHazeColor ("Lower Haze Linear", Vector) = (0.2541521,0.3813260,0.4019778,1)
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

            float4 _TopColor;
            float4 _HorizonColor;
            float4 _LowerHazeColor;
            struct appdata { float4 vertex : POSITION; };
            struct v2f { float4 position : SV_POSITION; float3 direction : TEXCOORD0; };

            float Smooth(float low, float high, float value)
            {
                float unit = saturate((value - low) / max(1e-6, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
            }

            v2f vert(appdata input)
            {
                v2f output;
                output.position = UnityObjectToClipPos(input.vertex);
                output.direction = normalize(input.vertex.xyz);
                return output;
            }

            float4 frag(v2f input) : SV_Target
            {
                // Match the Web ShaderMaterial exactly: vSkyDirection is normalized per vertex,
                // then perspective-interpolated. Re-normalizing here changes the vertical palette.
                float height = input.direction.y;
                float3 color = lerp(_LowerHazeColor.rgb, _HorizonColor.rgb,
                    Smooth(-0.14, 0.06, height));
                color = lerp(color, _TopColor.rgb, Smooth(0.02, 0.72, height));
                // Signed alpha is the retained-world fog-factor channel; sky is never fogged.
                return float4(color, 0.0);
            }
            ENDCG
        }
    }
    Fallback Off
}

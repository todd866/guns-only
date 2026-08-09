Shader "GunsOnly/RapierLaunchFx"
{
    Properties
    {
        _BaseColor ("Base Linear", Vector) = (1,0.75,0.4,1)
        _Opacity ("Opacity", Range(0,1)) = 0
        _PointSize ("Three Point Size", Float) = 1
        _ToneMapped ("Three toneMapped", Float) = 0
        _FogColor ("Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _FogDensity ("Fog Density", Float) = 0.000019778835
        _FogDensityScale ("Soft World Fog Scale", Float) = 0.32
        _HazeColor ("Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _HazeMix ("Haze Mix", Range(0,1)) = 0.72
        _Exposure ("Three ACES Exposure", Float) = 1.1
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("ZTest", Float) = 4
    }
    SubShader
    {
        Tags { "Queue"="Transparent+20" "RenderType"="Transparent" }
        Cull Off
        ZWrite Off
        ZTest [_ZTest]
        Blend SrcAlpha One
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float4 _BaseColor;
            float _Opacity;
            float _PointSize;
            float _ToneMapped;
            float4 _FogColor;
            float _FogDensity;
            float _FogDensityScale;
            float4 _HazeColor;
            float _HazeMix;
            float _Exposure;

            struct appdata { float4 vertex : POSITION; };
            struct v2f
            {
                float4 position : SV_POSITION;
                float pointSize : PSIZE;
                float distanceToCamera : TEXCOORD0;
            };

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
                float4 view = mul(UNITY_MATRIX_MV, input.vertex);
                output.position = mul(UNITY_MATRIX_P, view);
                output.pointSize = max(1.0,
                    _PointSize * (_ScreenParams.y * 0.5) / max(-view.z, 0.01));
                float3 world = mul(unity_ObjectToWorld, input.vertex).xyz;
                output.distanceToCamera = distance(_WorldSpaceCameraPos.xyz, world);
                return output;
            }

            fixed4 frag(v2f input) : SV_Target
            {
                float density = _FogDensity * _FogDensityScale;
                float fog = 1.0 - exp(-density * density
                    * input.distanceToCamera * input.distanceToCamera);
                float3 haze = lerp(_FogColor.rgb, _HazeColor.rgb, _HazeMix);
                float3 color = lerp(_BaseColor.rgb, haze, saturate(fog));
                if (_ToneMapped > 0.5) color = AcesFilmic(max(color, 0.0));
                return float4(color, _BaseColor.a * _Opacity);
            }
            ENDCG
        }
    }
    Fallback Off
}

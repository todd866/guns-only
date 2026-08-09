Shader "GunsOnly/CobraAsset"
{
    Properties
    {
        _BaseColor ("Base Linear", Vector) = (1,1,1,1)
        _EmissiveColor ("Emissive Linear", Vector) = (0,0,0,1)
        _Opacity ("Opacity", Range(0,1)) = 1
        [Enum(UnityEngine.Rendering.CullMode)] _Cull ("Cull", Float) = 2
        [Enum(Off,0,On,1)] _ZWrite ("Z Write", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Source Blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Destination Blend", Float) = 0
        _OffsetFactor ("Polygon Offset Factor", Float) = 0
        _OffsetUnits ("Polygon Offset Units", Float) = 0
        _SunDirection ("Surface To Sun", Vector) = (0.4998,0.279888,-0.819672,0)
        _SunColor ("Sun Linear", Vector) = (1,0.753,0.456,1)
        _SunIntensity ("Sun Intensity", Float) = 2.65
        _SkyColor ("Hemisphere Sky Linear", Vector) = (0.462,0.591,0.631,1)
        _GroundColor ("Hemisphere Ground Linear", Vector) = (0.031,0.056,0.040,1)
        _HemisphereIntensity ("Hemisphere", Float) = 1.02
        _FogColor ("Fog Linear", Vector) = (0.254,0.347,0.376,1)
        _FogDensity ("Fog Density", Float) = 0.00019
        _Exposure ("ACES Exposure", Float) = 1.12
    }
    SubShader
    {
        Tags { "Queue"="Geometry+2" "RenderType"="Opaque" }
        Cull [_Cull]
        ZWrite [_ZWrite]
        Blend [_SrcBlend] [_DstBlend]
        Offset [_OffsetFactor], [_OffsetUnits]
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"
            float4 _SunDirection;
            float4 _BaseColor;
            float4 _EmissiveColor;
            float _Opacity;
            float4 _SunColor;
            float _SunIntensity;
            float4 _SkyColor;
            float4 _GroundColor;
            float _HemisphereIntensity;
            float4 _FogColor;
            float _FogDensity;
            float _Exposure;
            struct appdata {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                fixed4 color : COLOR;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 normal : TEXCOORD1;
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
                // Three r155 applies fog_fragment after colorspace_fragment for built-ins.
                return SrgbToLinear(lerp(display, LinearToSrgb(_FogColor.rgb), saturate(fog)));
            }
            v2f vert(appdata input) {
                v2f output;
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.normal = UnityObjectToWorldNormal(input.normal);
                output.fogDepth = -UnityObjectToViewPos(input.vertex).z;
                output.color = input.color;
                return output;
            }
            fixed4 frag(v2f input) : SV_Target {
                float3 normal = normalize(input.normal);
                float hemiBlend = normal.y * 0.5 + 0.5;
                float3 hemisphere = lerp(_GroundColor.rgb, _SkyColor.rgb, hemiBlend)
                    * _HemisphereIntensity;
                float diffuse = max(dot(normal, normalize(_SunDirection.xyz)), 0.0);
                float3 direct = _SunColor.rgb * _SunIntensity * diffuse;
                // Web's MeshLambert BRDF applies reciprocal PI to direct and hemisphere irradiance.
                float3 albedo = _BaseColor.rgb * input.color.rgb;
                float3 lit = albedo * (hemisphere + direct) * 0.3183098861837907
                    + _EmissiveColor.rgb;
                return float4(ThreeBuiltInOutput(lit, input.fogDepth), _Opacity);
            }
            ENDCG
        }
    }
    FallBack Off
}

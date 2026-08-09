Shader "GunsOnly/F22UkraineFoliage"
{
    Properties
    {
        _MainTex ("Ukraine Temperate Foliage", 2D) = "white" {}
        _UseAtlas ("Use Atlas", Float) = 1
        _Cutoff ("Web Alpha Cutoff", Range(0,1)) = 0.38
        _EmissiveIntensity ("Web Sky Fill", Range(0,1)) = 0.16
        _FogDensity ("Web Base Fog Density", Float) = 0.000052
        _AtmosphereDensityScale ("Ukraine Fog Density Scale", Float) = 0.32
        _FogColor ("Ukraine Fog Linear", Vector) = (0.39,0.22,0.07,1)
        _AtmosphereHazeColor ("Ukraine Haze Linear", Vector) = (0.48,0.59,0.68,1)
        _AtmosphereHazeMix ("Ukraine Haze Mix", Range(0,1)) = 0.72
        _ShadowFloor ("Web Shadow Floor", Range(0,1)) = 0.16
    }
    SubShader
    {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        Cull Off
        ZWrite On

        Pass
        {
            Tags { "LightMode"="ForwardBase" }
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase
            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float _UseAtlas;
            float _Cutoff;
            float _EmissiveIntensity;
            float _FogDensity;
            float _AtmosphereDensityScale;
            float4 _FogColor;
            float4 _AtmosphereHazeColor;
            float _AtmosphereHazeMix;
            float _ShadowFloor;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
                fixed4 color : COLOR;
            };

            struct v2f
            {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float2 authoredUv : TEXCOORD2;
                float3 color : TEXCOORD3;
                SHADOW_COORDS(4)
            };

            v2f vert(appdata input)
            {
                v2f output;
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.worldNormal = UnityObjectToWorldNormal(input.normal);
                output.authoredUv = input.uv;
                output.color = input.color.rgb;
                TRANSFER_SHADOW(output);
                return output;
            }

            float4 frag(v2f input, fixed facing : VFACE) : SV_Target
            {
                // The shared authoring contract is top-left/V-down. Unity's imported PNG sampler
                // is bottom-left/V-up, so this is the same explicit flip as the terrain shader.
                float4 atlas = tex2D(_MainTex, float2(input.authoredUv.x, 1.0 - input.authoredUv.y));
                if (_UseAtlas > 0.5) clip(atlas.a - _Cutoff);
                float3 pigment = input.color * lerp(float3(1, 1, 1), atlas.rgb, saturate(_UseAtlas));
                float3 normal = normalize(input.worldNormal) * (facing >= 0 ? 1.0 : -1.0);
                float3 lightDirection = normalize(UnityWorldSpaceLightDir(input.worldPosition));
                float halfLambert = dot(normal, lightDirection) * 0.5 + 0.5;
                halfLambert *= halfLambert;
                float attenuation = SHADOW_ATTENUATION(input);
                float lighting = _ShadowFloor
                    + (1.0 - _ShadowFloor) * lerp(0.28, 1.0, halfLambert) * attenuation;
                float3 lit = pigment * (_LightColor0.rgb * lighting + _EmissiveIntensity);

                float distanceToCamera = length(_WorldSpaceCameraPos - input.worldPosition);
                float density = _FogDensity * _AtmosphereDensityScale;
                float aerial = 1.0 - exp(-density * density
                    * distanceToCamera * distanceToCamera);
                float3 haze = lerp(
                    _FogColor.rgb,
                    _AtmosphereHazeColor.rgb,
                    _AtmosphereHazeMix);
                return float4(lerp(lit, haze, saturate(aerial)), 1.0);
            }
            ENDCG
        }

        Pass
        {
            Tags { "LightMode"="ShadowCaster" }
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vertShadow
            #pragma fragment fragShadow
            #pragma multi_compile_shadowcaster
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float _UseAtlas;
            float _Cutoff;

            struct shadowInput
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct shadowOutput
            {
                V2F_SHADOW_CASTER;
                float2 authoredUv : TEXCOORD1;
            };

            shadowOutput vertShadow(shadowInput input)
            {
                shadowOutput output;
                output.authoredUv = input.uv;
                TRANSFER_SHADOW_CASTER_NORMALOFFSET(output)
                return output;
            }

            float4 fragShadow(shadowOutput input) : SV_Target
            {
                float alpha = tex2D(
                    _MainTex,
                    float2(input.authoredUv.x, 1.0 - input.authoredUv.y)).a;
                if (_UseAtlas > 0.5) clip(alpha - _Cutoff);
                SHADOW_CASTER_FRAGMENT(input)
            }
            ENDCG
        }
    }
    Fallback Off
}

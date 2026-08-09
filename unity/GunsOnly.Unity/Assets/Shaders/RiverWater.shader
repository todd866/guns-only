Shader "GunsOnly/RiverWater"
{
    Properties
    {
        _GroundMacro ("Ground Macro", 2D) = "white" {}
        _HasGroundMacro ("Has Ground Macro", Float) = 1
        _GroundMacroRepeatM ("Ground Macro Repeat M", Float) = 6200
        _GroundMacroPhase ("Ground Macro Phase", Vector) = (0.17,-0.11,0,0)
        _SunDirection ("Surface To Sun", Vector) = (0.4998,0.279888,-0.819672,0)
        _FogColor ("Fog Linear", Vector) = (0.254,0.347,0.376,1)
        _FogDensity ("Fog Density", Float) = 0.00019
        _DeepWater ("Deep Linear", Vector) = (0.006,0.032,0.038,1)
        _ShallowWater ("Shallow Linear", Vector) = (0.024,0.078,0.078,1)
        _BankGravel ("Bank Linear", Vector) = (0.1,0.112,0.064,1)
        _BankLight ("Bank Light Linear", Vector) = (0.76,0.82,0.82,1)
        _ShoreWindow ("Shore", Vector) = (0.86,1.10,0,0)
        _Exposure ("ACES Exposure", Float) = 1.12
    }
    SubShader
    {
        Tags { "Queue"="Geometry+1" "RenderType"="Opaque" }
        Cull Off
        ZWrite On
        // Metal's slope-scale depth bias is materially stronger than WebGL's at the same factor.
        // Three quarters of the slope factor matches WebGL's river/mist depth boundary on Metal:
        // it keeps the river clear of the basin, preserves the 11.4 cm Web-visible humidity layer,
        // and still occludes the lower card tail that Web correctly puts behind the water.
        Offset -0.75, -2
        Pass
        {
            CGPROGRAM
            #pragma target 3.0
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            sampler2D _GroundMacro;
            float _HasGroundMacro;
            float _GroundMacroRepeatM;
            float4 _GroundMacroPhase;
            float4 _SunDirection;
            float4 _FogColor;
            float _FogDensity;
            float4 _DeepWater;
            float4 _ShallowWater;
            float4 _BankGravel;
            float4 _BankLight;
            float4 _ShoreWindow;
            float _Exposure;

            struct appdata {
                float4 vertex : POSITION;
                float4 riverFrame : TEXCOORD1;
            };
            struct v2f {
                float4 position : SV_POSITION;
                float3 worldPosition : TEXCOORD0;
                float4 riverFrame : TEXCOORD1;
            };

            float CobraHash(float2 p) {
                float3 p3 = frac(float3(p.x, p.y, p.x) * 0.1031);
                p3 += dot(p3, p3.yzx + 33.33);
                return frac((p3.x + p3.y) * p3.z);
            }
            float CobraNoise(float2 p) {
                float2 cell = floor(p);
                float2 f = frac(p);
                float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(
                    lerp(CobraHash(cell), CobraHash(cell + float2(1, 0)), u.x),
                    lerp(CobraHash(cell + float2(0, 1)), CobraHash(cell + float2(1, 1)), u.x),
                    u.y);
            }
            float Smooth(float low, float high, float value) {
                float unit = saturate((value - low) / max(1e-6, high - low));
                return unit * unit * (3.0 - 2.0 * unit);
            }
            float2 UnityTextureUv(float2 authoredUv) {
                return float2(authoredUv.x, 1.0 - authoredUv.y);
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
                float4 world = mul(unity_ObjectToWorld, input.vertex);
                output.position = mul(UNITY_MATRIX_VP, world);
                output.worldPosition = world.xyz;
                output.riverFrame = input.riverFrame;
                return output;
            }

            fixed4 frag(v2f input) : SV_Target {
                float lateral = abs(
                    (input.worldPosition.x - input.riverFrame.x) * input.riverFrame.z
                    + (-input.worldPosition.z - input.riverFrame.y) * input.riverFrame.w);
                float bankBreakup = (CobraNoise(input.worldPosition.xz * 0.018) - 0.5) * 0.13;
                float shore = Smooth(
                    _ShoreWindow.x + bankBreakup,
                    _ShoreWindow.y + bankBreakup,
                    lateral);
                float depth = 1.0 - saturate(lateral);

                float3 viewDirection = normalize(_WorldSpaceCameraPos - input.worldPosition);
                float phaseA = input.worldPosition.x * 0.032 + input.worldPosition.z * 0.019;
                float phaseB = input.worldPosition.x * -0.014 + input.worldPosition.z * 0.047 + 1.7;
                float rippleA = sin(phaseA);
                float rippleB = sin(phaseB);
                float3 normal = normalize(float3(
                    -(0.032 * cos(phaseA) - 0.0077 * cos(phaseB)) * 1.8,
                    1.0,
                    -(0.019 * cos(phaseA) + 0.026 * cos(phaseB)) * 1.8));

                float3 water = lerp(
                    _ShallowWater.rgb,
                    _DeepWater.rgb,
                    Smooth(0.12, 0.82, depth));
                float flowVariation = CobraNoise(input.worldPosition.xz * 0.012);
                water *= 0.95 + (flowVariation - 0.5) * 0.08
                    + (rippleA + rippleB * 0.45) * 0.018;
                float fresnel = pow(1.0 - saturate(dot(normal, viewDirection)), 3.0);
                water = lerp(water, _FogColor.rgb * 0.58, fresnel * 0.16);
                float3 halfVector = normalize(viewDirection + normalize(_SunDirection.xyz));
                water += float3(0.72, 0.70, 0.58)
                    * pow(max(dot(normal, halfVector), 0.0), 96.0) * 0.032;

                float gravelGrain = CobraNoise(input.worldPosition.xz * 0.045) * 0.65
                    + CobraNoise(input.worldPosition.xz * 0.16) * 0.35;
                float2 bankUv = input.worldPosition.xz / _GroundMacroRepeatM
                    + _GroundMacroPhase.xy;
                float3 bankGround = tex2D(_GroundMacro, UnityTextureUv(bankUv)).rgb
                    * float3(0.88, 0.96, 0.80);
                float3 gravel = lerp(
                    _BankGravel.rgb * _BankLight.rgb,
                    bankGround,
                    _HasGroundMacro * 0.56) * (0.88 + 0.22 * gravelGrain);
                float3 lit = lerp(water, gravel, shore);
                float distanceM = distance(_WorldSpaceCameraPos, input.worldPosition);
                float aerial = 1.0 - exp(-_FogDensity * _FogDensity * distanceM * distanceM);
                float3 color = lerp(lit, _FogColor.rgb, Smooth(0.0, 1.0, aerial));
                return float4(AcesFilmic(color), 1);
            }
            ENDCG
        }
    }
    FallBack Off
}

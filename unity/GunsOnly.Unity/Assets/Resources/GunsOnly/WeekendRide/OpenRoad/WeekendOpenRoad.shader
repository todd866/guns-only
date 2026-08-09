Shader "GunsOnly/WeekendOpenRoad" {
    Properties {
        _MainTex ("sRGB road albedo", 2D) = "white" {}
        _Metallic ("Metallic", Range(0, 1)) = 0.01
        _Smoothness ("Smoothness", Range(0, 1)) = 0.07
    }
    SubShader {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        LOD 200
        Offset -2, -1

        CGPROGRAM
        #pragma surface Surface Standard fullforwardshadows
        #pragma target 3.0

        sampler2D _MainTex;
        half _Metallic;
        half _Smoothness;

        struct Input {
            float2 uv_MainTex;
        };

        void Surface(Input input, inout SurfaceOutputStandard output) {
            fixed4 albedo = tex2D(_MainTex, input.uv_MainTex);
            output.Albedo = albedo.rgb;
            output.Metallic = _Metallic;
            output.Smoothness = _Smoothness;
            output.Occlusion = 1.0;
            output.Alpha = 1.0;
        }
        ENDCG
    }
    FallBack "Standard"
}

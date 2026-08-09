Shader "GunsOnly/WeekendRoadsideCutout" {
    Properties {
        _MainTex ("sRGB roadside atlas", 2D) = "white" {}
        _Cutoff ("Alpha cutoff", Range(0, 1)) = 0.42
        _Smoothness ("Smoothness", Range(0, 1)) = 0.05
    }
    SubShader {
        Tags { "RenderType"="TransparentCutout" "Queue"="AlphaTest" }
        LOD 200
        Cull Off

        CGPROGRAM
        #pragma surface Surface Standard alphatest:_Cutoff fullforwardshadows addshadow
        #pragma target 3.0

        sampler2D _MainTex;
        half _Smoothness;

        struct Input {
            float2 uv_MainTex;
        };

        void Surface(Input input, inout SurfaceOutputStandard output) {
            // Contract atlas rectangles use top-left/v-down coordinates. Unity's imported PNG
            // sampler is bottom-left/v-up, so convert exactly once at the texture boundary.
            fixed4 atlas = tex2D(_MainTex, float2(input.uv_MainTex.x, 1.0 - input.uv_MainTex.y));
            output.Albedo = atlas.rgb;
            output.Metallic = 0.0;
            output.Smoothness = _Smoothness;
            output.Occlusion = 1.0;
            output.Alpha = atlas.a;
        }
        ENDCG
    }
    FallBack "Transparent/Cutout/VertexLit"
}

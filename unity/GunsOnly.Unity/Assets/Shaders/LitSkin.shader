Shader "GunsOnly/LitSkin"
{
    Properties
    {
        _Color ("Color", Color) = (0.32, 0.38, 0.28, 1)
        _SpecColor ("Specular", Color) = (0.15, 0.16, 0.14, 1)
        _Shininess ("Shininess", Range(0.01, 1)) = 0.12
        _Emission ("Emission", Color) = (0,0,0,1)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 200
        CGPROGRAM
        #pragma surface surf BlinnPhong fullforwardshadows
        #pragma target 3.0
        fixed4 _Color;
        half _Shininess;
        fixed4 _Emission;
        struct Input { float3 viewDir; };
        void surf(Input IN, inout SurfaceOutput o) {
            o.Albedo = _Color.rgb;
            o.Alpha = _Color.a;
            o.Gloss = 0.35;
            o.Specular = _Shininess;
            o.Emission = _Emission.rgb;
        }
        ENDCG
    }
    FallBack "Diffuse"
}

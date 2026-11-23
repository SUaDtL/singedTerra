Shader "SingedTerra/Combat Glow"
{
    Properties { [HDR] _BaseColor("Signal",Color)=(2,1.6,.8,1) }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent"}
        Pass
        {
            Blend SrcAlpha One, Zero One
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;half4 color:COLOR;float2 uv:TEXCOORD0;};
            struct V {float4 positionCS:SV_POSITION;half4 color:COLOR;float2 uv:TEXCOORD0;};
            V Vert(A v){V o;o.positionCS=TransformObjectToHClip(v.positionOS.xyz);o.color=v.color;o.uv=v.uv;return o;}
            half4 Frag(V v):SV_Target{half4 c=v.color*_BaseColor;c.a*=saturate((.5-abs(v.uv.y-.5))*3);return c;}
            ENDHLSL
        }
    }
}

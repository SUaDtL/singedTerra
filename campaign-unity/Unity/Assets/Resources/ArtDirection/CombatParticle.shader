Shader "SingedTerra/Combat Particle"
{
    Properties
    {
        _BaseMap("Particle atlas",2D)="white"{}
        [HDR] _BaseColor("Particle tint",Color)=(1,1,1,1)
        _Tile("Atlas tile",Vector)=(0,.5,.5,.5)
        _Spin("Local rotation",Float)=0
    }
    SubShader
    {
        Tags {"RenderPipeline"="UniversalPipeline" "RenderType"="Transparent" "Queue"="Transparent"}
        Pass
        {
            Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
            ZWrite Off
            Cull Off
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;float4 _Tile;float _Spin;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float2 uv:TEXCOORD0;};
            struct V {float4 positionCS:SV_POSITION;float2 uv:TEXCOORD0;};
            V Vert(A v){V o;o.positionCS=TransformObjectToHClip(v.positionOS.xyz);o.uv=v.uv;return o;}
            half4 Frag(V v):SV_Target
            {
                float2 p=v.uv-.5;float s=sin(_Spin),c=cos(_Spin);
                float2 uv=float2(c*p.x-s*p.y,s*p.x+c*p.y)+.5;
                half4 tex=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,clamp(uv,.005,.995)*_Tile.zw+_Tile.xy);
                // Soft containment prevents atlas-neighbour bleeding during rotation.
                float edge=saturate((.50-max(abs(uv.x-.5),abs(uv.y-.5)))*18);
                return half4(tex.rgb*_BaseColor.rgb,tex.a*_BaseColor.a*edge);
            }
            ENDHLSL
        }
    }
}

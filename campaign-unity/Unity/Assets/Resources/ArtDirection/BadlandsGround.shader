Shader "SingedTerra/Badlands Ground"
{
    Properties
    {
        _BaseMap("Authored battlefield",2D)="white"{}
        [HideInInspector] _MainTex("Legacy albedo binding",2D)="white"{}
        _DetailMap("Surrounding soil",2D)="gray"{}
        _BaseColor("Ground tint",Color)=(1,1,1,1)
        _Cull("Cull",Float)=2
        _Cutoff("Cutoff",Float)=.5
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"}
        Pass
        {
            Name "ForwardLit"
            Tags {"LightMode"="UniversalForward"}
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);
            TEXTURE2D(_DetailMap);SAMPLER(sampler_DetailMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;float4 _BaseMap_ST;float _Cull;float _Cutoff;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;float2 uv:TEXCOORD0;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;float3 normalWS:TEXCOORD1;float2 uv:TEXCOORD2;float fog:TEXCOORD3;};
            V Vert(A v)
            {
                V o;VertexPositionInputs p=GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS=p.positionCS;o.positionWS=p.positionWS;o.normalWS=TransformObjectToWorldNormal(v.normalOS);
                o.uv=TRANSFORM_TEX(v.uv,_BaseMap);o.fog=ComputeFogFactor(p.positionCS.z);return o;
            }
            half4 Frag(V v):SV_Target
            {
                half3 map=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,v.uv).rgb;
                half3 soil=SAMPLE_TEXTURE2D(_DetailMap,sampler_DetailMap,v.positionWS.xz*.20).rgb;
                // The authored map ends in the outer ruins. Blend back to soil
                // across its edge so wide cameras never reveal clamped stripes.
                float2 edge=min(v.uv,1-v.uv);
                float weight=smoothstep(0,.075,min(edge.x,edge.y));
                half3 albedo=lerp(soil*.76,map,weight)*_BaseColor.rgb;
                // Keep the authored roads and craters, but supply ground-scale
                // grit inside the map as well as at its boundary.
                half soilGrain=dot(soil,half3(.3,.5,.2));
                albedo*=lerp(1,clamp(soilGrain*7,.55,1.5),.36);
                half grain=dot(albedo,half3(.3,.5,.2))+soilGrain*.18;
                float3 normal=normalize(v.normalWS),dx=ddx(v.positionWS),dy=ddy(v.positionWS);
                float3 rx=cross(dy,normal),ry=cross(normal,dx);float determinant=dot(dx,rx);
                if(abs(determinant)>1e-10)
                    normal=normalize(abs(determinant)*normal-sign(determinant)*(ddx(grain)*rx+ddy(grain)*ry)*.25);
                InputData input=(InputData)0;input.positionWS=v.positionWS;input.normalWS=normal;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(v.positionWS);input.shadowCoord=TransformWorldToShadowCoord(v.positionWS);
                input.bakedGI=SampleSH(normal);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(v.positionCS);input.shadowMask=1;
                SurfaceData surface=(SurfaceData)0;surface.albedo=albedo;surface.alpha=1;
                surface.smoothness=.06;surface.normalTS=half3(0,0,1);surface.occlusion=1;
                half4 color=UniversalFragmentPBR(input,surface);color.rgb=MixFog(color.rgb,v.fog);return color;
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
        UsePass "Universal Render Pipeline/Lit/DepthNormals"
    }
}

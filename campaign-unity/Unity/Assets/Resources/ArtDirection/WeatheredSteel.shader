Shader "SingedTerra/Weathered Steel"
{
    Properties
    {
        _BaseMap("Weathered surface",2D)="white"{}
        _BaseColor("Paint",Color)=(1,1,1,1)
        _Metallic("Metal",Range(0,1))=.65
        _Smoothness("Smoothness",Range(0,1))=.32
        _SurfaceScale("Surface metres",Float)=.65
        _PanelMap("Service armor",2D)="white"{}
        _PanelStrength("Service armor detail",Range(0,1))=0
        _Cull("Cull",Float)=2
        _Cutoff("Cutoff",Float)=.5
        [HDR] _EmissionColor("Impact glow",Color)=(0,0,0,1)
    }
    SubShader
    {
        Tags {"RenderType"="Opaque" "RenderPipeline"="UniversalPipeline"}
        Pass
        {
            Name "ForwardLit"
            Tags {"LightMode"="UniversalForward"}
            Cull Back
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _MAIN_LIGHT_SHADOWS _MAIN_LIGHT_SHADOWS_CASCADE _MAIN_LIGHT_SHADOWS_SCREEN
            #pragma multi_compile _ _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _SHADOWS_SOFT _SHADOWS_SOFT_LOW _SHADOWS_SOFT_MEDIUM _SHADOWS_SOFT_HIGH
            #pragma multi_compile_fragment _ _SCREEN_SPACE_OCCLUSION
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
            TEXTURE2D(_BaseMap);SAMPLER(sampler_BaseMap);
            TEXTURE2D(_PanelMap);SAMPLER(sampler_PanelMap);
            CBUFFER_START(UnityPerMaterial)
                float4 _BaseColor;float4 _BaseMap_ST;float4 _EmissionColor;float _Metallic;float _Smoothness;float _SurfaceScale;float _Cull;float _Cutoff;float _PanelStrength;
            CBUFFER_END
            struct A {float4 positionOS:POSITION;float3 normalOS:NORMAL;float2 uv:TEXCOORD0;float2 detail:TEXCOORD2;};
            struct V {float4 positionCS:SV_POSITION;float3 positionWS:TEXCOORD0;float3 normalWS:TEXCOORD1;float fog:TEXCOORD2;float3 surfacePosition:TEXCOORD3;float3 surfaceNormal:TEXCOORD4;float4 panel:TEXCOORD5;};
            V Vert(A v)
            {
                V o;VertexPositionInputs p=GetVertexPositionInputs(v.positionOS.xyz);
                o.positionCS=p.positionCS;o.positionWS=p.positionWS;o.normalWS=TransformObjectToWorldNormal(v.normalOS);o.fog=ComputeFogFactor(p.positionCS.z);
                float3 scale=float3(length(unity_ObjectToWorld._m00_m10_m20),length(unity_ObjectToWorld._m01_m11_m21),length(unity_ObjectToWorld._m02_m12_m22));
                o.surfacePosition=v.positionOS.xyz*scale;o.surfaceNormal=v.normalOS;o.panel=float4(v.uv,v.detail);return o;
            }
            half4 Frag(V v):SV_Target
            {
                float3 normal=normalize(v.normalWS),weights=pow(abs(normalize(v.surfaceNormal)),4);weights/=dot(weights,float3(1,1,1));
                // Object-space projection stays fixed to armor while the turret turns.
                float3 p=v.surfacePosition*_SurfaceScale;
                half3 tex=SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,p.zy).rgb*weights.x+
                    SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,p.xz).rgb*weights.y+
                    SAMPLE_TEXTURE2D(_BaseMap,sampler_BaseMap,p.xy).rgb*weights.z;
                half panel=saturate(v.panel.z*_PanelStrength);
                half3 armor=SAMPLE_TEXTURE2D(_PanelMap,sampler_PanelMap,v.panel.xy).rgb;
                // The original cast hulls also carry service seams and chipped
                // panel edges. Use their local projection so the detail follows
                // every modular part and turret rotation without UV stretching.
                half3 castPanel=SAMPLE_TEXTURE2D(_PanelMap,sampler_PanelMap,p.zy).rgb*weights.x+
                    SAMPLE_TEXTURE2D(_PanelMap,sampler_PanelMap,p.xz).rgb*weights.y+
                    SAMPLE_TEXTURE2D(_PanelMap,sampler_PanelMap,p.xy).rgb*weights.z;
                tex=lerp(tex,castPanel*1.8,_PanelStrength*.72*(1-panel));
                tex=lerp(tex,armor*1.8,panel);
                half grain=dot(tex,half3(.3,.5,.2));
                // Surface-gradient bump keeps the weathering physically aligned
                // across imported UV seams and the added service hardware.
                float3 dx=ddx(v.positionWS),dy=ddy(v.positionWS);
                float3 rx=cross(dy,normal),ry=cross(normal,dx);float determinant=dot(dx,rx);
                if(abs(determinant)>1e-10)
                    normal=normalize(abs(determinant)*normal-sign(determinant)*
                        (ddx(grain)*rx+ddy(grain)*ry)*.07);
                // Keep the photographic texture's range. Clipping its highlights
                // erased the fine scratches and made every panel one flat color.
                half3 surfaceTone=lerp(grain.xxx,tex,.18);
                half chips=smoothstep(.15,.32,grain);
                half grime=1-smoothstep(.055,.19,grain);
                // The albedo sample is linear, not sRGB. A .35 lower clamp
                // flattened almost all of the dark photographic paint detail.
                half3 coating=_BaseColor.rgb*clamp(surfaceTone*5.5,.025,1.6);
                half3 exposed=half3(.30,.31,.28)*clamp(grain*2.8,.6,1.25);
                InputData input=(InputData)0;input.positionWS=v.positionWS;input.normalWS=normal;
                input.viewDirectionWS=GetWorldSpaceNormalizeViewDir(v.positionWS);input.shadowCoord=TransformWorldToShadowCoord(v.positionWS);
                input.bakedGI=SampleSH(normal);input.normalizedScreenSpaceUV=GetNormalizedScreenSpaceUV(v.positionCS);input.shadowMask=1;
                SurfaceData surface=(SurfaceData)0;
                surface.albedo=lerp(coating,exposed,chips*.48)*(1-grime*.20);surface.alpha=1;
                surface.albedo=lerp(surface.albedo,half3(.29,.28,.24),v.panel.w*.38*smoothstep(.11,.28,grain));
                surface.metallic=lerp(_Metallic,.85,chips*.65)*(1-grime*.7);
                surface.smoothness=saturate(_Smoothness+chips*.20-grime*.16);surface.normalTS=half3(0,0,1);
                surface.occlusion=1-grime*.15;surface.emission=_EmissionColor.rgb;
                half4 color=UniversalFragmentPBR(input,surface);color.rgb=MixFog(color.rgb,v.fog);return color;
            }
            ENDHLSL
        }
        UsePass "Universal Render Pipeline/Lit/ShadowCaster"
        UsePass "Universal Render Pipeline/Lit/DepthOnly"
        UsePass "Universal Render Pipeline/Lit/DepthNormals"
    }
}

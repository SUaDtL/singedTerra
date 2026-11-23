using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using SingedTerra.Art;
using SingedTerra.VisualReview;

// Explicit art-authoring operation. Normal player builds only consume these assets.
public static class LastStandConceptArtBuild
{
    const string Root="Assets/Resources/ArtDirection/";
    public static void Prepare()
    {
        AssetDatabase.Refresh();
        foreach(string name in new[]{"WeatheredArmor","AshTerrain","ServiceArmor"})
        {
            var importer=(TextureImporter)AssetImporter.GetAtPath(Root+name+".png");
            importer.wrapMode=TextureWrapMode.Repeat;importer.mipmapEnabled=true;importer.anisoLevel=8;
            importer.maxTextureSize=2048;importer.textureCompression=TextureImporterCompression.CompressedHQ;importer.SaveAndReimport();
        }
        var armor=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"WeatheredArmor.png");
        var earth=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"AshTerrain.png");
        var battlefield=AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"AshBattlefield.png");
        var particles=(TextureImporter)AssetImporter.GetAtPath(Root+"CombatParticles.png");
        particles.wrapMode=TextureWrapMode.Clamp;particles.mipmapEnabled=true;particles.alphaIsTransparency=true;
        particles.maxTextureSize=2048;particles.textureCompression=TextureImporterCompression.Uncompressed;particles.SaveAndReimport();
        foreach(string name in new[]{"IndustrialRuins","IndustrialRubble"})
        {
            var ruins=(TextureImporter)AssetImporter.GetAtPath(Root+name+".png");
            ruins.wrapMode=TextureWrapMode.Clamp;ruins.mipmapEnabled=true;ruins.alphaIsTransparency=true;ruins.anisoLevel=8;
            ruins.maxTextureSize=2048;ruins.textureCompression=TextureImporterCompression.CompressedHQ;ruins.SaveAndReimport();
        }
        if(battlefield)
        {
            var importer=(TextureImporter)AssetImporter.GetAtPath(Root+"AshBattlefield.png");
            importer.wrapMode=TextureWrapMode.Clamp;importer.mipmapEnabled=true;importer.anisoLevel=8;
            importer.maxTextureSize=4096;importer.textureCompression=TextureImporterCompression.CompressedHQ;importer.SaveAndReimport();
        }
        foreach(string path in AssetDatabase.FindAssets("t:Material",new[]{"Assets/SeedPack02/Generated/Materials"}).Select(AssetDatabase.GUIDToAssetPath))
        {
            var mat=AssetDatabase.LoadAssetAtPath<Material>(path);
            bool soil=mat.name=="ST2_Concrete"||mat.name=="ST2_Earth"||mat.name=="ST2_Sand";
            bool metal=mat.name=="ST2_Steel"||mat.name=="ST2_Edge"||mat.name=="ST2_Olive"||mat.name=="ST2_Oxide";
            if(!soil&&!metal)continue;mat.SetTexture("_BaseMap",soil?earth:armor);
            if(soil)mat.SetColor("_BaseColor",new Color(.65f,.62f,.55f));EditorUtility.SetDirty(mat);
        }
        foreach(string path in AssetDatabase.FindAssets("t:Material",new[]{"Assets/TankKits02/Materials","Assets/VisualReview/Materials"}).Select(AssetDatabase.GUIDToAssetPath))
        {
            var mat=AssetDatabase.LoadAssetAtPath<Material>(path);string name=mat.name;
            bool metal=name=="Armor"||name=="Steel"||name=="Edge"||name=="EnemyArmor"||name=="EnemyRanged"||name=="EnemyGunmetal";
            bool ground=name=="GroundAsh"||name=="GroundIron";
            if(!metal&&!ground)continue;
            mat.SetTexture("_BaseMap",ground?earth:armor);mat.SetTexture("_MainTex",ground?earth:armor);
            if(ground)
            {
                bool authoredMap=name=="GroundAsh"&&battlefield;
                if(authoredMap)
                {
                    mat.shader=Shader.Find("SingedTerra/Badlands Ground");
                    mat.SetTexture("_BaseMap",battlefield);mat.SetTexture("_DetailMap",earth);
                }
                // The continuous 256 m plane carries UVs -0.5..1.5, so one UV
                // unit covers 128 m. Fit the authored clearing to 80 m around
                // the real defence position rather than magnifying its centre.
                float scale=authoredMap?128f/80f:8f;
                var offset=authoredMap?Vector2.one*((1-scale)*.5f):Vector2.zero;
                mat.SetTextureScale("_BaseMap",Vector2.one*scale);mat.SetTextureScale("_MainTex",Vector2.one*scale);
                mat.SetTextureOffset("_BaseMap",offset);mat.SetTextureOffset("_MainTex",offset);
                mat.SetColor("_BaseColor",authoredMap?new Color(.90f,.91f,.94f):new Color(.55f,.57f,.54f));
            }
            else
            {
                mat.shader=Shader.Find("SingedTerra/Weathered Steel");
                mat.SetColor("_BaseColor",name=="Steel"||name=="EnemyGunmetal"?new Color(.25f,.25f,.23f):name=="Edge"?new Color(.65f,.60f,.43f):name.StartsWith("Enemy")?new Color(.42f,.36f,.25f):Color.white);
                mat.SetTexture("_PanelMap",AssetDatabase.LoadAssetAtPath<Texture2D>(Root+"ServiceArmor.png"));
                mat.SetFloat("_PanelStrength",name=="Armor"||name=="EnemyArmor"||name=="EnemyRanged"?1:0);
                mat.SetFloat("_Smoothness",name=="Edge"?.35f:.32f);mat.SetFloat("_Metallic",name=="Armor"?.45f:.75f);mat.SetFloat("_SurfaceScale",.48f);
            }
            EditorUtility.SetDirty(mat);
        }
        var scene=EditorSceneManager.OpenScene(LastStandLoopBuild.ScenePath,OpenSceneMode.Single);
        const string reflectionPath=Root+"HangarReflection.exr";
        if(!File.Exists(reflectionPath))
        {
            var oldSky=RenderSettings.skybox;var sky=new Material(Shader.Find("Skybox/Panoramic"));
            sky.SetTexture("_MainTex",AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Resources/EquipmentBay/Hangar.png"));sky.SetFloat("_Exposure",1.0f);
            RenderSettings.skybox=sky;var probe=new GameObject("Temporary hangar reflection capture").AddComponent<ReflectionProbe>();
            probe.mode=ReflectionProbeMode.Baked;probe.resolution=128;probe.cullingMask=0;probe.clearFlags=ReflectionProbeClearFlags.Skybox;
            if(!Lightmapping.BakeReflectionProbe(probe,reflectionPath))throw new InvalidOperationException("Reflection capture failed");
            UnityEngine.Object.DestroyImmediate(probe.gameObject);RenderSettings.skybox=oldSky;UnityEngine.Object.DestroyImmediate(sky);AssetDatabase.Refresh();
        }
        var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();var review=art.GetComponent<BattlefieldReview>();
        var pipeline=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(Root+"ConceptPipeline.asset");
        if(!pipeline)
        {
            pipeline=UnityEngine.Object.Instantiate((UniversalRenderPipelineAsset)review.reviewPipeline);pipeline.name="ConceptPipeline";
            var data=new SerializedObject(pipeline);var renderers=data.FindProperty("m_RendererDataList");
            var renderer=UnityEngine.Object.Instantiate((ScriptableRendererData)renderers.GetArrayElementAtIndex(0).objectReferenceValue);
            renderer.name="ConceptRenderer";AssetDatabase.CreateAsset(renderer,Root+"ConceptRenderer.asset");
            var ao=ScriptableObject.CreateInstance<ScreenSpaceAmbientOcclusion>();ao.name="Contact occlusion";
            AssetDatabase.AddObjectToAsset(ao,renderer);renderer.rendererFeatures.Add(ao);
            var settings=new SerializedObject(ao);settings.FindProperty("m_Settings.Intensity").floatValue=1.45f;
            settings.FindProperty("m_Settings.Radius").floatValue=.32f;settings.FindProperty("m_Settings.DirectLightingStrength").floatValue=.25f;
            settings.FindProperty("m_Settings.Downsample").boolValue=true;settings.ApplyModifiedPropertiesWithoutUndo();
            renderers.GetArrayElementAtIndex(0).objectReferenceValue=renderer;data.ApplyModifiedPropertiesWithoutUndo();
            pipeline.supportsHDR=true;pipeline.msaaSampleCount=4;pipeline.shadowDistance=100;
            AssetDatabase.CreateAsset(pipeline,Root+"ConceptPipeline.asset");EditorUtility.SetDirty(renderer);
        }
        // The tactical camera sits 75 m from the tank. Cover the far perimeter
        // as well, rather than fading its shadows at the old 100 m limit.
        pipeline.shadowDistance=180;EditorUtility.SetDirty(pipeline);
        // The retained review renderer intentionally had no post-process data.
        // A Volume alone cannot enable grading or bloom without these resources.
        var pipelineSettings=new SerializedObject(pipeline);
        pipelineSettings.FindProperty("m_AllowPostProcessAlphaOutput").boolValue=true;
        pipelineSettings.ApplyModifiedPropertiesWithoutUndo();
        var conceptRenderer=AssetDatabase.LoadAssetAtPath<UniversalRendererData>(Root+"ConceptRenderer.asset");
        conceptRenderer.postProcessData=AssetDatabase.LoadAssetAtPath<PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
        if(!conceptRenderer.postProcessData)throw new InvalidOperationException("Concept renderer has no post-process resources");
        EditorUtility.SetDirty(conceptRenderer);
        review.reviewPipeline=pipeline;
        var profile=AssetDatabase.LoadAssetAtPath<VolumeProfile>(Root+"ConceptGrade.asset");
        if(!profile)
        {
            profile=ScriptableObject.CreateInstance<VolumeProfile>();AssetDatabase.CreateAsset(profile,Root+"ConceptGrade.asset");
            var tone=profile.Add<Tonemapping>(true);tone.mode.Override(TonemappingMode.Neutral);
            var grade=profile.Add<ColorAdjustments>(true);grade.contrast.Override(12);grade.saturation.Override(-12);grade.postExposure.Override(.3f);
            var bloom=profile.Add<Bloom>(true);bloom.intensity.Override(.35f);bloom.threshold.Override(1.3f);bloom.scatter.Override(.55f);
            var vignette=profile.Add<Vignette>(true);vignette.intensity.Override(.14f);vignette.smoothness.Override(.5f);
            foreach(var component in profile.components)AssetDatabase.AddObjectToAsset(component,profile);
        }
        var volume=UnityEngine.Object.FindObjectsByType<Volume>(FindObjectsSortMode.None).FirstOrDefault(v=>v.name=="Concept lighting");
        if(!volume)volume=new GameObject("Concept lighting").AddComponent<Volume>();volume.isGlobal=true;volume.sharedProfile=profile;
        // Keep alpha in the equipment-bay render target: camera post processing is
        // toggled by its presentation owner while compositing the live tank.
        art.view.GetUniversalAdditionalCameraData().renderPostProcessing=true;
        EditorUtility.SetDirty(review);EditorUtility.SetDirty(profile);EditorSceneManager.MarkSceneDirty(scene);
        EditorSceneManager.SaveScene(scene);AssetDatabase.SaveAssets();
        Debug.Log("ST_CONCEPT_ART_PREPARED");
    }
}

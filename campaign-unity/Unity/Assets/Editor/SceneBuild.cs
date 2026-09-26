using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEditor.Build.Reporting;
using SingedTerra.Art;
public static class SceneBuild
{
    const string ScenePath="Assets/Scenes/FieldAssembly.unity";
    static readonly Dictionary<string,Material> Mats=new Dictionary<string,Material>();
    static void Material(string name,Color color,float metal,float rough,string texture=null)
    {
        string path="Assets/Materials/"+name+".mat";
        var m=AssetDatabase.LoadAssetAtPath<Material>(path);
        if(!m){m=new Material(Shader.Find("Universal Render Pipeline/Lit"));AssetDatabase.CreateAsset(m,path);}
        m.SetColor("_BaseColor",color);m.SetFloat("_Metallic",metal);m.SetFloat("_Smoothness",1-rough);
        m.enableInstancing=true;
        if(texture!=null){m.SetTexture("_BaseMap",AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Art/"+texture+".png"));m.SetColor("_BaseColor",Color.white);}
        EditorUtility.SetDirty(m);Mats[name]=m;
    }
    static Transform Find(Transform root,string name)
    {
        var t=root.GetComponentsInChildren<Transform>(true).FirstOrDefault(x=>x.name==name);
        if(!t)throw new Exception("Missing authored part "+name);return t;
    }
    static void ConfigureImports()
    {
        foreach(var path in new[]{"Assets/Art/StarterTank_A.fbx","Assets/Art/Clearing_A.fbx"})
        {
            var importer=AssetImporter.GetAtPath(path) as ModelImporter;
            if(!importer)throw new Exception("Missing model importer: "+path);
            importer.importAnimation=false;importer.importCameras=false;importer.importLights=false;
            importer.globalScale=1;importer.isReadable=false;
            importer.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;
            importer.SaveAndReimport();
        }
    }
    static GameObject Model(string path,string name)
    {
        var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);
        if(!source)throw new Exception("Missing model asset: "+path);
        var model=(GameObject)PrefabUtility.InstantiatePrefab(source);model.name=name;
        foreach(var renderer in model.GetComponentsInChildren<Renderer>(true))
        {
            var mapped=renderer.sharedMaterials;
            for(int i=0;i<mapped.Length;i++)
            {
                string key=mapped[i]?mapped[i].name:"";
                if(!Mats.TryGetValue(key,out var material))throw new Exception("Unmapped material: "+key);
                mapped[i]=material;
            }
            renderer.sharedMaterials=mapped;
        }
        return model;
    }
    static void ConfigureMaterials()
    {
        Material("Armor",new Color(.34f,.32f,.21f),.5f,.65f,"Armor_BaseColor");
        Material("Edge",new Color(.21f,.23f,.20f),.65f,.5f);
        Material("Steel",new Color(.13f,.145f,.14f),.75f,.5f);
        Material("Rubber",new Color(.045f,.052f,.048f),.1f,.85f);
        Material("Brass",new Color(.57f,.34f,.12f),.65f,.5f);
        Material("Marking",new Color(.73f,.67f,.47f),.1f,.8f);
        Material("Optic",new Color(.08f,.27f,.29f),.5f,.25f);
        Material("Earth",new Color(.22f,.18f,.135f),0,.95f,"Earth_BaseColor");
        Material("Concrete",new Color(.29f,.28f,.25f),0,.9f);
        Material("Wood",new Color(.23f,.13f,.065f),0,.9f);
        Material("Soot",new Color(.07f,.065f,.055f),0,1);
    }
    [MenuItem("singedTerra/Prepare starter art scene")]
    public static void Prepare()
    {
        if(File.Exists(ScenePath))throw new Exception("Saved scene exists; edit it directly instead of regenerating it");
        if(Application.unityVersion!="6000.3.24f1")throw new Exception("Unexpected editor version");
        foreach(var folder in new[]{"Assets/Materials","Assets/Prefabs","Assets/Scenes"})Directory.CreateDirectory(folder);
        AssetDatabase.Refresh();ConfigureImports();ConfigureMaterials();ConfigurePipeline();
        var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        var tank=Model("Assets/Art/StarterTank_A.fbx","StarterTank");
        var clearing=Model("Assets/Art/Clearing_A.fbx","Clearing");
        var camera=new GameObject("InspectionCamera",typeof(Camera)).GetComponent<Camera>();
        camera.tag="MainCamera";camera.fieldOfView=43;camera.nearClipPlane=.1f;camera.farClipPlane=120;
        camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.10f,.105f,.095f);
        var sun=new GameObject("AfternoonKey",typeof(Light)).GetComponent<Light>();
        sun.type=LightType.Directional;sun.intensity=1.65f;sun.color=new Color(1,.91f,.76f);
        sun.shadows=LightShadows.Soft;sun.transform.rotation=Quaternion.Euler(48,-35,0);
        RenderSettings.ambientMode=AmbientMode.Trilight;
        RenderSettings.ambientSkyColor=new Color(.50f,.53f,.56f);
        RenderSettings.ambientEquatorColor=new Color(.31f,.29f,.24f);
        RenderSettings.ambientGroundColor=new Color(.16f,.14f,.12f);
        RenderSettings.sun=sun;
        var p=new GameObject("ArtPresentation").AddComponent<TankPresentation>();
        p.tank=tank.transform;p.turret=Find(tank.transform,"TurretYaw");
        p.barrel=Find(tank.transform,"BarrelRecoil");p.view=camera;
        p.repairModule=Find(tank.transform,"Attachment_Repair").gameObject;
        p.launcherModule=Find(tank.transform,"Attachment_Launcher").gameObject;
        p.launcherModule.SetActive(false);p.repairModule.SetActive(true);
        var barrelRenderers=p.barrel.GetComponentsInChildren<Renderer>(true);
        if(barrelRenderers.Length==0)throw new Exception("Barrel has no renderers");
        var barrelBounds=barrelRenderers[0].bounds;
        foreach(var r in barrelRenderers)barrelBounds.Encapsulate(r.bounds);
        Vector3 direction=(barrelBounds.center-p.barrel.position).normalized;
        float reach=Vector3.Dot(new Vector3(Mathf.Abs(direction.x),Mathf.Abs(direction.y),Mathf.Abs(direction.z)),barrelBounds.extents);
        p.muzzle=new GameObject("MuzzleMarker").transform;p.muzzle.SetParent(p.barrel,true);
        p.muzzle.position=barrelBounds.center+direction*reach;
        p.flash=GameObject.CreatePrimitive(PrimitiveType.Sphere);p.flash.name="MuzzlePreview";
        UnityEngine.Object.DestroyImmediate(p.flash.GetComponent<Collider>());
        p.flash.transform.SetParent(p.muzzle,false);p.flash.transform.localScale=Vector3.one*.35f;
        p.flash.GetComponent<Renderer>().sharedMaterial=Mats["Brass"];p.flash.SetActive(false);
        PrefabUtility.SaveAsPrefabAssetAndConnect(tank,"Assets/Prefabs/StarterTank.prefab",InteractionMode.AutomatedAction);
        PrefabUtility.SaveAsPrefabAssetAndConnect(clearing,"Assets/Prefabs/Clearing.prefab",InteractionMode.AutomatedAction);
        p.gameObject.AddComponent<ArtHud>().presentation=p;
        camera.transform.position=new Vector3(8.8f,6.7f,10.8f);camera.transform.LookAt(new Vector3(0,1.35f,0));
        EditorSceneManager.SaveScene(scene,ScenePath);AssetDatabase.SaveAssets();
        Validate();Debug.Log("ST_ART_PREPARED "+ScenePath);
    }
    static void ConfigurePipeline()
    {
        const string rp="Assets/Materials/ArtRenderer.asset",pp="Assets/Materials/ArtPipeline.asset";
        var renderer=AssetDatabase.LoadAssetAtPath<UniversalRendererData>(rp);
        if(!renderer){renderer=ScriptableObject.CreateInstance<UniversalRendererData>();AssetDatabase.CreateAsset(renderer,rp);}
        var pipeline=AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(pp);
        if(!pipeline){pipeline=UniversalRenderPipelineAsset.Create(renderer);AssetDatabase.CreateAsset(pipeline,pp);}
        pipeline.renderScale=1;pipeline.msaaSampleCount=2;pipeline.supportsHDR=false;pipeline.shadowDistance=45;
        GraphicsSettings.defaultRenderPipeline=pipeline;QualitySettings.renderPipeline=pipeline;
        QualitySettings.vSyncCount=0;PlayerSettings.colorSpace=ColorSpace.Linear;
        PlayerSettings.companyName="singedTerra";PlayerSettings.productName="Starter Tank - Art Slice";
        PlayerSettings.defaultScreenWidth=1600;PlayerSettings.defaultScreenHeight=900;
        EditorUtility.SetDirty(pipeline);
    }
    public static void Validate()
    {
        var p=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        if(!p)throw new Exception("Presentation missing from scene");
        if(!p.turret.IsChildOf(p.tank)||!p.barrel.IsChildOf(p.turret))throw new Exception("Broken articulated hierarchy");
        if(!p.muzzle.IsChildOf(p.barrel)||!p.flash)throw new Exception("Muzzle preview is not barrel-owned");
        if(p.repairModule==p.launcherModule||!p.repairModule.activeSelf||p.launcherModule.activeSelf)throw new Exception("Bad initial attachment visibility");
        var rr=p.tank.GetComponentsInChildren<Renderer>(true);var bounds=rr[0].bounds;
        foreach(var r in rr){bounds.Encapsulate(r.bounds);foreach(var m in r.sharedMaterials)if(!m||m.shader.name!="Universal Render Pipeline/Lit")throw new Exception("Invalid material on "+r.name);}
        if(bounds.size.x<2||bounds.size.x>15||bounds.size.y>6||bounds.size.z>15)throw new Exception("Unexpected tank units or axes: "+bounds);
        if(!AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/StarterTank.prefab"))throw new Exception("Prefab missing");
        if(!File.Exists(ScenePath))throw new Exception("Scene missing");
        Debug.Log("ST_ART_VALIDATE_PASS hierarchy/materials/visibility/prefab/scale; bounds="+bounds);
        foreach(var t in new[]{p.tank,p.turret,p.barrel,p.muzzle})Debug.Log("ST_ART_TRANSFORM "+t.name+" position="+t.position+" rotation="+t.rotation.eulerAngles+" scale="+t.lossyScale);
    }
    public static void BuildWeb()
    {
        if(!BuildPipeline.IsBuildTargetSupported(BuildTargetGroup.WebGL,BuildTarget.WebGL))throw new Exception("Pinned Web Build Support missing");
        if(Application.unityVersion!="6000.3.24f1")throw new Exception("Unexpected editor version");
        EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
        Validate();EncounterChecks.Run();
        string output=Environment.GetEnvironmentVariable("ST_ART_WEB_OUTPUT");
        if(string.IsNullOrWhiteSpace(output))throw new Exception("Set ST_ART_WEB_OUTPUT to a fresh absolute output directory");
        output=Path.GetFullPath(output);
        if(Directory.Exists(output))throw new Exception("Refusing to replace an existing build directory");
        PlayerSettings.WebGL.compressionFormat=WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback=false;
        var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{scenes=new[]{ScenePath},locationPathName=output,target=BuildTarget.WebGL,options=BuildOptions.Development});
        if(report.summary.result!=BuildResult.Succeeded)throw new Exception("Web build failed: "+report.summary.result);
        if(!File.Exists(Path.Combine(output,"index.html"))||!Directory.GetFiles(output,"*.wasm",SearchOption.AllDirectories).Any())throw new Exception("Missing Web output");
        Debug.Log("ST_ART_WEB_BUILD_PASS bytes="+report.summary.totalSize+" path="+output);
    }
}

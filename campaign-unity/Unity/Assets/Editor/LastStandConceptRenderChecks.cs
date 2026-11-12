using System;
using System.IO;
using System.Reflection;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.LastStand;

// Live Play Mode rendering with in-memory stores. These are editor renders,
// explicitly separate from native screenshots and physical-input evidence.
[InitializeOnLoad]
public static class LastStandConceptRenderChecks
{
    const string Key="ST_CONCEPT_EDITOR_RENDER";
    const string InterfaceKey="ST_CONCEPT_INTERFACE_RENDER";
    const string GroundingKey="ST_CONCEPT_GROUNDING_RENDER";
    static readonly string[] surfaces={"menu","settings-audio","settings-display","settings-guidance","settings-save","help","milestones","about","research","appearance","history","planner","upgrades"};
    static int surfaceIndex;
    static double deadline,stageTime;
    static int stage,frames;
    static bool impactCaptured;
    static LastStandLoopController loop;
    static TankPresentation art;
    static Canvas canvas;
    static Camera ui;
    static RenderTexture output;
    static RenderTexture worldFrame;
    static LastStandConceptRenderChecks(){if(SessionState.GetBool(Key,false))Arm();}
    static void Arm()
    {
        var game=new LastStandAppearanceChecks.Storage();var preferences=new LastStandAppearanceChecks.Storage();
        LastStandLoopController.StorageFactory=()=>game;LastStandLoopController.PreferencesStorageFactory=()=>preferences;
        EditorApplication.update-=Update;EditorApplication.update+=Update;deadline=EditorApplication.timeSinceStartup+160;
    }
    public static void Run()
    {
        SessionState.SetBool(Key,true);Arm();EditorSceneManager.OpenScene(LastStandLoopBuild.ScenePath,OpenSceneMode.Single);
        EditorApplication.isPlaying=true;
    }
    public static void RunInterface(){SessionState.SetBool(InterfaceKey,true);Run();}
    public static void RunGrounding(){SessionState.SetBool(GroundingKey,true);Run();}
    static void ShowSurface()
    {
        if(surfaces[surfaceIndex]=="upgrades"){loop.CloseMenu();canvas.GetComponentsInChildren<Button>(true).Single(b=>b.name=="ShopEntry").onClick.Invoke();return;}
        if(surfaceIndex>=1&&surfaceIndex<=4)
        {loop.OpenMenu("settings");canvas.GetComponentsInChildren<Button>(true).Single(b=>b.name=="SettingsTab"+(surfaceIndex-1)).onClick.Invoke();}
        else loop.OpenMenu(surfaces[surfaceIndex]);
    }
    static void BeginBattle()
    {
        var shopClose=canvas.GetComponentsInChildren<Button>().FirstOrDefault(b=>b.name=="ShopClose");if(shopClose)shopClose.onClick.Invoke();
        loop.CloseMenu();loop.Deploy();
        worldFrame=new RenderTexture(1600,900,24,RenderTextureFormat.ARGB32);worldFrame.Create();
        var background=new GameObject("Rendered battlefield",typeof(RectTransform),typeof(RawImage)).GetComponent<RawImage>();
        background.transform.SetParent(canvas.transform,false);background.transform.SetAsFirstSibling();background.gameObject.layer=5;
        background.texture=worldFrame;background.raycastTarget=false;background.rectTransform.anchorMin=Vector2.zero;
        background.rectTransform.anchorMax=Vector2.one;background.rectTransform.offsetMin=background.rectTransform.offsetMax=Vector2.zero;
        stage=3;stageTime=EditorApplication.timeSinceStartup;frames=0;
    }
    static void Update()
    {
        try
        {
            if(EditorApplication.timeSinceStartup>deadline)throw new InvalidOperationException("Concept render deadline");
            if(!Application.isPlaying||++frames<12)return;
            if(stage==0)
            {
                loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();if(!loop||loop.Progression==null)return;
                art=loop.GetComponent<TankPresentation>();canvas=UnityEngine.Object.FindFirstObjectByType<Canvas>();
                output=new RenderTexture(1600,900,24,RenderTextureFormat.ARGB32);output.Create();
                ui=new GameObject("Concept render UI camera").AddComponent<Camera>();ui.cullingMask=1<<5;ui.clearFlags=CameraClearFlags.Depth;
                ui.targetTexture=output;ui.nearClipPlane=.1f;ui.farClipPlane=10;ui.enabled=false;
                canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=ui;canvas.planeDistance=1;
                canvas.GetComponent<CanvasScaler>().enabled=false;canvas.scaleFactor=1.25f;
                foreach(var t in canvas.GetComponentsInChildren<Transform>(true))t.gameObject.layer=5;
                art.view.cullingMask&=~(1<<5);art.view.enabled=true;
                typeof(SingedTerra.Encounter.EncounterSession).GetMethod("OnApplicationFocus",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(loop.Session,new object[]{true});
                loop.RefreshControls();stage=1;stageTime=EditorApplication.timeSinceStartup;frames=0;return;
            }
            if(stage==1&&EditorApplication.timeSinceStartup-stageTime>2)
            {Capture("equipment-bay");loop.OpenArmory();stage=2;stageTime=EditorApplication.timeSinceStartup;frames=0;return;}
            if(stage==2&&EditorApplication.timeSinceStartup-stageTime>2)
            {
                Capture("armory");loop.CancelArmory();
                if(SessionState.GetBool(GroundingKey,false))
                {loop.OpenArmory();art.OrbitRight();stage=20;stageTime=EditorApplication.timeSinceStartup;return;}
                if(SessionState.GetBool(InterfaceKey,false)){stage=10;surfaceIndex=0;ShowSurface();stageTime=EditorApplication.timeSinceStartup;return;}
                BeginBattle();return;
            }
            if(stage==20&&EditorApplication.timeSinceStartup-stageTime>2)
            {
                Capture("armory-orbit");SessionState.SetBool(Key,false);SessionState.SetBool(GroundingKey,false);
                Debug.Log("ST_CONCEPT_GROUNDING_RENDER_PASS");EditorApplication.Exit(0);return;
            }
            if(stage==10&&EditorApplication.timeSinceStartup-stageTime>1)
            {
                Capture(surfaces[surfaceIndex]);surfaceIndex++;
                if(surfaceIndex<surfaces.Length){ShowSurface();stageTime=EditorApplication.timeSinceStartup;}else BeginBattle();
                return;
            }
            if(stage==3&&!impactCaptured&&EditorApplication.timeSinceStartup-stageTime>18&&loop.Session.Model.Events.Any(e=>e.Killed))
            {Capture("combat-impact");impactCaptured=true;}
            if(stage==3&&EditorApplication.timeSinceStartup-stageTime>35)
            {
                Capture("gameplay");
                if(SessionState.GetBool(InterfaceKey,false)){loop.OpenMenu();Capture("pause-menu");}
                SessionState.SetBool(Key,false);SessionState.SetBool(InterfaceKey,false);Debug.Log("ST_CONCEPT_EDITOR_RENDER_PASS");EditorApplication.Exit(0);
            }
        }
        catch(Exception error){SessionState.SetBool(Key,false);Debug.LogException(error);EditorApplication.Exit(1);}
    }
    static void Capture(string name)
    {
        art.view.enabled=true;loop.RefreshControls();Canvas.ForceUpdateCanvases();
        foreach(var callout in canvas.GetComponentsInChildren<LastStandFittingCallout>())callout.RefreshGroup();
        Canvas.ForceUpdateCanvases();
        // The bay owns its transparent tank target; gameplay renders directly
        // into the frame before the same live Canvas is composited over it.
        if(loop.Session.Model!=null)art.view.targetTexture=worldFrame;
        art.view.Render();
        if(name=="equipment-bay")
        {
            var contact=canvas.GetComponentsInChildren<Graphic>().Single(g=>g.name=="TankContactShadow");
            var feet=art.TankVisuals.PartRenderers(LastStandTankPartSlot.Treads).Where(r=>r.enabled&&r.gameObject.activeInHierarchy).ToArray();
            foreach(var foot in feet)Debug.Log("ST_BAY_FOOT "+foot.name+" "+foot.bounds+" viewport="+art.view.WorldToViewportPoint(new Vector3(foot.bounds.center.x,foot.bounds.min.y,foot.bounds.center.z)));
            Debug.Log("ST_BAY_CONTACT active="+contact.isActiveAndEnabled+" cull="+contact.canvasRenderer.cull+" rect="+contact.rectTransform.rect+" camera="+art.view.transform.position+" pitch="+art.view.transform.eulerAngles+" fov="+art.view.fieldOfView);
            foreach(var mesh in art.tank.GetComponentsInChildren<MeshFilter>().Where(m=>m.name=="Armor fittings"))
            {
                var mat=mesh.GetComponent<Renderer>().sharedMaterial;
                Debug.Log("ST_ARMOR_DETAIL "+mesh.transform.parent.name+" shader="+mat.shader.name+" panel="+mat.GetTexture("_PanelMap")+
                    " strength="+mat.GetFloat("_PanelStrength")+" uv3="+string.Join(",",mesh.sharedMesh.uv3.Take(3))+" uv="+string.Join(",",mesh.sharedMesh.uv.Take(3)));
            }
        }
        if(name=="combat-impact")
            foreach(var r in UnityEngine.Object.FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None).Where(r=>r.name.StartsWith("Review feedback ")).TakeLast(8))
                Debug.Log("ST_EFFECT_DETAIL "+r.sharedMaterial.name+" bounds="+r.bounds+" scale="+r.transform.lossyScale+" mesh="+r.GetComponent<MeshFilter>().sharedMesh.bounds);
        if(name=="gameplay")
        {
            var pipeline=(UnityEngine.Rendering.Universal.UniversalRenderPipelineAsset)UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
            Debug.Log("ST_CONCEPT_LIGHT camera="+art.view.transform.position+" shadowDistance="+pipeline.shadowDistance+" active="+pipeline.name+
                " shadowParams="+Shader.GetGlobalVector("_MainLightShadowParams")+" far="+art.view.farClipPlane+
                " keywords="+string.Join(",",Shader.enabledGlobalKeywords));
            foreach(var light in UnityEngine.Object.FindObjectsByType<Light>(FindObjectsSortMode.None))
                Debug.Log("ST_CONCEPT_LIGHT "+light.name+" enabled="+light.enabled+" intensity="+light.intensity+" shadows="+light.shadows+" sun="+(light==RenderSettings.sun));
        }
        ui.Render();
        var old=RenderTexture.active;RenderTexture.active=output;
        var pixels=new Texture2D(1600,900,TextureFormat.RGB24,false);pixels.ReadPixels(new Rect(0,0,1600,900),0,0);pixels.Apply();
        string suffix=Environment.GetEnvironmentVariable("ST_BAY_RENDER_FOLDER")??(SessionState.GetBool(GroundingKey,false)?"grounding-renders":
            (SessionState.GetBool(InterfaceKey,false)?"interface-renders":"editor-renders"));
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Evidence/equipment-bay/"+suffix));Directory.CreateDirectory(folder);
        File.WriteAllBytes(Path.Combine(folder,name+".png"),pixels.EncodeToPNG());UnityEngine.Object.Destroy(pixels);RenderTexture.active=old;
        if(name=="equipment-bay"&&SessionState.GetBool(GroundingKey,false))
        {
            var raw=art.view.targetTexture;RenderTexture.active=raw;
            var rgba=new Texture2D(raw.width,raw.height,TextureFormat.RGBA32,false);rgba.ReadPixels(new Rect(0,0,raw.width,raw.height),0,0);rgba.Apply();
            File.WriteAllBytes(Path.Combine(folder,"live-tank-alpha.png"),rgba.EncodeToPNG());UnityEngine.Object.Destroy(rgba);RenderTexture.active=old;
        }
        Debug.Log("ST_CONCEPT_EDITOR_RENDER "+name+" phase="+loop.Phase+" wave="+(loop.Session.Model?.Wave??0));
    }
}

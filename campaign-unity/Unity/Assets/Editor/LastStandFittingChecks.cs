using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Real imported meshes, cameras and Canvas transforms; no rendered-art claim.
public static class LastStandFittingChecks
{
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    sealed class Storage : ILastStandStorage
    {
        string value;
        public string Read()=>value;
        public void Write(string next) { value=next; }
    }
    sealed class Fixture : IDisposable
    {
        public TankPresentation Art;
        public LastStandLoopController Loop;
        public LastStandLoopHud Hud;
        public Canvas Canvas;
        public LastStandFittingCallout Callout;
        RenderTexture texture;
        public Fixture(int width=1366,int height=768)
        {
            LastStandLoopController.StorageFactory=()=>new Storage();
            LastStandLoopController.PreferencesStorageFactory=()=>new Storage();
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
            Art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art.GetComponent<BattlefieldReview>(),"Awake");
            Invoke(Art,"Start");Invoke(Art.GetComponent<ArtHud>(),"Start");
            Loop=Art.GetComponent<LastStandLoopController>();
            typeof(EncounterSession).GetField("focused",Private).SetValue(Loop.Session,true);
            Hud=(LastStandLoopHud)typeof(LastStandLoopController).GetField("hud",Private).GetValue(Loop);
            Canvas=UnityEngine.Object.FindFirstObjectByType<Canvas>();
            Canvas.renderMode=RenderMode.ScreenSpaceCamera;Canvas.worldCamera=Art.view;Canvas.planeDistance=1;
            Canvas.GetComponent<CanvasScaler>().enabled=false;Canvas.scaleFactor=1.7f;
            Resize(width,height);Callout=Canvas.GetComponentInChildren<LastStandFittingCallout>(true);
            Need(Callout,"HUD owns its actual fitting callout");
        }
        public void Refresh()
        {
            UnityEngine.Canvas.ForceUpdateCanvases();Hud.Refresh();
            // SetGarageFraming may move the world camera. Reanchor only this
            // batch fixture's camera Canvas, retaining an independent UI camera.
            var ui=Canvas.worldCamera;Canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            Canvas.renderMode=RenderMode.ScreenSpaceCamera;Canvas.worldCamera=ui;
            UnityEngine.Canvas.ForceUpdateCanvases();Hud.Refresh();UnityEngine.Canvas.ForceUpdateCanvases();
        }
        public void Resize(int width,int height)
        {
            Art.view.targetTexture=null;if(texture)UnityEngine.Object.DestroyImmediate(texture);
            texture=new RenderTexture(width,height,16);Art.view.targetTexture=texture;
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;Canvas.renderMode=RenderMode.ScreenSpaceCamera;Canvas.worldCamera=Art.view;
            Refresh();
        }
        public void Dispose()
        {
            Art.view.targetTexture=null;UnityEngine.Object.DestroyImmediate(texture);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
    static void Need(bool condition,string message) { if(!condition)throw new InvalidOperationException(message); }
    static void Invoke(object target,string method) { target.GetType().GetMethod(method,Private).Invoke(target,null); }
    static Bounds Bounds(GameObject module)
    {
        var meshes=module.GetComponentsInChildren<Renderer>();Need(meshes.Length>0,"authored module meshes exist");
        var bounds=meshes[0].bounds;foreach(var mesh in meshes)bounds.Encapsulate(mesh.bounds);return bounds;
    }
    static void Attached(Fixture f)
    {
        f.Callout.Refresh(true);Need(f.Callout.Visible,"visible active fitting has a leader");
        var module=f.Art.ActiveFittingModule;
        Need(f.Callout.TargetName==module.name,"leader follows exact active module identity");
        var expected=f.Art.view.WorldToScreenPoint(Bounds(module).center);
        var ui=f.Canvas.renderMode==RenderMode.ScreenSpaceOverlay?null:f.Canvas.worldCamera;
        var actual=RectTransformUtility.WorldToScreenPoint(ui,f.Callout.Endpoint.position);
        Need(Vector2.Distance(actual,expected)<.3f,"actual UI endpoint agrees with independent world projection");
        Need(Vector3.Distance(f.Callout.AnchorWorld,Bounds(module).center)<.001f,"endpoint anchors module bounds, not tank centre");
        foreach(var graphic in f.Callout.GetComponentsInChildren<Graphic>(true))
            if(graphic.transform.IsChildOf(f.Callout.transform.Find("FittingModuleCallout")))Need(!graphic.raycastTarget,"decoration never intercepts input");
    }
    static void BothModulesAndProfiles()
    {
        foreach(var size in new[]{new Vector2Int(1366,768),new Vector2Int(1920,1080),new Vector2Int(390,688),new Vector2Int(844,266),new Vector2Int(720,516)})
        using(var f=new Fixture(size.x,size.y))
        {
            Attached(f);f.Art.TrySelectFitting("launcher");f.Refresh();Attached(f);
            f.Art.TrySelectFitting("repair");f.Refresh();Attached(f);
        }
    }
    static void HeroFramingAndInvalidInput()
    {
        foreach(var size in new[]{new Vector2Int(1366,768),new Vector2Int(390,688),new Vector2Int(844,266)})
        using(var f=new Fixture(size.x,size.y))
        {
            var projection=LastStandHudLayout.Project(size.x,size.y,"garage",new[]{"Deploy","ShopEntry","Menu","TierPrevious","TierNext","FittingPrevious","FittingNext"});
            LastStandHudLayout.Bounds open=default(LastStandHudLayout.Bounds);bool found=false;
            foreach(var slot in projection.Slots)if(slot.Id=="GaragePreview"){open=slot.Bounds;found=true;}
            Need(found && open.Height>0 && open.Width>0,"garage defines actual open hero space");
            var space=new Rect(open.X/size.x,1-(open.Y+open.Height)/size.y,open.Width/size.x,open.Height/size.y);
            f.Art.SetGarageFraming(space);
            var meshes=f.Art.tank.GetComponentsInChildren<Renderer>();Bounds tank=default(Bounds);bool first=true;
            foreach(var mesh in meshes)
            {
                if(!mesh.enabled || !mesh.gameObject.activeInHierarchy)continue;
                if(first){tank=mesh.bounds;first=false;}else tank.Encapsulate(mesh.bounds);
            }
            Need(!first,"actual visible tank has a bounded model");
            for(int i=0;i<8;i++)
            {
                var corner=tank.center+Vector3.Scale(tank.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));
                var actual=f.Art.view.WorldToViewportPoint(corner);
                Need(actual.z>f.Art.view.nearClipPlane && space.Contains(new Vector2(actual.x,actual.y)),"actual tank bounds fit the unobstructed hero rectangle");
            }
            var position=f.Art.view.transform.position;var rotation=f.Art.view.transform.rotation;
            foreach(var invalid in new[]{new Rect(float.NaN,0,.5f,.5f),new Rect(0,0,float.PositiveInfinity,1),new Rect(-.1f,0,1,1),new Rect(0,0,0,1)})
                f.Art.SetGarageFraming(invalid);
            Need(f.Art.view.transform.position==position && f.Art.view.transform.rotation==rotation,"invalid framing cannot poison camera state");
            f.Loop.Deploy();position=f.Art.view.transform.position;rotation=f.Art.view.transform.rotation;
            var snapshot=f.Loop.Session.Model.Snapshot();
            f.Art.SetGarageFraming(new Rect(.2f,.2f,.4f,.4f));
            Need(f.Art.view.transform.position==position && f.Art.view.transform.rotation==rotation && f.Loop.Session.Model.Snapshot()==snapshot,
                "garage framing cannot mutate encounter camera or model");
        }
    }
    static void CameraCanvasAndScale()
    {
        using(var f=new Fixture())
        {
            var uiObject=new GameObject("IndependentUICamera");var ui=uiObject.AddComponent<Camera>();ui.CopyFrom(f.Art.view);
            ui.transform.position=new Vector3(18,25,-40);ui.transform.rotation=Quaternion.Euler(13,27,0);
            f.Canvas.worldCamera=ui;
            foreach(float scale in new[]{.8f,1.7f,2.4f})
            foreach(float ratio in new[]{1f,2f})
            {
                f.Canvas.scaleFactor=scale;f.Refresh();f.Callout.PixelRatio=ratio;Attached(f);
                var corners=new Vector3[4];f.Callout.Endpoint.GetWorldCorners(corners);
                float dot=Vector2.Distance(RectTransformUtility.WorldToScreenPoint(ui,corners[0]),RectTransformUtility.WorldToScreenPoint(ui,corners[3]))/ratio;
                Need(dot>=4 && dot<=6,"endpoint remains a small legible CSS-sized marker at each DPR");
                var leader=(RectTransform)f.Callout.DecorationRoot.Find("FittingLeader");leader.GetWorldCorners(corners);
                float thickness=Vector2.Distance(RectTransformUtility.WorldToScreenPoint(ui,corners[0]),RectTransformUtility.WorldToScreenPoint(ui,corners[1]))/ratio;
                Need(thickness>=1 && thickness<=2,"leader remains thin and visible in CSS pixels across Canvas scale and DPR");
            }
            f.Canvas.worldCamera=f.Art.view;UnityEngine.Object.DestroyImmediate(uiObject);
        }
    }
    static void ResizeWithOneOwner()
    {
        using(var f=new Fixture())
        {
            var owner=f.Callout;Attached(f);
            foreach(var size in new[]{new Vector2Int(390,688),new Vector2Int(844,266),new Vector2Int(1366,768)})
            {
                f.Resize(size.x,size.y);Need(f.Callout==owner,"resize retains one callout owner");Attached(f);
                f.Art.TrySelectFitting(f.Art.showingLauncher?"repair":"launcher");f.Refresh();Attached(f);
            }
        }
    }
    static void HiddenTargetsAndInvalidProjection()
    {
        using(var f=new Fixture())
        {
            Attached(f);var module=f.Art.repairModule;var position=module.transform.position;
            module.SetActive(false);f.Callout.Refresh(true);Need(!f.Callout.Visible,"inactive module hides leader");module.SetActive(true);
            module.transform.position=f.Art.view.transform.position-f.Art.view.transform.forward*4;
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"behind-camera module hides leader");
            module.transform.position=f.Art.view.transform.position+f.Art.view.transform.forward*10+f.Art.view.transform.right*100;
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"offscreen module hides leader");
            module.transform.position=position;Attached(f);
            var uiObject=new GameObject("FarClipIndependentUiCamera");var ui=uiObject.AddComponent<Camera>();
            ui.CopyFrom(f.Art.view);f.Canvas.worldCamera=ui;f.Refresh();Attached(f);
            float far=f.Art.view.farClipPlane;
            f.Art.view.farClipPlane=f.Art.view.WorldToScreenPoint(Bounds(module).center).z*.5f;
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"module beyond world camera far clip hides leader with an independent visible UI camera");
            f.Art.view.farClipPlane=far;f.Canvas.worldCamera=f.Art.view;UnityEngine.Object.DestroyImmediate(uiObject);f.Refresh();Attached(f);
            f.Art.enabled=false;f.Callout.Refresh(true);Need(!f.Callout.Visible,"disabled presentation hides leader");f.Art.enabled=true;
            f.Art.view.enabled=false;f.Callout.Refresh(true);Need(!f.Callout.Visible,"disabled world camera hides leader");f.Art.view.enabled=true;
            int mask=f.Art.view.cullingMask;f.Art.view.cullingMask=0;
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"culled module hides leader");f.Art.view.cullingMask=mask;
            var meshes=module.GetComponentsInChildren<Renderer>();foreach(var mesh in meshes)mesh.forceRenderingOff=true;
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"forced hidden renderers hide leader");foreach(var mesh in meshes)mesh.forceRenderingOff=false;
            Attached(f);
            f.Callout.Refresh(false);Need(!f.Callout.Visible,"caller overlay hold hides leader");
            f.Callout.enabled=false;f.Callout.Refresh(true);Need(!f.Callout.Visible,"disabled owner cannot leave a stale line");f.Callout.enabled=true;
            f.Canvas.worldCamera=null;f.Callout.Refresh(true);Need(!f.Callout.Visible,"missing UI projection camera hides leader");
        }
    }
    static void OverlayAndEncounterLifecycle()
    {
        using(var f=new Fixture())
        {
            f.Loop.OpenMenu();f.Refresh();Need(!f.Callout.Visible,"actual menu hides callout");
            f.Loop.CloseMenu();f.Refresh();Attached(f);
            f.Loop.Deploy();f.Refresh();Need(f.Art.EncounterActive,"real encounter admitted");
            f.Callout.Refresh(true);Need(!f.Callout.Visible,"independent encounter guard rejects caller error");
        }
    }
    static void FiveModulesUseSharedProjection()
    {
        foreach(var size in new[]{new Vector2Int(1366,768),new Vector2Int(1920,1080),new Vector2Int(390,688),new Vector2Int(844,266),new Vector2Int(720,516)})
        using(var f=new Fixture(size.x,size.y))
        {
            var modules=new Dictionary<string,GameObject>();
            foreach(string id in new[]{"repair","launcher","scattergun","mortar","railgun"})
            {
                Need(f.Art.TrySelectFitting(id),"actual fitting selection: "+id);f.Refresh();Attached(f);
                var module=f.Art.ActiveFittingModule;modules.Add(id,module);
                Need(module.GetComponentsInChildren<MeshFilter>().Length>0&&f.Art.ActiveFittingRenderers.Length>0,"visible attachment geometry: "+id);
                Need(f.Art.TrySelectFitting(id)&&f.Art.ActiveFittingModule==module,"same fitting reuses its owned module");
                Invoke(f.Art,"Start");Need(f.Art.ActiveFittingModule==module&&f.Art.FittingId==id,"late Start cannot reset selected module");
            }
            Need(modules.Values.Distinct().Count()==5,"five independent module identities");
            foreach(var item in modules)
            {
                Need(f.Art.TrySelectFitting(item.Key),"revisit fitting");f.Refresh();Attached(f);
                Need(modules.Values.Count(m=>m.activeInHierarchy)==1,"one selected attachment only");
            }
            var selected=f.Art.ActiveFittingModule;
            Need(!f.Art.TrySelectFitting("unknown")&&f.Art.ActiveFittingModule==selected,"unknown fitting does not mutate binding");
            Need(f.Art.BeginEncounter(),"presentation encounter admitted");
            foreach(string id in modules.Keys)Need(!f.Art.TrySelectFitting(id)&&f.Art.ActiveFittingModule==selected,"active encounter cannot replace fitting");
            f.Art.EndEncounter();
        }
    }
    static void Check(string name,Action body)
    {
        try { body();Debug.Log("ST_LS_FITTING_PASS "+name); }
        catch(Exception error) { Debug.LogError("ST_LS_FITTING_FAIL "+name+" "+error);throw; }
    }
    public static void Run()
    {
        var storage=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var pipeline=QualitySettings.renderPipeline;bool background=Application.runInBackground;
        try
        {
            Check("both_authored_modules_across_profiles",BothModulesAndProfiles);
            Check("hero_bounds_fit_and_invalid_or_active_framing_refuses",HeroFramingAndInvalidInput);
            Check("independent_ui_camera_canvas_scale_and_dpr",CameraCanvasAndScale);
            Check("resize_same_owner_retains_actual_attachment",ResizeWithOneOwner);
            Check("inactive_behind_camera_offscreen_and_disabled",HiddenTargetsAndInvalidProjection);
            Check("actual_menu_and_encounter_lifecycle",OverlayAndEncounterLifecycle);
            Check("five_modules_use_shared_projection",FiveModulesUseSharedProjection);
        }
        finally
        {
            LastStandLoopController.StorageFactory=storage;LastStandLoopController.PreferencesStorageFactory=preferences;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
}

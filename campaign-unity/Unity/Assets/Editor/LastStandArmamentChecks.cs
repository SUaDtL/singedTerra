using System;
using System.Reflection;
using System.Collections.Generic;
using System.Linq;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Imported module presentation checks; not browser, pixel or listening acceptance.
public static class LastStandArmamentChecks
{
    static void Need(bool value,string message) { if(!value)throw new InvalidOperationException(message); }
    static void Invoke(object owner,string method,params object[] args)
    { owner.GetType().GetMethod(method,BindingFlags.Instance|BindingFlags.NonPublic).Invoke(owner,args); }
    public static void RunChromeAndArmament()
    {
        LastStandLoopChecks.RunChromeChecks();
        Run();
    }
    public static void Run()
    {
        try
        {
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
            var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            typeof(TankPresentation).GetMethod("Start",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(art,null);
            Need(art.TrySelectFitting("scattergun"),"Scattergun selects its actual presentation identity");
            Need(art.FittingId=="scattergun" && !art.repairModule.activeSelf && !art.launcherModule.activeSelf,
                "Scattergun does not fall through to Repair or Launcher");
            var property=typeof(TankPresentation).GetProperty("ActiveFittingModule");
            Need(property!=null,"active module is selected by explicit identity");
            var module=property.GetValue(art) as GameObject;
            Need(module && module.name=="Attachment_Scattergun" && module.activeSelf,"readable third tank attachment exists");
            Need(module.GetComponentsInChildren<Renderer>().Length>=10,"Scattergun has modeled receiver, clustered barrels and mount");
            Need(!art.TrySelectFitting("unknown") && art.FittingId=="scattergun","unknown fitting preserves active module");
            Need(art.BeginEncounter() && !art.TrySelectFitting("repair"),"presentation cannot swap fittings during combat");
            art.EndEncounter();
            Need(art.TrySelectFitting("launcher") && art.launcherModule.activeSelf && !module.activeSelf,"Launcher remains available");
            Need(art.TrySelectFitting("repair") && art.repairModule.activeSelf && !module.activeSelf,"Repair remains available");
            Debug.Log("ST_LS_ARMAMENT_PASS test_explicit_module_identity");
            Feedback(art);
            Debug.Log("ST_LS_ARMAMENT_PASS test_scattergun_outgoing_feedback_and_reduced_effects");
            Callout(art);
            Debug.Log("ST_LS_ARMAMENT_PASS test_scattergun_callout_uses_actual_module");
        }
        finally { EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
    }
    static EncounterModel Shot(bool killed)
    {
        var model=new EncounterModel(LastStandFitting.Scattergun,EncounterProfile.PlayablePrototype);
        // Explicit presentation fixture: put three real model-owned opponents
        // in range, then let the actual deterministic firing path create events.
        for(int i=0;i<3;i++)
        {
            var foe=model.Foes[i];
            foreach(var value in new Dictionary<string,int>{{"Id",i+100},{"Lane",i},{"Distance",9000+i*500},{"Hull",killed?8:100},{"MaximumHull",killed?8:100}})
                typeof(EncounterFoe).GetProperty(value.Key).SetValue(foe,value.Value);
        }
        model.Step();
        var actual=model.Events.Where(e=>e.Kind==EncounterEventKind.Scattergun).ToArray();
        Need(actual.Length>=2 && actual.All(e=>e.Killed==killed),"actual scatter event batch matches lethal/nonlethal fixture");
        // Deliver only these genuine events to isolate their view classification.
        var events=(List<EncounterEvent>)model.Events;events.Clear();events.AddRange(actual);
        return model;
    }
    static void Feedback(TankPresentation art)
    {
        Need(art.TrySelectFitting("scattergun"),"scattergun feedback fitting selected");
        var host=new GameObject("Scattergun feedback fixture");var view=host.AddComponent<EncounterView>();view.Initialize(art);
        Need(art.BeginEncounter(),"feedback fixture enters actual encounter presentation");
        foreach(bool killed in new[]{false,true})
        {
            var model=Shot(killed);string snapshot=model.Snapshot();view.Render(model);view.Present(model);
            var trails=host.GetComponentsInChildren<LineRenderer>(true).Where(t=>t.enabled).ToArray();
            Need(trails.Length==model.Events.Count*3,"short-range scatter events emit a bounded three-tracer burst for each hit");
            foreach(var trail in trails)
                Need(Vector3.Distance(trail.GetPosition(0),art.ActiveFittingModule.transform.position)<2 &&
                    model.Events.Any(e=>Vector3.Distance(trail.GetPosition(1),view.Position(model.Foes[e.Slot]))<.2f),
                    "scatter trails start at their module and end on actual hit targets");
            view.ToggleEffects();view.Clear();view.Present(model);
            var compact=host.GetComponentsInChildren<Renderer>().Where(r=>r.name.StartsWith("Review feedback ")).ToArray();
            Need(compact.Length>=model.Events.Count && compact.All(r=>Vector3.Distance(r.transform.position,art.tank.position)>3),
                "reduced scatter feedback marks enemies, never incoming damage on the player's tank");
            Need(!host.GetComponentsInChildren<LineRenderer>(true).Any(t=>t.enabled),"reduced scatter feedback emits no tracers");
            Need(snapshot==model.Snapshot(),"presentation preserves deterministic combat state");
            view.Clear();view.ToggleEffects();
        }
        art.EndEncounter();UnityEngine.Object.DestroyImmediate(host);
    }
    sealed class Storage : ILastStandStorage
    {
        string value;
        public string Read()=>value;
        public void Write(string next){value=next;}
    }
    static Storage EarnedScattergunSave()
    {
        var store=new Storage();LastStandProgression.Load(store);
        // Bounded strong-build fixture, then earn the unlock through actual
        // sequential combat and atomic wave commits, not a forged unlock flag.
        string saved=store.Read();
        foreach(var track in LastStandUpgradeCatalog.Tracks)
        {
            string anchor="\""+track.Key+"\":0";
            Need(saved.IndexOf(anchor,StringComparison.Ordinal)>=0 && saved.IndexOf(anchor,StringComparison.Ordinal)==saved.LastIndexOf(anchor,StringComparison.Ordinal),
                "strong-build fixture has one initial level for "+track.Key);
            saved=saved.Replace(anchor,"\""+track.Key+"\":"+track.PermanentCap);
        }
        store.Write(saved.Replace("\"selectedFitting\":\"repair\"","\"selectedFitting\":\"launcher\""));
        var progress=LastStandProgression.Load(store);Need(progress.TryDeploy(),"earned-unlock fixture deploys");
        var model=progress.Checkpoint.RestoreModel();var shop=progress.Checkpoint.RestoreShop();
        for(int wave=1;wave<=100;wave++)
        {
            int budget=20000;
            while(!model.AwaitingWaveCommit && model.Status==EncounterStatus.Running && budget-->0)
            { model.Step();shop.ObserveAuthoritativeKills(model.Kills); }
            Need(model.AwaitingWaveCommit && progress.TryCommitWave(model,shop),"earned-unlock fixture commits wave "+wave);
            if(wave<100)Need(model.ContinueAfterCheckpoint(),"earned-unlock fixture continues after bank");
        }
        Need(progress.IsFittingUnlocked("scattergun") && progress.TryFinalizeRun() && progress.TrySelectFitting("scattergun"),
            "wave100 unlock is saved and can be explicitly equipped after the run");
        return store;
    }
    static void Callout(TankPresentation art)
    {
        using var preferences=new LastStandTestPreferencesScope();
        var factory=LastStandLoopController.StorageFactory;RenderTexture texture=null;
        try
        {
            var earned=EarnedScattergunSave();LastStandLoopController.StorageFactory=()=>earned;
            Invoke(art.GetComponent<BattlefieldReview>(),"Awake");Invoke(art.GetComponent<ArtHud>(),"Start");
            var loop=art.GetComponent<LastStandLoopController>();
            typeof(EncounterSession).GetField("focused",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop.Session,true);
            Need(art.TrySelectFitting("scattergun"),"callout selects actual third fitting");
            var canvas=art.GetComponentInChildren<Canvas>();canvas.GetComponent<CanvasScaler>().enabled=false;canvas.scaleFactor=1;
            var callout=canvas.GetComponentInChildren<LastStandFittingCallout>(true);
            foreach(var size in new[]{new Vector2Int(1366,768),new Vector2Int(390,688),new Vector2Int(844,266)})
            {
                art.view.targetTexture=null;if(texture)UnityEngine.Object.DestroyImmediate(texture);
                texture=new RenderTexture(size.x,size.y,16);art.view.targetTexture=texture;
                canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=art.view;canvas.planeDistance=1;
                Canvas.ForceUpdateCanvases();loop.RefreshControls();
                canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=art.view;
                Canvas.ForceUpdateCanvases();loop.RefreshControls();Canvas.ForceUpdateCanvases();callout.Refresh(true);
                Need(callout.Visible && callout.TargetName=="Attachment_Scattergun","Scattergun has its actual module callout in each viewport");
                var bounds=art.ActiveFittingRenderers[0].bounds;foreach(var mesh in art.ActiveFittingRenderers)bounds.Encapsulate(mesh.bounds);
                var expected=art.view.WorldToScreenPoint(bounds.center);
                var actual=RectTransformUtility.WorldToScreenPoint(canvas.worldCamera,callout.Endpoint.position);
                Need(Vector2.Distance(expected,actual)<.3f && Vector3.Distance(bounds.center,callout.AnchorWorld)<.001f,"third fitting callout follows independent world projection");
                Need(callout.DecorationRoot.GetComponentsInChildren<Graphic>(true).All(g=>!g.raycastTarget),"module callout cannot intercept controls");
            }
        }
        finally
        {
            art.view.targetTexture=null;if(texture)UnityEngine.Object.DestroyImmediate(texture);
            LastStandLoopController.StorageFactory=factory;
        }
    }
}

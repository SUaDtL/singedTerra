using System;
using System.Linq;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.LastStand;

// Deterministic reverse-Start ordering against the actual imported scene.
// Browser readiness and exception-free Web startup still require an export run.
public static class LastStandStartupChecks
{
    sealed class Store : ILastStandStorage
    {
        string value;
        public string Read()=>value;
        public void Write(string next){value=next;}
    }
    static void Need(bool value,string reason)
    { if(!value)throw new InvalidOperationException("Startup: "+reason); }
    static void Start(object target)
    { target.GetType().GetMethod("Start",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(target,null); }
    static TankPresentation Open()
    {
        EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
        var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Need(art && art.repairModule && art.launcherModule,"actual serialized original modules exist");
        Need(!art.scattergunModule,"runtime Scattergun has not been constructed by a hidden fixture Start");
        return art;
    }
    static void ModuleIsUnique(TankPresentation art,string expected)
    {
        Need(art.FittingId==expected,"later Start preserves the selected fitting "+expected);
        Need(art.scattergunModule && art.tank.GetComponentsInChildren<Transform>(true)
            .Count(t=>t.name=="Attachment_Scattergun")==1,"one owned modeled Scattergun, including repeated initialization");
        Need(art.repairModule.activeSelf==(expected=="repair") && art.launcherModule.activeSelf==(expected=="launcher") &&
            art.scattergunModule.activeSelf==(expected=="scattergun"),"exact selected module visibility");
        Need(art.ActiveFittingRenderers!=null && art.ActiveFittingRenderers.Length>0,"selected module has initialized renderer metadata");
    }
    static void HudBeforeTankStart(string fitting)
    {
        using var preferences=new LastStandTestPreferencesScope();
        var previous=LastStandLoopController.StorageFactory;
        var store=new Store();var progression=LastStandProgression.Load(store);
        Need(progression.TrySelectFitting(fitting),"persist actual selected fitting before loading");
        LastStandLoopController.StorageFactory=()=>store;
        bool ready=false;
        Application.LogCallback capture=(message,trace,kind)=>
        { if(message.StartsWith("ST_LS_STATE ") && message.Contains("\"action\":\"ready\""))ready=true; };
        Application.logMessageReceived+=capture;
        try
        {
            var art=Open();Start(art.GetComponent<ArtHud>());
            Need(ready,"real controller initialization reaches ready when ArtHud.Start runs first");
            var loop=art.GetComponent<LastStandLoopController>();
            Need(loop.Progression.SelectedFitting==fitting && loop.FittingId==fitting,"saved fitting applied during initialization");
            ModuleIsUnique(art,fitting);
            var camera=art.view.transform.position;
            Start(art);Start(art);
            ModuleIsUnique(art,fitting);
            Need(art.view.transform.position==camera,"late Start cannot reset already framed garage camera");
        }
        finally
        {
            Application.logMessageReceived-=capture;
            LastStandLoopController.StorageFactory=previous;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
    static void DirectSelectionBeforeStart()
    {
        try
        {
            foreach(string fitting in new[]{"repair","launcher","scattergun"})
            {
                var art=Open();
                Need(art.TrySelectFitting(fitting),"direct pre-Start selection admits "+fitting);
                ModuleIsUnique(art,fitting);Start(art);Start(art);ModuleIsUnique(art,fitting);
                Need(!art.TrySelectFitting("unknown") && art.FittingId==fitting,"unknown identity preserves selected module");
            }
        }
        finally { EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
    }
    public static void Run()
    {
        HudBeforeTankStart("repair");Debug.Log("ST_LS_STARTUP_PASS test_fresh_hud_before_tank_start");
        HudBeforeTankStart("launcher");Debug.Log("ST_LS_STARTUP_PASS test_saved_fitting_survives_late_start");
        DirectSelectionBeforeStart();Debug.Log("ST_LS_STARTUP_PASS test_all_fittings_before_start_are_idempotent");
    }
}

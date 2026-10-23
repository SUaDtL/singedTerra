using System;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Imported scene/controller integration. The artificial timestamps exercise
// batching and save boundaries; they are not real elapsed browser/media proof.
public static class LastStandWaveChecks
{
    sealed class Store : ILastStandStorage
    {
        public string Raw;
        public bool Reject, ThrowAfterWrite;
        public string Read()=>Raw;
        public void Write(string value)
        { if(Reject)throw new InvalidOperationException("test quota");Raw=value;if(ThrowAfterWrite)throw new InvalidOperationException("test uncertain write"); }
    }
    sealed class Viewport : IDisposable
    {
        readonly Canvas canvas;
        readonly Camera camera;
        readonly RenderTexture texture;
        readonly LastStandLoopController loop;
        public Viewport(LastStandLoopController controller)
        {
            loop=controller;canvas=UnityEngine.Object.FindFirstObjectByType<Canvas>();
            camera=UnityEngine.Object.FindFirstObjectByType<Camera>();
            texture=new RenderTexture(1366,664,16);camera.targetTexture=texture;
            canvas.GetComponent<UnityEngine.UI.CanvasScaler>().enabled=false;
            canvas.scaleFactor=1;Resize(1366,664);
        }
        public void Resize(int width,int height)
        {
            texture.Release();texture.width=width;texture.height=height;texture.Create();
            canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=camera;canvas.planeDistance=1;
            Canvas.ForceUpdateCanvases();loop.RefreshControls();Canvas.ForceUpdateCanvases();
            Need(Math.Abs(canvas.pixelRect.width-width)<.1 && Math.Abs(canvas.pixelRect.height-height)<.1,
                "fixture uses the requested actual Canvas viewport");
        }
        public void Dispose()
        { camera.targetTexture=null;UnityEngine.Object.DestroyImmediate(texture); }
    }
    static void Need(bool value,string reason) { if(!value)throw new InvalidOperationException("Wave integration: "+reason); }
    static LastStandLoopController Open(Store store)
    {
        LastStandLoopController.StorageFactory=()=>store;
        EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
        var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        typeof(TankPresentation).GetMethod("Start",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(art,null);
        typeof(ArtHud).GetMethod("Start",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(art.GetComponent<ArtHud>(),null);
        var loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
        typeof(EncounterSession).GetField("focused",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop.Session,true);
        var system=UnityEngine.Object.FindFirstObjectByType<EventSystem>(FindObjectsInactive.Include);
        Need(system,"imported EventSystem exists");system.gameObject.SetActive(true);system.enabled=true;EventSystem.current=system;
        loop.RefreshControls();return loop;
    }
    static LastStandRunClock Clock(EncounterSession session)=>(LastStandRunClock)typeof(EncounterSession)
        .GetField("runClock",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(session);
    static void Advance(LastStandLoopController loop,Func<bool> until)
    {
        int remaining=100;
        while(!until() && remaining-->0 && loop.Session.Model!=null && loop.Session.Failure=="")
            loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+1);
        Need(until(),"requested boundary reached; failure="+loop.Session.Failure+" phase="+loop.Phase);
    }
    static void BoundaryRetryAndResume()
    {
        var store=new Store();var loop=Open(store);loop.Deploy();
        Need(loop.Session.Model!=null && loop.Progression.Checkpoint.CompletedWave==0,"starting checkpoint before running");
        Need(loop.Session.TrySetSpeedAt(Clock(loop.Session).LastTimestamp,.5),"half-speed selected before checkpoint failure");
        store.Reject=true;Advance(loop,()=>loop.Session.CheckpointBlocked);
        int tick=loop.Session.Model.Tick;Need(loop.Progression.Checkpoint.CompletedWave==0 && loop.Session.Model.AwaitingWaveCommit,"write failure keeps preceding checkpoint");
        loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+600);
        Need(loop.Session.Model.Tick==tick && loop.Session.Model.Wave==1,"unconfirmed clear cannot consume next-wave time");
        store.Reject=false;loop.RetrySave();
        Need(loop.Progression.Checkpoint.CompletedWave==1 && loop.Session.Model.Wave==2 && loop.Session.Paused &&
            loop.Session.ManualPaused && !loop.Session.CheckpointBlocked,"retry banks once and reanchors paused");
        Need(loop.Session.LastPositiveSpeed==.5,"retry preserves the player's selected positive speed");
        string saved=store.Raw;int wallet=loop.Progression.Wallet;
        loop.RetrySave();Need(store.Raw==saved && loop.Progression.Wallet==wallet,"repeated retry does not bank twice");
        loop.RequestNavigation(false);
        Need(loop.Session.Model==null && loop.Progression.HasCheckpoint && !loop.MenuOpen,"ordinary Return keeps checkpoint");
        loop=Open(store);Need(loop.Session.Model==null && loop.Progression.HasCheckpoint,"reload waits for explicit input");
        var expected=loop.Progression.Checkpoint.RestoreModel();expected.ContinueAfterCheckpoint();
        loop.ResumeRun();Need(loop.Session.Model.Snapshot()==expected.Snapshot() && loop.Session.Paused,"resume exact state with paused clock");
        tick=loop.Session.Model.Tick;loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+36000);
        Need(loop.Session.Model.Tick==tick && loop.Progression.Wallet==wallet,"closed-tab time cannot become progress");
        Debug.Log("ST_LS_WAVE_PASS test_clear_retry_resume_boundary");
    }
    static void NavigationAndAbandon()
    {
        var store=new Store();var loop=Open(store);loop.Deploy();string saved=store.Raw;
        loop.OpenMenu();Need(loop.MenuOpen && loop.Session.Paused,"menu pauses live run");
        loop.CloseMenu();Need(!loop.MenuOpen && loop.Progression.HasCheckpoint,"menu close retains checkpoint");
        loop.OpenMenu();loop.RequestNavigation(true);
        Need(loop.Session.Model==null && store.Raw==saved && !loop.MenuOpen,"account navigation closes its menu and retains bytes");
        loop.ResumeRun();Need(loop.Session.Paused,"explicit resume remains paused");
        loop.RequestConfirmation("new-run");Need(loop.Confirmation=="new-run","new run requires confirmation");
        loop.CancelConfirmation();Need(store.Raw==saved && loop.Progression.HasCheckpoint,"cancel keeps saved run");loop.CloseMenu();
        loop.RequestConfirmation("abandon");store.Reject=true;loop.ConfirmAction();
        Need(loop.Progression.SaveState=="retry" && loop.Progression.HasCheckpoint && store.Raw==saved,"failed abandon retains checkpoint");
        store.Reject=false;loop.RetrySave();Need(!loop.Progression.HasCheckpoint && loop.Session.Model==null,"confirmed retry clears run");
        Need(!LastStandProgression.Load(store).HasCheckpoint,"finalized run cannot resurrect");
        Debug.Log("ST_LS_WAVE_PASS test_navigation_cancel_and_durable_abandon");
    }
    static void TerminalWrite()
    {
        var store=new Store();var loop=Open(store);loop.Deploy();
        // Make an ordinary non-clearing incoming hit terminal in the actual model.
        Advance(loop,()=>loop.Session.Model.ActiveCount>0);
        var model=loop.Session.Model;
        typeof(EncounterModel).GetField("<Hull>k__BackingField",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,1);
        typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
        typeof(EncounterModel).GetField("nextRepair",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
        foreach(var foe in model.Foes)if(foe.Alive)
        {
            typeof(EncounterFoe).GetProperty("Distance").SetValue(foe,0);
            typeof(EncounterFoe).GetProperty("Damage").SetValue(foe,int.MaxValue);
        }
        int wallet=loop.Progression.Wallet;store.ThrowAfterWrite=true;
        Advance(loop,()=>loop.Session.CheckpointBlocked);
        Need(model.Status==EncounterStatus.Defeated && loop.Progression.HasCheckpoint,"unconfirmed terminal cannot be discarded in memory");
        store.ThrowAfterWrite=false;loop.RetrySave();
        Need(!loop.Progression.HasCheckpoint && loop.Phase=="result" && loop.Progression.PendingDefeat==null &&
            loop.Progression.Wallet==wallet,"terminal retry clears checkpoint without separate reward");
        Need(!LastStandProgression.Load(store).HasCheckpoint,"persisted terminal cannot resurrect");
        Debug.Log("ST_LS_WAVE_PASS test_terminal_uncertainty_and_no_payout");
    }
    static void ReceiptBoundaries()
    {
        var store=new Store();var loop=Open(store);using var viewport=new Viewport(loop);
        loop.SetPreferences(loop.Preferences.Current.With(tutorialTips:false,purchaseSuggestions:false));
        loop.Deploy();Advance(loop,()=>loop.Progression.Checkpoint.CompletedWave>=1);
        var receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
        Need(receipt && receipt.gameObject.activeInHierarchy && receipt.text.Contains("W1") && receipt.text.Contains("SALVAGE"),
            "confirmed clear must show its actual reward with optional guidance disabled");
        GameObject.Find("ShopEntry").GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
        receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
        Need(receipt && receipt.text.Contains("W1") && receipt.text.Contains("SALVAGE"),
            "opening the run shop must retain the confirmed receipt");
        GameObject.Find("ShopClose").GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
        foreach(var size in new[]{new Vector2Int(390,688),new Vector2Int(844,266),new Vector2Int(1366,664)})
        {
            viewport.Resize(size.x,size.y);
            receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
            Need(receipt && receipt.text.Contains("W1") && receipt.preferredHeight<=receipt.rectTransform.rect.height+1,
                "receipt remains active and readable after resize");
            GameObject.Find("ShopEntry").GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
            receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
            Need(receipt && receipt.text.Contains("W1") && receipt.preferredHeight<=receipt.rectTransform.rect.height+1,
                "shop receipt remains active and readable after resize");
            GameObject.Find("ShopClose").GetComponent<UnityEngine.UI.Button>().onClick.Invoke();
        }
        store.Reject=true;Advance(loop,()=>loop.Session.CheckpointBlocked);
        Need(!GameObject.Find("WaveReceipt"),"unconfirmed save must not display an earlier receipt instead of its error");
        var error=GameObject.Find("SaveStatus")?.GetComponent<UnityEngine.UI.Text>();
        Need(error && error.text==loop.Progression.SaveError,"save error must remain primary");
        store.Reject=false;loop.RetrySave();
        receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
        Need(receipt && receipt.text.Contains("W2") && loop.Session.Paused,"retry must reveal confirmed reward while remaining paused");
        // An ordinary later defeat retains the already banked receipt without adding a payout.
        loop.TogglePause();Advance(loop,()=>loop.Session.Model.ActiveCount>0);
        var model=loop.Session.Model;
        typeof(EncounterModel).GetField("<Hull>k__BackingField",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,1);
        typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
        typeof(EncounterModel).GetField("nextRepair",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
        foreach(var foe in model.Foes)if(foe.Alive)
        {
            typeof(EncounterFoe).GetProperty("Distance").SetValue(foe,0);
            typeof(EncounterFoe).GetProperty("Damage").SetValue(foe,int.MaxValue);
        }
        int wallet=loop.Progression.Wallet;
        Advance(loop,()=>model.Status==EncounterStatus.Defeated);
        Need(loop.Progression.Wallet==wallet && loop.Notice.Contains("W2") && loop.Notice.Contains("SALVAGE"),
            "terminal notice keeps confirmed receipt and adds no defeat payout");
        Debug.Log("ST_LS_WAVE_PASS test_confirmed_receipts_survive_retry_and_terminal");
    }
    static void MutualReceipt()
    {
        foreach(bool failedWrite in new[]{false,true})
        {
            var store=new Store();var loop=Open(store);using var viewport=new Viewport(loop);
            loop.Deploy();var model=loop.Session.Model;
            int budget=10000,finalKill=LastStandWaveCatalog.ForWave(1,1).EnemyCount-1;
            while((model.Kills<finalKill || model.ActiveCount==0) && model.Status==EncounterStatus.Running && budget-->0)
                loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+.05);
            Need(model.Kills==finalKill && model.ActiveCount==1,"mutual fixture reaches final live enemy");
            foreach(var foe in model.Foes)if(foe.Alive)
            {
                typeof(EncounterFoe).GetProperty("Distance").SetValue(foe,0);
                typeof(EncounterFoe).GetProperty("Hull").SetValue(foe,1);
                typeof(EncounterFoe).GetProperty("Damage").SetValue(foe,int.MaxValue);
            }
            typeof(EncounterModel).GetField("<Hull>k__BackingField",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,1);
            typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick);
            typeof(EncounterModel).GetField("nextRepair",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
            store.Reject=failedWrite;int wallet=loop.Progression.Wallet;
            Advance(loop,()=>model.Status==EncounterStatus.Defeated);
            Need(model.CompletedWave==1 && model.Hull==0,"actual simultaneous clear and death");
            if(failedWrite)
            {
                Need(loop.Progression.SaveState=="retry" && loop.Progression.Wallet==wallet && !GameObject.Find("WaveReceipt"),
                    "uncertain mutual reward stays hidden behind the save error");
                store.Reject=false;loop.RetrySave();
            }
            else
            {
                var receipt=GameObject.Find("WaveReceipt")?.GetComponent<UnityEngine.UI.Text>();
                Need(receipt && receipt.text.Contains("W1"),"mutual clear receipt appears during final impact");
                loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+1);
                typeof(LastStandLoopController).GetMethod("Update",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(loop,null);
            }
            var notice=GameObject.Find("SaveStatus")?.GetComponent<UnityEngine.UI.Text>();
            Need(loop.Phase=="result" && notice && notice.text.Contains("W1") && notice.text.Contains("SALVAGE") &&
                loop.Progression.Wallet> wallet && !loop.Progression.HasCheckpoint && !LastStandProgression.Load(store).HasCheckpoint,
                "terminal receipt remains visible and the dead run cannot resume");
            int paid=loop.Progression.Wallet;loop.RetrySave();
            Need(loop.Progression.Wallet==paid,"repeated retry cannot repeat the simultaneous reward");
        }
        Debug.Log("ST_LS_WAVE_PASS test_simultaneous_clear_death_receipt_and_retry");
    }
    public static void Run()
    {
        using var preferences=new LastStandTestPreferencesScope();
        var original=LastStandLoopController.StorageFactory;
        try { ReceiptBoundaries();MutualReceipt();BoundaryRetryAndResume();NavigationAndAbandon();TerminalWrite(); }
        finally { LastStandLoopController.StorageFactory=original;EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
    }
}

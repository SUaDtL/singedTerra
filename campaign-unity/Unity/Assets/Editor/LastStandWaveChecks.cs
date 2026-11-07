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
        Need(system,"imported EventSystem exists");system.gameObject.SetActive(true);system.enabled=true;
        // Batch edit-mode does not invoke this imported component's OnEnable.
        typeof(EventSystem).GetMethod("OnEnable",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(system,null);
        EventSystem.current=system;
        Need(EventSystem.current==system,"actual imported EventSystem is registered");
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
    static void PrepareFinalWaveEnemy(LastStandLoopController loop)
    {
        var model=loop.Session.Model;
        int finalKill=LastStandWaveCatalog.ForWave(1,1).EnemyCount-1,budget=10000;
        while((model.Kills<finalKill || model.ActiveCount==0) && model.Status==EncounterStatus.Running && budget-->0)
            loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+.05);
        Need(model.Kills==finalKill && model.ActiveCount==1,"focus fixture reaches the actual last wave enemy");
        foreach(var foe in model.Foes)if(foe.Alive)
        {
            typeof(EncounterFoe).GetProperty("Distance").SetValue(foe,1000);
            typeof(EncounterFoe).GetProperty("Hull").SetValue(foe,1);
        }
        typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick);
    }
    static UnityEngine.UI.Button ActiveButton(string name)
    {
        var button=GameObject.Find(name)?.GetComponent<UnityEngine.UI.Button>();
        Need(button && button.IsActive() && button.IsInteractable(),"actual available control "+name);return button;
    }
    static void SubmitSelected(LastStandLoopController loop)
    {
        // Artificial batch timestamps must not turn the subsequent real Button
        // Submit into a backwards clock. No gameplay or selection is reset.
        typeof(LastStandRunClock).GetField("anchor",BindingFlags.Instance|BindingFlags.NonPublic)
            .SetValue(Clock(loop.Session),Time.realtimeSinceStartupAsDouble);
        ExecuteEvents.Execute(EventSystem.current.currentSelectedGameObject,
            new BaseEventData(EventSystem.current),ExecuteEvents.submitHandler);
    }
    static void WaveBoundaryFocus()
    {
        foreach(string name in new[]{"SpeedRate","Menu","SpeedMinus"})
        {
            var store=new Store();var loop=Open(store);using var viewport=new Viewport(loop);
            loop.Deploy();PrepareFinalWaveEnemy(loop);
            var button=ActiveButton(name);EventSystem.current.SetSelectedGameObject(button.gameObject);
            int tick=loop.Session.Model.Tick,committedTick=-1,changedWhileDraining=0;
            bool committedBeforeDrain=false;
            Application.LogCallback observe=(message,trace,type)=>{
                if(!message.StartsWith("ST_LS_STATE ") || !message.Contains("\"action\":\"wave-committed\""))return;
                committedTick=loop.Session.Model.Tick;
                committedBeforeDrain=loop.Session.CatchingUp && loop.Progression.Checkpoint.CompletedWave==1 &&
                    LastStandProgression.Load(store).Checkpoint.CompletedWave==1 && loop.Session.Model.Wave==2;
            };
            Action changed=()=>{if(loop.Session.CatchingUp)changedWhileDraining++;};
            Application.logMessageReceived+=observe;loop.Changed+=changed;
            try { loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+.2); }
            finally { Application.logMessageReceived-=observe;loop.Changed-=changed; }
            Need(loop.Session.StepsThisCallback==4 && !loop.Session.CatchingUp && loop.Session.Model.Tick==tick+4,
                "multi-step callback drains past the actual clear");
            Need(committedBeforeDrain && committedTick==tick+1,"durable commit and exact boundary telemetry remain synchronous");
            Need(EventSystem.current.currentSelectedGameObject==button.gameObject,
                name+" focus survives a successful mid-callback wave clear; selected="+EventSystem.current.currentSelectedGameObject?.name);
            Need(changedWhileDraining==0,"successful intermediate checkpoint does not publish transient HUD/observer state");
            int submits=0;button.onClick.AddListener(()=>submits++);SubmitSelected(loop);
            Need(submits==1 && !GameObject.Find("ShopClose"),"one Submit activates only the selected control, never Shop");
            if(name=="SpeedRate")Need(loop.Session.ManualPaused && !loop.MenuOpen,"rate Submit only pauses");
            if(name=="SpeedMinus")Need(loop.Session.SelectedSpeed==.5 && !loop.MenuOpen,"minus Submit only selects half speed");
            if(name=="Menu")
            {
                Need(loop.MenuOpen && loop.Session.Paused,"Menu Submit opens the actual modal");
                var selected=EventSystem.current.currentSelectedGameObject;
                Need(selected && selected!=button.gameObject && selected.transform.IsChildOf(GameObject.Find("SettingsModal").transform),
                    "a genuine modal still moves focus into its active controls");
            }
        }
        Debug.Log("ST_LS_WAVE_PASS test_wave_boundary_preserves_selected_action");
    }
    static void WaveFocusFailureAndTerminal()
    {
        foreach(bool failSave in new[]{true,false})
        {
            var store=new Store();var loop=Open(store);using var viewport=new Viewport(loop);
            loop.Deploy();PrepareFinalWaveEnemy(loop);
            var button=ActiveButton("SpeedRate");EventSystem.current.SetSelectedGameObject(button.gameObject);
            if(!failSave)
            {
                var model=loop.Session.Model;
                typeof(EncounterModel).GetField("<Hull>k__BackingField",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,1);
                typeof(EncounterModel).GetField("nextCannon",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
                typeof(EncounterModel).GetField("nextRepair",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(model,model.Tick+100);
                foreach(var foe in model.Foes)if(foe.Alive)
                { typeof(EncounterFoe).GetProperty("Distance").SetValue(foe,0);typeof(EncounterFoe).GetProperty("Damage").SetValue(foe,int.MaxValue); }
            }
            store.Reject=failSave;bool immediateError=false;
            Action changed=()=>{if(loop.Phase=="save-error" && loop.Session.StepsThisCallback==1)
                immediateError=loop.Session.CheckpointBlocked && ActiveButton("RetrySave") && Clock(loop.Session).PendingSeconds>.05;};
            loop.Changed+=changed;
            try { loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+.2); }
            finally { loop.Changed-=changed; }
            if(failSave)Need(immediateError && loop.Phase=="save-error" && loop.Progression.Checkpoint.CompletedWave==0,
                "failed checkpoint still immediately freezes and projects Retry Save");
            else
            {
                Need(loop.Session.Model.Status==EncounterStatus.Defeated,"real terminal hit changes the phase");
                loop.Session.AdvanceAt(Clock(loop.Session).LastTimestamp+1);
                typeof(LastStandLoopController).GetMethod("Update",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(loop,null);
                Need(loop.Phase=="result","real terminal flow reaches Continue");
            }
            var selected=EventSystem.current.currentSelectedGameObject;
            Need(selected && selected!=button.gameObject && selected.GetComponent<UnityEngine.UI.Button>().IsActive() &&
                selected.GetComponent<UnityEngine.UI.Button>().IsInteractable(),"genuine unavailable/phase transition retains safe focus fallback");
        }
        Debug.Log("ST_LS_WAVE_PASS test_wave_save_failure_and_terminal_keep_focus_fallback");
    }
    [Serializable] sealed class ClockState { public double clockTimestamp,clockPending; }
    static ClockState ReadClockState(EncounterSession session)
    {
        string raw=null;
        Application.LogCallback observe=(message,trace,type)=>{if(message.StartsWith("ST_ENC_STATE "))raw=message.Substring(13);};
        Application.logMessageReceived+=observe;
        try { typeof(EncounterSession).GetMethod("Emit",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(session,new object[]{"clock-check"}); }
        finally { Application.logMessageReceived-=observe; }
        Need(raw!=null && raw.Contains("\"clockTimestamp\":") && raw.Contains("\"clockPending\":"),
            "actual serialized encounter telemetry carries both admitted clock fields");
        return JsonUtility.FromJson<ClockState>(raw);
    }
    static void ClockTelemetry()
    {
        var loop=Open(new Store());var absent=ReadClockState(loop.Session);
        Need(absent.clockTimestamp==-1 && absent.clockPending==-1,"no playable clock has explicit unavailable sentinels");
        loop.Deploy();var clock=Clock(loop.Session);
        loop.Session.AdvanceAt(clock.LastTimestamp+.075);
        var partial=ReadClockState(loop.Session);
        Need(Math.Abs(partial.clockTimestamp-clock.LastTimestamp)<1e-7 && Math.Abs(partial.clockPending-clock.PendingSeconds)<1e-7 &&
            Math.Abs(partial.clockPending-.025)<1e-7,"timestamp and fractional carry come from the actual admitted clock");
        loop.Session.TogglePauseAt(clock.LastTimestamp);
        loop.Session.AdvanceAt(clock.LastTimestamp+20);
        var paused=ReadClockState(loop.Session);
        Need(Math.Abs(paused.clockTimestamp-clock.LastTimestamp)<1e-7 && Math.Abs(paused.clockPending-.025)<1e-7,
            "paused wall time updates the clock anchor without consuming its carry");
        loop.Session.TogglePauseAt(clock.LastTimestamp);loop.Session.AdvanceAt(clock.LastTimestamp+.025);
        var resumed=ReadClockState(loop.Session);
        Need(Math.Abs(resumed.clockTimestamp-clock.LastTimestamp)<1e-7 && Math.Abs(resumed.clockPending)<1e-7 && loop.Session.Model.Tick==2,
            "resumed timestamp and carry identify exactly the next admitted step");
        Debug.Log("ST_LS_WAVE_PASS test_observed_clock_timestamp_and_pending");
    }
    public static void Run()
    {
        using var preferences=new LastStandTestPreferencesScope();
        var original=LastStandLoopController.StorageFactory;
        try { WaveBoundaryFocus();WaveFocusFailureAndTerminal();ClockTelemetry();ReceiptBoundaries();MutualReceipt();BoundaryRetryAndResume();NavigationAndAbandon();TerminalWrite(); }
        finally { LastStandLoopController.StorageFactory=original;EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
    }
}

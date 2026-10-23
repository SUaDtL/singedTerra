using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

public static class LastStandLoopChecks
{
    const string Playable = "Assets/Scenes/LastStandPrototype.unity";
    const string Review = "Assets/Scenes/BattlefieldReview.unity";
    sealed class MemoryStorage : ILastStandStorage
    {
        public string Value;
        public string Read() => Value;
        public void Write(string value) { Value=value; }
    }
    static void Require(bool value, string label)
    { if (!value) throw new InvalidOperationException("Last Stand Unity check failed: " + label); }
    static void Invoke(object value, string method)
    {
        var found=value.GetType().GetMethod(method,BindingFlags.Instance|BindingFlags.NonPublic|BindingFlags.DeclaredOnly);
        Require(found!=null,"method "+value.GetType().Name+"."+method);
        found.Invoke(value,null);
    }
    static void Focus(EncounterSession session)
    { typeof(EncounterSession).GetField("focused",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(session,true); }
    static void InitializeScene()
    {
        var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Require(art!=null,"scene tank");
        Invoke(art,"Start");
        Invoke(art.GetComponent<ArtHud>(),"Start");
    }
    // Geometry checks inspect the real imported HUD's generated triangles.
    // They do not establish rendered pixel or device acceptance.
    public static void RunChromeChecks()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory;
        try
        {
            LastStandLoopController.StorageFactory = () => new MemoryStorage();
            EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
            InitializeScene();
            var loop = UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
            // Batch edit-mode import does not run this scene owner's OnEnable.
            // Enable the imported EventSystem, as the maintained input fixture does.
            foreach (var events in Resources.FindObjectsOfTypeAll<EventSystem>())
                if (events.gameObject.scene == loop.gameObject.scene)
                { Invoke(events,"OnEnable"); EventSystem.current = events; break; }
            Require(EventSystem.current,"actual scene EventSystem is enabled");
            Focus(loop.Session); loop.RefreshControls();
            var root = UnityEngine.Object.FindFirstObjectByType<Canvas>().transform.Find("LastStandLoopHud");
            CheckChromeGraphic(root.Find("LastStandCard").GetComponent<Image>(),false);
            foreach (var button in root.GetComponentsInChildren<Button>(true))
            {
                if (button.transform.IsChildOf(root.Find("SettingsModal"))) continue;
                CheckChromeButton(button);
            }
            Debug.Log("ST_LS_CHROME_PASS test_backing_and_frame_share_clipped_outline");
            foreach (var page in new[] { "menu", "settings", "help", "about", "confirm" })
            {
                loop.OpenMenu(page); loop.RefreshControls(); Canvas.ForceUpdateCanvases();
                var panel = root.Find("SettingsModal/SettingsPanel");
                Require(panel && panel.Find("ConsoleFrame"),page + " uses shared panel chrome");
                CheckChromeGraphic(panel.GetComponent<Image>(),false);
                CheckChromeGraphic(panel.Find("ConsoleFrame").GetComponent<Graphic>(),false);
                foreach (var button in panel.GetComponentsInChildren<Button>(true)) CheckChromeButton(button);
            }
            Debug.Log("ST_LS_CHROME_PASS test_all_menu_consumers_use_shared_chrome");
            loop.OpenMenu(); loop.RefreshControls(); Canvas.ForceUpdateCanvases();
            var settings = root.Find("SettingsModal/SettingsPanel");
            Button open = null;
            foreach (var button in settings.GetComponentsInChildren<Button>(true)) if (button.name == "MenuSettings") open = button;
            Require(open && open.IsInteractable(),"actual settings control remains available");
            var target = open.targetGraphic;
            Require(target && target.raycastTarget && target.rectTransform == open.transform,"same semantic rectangular target owner");
            var bounds = target.rectTransform.rect;
            var center = RectTransformUtility.WorldToScreenPoint(null,target.rectTransform.TransformPoint(bounds.center));
            Require(target.Raycast(center,null),"native center hit remains admitted");
            ExecuteEvents.Execute(open.gameObject,new BaseEventData(EventSystem.current),ExecuteEvents.submitHandler);
            Require(loop.MenuPage == "settings","native Submit keeps the original settings callback");
            loop.RequestConfirmation("reset-settings"); loop.RefreshControls();
            Require(EventSystem.current.currentSelectedGameObject && EventSystem.current.currentSelectedGameObject.name == "ConfirmCancel",
                "destructive confirmation still initially focuses Cancel");
            Debug.Log("ST_LS_CHROME_PASS test_focus_and_hit_targets_preserved");
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
    static void CheckChromeButton(Button button)
    {
        var rect = (RectTransform)button.transform;
        var savedSize = rect.sizeDelta;
        bool wasActive = button.gameObject.activeSelf, wasAvailable = button.interactable;
        button.gameObject.SetActive(true);
        var pointer = new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left };
        foreach (var size in new[] { new Vector2(44,44), new Vector2(92,44), new Vector2(220,52) })
        {
            rect.sizeDelta = size;
            foreach (var state in new[] { "normal", "selected", "pressed", "disabled" })
            {
                button.interactable = state != "disabled";
                ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerUpHandler);
                ExecuteEvents.Execute(button.gameObject,new BaseEventData(EventSystem.current),ExecuteEvents.deselectHandler);
                if (state == "selected") ExecuteEvents.Execute(button.gameObject,new BaseEventData(EventSystem.current),ExecuteEvents.selectHandler);
                if (state == "pressed") ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerDownHandler);
                var feedback = button.GetComponent("LastStandActionFeedback");
                feedback?.GetType().GetMethod("Refresh").Invoke(feedback,null);
                CheckChromeGraphic(button.GetComponent<Image>(),true);
                var frame = button.transform.Find("ConsoleFrame");
                Require(frame,button.name + " shares the console frame");
                CheckChromeGraphic(frame.GetComponent<Graphic>(),true);
            }
        }
        button.interactable = wasAvailable; rect.sizeDelta = savedSize; button.gameObject.SetActive(wasActive);
    }
    static void CheckChromeGraphic(Graphic graphic, bool action)
    {
        Require(graphic,"chrome graphic exists");
        var rect = graphic.rectTransform.rect;
        float cut = Mathf.Min(action ? 6 : rect.height <= 52 ? 2 : 9,Mathf.Min(rect.width,rect.height)/2);
        using var mesh = new VertexHelper();
        var populate = graphic.GetType().GetMethod("OnPopulateMesh",BindingFlags.Instance|BindingFlags.NonPublic,
            null,new[] { typeof(VertexHelper) },null);
        Require(populate != null,"real UI mesh population method");
        populate.Invoke(graphic,new object[] { mesh });
        foreach (var effect in graphic.GetComponents<BaseMeshEffect>()) if (effect.IsActive()) effect.ModifyMesh(mesh);
        Require(mesh.currentVertCount > 0,graphic.name + " has actual material triangles");
        var vertex = UIVertex.simpleVert;
        for (int i=0;i<mesh.currentVertCount;i++)
        {
            mesh.PopulateUIVertex(ref vertex,i); var p = vertex.position;
            float left=p.x-rect.xMin,right=rect.xMax-p.x,top=rect.yMax-p.y,bottom=p.y-rect.yMin;
            Require(left>=-.001f && right>=-.001f && top>=-.001f && bottom>=-.001f &&
                left+top>=cut-.001f && right+top>=cut-.001f && left+bottom>=cut-.001f && right+bottom>=cut-.001f,
                graphic.transform.parent.name + "/" + graphic.name + " opaque chrome vertex stays inside the clipped outline at " + p);
        }
    }
    public static void Run()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory=LastStandLoopController.StorageFactory;
        try
        {
            Require(new LastStandStore().Read()==null || new LastStandStore().Read().Length>0,"real save adapter readable");
            RealSessionModesAndDamage();
            Debug.Log("ST_LS_UNITY_PASS test_real_session_modes_and_damage");
            LastStandLoopController.StorageFactory=()=>new MemoryStorage();
            PauseTerminalUiAndAudioLifecycle();
            Debug.Log("ST_LS_UNITY_PASS test_pause_terminal_ui_and_audio_lifecycle");
            BatchedFrameRetainsShotAudio();
            Debug.Log("ST_LS_UNITY_PASS test_batched_frame_retains_shot_audio");
            SameTickLauncherKillKeepsImpactCue();
            Debug.Log("ST_LS_UNITY_PASS test_same_tick_launcher_kill_keeps_impact_cue");
        }
        finally
        {
            LastStandLoopController.StorageFactory=factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
    static void RealSessionModesAndDamage()
    {
        EditorSceneManager.OpenScene(Review,OpenSceneMode.Single);
        InitializeScene();
        var review=UnityEngine.Object.FindFirstObjectByType<EncounterSession>();
        Focus(review); review.Deploy();
        Require(review.Model!=null && review.Model.Profile.Id=="review-pacing-v1" &&
            review.Model.CommittedCannonDamage==20 &&
            UnityEngine.Object.FindObjectsByType<LastStandLoopController>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==0,
            "review cannot become awarding gameplay");
        review.ReturnToInspection();
        foreach(bool launcher in new[]{false,true})
        {
            var storage=new MemoryStorage();
            LastStandLoopController.StorageFactory=()=>storage;
            EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
            InitializeScene();
            var loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
            var art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Require(loop!=null && loop.Progression!=null && loop.Progression.SaveState=="ready","playable scene and save");
            Require(UnityEngine.Object.FindObjectsByType<TankPartCallouts>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==0 &&
                UnityEngine.Object.FindFirstObjectByType<Canvas>().transform.Find("PartCallouts")==null,
                "playable garage has no inspection callout owner");
            Require(UnityEngine.Object.FindObjectsByType<AudioListener>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==1,
                "one camera audio listener");
            Focus(loop.Session);loop.RefreshControls();if(launcher)loop.MoveGarageFitting(1);
            loop.Deploy();
            Require(loop.Session.Model!=null && loop.Session.Model.Profile.IsWaveBased &&
                loop.Session.Model.Profile.Id==EncounterProfile.ForTier(1).Id && loop.Session.Model.HasLauncher==launcher &&
                loop.Session.Model.CommittedCannonDamage==20,"committed wave run with selected fitting");
            var baseline=loop.Session.Model;
            AdvanceNaturalDefeat(loop);
            Require(baseline.Status==EncounterStatus.Defeated,"both fittings naturally defeat");
            Require(loop.Phase=="settling" && loop.Progression.PendingDefeat==null && !loop.Progression.HasCheckpoint,
                "defeat finalized without a second payout by actual controller");
            int banked=loop.Progression.Wallet;Require(banked>0 && loop.Progression.GetBestWave(1)>0,"cleared waves banked before defeat");
            typeof(LastStandLoopController).GetField("settle",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop,0f);
            Invoke(loop,"Update");
            Require(loop.Phase=="result","result after settle");
            loop.Claim();
            Require(loop.Phase=="workshop" && loop.Progression.Wallet==banked,"continue reaches workshop without another award");
            EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
            InitializeScene();
            loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
            Focus(loop.Session);
            Require(loop.Phase=="workshop" && loop.Progression.Wallet==banked && !loop.Progression.HasCheckpoint,
                "banked waves restore workshop without resurrecting defeated run");
            loop.Purchase();
            Require(loop.Progression.CannonDamage==30,"permanent purchase");
            loop.Redeploy();
            var upgraded=loop.Session.Model;
            Require(upgraded!=null && upgraded.CommittedCannonDamage==30,"30 damage committed at deploy");
            if(!launcher)
            {
                bool baselineHit=false, upgradedHit=false;
                var a=new EncounterModel(false,EncounterProfile.ForTier(1),20);
                while(a.Tick<80 && !baselineHit)
                {
                    a.Step(); foreach(var e in a.Events)if(e.Kind==EncounterEventKind.Cannon)
                    { Require(a.Foes[e.Slot].Hull==10,"repair baseline first foe survives at 10 HP"); baselineHit=true; break; }
                }
                while(upgraded.Tick<80 && !upgradedHit)
                {
                    upgraded.Step(); foreach(var e in upgraded.Events)if(e.Kind==EncounterEventKind.Cannon)
                    { Require(upgraded.Foes[e.Slot].Hull==0,"repair upgrade first foe dies at 0 HP"); upgradedHit=true; break; }
                }
                Require(baselineHit&&upgradedHit,"actual repair first cannon impacts");
            }
            Require(UnityEngine.Object.FindObjectsByType<Canvas>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==1 &&
                UnityEngine.Object.FindObjectsByType<EncounterSession>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==1,
                "one canvas and session");
            loop.RequestConfirmation("abandon");loop.ConfirmAction();
            Require(!loop.Progression.HasCheckpoint,"cleanup uses confirmed abandon");
        }
    }
    static void AdvanceNaturalDefeat(LastStandLoopController loop)
    {
        // Artificial Editor timestamps qualify session/controller behavior, not
        // real elapsed browser duration or rendered media. Finite wave boundaries
        // are acknowledged only by the actual controller and storage owner.
        int budget=1000;
        while(loop.Session.Model.Status==EncounterStatus.Running && budget-->0)
        {
            var clock=(LastStandRunClock)typeof(EncounterSession).GetField("runClock",BindingFlags.Instance|BindingFlags.NonPublic).GetValue(loop.Session);
            loop.Session.AdvanceAt(clock.LastTimestamp+6);
            Require(loop.Session.Failure=="" && !loop.Session.CheckpointBlocked,"ordinary wave save remains confirmed");
        }
        Require(loop.Session.Model.Status==EncounterStatus.Defeated,"bounded ordinary fitting reaches natural defeat");
    }
    static void PauseTerminalUiAndAudioLifecycle()
    {
        EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
        InitializeScene();
        var loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
        var root=UnityEngine.Object.FindFirstObjectByType<Canvas>();
        Require(root!=null && UnityEngine.Object.FindObjectsByType<EventSystem>(FindObjectsInactive.Include,FindObjectsSortMode.None).Length==1,
            "shared canvas and event system");
        Require(loop.Phase=="garage" && root.transform.Find("LastStandLoopHud")!=null,"garage UI");
        Require(loop.Audio!=null && !loop.Audio.CanPlay,"audio locked before Deploy");
        Focus(loop.Session); loop.Deploy();
        Require(loop.Phase=="battle" && loop.Audio.Unlocked && !loop.Audio.Suspended,
            "battle unlock and audio admission when focused");
        loop.TogglePause();
        Require(loop.Session.Paused && loop.Audio.Suspended && !loop.Audio.CanPlay,"pause stops audio");
        loop.TogglePause();
        Require(!loop.Session.Paused && !loop.Audio.Suspended,"resume allows new audio when focused");
        loop.ToggleMute(); Require(loop.Muted && !loop.Audio.CanPlay,"mute admission");
        loop.ToggleMute(); Require(!loop.Muted && !loop.Audio.Suspended,"session unmute");
        var model=loop.Session.Model;
        AdvanceNaturalDefeat(loop);
        Require(loop.Phase=="settling" && !loop.Progression.HasCheckpoint && loop.Progression.PendingDefeat==null && !loop.Audio.Suspended,
            "saved terminal settles without muting sound");
        int tick=model.Tick; model.Step(); Require(model.Tick==tick,"terminal combat does not step");
        Invoke(loop,"Update");
        Require(loop.Phase=="settling" || loop.Phase=="result","bounded result transition");
    }
    static void BatchedFrameRetainsShotAudio()
    {
        EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
        InitializeScene();
        var loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
        Focus(loop.Session); loop.Deploy();
        Require(loop.Audio.Unlocked && !loop.Audio.Suspended && loop.Session.Model!=null,
            "batched audio dispatch ready");
        var model=loop.Session.Model;
        while(model.Tick<59)model.Step();
        Require(model.CannonShots==0,"first shot follows setup tick");
        // Admit the same batch through ordinary Update without placing its
        // clock anchor ahead of subsequent real Pause/Resume action timestamps.
        typeof(EncounterSession).GetField("runClock",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop.Session,
            new LastStandRunClock(Time.realtimeSinceStartupAsDouble-.11d,model.Profile.Horizon));
        var heard=new List<string>();
        Application.LogCallback observer=(message,stack,type)=>
        {
            if(message.StartsWith("ST_LS_HIT ",StringComparison.Ordinal))heard.Add(message);
        };
        Application.logMessageReceived+=observer;
        try
        {
            Invoke(loop.Session,"Update");
            Require(model.Tick>=61 && model.CannonShots==1 && model.Events.Count==0,
                "one shot occurred before final tick of admitted frame");
            Require(heard.Count==1,"batched shot reaches audio dispatch");
            var admitted=heard.Count;
            loop.TogglePause(); loop.TogglePause();
            Invoke(loop,"OnSessionChanged");
            Require(heard.Count==admitted,"resume does not replay prior batched cues");
        }
        finally { Application.logMessageReceived-=observer; }
    }
    static void SameTickLauncherKillKeepsImpactCue()
    {
        var model=new EncounterModel(true,EncounterProfile.ForTier(1),20);
        bool found=false;
        while(model.Status==EncounterStatus.Running && model.Tick<100000 && !found)
        {
            model.Step();
            foreach(var first in model.Events)
            foreach(var second in model.Events)
            {
                if(first.Kind!=EncounterEventKind.Cannon || second.Kind!=EncounterEventKind.Launcher ||
                    first.Slot!=second.Slot || model.Foes[first.Slot].Alive)continue;
                Require(!first.Killed && second.Killed,
                    "cannon impact and launcher destruction retain event-time outcome");
                found=true; break;
            }
            if(model.AwaitingWaveCommit && model.Status==EncounterStatus.Running)model.ContinueAfterCheckpoint();
        }
        Require(found,"approved launcher profile reaches same-tick finishing shot");
    }
}

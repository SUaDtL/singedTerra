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
    public static void Run()
    {
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
            if(launcher)art.ToggleAttachment();
            Focus(loop.Session); loop.Deploy();
            Require(loop.Session.Model!=null && loop.Session.Model.Profile.Id=="playable-prototype-v1" &&
                loop.Session.Model.CommittedCannonDamage==20,"committed playable run");
            var baseline=loop.Session.Model;
            while(baseline.Status==EncounterStatus.Running)baseline.Step();
            Require(baseline.Status==EncounterStatus.Defeated,"both fittings naturally defeat");
            Invoke(loop,"OnSessionChanged");
            Require(loop.Phase=="settling" && loop.Progression.PendingDefeat!=null,"defeat staged by actual controller");
            typeof(LastStandLoopController).GetField("settle",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop,0f);
            Invoke(loop,"Update");
            Require(loop.Phase=="result","result after settle");
            loop.Claim();
            Require(loop.Phase=="workshop" && loop.Progression.Wallet==1,"one claim and workshop");
            EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
            InitializeScene();
            loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
            Focus(loop.Session);
            Require(loop.Phase=="workshop" && loop.Progression.Wallet==1,"saved claim restores workshop after reload");
            loop.Purchase();
            Require(loop.Progression.CannonDamage==30,"permanent purchase");
            loop.Redeploy();
            var upgraded=loop.Session.Model;
            Require(upgraded!=null && upgraded.CommittedCannonDamage==30,"30 damage committed at deploy");
            if(!launcher)
            {
                bool baselineHit=false, upgradedHit=false;
                var a=new EncounterModel(false,EncounterProfile.PlayablePrototype,20);
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
            upgraded=null; loop.Progression.AbandonRun();
        }
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
        while(model.Status==EncounterStatus.Running)model.Step();
        Invoke(loop,"OnSessionChanged");
        Require(loop.Phase=="settling" && loop.Progression.PendingDefeat!=null && !loop.Audio.Suspended,
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
        typeof(EncounterSession).GetField("accumulated",BindingFlags.Instance|BindingFlags.NonPublic).SetValue(loop.Session,.11d);
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
        var model=new EncounterModel(true,EncounterProfile.PlayablePrototype,20);
        bool found=false;
        while(model.Status==EncounterStatus.Running && !found)
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
        }
        Require(found,"approved launcher profile reaches same-tick finishing shot");
    }
}

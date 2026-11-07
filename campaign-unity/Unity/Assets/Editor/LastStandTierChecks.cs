using System;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Controller/clock integration in the imported scene. Synthetic time is test
// evidence only; the normal-speed browser journey owns real-player proof.
public static class LastStandTierChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    sealed class Storage : ILastStandStorage
    {
        public string Value;
        public bool DenyWrite;
        public string Read() => Value;
        public void Write(string value) { if (DenyWrite) throw new Exception("test denied write"); Value = value; }
    }
    static void Require(bool value, string text) { if (!value) throw new Exception("Tier integration: " + text); }
    static void Invoke(object target, string name) { target.GetType().GetMethod(name, Private).Invoke(target, null); }
    static LastStandLoopController Load(Storage storage)
    {
        LastStandLoopController.StorageFactory = () => storage;
        EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
        var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Invoke(art, "Start"); Invoke(art.GetComponent<ArtHud>(), "Start");
        var loop = art.GetComponent<LastStandLoopController>();
        typeof(EncounterSession).GetField("focused", Private).SetValue(loop.Session, true);
        Require(loop.Progression.SaveState == "ready", "confirmed save on load");
        return loop;
    }
    static LastStandRunClock Clock(LastStandLoopController loop) =>
        (LastStandRunClock)typeof(EncounterSession).GetField("runClock", Private).GetValue(loop.Session);
    static void Advance(LastStandLoopController loop, double timestamp)
    {
        loop.Session.AdvanceAt(timestamp);
        for (int budget = 0; loop.Session.CatchingUp && budget < 40; budget++) loop.Session.AdvanceAt(timestamp);
        Require(!loop.Session.CatchingUp && loop.Session.Failure == "", "bounded catch-up completes");
    }
    static void Until(LastStandLoopController loop,Func<bool> finished,int budget=1200)
    {
        while(!finished() && budget-->0 && loop.Session.Model!=null)
            Advance(loop,Clock(loop).LastTimestamp+.05);
        Require(finished(),"requested actual wave boundary reached; phase="+loop.Phase+" failure="+loop.Session.Failure);
    }
    static Storage BeforeAdvancement()
    {
        // Numerical setup only: gift explicit permanent caps, then use actual
        // production combat and commits to establish the wave-299 checkpoint.
        var storage=new Storage();LastStandProgression.Load(storage);
        foreach(var track in LastStandUpgradeCatalog.Tracks)
            storage.Value=storage.Value.Replace("\""+track.Key+"\":0","\""+track.Key+"\":"+track.PermanentCap);
        var progression=LastStandProgression.Load(storage);Require(progression.TryDeploy(),"numerical fixture reserves a real run");
        var model=progression.Checkpoint.RestoreModel();var shop=progression.Checkpoint.RestoreShop();
        for(int wave=1;wave<=299;wave++)
        {
            while(model.Status==EncounterStatus.Running && !model.AwaitingWaveCommit)model.Step();
            Require(model.AwaitingWaveCommit && model.Hull>0,"numerical setup clears its cohort");shop.ObserveAuthoritativeKills(model.Kills);
            Require(progression.TryCommitWave(model,shop),"numerical setup durably commits each preceding wave");
            if(wave<299)Require(model.ContinueAfterCheckpoint(),"next setup wave follows its commit");
        }
        return storage;
    }
    public static void Run()
    {
        using var preferencesScope=new LastStandTestPreferencesScope();
        var factory=LastStandLoopController.StorageFactory;
        try
        {
            var loop=Load(new Storage());loop.SelectTier(2);
            Require(loop.Progression.SelectedTier==1 && !loop.Progression.TierTwoUnlocked,"locked tier cannot be selected or admitted");
            var storage=BeforeAdvancement();string beforeAdvancement=storage.Value;
            loop=Load(storage);int wallet=loop.Progression.Wallet;
            Require(loop.Session.Model==null && loop.Progression.Checkpoint.CompletedWave==299 && !loop.Progression.TierTwoUnlocked,
                "reload offers explicit Resume with wave 299 saved and no premature unlock");
            loop.ResumeRun();var model=loop.Session.Model;
            Require(model!=null && model.Wave==300 && model.CompletedWave==299 && model.Profile.Tier==1 &&
                model.Profile.IsWaveBased && loop.Session.Paused,"resume restores the admitted tier and starts the next wave paused");
            int tick=model.Tick;double at=Clock(loop).LastTimestamp;
            Advance(loop,at+100);Require(model.Tick==tick,"paused closed-tab time cannot advance a wave");
            Require(loop.Session.TrySetSpeedAt(at+100,1),"explicit 1x action resumes actual simulation");
            loop.SelectTier(2);Require(model.Profile.Tier==1 && loop.Progression.ActiveTier==1,"selection cannot rewrite admitted rules");
            storage.DenyWrite=true;Until(loop,()=>loop.Session.CheckpointBlocked);
            Require(model.CompletedWave==300 && model.AwaitingWaveCommit && loop.Phase=="save-error" &&
                !loop.Progression.TierTwoUnlocked && loop.Progression.GetBestWave(1)==299 && loop.Progression.Wallet==wallet &&
                loop.Progression.PendingDefeat==null,"failed advancement save publishes no reward, checkpoint, unlock or legacy claim");
            storage.DenyWrite=false;loop.RetrySave();
            var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),300);
            Require(loop.Phase=="battle" && loop.Session.Paused && model.Wave==301 && loop.Progression.Checkpoint.CompletedWave==300 &&
                loop.Progression.TierTwoUnlocked && loop.Progression.SelectedTier==1 && loop.Progression.Wallet==wallet+reward.RepeatableSalvage+reward.FirstClearSalvage,
                "retry banks wave 300 once, unlocks Tier 2, and keeps the player in Tier 1");
            wallet=loop.Progression.Wallet;string saved=storage.Value;loop.RetrySave();
            Require(storage.Value==saved && loop.Progression.Wallet==wallet,"duplicate retry cannot bank the milestone again");
            loop.RequestNavigation(false);loop=Load(storage);
            Require(loop.Session.Model==null && loop.Progression.Checkpoint.CompletedWave==300,"navigation and reload retain the completed boundary");
            var expected=loop.Progression.Checkpoint.RestoreModel();expected.ContinueAfterCheckpoint();loop.ResumeRun();
            Require(loop.Session.Model.Snapshot()==expected.Snapshot() && loop.Session.Paused,"resumed next-wave state is exact and paused");
            loop.SelectTier(2);Require(loop.Progression.SelectedTier==1,"tier change cannot silently replace a resumable run");
            loop.RequestConfirmation("abandon");loop.ConfirmAction();loop.SelectTier(2);loop.Deploy();
            Require(loop.Progression.ActiveTier==2 && loop.Session.Model.Profile.Tier==2 && loop.Session.Model.Profile.IsWaveBased,
                "explicit abandonment and manual selection admit Tier 2");
            Until(loop,()=>loop.Session.Model.ActiveCount>0);
            int expectedHull=LastStandWaveCatalog.ForWave(2,1).EnemyHull;bool observed=false;
            foreach(var foe in loop.Session.Model.Foes)if(foe.Alive){observed=true;Require(foe.MaximumHull==expectedHull,"Tier 2 imported scene uses its authored wave scaling");}
            Require(observed,"a real Tier 2 foe spawned");loop=Load(storage);
            Require(loop.Session.Model==null && loop.Progression.ActiveTier==2 && loop.Progression.Checkpoint.CompletedWave==0 &&
                loop.Progression.GetBestWave(2)==0 && loop.Progression.Wallet==wallet,"unfinished Tier 2 reload restores its starting checkpoint without rewards");
            LegacyLimitAcknowledgement();
            ExactWaveDefeat(beforeAdvancement);
            Debug.Log("ST_LS_TIER_PASS test_tier_goal_result_controller_and_layout");
        }
        finally
        {
            LastStandLoopController.StorageFactory=factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
    static void LegacyLimitAcknowledgement()
    {
        var storage=new Storage {Value="{\"version\":3,\"credits\":2147483647,\"permanentLevels\":{\"cannonAttack\":0,\"launcherAttack\":0,\"hullCapacity\":0,\"armor\":0,\"cannonCycle\":0,\"fieldRepair\":0},"+
            "\"nextRunId\":2,\"lastFinalizedRunId\":0,\"selectedTier\":1,\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":3600,\"bestKills1\":30,\"bestTicks2\":0,\"bestKills2\":0,\"tierTwoUnlocked\":true}},"+
            "\"pendingDefeat\":{\"runId\":1,\"elapsedTicks\":3600,\"kills\":30,\"reward\":0,\"tier\":1,\"profileVersion\":\"tier-goals-v1\",\"isLimit\":true,\"newBestTime\":true,\"newBestKills\":true,\"unlockedTierTwo\":true}}"};
        var loop=Load(storage);var canvas=UnityEngine.Object.FindFirstObjectByType<Canvas>();
        var button=canvas.transform.Find("LastStandLoopHud/LastStandDock/Claim").GetComponent<Button>();
        Require(button.IsInteractable() && button.GetComponentInChildren<Text>().text=="CONTINUE",
            "migrated zero-reward acknowledgement stays available at a saturated wallet");button.onClick.Invoke();
        Require(loop.Phase=="workshop" && loop.Progression.PendingDefeat==null && loop.Progression.Wallet==int.MaxValue &&
            loop.Progression.GetBestWave(1)==0,"legacy acknowledgement pays zero without fabricating wave history");
        loop.Claim();Require(loop.Progression.Wallet==int.MaxValue,"repeated legacy acknowledgement pays nothing");
    }
    static void ExactWaveDefeat(string checkpoint)
    {
        var storage=new Storage {Value=checkpoint};var loop=Load(storage);int wallet=loop.Progression.Wallet;
        loop.ResumeRun();Require(loop.Session.TrySetSpeedAt(Clock(loop).LastTimestamp,1),"resume terminal-boundary fixture");
        var model=loop.Session.Model;int lastKill=LastStandWaveCatalog.TotalEnemiesThroughWave(300)-1;
        Until(loop,()=>model.Kills==lastKill && model.ActiveCount==1);
        EncounterFoe target=null;foreach(var foe in model.Foes)if(foe.Alive){target=foe;break;}
        Require(target!=null,"last authored enemy remains live before the terminal step");
        // Deliberate same-tick terminal fixture: the real next Step must resolve
        // the final kill and incoming hit before controller persistence runs.
        typeof(EncounterFoe).GetProperty("Distance").SetValue(target,0);
        typeof(EncounterFoe).GetProperty("Hull").SetValue(target,1);
        typeof(EncounterFoe).GetProperty("Damage").SetValue(target,int.MaxValue);
        typeof(EncounterModel).GetField("<Hull>k__BackingField",Private).SetValue(model,1);
        typeof(EncounterModel).GetField("nextCannon",Private).SetValue(model,model.Tick);
        typeof(EncounterModel).GetField("nextRepair",Private).SetValue(model,model.Tick+100);
        storage.DenyWrite=true;Until(loop,()=>loop.Session.CheckpointBlocked);
        Require(model.Status==EncounterStatus.Defeated && model.CompletedWave==300 && !loop.Progression.TierTwoUnlocked &&
            loop.Progression.Checkpoint.CompletedWave==299,"simultaneous clear/death waits for one atomic reward and finalization write");
        storage.DenyWrite=false;loop.RetrySave();var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),300);
        Require(loop.Phase=="result" && loop.Session.Model==null && !loop.Progression.HasCheckpoint && loop.Progression.PendingDefeat==null &&
            loop.Progression.GetBestWave(1)==300 && loop.Progression.TierTwoUnlocked &&
            loop.Progression.Wallet==wallet+reward.RepeatableSalvage+reward.FirstClearSalvage,
            "same-tick wave completion awards once and finalizes without a resumable dead run or separate Claim");
        Require(!LastStandProgression.Load(storage).HasCheckpoint,"terminal clear cannot resurrect on reload");
    }
}

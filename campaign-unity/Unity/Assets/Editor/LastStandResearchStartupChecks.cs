using System;
using System.IO;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Real imported-scene controller recovery. Only storage is substituted; the
// clock, profile owner, menu action and controller lifecycle remain production.
// Run after any existing owned Editor process has exited.
public static class LastStandResearchStartupChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    sealed class Store : ILastStandStorage
    {
        public string Raw;
        public bool DenyRead, DenyWrite;
        public int Writes, WriteAttempts, DenyWriteNumber;
        public string Read()
        { if (DenyRead) throw new InvalidOperationException("startup test read fault"); return Raw; }
        public void Write(string value)
        {
            WriteAttempts++;
            if (DenyWrite || WriteAttempts == DenyWriteNumber) throw new InvalidOperationException("startup test write fault");
            Raw = value; Writes++;
        }
    }
    static void Need(bool condition, string reason)
    { if (!condition) throw new InvalidOperationException("Research startup: " + reason); }
    static object Field(object target, string name) => target.GetType().GetField(name, Private).GetValue(target);
    static void Set(object target, string name, object value) => target.GetType().GetField(name, Private).SetValue(target, value);
    static void Invoke(object target, string name) => target.GetType().GetMethod(name, Private).Invoke(target, null);
    static Store EligibleStore()
    {
        string path = Path.GetFullPath(Path.Combine(Application.dataPath, "../../Tools/last_stand_research/fixtures/legacy-v4.json"));
        var store = new Store { Raw = File.ReadAllText(path) };
        Need(LastStandProgression.Load(store).SaveState == "ready", "eligible production fixture migrated");
        return store;
    }
    static LastStandLoopController Open(Store store)
    {
        LastStandLoopController.StorageFactory = () => store;
        EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
        var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
        Need(art, "actual imported TankPresentation");
        var review = art.GetComponent<BattlefieldReview>(); Need(review, "actual BattlefieldReview"); Invoke(review, "Awake");
        Invoke(art, "Start"); Invoke(art.GetComponent<ArtHud>(), "Start");
        var loop = art.GetComponent<LastStandLoopController>(); Need(loop && loop.Session, "actual controller/session initialized");
        Set(loop.Session, "focused", true); Set(loop.Session, "applicationPaused", false);
        return loop;
    }
    static void Fund(LastStandLoopController loop, LastStandResearchTrackId track)
    {
        loop.OpenResearch(); var snapshot = loop.ResearchSnapshot;
        loop.SubmitResearch(new LastStandResearchIntent { Action = LastStandResearchAction.Start, Slot = 0,
            Track = track, Rank = 1, ExpectedRevision = snapshot.revision,
            ExpectedActiveIdentity = snapshot.slots[0].active?.identity ?? 0,
            ExpectedQueuedIdentity = snapshot.slots[0].queued?.identity ?? 0 });
        Need(loop.Progression.ResearchSnapshot.slots[0].active?.track == track, "controller funds requested research");
        loop.CloseMenu(); loop.ResumeRun();
        Need(loop.Session.Model != null && loop.Phase == "battle", "resume actual checkpoint for affected action");
    }
    static void MakeDue(LastStandLoopController loop)
    {
        var project = loop.Progression.ResearchSnapshot.slots[0].active;
        Need(project != null, "funded project before synthetic elapsed interval");
        var clock = Field(loop, "researchClock");
        double anchor = (double)Field(clock, "anchor");
        Set(clock, "anchor", anchor - (project.durationMilliseconds - project.earnedMilliseconds) / 1000d - 1);
        Set(loop, "nextResearchCompletionAt", 0d);
    }
    static void Recover(bool firstWrite)
    {
        using var preferences = new LastStandTestPreferencesScope();
        var previous = LastStandLoopController.StorageFactory;
        var store = new Store();
        if (!firstWrite)
        {
            // The old owner generated this compatibility fixture. Migrate it
            // through the current writer before forcing the controller read.
            store = EligibleStore();
            store.DenyRead = true;
        }
        else store.DenyWrite = true;
        try
        {
            var loop = Open(store);
            Need(loop.Progression.SaveState != "ready" && Field(loop, "researchClock") == null, "initial fault leaves research uninitialized");
            store.DenyRead = store.DenyWrite = false;
            loop.RetrySave();
            Need(loop.Progression.SaveState == "ready" && Field(loop, "researchClock") != null && loop.ResearchSnapshot != null,
                "successful Retry creates missing research clock");
            var clock = Field(loop, "researchClock"); int writes = store.Writes;
            loop.RefreshResearch();
            Need(store.Writes > writes && ReferenceEquals(clock, Field(loop, "researchClock")), "recovered clock can persist and is not recreated");
            if (!firstWrite)
            {
                int wallet = loop.Progression.Wallet;
                loop.OpenResearch(); Need(loop.MenuPage == "research" && loop.ResearchCanAct, "actual Lab opens after recovered read");
                var snapshot = loop.ResearchSnapshot;
                loop.SubmitResearch(new LastStandResearchIntent { Action = LastStandResearchAction.Start, Slot = 0,
                    Track = LastStandResearchTrackId.GameSpeed, Rank = 1, ExpectedRevision = snapshot.revision,
                    ExpectedActiveIdentity = snapshot.slots[0].active?.identity ?? 0,
                    ExpectedQueuedIdentity = snapshot.slots[0].queued?.identity ?? 0 });
                Need(loop.Progression.Wallet == wallet - 20 && loop.Progression.ResearchSnapshot.slots[0].active != null,
                    "actual recovered controller funds a project through shared profile transaction");
                Need(LastStandProgression.Load(store).ResearchSnapshot.slots[0].active != null, "recovered controller project reloads");
            }
        }
        finally
        {
            LastStandLoopController.StorageFactory = previous;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
    static void DueSpeed()
    {
        using var preferences = new LastStandTestPreferencesScope();
        var previous = LastStandLoopController.StorageFactory;
        try
        {
            var store = EligibleStore(); var loop = Open(store); Fund(loop, LastStandResearchTrackId.GameSpeed);
            Need(loop.Session.MaximumSpeed == 1, "speed remains locked before completion");
            loop.TogglePause(); Need(loop.Session.SelectedSpeed == 1, "resume at existing 1x entitlement");
            MakeDue(loop); loop.ChangeSpeed(1);
            Need(loop.Progression.ResearchRank(LastStandResearchTrackId.GameSpeed) == 1 &&
                loop.Session.MaximumSpeed == 1.5 && loop.Session.SelectedSpeed == 1.5,
                "speed action reconciles due rank before validating requested rate");
            Need(LastStandProgression.Load(store).MaximumGameSpeed == 1.5, "new speed entitlement was persisted before use");
        }
        finally
        {
            LastStandLoopController.StorageFactory = previous;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
    static void DueWaveRetry()
    {
        using var preferences = new LastStandTestPreferencesScope();
        var previous = LastStandLoopController.StorageFactory;
        try
        {
            var store = EligibleStore(); var loop = Open(store); Fund(loop, LastStandResearchTrackId.SalvageRecovery);
            int wave = loop.Progression.Checkpoint.CompletedWave, wallet = loop.Progression.Wallet;
            loop.TogglePause(); Need(!loop.Session.Paused, "run resumes before boundary");
            bool armed = false;
            loop.Session.Stepped += model => {
                if (!armed && model.AwaitingWaveCommit)
                { armed = true; MakeDue(loop); store.DenyWrite = true; }
            };
            var runClock = (LastStandRunClock)Field(loop.Session, "runClock"); double timestamp = runClock.LastTimestamp;
            int callbacks = 20000;
            while (!armed && loop.Session.Model.Status == EncounterStatus.Running && callbacks-- > 0)
                loop.Session.AdvanceAt(timestamp += .2);
            Need(armed && loop.Session.Model.AwaitingWaveCommit && loop.Session.CheckpointBlocked &&
                loop.Progression.Checkpoint.CompletedWave == wave && loop.Progression.Wallet == wallet &&
                loop.Progression.ResearchRank(LastStandResearchTrackId.SalvageRecovery) == 0,
                "failed boundary research write retains both wave and old committed benefits");
            // Allow the research retry, then fail the distinct reward/checkpoint
            // write in that same RetrySave call. Neither failure may skip wave.
            store.DenyWrite = false; store.DenyWriteNumber = store.WriteAttempts + 2;
            loop.RetrySave();
            Need(loop.Progression.ResearchRank(LastStandResearchTrackId.SalvageRecovery) == 1 &&
                loop.Session.Model.AwaitingWaveCommit && loop.Session.CheckpointBlocked &&
                loop.Progression.Checkpoint.CompletedWave == wave && loop.Progression.Wallet == wallet,
                "research confirmation alone cannot release an unconfirmed wave reward");
            store.DenyWriteNumber = 0; loop.RetrySave();
            Need(loop.Progression.Checkpoint.CompletedWave == wave + 1 && !loop.Session.Model.AwaitingWaveCommit &&
                !loop.Session.CheckpointBlocked && loop.Session.Paused && loop.Progression.Wallet > wallet,
                "confirmed wave retry advances exactly once and retains manual pause");
            int savedWallet = loop.Progression.Wallet; long sequence = loop.Progression.ResearchSnapshot.completionSequence;
            loop.RetrySave();
            Need(loop.Progression.Wallet == savedWallet && loop.Progression.ResearchSnapshot.completionSequence == sequence &&
                LastStandProgression.Load(store).Checkpoint.CompletedWave == wave + 1,
                "repeated retry cannot replay completion or boundary reward");
        }
        finally
        {
            LastStandLoopController.StorageFactory = previous;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
    public static void Run()
    {
        Recover(true); Debug.Log("ST_LS_RESEARCH_STARTUP_PASS fresh_write_retry_initializes_clock");
        Recover(false); Debug.Log("ST_LS_RESEARCH_STARTUP_PASS initial_read_retry_can_start_research");
        DueSpeed(); Debug.Log("ST_LS_RESEARCH_STARTUP_PASS due_completion_before_speed_validation");
        DueWaveRetry(); Debug.Log("ST_LS_RESEARCH_STARTUP_PASS due_boundary_research_and_wave_write_retries");
    }
}

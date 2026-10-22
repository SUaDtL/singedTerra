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
    public static void Run()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory;
        try
        {
            var storage = new Storage();
            var loop = Load(storage);
            loop.SelectTier(2);
            Require(loop.Progression.SelectedTier == 1 && !loop.Progression.TierTwoUnlocked,
                "locked tier cannot be selected or admitted");
            loop.Deploy();
            var model = loop.Session.Model;
            Require(model != null && model.Profile.Tier == 1 && loop.Progression.ActiveTier == 1, "run binds admitted tier");
            double at = Clock(loop).LastTimestamp + 59.95;
            Advance(loop, at);
            Require(model.Tick == 1199 && !loop.Progression.TierTwoUnlocked && loop.Progression.GetBestTicks(1) == 0,
                "unfinished goal approach grants nothing");
            loop.Session.TogglePauseAt(at); Advance(loop, at + 100);
            Require(model.Tick == 1199, "pause does not charge goal time");
            loop.Session.TogglePauseAt(at + 100); Advance(loop, at + 100.05);
            Require(model.Tick == 1200 && loop.Phase == "battle" && !loop.Progression.TierTwoUnlocked,
                "goal acknowledges without ending or saving the live run");
            loop.SelectTier(2);
            Require(model.Profile.Tier == 1 && loop.Progression.ActiveTier == 1, "selection cannot rewrite admitted rules");
            storage.DenyWrite = true;
            Advance(loop, at + 140);
            Require(loop.Phase == "save-error" && loop.Progression.PendingDefeat == null &&
                !loop.Progression.TierTwoUnlocked && loop.Progression.GetBestTicks(1) == 0,
                "failed terminal save cannot present committed records or unlock");
            storage.DenyWrite = false; loop.RetrySave();
            Require(loop.Phase == "result" && loop.Progression.PendingDefeat.Tier == 1 && loop.Progression.TierTwoUnlocked &&
                loop.Progression.GetBestTicks(1) == model.Tick && loop.Progression.Wallet == 0,
                "retry commits the same terminal run without automatic Claim");
            loop.SelectTier(2); loop.Deploy();
            Require(loop.Progression.SelectedTier == 1 && loop.Progression.ActiveRunId == 0,
                "pending result resolves before selection or deploy");
            loop.Claim(); loop.Claim();
            Require(loop.Progression.Wallet == 1, "manual reward exactly once");
            loop = Load(storage); loop.SelectTier(2); loop.Deploy();
            Require(loop.Progression.ActiveTier == 2 && loop.Session.Model.Profile.Id ==
                LastStandTierCatalog.Get(2).EncounterProfileId, "saved unlock survives reload and admits Tier 2");
            Advance(loop, Clock(loop).LastTimestamp + .05);
            Require(loop.Session.Model.Foes[0].MaximumHull == 38, "Tier 2 real scene uses scaled combat");
            loop = Load(storage);
            Require(loop.Progression.GetBestTicks(2) == 0 && loop.Progression.Wallet == 1 && loop.Progression.ActiveRunId == 0,
                "unfinished Tier 2 reload does not invent records or rewards");
            LimitResultAndRecovery();
            ExactGoalDefeat();
            Debug.Log("ST_LS_TIER_PASS test_tier_goal_result_controller_and_layout");
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }

    static void LimitResultAndRecovery()
    {
        var storage = new Storage { Value = "{\"version\":1,\"credits\":2147483647,\"permanentLevel\":0," +
            "\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}" };
        var loop = Load(storage);
        var art = loop.GetComponent<TankPresentation>();
        if (!art.showingLauncher) art.ToggleAttachment();
        loop.Deploy(); var model = loop.Session.Model;
        // Explicit numerical cap fixture, never earned-wallet/player evidence.
        int Effect(LastStandUpgradeTrackId id) => LastStandUpgradeCatalog.Get(id).EffectAt(8, 1);
        model.TryApplyPlayableAttackProjection(Effect(LastStandUpgradeTrackId.CannonAttack), Effect(LastStandUpgradeTrackId.LauncherAttack));
        model.TryApplyPlayableDefenseProjection(Effect(LastStandUpgradeTrackId.HullCapacity),
            hit => LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.Armor).EffectAt(8, hit));
        model.TryApplyPlayableCannonPeriodProjection(Effect(LastStandUpgradeTrackId.CannonCycle));
        storage.DenyWrite = true;
        Advance(loop, Clock(loop).LastTimestamp + 180);
        Require(model.Status == EncounterStatus.Limit && loop.Phase == "save-error" &&
            loop.Progression.PendingDefeat == null && !loop.Progression.TierTwoUnlocked,
            "unconfirmed horizon cannot publish saved records or unlock");
        storage.DenyWrite = false; loop.RetrySave();
        Require(loop.Phase == "result" && loop.Session.Model == null && loop.Progression.PendingDefeat.IsLimit &&
            loop.Progression.PendingDefeat.Reward == 0 && loop.Progression.GetBestTicks(1) == 3600 &&
            loop.Progression.TierTwoUnlocked, "limit retry survives session return reentrancy");
        loop = Load(storage);
        var canvas = UnityEngine.Object.FindFirstObjectByType<Canvas>();
        var button = canvas.transform.Find("LastStandLoopHud/LastStandDock/Claim").GetComponent<Button>();
        Require(button.IsInteractable() && button.GetComponentInChildren<Text>().text == "CONTINUE",
            "zero-reward limit acknowledgement remains available at saturated wallet");
        button.onClick.Invoke();
        Require(loop.Phase == "workshop" && loop.Progression.PendingDefeat == null &&
            loop.Progression.Wallet == int.MaxValue, "limit acknowledgement pays zero and clears pending result");
        loop.Claim(); Require(loop.Progression.Wallet == int.MaxValue, "repeated limit acknowledgement pays nothing");
    }

    static void ExactGoalDefeat()
    {
        var loop = Load(new Storage());
        var art = loop.GetComponent<TankPresentation>();
        if (!art.showingLauncher) art.ToggleAttachment();
        loop.Deploy(); var model = loop.Session.Model;
        Advance(loop, Clock(loop).LastTimestamp + 59.95);
        Require(model.Tick == 1199, "exact-goal terminal fixture approaches threshold");
        // Deliberate terminal-boundary fixture. The actual next Step resolves
        // combat and sets status before the controller evaluates its result.
        typeof(EncounterModel).GetField("<Hull>k__BackingField", Private).SetValue(model, 0);
        Advance(loop, Clock(loop).LastTimestamp + .05);
        Require(model.Status == EncounterStatus.Defeated && model.Tick == 1200 &&
            loop.Progression.PendingDefeat.ElapsedTicks == 1200 && loop.Progression.TierTwoUnlocked,
            "same-tick defeat qualifies only after completed combat resolution");
    }
}

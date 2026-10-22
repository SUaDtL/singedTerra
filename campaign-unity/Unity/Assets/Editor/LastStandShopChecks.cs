using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// Actual imported scene/controller/session checks with disposable local storage.
public static class LastStandShopChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    const string Playable = "Assets/Scenes/LastStandPrototype.unity";
    static readonly int[] Levels = { 3, 2, 2, 3, 1, 2 };
    sealed class MemoryStorage : ILastStandStorage
    {
        public string Value;
        public bool FailWrite, FailReadBack;
        public int Writes, SuccessfulWrites;
        public Action BeforeWrite, BeforeReadBack;
        bool awaitingReadBack;
        public string Read()
        {
            if (awaitingReadBack)
            {
                BeforeReadBack?.Invoke();
                awaitingReadBack = false;
                if (FailReadBack) throw new InvalidOperationException("unconfirmed read-back");
            }
            return Value;
        }
        public void Write(string value)
        {
            BeforeWrite?.Invoke(); Writes++;
            if (FailWrite) throw new InvalidOperationException("denied write");
            Value = value; SuccessfulWrites++; awaitingReadBack = true;
        }
    }
    sealed class Fixture
    {
        public readonly TankPresentation Art;
        public readonly EncounterSession Session;
        public readonly LastStandLoopController Loop;
        public readonly MemoryStorage Storage;
        public Fixture(bool launcher, int[] levels, MemoryStorage storage = null)
        {
            Storage = storage ?? new MemoryStorage { Value = Save(levels) };
            LastStandLoopController.StorageFactory = () => Storage;
            EditorSceneManager.OpenScene(Playable, OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art, "Start"); Invoke(Art.GetComponent<ArtHud>(), "Start");
            Loop = Art.GetComponent<LastStandLoopController>(); Session = Loop.Session;
            SetField(Session, "focused", true); SetField(Session, "applicationPaused", false);
            if (Art.showingLauncher != launcher) Art.ToggleAttachment();
        }
        public double Timestamp => ((LastStandRunClock)typeof(EncounterSession).GetField("runClock", Private)
            .GetValue(Session)).LastTimestamp;
        public void AdvanceTicks(int count)
        {
            double target = Timestamp + count * LastStandRunClock.StepSeconds;
            Session.AdvanceAt(target);
            while (Session.CatchingUp) Session.AdvanceAt(target);
        }
    }
    static string Save(int[] levels, int nextRunId = 7, int wallet = 20)
    {
        var fields = new List<string>();
        for (int i = 0; i < LastStandUpgradeCatalog.Tracks.Count; i++)
            fields.Add("\"" + LastStandUpgradeCatalog.Tracks[i].Key + "\":" + levels[i]);
        // Ordinary shop scenarios start with current-schema data. Historical
        // migration scenarios supply their explicit versioned fixtures below.
        return "{\"version\":3,\"credits\":" + wallet + ",\"permanentLevels\":{" + String.Join(",", fields) +
            "},\"nextRunId\":" + nextRunId + ",\"lastFinalizedRunId\":0,\"selectedTier\":1," +
            "\"tierRecords\":{\"tier-goals-v1\":{\"bestTicks1\":0,\"bestKills1\":0,\"bestTicks2\":0," +
            "\"bestKills2\":0,\"tierTwoUnlocked\":false}},\"pendingDefeat\":null}";
    }
    static void Require(bool value, string label)
    { if (!value) throw new InvalidOperationException("Last Stand shop deployment check failed: " + label); }
    static void SetField(object owner, string name, object value) => owner.GetType().GetField(name, Private).SetValue(owner, value);
    static void Invoke(object owner, string name, params object[] args) =>
        owner.GetType().GetMethod(name, Private | BindingFlags.DeclaredOnly).Invoke(owner, args);
    static LastStandShopState Shop(EncounterSession session)
    {
        // The baseline compiles normally; absence is an actual runtime assertion.
        var property = typeof(EncounterSession).GetProperty("Shop");
        Require(property != null, "actual session exposes its deployed run ledger");
        return (LastStandShopState)property.GetValue(session);
    }
    static void Fresh(LastStandShopState shop, int runId, bool launcher, int[] levels)
    {
        Require(shop != null && shop.RunId == runId && shop.Fitting ==
            (launcher ? LastStandFitting.Launcher : LastStandFitting.Repair), "fresh ledger belongs to reserved run and fitting");
        Require(shop.Scrap == 0 && shop.EarnedScrap == 0 && shop.SpentScrap == 0 && shop.UniqueKills == 0 && shop.Version == 0,
            "deployment starts zero Scrap accounting and initial revision");
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            var actual = shop.GetTrack(track.Id);
            Require(actual.PermanentLevel == levels[(int)track.Id] && actual.RunPurchases == 0 &&
                actual.CurrentLevel == levels[(int)track.Id] && actual.NextPrice == 5,
                "exact frozen P, zero n and independent first price for " + track.Key);
        }
    }
    static void FrozenProjection(bool launcher)
    {
        var f = new Fixture(launcher, Levels);
        f.Storage.BeforeWrite = () => Require(f.Session.Model == null && f.Loop.Progression.ActiveRunId == 0,
            "no model starts before reserved write");
        f.Storage.BeforeReadBack = () => Require(f.Session.Model == null && f.Loop.Progression.ActiveRunId == 0,
            "no model starts before reservation read-back");
        f.Loop.Deploy();
        var model = f.Session.Model;
        Require(model != null && f.Storage.SuccessfulWrites == 1 && f.Loop.Progression.ActiveRunId == 7 &&
            f.Loop.Progression.NextRunId == 8 && model.Tick == 0, "one verified reservation precedes actual deployment");
        Require(model.CurrentMaximumHull == 150 && model.Hull == 150 && model.CurrentCannonDamage == 50 &&
            model.CommittedCannonDamage == 50 && model.CurrentCannonPeriod == 19 &&
            model.CurrentLauncherDamage == (launcher ? 20 : 12) && model.CurrentRepairAmount == (launcher ? 3 : 5),
            "all fitting-specific committed effects initialize actual combat before its first tick");
        var shop = Shop(f.Session); Fresh(shop, 7, launcher, Levels);
        string frozen = model.Snapshot();
        f.Loop.Deploy(); f.Session.Deploy();
        f.Art.ToggleAttachment();
        Require(f.Session.Model == model && Shop(f.Session) == shop && model.Snapshot() == frozen &&
            model.HasLauncher == launcher && f.Art.showingLauncher == launcher && f.Storage.Writes == 1,
            "duplicate deploy and attempted fitting switch cannot replace running snapshot");
        f.Storage.Value = Save(new int[6], 90);
        f.Loop.RetrySave();
        Require(f.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.HullCapacity) == 0 &&
            Shop(f.Session) == shop && shop.GetTrack(LastStandUpgradeTrackId.HullCapacity).PermanentLevel == 2 &&
            model.Snapshot() == frozen, "later committed storage observation cannot mutate live permanent baseline");
        int admitted = 0; bool cannon = false, auxiliary = false, armor = false;
        f.Session.Stepped += current =>
        {
            admitted++;
            if (current.Tick == 1)
            {
                // A durable actual foe keeps shot amounts away from the existing
                // remaining-hull clamp and admits real hits/repair in this window.
                var foe = current.Foes[0];
                typeof(EncounterFoe).GetProperty("Hull").SetValue(foe, 10000);
                typeof(EncounterFoe).GetProperty("MaximumHull").SetValue(foe, 10000);
                typeof(EncounterFoe).GetProperty("Distance").SetValue(foe, 0);
            }
            foreach (var evt in current.Events)
            {
                if (evt.Kind == EncounterEventKind.Cannon) { cannon = true; Require(evt.Amount == 50, "actual cannon uses committed P"); }
                if (evt.Kind == EncounterEventKind.Launcher) { auxiliary = true; Require(evt.Amount == 20, "actual launcher uses committed P"); }
                if (evt.Kind == EncounterEventKind.Repair) { auxiliary = true; Require(evt.Amount > 0 && evt.Amount <= 5, "actual repair obeys committed P and clamp"); }
                if (evt.Kind == EncounterEventKind.CloseHit || evt.Kind == EncounterEventKind.RangedHit)
                { armor = true; Require(evt.Amount == Math.Max(1, current.Foes[evt.Slot].Damage - 3), "actual incoming hit uses committed armor"); }
            }
        };
        f.AdvanceTicks(200);
        Require(model.Tick == 200 && admitted == 200 && cannon && auxiliary && armor,
            "sole session clock admits exact ticks with real committed combat events");
        Require(UnityEngine.Object.FindObjectsByType<EncounterSession>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length == 1 &&
            UnityEngine.Object.FindObjectsByType<UnityEngine.AudioListener>(FindObjectsInactive.Include, FindObjectsSortMode.None).Length == 1,
            "deployment retains one session and one audio listener");
    }
    static void FreshRedeploymentAndZeroBaseline()
    {
        var f = new Fixture(false, new int[6]); f.Loop.Deploy();
        var prior = Shop(f.Session); Fresh(prior, 7, false, new int[6]);
        var model = f.Session.Model;
        Require(model.Hull == 120 && model.CurrentMaximumHull == 120 && model.CurrentCannonDamage == 20 &&
            model.CurrentLauncherDamage == 12 && model.CurrentCannonPeriod == 20 && model.CurrentRepairAmount == 3,
            "zero new-track permanent levels retain original dedicated defaults");
        // Exercise actual ledger mutation only to prove it is never reused on deploy.
        prior.ObserveAuthoritativeKills(2);
        Require(prior.TryPurchase(new LastStandShopPurchaseIntent(7, prior.Version, LastStandUpgradeTrackId.CannonAttack)).Accepted,
            "old run has nonzero temporary purchase state");
        f.Session.ReturnToInspection(); f.Loop.Progression.AbandonRun();
        SetField(f.Loop, "<Phase>k__BackingField", "garage");
        f.Art.ToggleAttachment(); f.Loop.Deploy();
        var next = Shop(f.Session); Fresh(next, 8, true, new int[6]);
        Require(next != prior && f.Session.Model != model && f.Storage.SuccessfulWrites == 2 &&
            f.Session.Model.CurrentCannonDamage == 20, "relaunch owns a fresh ledger/model without old currency or levels");
    }
    static void SaveAndFocusAdmission()
    {
        foreach (bool readFailure in new[] { false, true })
        {
            var storage = new MemoryStorage { Value = Save(Levels), FailWrite = !readFailure, FailReadBack = readFailure };
            var f = new Fixture(true, Levels, storage);
            f.Loop.Deploy();
            Require(f.Session.Model == null && Shop(f.Session) == null && f.Loop.Progression.ActiveRunId == 0 &&
                f.Loop.Progression.SaveState == "retry" && !f.Loop.Audio.Unlocked && f.Loop.Audio.Suspended,
                "unconfirmed reservation creates no ledger/model or audio admission");
            storage.FailWrite = storage.FailReadBack = false;
            f.Loop.RetrySave(); Fresh(Shop(f.Session), 7, true, Levels);
            Require(f.Session.Model != null && f.Loop.Phase == "battle" && storage.SuccessfulWrites == 1 &&
                f.Loop.Progression.NextRunId == 8, "manual retry starts the same once-confirmed reservation");
            var model = f.Session.Model; var shop = Shop(f.Session); int writes = storage.Writes;
            f.Loop.RetrySave();
            Require(f.Session.Model == model && Shop(f.Session) == shop && storage.Writes == writes,
                "duplicate save retry cannot create another deployed ledger");
        }
        var hidden = new Fixture(false, Levels); SetField(hidden.Session, "focused", false);
        hidden.Loop.Deploy();
        Require(hidden.Session.Model == null && Shop(hidden.Session) == null && hidden.Storage.Writes == 0 &&
            hidden.Loop.Progression.ActiveRunId == 0, "foreground deployment admission remains unchanged");
        var invalid = new Fixture(false, Levels, new MemoryStorage { Value = "invalid preserved bytes" });
        invalid.Loop.Deploy();
        Require(invalid.Session.Model == null && Shop(invalid.Session) == null && invalid.Storage.Writes == 0 &&
            invalid.Storage.Value == "invalid preserved bytes", "blocked save cannot create a fresh deployed ledger");
    }
    static void SharedSceneParity()
    {
        foreach (string scene in new[] { "Assets/Scenes/FieldAssembly.unity", "Assets/Scenes/BattlefieldReview.unity" })
        foreach (bool launcher in new[] { false, true })
        {
            EditorSceneManager.OpenScene(scene, OpenSceneMode.Single);
            var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(art, "Start"); Invoke(art.GetComponent<ArtHud>(), "Start");
            var session = UnityEngine.Object.FindFirstObjectByType<EncounterSession>();
            SetField(session, "focused", true);
            if (art.showingLauncher != launcher) art.ToggleAttachment();
            session.DeployAt(100);
            var profile = scene.Contains("BattlefieldReview") ? EncounterProfile.VisualReview : EncounterProfile.Legacy;
            Require(session.Model != null && session.Model.Profile == profile && Shop(session) == null &&
                !session.BackgroundContinuation && art.GetComponent<LastStandLoopController>() == null,
                "shared scene remains non-awarding without a shop or dedicated clock");
            Require(session.Model.Snapshot() == new EncounterModel(launcher, profile).Snapshot(),
                "shared imported deployment snapshot preserves original defaults");
        }
    }
    static void Part(string label, Action check, ref bool failed)
    {
        try { check(); Debug.Log("ST_LS_SHOP_OBLIGATION_PASS " + label); }
        catch (Exception exception) { failed = true; Debug.LogError("ST_LS_SHOP_OBLIGATION_FAIL " + label + " " + exception); }
    }
    static object Accounting(LastStandLoopController loop)
    {
        var property = typeof(LastStandLoopController).GetProperty("FinalAccounting");
        Require(property != null, "controller exposes frozen final accounting");
        var value = property.GetValue(loop);
        Require(value != null, "terminal result retains final accounting");
        return value;
    }
    static int Amount(object snapshot, string name) => (int)snapshot.GetType().GetProperty(name).GetValue(snapshot);
    static void FinalAmounts(object snapshot, int earned, int spent, int final)
    {
        Require(Amount(snapshot, "RunId") == 7 && Amount(snapshot, "UniqueKills") == 2 &&
            Amount(snapshot, "EarnedScrap") == earned && Amount(snapshot, "SpentScrap") == spent &&
            Amount(snapshot, "FinalScrap") == final, "immutable final totals are " + earned + "/" + spent + "/" + final);
        foreach (var property in snapshot.GetType().GetProperties())
            Require(property.GetSetMethod(true) == null, "final accounting has no mutable setters");
    }
    static object FinalizeAgain(LastStandShopState shop, LastStandShopPurchaseLifecycle lifecycle)
    {
        var method = typeof(LastStandShopState).GetMethod("FinalizeAccounting");
        Require(method != null, "ledger owns final accounting and cleanup");
        return method.Invoke(shop, new object[] { lifecycle });
    }
    static void Closed(LastStandShopState shop, LastStandShopPurchaseLifecycle lifecycle,
        LastStandShopPurchaseRefusal refusal, object snapshot)
    {
        Require(shop.PurchaseLifecycle == lifecycle && shop.Scrap == 0, "terminal ledger clears active Scrap");
        foreach (var definition in LastStandUpgradeCatalog.Tracks)
            Require(shop.GetTrack(definition.Id).RunPurchases == 0, "terminal ledger clears every n");
        int version = shop.Version;
        Require(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, version,
            LastStandUpgradeTrackId.CannonAttack)).Refusal == refusal, "terminal ledger rejects stale purchases");
        Require(!shop.ObserveAuthoritativeKills(3) && shop.UniqueKills == 2 && shop.Scrap == 0 &&
            shop.Version == version, "terminal ledger rejects stale income");
        Require(!shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running), "terminal ledger cannot reopen");
        Require(ReferenceEquals(FinalizeAgain(shop, lifecycle), snapshot) && shop.Version == version,
            "repeated finalization retains the exact snapshot");
    }
    // Arrange actual spawned foes; only model shots increment Kills. The first
    // kill occurs on tick 2, and a second target is ready for the final tick 5.
    static LastStandShopState PrepareFinalKill(Fixture f)
    {
        f.Loop.Deploy(); var model = f.Session.Model; var shop = Shop(f.Session);
        f.AdvanceTicks(1);
        Require(model.Kills == 0 && shop.Scrap == 0, "damage without a kill grants no Scrap");
        var first = model.Foes[0];
        typeof(EncounterFoe).GetProperty("Hull").SetValue(first, 1);
        typeof(EncounterFoe).GetProperty("Distance").SetValue(first, 0);
        SetField(model, "nextCannon", 2); SetField(model, "nextLauncher", 1000);
        f.AdvanceTicks(1);
        Require(model.Kills == 1 && shop.UniqueKills == 1 && shop.EarnedScrap == 3 && shop.Scrap == 3,
            "actual first kill credits exactly three Scrap");
        SetField(model, "nextSpawn", 3); SetField(model, "nextCannon", 1000); f.AdvanceTicks(1);
        var attacker = model.Foes[0];
        typeof(EncounterFoe).GetProperty("Kind").SetValue(attacker, FoeKind.Ranged);
        typeof(EncounterFoe).GetProperty("Hull").SetValue(attacker, 10000);
        typeof(EncounterFoe).GetProperty("Distance").SetValue(attacker, model.Profile.Stop(attacker.Kind));
        typeof(EncounterFoe).GetProperty("Damage").SetValue(attacker, 1);
        SetField(attacker, "NextAttack", 1000); SetField(model, "nextSpawn", 4); f.AdvanceTicks(1);
        var target = model.Foes[1];
        Require(target.Alive && target.Id == 3, "second kill target was actually spawned");
        typeof(EncounterFoe).GetProperty("Kind").SetValue(target, FoeKind.Close);
        typeof(EncounterFoe).GetProperty("Hull").SetValue(target, 1);
        typeof(EncounterFoe).GetProperty("Distance").SetValue(target, 0);
        SetField(model, "nextCannon", 5); SetField(model, "nextSpawn", int.MaxValue);
        return shop;
    }
    static void ForegroundHiddenPartitions(bool launcher)
    {
        var foreground = new Fixture(launcher, new int[6]); foreground.Loop.Deploy();
        for (int tick = 0; tick < 400; tick++) foreground.AdvanceTicks(1);
        string model = foreground.Session.Model.Snapshot(); var live = Shop(foreground.Session);
        int kills = live.UniqueKills, scrap = live.Scrap;
        Require(kills > 0 && scrap == 3 * foreground.Session.Model.Kills && live.EarnedScrap == scrap,
            "foreground income conserves actual positive kills");
        var hidden = new Fixture(launcher, new int[6]); hidden.Loop.Deploy();
        SetField(hidden.Session, "focused", false); hidden.AdvanceTicks(400);
        var other = Shop(hidden.Session);
        Require(hidden.Session.Model.Snapshot() == model && other.UniqueKills == kills && other.Scrap == scrap &&
            other.EarnedScrap == live.EarnedScrap && other.SpentScrap == 0,
            "hidden bounded partitions match actual foreground income and combat");
        Require(hidden.Loop.Audio.Suspended && hidden.Loop.Progression.PendingDefeat == null,
            "hidden live run keeps audio suspended and does not auto-claim");
        int version = other.Version;
        Invoke(hidden.Loop, "Refresh", "income-observe"); Invoke(hidden.Loop, "OnSessionChanged");
        Require(other.Scrap == scrap && other.Version == version, "presentation refresh grants no income");
        SetField(hidden.Session, "focused", true); Invoke(hidden.Loop, "OnSessionChanged");
        Require(Shop(hidden.Session) == other && other.Scrap == scrap && hidden.Session.Model.Snapshot() == model,
            "focus return retains the same ledger and does not replay ticks");
    }
    static void FinalDefeat(bool launcher)
    {
        var f = new Fixture(launcher, new int[6]); SetField(f.Session, "focused", true);
        var shop = PrepareFinalKill(f); var model = f.Session.Model;
        typeof(EncounterModel).GetProperty("Hull").SetValue(model, 1);
        SetField(model.Foes[0], "NextAttack", 5); SetField(f.Session, "focused", false);
        bool beforeCleanup = false;
        f.Session.Stepped += current =>
        {
            if (current.Status != EncounterStatus.Running)
            {
                beforeCleanup = current.Kills == 2 && shop.Scrap == 6 && shop.EarnedScrap == 6 && shop.SpentScrap == 0;
                Require(beforeCleanup, "final admitted step credits all kills before cleanup");
            }
        };
        f.AdvanceTicks(1);
        Require(beforeCleanup && model.Status == EncounterStatus.Defeated && model.Kills == 2,
            "actual final shot and incoming hit share a terminal step");
        var snapshot = Accounting(f.Loop); FinalAmounts(snapshot, 6, 0, 6);
        Require(Shop(f.Session) == shop && f.Loop.Phase == "settling" && f.Loop.Progression.PendingDefeat?.Reward == 1 &&
            f.Loop.Progression.Wallet == 20, "same ledger remains until return and hidden defeat requires manual Claim");
        Closed(shop, LastStandShopPurchaseLifecycle.Defeated, LastStandShopPurchaseRefusal.Defeated, snapshot);
        for (int refresh = 0; refresh < 3; refresh++) Invoke(f.Loop, "OnSessionChanged");
        Require(ReferenceEquals(Accounting(f.Loop), snapshot) && f.Loop.Progression.Wallet == 20,
            "repeated terminal callbacks retain accounting without another reward");
    }
    static void PurchasedPauseAndExit(bool launcher)
    {
        var f = new Fixture(launcher, new int[6]); var shop = PrepareFinalKill(f); f.AdvanceTicks(1);
        Require(shop.Scrap == 6 && shop.UniqueKills == 2, "two actual kills fund a purchase");
        f.Session.TogglePauseAt(f.Timestamp);
        Require(Shop(f.Session) == shop && shop.PurchaseLifecycle == LastStandShopPurchaseLifecycle.Paused,
            "explicit pause retains the active ledger");
        Require(shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId, shop.Version,
            LastStandUpgradeTrackId.CannonAttack)).Accepted && shop.Scrap == 1 && shop.SpentScrap == 5,
            "settled paused purchase produces live 6/5/1 accounting");
        int tick = f.Session.Model.Tick, version = shop.Version;
        f.Session.AdvanceAt(f.Timestamp + 5);
        Require(f.Session.Model.Tick == tick && Shop(f.Session) == shop && shop.Scrap == 1 && shop.Version == version &&
            shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases == 1, "paused elapsed time grants no income or reset");
        f.Session.ReturnToInspection();
        var snapshot = Accounting(f.Loop); FinalAmounts(snapshot, 6, 5, 1);
        Closed(shop, LastStandShopPurchaseLifecycle.Exited, LastStandShopPurchaseRefusal.Exited, snapshot);
        Require(Shop(f.Session) == null && f.Loop.Progression.PendingDefeat == null && f.Loop.Progression.Wallet == 20 &&
            f.Loop.Progression.ActiveRunId == 0 && f.Loop.Phase == "garage", "unfinished exit awards zero and ends run ownership");
        f.Loop.Deploy(); Fresh(Shop(f.Session), 8, launcher, new int[6]);
        Require(typeof(LastStandLoopController).GetProperty("FinalAccounting").GetValue(f.Loop) == null,
            "next deployment discards prior result accounting");
    }
    static void NonDefeatTerminal(bool launcher, bool limit)
    {
        var f = new Fixture(launcher, new int[6]); var shop = PrepareFinalKill(f);
        if (limit)
        {
            typeof(EncounterModel).GetProperty("Tick").SetValue(f.Session.Model, 3599);
            SetField(f.Session.Model.Foes[0], "NextAttack", int.MaxValue);
            f.AdvanceTicks(1);
        }
        else { f.AdvanceTicks(1); f.Session.AdvanceAt(double.NaN); }
        var snapshot = Accounting(f.Loop); FinalAmounts(snapshot, 6, 0, 6);
        Closed(shop, limit ? LastStandShopPurchaseLifecycle.Limit : LastStandShopPurchaseLifecycle.Failed,
            limit ? LastStandShopPurchaseRefusal.Limit : LastStandShopPurchaseRefusal.Failed, snapshot);
        Require(f.Session.Model == null && Shop(f.Session) == null && f.Loop.Progression.PendingDefeat == null &&
            f.Loop.Progression.Wallet == 20 && f.Loop.Progression.ActiveRunId == 0,
            "Limit and technical failure award zero Salvage");
    }
    static void SaveRetryRefreshClaimAndReload(bool launcher)
    {
        var f = new Fixture(launcher, new int[6]); var shop = PrepareFinalKill(f);
        typeof(EncounterModel).GetProperty("Hull").SetValue(f.Session.Model, 1);
        SetField(f.Session.Model.Foes[0], "NextAttack", 5); f.Storage.FailWrite = true; f.AdvanceTicks(1);
        var snapshot = Accounting(f.Loop); FinalAmounts(snapshot, 6, 0, 6);
        Closed(shop, LastStandShopPurchaseLifecycle.Defeated, LastStandShopPurchaseRefusal.Defeated, snapshot);
        Require(f.Loop.Phase == "save-error" && f.Loop.Progression.PendingDefeat == null && f.Loop.Progression.Wallet == 20,
            "failed defeat save cannot publish or auto-claim a reward");
        f.Loop.RetrySave();
        Require(ReferenceEquals(Accounting(f.Loop), snapshot) && Shop(f.Session) == shop, "failed retry retains closed ledger and snapshot");
        f.Storage.FailWrite = false; f.Loop.RetrySave();
        Require(f.Loop.Phase == "result" && f.Session.Model == null && f.Loop.Progression.PendingDefeat?.RunId == 7 &&
            f.Loop.Progression.PendingDefeat.Kills == 2 && f.Loop.Progression.Wallet == 20 &&
            ReferenceEquals(Accounting(f.Loop), snapshot), "legitimate retry stages exact final kills once and retains accounting through return");
        int writes = f.Storage.Writes;
        for (int refresh = 0; refresh < 3; refresh++) { Invoke(f.Loop, "OnSessionChanged"); f.Loop.RetrySave(); }
        Require(f.Storage.Writes == writes && f.Loop.Progression.Wallet == 20 &&
            ReferenceEquals(Accounting(f.Loop), snapshot), "result refresh and repeated retry cannot re-award or spend");
        f.Loop.Claim(); f.Loop.Claim();
        Require(f.Loop.Progression.Wallet == 21 && f.Loop.Progression.PendingDefeat == null &&
            typeof(LastStandLoopController).GetProperty("FinalAccounting").GetValue(f.Loop) == null,
            "manual Claim awards once and closes the in-memory result snapshot");
        f.Loop.Deploy(); Fresh(Shop(f.Session), 8, launcher, new int[6]);
        Require(Shop(f.Session) != shop && ReferenceEquals(FinalizeAgain(shop, LastStandShopPurchaseLifecycle.Defeated), snapshot),
            "next run is fresh while stale ledger handles remain terminal");
        var reload = new Fixture(launcher, new int[6], new MemoryStorage { Value = f.Storage.Value });
        Require(typeof(LastStandLoopController).GetProperty("FinalAccounting").GetValue(reload.Loop) == null &&
            reload.Session.Model == null && reload.Loop.Progression.Wallet == 21, "reload retains only committed permanent progress");
        reload.Loop.Deploy(); Fresh(Shop(reload.Session), 9, launcher, new int[6]);
    }
    static void NamedIncome(string name, Action check, ref bool failed)
    {
        try { check(); Debug.Log("ST_LS_SHOP_PASS " + name); }
        catch (Exception exception) { failed = true; Debug.LogError("ST_LS_SHOP_FAIL " + name + " " + exception); }
    }
    public static void RunIncome()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED");
            var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_income_hidden_partition_and_terminal_snapshot", () =>
                {
                    foreach (bool launcher in new[] { false, true }) { ForegroundHiddenPartitions(launcher); FinalDefeat(launcher); }
                }, ref failed);
                NamedIncome("test_income_final_tick_refresh_and_next_run", () =>
                {
                    foreach (bool launcher in new[] { false, true })
                    { PurchasedPauseAndExit(launcher); NonDefeatTerminal(launcher, true); NonDefeatTerminal(launcher, false); SaveRetryRefreshClaimAndReload(launcher); }
                }, ref failed);
            }
            finally
            {
                LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                Application.runInBackground = background;
            }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static LastStandShopPurchaseResult Buy(Fixture f, LastStandShopPurchaseIntent intent, double timestamp)
    {
        var method = typeof(LastStandLoopController).GetMethod("TryPurchaseTemporaryAt",
            new[] { typeof(LastStandShopPurchaseIntent), typeof(double) });
        Require(method != null, "actual controller exposes the typed old-stat purchase boundary");
        return (LastStandShopPurchaseResult)method.Invoke(f.Loop, new object[] { intent, timestamp });
    }
    static LastStandShopPurchaseIntent Intent(LastStandShopState shop, LastStandUpgradeTrackId track) =>
        new LastStandShopPurchaseIntent(shop.RunId, shop.Version, track);
    static LastStandShopState Funded(Fixture f)
    {
        var shop = PrepareFinalKill(f); f.AdvanceTicks(1);
        Require(shop.Scrap == 6 && shop.UniqueKills == 2, "actual combat funds temporary boundary with six Scrap");
        SetField(f.Session.Model.Foes[0], "NextAttack", int.MaxValue);
        SetField(f.Session.Model, "nextLauncher", int.MaxValue);
        return shop;
    }
    static void OldStatsAndEffects(bool launcher)
    {
        foreach (var track in LastStandUpgradeCatalog.Tracks)
        {
            if (track.Id == LastStandUpgradeTrackId.LauncherAttack && !launcher ||
                track.Id == LastStandUpgradeTrackId.FieldRepair && launcher) continue;
            var f = new Fixture(launcher, new int[6]); var shop = Funded(f); var model = f.Session.Model;
            var intent = Intent(shop, track.Id);
            int oldHull = model.Hull, oldFoeHull = model.Foes[0].Hull, oldShots = model.CannonShots, notifications = 0;
            bool oldShot = false;
            f.Session.Stepped += current =>
            {
                if (current.Tick != 25) return;
                foreach (var evt in current.Events)
                    if (evt.Kind == EncounterEventKind.Cannon)
                    { oldShot = true; Require(evt.Amount == 20, "due shot uses old cannon stats before any purchase"); }
                Require(shop.SpentScrap == 0 && shop.GetTrack(track.Id).RunPurchases == 0,
                    "due combat precedes ledger debit and effect application");
            };
            f.Loop.Changed += () =>
            {
                notifications++;
                Require(shop.Scrap == 1 && shop.SpentScrap == 5 && shop.GetTrack(track.Id).RunPurchases == 1,
                    "controller observer sees debit and track as one completed purchase");
                Require(model.CurrentCannonDamage == (track.Id == LastStandUpgradeTrackId.CannonAttack ? 30 : 20) &&
                    model.CurrentMaximumHull == (track.Id == LastStandUpgradeTrackId.HullCapacity ? 135 : 120) &&
                    model.CurrentCannonPeriod == (track.Id == LastStandUpgradeTrackId.CannonCycle ? 19 : 20) &&
                    model.CurrentLauncherDamage == (track.Id == LastStandUpgradeTrackId.LauncherAttack ? 16 : 12) &&
                    model.CurrentRepairAmount == (track.Id == LastStandUpgradeTrackId.FieldRepair ? 4 : 3),
                    "one refresh observes the matching actual combat projections");
            };
            var result = Buy(f, intent, f.Timestamp + 20 * LastStandRunClock.StepSeconds);
            Require(result.Accepted && result.ChargedScrap == 5 && oldShot && model.Tick == 25 && notifications == 1 &&
                model.Foes[0].Hull == oldFoeHull - 20 && Shop(f.Session) == shop && f.Session.Model == model &&
                shop.Version == intent.Version + 1 && f.Loop.Progression.Wallet == 20 && f.Storage.Writes == 1,
                "settled buy charges once after old-stat shot and synchronously refreshes the same run");
            Require(model.Hull == oldHull + (track.Id == LastStandUpgradeTrackId.HullCapacity ? 15 : 0),
                "Hull Capacity adds only its fifteen maximum and current hull delta");
            // Future combat uses the purchased effect; no new clock or duplicate shot.
            int next = track.Id == LastStandUpgradeTrackId.CannonCycle ? 44 : 45;
            f.AdvanceTicks(next - 25);
            Require(model.Tick == next && model.CannonShots == oldShots + 2 &&
                model.Foes[0].Hull == oldFoeHull - 20 - (track.Id == LastStandUpgradeTrackId.CannonAttack ? 30 : 20),
                "next actual shot uses the upgraded effect and Cycle does not fire retroactively");
            if (track.Id == LastStandUpgradeTrackId.Armor)
            {
                var attacker = model.Foes[0]; typeof(EncounterFoe).GetProperty("Damage").SetValue(attacker, 5);
                SetField(attacker, "NextAttack", model.Tick + 1); int hull = model.Hull; f.AdvanceTicks(1);
                Require(model.Hull == hull - 4, "temporary Armor changes actual incoming hit with one-point floor");
            }
            if (track.Id == LastStandUpgradeTrackId.LauncherAttack)
            {
                SetField(model, "nextLauncher", model.Tick + 1); int hull = model.Foes[0].Hull; f.AdvanceTicks(1);
                Require(model.Foes[0].Hull == hull - 16, "temporary Launcher changes an actual auxiliary shot");
            }
            if (track.Id == LastStandUpgradeTrackId.FieldRepair)
            {
                typeof(EncounterModel).GetProperty("Hull").SetValue(model, model.CurrentMaximumHull - 10);
                SetField(model, "nextRepair", model.Tick + 1); int hull = model.Hull; f.AdvanceTicks(1);
                Require(model.Hull == hull + 4, "temporary Field Repair changes an actual clamped repair");
            }
        }
    }
    static void DebtRefusal(bool launcher)
    {
        var f = new Fixture(launcher, new int[6]); var shop = Funded(f); var model = f.Session.Model;
        var intent = Intent(shop, LastStandUpgradeTrackId.CannonAttack); double boundary = f.Timestamp + 200 * .05;
        var refused = Buy(f, intent, boundary);
        Require(refused.Refusal == LastStandShopPurchaseRefusal.CatchingUp && model.Tick == 133 &&
            f.Session.StepsThisCallback == LastStandRunClock.MaximumStepsPerCallback && f.Session.CatchingUp &&
            shop.Scrap == 6 && shop.SpentScrap == 0 && model.CurrentCannonDamage == 20 &&
            shop.GetTrack(intent.TrackId).RunPurchases == 0, "bounded old-stat debt refuses without debit, effect, or queued intent");
        f.Session.AdvanceAt(boundary);
        Require(model.Tick == 205 && !f.Session.CatchingUp && shop.SpentScrap == 0 && shop.Scrap == 6,
            "later clock drain retains debt but never retries a refused intent");
        Require(Buy(f, intent, boundary).Refusal == LastStandShopPurchaseRefusal.StaleVersion && shop.Scrap == 6,
            "old caller version is not rebound after CatchingUp lifecycle changes");
        Require(Buy(f, Intent(shop, intent.TrackId), boundary).Accepted && shop.Scrap == 1 &&
            model.CurrentCannonDamage == 30, "only a fresh manual intent buys after full settlement");
    }
    static void PausedAndInvalidInput(bool launcher)
    {
        var f = new Fixture(launcher, new int[6]); var shop = Funded(f); var model = f.Session.Model;
        f.Session.TogglePauseAt(f.Timestamp); var intent = Intent(shop, LastStandUpgradeTrackId.CannonAttack);
        int tick = model.Tick, writes = f.Storage.Writes;
        SetField(f.Session, "focused", false); Invoke(f.Session, "OnApplicationFocus", false);
        Require(Buy(f, intent, f.Timestamp + 10).Accepted && f.Session.Paused && model.Tick == tick &&
            model.CurrentCannonDamage == 30 && shop.Scrap == 1 && shop.SpentScrap == 5 &&
            Shop(f.Session) == shop && f.Storage.Writes == writes && f.Loop.Audio.Suspended,
            "settled paused hidden purchase excludes elapsed time and keeps ledger without save or focus admission");
        int version = shop.Version;
        // This task has no panel yet. Closing/reopening is represented only by
        // repeated presentation observation, never an invented pause owner.
        for (int i = 0; i < 3; i++) Invoke(f.Loop, "Refresh", "shop-presentation-observe");
        Invoke(f.Session, "OnApplicationFocus", true);
        Require(Shop(f.Session) == shop && shop.Version == version && shop.Scrap == 1 && model.Tick == tick &&
            shop.GetTrack(intent.TrackId).RunPurchases == 1, "presentation/focus observations retain temporary state");
        Require(Buy(f, intent, f.Timestamp).Refusal == LastStandShopPurchaseRefusal.StaleVersion,
            "replayed accepted intent has no second debit or effect");
        Require(Buy(f, null, f.Timestamp).Refusal == LastStandShopPurchaseRefusal.InvalidIntent &&
            Buy(f, new LastStandShopPurchaseIntent(99, version, intent.TrackId), f.Timestamp).Refusal == LastStandShopPurchaseRefusal.WrongRun &&
            Buy(f, new LastStandShopPurchaseIntent(shop.RunId, version, (LastStandUpgradeTrackId)99), f.Timestamp).Refusal == LastStandShopPurchaseRefusal.UnknownTrack &&
            Buy(f, Intent(shop, launcher ? LastStandUpgradeTrackId.FieldRepair : LastStandUpgradeTrackId.LauncherAttack), f.Timestamp).Refusal == LastStandShopPurchaseRefusal.WrongFitting &&
            Buy(f, Intent(shop, LastStandUpgradeTrackId.Armor), f.Timestamp).Refusal == LastStandShopPurchaseRefusal.InsufficientScrap,
            "typed invalid/run/track/fitting/funds refusals preserve the real ledger");
        Require(shop.Version == version && shop.Scrap == 1 && shop.SpentScrap == 5 && model.CurrentCannonDamage == 30,
            "every refused/replayed purchase has zero ledger or combat effect");
        f.Session.TogglePauseAt(f.Timestamp); f.Session.AdvanceAt(f.Timestamp + .05);
        Require(!f.Session.Paused && model.Tick == tick + 1, "resuming uses only new active time after paused purchase");
        f.Session.ReturnToInspection();
        Require(Buy(f, intent, 0).Refusal == LastStandShopPurchaseRefusal.Inactive && shop.Scrap == 0,
            "no active session cannot accept or queue an old purchase");
        f.Loop.Deploy(); var next = Shop(f.Session);
        Require(Buy(f, intent, f.Timestamp).Refusal == LastStandShopPurchaseRefusal.WrongRun && next.Scrap == 0 &&
            next.GetTrack(intent.TrackId).RunPurchases == 0 && f.Session.Model.CurrentCannonDamage == 20,
            "prior intent cannot spend or project effects into the next reserved run");
    }
    static void PurchaseTerminalAndReentrancy(bool launcher)
    {
        foreach (string terminal in new[] { "defeat", "limit", "failure" })
        {
            var f = new Fixture(launcher, new int[6]); var shop = PrepareFinalKill(f); var model = f.Session.Model;
            var intent = Intent(shop, LastStandUpgradeTrackId.CannonAttack);
            if (terminal == "defeat")
            { typeof(EncounterModel).GetProperty("Hull").SetValue(model, 1); SetField(model.Foes[0], "NextAttack", 5); }
            if (terminal == "limit") typeof(EncounterModel).GetProperty("Tick").SetValue(model, 3599);
            double boundary = terminal == "failure" ? double.NaN : f.Timestamp + .05;
            var result = Buy(f, intent, boundary);
            var expected = terminal == "defeat" ? LastStandShopPurchaseRefusal.Defeated :
                terminal == "limit" ? LastStandShopPurchaseRefusal.Limit : LastStandShopPurchaseRefusal.Failed;
            Require(result.Refusal == expected && shop.SpentScrap == 0 && shop.Scrap == 0 &&
                model.CurrentCannonDamage == 20 && f.Loop.Progression.Wallet == 20 &&
                (terminal != "defeat" || f.Loop.Progression.PendingDefeat?.Reward == 1),
                "terminal/failure settlement refuses the submitted buy and keeps manual reward ownership: " + terminal);
        }
        var changed = new Fixture(launcher, new int[6]); var old = Funded(changed);
        var submitted = Intent(old, LastStandUpgradeTrackId.CannonAttack); bool replaced = false;
        changed.Session.Stepped += current =>
        {
            if (replaced) return; replaced = true;
            var nested = Buy(changed, submitted, changed.Timestamp);
            Require(nested.Refusal == LastStandShopPurchaseRefusal.Inactive && old.SpentScrap == 0,
                "reentrant purchase cannot own another step or debit");
            changed.Session.ReturnToInspection(); changed.Loop.Deploy();
        };
        var refusal = Buy(changed, submitted, changed.Timestamp + .05); var fresh = Shop(changed.Session);
        Require(replaced && refusal.Refusal == LastStandShopPurchaseRefusal.WrongRun && fresh != old &&
            fresh.RunId == 8 && fresh.Scrap == 0 && fresh.SpentScrap == 0 && fresh.Version == 0 &&
            changed.Session.Model.Tick == 0 && changed.Session.Model.CurrentCannonDamage == 20 && old.SpentScrap == 0,
            "callback replacement cannot apply old intent to either ledger or the new model");
    }
    public static void RunSettle()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED");
            var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_settle_purchase_old_stats_and_debt_refusal", () =>
                { foreach (bool launcher in new[] { false, true }) { OldStatsAndEffects(launcher); DebtRefusal(launcher); } }, ref failed);
                NamedIncome("test_settle_pause_focus_close_and_stale_input", () =>
                { foreach (bool launcher in new[] { false, true }) { PausedAndInvalidInput(launcher); PurchaseTerminalAndReentrancy(launcher); } }, ref failed);
            }
            finally
            {
                LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                Application.runInBackground = background;
            }
        }
        if (failed) EditorApplication.Exit(1);
    }
    // Imported ordinary controls and the same real owner, never a UI economy.
    static readonly string[] ShopIds = { "ShopEntry", "ShopClose", "ShopTabAttack", "ShopTabDefense", "ShopTabUtility",
        "ShopCard_cannonAttackBuy", "ShopCard_launcherAttackBuy", "ShopCard_hullCapacityBuy", "ShopCard_armorBuy",
        "ShopCard_cannonCycleBuy", "ShopCard_fieldRepairBuy" };
    sealed class ShopUiFixture : IDisposable
    {
        public readonly Fixture Game;
        public readonly LastStandLoopHud Hud;
        public readonly Canvas Canvas;
        public readonly Camera Camera;
        public readonly RectTransform Root;
        readonly RenderTexture texture;
        public ShopUiFixture(bool launcher, Vector2Int profile, MemoryStorage storage = null)
        {
            Game = new Fixture(launcher, new int[6], storage);
            // The domain fixture arranges authored modules directly after
            // controller initialization. Publish that test-owned starting
            // choice through the controller before exercising live arrows.
            Game.Loop.RefreshControls();
            Require(Game.Loop.FittingId==(launcher?"launcher":"repair"),"fixture starts with the intended authored fitting");
            if(Game.Loop.GarageCardsVisible)
                Require(Game.Loop.GarageFittingSelection.Current.Id==Game.Loop.FittingId,
                    "fixture controller selection agrees with its arranged module before UI input");
            Hud = (LastStandLoopHud)typeof(LastStandLoopController).GetField("hud", Private).GetValue(Game.Loop);
            Canvas = UnityEngine.Object.FindFirstObjectByType<Canvas>(); Camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            texture = new RenderTexture(profile.x, profile.y, 16); Camera.targetTexture = texture;
            Canvas.renderMode = RenderMode.ScreenSpaceCamera; Canvas.worldCamera = Camera; Canvas.planeDistance = 1;
            Canvas.GetComponent<CanvasScaler>().enabled = false;
            Canvas.scaleFactor = Mathf.Sqrt((profile.x / 1280f) * (profile.y / 720f));
            Root = (RectTransform)Canvas.transform.Find("LastStandLoopHud");
            foreach (var events in Resources.FindObjectsOfTypeAll<EventSystem>())
                if (events.gameObject.scene == Game.Art.gameObject.scene) { Invoke(events, "OnEnable"); EventSystem.current = events; break; }
            var raycaster = Canvas.GetComponent<GraphicRaycaster>();
            raycaster.GetType().GetMethod("OnEnable", Private).Invoke(raycaster, null); Refresh();
            Require(Math.Abs(Canvas.pixelRect.width - profile.x) < .1f && Math.Abs(Canvas.pixelRect.height - profile.y) < .1f,
                "actual available shop Canvas profile");
        }
        public Button Button(string id)
        {
            Button found = null; int count = 0;
            foreach (var button in Root.GetComponentsInChildren<Button>(true)) if (button.name == id) { found = button; count++; }
            Require(count == 1, "actual ordinary shop Button exists exactly once: " + id); return found;
        }
        public Text Text(string id)
        {
            Text found = null; int count = 0;
            foreach (var text in Root.GetComponentsInChildren<Text>(true)) if (text.name == id) { found = text; count++; }
            Require(count == 1, "actual shop Text exists exactly once: " + id); return found;
        }
        public void Refresh()
        {
            Canvas.ForceUpdateCanvases();Hud.Refresh();
            Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Canvas.renderMode = RenderMode.ScreenSpaceCamera; Canvas.worldCamera = Camera; Canvas.planeDistance = 1;
            Canvas.ForceUpdateCanvases(); Hud.Refresh(); Canvas.ForceUpdateCanvases();
        }
        public Rect Bounds(RectTransform rect)
        {
            var corners = new Vector3[4]; rect.GetWorldCorners(corners);
            var lo = Camera.WorldToScreenPoint(corners[0]); var hi = Camera.WorldToScreenPoint(corners[2]);
            return new Rect(lo.x, Canvas.pixelRect.height - hi.y, hi.x - lo.x, hi.y - lo.y);
        }
        public void Click(string id)
        {
            var button = Button(id); Require(button.IsActive() && button.IsInteractable(), "eligible real shop click " + id);
            ExecuteEvents.Execute(button.gameObject, new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left },
                ExecuteEvents.pointerClickHandler); Refresh();
        }
        public void Reanchor(double elapsed = 0)
        {
            // Same existing imported ReanchorInput seam: synthetic test advances
            // cannot precede the real timestamp read by an ordinary live click.
            var clock = (LastStandRunClock)typeof(EncounterSession).GetField("runClock", Private).GetValue(Game.Session);
            typeof(LastStandRunClock).GetField("anchor", Private).SetValue(clock, Time.realtimeSinceStartupAsDouble - elapsed);
        }
        public void Resize(Vector2Int profile)
        {
            texture.Release();texture.width=profile.x;texture.height=profile.y;texture.Create();
            // A targetTexture mutation in edit mode does not run the player's
            // Canvas resize lifecycle. Rebind its camera transforms before the
            // first HUD layout observes new pixels, so production's resize
            // reveal runs once against the actual final viewport. Do not
            // select again, set a scroll offset or invoke the reveal handler.
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            Canvas.renderMode=RenderMode.ScreenSpaceCamera;Canvas.worldCamera=Camera;Canvas.planeDistance=1;
            Canvas.ForceUpdateCanvases();Camera.Render();Canvas.ForceUpdateCanvases();
            var actual=Bounds(Root);
            Require(Math.Abs(Canvas.pixelRect.width-profile.x)<.1f&&Math.Abs(Canvas.pixelRect.height-profile.y)<.1f&&
                Math.Abs(actual.x)<.2f&&Math.Abs(actual.y)<.2f&&Math.Abs(actual.width-profile.x)<.2f&&Math.Abs(actual.height-profile.y)<.2f,
                "resized fixture camera Canvas has coherent physical bounds before HUD layout "+profile+" actual="+actual);
        }
        public void Dispose()
        { Camera.targetTexture = null; UnityEngine.Object.DestroyImmediate(texture); EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); }
    }
    static void SelectUiFitting(ShopUiFixture f, bool launcher)
    {
        if(f.Game.Art.showingLauncher==launcher)return;
        bool reopen=f.Button("ShopClose").IsActive();
        if(reopen)f.Click("ShopClose");
        int writes=f.Game.Storage.Writes, wallet=f.Game.Loop.Progression.Wallet;
        Require(f.Game.Loop.MenuPage=="","inline fitting starts outside a modal");
        f.Click(launcher ? "FittingNext" : "FittingPrevious");
        Require(f.Game.Art.showingLauncher==launcher && f.Game.Loop.FittingId==(launcher ? "launcher" : "repair"),
            "ordinary inline arrow equips the explicit fitting identity");
        Require(f.Game.Loop.MenuPage=="" && f.Game.Session.Model==null &&
            f.Game.Storage.Writes==writes && f.Game.Loop.Progression.Wallet==wallet,
            "inline fitting never opens a modal, deploys, purchases or saves progression");
        if(reopen)f.Click("ShopEntry");
    }
    static void FittedCardVisibility()
    {
        foreach (bool run in new[] { false, true }) foreach (bool launcher in new[] { false, true })
        using (var f = new ShopUiFixture(launcher,new Vector2Int(1280,616)))
        {
            if (run) Funded(f.Game);
            f.Refresh(); f.Click("ShopEntry");
            int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet;
            for (int choice = 0; choice < (run ? 1 : 2); choice++)
            {
                bool fittedLauncher = run ? launcher : f.Game.Art.showingLauncher;
                foreach (var category in new[] { LastStandUpgradeCategory.Attack, LastStandUpgradeCategory.Defense, LastStandUpgradeCategory.Utility })
                {
                    f.Click("ShopTab" + category);
                    foreach (var definition in LastStandUpgradeCatalog.Tracks)
                    {
                        bool expected = definition.Category == category && definition.IsEligible(fittedLauncher ? LastStandFitting.Launcher : LastStandFitting.Repair);
                        var button = f.Button("ShopCard_" + definition.Key + "Buy");
                        Require(button.gameObject.activeInHierarchy == expected,
                            "only fitted module upgrades are visible: " + (run ? "run/" : "permanent/") + fittedLauncher + "/" + definition.Key);
                        if (!expected)
                        {
                            EventSystem.current.SetSelectedGameObject(button.gameObject); f.Refresh();
                            Require(EventSystem.current.currentSelectedGameObject != button.gameObject,
                                "hidden upgrade cannot retain keyboard focus: " + definition.Key);
                        }
                    }
                }
                if (!run && choice == 0) SelectUiFitting(f,!f.Game.Art.showingLauncher);
            }
            Require(f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == wallet,
                "visibility and fitting changes do not purchase or write saves");
        }
    }
    static void ShopReadableComposition()
    {
        foreach (bool run in new[] { false,true }) using (var f = new ShopUiFixture(false,new Vector2Int(1280,616)))
        {
            if (run) Funded(f.Game);
            f.Refresh(); f.Click("ShopEntry"); f.Click("ShopTabDefense");
            Require(f.Text("ShopCard_hullCapacityLevels").text == "Level 0 / " + (run ? "8" : "3"),
                "plain upgrade level instead of internal P/RUN/L bookkeeping");
            Require(f.Text("ShopCard_hullCapacityCurrentEffect").text.Contains("120") &&
                f.Text("ShopCard_hullCapacityCurrentEffect").text.Contains("135"), "current and next effects read as one delta");
            Require(!f.Text("ShopCard_hullCapacityPrice").gameObject.activeInHierarchy,
                "price appears once on the purchase action");
            Require(f.Text("ShopEntryText").text == "CLOSE SHOP", "open entry makes close action explicit");
            if (!run) Require(!f.Text("PhaseDetail").text.Contains("Cannon Attack") && !f.Text("PhaseDetail").text.Contains("Salvage"),
                "open context does not repeat the selected card or wallet");
            foreach (string key in new[] { "hullCapacity", "armor" })
                Require(!f.Root.Find("ShopPanel/ShopViewport/ShopContent/ShopCard_" + key + "/ConsoleFrame"),
                    "internal rows avoid repeated ornamental frames");
        }
    }
    public static void RunPolish()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_shop_only_fitted_modules_visible_and_focusable",FittedCardVisibility,ref failed);
                NamedIncome("test_shop_plain_compact_readable_composition",ShopReadableComposition,ref failed);
            }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static void ReadableEffectSeparator()
    {
        foreach (bool run in new[] { false,true }) foreach (bool launcher in new[] { false,true })
        using (var f = new ShopUiFixture(launcher,new Vector2Int(1280,616)))
        {
            if (run) Funded(f.Game);
            f.Refresh(); f.Click("ShopEntry");
            var view = run ? LastStandShopPresentation.ProjectRun(Shop(f.Game.Session)) :
                LastStandShopPresentation.ProjectPermanent(f.Game.Loop.Progression,
                    launcher ? LastStandFitting.Launcher : LastStandFitting.Repair);
            foreach (var category in new[] { LastStandUpgradeCategory.Attack,LastStandUpgradeCategory.Defense,LastStandUpgradeCategory.Utility })
            {
                f.Click("ShopTab" + category); f.Camera.Render(); Canvas.ForceUpdateCanvases();
                foreach (var card in view.Cards)
                {
                    if (card.Category != category || !card.AppliesToFitting) continue;
                    var label = f.Text("ShopCard_" + card.Key + "CurrentEffect");
                    Require(label.text == card.CurrentEffectDescription + " to " + card.NextEffectDescription,
                        "visible plain-language effect transition preserves exact catalog values and units: " + card.Key);
                    label.font.RequestCharactersInTexture("to",label.fontSize,label.fontStyle);
                    foreach (char separator in "to")
                    {
                        CharacterInfo glyph;
                        Require(label.font.GetCharacterInfo(separator,out glyph,label.fontSize,label.fontStyle) &&
                            glyph.advance > 0 && glyph.maxX > glyph.minX && glyph.maxY > glyph.minY,
                            "actual rendered effect font supplies drawable separator glyph " + separator);
                    }
                }
            }
        }
    }
    static void WorkshopSinglePurchaseAction()
    {
        foreach (var profile in new[] { new Vector2Int(1280,616),new Vector2Int(390,688) })
        foreach (int cannonLevel in new[] { 0,3 })
        using (var f = new ShopUiFixture(false,profile,
            new MemoryStorage { Value = Save(new[] { cannonLevel,0,0,0,0,0 }) }))
        {
            WorkshopPendingResult(f); f.Click("Claim");
            var legacy = f.Button("Purchase"); bool eligible = cannonLevel < 3;
            Require(f.Game.Loop.Phase == "workshop" && !legacy.IsActive() && f.Button("ShopEntry").IsActive(),
                "closed workshop exposes Upgrades and hides the duplicate legacy purchase");
            int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet;
            f.Click("ShopEntry");
            Require(!legacy.gameObject.activeInHierarchy && !legacy.IsActive(),
                "open Mechanics Shop hides duplicate legacy Cannon purchase");
            EventSystem.current.SetSelectedGameObject(legacy.gameObject); f.Refresh();
            Require(EventSystem.current.currentSelectedGameObject != legacy.gameObject,
                "hidden legacy purchase cannot retain focus");
            foreach (var button in f.Root.GetComponentsInChildren<Button>(false))
                if (button.IsInteractable()) Require(button.navigation.selectOnUp != legacy && button.navigation.selectOnDown != legacy,
                    "open Shop navigation excludes legacy purchase");
            Require(f.Button("ShopCard_cannonAttackBuy").IsActive()&&f.Button("ShopCard_cannonAttackBuy").IsInteractable()==eligible,
                "actual permanent card keeps cannon purchase eligibility");
            foreach (string id in new[] { "Redeploy","Menu","ShopClose" })
                Require(f.Button(id).IsActive(),"required workshop action remains visible " + id);
            f.Click("ShopClose");
            Require(!legacy.IsActive()&&f.Button("ShopEntry").GetComponentInChildren<Text>().text=="UPGRADES",
                "closing Shop restores the single Upgrades entry without duplicate purchase");
            Require(f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == wallet &&
                f.Game.Loop.Progression.CannonAttackLevel == cannonLevel,
                "opening, closing and focus refresh never purchase or write saves");
        }
    }
    public static void RunRenderFollowup()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_shop_rendered_effect_separator",ReadableEffectSeparator,ref failed);
                NamedIncome("test_shop_workshop_single_purchase_action",WorkshopSinglePurchaseAction,ref failed);
            }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static void ShopInventory(ShopUiFixture f)
    {
        LastStandHudChecks.AssertOrdinaryInventory(f.Root,"shop "+f.Game.Loop.Phase);
        Require(f.Root.Find("ShopEntry").GetComponent<Button>() == f.Button("ShopEntry"), "upgrade entry is a separate HUD root action");
        foreach (var definition in LastStandUpgradeCatalog.Tracks)
        {
            string id = "ShopCard_" + definition.Key;
            Require(f.Root.Find("ShopPanel/ShopViewport/ShopContent/" + id + "/" + id + "Buy").GetComponent<Button>() == f.Button(id + "Buy"),
                "actual nested card Button identity " + definition.Key);
        }
    }
    static void ShopCards(ShopUiFixture f, LastStandUpgradeCategory category)
    {
        var view = LastStandShopPresentation.ProjectRun(Shop(f.Game.Session));
        Require(f.Text("ShopHeading").text == "SHOP / THIS RUN" && f.Text("ShopCurrency").text == "SCRAP  " + view.Balance,
            "Scrap purchase lifetime and balance from actual run");
        int visible = 0;
        foreach (var card in view.Cards)
        {
            string id = "ShopCard_" + card.Key; var button = f.Button(id + "Buy");
            Require(button.gameObject.activeInHierarchy == (card.Category == category && card.AppliesToFitting), "exact selected category and fitted module " + card.Key);
            if (card.Category != category || !card.AppliesToFitting) continue;
            visible++;
            Require(f.Text(id + "Title").text == card.Name && f.Text(id + "Levels").text ==
                "Level " + card.CurrentLevel + " / " + card.Cap && f.Text(id + "NextEffect").text ==
                "Permanent " + card.PermanentLevel + "  /  This run " + card.RunPurchases,
                "plain combined level and exact permanent/run contributions " + card.Key);
            Require(f.Text(id + "CurrentEffect").text == card.CurrentEffectDescription +
                (card.NextPrice.HasValue ? " to " + card.NextEffectDescription : "") && f.Text(id + "Price").text == card.PriceDescription,
                "actual exact effects and price " + card.Key);
            Require(f.Text(id + "Refusal").text == card.Reason && button.IsInteractable() == card.CanPurchase,
                "actual typed eligibility and refusal " + card.Key);
        }
        int expected = category == LastStandUpgradeCategory.Defense ? 2 :
            category == LastStandUpgradeCategory.Attack ? (f.Game.Art.showingLauncher ? 2 : 1) : (f.Game.Art.showingLauncher ? 1 : 2);
        Require(visible == expected, "exact fitting-applicable catalog cards per category");
    }
    static Button ShopRaycast(ShopUiFixture f, Vector2 position)
    {
        var hits = new List<RaycastResult>();
        EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = position }, hits);
        foreach (var hit in hits) { var button = hit.gameObject.GetComponentInParent<Button>(); if (button) return button; }
        return null;
    }
    static void ShopGeometry(ShopUiFixture f)
    {
        var panel = (RectTransform)f.Root.Find("ShopPanel"); var viewport = (RectTransform)panel.Find("ShopViewport");
        var scroll = panel.GetComponent<ScrollRect>();
        Require(panel.GetComponent<Image>().color.a == 1 && viewport.GetComponent<RectMask2D>() && scroll &&
            scroll.viewport == viewport && scroll.content == viewport.Find("ShopContent") && scroll.vertical && !scroll.horizontal,
            "actual opaque console and native vertical mask/content ScrollRect");
        var panelBounds = f.Bounds(panel); var screen = CanvasBounds(f);
        Require(screen.Contains(panelBounds.min) && screen.Contains(panelBounds.max), "panel lies in actual available Canvas");
        foreach (string id in new[] { "ShopEntry", "ShopClose", "ShopTabAttack", "ShopTabDefense", "ShopTabUtility", "Menu" })
        {
            Require(f.Button(id).IsActive(),"required open Shop fixed control "+id);
            var bounds = f.Bounds((RectTransform)f.Button(id).transform);
            Require(bounds.width >= 43.99f && bounds.height >= 43.99f && screen.Contains(bounds.min) && screen.Contains(bounds.max),
                "actual reachable fixed 44px target " + id + " bounds=" + bounds + " canvas=" + screen);
        }
        foreach(string id in new[]{"Pause","ToggleMute","Effects","SpeedMinus","SpeedPlus"})
            Require(!f.Button(id).IsActive(),"open Shop hides duplicate battlefield controls "+id);
        var rate=f.Button("SpeedRate");bool activeRun=f.Game.Loop.Phase=="battle"||f.Game.Loop.Phase=="settling";
        Require(rate.IsActive()==activeRun,"open temporary Shop retains the single rate pause/resume control");
        if(activeRun)
        {
            var bounds=f.Bounds((RectTransform)rate.transform);
            Require(bounds.width>=43.99f&&bounds.height>=43.99f&&screen.Contains(bounds.min)&&screen.Contains(bounds.max),
                "open Shop rate pause/resume remains a reachable 44px control");
        }
        foreach (float normalized in new[] { 1f, .5f, 0f })
        {
            scroll.verticalNormalizedPosition = normalized; scroll.onValueChanged.Invoke(new Vector2(0, normalized)); f.Refresh();
            var clip = f.Bounds(viewport);
            foreach (var text in panel.GetComponentsInChildren<Text>(false))
            {
                float units = f.Root.rect.height / f.Canvas.pixelRect.height;
                Require(text.color.a == 1 && text.fontSize / units >= 13.99f, "actual minimum CSS text and opaque glyph color " + text.name);
                Require(text.preferredHeight <= text.rectTransform.rect.height + 1f, "actual font glyph height fits reserved field " + text.name);
            }
            foreach (var definition in LastStandUpgradeCatalog.Tracks)
            {
                var button = f.Button("ShopCard_" + definition.Key + "Buy"); if (!button.IsActive()) continue;
                var bounds = f.Bounds((RectTransform)button.transform);
                if (!clip.Contains(bounds.center))
                    Require(ShopRaycast(f, new Vector2(bounds.center.x, f.Canvas.pixelRect.height - bounds.center.y)) != button,
                        "actual mask suppresses outside pointer target " + definition.Key);
            }
        }
        scroll.verticalNormalizedPosition = 1; scroll.onValueChanged.Invoke(new Vector2(0, 1)); f.Refresh();
    }
    static Rect CanvasBounds(ShopUiFixture f) => new Rect(0, 0, f.Canvas.pixelRect.width, f.Canvas.pixelRect.height);
    static float ShopLuminance(Color color)
    {
        float Linear(float value) => value <= .04045f ? value / 12.92f : Mathf.Pow((value + .055f) / 1.055f, 2.4f);
        return .2126f * Linear(color.r) + .7152f * Linear(color.g) + .0722f * Linear(color.b);
    }
    static Color ActualFrameBackground(Graphic frame, Vector2 point, Color underlying)
    {
        // Consume the real material mesh. No copied brass/charcoal constants
        // can prove a gradient that the actual Graphic does not draw.
        using (var helper = new VertexHelper())
        {
            frame.GetType().GetMethod("OnPopulateMesh", Private, null, new[] { typeof(VertexHelper) }, null)
                .Invoke(frame, new object[] { helper });
            var vertices = new List<UIVertex>(); helper.GetUIVertexStream(vertices);
            for (int i = 0; i + 2 < vertices.Count; i += 3)
            {
                Vector2 a = vertices[i].position, b = vertices[i + 1].position, c = vertices[i + 2].position;
                float d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
                if (Math.Abs(d) < .00001f) continue;
                float u = ((b.y - c.y) * (point.x - c.x) + (c.x - b.x) * (point.y - c.y)) / d;
                float v = ((c.y - a.y) * (point.x - c.x) + (a.x - c.x) * (point.y - c.y)) / d;
                float w = 1 - u - v; if (u < -.00001f || v < -.00001f || w < -.00001f) continue;
                Color paint = (Color)vertices[i].color * u + (Color)vertices[i + 1].color * v + (Color)vertices[i + 2].color * w;
                underlying = Color.Lerp(underlying, paint, paint.a);
            }
        }
        return underlying;
    }
    static void ShopMaterialStates(ShopUiFixture f)
    {
        foreach (var button in f.Root.GetComponentsInChildren<Button>(false))
        {
            var label = button.GetComponentInChildren<Text>(true); var parent = label.transform.parent;
            var frame = parent.Find("ConsoleFrame").GetComponent<Graphic>();
            Require(frame.GetComponent<CanvasRenderer>(), "actual material has native CanvasRenderer " + button.name);
            var basic = new BaseEventData(EventSystem.current);
            var pointer = new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left };
            foreach (string state in new[] { "normal", "selected", "pressed" })
            {
                ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerUpHandler);
                ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerExitHandler);
                ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.deselectHandler);
                if (state == "selected") ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.selectHandler);
                if (state == "pressed") ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerDownHandler);
                var background = ActualFrameBackground(frame, frame.rectTransform.rect.center, button.GetComponent<Image>().color);
                var foreground = label.color * label.canvasRenderer.GetColor();
                float a = ShopLuminance(background), b = ShopLuminance(foreground);
                Require((Math.Max(a,b) + .05f) / (Math.Min(a,b) + .05f) >= 4.5f && foreground.a == 1,
                    "actual normal/disabled/selected/pressed Graphic mesh text contrast " + button.name + " " + state);
            }
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerUpHandler);
            ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.deselectHandler);
        }
        // The actual textured/rendered pixel result remains a later WebGL
        // acceptance obligation; this imported check proves the real mesh,
        // foreground and Selectable state rather than a private palette claim.
    }
    static void BattleShopProfiles()
    {
        var profiles = new[] { new Vector2Int(1920,976), new Vector2Int(1366,664), new Vector2Int(720,516),
            new Vector2Int(390,688), new Vector2Int(844,266) };
        foreach (var profile in profiles) foreach (bool launcher in new[] { false, true })
        {
        // T17 adds garage admission. Preserve the original absence assertion
        // in the real pending-reward result, which still forbids shop entry.
        using (var pending = new ShopUiFixture(launcher, profile))
        {
            WorkshopPendingResult(pending);
            var entry = pending.Button("ShopEntry"); ShopInventory(pending);
            Require(!entry.IsActive(), "battle shop has no garage/permanent admission in T16");
        }
        using (var f = new ShopUiFixture(launcher, profile))
        {
            // This first assertion is the behavioral RED on the compiled HUD.
            var shop = Funded(f.Game); f.Refresh();
            var model = f.Game.Session.Model; int tick = model.Tick; double timestamp = f.Game.Timestamp;
            f.Click("ShopEntry");
            Require(!f.Game.Session.Paused && model.Tick == tick && f.Game.Timestamp == timestamp && shop.Scrap == 6,
                "opening live shop does not pause, reset or advance the sole clock");
            ShopCards(f, LastStandUpgradeCategory.Attack); ShopGeometry(f); ShopMaterialStates(f);
            f.Click("ShopTabDefense"); ShopCards(f, LastStandUpgradeCategory.Defense);
            f.Click("ShopTabUtility"); ShopCards(f, LastStandUpgradeCategory.Utility);
            var incompatible = f.Button("ShopCard_" + (launcher ? "fieldRepair" : "launcherAttack") + "Buy");
            Require(!incompatible.gameObject.activeInHierarchy && !incompatible.IsActive(), "wrong fitting is hidden from the Shop");
            f.Click("ShopTabAttack"); f.Reanchor(); int changes = 0; f.Game.Loop.Changed += () => changes++;
            f.Click("ShopCard_cannonAttackBuy");
            Require(changes == 1 && shop.Scrap == 1 && shop.SpentScrap == 5 && shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases == 1 &&
                model.CurrentCannonDamage == 30 && f.Game.Storage.Writes == 1 && f.Game.Loop.Progression.Wallet == 20,
                "one actual Button activation submits current intent and updates only live run/model once");
            Require(f.Text("CannonDamage").text == "CANNON  30 DAMAGE" && f.Text("PhaseDetail").text.Contains("CANNON  30 DAMAGE"),
                "actual current cannon stats in both HUD presentations");
            ShopCards(f, LastStandUpgradeCategory.Attack);
            ShopMaterialStates(f);
            int spent = shop.SpentScrap; var disabled = f.Button("ShopCard_cannonAttackBuy");
            ExecuteEvents.Execute(disabled.gameObject, new BaseEventData(EventSystem.current), ExecuteEvents.submitHandler);
            Require(shop.SpentScrap == spent && changes == 1, "disabled insufficient funds cannot submit a second purchase");
            f.Click("ShopClose"); Require(!f.Button("ShopClose").IsActive() && !f.Game.Session.Paused && Shop(f.Game.Session) == shop,
                "Close invalidates panel without changing pause/run ledger");
            f.Click("ShopEntry"); ShopCards(f, LastStandUpgradeCategory.Attack);
            f.Reanchor();f.Click("SpeedRate");
            Require(f.Game.Session.ManualPaused && f.Game.Session.Paused && f.Button("ShopClose").IsActive() &&
                f.Button("SpeedRate").GetComponentInChildren<Text>().text=="0x\nPAUSED", "actual rate pause retains live shop");
            int permanentWallet = f.Game.Loop.Progression.Wallet, permanentP = f.Game.Loop.Progression.CannonAttackLevel;
            int permanentWrites = f.Game.Storage.Writes;
            var oldButton = f.Button("ShopCard_cannonAttackBuy"); f.Game.Session.ReturnToInspection(); f.Refresh();
            oldButton.onClick.Invoke();
            Require(!f.Button("ShopClose").IsActive() && f.Button("ShopEntry").IsActive() && shop.Scrap == 0 &&
                f.Game.Loop.FinalAccounting != null && f.Game.Loop.FinalAccounting.SpentScrap == spent,
                "terminal cleanup closes panel and stale direct callback cannot spend or revive");
            Require(f.Game.Loop.Progression.Wallet == permanentWallet && f.Game.Loop.Progression.CannonAttackLevel == permanentP &&
                f.Game.Storage.Writes == permanentWrites, "stale run callback cannot become a permanent garage purchase");
        }
        }
    }
    static void BattleShopPausedHullAndRefusals()
    {
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664)))
        {
            var shop = Funded(f.Game); var model = f.Game.Session.Model; f.Refresh(); f.Click("ShopEntry");
            var foe = model.Foes[0];
            typeof(EncounterFoe).GetProperty("Hull").SetValue(foe, 1);
            typeof(EncounterFoe).GetProperty("Distance").SetValue(foe, 0);
            SetField(model, "nextCannon", model.Tick + 1);
            int version = shop.Version, kills = model.Kills;
            f.Reanchor(LastStandRunClock.StepSeconds); f.Click("ShopCard_cannonAttackBuy");
            Require(model.Kills == kills + 1 && shop.Version > version && shop.Scrap == 9 && shop.SpentScrap == 0 &&
                model.CurrentCannonDamage == 20 && shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases == 0 &&
                f.Text("ShopCard_cannonAttackRefusal").text == "Offer changed. Review the card and try again.",
                "actual live click captures before settlement and displays the typed refusal without a debit");
            f.Game.Session.TogglePauseAt(f.Game.Timestamp); f.Refresh(); f.Reanchor(); f.Click("ShopCard_cannonAttackBuy");
            Require(shop.Scrap == 4 && shop.SpentScrap == 5 && model.CurrentCannonDamage == 30 &&
                f.Text("ShopCard_cannonAttackRefusal").text != "Offer changed. Review the card and try again.",
                "a new real activation captures the latest intent and clears earlier refusal feedback");
        }
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664)))
        {
            var shop = Funded(f.Game); var model = f.Game.Session.Model;
            typeof(EncounterModel).GetProperty("Hull").SetValue(model, 60);
            f.Game.Session.TogglePauseAt(f.Game.Timestamp); f.Refresh(); f.Click("ShopEntry"); f.Click("ShopTabDefense");
            int tick = model.Tick; f.Reanchor(); f.Click("ShopCard_hullCapacityBuy");
            Require(f.Game.Session.Paused && model.Tick == tick && model.Hull == 75 && model.CurrentMaximumHull == 135 &&
                f.Text("HullValue").text == "HULL  75 / 135" && f.Text("PhaseDetail").text.Contains("HULL  75 / 135"),
                "paused actual hull buy excludes time and updates current/max labels");
            var fill = (RectTransform)f.Root.Find("LastStandCard/HullBar/HullFill");
            Require(Math.Abs(fill.anchorMax.x - 75f / 135) < .0001f, "hull fraction uses actual dynamic maximum");
            ShopCards(f, LastStandUpgradeCategory.Defense);
        }
        using (var f = new ShopUiFixture(true, new Vector2Int(1366,664)))
        {
            var shop = Funded(f.Game); f.Refresh(); f.Click("ShopEntry");
            f.Game.Session.AdvanceAt(f.Game.Timestamp + 10); f.Refresh();
            Require(f.Game.Session.CatchingUp && !f.Button("ShopCard_cannonAttackBuy").IsInteractable() &&
                f.Text("ShopCard_cannonAttackRefusal").text == "Catching up", "unfinished real clock debt refuses live Buy visibly");
        }
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664)))
        {
            var shop = Funded(f.Game); f.Game.Session.TogglePauseAt(f.Game.Timestamp);
            Require(shop.ObserveAuthoritativeKills(100), "owner-arranged cap fixture funds are valid");
            for (int i = 0; i < LastStandUpgradeCatalog.TotalCap; i++)
                Require(Buy(f.Game, Intent(shop, LastStandUpgradeTrackId.CannonAttack), f.Game.Timestamp).Accepted, "actual owner buys each cap level");
            f.Refresh(); f.Click("ShopEntry");
            Require(f.Text("ShopCard_cannonAttackPrice").text == "MAX" && f.Text("ShopCard_cannonAttackRefusal").text == "MAX" &&
                !f.Button("ShopCard_cannonAttackBuy").IsInteractable(), "exact cap/MAX refusal from immutable projection");
        }
    }
    public static void RunBattleShop()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_battle_shop_tabs_live_cards_and_refusal_feedback", () =>
                { BattleShopProfiles(); BattleShopPausedHullAndRefusals(); }, ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static void FirstSessionClarity()
    {
        foreach (var profile in new[] { new Vector2Int(1920,976),new Vector2Int(1366,664),new Vector2Int(720,516),
            new Vector2Int(390,688),new Vector2Int(844,266) })
        foreach (bool launcher in new[] { false,true })
        using (var f = new ShopUiFixture(launcher,profile,new MemoryStorage { Value = Save(new int[6],wallet: 0) }))
        {
            f.Click("ShopEntry");
            Require(f.Text("ShopHeading").text == "SHOP / PERMANENT" && f.Text("ShopCurrency").text == "SALVAGE  0",
                "permanent title explains lifetime beside the exact committed wallet");
            Require(f.Text("ShopHeading").preferredHeight <= f.Text("ShopHeading").rectTransform.rect.height + 1,
                "permanent lifetime heading fits the existing slot");
            f.Click("ShopClose"); f.Click("Deploy");
            f.Game.AdvanceTicks(1199); f.Refresh();
            Require(f.Text("PhaseHeading").text == "HOLD THE POSITION","live banner does not grant an early goal");
            Require(f.Text("PhaseHeading").preferredHeight<=f.Text("PhaseHeading").rectTransform.rect.height+1,
                "initial live heading is fully readable at "+profile);
            int writes = f.Game.Storage.Writes;
            f.Game.AdvanceTicks(1); f.Refresh();
            var heading = f.Text("PhaseHeading");
            Require(f.Game.Loop.Phase == "battle" && heading.text == "Goal met; saves at end",
                "actual live goal banner explains future persistence");
            Require(heading.preferredHeight <= heading.rectTransform.rect.height + 1,
                "live goal save boundary fits the existing one-line slot at " + profile);
            Require(f.Game.Storage.Writes == writes && f.Game.Loop.Progression.GetBestTicks(1) == 0 &&
                !f.Game.Loop.Progression.TierTwoUnlocked,"live goal writes no record or unlock");
            f.Click("ShopEntry");
            Require(f.Text("ShopHeading").text == "SHOP / THIS RUN" &&
                f.Text("ShopCurrency").text == "SCRAP  " + Shop(f.Game.Session).Scrap,
                "temporary title explains lifetime beside the exact run balance");
            Require(f.Text("ShopHeading").preferredHeight <= f.Text("ShopHeading").rectTransform.rect.height + 1,
                "temporary lifetime heading fits the existing slot");
            var scroll = f.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            scroll.verticalNormalizedPosition = .5f; scroll.onValueChanged.Invoke(new Vector2(0,.5f)); f.Refresh();
            var model = f.Game.Session.Model; string snapshot = model.Snapshot(), save = f.Game.Storage.Value;
            var scrollPosition = scroll.content.anchoredPosition;
            bool original = f.Game.Session.View.FullEffects, muted = f.Game.Loop.Muted;
            bool manualPaused=f.Game.Session.ManualPaused;
            string phase = f.Game.Loop.Phase;
            f.Reanchor();f.Click("Menu");f.Click("MenuSettings");f.Click("SettingsTab1");
            Require(f.Game.Loop.MenuPage=="settings"&&f.Game.Session.MenuPaused&&f.Game.Session.Paused,
                "open Shop enters real Display settings and holds the run");
            var keyboard=f.Root.GetComponent<LastStandHudKeyboard>();keyboard.NavigateKeyboard("enter-first");
            int remaining=64;
            while(EventSystem.current.currentSelectedGameObject!=f.Button("DisplayEffects").gameObject&&remaining-->0)keyboard.NavigateKeyboard("next");
            Require(EventSystem.current.currentSelectedGameObject==f.Button("DisplayEffects").gameObject,
                "ordinary keyboard focus reveals Display effects even in compact settings");
            f.Refresh();
            for (int toggle = 0; toggle < 2; toggle++)
            {
                f.Click("DisplayEffects");
                Require(f.Game.Session.View.FullEffects == (toggle == 0 ? !original : original),"open Shop effects round trip uses actual setting");
                var effects = f.Button("DisplayEffects"); var label = effects.GetComponentInChildren<Text>();
                var bounds = f.Bounds((RectTransform)effects.transform);
                Require(label.text == (f.Game.Session.View.FullEffects ? "EFFECTS: FULL" : "EFFECTS: REDUCED") &&
                    label.preferredHeight <= label.rectTransform.rect.height + .2f,"open Shop full/reduced label fits " + profile);
                Require(bounds.width >= 43.99f && bounds.height >= 43.99f && CanvasBounds(f).Contains(bounds.min) &&
                    CanvasBounds(f).Contains(bounds.max),"open Shop effects retains reachable44px target " + profile);
                var settingsViewport=f.Bounds((RectTransform)f.Root.Find("SettingsModal/SettingsPanel/SettingsViewport"));
                Require(settingsViewport.Contains(bounds.min)&&settingsViewport.Contains(bounds.max)&&
                    ShopRaycast(f,new Vector2(bounds.center.x,f.Canvas.pixelRect.height-bounds.center.y))==effects,
                    "Display effects is revealed inside the actual mask and reached by the pointer");
                Require(f.Game.Session.Model == model && model.Snapshot() == snapshot && f.Game.Storage.Value == save &&
                    f.Game.Storage.Writes == writes && f.Game.Loop.Muted == muted && f.Game.Loop.Phase == phase &&
                    f.Game.Session.MenuPaused&&f.Game.Session.Paused&&f.Game.Session.ManualPaused==manualPaused&&
                    f.Root.Find("ShopPanel").gameObject.activeInHierarchy && scroll.content.anchoredPosition == scrollPosition,
                    "Display effects preserves underlying Shop model save audio phase pause and scroll position");
            }
            f.Click("SettingsClose");
            Require(!f.Game.Loop.MenuOpen&&!f.Game.Session.MenuPaused&&f.Game.Session.Paused==manualPaused&&
                f.Game.Session.ManualPaused==manualPaused&&model.Snapshot()==snapshot&&f.Game.Storage.Value==save&&
                f.Root.Find("ShopPanel").gameObject.activeInHierarchy&&scroll.content.anchoredPosition==scrollPosition,
                "closing Display restores the same Shop without changing manual pause, combat, save or scroll");
        }
    }
    public static void RunFirstSessionClarity()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_first_session_clarity_live_goal_and_purchase_lifetimes",FirstSessionClarity,ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    public static void RunT16Affected()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        // Execute existing assertions in one exclusively owned imported Editor.
        RunDeploy(); RunIncome(); RunSettle();
        LastStandHudChecks.RunGarage(); LastStandHudChecks.RunBattle();
        LastStandHudChecks.RunOutcomes(); LastStandHudChecks.RunInput();
    }
    static void WorkshopPendingResult(ShopUiFixture f)
    {
        PrepareFinalKill(f.Game); var model = f.Game.Session.Model;
        typeof(EncounterModel).GetProperty("Hull").SetValue(model, 1);
        SetField(model.Foes[0], "NextAttack", 5); f.Game.AdvanceTicks(1);
        f.Game.AdvanceTicks(10); Invoke(f.Game.Loop, "Update"); f.Refresh();
        Require(f.Game.Loop.Phase == "result" && f.Game.Session.Model == null &&
            f.Game.Loop.Progression.PendingDefeat?.Reward == 1, "real settled defeat waits for manual Claim");
    }
    static void PermanentCards(ShopUiFixture f, LastStandUpgradeCategory category)
    {
        var progress = f.Game.Loop.Progression;
        var view = LastStandShopPresentation.ProjectPermanent(progress,
            f.Game.Art.showingLauncher ? LastStandFitting.Launcher : LastStandFitting.Repair);
        Require(f.Text("ShopHeading").text == "SHOP / PERMANENT" && f.Text("ShopCurrency").text == "SALVAGE  " + progress.Wallet,
            "Salvage purchase lifetime and only committed balance");
        int visible = 0;
        foreach (var card in view.Cards)
        {
            string id = "ShopCard_" + card.Key; var button = f.Button(id + "Buy");
            Require(button.gameObject.activeInHierarchy == (card.Category == category && card.AppliesToFitting), "permanent category and fitted module visibility " + card.Key);
            if (card.Category != category || !card.AppliesToFitting) continue;
            visible++;
            Require(f.Text(id + "Title").text == card.Name && f.Text(id + "Levels").text ==
                "Level " + card.PermanentLevel + " / " + card.Cap, "verified permanent level without run currency " + card.Key);
            Require(f.Text(id + "CurrentEffect").text == card.CurrentEffectDescription +
                (card.NextPrice.HasValue ? " to " + card.NextEffectDescription : "") &&
                f.Text(id + "Price").text == card.PriceDescription, "permanent exact current/next effect and P price " + card.Key);
            Require(f.Text(id + "Refusal").text == card.Reason && button.IsInteractable() == card.CanPurchase,
                "permanent typed refusal and saved admission " + card.Key);
        }
        int expected = category == LastStandUpgradeCategory.Defense ? 2 :
            category == LastStandUpgradeCategory.Attack ? (f.Game.Art.showingLauncher ? 2 : 1) : (f.Game.Art.showingLauncher ? 1 : 2);
        Require(visible == expected, "permanent exact fitting-applicable cards per category");
    }
    static void PermanentGeometry(ShopUiFixture f)
    {
        var panel = (RectTransform)f.Root.Find("ShopPanel"); var viewport = (RectTransform)panel.Find("ShopViewport");
        var scroll = panel.GetComponent<ScrollRect>(); var screen = CanvasBounds(f); var bounds = f.Bounds(panel);
        Require(panel.GetComponent<Image>().color.a == 1 && viewport.GetComponent<RectMask2D>() &&
            scroll.viewport == viewport && scroll.content == viewport.Find("ShopContent"), "permanent same opaque masked scroll owner");
        Require(screen.Contains(bounds.min) && screen.Contains(bounds.max), "permanent panel inside available Canvas");
        foreach (var button in f.Root.GetComponentsInChildren<Button>(false))
        {
            var target = f.Bounds((RectTransform)button.transform);
            Require(target.width >= 43.99f && target.height >= 43.99f, "permanent actual minimum 44px target " + button.name);
        }
        foreach (var text in panel.GetComponentsInChildren<Text>(false))
        {
            float units = f.Root.rect.height / f.Canvas.pixelRect.height;
            Require(text.color.a == 1 && text.fontSize / units >= 13.99f &&
                text.preferredHeight <= text.rectTransform.rect.height + 1f, "permanent actual opaque readable 14px field " + text.name);
        }
        ShopMaterialStates(f);
    }
    static void WorkshopProfiles()
    {
        foreach (var profile in new[] { new Vector2Int(1920,976), new Vector2Int(1366,664), new Vector2Int(720,516),
            new Vector2Int(390,688), new Vector2Int(844,266) })
        foreach (bool launcher in new[] { false, true })
        using (var f = new ShopUiFixture(launcher, profile, new MemoryStorage { Value = Save(new int[6], wallet: 0) }))
        {
            Require(f.Game.Loop.Phase == "garage" && f.Button("ShopEntry").IsActive() && f.Button("ShopEntry").IsInteractable(),
                "zero-Salvage garage exposes real Mechanics Shop entry before deployment");
            ShopInventory(f); f.Click("ShopEntry");
            foreach (var category in new[] { LastStandUpgradeCategory.Attack, LastStandUpgradeCategory.Defense, LastStandUpgradeCategory.Utility })
            {
                f.Click("ShopTab" + category); PermanentCards(f, category); PermanentGeometry(f);
            }
            Require(f.Game.Storage.Writes == 0 && f.Game.Session.Model == null && f.Game.Loop.Progression.Wallet == 0,
                "browsing unfunded permanent cards creates no run, charge, claim or save");
            f.Click("ShopClose"); Require(!f.Button("ShopClose").IsActive(), "permanent close returns to garage controls");
        }
    }
    static void WorkshopPricesAndNextRun(bool launcher)
    {
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664),
            new MemoryStorage { Value = Save(new int[6], wallet: 50) }))
        {
            f.Click("ShopEntry"); int wallet = 50, writes = 0;
            foreach (var definition in LastStandUpgradeCatalog.Tracks)
            {
                if (!definition.IsEligible(f.Game.Art.showingLauncher ? LastStandFitting.Launcher : LastStandFitting.Repair))
                    SelectUiFitting(f,!f.Game.Art.showingLauncher);
                f.Click("ShopTab" + definition.Category);
                for (int p = 0; p < 3; p++)
                {
                    PermanentCards(f, definition.Category);
                    Require(f.Text("ShopCard_" + definition.Key + "Price").text == (p + 1) + " Salvage",
                        "real permanent exact independent P+1 price " + definition.Key);
                    f.Click("ShopCard_" + definition.Key + "Buy"); wallet -= p + 1; writes++;
                    Require(f.Game.Loop.Progression.Wallet == wallet && f.Game.Storage.SuccessfulWrites == writes &&
                        f.Game.Loop.Progression.GetPermanentLevel(definition.Id) == p + 1 && f.Game.Session.Model == null,
                        "one real verified purchase charges only requested P once " + definition.Key);
                }
                PermanentCards(f, definition.Category);
                var capped = f.Button("ShopCard_" + definition.Key + "Buy"); capped.onClick.Invoke();
                Require(!capped.IsInteractable() && f.Text("ShopCard_" + definition.Key + "Price").text == "MAX" &&
                    f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == wallet, "cap three direct stale activation cannot debit " + definition.Key);
            }
            var reloaded = LastStandProgression.Load(f.Game.Storage);
            foreach (var definition in LastStandUpgradeCatalog.Tracks)
                Require(reloaded.GetPermanentLevel(definition.Id) == 3, "all six verified levels survive reload " + definition.Key);
            f.Click("ShopClose"); SelectUiFitting(f,!launcher); f.Click("Redeploy");
            Fresh(Shop(f.Game.Session), 7, !launcher, new[] { 3,3,3,3,3,3 });
            Require(f.Game.Session.Model.CommittedCannonDamage == 50 && !f.Button("ShopClose").IsActive(),
                "next deployment uses committed baseline and invalidates permanent panel");
        }
    }
    static void WorkshopClaimAndSaveErrors(bool launcher)
    {
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664)))
        {
            WorkshopPendingResult(f); int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet;
            f.Button("ShopEntry").onClick.Invoke(); f.Button("ShopCard_armorBuy").onClick.Invoke();
            Require(!f.Button("ShopEntry").IsActive() && !f.Button("ShopClose").IsActive() &&
                f.Game.Loop.Progression.PendingDefeat != null && f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == wallet,
                "pending reward cannot open, auto-Claim or purchase through stale callbacks");
            f.Click("Claim"); Require(f.Game.Loop.Progression.PendingDefeat == null && f.Game.Loop.Progression.Wallet == wallet + 1 &&
                f.Button("ShopEntry").IsActive(), "only manual verified Claim opens post-Claim permanent admission");
            f.Click("ShopEntry"); f.Click("ShopTabDefense"); f.Click("ShopCard_armorBuy");
            Require(f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 1 &&
                f.Game.Loop.Progression.Wallet == wallet && f.Game.Storage.Writes == writes + 2,
                "post-Claim actual permanent purchase uses Salvage exactly once");
        }
        foreach (bool readFailure in new[] { false, true })
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664)))
        {
            SelectUiFitting(f,false);
            f.Click("ShopEntry"); f.Click("ShopTabUtility");
            f.Game.Storage.FailWrite = !readFailure; f.Game.Storage.FailReadBack = readFailure;
            f.Click("ShopCard_fieldRepairBuy");
            Require(f.Game.Loop.Progression.SaveState == "retry" && f.Game.Loop.Progression.Wallet == 20 &&
                f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.FieldRepair) == 0 &&
                f.Text("ShopCard_fieldRepairLevels").text == "Level 0 / 3" && f.Text("ShopCurrency").text == "SALVAGE  20" &&
                f.Text("SaveStatus").text.Contains(f.Game.Loop.Progression.SaveError), "unconfirmed non-Cannon write preserves honest committed card, wallet and error");
            Require(!f.Button("ShopCard_fieldRepairBuy").IsInteractable() && !f.Button("Redeploy").IsInteractable() &&
                !f.Button("Purchase").IsInteractable() && f.Button("RetrySave").IsInteractable(), "unconfirmed write blocks destructive actions and exposes manual Retry Save");
            f.Game.Storage.FailWrite = f.Game.Storage.FailReadBack = false; f.Click("RetrySave");
            Require(f.Game.Loop.Progression.Wallet == 19 && f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.FieldRepair) == 1 &&
                f.Game.Storage.SuccessfulWrites == 1 && f.Game.Loop.Notice.Contains("Field Repair"), "retry reconciles chosen non-Cannon candidate once with confirmed feedback");
            int attempts = f.Game.Storage.Writes; f.Game.Loop.RetrySave(); f.Refresh();
            Require(f.Game.Storage.Writes == attempts && f.Game.Loop.Progression.Wallet == 19 &&
                f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.FieldRepair) == 1, "repeated manual retry never charges a second purchase");
            PermanentCards(f, LastStandUpgradeCategory.Utility);
        }
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664)))
        {
            f.Click("ShopEntry"); f.Click("ShopTabDefense");
            f.Game.Storage.BeforeReadBack = () => f.Game.Storage.Value = Save(new int[6], wallet: 77);
            f.Click("ShopCard_armorBuy"); f.Game.Storage.BeforeReadBack = null;
            string conflict = f.Game.Storage.Value; int writes = f.Game.Storage.Writes;
            f.Click("RetrySave");
            Require(f.Game.Loop.Progression.SaveState == "blocked" && f.Game.Loop.Progression.Wallet == 20 &&
                f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 0 &&
                f.Game.Storage.Value == conflict && f.Game.Storage.Writes == writes &&
                !f.Button("ShopCard_armorBuy").IsInteractable(), "manual retry preserves conflicting bytes and unconfirmed permanent candidate");
        }
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664)))
        {
            var typed = typeof(LastStandLoopController).GetMethod("Purchase", new[] { typeof(LastStandUpgradeTrackId) });
            Require(typed != null, "actual controller exposes generic typed permanent purchase");
            int writes = f.Game.Storage.Writes; string raw = f.Game.Storage.Value;
            typed.Invoke(f.Game.Loop, new object[] { (LastStandUpgradeTrackId)99 });
            Require(f.Game.Storage.Writes == writes && f.Game.Storage.Value == raw, "unknown permanent track has no side effects");
            f.Click("ShopEntry"); f.Click("ShopTabDefense");
            f.Game.Storage.BeforeWrite = () => typed.Invoke(f.Game.Loop, new object[] { LastStandUpgradeTrackId.CannonAttack });
            f.Click("ShopCard_armorBuy"); f.Game.Storage.BeforeWrite = null;
            Require(f.Game.Storage.SuccessfulWrites == 1 && f.Game.Loop.Progression.Wallet == 19 &&
                f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 1 &&
                f.Game.Loop.Progression.CannonAttackLevel == 0, "reentrant permanent activation cannot replace the chosen transaction");
            f.Click("ShopClose"); f.Click("Redeploy"); var model = f.Game.Session.Model; string snapshot = model.Snapshot();
            writes = f.Game.Storage.Writes; raw = f.Game.Storage.Value;
            typed.Invoke(f.Game.Loop, new object[] { LastStandUpgradeTrackId.Armor });
            Require(f.Game.Storage.Writes == writes && f.Game.Storage.Value == raw && model.Snapshot() == snapshot,
                "active run rejects generic permanent purchase without changing frozen model");
        }
    }
    public static void RunWorkshop()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_workshop_garage_post_claim_prices_and_save_error", () => {
                WorkshopProfiles(); foreach (bool launcher in new[] { false, true })
                { WorkshopPricesAndNextRun(launcher); WorkshopClaimAndSaveErrors(launcher); }
            }, ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    // Decode the real compiled call operands: an unused test-only producer is
    // insufficient. ReportShopState must consume this exact serialized path.
    static bool CallsMethod(MethodInfo caller, MethodInfo target)
    {
        var codes = new Dictionary<short, System.Reflection.Emit.OpCode>();
        foreach (var field in typeof(System.Reflection.Emit.OpCodes).GetFields(BindingFlags.Public | BindingFlags.Static))
            if (field.FieldType == typeof(System.Reflection.Emit.OpCode))
            { var code = (System.Reflection.Emit.OpCode)field.GetValue(null); codes[code.Value] = code; }
        byte[] body = caller.GetMethodBody().GetILAsByteArray();
        for (int i = 0; i < body.Length;)
        {
            short value = body[i++];
            if (value == 0xfe) value = (short)(0xfe00 | body[i++]);
            var code = codes[value];
            if (code.OperandType == System.Reflection.Emit.OperandType.InlineMethod &&
                caller.Module.ResolveMethod(BitConverter.ToInt32(body, i)) == target &&
                (code == System.Reflection.Emit.OpCodes.Call || code == System.Reflection.Emit.OpCodes.Callvirt)) return true;
            switch (code.OperandType)
            {
                case System.Reflection.Emit.OperandType.InlineNone: break;
                case System.Reflection.Emit.OperandType.ShortInlineBrTarget:
                case System.Reflection.Emit.OperandType.ShortInlineI:
                case System.Reflection.Emit.OperandType.ShortInlineVar: i++; break;
                case System.Reflection.Emit.OperandType.InlineVar: i += 2; break;
                case System.Reflection.Emit.OperandType.InlineI8:
                case System.Reflection.Emit.OperandType.InlineR: i += 8; break;
                case System.Reflection.Emit.OperandType.InlineSwitch: i += 4 + 4 * BitConverter.ToInt32(body, i); break;
                default: i += 4; break;
            }
        }
        return false;
    }
    [Serializable] sealed class CommittedObservation
    {
        public string phase;
        public int[] permanentLevels;
        public int salvage, tick;
        public CommittedCard[] cards;
    }
    [Serializable] sealed class CommittedCard { public int trackId, p; }
    static string CaptureShop(ShopUiFixture f)
    {
        var capture = typeof(LastStandLoopHud).GetMethod("CaptureShopStateJson", Private);
        Require(capture != null && CallsMethod(typeof(LastStandLoopHud).GetMethod("ReportShopState", Private), capture),
            "actual ReportShopState consumes the compiled observation producer");
        return (string)capture.Invoke(f.Hud, null);
    }
    static CommittedObservation CommittedLevels(ShopUiFixture f, int[] expected, bool absentCards)
    {
        string json = CaptureShop(f);
        Require(json != null, "committed-state change produces a semantic observation");
        var observed = JsonUtility.FromJson<CommittedObservation>(json);
        Require(observed.permanentLevels != null && observed.permanentLevels.Length == 6,
            "actual serialized ShopObservation includes all six committed permanentLevels");
        for (int i = 0; i < 6; i++) Require(observed.permanentLevels[i] == expected[i],
            "committed observation catalog-ID level " + i);
        Require(observed.cards != null && (absentCards ? observed.cards.Length == 0 : observed.cards.Length == 6),
            "committed levels are independent of the actual present or absent cards");
        Require(observed.phase == f.Game.Loop.Phase && observed.salvage == f.Game.Loop.Progression.Wallet &&
            observed.tick == (f.Game.Session.Model?.Tick ?? -1), "existing observation fields remain truthful");
        Require(CaptureShop(f) == null, "unchanged committed snapshot retains semantic dedup");
        return observed;
    }
    static void CommittedObservationCatalogAndDedup()
    {
        string[] keys = { "cannonAttack", "launcherAttack", "hullCapacity", "armor", "cannonCycle", "fieldRepair" };
        Require(LastStandUpgradeCatalog.Tracks.Count == keys.Length, "committed observation six catalog identities");
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664)))
        {
            var zero = new int[6]; CommittedLevels(f, zero, false);
            for (int i = 0; i < keys.Length; i++)
            {
                var track = LastStandUpgradeCatalog.Tracks[i];
                Require((int)track.Id == i && track.Key == keys[i], "committed observation stable catalog order " + keys[i]);
                var expected = new int[6]; expected[i] = 3;
                f.Game.Storage.Value = Save(expected);
                Require(f.Game.Loop.Progression.Retry(), "real progression reloads the committed basis vector");
                // Keep the prior card projection deliberately unchanged. The
                // new committed state must be observed without a card refresh.
                var observed = CommittedLevels(f, expected, false);
                foreach (var card in observed.cards) Require(card.p == 0, "retained cards cannot supply committed levels");
                f.Game.Storage.Value = Save(zero); Require(f.Game.Loop.Progression.Retry(), "restore real committed zero levels");
                CommittedLevels(f, zero, false);
                Require(observed.permanentLevels[i] == 3, "previous observation is an immutable snapshot");
            }
            Require(f.Game.Storage.Writes == 0, "diagnostic observations perform no storage writes");
        }
    }
    static void CommittedObservationAbsentCards()
    {
        int[] expected = { 0,2,1,3,1,2 };
        foreach (bool denied in new[] { false, true })
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664), new MemoryStorage { Value = Save(expected) }))
        {
            PrepareFinalKill(f.Game); var model = f.Game.Session.Model;
            typeof(EncounterModel).GetProperty("Hull").SetValue(model, 1); SetField(model.Foes[0], "NextAttack", 5);
            f.Game.Storage.FailWrite = denied; f.Game.AdvanceTicks(1);
            if (!denied) { f.Game.AdvanceTicks(10); Invoke(f.Game.Loop, "Update"); }
            f.Refresh();
            Require(f.Game.Loop.Phase == (denied ? "save-error" : "result"), "actual card-free terminal phase");
            CommittedLevels(f, expected, true);
            int writes = f.Game.Storage.Writes;
            f.Refresh(); Require(CaptureShop(f) == null && f.Game.Storage.Writes == writes,
                "terminal refresh neither republishes unchanged levels nor writes storage");
        }
    }
    static void CommittedObservationUncertainArmor()
    {
        int[] expected = { 2,1,3,0,2,1 };
        foreach (bool readFailure in new[] { false, true })
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664), new MemoryStorage { Value = Save(expected) }))
        {
            f.Click("ShopEntry"); f.Click("ShopTabDefense"); CommittedLevels(f, expected, false);
            bool beforeWriteUnchanged = false, beforeReadBackUnchanged = false;
            f.Game.Storage.BeforeWrite = () => beforeWriteUnchanged = CaptureShop(f) == null;
            f.Game.Storage.BeforeReadBack = () => beforeReadBackUnchanged = CaptureShop(f) == null;
            f.Game.Storage.FailWrite = !readFailure; f.Game.Storage.FailReadBack = readFailure;
            f.Click("ShopCard_armorBuy");
            f.Game.Storage.BeforeWrite = f.Game.Storage.BeforeReadBack = null;
            Require(beforeWriteUnchanged && (!readFailure || beforeReadBackUnchanged),
                "staged candidate cannot publish before write or before successful verification returns");
            Require(f.Game.Loop.Progression.SaveState == "retry" && f.Game.Loop.Progression.Wallet == 20 &&
                f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 0,
                "actual denied or uncertain armor transaction retains old committed state");
            var failed = CommittedLevels(f, expected, false);
            Require(failed.permanentLevels[3] == 0 && f.Game.Storage.SuccessfulWrites == (readFailure ? 1 : 0),
                "storage candidate never becomes diagnostic committed state before confirmation");
            f.Game.Storage.FailWrite = f.Game.Storage.FailReadBack = false; f.Click("RetrySave");
            int[] confirmed = { 2,1,3,1,2,1 }; CommittedLevels(f, confirmed, false);
            Require(f.Game.Loop.Progression.SaveState == "ready" && f.Game.Loop.Progression.Wallet == 19 &&
                f.Game.Storage.SuccessfulWrites == 1, "confirmed retry commits and debits the armor purchase once");
            int writes = f.Game.Storage.Writes; f.Game.Loop.RetrySave(); f.Refresh();
            Require(CaptureShop(f) == null && f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == 19,
                "repeated retry cannot publish another level or debit");
        }
    }
    static void CommittedObservationTickDedup()
    {
        using (var f = new ShopUiFixture(false, new Vector2Int(1366,664)))
        {
            f.Click("Redeploy"); f.Game.AdvanceTicks(1); f.Refresh();
            CommittedLevels(f, new int[6], false); int tick = f.Game.Session.Model.Tick;
            f.Game.AdvanceTicks(1); f.Refresh();
            Require(f.Game.Session.Model.Tick == tick + 1 && CaptureShop(f) == null,
                "real tick-only advancement still suppresses unchanged semantic observations");
        }
    }
    public static void RunWorkshopObservation()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_workshop_committed_levels_observation_without_cards", () => {
                CommittedObservationCatalogAndDedup(); CommittedObservationAbsentCards(); CommittedObservationUncertainArmor();
                CommittedObservationTickDedup();
            }, ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single); Application.runInBackground = background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    // Supply bounded input frames to the EXISTING StandaloneInputModule. Its
    // ordinary raycast, press/release and Submit paths still own dispatch.
    sealed class NativeShopInput : IDisposable
    {
        public readonly EventSystem Events;
        public readonly StandaloneInputModule Module;
        readonly LastStandShopInputFrames frames;
        readonly BaseInput previous;
        readonly ShopUiFixture fixture;
        public NativeShopInput(ShopUiFixture f)
        {
            fixture = f; Events = EventSystem.current;
            Module = Events.GetComponent<StandaloneInputModule>();
            Require(Module && Events.GetComponents<BaseInputModule>().Length == 1,
                "one existing StandaloneInputModule owns shop input");
            previous = Module.inputOverride;
            frames = Events.gameObject.AddComponent<LastStandShopInputFrames>();
            Module.inputOverride = frames;
            SetField(Events, "m_HasFocus", true);
            typeof(BaseInputModule).GetMethod("OnEnable", Private).Invoke(Module, null);
            Module.ActivateModule(); Render();
        }
        public void Render()
        { fixture.Refresh(); fixture.Camera.Render(); Canvas.ForceUpdateCanvases(); }
        void Process()
        { Module.UpdateModule(); Module.Process(); frames.Clear(); Render(); }
        void ProcessScroll()
        {
            var scroll = fixture.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            Canvas.ForceUpdateCanvases(); Invoke(scroll, "LateUpdate");
            Module.UpdateModule(); Module.Process(); frames.Clear();
            // Complete the real ScrollRect lifecycle before the next ordinary
            // combat refresh, without injecting an extra HUD refresh ourselves.
            Invoke(scroll, "LateUpdate");
            Canvas.ForceUpdateCanvases(); fixture.Camera.Render(); Canvas.ForceUpdateCanvases();
        }
        public void Wheel(Vector2 position)
        { frames.Position = position; frames.Scroll = new Vector2(0,1000); ProcessScroll(); }
        float ProcessScrollBeforeControllerLayout()
        {
            var scroll = fixture.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            Canvas.ForceUpdateCanvases(); Invoke(scroll, "LateUpdate");
            Module.UpdateModule(); Module.Process(); frames.Clear();
            float nativePosition = scroll.content.anchoredPosition.y;
            // Unity permits the controller's LateUpdate before ScrollRect's.
            // Exercise that actual owner order, rather than manufacturing a
            // value-change callback before the HUD can overwrite the gesture.
            Invoke(fixture.Game.Loop, "LateUpdate");
            Invoke(scroll, "LateUpdate");
            Canvas.ForceUpdateCanvases(); fixture.Camera.Render(); Canvas.ForceUpdateCanvases();
            return nativePosition;
        }
        public float ScrollBeforeControllerLayout(Vector2 position, string gesture, float distanceToTarget)
        {
            if (gesture == "wheel")
            {
                frames.Position = position; frames.Scroll = new Vector2(0,-distanceToTarget/40f);
                return ProcessScrollBeforeControllerLayout();
            }
            bool touch = gesture == "touch-drag";
            frames.Position = position; frames.Touch = touch; frames.Down = true;
            frames.Phase = TouchPhase.Began; ProcessScrollBeforeControllerLayout();
            float moved = 0;
            foreach (float distance in new[] { 20f, 20f+distanceToTarget })
            {
                frames.Position = position+new Vector2(0,distance); frames.Touch = touch;
                frames.Phase = TouchPhase.Moved;
                moved = Math.Max(moved,ProcessScrollBeforeControllerLayout());
            }
            frames.Position = position+new Vector2(0,20f+distanceToTarget); frames.Touch = touch; frames.Up = true;
            frames.Phase = TouchPhase.Ended; ProcessScrollBeforeControllerLayout();
            return moved;
        }
        public void Drag(Vector2 position, bool touch)
        {
            frames.Position = position; frames.Touch = touch; frames.Down = true;
            frames.Phase = TouchPhase.Began; ProcessScroll();
            // The first moved frame crosses Unity's native drag threshold;
            // the second moves its actual ScrollRect from that drag anchor.
            foreach (float distance in new[] { 20f, 1000f })
            {
                frames.Position = position-new Vector2(0,distance); frames.Touch = touch;
                frames.Phase = TouchPhase.Moved; ProcessScroll();
            }
            frames.Position = position-new Vector2(0,1000); frames.Touch = touch; frames.Up = true;
            frames.Phase = TouchPhase.Ended; ProcessScroll();
        }
        public void Submit(Button button)
        {
            Events.SetSelectedGameObject(button.gameObject);
            frames.Submit = true; Process(); Process();
        }
        public void Pointer(Vector2 position, bool touch)
        {
            frames.Position = position; frames.Touch = touch; frames.Down = true;
            frames.Phase = TouchPhase.Began; Process();
            frames.Position = position; frames.Touch = touch; frames.Up = true;
            frames.Phase = TouchPhase.Ended; Process(); Process();
        }
        public void Activate(string id, string mode)
        {
            var button = fixture.Button(id);
            Require(button.IsActive() && button.IsInteractable(), "current native activation " + id);
            if (mode == "keyboard") Submit(button);
            else
            {
                var bounds = fixture.Bounds((RectTransform)button.transform);
                Pointer(new Vector2(bounds.center.x, fixture.Canvas.pixelRect.height - bounds.center.y), mode == "touch");
            }
        }
        public void Dispose()
        { Module.inputOverride = previous; UnityEngine.Object.DestroyImmediate(frames); }
    }
    static readonly Vector2Int[] InputProfiles = { new Vector2Int(1920,976), new Vector2Int(1366,664),
        new Vector2Int(720,516), new Vector2Int(390,688), new Vector2Int(844,266) };
    static void NativeFocusOrder(ShopUiFixture f)
    {
        var buttons = new List<Button>();
        foreach (var button in f.Root.GetComponentsInChildren<Button>(false))
            if (button.IsInteractable()) buttons.Add(button);
        // Compare actual screen bounds in one Canvas. Remove only the native
        // content's current scroll displacement: revealing a card must not
        // reorder the traversal halfway through a Tab sequence.
        Rect LayoutBounds(Button button)
        {
            var bounds = f.Bounds((RectTransform)button.transform);
            var scroll = button.GetComponentInParent<ScrollRect>();
            if (scroll && button.transform.IsChildOf(scroll.content))
                bounds.y -= f.Bounds(scroll.content).y - f.Bounds(scroll.viewport).y;
            return bounds;
        }
        buttons.Sort((a,b) => {
            var x = LayoutBounds(a); var y = LayoutBounds(b);
            return Math.Abs(x.y-y.y) > .01f ? x.y.CompareTo(y.y) : x.x.CompareTo(y.x);
        });
        for (int i = 0; i < buttons.Count; i++)
        {
            var nav = buttons[i].navigation;
            Require(nav.mode == Navigation.Mode.Explicit && nav.selectOnDown == buttons[Math.Min(buttons.Count-1,i+1)] &&
                nav.selectOnUp == buttons[Math.Max(0,i-1)], "nested controls ordered in common Canvas coordinates: " + buttons[i].name);
        }
        var keyboard = f.Root.GetComponent<LastStandHudKeyboard>();
        keyboard.NavigateKeyboard("enter-first");
        for (int i = 0; i < buttons.Count; i++)
        {
            Require(EventSystem.current.currentSelectedGameObject == buttons[i].gameObject,
                "native Tab owner traverses every current control once " + buttons[i].name);
            keyboard.NavigateKeyboard("next");
        }
        Require(!EventSystem.current.currentSelectedGameObject, "native Tab owner leaves current control range");
        keyboard.NavigateKeyboard("enter-last");
        for (int i = buttons.Count-1; i >= 0; i--) keyboard.NavigateKeyboard("previous");
        Require(!EventSystem.current.currentSelectedGameObject, "reverse native Tab owner leaves without trap");
    }
    static void SelectedCardVisible(ShopUiFixture f, Button button)
    {
        var viewport = (RectTransform)f.Root.Find("ShopPanel/ShopViewport");
        var clip = f.Bounds(viewport); var bounds = f.Bounds((RectTransform)button.transform);
        Require(bounds.width >= 43.99f && bounds.height >= 43.99f &&
            bounds.xMin >= clip.xMin-.1f && bounds.xMax <= clip.xMax+.1f &&
            bounds.yMin >= clip.yMin-.1f && bounds.yMax <= clip.yMax+.1f,
            "selected card revealed fully inside real masked ScrollRect " + button.name + " " + bounds + " clip=" + clip);
        Require(ShopRaycast(f, new Vector2(bounds.center.x, f.Canvas.pixelRect.height-bounds.center.y)) == button,
            "revealed selected card receives actual raycast " + button.name);
        var style = button.GetComponentInChildren<Text>().fontStyle;
        Require(button.GetComponent<Outline>().enabled && (style == FontStyle.Bold || style == FontStyle.BoldAndItalic),
            "current native selection has visible stroke and type " + button.name);
    }
    static void KeyboardPointerIntents()
    {
        foreach (var profile in InputProfiles) foreach (bool launcher in new[] { false, true })
        foreach (string mode in new[] { "keyboard", "pointer", "touch" })
        using (var f = new ShopUiFixture(launcher, profile)) using (var input = new NativeShopInput(f))
        {
            ShopInventory(f);
            int entryCalls = 0, closeCalls = 0, buys = 0;
            f.Button("ShopEntry").onClick.AddListener(() => entryCalls++);
            f.Button("ShopClose").onClick.AddListener(() => closeCalls++);
            var buy = f.Button("ShopCard_cannonAttackBuy"); buy.onClick.AddListener(() => buys++);
            int writes = f.Game.Storage.Writes; string bytes = f.Game.Storage.Value;
            input.Activate("ShopEntry", mode);
            Require(entryCalls == 1 && f.Game.Storage.Writes == writes && f.Game.Storage.Value == bytes &&
                f.Game.Session.Model == null, "entry inspection has one callback and no model/write");
            input.Activate("ShopClose", mode);
            Require(closeCalls == 1 && input.Events.currentSelectedGameObject == f.Button("ShopEntry").gameObject,
                "native close restores actual shop entry focus");
            input.Activate("ShopEntry", mode);
            foreach (string tab in new[] { "ShopTabDefense", "ShopTabUtility", "ShopTabAttack" })
            {
                int calls = 0; f.Button(tab).onClick.AddListener(() => calls++);
                input.Activate(tab, mode); Require(calls == 1, "tab same intent once " + tab);
            }
            NativeFocusOrder(f);
            input.Events.SetSelectedGameObject(buy.gameObject); input.Render(); SelectedCardVisible(f,buy);
            input.Activate(buy.name, mode);
            Require(buys == 1 && f.Game.Loop.Progression.Wallet == 19 &&
                f.Game.Loop.Progression.CannonAttackLevel == 1 && f.Game.Storage.Writes == writes+1,
                "keyboard pointer touch equivalent permanent intent charges verified owner once");
            Require(input.Events.currentSelectedGameObject == buy.gameObject,
                "eligible selected permanent card survives purchase refresh");
            input.Render(); SelectedCardVisible(f,buy);
            input.Activate("ShopClose", mode);
            // Fund through the existing actual combat fixture, then use the
            // same native input path with the run's immutable presentation.
            var shop = Funded(f.Game); var model = f.Game.Session.Model; f.Reanchor(); input.Render();
            input.Activate("ShopEntry", mode); input.Activate("ShopTabAttack", mode);
            input.Events.SetSelectedGameObject(buy.gameObject); input.Render(); SelectedCardVisible(f,buy);
            int tick = model.Tick, version = shop.Version; writes = f.Game.Storage.Writes;
            input.Activate(buy.name, mode);
            Require(buys == 2 && shop.Scrap == 1 && shop.SpentScrap == 5 && shop.Version == version+1 &&
                shop.GetTrack(LastStandUpgradeTrackId.CannonAttack).RunPurchases == 1 &&
                model.CurrentCannonDamage == 40 && f.Game.Storage.Writes == writes && !f.Game.Session.Paused,
                "native run input chooses one atomic current intent without save or implicit pause");
            int spent = shop.SpentScrap; input.Submit(buy);
            Require(buys == 2 && shop.SpentScrap == spent, "disabled native Submit cannot repeat debit or callback");
            f.Game.AdvanceTicks(1); input.Render();
            Require(model.Tick > tick && f.Game.Session.Model == model && !f.Game.Session.Paused,
                "open shop permits sole existing clock advancement");
            input.Activate("ShopClose", mode);
            Require(input.Events.currentSelectedGameObject == f.Button("ShopEntry").gameObject,
                "run close restores current entry");
            buy.onClick.Invoke();
            Require(shop.SpentScrap == spent && f.Game.Storage.Writes == writes,
                "delayed closed-card callback cannot mutate owner");
            Debug.Log("ST_LS_SHOP_INPUT_INTENTS " + profile + " fitting=" + launcher + " mode=" + mode);
        }
    }
    static void ValidCurrentFocus(ShopUiFixture f)
    {
        var selected = EventSystem.current.currentSelectedGameObject;
        var button = selected ? selected.GetComponent<Button>() : null;
        Require(button && button.IsActive() && button.IsInteractable() && button.transform.IsChildOf(f.Root),
            "terminal transition selects valid current owned control");
    }
    static void RetainedSelectionScroll(ShopUiFixture f, NativeShopInput input, Button lower)
    {
        var scroll = f.Root.Find("ShopPanel").GetComponent<ScrollRect>();
        if (scroll.content.rect.height <= scroll.viewport.rect.height+.1f) return;
        var keyboard = f.Root.GetComponent<LastStandHudKeyboard>();
        var shop = Shop(f.Game.Session); var model = f.Game.Session.Model;
        int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet, buys = 0;
        string raw = f.Game.Storage.Value;
        bool fitting = f.Game.Art.showingLauncher, battlefield = f.Game.Art.battlefield;
        lower.onClick.AddListener(() => buys++);
        foreach (string gesture in new[] { "wheel", "mouse-drag", "touch-drag" })
        {
            // Re-enter the selected lower card through the existing keyboard
            // owner. OnSelect is the explicit reveal event for each gesture.
            keyboard.NavigateKeyboard("previous"); keyboard.NavigateKeyboard("next");
            input.Render(); SelectedCardVisible(f,lower);
            var bounds = f.Bounds((RectTransform)lower.transform);
            Vector2 point = new Vector2(bounds.center.x,f.Canvas.pixelRect.height-bounds.center.y);
            float revealed = scroll.content.anchoredPosition.y;
            if (gesture == "wheel") input.Wheel(point); else input.Drag(point,gesture == "touch-drag");
            float reading = scroll.content.anchoredPosition.y;
            Require(input.Events.currentSelectedGameObject == lower.gameObject && lower.IsInteractable() &&
                Math.Abs(reading-revealed) > 1f, "actual native " + gesture + " moves ScrollRect with eligible Buy still selected");
            float stored = (float)typeof(LastStandLoopHud).GetField("shopScrollOffset",Private).GetValue(f.Hud);
            float units = (float)typeof(LastStandLoopHud).GetField("shopUnitsY",Private).GetValue(f.Hud);
            Require(Math.Abs(stored*units-reading) < .1f,
                "native ScrollRect lifecycle delivers " + gesture + " offset to existing HUD owner before combat refresh");
            Debug.Log("ST_LS_SHOP_SCROLL_BEFORE_REFRESH gesture=" + gesture + " content=" + reading + " owner=" + stored*units);
            var hidden = f.Bounds((RectTransform)lower.transform); var clip = f.Bounds(scroll.viewport);
            Require(!clip.Contains(hidden.center) &&
                ShopRaycast(f,new Vector2(hidden.center.x,f.Canvas.pixelRect.height-hidden.center.y)) != lower,
                "retained off-viewport selection is clipped by real mask after " + gesture);
            int tick = model.Tick; f.Game.AdvanceTicks(1); input.Render();
            Require(model.Tick > tick && input.Events.currentSelectedGameObject == lower.gameObject &&
                Math.Abs(scroll.content.anchoredPosition.y-reading) < .1f,
                "native " + gesture + " reading offset survives admitted combat refresh with eligible Buy selected; before=" +
                reading + " after=" + scroll.content.anchoredPosition.y);
            Require(buys == 0 && shop.SpentScrap == 0 && f.Game.Storage.Writes == writes && f.Game.Storage.Value == raw &&
                f.Game.Loop.Progression.Wallet == wallet && !f.Game.Session.Paused &&
                f.Game.Art.showingLauncher == fitting && f.Game.Art.battlefield == battlefield,
                "native scroll/drag and passive refresh cause no Buy, write, pause or world callback");
            keyboard.NavigateKeyboard("previous"); keyboard.NavigateKeyboard("next"); input.Render();
            Require(input.Events.currentSelectedGameObject == lower.gameObject,
                "explicit subsequent keyboard navigation returns to current lower Buy");
            SelectedCardVisible(f,lower);
            Debug.Log("ST_LS_SHOP_INPUT_RETAINED_SCROLL " + f.Canvas.pixelRect.size + " fitting=" + fitting + " gesture=" + gesture);
        }
    }
    static void TerminalResizeNoLeak()
    {
        foreach (var profile in InputProfiles) foreach (bool launcher in new[] { false, true })
        using (var f = new ShopUiFixture(launcher, profile)) using (var input = new NativeShopInput(f))
        {
            var shop = Funded(f.Game); var model = f.Game.Session.Model; f.Reanchor(); input.Render();
            input.Activate("ShopEntry", "keyboard");
            input.Activate(launcher ? "ShopTabAttack" : "ShopTabUtility", "touch");
            var lower = f.Button(launcher ? "ShopCard_launcherAttackBuy" : "ShopCard_fieldRepairBuy");
            input.Events.SetSelectedGameObject(lower.gameObject); input.Render(); SelectedCardVisible(f,lower);
            RetainedSelectionScroll(f,input,lower);
            int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet;
            string raw = f.Game.Storage.Value; bool fitting = f.Game.Art.showingLauncher, battlefield = f.Game.Art.battlefield;
            var scroll = f.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            scroll.verticalNormalizedPosition = 1; scroll.onValueChanged.Invoke(new Vector2(0,1));
            // Layout alone preserves a user's scroll gesture; deselect before
            // checking the real clipped target, then native selection reveals it.
            input.Events.SetSelectedGameObject(null); f.Hud.Layout(); f.Camera.Render(); Canvas.ForceUpdateCanvases();
            var hidden = f.Bounds((RectTransform)lower.transform);
            var panel = (RectTransform)f.Root.Find("ShopPanel"); var viewport = (RectTransform)panel.Find("ShopViewport");
            if (!f.Bounds(viewport).Contains(hidden.center))
                Require(ShopRaycast(f,new Vector2(hidden.center.x,f.Canvas.pixelRect.height-hidden.center.y)) != lower,
                    "real mask rejects clipped card before keyboard reveal");
            var viewportBounds = f.Bounds(viewport);
            Vector2 point = viewportBounds.min + new Vector2(4,4); point.y = f.Canvas.pixelRect.height-point.y;
            var hits = new List<RaycastResult>(); input.Events.RaycastAll(new PointerEventData(input.Events) { position=point },hits);
            Require(hits.Count > 0 && hits[0].gameObject.transform.IsChildOf(panel),
                "actual top raycast stays on opaque shop above world");
            input.Pointer(point,false); input.Pointer(point,true);
            Require(shop.SpentScrap == 0 && f.Game.Storage.Writes == writes && f.Game.Storage.Value == raw &&
                f.Game.Art.showingLauncher == fitting && f.Game.Art.battlefield == battlefield &&
                f.Game.Loop.Progression.Wallet == wallet && !f.Game.Session.Paused,
                "blank mouse/touch panel input leaks no world/global/economy callback");
            input.Events.SetSelectedGameObject(lower.gameObject); input.Render(); SelectedCardVisible(f,lower);
            foreach (var resized in InputProfiles)
            {
                f.Resize(resized);
                input.Render(); SelectedCardVisible(f,lower);
                Require(input.Events.currentSelectedGameObject == lower.gameObject && f.Game.Session.Model == model &&
                    f.Game.Storage.Writes == writes && !f.Game.Session.Paused, "resize retains current selected track and sole model");
                NativeFocusOrder(f); input.Events.SetSelectedGameObject(lower.gameObject); input.Render();
            }
            int spent = shop.SpentScrap;
            typeof(EncounterModel).GetProperty("Hull").SetValue(model,1);
            SetField(model.Foes[0], "NextAttack", model.Tick+1); f.Game.AdvanceTicks(1); Invoke(f.Game.Loop,"Update"); input.Render();
            Require(f.Game.Loop.Phase == "settling" && f.Game.Loop.Progression.PendingDefeat != null,
                "actual defeat invalidates open run panel before terminal interval");
            ValidCurrentFocus(f); lower.onClick.Invoke(); input.Submit(lower);
            Require(shop.SpentScrap == spent && f.Game.Loop.Progression.Wallet == wallet,
                "terminal stale card and native Submit cannot debit or auto-Claim");
            f.Game.AdvanceTicks(10); Invoke(f.Game.Loop,"Update"); input.Render(); ValidCurrentFocus(f);
            Require(f.Game.Loop.Phase == "result" && f.Game.Loop.Progression.PendingDefeat != null &&
                f.Game.Loop.Progression.Wallet == wallet, "current result focus keeps manual Claim authority");
            input.Activate("Claim","keyboard"); ValidCurrentFocus(f);
            Require(f.Game.Loop.Phase == "workshop" && f.Game.Loop.Progression.Wallet == wallet+1,
                "one explicit native Claim reaches current workshop");
            Debug.Log("ST_LS_SHOP_INPUT_TERMINAL " + profile + " fitting=" + launcher);
        }
    }
    public static void RunInput()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_input_keyboard_pointer_same_intents_and_focus", KeyboardPointerIntents, ref failed);
                NamedIncome("test_input_terminal_resize_and_no_world_leak", TerminalResizeNoLeak, ref failed);
            }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground=background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static void CompactRealScroll()
    {
        foreach (bool launcher in new[] { true, false })
        foreach (string phase in new[] { "garage", "running", "paused" })
        foreach (string gesture in new[] { "wheel", "mouse-drag", "touch-drag" })
        // This short-landscape production profile retains genuine two-card
        // overflow after the 720px layout gains enough reading space. Keep
        // every native lifecycle, clipping and side-effect assertion intact.
        using (var f = new ShopUiFixture(launcher,new Vector2Int(844,266),
            new MemoryStorage { Value = Save(new int[6],wallet: 0) }))
        using (var input = new NativeShopInput(f))
        {
            if (phase != "garage")
            {
                f.Game.Loop.Deploy(); f.Reanchor(); input.Render();
                if (phase == "paused") input.Activate("SpeedRate","pointer");
            }
            input.Activate("ShopEntry","pointer");
            input.Activate(launcher ? "ShopTabAttack" : "ShopTabUtility","pointer");
            var scroll = f.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            var lower = f.Button(launcher ? "ShopCard_launcherAttackBuy" : "ShopCard_fieldRepairBuy");
            var viewport = f.Bounds(scroll.viewport); var clipped = f.Bounds((RectTransform)lower.transform);
            Require(scroll.content.rect.height > scroll.viewport.rect.height &&
                clipped.yMax > viewport.yMax+1 && scroll.content.anchoredPosition.y < .1f,
                "compact actual zero-funds card starts clipped before native gesture");
            int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet, buys = 0;
            string raw = f.Game.Storage.Value; bool paused = f.Game.Session.Paused;
            var model = f.Game.Session.Model; var shop = f.Game.Loop.Shop;
            bool fitting = f.Game.Art.showingLauncher, battlefield = f.Game.Art.battlefield;
            lower.onClick.AddListener(() => buys++);
            var point = new Vector2(viewport.center.x,f.Canvas.pixelRect.height-viewport.center.y);
            // Aim the native gesture at the clipped target. Scrolling to the
            // absolute content bottom also reveals card padding; in a 49px
            // viewport that can pass a 44px target rather than reveal it fully.
            float nativePosition = input.ScrollBeforeControllerLayout(point,gesture,clipped.yMax-viewport.yMax+1);
            float retained = scroll.content.anchoredPosition.y;
            Debug.Log("ST_LS_SHOP_COMPACT_SCROLL phase=" + phase + " fitting=" + launcher + " gesture=" + gesture +
                " native=" + nativePosition + " retained=" + retained);
            Require(nativePosition > 1,"actual native " + gesture + " moves the compact ScrollRect before layout");
            Require(Math.Abs(nativePosition-retained) < .1f,
                "actual controller LateUpdate retains compact " + gesture + " before ScrollRect notification; native=" +
                nativePosition + " retained=" + retained);
            input.Render();
            var reached = f.Bounds((RectTransform)lower.transform); viewport = f.Bounds(scroll.viewport);
            Debug.Log("ST_LS_SHOP_COMPACT_REACHED target=" + reached + " viewport=" + viewport +
                " content=" + scroll.content.anchoredPosition.y + " owner=" +
                typeof(LastStandLoopHud).GetField("shopScrollOffset",Private).GetValue(f.Hud));
            Require(reached.yMin >= viewport.yMin-.1f && reached.yMax <= viewport.yMax+.1f &&
                reached.width >= 43.99f && reached.height >= 43.99f,
                "native compact scroll exposes the complete lower purchase target");
            var refusal = f.Bounds(f.Text(launcher ? "ShopCard_launcherAttackRefusal" : "ShopCard_fieldRepairRefusal").rectTransform);
            Require(refusal.yMin >= viewport.yMin-.1f && refusal.yMax <= viewport.yMax+.1f,
                "native compact scroll exposes the complete lower refusal");
            Require(buys == 0 && f.Game.Storage.Writes == writes && f.Game.Storage.Value == raw &&
                f.Game.Loop.Progression.Wallet == wallet && f.Game.Session.Paused == paused &&
                f.Game.Session.Model == model && (shop == null || shop.SpentScrap == 0) &&
                f.Game.Art.showingLauncher == fitting && f.Game.Art.battlefield == battlefield,
                "compact wheel and drags do not buy, save, pause, replace model or reach the world");
            input.Activate(launcher ? "ShopTabDefense" : "ShopTabAttack","pointer");
            Require(Math.Abs(scroll.content.anchoredPosition.y) < .1f,"explicit category still resets reading position");
            input.Activate("ShopClose","pointer"); input.Activate("ShopEntry","pointer");
            Require(Math.Abs(scroll.content.anchoredPosition.y) < .1f,"explicit close and reopen still reset reading position");
        }
    }
    public static void RunCompactScroll()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_input_compact_real_scroll_reaches_clipped_cards",CompactRealScroll,ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground=background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    static Rect CompleteUpgradeBounds(ShopUiFixture f, string id)
    {
        var bounds = f.Bounds(f.Text(id + "Title").rectTransform);
        foreach (string suffix in new[] { "Levels", "NextEffect", "CurrentEffect", "Refusal", "BuyText" })
        {
            var text = f.Text(id + suffix);
            if (!text.gameObject.activeInHierarchy) continue;
            var field = f.Bounds(text.rectTransform);
            bounds = Rect.MinMaxRect(Math.Min(bounds.xMin,field.xMin),Math.Min(bounds.yMin,field.yMin),
                Math.Max(bounds.xMax,field.xMax),Math.Max(bounds.yMax,field.yMax));
        }
        var buy = f.Bounds((RectTransform)f.Button(id + "Buy").transform);
        return Rect.MinMaxRect(Math.Min(bounds.xMin,buy.xMin),Math.Min(bounds.yMin,buy.yMin),
            Math.Max(bounds.xMax,buy.xMax),Math.Max(bounds.yMax,buy.yMax));
    }
    static void CompactShopReading()
    {
        // The page wrapper is already excluded: these are actual available
        // Canvas sizes, including the reported 720x640 / 720x516 failure.
        var profiles = new[] { new Vector2Int(720,516),new Vector2Int(390,688),new Vector2Int(844,266),
            new Vector2Int(1366,664),new Vector2Int(1920,976) };
        foreach (var profile in profiles) foreach (bool launcher in new[] { true,false })
        foreach (string phase in new[] { "running","paused","garage","workshop" })
        using (var f = new ShopUiFixture(launcher,profile,
            new MemoryStorage { Value = Save(new int[6],wallet: phase == "workshop" ? 1 : 0) }))
        using (var input = new NativeShopInput(f))
        {
            bool run = phase == "running" || phase == "paused";
            if (run)
            {
                f.Game.Loop.Deploy(); f.Reanchor(); input.Render();
                if (phase == "paused") input.Activate("SpeedRate","pointer");
            }
            int writes = f.Game.Storage.Writes, wallet = f.Game.Loop.Progression.Wallet;
            string saved = f.Game.Storage.Value; var model = f.Game.Session.Model;
            bool paused = f.Game.Session.Paused, fitting = f.Game.Art.showingLauncher;
            input.Activate("ShopEntry","pointer");
            var scroll = f.Root.Find("ShopPanel").GetComponent<ScrollRect>();
            foreach (var category in new[] { LastStandUpgradeCategory.Attack,LastStandUpgradeCategory.Defense,LastStandUpgradeCategory.Utility })
            {
                input.Activate("ShopTab" + category,"pointer"); input.Render();
                foreach (var definition in LastStandUpgradeCatalog.Tracks)
                {
                    if (definition.Category != category || !definition.IsEligible(launcher ? LastStandFitting.Launcher : LastStandFitting.Repair)) continue;
                    string id = "ShopCard_" + definition.Key;
                    var complete = CompleteUpgradeBounds(f,id); var viewport = f.Bounds(scroll.viewport);
                    Require(complete.height <= viewport.height+.1f,
                        "complete upgrade title, levels, effect, refusal and Buy must fit together: " + profile + " " + phase +
                        " " + definition.Key + " information=" + complete.height + " viewport=" + viewport.height);
                    var point = new Vector2(viewport.center.x,f.Canvas.pixelRect.height-viewport.center.y);
                    input.ScrollBeforeControllerLayout(point,"wheel",complete.yMin-viewport.yMin);
                    input.Render(); complete = CompleteUpgradeBounds(f,id); viewport = f.Bounds(scroll.viewport);
                    Require(complete.xMin >= viewport.xMin-.1f && complete.xMax <= viewport.xMax+.1f &&
                        complete.yMin >= viewport.yMin-.1f && complete.yMax <= viewport.yMax+.1f,
                        "native scroll reveals complete upgrade information and action together: " + id + " " + complete + " " + viewport);
                    Debug.Log("ST_LS_SHOP_READING " + profile + " phase=" + phase + " fitting=" + launcher +
                        " card=" + definition.Key + " information=" + complete.height + " viewport=" + viewport.height);
                }
                foreach (var text in f.Root.GetComponentsInChildren<Text>(false))
                {
                    float units = f.Root.rect.height / f.Canvas.pixelRect.height;
                    Require(text.fontSize / units >= 13.99f && text.preferredHeight <= text.rectTransform.rect.height+1f,
                        "real wrapped text stays readable including compact Sound and refusal: " + text.name + " " + profile);
                }
                var screen = CanvasBounds(f);
                foreach (var button in f.Root.GetComponentsInChildren<Button>(false))
                {
                    var bounds = f.Bounds((RectTransform)button.transform);
                    Require(bounds.width >= 43.99f && bounds.height >= 43.99f,"complete reading retains 44px target " + button.name);
                    if (button.transform.IsChildOf(scroll.content)) continue;
                    Require(bounds.xMin >= -.1f && bounds.yMin >= -.1f && bounds.xMax <= screen.xMax+.1f && bounds.yMax <= screen.yMax+.1f,
                        "essential fixed control remains on Canvas " + button.name);
                    Require(!bounds.Overlaps(f.Bounds(scroll.viewport)),"reading region cannot obscure fixed control " + button.name);
                }
            }
            Require(f.Game.Storage.Writes == writes && f.Game.Storage.Value == saved && f.Game.Loop.Progression.Wallet == wallet &&
                f.Game.Session.Model == model && f.Game.Session.Paused == paused && f.Game.Art.showingLauncher == fitting &&
                (f.Game.Loop.Shop == null || f.Game.Loop.Shop.SpentScrap == 0),
                "reading, native scrolling and category changes do not buy, save, pause or replace the model");
            input.Activate("ShopClose","pointer");
            Require(input.Events.currentSelectedGameObject == f.Button("ShopEntry").gameObject,"reading close restores current entry focus");
        }
    }
    public static void RunCompactReading()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try { NamedIncome("test_input_compact_shop_keeps_upgrade_readable",CompactShopReading,ref failed); }
            finally { LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground=background; }
        }
        if (failed) EditorApplication.Exit(1);
    }
    // T19 imported integration qualification: existing production owners only.
    static void IntegrationClick(ShopUiFixture f, string id)
    { f.Button(id).Select(); f.Refresh(); if (f.Game.Session.Model != null) f.Reanchor(); f.Click(id); }

    static void IntegrationCombatFunds(ShopUiFixture f)
    {
        var shop = Funded(f.Game); var model = f.Game.Session.Model;
        var durable = model.Foes[0];
        typeof(EncounterFoe).GetProperty("Distance").SetValue(durable, 1000000);
        for (int kill = 3; kill <= 9; kill++)
        {
            SetField(model, "nextSpawn", model.Tick + 1); SetField(model, "nextCannon", int.MaxValue);
            f.Game.AdvanceTicks(1);
            EncounterFoe target = null;
            foreach (var foe in model.Foes) if (foe.Alive && foe != durable) { target = foe; break; }
            Require(target != null, "integration funds use an actual newly spawned foe");
            typeof(EncounterFoe).GetProperty("Hull").SetValue(target, 1);
            typeof(EncounterFoe).GetProperty("Distance").SetValue(target, 0);
            SetField(target, "NextAttack", int.MaxValue); SetField(model, "nextCannon", model.Tick + 1);
            SetField(model, "nextSpawn", int.MaxValue); f.Game.AdvanceTicks(1);
            Require(model.Kills == kill && shop.UniqueKills == kill && shop.EarnedScrap == kill * 3 && shop.Scrap == kill * 3,
                "integration each real shot kill credits three Scrap once");
        }
        Require(model.Tick == 19 && shop.Scrap == 27 && shop.SpentScrap == 0,
            "nine actual kills fund five independent first purchases");
    }

    static void IntegrationEffectsJourney(bool launcher, Vector2Int profile)
    {
        using (var f = new ShopUiFixture(launcher, profile, new MemoryStorage { Value = Save(new[] {1,1,1,1,1,1}) }))
        {
            IntegrationCombatFunds(f); var model = f.Game.Session.Model; var shop = Shop(f.Game.Session);
            int writes = f.Game.Storage.Writes, shots = model.CannonShots;
            typeof(EncounterModel).GetProperty("Hull").SetValue(model, 100);
            f.Game.Session.TogglePauseAt(f.Game.Timestamp); f.Refresh(); IntegrationClick(f, "ShopEntry");
            foreach (var track in LastStandUpgradeCatalog.Tracks)
            {
                if (track.Id == LastStandUpgradeTrackId.LauncherAttack && !launcher || track.Id == LastStandUpgradeTrackId.FieldRepair && launcher) continue;
                IntegrationClick(f, "ShopTab" + track.Category); int version = shop.Version;
                IntegrationClick(f, "ShopCard_" + track.Key + "Buy");
                Require(shop.GetTrack(track.Id).PermanentLevel == 1 && shop.GetTrack(track.Id).RunPurchases == 1 &&
                    shop.GetTrack(track.Id).CurrentLevel == 2 && shop.GetTrack(track.Id).NextPrice == 10 && shop.Version == version + 1,
                    "integration live card purchase changes only its independent temporary level and price");
                ShopCards(f, track.Category);
            }
            Require(shop.Scrap == 2 && shop.EarnedScrap == 27 && shop.SpentScrap == 25 && model.Tick == 19 &&
                model.Hull == 115 && model.CurrentMaximumHull == 150 && model.CurrentCannonDamage == 40 && model.CommittedCannonDamage == 30 &&
                model.CurrentCannonPeriod == 18 && model.CurrentLauncherDamage == (launcher ? 20 : 12) &&
                model.CurrentRepairAmount == (launcher ? 3 : 5) && f.Game.Storage.Writes == writes && f.Game.Loop.Progression.Wallet == 20,
                "integration combined effects debit only Scrap and retain settled paused clock/save ownership");
            IntegrationClick(f, "ShopClose"); SetField(f.Game.Session, "focused", false);
            f.Game.Session.AdvanceAt(f.Game.Timestamp + 2); Invoke(f.Game.Loop, "OnSessionChanged");
            Require(f.Game.Session.Paused && model.Tick == 19 && Shop(f.Game.Session) == shop && shop.Scrap == 2 &&
                f.Game.Loop.Audio.Suspended && f.Game.Loop.Progression.PendingDefeat == null,
                "integration close and hidden paused time retain the same upgraded ledger without ticks or Claim");
            SetField(f.Game.Session, "focused", true); Invoke(f.Game.Loop, "OnSessionChanged"); f.Refresh();
            IntegrationClick(f, "ShopEntry"); Require(shop.Scrap == 2 && model.CurrentCannonDamage == 40,
                "integration reopen observes retained upgraded state");
            IntegrationClick(f, "ShopClose"); f.Game.Session.TogglePauseAt(f.Game.Timestamp);
            var foe = model.Foes[0]; typeof(EncounterFoe).GetProperty("Distance").SetValue(foe, model.Profile.Stop(foe.Kind));
            typeof(EncounterFoe).GetProperty("Damage").SetValue(foe, 7); SetField(foe, "NextAttack", 20);
            if (launcher) SetField(model, "nextLauncher", 20);
            bool cannon = false, auxiliary = false, armor = false;
            Action<EncounterModel> observeEffects = current =>
            {
                foreach (var evt in current.Events)
                {
                    if (evt.Kind == EncounterEventKind.Cannon) { cannon = true; Require(current.Tick == 37 && evt.Amount == 40, "integration actual combined Cannon/Cycle shot uses forty at last-shot19 plus period18"); }
                    if (evt.Kind == EncounterEventKind.Launcher || evt.Kind == EncounterEventKind.Repair)
                    { auxiliary = true; Require(current.Tick == 20 && evt.Amount == (launcher ? 20 : 5), "integration actual compatible auxiliary effect follows combined upgrades"); }
                    if (evt.Kind == EncounterEventKind.CloseHit || evt.Kind == EncounterEventKind.RangedHit)
                    { armor = true; Require(current.Tick == 20 && evt.Amount == 5, "integration real incoming raw-seven hit uses combined Armor level-two"); }
                }
            };
            f.Game.Session.Stepped += observeEffects;
            SetField(f.Game.Session, "focused", false); f.Game.AdvanceTicks(20);
            Require(model.Tick == 39 && cannon && auxiliary && armor && model.CannonShots == shots + 1 && shop.Scrap == 2 &&
                f.Game.Loop.Audio.Suspended && f.Game.Storage.Writes == writes,
                "integration hidden actual clock advances future combined effects once without save or cue replay");
            f.Game.Session.Stepped -= observeEffects;
            SetField(model, "nextRepair", int.MaxValue); typeof(EncounterModel).GetProperty("Hull").SetValue(model, 1);
            SetField(foe, "NextAttack", 40); f.Game.AdvanceTicks(1);
            var final = Accounting(f.Game.Loop);
            Require(model.Status == EncounterStatus.Defeated && model.Tick == 40 && Amount(final,"UniqueKills") == 9 &&
                Amount(final,"EarnedScrap") == 27 && Amount(final,"SpentScrap") == 25 && Amount(final,"FinalScrap") == 2 &&
                shop.Scrap == 0 && f.Game.Loop.Progression.Wallet == 20 && f.Game.Loop.Progression.PendingDefeat?.Reward == 1,
                "integration terminal final accounting conserves twenty-seven/twenty-five/two without automatic Salvage");
            foreach (var track in LastStandUpgradeCatalog.Tracks) Require(shop.GetTrack(track.Id).RunPurchases == 0, "integration terminal clears every temporary track");
            f.Game.AdvanceTicks(10); Invoke(f.Game.Loop,"Update"); SetField(f.Game.Session,"focused",true); f.Refresh();
            IntegrationClick(f,"Claim"); f.Game.Loop.Claim(); f.Refresh();
            Require(f.Game.Loop.Progression.Wallet == 21 && f.Game.Loop.Progression.PendingDefeat == null && f.Game.Loop.FinalAccounting == null,
                "integration manual Claim grants one Salvage once and releases result accounting");
            IntegrationClick(f,"ShopEntry"); IntegrationClick(f,"ShopTabDefense"); IntegrationClick(f,"ShopCard_hullCapacityBuy");
            Require(f.Game.Loop.Progression.Wallet == 19 && f.Game.Loop.Progression.GetPermanentLevel(LastStandUpgradeTrackId.HullCapacity) == 2 &&
                shop.GetTrack(LastStandUpgradeTrackId.HullCapacity).PermanentLevel == 1 && model.CurrentMaximumHull == 150,
                "integration confirmed two-Salvage investment changes future permanent baseline only");
            IntegrationClick(f,"ShopClose"); IntegrationClick(f,"Redeploy");
            Fresh(Shop(f.Game.Session), 8, launcher, new[] {1,1,2,1,1,1});
            Require(f.Game.Session.Model != model && f.Game.Session.Model.CurrentCannonDamage == 30 && f.Game.Session.Model.CurrentCannonPeriod == 19 &&
                f.Game.Session.Model.Hull == 150 && f.Game.Storage.SuccessfulWrites == 5,
                "integration redeployment owns a fresh zero-Scrap/n ledger with only committed effects");
            Debug.Log("ST_LS_SHOP_INTEGRATION_JOURNEY fitting=" + launcher + " canvas=" + profile + " final=27/25/2 nextRun=8");
        }
    }

    static void IntegrationOldSaveConflict(bool launcher)
    {
        var storage = new MemoryStorage { Value = "{\"version\":1,\"credits\":8,\"permanentLevel\":2,\"nextRunId\":7,\"lastFinalizedRunId\":5,\"pendingDefeat\":{\"runId\":6,\"elapsedTicks\":33,\"kills\":4,\"reward\":1}}" };
        using (var f = new ShopUiFixture(launcher, new Vector2Int(1366,664), storage))
        {
            var p = f.Game.Loop.Progression;
            Require(storage.SuccessfulWrites == 1 && storage.Value.Contains("\"version\":3") && p.Wallet == 8 && p.NextRunId == 7 &&
                p.FinalizedRunId == 5 && p.PendingDefeat.RunId == 6 && p.PendingDefeat.ElapsedTicks == 33 && p.PendingDefeat.Kills == 4 &&
                p.CannonAttackLevel == 2 && f.Game.Session.Model == null && !f.Button("ShopEntry").IsActive(),
                "integration imported old-save migration preserves exact pending entitlements without auto-Claim or deploy");
            foreach (var track in LastStandUpgradeCatalog.Tracks) Require(p.GetPermanentLevel(track.Id) == (track.Id == LastStandUpgradeTrackId.CannonAttack ? 2 : 0), "integration v1 migration maps only Cannon P");
            IntegrationClick(f,"Claim"); f.Game.Loop.Claim(); f.Refresh();
            Require(p.Wallet == 9 && p.FinalizedRunId == 6 && p.PendingDefeat == null && storage.SuccessfulWrites == 2,
                "integration migrated pending Claim is verified exactly once");
            IntegrationClick(f,"ShopEntry"); IntegrationClick(f,"ShopTabDefense"); storage.FailReadBack = true;
            IntegrationClick(f,"ShopCard_armorBuy"); string desired = storage.Value;
            Require(p.SaveState == "retry" && p.Wallet == 9 && p.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 0 &&
                desired.Contains("\"armor\":1") && desired.Contains("\"credits\":8") && !f.Button("Deploy").IsInteractable() &&
                !f.Button("ShopCard_armorBuy").IsInteractable() && f.Button("RetrySave").IsInteractable(),
                "integration uncertain Armor write retains committed card/wallet and blocks destructive input");
            storage.FailReadBack = false; string foreign = desired.Replace("\"credits\":8", "\"credits\":7"); storage.Value = foreign;
            int writes = storage.Writes; IntegrationClick(f,"RetrySave"); f.Game.Loop.RetrySave(); f.Refresh();
            Require(p.SaveState == "blocked" && p.Wallet == 9 && p.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 0 &&
                storage.Value == foreign && storage.Writes == writes && p.SaveError.Contains("changed unexpectedly"),
                "integration repeated retry preserves exact foreign bytes and unpublished candidate entitlements");
            storage.Value = desired; f.Game.Loop.RetrySave(); f.Game.Loop.RetrySave(); f.Refresh();
            Require(p.SaveState == "ready" && p.Wallet == 8 && p.GetPermanentLevel(LastStandUpgradeTrackId.Armor) == 1 &&
                p.FinalizedRunId == 6 && p.NextRunId == 7 && storage.Writes == writes && storage.SuccessfulWrites == 3,
                "integration confirming exact already-written candidate publishes one debit without another write or Claim");
            PermanentCards(f,LastStandUpgradeCategory.Defense);
        }
        using (var reload = new ShopUiFixture(launcher, new Vector2Int(1366,664), storage))
        {
            Require(reload.Game.Loop.Progression.Wallet == 8 && reload.Game.Loop.Progression.PendingDefeat == null &&
                reload.Game.Loop.Progression.FinalizedRunId == 6 && storage.SuccessfulWrites == 3,
                "integration fresh imported reload retains exact migrated/claimed/confirmed entitlements");
            IntegrationClick(reload,"Redeploy"); Fresh(Shop(reload.Game.Session),7,launcher,new[] {2,0,0,1,0,0});
            Require(reload.Game.Session.Model.CurrentCannonDamage == 40 && reload.Game.Session.Model.CurrentMaximumHull == 120 &&
                reload.Game.Session.Model.CurrentCannonPeriod == 20 && storage.SuccessfulWrites == 4,
                "integration migrated future deployment applies committed P without temporary resurrection");
        }
    }

    static void IntegrationLegacySnapshots()
    {
        // These constants are original pre-T04 fixtures, not regenerated values.
        string[,] retained = {
            {"adc49df9a0713701d88fc621db959da192f5b3e66c9f8f5d6b562853868b12b6","288cbba6d7d844d964831dfe59c82b9cbd92f55206f49b75c38f6d587a721953"},
            {"939b493e6a400dec39dd422a42c66977171dcd4ed59fcc81bd678d7f97351eb3","bb7115d9b540e03e17c82cd3bdbdf2eeacb143d11b11bbb0f5d53d47ea1772f4"},
            {"bd4e602433adaafdf40a1d30c8bc8244962535ca3d4a156ffa068204aa381e14","d0166220ca362fc9bdb7945aed21cc0791ec5909327b05428e064a0aa86e3003"},
            {"e333e726f15e13aa9e52792e78364b51f4cfd5748222ba112657e28eec0c784f","11a0b9e779b797fb16b748eda2ef16f27cd709a4f3396e7b77181b0d01cd7321"}
        };
        int index = 0;
        foreach (string scene in new[] {"Assets/Scenes/FieldAssembly.unity","Assets/Scenes/BattlefieldReview.unity"})
        foreach (bool launcher in new[] {false,true})
        {
            EditorSceneManager.OpenScene(scene,OpenSceneMode.Single); var art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(art,"Start"); Invoke(art.GetComponent<ArtHud>(),"Start"); var session = art.GetComponent<EncounterSession>();
            SetField(session,"focused",true); SetField(session,"applicationPaused",false);
            if (art.showingLauncher != launcher) art.ToggleAttachment(); session.DeployAt(100); var model = session.Model;
            Require(Shop(session) == null && !session.BackgroundContinuation && art.GetComponent<LastStandLoopController>() == null &&
                art.GetComponent<LastStandAudio>() == null, "integration shared imported scenes retain non-awarding original owners");
            // Step the actual imported model to original byte oracles. This is a
            // model parity fixture; no shared-session or browser clock is claimed.
            while (model.Tick < 137) model.Step(); Require(IntegrationSnapshotHash(model) == retained[index,0],"integration imported shared tick137 bytes retain original pinned snapshot");
            while (model.Status == EncounterStatus.Running) model.Step(); Require(IntegrationSnapshotHash(model) == retained[index,1],"integration imported shared terminal bytes retain original pinned snapshot");
            string terminal = model.Snapshot(); model.Step(); Require(model.Snapshot() == terminal && Shop(session) == null,"integration shared terminal remains frozen and non-awarding");
            Debug.Log("ST_LS_SHOP_INTEGRATION_LEGACY scene="+scene+" fitting="+launcher+" snapshot137="+retained[index,0]+" terminal="+retained[index,1]); index++;
        }
    }
    static string IntegrationSnapshotHash(EncounterModel model)
    {
        using (var hash = System.Security.Cryptography.SHA256.Create())
            return BitConverter.ToString(hash.ComputeHash(System.Text.Encoding.UTF8.GetBytes(model.Snapshot()))).Replace("-","").ToLowerInvariant();
    }
    public static void RunIntegration()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED"); bool background = Application.runInBackground;
            try
            {
                NamedIncome("test_integration_two_fittings_effects_and_lifecycle", () =>
                { foreach (bool launcher in new[] {false,true}) foreach (var profile in new[] {new Vector2Int(1366,664),new Vector2Int(390,688)}) IntegrationEffectsJourney(launcher,profile); },ref failed);
                NamedIncome("test_integration_old_save_conflict_and_legacy_parity", () =>
                { foreach (bool launcher in new[] {false,true}) IntegrationOldSaveConflict(launcher); IntegrationLegacySnapshots(); },ref failed);
            }
            finally { LastStandLoopController.StorageFactory = () => new LastStandStore(); EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); Application.runInBackground = background; }
        }
        EditorApplication.Exit(failed ? 1 : 0);
    }
    // End T19 imported integration qualification.

    public static void RunDeploy()
    {
        bool failed = false;
        using (var preferencesScope = new LastStandTestPreferencesScope())
        {
            Debug.Log("ST_LS_SHOP_COMPILED");
            var factory = LastStandLoopController.StorageFactory;
            bool background = Application.runInBackground;
            try
            {
                Part("launcher-frozen-effects", () => FrozenProjection(true), ref failed);
                Part("repair-frozen-effects", () => FrozenProjection(false), ref failed);
                Part("fresh-zero-baseline", FreshRedeploymentAndZeroBaseline, ref failed);
                Part("save-focus-admission", SaveAndFocusAdmission, ref failed);
                Part("shared-scene-parity", SharedSceneParity, ref failed);
            }
            finally
            {
                LastStandLoopController.StorageFactory = factory;
                EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                Application.runInBackground = background;
            }
            Debug.Log((failed ? "ST_LS_SHOP_FAIL " : "ST_LS_SHOP_PASS ") + "test_deploy_frozen_permanent_snapshot_and_fittings");
        }
        if (failed) EditorApplication.Exit(1);
    }
}

// Editor-only input producer. It never dispatches a callback or changes an
// economy; Unity's existing input module consumes these bounded native frames.
internal sealed class LastStandShopInputFrames : BaseInput
{
    public bool Submit, Down, Up, Touch;
    public Vector2 Position = new Vector2(-1000,-1000);
    public Vector2 Scroll;
    public TouchPhase Phase;
    public override bool mousePresent => !Touch;
    public override Vector2 mousePosition => Position;
    public override Vector2 mouseScrollDelta => Scroll;
    public override bool GetMouseButtonDown(int button) => button == 0 && Down;
    public override bool GetMouseButtonUp(int button) => button == 0 && Up;
    public override bool GetMouseButton(int button) => button == 0 && Down;
    public override float GetAxisRaw(string name) => 0;
    public override bool GetButtonDown(string name) => name == "Submit" && Submit;
    public override bool touchSupported => Touch;
    public override int touchCount => Touch ? 1 : 0;
    public override Touch GetTouch(int index) => new Touch { fingerId=51, position=Position, rawPosition=Position,
        phase=Phase, type=TouchType.Direct, tapCount=1 };
    public void Clear() { Submit=Down=Up=Touch=false; Position=new Vector2(-1000,-1000); Scroll=Vector2.zero; }
}

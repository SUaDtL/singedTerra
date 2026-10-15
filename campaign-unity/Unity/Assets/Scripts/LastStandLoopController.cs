using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Present only on the dedicated playable scene. The review scene remains non-awarding.
    public sealed class LastStandLoopController : MonoBehaviour
    {
        // Editor checks substitute a disposable record without touching a player's local save.
#if UNITY_EDITOR
        public static Func<ILastStandStorage> StorageFactory = () => new LastStandStore();
#endif
        public LastStandProgression Progression { get; private set; }
        public string Phase { get; private set; } = "garage";
        public string Notice { get; private set; } = "";
        public EncounterSession Session { get; private set; }
        public LastStandShopState Shop => Session?.Shop;
        public LastStandShopAccounting FinalAccounting { get; private set; }
        public LastStandAudio Audio { get; private set; }
        public bool Muted => Audio && Audio.Muted;
        TankPresentation art;
        ArtHud artHud;
        LastStandLoopHud hud;
        LastStandShopState runShop;
        float settle;
        bool purchasePending, permanentPurchaseInProgress, suppressCallbackFeedback, failedRun, temporaryPurchaseInProgress;
        LastStandUpgradeTrackId pendingPermanentTrack;
        int pendingPermanentPriorLevel;
        bool previousRunInBackground, ownsBackgroundSetting;
        const double MaximumForegroundFeedbackInterval = .5;
        public event Action Changed;

        public void Initialize(TankPresentation presentation, EncounterSession session, ArtHud sharedHud, Canvas canvas, Font font)
        {
            art = presentation; Session = session; artHud = sharedHud;
            previousRunInBackground = Application.runInBackground;
            ownsBackgroundSetting = true;
            Application.runInBackground = true;
#if UNITY_EDITOR
            Progression = LastStandProgression.Load(StorageFactory());
#else
            Progression = LastStandProgression.Load(new LastStandStore());
#endif
            Audio = gameObject.AddComponent<LastStandAudio>();
            Audio.Initialize();
            hud = new LastStandLoopHud(this, canvas, font);
            session.Changed += OnSessionChanged;
            session.Stepped += OnSessionStepped;
            artHud.SetPlayableVisible();
            Phase = Progression.PendingDefeat != null ? "result" : Progression.Wallet > 0 ? "workshop" : "garage";
            if (Progression.SaveState != "ready") Notice = Progression.SaveError;
            Refresh("ready");
        }

        public void Deploy()
        {
            if (Phase != "garage" && Phase != "workshop") return;
            if (!Session.CanRun) { Notice = "Return to this tab before deploying."; Refresh("focus-required"); return; }
            if (!Progression.TryDeploy()) { Notice = Progression.SaveError ?? "Deploy is unavailable."; Refresh("save-error"); return; }
            StartReservedRun();
        }

        void StartReservedRun()
        {
            if (Progression.ActiveRunId == 0) return;
            // Reservation has committed and read back. Capture all six levels
            // once; neither later storage observations nor fittings own this run.
            var permanentLevels = new int[LastStandUpgradeCatalog.Tracks.Count];
            foreach (var track in LastStandUpgradeCatalog.Tracks)
                permanentLevels[(int)track.Id] = Progression.GetPermanentLevel(track.Id);
            var shop = new LastStandShopState(Progression.ActiveRunId,
                art.showingLauncher ? LastStandFitting.Launcher : LastStandFitting.Repair, permanentLevels);
            runShop = shop; FinalAccounting = null;
            failedRun = suppressCallbackFeedback = false;
            Audio.UnlockFromGesture("deploy");
            Session.DeployReservedRun(shop);
            if (Session.Model == null)
            {
                FinalizeShop(LastStandShopPurchaseLifecycle.Failed, null);
                runShop = null;
                Progression.AbandonRun();
                Notice = "Unable to enter the battlefield. Try Deploy again.";
                Refresh("deploy-failed");
                return;
            }
            Phase = "battle"; Notice = "";
            Refresh("deploy");
        }

        void OnSessionStepped(EncounterModel model)
        {
            // Income belongs to every authoritative admitted step, including a
            // terminal/background step. Audio admission never owns accounting.
            if (runShop != null && model == Session.Model) runShop.ObserveAuthoritativeKills(model.Kills);
            if (Phase != "battle" || Session.Paused || Session.Failure != "") return;
            // Preserve ordinary short foreground batches. A delayed/background
            // callback and every subsequent debt-draining callback discard old
            // cues, including the final step where the clock debt reaches zero.
            if (Session.StepsThisCallback == 1)
            {
                suppressCallbackFeedback |= !Session.CanRun ||
                    Session.CallbackElapsedSeconds > MaximumForegroundFeedbackInterval;
                if (suppressCallbackFeedback) DiscardMissedFeedback();
            }
            SyncAudioAdmission();
            if (suppressCallbackFeedback || !Session.CanRun) return;
            foreach (var evt in model.Events)
            {
                Audio.PlayEvent(evt.Kind, evt.Amount, !evt.Killed);
                if (evt.Kind == EncounterEventKind.Cannon)
                    Debug.Log("ST_LS_HIT " + JsonUtility.ToJson(new HitState { tick = model.Tick,
                        cannonDamage = model.CommittedCannonDamage, firstFoeHull = model.Foes[0].Hull,
                        kills = model.Kills }));
            }
        }

        void OnSessionChanged()
        {
            if (Progression == null || Session == null) return;
            try { ReconcileSessionChange(); }
            finally
            {
                // Admission resumes for new events only after this callback has
                // exhausted its debt. No old event is stored for replay.
                if (!Session.CatchingUp) suppressCallbackFeedback = false;
                SyncAudioAdmission();
            }
        }
        void ReconcileSessionChange()
        {
            var model = Session.Model;
            SyncAudioAdmission();
            if (runShop != null && model == null)
            {
                if (FinalAccounting == null)
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Exited, null);
                    Progression.AbandonRun(); Phase = "garage"; Notice = "Run exited. No salvage was awarded.";
                }
                runShop = null;
            }
            if (Phase == "battle" && model != null)
            {
                if (Session.Failure != "")
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Failed, model);
                    failedRun = true;
                    Progression.AbandonRun(); Session.ReturnToInspection();
                    Phase = "garage"; Notice = "This run stopped because of a technical problem. No salvage was awarded.";
                    Refresh("technical-failure"); return;
                }
                if (model.Status == EncounterStatus.Defeated)
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Defeated, model);
                    if (!Progression.TryStageDefeat(model.Tick, model.Kills))
                    {
                        Notice = Progression.SaveError ?? "Could not save the defeat. Retry the save.";
                        Phase = "save-error"; Refresh("save-error"); return;
                    }
                    settle = (float)Math.Max(0, .48 - Session.TerminalElapsedSeconds);
                    Phase = "settling"; Audio.PlayDefeat(); Refresh("defeat-staged"); return;
                }
                if (model.Status == EncounterStatus.Limit)
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Limit, model);
                    Progression.TryStageNonDefeat(); Session.ReturnToInspection();
                    Phase = "garage"; Notice = "Run limit reached. No salvage was awarded.";
                    Refresh("limit"); return;
                }
                runShop?.UpdatePurchaseLifecycle(Session.Paused ? LastStandShopPurchaseLifecycle.Paused :
                    Session.CatchingUp ? LastStandShopPurchaseLifecycle.CatchingUp : LastStandShopPurchaseLifecycle.Running);
            }
            Refresh("session");
        }

        void FinalizeShop(LastStandShopPurchaseLifecycle lifecycle, EncounterModel model)
        {
            if (runShop == null) return;
            if (model != null) runShop.ObserveAuthoritativeKills(model.Kills);
            FinalAccounting = runShop.FinalizeAccounting(lifecycle);
        }

        void Update()
        {
            if (Phase != "settling") return;
            if (Session.Paused) return;
            // TerminalElapsedSeconds is cumulative active time from the sole
            // session clock. Repeated callbacks cannot charge it twice.
            settle = Mathf.Min(settle, (float)Math.Max(0, .48 - Session.TerminalElapsedSeconds));
            if (settle > 0) return;
            Session.ReturnToInspection();
            Phase = "result"; Refresh("result");
        }
        void LateUpdate() { hud?.Layout(); }

        public void Claim()
        {
            if (Phase != "result" || Progression.PendingDefeat == null) return;
            if (!Progression.TryClaim()) { Notice = Progression.SaveError ?? "Claim is unavailable."; Refresh("save-error"); return; }
            FinalAccounting = null;
            Phase = "workshop"; Notice = "1 salvage claimed. Choose your next fitting."; Refresh("claim");
        }

        public void Purchase() => Purchase(LastStandUpgradeTrackId.CannonAttack);

        public void Purchase(LastStandUpgradeTrackId track)
        {
            int index = (int)track;
            if (permanentPurchaseInProgress || index < 0 || index >= LastStandUpgradeCatalog.Tracks.Count ||
                (Phase != "garage" && Phase != "workshop") || Session.Model != null ||
                Progression.ActiveRunId != 0 || Progression.PendingDefeat != null) return;
            if (Progression.SaveState != "ready")
            {
                Notice = Progression.SaveError;
                Refresh("purchase-unavailable"); return;
            }
            var definition = LastStandUpgradeCatalog.Tracks[index];
            int priorLevel = Progression.GetPermanentLevel(track);
            permanentPurchaseInProgress = true;
            try
            {
                SyncAudioAdmission(); Audio.UnlockFromGesture("purchase");
                if (!Progression.TryPurchase(track))
                {
                    purchasePending = Progression.SaveState != "ready";
                    if (purchasePending)
                    { pendingPermanentTrack = track; pendingPermanentPriorLevel = priorLevel; }
                    Notice = Progression.SaveError ?? (priorLevel == LastStandUpgradeCatalog.PermanentCap ?
                        definition.Name + " is fully upgraded." : "Not enough salvage yet.");
                    Refresh("purchase-unavailable"); return;
                }
                purchasePending = false;
                Audio.PlayPurchase(); Notice = definition.Name + " upgraded and saved."; Refresh("purchase");
            }
            finally { permanentPurchaseInProgress = false; }
        }

        public LastStandShopPurchaseResult TryPurchaseTemporary(LastStandShopPurchaseIntent intent)
        { return TryPurchaseTemporaryAt(intent, Time.realtimeSinceStartupAsDouble); }

        // Capture the caller's immutable intent before advancing. Clock callbacks
        // can end or replace this run, so neither its ledger nor its revision may
        // be substituted afterward. A refused purchase is never kept for retry.
        public LastStandShopPurchaseResult TryPurchaseTemporaryAt(LastStandShopPurchaseIntent intent, double timestamp)
        {
            var session = Session;
            var model = session?.Model;
            var shop = session?.Shop;
            LastStandShopPurchaseResult Refuse(LastStandShopPurchaseRefusal reason) =>
                new LastStandShopPurchaseResult(reason, 0, shop?.Version ?? 0, null);
            if (temporaryPurchaseInProgress) return Refuse(LastStandShopPurchaseRefusal.Inactive);
            if (intent == null) return Refuse(LastStandShopPurchaseRefusal.InvalidIntent);
            if (shop == null || model == null || shop != runShop)
                return Refuse(LastStandShopPurchaseRefusal.Inactive);
            if (Phase != "battle") return shop.FinalAccounting != null ? shop.TryPurchase(intent) :
                Refuse(LastStandShopPurchaseRefusal.Inactive);

            temporaryPurchaseInProgress = true;
            try
            {
                // The sole bounded step owner settles every admitted tick using
                // the old stats, retaining excess debt for a later callback.
                session.AdvanceAt(timestamp);
                if (Session != session || session.Model != model || session.Shop != shop || runShop != shop)
                {
                    if (Session?.Model != null && Session.Model != model)
                        return Refuse(LastStandShopPurchaseRefusal.WrongRun);
                    // A terminal callback may already have cleared session
                    // ownership. Its original closed ledger still gives the
                    // exact terminal reason, with no debit or effect.
                    return shop.FinalAccounting != null ? shop.TryPurchase(intent) :
                        Refuse(LastStandShopPurchaseRefusal.Inactive);
                }
                if (session.Failure != "") return Refuse(LastStandShopPurchaseRefusal.Failed);
                if (model.Status == EncounterStatus.Defeated) return Refuse(LastStandShopPurchaseRefusal.Defeated);
                if (model.Status == EncounterStatus.Limit) return Refuse(LastStandShopPurchaseRefusal.Limit);
                if (Progression.ActiveRunId != shop.RunId)
                    return Refuse(LastStandShopPurchaseRefusal.WrongRun);
                if (Phase != "battle") return Refuse(LastStandShopPurchaseRefusal.Inactive);
                shop.UpdatePurchaseLifecycle(session.Paused ? LastStandShopPurchaseLifecycle.Paused :
                    session.CatchingUp ? LastStandShopPurchaseLifecycle.CatchingUp : LastStandShopPurchaseLifecycle.Running);
                var result = shop.TryPurchase(intent);
                if (result.Accepted) session.ApplyShopProjection();
                return result;
            }
            finally
            {
                temporaryPurchaseInProgress = false;
                Refresh("temporary-purchase");
            }
        }

        public void Redeploy() { Deploy(); }
        public void RetrySave()
        {
            bool hadPending = Progression.PendingDefeat != null;
            string priorPhase = Phase;
            if (!Progression.Retry()) { Notice = Progression.SaveError; Refresh("save-error"); return; }
            bool purchaseConfirmed = purchasePending &&
                Progression.GetPermanentLevel(pendingPermanentTrack) == pendingPermanentPriorLevel + 1;
            if (purchaseConfirmed)
            {
                SyncAudioAdmission();
                Audio.UnlockFromGesture("retry-purchase"); Audio.PlayPurchase();
            }
            purchasePending = false;
            Notice = purchaseConfirmed ? LastStandUpgradeCatalog.Get(pendingPermanentTrack).Name + " upgraded and saved." : "Save confirmed.";
            if (Progression.ActiveRunId != 0 && Session.Model == null) { StartReservedRun(); return; }
            if (Progression.PendingDefeat != null)
            {
                if (Session.Model != null) Session.ReturnToInspection();
                Phase = "result";
            }
            else if (hadPending && Progression.PendingDefeat == null && priorPhase == "result")
            { Phase = "workshop"; FinalAccounting = null; }
            else if (Phase == "save-error") Phase = "garage";
            Refresh("save-recovered");
        }
        public void TogglePause() { if (Phase == "battle" || Phase == "settling") Session.TogglePause(); }
        public void ToggleMute() { Audio.ToggleMute(); Refresh("mute"); }
        void DiscardMissedFeedback()
        {
            art.ClearEncounterFeedback();
            Session.View.Advance(.7f);
        }
        void SyncAudioAdmission()
        {
            if (Audio && Session != null)
                Audio.SetSuspended(failedRun || Session.Paused || !Session.CanRun || Session.Failure != "" ||
                    Progression.SaveState != "ready" || suppressCallbackFeedback);
        }
        void OnApplicationFocus(bool active) { if (!active && Audio) { Audio.SetSuspended(true); DiscardMissedFeedback(); } }
        void OnApplicationPause(bool active) { if (active && Audio) { Audio.SetSuspended(true); DiscardMissedFeedback(); } }
        void OnDestroy()
        {
            FinalizeShop(LastStandShopPurchaseLifecycle.Exited, Session?.Model);
            runShop = null; FinalAccounting = null;
            if (Session) { Session.Changed -= OnSessionChanged; Session.Stepped -= OnSessionStepped; }
            hud?.Dispose();
            if (ownsBackgroundSetting) Application.runInBackground = previousRunInBackground;
        }

        void Refresh(string action)
        {
            if (temporaryPurchaseInProgress) return;
            if (hud == null) return;
            SyncAudioAdmission();
            hud.Refresh(); Changed?.Invoke();
            Debug.Log("ST_LS_STATE " + JsonUtility.ToJson(new State { action = action, phase = Phase,
                saveState = Progression.SaveState, saveError = Progression.SaveError ?? "", notice = Notice,
                wallet = Progression.Wallet, level = Progression.CannonAttackLevel, nextCost = Progression.NextCost,
                cannonDamage = Session.Model?.CommittedCannonDamage ?? Progression.CannonDamage,
                runId = Progression.ActiveRunId, pendingRunId = Progression.PendingDefeat?.RunId ?? 0,
                tick = Session.Model?.Tick ?? 0, hull = Session.Model?.Hull ?? 120, kills = Session.Model?.Kills ?? 0,
                paused = Session.Paused, muted = Muted }));
        }
        [Serializable] sealed class State
        {
            public string action, phase, saveState, saveError, notice;
            public int wallet, level, nextCost, cannonDamage, runId, pendingRunId, tick, hull, kills;
            public bool paused, muted;
        }
        [Serializable] sealed class HitState { public int tick, cannonDamage, firstFoeHull, kills; }
    }
}

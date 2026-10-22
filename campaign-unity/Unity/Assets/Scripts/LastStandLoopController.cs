using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.VisualReview;

namespace SingedTerra.LastStand
{
    // Present only on the dedicated playable scene. The review scene remains non-awarding.
    public sealed class LastStandLoopController : MonoBehaviour
    {
        // Editor checks substitute a disposable record without touching a player's local save.
#if UNITY_EDITOR
        public static Func<ILastStandStorage> StorageFactory = () => new LastStandStore();
        public static Func<ILastStandStorage> PreferencesStorageFactory = () => new LastStandPreferencesStore();
#endif
        public LastStandProgression Progression { get; private set; }
        public string Phase { get; private set; } = "garage";
        public string Notice { get; private set; } = "";
        public string GarageIssue { get; private set; } = "";
        public EncounterSession Session { get; private set; }
        public LastStandShopState Shop => Session?.Shop;
        public LastStandShopAccounting FinalAccounting { get; private set; }
        public LastStandAudio Audio { get; private set; }
        public LastStandPreferences Preferences { get; private set; }
        public LastStandGuidance Guidance { get; } = new LastStandGuidance();
        public LastStandDisplaySettings Display { get; private set; }
        public LastStandBrowserBridge Browser { get; private set; }
        public string MenuPage { get; private set; } = "";
        public string Confirmation { get; private set; } = "";
        public bool MenuOpen => MenuPage != "";
        public bool CanOpenMenu => !Session.CatchingUp && Session.CanRun;
        public bool Muted => Audio && Audio.Muted;
        public LastStandSelection Selection { get; private set; }
        public bool SelectionOpen => MenuPage=="tier" || MenuPage=="fitting";
        public bool CanSelectLoadout => (Phase=="garage" || Phase=="workshop") &&
            Progression.SaveState=="ready" && Progression.ActiveRunId==0 && Progression.PendingDefeat==null &&
            Session.Model==null && !Session.CatchingUp && Session.CanRun;
        public bool GarageCardsVisible => (Phase=="garage" || Phase=="workshop") &&
            Progression.SaveState=="ready" && Progression.ActiveRunId==0 && Progression.PendingDefeat==null && Session.Model==null;
        public LastStandSelection GarageTierSelection { get; private set; }
        public LastStandSelection GarageFittingSelection { get; private set; }
        public bool HasLockedTierPreview => GarageCardsVisible && GarageTierSelection!=null && !GarageTierSelection.Current.Unlocked;
        string garageTierStamp, garageFittingStamp;
        public string FittingId => art.FittingId;
        public string EnvironmentId => art.GetComponent<BattlefieldReview>()?.EnvironmentId ?? "";
        TankPresentation art;
        ArtHud artHud;
        LastStandLoopHud hud;
        LastStandShopState runShop;
        float settle;
        bool purchasePending, permanentPurchaseInProgress, suppressCallbackFeedback, failedRun, temporaryPurchaseInProgress;
        LastStandUpgradeTrackId pendingPermanentTrack;
        int pendingPermanentPriorLevel;
        bool previousRunInBackground, ownsBackgroundSetting;
        bool goalAcknowledged;
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
            Preferences = LastStandPreferences.Load(PreferencesStorageFactory());
#else
            Progression = LastStandProgression.Load(new LastStandStore());
            Preferences = LastStandPreferences.Load(new LastStandPreferencesStore());
#endif
            Session.ConfigureSpeed(Preferences.Current.LastPositiveSpeed);
            Audio = gameObject.AddComponent<LastStandAudio>();
            Audio.Initialize();
            Display = gameObject.AddComponent<LastStandDisplaySettings>();
            Browser = new GameObject("LastStandBrowserBridge").AddComponent<LastStandBrowserBridge>();
            Browser.transform.SetParent(transform, false);
            ApplyPreferences();
            hud = new LastStandLoopHud(this, canvas, font);
            Browser.Initialize(this);
            session.Changed += OnSessionChanged;
            session.Stepped += OnSessionStepped;
            artHud.SetPlayableVisible();
            Phase = Progression.PendingDefeat != null ? "result" : Progression.Wallet > 0 ? "workshop" : "garage";
            if (Progression.SaveState != "ready") Notice = Progression.SaveError;
            ApplyTierEnvironment(Progression.SelectedTier);
            Refresh("ready");
        }

        public void Deploy()
        {
            if (MenuOpen) return;
            if (Phase != "garage" && Phase != "workshop") return;
            if(HasLockedTierPreview) { Notice="This tier is a locked preview. Choose an unlocked tier before deploying.";Refresh("locked-preview");return; }
            if (!ApplyTierEnvironment(Progression.SelectedTier)) { Refresh("environment-unavailable"); return; }
            if (!Session.CanRun) { Notice = "Return to this tab before deploying."; Refresh("focus-required"); return; }
            if (!Progression.TryDeploy()) { Notice = Progression.SaveError ?? "Deploy is unavailable."; Refresh("save-error"); return; }
            StartReservedRun();
        }

        public void SelectTier(int tier)
        {
            if (MenuOpen && MenuPage!="tier") return;
            if(MenuPage=="tier" && (Selection==null || Selection.Current.Id!=tier.ToString() || !Selection.Current.Unlocked))return;
            Guidance.Dismiss();
            if ((Phase != "garage" && Phase != "workshop") || Session.Model != null) return;
            if(!CanSelectLoadout || !Progression.IsTierUnlocked(tier))return;
            if(!ApplyTierEnvironment(tier)) { Refresh("environment-unavailable");return; }
            if (!Progression.TrySelectTier(tier))
            {
                Notice = Progression.SaveError ?? "Finish and save a Tier 1 run of 60 seconds to unlock Tier 2.";
                ApplyTierEnvironment(Progression.SelectedTier);
                Refresh("tier-unavailable"); return;
            }
            Notice = "Tier " + Progression.SelectedTier + " selected.";
            ApplyTierEnvironment(Progression.SelectedTier);
            Refresh("tier-selected");
        }

        bool ApplyTierEnvironment(int tier)
        {
            var review=art.GetComponent<BattlefieldReview>();
            if(review && review.TrySelectEnvironment(LastStandTierCatalog.Get(tier).EnvironmentId))
            { GarageIssue="";return true; }
            GarageIssue="Battlefield unavailable. Retry.";
            Notice="Battlefield unavailable. Close the selector and retry before deploying.";return false;
        }
        void RefreshGarageSelections()
        {
            if(!GarageCardsVisible)return;
            var options=new List<LastStandSelectionOption>();
            string stamp=Progression.SelectedTier.ToString();
            foreach(var tier in LastStandTierCatalog.All)
            {
                bool unlocked=Progression.IsTierUnlocked(tier.Id);
                var environment=LastStandEnvironmentCatalog.Get(tier.EnvironmentId);
                stamp+="/"+tier.Id+":"+unlocked+":"+Progression.GetBestTicks(tier.Id)+":"+Progression.GetBestKills(tier.Id);
                options.Add(new LastStandSelectionOption(tier.Id.ToString(),"Tier "+tier.Id+" - "+environment.Name,
                    unlocked ? "Goal: survive "+(tier.GoalTicks/20)+"s. "+
                        LastStandTierHudText.Best(Progression.GetBestTicks(tier.Id),Progression.GetBestKills(tier.Id)) :
                        "LOCKED PREVIEW\nSave a "+(tier.RequiredTicks/20)+"s Tier "+tier.RequiredTier+" run.",unlocked));
            }
            if(GarageTierSelection==null || garageTierStamp!=stamp)
            { GarageTierSelection=new LastStandSelection(options,Progression.SelectedTier.ToString(),true);garageTierStamp=stamp; }
            if(GarageFittingSelection==null || garageFittingStamp!=art.FittingId)
            { GarageFittingSelection=new LastStandSelection(LastStandFittingCatalog.Options,art.FittingId,false);garageFittingStamp=art.FittingId; }
        }
        public void RestoreGaragePreview()
        {
            if(Session.Model!=null || GarageTierSelection==null)return;
            GarageTierSelection.Reset(Progression.SelectedTier.ToString());
            ApplyTierEnvironment(Progression.SelectedTier);
        }
        public void MoveGarageTier(int direction)
        {
            if(MenuOpen || !CanSelectLoadout || (direction!=-1 && direction!=1))return;
            RefreshGarageSelections();
            if(!GarageTierSelection.Move(direction))return;
            var option=GarageTierSelection.Current;
            int tier=int.Parse(option.Id,System.Globalization.CultureInfo.InvariantCulture);
            if(!ApplyTierEnvironment(tier))GarageTierSelection.Reset(Progression.SelectedTier.ToString());
            else if(option.Unlocked)
            {
                SelectTier(tier);
                if(Progression.SelectedTier!=tier)RestoreGaragePreview();
            }
            Refresh("garage-tier");
        }
        public void MoveGarageFitting(int direction)
        {
            if(MenuOpen || !CanSelectLoadout || (direction!=-1 && direction!=1))return;
            RefreshGarageSelections();
            if(!GarageFittingSelection.Move(direction))return;
            var option=GarageFittingSelection.Current;
            if(!option.Unlocked || !art.TrySelectFitting(option.Id))GarageFittingSelection.Reset(art.FittingId);
            Refresh("garage-fitting");
        }
        public void OpenSelector(string kind)
        {
            if(!CanSelectLoadout || MenuOpen || (kind!="tier" && kind!="fitting"))return;
            RestoreGaragePreview();
            var options=new List<LastStandSelectionOption>();
            if(kind=="tier")
            {
                foreach(var tier in LastStandTierCatalog.All)
                {
                    var environment=LastStandEnvironmentCatalog.Get(tier.EnvironmentId);
                    options.Add(new LastStandSelectionOption(tier.Id.ToString(),"Tier "+tier.Id+" - "+environment.Name,
                        environment.Description+"\nGoal: "+(tier.GoalTicks/20)+"s. "+
                        (Progression.IsTierUnlocked(tier.Id) ? "Choose a tier to play." : tier.LockReason),Progression.IsTierUnlocked(tier.Id)));
                }
            }
            else options.AddRange(LastStandFittingCatalog.Options);
            Selection=new LastStandSelection(options,kind=="tier" ? Progression.SelectedTier.ToString() : art.FittingId,kind=="tier");
            if(kind=="tier")ApplyTierEnvironment(Progression.SelectedTier);
            OpenMenu(kind);
        }
        public void MoveSelection(int direction)
        {
            if(!SelectionOpen || Selection==null || !CanSelectLoadout || !Selection.Move(direction))return;
            var option=Selection.Current;
            if(MenuPage=="tier")
            {
                int tier=int.Parse(option.Id,System.Globalization.CultureInfo.InvariantCulture);
                if(!ApplyTierEnvironment(tier))Selection.Reset(Progression.SelectedTier.ToString());
                else if(option.Unlocked)
                {
                    SelectTier(tier);
                    if(Progression.SelectedTier!=tier) { Selection.Reset(Progression.SelectedTier.ToString());ApplyTierEnvironment(Progression.SelectedTier); }
                }
            }
            else if(option.Unlocked && !art.TrySelectFitting(option.Id))Selection.Reset(art.FittingId);
            Refresh("selection-preview");
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
            failedRun = suppressCallbackFeedback = goalAcknowledged = false;
            Audio.UnlockFromGesture("deploy");
            Session.ConfigureSpeed(Preferences.Current.LastPositiveSpeed);
            Session.DeployReservedRun(shop, MenuOpen);
            if (Session.Model == null)
            {
                FinalizeShop(LastStandShopPurchaseLifecycle.Failed, null);
                runShop = null;
                Progression.AbandonRun();
                Notice = "Unable to enter the battlefield. Try Deploy again.";
                GarageIssue = "Deployment failed. Retry Deploy.";
                Refresh("deploy-failed");
                return;
            }
            Phase = "battle"; Notice = ""; GarageIssue = "";
            Guidance.Dismiss();
            if (Progression.CannonAttackLevel == 0) Guidance.EnterFirstRun();
            Refresh("deploy");
        }

        void OnSessionStepped(EncounterModel model)
        {
            // Income belongs to every authoritative admitted step, including a
            // terminal/background step. Audio admission never owns accounting.
            if (runShop != null && model == Session.Model) runShop.ObserveAuthoritativeKills(model.Kills);
            if (Phase != "battle" || Session.Paused || Session.Failure != "") return;
            if (!goalAcknowledged && model.Tick >= LastStandTierCatalog.Get(model.Profile.Tier).GoalTicks)
            {
                goalAcknowledged = true;
                Notice = "Goal reached. Finish this run to save your progress.";
            }
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
                    GarageIssue = "Run stopped. No salvage awarded.";
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
                    Notice = SavedResultNotice();
                    Phase = "settling"; Audio.PlayDefeat(); Refresh("defeat-staged"); return;
                }
                if (model.Status == EncounterStatus.Limit)
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Limit, model);
                    if (!Progression.TryStageLimit(model.Tick, model.Kills))
                    {
                        Notice = Progression.SaveError ?? "Could not save the limit result. Retry the save.";
                        Phase = "save-error"; Refresh("save-error"); return;
                    }
                    Phase = "result"; Notice = SavedResultNotice();
                    Session.ReturnToInspection();
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
            if (MenuOpen) return;
            if (Phase != "result" || Progression.PendingDefeat == null) return;
            int reward = Progression.PendingDefeat.Reward;
            if (!Progression.TryClaim()) { Notice = Progression.SaveError ?? "Claim is unavailable."; Refresh("save-error"); return; }
            FinalAccounting = null;
            Phase = "workshop"; Notice = reward == 0 ? "Limit result acknowledged. No salvage was awarded." :
                "1 salvage claimed. Choose your next fitting."; Refresh("claim");
        }

        string SavedResultNotice()
        {
            var result = Progression.PendingDefeat;
            if (result == null) return "Save confirmed.";
            string notice = result.IsLimit ? "Run limit reached. No victory or salvage. Result saved." : "Result saved.";
            if (result.NewBestTime) notice += " New best survival.";
            if (result.NewBestKills) notice += " New best disabled count.";
            if (result.UnlockedTierTwo) notice += " Tier 2 unlocked.";
            return notice;
        }

        public void Purchase() => Purchase(LastStandUpgradeTrackId.CannonAttack);

        public void Purchase(LastStandUpgradeTrackId track)
        {
            if (MenuOpen) return;
            Guidance.Dismiss();
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
                Audio.PlayPurchase(); Notice = definition.Name + " upgraded and saved.";
                Guidance.PurchaseConfirmed(track, priorLevel); Refresh("purchase");
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
                Guidance.PurchaseConfirmed(pendingPermanentTrack, pendingPermanentPriorLevel);
            }
            purchasePending = false;
            if (!purchaseConfirmed) Guidance.Dismiss();
            Notice = purchaseConfirmed ? LastStandUpgradeCatalog.Get(pendingPermanentTrack).Name + " upgraded and saved." : "Save confirmed.";
            if (Progression.ActiveRunId != 0 && Session.Model == null) { StartReservedRun(); return; }
            if (Progression.PendingDefeat != null)
            {
                Notice = SavedResultNotice();
                if (Session.Model != null) Session.ReturnToInspection();
                Phase = "result";
            }
            else if (hadPending && Progression.PendingDefeat == null && priorPhase == "result")
            { Phase = "workshop"; FinalAccounting = null; }
            else if (Phase == "save-error") Phase = "garage";
            if(Session.Model==null)
            {
                if(SelectionOpen && MenuPage=="tier")Selection.Reset(Progression.SelectedTier.ToString());
                ApplyTierEnvironment(Progression.SelectedTier);
            }
            Refresh("save-recovered");
        }
        public void TogglePause()
        {
            if (MenuOpen || (Phase != "battle" && Phase != "settling")) return;
            Session.TogglePause(); PersistSpeed();
        }
        public void ChangeSpeed(int direction)
        {
            if (MenuOpen || Phase != "battle") return;
            double rate = Math.Max(0, Math.Min(Session.MaximumSpeed, Session.SelectedSpeed + direction * .5));
            if (Session.TrySetSpeed(rate)) PersistSpeed();
        }
        void PersistSpeed()
        {
            if (Preferences.Current.LastPositiveSpeed != Session.LastPositiveSpeed)
                Preferences.Apply(Preferences.Current.With(lastPositiveSpeed: Session.LastPositiveSpeed));
            Refresh("speed");
        }
        public void ToggleMute()
        {
            Audio.UnlockFromGesture("mute");
            SetPreferences(Preferences.Current.With(muted: !Preferences.Current.Muted));
        }
        public void SetPreferences(LastStandPreferenceValues value)
        { Preferences.Apply(value); ApplyPreferences(); Refresh("preferences"); }
        void ApplyPreferences()
        {
            var value = Preferences.Current;
            if (Session.Model == null) Session.ConfigureSpeed(value.LastPositiveSpeed);
            Audio.ApplySettings(value);
            Guidance.Configure(value.TutorialTips, value.PurchaseSuggestions);
            if (Session.View.FullEffects == value.ReducedEffects) Session.ToggleEffects();
            Display.Apply(value.Quality);
        }
        public void ToggleEffects() => SetPreferences(Preferences.Current.With(reducedEffects: !Preferences.Current.ReducedEffects));
        public void RetryPreferences() { Preferences.Retry(); ApplyPreferences(); Refresh("preferences-retry"); }
        public void RefreshControls() { Refresh("controls"); }
        public void OpenMenu(string page = "menu")
        {
            if((page=="tier" || page=="fitting") && (!CanSelectLoadout || Selection==null))return;
            if (!CanOpenMenu) return;
            RestoreGaragePreview();
            if(SelectionOpen && page!=MenuPage) { ApplyTierEnvironment(Progression.SelectedTier);Selection=null; }
            if (!MenuOpen && Session.Model != null && !Session.TrySetMenuPaused(true)) return;
            MenuPage = page; Confirmation = "";
            Audio.UnlockFromGesture("menu"); Refresh("menu");
        }
        public void CloseMenu()
        {
            if (!MenuOpen) return;
            if(SelectionOpen) { ApplyTierEnvironment(Progression.SelectedTier);Selection=null; }
            if (Session.Model != null && !Session.TrySetMenuPaused(false)) return;
            MenuPage = ""; Confirmation = ""; Refresh("menu-close");
        }
        public void RequestConfirmation(string action)
        {
            if (action != "reset-settings" && action != "abandon") return;
            if (action == "abandon" && (!LastStandNavigationPolicy.CanLeave(Progression.SaveState, Session.CatchingUp) || Progression.ActiveRunId == 0)) return;
            OpenMenu("confirm");
            if (MenuPage == "confirm") { Confirmation = action; Refresh("confirmation"); }
        }
        public void CancelConfirmation() { Confirmation = ""; MenuPage = "menu"; Refresh("confirmation-cancel"); }
        public void RequestNavigation(bool account)
        {
            if (!LastStandNavigationPolicy.CanLeave(Progression.SaveState, Session.CatchingUp))
            { Notice = "Finish reconciling this run and retry any unconfirmed save before leaving."; Refresh("navigation-unavailable"); return; }
            if (!LastStandNavigationPolicy.RequiresConfirmation(Progression.ActiveRunId)) { Browser.Navigate(account); return; }
            OpenMenu("confirm");
            if (MenuPage == "confirm") { Confirmation = account ? "account" : "campaigns"; Refresh("confirmation"); }
        }
        public void ConfirmAction()
        {
            if (MenuPage != "confirm" || Confirmation == "") return;
            string action = Confirmation;
            if (action == "reset-settings")
            {
                Preferences.ResetDefaults(true); ApplyPreferences();
                // Reset preferences does not resume a run or change its current rate.
                MenuPage = "settings"; Confirmation = ""; Refresh("settings-reset"); return;
            }
            if (!LastStandNavigationPolicy.CanLeave(Progression.SaveState, Session.CatchingUp)) return;
            if (Progression.ActiveRunId != 0)
            {
                FinalizeShop(LastStandShopPurchaseLifecycle.Exited, Session.Model);
                Progression.AbandonRun(); runShop = null;
                Session.ReturnToInspection(); Phase = "garage";
                Notice = "Run abandoned. No salvage was awarded."; Guidance.Dismiss();
            }
            MenuPage = ""; Confirmation = ""; Refresh("abandon");
            if (action == "campaigns" || action == "account") Browser.Navigate(action == "account");
        }
        void DiscardMissedFeedback()
        {
            art.ClearEncounterFeedback();
            Session.View.Advance(.7f);
        }
        void SyncAudioAdmission()
        {
            if (Audio && Session != null)
            {
                Audio.SetSuspended(failedRun || Session.Paused || !Session.CanRun || Session.Failure != "" ||
                    MenuOpen || Progression.SaveState != "ready" || suppressCallbackFeedback);
                Audio.SetMusicSuspended(failedRun || !Session.CanRun || Session.Failure != "" || Progression.SaveState != "ready");
            }
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
            RefreshGarageSelections();
            SyncAudioAdmission();
            hud.Refresh(); Changed?.Invoke();
            Debug.Log("ST_LS_STATE " + JsonUtility.ToJson(new State { action = action, phase = Phase,
                saveState = Progression.SaveState, saveError = Progression.SaveError ?? "", notice = Notice,
                wallet = Progression.Wallet, level = Progression.CannonAttackLevel, nextCost = Progression.NextCost,
                cannonDamage = Session.Model?.CommittedCannonDamage ?? Progression.CannonDamage,
                runId = Progression.ActiveRunId, pendingRunId = Progression.PendingDefeat?.RunId ?? 0,
                tick = Session.Model?.Tick ?? 0, hull = Session.Model?.Hull ?? 120, kills = Session.Model?.Kills ?? 0,
                selectedTier = Progression.SelectedTier, activeTier = Progression.ActiveTier,
                profileVersion = LastStandTierCatalog.ProfileVersion, tierTwoUnlocked = Progression.TierTwoUnlocked,
                bestTicks1 = Progression.GetBestTicks(1), bestTicks2 = Progression.GetBestTicks(2),
                bestKills1 = Progression.GetBestKills(1), bestKills2 = Progression.GetBestKills(2),
                pendingTier = Progression.PendingDefeat?.Tier ?? 0, pendingReward = Progression.PendingDefeat?.Reward ?? 0,
                goalMet = Session.Model != null && Session.Model.Tick >= LastStandTierCatalog.Get(Session.Model.Profile.Tier).GoalTicks,
                paused = Session.Paused, muted = Muted, speed = Session.EffectiveSpeed,
                selectedSpeed = Session.SelectedSpeed, menu = MenuPage, preferencesState = Preferences.SaveState,
                selectionId = SelectionOpen && Selection!=null ? Selection.Current.Id : "",
                selectionUnlocked = SelectionOpen && Selection!=null && Selection.Current.Unlocked,
                garageTierId = GarageCardsVisible && GarageTierSelection!=null ? GarageTierSelection.Current.Id : "",
                garageTierUnlocked = GarageCardsVisible && GarageTierSelection!=null && GarageTierSelection.Current.Unlocked,
                lockedTierPreview = HasLockedTierPreview,
                environmentId = EnvironmentId, fittingId=FittingId,
                renderScale = Display.RenderScale, fullscreen = Browser.Fullscreen,
                musicEnabled = Preferences.Current.MusicEnabled, tutorialTips = Preferences.Current.TutorialTips,
                purchaseSuggestions = Preferences.Current.PurchaseSuggestions,
                masterVolume = Preferences.Current.MasterVolume, effectsVolume = Preferences.Current.EffectsVolume,
                musicVolume = Preferences.Current.MusicVolume }));
        }
        [Serializable] sealed class State
        {
            public string action, phase, saveState, saveError, notice, profileVersion;
            public int wallet, level, nextCost, cannonDamage, runId, pendingRunId, tick, hull, kills;
            public int selectedTier, activeTier, bestTicks1, bestTicks2, bestKills1, bestKills2, pendingTier, pendingReward;
            public bool paused, muted, tierTwoUnlocked, goalMet;
            public double speed, selectedSpeed;
            public string menu, preferencesState;
            public string selectionId, environmentId, fittingId;
            public bool selectionUnlocked;
            public string garageTierId;
            public bool garageTierUnlocked,lockedTierPreview;
            public float renderScale;
            public bool fullscreen, musicEnabled, tutorialTips, purchaseSuggestions;
            public int masterVolume, effectsVolume, musicVolume;
        }
        [Serializable] sealed class HitState { public int tick, cannonDamage, firstFoeHull, kills; }
    }
}

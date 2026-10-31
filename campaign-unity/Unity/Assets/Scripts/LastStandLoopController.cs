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
    public sealed partial class LastStandLoopController : MonoBehaviour, ILastStandPurchaseHost
    {
        // Editor checks substitute a disposable record without touching a player's local save.
#if UNITY_EDITOR
        public static Func<ILastStandStorage> StorageFactory = () => new LastStandStore();
        public static Func<ILastStandStorage> PreferencesStorageFactory = () => new LastStandPreferencesStore();
#endif
        public LastStandProgression Progression { get; private set; }
        public string Phase { get; private set; } = "garage";
        public string Notice { get; private set; } = "";
        public string ConfirmedWaveReceipt
        {
            get
            {
                var receipt=Progression?.LastReceipt;
                return receipt==null?"":LastStandTierHudText.WaveReceipt(receipt.Wave,receipt.Salvage,
                    receipt.MilestoneId!=null,receipt.UnlockedFitting,receipt.UnlockedTier);
            }
        }
        string ReceiptNotice(string context="")=>ConfirmedWaveReceipt==""?context:
            ConfirmedWaveReceipt+(context==""?"":"\n"+context);
        public string GarageIssue { get; private set; } = "";
        public EncounterSession Session { get; private set; }
        public LastStandShopState Shop => Session?.Shop;
        public LastStandShopAccounting FinalAccounting { get; private set; }
        public LastStandAudio Audio { get; private set; }
        public LastStandPreferences Preferences { get; private set; }
        public LastStandGuidance Guidance { get; } = new LastStandGuidance();
        public LastStandDisplaySettings Display { get; private set; }
        public LastStandBrowserBridge Browser { get; private set; }
        public ILastStandPlatform Platform => Browser;
        public string MenuPage { get; private set; } = "";
        public string Confirmation { get; private set; } = "";
        public bool MenuOpen => MenuPage != "";
        public bool CanOpenMenu => (!Session.CatchingUp || Session.CheckpointBlocked) && Session.CanRun;
        public bool CanInspectWave => Session?.Model?.Profile.IsWaveBased==true && Shop!=null && CanOpenMenu;
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
        bool suppressCallbackFeedback, failedRun;
        LastStandPurchaseCoordinator purchases;
        ILastStandPurchaseSession ILastStandPurchaseHost.PurchaseSession => Session;
        LastStandShopState ILastStandPurchaseHost.RunShop => runShop;
        public LastStandBulkQuantity ShopQuantity { get; private set; }=LastStandBulkQuantity.One;
        public void CycleShopQuantity()
        {
            ShopQuantity=ShopQuantity==LastStandBulkQuantity.One?LastStandBulkQuantity.Ten:
                ShopQuantity==LastStandBulkQuantity.Ten?LastStandBulkQuantity.Hundred:
                ShopQuantity==LastStandBulkQuantity.Hundred?LastStandBulkQuantity.Max:LastStandBulkQuantity.One;
            Refresh("shop-quantity");
        }
        bool previousRunInBackground, ownsBackgroundSetting;
        LastStandRunCoordinator runs;
        ILastStandStorage progressionStorage, preferencesStorage;
        string afterAbandon = "";
        const double MaximumForegroundFeedbackInterval = .5;
        public event Action Changed;

        public void Initialize(TankPresentation presentation, EncounterSession session, ArtHud sharedHud, Canvas canvas, Font font)
        {
            art = presentation; Session = session; artHud = sharedHud;
            previousRunInBackground = Application.runInBackground;
            ownsBackgroundSetting = true;
            Application.runInBackground = true;
#if UNITY_EDITOR
            progressionStorage=StorageFactory();
            preferencesStorage=PreferencesStorageFactory();
#else
            progressionStorage=new LastStandStore();
            preferencesStorage=new LastStandPreferencesStore();
#endif
            Progression=LastStandProgression.Load(progressionStorage);
            Preferences=LastStandPreferences.Load(preferencesStorage);
            runs=new LastStandRunCoordinator(Progression);
            purchases=new LastStandPurchaseCoordinator(this);
            InitializeResearch();
            Session.GrantMaximumSpeed(Progression.MaximumGameSpeed);
            Session.ConfigureSpeed(Preferences.Current.LastPositiveSpeed);
            Audio = gameObject.AddComponent<LastStandAudio>();
            Audio.Initialize();
            Audio.CombatAdmission = Session.PrepareCombatCue;
            Display = gameObject.AddComponent<LastStandDisplaySettings>();
            Browser = new GameObject("LastStandBrowserBridge").AddComponent<LastStandBrowserBridge>();
            Browser.transform.SetParent(transform, false);
            InitializeContinuity();
            ApplyPreferences();
            hud = new LastStandLoopHud(this, canvas, font);
            Browser.Initialize(this);
            session.Changed += OnSessionChanged;
            session.Stepped += OnSessionStepped;
            session.WaveCleared += OnWaveCleared;
            session.BeforeAdvance = ReconcileResearchBenefits;
            artHud.SetPlayableVisible();
            Phase = Progression.PendingDefeat != null ? "result" : Progression.Wallet > 0 ? "workshop" : "garage";
            if (Progression.SaveState != "ready") Notice = Progression.SaveError;
            ApplyTierEnvironment(Progression.SelectedTier);
            art.TrySelectFitting(Progression.Checkpoint?.FittingId ?? Progression.SelectedFitting);
            Refresh("ready");
        }

        public void Deploy()
        {
            if (MenuOpen) return;
            if (Phase != "garage" && Phase != "workshop") return;
            if (Progression.HasCheckpoint) { ResumeRun(); return; }
            if(HasLockedTierPreview) { Notice="This tier is a locked preview. Choose an unlocked tier before deploying.";Refresh("locked-preview");return; }
            if (!ApplyTierEnvironment(Progression.SelectedTier)) { Refresh("environment-unavailable"); return; }
            if (!Session.CanRun) { Notice = "Return to this tab before deploying."; Refresh("focus-required"); return; }
            if (!runs.ReserveRun()) {Notice = Progression.SaveError ?? "Deploy is unavailable."; Refresh("save-error"); return; }
            StartReservedRun(false);
        }
        public void ResumeRun()
        {
            if(MenuOpen || Session.Model!=null || !Progression.HasCheckpoint || Progression.SaveState!="ready" || !Session.CanRun)return;
            StartReservedRun(true);
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
                Notice = Progression.SaveError ?? LastStandTierCatalog.Get(tier).LockReason;
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
            if(review && review.TrySelectEnvironment(LastStandContentCatalog.Current.EnvironmentForTier(tier).Id))
            { GarageIssue="";return true; }
            GarageIssue="Battlefield unavailable. Retry.";
            Notice="Battlefield unavailable. Close the selector and retry before deploying.";return false;
        }
        void RefreshGarageSelections()
        {
            if(!GarageCardsVisible)return;
            var content=LastStandContentCatalog.Current;
            string stamp=Progression.SelectedTier.ToString();
            foreach(var tier in content.Tiers)
            {
                bool unlocked=Progression.IsTierUnlocked(tier.Id);
                stamp+="/"+tier.Id+":"+unlocked+":"+Progression.GetBestWave(tier.Id);
            }
            if(GarageTierSelection==null || garageTierStamp!=stamp)
            {
                var options=content.TierOptions(Progression.IsTierUnlocked,tier=>Progression.IsTierUnlocked(tier.Id) ?
                    LastStandTierHudText.WaveBest(Progression.GetBestWave(tier.Id))+"\n"+LastStandTierHudText.NextMilestone(tier.Id,Progression.GetBestWave(tier.Id)) :
                    "LOCKED PREVIEW\n"+tier.LockReason,true);
                GarageTierSelection=new LastStandSelection(options,Progression.SelectedTier.ToString(),true);garageTierStamp=stamp;
            }
            string fittingStamp=art.FittingId;
            foreach(var fitting in content.Fittings)fittingStamp+="/"+fitting.Id+":"+Progression.IsFittingUnlocked(fitting.Id);
            if(GarageFittingSelection==null || garageFittingStamp!=fittingStamp)
            {
                var available=new List<LastStandSelectionOption>();
                foreach(var option in content.FittingOptions(Progression.IsFittingUnlocked))if(option.Unlocked)available.Add(option);
                GarageFittingSelection=new LastStandSelection(available,art.FittingId,false);garageFittingStamp=fittingStamp;
            }
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
            if(!option.Unlocked || !Progression.TrySelectFitting(option.Id) || !art.TrySelectFitting(option.Id))GarageFittingSelection.Reset(art.FittingId);
            Refresh("garage-fitting");
        }
        public void OpenSelector(string kind)
        {
            if(!CanSelectLoadout || MenuOpen || (kind!="tier" && kind!="fitting"))return;
            RestoreGaragePreview();
            var options=new List<LastStandSelectionOption>();
            if(kind=="tier")
            {
                var content=LastStandContentCatalog.Current;
                options.AddRange(content.TierOptions(Progression.IsTierUnlocked,tier=>content.EnvironmentForTier(tier.Id).Description+"\n"+
                    (Progression.IsTierUnlocked(tier.Id)?"Choose a tier to play.":tier.LockReason),true));
            }
            else options.AddRange(LastStandContentCatalog.Current.FittingOptions(Progression.IsFittingUnlocked));
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
            else if(option.Unlocked && (!Progression.TrySelectFitting(option.Id) || !art.TrySelectFitting(option.Id)))Selection.Reset(art.FittingId);
            Refresh("selection-preview");
        }

        void StartReservedRun(bool resume)
        {
            var checkpoint=Progression.Checkpoint;
            if (checkpoint==null || !ApplyTierEnvironment(checkpoint.Tier) || !art.TrySelectFitting(checkpoint.FittingId)) return;
            var shop=checkpoint.RestoreShop();
            var model=checkpoint.RestoreModel();
            runShop = shop; FinalAccounting = null;
            StartHistory(resume);
            failedRun = suppressCallbackFeedback = false;
            runs.BeginRun();
            Audio.UnlockFromGesture("deploy");
            Session.ConfigureSpeed(Preferences.Current.LastPositiveSpeed);
            Phase="battle";
            Session.RestoreReservedRun(shop,model,resume);
            if (Session.Model == null)
            {
                FinalizeShop(LastStandShopPurchaseLifecycle.Failed, null);
                runShop = null;
                Phase="garage";
                Notice = "Unable to enter the battlefield. The checkpoint is kept; try Resume again.";
                GarageIssue = "Deployment failed. Retry Resume.";
                Refresh("deploy-failed");
                return;
            }
            Phase = "battle"; Notice = resume ? "Checkpoint restored. Press Resume to continue; no closed-tab time was simulated." : "Starting checkpoint saved."; GarageIssue = "";
            Guidance.Dismiss();
            if (IsFirstDeployment) Guidance.EnterFirstRun();
            Refresh(resume?"resume":"deploy");
        }

        void OnSessionStepped(EncounterModel model)
        {
            // Income belongs to every authoritative admitted step, including a
            // terminal/background step. Audio admission never owns accounting.
            if (runShop != null && model == Session.Model)
            {
                runShop.ObserveAuthoritativeKills(model,Progression.ResearchRank(LastStandResearchTrackId.ScrapLogistics));
                RecordActiveStep();
            }
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
            bool feedbackAllowed = !suppressCallbackFeedback && Session.CanRun;
            if (feedbackAllowed) Audio.PlayEvents(model.Events);
            foreach (var evt in model.Events)
            {
                // Authoritative hit evidence is independent of audiovisual admission.
                if (evt.Kind == EncounterEventKind.Cannon)
                    LastStandObservations.Hit(model);
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
        void OnWaveCleared(EncounterModel model)
        {
            if(model!=Session.Model || runShop==null)return;
            FlushHistoryTime();
            if(!runs.CommitWave(model,runShop,liveHistory,ReconcileResearchBenefits))
            {
                Session.HoldCheckpoint();Phase="save-error";
                Notice=Progression.SaveError??"Wave checkpoint is unconfirmed. Retry Save before continuing.";
                Refresh("wave-save-error");return;
            }
            AdoptCommittedHistory();
            Notice=ReceiptNotice();
            Session.ContinueCommittedWave();
            // Commit telemetry describes this exact boundary. The session will
            // publish Changed after draining the callback; projecting the HUD
            // here would temporarily disable focused controls for pending steps.
            EmitState("wave-committed");
        }
        void ReconcileSessionChange()
        {
            var model=Session.Model;SyncAudioAdmission();
            if(runShop!=null && model==null)
            { runShop=null; if(Phase=="battle")Phase="garage"; }
            if((Phase=="battle" || Phase=="save-error") && model!=null)
            {
                if(Session.Failure!="")
                {
                    failedRun=true;FinalizeShop(LastStandShopPurchaseLifecycle.Failed,model);
                    runShop=null;Phase="garage";Session.ReturnToInspection();
                    Notice="The run stopped. Your last confirmed wave checkpoint is available to resume.";
                    Refresh("technical-failure");return;
                }
                if(runs.HoldsRun)
                { Refresh("save-error");return; }
                if(model.Status==EncounterStatus.Defeated)
                {
                    FlushHistoryTime();
                    // A simultaneous final kill/death may already have atomically
                    // banked this wave and invalidated the checkpoint.
                    if(!runs.FinalizeRun(liveHistory,runShop))
                    {
                        Session.HoldCheckpoint();Phase="save-error";
                        Notice=Progression.SaveError??"Defeat is not yet saved. Retry Save.";
                        Refresh("save-error");return;
                    }
                    FinalizeShop(LastStandShopPurchaseLifecycle.Defeated,model);
                    settle=(float)Math.Max(0,.48-Session.TerminalElapsedSeconds);
                    Notice=ReceiptNotice("Run ended. Completed rewards remain saved.");
                    Phase="settling";Audio.PlayDefeat();Refresh("defeat-staged");return;
                }
                runShop?.UpdatePurchaseLifecycle(Session.Paused?LastStandShopPurchaseLifecycle.Paused:
                    Session.CatchingUp?LastStandShopPurchaseLifecycle.CatchingUp:LastStandShopPurchaseLifecycle.Running);
            }
            Refresh("session");
        }

        void FinalizeShop(LastStandShopPurchaseLifecycle lifecycle, EncounterModel model)
        {
            if (runShop == null) return;
            if (model != null) runShop.ObserveAuthoritativeKills(model,Progression.ResearchRank(LastStandResearchTrackId.ScrapLogistics));
            FinalAccounting = runShop.FinalizeAccounting(lifecycle);
        }

        void Update()
        {
            UpdateResearch();
            RecordPausedTime();
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
            if (Phase != "result") return;
            if (Progression.PendingDefeat == null) { Phase="workshop";FinalAccounting=null;Refresh("continue");return; }
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

        public void Purchase(LastStandUpgradeTrackId track)=>TryPurchasePermanent(track,ShopQuantity,Progression.Revision);
        public bool TryPurchasePermanent(LastStandUpgradeTrackId track,LastStandBulkQuantity quantity,long expectedRevision)
        {
            if(purchases.PermanentInProgress)return false;
            if(MenuOpen || expectedRevision!=Progression.Revision){Refresh("purchase-stale");return false;}
            Guidance.Dismiss();
            bool allowed=(Phase=="garage" || Phase=="workshop") && Session.Model==null && Progression.PendingDefeat==null;
            var result=purchases.Permanent(track,quantity,expectedRevision,allowed,ReconcileResearchBenefits,
                ()=>{SyncAudioAdmission();Audio.UnlockFromGesture("purchase");},PublishPermanentPurchase);
            return result.Accepted;
        }
        void PublishPermanentPurchase(LastStandPermanentPurchaseResult result)
        {
            if(result.Silent)return;
            if(!result.Accepted){Notice=result.Error;Refresh("purchase-unavailable");return;}
            Audio.PlayPurchase();
            Notice=result.Name+" +"+result.Quantity+" saved for "+result.Cost+" Salvage. Existing checkpoints keep their original deployment levels.";
            Guidance.PurchaseConfirmed(result.Track,result.PriorLevel);Refresh("purchase");
        }

        public LastStandShopPurchaseResult TryPurchaseTemporary(LastStandShopPurchaseIntent intent)
        { return TryPurchaseTemporaryAt(intent, Time.realtimeSinceStartupAsDouble); }

        // Capture the caller's immutable intent before advancing. Clock callbacks
        // can end or replace this run, so neither its ledger nor its revision may
        // be substituted afterward. A refused purchase is never kept for retry.
        public LastStandShopPurchaseResult TryPurchaseTemporaryAt(LastStandShopPurchaseIntent intent, double timestamp)
        {
            bool attempted=false;
            try { return purchases.Temporary(intent,timestamp,out attempted); }
            finally { if(attempted)Refresh("temporary-purchase"); }
        }

        public void Redeploy() { Deploy(); }
        public void RetrySave()
        {
            if(RetryBackupRestore())return;
            var model=Session.Model;
            var recovery=runs.Retry(model,runShop,liveHistory,EnsureResearchInitialized,ReconcileResearchBenefits);
            if(recovery.Kind==LastStandRecoveryKind.Failed)
            {Notice=recovery.Error;Refresh("save-error");return;}
            Session.GrantMaximumSpeed(Progression.MaximumGameSpeed);
            if(recovery.ReleaseResearchHold){Session.ContinueCommittedWave();Phase="battle";}
            if(recovery.Kind==LastStandRecoveryKind.Abandoned){FinishAbandon();return;}
            if(recovery.Kind==LastStandRecoveryKind.Wave)
            {
                AdoptCommittedHistory();Session.ContinueCommittedWave();Phase="battle";
                Notice=ReceiptNotice("Press Resume when ready.");
                if(model.Status==EncounterStatus.Defeated)
                {
                    FinalizeShop(LastStandShopPurchaseLifecycle.Defeated,model);
                    Session.ReturnToInspection();Phase="result";
                    Notice=ReceiptNotice("Run ended. Completed rewards remain saved.");
                }
                Refresh("save-recovered");return;
            }
            if(recovery.Kind==LastStandRecoveryKind.Terminal)
            {
                FinalizeShop(LastStandShopPurchaseLifecycle.Defeated,model);
                Session.ReturnToInspection();Phase="result";Notice=ReceiptNotice("Run ended. Completed rewards remain saved.");
                Refresh("save-recovered");return;
            }
            var confirmedPurchase=purchases.ConfirmRetry();
            bool confirmed=confirmedPurchase!=null;
            if(confirmed){SyncAudioAdmission();Audio.UnlockFromGesture("retry-purchase");Audio.PlayPurchase();Guidance.PurchaseConfirmed(confirmedPurchase.Track,confirmedPurchase.PriorLevel);}
            if(recovery.Kind==LastStandRecoveryKind.Started)
            {Phase="garage";Notice="Starting checkpoint saved. Select Resume when ready.";}
            else if(Progression.PendingDefeat!=null)Phase="result";
            else if(Session.Model==null && Phase=="save-error")Phase="garage";
            if(Session.Model==null)
            {
                ApplyTierEnvironment(Progression.Checkpoint?.Tier??Progression.SelectedTier);
                art.TrySelectFitting(Progression.Checkpoint?.FittingId??Progression.SelectedFitting);
                garageTierStamp=garageFittingStamp=null;
            }
            Notice=confirmed?"Upgrade saved. Existing checkpoints keep their original deployment stats.":"Save confirmed.";
            Refresh("save-recovered");
        }
        public void TogglePause()
        {
            if (MenuOpen || (Phase != "battle" && Phase != "settling")) return;
            RecordPausedTime();
            Session.TogglePause(); PersistSpeed();
        }
        public void ChangeSpeed(int direction)
        {
            if (MenuOpen || Phase != "battle") return;
            if(!ReconcileResearchBenefits()){Refresh("speed-unavailable");return;}
            RecordPausedTime();
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
            if(page=="wave" && !CanInspectWave)return;
            if((page=="tier" || page=="fitting") && (!CanSelectLoadout || Selection==null))return;
            if (!CanOpenMenu) return;
            RecordPausedTime();
            RestoreGaragePreview();
            if(SelectionOpen && page!=MenuPage) { ApplyTierEnvironment(Progression.SelectedTier);Selection=null; }
            if (!MenuOpen && Session.Model != null && !Session.CheckpointBlocked && !Session.TrySetMenuPaused(true)) return;
            LeaveBackupPage(page);
            MenuPage = page; Confirmation = "";
            Audio.UnlockFromGesture("menu"); Refresh("menu");
        }
        public void CloseMenu()
        {
            if (!MenuOpen) return;
            RecordPausedTime();
            if(SelectionOpen) { ApplyTierEnvironment(Progression.SelectedTier);Selection=null; }
            if (Session.Model != null && !Session.CheckpointBlocked && !Session.TrySetMenuPaused(false)) return;
            LeaveBackupPage("");
            MenuPage = ""; Confirmation = ""; Refresh("menu-close");
        }
        public void RequestConfirmation(string action)
        {
            if (action != "reset-settings" && action != "abandon" && action != "new-run" && action != "return-garage") return;
            if(action=="return-garage" && !CanReturnToGarage)return;
            if (action != "reset-settings" && (!LastStandNavigationPolicy.CanLeave(Progression.SaveState, Session.CatchingUp) || !Progression.HasCheckpoint)) return;
            OpenMenu("confirm");
            if (MenuPage == "confirm") { Confirmation = action; Refresh("confirmation"); }
        }
        public void CancelConfirmation() { Confirmation = ""; MenuPage = "menu"; Refresh("confirmation-cancel"); }
        public void RequestNavigation(bool account)
        {
            if(!Platform.CanNavigate || account && !Platform.CanOpenAccount)
            { Notice="This destination is unavailable on this device.";Refresh("navigation-unavailable");return; }
            if (!LastStandNavigationPolicy.CanLeave(Progression.SaveState, Session.CatchingUp))
            { Notice = "Finish reconciling this run and retry any unconfirmed save before leaving."; Refresh("navigation-unavailable"); return; }
            // Ordinary navigation preserves the last committed wave. Partial
            // wave progress and purchases are restored together on Resume.
            MenuPage="";Confirmation="";Selection=null;
            if(Session.Model!=null){Phase="garage";runShop=null;Session.ReturnToInspection();}
            Refresh("navigation");
            Platform.Navigate(account);
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
            if(action=="return-garage"){ReturnToGarageKeepingCheckpoint();return;}
            afterAbandon=action;
            RecordPausedTime();FlushHistoryTime();
            if (Progression.HasCheckpoint)
            {
                if(!runs.FinalizeRun(liveHistory,runShop,true))
                {Session.HoldCheckpoint();Phase="save-error";Notice=Progression.SaveError;Refresh("save-error");return;}
            }
            FinishAbandon();
        }
        void FinishAbandon()
        {
            FinalizeShop(LastStandShopPurchaseLifecycle.Exited,Session.Model);
            runs.FinishAbandon();runShop=null;Phase="garage";MenuPage="";Confirmation="";
            Session.ReturnToInspection();Notice="Run abandoned. Completed-wave rewards are kept.";Guidance.Dismiss();
            string action=afterAbandon;afterAbandon="";Refresh("abandon");
            if(action=="new-run")Deploy();
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
        void OnApplicationFocus(bool active)
        {
            if (!active && Audio) { Audio.SetSuspended(true); DiscardMissedFeedback(); }
            else if(active && research!=null && research.Initialized && Progression.SaveState=="ready")RefreshResearch();
        }
        void OnApplicationPause(bool active)
        {
            if (active && Audio) { Audio.SetSuspended(true); DiscardMissedFeedback(); }
            else if (!active && research!=null && research.Initialized && Progression.SaveState=="ready") RefreshResearch();
        }
        void OnDestroy()
        {
            DisposeContinuity();
            FinalizeShop(LastStandShopPurchaseLifecycle.Exited, Session?.Model);
            runShop = null; FinalAccounting = null;
            if (Session) { Session.Changed -= OnSessionChanged; Session.Stepped -= OnSessionStepped; Session.WaveCleared -= OnWaveCleared; Session.BeforeAdvance=null; }
            hud?.Dispose();
            if (ownsBackgroundSetting) Application.runInBackground = previousRunInBackground;
            (progressionStorage as IDisposable)?.Dispose();
            (preferencesStorage as IDisposable)?.Dispose();
        }

        void Refresh(string action)
        {
            if (purchases!=null && purchases.TemporaryInProgress) return;
            if (hud == null) return;
            RefreshGarageSelections();
            SyncAudioAdmission();
            hud.Refresh(); Changed?.Invoke();
            EmitState(action);
        }
        void EmitState(string action)
        {
            if (purchases!=null && purchases.TemporaryInProgress || hud == null) return;
            LastStandObservations.Emit(this,action);
        }
    }
}

using System;
using System.Text;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
#if UNITY_EDITOR
        public static Func<Transform,ILastStandBackupTransport> BackupTransportFactory = LastStandUnityBackupTransport.Create;
#endif
        ILastStandBackupTransport backupTransport;
        long backupOperation, observedRestoreGeneration;
        bool continuityDisposed;
        public LastStandBackupPreview BackupPreview { get; private set; }
        public string BackupStatus { get; private set; } = "";
        public bool BackupAvailable => backupTransport != null && backupTransport.Available;
        public bool BackupBusy => backupTransport != null && backupTransport.Busy;
        bool HoldResearchForBackup => BackupBusy || BackupPreview != null || Progression.RestorePending;
        public bool CanChooseBackup => BackupAvailable && !BackupBusy && Session.Model == null && !Session.CatchingUp &&
            !Progression.RestorePending && Progression.CanPreviewBackup;
        public bool CanReturnToGarage => Session.Model != null && Progression.HasCheckpoint &&
            LastStandNavigationPolicy.CanLeave(Progression.SaveState,Session.CatchingUp) && !runs.HoldsRun && !BackupBusy;
        public bool CanExportBackup => BackupAvailable && !BackupBusy && !Progression.RestorePending &&
            Progression.TryExportBackup(out _,out _);
        public bool PreviousBackupAvailable => Session.Model==null && !BackupBusy &&
            !Progression.RestorePending && Progression.TryPreviewPreviousBackup(out _,out _);
        public LastStandGuidanceAction ContextGuidance
        {
            get
            {
                bool invested=false,affordable=false,experienced=false,idle=false,canResearch=false;
                foreach(var track in LastStandUpgradeCatalog.Tracks)
                {
                    invested|=Progression.GetPermanentLevel(track.Id)>0;
                    affordable|=Progression.IsPermanentTrackApplicable(track.Id) &&
                        Progression.QuotePermanent(track.Id,LastStandBulkQuantity.One).Quantity>0;
                }
                var snapshot=ResearchSnapshot;int best=Progression.GetBestWave(1);
                if(snapshot!=null)
                {
                    foreach(int rank in snapshot.completedRanks)experienced|=rank>0;
                    foreach(var slot in snapshot.slots)experienced|=slot.active!=null || slot.queued!=null;
                    foreach(var partial in snapshot.partials)experienced|=partial!=null;
                    int count=LastStandResearchCatalog.UnlockedSlots(best);
                    for(int i=0;i<count;i++)if(snapshot.slots[i].active==null)
                    {
                        idle=true;
                        foreach(var track in LastStandResearchCatalog.Definitions.Tracks)
                        {
                            var intent=LastStandResearchPresentation.Intent(snapshot,i,track.Id,LastStandResearchAction.Start);
                            canResearch|=LastStandResearchPresentation.CanSubmit(snapshot,intent,Progression.Wallet,best);
                        }
                    }
                }
                return Guidance.NextAction(new LastStandGuidanceContext(Progression.SaveState=="ready",Session.Model!=null,
                    Progression.HasCheckpoint,Progression.NextRunId,best,invested,experienced,affordable,idle,canResearch));
            }
        }
        bool IsFirstDeployment
        {
            get
            {
                if(Progression.NextRunId!=2 || Progression.GetBestWave(1)>0)return false;
                foreach(var track in LastStandUpgradeCatalog.Tracks)if(Progression.GetPermanentLevel(track.Id)>0)return false;
                foreach(var track in LastStandResearchCatalog.Definitions.Tracks)if(Progression.ResearchRank(track.Id)>0)return false;
                return true;
            }
        }

        void InitializeContinuity()
        {
#if UNITY_EDITOR
            backupTransport=BackupTransportFactory(transform);
#else
            backupTransport=LastStandUnityBackupTransport.Create(transform);
#endif
            observedRestoreGeneration=Progression.RestoreGeneration;
        }
        public void ExportBackup()
        {
            if(!MenuOpen || !CanExportBackup || !Progression.TryExportBackup(out var bytes,out var error))return;
            long operation=++backupOperation;
            BackupStatus="Choose where to save your backup.";
            backupTransport.Export(bytes,result=>{
                if(continuityDisposed || operation!=backupOperation)return;
                BackupStatus=result.Status==LastStandBackupTransferStatus.Success
                    ? "Backup handed to your device. Keep the .laststand file somewhere safe."
                    : result.Status==LastStandBackupTransferStatus.Cancelled ? "Backup cancelled. Your progress is unchanged."
                    : "The backup could not be exported. Your progress is unchanged; try again.";
                Refresh("backup-export");
            });
            Refresh("backup-picker");
        }
        public void ChooseBackup()
        {
            if(!MenuOpen || !CanChooseBackup)return;
            BackupPreview=null;long operation=++backupOperation;
            BackupStatus="Choose a .laststand backup. Nothing changes until you confirm.";
            backupTransport.Import(result=>{
                if(continuityDisposed || operation!=backupOperation)return;
                if(result.Status==LastStandBackupTransferStatus.Success)
                {
                    if(Progression.TryPreviewBackup(result.Document,out var preview,out var error))
                    {BackupPreview=preview;BackupStatus="Review the backup before replacing this device's progress.";MenuPage="backup-preview";Confirmation="";}
                    else BackupStatus=error;
                }
                else BackupStatus=result.Status==LastStandBackupTransferStatus.Cancelled ? "Selection cancelled. Your progress is unchanged."
                    : "That file could not be read. Choose a valid Last Stand backup.";
                Refresh("backup-preview");
            });
            Refresh("backup-picker");
        }
        public void PreviewPreviousBackup()
        {
            if(!MenuOpen || Session.Model!=null || BackupBusy || Progression.RestorePending)return;
            if(Progression.TryPreviewPreviousBackup(out var preview,out var error))
            {BackupPreview=preview;BackupStatus="Review the save kept before your last restore.";MenuPage="backup-preview";Confirmation="";Refresh("backup-preview");}
            else {BackupStatus=error;Refresh("backup-unavailable");}
        }
        public void CancelBackupPreview()
        {
            ++backupOperation;backupTransport?.Cancel();BackupPreview=null;
            BackupStatus="Restore cancelled. Your progress is unchanged.";
            if(MenuPage=="backup-preview")OpenMenu("save");
            else Refresh("backup-cancel");
        }
        public void ConfirmBackupRestore()
        {
            if(MenuPage!="backup-preview" || BackupPreview==null || Session.Model!=null || BackupBusy ||
                Session.CatchingUp || Progression.RestorePending)return;
            var preview=BackupPreview;
            if(!Progression.TryRestoreBackup(preview,out var error))
            {
                BackupStatus=error;BackupPreview=null;MenuPage="save";
                Refresh("backup-restore-unconfirmed");return;
            }
            AdoptRestoredProfile();
        }
        bool RetryBackupRestore()
        {
            if(!Progression.RestorePending)return false;
            if(!Progression.Retry())
            {BackupStatus=Progression.SaveError;Refresh("backup-restore-unconfirmed");return true;}
            AdoptRestoredProfile();return true;
        }
        void AdoptRestoredProfile()
        {
            if(Progression.RestoreGeneration==observedRestoreGeneration)return;
            observedRestoreGeneration=Progression.RestoreGeneration;
            BackupPreview=null;++backupOperation;backupTransport?.Cancel();
            // All owners must observe the replacement before another clock or
            // purchase action. The domain has already confirmed durable bytes.
            runs=new LastStandRunCoordinator(Progression);
            purchases=new LastStandPurchaseCoordinator(this);
            research=null;liveHistory=null;researchPollAt=0;
            Array.Clear(activeMillisecondsRemainders,0,activeMillisecondsRemainders.Length);
            pausedMillisecondsRemainder=0;historyObservedAt=Time.realtimeSinceStartupAsDouble;
            runShop=null;FinalAccounting=null;Selection=null;garageTierStamp=garageFittingStamp=null;
            Session.ReturnToInspection();
            Phase=Progression.PendingDefeat!=null?"result":"garage";Confirmation="";MenuPage="save";
            ApplyTierEnvironment(Progression.Checkpoint?.Tier??Progression.SelectedTier);
            art.TrySelectFitting(Progression.Checkpoint?.FittingId??Progression.SelectedFitting);
            Guidance.Dismiss();InitializeResearch();Session.RestoreProfileSpeed(Progression.MaximumGameSpeed,Preferences.Current.LastPositiveSpeed);
            BackupStatus=Progression.SaveState=="ready"
                ? (Progression.HasCheckpoint
                    ? "Backup restored and saved. Resume your checkpoint when ready; combat starts paused."
                    : "Backup restored and saved. Close this menu to continue.")
                : "Backup restored. Research needs a save retry before you continue.";
            Notice=BackupStatus;Refresh("backup-restored");
        }
        void ReturnToGarageKeepingCheckpoint()
        {
            if(!CanReturnToGarage)return;
            FinalizeShop(LastStandShopPurchaseLifecycle.Exited,Session.Model);
            runShop=null;liveHistory=null;FinalAccounting=null;
            Session.ReturnToInspection();Phase="garage";MenuPage="save";Confirmation="";
            ApplyTierEnvironment(Progression.Checkpoint.Tier);art.TrySelectFitting(Progression.Checkpoint.FittingId);
            Guidance.Dismiss();Notice="Checkpoint kept. Resume returns to the last completed wave, paused.";
            BackupStatus=Notice;
            Refresh("checkpoint-garage");
        }
        void LeaveBackupPage(string next)
        {
            if(next=="backup-preview" || next=="save")return;
            bool cancelled=BackupPreview!=null || BackupBusy;
            ++backupOperation;backupTransport?.Cancel();BackupPreview=null;
            if(cancelled)BackupStatus="Backup review cancelled. Your progress is unchanged.";
        }
        void DisposeContinuity()
        {continuityDisposed=true;++backupOperation;BackupPreview=null;backupTransport?.Dispose();backupTransport=null;}

        public string SaveHealthHeading
        {
            get
            {
                if(Progression.RestorePending)return "RESTORE AWAITING CONFIRMATION";
                switch(Progression.SaveHealth)
                {
                    case LastStandSaveHealth.Ready:return Progression.RecoveredPreviousRecord?"PREVIOUS SAVE RECOVERED":"PROGRESS SAVED";
                    case LastStandSaveHealth.Retry:return "SAVE NEEDS A RETRY";
                    case LastStandSaveHealth.Ownership:return "SAVE ACCESS UNAVAILABLE";
                    case LastStandSaveHealth.ReadUnavailable:return "STORAGE CANNOT BE READ";
                    case LastStandSaveHealth.UnsupportedVersion:return "NEWER SAVE VERSION";
                    case LastStandSaveHealth.InvalidData:return "DAMAGED SAVE PRESERVED";
                    case LastStandSaveHealth.Conflict:return "SAVE CHANGED ELSEWHERE";
                    default:return "SAVE UNAVAILABLE";
                }
            }
        }
        public string ConfirmedCheckpointText => !Progression.HasConfirmedSave?"Current progress cannot be read. The original record is preserved.":Progression.Checkpoint!=null
            ? "Tier "+Progression.Checkpoint.Tier+" / Wave "+Progression.Checkpoint.CompletedWave+" completed. Resume starts paused."
            : "No run checkpoint. Permanent progress is saved separately from combat.";
        public string BackupComparison()
        {
            var preview=BackupPreview;if(preview==null)return "This preview is no longer available. Choose the backup again.";
            var text=new StringBuilder("ON THIS DEVICE\n");
            text.Append(ConfirmedCheckpointText);
            if(Progression.HasConfirmedSave)text.Append("\nSalvage: ").Append(Progression.Wallet);
            text.Append("\n\nIN THIS BACKUP\nTier ").Append(preview.Tier).Append(" / ");
            text.Append(preview.HasCheckpoint?"Wave "+preview.CompletedWave+" completed":"No active checkpoint");
            text.Append("\nSalvage: ").Append(preview.Salvage).Append("\n\nPERMANENT UPGRADES (CURRENT -> BACKUP)");
            foreach(var track in LastStandUpgradeCatalog.Tracks)
            {
                int current=Progression.GetPermanentLevel(track.Id),imported=preview.PermanentLevels[(int)track.Id];
                if(current>0 || imported>0)text.Append("\n").Append(track.Name).Append(": ").Append(Progression.HasConfirmedSave?current.ToString():"unknown").Append(" -> ").Append(imported);
            }
            text.Append("\n\nRESEARCH (CURRENT -> BACKUP)");
            var importedResearch=preview.Research;
            foreach(var track in LastStandResearchCatalog.Definitions.Tracks)
                text.Append("\n").Append(track.Name).Append(": ").Append(Progression.HasConfirmedSave?Progression.ResearchRank(track.Id).ToString():"unknown").Append(" -> ").Append(importedResearch?.Rank(track.Id)??0);
            text.Append("\n\nCURRENT RESEARCH");
            if(Progression.HasConfirmedSave)AppendResearchProjects(text,Progression.ResearchSnapshot);
            else text.Append("\nCurrent research cannot be read.");
            text.Append("\n\nBACKUP RESEARCH");
            AppendResearchProjects(text,importedResearch);
            text.Append("\n\nReplace this device's entire gameplay save? Progress is replaced, never added together. Your current save is kept as the previous save. Audio, display and guidance settings stay on this device. Research keeps its original real-time clock; combat resumes only when you choose.");
            return text.ToString();
        }
        static void AppendResearchProjects(StringBuilder text,LastStandResearchSnapshot snapshot)
        {
            bool occupied=false;
            if(snapshot!=null)for(int i=0;i<snapshot.slots.Length;i++)
            {
                var slot=snapshot.slots[i];
                if(slot.active!=null)
                {occupied=true;text.Append("\nLab ").Append(i+1).Append(" Active: ").Append(LastStandResearchPresentation.Project(slot.active)).Append(" / ").Append(slot.active.chargedCost).Append(" Salvage paid");}
                if(slot.queued!=null)
                {occupied=true;text.Append("\nLab ").Append(i+1).Append(" Queued: ").Append(LastStandResearchPresentation.Project(slot.queued,true)).Append(" / ").Append(slot.queued.chargedCost).Append(" Salvage paid");}
            }
            if(snapshot!=null)foreach(var partial in snapshot.partials)if(partial!=null)
            {
                occupied=true;var quote=LastStandResearchPresentation.ProjectQuote(snapshot,partial.track,partial.rank);
                text.Append("\nSuspended: ").Append(LastStandResearchPresentation.Project(partial,true))
                    .Append(" / ").Append(LastStandResearchPresentation.Duration(partial.earnedMilliseconds)).Append(" progress saved; cost refunded / ")
                    .Append(quote.Cost).Append(" Salvage to resume");
            }
            if(!occupied)text.Append("\nNo active, queued or suspended projects.");
        }
    }
}

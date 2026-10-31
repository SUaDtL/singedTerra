using System;
using System.Collections.Generic;
using System.Text;

namespace SingedTerra.LastStand
{
    public enum LastStandSaveHealth
    {
        Ready, Retry, Ownership, ReadUnavailable, InvalidData, UnsupportedVersion, Conflict, Blocked
    }
    public sealed class LastStandBackupPreview
    {
        internal readonly LastStandProgression Owner;
        internal readonly string DestinationRaw, ImportedRaw;
        internal readonly long DestinationRevision;
        readonly LastStandResearchSnapshot research;
        public int Tier { get; }
        public int CompletedWave { get; }
        public int Salvage { get; }
        public bool HasCheckpoint { get; }
        public bool IsPreviousBackup { get; }
        public bool ReplacesDamagedSave { get; }
        public IReadOnlyList<int> PermanentLevels { get; }
        public LastStandResearchSnapshot Research => research?.Clone();
        internal LastStandBackupPreview(LastStandProgression owner,string destination,long revision,string imported,
            int tier,int wave,int salvage,bool checkpoint,bool previous,bool damaged,int[] levels,LastStandResearchSnapshot snapshot)
        {
            Owner=owner;DestinationRaw=destination;DestinationRevision=revision;ImportedRaw=imported;
            Tier=tier;CompletedWave=wave;Salvage=salvage;HasCheckpoint=checkpoint;IsPreviousBackup=previous;
            ReplacesDamagedSave=damaged;
            var projectedLevels=new int[LastStandUpgradeCatalog.Tracks.Count];
            Array.Copy(levels,projectedLevels,Math.Min(levels.Length,projectedLevels.Length));
            PermanentLevels=Array.AsReadOnly(projectedLevels);
            research=snapshot?.Clone();
        }
    }
    public static class LastStandBackupCodec
    {
        public const int MaximumBytes=128*1024;
        public const string Header="SINGED_TERRA_LAST_STAND_BACKUP 1\n";
        static readonly UTF8Encoding Utf8=new UTF8Encoding(false,true);
        internal static byte[] Encode(string profile)
        {
            if(profile==null || profile.Length>LastStandSaveJson.MaximumLength)
                throw new FormatException("Backup profile exceeds its bound.");
            int length=Utf8.GetByteCount(Header)+Utf8.GetByteCount(profile);
            if(length>MaximumBytes)throw new FormatException("Backup exceeds its byte bound.");
            return Utf8.GetBytes(Header+profile);
        }
        internal static bool TryDecode(byte[] document,out string profile)
        {
            profile=null;
            if(document==null || document.Length>MaximumBytes)return false;
            try
            {
                string text=Utf8.GetString(document);
                if(!text.StartsWith(Header,StringComparison.Ordinal))return false;
                string raw=text.Substring(Header.Length);
                if(raw.Length>LastStandSaveJson.MaximumLength)return false;
                profile=raw;return true;
            }
            catch(DecoderFallbackException){return false;}
        }
    }
    public sealed partial class LastStandProgression
    {
        // Rejected bytes are never presented as confirmed progress. A bounded,
        // readable, non-future record can be replaced only after a separately
        // previewed backup, exclusive ownership and durable predecessor proof.
        string rejectedRaw,restoreDestinationRaw;
        public LastStandSaveHealth SaveHealth { get; private set; } = LastStandSaveHealth.Blocked;
        public bool RecoveredPreviousRecord
        {
            get
            {
                try{return storage is ILastStandStorageRecoveryDiagnostics diagnostics && diagnostics.RecoveredPreviousRecord;}
                catch(Exception){return false;}
            }
        }
        public bool RestorePending { get; private set; }
        public long RestoreGeneration { get; private set; }
        public bool HasConfirmedSave=>committed!=null && committedRaw!=null;
        public bool RestoreBackupAvailable => storage is ILastStandRestoreBackupStorage;
        bool CanRepairDamagedSave=>committed==null && candidate==null &&
            SaveHealth==LastStandSaveHealth.InvalidData && rejectedRaw!=null;
        public bool CanPreviewBackup=>RestoreBackupAvailable && (Ready || CanRepairDamagedSave);
        string RestoreDestinationRaw=>committed!=null?committedRaw:rejectedRaw;
        public bool TryExportBackup(out byte[] document,out string error)
        {
            document=null;error=null;
            if(committed==null || committedRaw==null)
            {error="No confirmed gameplay save is available to export.";return false;}
            try
            {
                // A pending purchase, research transition or restore is never
                // substituted for the last readback-confirmed gameplay save.
                document=LastStandBackupCodec.Encode(committedRaw);return true;
            }
            catch(ArgumentException){error="The confirmed save cannot be exported as a supported backup.";return false;}
            catch(FormatException){error="The confirmed save is too large for a portable backup.";return false;}
        }
        public bool TryPreviewBackup(byte[] document,out LastStandBackupPreview preview,out string error)
        {
            preview=null;error=null;
            if(!LastStandBackupCodec.TryDecode(document,out string raw))
            {error="Choose a supported Last Stand backup, no larger than 128 KiB.";return false;}
            return PreviewRawBackup(raw,false,out preview,out error);
        }
        bool PreviewRawBackup(string raw,bool previous,out LastStandBackupPreview preview,out string error)
        {
            preview=null;error=null;
            if(!Ready && !CanRepairDamagedSave)
            {error="Resolve the current save problem before restoring a backup. The current save is preserved.";return false;}
            if(!RestoreBackupAvailable)
            {error="This platform cannot preserve the current save before replacement.";return false;}
            if(!TryParseSave(raw,out var imported,out _))
            {error="This backup is damaged or uses unsupported save or run rules. Nothing was changed.";return false;}
            preview=new LastStandBackupPreview(this,RestoreDestinationRaw,Revision,raw,imported.SelectedTier,
                imported.Checkpoint?.CompletedWave??0,imported.Wallet,imported.Checkpoint!=null,previous,
                CanRepairDamagedSave,imported.Levels,imported.Research?.Snapshot());
            return true;
        }
        public bool TryPreviewPreviousBackup(out LastStandBackupPreview preview,out string error)
        {
            preview=null;error=null;
            if(!(storage is ILastStandRestoreBackupStorage backups))
            {error="This platform has no previous-restore backup.";return false;}
            try
            {
                string previous=backups.ReadRestoreBackup();
                if(previous==null){error="There is no previous-restore backup on this device.";return false;}
                return PreviewRawBackup(previous,true,out preview,out error);
            }
            catch(Exception){error="The previous-restore backup could not be read. Nothing was changed.";return false;}
        }
        public bool TryRestoreBackup(LastStandBackupPreview preview,out string error)
        {
            error=null;
            if((!Ready && !CanRepairDamagedSave) || preview==null || preview.Owner!=this || preview.DestinationRevision!=Revision ||
                preview.DestinationRaw!=RestoreDestinationRaw || RestoreGeneration==long.MaxValue)
            {error="This restore preview is no longer current. Review the backup again.";return false;}
            if(!(storage is ILastStandRestoreBackupStorage backups))
            {error="This platform cannot preserve the current save before replacement.";return false;}
            if(!TryParseSave(preview.ImportedRaw,out var imported,out bool migrate))
            {error="This backup is no longer supported. Nothing was changed.";return false;}
            if(!OwnsStorage()){error=SaveError;return false;}
            try
            {
                if(storage.Read()!=preview.DestinationRaw)
                {
                    Block("The saved record changed after the restore preview. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);
                    error=SaveError;return false;
                }
                // Retain a separate, verified predecessor before replacing the
                // live key. Normal gameplay saves never rotate this backup.
                backups.WriteRestoreBackup(preview.DestinationRaw);
                if(backups.ReadRestoreBackup()!=preview.DestinationRaw)
                {error="The safety backup was not confirmed. Your current save was not replaced.";return false;}
                if(!OwnsStorage()){error=SaveError;return false;}
                if(storage.Read()!=preview.DestinationRaw)
                {
                    Block("The saved record changed while preparing the restore. Reload after resolving the conflict.",LastStandSaveHealth.Conflict);
                    error=SaveError;return false;
                }
            }
            catch(Exception)
            {error="The safety backup could not be confirmed. Your current save was not replaced.";return false;}
            var next=imported.Copy();
            if(migrate)
            {
                InitializeTiers(next,false);Array.Resize(ref next.Levels,LastStandUpgradeCatalog.Tracks.Count);
                if(next.Research==null)InitializeResearch(next);
            }
            ReconcileUnlocks(next);
            restoreDestinationRaw=preview.DestinationRaw;
            RestorePending=true;
            bool confirmed=Commit(next,()=>{RestorePending=false;RestoreGeneration++;LastReceipt=null;rejectedRaw=null;restoreDestinationRaw=null;});
            if(!confirmed)
            {
                if(candidate==null){RestorePending=false;restoreDestinationRaw=null;}
                error=RestorePending?"The restore is awaiting save confirmation. Retry before taking another action.":SaveError;
            }
            return confirmed;
        }
        static bool IsFutureSave(string raw)
        {
            try
            {
                var map=LastStandSaveJson.Read(raw);
                return map.ContainsKey("version")&&LastStandSaveJson.LongInteger(map["version"])>6;
            }
            catch(Exception){return false;}
        }
        static bool CanPreserveRejectedSave(string raw)
        {
            if(raw==null || raw.Length>LastStandSaveJson.MaximumLength)return false;
            try{return new UTF8Encoding(false,true).GetByteCount(raw)<=LastStandBackupCodec.MaximumBytes;}
            catch(EncoderFallbackException){return false;}
        }
    }
}

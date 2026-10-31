using System;
using System.IO;
using System.Text;
using SingedTerra.LastStand;

static class BackupChecks
{
    const long Epoch=1790000000000L;
    sealed class Store : ILastStandStorage, ILastStandStorageOwnership, ILastStandRestoreBackupStorage, ILastStandStorageRecoveryDiagnostics
    {
        public string Raw, Previous, ChangeAfterBackup;
        public bool Owner=true, FailWrite, FailRead, FailReadback, FailPrevious, WrongPrevious, FailOwnership;
        public int Writes, BackupWrites, Reads;
        bool readback;
        public bool CanWrite{get{if(FailOwnership)throw new IOException("ownership unavailable");return Owner;}}
        public bool RecoveredPreviousRecord {get;set;}
        public string Read(){Reads++;if(FailRead||readback){readback=false;throw new IOException("test failure");}return Raw;}
        public void Write(string value){if(FailWrite)throw new IOException("test write");Raw=value;Writes++;readback=FailReadback;FailReadback=false;}
        public string ReadRestoreBackup()=>WrongPrevious?"invalid predecessor":Previous;
        public void WriteRestoreBackup(string raw){if(FailPrevious)throw new IOException("test predecessor");Previous=raw;BackupWrites++;if(ChangeAfterBackup!=null)Raw=ChangeAfterBackup;}
    }
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static LastStandProgression Load(Store store)=>LastStandProgression.Load(store,()=>Epoch);
    static byte[] Export(LastStandProgression profile)
    { Need(profile.TryExportBackup(out byte[] bytes,out string error),"export confirmed profile: "+error);return bytes; }
    static LastStandBackupPreview Preview(LastStandProgression profile,byte[] bytes)
    { Need(profile.TryPreviewBackup(bytes,out var preview,out string error),"preview: "+error);return preview; }
    static byte[] Document(string raw)=>new UTF8Encoding(false,true).GetBytes(LastStandBackupCodec.Header+raw);
    static string WithoutRevision(string raw)
    { var map=LastStandSaveJson.Read(raw);map.Remove("revision");return LastStandSaveJson.Write(map); }
    static void EqualProfile(string left,string right)=>Need(WithoutRevision(left)==WithoutRevision(right),"all gameplay fields except destination revision must survive");
    static Store Source(string fixture)=>new Store {Raw=File.ReadAllText(fixture)};
    static void RoundTrip(string fixture)
    {
        var src=Source(fixture);var source=Load(src);var dst=new Store();var target=Load(dst);
        string original=dst.Raw,expected=src.Raw;var preview=Preview(target,Export(source));
        Need(preview.HasCheckpoint&&preview.CompletedWave==30&&preview.Tier==1&&preview.Salvage==source.Wallet,"real retained checkpoint preview");
        Need(target.TryRestoreBackup(preview,out string error),"restore: "+error);
        EqualProfile(expected,dst.Raw);Need(dst.Previous==original,"confirmed predecessor retained");
        Need(target.Checkpoint.Edition.ContentVersion==source.Checkpoint.Edition.ContentVersion,"retain run edition");
        Need(target.RestoreGeneration==1&&!target.RestorePending,"one confirmation");
    }
    static void PreviewOnly(string fixture)
    {
        var retainedTarget=Load(new Store());
        var retained=Preview(retainedTarget,Document(File.ReadAllText(fixture)));
        Need(retained.PermanentLevels.Count==LastStandUpgradeCatalog.Tracks.Count,"raw retained preview projects all current tracks");
        foreach(var track in LastStandUpgradeCatalog.Tracks)
            Need(retained.PermanentLevels[(int)track.Id]>=0,"every comparison row is available before migration");
        var source=Load(Source(fixture));var dst=new Store();var target=Load(dst);int writes=dst.Writes,reads=dst.Reads;
        string raw=dst.Raw;var preview=Preview(target,Export(source));
        Need(dst.Raw==raw&&dst.Writes==writes&&dst.BackupWrites==0&&dst.Reads==reads,"preview never reads/writes destination");
        var other=Load(new Store());Need(!other.TryRestoreBackup(preview,out _),"foreign owner cannot reuse preview");
        var snapshot=preview.Research;snapshot.completedRanks[0]=999;
        Need(preview.Research.completedRanks[0]!=999,"summary does not expose mutable candidate");
    }
    static void Invalid(string fixture)
    {
        var src=Source(fixture);var source=Load(src);byte[] valid=Export(source);
        var dst=new Store();var target=Load(dst);string original=dst.Raw;int writes=dst.Writes;
        var map=LastStandSaveJson.Read(src.Raw);map["version"]=99;
        var extra=LastStandSaveJson.Read(src.Raw);extra["account"]="not gameplay data";
        byte[][] bad={new byte[LastStandBackupCodec.MaximumBytes+1],new byte[]{0xff,0xfe},
            Encoding.UTF8.GetBytes("\ufeff"+Encoding.UTF8.GetString(valid)),
            Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(valid).Replace("BACKUP 1\n","BACKUP 2\n")),
            Document("{\"version\":6,\"version\":6}"),Document(LastStandSaveJson.Write(map)),Document(LastStandSaveJson.Write(extra)),
            Document(src.Raw.Substring(0,src.Raw.Length-1)),Document(src.Raw+"junk")};
        foreach(byte[] bytes in bad){Need(!target.TryPreviewBackup(bytes,out _,out _),"reject invalid bytes");Need(dst.Raw==original&&dst.Writes==writes&&dst.BackupWrites==0,"invalid preview is nonmutating");}
    }
    static void Conflict(string fixture)
    {
        var dst=new Store();var target=Load(dst);var preview=Preview(target,Export(Load(Source(fixture))));
        var map=LastStandSaveJson.Read(dst.Raw);map["revision"]=42L;dst.Raw=LastStandSaveJson.Write(map);string changed=dst.Raw;int writes=dst.Writes;
        Need(!target.TryRestoreBackup(preview,out _),"stale raw destination rejected");
        Need(dst.Raw==changed&&dst.Writes==writes&&dst.BackupWrites==0&&!target.RestorePending,"conflict preserves both records");
        Need(target.SaveHealth==LastStandSaveHealth.Conflict,"typed conflict reason");
        var late=new Store();var lateTarget=Load(late);var latePreview=Preview(lateTarget,Export(Load(Source(fixture))));
        late.ChangeAfterBackup=changed;int before=late.Writes;
        Need(!lateTarget.TryRestoreBackup(latePreview,out _)&&late.Raw==changed&&late.Writes==before,"change during predecessor preparation still refuses live replacement");
    }
    static void Ownership(string fixture)
    {
        foreach(bool failure in new[]{false,true}){
            var dst=new Store();var target=Load(dst);var preview=Preview(target,Export(Load(Source(fixture))));int writes=dst.Writes;
            dst.Owner=false;dst.FailOwnership=failure;
            Need(!target.TryRestoreBackup(preview,out _),"ownership loss rejected");Need(dst.Writes==writes&&dst.BackupWrites==0,"no writes after ownership loss");
            Need(target.SaveHealth==(failure?LastStandSaveHealth.ReadUnavailable:LastStandSaveHealth.Ownership),"typed ownership reason");
        }
    }
    static void Predecessor(string fixture)
    {
        foreach(bool wrong in new[]{false,true}){
            var dst=new Store();var target=Load(dst);var preview=Preview(target,Export(Load(Source(fixture))));string original=dst.Raw;int writes=dst.Writes;
            dst.FailPrevious=!wrong;dst.WrongPrevious=wrong;
            Need(!target.TryRestoreBackup(preview,out _),"must confirm predecessor first");
            Need(dst.Raw==original&&dst.Writes==writes&&!target.RestorePending,"live save untouched by predecessor failure");
        }
    }
    static void Ambiguous(string fixture,bool before)
    {
        var src=Source(fixture);var source=Load(src);var dst=new Store();var target=Load(dst);
        string original=dst.Raw;var preview=Preview(target,Export(source));dst.FailWrite=before;dst.FailReadback=!before;
        Need(!target.TryRestoreBackup(preview,out _),"unconfirmed restore remains pending");
        Need(target.RestorePending&&target.RestoreGeneration==0&&target.SaveState=="retry","no confirmation before readback");
        Need(Encoding.UTF8.GetString(Export(target))==LastStandBackupCodec.Header+original,"export committed record during uncertain write");
        Need(!target.TryPreviewBackup(Export(source),out _,out _),"no second preview while pending");
        dst.FailWrite=false;Need(target.Retry(),"retry same candidate");EqualProfile(src.Raw,dst.Raw);
        Need(target.RestoreGeneration==1&&!target.RestorePending&&dst.Previous==original,"confirmed once with predecessor");
        int writes=dst.Writes;Need(target.Retry()&&target.RestoreGeneration==1&&dst.Writes==writes,"retry cannot duplicate restore");
    }
    static void Previous(string fixture,bool restart)
    {
        var dst=new Store();var target=Load(dst);string original=dst.Raw;var preview=Preview(target,Export(Load(Source(fixture))));
        Need(target.TryRestoreBackup(preview,out _),"first restore");string imported=dst.Raw;
        if(restart){target=Load(dst);EqualProfile(imported,dst.Raw);Need(!target.RestorePending,"restart loads confirmed record");}
        Need(target.TryPreviewPreviousBackup(out var previous,out _)&&previous.IsPreviousBackup,"explicit previous preview");
        Need(dst.Raw==imported,"previous preview does not restore");Need(target.TryRestoreBackup(previous,out _),"confirmed previous restore");
        EqualProfile(original,dst.Raw);Need(dst.Previous==imported,"previous save rotates only at explicit restore");
    }
    static void Research(string fixture)
    {
        var src=Source(fixture);var source=Load(src);var clock=new LastStandResearchClock(source.ResearchSnapshot.lastObservedUtcMilliseconds);
        Need(clock.TrySample(Epoch,0,out var time),"sample");var snapshot=source.ResearchSnapshot;
        Need(source.TryResearchAction(new LastStandResearchIntent {Action=LastStandResearchAction.Start,Slot=0,
            Track=LastStandResearchTrackId.GameSpeed,Rank=1,ExpectedRevision=snapshot.revision},time),"start funded research");
        long duration=source.ResearchSnapshot.slots[0].active.durationMilliseconds;int paidWallet=source.Wallet;
        var dst=new Store();var target=Load(dst);Need(target.TryRestoreBackup(Preview(target,Export(source)),out _),"restore research");
        Need(target.Wallet==paidWallet&&target.ResearchSnapshot.slots[0].active.earnedMilliseconds==source.ResearchSnapshot.slots[0].active.earnedMilliseconds,"funding/time retained");
        var resumedClock=new LastStandResearchClock(target.ResearchSnapshot.lastObservedUtcMilliseconds);
        Need(resumedClock.TrySample(Epoch+duration+1,0,out var elapsed),"offline sample");
        Need(target.TryReconcileResearch(elapsed)&&resumedClock.Commit(elapsed),"ordinary research owner confirms");
        Need(target.ResearchRank(LastStandResearchTrackId.GameSpeed)==1&&target.Wallet==paidWallet,"one completion no duplicate charge");
        var restarted=Load(dst);var nextClock=new LastStandResearchClock(restarted.ResearchSnapshot.lastObservedUtcMilliseconds);
        Need(nextClock.TrySample(Epoch+duration+1,0,out var same)&&restarted.TryReconcileResearch(same),"same instant after restart");
        Need(restarted.ResearchRank(LastStandResearchTrackId.GameSpeed)==1&&restarted.ResearchSnapshot.completionSequence==1,"completion exactly once");
    }
    static void Health(string fixture)
    {
        var valid=Source(fixture);Load(valid);var map=LastStandSaveJson.Read(valid.Raw);map["version"]=99;
        var future=new Store {Raw=LastStandSaveJson.Write(map)};var profile=Load(future);
        Need(profile.SaveHealth==LastStandSaveHealth.UnsupportedVersion&&future.Writes==0,"future save preserved");
        Need(!profile.TryPreviewBackup(Document(valid.Raw),out _,out _),"cannot bypass unsupported destination");
        var invalid=new Store {Raw="broken"};Need(Load(invalid).SaveHealth==LastStandSaveHealth.InvalidData&&invalid.Writes==0,"damaged save preserved");
        var unreadable=new Store {FailRead=true};Need(Load(unreadable).SaveHealth==LastStandSaveHealth.ReadUnavailable&&unreadable.Writes==0,"read failure preserved");
        var recovered=new Store {Raw=valid.Raw,RecoveredPreviousRecord=true};var loaded=Load(recovered);
        Need(loaded.SaveHealth==LastStandSaveHealth.Ready&&loaded.RecoveredPreviousRecord,"native fallback disclosed");
    }
    static void Retention(string fixture)
    {
        var dst=new Store();var target=Load(dst);Need(target.TryRestoreBackup(Preview(target,Export(Load(Source(fixture)))),out _),"restore");
        string previous=dst.Previous;
        Need(target.TryPurchasePermanent(LastStandUpgradeTrackId.CannonAttack,LastStandBulkQuantity.One,target.Revision),"ordinary real purchase");
        Need(dst.Previous==previous,"ordinary save does not overwrite predecessor");
    }
    static void Repair(string fixture,bool uncertain)
    {
        var source=Load(Source(fixture));var dst=new Store {Raw="{broken gameplay save"};var target=Load(dst);
        string damaged=dst.Raw;Need(!target.HasConfirmedSave,"damaged save has no known totals");
        var preview=Preview(target,Export(source));Need(dst.Raw==damaged&&dst.Writes==0&&dst.BackupWrites==0,"repair preview is nonmutating");
        dst.FailReadback=uncertain;bool restored=target.TryRestoreBackup(preview,out _);
        if(uncertain){Need(!restored&&target.RestorePending&&!target.HasConfirmedSave,"uncertain repair stays pending");Need(target.Retry(),"retry against exact damaged predecessor or candidate");}
        else Need(restored,"explicit repair succeeds");
        Need(target.HasConfirmedSave&&target.RestoreGeneration==1&&dst.Previous==damaged,"repair confirms once and preserves exact rejected bytes");
        Need(!target.TryPreviewPreviousBackup(out _,out _),"corrupt predecessor is never promoted as valid backup");
        Need(target.Checkpoint.CompletedWave==source.Checkpoint.CompletedWave,"repair restores saved checkpoint");
    }
    static void RepairConflict(string fixture)
    {
        byte[] source=Export(Load(Source(fixture)));var dst=new Store {Raw="broken"};var target=Load(dst);
        var preview=Preview(target,source);dst.Raw="different broken record";
        Need(!target.TryRestoreBackup(preview,out _)&&dst.Writes==0&&dst.BackupWrites==0,"stale damaged destination is preserved");
        foreach(string bad in new[]{new string('x',65537),"\ud800"}){
            var bounded=new Store {Raw=bad};var profile=Load(bounded);
            Need(!profile.TryPreviewBackup(source,out _,out _)&&bounded.Writes==0,"unbounded or invalid-Unicode destination cannot be replaced");
        }
    }
    public static void Main(string[] args)
    {
        switch(args[0]){
            case "roundtrip":RoundTrip(args[1]);break;case "preview":PreviewOnly(args[1]);break;
            case "invalid":Invalid(args[1]);break;case "conflict":Conflict(args[1]);break;
            case "ownership":Ownership(args[1]);break;case "predecessor":Predecessor(args[1]);break;
            case "ambiguous":Ambiguous(args[1],false);break;case "retry":Ambiguous(args[1],true);break;
            case "previous":Previous(args[1],false);break;case "restart":Previous(args[1],true);break;
            case "research":Research(args[1]);break;case "health":Health(args[1]);break;
            case "retention":Retention(args[1]);break;case "repair":Repair(args[1],false);break;
            case "repair_retry":Repair(args[1],true);break;case "repair_conflict":RepairConflict(args[1]);break;default:throw new Exception("unknown case");
        }
        Console.WriteLine("PASS "+args[0]);
    }
}

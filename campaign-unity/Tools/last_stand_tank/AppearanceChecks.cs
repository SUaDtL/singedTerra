using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using SingedTerra.LastStand;

static class AppearanceChecks
{
    const long Epoch=1790000000000L;
    sealed class Store : ILastStandStorage, ILastStandStorageOwnership, ILastStandRestoreBackupStorage
    {
        public string Raw, Previous;
        public bool Owner=true, FailWrite, FailRead, FailReadback;
        public int Writes;
        bool readback;
        public bool CanWrite=>Owner;
        public string Read(){if(FailRead||readback){readback=false;throw new IOException("test read");}return Raw;}
        public void Write(string value){if(FailWrite)throw new IOException("test write");Raw=value;Writes++;readback=FailReadback;FailReadback=false;}
        public string ReadRestoreBackup()=>Previous;
        public void WriteRestoreBackup(string value){Previous=value;}
    }
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static void Throws(Action action){try{action();}catch(ArgumentException){return;}throw new Exception("expected invalid argument");}
    static LastStandProgression Load(Store store)=>LastStandProgression.Load(store,()=>Epoch);
    static LastStandTankAppearance Mixed=>LastStandTankAppearance.Default.WithPart(LastStandTankPartSlot.Treads,"ranger")
        .WithPart(LastStandTankPartSlot.Turret,"bulwark").WithPart(LastStandTankPartSlot.Barrel,"jackal").WithPaint("purple");
    static string Retained(string tools)=>File.ReadAllText(Path.Combine(tools,"last_stand_architecture/fixtures/profile-v5-wave30.json"));
    static string Gameplay(string raw)
    {var map=LastStandSaveJson.Read(raw);map.Remove("revision");map.Remove("appearance");map.Remove("version");return LastStandSaveJson.Write(map);}
    static byte[] Document(string raw)=>Encoding.UTF8.GetBytes(LastStandBackupCodec.Header+raw);
    static byte[] Export(LastStandProgression p){Need(p.TryExportBackup(out var bytes,out _),"export");return bytes;}
    static void Catalog()
    {
        string[] kits={"foundry","ranger","bulwark","jackal"};
        string[] paints={"red","blue","green","yellow","purple"};
        string[] hex={"#e84d4d","#4d8ce8","#4de87a","#e8c84d","#a855f7"};
        Need(LastStandTankAppearanceCatalog.Kits.Count==4&&LastStandTankAppearanceCatalog.Slots.Count==4,"four independent slots/families");
        Need(LastStandTankAppearanceCatalog.Paints.Count==5,"five paints");
        for(int i=0;i<4;i++)Need(LastStandTankAppearanceCatalog.Kits[i].Id==kits[i],"stable legacy family order");
        for(int i=0;i<5;i++)Need(LastStandTankAppearanceCatalog.Paints[i].Id==paints[i]&&LastStandTankAppearanceCatalog.GetPaint(paints[i]).Hex==hex[i],"exact legacy paint");
        int count=0;
        foreach(string a in kits)foreach(string b in kits)foreach(string c in kits)foreach(string d in kits){
            Need(LastStandTankAppearance.TryCreate(a,b,c,d,"red",out var value),"every free composition");
            Need(value.Treads==a&&value.Hull==b&&value.Turret==c&&value.Barrel==d,"independent parts");count++;
        }
        Need(count==256&&LastStandTankAppearanceCatalog.SlotLabel(LastStandTankPartSlot.Treads)=="Mobility","all combinations and legacy mobility label");
        Need(LastStandTankAppearanceCatalog.PartLabel(LastStandTankPartSlot.Treads,"ranger")=="Spider Legs","legacy variant names");
    }
    static void Value()
    {
        var original=LastStandTankAppearance.Default;var next=Mixed;
        Need(original.Treads=="foundry"&&original.Paint=="red"&&!original.Equals(next),"draft never mutates default");
        Need(next.WithPreset("jackal").Paint=="purple"&&next.WithPreset("jackal").Hull=="jackal","preset preserves selected paint");
        Need(next.Equals(Mixed)&&next.GetHashCode()==Mixed.GetHashCode(),"value equality");
        foreach(string invalid in new[]{null,"","Foundry","foundry ","../ranger","unowned"}){
            Need(!LastStandTankAppearance.TryCreate(invalid,"foundry","foundry","foundry","red",out _),"strict part ID");
            Throws(()=>original.WithPart(LastStandTankPartSlot.Hull,invalid));
        }
        Need(!LastStandTankAppearance.TryCreate("foundry","foundry","foundry","foundry","#e84d4d",out _),"paint uses stable ID");
        Throws(()=>original.WithPaint("RED"));Throws(()=>original.WithPart((LastStandTankPartSlot)99,"foundry"));
        Throws(()=>original.Part((LastStandTankPartSlot)99));
    }
    static void Restart()
    {
        var s=new Store();var p=Load(s);Need(p.Appearance.Equals(LastStandTankAppearance.Default),"fresh default");
        Need(p.TryApplyAppearance(Mixed,p.Revision),"apply");Need(Load(s).Appearance.Equals(Mixed),"reload confirmed value");
        Need(LastStandSaveJson.Integer(LastStandSaveJson.Read(s.Raw)["version"])==7,"new profile edition");
    }
    static void Legacy(string tools)
    {
        string v1="{\"version\":1,\"credits\":4,\"permanentLevel\":1,\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";
        foreach(string raw in new[]{v1,File.ReadAllText(Path.Combine(tools,"last_stand_research/fixtures/legacy-v4.json")),Retained(tools)}){
            var s=new Store{Raw=raw};var p=Load(s);Need(p.SaveState=="ready"&&p.Appearance.Equals(LastStandTankAppearance.Default),"old profile migrated to default");
            string before=Gameplay(s.Raw);var checkpoint=p.Checkpoint;
            Need(p.TryApplyAppearance(Mixed,p.Revision),"old gameplay remains writable");
            Need(Gameplay(s.Raw)==before&&ReferenceEquals(checkpoint,p.Checkpoint),"old gameplay and retained checkpoint edition preserved");
        }
    }
    static void V6(string tools)
    {
        var s=new Store{Raw=Retained(tools)};Load(s);var map=LastStandSaveJson.Read(s.Raw);map.Remove("appearance");map["version"]=6;
        s.Raw=LastStandSaveJson.Write(map);string before=Gameplay(s.Raw);long revision=LastStandSaveJson.LongInteger(map["revision"]);
        var p=Load(s);Need(p.SaveState=="ready"&&p.Appearance.Equals(LastStandTankAppearance.Default),"v6 gets default");
        Need(Gameplay(s.Raw)==before&&p.Revision==revision+1,"only schema appearance and committed revision change");
    }
    static void Invalid()
    {
        var seed=new Store();Load(seed);
        foreach(string kind in new[]{"missing","extra","unknown","type","null","missingpart","version6extra"}){
            var map=LastStandSaveJson.Read(seed.Raw);var a=LastStandSaveJson.Object(map["appearance"]);
            switch(kind){case "missing":map.Remove("appearance");break;case "extra":a["stats"]=1;break;
                case "unknown":a["hull"]="unowned";break;case "type":a["paint"]=3;break;case "null":map["appearance"]=null;break;
                case "missingpart":a.Remove("barrel");break;case "version6extra":map["version"]=6;break;}
            string raw=LastStandSaveJson.Write(map);var s=new Store{Raw=raw};var p=Load(s);
            Need(p.SaveState!="ready"&&p.SaveHealth==LastStandSaveHealth.InvalidData&&s.Raw==raw&&s.Writes==0,"invalid metadata preserves original bytes: "+kind);
        }
    }
    static void Future()
    {
        var s=new Store();Load(s);var map=LastStandSaveJson.Read(s.Raw);map["version"]=8;s.Raw=LastStandSaveJson.Write(map);int writes=s.Writes;
        var p=Load(s);Need(p.SaveState!="ready"&&p.SaveHealth==LastStandSaveHealth.UnsupportedVersion&&!p.CanPreviewBackup&&s.Writes==writes,"future schema is never repaired/overwritten");
    }
    static void GameplayOnly(string tools)
    {
        var s=new Store{Raw=Retained(tools)};var p=Load(s);string before=Gameplay(s.Raw);var checkpoint=p.Checkpoint;
        Need(p.TryApplyAppearance(Mixed,p.Revision),"apply while resumable checkpoint exists");
        Need(Gameplay(s.Raw)==before&&ReferenceEquals(checkpoint,p.Checkpoint),"all combat research wallet reward and history fields remain exact");
    }
    static void Backup()
    {
        var a=new Store();var source=Load(a);Need(source.TryApplyAppearance(Mixed,source.Revision),"source appearance");
        var b=new Store();var target=Load(b);string prior=b.Raw;Need(target.TryPreviewBackup(Export(source),out var preview,out _),"preview");
        Need(preview.Appearance.Equals(Mixed)&&target.Appearance.Equals(LastStandTankAppearance.Default)&&b.Raw==prior,"read-only imported appearance");
        Need(target.TryRestoreBackup(preview,out _)&&target.Appearance.Equals(Mixed)&&b.Previous==prior,"confirmed restore metadata");
        Need(target.TryPreviewPreviousBackup(out var previous,out _)&&previous.Appearance.Equals(LastStandTankAppearance.Default),"predecessor preview metadata");
    }
    static void OldBackup(string tools)
    {
        string raw=Retained(tools);var s=new Store();var p=Load(s);Need(p.TryApplyAppearance(Mixed,p.Revision),"existing cosmetics");
        string before=s.Raw;Need(p.TryPreviewBackup(Document(raw),out var preview,out _)&&preview.Appearance.Equals(LastStandTankAppearance.Default),"old preview default");
        Need(preview.ImportedRaw==raw&&s.Raw==before,"preview does not rewrite source or destination");
        Need(p.TryRestoreBackup(preview,out _)&&p.Appearance.Equals(LastStandTankAppearance.Default)&&p.Checkpoint.CompletedWave==30,"old backup explicit restore defaults");
    }
    static void Retry(bool ambiguous)
    {
        var s=new Store();var p=Load(s);string confirmed=s.Raw;long revision=p.Revision;int writes=s.Writes;
        s.FailWrite=!ambiguous;s.FailReadback=ambiguous;
        Need(!p.TryApplyAppearance(Mixed,revision)&&p.SaveState!="ready"&&p.Appearance.Equals(LastStandTankAppearance.Default),"uncertain apply does not expose candidate");
        Need(Encoding.UTF8.GetString(Export(p))==LastStandBackupCodec.Header+confirmed,"backup exports confirmed appearance");
        Need(!p.TryApplyAppearance(Mixed,revision),"pending candidate blocks second command");s.FailWrite=false;
        Need(p.Retry()&&p.Appearance.Equals(Mixed)&&p.Revision==revision+1&&s.Writes==writes+1,"same candidate confirmed once");
    }
    static void Revision()
    {
        var s=new Store();var p=Load(s);long previous=p.Revision;
        Need(p.TrySelectFitting("launcher"),"other profile transaction");string raw=s.Raw;
        Need(!p.TryApplyAppearance(Mixed,previous)&&s.Raw==raw&&p.SelectedFitting=="launcher","stale action preserves current state");
        Need(p.TryApplyAppearance(Mixed,p.Revision)&&p.SelectedFitting=="launcher","fresh action clones latest profile");
    }
    static void Ownership()
    {
        var s=new Store();var p=Load(s);int writes=s.Writes;s.Owner=false;
        Need(!p.TryApplyAppearance(Mixed,p.Revision)&&s.Writes==writes&&p.SaveHealth==LastStandSaveHealth.Ownership,"lost owner refuses");
        var q=new Store();var current=Load(q);q.Raw=q.Raw+" ";string external=q.Raw;writes=q.Writes;
        Need(!current.TryApplyAppearance(Mixed,current.Revision)&&q.Raw==external&&q.Writes==writes&&current.SaveHealth==LastStandSaveHealth.Conflict,"raw compare not merely revision");
    }
    static void Noop()
    {
        var s=new Store();var p=Load(s);int writes=s.Writes;long revision=p.Revision;
        Need(p.TryApplyAppearance(p.Appearance,revision)&&s.Writes==writes&&p.Revision==revision,"unchanged draft has no save");
        s.Raw+=" ";Need(!p.TryApplyAppearance(p.Appearance,revision)&&p.SaveHealth==LastStandSaveHealth.Conflict&&s.Writes==writes,"no-op still checks raw ownership basis");
    }
    static void ReadFailure()
    {
        var s=new Store();var p=Load(s);int writes=s.Writes;string raw=s.Raw;s.FailRead=true;
        Need(!p.TryApplyAppearance(Mixed,p.Revision)&&s.Writes==writes&&s.Raw==raw&&p.Appearance.Equals(LastStandTankAppearance.Default),"read failure preserves confirmed state");
        s.FailRead=false;Need(p.Retry()&&p.Appearance.Equals(Mixed),"pending save can be explicitly reconciled");
    }
    public static int Main(string[] args)
    {
        try{
            switch(args[0]){case "catalog":Catalog();break;case "value":Value();break;case "restart":Restart();break;
                case "legacy":Legacy(args[1]);break;case "v6":V6(args[1]);break;case "invalid":Invalid();break;case "future":Future();break;
                case "gameplay":GameplayOnly(args[1]);break;case "backup":Backup();break;case "oldbackup":OldBackup(args[1]);break;
                case "retry":Retry(false);break;case "ambiguous":Retry(true);break;case "revision":Revision();break;
                case "ownership":Ownership();break;case "noop":Noop();break;case "read":ReadFailure();break;default:throw new Exception("unknown case");}
            Console.WriteLine("PASS "+args[0]);return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

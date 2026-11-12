using System;
using System.Collections.Generic;
using System.IO;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public static string SkillFixture(string raw,int bestWave,int intel,int copies=0)
        {
            if(!TryParseSave(raw,out var row,out _))throw new Exception("fixture parse");
            row.Tiers["tier-1"].BestWave=bestWave;
            foreach(var milestone in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)))
                if(milestone.Wave<=bestWave)row.FirstClears.Add(milestone.Id);
            ReconcileUnlocks(row);row.SkillIntel=intel;
            foreach(var skill in LastStandSkillCatalog.All)if(bestWave>=skill.UnlockWave)row.SkillCopies[(int)skill.Id]=copies;
            return Serialize(row);
        }
        public static string SkillWaveFixture(string raw,int wave)
        {
            if(!TryParseSave(raw,out var row,out _))throw new Exception("wave fixture parse");
            foreach(var track in LastStandUpgradeCatalog.Tracks)if(track.Available)row.Levels[(int)track.Id]=track.PermanentCap;
            int run=row.NextRunId;
            row.Checkpoint=LastStandRunCheckpoint.Start(run,1,"repair",row.Levels,LastStandRunEdition.Current);
            row.NextRunId++;row.History.Begin(run,1,row.Checkpoint.Loadout.ToString(),row.Checkpoint.Shop.EconomyVersion,ResearchContext(row));
            var model=row.Checkpoint.RestoreModel();var shop=row.Checkpoint.RestoreShop();
            for(int n=1;n<wave;n++){
                CompleteFixture(model,shop);var reward=LastStandRewardCatalog.At(model.Profile.TierDefinition,n,model.Profile.Edition);
                if(!row.History.BankWave(n,reward.RepeatableSalvage,reward.FirstClearSalvage,0,ResearchContext(row,shop.CaptureCheckpoint())))throw new Exception("fixture bank");
                row.Checkpoint=new LastStandRunCheckpoint(run,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
                model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
            }
            return Serialize(row);
        }
        static void CompleteFixture(EncounterModel model,LastStandShopState shop)
        {int budget=100000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}if(!model.AwaitingWaveCommit||model.Hull==0)throw new Exception("fixture clear");}
        public static string RetainedSkillFixture(string raw)
        {
            if(!TryParseSave(raw,out var row,out _))throw new Exception("retained fixture parse");
            row.Checkpoint=LastStandRunCheckpoint.Start(1,1,"repair",row.Levels,LastStandRunEdition.Buildcraft);row.NextRunId=2;
            row.History.Begin(1,1,row.Checkpoint.Loadout.ToString(),row.Checkpoint.Shop.EconomyVersion,ResearchContext(row));
            var data=LastStandSaveJson.Read(Serialize(row));data["version"]=8;data.Remove("skills");return LastStandSaveJson.Write(data);
        }
        public static string SkillReviewStrength(string raw,bool mature)
        {
            if(!TryParseSave(raw,out var row,out _)||row.Checkpoint!=null)throw new Exception("idle strength fixture");
            row.Wallet=12345;
            foreach(var track in LastStandUpgradeCatalog.Tracks)row.Levels[(int)track.Id]=track.Available?(mature?track.PermanentCap:Math.Min(track.PermanentCap,track.Id==LastStandUpgradeTrackId.CannonAttack?5:20)):0;
            if(!mature){
                var research=row.Research.Snapshot();research.completedRanks[(int)LastStandResearchTrackId.GameSpeed]=3;
                research.completedRanks[(int)LastStandResearchTrackId.SalvageRecovery]=2;
                research.completedRanks[(int)LastStandResearchTrackId.ResearchSpeed]=1;
                research.completedRanks[(int)LastStandResearchTrackId.ArmorPiercing]=1;
                research.completionSequence=7;research.nextProjectIdentity=8;research.revision++;
                if(!LastStandResearchState.TryRestore(research,out row.Research))throw new Exception("review research gift");
            }
            return Serialize(row);
        }
        public static string SkillCombatReviewStrength(string raw)
        {
            if(!TryParseSave(raw,out var row,out _)||row.Checkpoint!=null)throw new Exception("idle combat review fixture");
            // Explicit development-only workshop setup. Retain the existing
            // collection and milestones; never modify encounter state.
            foreach(var track in LastStandUpgradeCatalog.Tracks)row.Levels[(int)track.Id]=0;
            row.Levels[(int)LastStandUpgradeTrackId.HullCapacity]=40;
            return Serialize(row);
        }
    }
}

static class SkillProgressionChecks
{
    sealed class Store:ILastStandStorage,ILastStandStorageOwnership,ILastStandRestoreBackupStorage
    {
        public string Raw,Backup;public bool Fail,ReadOnly,FailRead,FailReadAfterWrite;public int Writes;
        public bool CanWrite=>!ReadOnly;
        public string Read(){if(FailRead)throw new IOException("planned read failure");return Raw;}
        public void Write(string value){if(Fail)throw new IOException("planned write failure");Raw=value;Writes++;if(FailReadAfterWrite)FailRead=true;}
        public string ReadRestoreBackup()=>Backup;
        public void WriteRestoreBackup(string value){Backup=value;}
    }
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static Store Fixture(int best=500,int intel=10,int copies=0)
    {var s=new Store();LastStandProgression.Load(s);s.Raw=LastStandProgression.SkillFixture(s.Raw,best,intel,copies);return s;}
    static void Complete(EncounterModel model,LastStandShopState shop)
    {int budget=100000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}Need(model.AwaitingWaveCommit&&model.Hull>0,"wave clear");}
    static void GenerateReview(string path)
    {
        var fresh=new Store();LastStandProgression.Load(fresh);
        var s=new Store{Raw=LastStandProgression.SkillReviewStrength(fresh.Raw,true)};var p=LastStandProgression.Load(s);
        Need(p.TryDeploy(),"review deployment");var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();string eligible=null;
        for(int wave=1;wave<=750;wave++){
            Complete(model,shop);Need(p.TryCommitWave(model,shop),"review durable wave "+wave);
            if(wave==25){var copy=new Store{Raw=s.Raw};var profile=LastStandProgression.Load(copy);Need(profile.TryFinalizeRun(null,"abandon"),"eligible setup finish");eligible=copy.Raw;}
            if(wave<750){Need(model.ContinueAfterCheckpoint(),"review next wave");shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);}
        }
        Need(p.TryFinalizeRun(null,"abandon"),"review simulation finalize");
        // The real draw transaction consumes the Intel earned by those cohorts.
        foreach(var id in new[]{LastStandSkillId.Overdrive,LastStandSkillId.EmergencyRepairs,LastStandSkillId.Minefield,LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining}){
            var pool=p.SkillDrawPool;int pick=-1;for(int n=0;n<pool.Count;n++)if(pool[n]==id)pick=n;
            Need(pick>=0&&p.TryDrawSkill(p.Revision,_=>pick),"review owned skill "+id);
        }
        s.Raw=LastStandProgression.SkillReviewStrength(s.Raw,false);p=LastStandProgression.Load(s);
        var hardware=new LastStandLoadout("launcher","repair");
        Need(p.TryApplyLoadoutPreset(0,"Active Push",hardware,new LastStandSkillLoadout(LastStandSkillId.Overdrive,LastStandSkillId.EmergencyRepairs,LastStandSkillId.Minefield),p.Revision),"review active preset");
        Need(p.TryApplyLoadoutPreset(1,"Passive Farm",hardware,new LastStandSkillLoadout(LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining),p.Revision),"review passive preset");
        Need(p.TryApplyLoadoutPreset(0),"review active selected");
        var check=LastStandProgression.Load(new Store{Raw=s.Raw});Need(check.SaveState=="ready"&&check.SkillSlotCount==3&&check.SkillIntel==3,"review profile reload");
        foreach(var skill in LastStandSkillCatalog.All)Need(check.SkillRank(skill.Id)==1,"review rank one "+skill.Key);
        var profiles=new Dictionary<string,object>{{"fresh",fresh.Raw},{"eligible",eligible},{"collection",s.Raw}};
        var doc=new Dictionary<string,object>{{"kind","isolated-skills-review-fixtures"},{"saveVersion",9},{"scope","Development fixtures, not earned-player balance proof. Gifted permanent levels clear 750 actual Tier 1 cohorts through production wave transactions; real Intel draws use explicit deterministic outcomes. Idle review profile resets workshop strength and grants small research ranks for inspection. Normal saves are never accessed."},{"simulatedClears",750},{"profiles",profiles}};
        string full=Path.GetFullPath(path);Directory.CreateDirectory(Path.GetDirectoryName(full));File.WriteAllText(full,LastStandSaveJson.Write(doc));
    }
    static void GenerateCombatReview(string input,string path)
    {
        string collection=File.ReadAllText(input);
        var s=new Store{Raw=LastStandProgression.SkillCombatReviewStrength(collection)};
        var p=LastStandProgression.Load(s);
        var skills=new LastStandSkillLoadout(LastStandSkillId.Overdrive,LastStandSkillId.Minefield,LastStandSkillId.EmergencyRepairs);
        Need(p.SaveState=="ready"&&p.SkillSlotCount==3,"combat review collection available");
        Need(p.TryApplyLoadoutPreset(2,"Combat review",new LastStandLoadout("repair"),skills,p.Revision),"combat review build applies");
        Need(p.TrySelectTier(2),"combat review Tier 2 selects");
        string prepared=s.Raw;
        Need(p.TryDeploy(),"combat review production deployment");
        var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();
        int maximum=model.CurrentMaximumHull,firstDamageTick=0,firstDamageHull=0;
        Need(model.Skills.Loadout.Equals(skills)&&model.Loadout.Equals(new LastStandLoadout("repair")),"captured actives with disclosed baseline repair fitting");
        Need(model.TryActivateSkill(LastStandSkillId.Overdrive),"combat review Overdrive accepted");
        Action step=()=>{
            Need(model.Status==EncounterStatus.Running&&model.Hull>0,"combat review survives natural simulation");
            model.Step();shop.ObserveAuthoritativeKills(model,0);
            if(model.AwaitingWaveCommit){Need(p.TryCommitWave(model,shop),"combat review durable wave");Need(model.ContinueAfterCheckpoint(),"combat review next wave");shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);}
        };
        while(model.Tick<60*EncounterModel.TicksPerSecond&&model.Hull==maximum)step();
        Need(model.Hull>0&&model.Hull<maximum,"natural incoming damage within sixty simulated seconds; tick="+model.Tick+" wave="+model.Wave+" hull="+model.Hull+" kills="+model.Kills);
        firstDamageTick=model.Tick;firstDamageHull=model.Hull;
        // Leave a real intervention window after the first hit; no enemy,
        // hull, clock or tick fields are assigned by this preflight.
        int delayedUntil=firstDamageTick+10*EncounterModel.TicksPerSecond;
        while(model.Tick<delayedUntil)step();
        int beforeRepair=model.Hull,repairTick=model.Tick;
        Need(model.CanActivateSkill(LastStandSkillId.EmergencyRepairs)&&model.TryActivateSkill(LastStandSkillId.EmergencyRepairs),"natural damaged-hull repair accepted after intervention window");
        int afterRepair=model.Hull;Need(afterRepair>beforeRepair,"accepted repair improves real hull");
        Need(model.TryActivateSkill(LastStandSkillId.Minefield),"combat review minefield accepted");
        int afterUseWave=p.Checkpoint.CompletedWave;
        while(model.Tick<120*EncounterModel.TicksPerSecond&&p.Checkpoint.CompletedWave<=afterUseWave)step();
        Need(p.Checkpoint.CompletedWave>afterUseWave&&model.Hull>0,"surviving completed checkpoint after actives");
        var restored=LastStandProgression.Load(new Store{Raw=s.Raw}).Checkpoint.RestoreModel();
        Need(restored.SkillUsed(LastStandSkillId.Overdrive)&&restored.SkillUsed(LastStandSkillId.EmergencyRepairs)&&restored.SkillUsed(LastStandSkillId.Minefield),"real checkpoint retains all spent actives");
        var preflight=new Dictionary<string,object>{{"mode","production-model-natural-damage"},{"tier",2},{"maximumHull",maximum},
            {"firstDamageTick",firstDamageTick},{"firstDamageSimulatedMilliseconds",firstDamageTick*50},{"firstDamageHull",firstDamageHull},
            {"interventionWindowSimulatedMilliseconds",10000},{"repairTick",repairTick},{"beforeRepairHull",beforeRepair},{"afterRepairHull",afterRepair},
            {"checkpointWave",p.Checkpoint.CompletedWave},{"checkpointTick",p.Checkpoint.Encounter.Tick},{"checkpointHull",restored.Hull},{"spentMask",7},
            {"cannonDamage",model.CurrentCannonDamage},{"fitting","repair"},{"baselineRepairAmount",LastStandUpgradeCatalog.BaseRepairAmount},{"baselineRepairPeriodTicks",LastStandUpgradeCatalog.RepairPeriod},
            {"survived",true},{"damageLimitSimulatedMilliseconds",60000},{"checkpointLimitSimulatedMilliseconds",120000},
            {"policy","Overdrive on deployment; normal fixed steps and wave commits; ten simulated seconds after first natural damage, activate Repairs and Minefield; continue to next confirmed checkpoint."}};
        var doc=new Dictionary<string,object>{{"kind","isolated-skills-combat-review-fixture"},{"saveVersion",9},
            {"scope","Development combat review fixture, not earned-player balance proof. Derived from the explicit existing collection fixture; gifted Hull Capacity 40, all other permanent tracks zero. Non-firing Repair fitting retains its normal baseline 3 HP per simulated second; it is not suppressed. Production-model preflight uses natural enemies, damage, fixed steps, skill actions and durable wave commits; no enemy, hull, tick or clock mutation. Normal saves are never accessed."},
            {"profile",prepared},{"preflight",preflight}};
        string full=Path.GetFullPath(path);Directory.CreateDirectory(Path.GetDirectoryName(full));File.WriteAllText(full,LastStandSaveJson.Write(doc));
    }
    static int Main(string[] args)
    {
        try {
            string name=args[0];
            if(name=="fixture"){if(args.Length!=2)throw new Exception("Explicit output path required.");GenerateReview(args[1]);}
            else if(name=="combat-fixture"){if(args.Length!=3)throw new Exception("Explicit source and output paths required.");GenerateCombatReview(args[1],args[2]);}
            else if(name=="eligibility"){
                foreach(int wave in new[]{0,24,25,99,100,299,300,499,500}){
                    var p=LastStandProgression.Load(Fixture(wave));
                    Need(p.SkillSlotCount==(wave>=500?3:wave>=100?2:wave>=25?1:0),"independent slot threshold");
                    Need(p.SkillDrawPool.Count==(wave>=300?6:wave>=100?4:wave>=25?2:0),"eligible collection threshold");
                    Need(p.SkillRank(LastStandSkillId.Overdrive)==0&&p.SelectedSkills.Count==0,"milestones do not give ownership");
                    Need(!p.TryApplySkills(new LastStandSkillLoadout(LastStandSkillId.Overdrive),p.Revision),"unowned equip refuses");
                }
            }else if(name=="draw"){
                var s=Fixture(25,15);var p=LastStandProgression.Load(s);int rolls=0;long rev=p.Revision;string before=s.Raw;
                s.Fail=true;Need(!p.TryDrawSkill(rev,n=>{rolls++;return 0;}),"save failure");
                Need(rolls==1&&p.SkillIntel==15&&p.SkillRank(LastStandSkillId.Overdrive)==0&&p.LastSkillDraw==null&&s.Raw==before,"no partial draw state");
                Need(!p.TryDrawSkill(rev,n=>{rolls++;return 1;}),"pending draw refused");
                s.Fail=false;Need(p.Retry()&&rolls==1&&p.SkillIntel==14&&p.SkillCopies(LastStandSkillId.Overdrive)==1,"fixed draw retry");
                Need(p.LastSkillDraw.Skill==LastStandSkillId.Overdrive&&p.LastSkillDraw.Rank==1,"confirmed receipt");
                for(int copy=2;copy<=6;copy++)Need(p.TryDrawSkill(p.Revision,n=>0),"duplicate draw");
                Need(p.SkillRank(LastStandSkillId.Overdrive)==3&&p.SkillDrawPool.Count==1,"maxed exits pool");
                for(int i=0;i<6;i++)Need(p.TryDrawSkill(p.Revision,n=>0),"other eligible skill");
                before=s.Raw;Need(!p.TryDrawSkill(p.Revision,n=>throw new Exception("empty pool sampled"))&&s.Raw==before&&p.SkillIntel==3,"complete collection spends nothing");
                p=LastStandProgression.Load(s);Need(p.SkillCopies(LastStandSkillId.ReinforcedHull)==6&&p.SkillIntel==3,"draw state survives reload");
                var uncertain=Fixture(25,2);p=LastStandProgression.Load(uncertain);rolls=0;int writes=uncertain.Writes;
                uncertain.FailReadAfterWrite=true;
                Need(!p.TryDrawSkill(p.Revision,n=>{rolls++;return 1;})&&p.SkillIntel==2&&p.LastSkillDraw==null,"unknown readback withholds visible outcome");
                string durable=uncertain.Raw;Need(uncertain.Writes==writes+1,"one write occurred before confirmation failure");
                Need(!p.TryDrawSkill(p.Revision,n=>{rolls++;return 0;}),"unknown outcome cannot be rerolled");
                uncertain.FailRead=uncertain.FailReadAfterWrite=false;
                Need(p.Retry()&&rolls==1&&uncertain.Writes==writes+1&&uncertain.Raw==durable,"readback retry confirms existing outcome without another write");
                Need(p.SkillIntel==1&&p.SkillCopies(LastStandSkillId.ReinforcedHull)==1&&p.LastSkillDraw.Skill==LastStandSkillId.ReinforcedHull,"unknown confirmation pays and grants exactly once");
            }else if(name=="refusal"){
                var s=Fixture(500,1,1);var p=LastStandProgression.Load(s);string before=s.Raw;
                Need(!p.TryDrawSkill(p.Revision-1,n=>0)&&!p.TryDrawSkill(p.Revision,n=>n)&&s.Raw==before,"stale and invalid roll refusal");
                s.ReadOnly=true;Need(!p.TryDrawSkill(p.Revision,n=>0)&&s.Raw==before,"readonly no spend");
            }else if(name=="presets"){
                var s=Fixture(750,3,1);var p=LastStandProgression.Load(s);var skills=new LastStandSkillLoadout(LastStandSkillId.Overdrive,LastStandSkillId.Ballistics);
                var hardware=new LastStandLoadout("launcher","repair");long rev=p.Revision;string before=s.Raw;
                s.Fail=true;Need(!p.TryApplyLoadoutPreset(0,"Push",hardware,skills,rev),"preset write failure");
                Need(p.SelectedSkills.Count==0&&p.LoadoutPresets[0]==null&&s.Raw==before,"no partial preset");
                s.Fail=false;Need(p.Retry()&&p.SelectedSkills.Equals(skills)&&p.SelectedLoadout.Equals(hardware),"combined atomic preset");
                Need(p.TryApplySkills(LastStandSkillLoadout.Empty,p.Revision)&&p.TryApplyLoadoutPreset(0)&&p.SelectedSkills.Equals(skills),"preset restores captured skills");
                Need(p.TryApplyLoadoutPreset(1,"Same skills",new LastStandLoadout("repair"),p.Revision)&&p.LoadoutPresets[1].Skills.Equals(skills),"legacy overload retains selected skills");
                p=LastStandProgression.Load(s);Need(p.SaveState=="ready"&&p.LoadoutPresets[0].Skills.Equals(skills),"preset reload");
            }else if(name=="migration"){
                var s=Fixture(750,0);s.Raw=LastStandProgression.RetainedSkillFixture(s.Raw);string retained=LastStandSaveJson.Write(LastStandSaveJson.Read(s.Raw)["checkpoint"]);
                var p=LastStandProgression.Load(s);Need(p.SaveState=="ready"&&p.GetBestWave(1)==750&&p.SkillSlotCount==3,"earned eligibility retained");
                Need(p.SkillIntel==0&&p.SelectedSkills.Count==0&&p.SkillRank(LastStandSkillId.Overdrive)==0,"migration invents no currency or ownership");
                Need(LastStandSaveJson.Integer(LastStandSaveJson.Read(s.Raw)["version"])==9,"v9 durable migration");
                Need(retained==LastStandSaveJson.Write(LastStandSaveJson.Read(s.Raw)["checkpoint"])&&p.Checkpoint.Edition==LastStandRunEdition.Buildcraft,"retained v3 checkpoint bytes and edition unchanged");
            }else if(name=="rewards"){
                foreach(int wave in new[]{25,50,100}){
                    var s=Fixture(500,0);s.Raw=LastStandProgression.SkillWaveFixture(s.Raw,wave);var p=LastStandProgression.Load(s);
                    var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();if(model.AwaitingWaveCommit){model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);}Complete(model,shop);
                    s.Fail=true;Need(!p.TryCommitWave(model,shop)&&p.SkillIntel==0,"Intel not visible before confirmation");s.Fail=false;Need(p.Retry()&&p.SkillIntel==1&&p.LastReceipt.SkillIntel==1,"one confirmed Intel award");
                    Need(!p.TryCommitWave(model,shop)&&p.SkillIntel==1,"boundary cannot award twice");
                    p=LastStandProgression.Load(s);Need(p.SkillIntel==1,"Intel reload stable");
                    Need(p.TryFinalizeRun(),"finish reward run");s.Raw=LastStandProgression.SkillWaveFixture(s.Raw,wave);p=LastStandProgression.Load(s);model=p.Checkpoint.RestoreModel();shop=p.Checkpoint.RestoreShop();if(model.AwaitingWaveCommit){model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);}Complete(model,shop);Need(p.TryCommitWave(model,shop)&&p.SkillIntel==(wave<100?1:2),"one time awards retain ledger; century awards repeat in a new run");
                }
            }else if(name=="backup"){
                var s=Fixture(500,9,3);var p=LastStandProgression.Load(s);var skills=new LastStandSkillLoadout(LastStandSkillId.Minefield,LastStandSkillId.ReactiveLining);Need(p.TryApplySkills(skills,p.Revision),"backup equip");
                Need(p.TryExportBackup(out var bytes,out _)&&p.TryPreviewBackup(bytes,out var preview,out _),"backup preview");
                Need(p.TryDrawSkill(p.Revision,n=>0),"change after export");Need(p.TryPreviewBackup(bytes,out preview,out _)&&p.TryRestoreBackup(preview,out _),"restore skills");
                Need(p.SkillIntel==9&&p.SkillCopies(LastStandSkillId.Overdrive)==3&&p.SelectedSkills.Equals(skills),"restored same collection");
            }else if(name=="checkpoint"){
                var s=Fixture(500,9,1);var p=LastStandProgression.Load(s);var selected=new LastStandSkillLoadout(LastStandSkillId.Overdrive,LastStandSkillId.Minefield,LastStandSkillId.ReinforcedHull);
                Need(p.TryApplySkills(selected,p.Revision)&&p.TryDeploy(),"deploy captured build");
                var captured=p.Checkpoint.Skills;Need(captured.Rank(LastStandSkillId.Overdrive)==1,"rank one captured");
                Need(p.TryDrawSkill(p.Revision,n=>0)&&p.TryDrawSkill(p.Revision,n=>0)&&p.SkillRank(LastStandSkillId.Overdrive)==2,"collection advances during run");
                Need(p.TryApplySkills(LastStandSkillLoadout.Empty,p.Revision)&&p.Checkpoint.Skills.Equals(captured),"future preparation cannot alter active snapshot");
                var model=p.Checkpoint.RestoreModel();var shop=p.Checkpoint.RestoreShop();Need(model.TryActivateSkill(LastStandSkillId.Overdrive)&&model.TryActivateSkill(LastStandSkillId.Minefield),"activate equipped skills");
                Complete(model,shop);Need(p.TryCommitWave(model,shop),"commit used skill state");
                p=LastStandProgression.Load(s);Need(p.SaveState=="ready"&&p.Checkpoint.Skills.Equals(captured),"saved ranks retained");
                model=p.Checkpoint.RestoreModel();Need(model.RemainingSkillUses(LastStandSkillId.Overdrive)==0&&model.RemainingSkillUses(LastStandSkillId.Minefield)==0,"confirmed uses do not refill on resume");
                Need(model.Skills.Rank(LastStandSkillId.Overdrive)==1&&p.SkillRank(LastStandSkillId.Overdrive)==2,"captured versus future rank");
                Need(p.TryFinalizeRun()&&p.TryApplySkills(selected,p.Revision)&&p.TryDeploy()&&p.Checkpoint.Skills.Rank(LastStandSkillId.Overdrive)==2,"next run captures new rank");
            }else if(name=="malformed"){
                var s=Fixture(500,2,1);string good=s.Raw;
                foreach(string field in new[]{"copies","loadout","firstAwards","intel"}){
                    var map=LastStandSaveJson.Read(good);var skills=LastStandSaveJson.Object(map["skills"]);
                    if(field=="copies")LastStandSaveJson.Array(skills[field])[0]=7;
                    if(field=="loadout")skills[field]=new object[]{"overdrive","overdrive"};
                    if(field=="firstAwards")skills[field]=new object[]{"unknown"};
                    if(field=="intel")skills[field]=2147483648L;
                    s.Raw=LastStandSaveJson.Write(map);string bad=s.Raw;var p=LastStandProgression.Load(s);Need(p.SaveState=="blocked"&&s.Raw==bad,"invalid saved skills rejected "+field);
                }
            }else throw new Exception("Unknown check");
            Console.WriteLine("PASS "+name);return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

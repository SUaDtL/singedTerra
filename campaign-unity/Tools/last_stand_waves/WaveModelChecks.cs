using System;
using System.Reflection;
using System.Collections.Generic;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
static class WaveModelChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static EncounterModel Strong(LastStandFitting fitting=LastStandFitting.Launcher)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];
        foreach(var row in LastStandUpgradeCatalog.Tracks)levels[(int)row.Id]=row.PermanentCap;
        return EncounterModel.CreatePlayable(fitting,1,new LastStandShopState(1,fitting,levels));
    }
    static void ToClear(EncounterModel m){int budget=20000;while(!m.AwaitingWaveCommit && m.Status==EncounterStatus.Running && budget-->0)m.Step();Check(m.AwaitingWaveCommit,"Finite cohort must clear.");}
    static void Set(object target,string name,object value){target.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).SetValue(target,value);}
    static int Main(string[] args)
    {
        try {
            switch(args[0]) {
                case "tier-resolver":
                    var tiers=new List<LastStandTierDefinition>();
                    for(int n=1;n<=18;n++)tiers.Add(new LastStandTierDefinition(n,"fixture-"+n,"profile-"+n,"biome-"+n,n,1,n==1?0:n-1,n==1?0:300));
                    var resolver=typeof(EncounterProfile).GetMethod("ForTier",new[]{typeof(int),typeof(IReadOnlyList<LastStandTierDefinition>)});
                    Check(resolver!=null,"The maintained tier resolver must accept authored catalogs without a two-tier branch.");
                    var strongLevels=new int[LastStandUpgradeCatalog.Tracks.Count];
                    foreach(var row in LastStandUpgradeCatalog.Tracks)strongLevels[(int)row.Id]=row.PermanentCap;
                    foreach(var definition in tiers) {
                        var profile=(EncounterProfile)resolver.Invoke(null,new object[]{definition.Id,tiers});
                        Check(profile.Tier==definition.Id && profile.TierDefinition==definition && profile.Id==LastStandWaveCatalog.RulesVersion+":"+definition.EncounterProfileId,"Resolved identity must match every authored tier.");
                        Check(profile.TierDefinition.EnvironmentId=="biome-"+definition.Id && profile.EnemyHull(10)==10*definition.Id,"Resolved environment and difficulty are not Tier 2 fallbacks.");
                        var model=new EncounterModel(LastStandFitting.Launcher,profile);
                        model.ApplyShopProjection(new LastStandShopState(1,LastStandFitting.Launcher,strongLevels));
                        foreach(bool cleared in new[]{false,true}) {
                            if(cleared)ToClear(model);
                            var checkpoint=model.CaptureCheckpoint();
                            var freshProfile=(EncounterProfile)resolver.Invoke(null,new object[]{definition.Id,tiers});
                            Check(EncounterModel.RestoreCheckpoint(freshProfile,model.Fitting,checkpoint).Snapshot()==model.Snapshot(),"Every authored tier restores exact start and cleared boundaries.");
                            var other=(EncounterProfile)resolver.Invoke(null,new object[]{definition.Id==1?2:1,tiers});
                            try {EncounterModel.RestoreCheckpoint(other,model.Fitting,checkpoint);throw new Exception("Wrong tier checkpoint restored.");}catch(ArgumentException){}
                        }
                    }
                    try {resolver.Invoke(null,new object[]{19,tiers});throw new Exception("Unknown tier resolved.");}catch(TargetInvocationException e){Check(e.InnerException is ArgumentOutOfRangeException,"Unknown tier rejects explicitly.");}
                    Check(LastStandTierCatalog.All.Count==2,"Fixture adds no shipped tiers.");
                    foreach(var shipped in LastStandTierCatalog.All)Check(EncounterProfile.ForTier(shipped.Id).TierDefinition==shipped,"Default resolver retains authored identity.");
                    break;
                case "cohort":
                    var m=Strong();m.Step();
                    Check(!m.AwaitingWaveCommit && m.CompletedWave==0,"Unspawned enemies prevent clear.");
                    Check(m.RemainingWaveEnemies>0,"Remaining includes unspawned enemies.");
                    while(m.ActiveCount>0)m.Step();
                    Check(!m.AwaitingWaveCommit,"Empty spawn gap cannot clear.");
                    ToClear(m);int tick=m.Tick;for(int n=0;n<100;n++)m.Step();
                    Check(m.Tick==tick && m.Wave==1,"Save boundary freezes simulation.");
                    Check(m.ContinueAfterCheckpoint() && m.Wave==2 && !m.ContinueAfterCheckpoint(),"Explicit continuation exactly once.");
                    break;
                case "determinism":
                    var a=Strong();ToClear(a);var cp=a.CaptureCheckpoint();
                    var b=EncounterModel.RestoreCheckpoint(a.Profile,a.Fitting,cp);
                    Check(a.Snapshot()==b.Snapshot(),"Exact boundary restore.");
                    a.ContinueAfterCheckpoint();b.ContinueAfterCheckpoint();
                    for(int n=0;n<10000 && !a.AwaitingWaveCommit;n++) {
                        a.Step();if(n%2==1){b.Step();b.Step();}
                    }
                    if(b.Tick<a.Tick)b.Step();
                    Check(a.Snapshot()==b.Snapshot(),"Step grouping cannot change outcome.");
                    break;
                case "mutual":
                    var mutual=Strong(LastStandFitting.Repair);
                    while(mutual.Kills<LastStandWaveCatalog.ForWave(1,1).EnemyCount-1)mutual.Step();
                    while(mutual.ActiveCount==0)mutual.Step();
                    var foe=mutual.Foes[0];foreach(var candidate in mutual.Foes)if(candidate.Alive){foe=candidate;break;}
                    foe.Distance=0;foe.Hull=1;foe.Damage=int.MaxValue;
                    Set(mutual,"<Hull>k__BackingField",1);Set(mutual,"nextCannon",mutual.Tick);Set(mutual,"nextRepair",mutual.Tick+100);
                    mutual.Step();
                    Check(mutual.Status==EncounterStatus.Defeated && mutual.CompletedWave==1 && mutual.AwaitingWaveCommit,"Mutual final kill records completed cohort before terminal.");
                    var dead=mutual.CaptureCheckpoint();Check(dead.Hull==0,"Dead clear is transaction input.");
                    try {EncounterModel.RestoreCheckpoint(mutual.Profile,mutual.Fitting,dead);throw new Exception("Dead checkpoint resumed.");}catch(ArgumentException){}
                    break;
                case "shop":
                    var shop=new LastStandShopState(9,LastStandFitting.Repair,new int[LastStandUpgradeCatalog.Tracks.Count]);
                    shop.ObserveAuthoritativeKills(10);Check(shop.TryPurchase(new LastStandShopPurchaseIntent(9,shop.Version,LastStandUpgradeTrackId.HullCapacity)).Accepted,"Purchase.");
                    var ledger=shop.CaptureCheckpoint();var restored=LastStandShopState.RestoreCheckpoint(ledger);
                    Check(!restored.ObserveAuthoritativeKills(10) && restored.Scrap==26,"No replay income after the v2 four-Scrap Hull purchase.");
                    Check(restored.EarnedScrap==30 && restored.SpentScrap==4 && restored.GetTrack(LastStandUpgradeTrackId.HullCapacity).RunPurchases==1,"Whole ledger restores.");
                    var tank=EncounterModel.CreatePlayable(LastStandFitting.Repair,1,restored);
                    Set(tank,"<Hull>k__BackingField",10);
                    var tankCopy=EncounterModel.RestoreCheckpoint(tank.Profile,tank.Fitting,tank.CaptureCheckpoint());
                    tankCopy.ApplyShopProjection(restored);
                    Check(tankCopy.Hull==10,"Reapplying restored stats never refills missing hull.");
                    break;
                case "invalid":
                    var invalid=Strong();invalid.Step();
                    try {invalid.CaptureCheckpoint();throw new Exception("Live cohort checkpoint accepted.");}catch(InvalidOperationException){}
                    ToClear(invalid);var good=invalid.CaptureCheckpoint();
                    var wrong=new EncounterCheckpoint("future-rules",good.Tier,good.Fitting,good.Wave,good.CompletedWave,good.Tick,good.Hull,good.MaximumHull,good.Spawned,good.Kills,
                        good.CannonShots,good.LauncherShots,good.ScattergunShots,good.Restored,good.CloseHits,good.RangedHits,good.NextSpawnTick,good.NextCannonTick,good.NextLauncherTick,good.NextRepairTick,good.NextScattergunTick,good.LastCannonShotTick,
                        good.CannonDamage,good.LauncherDamage,good.ScattergunDamage,good.CannonPeriod,good.RepairAmount,good.ArmorLevel,good.CommittedCannonDamage);
                    try {EncounterModel.RestoreCheckpoint(invalid.Profile,invalid.Fitting,wrong);throw new Exception("Unknown checkpoint rules accepted.");}catch(ArgumentException){}
                    try {LastStandShopState.RestoreCheckpoint(new LastStandShopCheckpoint(1,0,0,1,3,0,99,new int[7],new int[7]));throw new Exception("Unbalanced shop accepted.");}catch(ArgumentException){}
                    break;
                case "scatter":
                    var scatter=new EncounterModel(LastStandFitting.Scattergun,EncounterProfile.ForTier(1));
                    Set(scatter,"nextSpawn",10000);Set(scatter,"nextCannon",10000);Set(scatter,"<Hull>k__BackingField",60);
                    for(int i=0;i<4;i++){var targetFoe=scatter.Foes[i];targetFoe.Id=i+1;targetFoe.Hull=100;targetFoe.Distance=14000+i*100;}
                    scatter.Step();int shotCount=0;var hit=new System.Collections.Generic.HashSet<int>();
                    foreach(var e in scatter.Events)if(e.Kind==EncounterEventKind.Scattergun){shotCount++;hit.Add(e.Slot);}
                    Check(shotCount==3 && hit.Count==3 && scatter.ScattergunShots==1,"Three different nearby targets in a single volley.");
                    for(int n=0;n<20;n++)scatter.Step();
                    Check(scatter.Hull==60 && scatter.Restored==0,"Scattergun never inherits repair fitting.");
                    break;
                default:
                    int target=args[0]=="2000"?2001:args[0]=="5000"?5001:301;
                    var run=Strong();int length=run.Foes.Count;
                    for(int wave=1;wave<=target;wave++) {
                        ToClear(run);Check(run.Wave==wave && run.CompletedWave==wave && run.Foes.Count==length && run.ActiveCount==0,"Bounded continuing state.");
                        if(wave==target){var resumed=EncounterModel.RestoreCheckpoint(run.Profile,run.Fitting,run.CaptureCheckpoint());Check(resumed.Snapshot()==run.Snapshot(),"Late-wave restore parity.");}
                        if(wave<target)Check(run.ContinueAfterCheckpoint(),"No content horizon.");
                    }
                    Check(run.Tick>3600 && run.Status==EncounterStatus.Running,"Old fixture horizon does not end a run.");
                    break;
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

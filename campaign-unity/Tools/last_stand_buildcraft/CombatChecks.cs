using System;
using System.Collections.Generic;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

// Isolated damage fixtures deliberately set finite enemies. They exercise real
// Step/Hit behavior but are never used as saves, rewards or earned-balance proof.
namespace SingedTerra.Encounter
{
    public sealed partial class EncounterModel
    {
        public void BuildcraftTestEnemies(int hull=1000,int incoming=0,FoeKind support=FoeKind.Close)
        {
            nextSpawn=1000000;waveSpawned=WaveEnemyCount;Spawned=WaveEnemyCount;
            for(int i=0;i<Capacity;i++){
                var foe=foes[i];foe.Hull=0;
                if(i>=WaveEnemyCount)continue;
                foe.Id=i+1;foe.WaveOrdinal=i;foe.Lane=0;foe.Distance=1000;foe.MaximumHull=foe.Hull=hull;
                foe.Damage=i==0?incoming:0;foe.Kind=i==0?support:FoeKind.Close;
                foe.Armor=0;foe.NextAttack=0;foe.NextSupportTick=1;
                if(SupportsAllies(foe.Kind)){
                    var stats=LastStandEnemyCatalog.ForKind(foe.Kind,LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave,Profile.Edition),Profile.Edition);
                    foe.SupportRemaining=stats.ShieldBuffer+stats.HealingBudget;
                }
            }
        }
        public void BuildcraftTestDelayWeapons(){nextCannon=nextLauncher=nextScattergun=nextMortar=nextRailgun=nextArc=1000000;}
        public void BuildcraftTestRangeFixture(bool arc,bool cannon)
        {
            nextSpawn=1000000;waveSpawned=WaveEnemyCount;Spawned=WaveEnemyCount;
            foreach(var foe in foes)foe.Hull=0;
            BuildcraftTestDelayWeapons();if(arc)nextArc=1;if(cannon)nextCannon=1;
        }
        public void BuildcraftTestRangeEnemy(int slot,int id,FoeKind kind,int distanceAfterStep,int hull=1000,int maximumHull=1000)
        {
            var foe=foes[slot];foe.Id=id;foe.WaveOrdinal=slot;foe.Lane=0;foe.Kind=kind;
            foe.Distance=distanceAfterStep+Profile.Speed(kind);foe.Hull=hull;foe.MaximumHull=maximumHull;
            foe.Armor=0;foe.Damage=0;foe.NextAttack=1000000;foe.NextSupportTick=1;foe.ProtectedMask=0;foe.ProtectedCount=0;
            var stats=LastStandEnemyCatalog.ForKind(kind,LastStandWaveCatalog.ForWave(Profile.TierDefinition,Wave,Profile.Edition),Profile.Edition);
            foe.SupportRemaining=stats.ShieldBuffer+stats.HealingBudget;
        }
    }
}

static class CombatChecks
{
    static void Check(bool condition,string message){if(!condition)throw new Exception(message);}
    static EncounterModel Model(string primary,string secondary=null,LastStandCombatResearchSnapshot research=null,int[] levels=null,int tier=1)
    {
        var loadout=new LastStandLoadout(primary,secondary);var shop=new LastStandShopState(1,loadout.Primary,
            levels??new int[LastStandUpgradeCatalog.Tracks.Count],LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,tier,loadout,research);
        return EncounterModel.CreatePlayable(loadout.Primary,tier,shop);
    }
    static void Arc()
    {
        var model=Model("arc");model.BuildcraftTestEnemies();model.Step();
        var targets=new HashSet<int>();var amounts=new List<int>();
        foreach(var e in model.Events)if(e.Kind==EncounterEventKind.Arc){Check(targets.Add(e.Slot),"chain target repeats");amounts.Add(e.Amount);}
        Check(amounts.Count==4&&amounts[0]==16&&amounts[1]==12&&amounts[2]==9&&amounts[3]==6,"bounded 75% chain damage");
        Check(model.ArcShots==1,"one pulse");for(int i=0;i<39;i++)model.Step();Check(model.ArcShots==1,"pulse cadence");model.Step();Check(model.ArcShots==2,"next pulse");
        model=Model("arc");model.BuildcraftTestEnemies();foreach(var foe in model.Foes)foe.Hull=0;model.Step();Check(model.ArcShots==0,"no empty-target pulse");
        model=Model("launcher","scattergun");model.BuildcraftTestEnemies();model.Step();Check(model.LauncherShots==1&&model.ScattergunShots==1,"both bays tick independently");
    }
    static List<EncounterEvent> Events(EncounterModel model,EncounterEventKind kind)
    {var result=new List<EncounterEvent>();foreach(var entry in model.Events)if(entry.Kind==kind)result.Add(entry);return result;}
    static long SeparationSquared(EncounterModel model,int first,int second)
    {
        var a=model.Foes[first];var b=model.Foes[second];
        var p=EncounterGeometry.Position(a.Lane,a.Id,a.Distance);var q=EncounterGeometry.Position(b.Lane,b.Id,b.Distance);
        long dx=(long)p.X-q.X,dz=(long)p.Z-q.Z;return dx*dx+dz*dz;
    }
    static void ArcRanges()
    {
        foreach(int radius in new[]{24999,25000,25001}){
            var model=Model("arc");model.BuildcraftTestRangeFixture(true,false);
            model.BuildcraftTestRangeEnemy(0,1,FoeKind.Close,radius);model.Step();var hits=Events(model,EncounterEventKind.Arc);
            bool inside=radius<=25000;
            Check(model.Foes[0].Distance==radius,"arc acquisition fixture movement");
            Check(hits.Count==(inside?1:0)&&model.ArcShots==(inside?1:0)&&model.Foes[0].Hull==(inside?984:1000),"arc acquisition range boundary "+radius);
            if(inside)Check(hits[0].Slot==0&&model.Foes[hits[0].Slot].Id==1&&hits[0].AimSlot==0&&hits[0].Amount==16,"arc acquisition affected identity");
        }
        // IDs 1/4 use opposite columns with equal Z. At these radii their
        // integer X separation is exactly 6,998 / 7,000 / 7,002 model units.
        int[] distances={5940,5941,5943};int[] separation={6998,7000,7002};
        for(int index=0;index<distances.Length;index++){
            var model=Model("arc");model.BuildcraftTestRangeFixture(true,false);
            model.BuildcraftTestRangeEnemy(0,1,FoeKind.Close,distances[index]);model.BuildcraftTestRangeEnemy(1,4,FoeKind.Close,distances[index]);
            model.Step();var hits=Events(model,EncounterEventKind.Arc);bool inHop=index<2;
            Check(SeparationSquared(model,0,1)==(long)separation[index]*separation[index],"arc exact geometry witness");
            Check(hits.Count==(inHop?2:1)&&model.Foes[0].Hull==984&&model.Foes[1].Hull==(inHop?988:1000),"arc hop radius boundary "+separation[index]);
            Check(hits[0].Slot==0&&model.Foes[hits[0].Slot].Id==1,"arc initial nearest tie identity");
            if(inHop)Check(hits[1].Slot==1&&model.Foes[hits[1].Slot].Id==4&&hits[1].AimSlot==0&&hits[1].Amount==12,"arc hop affected identity and source");
        }
    }
    static EncounterModel AuraModel(FoeKind kind,int distance,int targets=1,int targetHull=1000)
    {
        var model=Model("repair",tier:kind==FoeKind.Medic?6:5);model.BuildcraftTestRangeFixture(false,kind==FoeKind.ShieldCarrier);
        // ID 22 occupies the positive column, IDs 3/7/11/15/19 the
        // reflected negative column. All allies win equal-range target ties.
        model.BuildcraftTestRangeEnemy(0,22,kind,distance,10000,10000);
        for(int slot=1;slot<=targets;slot++)model.BuildcraftTestRangeEnemy(slot,4*slot-1,FoeKind.Close,distance,targetHull,1000);
        return model;
    }
    static void AuraRanges()
    {
        int[] distances={21586,21587,21592};int[] separation={8998,9000,9002};
        foreach(var kind in new[]{FoeKind.ShieldCarrier,FoeKind.Medic})for(int index=0;index<distances.Length;index++){
            var model=AuraModel(kind,distances[index],targetHull:kind==FoeKind.Medic?500:1000);
            int budget=model.Foes[0].SupportRemaining;model.Step();bool inAura=index<2;
            Check(SeparationSquared(model,0,1)==(long)separation[index]*separation[index],"support exact geometry witness");
            if(kind==FoeKind.ShieldCarrier){
                var effects=Events(model,EncounterEventKind.EnemyShield);var hits=Events(model,EncounterEventKind.Cannon);
                Check(effects.Count==(inAura?1:0)&&model.Foes[1].Hull==(inAura?999:980)&&model.Foes[0].SupportRemaining==budget-(inAura?19:0),"carrier aura radius boundary "+separation[index]);
                Check(hits.Count==1&&hits[0].Slot==1&&model.Foes[hits[0].Slot].Id==3&&hits[0].Amount==(inAura?1:20),"carrier affected hit identity");
                if(inAura)Check(effects[0].Slot==1&&effects[0].Amount==19,"carrier affected shield identity");
            }else {
                var effects=Events(model,EncounterEventKind.EnemyRepair);
                int pulse=LastStandEnemyCatalog.ForKind(kind,LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,1),LastStandRunEdition.Current).HealingPerPulse;
                Check(effects.Count==(inAura?1:0)&&model.Foes[1].Hull==500+(inAura?pulse:0)&&model.Foes[0].SupportRemaining==budget-(inAura?pulse:0),"medic aura radius boundary "+separation[index]);
                if(inAura)Check(effects[0].Slot==1&&model.Foes[effects[0].Slot].Id==3&&effects[0].Amount==pulse,"medic affected healing identity");
            }
            Check(model.Foes[0].Hull==10000,"support source is not the weapon/healing target");
        }
    }
    static void SupportLimits()
    {
        var model=AuraModel(FoeKind.ShieldCarrier,21587,5,1);int budget=model.Foes[0].SupportRemaining,total=0;
        var protectedIds=new List<int>();
        for(int step=0;step<100;step++){
            int before=model.Foes[0].SupportRemaining;model.Step();int amount=0;
            foreach(var effect in Events(model,EncounterEventKind.EnemyShield)){amount+=effect.Amount;protectedIds.Add(model.Foes[effect.Slot].Id);}
            Check(before-model.Foes[0].SupportRemaining==amount&&model.Foes[0].SupportRemaining>=0,"carrier finite shield conservation");total+=amount;
        }
        Check(protectedIds.Count==3&&protectedIds[0]==3&&protectedIds[1]==7&&protectedIds[2]==11&&model.Foes[0].ProtectedCount==3&&model.Foes[0].ProtectedMask==14u,"carrier distinct target cap and affected identities");
        Check(model.Kills==5&&total==57&&budget-model.Foes[0].SupportRemaining==total,"carrier fourth and fifth allies receive no buffer");
        model=AuraModel(FoeKind.ShieldCarrier,21587);budget=model.Foes[0].SupportRemaining;total=0;
        for(int step=0;step<500;step++){
            int before=model.Foes[0].SupportRemaining;model.Step();int amount=0;
            foreach(var effect in Events(model,EncounterEventKind.EnemyShield)){Check(effect.Slot==1&&model.Foes[effect.Slot].Id==3,"carrier repeated target identity");amount+=effect.Amount;}
            Check(before-model.Foes[0].SupportRemaining==amount&&model.Foes[0].SupportRemaining>=0,"carrier finite shield conservation");total+=amount;
        }
        Check(model.Foes[0].SupportRemaining==0&&total==budget&&model.Foes[0].ProtectedCount==1,"carrier repeated target exhausts finite budget without counting twice");

        model=AuraModel(FoeKind.Medic,21587,5,500);budget=model.Foes[0].SupportRemaining;
        model.Step();var heals=Events(model,EncounterEventKind.EnemyRepair);total=0;
        Check(heals.Count==3,"medic target cap");
        for(int index=0;index<heals.Count;index++){
            var effect=heals[index];Check(effect.Slot==index+1&&model.Foes[effect.Slot].Id==3+4*index,"medic affected identities");total+=effect.Amount;
        }
        Check(model.Foes[4].Hull==500&&model.Foes[5].Hull==500&&budget-model.Foes[0].SupportRemaining==total,"medic fourth and fifth allies untouched");
        // A previously spent budget can end partway through a pulse. This
        // fixture stays below the authored initial budget and tests that bound.
        int pulse=LastStandEnemyCatalog.ForKind(FoeKind.Medic,LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,1),LastStandRunEdition.Current).HealingPerPulse;
        model.Foes[0].SupportRemaining=pulse+1;budget=pulse+1;total=0;
        for(int step=0;step<100;step++){
            for(int slot=1;slot<=5;slot++)model.Foes[slot].Hull=500;
            int before=model.Foes[0].SupportRemaining;model.Step();int amount=0;
            foreach(var effect in Events(model,EncounterEventKind.EnemyRepair)){
                Check(effect.Slot<=3&&model.Foes[effect.Slot].Id==4*effect.Slot-1,"medic finite-budget affected identities");amount+=effect.Amount;
            }
            Check(before-model.Foes[0].SupportRemaining==amount&&model.Foes[0].SupportRemaining>=0,"medic finite healing conservation");total+=amount;
        }
        Check(model.Foes[0].SupportRemaining==0&&total==budget,"medic finite budget exhausted exactly");
    }
    static void Shield()
    {
        var model=Model("shield","repair");model.BuildcraftTestEnemies(10000,80);model.Step();
        Check(model.Shield==0&&model.ShieldAbsorbed==60&&model.Hull==100,"armor then bounded shield then hull");
        foreach(var foe in model.Foes)foe.Damage=0;
        for(int i=1;i<20;i++)model.Step();Check(model.Hull==103&&model.Restored==3,"repair continues beside shield");
        for(int i=20;i<100;i++)model.Step();Check(model.Shield==0,"no early recharge");
        model.Step();Check(model.Shield==3&&model.ShieldRestored==3,"five-second delay and 5% recovery");
        for(int i=0;i<1000;i++)model.Step();Check(model.Shield<=60&&model.Hull<=120,"defense caps");
        model=Model("shield","repair");model.BuildcraftTestEnemies(1000000,80);for(int i=0;i<100&&model.Status==EncounterStatus.Running;i++)model.Step();
        Check(model.Status==EncounterStatus.Defeated&&model.ShieldRestored==0,"sustained pressure defeats defensive pair");
    }
    static void Research()
    {
        var research=new LastStandCombatResearchSnapshot(5,10,20);
        var model=Model("launcher","repair",research);Check(model.CurrentLauncherDamage==14&&model.CurrentRepairAmount==4,"shared research effect projection");
        var loadout=new LastStandLoadout("launcher","repair");var shop=new LastStandShopState(1,loadout.Primary,new int[LastStandUpgradeCatalog.Tracks.Count],LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,1,loadout,research);
        Check(shop.GetTrack(LastStandUpgradeTrackId.LauncherAttack).CurrentEffectDescription=="14 damage"&&shop.GetTrack(LastStandUpgradeTrackId.FieldRepair).CurrentEffectDescription.StartsWith("4 hull"),"shop descriptions consume the same captured research");
        model.BuildcraftTestEnemies();foreach(var foe in model.Foes)foe.Armor=10;model.Step();
        int cannon=-1,launcher=-1;foreach(var e in model.Events){if(e.Kind==EncounterEventKind.Cannon)cannon=e.Amount;if(e.Kind==EncounterEventKind.Launcher)launcher=e.Amount;}
        Check(cannon==15&&launcher==9,"flat penetration applies to cannon and launcher exactly once");
        var max=new LastStandCombatResearchSnapshot(20,20,20);Check(max.ScaleAreaEffect(int.MaxValue)==LastStandWaveCatalog.MaximumCombatValue,"bounded research scaling");
    }
    static void Pairs()
    {
        int setups=0;var fittings=LastStandFittingCatalog.Definitions;
        for(int primary=0;primary<fittings.Count;primary++)for(int secondary=-1;secondary<primary;secondary++){
            var loadout=new LastStandLoadout(fittings[primary].Id,secondary<0?null:fittings[secondary].Id);
            var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.HullCapacity]=100;levels[(int)LastStandUpgradeTrackId.Armor]=100;
            var cp=LastStandRunCheckpoint.Start(1,2,loadout,levels);var model=cp.RestoreModel();var shop=cp.RestoreShop();
            Check(model.CurrentMaximumHull==5852&&model.CurrentArmorLevel==100,"common levels applied once");
            int budget=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}
            Check(model.AwaitingWaveCommit&&model.Hull>0,"pair clears finite wave "+loadout);
            cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());var restored=cp.RestoreModel();
            Check(model.Snapshot()==restored.Snapshot(),"pair boundary roundtrip "+loadout);
            model.ContinueAfterCheckpoint();restored.ContinueAfterCheckpoint();
            for(int i=0;i<500;i++){model.Step();restored.Step();}Check(model.Snapshot()==restored.Snapshot(),"pair future deterministic "+loadout);setups++;
        }
        Check(setups==28,"seven singles and21 distinct pairs");
        foreach(var id in new[]{LastStandUpgradeTrackId.ArcOutput,LastStandUpgradeTrackId.ShieldCapacity}){
            var track=LastStandUpgradeCatalog.Get(id);Check(track.TotalCap==5000&&track.PermanentCap==2500&&track.EffectAt(5000,1)<=LastStandWaveCatalog.MaximumCombatValue,"new track bounds");
            Check(track.QuoteRun(0,0,100,LastStandBulkQuantity.Max).Quantity>1&&track.QuotePermanent(0,100,LastStandBulkQuantity.Ten).Quantity>1,"shared run/permanent quotes");
        }
    }
    static void Support()
    {
        var model=Model("repair",tier:5);model.BuildcraftTestEnemies(1000,0,FoeKind.ShieldCarrier);
        // Keep the carrier outside primary target priority while still in the aura.
        model.Foes[0].Distance=6000;int buffer=model.Foes[0].SupportRemaining;model.Step();
        Check(model.Foes[0].SupportRemaining<buffer&&model.Foes[1].Hull==999,"finite carrier buffer still allows hull damage");
        int prior=model.Foes[0].SupportRemaining;model.Foes[0].Hull=0;for(int i=0;i<20;i++)model.Step();Check(model.Foes[0].SupportRemaining==prior,"dead support cannot protect");
        model=Model("repair",tier:6);model.BuildcraftTestEnemies(1000,0,FoeKind.Medic);model.BuildcraftTestDelayWeapons();
        int budget=model.Foes[0].SupportRemaining;for(int i=1;i<model.WaveEnemyCount;i++)model.Foes[i].Hull=500;
        model.Step();int healed=0;for(int i=1;i<model.WaveEnemyCount;i++)healed+=model.Foes[i].Hull-500;
        Check(healed>0&&healed<=budget&&budget-model.Foes[0].SupportRemaining==healed,"medic healing conserved");
        for(int step=0;step<1000;step++){for(int i=1;i<model.WaveEnemyCount;i++)if(model.Foes[i].Alive)model.Foes[i].Hull=500;model.Step();}
        Check(model.Foes[0].SupportRemaining==0,"finite healing exhausted");
        model.Foes[1].Hull=0;model.Step();Check(!model.Foes[1].Alive,"no resurrection");
        foreach(int tier in new[]{5,6})foreach(int wave in new[]{50,100,150,200,5000,int.MaxValue}){
            var group=LastStandWaveCatalog.ForWave(LastStandTierCatalog.Get(tier),wave);var last=LastStandEnemyCatalog.For(LastStandTierCatalog.Get(tier),wave,group.EnemyCount-1,LastStandRunEdition.Current);
            Check(group.EnemyCount<=32,"bounded population");if(wave%100==0)Check(last.Kind==FoeKind.SiegeCommander&&last.TelegraphTicks==60,"commander cadence and windup");
            else if(wave%50==0)Check(last.Kind==FoeKind.SiegeElite,"intervening elite");
        }
        foreach(int tier in new[]{5,6}){
            long paid=0;var definition=LastStandTierCatalog.Get(tier);var economy=LastStandEconomyCatalog.Get(LastStandUpgradeCatalog.EconomyVersion);
            for(int wave=1;wave<=500;wave++){
                var group=LastStandWaveCatalog.ForWave(definition,wave);for(int ordinal=0;ordinal<group.EnemyCount;ordinal++)paid+=economy.BaseScrapForEnemy(definition,wave,ordinal,LastStandRunEdition.Current);
                if(wave%50==0)Check(paid==economy.BaseScrapThroughCohorts(definition,wave,LastStandRunEdition.Current),"new role/commander bounty conservation "+tier+":"+wave);
            }
        }
        model=Model("shield",tier:5);model.BuildcraftTestEnemies(10000,100,FoeKind.SiegeCommander);model.BuildcraftTestDelayWeapons();model.Step();
        Check(model.TelegraphRemainingTicks(model.Foes[0])==60&&model.Hull==120,"commander telegraph before damage");
        for(int i=0;i<59;i++)model.Step();Check(model.Hull==120,"no early commander damage");model.Step();Check(model.Shield==0&&model.Hull==80,"commander resolves once after telegraph");
    }
    static void Clock()
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.HullCapacity]=100;
        var direct=Model("arc","shield",levels:levels,tier:5);var paced=Model("arc","shield",levels:levels,tier:5);
        direct.BuildcraftTestEnemies(10000,80,FoeKind.SiegeCommander);paced.BuildcraftTestEnemies(10000,80,FoeKind.SiegeCommander);
        var clock=new LastStandRunClock(0,200,1,5);
        Action<double> advance=timestamp=>{do{Check(clock.Observe(timestamp),"clock admission");while(clock.TryTakeStep())paced.Step();}while(clock.CatchingUp);};
        advance(1);string before=paced.Snapshot();Check(clock.Pause(1),"pause");advance(101);Check(paced.Snapshot()==before,"pause freezes telegraph/shield/chain");
        Check(clock.Resume(101)&&clock.SetSpeed(101,5),"resume at5x");advance(102.8);
        for(int i=0;i<200;i++)direct.Step();Check(paced.Tick==200&&direct.Snapshot()==paced.Snapshot(),"speed changes only wall duration");
    }
    static void PaidShield()
    {
        var loadout=new LastStandLoadout("shield","launcher");var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[2]=100;
        var cp=LastStandRunCheckpoint.Start(1,1,loadout,levels);var shop=cp.RestoreShop();var model=cp.RestoreModel();
        Action clear=()=>{int budget=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}Check(model.AwaitingWaveCommit&&model.Hull>0,"paid shield real clear");};
        clear();model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
        int beforeShield=model.Shield,beforeScrap=shop.Scrap;var result=shop.TryPurchase(new LastStandShopPurchaseIntent(shop.RunId,shop.Version,LastStandUpgradeTrackId.ShieldCapacity));
        Check(result.Accepted&&shop.Scrap==beforeScrap-4,"ordinary paid shield rank");model.ApplyShopProjection(shop);
        Check(model.CurrentShieldCapacity==68&&model.Shield==beforeShield+8,"capacity gain adds only paid capacity delta");
        clear();cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());var saved=cp.Encounter.Buildcraft;
        Check((long)saved.ShieldCapacity+saved.ShieldRestored-saved.ShieldAbsorbed==saved.Shield,"shield conservation survives upgrades");
        Check(cp.RestoreModel().Snapshot()==model.Snapshot(),"paid capacity checkpoint exact");
    }
    static int Main(string[] args)
    {
        try{switch(args[0]){case "arc":Arc();break;case "arc-ranges":ArcRanges();break;case "aura-ranges":AuraRanges();break;case "support-limits":SupportLimits();break;case "shield":Shield();break;case "research":Research();break;case "pairs":Pairs();break;case "support":Support();break;case "clock":Clock();break;case "paid-shield":PaidShield();break;default:throw new Exception("Unknown case");}Console.WriteLine("PASS "+args[0]);return 0;}
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

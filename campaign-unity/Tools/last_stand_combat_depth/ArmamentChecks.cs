using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

static class ArmamentChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static void Set(object target,string field,object value)
    {var member=target.GetType().GetField(field,BindingFlags.Instance|BindingFlags.NonPublic);Check(member!=null,"Missing fixture field: "+field);member.SetValue(target,value);}
    static EncounterModel Fixture(LastStandFitting fitting)
    {
        var model=new EncounterModel(fitting,EncounterProfile.ForTier(2));
        Set(model,"nextSpawn",10000);Set(model,"nextCannon",10000);
        return model;
    }
    static EncounterFoe Enemy(EncounterModel model,int slot,int id,int lane,int distance,int armor)
    {
        var foe=model.Foes[slot];foe.Id=id;foe.WaveOrdinal=slot;foe.Kind=FoeKind.ArmoredBrute;
        foe.Lane=lane;foe.Distance=distance;foe.Armor=armor;foe.Hull=foe.MaximumHull=1000;foe.Damage=1;return foe;
    }
    static int Effect(LastStandUpgradeTrackId id)=>LastStandUpgradeCatalog.Get(id).EffectAt(0,1);
    static void Mortar()
    {
        var model=Fixture(LastStandFitting.Mortar);
        // Ids1/5 share one actual formation column; the opposite lane is outside the blast.
        var center=Enemy(model,0,1,0,18000,5);var neighbor=Enemy(model,1,5,0,18500,7);
        var remote=Enemy(model,2,9,4,19000,0);
        model.Step();var hit=new HashSet<int>();int count=0;
        foreach(var item in model.Events)if(item.Kind.ToString()=="Mortar"){
            Check(hit.Add(item.Slot),"One blast may hit a target only once.");count++;
        }
        Check(count==2&&hit.Contains(0)&&hit.Contains(1),"Mortar must hit both neighboring enemies, not the opposite lane.");
        Check(center.Hull==1000-Math.Max(1,Effect(LastStandUpgradeTrackId.MortarAttack)-5)&&
            neighbor.Hull==1000-Math.Max(1,Effect(LastStandUpgradeTrackId.MortarAttack)-7)&&remote.Hull==1000,
            "Blast damage uses each actual target's armor exactly once.");
        model.Step();foreach(var item in model.Events)Check(item.Kind.ToString()!="Mortar","No repeated blast before the firing cadence.");
        Check(model.Restored==0&&model.LauncherShots==0&&model.ScattergunShots==0,"Mortar cannot inherit another auxiliary fitting.");
    }
    static void MortarCalibration()
    {
        // A paid projection and real model hit test: the farther same-column
        // foe is inside the intended 10m blast but outside the old 7.5m blast.
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.MortarAttack]=100;
        var model=LastStandRunCheckpoint.Start(99,2,"mortar",levels).RestoreModel();
        Set(model,"nextSpawn",10000);Set(model,"nextCannon",10000);
        var center=Enemy(model,0,1,0,14000,5);var nearby=Enemy(model,1,5,0,23000,7);var outside=Enemy(model,2,9,0,24501,0);
        foreach(var foe in new[]{center,nearby,outside})foe.Hull=foe.MaximumHull=10000;
        model.Step();
        Check(center.Hull==7271&&nearby.Hull==7273&&outside.Hull==10000,
            "Level100 Mortar applies2734 before each armor inside10m; the outside enemy is unchanged");
        int hits=0;foreach(var action in model.Events)if(action.Kind==EncounterEventKind.Mortar)hits++;
        Check(model.MortarShots==1&&hits==2,
            "One area cast accounts for exactly two independent hits");
        Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.MortarAttack).DescribeEffect(100)=="2734 damage in a 10m radius",
            "Visible quote describes the actual calibrated blast");
    }
    static void ScatterInterception()
    {
        var current=Fixture(LastStandFitting.Scattergun);
        var edge=Enemy(current,0,1,0,22050,0);edge.Kind=FoeKind.Close;
        var outside=Enemy(current,1,5,0,22051,0);outside.Kind=FoeKind.Close;
        current.Step(); // Close foes move50 before the shot.
        Check(edge.Hull==991&&outside.Hull==1000&&current.ScattergunShots==1,
            "Current Scatter intercepts at22m inclusively with unchanged base damage");
        foreach(var version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion})
        {
            var old=new EncounterModel(LastStandFitting.Scattergun,EncounterProfile.ForTier(2,LastStandRunEdition.Legacy(version)));
            Set(old,"nextSpawn",10000);Set(old,"nextCannon",10000);
            var near=Enemy(old,0,1,0,22050,0);near.Kind=FoeKind.Close;
            var far=Enemy(old,1,5,0,22051,0);far.Kind=FoeKind.Close;
            old.Step();Check(near.Hull==1000&&far.Hull==1000&&old.ScattergunShots==0,"Retained run cannot inherit the new interception range: "+version);
            near.Distance=15050;far.Distance=15051;old.Step();
            Check(near.Hull==991&&far.Hull==1000&&old.ScattergunShots==1,"Retained15m inclusive edge and damage remain exact: "+version);
        }
    }
    static void Railgun()
    {
        var rail=Fixture(LastStandFitting.Railgun);var a=Enemy(rail,0,1,0,18000,500);var b=Enemy(rail,1,5,0,19000,500);
        rail.Step();int hits=0;foreach(var item in rail.Events)if(item.Kind.ToString()=="Railgun")hits++;
        Check(hits==1&&a.Hull==1000-Effect(LastStandUpgradeTrackId.RailgunAttack)&&b.Hull==1000,
            "Railgun penetrates armor on exactly one deterministic target.");
        foreach(var fitting in new[]{LastStandFitting.Launcher,LastStandFitting.Scattergun}){
            var ordinary=Fixture(fitting);var foe=Enemy(ordinary,0,1,0,14000,500);
            ordinary.Step();Check(foe.Hull==999,"Existing auxiliary weapons retain mitigation and minimum-one damage.");
        }
        Check(rail.Restored==0&&rail.LauncherShots==0&&rail.ScattergunShots==0,"Railgun cannot inherit another auxiliary fitting.");
    }
    static void Checkpoint()
    {
        foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}){
            var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[(int)LastStandUpgradeTrackId.CannonAttack]=5;
            var start=LastStandRunCheckpoint.Start(1,1,LastStandFittingCatalog.Id(fitting),levels);
            var model=start.RestoreModel();var shop=start.RestoreShop();
            int remaining=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&remaining-->0)model.Step();
            Check(model.AwaitingWaveCommit&&model.Hull>0,"A real seeded opening wave must finish.");
            shop.ObserveAuthoritativeKills(model.Kills,model.Wave,0);
            var saved=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint());
            var copy=saved.RestoreModel();Check(copy.Snapshot()==model.Snapshot(),"All paid weapon projections, shot counts and timers restore.");
            model.ContinueAfterCheckpoint();copy.ContinueAfterCheckpoint();
            for(int n=0;n<400&&!model.AwaitingWaveCommit;n++){
                model.Step();copy.Step();Check(model.Snapshot()==copy.Snapshot(),"Resume must not reset new weapon cooldowns or duplicate hits.");
            }
        }
    }
    static void Geometry()
    {
        var origin=new EncounterPoint(0,0);
        Check(EncounterGeometry.WithinRadius(origin,new EncounterPoint(4500,6000),7500),"Inclusive exact diagonal radius edge");
        Check(!EncounterGeometry.WithinRadius(origin,new EncounterPoint(4500,6001),7500),"One unit beyond diagonal edge is outside");
        Check(EncounterGeometry.WithinRadius(origin,new EncounterPoint(7500,0),7500)&&
            !EncounterGeometry.WithinRadius(origin,new EncounterPoint(7501,0),7500),"Inclusive axial radius edge");
        for(int lane=0;lane<8;lane++)for(int id=1;id<=4;id++)foreach(int distance in new[]{0,1,100,25000,1000000000}) {
            var a=EncounterGeometry.Position(lane,id,distance);
            var opposite=EncounterGeometry.Position((lane+4)%8,id,distance);var quarter=EncounterGeometry.Position((lane+2)%8,id,distance);
            Check(a.X==-opposite.X&&a.Z==-opposite.Z,"Exact opposite-lane symmetry for every formation column");
            Check(a.X==-quarter.Z&&a.Z==quarter.X,"Exact quarter-turn symmetry for every formation column");
            for(int other=0;other<8;other++) {
                var b=EncounterGeometry.Position(other,5-id,1000000000);decimal dx=(decimal)a.X-b.X,dz=(decimal)a.Z-b.Z;
                foreach(int radius in new[]{0,7500,1000000000})
                    Check(EncounterGeometry.WithinRadius(a,b,radius)==(dx*dx+dz*dz<=(decimal)radius*radius),
                        "Maximum-distance squared arithmetic matches independent decimal arithmetic");
            }
        }
    }
    static void CenterDeath()
    {
        var model=Fixture(LastStandFitting.Mortar);
        for(int i=0;i<3;i++){var foe=Enemy(model,i,1+4*i,0,18000+i*100,0);foe.Hull=foe.MaximumHull=1;}
        model.Step();int hits=0;var slots=new HashSet<int>();
        foreach(var action in model.Events)if(action.Kind==EncounterEventKind.Mortar) {
            hits++;Check(slots.Add(action.Slot)&&action.Killed&&action.AimSlot==0,"One hit per slot retains the original aim center after its death");
        }
        Check(hits==3&&model.Kills==3&&model.CurrentWaveKillMask==7,"One actual killed identity per blast victim");
        model.Step();Check(model.Kills==3&&model.MortarShots==1,"Dead victims cannot be hit, counted or fired upon again");
    }
    static void Priority()
    {
        var model=Fixture(LastStandFitting.Railgun);
        var near=Enemy(model,0,1,0,17000,10);var later=Enemy(model,1,10,0,18000,500);var earlier=Enemy(model,2,2,0,18000,500);
        model.Step();
        Check(near.Hull==1000&&later.Hull==1000&&earlier.Hull==960,"Railgun chooses highest armor, then distance, then lowest id");
        var distance=Fixture(LastStandFitting.Railgun);
        var far=Enemy(distance,0,1,0,19000,500);var close=Enemy(distance,1,5,0,18000,500);
        distance.Step();Check(far.Hull==1000&&close.Hull==960,"Equal armor compares distance before id");
    }
    static void Cadence()
    {
        foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}) {
            var model=Fixture(fitting);Enemy(model,0,1,0,18000,0);
            for(int tick=1;tick<=121;tick++) {
                model.Step();int hits=0;
                foreach(var action in model.Events)if(action.Kind==EncounterEventKind.Mortar||action.Kind==EncounterEventKind.Railgun)hits++;
                Check(hits==(tick==1||tick==61||tick==121?1:0),"Exact60-tick cadence for "+fitting+" at tick "+tick);
            }
            Check(model.LauncherShots==0&&model.ScattergunShots==0&&model.Restored==0,"Exactly one selected auxiliary owns the cadence");
        }
    }
    // Copy through the actual immutable checkpoint constructor. All untouched
    // fields come from a real capture; each negative changes only its named inputs.
    static EncounterCheckpoint Copy(EncounterCheckpoint source,string field,int value,string second=null,int secondValue=0)
    {
        var constructor=typeof(EncounterCheckpoint).GetConstructors()[0];var parameters=constructor.GetParameters();var values=new object[parameters.Length];
        bool firstFound=false,secondFound=second==null;
        for(int i=0;i<parameters.Length;i++) {
            string name=parameters[i].Name;
            var member=typeof(EncounterCheckpoint).GetField(name,BindingFlags.Instance|BindingFlags.Public|BindingFlags.IgnoreCase);
            Check(member!=null,"Actual checkpoint constructor field mapping: "+name);values[i]=member.GetValue(source);
            if(name==field){values[i]=value;firstFound=true;}if(name==second){values[i]=secondValue;secondFound=true;}
        }
        Check(firstFound&&secondFound,"Named immutable checkpoint mutation must exist");
        return (EncounterCheckpoint)constructor.Invoke(values);
    }
    static void Refuse(EncounterModel original,EncounterCheckpoint candidate,string reason)
    {
        string before=original.Snapshot();bool rejected=false;
        try{EncounterModel.RestoreCheckpoint(original.Profile,original.Fitting,candidate);}catch(ArgumentException){rejected=true;}
        Check(original.Snapshot()==before,"Refused restore never mutates its source model");Check(rejected,reason);
    }
    static void Inactive(bool damage)
    {
        foreach(var edition in new[]{LastStandRunEdition.Current,LastStandRunEdition.Legacy(LastStandUpgradeCatalog.RetainedEconomyVersion)})
        foreach(var fitting in new[]{LastStandFitting.Repair,LastStandFitting.Launcher,LastStandFitting.Scattergun,LastStandFitting.Mortar,LastStandFitting.Railgun}) {
            if(!edition.Supports(fitting))continue;
            var model=new EncounterModel(fitting,EncounterProfile.ForTier(1,edition));var saved=model.CaptureCheckpoint();
            Check(EncounterModel.RestoreCheckpoint(model.Profile,fitting,saved).Snapshot()==model.Snapshot(),"Unchanged current/retained starting checkpoint is valid");
            if(fitting!=LastStandFitting.Mortar)Refuse(model,Copy(saved,damage?"mortarDamage":"nextMortarTick",damage?19:2),
                "Inactive Mortar "+(damage?"damage must stay at base":"timer must stay at1")+" for "+fitting);
            if(fitting!=LastStandFitting.Railgun)Refuse(model,Copy(saved,damage?"railgunDamage":"nextRailgunTick",damage?41:2),
                "Inactive Railgun "+(damage?"damage must stay at base":"timer must stay at1")+" for "+fitting);
        }
    }
    static void Unfired()
    {
        foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}) {
            var model=new EncounterModel(fitting,EncounterProfile.ForTier(1));var saved=model.CaptureCheckpoint();
            Refuse(model,Copy(saved,fitting==LastStandFitting.Mortar?"nextMortarTick":"nextRailgunTick",2),
                "Unfired selected "+fitting+" keeps its initial timer1");
        }
    }
    static EncounterModel Cleared(LastStandFitting fitting)
    {
        var levels=new int[LastStandUpgradeCatalog.Tracks.Count];levels[0]=5;
        var start=LastStandRunCheckpoint.Start(1,1,LastStandFittingCatalog.Id(fitting),levels);var model=start.RestoreModel();
        int budget=20000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0)model.Step();
        Check(model.AwaitingWaveCommit&&model.Hull>0&&model.Tick>60,"Actual completed cohort supplies nontrivial shot/timer checkpoint");
        Check(EncounterModel.RestoreCheckpoint(model.Profile,fitting,model.CaptureCheckpoint()).Snapshot()==model.Snapshot(),"Untouched completed checkpoint restores exactly");
        return model;
    }
    static void ShotCount()
    {
        foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}) {
            var model=Cleared(fitting);var saved=model.CaptureCheckpoint();
            Refuse(model,Copy(saved,fitting==LastStandFitting.Mortar?"mortarShots":"railgunShots",model.Tick/60+2),
                "Shot count cannot exceed elapsed60-tick opportunities for "+fitting);
        }
    }
    static void ShotTimer()
    {
        foreach(var fitting in new[]{LastStandFitting.Mortar,LastStandFitting.Railgun}) {
            var model=Cleared(fitting);var saved=model.CaptureCheckpoint();
            Refuse(model,Copy(saved,fitting==LastStandFitting.Mortar?"mortarShots":"railgunShots",2,
                fitting==LastStandFitting.Mortar?"nextMortarTick":"nextRailgunTick",61),
                "Two shots need a next timer at least121, preserving60-tick spacing for "+fitting);
        }
    }
    static int Main(string[] args)
    {
        try{switch(args[0]){case "mortar":Mortar();break;case "mortar-calibration":MortarCalibration();break;case "scatter-interception":ScatterInterception();break;case "railgun":Railgun();break;case "checkpoint":Checkpoint();break;
            case "geometry":Geometry();break;case "center-death":CenterDeath();break;case "priority":Priority();break;case "cadence":Cadence();break;
            case "inactive-timer":Inactive(false);break;case "inactive-damage":Inactive(true);break;case "unfired":Unfired();break;
            case "shot-count":ShotCount();break;case "shot-timer":ShotTimer();break;default:throw new Exception("Unknown case.");}
            Console.WriteLine("PASS "+args[0]);return 0;}
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

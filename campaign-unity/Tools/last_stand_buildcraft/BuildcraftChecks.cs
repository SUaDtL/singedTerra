using System;
using System.IO;
using System.Collections.Generic;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

// Gifted mechanics fixtures use the production codecs and simulated boundaries;
// these are compatibility tests, not evidence of an earned economy progression.
namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        public static string BuildcraftFixture(string fresh,int bestWave,string retainedEconomy=null,bool active=false,int bestTier=1)
        {
            if(!TryParseSave(fresh,out var row,out var migrate))throw new Exception("fixture base");
            row.Wallet=12345;
            for(int tier=1;tier<=bestTier;tier++){
                var definition=LastStandTierCatalog.Get(tier);int completed=tier==bestTier?bestWave:300;
                row.Tiers[definition.Key].BestWave=completed;row.Tiers[definition.Key].Unlocked=true;
                foreach(var milestone in LastStandRewardCatalog.Milestones(definition))if(milestone.Wave<=completed)row.FirstClears.Add(milestone.Id);
            }
            ReconcileUnlocks(row);
            if(active){
                var edition=LastStandRunEdition.ForEconomy(retainedEconomy);var tracks=LastStandUpgradeCatalog.ForEconomy(retainedEconomy).Tracks;
                var levels=new int[tracks.Count];foreach(var track in tracks){levels[(int)track.Id]=track.Available?track.PermanentCap:0;row.Levels[(int)track.Id]=levels[(int)track.Id];}
                row.SelectedTier=bestTier;row.SelectedFitting="repair";row.Checkpoint=LastStandRunCheckpoint.Start(1,bestTier,"repair",levels,edition);row.NextRunId=2;
                row.History.Begin(1,bestTier,"repair",retainedEconomy,ResearchContext(row));
                var model=row.Checkpoint.RestoreModel();var shop=row.Checkpoint.RestoreShop();
                for(int wave=1;wave<=bestWave;wave++){
                    int budget=100000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}
                    if(!model.AwaitingWaveCommit||model.Hull==0)throw new Exception("fixture failed at wave "+wave);
                    var reward=LastStandRewardCatalog.At(edition.Tier(bestTier),wave,edition);
                    if(!row.History.BankWave(wave,reward.RepeatableSalvage,reward.FirstClearSalvage,0,ResearchContext(row,shop.CaptureCheckpoint())))throw new Exception("fixture history");
                    row.Checkpoint=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint(),edition.ContentVersion);
                    if(wave<bestWave){model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);}
                }
            }
            var data=LastStandSaveJson.Read(Serialize(row));
            if(retainedEconomy!=null){
                data["version"]=7;data.Remove("secondaryFitting");data.Remove("loadoutPresets");data.Remove("skills");
                var levels=LastStandSaveJson.Object(data["permanentLevels"]);levels.Remove("arcOutput");levels.Remove("shieldCapacity");
                var tiers=LastStandSaveJson.Object(data["tierRecords"]);tiers.Remove("tier-5");tiers.Remove("tier-6");
                var fittings=LastStandSaveJson.Array(data["unlockedFittings"]);fittings.Remove("arc");fittings.Remove("shield");
            }
            return LastStandSaveJson.Write(data);
        }
    }
}

static class BuildcraftChecks
{
    sealed class Store : ILastStandStorage
    {
        public string Raw; public bool Fail=false;
        public string Read()=>Raw;
        public void Write(string value){if(Fail)throw new IOException("planned failed write");Raw=value;}
    }
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static void Reject(Action action,string message){try{action();}catch(ArgumentException){return;}throw new Exception(message);}
    static Store Fixture(int bestWave,string economy=null,bool active=false,int bestTier=1)
    {var store=new Store();LastStandProgression.Load(store);store.Raw=LastStandProgression.BuildcraftFixture(store.Raw,bestWave,economy,active,bestTier);return store;}
    static void Complete(EncounterModel model,LastStandShopState shop)
    {int budget=100000;while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0){model.Step();shop.ObserveAuthoritativeKills(model,0);}Check(model.AwaitingWaveCommit&&model.Hull>0,"real wave clear");}
    static string RetainedBaseline()
    {
        var rows=new List<object>();
        foreach(string economy in new[]{"long-run-economy-v1","research-farming-economy-v2","research-farming-economy-v3","combat-depth-economy-v4"})
        {
            bool depth=economy=="combat-depth-economy-v4";
            var edition=LastStandRunEdition.Resolve(depth?"last-stand-waves-v2":"last-stand-waves-v1",depth?"last-stand-content-v2":"last-stand-content-v1",economy);
            var tracks=LastStandUpgradeCatalog.ForEconomy(economy).Tracks;var levels=new int[tracks.Count];
            levels[0]=100;levels[2]=100;levels[5]=100;
            var cp=LastStandRunCheckpoint.Start(1,1,"launcher",levels,edition);
            var model=cp.RestoreModel();var shop=cp.RestoreShop();
            for(int wave=1;wave<=3;wave++)
            {
                int budget=20000;
                while(!model.AwaitingWaveCommit&&model.Status==EncounterStatus.Running&&budget-->0)
                {model.Step();shop.ObserveAuthoritativeKills(model,0);}
                Check(model.AwaitingWaveCommit&&model.Hull>0,"baseline clear");
                cp=new LastStandRunCheckpoint(1,model.CaptureCheckpoint(),shop.CaptureCheckpoint(),edition.ContentVersion);
                if(wave==3)break;
                model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);
                var buy=shop.TryPurchase(new LastStandShopPurchaseIntent(1,shop.Version,LastStandUpgradeTrackId.CannonAttack));
                Check(buy.Accepted,"baseline paid purchase");model.ApplyShopProjection(shop);
            }
            var priceRows=new List<object>();foreach(var track in tracks)
                priceRows.Add(new object[]{track.Key,track.RunPrice(1),track.RunPrice(Math.Min(20,track.TotalCap)),track.PermanentPrice(Math.Min(100,track.PermanentCap)),track.EffectAt(Math.Min(100,track.TotalCap),30)});
            rows.Add(new Dictionary<string,object>{{"economy",economy},{"snapshot",model.Snapshot()},
                {"scrap",shop.Scrap},{"spent",shop.SpentScrap},{"tiers",edition.Tiers.Count},{"fittings",edition.Fittings.Count},
                {"prices",priceRows},{"reward750",LastStandRewardCatalog.At(edition.Tier(1),750,edition).FirstClearSalvage}});
        }
        return LastStandSaveJson.Write(rows);
    }
    static int Main(string[] args)
    {
        try
        {
            if(args[0]=="capture"){File.WriteAllText(args[1],RetainedBaseline());return 0;}
            if(args[0]=="retained")Check(File.ReadAllText(args[1])==RetainedBaseline(),"retained edition combat, accounting or catalog changed");
            else if(args[0]=="edition")Check(LastStandRunEdition.Buildcraft.RulesVersion=="last-stand-waves-v3"&&LastStandRunEdition.Current.RulesVersion=="last-stand-waves-v4","buildcraft remains retained beside the new skills edition");
            else if(args[0]=="campaign"){
                Check(LastStandFittingCatalog.Definitions.Count==7,"seven authored fitting choices");
                Check(LastStandTierCatalog.All.Count==6,"six authored campaign tiers");
                Check(LastStandRunEdition.CombatDepth.Tiers.Count==4&&LastStandRunEdition.CombatDepth.Fittings.Count==5,"frozen v2 roster");
                foreach(var tier in new[]{5,6})Check(LastStandTierCatalog.Get(tier).RequiredTier==tier-1&&LastStandTierCatalog.Get(tier).RequiredWave==300,"new tier unlock chain");
                foreach(int bestTier in new[]{2,3,4}){
                    var store=Fixture(0);store.Raw=LastStandProgression.BuildcraftFixture(store.Raw,bestTier==3?100:300,LastStandUpgradeCatalog.CombatDepthEconomyVersion,false,bestTier);
                    var profile=LastStandProgression.Load(store);Check(profile.SaveState=="ready"&&profile.Wallet==12345&&profile.SelectedTier==1,"retained campaign migration without currency or forced promotion");
                    if(bestTier==2)Check(profile.IsFittingUnlocked("arc")&&profile.IsTierUnlocked(3),"same-wave fitting and tier unlock");
                    if(bestTier==3)Check(profile.IsFittingUnlocked("shield"),"retained shield backfill");
                    if(bestTier==4)Check(profile.IsTierUnlocked(5)&&!profile.IsTierUnlocked(6),"only earned new tier");
                }
                var visible=LastStandTierCatalog.Visible(LastStandTierCatalog.All,id=>id<=3);Check(visible.Count==4&&visible[3].Id==4,"one locked preview");
            }
            else if(args[0]=="retained-save"){
                foreach(string economy in new[]{"long-run-economy-v1","research-farming-economy-v2","research-farming-economy-v3","combat-depth-economy-v4"}){
                    var store=Fixture(0,economy,true);var original=LastStandSaveJson.Read(store.Raw);
                    string savedCheckpoint=LastStandSaveJson.Write(original["checkpoint"]);var profile=LastStandProgression.Load(store);
                    Check(profile.SaveState=="ready"&&profile.Wallet==12345&&profile.Checkpoint.Shop.EconomyVersion==economy,"retained save migration "+economy);
                    Check(savedCheckpoint==LastStandSaveJson.Write(LastStandSaveJson.Read(store.Raw)["checkpoint"]),"retained checkpoint payload preserved "+economy);
                    profile=LastStandProgression.Load(store);Check(profile.SaveState=="ready"&&profile.Checkpoint.Loadout.Count==1,"retained checkpoint reload "+economy);
                }
            }
            else if(args[0]=="schema")
            {
                var store=new Store();var profile=LastStandProgression.Load(store);
                Check(profile.SaveState=="ready","fresh profile");var data=LastStandSaveJson.Read(store.Raw);
                Check(LastStandSaveJson.Integer(data["version"])==9,"skills profile retains bounded loadout fields");
                Check(data.ContainsKey("secondaryFitting")&&LastStandSaveJson.Array(data["loadoutPresets"]).Count==3,"bounded loadout fields");
            }
            else if(args[0]=="loadout"){
                Reject(()=>new LastStandLoadout("launcher","launcher"),"duplicate fitting");
                Reject(()=>new LastStandLoadout("unknown"),"unknown fitting");
                var both=new LastStandLoadout("launcher","repair");Reject(()=>both.ValidateEdition(LastStandRunEdition.CombatDepth),"retained edition must reject second bay");
                var store=Fixture(0);var profile=LastStandProgression.Load(store);string before=store.Raw;
                Check(!profile.TryApplyLoadout(both)&&store.Raw==before,"locked bay rejects without writing");
                store=Fixture(750);profile=LastStandProgression.Load(store);
                Check(profile.EquipmentBayCount==2&&profile.TryApplyLoadout(both)&&profile.TryDeploy(),"earned two-bay deployment");
                var model=profile.Checkpoint.RestoreModel();var shop=profile.Checkpoint.RestoreShop();
                Check(model.HasLauncher&&model.HasRepair&&shop.GetTrack(LastStandUpgradeTrackId.FieldRepair).IsEligible,"both fittings and secondary upgrades active");
                Complete(model,shop);Check(profile.TryCommitWave(model,shop),"two-bay clear commit");
                var restored=LastStandProgression.Load(store);Check(restored.SaveState=="ready"&&restored.Checkpoint.Loadout.Equals(both),"two-bay resume");
                Check(restored.Checkpoint.RestoreModel().Snapshot()==profile.Checkpoint.RestoreModel().Snapshot(),"resumed deterministic snapshot");
            }
            else if(args[0]=="preset"){
                var store=Fixture(750);var profile=LastStandProgression.Load(store);Check(profile.TryDeploy(),"active run");
                var original=profile.Checkpoint.Loadout;var both=new LastStandLoadout("launcher","repair");long revision=profile.Revision;string before=store.Raw;
                Check(!profile.TryApplyLoadoutPreset(0,"Farm",both,revision-1)&&store.Raw==before,"stale revision cannot change either value");
                store.Fail=true;Check(!profile.TryApplyLoadoutPreset(0,"Farm",both,revision),"failed durable write");
                Check(profile.LoadoutPresets[0]==null&&profile.SelectedLoadout.Equals(original)&&store.Raw==before,"save failure exposes neither partial mutation");
                store.Fail=false;Check(profile.Retry(),"retry same atomic transaction");
                Check(profile.LoadoutPresets[0].Name=="Farm"&&profile.SelectedLoadout.Equals(both)&&profile.Checkpoint.Loadout.Equals(original),"only future deployment changes");
                profile=LastStandProgression.Load(store);Check(profile.SaveState=="ready"&&profile.SelectedLoadout.Equals(both)&&profile.Checkpoint.Loadout.Equals(original),"selected future loadout survives active resume");
                Check(profile.TryFinalizeRun()&&profile.TryDeploy()&&profile.Checkpoint.Loadout.Equals(both),"next deployment adopts saved preset");
                Check(!profile.TrySaveLoadoutPreset(3,"Overflow",both)&&!profile.TrySaveLoadoutPreset(0,new string('x',33),both),"bounded preset slots and names");
            }
            else if(args[0]=="rewards"){
                var milestone=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),750).Milestone;bool bay=false;foreach(var reward in milestone.Rewards)if(reward.Kind==LastStandRewardKind.EquipmentBays&&reward.Amount==2)bay=true;
                Check(bay&&milestone.FirstClearSalvage==375,"typed bundle retains currency and adds entitlement");
                Check(LastStandRewardCatalog.Entitlements(t=>t==1?749:0).EquipmentBays==1&&LastStandRewardCatalog.Entitlements(t=>t==1?750:0).EquipmentBays==2,"exact bay threshold");
                Check(LastStandRewardCatalog.Entitlements(t=>t==1?500:0).CombatResearch&&LastStandRewardCatalog.Entitlements(t=>t==2?500:0).ResearchLabs==3,"shared research entitlements");
                foreach(var grant in LastStandRewardCatalog.At(LastStandRunEdition.CombatDepth.Tier(1),750,LastStandRunEdition.CombatDepth).Milestone.Rewards)Check(grant.Kind!=LastStandRewardKind.EquipmentBays,"old rewards frozen");
                Reject(()=>new LastStandMilestone("test",10,new[]{new LastStandRewardGrant(LastStandRewardKind.Fitting,"repair"),new LastStandRewardGrant(LastStandRewardKind.Fitting,"repair")}),"duplicate reward rejection");
            }
            else if(args[0]=="retained-clear"){
                var store=Fixture(749,LastStandUpgradeCatalog.CombatDepthEconomyVersion,true);string prior=store.Raw;
                var profile=LastStandProgression.Load(store);Check(profile.SaveState=="ready"&&profile.Wallet==12345&&profile.EquipmentBayCount==1,"v7 retained boundary migration preserves wallet");
                var model=profile.Checkpoint.RestoreModel();var shop=profile.Checkpoint.RestoreShop();
                model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);Complete(model,shop);
                int oldWallet=profile.Wallet;var expected=LastStandRewardCatalog.At(LastStandRunEdition.CombatDepth.Tier(1),750,LastStandRunEdition.CombatDepth);
                store.Fail=true;Check(!profile.TryCommitWave(model,shop)&&profile.EquipmentBayCount==1&&profile.Wallet==oldWallet&&profile.LastReceipt==null,"failed save exposes no new entitlement, receipt or payout");
                store.Fail=false;Check(profile.Retry()&&profile.EquipmentBayCount==2&&profile.LastReceipt.UnlockedEquipmentBays==2,"retained run earns new permanent bay and receipt at durable clear");
                Check(profile.Wallet==oldWallet+expected.RepeatableSalvage+expected.FirstClearSalvage,"old payout unchanged");
                int awarded=profile.Wallet;Check(!profile.TryCommitWave(model,shop)&&profile.Wallet==awarded,"same boundary cannot pay twice");
                string saved=store.Raw;profile=LastStandProgression.Load(store);Check(profile.SaveState=="ready"&&profile.EquipmentBayCount==2&&profile.Wallet==awarded&&store.Raw==saved,"repeated reload grants no currency");
                Check(profile.Checkpoint.Edition.RulesVersion==LastStandRunEdition.CombatDepthRulesVersion&&prior!=store.Raw,"retained rules preserved");
                store=Fixture(750,LastStandUpgradeCatalog.CombatDepthEconomyVersion);profile=LastStandProgression.Load(store);Check(profile.EquipmentBayCount==2&&profile.Wallet==12345,"already-earned migration grants entitlement only");
            }
            else if(args[0]=="malformed"){
                var store=Fixture(0);var data=LastStandSaveJson.Read(store.Raw);var slots=LastStandSaveJson.Array(data["loadoutPresets"]);
                slots[0]=new Dictionary<string,object>{{"name","Locked"},{"loadout",new Dictionary<string,object>{{"primary","launcher"},{"secondary","repair"}}}};
                store.Raw=LastStandSaveJson.Write(data);string raw=store.Raw;var profile=LastStandProgression.Load(store);
                Check(profile.SaveState=="blocked"&&store.Raw==raw,"unearned preset cannot enter profile");
                store=Fixture(0);store.Raw=LastStandProgression.BuildcraftFixture(store.Raw,100,null,false,3);profile=LastStandProgression.Load(store);
                Check(profile.TryApplyLoadout(new LastStandLoadout("shield"))&&profile.TryDeploy(),"shield fixture deployment");
                string good=store.Raw;
                foreach(string field in new[]{"shield","shieldCapacity","nextArcTick","arcDamage","unfundedResearch"}){
                    data=LastStandSaveJson.Read(good);var checkpoint=LastStandSaveJson.Object(data["checkpoint"]);var combat=LastStandSaveJson.Object(checkpoint["buildcraft"]);
                    if(field=="unfundedResearch")LastStandSaveJson.Object(checkpoint["combatResearch"])["areaControl"]=1;
                    else combat[field]=field=="shield"?59:field=="shieldCapacity"?61:field=="arcDamage"?17:0;
                    store.Raw=LastStandSaveJson.Write(data);raw=store.Raw;profile=LastStandProgression.Load(store);
                    Check(profile.SaveState=="blocked"&&store.Raw==raw,"malformed or unfunded snapshot preserves rejected bytes: "+field);
                }
            }
            else if(args[0]=="retained-receipt"){
                foreach(int tier in new[]{2,4}){
                    var store=Fixture(299,LastStandUpgradeCatalog.CombatDepthEconomyVersion,true,tier);var profile=LastStandProgression.Load(store);
                    Check(profile.SaveState=="ready","retained reward fixture");var model=profile.Checkpoint.RestoreModel();var shop=profile.Checkpoint.RestoreShop();
                    model.ContinueAfterCheckpoint();shop.UpdatePurchaseLifecycle(LastStandShopPurchaseLifecycle.Running);Complete(model,shop);
                    Check(profile.TryCommitWave(model,shop),"retained accepted boundary");
                    if(tier==2)Check(profile.IsFittingUnlocked("arc")&&profile.LastReceipt.UnlockedFitting=="arc"&&profile.LastReceipt.UnlockedTier==3,"retained receipt announces reconciled fitting beside old tier");
                    else Check(profile.IsTierUnlocked(5)&&profile.LastReceipt.UnlockedTier==5,"retained receipt announces reconciled tier");
                }
            }
            else throw new Exception("Unknown case");
            Console.WriteLine("PASS "+args[0]);return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

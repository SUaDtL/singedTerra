using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

namespace SingedTerra.Encounter
{
    public sealed partial class EncounterModel
    {
        // Isolated spawn parity only, never earned progress or a resumable save.
        public void InformationWave(int wave,bool populate=false)
        {
            Wave=wave;
            if(populate)for(int n=0;n<WaveEnemyCount;n++)Spawn();
        }
    }
}

static class WaveInformationChecks
{
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static void UpcomingParity(LastStandRunEdition edition,int tier,int bossWave)
    {
        var loadout=new LastStandLoadout("repair");var levels=new int[LastStandUpgradeCatalog.ForEconomy(edition.EconomyVersion).Tracks.Count];
        levels[(int)LastStandUpgradeTrackId.Armor]=5;
        var shop=new LastStandShopState(1,loadout.Primary,levels,edition.EconomyVersion,edition,tier,loadout);
        var current=EncounterModel.CreatePlayable(loadout.Primary,tier,shop);current.InformationWave(bossWave-1);
        string before=current.Snapshot();var saved=shop.CaptureCheckpoint();
        var info=new LastStandWaveInformation(current,shop,3);var next=info.Upcoming;
        Need(next!=null&&next.IsPreview&&next.Wave==bossWave,"Upcoming milestone/boss wave must precede actual spawning");
        var spawn=EncounterModel.CreatePlayable(loadout.Primary,tier,shop);spawn.InformationWave(bossWave,true);
        bool boss=false;
        foreach(var enemy in next.Enemies){
            int count=0;
            foreach(var foe in spawn.Foes)if(foe.Alive&&foe.Kind==enemy.Kind){
                count++;
                Need(enemy.Hull==foe.MaximumHull&&enemy.Armor==foe.Armor&&enemy.RawDamage==foe.Damage,"Preview HP, armor and damage must match actual Spawn");
            }
            Need(count==enemy.Count,"Preview population matches actual spawned identities");
            var definition=LastStandEnemyCatalog.ForKind(enemy.Kind,LastStandWaveCatalog.ForWave(edition.Tier(tier),bossWave,edition),edition);
            Need(enemy.ShieldBuffer==definition.ShieldBuffer&&enemy.HealingBudget==definition.HealingBudget&&enemy.HealingPerPulse==definition.HealingPerPulse&&
                enemy.SupportTargets==definition.SupportTargets&&enemy.SupportRadius==definition.SupportRadius/1000m&&enemy.TelegraphSeconds==definition.TelegraphTicks/20m,
                "Preview support limits and windup match the spawning projection");
            var reward=shop.ProjectKillReward(bossWave,enemy.Kind,3);
            Need(enemy.Reward.BaseScrap==reward.BaseScrap&&enemy.Reward.EffectiveScrap==reward.EffectiveScrap,"Preview uses admitted edition and current income owners");
            Need(enemy.DamageAfterArmor==current.IncomingDamagePerHit(enemy.RawDamage),"Preview uses current armor");
            if(enemy.Kind==FoeKind.SiegeCommander||enemy.Kind==FoeKind.SiegeElite){
                boss=true;Need(enemy.Kind==(edition.IsBuildcraft&&bossWave%100==0?FoeKind.SiegeCommander:FoeKind.SiegeElite),"Retained waves do not acquire a new Commander");
            }
        }
        Need(boss&&next.Describe().Contains("UPCOMING WAVE "+bossWave)&&!next.Describe().Contains("Wave cleared"),"Future boss is visibly a preview, never a completed wave");
        Need(info.Describe().Contains(next.Describe()),"The existing enemy screen actually renders the preview");
        var after=shop.CaptureCheckpoint();
        Need(before==current.Snapshot()&&saved.PurchaseSequence==after.PurchaseSequence&&saved.Scrap==after.Scrap&&saved.UniqueKills==after.UniqueKills&&
            saved.IncomeRemainder==after.IncomeRemainder&&saved.DefeatedMask==after.DefeatedMask,"Reading future stats leaves combat and saved accounting unchanged");
    }
    static int Main()
    {
        try
        {
            var loadout=new LastStandLoadout("repair","shield");
            var levels=new int[LastStandUpgradeCatalog.Tracks.Count];
            var shop=new LastStandShopState(1,loadout.Primary,levels,LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,5,loadout);
            var model=EncounterModel.CreatePlayable(shop.Fitting,5,shop);
            string description=new LastStandWaveInformation(model,shop,0).Describe();
            Need(description.Contains("Shield buffer:")&&description.Contains("Healing budget:"),"Support roles must explain their finite strength in current-wave information.");
            Need(description.Contains("YOUR SHIELD")&&description.Contains("after your armor"),"Tank shield and enemy damage timing must be distinct.");
            Need(description.Contains("UPCOMING WAVE"),"Wave information must preview the next milestone or boss before it spawns.");
            var other=new LastStandShopState(1,loadout.Primary,levels,LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,5,new LastStandLoadout("repair","launcher"));
            bool refused=false;try{_=new LastStandWaveInformation(model,other,0);}catch(ArgumentException){refused=true;}
            Need(refused,"Secondary-bay mismatch cannot supply wave statistics.");
            Need(LastStandMilestonePresentation.NextGoal(1,749).Contains("Bay 2"),"The next milestone must announce the second equipment bay.");
            Need(LastStandMilestonePresentation.NextGoal(2,499).Contains("Lab 3"),"The next milestone must announce the third research lab.");
            foreach(int tier in new[]{5,6})foreach(int wave in new[]{50,100})UpcomingParity(LastStandRunEdition.Current,tier,wave);
            foreach(int tier in new[]{2,4})foreach(int wave in new[]{50,100})UpcomingParity(LastStandRunEdition.CombatDepth,tier,wave);
            model.InformationWave(int.MaxValue);Need(new LastStandWaveInformation(model,shop,0).Upcoming==null,"Preview cannot overflow beyond the last representable wave");
            Console.WriteLine("PASS Wave information support and build ownership");return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

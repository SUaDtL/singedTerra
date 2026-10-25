using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class WaveInformationChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static int Main()
    {
        try {
            foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.EconomyVersion})
            foreach(int tier in new[]{1,2}) {
                var rules=LastStandUpgradeCatalog.ForEconomy(version);var levels=new int[rules.Tracks.Count];
                foreach(var track in rules.Tracks)levels[(int)track.Id]=Math.Min(track.PermanentCap,500);
                var shop=new LastStandShopState(23,LastStandFitting.Repair,levels,version);
                var model=EncounterModel.CreatePlayable(shop.Fitting,tier,shop);
                for(int i=0;model.Wave<30 && i<100000;i++) {
                    model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,3);
                    if(model.AwaitingWaveCommit)model.ContinueAfterCheckpoint();
                }
                Check(model.Wave==30,"fixture reaches actual wave 30");
                string before=model.Snapshot();int scrap=shop.Scrap,revision=shop.Version;
                var info=new LastStandWaveInformation(model,shop,3);var wave=LastStandWaveCatalog.ForWave(tier,30);
                Check(info.Tier==tier && info.Wave==30 && info.TotalEnemies==7 && info.RemainingEnemies==7,"current wave identity and remaining enemies");
                int total=0;
                foreach(var enemy in info.Enemies) {
                    total+=enemy.Count;
                    Check(enemy.Hull==wave.EnemyHull && enemy.RawDamage==wave.EnemyDamage && enemy.Armor==0,"full enemy combat stats");
                    Check(enemy.DamageAfterArmor==1,"current armor projection retains the one-damage floor");
                    Check(enemy.AttackSeconds==(enemy.Kind==FoeKind.Close?1m:1.5m),"actual attack cadence at 1x");
                    Check(enemy.MovementUnitsPerSecond==(enemy.Kind==FoeKind.Close?1m:.8m),"actual movement conversion at 1x");
                }
                Check(total==7 && info.Enemies.Count==2,"only generated enemy kinds and complete cohort counts");
                Check(info.RetainedEconomy==(version!=LastStandUpgradeCatalog.EconomyVersion),"saved income disclosure");
                var reward=shop.ProjectKillReward(30,3);
                Check(info.Reward.BaseScrap==reward.BaseScrap && info.Reward.EffectiveScrap==reward.EffectiveScrap && info.Reward.NextKillScrap==reward.NextKillScrap,"production reward projection including bonuses and carry");
                Check(info.Describe().Contains("Fractional value carries") && info.Describe().Contains("saved income")==info.RetainedEconomy,"truthful fractional and saved-run text");
                Check(model.Snapshot()==before && shop.Scrap==scrap && shop.Version==revision,"projection never changes combat or ledger");
                int killed=model.Kills;
                while(model.Kills==killed)model.Step();
                shop.ObserveAuthoritativeKills(model.Kills,model.Wave,3);
                Check(shop.Scrap-scrap==info.Reward.NextKillScrap,"next real kill pays the reported value");
                var after=new LastStandWaveInformation(model,shop,3);
                Check(after.RemainingEnemies==6,"remaining count updates after actual defeat");
                Check(info.RemainingEnemies==7,"earlier read model remains immutable");
                while(!model.AwaitingWaveCommit)model.Step();
                string cleared=new LastStandWaveInformation(model,shop,3).Describe();
                Check(cleared.Contains("Wave cleared; values shown are for this wave.") && !cleared.Contains("Next kill pays"),
                    "a completed wave never predicts the next wave's payout from its own bounty");
            }
            Console.WriteLine("PASS wave-information");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

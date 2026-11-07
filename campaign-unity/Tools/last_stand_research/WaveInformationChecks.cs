using System;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class WaveInformationChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static int Main()
    {
        try {
            foreach(string version in new[]{LastStandUpgradeCatalog.LegacyEconomyVersion,LastStandUpgradeCatalog.PreviousEconomyVersion,LastStandUpgradeCatalog.RetainedEconomyVersion,LastStandUpgradeCatalog.EconomyVersion})
            foreach(int tier in new[]{1,2}) {
                var rules=LastStandUpgradeCatalog.ForEconomy(version);var levels=new int[rules.Tracks.Count];
                foreach(var track in rules.Tracks)levels[(int)track.Id]=track.Available?Math.Min(track.PermanentCap,500):0;
                var shop=new LastStandShopState(23,LastStandFitting.Repair,levels,version,tier:tier);
                var model=EncounterModel.CreatePlayable(shop.Fitting,tier,shop);
                for(int i=0;model.Wave<30 && i<100000;i++) {
                    model.Step();shop.ObserveAuthoritativeKills(model,3);
                    if(model.AwaitingWaveCommit)model.ContinueAfterCheckpoint();
                }
                Check(model.Wave==30,"fixture reaches actual wave 30");
                string before=model.Snapshot();int scrap=shop.Scrap,revision=shop.Version;
                var info=new LastStandWaveInformation(model,shop,3);var wave=LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,30,model.Profile.Edition);
                Check(info.Tier==tier && info.Wave==30 && info.TotalEnemies==7 && info.RemainingEnemies==7,"current wave identity and remaining enemies");
                int total=0;
                foreach(var enemy in info.Enemies) {
                    total+=enemy.Count;
                    var actual=LastStandEnemyCatalog.ForKind(enemy.Kind,wave,model.Profile.Edition);
                    Check(enemy.Hull==actual.Hull && enemy.RawDamage==actual.Damage && enemy.Armor==actual.Armor,"full per-type enemy combat stats");
                    Check(enemy.DamageAfterArmor==1,"current armor projection retains the one-damage floor");
                    Check(enemy.AttackSeconds==actual.AttackIntervalTicks/20m && enemy.TelegraphSeconds==actual.TelegraphTicks/20m,"actual attack cadence/windup at 1x");
                    Check(enemy.MovementUnitsPerSecond==actual.Speed/50m,"actual movement conversion at 1x");
                    int count=0;for(int ordinal=0;ordinal<wave.EnemyCount;ordinal++)
                        if(LastStandEnemyCatalog.For(model.Profile.TierDefinition,30,ordinal,model.Profile.Edition).Kind==enemy.Kind)count++;
                    Check(enemy.Count==count,"each row counts actual generated ordinals");
                    var typed=shop.ProjectKillReward(30,enemy.Kind,3);
                    Check(enemy.Reward.BaseScrap==typed.BaseScrap && enemy.Reward.EffectiveScrap==typed.EffectiveScrap &&
                        enemy.Reward.NextKillScrap==typed.NextKillScrap,"each actual type projects its own reward and carry");
                    if(model.Profile.Edition.IsLegacy || tier==1) {
                        Check(enemy.Hull==wave.EnemyHull && enemy.RawDamage==wave.EnemyDamage && enemy.Armor==0,"retained/onboarding full enemy stats stay exact");
                        Check(enemy.AttackSeconds==(enemy.Kind==FoeKind.Close?1m:1.5m),"retained/onboarding cadence stays exact");
                        Check(enemy.MovementUnitsPerSecond==(enemy.Kind==FoeKind.Close?1m:.8m),"retained/onboarding movement stays exact");
                    }
                }
                Check(total==7 && info.Enemies.Count==(model.Profile.Edition.IsLegacy || tier==1?2:4),"only generated enemy kinds and complete cohort counts");
                Check(info.RetainedEconomy==(version!=LastStandUpgradeCatalog.EconomyVersion),"saved income disclosure");
                var reward=shop.ProjectKillReward(30,3);
                Check(info.Reward.BaseScrap==reward.BaseScrap && info.Reward.EffectiveScrap==reward.EffectiveScrap && info.Reward.NextKillScrap==reward.NextKillScrap,"production reward projection including bonuses and carry");
                Check(info.Describe().Contains("Fractional value carries") && info.Describe().Contains("saved income")==info.RetainedEconomy,"truthful fractional and saved-run text");
                Check(model.Snapshot()==before && shop.Scrap==scrap && shop.Version==revision,"projection never changes combat or ledger");
                int killed=model.Kills;
                while(model.Kills==killed)model.Step();
                LastStandWaveInformation.Enemy killedType=null;
                foreach(var action in model.Events)if(action.Killed)
                    foreach(var enemy in info.Enemies)if(enemy.Kind==model.Foes[action.Slot].Kind)killedType=enemy;
                Check(killedType!=null,"real kill event identifies the actual rewarded type");
                shop.ObserveAuthoritativeKills(model,3);
                Check(shop.Scrap-scrap==killedType.Reward.NextKillScrap,"next real kill pays its reported per-type value");
                if(model.Profile.Edition.IsLegacy || tier==1)Check(shop.Scrap-scrap==info.Reward.NextKillScrap,"retained/onboarding global value stays exact");
                var after=new LastStandWaveInformation(model,shop,3);
                Check(after.RemainingEnemies==6,"remaining count updates after actual defeat");
                Check(info.RemainingEnemies==7,"earlier read model remains immutable");
                while(!model.AwaitingWaveCommit){model.Step();shop.ObserveAuthoritativeKills(model,3);}
                string cleared=new LastStandWaveInformation(model,shop,3).Describe();
                Check(cleared.Contains("Wave cleared; values shown are for this wave.") && !cleared.Contains("Next kill pays") && !cleared.Contains("If this type is the next kill"),
                    "a completed wave never predicts the next wave's payout from its own bounty");
            }
            Console.WriteLine("PASS wave-information");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // A disposable read model of the current encounter. It owns no progression
    // state and reads the same combat/reward owners that resolve actual hits.
    public sealed class LastStandWaveInformation
    {
        public sealed class Enemy
        {
            public FoeKind Kind { get; }
            public string Name { get; }
            public int Count { get; }
            public int Hull { get; }
            public int Armor { get; }
            public int RawDamage { get; }
            public int DamageAfterArmor { get; }
            public decimal AttackSeconds { get; }
            public decimal TelegraphSeconds { get; }
            public decimal MovementUnitsPerSecond { get; }
            public decimal StopDistanceWorldUnits { get; }
            public LastStandKillReward Reward { get; }
            internal Enemy(LastStandEnemyStats stats,int count,EncounterModel model,LastStandKillReward reward)
            {
                Kind=stats.Kind;Name=stats.Name;Count=count;Hull=stats.Hull;Armor=stats.Armor;RawDamage=stats.Damage;
                DamageAfterArmor=model.IncomingDamagePerHit(RawDamage);
                AttackSeconds=(decimal)stats.AttackIntervalTicks/EncounterModel.TicksPerSecond;
                TelegraphSeconds=(decimal)stats.TelegraphTicks/EncounterModel.TicksPerSecond;
                // EncounterView uses one world unit per 1,000 model distance units.
                MovementUnitsPerSecond=(decimal)stats.Speed*EncounterModel.TicksPerSecond/1000;
                StopDistanceWorldUnits=stats.StopDistance/1000m;Reward=reward;
            }
        }
        public int Tier { get; }
        public int Wave { get; }
        public int TotalEnemies { get; }
        public int RemainingEnemies { get; }
        public bool RetainedEconomy { get; }
        // Compatibility base projection. Each enemy row owns its typed reward.
        public LastStandKillReward Reward { get; }
        public IReadOnlyList<Enemy> Enemies { get; }
        public LastStandWaveInformation(EncounterModel model,LastStandShopState shop,int logisticsRank)
        {
            if(model==null)throw new ArgumentNullException(nameof(model));
            if(shop==null)throw new ArgumentNullException(nameof(shop));
            if(!model.Profile.IsWaveBased)throw new ArgumentException("A wave encounter is required.",nameof(model));
            if(shop.Tier!=model.Profile.Tier || shop.Fitting!=model.Fitting ||
                shop.Edition.RulesVersion!=model.Profile.Edition.RulesVersion ||
                shop.Edition.ContentVersion!=model.Profile.Edition.ContentVersion ||
                shop.Edition.EconomyVersion!=model.Profile.Edition.EconomyVersion)
                throw new ArgumentException("Wave information requires matching combat and reward owners.",nameof(shop));
            Tier=model.Profile.Tier;Wave=model.Wave;RemainingEnemies=model.RemainingWaveEnemies;
            var wave=LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,Wave,model.Profile.Edition);TotalEnemies=wave.EnemyCount;
            Reward=shop.ProjectKillReward(Wave,logisticsRank);
            RetainedEconomy=shop.EconomyVersion!=LastStandUpgradeCatalog.EconomyVersion;
            var counts=new Dictionary<FoeKind,int>();
            for(int i=0;i<TotalEnemies;i++)
            {
                var kind=LastStandEnemyCatalog.For(model.Profile.TierDefinition,Wave,i,model.Profile.Edition).Kind;
                counts[kind]=counts.TryGetValue(kind,out var count)?count+1:1;
            }
            var enemies=new List<Enemy>();
            foreach(FoeKind kind in Enum.GetValues(typeof(FoeKind)))
                if(counts.TryGetValue(kind,out var count))enemies.Add(new Enemy(
                    LastStandEnemyCatalog.ForKind(kind,wave,model.Profile.Edition),count,model,
                    shop.ProjectKillReward(Wave,kind,logisticsRank)));
            Enemies=enemies.AsReadOnly();
        }
        static string Number(decimal value)=>value.ToString("0.####",CultureInfo.InvariantCulture);
        public string Describe()
        {
            bool sharedValue=true;
            foreach(var enemy in Enemies)
                if(enemy.Reward.BaseScrap!=Reward.BaseScrap || enemy.Reward.EffectiveScrap!=Reward.EffectiveScrap ||
                    enemy.Reward.NextKillScrap!=Reward.NextKillScrap)sharedValue=false;
            var text=new StringBuilder("TIER ").Append(Tier).Append(" / WAVE ").Append(Wave)
                .Append("\nENEMIES LEFT: ").Append(RemainingEnemies).Append(" / ").Append(TotalEnemies)
                .Append("\nFull spawn stats. Timing and movement are at 1x speed.\n");
            foreach(var enemy in Enemies)
            {
                text.Append('\n').Append(enemy.Name.ToUpperInvariant()).Append(" / ").Append(enemy.Count).Append(" THIS WAVE")
                    .Append("\nHP: ").Append(enemy.Hull).Append("\nArmor: ").Append(enemy.Armor==0?"none":enemy.Armor.ToString(CultureInfo.InvariantCulture))
                    .Append("\nDamage: ").Append(enemy.RawDamage).Append(" / ").Append(enemy.DamageAfterArmor).Append(" after your armor")
                    .Append("\nAttack interval: ").Append(Number(enemy.AttackSeconds)).Append(" s")
                    .Append("\nWindup: ").Append(Number(enemy.TelegraphSeconds)).Append(" s")
                    .Append("\nMovement: ").Append(Number(enemy.MovementUnitsPerSecond)).Append(" world units/s")
                    .Append("\nStops at: ").Append(Number(enemy.StopDistanceWorldUnits)).Append(" world units\n");
                if(!sharedValue)AppendReward(text,enemy.Reward,true);
            }
            if(sharedValue) { text.Append("\nVALUE / EACH ENEMY TYPE");AppendReward(text,Reward,false); }
            if(RemainingEnemies==0)text.Append("\nWave cleared; values shown are for this wave.");
            text.Append("\nFractional value carries forward; individual whole-Scrap payouts can differ.");
            if(!sharedValue)text.Append(" Each type's next-kill value uses the current shared carry; every kill updates that carry.");
            if(RetainedEconomy)text.Append("\n\nThis run keeps its saved income and upgrade rules. The new income curve starts with your next run.");
            return text.ToString();
        }
        void AppendReward(StringBuilder text,LastStandKillReward reward,bool typed)
        {
            text.Append("\nBase: ").Append(reward.BaseScrap).Append(" Scrap")
                .Append("\nScrap Yield: ").Append(Number(reward.YieldPercent/100m)).Append("x")
                .Append("\nScrap Logistics: ").Append(Number(reward.LogisticsPercent/100m)).Append("x")
                .Append("\nEffective value: ").Append(Number(reward.EffectiveScrap)).Append(" Scrap per kill");
            if(RemainingEnemies>0)text.Append(typed?"\nIf this type is the next kill: ":"\nNext kill pays: ").Append(reward.NextKillScrap).Append(" Scrap");
            text.Append('\n');
        }
    }
}

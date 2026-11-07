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
            public int ShieldBuffer { get; }
            public int HealingBudget { get; }
            public int HealingPerPulse { get; }
            public int SupportTargets { get; }
            public decimal SupportRadius { get; }
            public decimal SupportSeconds { get; }
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
                ShieldBuffer=stats.ShieldBuffer;HealingBudget=stats.HealingBudget;HealingPerPulse=stats.HealingPerPulse;
                SupportTargets=stats.SupportTargets;SupportRadius=stats.SupportRadius/1000m;
                SupportSeconds=(decimal)stats.SupportPeriod/EncounterModel.TicksPerSecond;
            }
        }
        public int Tier { get; }
        public int Wave { get; }
        public bool IsPreview { get; }
        public LastStandWaveInformation Upcoming { get; }
        public int TotalEnemies { get; }
        public int RemainingEnemies { get; }
        public bool RetainedEconomy { get; }
        public int Shield { get; }
        public int ShieldCapacity { get; }
        public int ShieldRecovery { get; }
        public decimal ShieldDelaySeconds { get; }
        // Compatibility base projection. Each enemy row owns its typed reward.
        public LastStandKillReward Reward { get; }
        public IReadOnlyList<Enemy> Enemies { get; }
        public LastStandWaveInformation(EncounterModel model,LastStandShopState shop,int logisticsRank)
            :this(model,shop,logisticsRank,null) {}
        LastStandWaveInformation(EncounterModel model,LastStandShopState shop,int logisticsRank,int? previewWave)
        {
            if(model==null)throw new ArgumentNullException(nameof(model));
            if(shop==null)throw new ArgumentNullException(nameof(shop));
            if(!model.Profile.IsWaveBased)throw new ArgumentException("A wave encounter is required.",nameof(model));
            if(shop.Tier!=model.Profile.Tier || !shop.Loadout.Equals(model.Loadout) || !shop.CombatResearch.Equals(model.CombatResearch) ||
                shop.Edition.RulesVersion!=model.Profile.Edition.RulesVersion ||
                shop.Edition.ContentVersion!=model.Profile.Edition.ContentVersion ||
                shop.Edition.EconomyVersion!=model.Profile.Edition.EconomyVersion)
                throw new ArgumentException("Wave information requires matching combat and reward owners.",nameof(shop));
            Tier=model.Profile.Tier;Wave=previewWave??model.Wave;IsPreview=previewWave.HasValue;
            RemainingEnemies=IsPreview?0:model.RemainingWaveEnemies;
            Shield=model.Shield;ShieldCapacity=model.CurrentShieldCapacity;ShieldRecovery=model.ShieldRecoveryAmount;
            ShieldDelaySeconds=(decimal)model.ShieldRecoveryDelayRemaining/EncounterModel.TicksPerSecond;
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
            if(!IsPreview){
                long next=Int32.MaxValue;
                foreach(var milestone in LastStandMilestonePresentation.Rows(Tier,model.Profile.Edition))
                    if(milestone.Milestone.Wave>Wave){next=milestone.Milestone.Wave;break;}
                if(!model.Profile.Edition.IsLegacy && model.Profile.TierDefinition.EnemyMixId!=LastStandEnemyCatalog.Onboarding)
                    next=Math.Min(next,((long)Wave/50+1)*50);
                if(next==Int32.MaxValue)next=(long)Wave+1;
                if(next<=Int32.MaxValue)Upcoming=new LastStandWaveInformation(model,shop,logisticsRank,(int)next);
            }
        }
        static string Number(decimal value)=>value.ToString("0.####",CultureInfo.InvariantCulture);
        public string Describe()
        {
            if(IsPreview)return DescribePreview();
            bool sharedValue=true;
            foreach(var enemy in Enemies)
                if(enemy.Reward.BaseScrap!=Reward.BaseScrap || enemy.Reward.EffectiveScrap!=Reward.EffectiveScrap ||
                    enemy.Reward.NextKillScrap!=Reward.NextKillScrap)sharedValue=false;
            var text=new StringBuilder("TIER ").Append(Tier).Append(" / WAVE ").Append(Wave)
                .Append("\nENEMIES LEFT: ").Append(RemainingEnemies).Append(" / ").Append(TotalEnemies)
                .Append("\nFull spawn stats. Timing and movement are at 1x speed.\n");
            if(Upcoming!=null)text.Append(Upcoming.DescribePreview()).Append("\nCURRENT WAVE DETAILS\n");
            if(ShieldCapacity>0)text.Append("\nYOUR SHIELD: ").Append(Shield).Append(" / ").Append(ShieldCapacity)
                .Append("\nAbsorbs damage after armor. Recharges ").Append(ShieldRecovery).Append(" each second after ")
                .Append(Number(ShieldDelaySeconds)).Append(" s without another hit.\n");
            foreach(var enemy in Enemies)
            {
                text.Append('\n').Append(enemy.Name.ToUpperInvariant()).Append(" / ").Append(enemy.Count).Append(" THIS WAVE")
                    .Append("\nHP: ").Append(enemy.Hull).Append("\nArmor: ").Append(enemy.Armor==0?"none":enemy.Armor.ToString(CultureInfo.InvariantCulture))
                    .Append("\nDamage: ").Append(enemy.RawDamage).Append(" / ").Append(enemy.DamageAfterArmor).Append(" after your armor")
                    .Append("\nAttack interval: ").Append(Number(enemy.AttackSeconds)).Append(" s")
                    .Append("\nWindup: ").Append(Number(enemy.TelegraphSeconds)).Append(" s")
                    .Append("\nMovement: ").Append(Number(enemy.MovementUnitsPerSecond)).Append(" world units/s")
                    .Append("\nStops at: ").Append(Number(enemy.StopDistanceWorldUnits)).Append(" world units\n");
                if(enemy.ShieldBuffer>0)text.Append("Shield buffer: ").Append(enemy.ShieldBuffer).Append(" total, shared across up to ")
                    .Append(enemy.SupportTargets).Append(" allies within ").Append(Number(enemy.SupportRadius)).Append(" world units.")
                    .Append(" At least 1 damage gets through. This buffer cannot recharge.\n");
                if(enemy.HealingBudget>0)text.Append("Healing budget: ").Append(enemy.HealingBudget).Append(" total. Repairs ")
                    .Append(enemy.HealingPerPulse).Append(" HP for up to ").Append(enemy.SupportTargets).Append(" allies every ")
                    .Append(Number(enemy.SupportSeconds)).Append(" s within ").Append(Number(enemy.SupportRadius)).Append(" world units.")
                    .Append(" Cannot revive enemies or refill its budget.\n");
                if(enemy.ShieldBuffer>0||enemy.HealingBudget>0)text.Append("Support does not affect other support enemies.\n");
                if(!sharedValue)AppendReward(text,enemy.Reward,true);
            }
            if(sharedValue) { text.Append("\nVALUE / EACH ENEMY TYPE");AppendReward(text,Reward,false); }
            if(RemainingEnemies==0)text.Append("\nWave cleared; values shown are for this wave.");
            text.Append("\nFractional value carries forward; individual whole-Scrap payouts can differ.");
            if(!sharedValue)text.Append(" Each type's next-kill value uses the current shared carry; every kill updates that carry.");
            if(RetainedEconomy)text.Append("\n\nThis run keeps its saved income and upgrade rules. The new income curve starts with your next run.");
            return text.ToString();
        }
        string DescribePreview()
        {
            var text=new StringBuilder("\nUPCOMING WAVE ").Append(Wave).Append(" / ").Append(TotalEnemies).Append(" ENEMIES\n");
            foreach(var enemy in Enemies){
                text.Append(enemy.Name).Append(" x").Append(enemy.Count).Append(": HP ").Append(enemy.Hull)
                    .Append(" / Armor ").Append(enemy.Armor).Append(" / Damage ").Append(enemy.RawDamage)
                    .Append(" (").Append(enemy.DamageAfterArmor).Append(" after your armor)")
                    .Append(" / ").Append(Number(enemy.Reward.EffectiveScrap)).Append(" Scrap per kill.\n");
                if(enemy.TelegraphSeconds>0)text.Append("  Windup ").Append(Number(enemy.TelegraphSeconds))
                    .Append(" s; attack every ").Append(Number(enemy.AttackSeconds)).Append(" s.\n");
                if(enemy.ShieldBuffer>0)text.Append("  Finite shield ").Append(enemy.ShieldBuffer)
                    .Append(" across up to ").Append(enemy.SupportTargets).Append(" nearby allies; minimum 1 damage gets through. No recharge.\n");
                if(enemy.HealingBudget>0)text.Append("  Finite healing ").Append(enemy.HealingBudget).Append("; ")
                    .Append(enemy.HealingPerPulse).Append(" HP to up to ").Append(enemy.SupportTargets)
                    .Append(" allies every ").Append(Number(enemy.SupportSeconds)).Append(" s. No resurrection.\n");
                if(enemy.ShieldBuffer>0||enemy.HealingBudget>0)text.Append("  Support radius ").Append(Number(enemy.SupportRadius))
                    .Append(" world units; other support enemies are excluded.\n");
            }
            return text.Append("Uses your current armor, upgrades and research. Whole-Scrap payouts depend on the carry when you reach this wave.\n").ToString();
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

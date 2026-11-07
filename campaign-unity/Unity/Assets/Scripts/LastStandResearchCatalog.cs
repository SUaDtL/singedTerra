using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandResearchTrackId { GameSpeed, SalvageRecovery, ResearchSpeed, ScrapLogistics, ArmorPiercing, AreaControl, FieldEngineering }

    public static class LastStandResearchCatalog
    {
        public const string LegacyVersion = "research-v1";
        public const string Version = "research-v2";
        public const int LegacyTrackCount = 4, LegacySlotCount = 2, SlotCount = 3, MultiplierDenominator = 100;
        public static LastStandResearchDefinitions Definitions { get; } = new LastStandResearchDefinitions(Version,new[]
        {
            new LastStandResearchDefinition(LastStandResearchTrackId.GameSpeed,"gameSpeed","Game Speed",8,0,
                LastStandResearchCurve.Table(20,60,180,500,1500,4500,12000,30000),
                LastStandResearchCurve.Table(10,60,360,1440,4320,10080,14400,20160),LastStandResearchEffect.GameSpeed,50,true),
            new LastStandResearchDefinition(LastStandResearchTrackId.SalvageRecovery,"salvageRecovery","Salvage Recovery",100,1,
                LastStandResearchCurve.Polynomial(25,2,10),LastStandResearchCurve.Polynomial(15,3,20),LastStandResearchEffect.Salvage,2,true),
            new LastStandResearchDefinition(LastStandResearchTrackId.ResearchSpeed,"researchSpeed","Research Speed",100,2,
                LastStandResearchCurve.Polynomial(15,2,12),LastStandResearchCurve.Polynomial(20,4,15),LastStandResearchEffect.ResearchSpeed,2,false),
            new LastStandResearchDefinition(LastStandResearchTrackId.ScrapLogistics,"scrapLogistics","Scrap Logistics",100,3,
                LastStandResearchCurve.Polynomial(20,1,20),LastStandResearchCurve.Polynomial(10,2,25),LastStandResearchEffect.Scrap,2,true),
            new LastStandResearchDefinition(LastStandResearchTrackId.ArmorPiercing,"armorPiercing","Armor Piercing",20,4,
                LastStandResearchCurve.Polynomial(250,50,2),LastStandResearchCurve.Polynomial(50,10,2),LastStandResearchEffect.ArmorPiercing,1,true),
            new LastStandResearchDefinition(LastStandResearchTrackId.AreaControl,"areaControl","Area Control",20,5,
                LastStandResearchCurve.Polynomial(320,80,2),LastStandResearchCurve.Polynomial(75,15,2),LastStandResearchEffect.AreaControl,2,true),
            new LastStandResearchDefinition(LastStandResearchTrackId.FieldEngineering,"fieldEngineering","Field Engineering",20,6,
                LastStandResearchCurve.Polynomial(280,70,2),LastStandResearchCurve.Polynomial(60,15,2),LastStandResearchEffect.FieldEngineering,2,true)
        });
        public static int TrackCount => Definitions.Count;
        public static IReadOnlyList<LastStandResearchDefinition> Tracks => Definitions.Tracks;
        public static bool IsTrack(LastStandResearchTrackId id)=>Definitions.Contains(id);
        public static LastStandResearchDefinition Get(LastStandResearchTrackId id)=>Definitions.Get(id);
        public static bool TryGet(string key,out LastStandResearchDefinition definition)=>Definitions.TryGet(key,out definition);
        static LastStandEntitlements Entitlements(int bestTierOneWave,int bestTierTwoWave)=>
            LastStandRewardCatalog.Entitlements(tier=>tier==1?bestTierOneWave:tier==2?bestTierTwoWave:0);
        public static int UnlockedSlots(int bestTierOneWave,int bestTierTwoWave=0)=>Entitlements(bestTierOneWave,bestTierTwoWave).ResearchLabs;
        public static bool CombatUnlocked(int bestTierOneWave)=>Entitlements(bestTierOneWave,0).CombatResearch;
        public static bool IsUnlocked(LastStandResearchDefinition definition,int bestTierOneWave)=>
            !definition.IsCombatSnapshot||CombatUnlocked(bestTierOneWave);
        public static bool TryMultiplyReward(long amount,int rank,int priorCarry,out long payout,out int nextCarry)
        {
            payout=0;nextCarry=priorCarry;
            if(amount<0||rank<0||rank>100||priorCarry<0||priorCarry>=MultiplierDenominator)return false;
            try { long scaled=checked(amount*(100L+2L*rank)+priorCarry);payout=scaled/MultiplierDenominator;nextCarry=(int)(scaled%MultiplierDenominator);return true; }
            catch(OverflowException){return false;}
        }
    }

    public sealed class LastStandResearchDefinition
    {
        readonly LastStandResearchCurve cost,durationMinutes;
        readonly int effectPerRank;
        readonly bool accelerated;
        public LastStandResearchTrackId Id { get; }
        public string Key { get; }
        public string Name { get; }
        public int MaximumRank { get; }
        public int StorageSlot { get; }
        public LastStandResearchEffect Effect { get; }
        public bool IsCombatSnapshot => Effect==LastStandResearchEffect.ArmorPiercing||Effect==LastStandResearchEffect.AreaControl||Effect==LastStandResearchEffect.FieldEngineering;
        public string Category => Effect==LastStandResearchEffect.GameSpeed||IsCombatSnapshot?"Combat":Effect==LastStandResearchEffect.ResearchSpeed?"Research":"Economy";
        public LastStandResearchDefinition(LastStandResearchTrackId id,string key,string name,int maximumRank,int storageSlot,
            LastStandResearchCurve cost,LastStandResearchCurve durationMinutes,LastStandResearchEffect effect,int effectPerRank,bool accelerated)
        {
            if((int)id<0||String.IsNullOrWhiteSpace(key)||key.Length>80||String.IsNullOrWhiteSpace(name)||name.Length>80||maximumRank<1||maximumRank>10000||storageSlot<0||
                cost==null||durationMinutes==null||!Enum.IsDefined(typeof(LastStandResearchEffect),effect)||effectPerRank<1||effectPerRank>10000)
                throw new ArgumentException("Invalid research definition.");
            for(int i=0;i<key.Length;i++)
            {
                char ch=key[i];bool letter=ch>='a'&&ch<='z'||ch>='A'&&ch<='Z';
                if(!letter&&(i==0||!(ch>='0'&&ch<='9'||ch=='-'||ch=='_')))
                    throw new ArgumentException("Research keys must be stable ASCII identifiers.");
            }
            checked { var lastCost=cost.At(maximumRank);var lastDuration=durationMinutes.At(maximumRank)*60000;var lastEffect=100+effectPerRank*maximumRank;
                if(lastCost<1||lastDuration<1||lastEffect<100)throw new ArgumentException("Invalid research bounds."); }
            Id=id;Key=key;Name=name;MaximumRank=maximumRank;StorageSlot=storageSlot;Effect=effect;
            this.cost=cost;this.durationMinutes=durationMinutes;this.effectPerRank=effectPerRank;this.accelerated=accelerated;
        }
        void ValidateRank(int rank){if(rank<1||rank>MaximumRank)throw new ArgumentOutOfRangeException(nameof(rank));}
        public long Cost(int rank){ValidateRank(rank);return cost.At(rank);}
        public long BaseDurationMilliseconds(int rank){ValidateRank(rank);return checked(durationMinutes.At(rank)*60000);}
        public long DurationMilliseconds(int rank,int researchSpeedRank)
        {
            if(researchSpeedRank<0||researchSpeedRank>100)throw new ArgumentOutOfRangeException(nameof(researchSpeedRank));
            return DurationAtSpeedNumerator(rank,100+2*researchSpeedRank);
        }
        public long DurationAtSpeedNumerator(int rank,int speedNumerator)
        {
            if(speedNumerator<100)throw new ArgumentOutOfRangeException(nameof(speedNumerator));
            long duration=BaseDurationMilliseconds(rank);
            return accelerated?checked((duration*100+speedNumerator-1)/speedNumerator):duration;
        }
        public int EffectNumerator(int rank)
        {if(rank<0||rank>MaximumRank)throw new ArgumentOutOfRangeException(nameof(rank));return checked(100+effectPerRank*rank);}
    }
}

using System;
using System.Collections.Generic;
using System.Reflection;
using SingedTerra.LastStand;

static class CatalogChecks
{
    static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    static void Reject(Action action) { try { action(); } catch (ArgumentException) { return; } throw new Exception("Invalid authored catalog was accepted."); }
    static int Main(string[] args)
    {
        try {
            switch (args[0]) {
                case "rosters":
                    Require(LastStandTierCatalog.All.Count == 4, "Current authored campaign has four tiers.");
                    Require(LastStandTierCatalog.Get(2).RequiredWave == 300, "Tier two unlock is wave 300.");
                    foreach (var tier in LastStandTierCatalog.All) {
                        var roster = LastStandWaveCatalog.ForWave(tier, 100);
                        Require(roster.EnemyCount > 0 && roster.EnemyCount <= 32, "Finite bounded roster.");
                        var reward = LastStandRewardCatalog.At(tier, 100);
                        Require(reward.Milestone != null && reward.Milestone.Id.StartsWith(tier.Key + ":"), "Stable tier-keyed milestone.");
                        Require(reward.RepeatableSalvage > 0 && reward.FirstClearSalvage > 0, "Separate reward classes.");
                    }
                    Require(LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),100).Milestone.UnlockFittingId == "scattergun", "Authored armament unlock.");
                    Require(LastStandRewardCatalog.At(LastStandTierCatalog.Get(2),300).Milestone.UnlockTierId == 3, "Current tier three unlock follows tier two.");
                    Require(LastStandRewardCatalog.At(LastStandTierCatalog.Get(4),300).Milestone.UnlockTierId == 0, "No phantom tier five.");
                    break;
                case "expansion":
                    var tiers = new List<LastStandTierDefinition>();
                    for (int n=1;n<=18;n++) tiers.Add(new LastStandTierDefinition(n,"fixture-"+n,"wave-"+n,"biome-"+n,1,1,n==1?0:n-1,n==1?0:300));
                    LastStandTierCatalog.Validate(tiers);
                    var visible=LastStandTierCatalog.Visible(tiers, id=>id<=4);
                    Require(visible.Count==5 && visible[4].Id==5,"Unlocked plus one authored locked preview.");
                    var records=new Dictionary<string,int>();
                    foreach(var tier in tiers) records[tier.Key]=LastStandWaveCatalog.ForWave(tier,2000).EnemyCount;
                    Require(records.Count==18,"Keyed catalog scales independently of fields.");
                    var milestones=typeof(LastStandRewardCatalog).GetMethod("Milestones",new[]{typeof(LastStandTierDefinition),typeof(IReadOnlyList<LastStandTierDefinition>)});
                    Require(milestones!=null,"Milestones must resolve prerequisites from the same authored catalog.");
                    var arbitrary=new List<LastStandTierDefinition>();
                    for(int n=1;n<=18;n++)arbitrary.Add(new LastStandTierDefinition(n,"authored-"+n,"wave-"+n,"biome-"+n,1,1,n==1?0:n-1,n==1?0:333+n));
                    foreach(var parent in arbitrary) {
                        var rewards=(IReadOnlyList<LastStandMilestone>)milestones.Invoke(null,new object[]{parent,arbitrary});
                        int unlocks=0,previous=0;
                        foreach(var reward in rewards) {
                            Require(reward.Wave>previous && reward.Id==parent.Key+":wave-"+reward.Wave,"Unique sorted milestone identity.");previous=reward.Wave;
                            if(reward.UnlockTierId!=0){unlocks++;Require(reward.UnlockTierId==parent.Id+1 && reward.Wave==334+parent.Id,"Arbitrary authored prerequisite wave must unlock the actual next tier.");}
                        }
                        Require(unlocks==(parent.Id<18?1:0),"Each authored prerequisite is represented once without phantom content.");
                    }
                    break;
                case "invalid":
                    Reject(()=>LastStandTierCatalog.Validate(new LastStandTierDefinition[0]));
                    Reject(()=>LastStandTierCatalog.Validate(new[]{LastStandTierCatalog.Get(1),LastStandTierCatalog.Get(1)}));
                    Reject(()=>new LastStandTierDefinition(3,"","wave","biome",1,1,1,300));
                    Reject(()=>new LastStandTierDefinition(3,"third","wave","biome",1,0,1,300));
                    Reject(()=>LastStandTierCatalog.Validate(new[]{new LastStandTierDefinition(3,"third","wave","biome",1,1,9,300)}));
                    Reject(()=>LastStandWaveCatalog.ForWave(LastStandTierCatalog.Get(1),0));
                    var ambiguous=new[]{new LastStandTierDefinition(1,"one","wave-1","biome",1,1),
                        new LastStandTierDefinition(2,"two","wave-2","biome",1,1,1,333),
                        new LastStandTierDefinition(3,"three","wave-3","biome",1,1,1,333)};
                    Reject(()=>LastStandRewardCatalog.Milestones(ambiguous[0],ambiguous));
                    break;
                case "depth":
                    foreach(int wave in new[]{300,1000,2000,5000,5001,1000000,int.MaxValue}) {
                        var row=LastStandWaveCatalog.ForWave(LastStandTierCatalog.Get(1),wave);
                        Require(row.Wave==wave && row.EnemyCount>0 && row.EnemyCount<=32,"Bounded late wave roster.");
                        Require(row.EnemyHull>0 && row.EnemyDamage>0 && row.SpawnIntervalTicks>0,"Bounded positive numeric growth.");
                        Require(LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave).RepeatableSalvage>0,"Continuing rewards.");
                    }
                    Require(LastStandRewardCatalog.NextMilestone(LastStandTierCatalog.Get(1),2000).Wave>2000,"Actual later goal exists.");
                    break;
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        } catch(Exception e) {Console.Error.WriteLine(e);return 1;}
    }
}

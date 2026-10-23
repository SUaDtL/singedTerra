using System;
using SingedTerra.LastStand;
static class EconomyChecks
{
    static void Check(bool value,string message){if(!value)throw new Exception(message);}
    static int Main(string[] args)
    {
        try {
            if(args[0]=="legacy") for(int n=0;n<=8;n++) {
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(n,1)==20+10*n,"Existing attack effect preserved.");
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.HullCapacity).EffectAt(n,1)==120+15*n,"Existing hull effect preserved.");
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonCycle).EffectAt(n,1)==20-n,"Existing cadence preserved.");
                if(n<3) Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).PermanentPrice(n+1)==n+1,"Existing permanent investment price preserved.");
            }
            if(args[0]=="bounds") {
                foreach(var track in LastStandUpgradeCatalog.Tracks) {
                    Check(track.PermanentCap>=3 && track.TotalCap>8,"Depth extended without erased levels.");
                    int prior=0;
                    for(int level=0;level<=track.TotalCap;level++) {
                        Check(track.EffectAt(level,1000000)>0,"No zero or negative effects.");
                        if(level>0){int price=track.RunPrice(level);Check(price>=prior,"Monotonic bounded prices.");prior=price;}
                    }
                }
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonCycle).TotalCap<LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).TotalCap,"Per-track utility bounds.");
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack).EffectAt(200,1)>5000,"Useful mature attack growth.");
                Check(LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.ScattergunAttack).IsEligible(LastStandFitting.Scattergun),"Third fitting has explicit track.");
                Check(!LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.FieldRepair).IsEligible(LastStandFitting.Scattergun),"Third fitting cannot silently become repair.");
            }
            if(args[0]=="farm") {
                long farm=0,push=0;
                for(int wave=1;wave<=2000;wave++) farm+=LastStandRewardCatalog.At(LastStandTierCatalog.Get(1),wave).RepeatableSalvage;
                for(int wave=1;wave<=300;wave++) push+=LastStandRewardCatalog.At(LastStandTierCatalog.Get(2),wave).RepeatableSalvage;
                Check(farm/2000.0>push/300.0,"Long lower-tier depth increases reward efficiency over shallow pushes.");
                Check(LastStandWaveCatalog.ForWave(2,300).EnemyHull>LastStandWaveCatalog.ForWave(1,300).EnemyHull*2,"Higher-tier combat risk.");
                long full=0;var track=LastStandUpgradeCatalog.Get(LastStandUpgradeTrackId.CannonAttack);
                for(int n=1;n<=track.PermanentCap;n++)full+=track.PermanentPrice(n);
                Check(farm<full/10,"One long run cannot saturate permanent economy.");
            }
            Console.WriteLine("PASS "+args[0]);return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

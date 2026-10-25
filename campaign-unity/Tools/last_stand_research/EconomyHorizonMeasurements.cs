using System;
using SingedTerra.LastStand;

static class EconomyHorizonMeasurements
{
    static long CostThrough(LastStandUpgradeDefinition row,int ranks)
    {long cost=0;for(int rank=1;rank<=Math.Min(ranks,row.PermanentCap);rank++)cost+=row.PermanentPrice(rank);return cost;}
    static int Main()
    {
        Console.WriteLine("track,totalCap,permanentCap,firstCost,costThrough10,costThrough50,costThrough100,costThroughCap");
        foreach(var row in LastStandUpgradeCatalog.Tracks)
            Console.WriteLine(String.Join(",",new object[]{row.Key,row.TotalCap,row.PermanentCap,row.PermanentPrice(1),
                CostThrough(row,10),CostThrough(row,50),CostThrough(row,100),CostThrough(row,row.PermanentCap)}));
        return 0;
    }
}

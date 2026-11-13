using System;
using System.Collections.Generic;
using SingedTerra.LastStand;
using B=CombatBalanceMeasurements;

// Earned acquisition policy only. All profile state comes from production transactions.
static class SkillAcquisitionMeasurements
{
    const uint DrawSeed=20261111;
    static readonly int[] Milestones={25,50,100,300,500};
    static uint randomState=DrawSeed;
    static int Choice(int count)
    {
        uint bound=(uint)count,threshold=unchecked(0u-bound)%bound,value;
        do{randomState=unchecked(randomState*1664525u+1013904223u);value=randomState;}while(value<threshold);
        return (int)(value%bound);
    }
    static int[] Copies(LastStandProgression p){var result=new int[LastStandSkillCatalog.Count];foreach(var id in LastStandSkillCatalog.All)result[(int)id.Id]=p.SkillCopies(id.Id);return result;}
    static List<string> Pool(LastStandProgression p){var result=new List<string>();foreach(var id in p.SkillDrawPool)result.Add(LastStandSkillCatalog.Get(id).Key);return result;}
    static object State(B.Context c)=>B.D("bestWave",c.Profile.GetBestWave(1),"skillIntel",c.Profile.SkillIntel,"copies",Copies(c.Profile),
        "slots",c.Profile.SkillSlotCount,"eligiblePool",Pool(c.Profile),"selectedSkills",c.Profile.SelectedSkills.ToString(),
        "grossSalvage",c.Gross,"wallet",c.Profile.Wallet,"permanentSpent",c.PermanentSpent,"activeMilliseconds",c.ActiveMilliseconds);
    static void DrawAndEquip(B.Context c,List<object> draws,int run)
    {
        var p=c.Profile;B.Require(!p.HasCheckpoint,"Draw only in garage");
        while(p.SkillIntel>0&&p.SkillDrawPool.Count>0){
            var before=Copies(p);var pool=Pool(p);int intel=p.SkillIntel;int pick=-1;
            B.Require(p.TryDrawSkill(p.Revision,n=>{pick=Choice(n);return pick;}),"Actual draw transaction");
            var receipt=p.LastSkillDraw;
            draws.Add(B.D("run",run,"bestWave",p.GetBestWave(1),"intelBefore",intel,"intelAfter",p.SkillIntel,"copiesBefore",before,
                "pool",pool,"selectedIndex",pick,"skill",LastStandSkillCatalog.Get(receipt.Skill).Key,"copiesAfter",Copies(p),"rank",receipt.Rank));
        }
        // Acquisition baseline equips owned passives; active skill timing is measured separately.
        var selected=new List<LastStandSkillId>();
        foreach(var id in new[]{LastStandSkillId.ReinforcedHull,LastStandSkillId.Ballistics,LastStandSkillId.ReactiveLining})
            if(p.SkillRank(id)>0&&selected.Count<p.SkillSlotCount)selected.Add(id);
        B.Require(p.TryApplySkills(new LastStandSkillLoadout(selected.ToArray()),p.Revision),"Earned passive preparation");
    }
    public static int Main(string[] args)
    {
        try{
            bool quick=args.Length>0&&args[0]=="quick";int tickLimit=quick?50000:2000000,runLimit=quick?3:96;
            var c=new B.Context();B.Require(c.Gross==0&&c.Profile.Wallet==0&&c.Profile.SkillIntel==0&&c.Profile.GetBestWave(1)==0,"Fresh origin");
            string initial=c.Store.Raw;var runs=new List<object>();var draws=new List<object>();var milestones=new List<object>();
            int ticks=0,next=0,earnedIntel=0;
            for(int run=1;run<=runLimit&&ticks<tickLimit&&next<Milestones.Length;run++){
                B.Require(c.Profile.TryApplyLoadout(new LastStandLoadout("launcher")),"Initially owned fitting");
                B.BuyPermanent(c,c.Gross,true);c.Audit();
                int intelBefore=c.Profile.SkillIntel;int bestBefore=c.Profile.GetBestWave(1);
                var row=B.Run(c,1,"launcher","afterKill",2,Math.Min(500000,tickLimit-ticks),Milestones[next]);
                int delta=c.Profile.SkillIntel-intelBefore;earnedIntel+=delta;ticks+=(int)row["ticks"];
                row["run"]=run;row["bestWaveBefore"]=bestBefore;row["intelEarned"]=delta;row["permanentSpentTotal"]=c.PermanentSpent;
                row["grossSalvageTotal"]=c.Gross;row["walletAfterRun"]=c.Profile.Wallet;row["capturedSkills"]=c.Profile.HistorySnapshot.Recent[c.Profile.HistorySnapshot.Recent.Count-1].StartContext;
                runs.Add(row);DrawAndEquip(c,draws,run);
                while(next<Milestones.Length&&c.Profile.GetBestWave(1)>=Milestones[next]){
                    milestones.Add(B.D("wave",Milestones[next],"run",run,"outcome","earned","state",State(c),"_profileJson",c.Store.Raw));next++;
                }
                Console.Error.WriteLine("acquisition run="+run+" best="+c.Profile.GetBestWave(1)+" ticks="+ticks+" earnedIntel="+earnedIntel+" draws="+draws.Count+" wallet="+c.Profile.Wallet);
            }
            while(next<Milestones.Length)milestones.Add(B.D("wave",Milestones[next++],"outcome","not-reached-within-budget","state",State(c)));
            c.Audit();B.Require(earnedIntel==draws.Count+c.Profile.SkillIntel,"Intel conservation");
            B.WriteReport(Console.Out,B.D("schema",1,"policy","skills-fresh-acquisition-v1","rulesVersion",LastStandRunEdition.Current.RulesVersion,
                "drawSeed",(int)DrawSeed,"drawAlgorithm","uint32 LCG 1664525*x+1013904223, rejection before modulo, catalog-ordered eligible nonmaxed pool",
                "originProfileJson",initial,"limits",B.D("ticks",tickLimit,"runs",runLimit),
                "assumptions","Tier 1 launcher, 1x speed, no research or closed time. Spend earned Salvage on permanent round-robin upgrades between runs; buy run upgrades after each kill with earned Scrap. Return to garage at each target milestone, draw all earned Intel using the fixed seed, equip owned passives in hull/ballistics/lining order. No active uses. Input and purchase decision time are excluded.",
                "ticks",ticks,"activeMilliseconds",c.ActiveMilliseconds,"closedMilliseconds",c.ClosedMilliseconds,"researchSpent",c.ResearchSpent,
                "earnedIntel",earnedIntel,"draws",draws,"runs",runs,"milestones",milestones,"finalState",State(c),
                "finalProfileJson",c.Store.Raw,
                "qualification","Fresh earned production-model trajectory, not real elapsed play, native/device acceptance, or typical human input cadence."));
            Console.WriteLine();return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

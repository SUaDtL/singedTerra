using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using SingedTerra.LastStand;

// Explicit development seeds. Production owners validate migration, abandonment,
// research funding/completion, queue admission, reload and new deployment.
static class QualificationFixtureGenerator
{
    sealed class Store:ILastStandStorage
    {
        public string Raw;public int Writes;
        public string Read()=>Raw;
        public void Write(string raw){Raw=raw;Writes++;}
    }
    static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
    static Dictionary<string,object> Map(params object[] fields)
    {var result=new Dictionary<string,object>();for(int i=0;i<fields.Length;i+=2)result.Add((string)fields[i],fields[i+1]);return result;}
    static LastStandResearchTime Sample(LastStandProgression profile,long utc)
    {
        var clock=new LastStandResearchClock(profile.ResearchSnapshot.lastObservedUtcMilliseconds);
        LastStandResearchTime time;
        Require(clock.TrySample(utc,0,out time),"Production clock must admit fixture observation.");return time;
    }
    static void Advance(LastStandProgression profile,long utc)
    {Require(profile.TryReconcileResearch(Sample(profile,utc)),"Research progress must persist through the profile owner.");}
    static void Fund(LastStandProgression profile,LastStandResearchAction action,LastStandResearchTrackId track,int rank,long utc)
    {
        var current=profile.ResearchSnapshot;var slot=current.slots[0];
        var intent=new LastStandResearchIntent {Action=action,Slot=0,Track=track,Rank=rank,ExpectedRevision=current.revision,
            ExpectedActiveIdentity=slot.active?.identity??0,ExpectedQueuedIdentity=slot.queued?.identity??0};
        Require(profile.TryResearchAction(intent,Sample(profile,utc)),"Production research funding refused "+action+" "+track+" "+rank);
    }
    static LastStandProgression Seed(string legacy,Store store,int wallet,int permanentLevel,long utc)
    {
        store.Raw=legacy;var profile=LastStandProgression.Load(store,()=>utc);
        Require(profile.SaveState=="ready" && profile.HasCheckpoint && profile.GetBestWave(1)==100,"Portable v4 prerequisite must migrate intact.");
        Require(profile.TryFinalizeRun(null,"abandon") && !profile.HasCheckpoint,"Old run must be abandoned through its production transaction.");
        var raw=LastStandSaveJson.Read(store.Raw);raw["credits"]=wallet;
        var levels=LastStandSaveJson.Object(raw["permanentLevels"]);
        foreach(var row in LastStandUpgradeCatalog.Tracks)levels[row.Key]=Math.Min(permanentLevel,row.PermanentCap);
        store.Raw=LastStandSaveJson.Write(raw);
        profile=LastStandProgression.Load(store,()=>utc);
        Require(profile.SaveState=="ready" && profile.TrySelectTier(1) && profile.TrySelectFitting("launcher"),"Declared development seed must be a valid current profile.");
        Require(profile.GetBestWave(1)==100 && !profile.TierTwoUnlocked && LastStandResearchCatalog.UnlockedSlots(profile.GetBestWave(1))==2,
            "Fixture must retain actual prerequisite flags without inventing Tier2 progress.");
        return profile;
    }
    static long MatureDuration()
    {
        long total=0;
        foreach(var row in LastStandResearchCatalog.Tracks)
            for(int rank=1;rank<=(row.Id==LastStandResearchTrackId.GameSpeed?8:25);rank++)
                total=checked(total+row.DurationMilliseconds(rank,row.Id==LastStandResearchTrackId.ScrapLogistics?25:0));
        return total;
    }
    static Dictionary<string,object> Mature(string legacy,Func<long> now)
    {
        const int wallet=2000000;long duration=MatureDuration(),utc=now()-duration,start=utc;
        var store=new Store();var profile=Seed(legacy,store,wallet,500,utc);long funding=0;
        foreach(var row in LastStandResearchCatalog.Tracks)
        for(int rank=1;rank<=(row.Id==LastStandResearchTrackId.GameSpeed?8:25);rank++) {
            int before=profile.Wallet;Fund(profile,LastStandResearchAction.Start,row.Id,rank,utc);
            funding+=before-profile.Wallet;
            var project=profile.ResearchSnapshot.slots[0].active;
            utc=checked(utc+project.durationMilliseconds-project.earnedMilliseconds);Advance(profile,utc);
            Require(profile.ResearchRank(row.Id)==rank && profile.ResearchSnapshot.slots[0].active==null,"Every research rank must actually complete.");
        }
        Require(utc-start==duration,"Precomputed synthetic training span must match production locked timers.");
        long finalUtc=now();Require(finalUtc>=utc,"Synthetic fixture training must end no later than actual UTC.");Advance(profile,finalUtc);
        Require(profile.Wallet==wallet-funding && profile.MaximumGameSpeed==5 && !profile.HasCheckpoint,"Mature seed conserves funding and remains ready to deploy.");
        var control=new Store{Raw=store.Raw};var reload=LastStandProgression.Load(control,()=>finalUtc);
        Require(reload.SaveState=="ready" && control.Writes==0 && reload.TryDeploy(),"Mature saved bytes must reload and deploy unchanged.");
        Require(reload.Checkpoint.CompletedWave==0 && reload.Checkpoint.Shop.EconomyVersion==LastStandUpgradeCatalog.EconomyVersion,
            "New deployment must start the current economy at wave0.");
        foreach(var row in LastStandUpgradeCatalog.Tracks)
            Require(reload.Checkpoint.Shop.PermanentLevels[(int)row.Id]==Math.Min(500,row.PermanentCap),"New deployment must freeze the exact measured mature build.");
        return Map("id","mature-5x","save",store.Raw,"createdUtcMilliseconds",finalUtc,"requestedSpeed",5,
            "hasCheckpoint",false,"startingCompletedWave",0,"fitting","launcher","tier",1,"permanentLevelSeed",500,
            "giftedSalvage",wallet,"researchFundingSpent",funding,"wallet",profile.Wallet,
            "completedRanks",new List<object>{8,25,25,25},"syntheticResearchElapsedMilliseconds",duration,
            "syntheticTrainingStartedUtcMilliseconds",start,"sourceStoreWrites",store.Writes,
            "qualificationPurchasePolicy",Map("intervalRealSeconds",900,"quantity","Max","intentsPerInterval",1,
                "trackOrder",new List<object>{"cannonAttack","hullCapacity","scrapYield","cannonAttack","cannonCycle","launcherAttack","armor"},
                "skipCappedTracks",true,"advanceOrderOnlyAfterAcceptedPurchase",true),
            "measuredPolicy","After each admitted kill, buy one affordable next item in rotating Cannon Attack/Hull Capacity/Scrap Yield/Cannon Attack/Cannon Cycle/Launcher Attack/Armor order; skip capped tracks and save for the next item. The 10.18-hour projection is conditional on this ideal policy. No-purchase or periodic bulk play is not equivalent.");
    }
    static Dictionary<string,object> Lab(string legacy,Func<long> now,long remaining)
    {
        const int wallet=1000;
        long duration=LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).DurationMilliseconds(1,0);
        Require(remaining>0 && remaining<duration,"Lab remaining interval must be positive and shorter than rank1.");
        long utc=now()-(duration-remaining),start=utc;
        var store=new Store();var profile=Seed(legacy,store,wallet,0,utc);
        Fund(profile,LastStandResearchAction.Start,LastStandResearchTrackId.GameSpeed,1,utc);
        Fund(profile,LastStandResearchAction.Queue,LastStandResearchTrackId.GameSpeed,2,utc);
        long finalUtc=now();Advance(profile,finalUtc);
        var snapshot=profile.ResearchSnapshot;var active=snapshot.slots[0].active;var queued=snapshot.slots[0].queued;
        Require(active!=null && active.rank==1 && queued!=null && queued.rank==2,"Fresh near-completion fixture must still have its actual funded active and queue projects.");
        long actualRemaining=active.durationMilliseconds-active.earnedMilliseconds;
        var control=new Store{Raw=store.Raw};var reload=LastStandProgression.Load(control,()=>finalUtc);
        Require(reload.SaveState=="ready" && control.Writes==0,"Lab exact bytes must reload without rewriting.");
        int savedWallet=reload.Wallet;Advance(reload,finalUtc+actualRemaining);
        var after=reload.ResearchSnapshot;
        Require(reload.MaximumGameSpeed==1.5 && after.slots[0].active.identity==queued.identity && after.slots[0].active.rank==2 &&
            after.slots[0].queued==null && reload.Wallet==savedWallet,"Offline completion must promote the already-funded queue without another debit.");
        return Map("id","lab-near-completion","save",store.Raw,"createdUtcMilliseconds",finalUtc,"requestedSpeed",1,
            "hasCheckpoint",false,"giftedSalvage",wallet,"wallet",profile.Wallet,"giftedPermanentLevel",0,"unlockedLabSlots",2,
            "syntheticResearchElapsedMilliseconds",finalUtc-start,"activeTrack","gameSpeed","activeRank",1,
            "activeIdentity",active.identity,"remainingMilliseconds",actualRemaining,"queuedTrack","gameSpeed","queuedRank",2,
            "queuedIdentity",queued.identity,"expectedMaximumSpeedAfterCompletion","1.5",
            "freshness","Remaining time is measured at createdUtcMilliseconds. Loading later legitimately completes the active project offline and starts its funded queue. Regenerate immediately before a near-completion visual check.");
    }
    static int Main(string[] args)
    {
        try {
            CultureInfo.CurrentCulture=CultureInfo.InvariantCulture;
            string legacy=File.ReadAllText(args[0]);long fixedUtc=args[1]=="live"?-1:long.Parse(args[1]);
            Func<long> now=()=>fixedUtc>=0?fixedUtc:DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var cases=new List<object>{Mature(legacy,now),Lab(legacy,now,long.Parse(args[2]))};
            Console.WriteLine(LastStandSaveJson.Write(Map("cases",cases)));return 0;
        }catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

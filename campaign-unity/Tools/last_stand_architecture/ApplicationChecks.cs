using System;
using System.IO;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

static class ApplicationChecks
{
    const long Epoch = 1790000000000L;
    sealed class Store : ILastStandStorage
    {
        public string Raw;
        public bool DenyWrite, FailReadback;
        bool failRead;
        public string Read() { if(failRead){failRead=false;throw new IOException("test readback");}return Raw; }
        public void Write(string value) { if(DenyWrite)throw new IOException("test write");Raw=value;if(FailReadback){failRead=true;FailReadback=false;} }
    }
    sealed class TimeSource : ILastStandTime
    {
        public long UtcMilliseconds { get; set; } = Epoch;
        public double MonotonicSeconds { get; set; }
    }
    static void Need(bool value,string message) { if(!value)throw new Exception(message); }
    static void Research(Store store)
    {
        var profile=LastStandProgression.Load(store,()=>Epoch);
        var time=new TimeSource();var app=new LastStandResearchCoordinator(profile,time);
        int confirmations=0;app.Confirmed+=()=>confirmations++;
        Need(app.Initialize(),"initialize real research owner");
        var state=app.Snapshot;int wallet=profile.Wallet;
        Need(app.Submit(new LastStandResearchIntent {Action=LastStandResearchAction.Start,Slot=0,
            Track=LastStandResearchTrackId.GameSpeed,Rank=1,ExpectedRevision=state.revision}),"fund actual research");
        Need(profile.Wallet==wallet-20,"single shared-wallet charge");
        var project=profile.ResearchSnapshot.slots[0].active;
        time.MonotonicSeconds+=project.durationMilliseconds/1000d+1;
        time.UtcMilliseconds+=project.durationMilliseconds+1000;
        int before=confirmations;store.FailReadback=true;
        Need(!app.ReconcileBenefits() && profile.SaveState!="ready","uncertain completion blocks benefits");
        Need(confirmations==before && profile.ResearchRank(LastStandResearchTrackId.GameSpeed)==0,"no unconfirmed benefit");
        Need(profile.Retry(),"retry adopts exact durable transaction");
        Need(confirmations==before+1 && profile.MaximumGameSpeed==1.5,"one confirmation grants speed");
        Need(profile.Retry() && confirmations==before+1,"retry cannot replay confirmation");
        Need(LastStandProgression.Load(store,()=>time.UtcMilliseconds).Wallet==wallet-20,"restart retains paid wallet");
    }
    static void Wave(Store store)
    {
        var profile=LastStandProgression.Load(store,()=>Epoch);var app=new LastStandRunCoordinator(profile);
        var model=profile.Checkpoint.RestoreModel();var shop=profile.Checkpoint.RestoreShop();
        model.ContinueAfterCheckpoint();
        while(model.Status==EncounterStatus.Running && !model.AwaitingWaveCommit)
        {model.Step();shop.ObserveAuthoritativeKills(model.Kills,model.Wave,0);}
        Need(model.AwaitingWaveCommit,"actual next wave cleared");int wallet=profile.Wallet;
        store.DenyWrite=true;
        Need(!app.CommitWave(model,shop,null,()=>true) && app.WavePending,"failed wave has application recovery intent");
        Need(profile.Wallet==wallet,"failed write publishes no reward");
        store.DenyWrite=false;
        var result=app.Retry(model,shop,null,()=>true,()=>true);
        Need(result.Kind==LastStandRecoveryKind.Wave && !app.WavePending,"wave recovery completes the pending intent");
        Need(profile.GetBestWave(1)==31 && profile.Wallet> wallet,"one actual clear payout");
        int paid=profile.Wallet;
        Need(app.Retry(model,shop,null,()=>true,()=>true).Kind==LastStandRecoveryKind.General && profile.Wallet==paid,"repeated retry grants nothing");
    }
    static void HostPause()
    {
        var clock=new LastStandRunClock(0,100000,5,5);
        var suspend=typeof(LastStandRunClock).GetMethod("SetHostSuspended");
        Need(suspend!=null,"native host suspension needs a distinct hold");
        clock.Observe(.02);Need(clock.TryTakeStep(),"pre-suspend tick");
        Func<double,bool,bool> Hold=(timestamp,value)=>(bool)suspend.Invoke(clock,new object[]{timestamp,value});
        Need(Hold(.02,true),"suspend");clock.Observe(600);
        Need(!clock.TryTakeStep(),"host suspension cannot drain old combat debt");
        Need(Hold(600,false),"resume host");int count=0;while(clock.TryTakeStep())count++;
        Need(count==1,"only pre-suspend debt survives, no offline combat");
        clock.Observe(600.1);count=0;while(clock.TryTakeStep())count++;Need(count==10,"5x resumes normal ticks");
        Need(clock.Pause(600.1),"manual pause");Hold(600.1,true);Hold(1000,false);
        Need(clock.ManualPaused && clock.SelectedSpeed==0 && !clock.TryTakeStep(),"native resume preserves manual pause");
    }
    public static void Main(string[] args)
    {
        if(args[0]=="host")HostPause();
        else {var store=new Store{Raw=File.ReadAllText(args[1])};if(args[0]=="research")Research(store);else Wave(store);}
        Console.WriteLine("PASS "+args[0]);
    }
}

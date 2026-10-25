using System;
using SingedTerra.LastStand;
internal sealed class FakeStorage : ILastStandStorage
{
    public string Value;
    public bool FailRead,FailWrite,FailNextRead,WriteThenFailRead,MismatchAfterWrite,MismatchNextRead;
    public string Read(){if(FailRead||FailNextRead){FailNextRead=false;throw new Exception("read failed");}if(MismatchNextRead){MismatchNextRead=false;return "mismatch";}return Value;}
    public void Write(string value){if(FailWrite)throw new Exception("write failed");Value=value;if(WriteThenFailRead){WriteThenFailRead=false;FailNextRead=true;}if(MismatchAfterWrite){MismatchAfterWrite=false;MismatchNextRead=true;}}
}
internal static class Program
{
    static void Need(bool value,string reason){if(!value)throw new InvalidOperationException(reason);}
    static string Legacy(bool pending,int credits=0)=>"{\"version\":1,\"credits\":"+credits+",\"permanentLevel\":0,\"nextRunId\":2,\"lastFinalizedRunId\":0,\"pendingDefeat\":"+(pending?"{\"runId\":1,\"elapsedTicks\":42,\"kills\":3,\"reward\":1}":"null")+"}";
    static LastStandProgression Load(FakeStorage store)=>LastStandProgression.Load(store,()=>1000000);
    static void Main(string[] args)
    {
        var storage=new FakeStorage();var model=Load(storage);
        switch(args[0])
        {
            case "defeat":
                Need(model.TryDeploy()&&model.TryStageDefeat(42,3),"Reserve/finalize run.");
                Need(!model.TryStageDefeat(42,3)&&!model.TryClaim()&&model.Wallet==0&&model.FinalizedRunId==1,"Defeat consumes once without death payout.");
                model=Load(new FakeStorage{Value=Legacy(true)});
                Need(model.TryClaim()&&!model.TryClaim()&&model.Wallet==1&&model.FinalizedRunId==1,"Historical pending reward claims once.");break;
            case "excluded":
                Need(model.TryDeploy(),"Reserve.");model.AbandonRun();
                Need(!model.HasCheckpoint&&!model.TryClaim()&&model.Wallet==0,"Abandon gives no reward.");
                Need(model.TryDeploy()&&!model.TryStageLimit(3600,4)&&model.HasCheckpoint,"No artificial horizon result.");
                Need(model.TryStageNonDefeat()&&model.FinalizedRunId==2&&!model.TryClaim(),"Non-defeat consumes run.");break;
            case "upgrade":
                model=Load(new FakeStorage{Value=Legacy(false,6)});Need(model.TryDeploy()&&model.CannonDamage==20,"Frozen base deployment.");
                for(int n=1;n<=3;n++)Need(model.NextCost==2&&model.TryPurchase()&&model.CannonAttackLevel==n&&model.CannonDamage==20,"Two Salvage early price; frozen active stats.");
                Need(model.Wallet==0&&!model.TryPurchase(),"Insufficient funds.");model.AbandonRun();
                Need(model.TryDeploy()&&model.CannonDamage==50,"Future deployment uses purchased levels.");break;
            case "reload":
                Need(model.TryDeploy(),"Reserve.");var restored=Load(storage);
                Need(restored.SaveState=="ready"&&restored.HasCheckpoint&&restored.NextRunId==2&&restored.Checkpoint.CompletedWave==0,"Restore starting boundary.");
                Need(storage.Value.StartsWith("{\"version\":5,")&&storage.Value.Contains("\"scrapYield\":0")&&storage.Value.Contains("\"research\":")&&storage.Value.Contains("\"history\":"),"Complete current schema.");
                foreach(string bad in new[]{storage.Value.Replace("\"version\":5","\"version\":6"),storage.Value.Replace("\"nextRunId\":2","\"nextRunId\":1"),Legacy(false).Replace("\"version\":1","\"version\":01"),Legacy(false)+"\v"})
                {var invalid=new FakeStorage{Value=bad};Need(Load(invalid).SaveState=="blocked"&&invalid.Value==bad,"Malformed bytes preserved.");}break;
            case "failure":
                storage.Value=Legacy(true);model=Load(storage);storage.FailWrite=true;
                Need(!model.TryClaim()&&model.Wallet==0&&model.PendingDefeat!=null,"Denied claim unpublished.");storage.FailWrite=false;
                Need(model.Retry()&&model.Wallet==1&&!model.TryClaim(),"Retry publishes once.");
                var unreadable=Load(new FakeStorage{FailRead=true});Need(unreadable.SaveState=="blocked"&&!unreadable.TryDeploy(),"Unreadable save blocks deploy.");break;
            case "uncertain":
                foreach(bool mismatch in new[]{false,true})
                {storage=new FakeStorage{Value=Legacy(true)};model=Load(storage);storage.WriteThenFailRead=!mismatch;storage.MismatchAfterWrite=mismatch;
                Need(!model.TryClaim()&&model.Wallet==0&&model.PendingDefeat!=null,"Unconfirmed claim unpublished.");
                Need(model.Retry()&&model.Retry()&&model.Wallet==1&&!model.TryClaim()&&Load(storage).Wallet==1,"Readback recovery applies reward once.");}break;
            default:throw new InvalidOperationException("Unknown case.");
        }
        Console.WriteLine("PASS "+args[0]);
    }
}

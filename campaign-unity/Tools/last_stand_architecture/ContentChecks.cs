using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

static class ContentChecks
{
    static void Require(bool value,string message) { if(!value)throw new Exception(message); }
    static void Reject(Action action) { try { action(); } catch(ArgumentException) { return; } throw new Exception("Invalid content admitted"); }
    static LastStandResearchDefinition Extra(int slot=4,string key="previewRecovery") =>
        new LastStandResearchDefinition((LastStandResearchTrackId)900,key,"Preview Recovery",20,slot,
            LastStandResearchCurve.Polynomial(7,1,50), LastStandResearchCurve.Polynomial(1,0,100),
            LastStandResearchEffect.Salvage,2,true);
    static LastStandResearchDefinitions Expanded()
    {
        var rows=new List<LastStandResearchDefinition>(LastStandResearchCatalog.Tracks);
        rows.Reverse(); rows.Insert(0,Extra());
        return new LastStandResearchDefinitions("content-preview-v1",rows);
    }
    static void Extension()
    {
        var definitions=Expanded();
        var state=LastStandResearchState.Create(1000,definitions);
        var track=(LastStandResearchTrackId)900;
        var intent=LastStandResearchPresentation.Intent(state.Snapshot(),0,track,LastStandResearchAction.Start,definitions);
        Require(LastStandResearchPresentation.CanSubmit(state.Snapshot(),intent,100,100,definitions),"Preview action not admitted");
        Require(state.TryApply(intent,100,100,out var funded)&&funded.WalletDelta==-8,"Authored price not used");
        Require(funded.State.TryAdvance(60000,61000,false,out var done),"Cannot complete new track");
        Require(done.State.Rank(track)==1&&done.State.EffectNumerator(LastStandResearchEffect.Salvage)==102,"Content effect did not reach engine");
        Require(LastStandResearchState.TryRestore(done.State.Snapshot(),definitions,out var restored)&&restored.Rank(track)==1,"Expanded state cannot restore");
        Require(LastStandResearchPresentation.TrackState(restored.Snapshot(),track,definitions)=="RANK 1 COMPLETE","Presentation did not resolve new definition");
        var tiers=new List<LastStandTierDefinition>(LastStandTierCatalog.All) {
            new LastStandTierDefinition(3,"tier-3","preview-tier3","preview-basin",3,1,2,300) };
        var environments=new List<LastStandEnvironmentIdentity>(LastStandContentCatalog.Environments) {
            new LastStandEnvironmentIdentity("preview-basin","Preview Basin","A non-awarding authored test battlefield.") };
        var content=new LastStandContentManifest("preview-v1",tiers,environments,LastStandFittingCatalog.Definitions,definitions);
        var options=content.TierOptions(id=>id<3);
        var selector=new LastStandSelection(options,"tier-2",true);
        Require(selector.Move(1)&&selector.Current.Id=="tier-3"&&!selector.Current.Unlocked,"New tier missing from normal selector");
        var playerOptions=content.TierOptions(id=>id<3,tier=>content.EnvironmentForTier(tier.Id).Description,true);
        var playerSelector=new LastStandSelection(playerOptions,"2",true);
        Require(playerSelector.Move(1)&&playerSelector.Current.Id=="3"&&playerSelector.Current.Name=="Tier 3 - Preview Basin",
            "Player selector did not receive authored tier through its persisted identity adapter");
        Require(content.FittingOptions(id=>id=="scattergun").Count==3,"Manifest fitting projection omitted content");
        var wave=LastStandWaveCatalog.ForWave(content.Tier(3),30);
        Require(wave.EnemyHull==1960&&wave.EnemyDamage==90,"Authored tier did not reach wave rules");
        Require(content.EnvironmentForTier(3).Name=="Preview Basin","Environment reference not resolved");
    }
    static void Invalid()
    {
        Reject(()=>Extra(4,"bad\nkey"));
        Reject(()=>new LastStandResearchDefinitions("research-v1",Expanded().Tracks));
        var overflow=new List<LastStandResearchDefinition>(LastStandResearchCatalog.Tracks);
        for(int i=0;i<22;i++)overflow.Add(new LastStandResearchDefinition((LastStandResearchTrackId)(100+i),"overflow"+i,"Overflow",10000,4+i,
            LastStandResearchCurve.Polynomial(1,0,1000000),LastStandResearchCurve.Polynomial(1,0,1000000),LastStandResearchEffect.Salvage,10000,true));
        Reject(()=>new LastStandResearchDefinitions("overflow-v1",overflow));
        var duplicate=new List<LastStandResearchDefinition>(LastStandResearchCatalog.Tracks) { Extra(3) };
        Reject(()=>new LastStandResearchDefinitions("bad-v1",duplicate));
        duplicate=new List<LastStandResearchDefinition>(LastStandResearchCatalog.Tracks) { Extra(4,"gameSpeed") };
        Reject(()=>new LastStandResearchDefinitions("bad-v1",duplicate));
        var tiers=new List<LastStandTierDefinition>(LastStandTierCatalog.All) { new LastStandTierDefinition(3,"tier-3","test","missing",1,1,2,300) };
        Reject(()=>new LastStandContentManifest("bad-v1",tiers,LastStandContentCatalog.Environments,LastStandFittingCatalog.Definitions,LastStandResearchCatalog.Definitions));
        tiers=new List<LastStandTierDefinition> {new LastStandTierDefinition(1,"invalid key","test","sunlit-ash",1,1)};
        Reject(()=>new LastStandContentManifest("bad-v1",tiers,LastStandContentCatalog.Environments,LastStandFittingCatalog.Definitions,LastStandResearchCatalog.Definitions));
        tiers=new List<LastStandTierDefinition> { new LastStandTierDefinition(1,"tier-1","one","sunlit-ash",1,1,2,300),new LastStandTierDefinition(2,"tier-2","two","sunlit-ash",1,1,1,300) };
        Reject(()=>new LastStandContentManifest("bad-v1",tiers,LastStandContentCatalog.Environments,LastStandFittingCatalog.Definitions,LastStandResearchCatalog.Definitions));
    }
    static void Legacy()
    {
        var rows=new List<LastStandResearchDefinition>(LastStandResearchCatalog.Tracks); rows.Reverse();
        var reordered=new LastStandResearchDefinitions(LastStandResearchCatalog.Version,rows);
        var s=LastStandResearchState.Create(1000).Snapshot();s.completedRanks=new[]{1,2,3,4};s.completionSequence=10;s.nextProjectIdentity=11;
        Require(LastStandResearchState.TryRestore(s,reordered,out var state),"Reordering changed legacy interpretation");
        Require(state.Rank(LastStandResearchTrackId.GameSpeed)==1&&state.Rank(LastStandResearchTrackId.ScrapLogistics)==4,"Legacy slots remapped");
        Require(state.Snapshot().completedRanks[2]==3,"Legacy serialized slot changed");
        Require(!LastStandResearchState.TryRestore(s,Expanded(),out _),"Catalog version mismatch was ignored");
        Require(LastStandResearchCatalog.Get(LastStandResearchTrackId.GameSpeed).Cost(8)==30000,"Speed cost drift");
        Require(LastStandResearchCatalog.Get(LastStandResearchTrackId.SalvageRecovery).Cost(100)==122500,"Recovery cost drift");
        Require(LastStandFittingCatalog.Parse("repair")==LastStandFitting.Repair&&LastStandFittingCatalog.Id(LastStandFitting.Scattergun)=="scattergun","Fitting identity drift");
        LastStandContentCatalog.Current.Validate();
    }
    static void Main(string[] args)
    { if(args[0]=="extension")Extension();else if(args[0]=="invalid")Invalid();else if(args[0]=="legacy")Legacy();else throw new Exception("Unknown case");Console.WriteLine("PASS "+args[0]); }
}

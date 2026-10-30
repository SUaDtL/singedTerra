using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    // Advisory copied values. This projection holds no transaction owner and
    // cannot spend Salvage, advance research or grant a pinned reward.
    public sealed class LastStandPlannerGoal
    {
        public string Key { get; }
        public string Category { get; }
        public string Title { get; }
        public string Detail { get; }
        public string Route { get; }
        public bool Achieved { get; }
        public bool Available { get; }
        public bool ActionAvailable { get; }
        public string Availability { get; }
        public long? Cost { get; }
        public long Shortfall { get; }
        internal LastStandPlannerGoal(string key,string category,string title,string detail,string route,
            bool achieved,bool available,bool actionAvailable,string availability,long? cost,long wallet)
        {
            Key=key;Category=category;Title=title;Detail=detail;Route=route;Achieved=achieved;
            Available=available;ActionAvailable=actionAvailable;Availability=availability;Cost=cost;
            Shortfall=cost.HasValue?Math.Max(0,cost.Value-wallet):0;
        }
    }

    public sealed class LastStandPlannerView
    {
        public IReadOnlyList<LastStandPlannerGoal> Goals { get; }
        public LastStandPlannerGoal Pinned { get; }
        public long Wallet { get; }
        internal LastStandPlannerView(List<LastStandPlannerGoal> goals,LastStandPlannerGoal pinned,long wallet)
        {Goals=goals.AsReadOnly();Pinned=pinned;Wallet=wallet;}
    }

    public static class LastStandProgressionPlanner
    {
        static string Number(long value)=>value.ToString("N0",CultureInfo.InvariantCulture);
        static string TargetKey(string category,string key,int rank)=>category+":"+key+":"+rank.ToString(CultureInfo.InvariantCulture);
        static string Funding(long cost,long wallet)=>Number(cost)+" Salvage"+
            (wallet<cost?" | need "+Number(cost-wallet)+" more":" | within current budget");

        public static LastStandPlannerView Project(LastStandProgression progression,LastStandResearchSnapshot research,
            LastStandFitting fitting,string pinnedGoal="")
        {
            if(progression==null)throw new ArgumentNullException(nameof(progression));
            if(pinnedGoal==null)throw new ArgumentNullException(nameof(pinnedGoal));
            var goals=new List<LastStandPlannerGoal>();
            foreach(var tier in LastStandTierCatalog.Visible(LastStandTierCatalog.All,progression.IsTierUnlocked))
                goals.Add(Tier(progression,tier));
            foreach(var definition in LastStandFittingCatalog.Definitions)if(definition.Playable)
                goals.Add(Fitting(progression,definition));
            var shop=LastStandShopPresentation.ProjectPermanent(progression,fitting,LastStandBulkQuantity.One);
            foreach(var card in shop.Cards)
                goals.Add(Workshop(progression,card,Math.Min(card.CurrentLevel+1,card.Cap)));
            bool researchValid=LastStandResearchState.TryRestore(research,out _);
            foreach(var definition in LastStandResearchCatalog.Tracks)
                goals.Add(Research(progression,researchValid?research:null,definition,
                    researchValid?Math.Min(research.Rank(definition.Id)+1,definition.MaximumRank):1));
            LastStandPlannerGoal pinned=null;
            if(pinnedGoal.Length>0)
            {
                foreach(var goal in goals)if(goal.Key==pinnedGoal){pinned=goal;break;}
                // Pin identity names a fixed target. Completion must not silently
                // turn "rank 1" into a new request to fund rank 2.
                if(pinned==null)pinned=ResolvePinned(progression,researchValid?research:null,shop,pinnedGoal);
            }
            return new LastStandPlannerView(goals,pinned,progression.Wallet);
        }

        static LastStandPlannerGoal Tier(LastStandProgression progression,LastStandTierDefinition tier)
        {
            bool achieved=progression.IsTierUnlocked(tier.Id);
            string detail=achieved?"UNLOCKED":tier.RequiredTier==0?"Save unavailable. Tier 1 is available for a new profile.":"Clear Tier "+tier.RequiredTier+" wave "+tier.RequiredWave+
                ". Best cleared: "+progression.GetBestWave(tier.RequiredTier)+".";
            detail+="\nUnlocking a tier preserves your current run. Select a tier in the garage for your next deployment.";
            return new LastStandPlannerGoal("tier:"+tier.Key,"Tier","Tier "+tier.Id,detail,"garage",achieved,true,
                false,achieved?"Achieved":"Wave goal",null,progression.Wallet);
        }
        static LastStandPlannerGoal Fitting(LastStandProgression progression,LastStandFittingDefinition fitting)
        {
            bool achieved=progression.IsFittingUnlocked(fitting.Id);
            string detail=achieved?"UNLOCKED":fitting.InitiallyUnlocked?"Save unavailable. This fitting is available for a new profile.":"Clear Tier "+fitting.UnlockTier+" wave "+fitting.UnlockWave+
                ". Best cleared: "+progression.GetBestWave(fitting.UnlockTier)+".";
            return new LastStandPlannerGoal("fitting:"+fitting.Id,"Fitting",fitting.Name,
                detail+"\n"+fitting.Description,"garage",achieved,true,false,
                achieved?"Achieved":"Wave goal",null,progression.Wallet);
        }
        static LastStandPlannerGoal Workshop(LastStandProgression progression,LastStandShopCard card,int target)
        {
            var definition=LastStandUpgradeCatalog.Get(card.TrackId);
            bool achieved=card.CurrentLevel>=target;
            bool next=target==card.CurrentLevel+1;
            long? cost=achieved?(long?)null:next?card.NextPrice:definition.PermanentPrice(target);
            string availability=achieved?"Achieved":!next?"Complete earlier levels first":card.Reason;
            string detail="Permanent level "+card.CurrentLevel+" / "+card.Cap+"\n"+
                (achieved?definition.DescribeEffect(target):definition.DescribeEffect(target-1)+" -> "+definition.DescribeEffect(target));
            if(cost.HasValue)detail+="\n"+Funding(cost.Value,progression.Wallet);
            detail+="\n"+availability;
            if(card.IsDormant)detail+="\nDormant for the selected fitting; choose its matching fitting to use this benefit.";
            if(progression.HasCheckpoint)detail+="\nA purchase benefits the next deployment. This saved run keeps its original permanent levels.";
            return new LastStandPlannerGoal(TargetKey("workshop",card.Key,target),"Workshop",
                card.Name+" level "+target,detail,"shop",achieved,true,next&&card.CanPurchase,availability,cost,progression.Wallet);
        }
        static LastStandPlannerGoal Research(LastStandProgression progression,LastStandResearchSnapshot snapshot,
            LastStandResearchDefinition definition,int target)
        {
            string key=TargetKey("research",definition.Key,target),title=definition.Name+" rank "+target;
            if(snapshot==null)return new LastStandPlannerGoal(key,"Research",title,
                "Research data is unavailable. Open Research after the saved profile is ready.","research",false,true,false,
                "Research unavailable",null,progression.Wallet);
            int rank=snapshot.Rank(definition.Id);bool achieved=rank>=target;
            string effects=LastStandResearchPresentation.Effect(definition.Id,target);
            if(achieved)return new LastStandPlannerGoal(key,"Research",title,"ACHIEVED\n"+effects,"research",true,true,false,"Achieved",null,progression.Wallet);
            effects=LastStandResearchPresentation.Effect(definition.Id,target-1)+"\n-> "+effects;
            foreach(var slot in snapshot.slots)
            {
                foreach(var project in new[]{slot.active,slot.queued})if(project!=null&&project.track==definition.Id&&project.rank==target)
                    return new LastStandPlannerGoal(key,"Research",title,effects+"\nAlready funded: "+Number(project.chargedCost)+
                        " Salvage paid.\n"+LastStandResearchPresentation.Project(project,project==slot.queued)+
                        "\nNo additional funding is required for this rank.","research",false,true,false,
                        project==slot.queued?"Queued":"Active",0,progression.Wallet);
            }
            var quote=LastStandResearchPresentation.ProjectQuote(snapshot,definition.Id,target);
            long cost=quote.Cost,remaining=quote.RemainingMilliseconds;
            bool possible=false;
            int unlocked=LastStandResearchCatalog.UnlockedSlots(progression.GetBestWave(1));
            if(progression.SaveState=="ready"&&progression.PendingDefeat==null)
                for(int slot=0;slot<unlocked;slot++)
                    foreach(var action in new[]{LastStandResearchAction.Start,LastStandResearchAction.Queue})
                    {
                        var intent=LastStandResearchPresentation.Intent(snapshot,slot,definition.Id,action);
                        if(intent.Rank==target&&LastStandResearchPresentation.CanSubmit(snapshot,intent,progression.Wallet,progression.GetBestWave(1)))possible=true;
                    }
            string availability=progression.SaveState!="ready"?"Save unavailable":progression.PendingDefeat!=null?"Resolve pending reward first":
                unlocked==0?"Research unlocks at Tier 1 wave 25":possible?"Can fund in Research":
                target!=rank+1?"Complete earlier ranks first":progression.Wallet<cost?"Not enough Salvage":"Open Research to review occupied labs and queues";
            string detail=effects+"\n"+Funding(cost,progression.Wallet)+"\n"+
                LastStandResearchPresentation.Duration(remaining)+(!quote.ResumesPartial?" real time (duration locks on start)":" remaining; resuming repays the refunded cost")+
                "\n"+availability;
            return new LastStandPlannerGoal(key,"Research",title,detail,"research",false,true,possible,availability,cost,progression.Wallet);
        }

        static LastStandPlannerGoal ResolvePinned(LastStandProgression progression,LastStandResearchSnapshot research,
            LastStandShopView shop,string key)
        {
            foreach(var tier in LastStandTierCatalog.All)if(tier.Playable&&key=="tier:"+tier.Key)return Tier(progression,tier);
            foreach(var fitting in LastStandFittingCatalog.Definitions)if(fitting.Playable&&key=="fitting:"+fitting.Id)return Fitting(progression,fitting);
            var parts=key.Split(':');
            if(parts.Length==3&&int.TryParse(parts[2],NumberStyles.None,CultureInfo.InvariantCulture,out int rank)&&rank>0&&
                parts[2]==rank.ToString(CultureInfo.InvariantCulture))
            {
                if(parts[0]=="workshop")foreach(var card in shop.Cards)if(card.Key==parts[1]&&rank<=card.Cap)return Workshop(progression,card,rank);
                if(parts[0]=="research"&&LastStandResearchCatalog.TryGet(parts[1],out var definition)&&rank<=definition.MaximumRank)
                    return Research(progression,research,definition,rank);
            }
            return new LastStandPlannerGoal(key,"Unavailable","Pinned goal unavailable",
                "This saved goal is not in the current catalog. Your pin is preserved; choose a different goal or clear it.",
                "",false,false,false,"Unavailable",null,progression.Wallet);
        }
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
    // A read-only quote shared by the Lab and Planner. Funding still belongs to
    // the research transaction, which revalidates the displayed intent.
    public sealed class LastStandResearchQuote
    {
        public int Rank { get; }
        public long Cost { get; }
        public long DurationMilliseconds { get; }
        public long EarnedMilliseconds { get; }
        public long RemainingMilliseconds => Math.Max(0,DurationMilliseconds-EarnedMilliseconds);
        public bool ResumesPartial { get; }
        public string BeforeEffect { get; }
        public string AfterEffect { get; }
        public string AppliesTo { get; }
        public bool AppliesOnNextDeployment { get; }
        public bool HasLoadout { get; }
        public bool AppliesToPrimaryBay { get; }
        public bool AppliesToSecondaryBay { get; }
        public bool AppliesToBothBays => AppliesToPrimaryBay&&AppliesToSecondaryBay;
        public bool AppliesToBaseCannon { get; }
        public bool AppliesToSelectedLoadout => AppliesToPrimaryBay||AppliesToSecondaryBay||AppliesToBaseCannon;
        public string LoadoutApplicability
        {
            get
            {
                if(!HasLoadout)return "";
                if(!AppliesOnNextDeployment)return "Applies to all loadouts.";
                string fittings=AppliesToBothBays?"both equipped fittings":AppliesToPrimaryBay?"the fitting in bay 1":
                    AppliesToSecondaryBay?"the fitting in bay 2":null;
                if(AppliesToBaseCannon)return "Applies to the base cannon"+(fittings==null?".":" and "+fittings+".");
                return fittings==null?"No matching fitting equipped; ranks remain available for later loadouts.":"Applies to "+fittings+".";
            }
        }
        public string ApplicationTiming => AppliesOnNextDeployment?"Applies on the next deployment; a running or saved run keeps its captured ranks.":"Completed benefits apply automatically.";
        internal LastStandResearchQuote(int rank,long cost,long duration,long earned,bool resumesPartial,
            string beforeEffect,string afterEffect,string appliesTo,bool nextDeployment,LastStandResearchDefinition definition,LastStandLoadout loadout)
        {Rank=rank;Cost=cost;DurationMilliseconds=duration;EarnedMilliseconds=earned;ResumesPartial=resumesPartial;
            BeforeEffect=beforeEffect;AfterEffect=afterEffect;AppliesTo=appliesTo;AppliesOnNextDeployment=nextDeployment;
            HasLoadout=loadout!=null;AppliesToBaseCannon=HasLoadout&&definition.Effect==LastStandResearchEffect.ArmorPiercing;
            AppliesToPrimaryBay=HasLoadout&&LastStandResearchPresentation.AppliesToFitting(definition,loadout.Primary);
            AppliesToSecondaryBay=HasLoadout&&loadout.Secondary.HasValue&&LastStandResearchPresentation.AppliesToFitting(definition,loadout.Secondary.Value);}
    }

    public sealed class LastStandResearchActionQuote
    {
        public LastStandResearchQuote Funding { get; }
        public bool CanSubmit { get; }
        public bool ValidWhenFunded { get; }
        public long Refund { get; }
        public long Shortfall { get; }
        public bool RemovesQueuedProject { get; }
        public bool StartsQueuedProject { get; }
        internal LastStandResearchActionQuote(LastStandResearchQuote funding,bool canSubmit,bool valid,
            long refund,long shortfall,bool removesQueued,bool startsQueued)
        {Funding=funding;CanSubmit=canSubmit;ValidWhenFunded=valid;Refund=refund;Shortfall=shortfall;RemovesQueuedProject=removesQueued;StartsQueuedProject=startsQueued;}
    }

    // Read-only presentation helpers use the engine for action legality. A quote
    // never charges the wallet; the parent submits its displayed revision.
    public static class LastStandResearchPresentation
    {
        public static string Duration(long milliseconds)
        {
            if(milliseconds<0)throw new ArgumentOutOfRangeException(nameof(milliseconds));
            long seconds=milliseconds/1000+(milliseconds%1000>0?1:0);
            if(seconds>=86400)return (seconds/86400)+"d "+(seconds%86400/3600)+"h";
            if(seconds>=3600)return (seconds/3600)+"h "+(seconds%3600/60)+"m";
            if(seconds>=60)return (seconds/60)+"m "+(seconds%60)+"s";
            return seconds+"s";
        }
        public static string Category(LastStandResearchTrackId track,LastStandResearchDefinitions definitions=null)
            => (definitions??LastStandResearchCatalog.Definitions).Get(track).Category;
        public static string Effect(LastStandResearchTrackId track,int rank,LastStandResearchDefinitions definitions=null)
        {
            var definition=(definitions??LastStandResearchCatalog.Definitions).Get(track);
            double value=definition.EffectNumerator(rank)/100.0;
            string number=value.ToString("0.00",CultureInfo.InvariantCulture)+"x";
            switch(definition.Effect)
            {
                case LastStandResearchEffect.GameSpeed:return "Combat speed cap: "+value.ToString("0.0",CultureInfo.InvariantCulture)+"x";
                case LastStandResearchEffect.ResearchSpeed:return "Other research works at "+number+" base speed. Does not accelerate itself.";
                case LastStandResearchEffect.Salvage:return number+" repeatable wave Salvage; one-time milestones unchanged.";
                case LastStandResearchEffect.ArmorPiercing:return new LastStandCombatResearchSnapshot(rank,0,0).ArmorPenetration+" armor penetration; enemy armor cannot fall below zero.";
                case LastStandResearchEffect.AreaControl:return (new LastStandCombatResearchSnapshot(0,rank,0).AreaEffectPercent/100.0).ToString("0.00",CultureInfo.InvariantCulture)+"x splash and chain damage.";
                case LastStandResearchEffect.FieldEngineering:return (new LastStandCombatResearchSnapshot(0,0,rank).EngineeringPercent/100.0).ToString("0.00",CultureInfo.InvariantCulture)+"x repair and shield recharge amounts.";
                default:return number+" combat Scrap, multiplying Workshop Scrap Yield.";
            }
        }
        public static string Applicability(LastStandResearchTrackId track,LastStandResearchDefinitions definitions=null)
        {
            switch((definitions??LastStandResearchCatalog.Definitions).Get(track).Effect)
            {
                case LastStandResearchEffect.ArmorPiercing:return "Cannon, Auxiliary Launcher, Auxiliary Scattergun, Mortar and Arc Coil. Railgun already ignores armor.";
                case LastStandResearchEffect.AreaControl:return "Auxiliary Launcher, Mortar and Arc Coil.";
                case LastStandResearchEffect.FieldEngineering:return "Field Repair and Shield Generator.";
                default:return "All loadouts.";
            }
        }
        internal static bool AppliesToFitting(LastStandResearchDefinition definition,LastStandFitting fitting)
        {
            switch(definition.Effect)
            {
                case LastStandResearchEffect.ArmorPiercing:return fitting==LastStandFitting.Launcher||fitting==LastStandFitting.Scattergun||fitting==LastStandFitting.Mortar||fitting==LastStandFitting.Arc;
                case LastStandResearchEffect.AreaControl:return fitting==LastStandFitting.Launcher||fitting==LastStandFitting.Mortar||fitting==LastStandFitting.Arc;
                case LastStandResearchEffect.FieldEngineering:return fitting==LastStandFitting.Repair||fitting==LastStandFitting.Shield;
                default:return true;
            }
        }
        public static string Project(LastStandResearchProjectSnapshot project,bool queued=false,LastStandResearchDefinitions definitions=null)
        {
            if(project==null)return queued?"Queue empty":"Idle";
            string text=(definitions??LastStandResearchCatalog.Definitions).Get(project.track).Name+" "+project.rank;
            if(project.durationMilliseconds==0)return text+" - funded, starts after active research";
            long remaining=Math.Max(0,project.durationMilliseconds-project.earnedMilliseconds);
            return text+" - "+Duration(remaining)+(queued?" left when resumed":" remaining");
        }
        public static string TrackState(LastStandResearchSnapshot snapshot,LastStandResearchTrackId track,LastStandResearchDefinitions definitions=null)
        {
            var definition=(definitions??LastStandResearchCatalog.Definitions).Get(track);int rank=snapshot.Rank(track,definitions);
            if(rank==definition.MaximumRank)return "COMPLETE";
            for(int i=0;i<snapshot.slots.Length;i++)
            {
                var slot=snapshot.slots[i];
                if(slot.active!=null && slot.active.track==track)return "ACTIVE - LAB "+(i+1);
                if(slot.queued!=null && slot.queued.track==track)return "QUEUED - LAB "+(i+1);
            }
            return snapshot.Partial(track,definitions)!=null?"SUSPENDED - TIME SAVED":rank>0?"RANK "+rank+" COMPLETE":"AVAILABLE";
        }
        public static LastStandResearchIntent Intent(LastStandResearchSnapshot snapshot,int slot,
            LastStandResearchTrackId track,LastStandResearchAction action,LastStandResearchDefinitions definitions=null)
        {
            if(snapshot==null || slot<0 || slot>=snapshot.slots.Length)throw new ArgumentException("Invalid displayed research slot.");
            var row=snapshot.slots[slot];int rank=snapshot.Rank(track,definitions)+1;
            if(action==LastStandResearchAction.Queue && row.active!=null && row.active.track==track)rank++;
            return new LastStandResearchIntent {Slot=slot,Track=track,Rank=rank,Action=action,
                ExpectedRevision=snapshot.revision,ExpectedActiveIdentity=row.active?.identity??0,
                ExpectedQueuedIdentity=row.queued?.identity??0};
        }
        public static bool CanSubmit(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent,long wallet,int bestWave,LastStandResearchDefinitions definitions=null,int bestTierTwoWave=0)
        {
            return PreviewTransition(snapshot,intent,wallet,bestWave,bestTierTwoWave,definitions,out _);
        }
        static bool PreviewTransition(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent,long wallet,int bestWave,int bestTierTwoWave,
            LastStandResearchDefinitions definitions,out LastStandResearchTransition transition)
        {
            transition=null;
            return LastStandResearchState.TryRestore(snapshot,definitions??LastStandResearchCatalog.Definitions,out var state)&&
                state.TryApply(intent,wallet,bestWave,bestTierTwoWave,out transition);
        }
        public static LastStandResearchActionQuote ProjectAction(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent,
            long wallet,int bestWave,LastStandResearchDefinitions definitions=null,int bestTierTwoWave=0)
        {
            bool pays=intent.Action==LastStandResearchAction.Start||intent.Action==LastStandResearchAction.Queue||intent.Action==LastStandResearchAction.Switch;
            var funding=pays?ProjectQuote(snapshot,intent.Track,intent.Rank,definitions):null;
            bool possible=PreviewTransition(snapshot,intent,wallet,bestWave,bestTierTwoWave,definitions,out var transition);
            // Ask the same pure engine about the offer with enough funds. This
            // exposes refunds/canceled queues without duplicating switch rules
            // or changing the actual wallet, clock or displayed intent.
            bool valid=possible;
            if(!valid&&funding!=null)valid=PreviewTransition(snapshot,intent,Math.Max(wallet,funding.Cost),bestWave,bestTierTwoWave,definitions,out transition);
            long cost=funding?.Cost??0,refund=valid?transition.WalletDelta+cost:0;
            bool removed=false,started=false;
            if(valid&&snapshot.slots[intent.Slot].queued!=null)
            {
                long identity=snapshot.slots[intent.Slot].queued.identity;var next=transition.State.Snapshot().slots[intent.Slot];
                started=next.active!=null&&next.active.identity==identity;
                removed=!started&&(next.queued==null||next.queued.identity!=identity);
            }
            return new LastStandResearchActionQuote(funding,possible,valid,refund,Math.Max(0,cost-refund-wallet),removed,started);
        }
        public static LastStandResearchQuote ProjectQuote(LastStandResearchSnapshot snapshot,LastStandResearchTrackId track,
            int rank,LastStandResearchDefinitions definitions=null,LastStandLoadout loadout=null)
        {
            if(snapshot==null)throw new ArgumentNullException(nameof(snapshot));
            var catalog=definitions??LastStandResearchCatalog.Definitions;var definition=catalog.Get(track);
            if(rank<1||rank>definition.MaximumRank)return null;
            var partial=snapshot.Partial(track,catalog);if(partial!=null&&partial.rank!=rank)partial=null;
            return new LastStandResearchQuote(rank,partial?.chargedCost??definition.Cost(rank),
                partial?.durationMilliseconds??definition.DurationAtSpeedNumerator(rank,
                    catalog.EffectNumerator(snapshot.completedRanks,LastStandResearchEffect.ResearchSpeed)),
                partial?.earnedMilliseconds??0,partial!=null,Effect(track,rank-1,catalog),Effect(track,rank,catalog),
                Applicability(track,catalog),definition.IsCombatSnapshot,definition,loadout);
        }
        public static string Quote(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent,LastStandResearchDefinitions definitions=null)
        {
            var quote=ProjectQuote(snapshot,intent.Track,intent.Rank,definitions);
            if(quote==null)return "All ranks completed or funded.";
            return "Rank "+quote.Rank+": "+quote.Cost.ToString("N0",CultureInfo.InvariantCulture)+" Salvage | "+Duration(quote.RemainingMilliseconds)+
                (quote.ResumesPartial?" remaining; repays refunded cost":" real time")+
                (intent.Action==LastStandResearchAction.Queue&&!quote.ResumesPartial?" (estimate; duration locks on start)":"");
        }
        public static string Availability(LastStandResearchSnapshot snapshot,LastStandResearchTrackId track,
            long wallet,int bestTierOneWave,bool canAct,int bestTierTwoWave=0)
        {
            string state=TrackState(snapshot,track);
            if(state=="COMPLETE"||state.StartsWith("ACTIVE",StringComparison.Ordinal)||state.StartsWith("QUEUED",StringComparison.Ordinal))return state;
            int unlocked=LastStandResearchCatalog.UnlockedSlots(bestTierOneWave,bestTierTwoWave);
            if(unlocked==0)return "PREVIEW - RESEARCH LOCKED";
            if(!LastStandResearchCatalog.IsUnlocked(LastStandResearchCatalog.Get(track),bestTierOneWave))return "LOCKED - TIER 1 WAVE 500";
            if(!canAct)return "SAVE REQUIRED";
            long shortfall=long.MaxValue;
            foreach(var action in new[]{LastStandResearchAction.Start,LastStandResearchAction.Queue,LastStandResearchAction.Switch})
            for(int i=0;i<unlocked;i++)
            {
                var offer=ProjectAction(snapshot,Intent(snapshot,i,track,action),wallet,bestTierOneWave,bestTierTwoWave:bestTierTwoWave);
                if(offer.CanSubmit)return action==LastStandResearchAction.Start?"READY TO START":action==LastStandResearchAction.Queue?"READY TO QUEUE":"CAN SWITCH PROJECT";
                if(offer.ValidWhenFunded)shortfall=Math.Min(shortfall,offer.Shortfall);
            }
            return shortfall!=long.MaxValue&&shortfall>0?"NEED "+shortfall.ToString("N0",CultureInfo.InvariantCulture)+" SALVAGE":"LABS BUSY";
        }
    }

    public sealed class LastStandResearchListEntry
    {
        public string Key { get; }
        public string Name { get; }
        public string Category { get; }
        public LastStandResearchListEntry(string key,string name,string category)
        {
            if(String.IsNullOrWhiteSpace(key)||key.Length>80||String.IsNullOrWhiteSpace(name)||name.Length>80||
                String.IsNullOrWhiteSpace(category)||category.Length>40)throw new ArgumentException("Invalid project list entry.");
            Key=key;Name=name;Category=category;
        }
    }
    // The list does not assume four projects or attach one top-level action per
    // project. Filtering/selection stays stable when the catalog is reordered.
    public sealed class LastStandResearchList
    {
        readonly List<LastStandResearchListEntry> all=new List<LastStandResearchListEntry>();
        public IReadOnlyList<LastStandResearchListEntry> Visible { get; private set; }
        public string SelectedKey { get; private set; }
        public LastStandResearchList(IEnumerable<LastStandResearchListEntry> entries)
        {
            if(entries==null)throw new ArgumentNullException(nameof(entries));var keys=new HashSet<string>(StringComparer.Ordinal);
            foreach(var entry in entries)
            { if(all.Count==512||entry==null||!keys.Add(entry.Key))throw new ArgumentException("Invalid or oversized project catalog.");all.Add(entry); }
            if(all.Count==0)throw new ArgumentException("Empty project catalog.");Filter("","");
        }
        public void Filter(string category,string query)
        {
            if(category==null||query==null||query.Length>80)throw new ArgumentException("Invalid project filter.");
            var next=all.FindAll(e=>(category==""||e.Category==category)&&
                (query==""||e.Name.IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0));
            Visible=next.AsReadOnly();if(!next.Exists(e=>e.Key==SelectedKey))SelectedKey=next.Count>0?next[0].Key:null;
        }
        public void Select(string key)
        { foreach(var item in Visible)if(item.Key==key){SelectedKey=key;return;}throw new ArgumentException("Selection is outside visible projects."); }
    }
}

using System;
using System.Collections.Generic;
using System.Globalization;

namespace SingedTerra.LastStand
{
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
        public static string Category(LastStandResearchTrackId track) => track==LastStandResearchTrackId.GameSpeed ? "Combat" :
            track==LastStandResearchTrackId.ResearchSpeed ? "Research" : "Economy";
        public static string Effect(LastStandResearchTrackId track,int rank)
        {
            double value=LastStandResearchCatalog.Get(track).EffectNumerator(rank)/100.0;
            string number=value.ToString("0.00",CultureInfo.InvariantCulture)+"x";
            switch(track)
            {
                case LastStandResearchTrackId.GameSpeed:return "Combat speed cap: "+value.ToString("0.0",CultureInfo.InvariantCulture)+"x";
                case LastStandResearchTrackId.ResearchSpeed:return "Other research works at "+number+" base speed. Does not accelerate itself.";
                case LastStandResearchTrackId.SalvageRecovery:return number+" repeatable wave Salvage; one-time milestones unchanged.";
                default:return number+" combat Scrap, multiplying Workshop Scrap Yield.";
            }
        }
        public static string Project(LastStandResearchProjectSnapshot project,bool queued=false)
        {
            if(project==null)return queued?"Queue empty":"Idle";
            string text=LastStandResearchCatalog.Get(project.track).Name+" "+project.rank;
            if(project.durationMilliseconds==0)return text+" - funded, starts after active research";
            long remaining=Math.Max(0,project.durationMilliseconds-project.earnedMilliseconds);
            return text+" - "+Duration(remaining)+(queued?" left when resumed":" remaining");
        }
        public static string TrackState(LastStandResearchSnapshot snapshot,LastStandResearchTrackId track)
        {
            var definition=LastStandResearchCatalog.Get(track);int rank=snapshot.completedRanks[(int)track];
            if(rank==definition.MaximumRank)return "COMPLETE";
            for(int i=0;i<snapshot.slots.Length;i++)
            {
                var slot=snapshot.slots[i];
                if(slot.active!=null && slot.active.track==track)return "ACTIVE - LAB "+(i+1);
                if(slot.queued!=null && slot.queued.track==track)return "QUEUED - LAB "+(i+1);
            }
            return snapshot.partials[(int)track]!=null?"SUSPENDED - TIME SAVED":rank>0?"RANK "+rank+" COMPLETE":"AVAILABLE";
        }
        public static LastStandResearchIntent Intent(LastStandResearchSnapshot snapshot,int slot,
            LastStandResearchTrackId track,LastStandResearchAction action)
        {
            if(snapshot==null || slot<0 || slot>=snapshot.slots.Length)throw new ArgumentException("Invalid displayed research slot.");
            var row=snapshot.slots[slot];int rank=snapshot.completedRanks[(int)track]+1;
            if(action==LastStandResearchAction.Queue && row.active!=null && row.active.track==track)rank++;
            return new LastStandResearchIntent {Slot=slot,Track=track,Rank=rank,Action=action,
                ExpectedRevision=snapshot.revision,ExpectedActiveIdentity=row.active?.identity??0,
                ExpectedQueuedIdentity=row.queued?.identity??0};
        }
        public static bool CanSubmit(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent,long wallet,int bestWave)
        {
            return LastStandResearchState.TryRestore(snapshot,out var state) && state.TryApply(intent,wallet,bestWave,out _);
        }
        public static string Quote(LastStandResearchSnapshot snapshot,LastStandResearchIntent intent)
        {
            var definition=LastStandResearchCatalog.Get(intent.Track);
            if(intent.Rank>definition.MaximumRank)return "All ranks completed or funded.";
            var partial=snapshot.partials[(int)intent.Track];if(partial!=null && partial.rank!=intent.Rank)partial=null;
            long cost=partial?.chargedCost??definition.Cost(intent.Rank);
            long duration=partial?.durationMilliseconds??definition.DurationMilliseconds(intent.Rank,snapshot.completedRanks[(int)LastStandResearchTrackId.ResearchSpeed]);
            long earned=partial?.earnedMilliseconds??0;
            return "Rank "+intent.Rank+": "+cost.ToString("N0",CultureInfo.InvariantCulture)+" Salvage | "+Duration(duration-earned)+
                (partial!=null?" remaining; repays refunded cost":" real time")+
                (intent.Action==LastStandResearchAction.Queue && partial==null?" (estimate; duration locks on start)":"");
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

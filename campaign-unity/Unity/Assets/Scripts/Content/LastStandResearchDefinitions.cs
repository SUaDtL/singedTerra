using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandResearchEffect { GameSpeed, Salvage, ResearchSpeed, Scrap }

    // Authored numeric policy independent of identity, currency and UI.
    public sealed class LastStandResearchCurve
    {
        readonly long linear, quadratic, cubicDivisor;
        readonly long[] table;
        LastStandResearchCurve(long linear,long quadratic,long cubicDivisor,long[] table)
        { this.linear=linear;this.quadratic=quadratic;this.cubicDivisor=cubicDivisor;this.table=table; }
        public static LastStandResearchCurve Polynomial(long linear,long quadratic,long cubicDivisor)
        {
            if(linear<1 || quadratic<0 || cubicDivisor<1)throw new ArgumentException("Invalid research curve.");
            return new LastStandResearchCurve(linear,quadratic,cubicDivisor,null);
        }
        public static LastStandResearchCurve Table(params long[] values)
        {
            if(values==null || values.Length==0)throw new ArgumentException("Missing research curve.");
            foreach(long value in values)if(value<1)throw new ArgumentException("Research values must be positive.");
            return new LastStandResearchCurve(0,0,0,(long[])values.Clone());
        }
        public long At(int rank)
        {
            if(rank<1 || (table!=null && rank>table.Length))throw new ArgumentOutOfRangeException(nameof(rank));
            long n=rank;
            return table!=null?table[rank-1]:checked(linear*n+quadratic*n*n+n*n*n/cubicDivisor);
        }
    }

    // Storage slots are a serialized contract, not presentation ordering.
    public sealed class LastStandResearchDefinitions
    {
        readonly Dictionary<LastStandResearchTrackId,LastStandResearchDefinition> byId = new Dictionary<LastStandResearchTrackId,LastStandResearchDefinition>();
        readonly Dictionary<string,LastStandResearchDefinition> byKey = new Dictionary<string,LastStandResearchDefinition>(StringComparer.Ordinal);
        readonly LastStandResearchDefinition[] bySlot;
        public string Version { get; }
        public IReadOnlyList<LastStandResearchDefinition> Tracks { get; }
        public int Count => bySlot.Length;
        public LastStandResearchDefinitions(string version,IEnumerable<LastStandResearchDefinition> definitions)
        {
            if(String.IsNullOrWhiteSpace(version)||version.Length>80||definitions==null)throw new ArgumentException("Invalid research catalog.");
            var rows=new List<LastStandResearchDefinition>(definitions);
            if(rows.Count<4 || rows.Count>512)throw new ArgumentException("Research catalog must include supported core tracks.");
            bySlot=new LastStandResearchDefinition[rows.Count];
            foreach(var row in rows)
            {
                if(row==null || byId.ContainsKey(row.Id) || byKey.ContainsKey(row.Key) || row.StorageSlot<0 || row.StorageSlot>=rows.Count || bySlot[row.StorageSlot]!=null)
                    throw new ArgumentException("Duplicate research identity or storage slot.");
                if((row.Effect==LastStandResearchEffect.GameSpeed && row.Id!=LastStandResearchTrackId.GameSpeed) ||
                    (row.Effect==LastStandResearchEffect.ResearchSpeed && row.Id!=LastStandResearchTrackId.ResearchSpeed))
                    throw new ArgumentException("Combat and research clocks each require one authoritative speed track.");
                byId.Add(row.Id,row);byKey.Add(row.Key,row);bySlot[row.StorageSlot]=row;
            }
            var legacyKeys=new[]{"gameSpeed","salvageRecovery","researchSpeed","scrapLogistics"};
            var legacyEffects=new[]{LastStandResearchEffect.GameSpeed,LastStandResearchEffect.Salvage,LastStandResearchEffect.ResearchSpeed,LastStandResearchEffect.Scrap};
            for(int i=0;i<legacyKeys.Length;i++)
            {
                if(!byId.TryGetValue((LastStandResearchTrackId)i,out var row)||row.Key!=legacyKeys[i]||row.StorageSlot!=i||row.Effect!=legacyEffects[i])
                    throw new ArgumentException("Legacy research identities cannot be remapped.");
            }
            if(version==LastStandResearchCatalog.LegacyVersion && rows.Count!=legacyKeys.Length)
                throw new ArgumentException("Expanded research requires a new catalog version.");
            Version=version;Tracks=rows.AsReadOnly();
            var maximumRanks=new int[rows.Count];
            foreach(var row in rows)maximumRanks[row.StorageSlot]=row.MaximumRank;
            try
            {
                foreach(LastStandResearchEffect effect in Enum.GetValues(typeof(LastStandResearchEffect)))
                    EffectNumerator(maximumRanks,effect);
            }
            catch(OverflowException error){throw new ArgumentException("Combined research effects exceed supported numeric bounds.",error);}
        }
        public bool Contains(LastStandResearchTrackId id)=>byId.ContainsKey(id);
        public LastStandResearchDefinition Get(LastStandResearchTrackId id)
        { if(!byId.TryGetValue(id,out var row))throw new ArgumentOutOfRangeException(nameof(id));return row; }
        public bool TryGet(string key,out LastStandResearchDefinition definition)
        { if(key==null){definition=null;return false;}return byKey.TryGetValue(key,out definition); }
        public int Slot(LastStandResearchTrackId id)=>Get(id).StorageSlot;
        public LastStandResearchDefinition AtSlot(int index)
        { if(index<0||index>=bySlot.Length)throw new ArgumentOutOfRangeException(nameof(index));return bySlot[index]; }
        public int EffectNumerator(int[] ranks,LastStandResearchEffect effect)
        {
            if(ranks==null||ranks.Length!=Count||!Enum.IsDefined(typeof(LastStandResearchEffect),effect))throw new ArgumentException("Invalid research effect or rank slots.");
            int result=100;
            foreach(var row in Tracks)if(row.Effect==effect)result=checked(result+row.EffectNumerator(ranks[row.StorageSlot])-100);
            return result;
        }
    }
}

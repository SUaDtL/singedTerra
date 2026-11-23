using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandSkillId { Overdrive, EmergencyRepairs, Minefield, ReinforcedHull, Ballistics, ReactiveLining }

    public sealed class LastStandSkillDefinition
    {
        public LastStandSkillId Id { get; }
        public string Key { get; }
        public string Name { get; }
        public bool IsActive { get; }
        public int UnlockWave { get; }
        internal LastStandSkillDefinition(LastStandSkillId id,string key,string name,bool active,int wave)
        {Id=id;Key=key;Name=name;IsActive=active;UnlockWave=wave;}
    }

    public static class LastStandSkillCatalog
    {
        public const string Version="skills-v1";
        public const int Count=6,MaximumRank=3,MaximumCopies=6,MaximumSlots=3,DrawCost=1;
        public const string CurrencyName="Skill Intel";
        static readonly LastStandSkillDefinition[] definitions={
            new LastStandSkillDefinition(LastStandSkillId.Overdrive,"overdrive","Overdrive",true,25),
            new LastStandSkillDefinition(LastStandSkillId.EmergencyRepairs,"emergencyRepairs","Emergency Repairs",true,100),
            new LastStandSkillDefinition(LastStandSkillId.Minefield,"minefield","Minefield",true,300),
            new LastStandSkillDefinition(LastStandSkillId.ReinforcedHull,"reinforcedHull","Reinforced Hull",false,25),
            new LastStandSkillDefinition(LastStandSkillId.Ballistics,"ballistics","Ballistics",false,100),
            new LastStandSkillDefinition(LastStandSkillId.ReactiveLining,"reactiveLining","Reactive Lining",false,300)
        };
        public static IReadOnlyList<LastStandSkillDefinition> All { get; }=Array.AsReadOnly(definitions);
        public static LastStandSkillDefinition Get(LastStandSkillId id)
        {int n=(int)id;if(n<0||n>=Count)throw new ArgumentOutOfRangeException(nameof(id));return definitions[n];}
        public static LastStandSkillId Parse(string key)
        {foreach(var row in definitions)if(row.Key==key)return row.Id;throw new ArgumentException("Unknown skill.");}
        public static int RankForCopies(int copies)
        {if(copies<0||copies>MaximumCopies)throw new ArgumentOutOfRangeException(nameof(copies));return copies>=6?3:copies>=3?2:copies>=1?1:0;}
        public static int CopiesForRank(int rank)
        {if(rank<0||rank>MaximumRank)throw new ArgumentOutOfRangeException(nameof(rank));return rank==3?6:rank==2?3:rank;}
        public static int SlotsAt(int bestTierOneWave)=>bestTierOneWave>=500?3:bestTierOneWave>=100?2:bestTierOneWave>=25?1:0;
        public static string EffectText(LastStandSkillId id,int rank)
        {
            Get(id);if(rank<0||rank>MaximumRank)throw new ArgumentOutOfRangeException(nameof(rank));int r=Math.Max(1,rank);
            switch(id){
                case LastStandSkillId.Overdrive:return "50% faster weapon fire for "+(9+3*r)+" seconds. One use per run.";
                case LastStandSkillId.EmergencyRepairs:return "Restore "+(20+10*r)+"% maximum hull. One use per run.";
                case LastStandSkillId.Minefield:return "Arm a defensive ring: "+(3+r)+"x cannon damage to enemies within close range. One use per run.";
                case LastStandSkillId.ReinforcedHull:return "+"+(5+5*r)+"% maximum hull for the run.";
                case LastStandSkillId.Ballistics:return "+"+(4+4*r)+"% weapon damage for the run.";
                default:return "Reduce incoming damage after armor by "+(5+5*r)+"%, with a minimum of 1 damage.";
            }
        }
    }

    public sealed class LastStandSkillLoadout:IEquatable<LastStandSkillLoadout>
    {
        readonly LastStandSkillId[] ids;
        public static LastStandSkillLoadout Empty { get; }=new LastStandSkillLoadout();
        public IReadOnlyList<LastStandSkillId> Ids { get; }
        public int Count=>ids.Length;
        public LastStandSkillLoadout(params LastStandSkillId[] skills)
        {
            if(skills==null||skills.Length>LastStandSkillCatalog.MaximumSlots)throw new ArgumentException("Invalid skill capacity.");
            ids=(LastStandSkillId[])skills.Clone();var known=new HashSet<LastStandSkillId>();
            foreach(var id in ids){LastStandSkillCatalog.Get(id);if(!known.Add(id))throw new ArgumentException("Duplicate equipped skill.");}
            Ids=Array.AsReadOnly(ids);
        }
        public bool Contains(LastStandSkillId id)=>Array.IndexOf(ids,id)>=0;
        public bool IsAvailable(int slots,Func<LastStandSkillId,int> rank)
        {if(rank==null||Count>slots)return false;foreach(var id in ids)if(rank(id)<1)return false;return true;}
        public bool Equals(LastStandSkillLoadout other)
        {if(other==null||other.Count!=Count)return false;for(int n=0;n<Count;n++)if(ids[n]!=other.ids[n])return false;return true;}
        public override bool Equals(object obj)=>Equals(obj as LastStandSkillLoadout);
        public override int GetHashCode(){int hash=17;foreach(var id in ids)hash=hash*31+(int)id;return hash;}
        public override string ToString(){var names=new string[Count];for(int n=0;n<Count;n++)names[n]=LastStandSkillCatalog.Get(ids[n]).Key;return string.Join("+",names);}
    }

    public sealed class LastStandSkillSnapshot:IEquatable<LastStandSkillSnapshot>
    {
        readonly int[] ranks;
        public static LastStandSkillSnapshot None { get; }=new LastStandSkillSnapshot(LastStandSkillLoadout.Empty,new int[LastStandSkillCatalog.Count]);
        public static LastStandSkillSnapshot Empty=>None;
        public LastStandSkillLoadout Loadout { get; }
        public IReadOnlyList<int> Ranks { get; }
        public bool IsEmpty=>Loadout.Count==0;
        public LastStandSkillSnapshot(LastStandSkillLoadout loadout,IReadOnlyList<int> values)
        {
            if(loadout==null||values==null||values.Count!=LastStandSkillCatalog.Count)throw new ArgumentException("Invalid skill snapshot.");
            ranks=new int[LastStandSkillCatalog.Count];
            for(int n=0;n<ranks.Length;n++){
                int rank=values[n];bool equipped=loadout.Contains((LastStandSkillId)n);
                if(rank<0||rank>LastStandSkillCatalog.MaximumRank||equipped!=(rank>0))throw new ArgumentException("Invalid captured skill rank.");
                ranks[n]=rank;
            }
            Loadout=loadout;Ranks=Array.AsReadOnly(ranks);
        }
        public int Rank(LastStandSkillId id){LastStandSkillCatalog.Get(id);return ranks[(int)id];}
        public bool Equals(LastStandSkillSnapshot other)
        {if(other==null||!Loadout.Equals(other.Loadout))return false;for(int n=0;n<ranks.Length;n++)if(ranks[n]!=other.ranks[n])return false;return true;}
        public override bool Equals(object obj)=>Equals(obj as LastStandSkillSnapshot);
        public override int GetHashCode(){int hash=Loadout.GetHashCode();foreach(int rank in ranks)hash=hash*31+rank;return hash;}
    }
}

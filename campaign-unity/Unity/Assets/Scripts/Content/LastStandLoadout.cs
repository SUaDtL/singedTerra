using System;

namespace SingedTerra.LastStand
{
    // Stable IDs and bounded immutable values; no prices, wallet or mutable catalog copy.
    public sealed class LastStandLoadout : IEquatable<LastStandLoadout>
    {
        public string PrimaryId { get; }
        public string SecondaryId { get; }
        public LastStandFitting Primary=>LastStandFittingCatalog.Parse(PrimaryId);
        public LastStandFitting? Secondary=>SecondaryId==null?(LastStandFitting?)null:LastStandFittingCatalog.Parse(SecondaryId);
        public int Count=>SecondaryId==null?1:2;
        public LastStandLoadout(string primaryId,string secondaryId=null)
        {
            LastStandFittingCatalog.Parse(primaryId);
            if(secondaryId!=null)LastStandFittingCatalog.Parse(secondaryId);
            if(primaryId==secondaryId)throw new ArgumentException("A fitting cannot occupy both bays.");
            PrimaryId=primaryId;SecondaryId=secondaryId;
        }
        public static LastStandLoadout Single(LastStandFitting fitting)=>new LastStandLoadout(LastStandFittingCatalog.Id(fitting));
        public bool Contains(LastStandFitting fitting)=>Primary==fitting||Secondary==fitting;
        public bool IsAvailable(int bays,Func<string,bool> unlocked)=>unlocked!=null&&Count<=bays&&unlocked(PrimaryId)&&(SecondaryId==null||unlocked(SecondaryId));
        public void ValidateEdition(LastStandRunEdition edition)
        {
            if(edition==null||!edition.Supports(Primary)||Secondary.HasValue&&(!edition.IsBuildcraft||!edition.Supports(Secondary.Value)))
                throw new ArgumentException("Loadout is not supported by the run edition.");
        }
        public bool Equals(LastStandLoadout other)=>other!=null&&PrimaryId==other.PrimaryId&&SecondaryId==other.SecondaryId;
        public override bool Equals(object other)=>Equals(other as LastStandLoadout);
        public override int GetHashCode()=>PrimaryId.GetHashCode()^(SecondaryId?.GetHashCode()??0);
        public override string ToString()=>SecondaryId==null?PrimaryId:PrimaryId+"+"+SecondaryId;
    }

    public sealed class LastStandLoadoutPreset
    {
        public const int MaximumPresets=3,MaximumNameLength=32;
        public string Name { get; }
        public LastStandLoadout Loadout { get; }
        public LastStandSkillLoadout Skills { get; }
        public LastStandLoadoutPreset(string name,LastStandLoadout loadout,LastStandSkillLoadout skills=null)
        {
            if(name==null||name.Length==0||name.Length>MaximumNameLength||name.Trim()!=name||loadout==null)
                throw new ArgumentException("Invalid loadout preset.");
            foreach(char character in name)if(Char.IsControl(character)||Char.IsSurrogate(character)||character=='<'||character=='>')
                throw new ArgumentException("Preset names must be bounded plain text.");
            Name=name;Loadout=loadout;Skills=skills??LastStandSkillLoadout.Empty;
        }
    }

    // New combat research is captured at deployment. Existing speed/income research stays live.
    public sealed class LastStandCombatResearchSnapshot : IEquatable<LastStandCombatResearchSnapshot>
    {
        public static LastStandCombatResearchSnapshot None { get; }=new LastStandCombatResearchSnapshot(0,0,0);
        public int ArmorPiercing { get; }
        public int AreaControl { get; }
        public int FieldEngineering { get; }
        public bool IsEmpty=>ArmorPiercing==0&&AreaControl==0&&FieldEngineering==0;
        public int ArmorPenetration=>ArmorPiercing;
        public int AreaEffectPercent=>100+2*AreaControl;
        public int EngineeringPercent=>100+2*FieldEngineering;
        public int ScaleAreaEffect(int value)=>Scale(value,AreaEffectPercent);
        public int ScaleRecovery(int value)=>Scale(value,EngineeringPercent);
        static int Scale(int value,int percent)
        {
            if(value<0)throw new ArgumentOutOfRangeException(nameof(value));
            return (int)Math.Min(LastStandWaveCatalog.MaximumCombatValue,(long)value*percent/100);
        }
        public LastStandCombatResearchSnapshot(int armorPiercing,int areaControl,int fieldEngineering)
        {
            if(armorPiercing<0||armorPiercing>20||areaControl<0||areaControl>20||fieldEngineering<0||fieldEngineering>20)
                throw new ArgumentException("Combat research snapshot is outside its bounds.");
            ArmorPiercing=armorPiercing;AreaControl=areaControl;FieldEngineering=fieldEngineering;
        }
        public bool Equals(LastStandCombatResearchSnapshot other)=>other!=null&&ArmorPiercing==other.ArmorPiercing&&AreaControl==other.AreaControl&&FieldEngineering==other.FieldEngineering;
        public override bool Equals(object other)=>Equals(other as LastStandCombatResearchSnapshot);
        public override int GetHashCode()=>ArmorPiercing+31*AreaControl+997*FieldEngineering;
    }
}

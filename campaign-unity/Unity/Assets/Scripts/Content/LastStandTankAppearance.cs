using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public enum LastStandTankPartSlot { Treads, Hull, Turret, Barrel }

    public sealed class LastStandTankKitDefinition
    {
        public string Id { get; }
        public string Label { get; }
        internal LastStandTankKitDefinition(string id,string label){Id=id;Label=label;}
    }
    public sealed class LastStandTankPaintDefinition
    {
        public string Id { get; }
        public string Label { get; }
        public string Hex { get; }
        internal LastStandTankPaintDefinition(string id,string label,string hex){Id=id;Label=label;Hex=hex;}
    }

    // Presentation identities only: no prices, unlocks, weapon selection or stats.
    public static class LastStandTankAppearanceCatalog
    {
        public static IReadOnlyList<LastStandTankPartSlot> Slots { get; }=Array.AsReadOnly(new[]{
            LastStandTankPartSlot.Treads,LastStandTankPartSlot.Hull,LastStandTankPartSlot.Turret,LastStandTankPartSlot.Barrel});
        public static IReadOnlyList<LastStandTankKitDefinition> Kits { get; }=Array.AsReadOnly(new[]{
            new LastStandTankKitDefinition("foundry","Foundry"),new LastStandTankKitDefinition("ranger","Ranger"),
            new LastStandTankKitDefinition("bulwark","Bulwark"),new LastStandTankKitDefinition("jackal","Jackal")});
        public static IReadOnlyList<LastStandTankPaintDefinition> Paints { get; }=Array.AsReadOnly(new[]{
            new LastStandTankPaintDefinition("red","Red","#e84d4d"),new LastStandTankPaintDefinition("blue","Blue","#4d8ce8"),
            new LastStandTankPaintDefinition("green","Green","#4de87a"),new LastStandTankPaintDefinition("yellow","Yellow","#e8c84d"),
            new LastStandTankPaintDefinition("purple","Purple","#a855f7")});
        static readonly string[,] PartLabels={
            {"Tracks","Spider Legs","Hover","Dune Wheels"},
            {"Armor Hull","Scout Hull","Siege Hull","Raider Hull"},
            {"Cupola","Sensor Pod","Bunker","Sensor Ring"},
            {"Cannon","Railgun","Siege Gun","Howitzer"}};
        public static bool IsKit(string id){foreach(var kit in Kits)if(kit.Id==id)return true;return false;}
        public static bool IsPaint(string id){foreach(var paint in Paints)if(paint.Id==id)return true;return false;}
        public static LastStandTankKitDefinition GetKit(string id)
        {foreach(var kit in Kits)if(kit.Id==id)return kit;throw new ArgumentException("Unknown cosmetic family.",nameof(id));}
        public static LastStandTankPaintDefinition GetPaint(string id)
        {foreach(var paint in Paints)if(paint.Id==id)return paint;throw new ArgumentException("Unknown cosmetic paint.",nameof(id));}
        internal static int SlotIndex(LastStandTankPartSlot slot)
        {int index=(int)slot;if(index<0||index>=Slots.Count)throw new ArgumentOutOfRangeException(nameof(slot));return index;}
        public static string SlotLabel(LastStandTankPartSlot slot)
        {switch(SlotIndex(slot)){case 0:return "Mobility";case 1:return "Hull";case 2:return "Turret";default:return "Barrel";}}
        public static string PartLabel(LastStandTankPartSlot slot,string kit)
        {int row=SlotIndex(slot);for(int i=0;i<Kits.Count;i++)if(Kits[i].Id==kit)return PartLabels[row,i];throw new ArgumentException("Unknown cosmetic family.",nameof(kit));}
    }

    // A draft can share this immutable value with the confirmed profile safely.
    public sealed class LastStandTankAppearance : IEquatable<LastStandTankAppearance>
    {
        public string Treads { get; }
        public string Hull { get; }
        public string Turret { get; }
        public string Barrel { get; }
        public string Paint { get; }
        public static LastStandTankAppearance Default { get; }=new LastStandTankAppearance("foundry","foundry","foundry","foundry","red");
        LastStandTankAppearance(string treads,string hull,string turret,string barrel,string paint)
        {Treads=treads;Hull=hull;Turret=turret;Barrel=barrel;Paint=paint;}
        public static bool TryCreate(string treads,string hull,string turret,string barrel,string paint,out LastStandTankAppearance appearance)
        {
            appearance=null;
            if(!LastStandTankAppearanceCatalog.IsKit(treads)||!LastStandTankAppearanceCatalog.IsKit(hull)||
                !LastStandTankAppearanceCatalog.IsKit(turret)||!LastStandTankAppearanceCatalog.IsKit(barrel)||
                !LastStandTankAppearanceCatalog.IsPaint(paint))return false;
            appearance=new LastStandTankAppearance(treads,hull,turret,barrel,paint);return true;
        }
        public string Part(LastStandTankPartSlot slot)
        {switch(LastStandTankAppearanceCatalog.SlotIndex(slot)){case 0:return Treads;case 1:return Hull;case 2:return Turret;default:return Barrel;}}
        public LastStandTankAppearance WithPart(LastStandTankPartSlot slot,string kit)
        {
            int index=LastStandTankAppearanceCatalog.SlotIndex(slot);LastStandTankAppearanceCatalog.GetKit(kit);
            return new LastStandTankAppearance(index==0?kit:Treads,index==1?kit:Hull,index==2?kit:Turret,index==3?kit:Barrel,Paint);
        }
        public LastStandTankAppearance WithPaint(string paint)
        {LastStandTankAppearanceCatalog.GetPaint(paint);return new LastStandTankAppearance(Treads,Hull,Turret,Barrel,paint);}
        public LastStandTankAppearance WithPreset(string kit)
        {LastStandTankAppearanceCatalog.GetKit(kit);return new LastStandTankAppearance(kit,kit,kit,kit,Paint);}
        public bool Equals(LastStandTankAppearance other)=>other!=null&&Treads==other.Treads&&Hull==other.Hull&&Turret==other.Turret&&Barrel==other.Barrel&&Paint==other.Paint;
        public override bool Equals(object other)=>Equals(other as LastStandTankAppearance);
        public override int GetHashCode()
        {unchecked{int hash=17;foreach(string value in new[]{Treads,Hull,Turret,Barrel,Paint})hash=hash*31+value.GetHashCode();return hash;}}
    }
}

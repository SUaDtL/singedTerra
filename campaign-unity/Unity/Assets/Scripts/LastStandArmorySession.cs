using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    // A bounded editor over saved presets. Browsing never saves; Apply submits
    // one loadout/preset transaction only after this captured basis still matches.
    public sealed class LastStandArmorySession
    {
        readonly LastStandValueDraft<LastStandLoadout> value=new LastStandValueDraft<LastStandLoadout>();
        LastStandLoadout saved;
        LastStandLoadoutPreset[] presets;
        public LastStandLoadout Draft=>value.Draft;
        public bool IsOpen=>value.IsOpen;
        public int Slot { get; private set; }
        public string Name { get; private set; }="";
        public bool HasChanges=>IsOpen && (value.HasChanges || presets[Slot]==null ||
            presets[Slot].Name!=Name || !presets[Slot].Loadout.Equals(Draft));

        public void Begin(LastStandLoadout selected,IReadOnlyList<LastStandLoadoutPreset> savedPresets,long generation)
        {
            if(selected==null)throw new ArgumentNullException(nameof(selected));
            if(savedPresets==null || savedPresets.Count!=LastStandLoadoutPreset.MaximumPresets)
                throw new ArgumentException("Exactly three preset slots are required.");
            presets=new LastStandLoadoutPreset[savedPresets.Count];
            for(int i=0;i<presets.Length;i++)presets[i]=savedPresets[i];
            saved=selected;value.Begin(saved,generation);Slot=0;
            int empty=-1,matching=-1;
            for(int i=0;i<presets.Length;i++)
            {
                if(presets[i]==null){if(empty<0)empty=i;}
                else if(matching<0 && presets[i].Loadout.Equals(saved))matching=i;
            }
            Slot=matching>=0?matching:empty>=0?empty:0;
            Name=presets[Slot]?.Name??DefaultName(Slot);
        }
        public bool Matches(LastStandLoadout selected,IReadOnlyList<LastStandLoadoutPreset> savedPresets,long generation)
        {
            if(!value.Matches(selected,generation) || savedPresets==null || savedPresets.Count!=presets.Length)return false;
            for(int i=0;i<presets.Length;i++)
            {
                var a=presets[i];var b=savedPresets[i];
                if(a==null || b==null){if(a!=b)return false;}
                else if(a.Name!=b.Name || !a.Loadout.Equals(b.Loadout))return false;
            }
            return true;
        }
        public void SelectPreset(int slot)
        {
            EnsureOpen();
            if(slot<0 || slot>=LastStandLoadoutPreset.MaximumPresets)throw new ArgumentOutOfRangeException(nameof(slot));
            Slot=slot;Name=presets[slot]?.Name??DefaultName(slot);
            value.Preview(presets[slot]?.Loadout??saved);
        }
        public void Preview(LastStandLoadout loadout)=>value.Preview(loadout);
        public bool TryRename(string name)
        {
            EnsureOpen();
            string normalized=name?.Trim();
            try { _=new LastStandLoadoutPreset(normalized,Draft); }
            catch(ArgumentException) { return false; }
            Name=normalized;return true;
        }
        public void Confirm(LastStandLoadout selected,IReadOnlyList<LastStandLoadoutPreset> savedPresets,long generation,int slot)
        { Begin(selected,savedPresets,generation);SelectPreset(slot); }
        public void Close(){value.Close();saved=null;presets=null;Name="";Slot=0;}
        void EnsureOpen(){if(!IsOpen)throw new InvalidOperationException("The Armory editor is closed.");}
        static string DefaultName(int slot)=>"Build "+(slot+1);
    }
}

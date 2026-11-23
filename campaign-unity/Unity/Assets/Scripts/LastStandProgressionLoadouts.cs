using System;
using System.Collections.Generic;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        static LastStandEntitlements Entitlements(Record row)=>LastStandRewardCatalog.Entitlements(tier=>
            row.Tiers.TryGetValue(LastStandTierCatalog.Get(tier).Key,out var value)?value.BestWave:0);
        public int EquipmentBayCount=>committed==null?1:Entitlements(committed).EquipmentBays;
        public int UnlockedResearchLabCount=>committed==null?0:Entitlements(committed).ResearchLabs;
        public bool CombatResearchUnlocked=>committed!=null&&Entitlements(committed).CombatResearch;
        public LastStandLoadout SelectedLoadout=>new LastStandLoadout(SelectedFitting,committed?.SecondaryFitting);
        public IReadOnlyList<LastStandLoadoutPreset> LoadoutPresets=>Array.AsReadOnly(committed==null?
            new LastStandLoadoutPreset[LastStandLoadoutPreset.MaximumPresets]:(LastStandLoadoutPreset[])committed.Presets.Clone());

        // A transaction only changes the preparation state; active run snapshots remain immutable.
        public bool TryApplyLoadout(LastStandLoadout loadout)
        {
            if(!Ready||loadout==null||!loadout.IsAvailable(EquipmentBayCount,IsFittingUnlocked))return false;
            try{loadout.ValidateEdition(LastStandRunEdition.Current);}catch(ArgumentException){return false;}
            if(loadout.Equals(SelectedLoadout))return true;
            var next=committed.Copy();next.SelectedFitting=loadout.PrimaryId;next.SecondaryFitting=loadout.SecondaryId;
            return Commit(next,null);
        }
        public bool TrySaveLoadoutPreset(int slot,string name,LastStandLoadout loadout)
        {
            if(!Ready||slot<0||slot>=LastStandLoadoutPreset.MaximumPresets||loadout==null||!loadout.IsAvailable(EquipmentBayCount,IsFittingUnlocked))return false;
            LastStandLoadoutPreset preset;try{preset=new LastStandLoadoutPreset(name,loadout,SelectedSkills);}catch(ArgumentException){return false;}
            var next=committed.Copy();next.Presets[slot]=preset;return Commit(next,null);
        }
        public bool TryApplyLoadoutPreset(int slot)=>Ready&&slot>=0&&slot<LastStandLoadoutPreset.MaximumPresets&&
            committed.Presets[slot]!=null&&TryApplyLoadoutPreset(slot,committed.Presets[slot].Name,committed.Presets[slot].Loadout,committed.Presets[slot].Skills,Revision);
        public bool TryApplyLoadoutPreset(int slot,string name,LastStandLoadout loadout,long expectedRevision)
            =>TryApplyLoadoutPreset(slot,name,loadout,SelectedSkills,expectedRevision);
        public bool TryApplyLoadoutPreset(int slot,string name,LastStandLoadout loadout,LastStandSkillLoadout skills,long expectedRevision)
        {
            if(!Ready||expectedRevision!=Revision||slot<0||slot>=LastStandLoadoutPreset.MaximumPresets||
                loadout==null||!loadout.IsAvailable(EquipmentBayCount,IsFittingUnlocked)||!SkillsAvailable(committed,skills))return false;
            LastStandLoadoutPreset preset;
            try{loadout.ValidateEdition(LastStandRunEdition.Current);preset=new LastStandLoadoutPreset(name,loadout,skills);}
            catch(ArgumentException){return false;}
            var next=committed.Copy();next.Presets[slot]=preset;
            next.SelectedFitting=loadout.PrimaryId;next.SecondaryFitting=loadout.SecondaryId;
            next.SelectedSkills=skills;
            return Commit(next,null);
        }
        public bool TryClearLoadoutPreset(int slot)
        {
            if(!Ready||slot<0||slot>=LastStandLoadoutPreset.MaximumPresets)return false;
            if(committed.Presets[slot]==null)return true;
            var next=committed.Copy();next.Presets[slot]=null;return Commit(next,null);
        }
        // Research integration supplies the new ranks here; old speed/income bonuses remain live.
        LastStandCombatResearchSnapshot CaptureCombatResearch()=>new LastStandCombatResearchSnapshot(
            ResearchRank(LastStandResearchTrackId.ArmorPiercing),ResearchRank(LastStandResearchTrackId.AreaControl),ResearchRank(LastStandResearchTrackId.FieldEngineering));
    }
}

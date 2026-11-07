using System;
using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
        readonly LastStandArmorySession armoryEditor=new LastStandArmorySession();
        bool armoryApplyUnconfirmed,armoryNameValid=true;
        string armoryNameInput="";
        public bool CanCustomizeBuild=>CanCustomizeAppearance;
        public LastStandLoadout ArmoryDraft=>armoryEditor.Draft??Progression.SelectedLoadout;
        public int ArmoryPresetSlot=>armoryEditor.Slot;
        public string ArmoryPresetName=>armoryEditor.Name;
        public string ArmoryNameInput=>armoryNameInput;
        public string ArmoryStatus { get; private set; }="";
        public bool ArmoryCanPreview=>MenuPage=="armory" && CanCustomizeBuild &&
            armoryEditor.Matches(Progression.SelectedLoadout,Progression.LoadoutPresets,Progression.RestoreGeneration);
        public bool ArmoryCanApply=>ArmoryCanPreview && armoryNameValid && armoryEditor.HasChanges &&
            ArmoryDraft.IsAvailable(Progression.EquipmentBayCount,Progression.IsFittingUnlocked);
        public void OpenArmory()=>OpenMenu("armory");
        void BeginArmory()
        {
            armoryEditor.Begin(Progression.SelectedLoadout,Progression.LoadoutPresets,Progression.RestoreGeneration);
            armoryApplyUnconfirmed=false;armoryNameValid=true;
            armoryNameInput=armoryEditor.Name;
            ArmoryStatus=Progression.HasCheckpoint?"Prepare your next deployment. Resume keeps the saved run's build.":"Choose fittings, name your build, then Apply.";
            art.TrySelectLoadout(ArmoryDraft);
        }
        public void MoveArmoryPreset(int direction)
        {
            if(!ArmoryCanPreview || direction!=1&&direction!=-1)return;
            int slot=ArmoryPresetSlot+direction;if(slot<0||slot>=LastStandLoadoutPreset.MaximumPresets)return;
            armoryEditor.SelectPreset(slot);armoryNameValid=true;armoryNameInput=armoryEditor.Name;PreviewArmory();
        }
        public void RenameArmoryPreset(string name)
        {
            if(!ArmoryCanPreview)return;
            armoryNameInput=name;
            armoryNameValid=armoryEditor.TryRename(name);
            ArmoryStatus=armoryNameValid?"Build name changed. Apply to save.":"Enter a name of 1–32 characters.";
            Refresh("armory-name");
        }
        int ArmoryFittingIndex(int bay)
        {
            string id=bay==0?ArmoryDraft.PrimaryId:ArmoryDraft.SecondaryId;
            for(int i=0;i<LastStandFittingCatalog.Definitions.Count;i++)if(LastStandFittingCatalog.Definitions[i].Id==id)return i;
            return -1;
        }
        int NextArmoryFittingIndex(int bay,int direction)
        {
            if(bay<0||bay>=Progression.EquipmentBayCount||direction!=1&&direction!=-1)return int.MinValue;
            int next=ArmoryFittingIndex(bay)+direction,min=bay==0?0:-1;
            string other=bay==0?ArmoryDraft.SecondaryId:ArmoryDraft.PrimaryId;
            while(next>=min && next<LastStandFittingCatalog.Definitions.Count)
            {
                if(next<0 || LastStandFittingCatalog.Definitions[next].Playable && LastStandFittingCatalog.Definitions[next].Id!=other)return next;
                next+=direction;
            }
            return int.MinValue;
        }
        public bool CanMoveArmoryFitting(int bay,int direction)=>ArmoryCanPreview && NextArmoryFittingIndex(bay,direction)!=int.MinValue;
        public void MoveArmoryFitting(int bay,int direction)
        {
            if(!ArmoryCanPreview)return;int next=NextArmoryFittingIndex(bay,direction);if(next==int.MinValue)return;
            string id=next<0?null:LastStandFittingCatalog.Definitions[next].Id;
            armoryEditor.Preview(bay==0?new LastStandLoadout(id,ArmoryDraft.SecondaryId):new LastStandLoadout(ArmoryDraft.PrimaryId,id));
            PreviewArmory();
        }
        void PreviewArmory()
        {
            art.TrySelectLoadout(ArmoryDraft);
            ArmoryStatus=!armoryNameValid?"Enter a name of 1–32 characters.":ArmoryDraft.IsAvailable(Progression.EquipmentBayCount,Progression.IsFittingUnlocked)?
                "Previewing this build. Apply to save, or Cancel to keep your build.":"Locked fitting preview. Meet its wave milestone before applying.";
            Refresh("armory-preview");
        }
        public void ApplyArmory()
        {
            if(!ArmoryCanApply)return;
            if(!Progression.TryApplyLoadoutPreset(ArmoryPresetSlot,ArmoryPresetName,ArmoryDraft,Progression.Revision))
            {armoryApplyUnconfirmed=true;ArmoryStatus=Progression.SaveError??"Build save needs confirmation. Retry the save before continuing.";Refresh("armory-unconfirmed");return;}
            ConfirmArmory();Refresh("armory-saved");
        }
        void ConfirmArmory()
        {
            armoryEditor.Confirm(Progression.SelectedLoadout,Progression.LoadoutPresets,Progression.RestoreGeneration,ArmoryPresetSlot);
            armoryNameInput=armoryEditor.Name;armoryNameValid=true;
            armoryApplyUnconfirmed=false;ArmoryStatus=Progression.HasCheckpoint?"Build saved for your next deployment. Resume keeps the saved build.":"Build saved. Ready to deploy.";
            art.TrySelectLoadout(ArmoryDraft);
        }
        public void CancelArmory()=>CloseMenu();
        public void RotateArmory(int direction)
        {if(!ArmoryCanPreview)return;if(direction<0)art.OrbitLeft();else if(direction>0)art.OrbitRight();Refresh("armory-rotate");}
        public void FrameArmory(Rect viewport){if(MenuPage=="armory"&&armoryEditor.IsOpen)art.SetGarageFraming(viewport);}
        public IReadOnlyList<Renderer> ArmoryBayRenderers(int bay)
        {
            var fitting=bay==0?(LastStandFitting?)ArmoryDraft.Primary:ArmoryDraft.Secondary;
            return fitting.HasValue?art.FittingRenderers(fitting.Value):Array.Empty<Renderer>();
        }
        public string ArmoryBayName(int bay)
        {
            string id=bay==0?ArmoryDraft.PrimaryId:ArmoryDraft.SecondaryId;
            foreach(var fitting in LastStandFittingCatalog.Definitions)if(fitting.Id==id)return fitting.Name;
            return "Empty bay";
        }
        public string BuildLabel(LastStandLoadout loadout)
        {
            string first=loadout.PrimaryId,second=loadout.SecondaryId;
            foreach(var fitting in LastStandFittingCatalog.Definitions)
            {if(fitting.Id==loadout.PrimaryId)first=fitting.Name;if(fitting.Id==loadout.SecondaryId)second=fitting.Name;}
            return second==null?first:first+" + "+second;
        }
        public string ArmoryBayDescription(int bay)
        {
            if(bay>=Progression.EquipmentBayCount)return LastStandMilestonePresentation.UnlockRequirement(LastStandRewardKind.EquipmentBays,bay+1)+" to unlock this bay.";
            string id=bay==0?ArmoryDraft.PrimaryId:ArmoryDraft.SecondaryId;
            foreach(var fitting in LastStandFittingCatalog.Definitions)if(fitting.Id==id){
                foreach(var definition in LastStandUpgradeCatalog.Tracks)
                    if(definition.Applicability!=LastStandUpgradeApplicability.All && definition.IsEligible(fitting.Mechanic)){
                        // The same typed projection supplies Workshop and combat;
                        // preparation uses current permanent investment, never a
                        // retained run's frozen levels or research snapshot.
                        var effect=definition.Project(Progression.GetPermanentLevel(definition.Id),0,ArmoryDraft,Progression.CompletedCombatResearch);
                        return (Progression.IsFittingUnlocked(id)?"":"LOCKED · ")+effect.CurrentEffectDescription+"\n"+fitting.Description;
                    }
            }
            return "Add a second fitting. Each fitting can occupy one bay.";
        }
        void RestoreArmoryPresentation()=>art.TrySelectLoadout(Progression.Checkpoint?.Loadout??Progression.SelectedLoadout);
        void LeaveArmoryPage(string next)
        {
            if(next=="armory"||!armoryEditor.IsOpen)return;
            armoryEditor.Close();armoryApplyUnconfirmed=false;armoryNameValid=true;armoryNameInput="";
            if(art){RestoreArmoryPresentation();art.InvalidateGarageFraming();}
        }
        void RefreshArmory()
        {
            if(!armoryEditor.IsOpen)return;
            if(MenuPage!="armory"){LeaveArmoryPage(MenuPage);return;}
            var preset=Progression.LoadoutPresets[ArmoryPresetSlot];
            if(armoryApplyUnconfirmed && Progression.SaveState=="ready" && ArmoryDraft.Equals(Progression.SelectedLoadout) &&
                preset!=null && preset.Name==ArmoryPresetName && preset.Loadout.Equals(ArmoryDraft))ConfirmArmory();
            if(!armoryEditor.Matches(Progression.SelectedLoadout,Progression.LoadoutPresets,Progression.RestoreGeneration))
            {ArmoryStatus="Your saved build changed. Close and reopen Armory before editing.";RestoreArmoryPresentation();}
            else if(Progression.SaveState!="ready")ArmoryStatus=Progression.SaveError??"Confirm the local save before applying changes.";
        }
    }
}

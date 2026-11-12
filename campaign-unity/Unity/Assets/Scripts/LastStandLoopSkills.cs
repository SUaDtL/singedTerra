using System;
using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
        LastStandSkillLoadout skillDraft,skillBasis;
        long skillGeneration;
        bool skillApplyUnconfirmed;
        bool skillDrawUnconfirmed;
        LastStandSkillDrawReceipt previousSkillDraw;
        static readonly KeyCode[] SkillKeys={KeyCode.Q,KeyCode.E,KeyCode.R};
        public LastStandSkillLoadout SkillDraft=>skillDraft??Progression.SelectedSkills;
        public string SkillsStatus { get; private set; }="";
        public bool SkillsCanEdit=>MenuPage=="skills"&&CanCustomizeBuild&&skillBasis!=null&&
            skillGeneration==Progression.RestoreGeneration&&skillBasis.Equals(Progression.SelectedSkills);
        public bool SkillsCanApply=>SkillsCanEdit&&!SkillDraft.Equals(Progression.SelectedSkills);
        public bool SkillsCanDraw=>SkillsCanEdit&&Progression.SkillIntel>=LastStandSkillCatalog.DrawCost&&Progression.SkillDrawPool.Count>0;
        public void OpenSkills()=>OpenMenu("skills");
        void BeginSkills()
        {
            skillDraft=skillBasis=Progression.SelectedSkills;skillGeneration=Progression.RestoreGeneration;skillApplyUnconfirmed=skillDrawUnconfirmed=false;
            SkillsStatus=Progression.HasCheckpoint?"Prepare your next run. Resume keeps its captured skills and uses.":"Active and passive skills share your slots. Apply your selection before deploying.";
        }
        public bool CanToggleSkill(LastStandSkillId id)=>SkillsCanEdit&&Progression.SkillRank(id)>0&&
            (SkillDraft.Contains(id)||SkillDraft.Count<Progression.SkillSlotCount);
        public void ToggleSkill(LastStandSkillId id)
        {
            if(!CanToggleSkill(id))return;var ids=new List<LastStandSkillId>(SkillDraft.Ids);
            if(!ids.Remove(id))ids.Add(id);skillDraft=new LastStandSkillLoadout(ids.ToArray());
            SkillsStatus="Selection changed. Apply to save, or Cancel to keep your equipped skills.";Refresh("skills-preview");
        }
        public void DrawSkill()
        {
            if(!SkillsCanDraw)return;
            previousSkillDraw=Progression.LastSkillDraw;
            if(!Progression.TryDrawSkill(Progression.Revision))
            {skillDrawUnconfirmed=Progression.SaveState!="ready";SkillsStatus=Progression.SaveError??"Draw unavailable. Confirm the save before trying again.";}
            else DescribeSkillDraw();
            Refresh("skills-draw");
        }
        void DescribeSkillDraw()
        {
            var receipt=Progression.LastSkillDraw;if(receipt==null)return;
            SkillsStatus=(receipt.NewOwnership?"ACQUIRED / ":"COPY RECEIVED / ")+LastStandSkillCatalog.Get(receipt.Skill).Name+
                " · Rank "+receipt.Rank+" · "+receipt.Copies+" / "+LastStandSkillCatalog.MaximumCopies+" copies. Saved.";
        }
        public void ApplySkills()
        {
            if(!SkillsCanApply)return;
            if(!Progression.TryApplySkills(SkillDraft,Progression.Revision))
            {skillApplyUnconfirmed=true;SkillsStatus=Progression.SaveError??"Skill selection needs save confirmation.";}
            else ConfirmSkills();
            Refresh("skills-apply");
        }
        void ConfirmSkills()
        {skillDraft=skillBasis=Progression.SelectedSkills;skillApplyUnconfirmed=false;SkillsStatus="Skills saved for the next deployment. Save a named build in Armory to recall them with its equipment.";}
        void RefreshSkills()
        {
            if(MenuPage!="skills"){skillDraft=skillBasis=null;skillApplyUnconfirmed=false;return;}
            if(skillDrawUnconfirmed&&Progression.SaveState=="ready"&&!ReferenceEquals(previousSkillDraw,Progression.LastSkillDraw))
            {skillDrawUnconfirmed=false;DescribeSkillDraw();}
            if(skillApplyUnconfirmed&&Progression.SaveState=="ready"&&SkillDraft.Equals(Progression.SelectedSkills))ConfirmSkills();
            else if(Progression.SaveState!="ready")SkillsStatus=Progression.SaveError??"Confirm the local save before changing skills.";
            else if(!SkillsCanEdit)SkillsStatus="Your saved build changed. Close and reopen Skills before editing.";
        }
        public bool CanActivateSkill(LastStandSkillId id)=>!MenuOpen&&Phase=="battle"&&Progression.SaveState=="ready"&&Session.CanActivateSkill(id);
        public void ActivateSkill(LastStandSkillId id)
        {
            if(!CanActivateSkill(id))return;
            Audio.UnlockFromGesture("skill");
            if(Session.TryActivateSkill(id))
            {
                Audio.PlaySkillActivation(id);
                Notice=LastStandSkillCatalog.Get(id).Name+" activated.";Refresh("skill-activated");
            }
        }
        void SkillHotkeys()
        {
            if(MenuOpen||Phase!="battle"||Session.Model==null)return;
            var selected=UnityEngine.EventSystems.EventSystem.current?.currentSelectedGameObject;
            if(selected&&selected.GetComponent<UnityEngine.UI.InputField>() is UnityEngine.UI.InputField input&&input.isFocused)return;
            var ids=Session.Model.Skills.Loadout.Ids;
            for(int i=0;i<ids.Count;i++)if(Input.GetKeyDown(SkillKeys[i]))ActivateSkill(ids[i]);
        }
    }
}

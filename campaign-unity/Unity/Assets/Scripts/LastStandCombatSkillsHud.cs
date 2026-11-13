using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandCombatSkillsHud
    {
        readonly LastStandLoopController loop;
        public readonly Button[] Buttons=new Button[3];
        static readonly string[] Keys={"Q","E","R"};
        static string ShortName(LastStandSkillId id)
        {
            switch(id){case LastStandSkillId.Overdrive:return "BOOST";case LastStandSkillId.EmergencyRepairs:return "REPAIR";
                case LastStandSkillId.Minefield:return "MINES";case LastStandSkillId.ReinforcedHull:return "HULL";
                case LastStandSkillId.Ballistics:return "BALLISTICS";default:return "LINING";}
        }
        public LastStandCombatSkillsHud(LastStandLoopController loop,RectTransform root,LastStandHudElements elements)
        {
            this.loop=loop;
            for(int i=0;i<Buttons.Length;i++)
            {
                int slot=i;Buttons[i]=elements.Action(LastStandSkillHudLayout.Prefix+i,"",root,()=>
                {var ids=loop.Session.Model?.Skills.Loadout.Ids;if(ids!=null&&slot<ids.Count)loop.ActivateSkill(ids[slot]);});
                Buttons[i].gameObject.SetActive(false);
            }
        }
        public void Refresh(bool shopOpen)
        {
            var model=loop.Session.Model;
            bool show=model!=null&&(loop.Phase=="battle"||loop.Phase=="settling")&&!shopOpen&&model.Skills.Loadout.Count>0;
            for(int i=0;i<Buttons.Length;i++)
            {
                var button=Buttons[i];button.gameObject.SetActive(show);
                if(!show)continue;
                bool equipped=i<model.Skills.Loadout.Count;
                if(!equipped){button.GetComponentInChildren<Text>(true).text="EMPTY\nSLOT";LastStandUiPrimitives.Style(button,false,false);continue;}
                var id=model.Skills.Loadout.Ids[i];var definition=LastStandSkillCatalog.Get(id);
                string status=!definition.IsActive?"PASSIVE":model.RemainingSkillUses(id)>0?"1 USE":"SPENT";
                if(id==LastStandSkillId.Overdrive&&model.OverdriveRemainingTicks>0)status="ACTIVE";
                if(id==LastStandSkillId.Minefield&&model.MinefieldArmed)status="ARMED";
                button.GetComponentInChildren<Text>(true).text=(definition.IsActive?Keys[i]+"  /  ":"")+ShortName(id)+"\n"+status;
                LastStandUiPrimitives.Style(button,loop.CanActivateSkill(id),status=="ACTIVE"||status=="ARMED");
            }
        }
    }
}

using System;
using System.Collections.Generic;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandProgression
    {
        static object SkillLoadoutJson(LastStandSkillLoadout loadout)
        {var ids=new List<object>();foreach(var id in loadout.Ids)ids.Add(LastStandSkillCatalog.Get(id).Key);return ids;}
        static LastStandSkillLoadout ReadSkillLoadout(object value)
        {
            var rows=LastStandSaveJson.Array(value);if(rows.Count>LastStandSkillCatalog.MaximumSlots)throw new FormatException("Invalid skill loadout size.");
            var ids=new LastStandSkillId[rows.Count];for(int n=0;n<ids.Length;n++)ids[n]=LastStandSkillCatalog.Parse(LastStandSaveJson.String(rows[n]));
            return new LastStandSkillLoadout(ids);
        }
        static int[] ReadSkillNumbers(object value,int maximum)
        {
            var rows=LastStandSaveJson.Array(value);if(rows.Count!=LastStandSkillCatalog.Count)throw new FormatException("Invalid skill collection size.");
            var result=new int[rows.Count];for(int n=0;n<result.Length;n++){
                result[n]=LastStandSaveJson.Integer(rows[n]);if(result[n]>maximum)throw new FormatException("Invalid skill development.");
            }
            return result;
        }
        static object SkillRecordJson(Record row)=>Map("intel",row.SkillIntel,"copies",row.SkillCopies,
            "loadout",SkillLoadoutJson(row.SelectedSkills),"firstAwards",Strings(row.SkillFirstAwards));
        static void ReadSkillRecord(Record row,object value)
        {
            var data=LastStandSaveJson.Object(value);LastStandSaveJson.Fields(data,"intel","copies","loadout","firstAwards");
            row.SkillIntel=Number(data,"intel");row.SkillCopies=ReadSkillNumbers(data["copies"],LastStandSkillCatalog.MaximumCopies);
            row.SelectedSkills=ReadSkillLoadout(data["loadout"]);row.SkillFirstAwards=ReadStrings(data["firstAwards"]);
            foreach(string id in row.SkillFirstAwards)if(id!="tier-1:skills-25"&&id!="tier-1:skills-50")throw new FormatException("Unknown Skill Intel award.");
        }
        static bool ValidateSkillRecord(Record row)
        {
            int best=row.Tiers["tier-1"].BestWave;
            foreach(var skill in LastStandSkillCatalog.All)if(row.SkillCopies[(int)skill.Id]>0&&best<skill.UnlockWave)return false;
            if(!SkillsAvailable(row,row.SelectedSkills))return false;
            foreach(var preset in row.Presets)if(preset!=null&&!SkillsAvailable(row,preset.Skills))return false;
            if(row.SkillFirstAwards.Contains("tier-1:skills-25")&&best<25||row.SkillFirstAwards.Contains("tier-1:skills-50")&&best<50)return false;
            return true;
        }
        static object SkillSnapshotJson(LastStandSkillSnapshot snapshot)=>Map("loadout",SkillLoadoutJson(snapshot.Loadout),"ranks",snapshot.Ranks);
        static LastStandSkillSnapshot ReadSkillSnapshot(object value)
        {
            var data=LastStandSaveJson.Object(value);LastStandSaveJson.Fields(data,"loadout","ranks");
            return new LastStandSkillSnapshot(ReadSkillLoadout(data["loadout"]),ReadSkillNumbers(data["ranks"],LastStandSkillCatalog.MaximumRank));
        }
        static object SkillStateJson(LastStandSkillCombatCheckpoint state)=>Map("spentMask",state.SpentMask,
            "overdriveUntilTick",state.OverdriveUntilTick,"minefieldArmed",state.MinefieldArmed,"minefieldDamage",state.MinefieldDamage);
        static LastStandSkillCombatCheckpoint ReadSkillState(object value)
        {
            var data=LastStandSaveJson.Object(value);LastStandSaveJson.Fields(data,"spentMask","overdriveUntilTick","minefieldArmed","minefieldDamage");
            return new LastStandSkillCombatCheckpoint(Number(data,"spentMask"),Number(data,"overdriveUntilTick"),Bool(data,"minefieldArmed"),Number(data,"minefieldDamage"));
        }
    }
}

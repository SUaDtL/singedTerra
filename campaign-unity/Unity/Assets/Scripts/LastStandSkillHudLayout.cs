using System;

namespace SingedTerra.LastStand
{
    // The skill strip shares the console's pixel coordinate system. The main
    // layout reserves its space before any Unity control is positioned.
    public static class LastStandSkillHudLayout
    {
        public const string Prefix="CombatSkill";
        public static bool IsSkill(string id)=>id!=null&&id.StartsWith(Prefix,StringComparison.Ordinal);
        public static LastStandHudLayout.Bounds[] Slots(float width,float height,float dockTop)
        {
            var result=new LastStandHudLayout.Bounds[3];
            if(LastStandHudLayout.HasConceptCombat(width,height))
            {
                float sx=width/1600,sy=height/900;
                for(int i=0;i<3;i++)result[i]=new LastStandHudLayout.Bounds((1060+i*87)*sx,height-128*sy,79*sx,112*sy);
            }
            else
            {
                float gap=8,w=Math.Min(360,width-24),cell=(w-2*gap)/3,x=(width-w)/2;
                float y=Math.Max(76,dockTop-72);
                for(int i=0;i<3;i++)result[i]=new LastStandHudLayout.Bounds(x+i*(cell+gap),y,cell,64);
            }
            return result;
        }
    }
}

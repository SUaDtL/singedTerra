using System;
using System.Collections.Generic;
using SingedTerra.LastStand;

static class SkillLayoutChecks
{
    static void Need(bool value,string reason){if(!value)throw new Exception(reason);}
    static bool Contains(LastStandHudLayout.Bounds parent,LastStandHudLayout.Bounds child)=>child.X>=parent.X-.01&&child.Y>=parent.Y-.01&&child.X+child.Width<=parent.X+parent.Width+.01&&child.Y+child.Height<=parent.Y+parent.Height+.01;
    static bool Overlap(LastStandHudLayout.Bounds a,LastStandHudLayout.Bounds b)=>a.X<b.X+b.Width-.01&&b.X<a.X+a.Width-.01&&a.Y<b.Y+b.Height-.01&&b.Y<a.Y+a.Height-.01;
    static int Main(string[] args)
    {
        try{
            int[,] profiles={{1024,720},{1280,720},{1920,1080},{3440,1440},{390,844},{844,390},{844,266}};
            foreach(bool receipt in new[]{false,true})for(int n=0;n<profiles.GetLength(0);n++){
                int w=profiles[n,0],h=profiles[n,1];string context=w+"x"+h+(receipt?" receipt":"");
                var projection=LastStandHudLayout.Project(w,h,"battle",new[]{"Menu","WaveInfo","SpeedMinus","SpeedRate","SpeedPlus","ShopEntry","CombatSkill0","CombatSkill1","CombatSkill2"},null,receipt);
                var byId=new Dictionary<string,LastStandHudLayout.Slot>();var controls=new List<LastStandHudLayout.Slot>();
                foreach(var slot in projection.Slots){Need(!byId.ContainsKey(slot.Id),context+" duplicate "+slot.Id);byId.Add(slot.Id,slot);if(slot.Kind=="control")controls.Add(slot);}
                foreach(var slot in projection.Slots){
                    var b=slot.Bounds;Need(b.Width>0&&b.Height>0&&!float.IsNaN(b.X+b.Y+b.Width+b.Height),context+" invalid "+slot.Id);
                    Need(Contains(new LastStandHudLayout.Bounds(0,0,w,h),b),context+" offscreen "+slot.Id);
                    if(slot.Parent!=null)Need(byId.ContainsKey(slot.Parent)&&Contains(byId[slot.Parent].Bounds,b),context+" child outside parent "+slot.Id);
                }
                foreach(var control in controls)Need(control.Bounds.Width>=44-.01&&control.Bounds.Height>=44-.01,context+" undersized "+control.Id);
                for(int a=0;a<controls.Count;a++)for(int b=a+1;b<controls.Count;b++)
                    Need(!Overlap(controls[a].Bounds,controls[b].Bounds),context+" overlapping controls "+controls[a].Id+" / "+controls[b].Id);
                for(int i=0;i<3;i++){
                    string id="CombatSkill"+i;Need(byId.ContainsKey(id)&&byId.ContainsKey(id+"Text"),context+" missing skill or label");
                    var label=byId[id+"Text"];Need(label.FontSize>=14&&Contains(byId[id].Bounds,label.Bounds),context+" skill label clipping");
                }
            }
            Console.WriteLine("PASS geometry");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

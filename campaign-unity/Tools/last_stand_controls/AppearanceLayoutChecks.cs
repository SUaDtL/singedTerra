using System;
using SingedTerra.LastStand;

static class AppearanceLayoutChecks
{
    static void Need(bool value,string message){if(!value)throw new Exception(message);}
    static bool Fits(LastStandAppearanceLayout.Box a,float w,float h)=>a.X>=0&&a.Y>=0&&a.Width>0&&a.Height>0&&a.Right<=w&&a.Bottom<=h;
    static bool Overlap(LastStandAppearanceLayout.Box a,LastStandAppearanceLayout.Box b)=>a.X<b.Right&&a.Right>b.X&&a.Y<b.Bottom&&a.Bottom>b.Y;
    static void Main(string[] args)
    {
        if(args[0]=="profiles")
        {
            foreach(var size in new[]{new[]{1366,768},new[]{1920,1080},new[]{390,844},new[]{320,568},new[]{280,560},new[]{844,266},new[]{568,142},new[]{500,142},new[]{360,142}})
            {
                var p=LastStandAppearanceLayout.Project(size[0],size[1]);
                foreach(var b in new[]{p.Panel,p.Preview,p.World,p.RotateLeft,p.RotateRight})Need(Fits(b,size[0],size[1]),"bounded nonempty region at "+size[0]+"x"+size[1]);
                Need(!Overlap(p.Panel,p.Preview)&&!Overlap(p.World,p.RotateLeft)&&!Overlap(p.World,p.RotateRight),"world and controls do not overlap");
                Need(p.RotateLeft.Width>=44&&p.RotateLeft.Height>=44&&p.RotateRight.Width>=44&&p.RotateRight.Height>=44,"rotation targets remain 44px");
                Need(p.Panel.Width>=240,"named choices retain readable editor width");
                if(size[1]==142)Need(p.ScrollHeader&&p.Panel.Height>=44&&p.World.Height>=70,"short workspace keeps scroll and world view usable");
            }
        }
        else if(args[0]=="invalid")
        {
            foreach(var pair in new[]{new[]{float.NaN,768f},new[]{1366f,float.PositiveInfinity},new[]{0f,0f},new[]{500f,141f}})
            {bool refused=false;try{LastStandAppearanceLayout.Project(pair[0],pair[1]);}catch(ArgumentOutOfRangeException){refused=true;}Need(refused,"invalid geometry refused");}
        }
        else throw new Exception("unknown case");
        Console.WriteLine("PASS "+args[0]);
    }
}

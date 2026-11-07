using System;
using System.Linq;
using SingedTerra.LastStand;

static class WaveReceiptChecks
{
    static void Check(bool value,string message) { if(!value)throw new Exception(message); }
    static bool Intersects(LastStandHudLayout.Bounds a,LastStandHudLayout.Bounds b)=>
        a.X<b.X+b.Width-.001 && b.X<a.X+a.Width-.001 && a.Y<b.Y+b.Height-.001 && b.Y<a.Y+a.Height-.001;
    static void Layout()
    {
        int[,] sizes={{1366,768},{1920,1080},{390,844},{844,390},{720,640},
            {1366,664},{1920,976},{390,688},{844,266},{720,516}};
        foreach(string phase in new[]{"battle","settling"})for(int n=0;n<sizes.GetLength(0);n++)
        {
            int w=sizes[n,0],h=sizes[n,1];
            string[] controls=phase=="battle"?new[]{"Menu","SpeedMinus","SpeedRate","SpeedPlus","ShopEntry"}:
                new[]{"Menu","SpeedMinus","SpeedRate","SpeedPlus"};
            var plain=LastStandHudLayout.Project(w,h,phase,controls);
            var withReceipt=LastStandHudLayout.Project(w,h,phase,controls,null,true);
            var panel=withReceipt.Slots.SingleOrDefault(s=>s.Id=="WaveReceiptPanel");
            var label=withReceipt.Slots.Single(s=>s.Id=="WaveReceipt");
            bool inline=panel==null;
            var b=inline?label.Bounds:panel.Bounds;var t=label.Bounds;
            Check(b.X>=0&&b.Y>=0&&b.X+b.Width<=w&&b.Y+b.Height<=h,"Receipt outside viewport.");
            Check(t.X>=b.X&&t.Y>=b.Y&&t.X+t.Width<=b.X+b.Width&&t.Y+t.Height<=b.Y+b.Height,
                "Receipt text outside its chrome.");
            Check(label.FontSize>=14&&t.Height>=(inline?20:36)&&t.Width>=(inline?380:200),"Receipt lacks readable space.");
            var center=new LastStandHudLayout.Bounds(w*.2f,h*.2f,w*.6f,h*.6f);
            Check(!Intersects(b,center),"Receipt covers the central battlefield.");
            foreach(var slot in plain.Slots)
            {
                if(inline&&(slot.Id=="PhaseHeading"||slot.Id=="CannonDamage"))continue;
                Check(inline&&slot.Id=="LastStandCard" || !Intersects(b,slot.Bounds),"Receipt overlaps "+slot.Id+" at "+w+"x"+h);
                var unchanged=withReceipt.Slots.Single(s=>s.Id==slot.Id);
                Check(unchanged.Bounds.X==slot.Bounds.X&&unchanged.Bounds.Y==slot.Bounds.Y&&
                    unchanged.Bounds.Width==slot.Bounds.Width&&unchanged.Bounds.Height==slot.Bounds.Height,
                    "Receipt moved existing information or controls.");
            }
            var xs=withReceipt.Slots.SelectMany(s=>new[]{s.Bounds.X,s.Bounds.X+s.Bounds.Width}).Distinct().OrderBy(x=>x).ToArray();
            double area=0;
            for(int index=1;index<xs.Length;index++)
            {
                var rows=withReceipt.Slots.Where(s=>s.Bounds.X<xs[index]&&s.Bounds.X+s.Bounds.Width>xs[index-1])
                    .Select(s=>s.Bounds).OrderBy(r=>r.Y).ToArray();
                if(rows.Length==0)continue;
                float start=rows[0].Y,end=start+rows[0].Height;double span=0;
                foreach(var row in rows.Skip(1))
                { if(row.Y>end){span+=end-start;start=row.Y;end=row.Y+row.Height;}else end=Math.Max(end,row.Y+row.Height); }
                area+=(xs[index]-xs[index-1])*(span+end-start);
            }
            Check(area<=w*h*.25+.01,"Receipt exceeds the existing 25 percent chrome budget at "+w+"x"+h+" "+phase+": "+area/(w*h));
            Check(withReceipt.Slots.Count(s=>s.Kind=="control")==controls.Length,"Receipt created an extra control.");
        }
    }
    static void Text()
    {
        string ordinary=LastStandTierHudText.WaveReceipt(1,1,false,null,0);
        string fitting=LastStandTierHudText.WaveReceipt(100,52,true,"scattergun",0);
        string tier=LastStandTierHudText.WaveReceipt(300,154,true,null,2);
        string mature=LastStandTierHudText.WaveReceipt(5000,2551,true,null,0);
        Check(ordinary.Contains("W1")&&ordinary.Contains("+1 SALVAGE"),"Ordinary receipt lacks confirmed reward.");
        Check(fitting.Contains("+52 SALVAGE")&&fitting.Contains("SCATTERGUN UNLOCKED"),"Fitting unlock absent.");
        Check(tier.Contains("+154 SALVAGE")&&tier.Contains("TIER 2 UNLOCKED"),"Tier unlock absent.");
        Check(mature.Contains("W5000")&&mature.Contains("2,551")&&mature.Contains("FIRST CLEAR"),"Mature milestone unreadable.");
        foreach(string value in new[]{ordinary,fitting,tier,mature})Check(value.Split('\n').Length==2,"Receipt is not compact.");
    }
    static void OpenShop()
    {
        int[,] sizes={{1366,768},{1920,1080},{390,844},{844,390},{720,640},
            {1366,664},{1920,976},{390,688},{844,266},{720,516}};
        string[] controls={"Menu","SpeedMinus","SpeedRate","SpeedPlus","ShopEntry"};
        var shop=new LastStandHudLayout.ShopPanelInput(true,new[]{"cannonAttack"},0);
        for(int n=0;n<sizes.GetLength(0);n++)
        {
            int w=sizes[n,0],h=sizes[n,1];
            var before=LastStandHudLayout.Project(w,h,"battle",controls,shop);
            var after=LastStandHudLayout.Project(w,h,"battle",controls,shop,true);
            var receipt=after.Slots.SingleOrDefault(s=>s.Id=="WaveReceipt");
            Check(receipt!=null,"Open combat shop hides confirmed receipt at "+w+"x"+h);
            bool split=after.Slots.Any(s=>s.Id=="WaveReceiptDetail");
            Check(receipt.Bounds.Width>=(split?176:380)&&receipt.FontSize>=14,"Shop receipt is unreadable at "+w+"x"+h+": "+receipt.Bounds.Width);
            foreach(var item in after.Slots.Where(s=>s.Id.StartsWith("WaveReceipt")))
            {
                var b=item.Bounds;var parent=after.Slots.Single(s=>s.Id==item.Parent).Bounds;
                Check(b.X>=parent.X&&b.Y>=parent.Y&&b.X+b.Width<=parent.X+parent.Width&&b.Y+b.Height<=parent.Y+parent.Height,
                    "Receipt outside existing instrument chrome.");
                foreach(var other in after.Slots.Where(s=>s.Parent==item.Parent&&s.Id!=item.Id))
                    Check(!Intersects(b,other.Bounds),"Shop receipt overlaps "+other.Id);
            }
            foreach(string id in new[]{"HullValue","ElapsedTime","DisabledCount","Fitting","HullBar"})
                Check(after.Slots.Any(s=>s.Id==id),"Receipt hid core instrument "+id);
            foreach(var original in before.Slots.Where(s=>s.Kind=="control"||s.Id=="ShopViewport"))
            {
                var actual=after.Slots.Single(s=>s.Id==original.Id);
                Check(actual.Bounds.X==original.Bounds.X&&actual.Bounds.Y==original.Bounds.Y&&
                    actual.Bounds.Width==original.Bounds.Width&&actual.Bounds.Height==original.Bounds.Height,
                    "Receipt moved shop control or scroll viewport.");
            }
            var clear=after.BattleClearance.Value;
            Check(clear.Width>0&&clear.Height>=44,"Receipt leaves no visible battlefield.");
        }
    }
    static int Main(string[] args)
    {
        try { if(args[0]=="layout")Layout();else if(args[0]=="shop")OpenShop();else Text();Console.WriteLine("PASS "+args[0]);return 0; }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

// An independent bounds oracle over the actual production projection.
// Reflection allows the unchanged baseline to compile and fail behaviorally.
// No copied palette claims to prove the imported HUD's Graphic contrast.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using SingedTerra.LastStand;

static class ShopLayoutChecks
{
    static readonly int[,] Profiles = { {1920,976}, {1366,664}, {720,516}, {390,688}, {844,266} };
    static readonly int[,] OuterProfiles = { {1920,1080}, {1366,768}, {720,640}, {390,844}, {844,390} };
    static readonly string[] Keys = { "cannonAttack", "launcherAttack", "hullCapacity", "armor", "cannonCycle", "fieldRepair" };
    static readonly string[] BattleControls = { "Pause", "ToggleMute", "ShopEntry" };
    static readonly string[] PermanentControls = { "ToggleFitting", "Redeploy", "RetrySave", "ToggleMute", "ShopEntry" };
    static readonly string[] RecoveryControls = { "ToggleFitting", "Purchase", "Redeploy", "RetrySave", "ToggleMute", "ShopEntry" };
    static readonly string[] ReadyGarageControls = { "ToggleFitting", "Deploy", "ToggleMute", "ShopEntry" };
    const double Tolerance = .002;

    static void Require(bool condition, string reason)
    { if (!condition) throw new InvalidOperationException("ASSERTION FAILED: " + reason); }

    static T Property<T>(object owner, string name)
    {
        var property = owner.GetType().GetProperty(name);
        Require(property != null, "Actual projection is missing " + name + ".");
        return (T)property.GetValue(owner, null);
    }

    static LastStandHudLayout.Projection Project(int width, int height, string phase,
        string[] controls, bool open, float offset, string[] keys = null)
    {
        var inputType = typeof(LastStandHudLayout).GetNestedType("ShopPanelInput");
        // No substitute implementation: baseline emits its real closed slots.
        if (inputType == null) return LastStandHudLayout.Project(width, height, phase, controls);
        var input = Activator.CreateInstance(inputType, new object[] { open, keys ?? Keys, offset });
        var method = typeof(LastStandHudLayout).GetMethod("Project", new[] {
            typeof(float), typeof(float), typeof(string), typeof(string[]), inputType });
        Require(method != null, "Actual layout supplies no explicit shop projection overload.");
        return (LastStandHudLayout.Projection)method.Invoke(null, new object[] {
            (float)width, (float)height, phase, controls, input });
    }

    static LastStandHudLayout.Slot Find(LastStandHudLayout.Projection p, string id)
    {
        var slot = p.Slots.SingleOrDefault(s => s.Id == id);
        Require(slot != null, "Actual layout is missing required slot " + id + ".");
        return slot;
    }

    static double Right(LastStandHudLayout.Bounds b) { return b.X + b.Width; }
    static double Bottom(LastStandHudLayout.Bounds b) { return b.Y + b.Height; }
    static bool Contains(LastStandHudLayout.Bounds a, LastStandHudLayout.Bounds b)
    { return b.X >= a.X-Tolerance && b.Y >= a.Y-Tolerance && Right(b) <= Right(a)+Tolerance && Bottom(b) <= Bottom(a)+Tolerance; }
    static bool Intersects(LastStandHudLayout.Bounds a, LastStandHudLayout.Bounds b)
    { return a.Width > 0 && a.Height > 0 && b.Width > 0 && b.Height > 0 && a.X < Right(b)-Tolerance && b.X < Right(a)-Tolerance && a.Y < Bottom(b)-Tolerance && b.Y < Bottom(a)-Tolerance; }
    static bool Equal(LastStandHudLayout.Bounds a, LastStandHudLayout.Bounds b)
    { return Math.Abs(a.X-b.X) < Tolerance && Math.Abs(a.Y-b.Y) < Tolerance && Math.Abs(a.Width-b.Width) < Tolerance && Math.Abs(a.Height-b.Height) < Tolerance; }

    static bool Ancestor(LastStandHudLayout.Projection p, string ancestor, LastStandHudLayout.Slot child)
    {
        string id = child.Parent;
        var visited = new HashSet<string>();
        while (id != null)
        {
            Require(visited.Add(id), "Parent cycle.");
            if (id == ancestor) return true;
            id = Find(p, id).Parent;
        }
        return false;
    }

    static LastStandHudLayout.Bounds Visible(LastStandHudLayout.Projection p, LastStandHudLayout.Slot slot)
    {
        var b = slot.Bounds;
        if (!Ancestor(p, "ShopViewport", slot)) return b;
        var mask = Find(p, "ShopViewport").Bounds;
        double x = Math.Max(b.X, mask.X), y = Math.Max(b.Y, mask.Y);
        return new LastStandHudLayout.Bounds((float)x, (float)y,
            (float)Math.Max(0, Math.Min(Right(b),Right(mask))-x),
            (float)Math.Max(0, Math.Min(Bottom(b),Bottom(mask))-y));
    }

    static void Fit(LastStandHudLayout.Projection p, int width, int height)
    {
        Require(p.Width == width && p.Height == height, "Available Canvas dimensions were charged twice.");
        Require(p.Slots.Select(s => s.Id).Distinct().Count() == p.Slots.Count, "Duplicate slot identities.");
        var screen = new LastStandHudLayout.Bounds(0,0,width,height);
        foreach (var slot in p.Slots)
        {
            var b = slot.Bounds;
            Require(!float.IsNaN(b.X+b.Y+b.Width+b.Height) && !float.IsInfinity(b.X+b.Y+b.Width+b.Height), "Nonfinite " + slot.Id);
            Require(b.Width > 0 && b.Height > 0, "Empty " + slot.Id);
            if (!Ancestor(p,"ShopViewport",slot)) Require(Contains(screen,b), "Offscreen fixed slot " + slot.Id);
            if (slot.Parent != null && slot.Id != "ShopContent")
                Require(Contains(Find(p,slot.Parent).Bounds,b), "Child escapes parent " + slot.Id);
        }
        for (int i=0; i<p.Slots.Count; i++) for (int j=i+1; j<p.Slots.Count; j++)
        {
            var a=p.Slots[i]; var b=p.Slots[j];
            if (Ancestor(p,a.Id,b) || Ancestor(p,b.Id,a)) continue;
            Require(!Intersects(Visible(p,a),Visible(p,b)), "Visible overlap " + a.Id + "/" + b.Id);
        }
    }

    static void SameFixedSlots(LastStandHudLayout.Projection a, LastStandHudLayout.Projection b)
    {
        foreach (var slot in a.Slots.Where(s => !Ancestor(a,"ShopViewport",s)))
            Require(Equal(slot.Bounds,Find(b,slot.Id).Bounds), "Scrolling moves fixed slot " + slot.Id);
    }

    static void ClosedBattleGeometry(LastStandHudLayout.Projection p, int width, int height, List<string> chromeViolations)
    {
        var center = new LastStandHudLayout.Bounds(width*.2f,height*.2f,width*.6f,height*.6f);
        double area = 0;
        foreach (var panel in p.Slots.Where(s => s.Parent == null && s.Kind == "panel"))
        {
            Require(!Intersects(center,panel.Bounds), "Closed battle panel obscures central 60%: " + panel.Id);
            area += panel.Bounds.Width * panel.Bounds.Height;
        }
        double fraction = area / (width * (double)height);
        if (fraction > .25001)
            chromeViolations.Add(width + "x" + height + " actions=" + p.ActionCount + " chrome=" + fraction.ToString("P4"));
        foreach (var slot in p.Slots)
        {
            if (slot.Kind == "text") Require(slot.FontSize >= 14, "Closed battle text below 14px: " + slot.Id);
            if (slot.Kind == "control") Require(slot.Bounds.Width >= 44 && slot.Bounds.Height >= 44,
                "Closed battle target below 44px: " + slot.Id);
        }
    }

    static void ClosedConsole(int width, int height, List<string> chromeViolations)
    {
        var old = LastStandHudLayout.Project(width,height,"battle",new[] { "Pause", "ToggleMute" });
        var explicitClosed = Project(width,height,"battle",new[] { "Pause", "ToggleMute" },false,0);
        Require(old.Slots.Count == explicitClosed.Slots.Count, "Explicit closed flow changes old slot count.");
        foreach (var slot in old.Slots)
            Require(Equal(slot.Bounds,Find(explicitClosed,slot.Id).Bounds), "Closed two-action geometry changed.");
        Console.Error.WriteLine("TWO_ACTION_GEOMETRY " + width + "x" + height + " " + string.Join(";",
            old.Slots.Select(s => s.Id + ":" + s.Parent + ":" + s.Kind + ":" + s.Bounds.X + "," + s.Bounds.Y + "," +
                s.Bounds.Width + "," + s.Bounds.Height + ":" + s.FontSize)));
        ClosedBattleGeometry(explicitClosed,width,height,chromeViolations);
        var third = Project(width,height,"battle",BattleControls,false,0);
        Fit(third,width,height);
        ClosedBattleGeometry(third,width,height,chromeViolations);
        if (width >= 1000)
        {
            var card = Find(third,"LastStandCard").Bounds;
            var dock = Find(third,"LastStandDock").Bounds;
            Require(Math.Abs(card.Y-dock.Y) < Tolerance && card.Y > height*.75,
                "A third action disables the wide bottom command console.");
            Require(!Intersects(card,dock), "The third entry overlaps the command console.");
        }
    }

    static void ClosedReadyGarage(int width, int height)
    {
        var p = Project(width,height,"garage",ReadyGarageControls,false,0);
        var card = Find(p,"LastStandCard").Bounds;
        var dock = Find(p,"LastStandDock").Bounds;
        Console.Error.WriteLine("READY_GARAGE_GEOMETRY " + width + "x" + height + " actions=" + p.ActionCount +
            " card=" + card.X + "," + card.Y + "," + card.Width + "," + card.Height +
            " dock=" + dock.X + "," + dock.Y + "," + dock.Width + "," + dock.Height);
        // The imported garage's original side-loadout/tank-space contract.
        Require(Math.Abs(card.X - 12) < .2 && card.Width <= 440.2,
            "Closed ready-garage side loadout keeps tank space " + width + "x" + height);
        Require(!Intersects(card,dock), "Ready-garage dock overlaps its side loadout.");
        Require(p.ActionCount == ReadyGarageControls.Length && !p.ShopOpen, "Ready garage loses its actual closed control inventory.");
        Fit(p,width,height);
        foreach (string id in ReadyGarageControls)
        {
            var control = Find(p,id);
            Require(Contains(dock,control.Bounds) && !Intersects(card,control.Bounds), "Ready-garage control obscures loadout: " + id);
            Require(control.Bounds.Width >= 44 && control.Bounds.Height >= 44, "Ready-garage target below 44px: " + id);
        }
        foreach (var text in p.Slots.Where(s => s.Kind == "text"))
            Require(text.FontSize >= 14 && text.Bounds.Height >= text.FontSize, "Ready-garage text below 14px: " + text.Id);
        Require(Find(p,"PhaseHeading").Bounds.Height >= 26, "Ready garage loses its readable heading line.");
        foreach (string id in new[] { "PhaseDetail", "SaveStatus" })
            Require(Find(p,id).Bounds.Height >= 5 * 20, "Ready garage loses five readable detail/status lines: " + id);
    }

    static void ClosedRecovery(int width, int height)
    {
        var p = Project(width,height,"workshop",RecoveryControls,false,0);
        var card = Find(p,"LastStandCard").Bounds;
        var dock = Find(p,"LastStandDock").Bounds;
        Console.Error.WriteLine("RECOVERY_GEOMETRY " + width + "x" + height + " actions=" + p.ActionCount +
            " card=" + card.X + "," + card.Y + "," + card.Width + "," + card.Height +
            " dock=" + dock.X + "," + dock.Y + "," + dock.Width + "," + dock.Height);
        Require(!Intersects(card,dock), "Closed six-control recovery card/dock nonoverlap purchase-denied-write " + width + "x" + height);
        Require(p.ActionCount == RecoveryControls.Length && !p.ShopOpen, "Recovery loses its actual closed control inventory.");
        Fit(p,width,height);
        foreach (string id in RecoveryControls)
        {
            var control = Find(p,id);
            Require(Contains(dock,control.Bounds) && !Intersects(card,control.Bounds), "Recovery control obscures save inspection: " + id);
            Require(control.Bounds.Width >= 44 && control.Bounds.Height >= 44, "Recovery target below 44px: " + id);
        }
        foreach (var text in p.Slots.Where(s => s.Kind == "text"))
            Require(text.FontSize >= 14 && text.Bounds.Height >= text.FontSize, "Recovery text below 14px: " + text.Id);
        Require(Find(p,"PhaseHeading").Bounds.Height >= 26, "Recovery loses its readable heading line.");
        foreach (string id in new[] { "PhaseDetail", "SaveStatus" })
            Require(Find(p,id).Bounds.Height >= 5 * 20, "Recovery loses five readable detail/status lines: " + id);
    }

    static void OpenProfile(int width, int height, string phase, string[] controls)
    {
        var first = Project(width,height,phase,controls,true,0);
        Find(first,"ShopPanel");
        Require(Property<bool>(first,"ShopOpen"), "Shop open input was ignored.");
        Require(Property<int>(first,"ActionCount") == controls.Length, "Dock does not reserve actual action count.");
        foreach (string id in new[] {"ShopHeading","ShopCurrency","ShopTabAttack","ShopTabDefense","ShopTabUtility","ShopClose","ShopViewport","ShopContent"})
            Find(first,id);
        Require(Find(first,"ShopViewport").Kind == "mask", "Scroll viewport has no explicit mask contract.");
        var viewport = Find(first,"ShopViewport").Bounds;
        var content = Find(first,"ShopContent").Bounds;
        Require(viewport.Height >= 44 && viewport.Width >= 280, "Scroll viewport cannot expose a full purchase target.");
        float maximum = Property<float>(first,"MaximumScrollOffset");
        Require(maximum > 0 && Math.Abs(maximum-(content.Height-viewport.Height)) < Tolerance, "Scroll extent is not bounded by actual content.");
        var last = Project(width,height,phase,controls,true,100000);
        Require(Math.Abs(Property<float>(last,"ScrollOffset")-maximum) < Tolerance, "Scroll past end was not clamped.");
        Require(Property<float>(Project(width,height,phase,controls,true,-100),"ScrollOffset") == 0, "Negative scrolling was not clamped.");
        var middle = Project(width,height,phase,controls,true,maximum/2);
        foreach (var p in new[] { first,middle,last })
        {
            Fit(p,width,height);
            SameFixedSlots(first,p);
            foreach (string id in controls.Concat(new[] {"ShopClose"}))
            {
                var control = Find(p,id);
                Require(!Ancestor(p,"ShopViewport",control), "Required control scrolls away: " + id);
                Require(Contains(new LastStandHudLayout.Bounds(0,0,width,height),control.Bounds), "Required control is offscreen: " + id);
            }
            Require(!p.Slots.Any(s => s.Id == "ReturnToCampaigns"), "Native Return was charged inside the Canvas.");
            if (phase == "battle" || phase == "settling")
            {
                foreach (string id in new[] { "HullValue", "ElapsedTime" })
                    Require(!Ancestor(p,"ShopViewport",Find(p,id)), "Core instrument scrolls away: " + id);
                var clear = Property<LastStandHudLayout.Bounds?>(p,"BattleClearance");
                Require(clear.HasValue, "Open battle supplies no explicit clear region.");
                var c=clear.Value;
                Require(c.Width >= width*.3 && c.Height >= height*.2, "Open battle loses useful center visibility.");
                Require(Contains(c,new LastStandHudLayout.Bounds(width/2f,height/2f,1,1)), "Open panel covers the battle center.");
                foreach (var panel in p.Slots.Where(s => s.Parent == null && s.Kind == "panel"))
                    Require(!Intersects(c,panel.Bounds), "Fixed panel obscures declared battle clearance: " + panel.Id);
            }
        }
        foreach (var field in first.Slots.Where(s => Ancestor(first,"ShopContent",s) && (s.Kind == "control" || s.Kind == "text")))
        {
            // Long fields can span the mask; every reserved text line must be
            // readable by scrolling, and a purchase target fits in one view.
            int segments = field.Kind == "control" ? 1 : (int)Math.Ceiling(field.Bounds.Height/20.0);
            for (int line=0; line<segments; line++)
            {
                float partHeight = field.Kind == "control" ? field.Bounds.Height : Math.Min(20,field.Bounds.Height-line*20);
                float offset = Math.Max(0,Math.Min(maximum,field.Bounds.Y+line*20-viewport.Y));
                var p=Project(width,height,phase,controls,true,offset);
                var target=Find(p,field.Id).Bounds;
                target = new LastStandHudLayout.Bounds(target.X,target.Y+line*20,target.Width,partHeight);
                Require(Contains(Find(p,"ShopViewport").Bounds,target), "Unreachable card field/target " + field.Id);
            }
        }
    }

    static void FiveProfiles()
    {
        var chromeViolations = new List<string>();
        foreach (var profiles in new[] { Profiles, OuterProfiles })
            for (int i=0;i<profiles.GetLength(0);i++)
                ClosedConsole(profiles[i,0],profiles[i,1],chromeViolations);
        Require(chromeViolations.Count == 0, "Closed battle chrome exceeds unchanged 25% limit: " + string.Join("; ",chromeViolations));
        for (int i=0;i<OuterProfiles.GetLength(0);i++)
            ClosedReadyGarage(OuterProfiles[i,0],OuterProfiles[i,1]);
        foreach (var profiles in new[] { OuterProfiles, Profiles })
            for (int i=0;i<profiles.GetLength(0);i++)
                ClosedRecovery(profiles[i,0],profiles[i,1]);
        for (int i=0;i<Profiles.GetLength(0);i++)
        {
            int width=Profiles[i,0], height=Profiles[i,1];
            OpenProfile(width,height,"battle",BattleControls);
            OpenProfile(width,height,"settling",BattleControls);
            OpenProfile(width,height,"garage",PermanentControls);
            OpenProfile(width,height,"workshop",PermanentControls);
            var filtered=Project(width,height,"battle",BattleControls,true,0,new[] { "hullCapacity", "armor" });
            Require(filtered.Slots.Count(s => s.Parent == "ShopContent" && s.Kind == "panel") == 2, "Tab-filtered card count ignored.");
            Require(!filtered.Slots.Any(s => s.Id.StartsWith("ShopCard_cannonAttack",StringComparison.Ordinal)), "Unselected category leaks cards.");
        }
    }

    static void TextTargetsRefusals()
    {
        for (int i=0;i<Profiles.GetLength(0);i++)
        {
            int width=Profiles[i,0],height=Profiles[i,1];
            var p=Project(width,height,"battle",BattleControls,true,0);
            Find(p,"ShopPanel");
            foreach (var slot in p.Slots)
            {
                if (slot.Kind == "text")
                    Require(slot.FontSize >= 14 && slot.Bounds.Height >= slot.FontSize, "Below minimum text geometry: " + slot.Id);
                if (slot.Kind == "control")
                    Require(slot.Bounds.Width >= 44 && slot.Bounds.Height >= 44, "Below minimum target geometry: " + slot.Id);
            }
            foreach (string key in Keys)
            {
                var refusal=Find(p,"ShopCard_"+key+"Refusal");
                Require(refusal.Bounds.Height >= 20 && refusal.Bounds.Height <= 44 && refusal.Bounds.Width >= 100,
                    "Short refusal fits beside its action without five empty lines: " + key);
                Require(Ancestor(p,"ShopContent",refusal), "Refusal is outside bounded scroll content.");
                foreach (string suffix in new[] { "Title", "Levels", "CurrentEffect", "NextEffect", "Buy", "BuyText" })
                    Find(p,"ShopCard_"+key+suffix);
            }
        }
        var type=typeof(LastStandHudLayout).GetNestedType("ShopPanelInput");
        Require(type != null,"Actual layout has no immutable shop input.");
        string[] keys={"hullCapacity","armor"};
        var input=Activator.CreateInstance(type,new object[]{true,keys,0f});
        keys[0]="changed";
        var captured=Property<System.Collections.ObjectModel.ReadOnlyCollection<string>>(input,"CardKeys");
        Require(captured[0] == "hullCapacity" && captured.Count == 2,"Layout input retains mutable caller card identities.");
        foreach (float invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
        {
            bool rejected=false;
            try { Activator.CreateInstance(type,new object[]{true,Keys,invalid}); }
            catch(TargetInvocationException error) { rejected=error.InnerException is ArgumentOutOfRangeException; }
            Require(rejected,"Nonfinite scroll position was accepted.");
        }
        foreach (string[] invalid in new[] { new[] { "armor", "armor" }, new[] { "" }, new[] { " " } })
        {
            bool rejected=false;
            try { Activator.CreateInstance(type,new object[]{true,invalid,0f}); }
            catch(TargetInvocationException error) { rejected=error.InnerException is ArgumentException; }
            Require(rejected,"Invalid/duplicate card identity was accepted.");
        }
        var empty=Project(390,688,"battle",BattleControls,true,100,new string[0]);
        Require(Property<float>(empty,"ScrollOffset") == 0 && Property<float>(empty,"MaximumScrollOffset") == 0,
            "Empty category has an invalid scroll extent.");
        Fit(empty,390,688);
        // This pure unit asserts reserved geometry, not a measured color ratio.
        // Actual Graphic contrast >=4.5, glyph fit and native masking remain
        // integration obligations; there are deliberately no mirrored colors.
    }

    static void CompactSummary()
    {
        foreach (string phase in new[] { "garage", "workshop", "battle" })
        {
            var p = Project(1280,616,phase,phase == "battle" ? BattleControls : ReadyGarageControls,
                true,0,new[] { "hullCapacity", "armor" });
            var viewport = Find(p,"ShopViewport").Bounds;
            foreach (string key in new[] { "hullCapacity", "armor" })
            {
                string id = "ShopCard_" + key;
                Require(Contains(viewport,Find(p,id).Bounds), "Two applicable upgrade summaries and actions must fit together: " + phase + "/" + key);
                Require(Find(p,id).Bounds.Height <= 180, "Normal upgrade summary reserves excessive empty space: " + id);
                foreach (string suffix in new[] { "Title", "Levels", "CurrentEffect", "Refusal", "Buy" })
                    Require(Contains(viewport,Find(p,id + suffix).Bounds), "Selected meaningful field is split from its action: " + suffix);
            }
            Require(Find(p,"ShopHeading").Bounds.X - Find(p,"ShopPanel").Bounds.X >= 10,
                "Shop text clears the outer ornamental frame.");
            if (phase != "battle")
                Require(Find(p,"LastStandCard").Bounds.Width <= 440 && Find(p,"LastStandCard").Bounds.Height <= 112,
                    "Open Shop retains an oversized duplicate garage summary.");
        }
    }

    static void MeasuredLongNotice()
    {
        var inputType = typeof(LastStandHudLayout).GetNestedType("ShopPanelInput");
        var ctor = inputType.GetConstructor(new[] { typeof(bool),typeof(string[]),typeof(float),
            typeof(float[]),typeof(float[]),typeof(float[]),typeof(float) });
        Require(ctor != null,"Layout must consume actual text measurements instead of reserving empty five-line refusals.");
        var method = typeof(LastStandHudLayout).GetMethod("Project",new[] {
            typeof(float),typeof(float),typeof(string),typeof(string[]),inputType });
        foreach (var profile in new[] { new[] {1280,616},new[] {390,688},new[] {844,266} })
        {
            var input = ctor.Invoke(new object[] {true,new[] {"cannonAttack"},0f,new[] {40f},new[] {140f},new[] {20f},40f});
            var p = (LastStandHudLayout.Projection)method.Invoke(null,new object[] {
                (float)profile[0],(float)profile[1],"battle",BattleControls,input });
            Fit(p,profile[0],profile[1]);
            var refusal = Find(p,"ShopCard_cannonAttackRefusal").Bounds;
            Require(refusal.Height >= 140,"Long actual refusal must expand to preserve every measured line.");
            var card = Find(p,"ShopCard_cannonAttack").Bounds;
            Require(Contains(card,refusal) && Contains(card,Find(p,"ShopCard_cannonAttackBuy").Bounds),
                "Long reason and purchase action stay inside the same scrollable row.");
        }
    }

    static int Main(string[] args)
    {
        try
        {
            Require(args.Length == 1,"Exactly one named check is required.");
            switch(args[0])
            {
                case "shop_five_profiles_scroll_and_required_controls": FiveProfiles(); break;
                case "shop_text_contrast_targets_and_refusal_bounds": TextTargetsRefusals(); break;
                case "shop_compact_meaningful_summary": CompactSummary(); break;
                case "shop_measured_long_notice": MeasuredLongNotice(); break;
                default: throw new ArgumentException("Unknown check.");
            }
            Console.WriteLine("PASS " + args[0]);
            return 0;
        }
        catch(Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}

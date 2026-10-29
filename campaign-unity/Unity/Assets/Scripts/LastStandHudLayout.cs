using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;

namespace SingedTerra.LastStand
{
    // One pure Field Console projection, in top-left CSS-equivalent pixels.
    // The HUD supplies the viewport and its already-selected active controls,
    // then converts these bounds once into its canvas coordinates. This class
    // owns neither gameplay state, action availability nor Unity callbacks.
    public static class LastStandHudLayout
    {
        public const float Edge = 12;
        public const float Gap = 8;
        public const float PanelPadding = 12;
        public const float BattlePadding = 8;
        public const float ShortBattleEdge = 1;
        public const float ShortBattlePadding = 2;
        public const float MinimumTextSize = 14;
        public const float BodyTextSize = 16;
        public const float HeadingTextSize = 22;
        public const float LineHeight = 20;
        public const float HeadingLineHeight = 26;
        public const float BattleRowGap = 4;
        public const float HullBarGap = 2;
        public const float HullBarHeight = 4;
        public const float HullBarBottomGap = 6;
        public const float ActionHorizontalPadding = 8;
        public const float ActionVerticalPadding = 2;
        public const float MinimumTargetSize = 44;
        public const float MinimumActionWidth = 148;
        public const float CompactBattleActionWidth = 108;
        public const float CompactFourActionWidth = 88;
        public const float ExpandedBattleActionWidth = 68;
        public const float ExpandedPortraitCardWidth = 300;
        public const float ExpandedPortraitDockPadding = 4;
        public const float ExpandedShortCardWidth = 520;
        public const float ExpandedShortFittingWidth = 220;
        public const float MaximumCardWidth = 440;
        public const float MaximumDockWidth = 900;
        public const float BattleCardWidth = 660;
        public const float BattleFittingWidth = 250;
        public const float BattleCardHeight = 64;
        public const float InstrumentCardHeight = 104;
        public const float InstrumentCardWidth = 900;
        public const float InstrumentTextSize = 22;
        public const float PortraitBattleCardHeight = 116;
        public const float PortraitBreakpoint = 500;
        public const int HeadingLines = 2;
        public const int DetailLines = 5;
        public const int NoticeLines = 5;
        public const float ShopGap = 4;
        public const float ShopPadding = 12;
        public const float ShopCardPadding = 8;
        public const float ShopSideBreakpoint = 720;

        // Only presentation identities and a requested scroll position enter
        // this pure projection. The shop owner supplies its selected category;
        // no catalog, economy, simulation or purchase state is duplicated here.
        public sealed class ShopPanelInput
        {
            public bool Open { get; private set; }
            public ReadOnlyCollection<string> CardKeys { get; private set; }
            public float ScrollOffset { get; private set; }
            public ReadOnlyCollection<float> EffectHeights { get; private set; }
            public ReadOnlyCollection<float> RefusalHeights { get; private set; }
            public ReadOnlyCollection<float> ContributionHeights { get; private set; }
            public ReadOnlyCollection<float> HeaderHeights { get; private set; }
            public float NoticeHeight { get; private set; }
            public float HeadingHeight { get; private set; }
            public float DetailHeight { get; private set; }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset)
                : this(open,cardKeys,scrollOffset,null,null,null,40) { }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset,
                float[] effectHeights, float[] refusalHeights, float[] contributionHeights, float noticeHeight)
                :this(open,cardKeys,scrollOffset,effectHeights,refusalHeights,contributionHeights,noticeHeight,LineHeight,LineHeight) { }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset,
                float[] effectHeights, float[] refusalHeights, float[] contributionHeights, float noticeHeight,
                float headingHeight, float detailHeight)
                :this(open,cardKeys,scrollOffset,effectHeights,refusalHeights,contributionHeights,noticeHeight,headingHeight,detailHeight,null) { }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset,
                float[] effectHeights, float[] refusalHeights, float[] contributionHeights, float noticeHeight,
                float headingHeight, float detailHeight, float[] headerHeights)
            {
                if (cardKeys == null) throw new ArgumentNullException(nameof(cardKeys));
                if (float.IsNaN(scrollOffset) || float.IsInfinity(scrollOffset))
                    throw new ArgumentOutOfRangeException(nameof(scrollOffset));
                var keys = (string[])cardKeys.Clone();
                var unique = new HashSet<string>(StringComparer.Ordinal);
                foreach (string key in keys)
                    if (string.IsNullOrWhiteSpace(key) || !unique.Add(key))
                        throw new ArgumentException("Card identities must be nonempty and unique.", nameof(cardKeys));
                Open = open; CardKeys = Array.AsReadOnly(keys); ScrollOffset = scrollOffset;
                EffectHeights = Heights(effectHeights,keys.Length,LineHeight);
                RefusalHeights = Heights(refusalHeights,keys.Length,LineHeight);
                ContributionHeights = Heights(contributionHeights,keys.Length,LineHeight);
                HeaderHeights = Heights(headerHeights,keys.Length,HeadingLineHeight);
                if (float.IsNaN(noticeHeight) || float.IsInfinity(noticeHeight) || noticeHeight < LineHeight)
                    throw new ArgumentOutOfRangeException(nameof(noticeHeight));
                if (float.IsNaN(headingHeight) || float.IsInfinity(headingHeight) || headingHeight < LineHeight ||
                    float.IsNaN(detailHeight) || float.IsInfinity(detailHeight) || detailHeight < LineHeight)
                    throw new ArgumentOutOfRangeException(nameof(detailHeight));
                NoticeHeight = noticeHeight; HeadingHeight=headingHeight; DetailHeight=detailHeight;
            }
            static ReadOnlyCollection<float> Heights(float[] values, int count, float fallback)
            {
                if (values != null && values.Length != count) throw new ArgumentException("Text metrics must match card identities.");
                var copy = new float[count];
                for (int i = 0; i < count; i++)
                {
                    float value = values == null ? fallback : values[i];
                    if (float.IsNaN(value) || float.IsInfinity(value) || value < 0) throw new ArgumentOutOfRangeException(nameof(values));
                    copy[i] = value;
                }
                return Array.AsReadOnly(copy);
            }
        }

        public struct Bounds
        {
            public readonly float X, Y, Width, Height;
            public Bounds(float x, float y, float width, float height)
            { X = x; Y = y; Width = width; Height = height; }
        }

        public sealed class Slot
        {
            public string Id { get; private set; }
            public string Parent { get; private set; }
            public string Kind { get; private set; }
            public Bounds Bounds { get; private set; }
            public float FontSize { get; private set; }

            internal Slot(string id, string parent, string kind, Bounds bounds, float fontSize)
            { Id = id; Parent = parent; Kind = kind; Bounds = bounds; FontSize = fontSize; }
        }

        public sealed class Projection
        {
            public float Width { get; private set; }
            public float Height { get; private set; }
            public ReadOnlyCollection<Slot> Slots { get; private set; }
            public int ActionCount { get; private set; }
            public bool ShopOpen { get; private set; }
            public Bounds? BattleClearance { get; private set; }
            public float ScrollOffset { get; private set; }
            public float MaximumScrollOffset { get; private set; }

            internal Projection(float width, float height, List<Slot> slots, int actionCount,
                bool shopOpen = false, Bounds? battleClearance = null, float scrollOffset = 0, float maximumScrollOffset = 0)
            {
                Width = width; Height = height; Slots = slots.AsReadOnly(); ActionCount = actionCount;
                ShopOpen = shopOpen; BattleClearance = battleClearance;
                ScrollOffset = scrollOffset; MaximumScrollOffset = maximumScrollOffset;
            }
        }

        static void Add(List<Slot> slots, string id, string parent, string kind,
            float x, float y, float width, float height, float fontSize = 0)
        { slots.Add(new Slot(id, parent, kind, new Bounds(x, y, width, height), fontSize)); }

        static void Text(List<Slot> slots, string id, string parent,
            float x, float y, float width, float height, float fontSize = MinimumTextSize)
        { Add(slots, id, parent, "text", x, y, width, height, fontSize); }

        public static Projection Project(float width, float height, string phase, string[] activeControls)
        { return Project(width, height, phase, activeControls, null); }

        public static Projection Project(float width, float height, string phase, string[] activeControls, ShopPanelInput shop)
        { return Project(width,height,phase,activeControls,shop,false); }

        public static Projection Project(float width,float height,string phase,string[] activeControls,ShopPanelInput shop,bool waveReceipt)
        {
            if (float.IsNaN(width) || float.IsInfinity(width) || width <= 0 ||
                float.IsNaN(height) || float.IsInfinity(height) || height <= 0)
                throw new ArgumentOutOfRangeException("width", "Viewport dimensions must be finite and positive.");
            if (activeControls == null) throw new ArgumentNullException("activeControls");
            int completeActionCount=activeControls.Length;
            var dockControls=new List<string>();bool floatingMenu=false,waveInfo=false;
            foreach(string id in activeControls) { if(id=="Menu")floatingMenu=true;else if(id=="WaveInfo")waveInfo=true;else dockControls.Add(id); }
            activeControls=dockControls.ToArray();
            int actionCount = activeControls.Length;
            if (shop != null && shop.Open) return WithWaveInfo(WithFloatingMenu(OpenShop(width,height,phase,activeControls,shop,actionCount,floatingMenu,waveReceipt),floatingMenu,completeActionCount),waveInfo);
            if((phase=="garage" || phase=="workshop") && Array.IndexOf(activeControls,"TierNext")>=0)
                return WithFloatingMenu(Garage(width,height,activeControls,actionCount),floatingMenu,completeActionCount);
            if((phase=="battle" || phase=="settling") && Array.IndexOf(activeControls,"SpeedRate")>=0)
                return WithWaveInfo(WithFloatingMenu(Combat(width,height,activeControls,actionCount,floatingMenu,waveReceipt),floatingMenu,completeActionCount),waveInfo);

            var slots = new List<Slot>();
            bool battle = phase == "battle" || phase == "settling";
            // Height is the space already left by the page wrapper. A short
            // landscape Canvas keeps full-size instruments/actions by reducing
            // shared panel margins, never by charging the outer header twice.
            bool shortBattle = battle && width >= PortraitBreakpoint && height * .2f < Edge + BattleCardHeight;
            // A very short closed recovery view uses one full-height action
            // row so its information card keeps every reserved reading line.
            // The five approved profiles retain their existing composition.
            bool shortRecovery = !battle && width >= PortraitBreakpoint && height < 240;
            float edge = shortBattle || shortRecovery ? ShortBattleEdge : Edge;
            float padding = battle ? (shortBattle ? ShortBattlePadding : BattlePadding) :
                shortRecovery ? ShortBattlePadding : PanelPadding;
            float dockWidth = DockWidth(width, actionCount, edge, padding);
            bool commandConsole = battle && width >= 1000 && actionCount >= 2 &&
                dockWidth >= actionCount * MinimumActionWidth + (actionCount - 1) * Gap + 2 * padding &&
                width - 2 * edge - dockWidth - Gap >= BattleFittingWidth + 2 * Gap + 2 * padding + 2 * MinimumTargetSize &&
                edge + InstrumentCardHeight <= height * .2f;
            // Three or four ordinary battle actions fit one compact row. The
            // original two-action projection retains its existing dock.
            var dock = new List<Slot>();
            Dock(dock, width, height, activeControls, edge, padding, commandConsole,
                battle && (actionCount == 3 || actionCount == 4) && !commandConsole,shortRecovery,battle && actionCount > 4);
            if (battle) Battle(slots, width, height, edge, padding, commandConsole, actionCount,floatingMenu);
            else Card(slots, width, height, dock.Count == 0 ? height - 2 * Edge : dock[0].Bounds.Y - Edge - Gap,floatingMenu);
            slots.AddRange(dock);
            return WithFloatingMenu(new Projection(width,height,slots,actionCount),floatingMenu,completeActionCount);
        }

        static Projection WithFloatingMenu(Projection projection, bool visible, int actionCount)
        {
            var slots=new List<Slot>(projection.Slots);
            // Large recovery cards may keep their full reading columns below
            // the header. Reserve the floating target in every intersecting
            // heading/text row rather than allowing it to cover live words.
            if(visible)for(int i=0;i<slots.Count;i++)
            {
                var slot=slots[i];var b=slot.Bounds;float right=projection.Width-Edge-52-Gap;
                if(slot.Kind=="text"&&b.Y<Edge+MinimumTargetSize&&b.Y+b.Height>Edge&&b.X<right&&b.X+b.Width>right)
                    slots[i]=new Slot(slot.Id,slot.Parent,slot.Kind,new Bounds(b.X,b.Y,right-b.X,b.Height),slot.FontSize);
            }
            if(visible)
            {
                float x=projection.Width-Edge-52;
                Add(slots,"Menu",null,"control",x,Edge,52,MinimumTargetSize);
                Text(slots,"MenuText","Menu",x+4,Edge+20,44,22,MinimumTextSize);
                for(int i=0;i<3;i++)Add(slots,"MenuBar"+i,"Menu","bar",x+16,Edge+4+i*4,20,2);
            }
            return new Projection(projection.Width,projection.Height,slots,actionCount,projection.ShopOpen,
                projection.BattleClearance,projection.ScrollOffset,projection.MaximumScrollOffset);
        }

        static Projection WithWaveInfo(Projection projection,bool visible)
        {
            if(!visible)return projection;
            var slots=new List<Slot>(projection.Slots);Slot label=null,card=null;
            foreach(var slot in slots){if(slot.Id=="ElapsedTime")label=slot;if(slot.Id=="LastStandCard")card=slot;}
            if(label==null || card==null)return projection;
            var b=label.Bounds;var c=card.Bounds;
            float y=Math.Max(c.Y,Math.Min(c.Y+c.Height-MinimumTargetSize,b.Y+(b.Height-MinimumTargetSize)/2));
            Add(slots,"WaveInfo","LastStandCard","control",b.X,y,Math.Max(MinimumTargetSize,b.Width),MinimumTargetSize);
            return new Projection(projection.Width,projection.Height,slots,projection.ActionCount,projection.ShopOpen,
                projection.BattleClearance,projection.ScrollOffset,projection.MaximumScrollOffset);
        }

        // The field keeps one small rate control and a separate upgrade entry.
        // Settings owns audio/display; future wave information belongs in the
        // instrument card rather than another row of unrelated action buttons.
        static Projection Combat(float width,float height,string[] controls,int actionCount,bool floatingMenu,bool waveReceipt)
        {
            var slots=new List<Slot>();
            bool shortBattle=width>=PortraitBreakpoint && height*.2f<Edge+BattleCardHeight;
            float edge=shortBattle?ShortBattleEdge:Edge;
            Battle(slots,width,height,edge,shortBattle?ShortBattlePadding:BattlePadding,false,actionCount,floatingMenu);
            const float rateWidth=88, groupGap=4;
            float groupWidth=2*MinimumTargetSize+rateWidth+2*groupGap;
            // Keep the complete opaque group in the lower fifth. Short
            // landscape still retains every full-size speed target; its
            // optional heading yields to the actual battlefield clearance.
            bool showLabel=height*.2f>=LineHeight+groupGap+MinimumTargetSize+ShortBattleEdge;
            float dockHeight=MinimumTargetSize+(showLabel?LineHeight+groupGap:0);
            float bottomEdge=Math.Min(Edge,Math.Max(ShortBattleEdge,height*.2f-dockHeight));
            float left=(width-groupWidth)/2, actionY=height-bottomEdge-MinimumTargetSize;
            float dockY=height-bottomEdge-dockHeight;
            Add(slots,"LastStandDock",null,"panel",left,dockY,groupWidth,dockHeight);
            if(showLabel)Text(slots,"DockHeading","LastStandDock",left,dockY,groupWidth,LineHeight);
            foreach(string id in controls)
            {
                if(id=="SpeedMinus")Control(slots,id,"LastStandDock",left,actionY,MinimumTargetSize,MinimumTargetSize);
                else if(id=="SpeedRate")Control(slots,id,"LastStandDock",left+MinimumTargetSize+groupGap,actionY,rateWidth,MinimumTargetSize);
                else if(id=="SpeedPlus")Control(slots,id,"LastStandDock",left+MinimumTargetSize+rateWidth+2*groupGap,actionY,MinimumTargetSize,MinimumTargetSize);
                else if(id=="ShopEntry")
                {
                    float available=width-Edge-(left+groupWidth)-groupGap;
                    const float shopWidth=140;
                    float shopY=available>=shopWidth?actionY:dockY-Gap-MinimumTargetSize;
                    Control(slots,id,null,width-Edge-shopWidth,shopY,shopWidth,MinimumTargetSize);
                }
            }
            if(waveReceipt)
            {
                if(shortBattle)
                {
                    // Short landscape has no spare opaque area. Reuse the
                    // secondary status/reward row while retaining every core
                    // instrument, next milestone and input target.
                    InlineReceipt(slots);
                    return new Projection(width,height,slots,actionCount);
                }
                // A receipt is information, not another toolbar action. Wide
                // views use the unused lower-left corner; portrait pairs it
                // with the upgrade entry above the unchanged speed controls.
                bool beside=left-Edge-Gap>=216;
                float receiptY=beside?actionY:dockY-Gap-MinimumTargetSize;
                float receiptWidth=beside?Math.Min(232,left-Edge-Gap):Math.Min(232,width-2*Edge-140-Gap);
                Add(slots,"WaveReceiptPanel",null,"panel",Edge,receiptY,receiptWidth,MinimumTargetSize);
                Text(slots,"WaveReceipt","WaveReceiptPanel",Edge+8,receiptY+4,receiptWidth-16,36,MinimumTextSize);
            }
            return new Projection(width,height,slots,actionCount);
        }

        static void InlineReceipt(List<Slot> slots)
        {
            var first=slots.Find(s=>s.Id=="PhaseHeading").Bounds;
            var last=slots.Find(s=>s.Id=="CannonDamage").Bounds;
            slots.RemoveAll(s=>s.Id=="PhaseHeading" || s.Id=="CannonDamage");
            if(first.Y<slots.Find(s=>s.Id=="HullValue").Bounds.Y)
            {
                // The narrow shop console already has four reading rows. Move
                // remaining enemies beside the reward, and use its previous row
                // for the receipt detail; hull, wave and next milestone stay put.
                var remaining=slots.Find(s=>s.Id=="DisabledCount").Bounds;
                slots.RemoveAll(s=>s.Id=="DisabledCount");
                const float remainingWidth=92;
                Text(slots,"DisabledCount","LastStandCard",first.X,first.Y,remainingWidth,LineHeight);
                Text(slots,"WaveReceipt","LastStandCard",first.X+remainingWidth+Gap,first.Y,
                    first.Width-remainingWidth-Gap,LineHeight);
                Text(slots,"WaveReceiptDetail","LastStandCard",remaining.X,remaining.Y,first.Width,LineHeight);
            }
            else Text(slots,"WaveReceipt","LastStandCard",first.X,first.Y,last.X+last.Width-first.X,LineHeight);
        }

        // Garage preparation has its own hierarchy: the fixed-size selectors
        // frame an open hero preview, and never join the field-action button row.
        static Projection Garage(float width, float height, string[] controls, int actionCount)
        {
            if(width>=PortraitBreakpoint && height<240)return ShortGarage(width,height,controls,actionCount);
            var slots=new List<Slot>();bool portrait=width<PortraitBreakpoint, shortWide=!portrait&&height<360;
            float tierWidth=portrait ? width-2*Edge : Math.Min(shortWide ? Math.Max(200,width-260) : 440,width-2*Edge);
            if(shortWide)tierWidth=Math.Min(380,tierWidth);
            float tierX=(width-tierWidth)/2, tierY=portrait || width<1100&&!shortWide ? 68 : Edge;
            float tierHeight=shortWide?88:96;
            float titleWidth=shortWide ? Math.Max(80,tierX-2*Edge) : portrait?width-88:width<1100?260:Math.Min(280,tierX-2*Edge);
            Add(slots,"LastStandCard",null,"panel",Edge,Edge,titleWidth,44);
            Text(slots,"PhaseHeading","LastStandCard",Edge,Edge,titleWidth,44,shortWide?18:24);
            Add(slots,"GarageTierCard",null,"panel",tierX,tierY,tierWidth,tierHeight);
            Control(slots,"TierPrevious","GarageTierCard",tierX+4,tierY+4,44,44);
            Control(slots,"TierNext","GarageTierCard",tierX+tierWidth-48,tierY+4,44,44);
            Text(slots,"GarageTierName","GarageTierCard",tierX+52,tierY+4,tierWidth-104,44,16);
            Text(slots,"GarageTierDetail","GarageTierCard",tierX+8,tierY+52,tierWidth-16,tierHeight-56,14);
            float deployHeight=portrait?56:60, deployWidth=portrait?width-2*Edge:264;
            float deployX=(width-deployWidth)/2, deployY=height-Edge-deployHeight;
            // Intermediate widths put Upgrades above Deploy, preserving the
            // dominant centered action without pushing a target off screen.
            bool stackedFooter=portrait || width<700;
            float upgradeWidth=stackedFooter?Math.Min(width-48,320):Math.Min(200,width-deployX-deployWidth-Gap-Edge);
            float upgradeX=stackedFooter?(width-upgradeWidth)/2:deployX+deployWidth+Gap;
            float upgradeY=stackedFooter?deployY-Gap-48:deployY+8;
            bool research=Array.IndexOf(controls,"ResearchEntry")>=0;
            if(research && stackedFooter)
            {upgradeWidth=(width-2*Edge-Gap)/2;upgradeX=Edge;}
            Add(slots,"LastStandDock",null,"panel",0,Math.Min(deployY,upgradeY),width,height-Math.Min(deployY,upgradeY));
            foreach(string id in controls)
            {
                if(id=="Deploy" || id=="Redeploy")
                {
                    Add(slots,id,"LastStandDock","control",deployX,deployY,deployWidth,deployHeight);
                    Text(slots,id+"Text",id,deployX+8,deployY+4,deployWidth-16,deployHeight-8,26);
                }
                else if(id=="ShopEntry")
                {
                    Add(slots,id,null,"control",upgradeX,upgradeY,upgradeWidth,48);
                    Text(slots,id+"Text",id,upgradeX+8,upgradeY+4,upgradeWidth-16,40,18);
                }
                else if(id=="ResearchEntry")
                {
                    float rx=stackedFooter?upgradeX+upgradeWidth+Gap:upgradeX;
                    float ry=stackedFooter?upgradeY:upgradeY-Gap-48;
                    Add(slots,id,null,"control",rx,ry,upgradeWidth,48);
                    Text(slots,id+"Text",id,rx+8,ry+4,upgradeWidth-16,40,16);
                }
            }
            float fittingWidth=portrait?width-48:shortWide?244:284, fittingHeight=shortWide?112:124;
            float saveHeight=portrait?20:40;
            float saveY=portrait?upgradeY-Gap-20:shortWide?64:height-Edge-saveHeight;
            float saveWidth=portrait?width-2*Edge:shortWide?tierX-2*Edge:Math.Min(440,deployX-2*Edge);
            Text(slots,"GarageSave",null,Edge,saveY,saveWidth,saveHeight,14);
            float fittingX=portrait?(width-fittingWidth)/2:Edge;
            float fittingY=portrait?saveY-Gap-fittingHeight:shortWide?tierY+tierHeight+Gap:Math.Max(tierY+tierHeight+Gap,(height-fittingHeight)*.44f);
            Add(slots,"GarageFittingCard",null,"panel",fittingX,fittingY,fittingWidth,fittingHeight);
            Control(slots,"FittingPrevious","GarageFittingCard",fittingX+4,fittingY+4,44,44);
            Control(slots,"FittingNext","GarageFittingCard",fittingX+fittingWidth-48,fittingY+4,44,44);
            Text(slots,"GarageFittingName","GarageFittingCard",fittingX+52,fittingY+4,fittingWidth-104,44,16);
            Text(slots,"GarageFittingDescription","GarageFittingCard",fittingX+8,fittingY+52,fittingWidth-16,fittingHeight-56,14);
            float heroX=portrait?Edge:fittingX+fittingWidth+Gap;
            float heroY=tierY+tierHeight+Gap;
            float heroBottom=portrait?fittingY-Edge:deployY-Edge;
            Add(slots,"GaragePreview",null,"preview",heroX,heroY,width-Edge-heroX,Math.Max(1,heroBottom-heroY));
            return new Projection(width,height,slots,actionCount);
        }

        static Projection ShortGarage(float width, float height, string[] controls, int actionCount)
        {
            var slots=new List<Slot>();const float edge=4,gap=4;
            float cardWidth=Math.Min(244,width*.42f), right=cardWidth+3*edge, rightWidth=width-edge-right;
            float tierHeight=88,fittingY=tierHeight,fittingHeight=height-edge-fittingY;
            Add(slots,"LastStandCard",null,"panel",right,edge,rightWidth-64,44);
            Text(slots,"PhaseHeading","LastStandCard",right,edge,rightWidth-64,44,18);
            Add(slots,"GarageTierCard",null,"panel",edge,0,cardWidth,tierHeight);
            Control(slots,"TierPrevious","GarageTierCard",edge+4,4,44,44);
            Control(slots,"TierNext","GarageTierCard",edge+cardWidth-48,4,44,44);
            Text(slots,"GarageTierName","GarageTierCard",edge+52,4,cardWidth-104,44,14);
            Text(slots,"GarageTierDetail","GarageTierCard",edge+8,52,cardWidth-16,32,14);
            Add(slots,"GarageFittingCard",null,"panel",edge,fittingY,cardWidth,fittingHeight);
            Control(slots,"FittingPrevious","GarageFittingCard",edge+4,fittingY+4,44,44);
            Control(slots,"FittingNext","GarageFittingCard",edge+cardWidth-48,fittingY+4,44,44);
            Text(slots,"GarageFittingName","GarageFittingCard",edge+52,fittingY+4,cardWidth-104,44,14);
            Text(slots,"GarageFittingDescription","GarageFittingCard",edge+8,fittingY+48,cardWidth-16,fittingHeight-52,14);
            float actionY=height-edge-44, deployWidth=(rightWidth-gap)*.56f, upgradeWidth=rightWidth-deployWidth-gap;
            bool research=Array.IndexOf(controls,"ResearchEntry")>=0;
            Add(slots,"LastStandDock",null,"panel",right,actionY,rightWidth,44);
            foreach(string id in controls)
            {
                if(id=="Deploy" || id=="Redeploy")
                {
                    Add(slots,id,"LastStandDock","control",right,actionY,deployWidth,44);
                    Text(slots,id+"Text",id,right+4,actionY+2,deployWidth-8,40,22);
                }
                else if(id=="ShopEntry")
                {
                    Add(slots,id,null,"control",right+deployWidth+gap,actionY,upgradeWidth,44);
                    Text(slots,id+"Text",id,right+deployWidth+gap+4,actionY+2,upgradeWidth-8,40,16);
                }
                else if(id=="ResearchEntry")
                {
                    float rx=right+deployWidth+gap,ry=actionY-gap-44;
                    Add(slots,id,null,"control",rx,ry,upgradeWidth,44);
                    Text(slots,id+"Text",id,rx+4,ry+2,upgradeWidth-8,40,14);
                }
            }
            // Research uses the right half of this row. The narrower status
            // column needs two lines for a complete locked-tier explanation.
            float saveHeight=research?40:20;
            Text(slots,"GarageSave",null,right,actionY-saveHeight-gap,research?deployWidth:rightWidth,saveHeight,14);
            Add(slots,"GaragePreview",null,"preview",right,52,rightWidth,Math.Max(1,actionY-80));
            return new Projection(width,height,slots,actionCount);
        }

        static float DockWidth(float width, int actionCount, float edge, float padding, bool compactBattle = false)
        {
            // The fourth action uses a concise Shop label, so the shorter row
            // also preserves battlefield clearance on a short landscape Canvas.
            float secondaryWidth = actionCount == 4 ? CompactFourActionWidth : CompactBattleActionWidth;
            float desired = (compactBattle ? MinimumActionWidth + (actionCount - 1) * secondaryWidth : actionCount * MinimumActionWidth)
                + (actionCount - 1) * Gap + 2 * padding;
            return Math.Min(width - 2 * edge, Math.Min(desired, MaximumDockWidth));
        }

        static Projection OpenShop(float width, float height, string phase, string[] controls, ShopPanelInput shop, int actionCount,bool floatingMenu,bool waveReceipt)
        {
            bool battle = phase == "battle" || phase == "settling";
            bool shortLandscape = width >= PortraitBreakpoint && height < 360;
            // A stacked panel at 720px leaves only a purchase-button-height
            // strip after reserving the battle center, header and fixed dock.
            // Reuse the side composition once a 320px shop and the readable
            // portrait console can coexist; wider consoles keep their width.
            bool side = width >= ShopSideBreakpoint || shortLandscape;
            float edge = shortLandscape ? ShortBattleEdge : Edge;
            float padding = shortLandscape ? (battle ? ShortBattlePadding : ShopPadding) : (battle ? BattlePadding : PanelPadding);
            // Short battle uses the portrait readout alongside a wider card;
            // permanent recovery retains room for its larger action inventory.
            float panelWidth = side ? (width < 1000 && (!shortLandscape || !battle) ? 320 : 360) : width - 2 * edge;
            float regionLeft = side ? edge + panelWidth + Gap : 0;
            float regionWidth = width - regionLeft;
            var core = new List<Slot>();
            if (battle)
            {
                // A narrow two-row console cannot fit the complete unlock text.
                // Reuse the established portrait reading rows when a receipt is
                // present; the shop viewport and all input targets stay fixed.
                bool narrow=waveReceipt && regionWidth>=PortraitBreakpoint &&
                    regionWidth<700 && edge+InstrumentCardHeight>height*.2f;
                Battle(core,narrow?PortraitBreakpoint-1:regionWidth,height,edge,padding,false,actionCount,floatingMenu);
                if(waveReceipt)InlineReceipt(core);
            }
            else OpenCard(core, regionWidth, edge, shop.NoticeHeight,floatingMenu,shop.HeadingHeight,shop.DetailHeight);
            Dock(core, regionWidth, height, controls, edge, padding, false,battle && (actionCount == 3 || actionCount == 4));
            var slots = new List<Slot>();
            foreach (var slot in core)
            {
                var b = slot.Bounds;
                slots.Add(new Slot(slot.Id, slot.Parent, slot.Kind,
                    new Bounds(b.X + regionLeft, b.Y, b.Width, b.Height), slot.FontSize));
            }
            Bounds card = slots.Find(s => s.Id == "LastStandCard").Bounds;
            var dock = slots.Find(s => s.Id == "LastStandDock");
            float bottom = dock == null ? height - edge : dock.Bounds.Y;
            float panelTop = side ? edge : (battle ? Math.Max(card.Y + card.Height + Gap, height * .5f + Gap + 1) : card.Y + card.Height + Gap);
            float panelHeight = side ? height - 2 * edge : bottom - Gap - panelTop;
            float shopPadding = shortLandscape ? 10 : side ? ShopPadding : 8;
            float viewportHeight = panelHeight - 2 * shopPadding - 2 * MinimumTargetSize - 2 * ShopGap;
            if (panelWidth < 304 || viewportHeight < MinimumTargetSize)
                throw new ArgumentOutOfRangeException("height", "Shop space must reveal one complete purchase target below its fixed header and tabs.");
            float cardsHeight = 0;
            for (int i = 0; i < shop.CardKeys.Count; i++) cardsHeight += ShopCardHeight(shop,i) + (i == 0 ? 0 : Gap);
            float contentHeight = Math.Max(viewportHeight, cardsHeight);
            float maximum = contentHeight - viewportHeight;
            float offset = Math.Max(0, Math.Min(maximum, shop.ScrollOffset));
            Shop(slots, edge, panelTop, panelWidth, panelHeight, viewportHeight, contentHeight, offset, shop,shopPadding);
            Bounds? clearance = null;
            if (battle)
            {
                float clearX = side ? regionLeft + edge : edge;
                float clearY = card.Y + card.Height + Gap;
                float clearBottom = (side ? bottom : panelTop) - Gap;
                clearance = new Bounds(clearX, clearY, width - edge - clearX, clearBottom - clearY);
            }
            return new Projection(width, height, slots, actionCount, true, clearance, offset, maximum);
        }

        static void OpenCard(List<Slot> slots, float width, float edge, float noticeHeight,bool floatingMenu,float headingHeight,float detailHeight)
        {
            float wide = Math.Min(width - 2 * edge, MaximumCardWidth);
            if(floatingMenu)wide=Math.Min(wide,width-Edge-52-Gap-edge);
            float inner = wide - 2 * PanelPadding, x = edge + PanelPadding, y = edge + PanelPadding;
            Add(slots,"LastStandCard",null,"panel",edge,edge,wide,2 * PanelPadding + headingHeight + detailHeight + ShopGap + noticeHeight);
            Text(slots,"PhaseHeading","LastStandCard",x,y,inner,headingHeight,BodyTextSize);
            Text(slots,"PhaseDetail","LastStandCard",x,y + headingHeight,inner,detailHeight);
            Text(slots,"SaveStatus","LastStandCard",x,y + headingHeight + detailHeight + ShopGap,inner,noticeHeight);
        }

        static void Shop(List<Slot> slots, float left, float top, float width, float height,
            float viewportHeight, float contentHeight, float offset, ShopPanelInput shop, float padding)
        {
            Add(slots, "ShopPanel", null, "panel", left, top, width, height);
            float x = left + padding, y = top + padding, inner = width - 2 * padding;
            float closeX = x + inner - MinimumTargetSize;
            const float quantityWidth=100;
            float quantityX=closeX-Gap-quantityWidth,labelWidth=quantityX-x-Gap;
            Text(slots, "ShopHeading", "ShopPanel", x, y, labelWidth, LineHeight, BodyTextSize);
            Text(slots, "ShopCurrency", "ShopPanel", x, y + LineHeight, labelWidth, LineHeight);
            Control(slots,"ShopQuantity","ShopPanel",quantityX,y,quantityWidth,MinimumTargetSize);
            Control(slots, "ShopClose", "ShopPanel", closeX, y, MinimumTargetSize, MinimumTargetSize);
            y += MinimumTargetSize + ShopGap;
            float tabWidth = (inner - 2 * ShopGap) / 3;
            string[] tabs = { "ShopTabAttack", "ShopTabDefense", "ShopTabUtility" };
            for (int i = 0; i < tabs.Length; i++)
                Control(slots, tabs[i], "ShopPanel", x + i * (tabWidth + ShopGap), y, tabWidth, MinimumTargetSize);
            y += MinimumTargetSize + ShopGap;
            // Integration must realize this mask/content relationship using its
            // actual RectMask2D and ScrollRect. Coordinates remain absolute CSS
            // pixels; parent-relative conversion happens once in the HUD.
            Add(slots, "ShopViewport", "ShopPanel", "mask", x, y, inner, viewportHeight);
            Add(slots, "ShopContent", "ShopViewport", "content", x, y - offset, inner, contentHeight);
            float cardY = y - offset;
            for (int i = 0; i < shop.CardKeys.Count; i++)
            {
                ShopCard(slots,"ShopCard_" + shop.CardKeys[i],x,cardY,inner,shop,i);
                cardY += ShopCardHeight(shop,i) + Gap;
            }
        }

        static float ShopCardHeight(ShopPanelInput shop, int index)
        {
            return 2 * ShopCardPadding + ShopHeaderHeight(shop,index) + shop.ContributionHeights[index] +
                shop.EffectHeights[index] + Math.Max(MinimumTargetSize,shop.RefusalHeights[index]) + 2 * ShopGap;
        }
        static float ShopHeaderHeight(ShopPanelInput shop,int index) => Math.Max(HeadingLineHeight,shop.HeaderHeights[index]);

        static void ShopCard(List<Slot> slots, string id, float left, float top, float width, ShopPanelInput shop, int index)
        {
            Add(slots, id, "ShopContent", "panel", left, top, width, ShopCardHeight(shop,index));
            float x = left + ShopCardPadding, y = top + ShopCardPadding, inner = width - 2 * ShopCardPadding;
            // Reserve the complete current level/cap, including four digits on
            // both sides. Actual title wrapping supplies the shared row height.
            const float levelsWidth = 136;
            float headerHeight=ShopHeaderHeight(shop,index);
            Text(slots,id + "Title",id,x,y,inner - levelsWidth - ShopGap,headerHeight,BodyTextSize);
            Text(slots,id + "Levels",id,x + inner - levelsWidth,y,levelsWidth,headerHeight);
            y += headerHeight;
            if (shop.ContributionHeights[index] > 0)
                Text(slots,id + "NextEffect",id,x,y,inner,shop.ContributionHeights[index]);
            y += shop.ContributionHeights[index];
            Text(slots,id + "CurrentEffect",id,x,y,inner,shop.EffectHeights[index]);
            y += shop.EffectHeights[index] + ShopGap;
            float buyWidth = Math.Min(148,(inner - Gap) / 2);
            Text(slots,id + "Refusal",id,x,y,inner - buyWidth - Gap,Math.Max(LineHeight,shop.RefusalHeights[index]));
            Control(slots,id + "Buy",id,x + inner - buyWidth,y,buyWidth,MinimumTargetSize);
        }

        static void Control(List<Slot> slots, string id, string parent, float x, float y, float width, float height)
        {
            Add(slots, id, parent, "control", x, y, width, height);
            Text(slots, id + "Text", id, x + ActionHorizontalPadding, y + ActionVerticalPadding,
                width - 2 * ActionHorizontalPadding, height - 2 * ActionVerticalPadding);
        }

        static void Card(List<Slot> slots, float width, float height, float availableHeight = float.PositiveInfinity,bool floatingMenu=false)
        {
            // Portrait has enough vertical room to keep a full readable card
            // below the independent Menu target. Short wide recovery instead
            // reserves the target's horizontal strip for the complete card.
            bool belowMenu=floatingMenu&&width<PortraitBreakpoint&&height>=360;
            float top=belowMenu?Edge+MinimumTargetSize+Gap:Edge;
            availableHeight-=top-Edge;
            float stackedHeight = 2 * PanelPadding + HeadingLines * HeadingLineHeight +
                DetailLines * LineHeight + NoticeLines * LineHeight + 2 * Gap;
            // The budget reserves Gap for reflow, but an existing stacked card
            // with less clearance still fits until it crosses the actual dock.
            if (width >= PortraitBreakpoint && (height < 360 || stackedHeight > availableHeight + Gap))
            {
                float wide = Math.Min(width - 2 * Edge-(floatingMenu?52+Gap:0), MaximumDockWidth);
                float content = Math.Max(DetailLines * LineHeight, NoticeLines * LineHeight);
                if (availableHeight < 2 * PanelPadding + HeadingLineHeight + Gap + content)
                {
                    float compactPadding = Math.Min(PanelPadding, (availableHeight - content) / 2);
                    if (compactPadding < 4)
                        throw new ArgumentOutOfRangeException("height", "Recovery space must retain every detail and save-status line above the dock.");
                    float compactInner = wide - 2 * compactPadding, readingColumn = (compactInner - 2 * Gap) / 3;
                    float compactX = Edge + compactPadding, compactY = top + compactPadding;
                    bool veryShort = height < 240;
                    // The title may wrap within its full-height column. Give
                    // the five factual rows enough width to keep the longest
                    // cannon-damage line intact at the retained 16px body size.
                    // The save column keeps essentially its previous width.
                    float headingWidth = veryShort ? Math.Min(readingColumn,100) : readingColumn;
                    float detailWidth = veryShort ? (compactInner-headingWidth-2*Gap)*.64f : readingColumn;
                    float statusWidth = compactInner-headingWidth-detailWidth-2*Gap;
                    Add(slots,"LastStandCard",null,"panel",Edge,top,wide,2 * compactPadding + content);
                    Text(slots,"PhaseHeading","LastStandCard",compactX,compactY,headingWidth,
                        veryShort ? content : HeadingLines * HeadingLineHeight,veryShort ? BodyTextSize : HeadingTextSize);
                    Text(slots,"PhaseDetail","LastStandCard",compactX + headingWidth + Gap,compactY,detailWidth,content,BodyTextSize);
                    Text(slots,"SaveStatus","LastStandCard",compactX + headingWidth + detailWidth + 2*Gap,compactY,statusWidth,content);
                    return;
                }
                float inner = wide - 2 * PanelPadding, column = (inner - Gap) / 2;
                float x0 = Edge + PanelPadding, y0 = top + PanelPadding;
                float heading = HeadingLineHeight;
                Add(slots,"LastStandCard",null,"panel",Edge,top,wide,2 * PanelPadding + heading + Gap + content);
                Text(slots,"PhaseHeading","LastStandCard",x0,y0,inner,heading,HeadingTextSize);
                Text(slots,"PhaseDetail","LastStandCard",x0,y0 + heading + Gap,column,content,BodyTextSize);
                Text(slots,"SaveStatus","LastStandCard",x0 + column + Gap,y0 + heading + Gap,column,content);
                return;
            }
            float cardWidth = Math.Min(width - 2 * Edge, MaximumCardWidth);
            if(floatingMenu&&!belowMenu)cardWidth=Math.Min(cardWidth,width-2*Edge-52-Gap);
            float headingHeight = HeadingLines * HeadingLineHeight;
            float detailHeight = DetailLines * LineHeight;
            float noticeHeight = NoticeLines * LineHeight;
            float cardHeight = 2 * PanelPadding + headingHeight + detailHeight + noticeHeight + 2 * Gap;
            float x = Edge + PanelPadding, y = top + PanelPadding, innerWidth = cardWidth - 2 * PanelPadding;
            Add(slots, "LastStandCard", null, "panel", Edge, top, cardWidth, cardHeight);
            Text(slots, "PhaseHeading", "LastStandCard", x, y, innerWidth, headingHeight, HeadingTextSize);
            y += headingHeight + Gap;
            Text(slots, "PhaseDetail", "LastStandCard", x, y, innerWidth, detailHeight, BodyTextSize);
            y += detailHeight + Gap;
            Text(slots, "SaveStatus", "LastStandCard", x, y, innerWidth, noticeHeight);
        }

        static void Battle(List<Slot> slots, float width, float height, float edge, float padding, bool commandConsole, int actionCount,bool floatingMenu=false)
        {
            bool portrait = width < PortraitBreakpoint;
            bool expandedPortrait = portrait && (actionCount > 4 || floatingMenu);
            bool expandedShort = !portrait && actionCount > 4 && edge == ShortBattleEdge;
            // A taller viewport can afford a real instrument cluster. Keep the
            // existing compact/short-height reflow when the expanded cluster
            // would cross the actual central-clearance boundary.
            bool instruments = !portrait && edge + InstrumentCardHeight <= height * .2f;
            float cardWidth = Math.Min(width - 2 * edge, instruments ? InstrumentCardWidth : BattleCardWidth);
            if (expandedPortrait) cardWidth = Math.Min(cardWidth, ExpandedPortraitCardWidth);
            if (expandedShort) cardWidth = Math.Min(cardWidth, ExpandedShortCardWidth);
            if(floatingMenu)cardWidth=Math.Min(cardWidth,width-Edge-52-Gap-edge);
            float cardHeight = instruments ? InstrumentCardHeight : portrait ? PortraitBattleCardHeight : 2 * padding + 2 * LineHeight + Gap;
            float left = edge, top = edge;
            if (commandConsole)
            {
                float controlsWidth = DockWidth(width, actionCount, edge, padding);
                cardWidth = Math.Min(InstrumentCardWidth,width - 2 * edge - controlsWidth - Gap);
                left = (width - cardWidth - controlsWidth - Gap) / 2;
                top = height - edge - cardHeight;
            }
            float x = left + padding, y = top + padding;
            float innerWidth = cardWidth - 2 * padding;
            Add(slots, "LastStandCard", null, "panel", left, top, cardWidth, cardHeight);
            if (instruments)
            {
                float columnWidth = (innerWidth - 2 * Gap) / 3;
                float second = x + columnWidth + Gap, third = second + columnWidth + Gap;
                float valueY = y + 8, valueHeight = 28;
                Text(slots, "HullValue", "LastStandCard", x + 6, valueY, columnWidth - 12, valueHeight, InstrumentTextSize);
                Text(slots, "ElapsedTime", "LastStandCard", second + 6, valueY, columnWidth - 12, valueHeight, InstrumentTextSize);
                Text(slots, "DisabledCount", "LastStandCard", third + 6, valueY, columnWidth - 12, valueHeight, InstrumentTextSize);
                Add(slots, "HullBar", "LastStandCard", "bar", x + 6, valueY + valueHeight + 4, columnWidth - 12, 10);
                float secondaryY = y + 68;
                float secondaryWidth = (innerWidth - 2 * Gap - BattleFittingWidth) / 2;
                Text(slots, "PhaseHeading", "LastStandCard", x, secondaryY, secondaryWidth, LineHeight, 16);
                Text(slots, "CannonDamage", "LastStandCard", x + secondaryWidth + Gap, secondaryY, secondaryWidth, LineHeight, 16);
                Text(slots, "Fitting", "LastStandCard", x + 2 * (secondaryWidth + Gap), secondaryY, BattleFittingWidth, LineHeight);
            }
            else if (portrait)
            {
                float columnWidth = (innerWidth - Gap) / 2;
                float nextColumn = x + columnWidth + Gap;
                float hullY = y + LineHeight + BattleRowGap;
                float barY = hullY + LineHeight + HullBarGap;
                float secondaryY = barY + HullBarHeight + HullBarBottomGap;
                float fittingY = secondaryY + LineHeight + BattleRowGap;
                Text(slots, "PhaseHeading", "LastStandCard", x, y, innerWidth, LineHeight);
                Text(slots, "HullValue", "LastStandCard", x, hullY, columnWidth, LineHeight);
                Text(slots, "ElapsedTime", "LastStandCard", nextColumn, hullY, columnWidth, LineHeight);
                Add(slots, "HullBar", "LastStandCard", "bar", x, barY, columnWidth, HullBarHeight);
                float killsWidth = expandedPortrait ? 110 : columnWidth;
                Text(slots, "DisabledCount", "LastStandCard", x, secondaryY, killsWidth, LineHeight);
                Text(slots, "CannonDamage", "LastStandCard", x + killsWidth + Gap, secondaryY, innerWidth - killsWidth - Gap, LineHeight);
                Text(slots, "Fitting", "LastStandCard", x, fittingY, innerWidth, LineHeight);
            }
            else
            {
                float columnWidth = (innerWidth - 2 * Gap) / 3;
                float second = x + columnWidth + Gap, third = second + columnWidth + Gap;
                Text(slots, "HullValue", "LastStandCard", x, y, columnWidth, LineHeight);
                Text(slots, "ElapsedTime", "LastStandCard", second, y, columnWidth, LineHeight);
                Text(slots, "DisabledCount", "LastStandCard", third, y, columnWidth, LineHeight);
                float secondaryY = y + LineHeight + Gap;
                Add(slots, "HullBar", "LastStandCard", "bar", x, y + LineHeight + HullBarGap, columnWidth, HullBarHeight);
                float fittingWidth = expandedShort ? ExpandedShortFittingWidth : BattleFittingWidth;
                float secondaryWidth = (innerWidth - 2 * Gap - fittingWidth) / 2;
                float cannonX = x + secondaryWidth + Gap;
                float fittingX = cannonX + secondaryWidth + Gap;
                Text(slots, "PhaseHeading", "LastStandCard", x, secondaryY, secondaryWidth, LineHeight);
                Text(slots, "CannonDamage", "LastStandCard", cannonX, secondaryY, secondaryWidth, LineHeight);
                Text(slots, "Fitting", "LastStandCard", fittingX, secondaryY, fittingWidth, LineHeight);
            }
        }

        static void Dock(List<Slot> slots, float width, float height, string[] controls, float edge, float padding, bool commandConsole,
            bool compactBattle = false, bool singleRow = false, bool expandedBattle = false)
        {
            if (controls.Length == 0) return;
            float dockWidth = DockWidth(width, controls.Length, edge, padding, compactBattle);
            if (expandedBattle)
                dockWidth = Math.Min(dockWidth, controls.Length * ExpandedBattleActionWidth + (controls.Length - 1) * Gap + 2 * padding);
            if (expandedBattle && width < PortraitBreakpoint)
            {
                // Eight ordinary controls remain two rows without occupying the
                // central battlefield or exceeding the existing chrome budget.
                // Concise labels keep the 68px targets readable at 14px.
                padding = ExpandedPortraitDockPadding;
                dockWidth = Math.Min(dockWidth, 4 * ExpandedBattleActionWidth + 3 * Gap + 2 * padding);
            }
            int columns = compactBattle || singleRow ? controls.Length : Math.Max(1, Math.Min(controls.Length,
                (int)Math.Floor((dockWidth - 2 * padding + Gap) / ((expandedBattle ? ExpandedBattleActionWidth : MinimumActionWidth) + Gap))));
            int rows = (controls.Length + columns - 1) / columns;
            float rowHeight = singleRow ? 3 * LineHeight : MinimumTargetSize;
            float dockHeight = 2 * padding + rows * rowHeight + (rows - 1) * Gap;
            float left = (width - dockWidth) / 2, top = height - edge - dockHeight;
            if (commandConsole)
            {
                float cardWidth = Math.Min(InstrumentCardWidth,width - 2 * edge - dockWidth - Gap);
                left = (width - cardWidth - dockWidth - Gap) / 2 + cardWidth + Gap;
                dockHeight = InstrumentCardHeight; top = height - edge - dockHeight;
            }
            float actionWidth = (dockWidth - 2 * padding - (columns - 1) * Gap) / columns;
            Add(slots, "LastStandDock", null, "panel", left, top, dockWidth, dockHeight);
            if (commandConsole)
                Text(slots,"DockHeading","LastStandDock",left + padding + 4,top + padding + 8,dockWidth - 2 * padding - 8,LineHeight);
            float compactX = left + padding;
            for (int i = 0; i < controls.Length; i++)
            {
                // The primary Pause label includes its disabled status. Give it
                // a wider span; Sound fits the remaining middle span and Shop
                // retains a two-line label at the same 44px target height.
                float controlWidth = compactBattle ? (i == 0 ? MinimumActionWidth : i == 2 ? CompactBattleActionWidth :
                    dockWidth - 2 * padding - 2 * Gap - MinimumActionWidth - CompactBattleActionWidth) : actionWidth;
                // Pause retains room for UNAVAILABLE; Effects needs two words.
                // Sound and the concise Shop label share the smaller spans.
                bool fourBattleActions = compactBattle && controls.Length == 4;
                if (fourBattleActions) controlWidth = (dockWidth - 2 * padding - 3 * Gap) * (i == 0 ? .35f : i == 2 ? .25f : .20f);
                float x = compactBattle ? compactX : left + padding + (i % columns) * (actionWidth + Gap);
                float targetHeight = commandConsole ? 52 : rowHeight;
                float y = commandConsole ? top + dockHeight - padding - targetHeight : top + padding + (i / columns) * (rowHeight + Gap);
                Add(slots, controls[i], controls[i]=="ShopEntry"?null:"LastStandDock", "control", x, y, controlWidth, targetHeight);
                float horizontalPadding = fourBattleActions || expandedBattle ? 4 : singleRow ? ActionVerticalPadding : ActionHorizontalPadding;
                Text(slots, controls[i] + "Text", controls[i], x + horizontalPadding, y + ActionVerticalPadding,
                    controlWidth - 2 * horizontalPadding, targetHeight - 2 * ActionVerticalPadding);
                compactX += controlWidth + Gap;
            }
        }
    }
}

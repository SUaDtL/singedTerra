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
            public float NoticeHeight { get; private set; }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset)
                : this(open,cardKeys,scrollOffset,null,null,null,40) { }

            public ShopPanelInput(bool open, string[] cardKeys, float scrollOffset,
                float[] effectHeights, float[] refusalHeights, float[] contributionHeights, float noticeHeight)
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
                if (float.IsNaN(noticeHeight) || float.IsInfinity(noticeHeight) || noticeHeight < LineHeight)
                    throw new ArgumentOutOfRangeException(nameof(noticeHeight));
                NoticeHeight = noticeHeight;
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
        {
            if (float.IsNaN(width) || float.IsInfinity(width) || width <= 0 ||
                float.IsNaN(height) || float.IsInfinity(height) || height <= 0)
                throw new ArgumentOutOfRangeException("width", "Viewport dimensions must be finite and positive.");
            if (activeControls == null) throw new ArgumentNullException("activeControls");
            int actionCount = activeControls.Length;
            if (shop != null && shop.Open) return OpenShop(width, height, phase, activeControls, shop, actionCount);

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
            // Three ordinary battle actions fit one compact row. Open shop and
            // the original two-action projection retain their existing dock.
            var dock = new List<Slot>();
            Dock(dock, width, height, activeControls, edge, padding, commandConsole,
                battle && actionCount == 3 && !commandConsole,shortRecovery);
            if (battle) Battle(slots, width, height, edge, padding, commandConsole, actionCount);
            else Card(slots, width, height, dock.Count == 0 ? height - 2 * Edge : dock[0].Bounds.Y - Edge - Gap);
            slots.AddRange(dock);
            return new Projection(width, height, slots, actionCount);
        }

        static float DockWidth(float width, int actionCount, float edge, float padding, bool compactBattle = false)
        {
            float desired = (compactBattle ? MinimumActionWidth + 2 * CompactBattleActionWidth : actionCount * MinimumActionWidth)
                + (actionCount - 1) * Gap + 2 * padding;
            return Math.Min(width - 2 * edge, Math.Min(desired, MaximumDockWidth));
        }

        static Projection OpenShop(float width, float height, string phase, string[] controls, ShopPanelInput shop, int actionCount)
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
            if (battle) Battle(core, regionWidth, height, edge, padding, false, actionCount);
            else OpenCard(core, regionWidth, edge, shop.NoticeHeight);
            Dock(core, regionWidth, height, controls, edge, padding, false,battle && actionCount == 3);
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
            float shopPadding = shortLandscape ? 10 : ShopPadding;
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

        static void OpenCard(List<Slot> slots, float width, float edge, float noticeHeight)
        {
            float wide = Math.Min(width - 2 * edge, MaximumCardWidth);
            float inner = wide - 2 * PanelPadding, x = edge + PanelPadding, y = edge + PanelPadding;
            Add(slots,"LastStandCard",null,"panel",edge,edge,wide,2 * PanelPadding + 2 * LineHeight + ShopGap + noticeHeight);
            Text(slots,"PhaseHeading","LastStandCard",x,y,inner,LineHeight,BodyTextSize);
            Text(slots,"PhaseDetail","LastStandCard",x,y + LineHeight,inner,LineHeight);
            Text(slots,"SaveStatus","LastStandCard",x,y + 2 * LineHeight + ShopGap,inner,noticeHeight);
        }

        static void Shop(List<Slot> slots, float left, float top, float width, float height,
            float viewportHeight, float contentHeight, float offset, ShopPanelInput shop, float padding)
        {
            Add(slots, "ShopPanel", null, "panel", left, top, width, height);
            float x = left + padding, y = top + padding, inner = width - 2 * padding;
            float closeX = x + inner - MinimumTargetSize;
            Text(slots, "ShopHeading", "ShopPanel", x, y, inner - MinimumTargetSize - Gap, LineHeight, BodyTextSize);
            Text(slots, "ShopCurrency", "ShopPanel", x, y + LineHeight, inner - MinimumTargetSize - Gap, LineHeight);
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
            return 2 * ShopCardPadding + HeadingLineHeight + shop.ContributionHeights[index] +
                shop.EffectHeights[index] + Math.Max(MinimumTargetSize,shop.RefusalHeights[index]) + 2 * ShopGap;
        }

        static void ShopCard(List<Slot> slots, string id, float left, float top, float width, ShopPanelInput shop, int index)
        {
            Add(slots, id, "ShopContent", "panel", left, top, width, ShopCardHeight(shop,index));
            float x = left + ShopCardPadding, y = top + ShopCardPadding, inner = width - 2 * ShopCardPadding;
            const float levelsWidth = 94;
            Text(slots,id + "Title",id,x,y,inner - levelsWidth - ShopGap,HeadingLineHeight,BodyTextSize);
            Text(slots,id + "Levels",id,x + inner - levelsWidth,y,levelsWidth,HeadingLineHeight);
            y += HeadingLineHeight;
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

        static void Card(List<Slot> slots, float width, float height, float availableHeight = float.PositiveInfinity)
        {
            float stackedHeight = 2 * PanelPadding + HeadingLines * HeadingLineHeight +
                DetailLines * LineHeight + NoticeLines * LineHeight + 2 * Gap;
            // The budget reserves Gap for reflow, but an existing stacked card
            // with less clearance still fits until it crosses the actual dock.
            if (width >= PortraitBreakpoint && (height < 360 || stackedHeight > availableHeight + Gap))
            {
                float wide = Math.Min(width - 2 * Edge, MaximumDockWidth);
                float content = Math.Max(DetailLines * LineHeight, NoticeLines * LineHeight);
                if (availableHeight < 2 * PanelPadding + HeadingLineHeight + Gap + content)
                {
                    float compactPadding = Math.Min(PanelPadding, (availableHeight - content) / 2);
                    if (compactPadding < 4)
                        throw new ArgumentOutOfRangeException("height", "Recovery space must retain every detail and save-status line above the dock.");
                    float compactInner = wide - 2 * compactPadding, readingColumn = (compactInner - 2 * Gap) / 3;
                    float compactX = Edge + compactPadding, compactY = Edge + compactPadding;
                    bool veryShort = height < 240;
                    float headingWidth = veryShort ? Math.Min(readingColumn,128) : readingColumn;
                    float detailWidth = veryShort ? (compactInner-headingWidth-2*Gap)*.6f : readingColumn;
                    float statusWidth = compactInner-headingWidth-detailWidth-2*Gap;
                    Add(slots,"LastStandCard",null,"panel",Edge,Edge,wide,2 * compactPadding + content);
                    Text(slots,"PhaseHeading","LastStandCard",compactX,compactY,headingWidth,
                        veryShort ? content : HeadingLines * HeadingLineHeight,veryShort ? BodyTextSize : HeadingTextSize);
                    Text(slots,"PhaseDetail","LastStandCard",compactX + headingWidth + Gap,compactY,detailWidth,content,BodyTextSize);
                    Text(slots,"SaveStatus","LastStandCard",compactX + headingWidth + detailWidth + 2*Gap,compactY,statusWidth,content);
                    return;
                }
                float inner = wide - 2 * PanelPadding, column = (inner - Gap) / 2;
                float x0 = Edge + PanelPadding, y0 = Edge + PanelPadding;
                float heading = HeadingLineHeight;
                Add(slots,"LastStandCard",null,"panel",Edge,Edge,wide,2 * PanelPadding + heading + Gap + content);
                Text(slots,"PhaseHeading","LastStandCard",x0,y0,inner,heading,HeadingTextSize);
                Text(slots,"PhaseDetail","LastStandCard",x0,y0 + heading + Gap,column,content,BodyTextSize);
                Text(slots,"SaveStatus","LastStandCard",x0 + column + Gap,y0 + heading + Gap,column,content);
                return;
            }
            float cardWidth = Math.Min(width - 2 * Edge, MaximumCardWidth);
            float headingHeight = HeadingLines * HeadingLineHeight;
            float detailHeight = DetailLines * LineHeight;
            float noticeHeight = NoticeLines * LineHeight;
            float cardHeight = 2 * PanelPadding + headingHeight + detailHeight + noticeHeight + 2 * Gap;
            float x = Edge + PanelPadding, y = Edge + PanelPadding, innerWidth = cardWidth - 2 * PanelPadding;
            Add(slots, "LastStandCard", null, "panel", Edge, Edge, cardWidth, cardHeight);
            Text(slots, "PhaseHeading", "LastStandCard", x, y, innerWidth, headingHeight, HeadingTextSize);
            y += headingHeight + Gap;
            Text(slots, "PhaseDetail", "LastStandCard", x, y, innerWidth, detailHeight, BodyTextSize);
            y += detailHeight + Gap;
            Text(slots, "SaveStatus", "LastStandCard", x, y, innerWidth, noticeHeight);
        }

        static void Battle(List<Slot> slots, float width, float height, float edge, float padding, bool commandConsole, int actionCount)
        {
            bool portrait = width < PortraitBreakpoint;
            // A taller viewport can afford a real instrument cluster. Keep the
            // existing compact/short-height reflow when the expanded cluster
            // would cross the actual central-clearance boundary.
            bool instruments = !portrait && edge + InstrumentCardHeight <= height * .2f;
            float cardWidth = Math.Min(width - 2 * edge, instruments ? InstrumentCardWidth : BattleCardWidth);
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
                Text(slots, "DisabledCount", "LastStandCard", x, secondaryY, columnWidth, LineHeight);
                Text(slots, "CannonDamage", "LastStandCard", nextColumn, secondaryY, columnWidth, LineHeight);
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
                float secondaryWidth = (innerWidth - 2 * Gap - BattleFittingWidth) / 2;
                float cannonX = x + secondaryWidth + Gap;
                float fittingX = cannonX + secondaryWidth + Gap;
                Text(slots, "PhaseHeading", "LastStandCard", x, secondaryY, secondaryWidth, LineHeight);
                Text(slots, "CannonDamage", "LastStandCard", cannonX, secondaryY, secondaryWidth, LineHeight);
                Text(slots, "Fitting", "LastStandCard", fittingX, secondaryY, BattleFittingWidth, LineHeight);
            }
        }

        static void Dock(List<Slot> slots, float width, float height, string[] controls, float edge, float padding, bool commandConsole,
            bool compactBattle = false, bool singleRow = false)
        {
            if (controls.Length == 0) return;
            float dockWidth = DockWidth(width, controls.Length, edge, padding, compactBattle);
            int columns = compactBattle || singleRow ? controls.Length : Math.Max(1, Math.Min(controls.Length,
                (int)Math.Floor((dockWidth - 2 * padding + Gap) / (MinimumActionWidth + Gap))));
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
                float x = compactBattle ? compactX : left + padding + (i % columns) * (actionWidth + Gap);
                float targetHeight = commandConsole ? 52 : rowHeight;
                float y = commandConsole ? top + dockHeight - padding - targetHeight : top + padding + (i / columns) * (rowHeight + Gap);
                Add(slots, controls[i], "LastStandDock", "control", x, y, controlWidth, targetHeight);
                float horizontalPadding = singleRow ? ActionVerticalPadding : ActionHorizontalPadding;
                Text(slots, controls[i] + "Text", controls[i], x + horizontalPadding, y + ActionVerticalPadding,
                    controlWidth - 2 * horizontalPadding, targetHeight - 2 * ActionVerticalPadding);
                compactX += controlWidth + Gap;
            }
        }
    }
}

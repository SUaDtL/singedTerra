using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed class LastStandLoopHud
    {
        readonly LastStandLoopController loop;
        readonly Canvas canvas;
        readonly Font font;
        readonly RectTransform root, card, dock;
        readonly RectTransform hullFill;
        readonly Text heading, detail, status;
        readonly Button deploy, claim, purchase, redeploy, retry, fitting, pause, mute, tier;
        readonly Button[] actions;
        readonly Button shopEntry, shopClose;
        readonly Button[] shopTabs, shopActions, allActions;
        readonly ShopCardControls[] shopCards;
        readonly RectTransform shopPanel, shopViewport, shopContent;
        readonly ScrollRect shopScroll;
        readonly Text shopHeading, shopCurrency;
        readonly EncounterSession observedSession;
        readonly LastStandHudKeyboard keyboard;
        readonly Texture2D metalGrain;
        readonly Sprite metalSurface;
        readonly LastStandConsoleFrame cardFrame;
        readonly Dictionary<string, RectTransform> nodes = new Dictionary<string, RectTransform>();
        readonly Dictionary<string, Text> readouts = new Dictionary<string, Text>();
        string previousLayout, projectedPhase;
        string previousShopState;
        LastStandShopView shopView;
        LastStandShopMode shopMode;
        LastStandUpgradeCategory shopCategory = LastStandUpgradeCategory.Attack;
        bool shopOpen, layingOut;
        int shopRunId, purchaseActivation, lastEffectRunId, lastEffectTick = -1;
        float shopScrollOffset, shopMaximumScroll, shopUnitsY = 1;
        Vector2 layoutPixels;
        string purchaseFeedback;
        LastStandUpgradeTrackId feedbackTrack;
        static readonly Color Ink = new Color(.055f,.068f,.064f,1);
        static readonly Color Graphite = new Color(.17f,.19f,.155f,1);
        static readonly Color Paper = new Color(.94f,.91f,.80f);
        static readonly Color Brass = new Color(.91f,.69f,.33f);
        static readonly Color Olive = new Color(.24f,.27f,.205f,1);
        static readonly Color DisabledSurface = new Color(.14f,.16f,.135f,1);
        static readonly Color DisabledPaper = new Color(.76f,.75f,.67f,1);
        static readonly Color HullGreen = new Color(.42f,.65f,.32f,1);
        // One deterministic, reusable metal surface. It is made once for the
        // dedicated HUD and released with it, never generated during Refresh.
        static Texture2D MetalGrain()
        {
            const int size = 96;
            var texture = new Texture2D(size,size,TextureFormat.RGBA32,false);
            texture.name = "LastStandConsoleMetal"; texture.wrapMode = TextureWrapMode.Repeat;
            texture.filterMode = FilterMode.Bilinear;
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
            {
                // Fine continuous grain stays quiet on both graphite and brass.
                // Wear belongs to the edge mesh, not repeating patina blocks.
                int noise = ((x * 73 + y * 151) ^ (x * y * 17)) & 7;
                int brushed = ((y * 23) ^ (y >> 2) * 13) & 3;
                int value = 252 - noise / 2 - brushed;
                if (y % 47 == 0 && x % 31 < 11) value = 255;
                byte v = (byte)value; pixels[y * size + x] = new Color32(v,v,v,255);
            }
            texture.SetPixels32(pixels); texture.Apply(false,true); return texture;
        }
        LastStandConsoleFrame Frame(RectTransform parent, bool button = false)
        {
            var rect = Node("ConsoleFrame",parent); rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
            rect.gameObject.AddComponent<CanvasRenderer>();
            var frame = rect.gameObject.AddComponent<LastStandConsoleFrame>(); frame.Initialize(button,metalGrain); return frame;
        }
#if UNITY_WEBGL && !UNITY_EDITOR
        // Existing Unity Web SystemInfo import; no new JS/state/Canvas owner.
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern double JS_SystemInfo_GetPreferredDevicePixelRatio();
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void JS_Log_Dump(string message, int type);
#endif
        static float PreferredPixelRatio()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            double ratio = JS_SystemInfo_GetPreferredDevicePixelRatio();
            if (!double.IsNaN(ratio) && !double.IsInfinity(ratio) && ratio > 0) return (float)ratio;
#endif
            return 1;
        }
        static RectTransform Node(string name, Transform parent)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false); rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0,1);
            return rect;
        }
        static void Place(RectTransform rect, float x, float y, float w, float h)
        { rect.anchoredPosition = new Vector2(x,-y); rect.sizeDelta = new Vector2(w,h); }
        Text Label(string name, Transform parent, int size)
        {
            var rect = Node(name,parent); var text = rect.gameObject.AddComponent<Text>();
            nodes.Add(name,rect);
            text.font = font; text.fontSize = size; text.color = Paper; text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Truncate;
            return text;
        }
        Button Action(string name, string label, Transform parent, UnityEngine.Events.UnityAction handler)
        {
            var rect = Node(name,parent); var image = rect.gameObject.AddComponent<Image>();
            nodes.Add(name,rect); image.color = Olive; image.sprite = metalSurface; image.type = Image.Type.Sliced;
            var frame = Frame(rect,true);
            var button = rect.gameObject.AddComponent<Button>(); button.targetGraphic = image;
            var colors = button.colors; colors.normalColor = colors.disabledColor = Color.white;
            colors.highlightedColor = colors.selectedColor = new Color(1.10f,1.10f,1.06f);
            colors.pressedColor = new Color(.85f,.85f,.85f); colors.fadeDuration = .08f; button.colors = colors;
            button.onClick.AddListener(handler);
            var text = Label(name + "Text", rect, 17); text.text = label; text.alignment = TextAnchor.MiddleCenter;
            var outline = rect.gameObject.AddComponent<Outline>(); outline.effectColor = Brass;
            outline.effectDistance = new Vector2(2,-2); outline.enabled = false;
            rect.gameObject.AddComponent<LastStandActionFeedback>().Initialize(button,text,outline,frame);
            return button;
        }
        RectTransform Panel(string name, Transform parent, bool blocksPointer = false, bool framed = true)
        {
            var rect = Node(name,parent); nodes.Add(name,rect);
            var image = rect.gameObject.AddComponent<Image>(); image.color = Graphite;
            image.sprite = metalSurface; image.type = Image.Type.Sliced; image.raycastTarget = blocksPointer;
            if (framed) Frame(rect);
            return rect;
        }
        // Controls retain only immutable identities and transient presentation.
        // The same ordinary card surface can bind the later permanent view.
        sealed class ShopCardControls
        {
            public LastStandUpgradeTrackId TrackId;
            public string Key;
            public Text Title, Levels, Current, Next, Price, Refusal;
            public Button Buy;
        }
        ShopCardControls CreateShopCard(LastStandUpgradeDefinition definition)
        {
            string id = "ShopCard_" + definition.Key; var panel = Panel(id,shopContent,false,false);
            var controls = new ShopCardControls { TrackId = definition.Id, Key = definition.Key,
                Title = Label(id + "Title",panel,16), Levels = Label(id + "Levels",panel,14),
                Current = Label(id + "CurrentEffect",panel,14), Next = Label(id + "NextEffect",panel,14),
                Price = Label(id + "Price",panel,14), Refusal = Label(id + "Refusal",panel,14) };
            controls.Title.color = Brass; controls.Title.fontStyle = FontStyle.Bold;
            controls.Levels.alignment = TextAnchor.UpperRight;
            controls.Next.color = DisabledPaper;
            controls.Price.color = Brass;
            var track = definition.Id;
            controls.Buy = Action(id + "Buy","BUY",panel,() => PurchaseRunTrack(track));
            return controls;
        }
        void StyleAction(Button button, bool primary, bool available)
        {
            button.interactable = available;
            var label = button.GetComponentInChildren<Text>(true);
            button.GetComponent<Image>().color = !available ? DisabledSurface : primary ? Brass : Olive;
            label.color = !available ? DisabledPaper : primary ? Ink : Paper;
            button.GetComponentInChildren<LastStandConsoleFrame>(true).SetAction(primary,available);
            button.GetComponent<LastStandActionFeedback>().Refresh();
        }
        public LastStandLoopHud(LastStandLoopController owner, Canvas sharedCanvas, Font sharedFont)
        {
            loop = owner; canvas = sharedCanvas; font = sharedFont;
            metalGrain = MetalGrain();
            metalSurface = Sprite.Create(metalGrain,new Rect(0,0,96,96),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,new Vector4(10,10,10,10));
            metalSurface.name = "LastStandConsoleSurface";
            root = Node("LastStandLoopHud",canvas.transform); root.anchorMin = Vector2.zero; root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            card = Node("LastStandCard",root); var cardImage = card.gameObject.AddComponent<Image>(); cardImage.color = Graphite;
            cardImage.sprite = metalSurface; cardImage.type = Image.Type.Sliced; cardImage.raycastTarget = false;
            cardFrame = Frame(card);
            nodes.Add(card.name,card);
            heading = Label("PhaseHeading",card,29); heading.color = Brass; heading.fontStyle = FontStyle.Bold;
            detail = Label("PhaseDetail",card,18);
            status = Label("SaveStatus",card,15); status.color = Brass;
            dock = Node("LastStandDock",root); var dockImage = dock.gameObject.AddComponent<Image>(); dockImage.color = Graphite;
            dockImage.sprite = metalSurface; dockImage.type = Image.Type.Sliced; dockImage.raycastTarget = false;
            Frame(dock);
            nodes.Add(dock.name,dock);
            var dockHeading = Label("DockHeading",dock,14); dockHeading.text = "FIELD CONTROLS";
            dockHeading.color = Brass; dockHeading.fontStyle = FontStyle.Bold;
            fitting = Action("ToggleFitting","",dock,ToggleFitting);
            deploy = Action("Deploy","DEPLOY",dock,loop.Deploy);
            claim = Action("Claim","CLAIM 1 SALVAGE",dock,loop.Claim);
            purchase = Action("Purchase","BUY CANNON ATTACK",dock,loop.Purchase);
            redeploy = Action("Redeploy","REDEPLOY",dock,loop.Redeploy);
            retry = Action("RetrySave","RETRY SAVE",dock,loop.RetrySave);
            pause = Action("Pause","PAUSE",dock,loop.TogglePause);
            mute = Action("ToggleMute","SOUND ON",dock,loop.ToggleMute);
            tier = Action("ToggleTier","",dock,() => loop.SelectTier(loop.Progression.SelectedTier == 1 ? 2 : 1));
            actions = new[] { fitting, deploy, claim, purchase, redeploy, retry, pause, mute, tier };
            shopEntry = Action("ShopEntry","MECHANICS SHOP",dock,OpenShop);
            shopPanel = Panel("ShopPanel",root,true);
            shopHeading = Label("ShopHeading",shopPanel,16); shopHeading.text = "MECHANICS SHOP";
            shopHeading.color = Brass; shopHeading.fontStyle = FontStyle.Bold;
            shopCurrency = Label("ShopCurrency",shopPanel,14); shopCurrency.color = Brass;
            shopClose = Action("ShopClose","\u00d7",shopPanel,CloseShop);
            shopTabs = new[] {
                Action("ShopTabAttack","ATTACK",shopPanel,() => SelectCategory(LastStandUpgradeCategory.Attack)),
                Action("ShopTabDefense","DEFENSE",shopPanel,() => SelectCategory(LastStandUpgradeCategory.Defense)),
                Action("ShopTabUtility","UTILITY",shopPanel,() => SelectCategory(LastStandUpgradeCategory.Utility)) };
            shopViewport = Node("ShopViewport",shopPanel); nodes.Add(shopViewport.name,shopViewport);
            shopViewport.gameObject.AddComponent<Image>().color = Ink;
            shopViewport.gameObject.AddComponent<RectMask2D>();
            shopContent = Node("ShopContent",shopViewport); nodes.Add(shopContent.name,shopContent);
            shopScroll = shopPanel.gameObject.AddComponent<ScrollRect>();
            shopScroll.viewport = shopViewport; shopScroll.content = shopContent;
            shopScroll.horizontal = false; shopScroll.vertical = true; shopScroll.inertia = false;
            shopScroll.movementType = ScrollRect.MovementType.Clamped;
            shopScroll.onValueChanged.AddListener(OnShopScrolled);
            shopCards = new ShopCardControls[LastStandUpgradeCatalog.Tracks.Count];
            foreach (var definition in LastStandUpgradeCatalog.Tracks) shopCards[(int)definition.Id] = CreateShopCard(definition);
            var extra = new List<Button> { shopEntry, shopClose }; extra.AddRange(shopTabs);
            foreach (var controls in shopCards) extra.Add(controls.Buy);
            shopActions = extra.ToArray();
            var complete = new List<Button>(actions); complete.AddRange(shopActions); allActions = complete.ToArray();
            keyboard = root.gameObject.AddComponent<LastStandHudKeyboard>(); keyboard.Initialize(allActions,RevealShopSelection);
            foreach (string id in new[] { "HullValue", "ElapsedTime", "DisabledCount", "CannonDamage", "Fitting" })
                readouts.Add(id,Label(id,card,(int)LastStandHudLayout.MinimumTextSize));
            var hullBar = Node("HullBar",card); nodes.Add(hullBar.name,hullBar);
            hullBar.gameObject.AddComponent<Image>().color = Ink;
            hullBar.GetComponent<Image>().sprite = metalSurface; hullBar.GetComponent<Image>().type = Image.Type.Sliced;
            hullFill = Node("HullFill",hullBar); hullFill.gameObject.AddComponent<Image>().color = HullGreen;
            hullFill.anchorMin = Vector2.zero; hullFill.anchorMax = Vector2.one;
            hullFill.offsetMin = hullFill.offsetMax = Vector2.zero;
            hullBar.GetComponent<Image>().raycastTarget = hullFill.GetComponent<Image>().raycastTarget = false;
            observedSession = loop.Session;
            observedSession.Stepped += ObserveCombat;
        }
        void ToggleFitting() { loop.GetComponent<SingedTerra.Art.TankPresentation>().ToggleAttachment(); Refresh(); }
        // A transient presentation snapshot, read once per refresh. No copied
        // progression, save, simulation, reservation or award state is owned here.
        sealed class Presentation
        {
            public string Phase, Heading, Detail, Status, Primary;
            public bool[] Active, Available;
            public string[] Labels;
            public float HullFraction;
            public readonly Dictionary<string,string> Readouts = new Dictionary<string,string>();
        }
        Presentation ReadPresentation()
        {
            string phase = loop.Phase;
            var progress = loop.Progression;
            var model = loop.Session.Model;
            int runTier = LastStandTierCatalog.IsValid(progress.ActiveTier) ? progress.ActiveTier :
                progress.PendingDefeat != null && LastStandTierCatalog.IsValid(progress.PendingDefeat.Tier) ? progress.PendingDefeat.Tier : progress.SelectedTier;
            bool ready = progress.SaveState == "ready";
            bool garage = phase == "garage", battle = phase == "battle", settling = phase == "settling", result = phase == "result", workshop = phase == "workshop";
            bool launcher = loop.GetComponent<SingedTerra.Art.TankPresentation>().showingLauncher;
            bool canDeploy = ready && loop.Session.CanRun && progress.PendingDefeat == null &&
                progress.ActiveRunId == 0 && progress.NextRunId != int.MaxValue;
            bool canPause = (battle || settling) && model != null && loop.Session.Failure == "" &&
                !loop.Session.CatchingUp && (!loop.Session.Paused || loop.Session.CanRun);
            var state = new Presentation { Phase = phase, Primary = garage ? "Deploy" : battle || settling ? "Pause" : result ? "Claim" : workshop ? "Redeploy" : "RetrySave",
                Active = new[] { garage || workshop, garage, result, workshop, workshop, !ready, battle || settling, true, (garage || workshop) && ready },
                Available = new[] { model == null, canDeploy, ready && progress.PendingDefeat != null &&
                    progress.ActiveRunId == 0 && (progress.PendingDefeat.Reward == 0 || progress.Wallet != int.MaxValue),
                    ready && progress.ActiveRunId == 0 && progress.PendingDefeat == null &&
                    progress.NextCost != 0 && progress.Wallet >= progress.NextCost, canDeploy, true,
                    canPause, true, ready && model == null && progress.ActiveRunId == 0 && progress.PendingDefeat == null && progress.TierTwoUnlocked },
                Labels = new[] { launcher ? "FIT REPAIR" : "FIT LAUNCHER", canDeploy ? "DEPLOY" : "DEPLOY UNAVAILABLE",
                    "CLAIM 1 SALVAGE", "BUY CANNON ATTACK", "REDEPLOY", "RETRY SAVE",
                    (loop.Session.Paused ? "RESUME" : "PAUSE") + (canPause ? "" : " UNAVAILABLE"), loop.Muted ? "SOUND OFF" : "SOUND ON",
                    progress.TierTwoUnlocked ? "SELECT TIER " + (progress.SelectedTier == 1 ? "2" : "1") : "TIER 2 LOCKED" } };
            if (garage)
            {
                state.Heading = "LAST STAND";
                state.Detail = TierSummary(progress) + "\nFitting: " + (launcher ? "Auxiliary launcher" : "Field repair") +
                    "\nCannon Attack " + progress.CannonAttackLevel + "/3 / Damage " + progress.CannonDamage +
                    "\nSalvage " + progress.Wallet + " / Next " + (progress.NextCost == 0 ? "MAX" : progress.NextCost.ToString());
            }
            else if (battle && model != null)
            {
                state.Heading = loop.Session.CatchingUp ? "CATCHING UP" : loop.Session.Paused ? "BATTLE PAUSED" :
                    LastStandTierHudText.GoalMet(runTier,model.Tick) ? "GOAL MET: TIER " + runTier : "HOLD THE POSITION";
                state.Detail = "HULL  " + model.Hull + " / " + model.CurrentMaximumHull + "      TIME  " + (model.Tick / 20f).ToString("F1") + "s" +
                    "\nDISABLED  " + model.Kills + "      CANNON  " + model.CurrentCannonDamage + " DAMAGE" +
                    "\nFITTING  " + (model.HasLauncher ? "AUXILIARY LAUNCHER" : "FIELD REPAIR");
            }
            else if (result && progress.PendingDefeat != null)
            {
                var pending = progress.PendingDefeat;
                state.Heading = pending.IsLimit ? "RUN LIMIT REACHED" : "LAST STAND ENDED";
                state.Detail = LastStandTierHudText.Result(pending.Tier,pending.IsLimit,pending.ElapsedTicks,pending.Kills,
                    pending.Reward,progress.Wallet,true,pending.NewBestTime,pending.NewBestKills,pending.UnlockedTierTwo);
            }
            else if (workshop)
            {
                state.Heading = "WORKSHOP  /  CANNON ATTACK";
                state.Detail = TierSummary(progress) + "\nCannon Attack " + progress.CannonAttackLevel + "/3 / Damage " + progress.CannonDamage +
                    "\nSalvage " + progress.Wallet + " / Cost " + (progress.NextCost == 0 ? "MAX" : progress.NextCost.ToString()) +
                    "\nFitting: " + (launcher ? "Auxiliary launcher" : "Field repair");
            }
            else
            {
                state.Heading = settling ? loop.Session.Paused ? "SETTLING PAUSED" : "LAST SHOT" :
                    phase == "loading" ? "LOADING LOCAL SAVE" : "SAVE NEEDS ATTENTION";
                state.Detail = settling ? "The final impact is settling…" : phase == "loading" ? "Waiting for local storage." :
                    "Storage has not confirmed this change.\nRetry Save to check the existing record.";
            }
            bool limitResult = progress.PendingDefeat != null && progress.PendingDefeat.Reward == 0;
            state.Labels[2] = state.Available[2] ? limitResult ? "CONTINUE" : "CLAIM 1 SALVAGE" : "CLAIM UNAVAILABLE";
            state.Labels[3] = progress.NextCost == 0 ? "CANNON ATTACK MAX" : state.Available[3] ? "BUY CANNON ATTACK" : "PURCHASE UNAVAILABLE";
            state.Labels[4] = canDeploy ? "REDEPLOY" : "REDEPLOY UNAVAILABLE";
            state.Status = ready ? "LOCAL SAVE READY\n" + (loop.Notice == "" ? "Unfinished runs earn no reward." : loop.Notice) : progress.SaveError;
            if (ready && (garage || workshop) && !progress.TierTwoUnlocked && loop.Notice == "")
                state.Status = "LOCAL SAVE READY\n" + LastStandTierHudText.LockReason;
            if (model != null)
            {
                state.HullFraction = Mathf.Clamp01(model.Hull / (float)model.CurrentMaximumHull);
                state.Readouts.Add("HullValue","HULL  " + model.Hull + " / " + model.CurrentMaximumHull);
                state.Readouts.Add("ElapsedTime",LastStandTierHudText.Progress(runTier,model.Tick));
                state.Readouts.Add("DisabledCount","DISABLED  " + model.Kills);
                state.Readouts.Add("CannonDamage","CANNON  " + model.CurrentCannonDamage + " DAMAGE");
                state.Readouts.Add("Fitting","FITTING  " + (model.HasLauncher ? "AUXILIARY LAUNCHER" : "FIELD REPAIR"));
            }
            return state;
        }
        static string TierSummary(LastStandProgression progress) => LastStandTierHudText.Goal(progress.SelectedTier) + "\n" +
            LastStandTierHudText.Best(progress.GetBestTicks(progress.SelectedTier),progress.GetBestKills(progress.SelectedTier));
        bool CanOpenRunShop()
        {
            var model = loop.Session?.Model; var shop = loop.Shop;
            return loop.Phase == "battle" && model != null && model.Status == EncounterStatus.Running &&
                shop != null && shop.FinalAccounting == null;
        }
        bool CanOpenPermanentShop()
        {
            var progress = loop.Progression;
            return (loop.Phase == "garage" || loop.Phase == "workshop") && loop.Session?.Model == null &&
                progress != null && progress.ActiveRunId == 0 && progress.PendingDefeat == null;
        }
        void OpenShop()
        {
            if (shopOpen) { CloseShop(); return; }
            bool run = CanOpenRunShop();
            if (!run && !CanOpenPermanentShop()) return;
            shopMode = run ? LastStandShopMode.Run : LastStandShopMode.Permanent;
            shopOpen = true; shopRunId = run ? loop.Shop.RunId : 0; SetShopScrollOffset(0); purchaseFeedback = null;
            Refresh();
        }
        void CloseShop()
        {
            shopOpen = false; shopRunId = 0; SetShopScrollOffset(0); purchaseFeedback = null; Refresh();
            keyboard.Focus(shopEntry);
        }
        void SelectCategory(LastStandUpgradeCategory category)
        {
            if (!shopOpen) return;
            shopCategory = category; SetShopScrollOffset(0); purchaseFeedback = null; Refresh();
        }
        void PurchaseRunTrack(LastStandUpgradeTrackId track)
        {
            if (shopOpen && shopMode == LastStandShopMode.Permanent)
            {
                if (!CanOpenPermanentShop()) return;
                loop.Purchase(track); Refresh(); return;
            }
            var shop = loop.Shop;
            if (!shopOpen || shop == null || shop.RunId != shopRunId) return;
            // Ready is presentation, never a reservation. Capture the real
            // current immutable intent at activation and submit it once.
            var intent = new LastStandShopPurchaseIntent(shop.RunId,shop.Version,track);
            int activation = ++purchaseActivation;
            var result = loop.TryPurchaseTemporary(intent);
            ObservePurchase(activation,intent,result);
            if (shopOpen && loop.Shop == shop)
            {
                feedbackTrack = track;
                purchaseFeedback = result.Accepted ? null : DescribePurchaseRefusal(result.Refusal);
            }
            Refresh();
        }
        static string DescribePurchaseRefusal(LastStandShopPurchaseRefusal refusal)
        {
            switch (refusal)
            {
                case LastStandShopPurchaseRefusal.None: return null;
                case LastStandShopPurchaseRefusal.StaleVersion: return "Offer changed. Review the card and try again.";
                case LastStandShopPurchaseRefusal.WrongRun: return "Run changed. Reopen the Shop.";
                case LastStandShopPurchaseRefusal.InvalidIntent:
                case LastStandShopPurchaseRefusal.UnknownTrack: return "Offer unavailable. Choose another card.";
                case LastStandShopPurchaseRefusal.WrongFitting: return "Requires a different fitting.";
                case LastStandShopPurchaseRefusal.AtCap: return "Upgrade at maximum level.";
                case LastStandShopPurchaseRefusal.InsufficientScrap: return "Not enough Scrap.";
                case LastStandShopPurchaseRefusal.CatchingUp: return "Catching up. Wait for the run to catch up and try again.";
                case LastStandShopPurchaseRefusal.Defeated: return "Run ended.";
                case LastStandShopPurchaseRefusal.Exited: return "Run exited.";
                case LastStandShopPurchaseRefusal.Limit: return "Run limit reached.";
                case LastStandShopPurchaseRefusal.Failed: return "Run stopped.";
                case LastStandShopPurchaseRefusal.Inactive: return "No active run.";
                default: return "Purchase unavailable. Review the card and try again.";
            }
        }
        void RefreshShop()
        {
            bool run = CanOpenRunShop(), permanent = CanOpenPermanentShop(); var owner = loop.Shop;
            bool active = run || permanent;
            var mode = run ? LastStandShopMode.Run : LastStandShopMode.Permanent;
            if (!active || shopOpen && (mode != shopMode || run && owner.RunId != shopRunId))
            { shopOpen = false; shopRunId = 0; SetShopScrollOffset(0); purchaseFeedback = null; }
            shopMode = mode;
            var fitting = loop.GetComponent<SingedTerra.Art.TankPresentation>().showingLauncher ? LastStandFitting.Launcher : LastStandFitting.Repair;
            shopView = run ? LastStandShopPresentation.ProjectRun(owner) : permanent ?
                LastStandShopPresentation.ProjectPermanent(loop.Progression,fitting) : null;
            shopEntry.gameObject.SetActive(active); StyleAction(shopEntry,false,active);
            shopEntry.GetComponentInChildren<Text>(true).text = shopOpen ? "CLOSE SHOP" : "MECHANICS SHOP";
            StyleAction(shopClose,false,shopOpen);
            shopCurrency.text = (run ? "SCRAP  " : "SALVAGE  ") + (shopView?.Balance ?? 0);
            if (shopOpen && permanent)
            {
                heading.text = "TIER " + loop.Progression.SelectedTier + " / GOAL " +
                    LastStandTierCatalog.Get(loop.Progression.SelectedTier).GoalTicks / EncounterModel.TicksPerSecond + "s";
                detail.text = LastStandTierHudText.Best(loop.Progression.GetBestTicks(loop.Progression.SelectedTier),loop.Progression.GetBestKills(loop.Progression.SelectedTier));
            }
            for (int i = 0; i < shopTabs.Length; i++) StyleAction(shopTabs[i],i == (int)shopCategory,shopOpen);
            foreach (var controls in shopCards)
            {
                var cardView = shopView?.Cards[(int)controls.TrackId];
                if (cardView == null) { StyleAction(controls.Buy,false,false); continue; }
                controls.Title.text = cardView.Name;
                controls.Levels.text = "Level " + cardView.CurrentLevel + " / " + cardView.Cap;
                controls.Current.text = EffectDelta(cardView);
                controls.Next.text = run ? "Permanent " + cardView.PermanentLevel + "  /  This run " + cardView.RunPurchases : "";
                controls.Price.text = cardView.PriceDescription;
                controls.Refusal.text = purchaseFeedback != null && feedbackTrack == controls.TrackId ? purchaseFeedback : cardView.Reason;
                controls.Buy.GetComponentInChildren<Text>(true).text = cardView.NextPrice.HasValue ?
                    "BUY  " + cardView.PriceDescription.ToUpperInvariant() : "MAX";
                StyleAction(controls.Buy,false,shopOpen && cardView.CanPurchase);
            }
        }
        static string EffectDelta(LastStandShopCard cardView)
        {
            // Keep exact catalog wording and units together. This is a text
            // transition, never another owner of effect arithmetic.
            return cardView.CurrentEffectDescription + (cardView.NextPrice.HasValue ? " to " + cardView.NextEffectDescription : "");
        }
        void OnShopScrolled(Vector2 ignored)
        {
            if (layingOut || !shopOpen || shopUnitsY <= 0) return;
            float offset = shopContent.anchoredPosition.y / shopUnitsY;
            if (float.IsNaN(offset) || float.IsInfinity(offset)) return;
            offset = Mathf.Clamp(offset,0,shopMaximumScroll);
            if (Mathf.Abs(offset-shopScrollOffset) < .01f) return;
            shopScrollOffset = offset; Layout();
        }
        void SetShopScrollOffset(float offset)
        {
            shopScrollOffset = offset;
            shopContent.anchoredPosition = new Vector2(0,offset*shopUnitsY);
        }
        void RevealShopSelection(Button button)
        {
            if (!shopOpen || layingOut || !button || !button.IsActive() || !button.IsInteractable() ||
                !button.transform.IsChildOf(shopContent) || shopUnitsY <= 0) return;
            var corners = new Vector3[4]; ((RectTransform)button.transform).GetWorldCorners(corners);
            float bottom = shopViewport.InverseTransformPoint(corners[0]).y;
            float top = shopViewport.InverseTransformPoint(corners[1]).y;
            var clip = shopViewport.rect;
            float delta = bottom < clip.yMin ? clip.yMin-bottom : top > clip.yMax ? clip.yMax-top : 0;
            float offset = Mathf.Clamp(shopScrollOffset + delta/shopUnitsY,0,shopMaximumScroll);
            if (Mathf.Abs(offset-shopScrollOffset) < .01f) return;
            shopScroll.StopMovement(); SetShopScrollOffset(offset); Layout();
        }
        void RevealCurrentShopSelection()
        {
            var selected = EventSystem.current ? EventSystem.current.currentSelectedGameObject : null;
            if (selected) RevealShopSelection(selected.GetComponent<Button>());
        }
        public void Refresh()
        {
            var state = ReadPresentation(); keyboard.BeforeRefresh(state.Phase != projectedPhase); projectedPhase = state.Phase;
            heading.text = state.Heading; detail.text = state.Detail; status.text = state.Status;
            for (int i = 0; i < actions.Length; i++)
            {
                var button = actions[i]; button.gameObject.SetActive(state.Active[i]); button.interactable = state.Available[i];
                var label = button.GetComponentInChildren<Text>(true); label.text = state.Labels[i];
                bool primary = button.name == state.Primary;
                StyleAction(button,primary,state.Available[i]);
            }
            RefreshShop();
            if (shopOpen) purchase.gameObject.SetActive(false);
            foreach (var entry in readouts) entry.Value.text = state.Readouts.TryGetValue(entry.Key,out var value) ? value : "";
            hullFill.anchorMax = new Vector2(state.HullFraction,1);
            Layout();
            ReportShopState();
        }
        public void Layout()
        {
            if (!root) return;
            var size = root.rect.size; if (size.x < 1 || size.y < 1) return;
            var pixels = canvas.pixelRect; if (pixels.width < 1 || pixels.height < 1) return;
            // Native input moves content before ScrollRect's deferred callback.
            // The controller may lay out first in LateUpdate, so project the
            // actual reading position instead of overwriting it with the cache.
            if (shopOpen && shopContent.gameObject.activeInHierarchy && shopUnitsY > 0)
            {
                float offset = shopContent.anchoredPosition.y / shopUnitsY;
                if (!float.IsNaN(offset) && !float.IsInfinity(offset))
                    shopScrollOffset = Mathf.Clamp(offset,0,shopMaximumScroll);
            }
            bool resized = layoutPixels != pixels.size; layoutPixels = pixels.size;
            float ratio = PreferredPixelRatio(), cssWidth = pixels.width / ratio, cssHeight = pixels.height / ratio;
            float unitsX = size.x / cssWidth, unitsY = size.y / cssHeight;
            var active = new List<string>(); foreach (var button in actions) if (button.gameObject.activeSelf) active.Add(button.name);
            if (shopEntry.gameObject.activeSelf) active.Add(shopEntry.name);
            var keys = new List<string>();
            if (shopView != null) foreach (var cardView in shopView.Cards)
                if (cardView.Category == shopCategory && cardView.AppliesToFitting) keys.Add(cardView.Key);
            var projection = LastStandHudLayout.Project(cssWidth,cssHeight,projectedPhase,active.ToArray(),
                new LastStandHudLayout.ShopPanelInput(shopOpen,keys.ToArray(),shopScrollOffset));
            if (shopOpen)
            {
                var measures = new Dictionary<string,LastStandHudLayout.Slot>();
                foreach (var slot in projection.Slots) measures.Add(slot.Id,slot);
                var effects = new float[keys.Count]; var refusals = new float[keys.Count]; var contributions = new float[keys.Count];
                for (int i = 0; i < keys.Count; i++)
                {
                    string id = "ShopCard_" + keys[i];
                    effects[i] = MeasureText(nodes[id + "CurrentEffect"].GetComponent<Text>(),measures[id + "CurrentEffect"],unitsX,unitsY);
                    refusals[i] = MeasureText(nodes[id + "Refusal"].GetComponent<Text>(),measures[id + "Refusal"],unitsX,unitsY);
                    contributions[i] = shopMode == LastStandShopMode.Run ?
                        MeasureText(nodes[id + "NextEffect"].GetComponent<Text>(),measures[id + "NextEffect"],unitsX,unitsY) : 0;
                }
                float notice = measures.ContainsKey("SaveStatus") ? MeasureText(status,measures["SaveStatus"],unitsX,unitsY) : 40;
                projection = LastStandHudLayout.Project(cssWidth,cssHeight,projectedPhase,active.ToArray(),
                    new LastStandHudLayout.ShopPanelInput(true,keys.ToArray(),shopScrollOffset,effects,refusals,contributions,notice));
            }
            shopScrollOffset = projection.ScrollOffset; shopMaximumScroll = projection.MaximumScrollOffset; shopUnitsY = unitsY;
            shopScroll.scrollSensitivity = 40 * unitsY;
            var slots = new Dictionary<string,LastStandHudLayout.Slot>(); foreach (var slot in projection.Slots) slots.Add(slot.Id,slot);
            layingOut = true;
            try { foreach (var entry in nodes)
            {
                bool visible = slots.TryGetValue(entry.Key,out var slot); entry.Value.gameObject.SetActive(visible);
                if (!visible) continue;
                var bounds = slot.Bounds; float x = bounds.X, y = bounds.Y;
                if (slot.Parent != null) { var parent = slots[slot.Parent].Bounds; x -= parent.X; y -= parent.Y; }
                Place(entry.Value,x*unitsX,y*unitsY,bounds.Width*unitsX,bounds.Height*unitsY);
                var text = entry.Value.GetComponent<Text>();
                if (text) text.fontSize = Mathf.CeilToInt(slot.FontSize*unitsY);
            } }
            finally { layingOut = false; }
            // Decoration consumes the very same projected slots as live text;
            // it has no separate responsive arithmetic or hit-test owner.
            var cardSlot = slots["LastStandCard"].Bounds;
            bool instruments = slots.ContainsKey("HullValue") && cardSlot.Height == LastStandHudLayout.InstrumentCardHeight;
            if (instruments)
            {
                var hull = slots["HullValue"].Bounds; var timer = slots["ElapsedTime"].Bounds; var kills = slots["DisabledCount"].Bounds;
                var bar = slots["HullBar"].Bounds;
                float height = bar.Y + bar.Height - hull.Y + 8;
                cardFrame.SetInstruments(true,
                    new Rect((hull.X-cardSlot.X-4)*unitsX,(hull.Y-cardSlot.Y-4)*unitsY,(hull.Width+8)*unitsX,height*unitsY),
                    new Rect((timer.X-cardSlot.X-4)*unitsX,(timer.Y-cardSlot.Y-4)*unitsY,(timer.Width+8)*unitsX,height*unitsY),
                    new Rect((kills.X-cardSlot.X-4)*unitsX,(kills.Y-cardSlot.Y-4)*unitsY,(kills.Width+8)*unitsX,height*unitsY));
            }
            else cardFrame.SetInstruments(false,default(Rect),default(Rect),default(Rect));
            keyboard.Refresh();
            if (resized) RevealCurrentShopSelection();
            ReportLayout();
        }
        static float MeasureText(Text text, LastStandHudLayout.Slot slot, float unitsX, float unitsY)
        {
            var settings = text.GetGenerationSettings(new Vector2(slot.Bounds.Width * unitsX,0));
            settings.fontSize = Mathf.CeilToInt(slot.FontSize * unitsY);
            settings.verticalOverflow = VerticalWrapMode.Overflow;
            float preferred = text.cachedTextGeneratorForLayout.GetPreferredHeight(text.text,settings) / text.pixelsPerUnit;
            return Mathf.Max(LastStandHudLayout.LineHeight,Mathf.Ceil(preferred / unitsY));
        }
        [Serializable] sealed class ModelObservation
        {
            public int hull,maximumHull,cannonDamage,launcherDamage,cannonPeriod,repairAmount;
        }
        static ModelObservation ObserveModel(EncounterModel model) => model == null ? null : new ModelObservation {
            hull = model.Hull, maximumHull = model.CurrentMaximumHull, cannonDamage = model.CurrentCannonDamage,
            launcherDamage = model.CurrentLauncherDamage, cannonPeriod = model.CurrentCannonPeriod, repairAmount = model.CurrentRepairAmount };
        [Serializable] sealed class CardObservation
        {
            public string key,category,currentEffect,nextEffect,price,refusal,reason;
            public int trackId,p,n,level,cap,nextPrice;
            public bool hasNextPrice,eligible,canPurchase;
        }
        [Serializable] sealed class AccountingObservation
        {
            public int runId,uniqueKills,earnedScrap,spentScrap,finalScrap;
            public string lifecycle;
        }
        static AccountingObservation ObserveAccounting(LastStandShopAccounting accounting) => accounting == null ? null : new AccountingObservation {
            runId = accounting.RunId, uniqueKills = accounting.UniqueKills, earnedScrap = accounting.EarnedScrap,
            spentScrap = accounting.SpentScrap, finalScrap = accounting.FinalScrap, lifecycle = accounting.Lifecycle.ToString() };
        [Serializable] sealed class ShopObservation
        {
            public string phase,mode,category,fitting,lifecycle,currency;
            public int runId,version,scrap,earnedScrap,spentScrap,uniqueKills,tick,salvage;
            public bool open,hasActiveLedger,hasFinalAccounting,spendable;
            public int[] permanentLevels;
            public CardObservation[] cards;
            public AccountingObservation finalAccounting;
            public ModelObservation model;
        }
        void ReportShopState()
        {
            if (!Application.isPlaying) return;
            string observation = CaptureShopStateJson();
            if (observation != null) Debug.Log("ST_LS_SHOP_STATE " + observation);
        }
        string CaptureShopStateJson()
        {
            var owner = loop.Shop; var model = loop.Session?.Model;
            var permanentLevels = new int[LastStandUpgradeCatalog.Tracks.Count];
            foreach (var track in LastStandUpgradeCatalog.Tracks)
                permanentLevels[(int)track.Id] = loop.Progression.GetPermanentLevel(track.Id);
            var cards = new List<CardObservation>();
            if (shopView != null) foreach (var cardView in shopView.Cards) cards.Add(new CardObservation {
                key = cardView.Key, category = cardView.Category.ToString(), trackId = (int)cardView.TrackId,
                p = cardView.PermanentLevel, n = cardView.RunPurchases, level = cardView.CurrentLevel, cap = cardView.Cap,
                hasNextPrice = cardView.NextPrice.HasValue, nextPrice = cardView.NextPrice ?? 0, price = cardView.PriceDescription,
                currentEffect = cardView.CurrentEffectDescription, nextEffect = cardView.NextEffectDescription,
                eligible = cardView.AppliesToFitting, canPurchase = cardView.CanPurchase,
                refusal = cardView.Refusal.ToString(), reason = cardView.Reason });
            var accounting = loop.FinalAccounting ?? owner?.FinalAccounting;
            var observation = new ShopObservation { phase = loop.Phase, mode = shopMode.ToString(), category = shopCategory.ToString(),
                open = shopOpen, hasActiveLedger = owner != null, spendable = CanOpenRunShop() ||
                    CanOpenPermanentShop() && loop.Progression.SaveState == "ready", runId = owner?.RunId ?? 0,
                version = owner?.Version ?? 0, fitting = owner?.Fitting.ToString() ?? "", lifecycle = owner?.PurchaseLifecycle.ToString() ?? "",
                currency = shopView?.CurrencyName ?? "", salvage = loop.Progression.Wallet,
                scrap = owner?.Scrap ?? 0, earnedScrap = owner?.EarnedScrap ?? 0, spentScrap = owner?.SpentScrap ?? 0,
                uniqueKills = owner?.UniqueKills ?? 0, permanentLevels = permanentLevels,
                cards = cards.ToArray(), hasFinalAccounting = accounting != null,
                finalAccounting = ObserveAccounting(accounting), model = ObserveModel(model) };
            // Tick is truthful on emitted records, but does not amplify an
            // unchanged semantic snapshot into twenty logs per second.
            string key = JsonUtility.ToJson(observation); if (key == previousShopState) return null; previousShopState = key;
            observation.tick = model?.Tick ?? -1; return JsonUtility.ToJson(observation);
        }
        [Serializable] sealed class PurchaseObservation
        {
            public string mode,actionId,refusal;
            public int activationId,intentRunId,intentVersion,intentTrackId,resultVersion,chargedScrap,tick;
            public bool accepted;
            public ModelObservation model;
        }
        void ObservePurchase(int activation, LastStandShopPurchaseIntent intent, LastStandShopPurchaseResult result)
        {
            if (!Application.isPlaying) return;
            Debug.Log("ST_LS_SHOP_PURCHASE " + JsonUtility.ToJson(new PurchaseObservation { mode = "Run",
                actionId = "ShopCard_" + LastStandUpgradeCatalog.Tracks[(int)intent.TrackId].Key + "Buy", activationId = activation,
                intentRunId = intent.RunId, intentVersion = intent.Version, intentTrackId = (int)intent.TrackId,
                accepted = result.Accepted, refusal = result.Refusal.ToString(), resultVersion = result.Version,
                chargedScrap = result.ChargedScrap, tick = loop.Session?.Model?.Tick ?? -1, model = ObserveModel(loop.Session?.Model) }));
        }
        [Serializable] sealed class EventObservation { public string kind; public int slot,amount,rawHit; public bool killed; }
        [Serializable] sealed class CombatObservation
        {
            public int runId,tick; public string fitting;
            public ModelObservation model; public EventObservation[] events;
        }
        void ObserveCombat(EncounterModel model)
        {
            if (!Application.isPlaying || loop.Session != observedSession || model != observedSession.Model || model.Events.Count == 0) return;
            int runId = loop.Shop?.RunId ?? 0;
            if (runId == lastEffectRunId && model.Tick == lastEffectTick) return;
            lastEffectRunId = runId; lastEffectTick = model.Tick;
            var events = new EventObservation[model.Events.Count];
            for (int i = 0; i < events.Length; i++)
            {
                var actual = model.Events[i];
                bool hit = actual.Kind == EncounterEventKind.CloseHit || actual.Kind == EncounterEventKind.RangedHit;
                events[i] = new EventObservation { kind = actual.Kind.ToString(), slot = actual.Slot, amount = actual.Amount,
                    killed = actual.Killed, rawHit = hit && actual.Slot >= 0 && actual.Slot < model.Foes.Count ? model.Foes[actual.Slot].Damage : 0 };
            }
            Debug.Log("ST_LS_SHOP_COMBAT " + JsonUtility.ToJson(new CombatObservation { runId = runId, tick = model.Tick,
                fitting = loop.Shop?.Fitting.ToString() ?? "", model = ObserveModel(model), events = events }));
        }
        [Serializable] sealed class Control
        {
            public string name,label,accessibleLabel,mode,trackKey;
            public float x,y,width,height; public bool active,interactable;
        }
        [Serializable] sealed class GraphicObservation
        {
            public string path,kind,text,style,texture;
            public float x,y,width,height,fontCssSize,preferredWidthCss,preferredHeightCss;
            public bool active,raycastTarget,hasClip;
            public Color color,tint;
            public Rect clip;
        }
        [Serializable] sealed class LayoutState
        {
            public string phase,coordinates,selection;
            public int width,height; public float pixelRatio,scrollOffset,maximumScrollOffset;
            public Control[] controls,shopControls; public GraphicObservation[] graphics;
        }
        string NodePath(Transform node)
        {
            string path = node.name;
            while (node.parent && node.parent != root) { node = node.parent; path = node.name + "/" + path; }
            return path;
        }
        static Rect ScreenBounds(RectTransform rect)
        {
            var corners = new Vector3[4]; rect.GetWorldCorners(corners);
            var lo = RectTransformUtility.WorldToScreenPoint(null,corners[0]); var hi = RectTransformUtility.WorldToScreenPoint(null,corners[2]);
            return new Rect(lo.x,Screen.height-hi.y,hi.x-lo.x,hi.y-lo.y);
        }
        Control[] ObserveControls(Button[] buttons, string mode)
        {
            var controls = new Control[buttons.Length];
            for (int i = 0; i < buttons.Length; i++)
            {
                var button = buttons[i]; var bounds = ScreenBounds((RectTransform)button.transform);
                string track = ""; foreach (var cardControls in shopCards) if (button == cardControls.Buy) track = cardControls.Key;
                string label = button.GetComponentInChildren<Text>(true)?.text ?? "";
                controls[i] = new Control { name = button.name, label = label, accessibleLabel = button == shopClose ? "Close" : label,
                    mode = mode, trackKey = track, x = bounds.x, y = bounds.y, width = bounds.width, height = bounds.height,
                    active = button.gameObject.activeInHierarchy, interactable = button.IsInteractable() };
            }
            return controls;
        }
        void ReportLayout()
        {
            if (!Application.isPlaying) return;
            Canvas.ForceUpdateCanvases();
            var graphics = new List<GraphicObservation>(); GraphicObservation timerObservation = null;
            foreach (var graphic in root.GetComponentsInChildren<Graphic>(true))
            {
                var bounds = ScreenBounds(graphic.rectTransform); var text = graphic as Text;
                bool displayedText = text && graphic.gameObject.activeInHierarchy;
                var mask = graphic.GetComponentInParent<RectMask2D>(true);
                var observation = new GraphicObservation { path = NodePath(graphic.transform), kind = graphic.GetType().Name,
                    active = graphic.gameObject.activeInHierarchy, raycastTarget = graphic.raycastTarget,
                    x = bounds.x, y = bounds.y, width = bounds.width, height = bounds.height,
                    color = graphic.color, tint = graphic.canvasRenderer.GetColor(), texture = graphic.mainTexture ? graphic.mainTexture.name : "",
                    hasClip = mask != null, clip = mask ? ScreenBounds(mask.rectTransform) : default(Rect),
                    text = displayedText ? text.text : "", style = text ? text.fontStyle.ToString() : "",
                    fontCssSize = displayedText ? text.fontSize / shopUnitsY : 0,
                    preferredWidthCss = displayedText ? text.preferredWidth / shopUnitsY : 0, preferredHeightCss = displayedText ? text.preferredHeight / shopUnitsY : 0 };
                if (text == readouts["ElapsedTime"]) timerObservation = observation;
                graphics.Add(observation);
            }
            var layout = new LayoutState { phase = loop.Phase, coordinates = "top-left", width = Screen.width, height = Screen.height,
                pixelRatio = PreferredPixelRatio(), controls = ObserveControls(actions,"Core"), shopControls = ObserveControls(shopActions,shopMode.ToString()),
                graphics = graphics.ToArray(), selection = EventSystem.current?.currentSelectedGameObject?.name ?? "",
                scrollOffset = shopScrollOffset, maximumScrollOffset = shopMaximumScroll };
            string timerText = timerObservation?.text;
            if (timerObservation != null) timerObservation.text = "";
            string key = JsonUtility.ToJson(layout);
            if (timerObservation != null) timerObservation.text = timerText;
            if (key == previousLayout) return; previousLayout = key;
            string message = "ST_LS_HUD_LAYOUT " + JsonUtility.ToJson(layout);
#if UNITY_WEBGL && !UNITY_EDITOR
            // Unity's Debug.Log truncates large WebGL messages. Its existing
            // JS bridge preserves the full measured layout for strict readers.
            JS_Log_Dump(message, (int)LogType.Log);
#else
            Debug.Log(message);
#endif
        }
        public void Dispose()
        {
            if (observedSession) observedSession.Stepped -= ObserveCombat;
            if (Application.isPlaying)
            {
                if (root) UnityEngine.Object.Destroy(root.gameObject);
                UnityEngine.Object.Destroy(metalSurface); UnityEngine.Object.Destroy(metalGrain);
            }
            else
            {
                if (root) UnityEngine.Object.DestroyImmediate(root.gameObject);
                UnityEngine.Object.DestroyImmediate(metalSurface); UnityEngine.Object.DestroyImmediate(metalGrain);
            }
        }
    }
    // A bounded, non-interactive material layer under the live Unity labels.
    // Bevels, worn brass, recessed readings and captive screws share one mesh
    // treatment. Meshes rebuild on dimensions/state changes, not every frame.
    sealed class LastStandConsoleFrame : MaskableGraphic
    {
        bool action, primary, available = true, highlighted, pressed, instruments;
        Texture2D surface;
        Rect hull, timer, disabled;
        static readonly Color Metal = new Color(.22f,.245f,.225f,1);
        static readonly Color Rim = new Color(.43f,.35f,.22f,1);
        static readonly Color EdgeLight = new Color(.67f,.56f,.37f,1);
        static readonly Color EdgeDark = new Color(.028f,.034f,.032f,1);
        static readonly Color Well = new Color(.044f,.058f,.056f,1);
        public override Texture mainTexture { get { return surface ? surface : Texture2D.whiteTexture; } }
        public void Initialize(bool isAction, Texture2D material)
        { action = isAction; surface = material; raycastTarget = false; SetVerticesDirty(); SetMaterialDirty(); }
        public void SetAction(bool isPrimary, bool isAvailable)
        {
            if (primary == isPrimary && available == isAvailable) return;
            primary = isPrimary; available = isAvailable; SetVerticesDirty();
        }
        public void SetInteraction(bool isHighlighted, bool isPressed)
        {
            if (highlighted == isHighlighted && pressed == isPressed) return;
            highlighted = isHighlighted; pressed = isPressed; SetVerticesDirty();
        }
        public void SetInstruments(bool show, Rect hullBounds, Rect timerBounds, Rect disabledBounds)
        {
            if (instruments == show && hull == hullBounds && timer == timerBounds && disabled == disabledBounds) return;
            instruments = show; hull = hullBounds; timer = timerBounds; disabled = disabledBounds; SetVerticesDirty();
        }
        static Rect Inset(Rect r, float value)
        { return new Rect(r.x + value,r.y + value,Mathf.Max(0,r.width-2*value),Mathf.Max(0,r.height-2*value)); }
        static Rect Inset(Rect r, float x, float y)
        { return new Rect(r.x+x,r.y+y,Mathf.Max(0,r.width-2*x),Mathf.Max(0,r.height-2*y)); }
        static Vector2 Corner(Rect r, int point, float cut)
        {
            switch (point & 7)
            {
                case 0: return new Vector2(r.xMin+cut,r.yMax);
                case 1: return new Vector2(r.xMax-cut,r.yMax);
                case 2: return new Vector2(r.xMax,r.yMax-cut);
                case 3: return new Vector2(r.xMax,r.yMin+cut);
                case 4: return new Vector2(r.xMax-cut,r.yMin);
                case 5: return new Vector2(r.xMin+cut,r.yMin);
                case 6: return new Vector2(r.xMin,r.yMin+cut);
                default: return new Vector2(r.xMin,r.yMax-cut);
            }
        }
        static void Quad(VertexHelper mesh, Vector2 a, Vector2 b, Vector2 c, Vector2 d, Color color)
        {
            int start = mesh.currentVertCount;
            mesh.AddVert(a,color,a/96); mesh.AddVert(b,color,b/96);
            mesh.AddVert(c,color,c/96); mesh.AddVert(d,color,d/96);
            mesh.AddTriangle(start,start+1,start+2); mesh.AddTriangle(start+2,start+3,start);
        }
        static void Box(VertexHelper mesh, Rect r, Color color)
        { Quad(mesh,new Vector2(r.xMin,r.yMax),new Vector2(r.xMax,r.yMax),new Vector2(r.xMax,r.yMin),new Vector2(r.xMin,r.yMin),color); }
        static void Face(VertexHelper mesh, Rect r, float cut, Color top, Color bottom)
        {
            int start = mesh.currentVertCount; var center = r.center;
            mesh.AddVert(center,Color.Lerp(bottom,top,.5f),center/96);
            for (int i = 0; i <= 8; i++)
            {
                var point = Corner(r,i,cut);
                mesh.AddVert(point,Color.Lerp(bottom,top,(point.y-r.yMin)/r.height),point/96);
                if (i > 0) mesh.AddTriangle(start,start+i,start+i+1);
            }
        }
        static void Ring(VertexHelper mesh, Rect outer, float width, float cut, Color top, Color bottom)
        {
            var inner = Inset(outer,width); float innerCut = Mathf.Max(0,cut-width);
            for (int i = 0; i < 8; i++)
                Quad(mesh,Corner(outer,i,cut),Corner(outer,i+1,cut),Corner(inner,i+1,innerCut),Corner(inner,i,innerCut),
                    i == 0 || i == 6 || i == 7 ? top : bottom);
        }
        static void KeyBevel(VertexHelper mesh, Rect r, float x, float y, float cut, Color top, Color bottom)
        {
            var inner = Inset(r,x,y);
            for (int i = 0; i < 8; i++)
                Quad(mesh,Corner(r,i,cut),Corner(r,i+1,cut),Corner(inner,i+1,Mathf.Max(0,cut-x)),Corner(inner,i,Mathf.Max(0,cut-x)),
                    i == 0 || i == 6 || i == 7 ? top : bottom);
        }
        static void Screw(VertexHelper mesh, Vector2 center, Color light, Color dark, float radius = 2.5f)
        {
            const int sides = 12;
            int start = mesh.currentVertCount; mesh.AddVert(center,dark,center/96);
            for (int i = 0; i <= sides; i++)
            {
                float angle = i * Mathf.PI * 2 / sides;
                var point = center + new Vector2(Mathf.Cos(angle),Mathf.Sin(angle))*radius;
                mesh.AddVert(point,i < sides/2 ? light : dark,point/96);
                if (i > 0) mesh.AddTriangle(start,start+i,start+i+1);
            }
            Box(mesh,new Rect(center.x-radius*.8f,center.y-.4f,radius*1.6f,.8f),EdgeDark);
        }
        void Instrument(VertexHelper mesh, Rect parent, Rect bounds)
        {
            var r = new Rect(parent.xMin+bounds.x,parent.yMax-bounds.y-bounds.height,bounds.width,bounds.height);
            Face(mesh,r,4,new Color(.082f,.097f,.089f,1),Well);
            Ring(mesh,r,.75f,4,Rim,EdgeDark);
            Ring(mesh,Inset(r,.75f),2.25f,3.25f,EdgeDark,Metal);
            // The recess occupies the existing four-pixel instrument margin.
            Ring(mesh,Inset(r,3),.5f,.5f,EdgeDark,new Color(.32f,.29f,.20f,1));
        }
        protected override void OnPopulateMesh(VertexHelper mesh)
        {
            mesh.Clear(); Rect r = rectTransform.rect; if (r.width < 14 || r.height < 14) return;
            Color rim = !available ? Metal : Rim;
            Color light = !available ? Metal : highlighted ? new Color(.81f,.69f,.45f,1) : EdgeLight;
            float cut = action ? 6 : 9;
            if (!action && r.height <= 52)
            {
                // The short-height layout reserves only two CSS pixels of
                // padding. Its material rim must stay out of the live glyphs.
                Ring(mesh,r,1,2,light,EdgeDark); return;
            }
            if (!action)
            {
                Face(mesh,r,cut,new Color(.14f,.16f,.155f,1),new Color(.065f,.080f,.075f,1));
                Ring(mesh,r,1,cut,EdgeDark,EdgeDark);
                Ring(mesh,Inset(r,1),1,cut-1,light,EdgeDark);
                Ring(mesh,Inset(r,2),3,cut-2,rim,new Color(.16f,.13f,.085f,1));
                Ring(mesh,Inset(r,5),1,cut-5,EdgeDark,Metal);
                // Stable scuffs in the metal, contained beneath the text. The
                // mesh uses no RNG, clock, gameplay input or external asset.
                for (int i = 0; i < 8; i++)
                {
                    float x = r.xMin + 10 + ((i * 47) % 101) / 101f * (r.width-30);
                    float y = i % 2 == 0 ? r.yMax-3.5f : r.yMin+3;
                    Box(mesh,new Rect(x,y,Mathf.Min(9,r.xMax-x-10),.5f),new Color(.72f,.61f,.39f,.22f));
                }
                Screw(mesh,new Vector2(r.xMin+4.5f,r.yMax-4.5f),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMax-4.5f,r.yMax-4.5f),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMin+4.5f,r.yMin+4.5f),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMax-4.5f,r.yMin+4.5f),light,EdgeDark);
            }
            else
            {
                Color top = !available ? new Color(.17f,.19f,.155f,1) : primary ? new Color(.82f,.67f,.41f,1) : new Color(.23f,.265f,.22f,1);
                Color bottom = !available ? new Color(.10f,.12f,.095f,1) : primary ? new Color(.71f,.55f,.31f,1) : new Color(.115f,.145f,.12f,1);
                Face(mesh,r,cut,pressed ? bottom : top,pressed ? top : bottom);
                // Wider side bevels and narrow top/bottom lips stay inside the
                // unchanged eight-by-two action padding. Press reverses relief.
                KeyBevel(mesh,r,1,.5f,cut,EdgeDark,EdgeDark);
                KeyBevel(mesh,Inset(r,1,.5f),4,1,cut-1,pressed ? EdgeDark : light,pressed ? light : EdgeDark);
                KeyBevel(mesh,Inset(r,5,1.5f),1,.5f,1,pressed ? rim : EdgeDark,pressed ? EdgeDark : rim);
                Screw(mesh,new Vector2(r.xMin+3.5f,r.center.y),light,EdgeDark,1.3f);
                Screw(mesh,new Vector2(r.xMax-3.5f,r.center.y),light,EdgeDark,1.3f);
            }
            if (instruments) { Instrument(mesh,r,hull); Instrument(mesh,r,timer); Instrument(mesh,r,disabled); }
        }
    }
    // The dedicated Canvas has one transient focus owner. Availability and
    // visual order come from the actual Buttons after the shared layout; only
    // the existing StandaloneInputModule submits their original callbacks.
    public sealed class LastStandHudKeyboard : MonoBehaviour
    {
        Button[] actions;
        GameObject priorSelection;
        bool phaseChanged;
        Action<Button> revealSelection;
        readonly List<Button> ordered = new List<Button>();
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void JS_Eval_EvalJS(string script);
#endif
        public void Initialize(Button[] controls, Action<Button> reveal = null)
        { actions = controls; revealSelection = reveal; }
        public void Focus(Button button)
        {
            if (EventSystem.current && button && button.IsActive() && button.IsInteractable())
                EventSystem.current.SetSelectedGameObject(button.gameObject);
        }
        public void Selected(Button button)
        { if (button && button.IsActive() && button.IsInteractable()) revealSelection?.Invoke(button); }
        Vector3 LayoutPosition(Button button)
        {
            var point = transform.InverseTransformPoint(button.transform.position);
            var scroll = button.GetComponentInParent<ScrollRect>();
            if (scroll && button.transform.IsChildOf(scroll.content))
                // Native scrolling reveals a selected card without changing
                // the shared Canvas traversal halfway through Tab.
                point -= transform.InverseTransformVector(scroll.content.parent.TransformVector(
                    new Vector3(0,scroll.content.anchoredPosition.y,0)));
            return point;
        }
        public void BeforeRefresh(bool changed)
        {
            priorSelection = null; phaseChanged = changed; var events = EventSystem.current; if (!events) return;
            foreach (var button in actions) if (events.currentSelectedGameObject == button.gameObject)
            { priorSelection = button.gameObject; break; }
        }
        public void Refresh()
        {
            ordered.Clear();
            foreach (var button in actions)
            {
                button.navigation = new Navigation { mode = Navigation.Mode.None };
                if (button.IsActive() && button.IsInteractable()) ordered.Add(button);
            }
            ordered.Sort((a,b) =>
            {
                var x = LayoutPosition(a); var y = LayoutPosition(b);
                return Mathf.Abs(x.y-y.y) > .01f ? y.y.CompareTo(x.y) : x.x.CompareTo(y.x);
            });
            for (int i = 0; i < ordered.Count; i++)
            {
                var previous = ordered[Math.Max(0,i-1)]; var next = ordered[Math.Min(ordered.Count-1,i+1)];
                ordered[i].navigation = new Navigation { mode = Navigation.Mode.Explicit,
                    selectOnUp = previous, selectOnLeft = previous, selectOnDown = next, selectOnRight = next };
            }
            var events = EventSystem.current; var prior = priorSelection; priorSelection = null;
            if (!events) return;
            if (prior)
            {
                bool current = ordered.Exists(button=>button.gameObject == prior);
                if (phaseChanged || !current)
                    events.SetSelectedGameObject(ordered.Count > 0 ? ordered[0].gameObject : null);
                else if (!events.currentSelectedGameObject) events.SetSelectedGameObject(prior);
            }
            phaseChanged = false;
            if (!events.currentSelectedGameObject) return;
            foreach (var button in actions)
                if (events.currentSelectedGameObject == button.gameObject && !ordered.Contains(button))
                { events.SetSelectedGameObject(ordered.Count > 0 ? ordered[0].gameObject : null); break; }
        }
        [UnityEngine.Scripting.Preserve] // WebGL shell calls this by SendMessage name.
        public void NavigateKeyboard(string direction)
        {
            var events = EventSystem.current; if (!events || actions == null) return;
            Refresh();
            if (direction == "leave") { events.SetSelectedGameObject(null); return; }
            int index = ordered.FindIndex(button => button.gameObject == events.currentSelectedGameObject);
            bool backwards = direction == "previous" || direction == "enter-last";
            int next = direction == "enter-first" ? 0 : direction == "enter-last" ? ordered.Count-1 :
                index < 0 ? backwards ? ordered.Count-1 : 0 : index + (backwards ? -1 : 1);
            if (next >= 0 && next < ordered.Count) { events.SetSelectedGameObject(ordered[next].gameObject); return; }
            events.SetSelectedGameObject(null);
#if UNITY_WEBGL && !UNITY_EDITOR
            // Constant DOM focus notification only. No player/state input is
            // interpolated and native Return keeps its existing href/action.
            JS_Eval_EvalJS("window.dispatchEvent(new Event('st-last-stand-keyboard-exit'));");
#endif
        }
        void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            // WebGL Tab is delivered once by the native navigation shell.
            if (Input.GetKeyDown(KeyCode.Tab)) NavigateKeyboard(Input.GetKey(KeyCode.LeftShift) ||
                Input.GetKey(KeyCode.RightShift) ? "previous" : "next");
#endif
        }
    }
    // One action-state treatment. Stroke and type accompany color for pointer
    // and selected/pressed feedback; disabled availability stays owner-derived.
    sealed class LastStandActionFeedback : MonoBehaviour, ISelectHandler, IDeselectHandler,
        IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler, ISubmitHandler
    {
        Button button;
        Text label;
        Outline outline;
        LastStandConsoleFrame frame;
        bool selected, hovered, pressed;
        float submitUntil = -1;
        public void Initialize(Button owner, Text text, Outline stroke, LastStandConsoleFrame material)
        { button = owner; label = text; outline = stroke; frame = material; }
        public void Refresh()
        {
            if (!button || !label || !outline) return;
            bool available = button.IsInteractable();
            outline.enabled = available && (selected || hovered || pressed);
            label.fontStyle = !available ? FontStyle.Italic : pressed ? FontStyle.BoldAndItalic :
                selected || hovered ? FontStyle.Bold : FontStyle.Normal;
            if (frame) frame.SetInteraction(available && (selected || hovered),available && pressed);
        }
        void OnDisable() { selected = hovered = pressed = false; submitUntil = -1; Refresh(); }
        void Update()
        { if (submitUntil >= 0 && Time.unscaledTime >= submitUntil) { submitUntil = -1; pressed = false; Refresh(); } }
        public void OnSubmit(BaseEventData value)
        {
            if (!button.IsActive() || !button.IsInteractable()) return;
            // Passive feedback only; Button/StandaloneInputModule keep the
            // sole Submit callback and its existing supported input bindings.
            pressed = true; submitUntil = Time.unscaledTime + button.colors.fadeDuration; Refresh();
        }
        public void OnSelect(BaseEventData value)
        {
            selected = true; Refresh();
            GetComponentInParent<LastStandHudKeyboard>()?.Selected(button);
        }
        public void OnDeselect(BaseEventData value) { selected = pressed = false; submitUntil = -1; Refresh(); }
        public void OnPointerEnter(PointerEventData value) { hovered = true; Refresh(); }
        public void OnPointerExit(PointerEventData value) { hovered = pressed = false; Refresh(); }
        public void OnPointerDown(PointerEventData value)
        { if (value.button == PointerEventData.InputButton.Left) { pressed = true; Refresh(); } }
        public void OnPointerUp(PointerEventData value) { pressed = false; Refresh(); }
    }
}

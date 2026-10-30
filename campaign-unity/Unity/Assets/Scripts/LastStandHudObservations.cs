using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandHudObservations
    {
        readonly LastStandLoopController loop;
        readonly RectTransform root;
        readonly LastStandShopHud shop;
        readonly LastStandModalHost modals;
        readonly LastStandGarageView garage;
        readonly LastStandCombatHud combat;
        readonly Button[] coreActions;
        readonly EncounterSession observedSession;
        string previousShopState,previousLayout;
        int lastEffectRunId,lastEffectTick=-1;
        LastStandShopView shopView=>shop.View;
        LastStandShopMode shopMode=>shop.Mode;
        LastStandUpgradeCategory shopCategory=>shop.Category;
        bool shopOpen=>shop.IsOpen;
        float shopScrollOffset=>shop.ScrollOffset;
        float shopMaximumScroll=>shop.MaximumScroll;
        float shopUnitsY=>shop.UnitsY;
        LastStandShopHud.ShopCardControls[] shopCards=>shop.Cards;
        Button[] shopActions=>shop.Buttons;
        Button shopClose=>shop.Close;
        Button shopQuantity=>shop.Quantity;
        Button menu=>modals.Menu;
        Button waveInfo=>combat.WaveInfo;
        Dictionary<string,Text> readouts=>combat.Readouts;
        Button tierPrevious=>garage.TierPrevious;
        Button tierNext=>garage.TierNext;
        Button fittingPrevious=>garage.FittingPrevious;
        Button fittingNext=>garage.FittingNext;
        LastStandFittingCallout fittingCallout=>garage.Callout;
        LastStandSettingsHud settings=>modals.Settings;
        LastStandResearchHud research=>modals.Research;
        LastStandRunHistoryHud history=>modals.History;
        LastStandPlannerHud planner=>modals.Planner;
        bool CanOpenRunShop()=>shop.CanOpenRunShop();
        bool CanOpenPermanentShop()=>shop.CanOpenPermanentShop();
        static float PreferredPixelRatio()=>LastStandHudDisplay.PreferredPixelRatio();
        public LastStandHudObservations(LastStandLoopController loop,RectTransform root,LastStandShopHud shop,LastStandModalHost modals,
            LastStandGarageView garage,LastStandCombatHud combat,Button[] coreActions)
        {this.loop=loop;this.root=root;this.shop=shop;this.modals=modals;this.garage=garage;this.combat=combat;this.coreActions=coreActions;
         observedSession=loop.Session;observedSession.Stepped+=ObserveCombat;}
        [Serializable] sealed class ModelObservation
        {
            public int hull,maximumHull,cannonDamage,launcherDamage,scattergunDamage,mortarDamage,railgunDamage,cannonPeriod,repairAmount;
        }
        static ModelObservation ObserveModel(EncounterModel model) => model == null ? null : new ModelObservation {
            hull = model.Hull, maximumHull = model.CurrentMaximumHull, cannonDamage = model.CurrentCannonDamage,
            launcherDamage = model.CurrentLauncherDamage,scattergunDamage=model.CurrentScattergunDamage,
            mortarDamage=model.CurrentMortarDamage,railgunDamage=model.CurrentRailgunDamage,
            cannonPeriod = model.CurrentCannonPeriod, repairAmount = model.CurrentRepairAmount };
        [Serializable] sealed class CardObservation
        {
            public string key,category,currentEffect,nextEffect,price,refusal,reason;
            public int trackId,p,n,level,cap,nextPrice,purchaseQuantity,quotedCost,resultLevel;
            public string resultEffect;
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
        public void ReportShopState()
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
                purchaseQuantity=cardView.PurchaseQuantity,quotedCost=cardView.QuotedCost,resultLevel=cardView.ResultLevel,
                resultEffect=cardView.ResultEffectDescription,
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
        public void ObservePurchase(int activation, LastStandShopPurchaseIntent intent, LastStandShopPurchaseResult result)
        {
            if (!Application.isPlaying) return;
            Debug.Log("ST_LS_SHOP_PURCHASE " + JsonUtility.ToJson(new PurchaseObservation { mode = "Run",
                actionId = "ShopCard_" + LastStandUpgradeCatalog.Get(intent.TrackId).Key + "Buy", activationId = activation,
                intentRunId = intent.RunId, intentVersion = intent.Version, intentTrackId = (int)intent.TrackId,
                accepted = result.Accepted, refusal = result.Refusal.ToString(), resultVersion = result.Version,
                chargedScrap = result.ChargedScrap, tick = loop.Session?.Model?.Tick ?? -1, model = ObserveModel(loop.Session?.Model) }));
        }
        [Serializable] sealed class EventObservation { public string kind; public int slot,aimSlot,amount,rawHit; public bool killed; }
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
                events[i] = new EventObservation { kind = actual.Kind.ToString(), slot = actual.Slot, aimSlot=actual.AimSlot,amount = actual.Amount,
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
            public string schema="singedterra-last-stand-observation/v3";
            public string phase,coordinates,selection;
            public int width,height; public float pixelRatio,scrollOffset,maximumScrollOffset;
            public float settingsScrollOffset,settingsMaximumScrollOffset;
            public Control[] controls,shopControls,settingsControls,researchControls,historyControls,plannerControls; public GraphicObservation[] graphics;
            public float researchScrollOffset,researchMaximumScrollOffset,historyScrollOffset,historyMaximumScrollOffset;
            public float researchListScrollOffset,researchListMaximumScrollOffset,researchDetailScrollOffset,researchDetailMaximumScrollOffset;
            public float plannerScrollOffset,plannerMaximumScrollOffset;
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
                string label = button==waveInfo ? readouts["ElapsedTime"].text : button.GetComponentInChildren<Text>(true)?.text ?? "";
                controls[i] = new Control { name = button.name, label = label, accessibleLabel = button == shopClose ? "Close" : button==menu ? "Menu" :
                    button==tierPrevious?"Previous tier":button==tierNext?"Next tier":button==fittingPrevious?"Previous fitting":button==fittingNext?"Next fitting":
                    button==shopQuantity?"Purchase quantity "+loop.ShopQuantity+". Cycle 1, 10, 100 or Max":
                    button==waveInfo?"Current wave enemy stats. "+label:PlanningControlLabel(button.name,label),
                    mode = mode, trackKey = track, x = bounds.x, y = bounds.y, width = bounds.width, height = bounds.height,
                    active = button.gameObject.activeInHierarchy, interactable = button.IsInteractable() };
            }
            return controls;
        }
        static string PlanningControlLabel(string name,string fallback)
        {
            switch(name)
            {
                case "PlannerPrevious":return "Previous progression goal";
                case "PlannerNext":return "Next progression goal";
                case "PlannerWorkshopPrevious":return "Previous Workshop alternative";
                case "PlannerWorkshopNext":return "Next Workshop alternative";
                case "PlannerResearchPrevious":return "Previous Research alternative";
                case "PlannerResearchNext":return "Next Research alternative";
                case "RunHistoryConditionPrevious":return "Previous farming conditions";
                case "RunHistoryConditionNext":return "Next farming conditions";
                case "RunHistoryRunAPrevious":return "Previous run A";
                case "RunHistoryRunANext":return "Next run A";
                case "RunHistoryRunBPrevious":return "Previous run B";
                case "RunHistoryRunBNext":return "Next run B";
                default:return fallback;
            }
        }
        // Read-only capture is shared by runtime emission and the Editor contract
        // check; it cannot issue a purchase, advance a clock, or write storage.
        LayoutState CaptureLayoutSnapshot(out GraphicObservation timerObservation)
        {
            Canvas.ForceUpdateCanvases();
            var graphics = new List<GraphicObservation>(); timerObservation = null;
            foreach (var graphic in root.GetComponentsInChildren<Graphic>(true))
            {
                if(fittingCallout.DecorationRoot && graphic.transform.IsChildOf(fittingCallout.DecorationRoot))continue;
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
                pixelRatio = PreferredPixelRatio(), controls = ObserveControls(coreActions,"Core"), shopControls = ObserveControls(shopActions,shopMode.ToString()),
                settingsControls = ObserveControls(settings.Buttons,"Settings"),
                researchControls=ObserveControls(research.Buttons,"Research"),historyControls=ObserveControls(history.Buttons,"History"),
                plannerControls=ObserveControls(planner.Buttons,"Planner"),
                graphics = graphics.ToArray(), selection = EventSystem.current?.currentSelectedGameObject?.name ?? "",
                scrollOffset = shopScrollOffset, maximumScrollOffset = shopMaximumScroll };
            layout.settingsScrollOffset = settings.ScrollOffset;
            layout.settingsMaximumScrollOffset = settings.MaximumScrollOffset;
            layout.researchScrollOffset=research.ScrollOffset;layout.researchMaximumScrollOffset=research.MaximumScrollOffset;
            layout.researchListScrollOffset=research.ListScrollOffset;layout.researchListMaximumScrollOffset=research.ListMaximumScrollOffset;
            layout.researchDetailScrollOffset=research.DetailScrollOffset;layout.researchDetailMaximumScrollOffset=research.DetailMaximumScrollOffset;
            layout.historyScrollOffset=history.ScrollOffset;layout.historyMaximumScrollOffset=history.MaximumScrollOffset;
            layout.plannerScrollOffset=planner.ScrollOffset;layout.plannerMaximumScrollOffset=planner.MaximumScrollOffset;
            return layout;
        }
        public void ReportLayout()
        {
            if (!Application.isPlaying) return;
            var layout=CaptureLayoutSnapshot(out var timerObservation);
            string timerText = timerObservation?.text;
            if (timerObservation != null) timerObservation.text = "";
            string key = JsonUtility.ToJson(layout);
            if (timerObservation != null) timerObservation.text = timerText;
            if (key == previousLayout) return; previousLayout = key;
            string message = "ST_LS_HUD_LAYOUT " + JsonUtility.ToJson(layout);
#if UNITY_WEBGL && !UNITY_EDITOR
            // Unity's Debug.Log truncates large WebGL messages. Its existing
            // JS bridge preserves the full measured layout for strict readers.
            LastStandHudDisplay.WriteDiagnostic(message);
#else
            Debug.Log(message);
#endif
        }
        public void Dispose(){if(observedSession)observedSession.Stepped-=ObserveCombat;}
    }
    internal static class LastStandHudDisplay
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        // Existing Unity Web SystemInfo import; no new JS/state/Canvas owner.
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern double JS_SystemInfo_GetPreferredDevicePixelRatio();
        [System.Runtime.InteropServices.DllImport("__Internal")]
        static extern void JS_Log_Dump(string message, int type);
#endif
        public static float PreferredPixelRatio()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            double ratio = JS_SystemInfo_GetPreferredDevicePixelRatio();
            if (!double.IsNaN(ratio) && !double.IsInfinity(ratio) && ratio > 0) return (float)ratio;
#endif
            return 1;
        }
        public static void WriteDiagnostic(string message)
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            JS_Log_Dump(message,(int)LogType.Log);
#else
            Debug.Log(message);
#endif
        }
    }
}

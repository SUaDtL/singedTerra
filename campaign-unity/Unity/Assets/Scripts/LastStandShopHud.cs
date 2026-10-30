using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandShopHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandHudElements elements;
        readonly Action refresh,layout;
        readonly Action<Button> focus;
        readonly Action<string,string> summary;
        readonly Action<int,LastStandShopPurchaseIntent,LastStandShopPurchaseResult> observePurchase;
        readonly Dictionary<string,RectTransform> nodes;
        public readonly Button Entry,Close,Quantity;
        public readonly Button[] Tabs,Buttons;
        public readonly ShopCardControls[] Cards;
        public readonly RectTransform Panel,Viewport,Content;
        readonly ScrollRect shopScroll;
        readonly Text shopHeading,shopCurrency;
        long shopProfileRevision;
        LastStandShopView shopView;
        LastStandShopMode shopMode;
        LastStandUpgradeCategory shopCategory=LastStandUpgradeCategory.Attack;
        bool shopOpen,layingOut;
        int shopRunId,purchaseActivation;
        float shopScrollOffset,shopMaximumScroll,shopUnitsY=1;
        string purchaseFeedback;LastStandUpgradeTrackId feedbackTrack;
        public bool IsOpen=>shopOpen;
        public LastStandShopView View=>shopView;
        public LastStandShopMode Mode=>shopMode;
        public LastStandUpgradeCategory Category=>shopCategory;
        public float ScrollOffset=>shopScrollOffset;
        public float MaximumScroll=>shopMaximumScroll;
        public float UnitsY=>shopUnitsY;
        static readonly Color Ink=LastStandUiPrimitives.Ink,Brass=LastStandUiPrimitives.Brass,DisabledPaper=LastStandUiPrimitives.DisabledPaper;
        static RectTransform Node(string name,Transform parent)=>LastStandUiPrimitives.Node(name,parent);
        Text Label(string name,Transform parent,int size)=>elements.Label(name,parent,size);
        Button Action(string name,string label,Transform parent,UnityEngine.Events.UnityAction handler)=>elements.Action(name,label,parent,handler);
        RectTransform MakePanel(string name,Transform parent,bool blocksPointer=false,bool framed=true)=>elements.Panel(name,parent,blocksPointer,framed);
        static void StyleAction(Button button,bool primary,bool available)=>LastStandUiPrimitives.Style(button,available,primary);
        // Controls retain only immutable identities and transient presentation.
        // The same ordinary card surface can bind the later permanent view.
        internal sealed class ShopCardControls
        {
            public LastStandUpgradeTrackId TrackId;
            public string Key;
            public Text Title, Levels, Current, Next, Price, Refusal;
            public Button Buy;
        }
        ShopCardControls CreateShopCard(LastStandUpgradeDefinition definition)
        {
            string id = "ShopCard_" + definition.Key; var panel = MakePanel(id,Content,false,false);
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
        public LastStandShopHud(LastStandLoopController loop,RectTransform root,LastStandHudElements elements,
            Action refresh,Action layout,Action<Button> focus,Action<string,string> summary,
            Action<int,LastStandShopPurchaseIntent,LastStandShopPurchaseResult> observePurchase)
        {
            this.loop=loop;this.elements=elements;nodes=elements.Nodes;this.refresh=refresh;this.layout=layout;
            this.focus=focus;this.summary=summary;this.observePurchase=observePurchase;
            Entry = Action("ShopEntry","MECHANICS SHOP",root,OpenShop);
            Panel = MakePanel("ShopPanel",root,true);
            shopHeading = Label("ShopHeading",Panel,16); shopHeading.text = "MECHANICS SHOP";
            shopHeading.color = Brass; shopHeading.fontStyle = FontStyle.Bold;
            shopCurrency = Label("ShopCurrency",Panel,14); shopCurrency.color = Brass;
            Close = Action("ShopClose","\u00d7",Panel,CloseShop);
            Quantity=Action("ShopQuantity","[1]   10\n100   MAX",Panel,loop.CycleShopQuantity);
            Tabs = new[] {
                Action("ShopTabAttack","ATTACK",Panel,() => SelectCategory(LastStandUpgradeCategory.Attack)),
                Action("ShopTabDefense","DEFENSE",Panel,() => SelectCategory(LastStandUpgradeCategory.Defense)),
                Action("ShopTabUtility","UTILITY",Panel,() => SelectCategory(LastStandUpgradeCategory.Utility)) };
            Viewport = Node("ShopViewport",Panel); nodes.Add(Viewport.name,Viewport);
            Viewport.gameObject.AddComponent<Image>().color = Ink;
            Viewport.gameObject.AddComponent<RectMask2D>();
            Content = Node("ShopContent",Viewport); nodes.Add(Content.name,Content);
            shopScroll = Panel.gameObject.AddComponent<ScrollRect>();
            shopScroll.viewport = Viewport; shopScroll.content = Content;
            shopScroll.horizontal = false; shopScroll.vertical = true; shopScroll.inertia = false;
            shopScroll.movementType = ScrollRect.MovementType.Clamped;
            shopScroll.onValueChanged.AddListener(OnShopScrolled);
            Cards = new ShopCardControls[LastStandUpgradeCatalog.Tracks.Count];
            for (int i=0;i<Cards.Length;i++) Cards[i] = CreateShopCard(LastStandUpgradeCatalog.Tracks[i]);
            var extra = new List<Button> { Entry, Close,Quantity }; extra.AddRange(Tabs);
            foreach (var controls in Cards) extra.Add(controls.Buy);
            Buttons = extra.ToArray();
        }
        public bool CanOpenRunShop()
        {
            var model = loop.Session?.Model; var shop = loop.Shop;
            return loop.Phase == "battle" && model != null && model.Status == EncounterStatus.Running &&
                shop != null && shop.FinalAccounting == null;
        }
        public bool CanOpenPermanentShop()
        {
            var progress = loop.Progression;
            return (loop.Phase == "garage" || loop.Phase == "workshop") && loop.Session?.Model == null &&
                progress != null && progress.PendingDefeat == null;
        }
        public void OpenPermanentFromPlanner()
        {
            if(loop.MenuOpen||!CanOpenPermanentShop())return;
            if(shopOpen){shopMode=LastStandShopMode.Permanent;SetShopScrollOffset(0);refresh();return;}
            OpenShop();
        }
        void OpenShop()
        {
            if (shopOpen) { CloseShop(); return; }
            bool run = CanOpenRunShop();
            if (!run && !CanOpenPermanentShop()) return;
            if(!run)loop.RestoreGaragePreview();
            shopMode = run ? LastStandShopMode.Run : LastStandShopMode.Permanent;
            shopOpen = true; shopRunId = run ? loop.Shop.RunId : 0; SetShopScrollOffset(0); purchaseFeedback = null;
            refresh();
        }
        void CloseShop()
        {
            shopOpen = false; shopRunId = 0; SetShopScrollOffset(0); purchaseFeedback = null; refresh();
            focus(Entry);
        }
        void SelectCategory(LastStandUpgradeCategory category)
        {
            if (!shopOpen) return;
            shopCategory = category; SetShopScrollOffset(0); purchaseFeedback = null; refresh();
        }
        void PurchaseRunTrack(LastStandUpgradeTrackId track)
        {
            if (shopOpen && shopMode == LastStandShopMode.Permanent)
            {
                if (!CanOpenPermanentShop()) return;
                if(shopView==null)return;
                loop.TryPurchasePermanent(track,shopView.Quantity,shopProfileRevision); refresh(); return;
            }
            var shop = loop.Shop;
            if (!shopOpen || shop == null || shop.RunId != shopRunId) return;
            // Submit the displayed revision and selected quantity. A delayed
            // click must not silently recompute a different Max purchase.
            if(shopView==null)return;
            var intent = new LastStandShopPurchaseIntent(shopView.RunId,shopView.Version,track,shopView.Quantity);
            int activation = ++purchaseActivation;
            var result = loop.TryPurchaseTemporary(intent);
            observePurchase?.Invoke(activation,intent,result);
            if (shopOpen && loop.Shop == shop)
            {
                feedbackTrack = track;
                purchaseFeedback = result.Accepted ? null : DescribePurchaseRefusal(result.Refusal);
            }
            refresh();
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
        public void ReconcileSession()
        {
            bool run = CanOpenRunShop(), permanent = CanOpenPermanentShop(); var owner = loop.Shop;
            bool active = run || permanent;
            var mode = run ? LastStandShopMode.Run : LastStandShopMode.Permanent;
            if (!active || shopOpen && (mode != shopMode || run && owner.RunId != shopRunId))
            { shopOpen = false; shopRunId = 0; SetShopScrollOffset(0); purchaseFeedback = null; }
            shopMode = mode;
        }
        public void Refresh()
        {
            bool run = CanOpenRunShop(), permanent = CanOpenPermanentShop(); var owner = loop.Shop;
            bool active = run || permanent;
            var fitting = LastStandFittingCatalog.Parse(loop.FittingId);
            shopView = run ? LastStandShopPresentation.ProjectRun(owner,loop.ShopQuantity) : permanent ?
                LastStandShopPresentation.ProjectPermanent(loop.Progression,fitting,loop.ShopQuantity) : null;
            shopProfileRevision=loop.Progression.Revision;
            Entry.gameObject.SetActive(active); StyleAction(Entry,false,active);
            Entry.GetComponentInChildren<Text>(true).text = shopOpen ? "CLOSE SHOP" : run ? "SHOP" : "MECHANICS SHOP";
            StyleAction(Close,false,shopOpen);
            StyleAction(Quantity,false,shopOpen);
            Quantity.GetComponentInChildren<Text>(true).text=QuantityLabel(loop.ShopQuantity);
            shopHeading.text = run ? "THIS RUN" : loop.Progression.HasCheckpoint?"NEXT DEPLOY":"PERMANENT";
            shopCurrency.text = (run ? "SCRAP  " : "SALVAGE  ") + (shopView?.Balance ?? 0);
            if (shopOpen && permanent)
            {
                summary("TIER "+loop.Progression.SelectedTier+" / PERMANENT UPGRADES",
                    LastStandTierHudText.WaveBest(loop.Progression.GetBestWave(loop.Progression.SelectedTier))+"\n"+
                    LastStandTierHudText.NextMilestone(loop.Progression.SelectedTier,loop.Progression.GetBestWave(loop.Progression.SelectedTier)));
            }
            for (int i = 0; i < Tabs.Length; i++) StyleAction(Tabs[i],i == (int)shopCategory,shopOpen);
            foreach (var controls in Cards)
            {
                LastStandShopCard cardView=null;
                if(shopView!=null)foreach(var candidate in shopView.Cards)if(candidate.TrackId==controls.TrackId){cardView=candidate;break;}
                if (cardView == null) { StyleAction(controls.Buy,false,false); continue; }
                controls.Title.text = cardView.Name;
                controls.Levels.text = "Level " + cardView.CurrentLevel + " / " + cardView.Cap;
                controls.Current.text = EffectDelta(cardView);
                controls.Next.text = run ? "Permanent " + cardView.PermanentLevel + "  /  This run " + cardView.RunPurchases : "";
                controls.Price.text = cardView.QuotedCost+" "+shopView.CurrencyName;
                controls.Refusal.text = purchaseFeedback != null && feedbackTrack == controls.TrackId ? purchaseFeedback :
                    cardView.Refusal==LastStandShopCardRefusal.None?cardView.QuotedCost.ToString("N0")+" "+shopView.CurrencyName+" total":cardView.Reason;
                controls.Buy.GetComponentInChildren<Text>(true).text = cardView.Refusal==LastStandShopCardRefusal.AtCap?"MAX":
                    "BUY x"+cardView.PurchaseQuantity;
                StyleAction(controls.Buy,false,shopOpen && cardView.CanPurchase);
                if(cardView.Refusal==LastStandShopCardRefusal.AtCap)
                {controls.Buy.GetComponent<Image>().color=Brass;controls.Buy.GetComponentInChildren<Text>(true).color=Ink;}
            }
        }
        static string EffectDelta(LastStandShopCard cardView)
        {
            // Keep exact catalog wording and units together. This is a text
            // transition, never another owner of effect arithmetic.
            return cardView.CurrentEffectDescription + (cardView.PurchaseQuantity>0 ? " to " + cardView.ResultEffectDescription+
                "\n+"+cardView.PurchaseQuantity+" levels -> level "+cardView.ResultLevel :
                cardView.NextPrice.HasValue?"\nNext level: "+cardView.NextEffectDescription+"\n"+cardView.PriceDescription:"");
        }
        static string QuantityLabel(LastStandBulkQuantity quantity) =>
            (quantity==LastStandBulkQuantity.One?"[1]":"1")+"   "+(quantity==LastStandBulkQuantity.Ten?"[10]":"10")+"\n"+
            (quantity==LastStandBulkQuantity.Hundred?"[100]":"100")+"   "+(quantity==LastStandBulkQuantity.Max?"[MAX]":"MAX");
        void OnShopScrolled(Vector2 ignored)
        {
            if (layingOut || !shopOpen || shopUnitsY <= 0) return;
            float offset = Content.anchoredPosition.y / shopUnitsY;
            if (float.IsNaN(offset) || float.IsInfinity(offset)) return;
            offset = Mathf.Clamp(offset,0,shopMaximumScroll);
            if (Mathf.Abs(offset-shopScrollOffset) < .01f) return;
            shopScrollOffset = offset; layout();
        }
        void SetShopScrollOffset(float offset)
        {
            shopScrollOffset = offset;
            Content.anchoredPosition = new Vector2(0,offset*shopUnitsY);
        }
        public void RevealSelection(Button button)
        {
            if (!shopOpen || layingOut || !button || !button.IsActive() || !button.IsInteractable() ||
                !button.transform.IsChildOf(Content) || shopUnitsY <= 0) return;
            var corners = new Vector3[4]; ((RectTransform)button.transform).GetWorldCorners(corners);
            float bottom = Viewport.InverseTransformPoint(corners[0]).y;
            float top = Viewport.InverseTransformPoint(corners[1]).y;
            var clip = Viewport.rect;
            float delta = bottom < clip.yMin ? clip.yMin-bottom : top > clip.yMax ? clip.yMax-top : 0;
            float offset = Mathf.Clamp(shopScrollOffset + delta/shopUnitsY,0,shopMaximumScroll);
            if (Mathf.Abs(offset-shopScrollOffset) < .01f) return;
            shopScroll.StopMovement(); SetShopScrollOffset(offset); layout();
        }
        void RevealCurrentShopSelection()
        {
            var selected = EventSystem.current ? EventSystem.current.currentSelectedGameObject : null;
            if (selected) RevealSelection(selected.GetComponent<Button>());
        }

        public LastStandHudLayout.ShopPanelInput LayoutInput()
        {
            if(shopOpen&&Content.gameObject.activeInHierarchy&&shopUnitsY>0)
            {float offset=Content.anchoredPosition.y/shopUnitsY;if(!float.IsNaN(offset)&&!float.IsInfinity(offset))shopScrollOffset=Mathf.Clamp(offset,0,shopMaximumScroll);}
            var keys=new List<string>();if(shopView!=null)foreach(var card in shopView.Cards)
                if(card.Category==shopCategory&&card.AppliesToFitting)keys.Add(card.Key);
            return new LastStandHudLayout.ShopPanelInput(shopOpen,keys.ToArray(),shopScrollOffset);
        }
        public LastStandHudLayout.ShopPanelInput MeasuredInput(LastStandHudLayout.Projection projection,float unitsX,float unitsY,Text status)
        {
            var keys=new List<string>();if(shopView!=null)foreach(var card in shopView.Cards)
                if(card.Category==shopCategory&&card.AppliesToFitting)keys.Add(card.Key);
            var measures=new Dictionary<string,LastStandHudLayout.Slot>();foreach(var slot in projection.Slots)measures.Add(slot.Id,slot);
            var effects=new float[keys.Count];var refusals=new float[keys.Count];var contributions=new float[keys.Count];
            var headers=new float[keys.Count];
            for(int i=0;i<keys.Count;i++)
            {
                string id="ShopCard_"+keys[i];
                effects[i]=LastStandHudElements.MeasureText(nodes[id+"CurrentEffect"].GetComponent<Text>(),measures[id+"CurrentEffect"],unitsX,unitsY);
                refusals[i]=LastStandHudElements.MeasureText(nodes[id+"Refusal"].GetComponent<Text>(),measures[id+"Refusal"],unitsX,unitsY);
                contributions[i]=shopMode==LastStandShopMode.Run?LastStandHudElements.MeasureText(nodes[id+"NextEffect"].GetComponent<Text>(),measures[id+"NextEffect"],unitsX,unitsY):0;
                headers[i]=Math.Max(LastStandHudElements.MeasureText(nodes[id+"Title"].GetComponent<Text>(),measures[id+"Title"],unitsX,unitsY),
                    LastStandHudElements.MeasureText(nodes[id+"Levels"].GetComponent<Text>(),measures[id+"Levels"],unitsX,unitsY));
            }
            float notice=measures.ContainsKey("SaveStatus")?LastStandHudElements.MeasureText(status,measures["SaveStatus"],unitsX,unitsY):40;
            float heading=measures.ContainsKey("PhaseHeading")?LastStandHudElements.MeasureText(nodes["PhaseHeading"].GetComponent<Text>(),measures["PhaseHeading"],unitsX,unitsY):LastStandHudLayout.LineHeight;
            float detail=measures.ContainsKey("PhaseDetail")?LastStandHudElements.MeasureText(nodes["PhaseDetail"].GetComponent<Text>(),measures["PhaseDetail"],unitsX,unitsY):LastStandHudLayout.LineHeight;
            return new LastStandHudLayout.ShopPanelInput(true,keys.ToArray(),shopScrollOffset,effects,refusals,contributions,notice,heading,detail,headers);
        }
        public void BeginLayout(float offset,float maximum,float unitsY)
        {layingOut=true;shopScrollOffset=offset;shopMaximumScroll=maximum;shopUnitsY=unitsY;shopScroll.scrollSensitivity=40*unitsY;}
        public void EndLayout(bool resized)
        {layingOut=false;if(resized)RevealCurrentShopSelection();}
        public void Dispose(){shopScroll.onValueChanged.RemoveListener(OnShopScrolled);shopOpen=false;}
    }
}

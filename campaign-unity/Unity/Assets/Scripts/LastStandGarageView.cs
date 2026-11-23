using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandGarageView
    {
        readonly LastStandLoopController loop;
        public readonly RectTransform TierCard,FittingCard;
        public readonly Button TierPrevious,TierNext,ArmoryEntry,ResearchEntry;
        public readonly LastStandFittingCallout Callout;
        readonly Text tierName,tierDetail,fittingDescription,save;
        readonly LastStandEquipmentBay equipmentBay;
        static readonly Color Brass=LastStandUiPrimitives.Brass,Paper=LastStandUiPrimitives.Paper;
        public LastStandGarageView(LastStandLoopController loop,Canvas canvas,RectTransform root,LastStandHudElements elements)
        {
            this.loop=loop;
            equipmentBay=new LastStandEquipmentBay(loop,root);
            Func<string,Transform,RectTransform> Panel=(name,parent)=>elements.Panel(name,parent);
            Func<string,string,Transform,UnityEngine.Events.UnityAction,Button> Action=elements.Action;
            Func<string,Transform,int,Text> Label=elements.Label;
            TierCard=Panel("GarageTierCard",root);
            TierPrevious=Action("TierPrevious","<",TierCard,() => loop.MoveGarageTier(-1));
            TierNext=Action("TierNext",">",TierCard,() => loop.MoveGarageTier(1));
            tierName=Label("GarageTierName",TierCard,16);tierName.color=Brass;tierName.alignment=TextAnchor.MiddleCenter;
            tierDetail=Label("GarageTierDetail",TierCard,14);tierDetail.alignment=TextAnchor.UpperCenter;
            FittingCard=Panel("GarageFittingCard",root);
            ArmoryEntry=Action("ArmoryEntry","ARMORY & BUILDS",FittingCard,loop.OpenArmory);
            fittingDescription=Label("GarageFittingDescription",FittingCard,14);
            save=Label("GarageSave",root,14);save.color=Paper;
            Callout=root.gameObject.AddComponent<LastStandFittingCallout>();
            Callout.Initialize(canvas,loop.GetComponent<SingedTerra.Art.TankPresentation>(),FittingCard);
            ResearchEntry=Action("ResearchEntry","RESEARCH",root,loop.OpenResearch);
        }
        public void Refresh(bool canDeploy,string refusal)
        {
            if(loop.GarageCardsVisible && loop.GarageTierSelection!=null && loop.GarageFittingSelection!=null)
            {
                tierName.text=loop.GarageTierSelection.Current.Name.ToUpperInvariant();
                tierDetail.text=loop.GarageTierSelection.Current.Description;
                fittingDescription.text=loop.BuildLabel(loop.Progression.SelectedLoadout)+"\n"+loop.Progression.EquipmentBayCount+" / 2 bays unlocked";
                save.text=loop.GarageIssue!=""?loop.GarageIssue:
                    canDeploy?"SALVAGE "+loop.Progression.Wallet+"  |  WAVE 1: +"+LastStandRewardCatalog.At(LastStandTierCatalog.Get(loop.Progression.SelectedTier),1).RepeatableSalvage:
                    "DEPLOY: "+refusal;
            }
        }
        public void Layout(Dictionary<string,LastStandHudLayout.Slot> slots,float cssWidth,float cssHeight,float ratio,bool shopOpen,bool hidesBackground=false)
        {
            var art=loop.GetComponent<SingedTerra.Art.TankPresentation>();
            LastStandHudLayout.Slot preview=null;
            bool garagePreview=loop.GarageCardsVisible&&!loop.MenuOpen&&!shopOpen&&slots.TryGetValue("GaragePreview",out preview);
            if(garagePreview && !art.EncounterActive)
            {
                var bounds=preview.Bounds;
                art.SetGarageFraming(new Rect(bounds.X/cssWidth,1-(bounds.Y+bounds.Height)/cssHeight,bounds.Width/cssWidth,bounds.Height/cssHeight));
            }
            Callout.PixelRatio=ratio;
            Callout.Refresh(garagePreview&&!loop.MenuOpen&&FittingCard.gameObject.activeInHierarchy&&!LastStandEquipmentBay.Fits(cssWidth,cssHeight));
            // The installed-systems deck supplies this action's outer frame.
            // Keep the stock owner and hit target, without a nested third frame.
            bool framed=!LastStandEquipmentBay.Fits(cssWidth,cssHeight);
            FittingCard.GetComponent<Image>().enabled=framed;
            foreach(var decoration in new[]{"AuthoredPanel","ConsoleFrame"})
            {var child=FittingCard.Find(decoration);if(child)child.gameObject.SetActive(framed);}
            equipmentBay.Layout(cssWidth,cssHeight,shopOpen,elementsForBay,hidesBackground);
        }
        Dictionary<string,RectTransform> elementsForBay;
        public void BindBayElements(Dictionary<string,RectTransform> nodes){elementsForBay=nodes;}
        public void Dispose(){equipmentBay.Dispose();if(Callout)Callout.enabled=false;}
    }
}

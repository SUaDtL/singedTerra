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
        public readonly Button TierPrevious,TierNext,FittingPrevious,FittingNext,ResearchEntry;
        public readonly LastStandFittingCallout Callout;
        readonly Text tierName,tierDetail,fittingName,fittingDescription,save;
        static readonly Color Brass=LastStandUiPrimitives.Brass,Paper=LastStandUiPrimitives.Paper;
        public LastStandGarageView(LastStandLoopController loop,Canvas canvas,RectTransform root,LastStandHudElements elements)
        {
            this.loop=loop;
            Func<string,Transform,RectTransform> Panel=(name,parent)=>elements.Panel(name,parent);
            Func<string,string,Transform,UnityEngine.Events.UnityAction,Button> Action=elements.Action;
            Func<string,Transform,int,Text> Label=elements.Label;
            TierCard=Panel("GarageTierCard",root);
            TierPrevious=Action("TierPrevious","<",TierCard,() => loop.MoveGarageTier(-1));
            TierNext=Action("TierNext",">",TierCard,() => loop.MoveGarageTier(1));
            tierName=Label("GarageTierName",TierCard,16);tierName.color=Brass;tierName.alignment=TextAnchor.MiddleCenter;
            tierDetail=Label("GarageTierDetail",TierCard,14);tierDetail.alignment=TextAnchor.UpperCenter;
            FittingCard=Panel("GarageFittingCard",root);
            FittingPrevious=Action("FittingPrevious","<",FittingCard,() => loop.MoveGarageFitting(-1));
            FittingNext=Action("FittingNext",">",FittingCard,() => loop.MoveGarageFitting(1));
            fittingName=Label("GarageFittingName",FittingCard,16);fittingName.color=Brass;fittingName.alignment=TextAnchor.MiddleCenter;
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
                fittingName.text=loop.GarageFittingSelection.Current.Name.ToUpperInvariant();
                fittingDescription.text=loop.GarageFittingSelection.Current.Description;
                save.text=loop.GarageIssue!=""?loop.GarageIssue:
                    canDeploy?"SALVAGE "+loop.Progression.Wallet+"  |  WAVE 1: +"+LastStandRewardCatalog.At(LastStandTierCatalog.Get(loop.Progression.SelectedTier),1).RepeatableSalvage:
                    "DEPLOY: "+refusal;
            }
        }
        public void Layout(Dictionary<string,LastStandHudLayout.Slot> slots,float cssWidth,float cssHeight,float ratio,bool shopOpen)
        {
            var art=loop.GetComponent<SingedTerra.Art.TankPresentation>();
            LastStandHudLayout.Slot preview=null;
            bool garagePreview=loop.GarageCardsVisible&&!shopOpen&&slots.TryGetValue("GaragePreview",out preview);
            if(garagePreview && !art.EncounterActive)
            {
                var bounds=preview.Bounds;
                art.SetGarageFraming(new Rect(bounds.X/cssWidth,1-(bounds.Y+bounds.Height)/cssHeight,bounds.Width/cssWidth,bounds.Height/cssHeight));
            }
            Callout.PixelRatio=ratio;
            Callout.Refresh(garagePreview&&!loop.MenuOpen&&FittingCard.gameObject.activeInHierarchy);
        }
        public void Dispose(){if(Callout)Callout.enabled=false;}
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using SingedTerra.Art;

namespace SingedTerra.LastStand
{
    public sealed partial class LastStandLoopController
    {
        readonly LastStandAppearanceSession appearanceEditor=new LastStandAppearanceSession();
        bool appearanceApplyUnconfirmed;
        public bool CanCustomizeAppearance => art && art.TankVisuals && Progression!=null && Session!=null &&
            (Phase=="garage"||Phase=="workshop") && Session.Model==null && !Session.CatchingUp &&
            Session.CanRun && Progression.SaveState=="ready" && !Progression.RestorePending && Progression.PendingDefeat==null;
        public LastStandTankAppearance AppearanceSaved => Progression?.Appearance??LastStandTankAppearance.Default;
        public LastStandTankAppearance AppearanceDraft => appearanceEditor.Draft??AppearanceSaved;
        public LastStandTankPartSlot? AppearanceSelectedPart { get; private set; }
        public string AppearanceStatus { get; private set; }="";
        public bool AppearanceCanApply => MenuPage=="appearance" && CanCustomizeAppearance && appearanceEditor.HasChanges &&
            appearanceEditor.Matches(AppearanceSaved,Progression.RestoreGeneration);
        public IReadOnlyList<Renderer> AppearancePartRenderers => AppearanceSelectedPart.HasValue && art && art.TankVisuals
            ? art.TankVisuals.PartRenderers(AppearanceSelectedPart.Value) : Array.Empty<Renderer>();
        public string AppearancePartName => AppearanceSelectedPart.HasValue
            ? LastStandTankAppearanceCatalog.PartLabel(AppearanceSelectedPart.Value,AppearanceDraft.Part(AppearanceSelectedPart.Value)):"";
        public void OpenAppearance()=>OpenMenu("appearance");
        void BeginAppearance()
        {
            appearanceEditor.Begin(AppearanceSaved,Progression.RestoreGeneration);
            appearanceApplyUnconfirmed=false;
            AppearanceSelectedPart=null;AppearanceStatus="Choose a kit, individual parts or paint.";
            art.ApplyAppearance(AppearanceSaved);
        }
        public bool AppearanceCanPreview => MenuPage=="appearance" && CanCustomizeAppearance &&
            appearanceEditor.Matches(AppearanceSaved,Progression.RestoreGeneration);
        void PreviewAppearance(LastStandTankAppearance value)
        {
            if(!AppearanceCanPreview)return;
            appearanceEditor.Preview(value);art.ApplyAppearance(value);
            AppearanceStatus=appearanceEditor.HasChanges?"Previewing changes. Apply to save, or Cancel to keep your tank.":"Your saved appearance.";
            Refresh("appearance-preview");
        }
        public void PreviewAppearancePreset(string kit)
        {if(!AppearanceCanPreview||!LastStandTankAppearanceCatalog.IsKit(kit))return;AppearanceSelectedPart=null;PreviewAppearance(AppearanceDraft.WithPreset(kit));}
        public void PreviewAppearancePart(LastStandTankPartSlot slot,string kit)
        {
            if(!AppearanceCanPreview||!Enum.IsDefined(typeof(LastStandTankPartSlot),slot)||!LastStandTankAppearanceCatalog.IsKit(kit))return;
            AppearanceSelectedPart=slot;PreviewAppearance(AppearanceDraft.WithPart(slot,kit));
        }
        public void PreviewAppearancePaint(string paint)
        {if(!AppearanceCanPreview||!LastStandTankAppearanceCatalog.IsPaint(paint))return;PreviewAppearance(AppearanceDraft.WithPaint(paint));}
        public void ApplyAppearance()
        {
            if(!AppearanceCanApply)return;
            // Research may legitimately advance the revision while this page is
            // open. Check the draft basis, then submit against the current owner.
            if(!Progression.TryApplyAppearance(AppearanceDraft,Progression.Revision))
            {appearanceApplyUnconfirmed=true;AppearanceStatus=Progression.SaveError??"Appearance could not be confirmed. Retry the save before continuing.";Refresh("appearance-unconfirmed");return;}
            appearanceApplyUnconfirmed=false;
            appearanceEditor.Confirm(AppearanceSaved,Progression.RestoreGeneration);
            art.ApplyAppearance(AppearanceSaved);AppearanceStatus="Tank appearance saved.";Refresh("appearance-saved");
        }
        public void CancelAppearance()=>CloseMenu();
        public void RotateAppearance(int direction)
        {if(MenuPage!="appearance"||!appearanceEditor.IsOpen)return;if(direction<0)art.OrbitLeft();else if(direction>0)art.OrbitRight();Refresh("appearance-rotate");}
        public void FrameAppearance(Rect normalizedViewport)
        {if(MenuPage=="appearance"&&appearanceEditor.IsOpen)art.SetGarageFraming(normalizedViewport);}
        void LeaveAppearancePage(string next)
        {
            if(next=="appearance"||!appearanceEditor.IsOpen)return;
            appearanceEditor.Close();AppearanceSelectedPart=null;appearanceApplyUnconfirmed=false;
            if(art){art.ApplyAppearance(AppearanceSaved);art.InvalidateGarageFraming();}
        }
        void RefreshAppearance()
        {
            if(!appearanceEditor.IsOpen){if(art)art.ApplyAppearance(AppearanceSaved);return;}
            if(MenuPage!="appearance"){LeaveAppearancePage(MenuPage);return;}
            if(appearanceApplyUnconfirmed && Progression.SaveState=="ready" && AppearanceDraft.Equals(AppearanceSaved))
            {appearanceEditor.Confirm(AppearanceSaved,Progression.RestoreGeneration);appearanceApplyUnconfirmed=false;AppearanceStatus="Tank appearance saved.";}
            if(!appearanceEditor.Matches(AppearanceSaved,Progression.RestoreGeneration))
            {AppearanceStatus="Your saved tank changed. Close and reopen Appearance before editing.";art.ApplyAppearance(AppearanceSaved);}
            else if(Progression.SaveState!="ready")AppearanceStatus=Progression.SaveError??"Save confirmation is required before applying changes.";
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // A real-world preview plus a shared modal editor. This page owns only
    // presentation; the loop's appearance session owns draft/commit/rollback.
    internal sealed class LastStandAppearanceHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly Button kitsTab,partsTab,paintTab,apply,cancel,rotateLeft,rotateRight;
        readonly Button[] tabs;
        readonly Text explanation,section,previewLabel;
        readonly List<Button> presets=new List<Button>(),paints=new List<Button>();
        readonly Dictionary<LastStandTankPartSlot,List<Button>> parts=new Dictionary<LastStandTankPartSlot,List<Button>>();
        readonly Dictionary<LastStandTankPartSlot,Text> partLabels=new Dictionary<LastStandTankPartSlot,Text>();
        readonly LastStandFittingCallout callout;
        string tab="kits";
        bool open;
        float width,height,sx=1,sy=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close.gameObject.activeInHierarchy?modal.Close:kitsTab;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandAppearanceHud(LastStandLoopController loop,Transform parent,Font font,Texture2D metal,Sprite surface)
        {
            this.loop=loop;
            modal=new LastStandModal("Appearance",parent,font,loop.CancelAppearance,metal,surface);
            // The world tank remains visible, with underlying game controls
            // hidden by the registered page host and their input held there.
            modal.Shade.GetComponent<Image>().color=new Color(0,0,0,.04f);
            modal.Title.text="APPEARANCE";
            modal.Close.GetComponentInChildren<Text>().text="CANCEL";
            pane=modal.Pane("Appearance",scrollStatus:true);
            explanation=modal.Text("AppearanceExplanation",pane.Content,14);
            explanation.text="Cosmetic only. No cost or stat changes.";
            kitsTab=modal.Button("AppearanceKitsTab","KITS",pane.Content,()=>ChangeTab("kits"));
            partsTab=modal.Button("AppearancePartsTab","PARTS",pane.Content,()=>ChangeTab("parts"));
            paintTab=modal.Button("AppearancePaintTab","PAINT",pane.Content,()=>ChangeTab("paint"));
            tabs=new[]{kitsTab,partsTab,paintTab};
            section=modal.Text("AppearanceSection",pane.Content,16);section.color=LastStandUiPrimitives.Brass;
            foreach(var kit in LastStandTankAppearanceCatalog.Kits)
            {
                string id=kit.Id;
                presets.Add(modal.Button("AppearancePreset"+Token(id),kit.Label,pane.Content,()=>loop.PreviewAppearancePreset(id),14));
            }
            foreach(var slot in LastStandTankAppearanceCatalog.Slots)
            {
                var value=slot;var choices=new List<Button>();parts.Add(slot,choices);
                var label=modal.Text("Appearance"+slot+"Label",pane.Content,16);label.color=LastStandUiPrimitives.Brass;partLabels.Add(slot,label);
                foreach(var kit in LastStandTankAppearanceCatalog.Kits)
                {
                    string id=kit.Id;
                    choices.Add(modal.Button("Appearance"+slot+Token(id),LastStandTankAppearanceCatalog.PartLabel(slot,id),pane.Content,
                        ()=>loop.PreviewAppearancePart(value,id),14));
                }
            }
            foreach(var paint in LastStandTankAppearanceCatalog.Paints)
            {
                string id=paint.Id;
                var button=modal.Button("AppearancePaint"+Token(id),paint.Label,pane.Content,()=>loop.PreviewAppearancePaint(id),14);
                paints.Add(button);
                var swatch=LastStandUiPrimitives.Node("PaintSwatch",button.transform);var image=swatch.gameObject.AddComponent<Image>();image.raycastTarget=false;
                if(ColorUtility.TryParseHtmlString(paint.Hex,out var color))image.color=color;
                swatch.anchorMin=swatch.anchorMax=new Vector2(0,.5f);swatch.pivot=new Vector2(0,.5f);
                swatch.anchoredPosition=new Vector2(9,0);swatch.sizeDelta=new Vector2(12,12);
                button.GetComponentInChildren<Text>().rectTransform.offsetMin=new Vector2(25,2);
            }
            apply=modal.Button("AppearanceApply","APPLY",pane.Content,loop.ApplyAppearance);
            cancel=modal.Button("AppearanceCancel","CANCEL",pane.Content,loop.CancelAppearance);
            rotateLeft=modal.Button("AppearanceRotateLeft","<",modal.Shade,()=>loop.RotateAppearance(-1));
            rotateRight=modal.Button("AppearanceRotateRight",">",modal.Shade,()=>loop.RotateAppearance(1));
            previewLabel=modal.Text("AppearancePreviewLabel",modal.Shade,16);previewLabel.alignment=TextAnchor.MiddleCenter;
            callout=modal.Shade.gameObject.AddComponent<LastStandFittingCallout>();
            callout.Initialize(parent.GetComponentInParent<Canvas>(),loop.GetComponent<SingedTerra.Art.TankPresentation>(),previewLabel.rectTransform,
                ()=>loop.AppearancePartRenderers,()=>loop.AppearancePartName,"ST_LS_APPEARANCE_CALLOUT");
            modal.Shade.gameObject.SetActive(false);
        }
        static string Token(string value)=>char.ToUpperInvariant(value[0])+value.Substring(1);
        void ChangeTab(string value){tab=value;pane.Reset();loop.RefreshControls();}
        static void Active(Component item,bool visible)=>item.gameObject.SetActive(visible);
        void Choice(Button button,string label,bool selected,bool enabled)
        {button.GetComponentInChildren<Text>().text=label+(selected?"\nSELECTED":"");modal.Style(button,enabled,selected);}
        public void Refresh(bool visible)
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(visible);
            if(!visible){callout.Refresh(false);return;}
            var draft=loop.AppearanceDraft??loop.Progression.Appearance;
            bool editable=loop.AppearanceCanPreview;
            modal.Status.text=loop.AppearanceStatus;
            section.text=tab=="kits"?"WHOLE-TANK PRESETS":tab=="parts"?"MIX INDIVIDUAL PARTS":"PAINT COLOR";
            modal.Style(kitsTab,true,tab=="kits");modal.Style(partsTab,true,tab=="parts");modal.Style(paintTab,true,tab=="paint");
            for(int i=0;i<presets.Count;i++)
            {
                var kit=LastStandTankAppearanceCatalog.Kits[i];bool selected=true;
                foreach(var slot in LastStandTankAppearanceCatalog.Slots)selected&=draft.Part(slot)==kit.Id;
                Choice(presets[i],kit.Label,selected,editable);Active(presets[i],tab=="kits");
            }
            foreach(var slot in LastStandTankAppearanceCatalog.Slots)
            {
                var choices=parts[slot];partLabels[slot].text=LastStandTankAppearanceCatalog.SlotLabel(slot)+": "+LastStandTankAppearanceCatalog.PartLabel(slot,draft.Part(slot));
                Active(partLabels[slot],tab=="parts");
                for(int i=0;i<choices.Count;i++)
                {var kit=LastStandTankAppearanceCatalog.Kits[i];Choice(choices[i],LastStandTankAppearanceCatalog.PartLabel(slot,kit.Id),draft.Part(slot)==kit.Id,editable);Active(choices[i],tab=="parts");}
            }
            for(int i=0;i<paints.Count;i++)
            {var paint=LastStandTankAppearanceCatalog.Paints[i];Choice(paints[i],paint.Label,draft.Paint==paint.Id,editable);Active(paints[i],tab=="paint");}
            modal.Style(apply,loop.AppearanceCanApply,true);modal.Style(cancel,true,false);modal.Style(modal.Close,true,false);
            modal.Style(rotateLeft,editable,false);modal.Style(rotateRight,editable,false);
            previewLabel.text=loop.AppearanceSelectedPart.HasValue?loop.AppearancePartName:"YOUR TANK";
            if(justOpened)pane.Reset();if(width>0)Layout(width,height,sx,sy);
        }
        public void Layout(float w,float h,float x,float y)
        {
            width=w;height=h;sx=x;sy=y;if(!open)return;
            var projection=LastStandAppearanceLayout.Project(w,h);var p=projection.Panel;
            modal.Title.transform.SetParent(projection.ScrollHeader?pane.Content:modal.Panel,false);
            modal.Close.transform.SetParent(projection.ScrollHeader?pane.Content:modal.Panel,false);
            modal.LayoutAt(w,h,x,y,new Rect(p.X,p.Y,p.Width,p.Height));
            float top=projection.ScrollHeader?8:modal.HeaderBottom,cw=p.Width-40;
            pane.Layout(8,top,p.Width-16,p.Height-top-8,x,y);
            float at=0;
            if(projection.ScrollHeader)
            {
                float titleHeight=Math.Max(32,modal.Preferred(modal.Title,cw));
                modal.Place(modal.Title,12,0,cw,titleHeight);at=titleHeight+8;
                // One Cancel action suffices when the entire header scrolls.
                Active(modal.Close,false);
            }
            else Active(modal.Close,true);
            float eh=modal.Preferred(explanation,cw);modal.Place(explanation,12,at,cw,eh);at+=eh+8;
            float statusHeight=modal.Preferred(modal.Status,cw);modal.Place(modal.Status,12,at,cw,statusHeight);at+=statusHeight+12;
            // Preserve the established three tabs wherever their named labels
            // fit; narrower editors wrap without shrinking pointer targets.
            int tabColumns=cw>=196?3:cw>=128?2:1;
            float tabWidth=(cw-8*(tabColumns-1))/tabColumns;
            for(int i=0;i<tabs.Length;i++)modal.Place(tabs[i],12+(i%tabColumns)*(tabWidth+8),at+(i/tabColumns)*52,tabWidth,44);
            at+=((tabs.Length+tabColumns-1)/tabColumns)*52+4;
            float sectionHeight=modal.Preferred(section,cw);modal.Place(section,12,at,cw,sectionHeight);at+=sectionHeight+8;
            if(tab=="kits")at=Choices(presets,at,cw);
            else if(tab=="paint")at=Choices(paints,at,cw);
            else foreach(var slot in LastStandTankAppearanceCatalog.Slots)
            {float th=modal.Preferred(partLabels[slot],cw);modal.Place(partLabels[slot],12,at,cw,th);at+=th+8;at=Choices(parts[slot],at,cw)+12;}
            if(cw<152)
            {modal.Place(apply,12,at,cw,44);modal.Place(cancel,12,at+52,cw,44);pane.Finish(at+108);}
            else
            {modal.Place(apply,12,at,(cw-8)/2,44);modal.Place(cancel,20+(cw-8)/2,at,(cw-8)/2,44);pane.Finish(at+56);}
            PlaceWorld(rotateLeft,projection.RotateLeft);PlaceWorld(rotateRight,projection.RotateRight);
            PlaceWorld(previewLabel,projection.PreviewLabel);Active(previewLabel,projection.ShowPreviewLabel);
            var world=projection.World;loop.FrameAppearance(new Rect(world.X/w,1-(world.Y+world.Height)/h,world.Width/w,world.Height/h));
            callout.PixelRatio=Screen.width/w;callout.Refresh(projection.ShowPreviewLabel&&loop.AppearanceSelectedPart.HasValue);
        }
        float Choices(List<Button> choices,float at,float width)
        {
            int columns=width>=200?2:1;float cell=(width-8*(columns-1))/columns;
            for(int i=0;i<choices.Count;i++)modal.Place(choices[i],12+(i%columns)*(cell+8),at+(i/columns)*60,cell,52);
            return at+((choices.Count+columns-1)/columns)*60+4;
        }
        void PlaceWorld(Component item,LastStandAppearanceLayout.Box box)=>modal.Place(item,box.X,box.Y,box.Width,box.Height);
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}

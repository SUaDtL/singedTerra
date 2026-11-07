using System;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // Uses the same tank/editor geometry, chrome and modal lifecycle as Appearance.
    internal sealed class LastStandArmoryHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly Text purpose,presetLabel,nameLabel,previewLabel;
        readonly Text[] bayHeadings=new Text[2],bayNames=new Text[2],bayDetails=new Text[2];
        readonly Button[] previous=new Button[2],next=new Button[2];
        readonly LastStandFittingCallout[] callouts=new LastStandFittingCallout[2];
        readonly Button presetPrevious,presetNext,apply,cancel,rotateLeft,rotateRight;
        public readonly InputField NameInput;
        bool open;
        float width,height,sx=1,sy=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Selectable[] Controls {get {var controls=new System.Collections.Generic.List<Selectable>(modal.Buttons);controls.Add(NameInput);return controls.ToArray();}}
        public Button InitialFocus=>modal.Close.gameObject.activeInHierarchy?modal.Close:presetNext.interactable?presetNext:presetPrevious;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandArmoryHud(LastStandLoopController loop,Transform parent,Font font,Texture2D metal,Sprite surface)
        {
            this.loop=loop;modal=new LastStandModal("Armory",parent,font,loop.CancelArmory,metal,surface);
            modal.Title.text="ARMORY";modal.Close.GetComponentInChildren<Text>().text="CANCEL";
            modal.Shade.GetComponent<Image>().color=new Color(0,0,0,.04f);
            pane=modal.Pane("Armory",scrollStatus:true);
            purpose=modal.Text("ArmoryPurpose",pane.Content,14);
            purpose.text="Your cannon is always equipped. Fit each bay to shape your next run.";
            presetLabel=modal.Text("ArmoryPresetLabel",pane.Content,16);presetLabel.alignment=TextAnchor.MiddleCenter;
            presetPrevious=modal.Button("ArmoryPresetPrevious","<",pane.Content,()=>loop.MoveArmoryPreset(-1));
            presetNext=modal.Button("ArmoryPresetNext",">",pane.Content,()=>loop.MoveArmoryPreset(1));
            nameLabel=modal.Text("ArmoryNameLabel",pane.Content,14);nameLabel.text="BUILD NAME";
            NameInput=modal.Input("ArmoryName",pane.Content,LastStandLoadoutPreset.MaximumNameLength,loop.RenameArmoryPreset);
            for(int i=0;i<2;i++)
            {
                int bay=i;string token="ArmoryBay"+(i+1);
                bayHeadings[i]=modal.Text(token+"Heading",pane.Content,16);bayHeadings[i].color=LastStandUiPrimitives.Brass;
                bayNames[i]=modal.Text(token+"Name",pane.Content,16);bayNames[i].alignment=TextAnchor.MiddleCenter;
                bayDetails[i]=modal.Text(token+"Detail",pane.Content,14);
                previous[i]=modal.Button(token+"Previous","<",pane.Content,()=>loop.MoveArmoryFitting(bay,-1));
                next[i]=modal.Button(token+"Next",">",pane.Content,()=>loop.MoveArmoryFitting(bay,1));
                callouts[i]=modal.Shade.gameObject.AddComponent<LastStandFittingCallout>();
                callouts[i].Initialize(parent.GetComponentInParent<Canvas>(),loop.GetComponent<SingedTerra.Art.TankPresentation>(),bayNames[i].rectTransform,
                    ()=>loop.ArmoryBayRenderers(bay),()=>loop.ArmoryBayName(bay),"ST_LS_ARMORY_BAY"+(i+1));
            }
            apply=modal.Button("ArmoryApply","APPLY BUILD",pane.Content,loop.ApplyArmory);
            cancel=modal.Button("ArmoryCancel","CANCEL",pane.Content,loop.CancelArmory);
            rotateLeft=modal.Button("ArmoryRotateLeft","<",modal.Shade,()=>loop.RotateArmory(-1));
            rotateRight=modal.Button("ArmoryRotateRight",">",modal.Shade,()=>loop.RotateArmory(1));
            previewLabel=modal.Text("ArmoryPreviewLabel",modal.Shade,16);previewLabel.text="BUILD PREVIEW";previewLabel.alignment=TextAnchor.MiddleCenter;
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible)
        {
            bool opened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(visible);
            if(!visible){foreach(var callout in callouts)callout.Refresh(false);return;}
            bool editable=loop.ArmoryCanPreview;
            modal.Status.text=loop.ArmoryStatus;
            presetLabel.text="PRESET "+(loop.ArmoryPresetSlot+1)+" / "+LastStandLoadoutPreset.MaximumPresets;
            modal.Style(presetPrevious,editable&&loop.ArmoryPresetSlot>0,false);
            modal.Style(presetNext,editable&&loop.ArmoryPresetSlot+1<LastStandLoadoutPreset.MaximumPresets,false);
            NameInput.interactable=editable;
            if(!NameInput.isFocused)NameInput.SetTextWithoutNotify(loop.ArmoryNameInput);
            for(int i=0;i<2;i++)
            {
                bool available=i<loop.Progression.EquipmentBayCount;
                bayHeadings[i].text="BAY "+(i+1)+(available?"":" · LOCKED");
                bayNames[i].text=available?loop.ArmoryBayName(i):"Second fitting";
                bayDetails[i].text=loop.ArmoryBayDescription(i);
                modal.Style(previous[i],loop.CanMoveArmoryFitting(i,-1),false);modal.Style(next[i],loop.CanMoveArmoryFitting(i,1),false);
            }
            modal.Style(apply,loop.ArmoryCanApply,true);modal.Style(cancel,true,false);modal.Style(modal.Close,true,false);
            modal.Style(rotateLeft,editable,false);modal.Style(rotateRight,editable,false);
            if(opened)pane.Reset();if(width>0)Layout(width,height,sx,sy);
        }
        public void Layout(float w,float h,float x,float y)
        {
            width=w;height=h;sx=x;sy=y;if(!open)return;
            var projection=LastStandAppearanceLayout.Project(w,h);var panel=projection.Panel;
            modal.Title.transform.SetParent(projection.ScrollHeader?pane.Content:modal.Panel,false);
            modal.Close.transform.SetParent(projection.ScrollHeader?pane.Content:modal.Panel,false);
            modal.LayoutAt(w,h,x,y,new Rect(panel.X,panel.Y,panel.Width,panel.Height));
            float top=projection.ScrollHeader?8:modal.HeaderBottom,cw=panel.Width-40,at=0;
            pane.Layout(8,top,panel.Width-16,panel.Height-top-8,x,y);
            if(projection.ScrollHeader)at=PlaceText(modal.Title,at,cw)+8;
            modal.Close.gameObject.SetActive(!projection.ScrollHeader);
            at=PlaceText(purpose,at,cw)+12;
            at=modal.Selector(presetLabel,presetPrevious,presetNext,12,at,cw);
            at=PlaceText(nameLabel,at,cw)+4;modal.Place(NameInput,12,at,cw,44);at+=60;
            for(int i=0;i<2;i++)
            {
                at=PlaceText(bayHeadings[i],at,cw)+4;
                at=modal.Selector(bayNames[i],previous[i],next[i],12,at,cw);
                at=PlaceText(bayDetails[i],at,cw)+20;
            }
            at=PlaceText(modal.Status,at,cw)+12;
            if(cw<220)
            {modal.Place(apply,12,at,cw,44);modal.Place(cancel,12,at+52,cw,44);at+=104;}
            else
            {float cell=(cw-8)/2;modal.Place(apply,12,at,cell,44);modal.Place(cancel,20+cell,at,cell,44);at+=52;}
            pane.Finish(at+8);
            PlaceWorld(rotateLeft,projection.RotateLeft);PlaceWorld(rotateRight,projection.RotateRight);PlaceWorld(previewLabel,projection.PreviewLabel);
            previewLabel.gameObject.SetActive(projection.ShowPreviewLabel);
            var world=projection.World;loop.FrameArmory(new Rect(world.X/w,1-(world.Y+world.Height)/h,world.Width/w,world.Height/h));
            for(int i=0;i<2;i++){callouts[i].PixelRatio=Screen.width/w;callouts[i].Refresh(i<loop.Progression.EquipmentBayCount&&loop.ArmoryCanPreview);}
        }
        float PlaceText(Text text,float top,float width)
        {float size=modal.Preferred(text,width);modal.Place(text,12,top,width,size);return top+size;}
        void PlaceWorld(Component item,LastStandAppearanceLayout.Box box)=>modal.Place(item,box.X,box.Y,box.Width,box.Height);
        public void Reveal(Button button)=>pane.Reveal(button);
        public void RevealName()=>pane.Reveal(NameInput);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}

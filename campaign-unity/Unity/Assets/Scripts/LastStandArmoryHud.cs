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
        readonly RectTransform bayHeader;
        readonly Text purpose,presetLabel,nameLabel,previewLabel,skillsSummary;
        readonly Text[] bayHeadings=new Text[2],bayNames=new Text[2],bayDetails=new Text[2];
        readonly Button[] previous=new Button[2],next=new Button[2];
        readonly LastStandFittingCallout[] callouts=new LastStandFittingCallout[2];
        readonly RawImage[] illustrations=new RawImage[2];
        readonly RectTransform[] serviceCards=new RectTransform[2],dividers=new RectTransform[2];
        readonly Text[] serviceNames=new Text[2];
        readonly Button presetPrevious,presetNext,apply,cancel,rotateLeft,rotateRight,skills;
        public readonly InputField NameInput;
        bool open;
        float width,height,sx=1,sy=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Selectable[] Controls {get {var controls=new System.Collections.Generic.List<Selectable>(modal.Buttons);controls.Add(NameInput);return controls.ToArray();}}
        public Button InitialFocus=>modal.Close.gameObject.activeInHierarchy?modal.Close:cancel;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandArmoryHud(LastStandLoopController loop,Transform parent,Font font,Texture2D metal,Sprite surface)
        {
            this.loop=loop;modal=new LastStandModal("Armory",parent,font,loop.CancelArmory,metal,surface);
            modal.Title.text="ARMORY";modal.Close.GetComponentInChildren<Text>().text="CANCEL";
            modal.Shade.GetComponent<Image>().color=new Color(0,0,0,.04f);
            bayHeader=LastStandUiPrimitives.Node("ArmoryHeader",modal.Shade);bayHeader.SetAsFirstSibling();
            bayHeader.gameObject.AddComponent<EquipmentBayFrame>().raycastTarget=false;bayHeader.gameObject.SetActive(false);
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
                illustrations[i]=LastStandEquipmentArt.Icon(token+"Art",pane.Content,i+1);
                previous[i]=modal.Button(token+"Previous","<",pane.Content,()=>loop.MoveArmoryFitting(bay,-1));
                next[i]=modal.Button(token+"Next",">",pane.Content,()=>loop.MoveArmoryFitting(bay,1));
                callouts[i]=modal.Shade.gameObject.AddComponent<LastStandFittingCallout>();
                callouts[i].Initialize(parent.GetComponentInParent<Canvas>(),loop.GetComponent<SingedTerra.Art.TankPresentation>(),bayNames[i].rectTransform,
                    ()=>loop.ArmoryBayRenderers(bay),()=>loop.ArmoryBayName(bay),"ST_LS_ARMORY_BAY"+(i+1));
                callouts[i].SetTint(LastStandUiPrimitives.Brass);
                serviceCards[i]=LastStandUiPrimitives.Node(token+"ServiceCard",modal.Shade);
                serviceCards[i].gameObject.AddComponent<EquipmentBayFrame>().raycastTarget=false;
                serviceNames[i]=modal.Text(token+"ServiceName",serviceCards[i],18);serviceNames[i].color=LastStandUiPrimitives.Brass;
                dividers[i]=LastStandUiPrimitives.Node(token+"Divider",pane.Content);
                var divider=dividers[i].gameObject.AddComponent<Image>();divider.color=new Color(.65f,.51f,.29f,.4f);divider.raycastTarget=false;
            }
            apply=modal.Button("ArmoryApply","APPLY BUILD",pane.Content,loop.ApplyArmory);
            cancel=modal.Button("ArmoryCancel","CANCEL",pane.Content,loop.CancelArmory);
            skills=modal.Button("ArmorySkills","MANAGE SKILLS",pane.Content,loop.OpenSkillsFromArmory,14);
            skillsSummary=modal.Text("ArmorySkillsSummary",pane.Content,14);
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
                var loadout=loop.ArmoryDraft;
                if(loadout!=null&&(i==0||loadout.Secondary.HasValue))
                    LastStandEquipmentArt.Select(illustrations[i],LastStandEquipmentArt.Index(i==0?loadout.Primary:loadout.Secondary.Value));
                illustrations[i].color=available?Color.white:new Color(.45f,.43f,.37f,.5f);
                modal.Style(previous[i],loop.CanMoveArmoryFitting(i,-1),false);modal.Style(next[i],loop.CanMoveArmoryFitting(i,1),false);
            }
            modal.Style(apply,loop.ArmoryCanApply,true);modal.Style(cancel,true,false);modal.Style(modal.Close,true,false);
            skillsSummary.text=loop.ArmorySkillsSummary;skills.GetComponentInChildren<Text>().text=loop.ArmorySkillsNavigationLabel;
            modal.Style(skills,editable,false);
            modal.Style(rotateLeft,editable,false);modal.Style(rotateRight,editable,false);
            if(opened)pane.Reset();if(width>0)Layout(width,height,sx,sy);
        }
        public void Layout(float w,float h,float x,float y)
        {
            width=w;height=h;sx=x;sy=y;if(!open)return;
            if(LastStandHudLayout.HasEquipmentBay(w,h))
            {
                float density=Mathf.Max(1,Mathf.Min(w/1600,h/900));
                LayoutBay(w/density,h/density,x*density,y*density);return;
            }
            bayHeader.gameObject.SetActive(false);
            for(int i=0;i<2;i++){serviceCards[i].gameObject.SetActive(false);dividers[i].gameObject.SetActive(false);callouts[i].SetCard(bayNames[i].rectTransform);
                callouts[i].ConnectionPanel=modal.Panel;callouts[i].AvoidPanels=new[]{(RectTransform)rotateLeft.transform,(RectTransform)rotateRight.transform};}
            foreach(var illustration in illustrations)illustration.gameObject.SetActive(false);purpose.gameObject.SetActive(true);
            apply.transform.SetParent(pane.Content,false);cancel.transform.SetParent(pane.Content,false);
            skills.transform.SetParent(pane.Content,false);skillsSummary.transform.SetParent(pane.Content,false);modal.Title.text="ARMORY";
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
            at=PlaceText(skillsSummary,at,cw)+8;modal.Place(skills,12,at,cw,44);at+=60;
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
        void LayoutBay(float w,float h,float x,float y)
        {
            float ph=236,inner=w-52,left=302,cell=(inner-left-20)/2;
            modal.Title.transform.SetParent(modal.Shade,false);modal.Close.transform.SetParent(modal.Shade,false);
            modal.LayoutAt(w,h,x,y,new Rect(18,h-ph-18,w-36,ph));
            bayHeader.gameObject.SetActive(true);modal.Place(bayHeader,0,0,w,100);
            modal.Place(modal.Title,28,16,Math.Min(650,w-598),46);modal.Title.text="EQUIPMENT BAY / ARMORY";
            modal.Title.fontSize=Mathf.CeilToInt(30*y);modal.Close.gameObject.SetActive(false);
            pane.Layout(8,8,w-52,ph-16,x,y);purpose.gameObject.SetActive(false);
            modal.Place(nameLabel,12,8,left-24,22);modal.Place(NameInput,12,34,left-24,44);
            modal.Selector(presetLabel,presetPrevious,presetNext,12,94,left-24);
            modal.Place(modal.Status,12,150,left-24,62);
            for(int i=0;i<2;i++)
            {
                float xx=left+i*(cell+10);
                dividers[i].gameObject.SetActive(true);modal.Place(dividers[i],xx-12,12,1,ph-40);
                modal.Place(bayHeadings[i],xx,8,cell,24);
                illustrations[i].gameObject.SetActive(i<loop.Progression.EquipmentBayCount&&loop.ArmoryDraft!=null&&(i==0||loop.ArmoryDraft.Secondary.HasValue));
                modal.Place(illustrations[i],xx,49,100,100);
                modal.Selector(bayNames[i],previous[i],next[i],xx+110,34,cell-120);
                modal.Place(bayDetails[i],xx+110,90,cell-120,120);
                bool show=i<loop.Progression.EquipmentBayCount&&loop.ArmoryCanPreview;
                serviceCards[i].gameObject.SetActive(show);modal.Place(serviceCards[i],i==0?24:w-274,124,250,72);
                serviceNames[i].text="BAY "+(i+1)+" / "+loop.ArmoryBayName(i).ToUpperInvariant();
                modal.Place(serviceNames[i],16,14,218,48);callouts[i].SetCard(serviceCards[i]);
                callouts[i].ConnectionPanel=null;callouts[i].AvoidPanels=Array.Empty<RectTransform>();
            }
            apply.transform.SetParent(modal.Shade,false);cancel.transform.SetParent(modal.Shade,false);
            skills.transform.SetParent(modal.Shade,false);skillsSummary.transform.SetParent(modal.Shade,false);
            modal.Place(skills,w-542,18,196,44);modal.Place(skillsSummary,30,65,w-60,24);
            modal.Place(apply,w-330,18,180,44);modal.Place(cancel,w-132,18,108,44);
            pane.Finish(ph-16);
            previewLabel.gameObject.SetActive(false);
            modal.Place(rotateLeft,24,h-ph-72,44,44);modal.Place(rotateRight,w-68,h-ph-72,44,44);
            loop.FrameArmory(new Rect(.16f,(ph+90)/h,.68f,1-(ph+190)/h));
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

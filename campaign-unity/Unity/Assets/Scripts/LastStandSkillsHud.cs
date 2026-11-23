using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // Collection and preparation projection only. The existing controller and
    // progression transaction own drafts, draws, saved builds and refusal states.
    internal sealed class LastStandSkillsHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly Text wallet,selection,pool,earning;
        readonly RectTransform[] cards=new RectTransform[LastStandSkillCatalog.Count];
        readonly Text[] names=new Text[LastStandSkillCatalog.Count],types=new Text[LastStandSkillCatalog.Count],
            progress=new Text[LastStandSkillCatalog.Count],effects=new Text[LastStandSkillCatalog.Count];
        readonly Button[] equip=new Button[LastStandSkillCatalog.Count];
        readonly Button draw,apply,cancel,armory,retry;
        bool open;
        float width,height,sx=1,sy=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandSkillsHud(LastStandLoopController loop,Transform parent,Font font,Texture2D metal,Sprite surface)
        {
            this.loop=loop;modal=new LastStandModal("Skills",parent,font,loop.CloseMenu,metal,surface);
            modal.Title.text="SKILLS";modal.Close.GetComponentInChildren<Text>().text="CANCEL";
            pane=modal.Pane("Skills",scrollStatus:true);
            wallet=modal.Text("SkillsWallet",pane.Content,22);wallet.color=LastStandUiPrimitives.Brass;
            selection=modal.Text("SkillsSelection",pane.Content,16);
            pool=modal.Text("SkillsPool",pane.Content,14);
            earning=modal.Text("SkillsEarning",pane.Content,14);earning.color=new Color(.76f,.73f,.65f);
            draw=modal.Button("SkillsDraw","DRAW / 1 INTEL",pane.Content,loop.DrawSkill);
            foreach(var definition in LastStandSkillCatalog.All)
            {
                int i=(int)definition.Id;var id=definition.Id;string token="Skill"+id;
                cards[i]=LastStandUiPrimitives.Node(token+"Card",pane.Content);
                LastStandConsoleChrome.Surface(cards[i],surface,false,false).color=LastStandUiPrimitives.Graphite;
                LastStandConsoleChrome.Frame(cards[i],metal);
                // Keep controls as direct content children so the shared scroll
                // owner can reveal their actual content-space position.
                names[i]=modal.Text(token+"Name",pane.Content,20);names[i].color=LastStandUiPrimitives.Brass;
                types[i]=modal.Text(token+"Type",pane.Content,14);
                progress[i]=modal.Text(token+"Progress",pane.Content,14);
                effects[i]=modal.Text(token+"Effect",pane.Content,16);
                equip[i]=modal.Button(token+"Equip","EQUIP",pane.Content,()=>loop.ToggleSkill(id));
            }
            apply=modal.Button("SkillsApply","APPLY SKILLS",pane.Content,loop.ApplySkills);
            cancel=modal.Button("SkillsCancel","CANCEL",pane.Content,loop.CloseMenu);
            armory=modal.Button("SkillsArmory","ARMORY & BUILDS",pane.Content,loop.OpenArmory);
            retry=modal.Button("SkillsRetrySave","RETRY GAMEPLAY SAVE",pane.Content,loop.RetrySave);
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible)
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(open);if(!open)return;
            var p=loop.Progression;var draft=loop.SkillDraft;int slots=p.SkillSlotCount,best=p.GetBestWave(1);
            wallet.text="SKILL INTEL  "+p.SkillIntel;
            var selected=new List<string>();foreach(var id in draft.Ids)selected.Add(LastStandSkillCatalog.Get(id).Name);
            string next=slots==0?"First slot: Tier 1 wave 25.":slots==1?"Next slot: Tier 1 wave 100.":slots==2?"Final slot: Tier 1 wave 500.":"All three slots unlocked.";
            selection.text="EQUIPPED  "+draft.Count+" / "+slots+"  ·  "+(selected.Count==0?"None":String.Join(" / ",selected))+"\n"+
                "Active and passive skills share these slots. "+next;
            int count=p.SkillDrawPool.Count;
            pool.text=count>0?"DRAW POOL  "+count+" eligible skills · Equal chance: 1 in "+count+" each.\nFirst copy unlocks a skill. Duplicate copies develop its rank; maxed skills leave the pool.":
                best<25?"Draws unlock at Tier 1 wave 25. Milestones add skills to the pool; you still draw them to gain ownership.":
                "Eligible collection complete. No Intel will be spent. Later milestones may add more skills to the pool.";
            earning.text="EARN INTEL  ·  1 at each 100th cleared wave in any tier, plus first clears of Tier 1 waves 25 and 50.\n"+
                "One draw costs 1 Intel. Rank 1 / 2 / 3 requires 1 / 3 / 6 total copies.";
            modal.Status.text=loop.SkillsStatus;
            foreach(var definition in LastStandSkillCatalog.All)
            {
                int i=(int)definition.Id,rank=p.SkillRank(definition.Id),copies=p.SkillCopies(definition.Id);
                bool eligible=p.IsSkillEligible(definition.Id),chosen=draft.Contains(definition.Id),maxed=rank==LastStandSkillCatalog.MaximumRank;
                names[i].text=definition.Name.ToUpperInvariant();
                types[i].text=definition.IsActive?"ACTIVE  /  ONE USE PER RUN":"PASSIVE  /  ALWAYS IN EFFECT";
                progress[i].text=!eligible?"POOL LOCKED  ·  Tier 1 wave "+definition.UnlockWave:
                    rank==0?"ELIGIBLE TO DRAW  ·  Not owned":maxed?"RANK "+rank+" / "+LastStandSkillCatalog.MaximumRank+"  ·  MAXED":
                    "RANK "+rank+" / "+LastStandSkillCatalog.MaximumRank+"  ·  "+copies+" / "+LastStandSkillCatalog.CopiesForRank(rank+1)+" copies to next rank";
                effects[i].text=LastStandSkillCatalog.EffectText(definition.Id,rank)+(rank==0?"\nRank 1 preview.":"");
                equip[i].GetComponentInChildren<Text>().text=chosen?"REMOVE":!eligible?"POOL LOCKED":rank==0?"DRAW TO ACQUIRE":draft.Count>=slots?"SLOTS FULL":"EQUIP";
                modal.Style(equip[i],loop.CanToggleSkill(definition.Id),chosen);
                cards[i].GetComponent<Image>().color=chosen?new Color(.19f,.175f,.12f):LastStandUiPrimitives.Graphite;
            }
            draw.GetComponentInChildren<Text>().text=count==0?(best<25?"DRAW LOCKED":"COLLECTION COMPLETE"):"DRAW / "+LastStandSkillCatalog.DrawCost+" INTEL";
            modal.Style(draw,loop.SkillsCanDraw,true);modal.Style(apply,loop.SkillsCanApply,true);
            modal.Style(cancel,true,false);modal.Style(modal.Close,true,false);
            bool saved=draft.Equals(p.SelectedSkills);
            armory.GetComponentInChildren<Text>().text=saved?"ARMORY & BUILDS":"ARMORY / CANCEL DRAFT";
            modal.Style(armory,loop.CanCustomizeBuild,false);
            retry.gameObject.SetActive(p.SaveState!="ready");modal.Style(retry,p.SaveState!="ready",false);
            if(justOpened)pane.Reset();if(width>0)Layout(width,height,sx,sy);
        }
        public void Layout(float w,float h,float x,float y)
        {
            width=w;height=h;sx=x;sy=y;if(!open)return;
            float pw=Math.Min(1240,w-16),ph=Math.Min(900,h-16);
            modal.LayoutAt(w,h,x,y,new Rect((w-pw)/2,(h-ph)/2,pw,ph));
            float top=modal.HeaderBottom,cw=pw-48;
            pane.Layout(12,top,pw-24,Math.Max(44,ph-top-12),x,y);
            float at=8;
            if(cw>=540)
            {float th=Math.Max(44,modal.Preferred(wallet,cw-232));modal.Place(wallet,12,at,cw-232,th);modal.Place(draw,12+cw-220,at,220,44);at+=th+12;}
            else{at=PlaceText(wallet,12,at,cw)+8;modal.Place(draw,12,at,cw,44);at+=56;}
            at=PlaceText(selection,12,at,cw)+12;
            at=PlaceText(pool,12,at,cw)+8;
            at=PlaceText(earning,12,at,cw)+16;
            int columns=cw>=960?3:cw>=600?2:1;float cell=(cw-(columns-1)*12)/columns;
            for(int row=0;row<LastStandSkillCatalog.Count;row+=columns)
            {
                float maximum=0;
                for(int col=0;col<columns&&row+col<cards.Length;col++)
                {
                    int i=row+col;float xx=12+col*(cell+12),body=cell-28,pos=at+14;
                    pos=PlaceText(names[i],xx+14,pos,body)+5;
                    pos=PlaceText(types[i],xx+14,pos,body)+10;
                    pos=PlaceText(progress[i],xx+14,pos,body)+10;
                    pos=PlaceText(effects[i],xx+14,pos,body)+16;
                    maximum=Math.Max(maximum,pos-at+44+14);
                }
                for(int col=0;col<columns&&row+col<cards.Length;col++)
                {int i=row+col;float xx=12+col*(cell+12);modal.Place(cards[i],xx,at,cell,maximum);modal.Place(equip[i],xx+14,at+maximum-58,cell-28,44);}
                at+=maximum+12;
            }
            at=PlaceText(modal.Status,12,at+4,cw)+12;
            if(retry.gameObject.activeSelf){modal.Place(retry,12,at,cw,44);at+=56;}
            if(cw>=620)
            {float third=(cw-24)/3;modal.Place(apply,12,at,third,44);modal.Place(cancel,24+third,at,third,44);modal.Place(armory,36+2*third,at,third,44);at+=56;}
            else
            {modal.Place(apply,12,at,cw,44);at+=52;modal.Place(cancel,12,at,cw,44);at+=52;modal.Place(armory,12,at,cw,44);at+=56;}
            pane.Finish(at+8);
        }
        float PlaceText(Text text,float left,float top,float width)
        {float size=modal.Preferred(text,width);modal.Place(text,left,top,width,size);return top+size;}
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}

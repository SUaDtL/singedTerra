using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // Rendering only. The controller owns menu pause, save transactions and the
    // existing shared keyboard dispatcher; this class installs no input loop.
    public sealed class LastStandResearchHud
    {
        readonly LastStandModal modal;
        readonly LastStandScrollPane listPane, detailPane;
        readonly Action refresh;
        readonly Action<LastStandResearchIntent> submit;
        readonly Button filter, back;
        readonly Text detail,listStatus;
        readonly List<Button> projects=new List<Button>();
        readonly List<Button> actions=new List<Button>();
        readonly List<Text> slotLabels=new List<Text>();
        readonly Dictionary<Button,LastStandResearchIntent> intents=new Dictionary<Button,LastStandResearchIntent>();
        readonly LastStandResearchList list;
        readonly List<LastStandResearchListEntry> entries=new List<LastStandResearchListEntry>();
        readonly string[] filters={"","Combat","Economy","Research"};
        LastStandResearchSnapshot snapshot;
        long balance;int bestWave,filterIndex;bool canAct,open,detailSelected,narrow;
        float width,height,unitsX=1,unitsY=1;
        string status="";
        public Action<Button> FocusRequested { get; set; }
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close;
        public float ScrollOffset=>detailSelected?detailPane.Offset:listPane.Offset;
        public float MaximumScrollOffset=>detailSelected?detailPane.MaximumOffset:listPane.MaximumOffset;

        public LastStandResearchHud(Transform parent,Font font,Action close,Action refresh,
            Action<LastStandResearchIntent> submit,Texture2D metal=null,Sprite surface=null)
        {
            this.refresh=refresh??throw new ArgumentNullException(nameof(refresh));
            this.submit=submit??throw new ArgumentNullException(nameof(submit));
            modal=new LastStandModal("Research",parent,font,close,metal,surface);
            listPane=modal.Pane("ResearchList");detailPane=modal.Pane("ResearchDetail");
            listStatus=modal.Text("ResearchSlotSummary",listPane.Content,16);
            filter=modal.Button("ResearchFilter","FILTER: ALL",modal.Panel,()=>
            {filterIndex=(filterIndex+1)%filters.Length;list.Filter(filters[filterIndex],"");detailSelected=false;listPane.Reset();RefreshContent();refresh();});
            back=modal.Button("ResearchBack","BACK TO PROJECTS",modal.Panel,()=>
            {detailSelected=false;RefreshContent();refresh();FocusRequested?.Invoke(filter);});
            foreach(var definition in LastStandResearchCatalog.Tracks)
                entries.Add(new LastStandResearchListEntry(definition.Key,definition.Name,LastStandResearchPresentation.Category(definition.Id)));
            list=new LastStandResearchList(entries);
            foreach(var entry in entries)
            {
                string key=entry.Key;
                projects.Add(modal.Button("ResearchProject-"+key,entry.Name,listPane.Content,()=>
                {list.Select(key);detailSelected=true;detailPane.Reset();RefreshContent();refresh();if(narrow)FocusRequested?.Invoke(back);}));
            }
            detail=modal.Text("ResearchDescription",detailPane.Content,16);
            for(int i=0;i<LastStandResearchCatalog.SlotCount;i++)
            {
                slotLabels.Add(modal.Text("ResearchSlot"+i,detailPane.Content,16));
                foreach(var action in new[]{LastStandResearchAction.Start,LastStandResearchAction.Queue,
                    LastStandResearchAction.Switch,LastStandResearchAction.Suspend,LastStandResearchAction.RemoveQueued})
                {
                    Button button=null;
                    button=modal.Button("Research"+action+i,"",detailPane.Content,()=>
                    {if(intents.TryGetValue(button,out var intent))this.submit(intent);});
                    actions.Add(button);
                }
            }
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible,LastStandResearchSnapshot research,int bestTierOneWave,long salvageBalance,bool actionsAllowed,string saveStatus)
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(open);if(!open)return;
            if(research==null)throw new ArgumentNullException(nameof(research));
            snapshot=research.Clone();bestWave=bestTierOneWave;balance=salvageBalance;canAct=actionsAllowed;status=saveStatus??"";
            if(justOpened){detailSelected=false;listPane.Reset();detailPane.Reset();}
            RefreshContent();
        }
        LastStandResearchTrackId Selected
        {
            get {foreach(var definition in LastStandResearchCatalog.Tracks)if(definition.Key==list.SelectedKey)return definition.Id;
                return LastStandResearchTrackId.GameSpeed;}
        }
        void RefreshContent()
        {
            if(!open||snapshot==null)return;
            int unlocked=LastStandResearchCatalog.UnlockedSlots(bestWave);
            modal.Title.text="RESEARCH LAB";
            modal.Status.text="SALVAGE "+balance.ToString("N0")+"  |  "+unlocked+" / "+snapshot.slots.Length+" labs unlocked"+
                (status.Length>0?"\n"+(status.Length>100?status.Substring(0,97)+"...":status):"");
            filter.GetComponentInChildren<Text>().text="FILTER: "+(filterIndex==0?"ALL":filters[filterIndex].ToUpperInvariant());
            listStatus.text="";
            for(int i=0;i<snapshot.slots.Length;i++)
                listStatus.text+=(i>0?"\n\n":"")+"LAB "+(i+1)+": "+(i>=unlocked?"Unlock at T1 wave "+(i==0?25:100):
                    LastStandResearchPresentation.Project(snapshot.slots[i].active))+"\n"+
                    (snapshot.slots[i].queued==null?"": "Next: "+LastStandResearchPresentation.Project(snapshot.slots[i].queued,true));
            for(int i=0;i<entries.Count;i++)
            {
                bool shown=false;foreach(var item in list.Visible)if(item.Key==entries[i].Key)shown=true;
                var button=projects[i];button.gameObject.SetActive(shown);
                var track=LastStandResearchCatalog.Tracks[i];
                button.GetComponentInChildren<Text>().text=track.Name+"  "+snapshot.Rank(track.Id)+" / "+track.MaximumRank+
                    "\n"+LastStandResearchPresentation.TrackState(snapshot,track.Id);
                modal.Style(button,true,track.Key==list.SelectedKey);
            }
            var selected=LastStandResearchCatalog.Get(Selected);int rank=snapshot.Rank(Selected);
            detail.text=(status.Length>100?status+"\n\n":"")+selected.Name.ToUpperInvariant()+"  |  "+rank+" / "+selected.MaximumRank+" COMPLETED\n"+
                LastStandResearchPresentation.Effect(Selected,rank)+"\n\n";
            if(rank<selected.MaximumRank)
            {
                var next=LastStandResearchPresentation.Intent(snapshot,0,Selected,LastStandResearchAction.Start);
                detail.text+="NEXT: "+LastStandResearchPresentation.Effect(Selected,rank+1)+"\n"+
                    LastStandResearchPresentation.Quote(snapshot,next)+"\n";
            }
            else detail.text+="This track is complete. Its benefit remains active.\n";
            detail.text+="\nResearch uses the same Salvage as permanent Workshop upgrades. Timers keep running while paused or closed; combat speed does not change them.\n"+
                "Switching or suspending saves elapsed research time and refunds its cost. Resuming pays that cost again. Queued work is paid now; no automatic repeat purchases.";
            if(snapshot.completionSequence>0)detail.text+="\nCompleted research ranks: "+snapshot.completionSequence+". Completed benefits are already applied.";
            intents.Clear();
            for(int i=0;i<snapshot.slots.Length;i++)
            {
                var slot=snapshot.slots[i];bool locked=i>=unlocked;
                slotLabels[i].text="LAB "+(i+1)+(locked?" - LOCKED: clear Tier 1 wave "+(i==0?25:100):
                    "\nACTIVE: "+LastStandResearchPresentation.Project(slot.active)+"\nQUEUED: "+LastStandResearchPresentation.Project(slot.queued,true));
                if(slot.active!=null)slotLabels[i].text+="\nSuspend refunds "+slot.active.chargedCost+" Salvage and keeps elapsed time.";
                if(slot.queued!=null)slotLabels[i].text+="\nRemove queued refunds "+slot.queued.chargedCost+" Salvage.";
                for(int a=0;a<5;a++)
                {
                    var button=actions[i*5+a];var action=(new[]{LastStandResearchAction.Start,LastStandResearchAction.Queue,
                        LastStandResearchAction.Switch,LastStandResearchAction.Suspend,LastStandResearchAction.RemoveQueued})[a];
                    bool shown=!locked && (action==LastStandResearchAction.Start?slot.active==null:
                        action==LastStandResearchAction.RemoveQueued?slot.queued!=null:
                        action==LastStandResearchAction.Queue?slot.active!=null&&slot.queued==null:slot.active!=null);
                    button.gameObject.SetActive(shown);if(!shown)continue;
                    var intent=LastStandResearchPresentation.Intent(snapshot,i,Selected,action);intents[button]=intent;
                    bool possible=canAct&&LastStandResearchPresentation.CanSubmit(snapshot,intent,balance,bestWave);
                    string label=action==LastStandResearchAction.Start?"START / RESUME":action==LastStandResearchAction.Queue?"QUEUE":
                        action==LastStandResearchAction.Switch?"SWITCH TO":action==LastStandResearchAction.Suspend?"SUSPEND ACTIVE":"REMOVE QUEUED";
                    if(action==LastStandResearchAction.Start||action==LastStandResearchAction.Queue||action==LastStandResearchAction.Switch)
                        label+=" "+selected.Name+"\n"+LastStandResearchPresentation.Quote(snapshot,intent);
                    button.GetComponentInChildren<Text>().text=label;modal.Style(button,possible,false);
                }
            }
            if(width>0)Layout(width,height,unitsX,unitsY);
        }
        public void Layout(float w,float h,float sx,float sy)
        {
            width=w;height=h;unitsX=sx;unitsY=sy;if(!open)return;
            float panelWidth=modal.Layout(w,h,sx,sy,980);narrow=panelWidth<720;
            float top=modal.HeaderBottom;
            filter.gameObject.SetActive(!narrow||!detailSelected);back.gameObject.SetActive(narrow&&detailSelected);
            modal.Place(filter,12,top,panelWidth-24,44);modal.Place(back,12,top,panelWidth-24,44);top+=52;
            float available=Math.Max(44,modal.PanelHeight-top-12),inner=panelWidth-24;
            listPane.Viewport.gameObject.SetActive(!narrow||!detailSelected);
            detailPane.Viewport.gameObject.SetActive(!narrow||detailSelected);
            float left=narrow?inner:Math.Min(310,inner*.36f),right=narrow?inner:inner-left-12;
            listPane.Layout(12,top,left,available,sx,sy);detailPane.Layout(narrow?12:24+left,top,right,available,sx,sy);
            float y=8;
            float summaryHeight=modal.Preferred(listStatus,left-24)+12;modal.Place(listStatus,12,y,left-24,summaryHeight);y+=summaryHeight+8;
            foreach(var button in projects)if(button.gameObject.activeSelf)
            {float row=Math.Max(64,modal.Preferred(button.GetComponentInChildren<Text>(),left-32)+16);modal.Place(button,8,y,left-16,row);y+=row+8;}
            listPane.Finish(y+8);
            y=8;float textHeight=modal.Preferred(detail,right-24)+8;modal.Place(detail,12,y,right-24,textHeight);y+=textHeight+12;
            for(int i=0;i<slotLabels.Count;i++)
            {
                float row=modal.Preferred(slotLabels[i],right-24)+12;modal.Place(slotLabels[i],12,y,right-24,row);y+=row+4;
                for(int a=0;a<5;a++)
                {var button=actions[i*5+a];if(!button.gameObject.activeSelf)continue;
                 row=Math.Max(44,modal.Preferred(button.GetComponentInChildren<Text>(),right-40)+16);
                 modal.Place(button,12,y,right-24,row);y+=row+8;}
                y+=16;
            }
            detailPane.Finish(y+8);
        }
        public void Reveal(Button button)
        {
            if(button && !narrow)
            {if(button.transform.IsChildOf(listPane.Content))detailSelected=false;
             else if(button.transform.IsChildOf(detailPane.Content))detailSelected=true;}
            listPane.Reveal(button);detailPane.Reveal(button);
        }
        public void ScrollKeyboard(string direction)
        {if(open)(detailSelected?detailPane:listPane).ScrollKeyboard(direction);}
    }

}

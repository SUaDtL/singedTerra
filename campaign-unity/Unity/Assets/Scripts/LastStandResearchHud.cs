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
        readonly Button filter, back, help;
        readonly Text detail,listStatus,helpText;
        readonly List<Button> projects=new List<Button>();
        readonly List<Button> actions=new List<Button>();
        readonly List<Text> actionDetails=new List<Text>();
        readonly List<Text> slotLabels=new List<Text>();
        readonly Dictionary<Button,LastStandResearchIntent> intents=new Dictionary<Button,LastStandResearchIntent>();
        readonly LastStandResearchList list;
        readonly List<LastStandResearchListEntry> entries=new List<LastStandResearchListEntry>();
        readonly string[] filters={"","Combat","Economy","Research"};
        LastStandResearchSnapshot snapshot;
        long balance;int bestWave,filterIndex;bool canAct,open,detailSelected,narrow,helpOpen;
        float width,height,unitsX=1,unitsY=1;
        string status="";
        public Action<Button> FocusRequested { get; set; }
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close;
        public float ScrollOffset=>detailSelected?detailPane.Offset:listPane.Offset;
        public float MaximumScrollOffset=>detailSelected?detailPane.MaximumOffset:listPane.MaximumOffset;
        public float ListScrollOffset=>listPane.Offset;
        public float ListMaximumScrollOffset=>listPane.MaximumOffset;
        public float DetailScrollOffset=>detailPane.Offset;
        public float DetailMaximumScrollOffset=>detailPane.MaximumOffset;

        public LastStandResearchHud(Transform parent,Font font,Action close,Action refresh,
            Action<LastStandResearchIntent> submit,Texture2D metal=null,Sprite surface=null)
        {
            this.refresh=refresh??throw new ArgumentNullException(nameof(refresh));
            this.submit=submit??throw new ArgumentNullException(nameof(submit));
            modal=new LastStandModal("Research",parent,font,close,metal,surface);
            listPane=modal.Pane("ResearchList",true);detailPane=modal.Pane("ResearchDetail");
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
                    actionDetails.Add(modal.Text("Research"+action+"Detail"+i,detailPane.Content,16));
                }
            }
            help=modal.Button("ResearchHelp","HOW RESEARCH WORKS",detailPane.Content,()=>
            {helpOpen=!helpOpen;RefreshContent();refresh();});
            helpText=modal.Text("ResearchHelpBody",detailPane.Content,16);
            modal.Shade.gameObject.SetActive(false);
        }
        public void Refresh(bool visible,LastStandResearchSnapshot research,int bestTierOneWave,long salvageBalance,bool actionsAllowed,string saveStatus)
        {
            bool justOpened=visible&&!open;open=visible;modal.Shade.gameObject.SetActive(open);if(!open)return;
            if(research==null)throw new ArgumentNullException(nameof(research));
            snapshot=research.Clone();bestWave=bestTierOneWave;balance=salvageBalance;canAct=actionsAllowed;status=saveStatus??"";
            if(justOpened){detailSelected=false;helpOpen=false;listPane.Reset();detailPane.Reset();}
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
            modal.Status.text=(unlocked==0?"RESEARCH LOCKED - clear Tier 1, wave 25\n":"")+
                balance.ToString("N0")+" SALVAGE  |  "+(unlocked==0?"Best Tier 1 wave: "+bestWave:unlocked+" labs open")+
                (status.Length>0&&status!="Research saved."?"\n"+(status.Length>100?status.Substring(0,97)+"...":status):"");
            filter.GetComponentInChildren<Text>().text="FILTER: "+(filterIndex==0?"ALL":filters[filterIndex].ToUpperInvariant());
            listStatus.text=unlocked==0?"PREVIEW UPGRADES\nClear wave 25, then choose a project to start.":
                "CHOOSE AN UPGRADE\nSelect a project, then start it in an idle lab.";
            if(unlocked>0)for(int i=0;i<unlocked;i++)
                listStatus.text+="\n\nLab "+(i+1)+": "+LastStandResearchPresentation.Project(snapshot.slots[i].active);
            for(int i=0;i<entries.Count;i++)
            {
                bool shown=false;foreach(var item in list.Visible)if(item.Key==entries[i].Key)shown=true;
                var button=projects[i];button.gameObject.SetActive(shown);
                var track=LastStandResearchCatalog.Tracks[i];
                button.GetComponentInChildren<Text>().text=track.Name+"  "+snapshot.Rank(track.Id)+" / "+track.MaximumRank+
                    "\n"+LastStandResearchPresentation.Availability(snapshot,track.Id,balance,bestWave,canAct);
                modal.Style(button,true,track.Key==list.SelectedKey);
            }
            var selected=LastStandResearchCatalog.Get(Selected);int rank=snapshot.Rank(Selected);
            detail.text=selected.Name.ToUpperInvariant()+"  |  Rank "+rank+" / "+selected.MaximumRank+"\n"+
                "Now: "+LastStandResearchPresentation.Effect(Selected,rank)+"\n\n";
            if(rank<selected.MaximumRank)
            {
                int fundedLab=-1;LastStandResearchProjectSnapshot funded=null;
                for(int i=0;i<snapshot.slots.Length;i++)
                    foreach(var project in new[]{snapshot.slots[i].active,snapshot.slots[i].queued})
                        if(project!=null&&project.track==Selected&&project.rank==rank+1){funded=project;fundedLab=i;}
                detail.text+="NEXT UPGRADE\n"+LastStandResearchPresentation.Effect(Selected,rank+1)+"\n\n";
                if(funded!=null)detail.text+="PAID - Lab "+(fundedLab+1)+"\n"+LastStandResearchPresentation.Project(funded,funded==snapshot.slots[fundedLab].queued);
                else
                {
                    var quote=LastStandResearchPresentation.ProjectQuote(snapshot,Selected,rank+1);
                    detail.text+="COST  "+quote.Cost.ToString("N0")+" Salvage\nTIME  "+LastStandResearchPresentation.Duration(quote.RemainingMilliseconds)+
                        (quote.ResumesPartial?" remaining (saved progress)":" real time")+
                        (unlocked>0&&quote.Cost>balance?"\n"+LastStandResearchPresentation.Availability(snapshot,Selected,balance,bestWave,canAct):"");
                }
            }
            else detail.text+="This track is complete. Its benefit remains active.\n";
            detail.text+="\n\n"+(unlocked==0?"Clear Tier 1, wave 25 to start research.\nYour best: wave "+bestWave+" / 25.":
                !canAct?(status.Length>0?status:"Research actions are unavailable until the save is ready."):
                "Research continues while you play or close the game.");
            help.GetComponentInChildren<Text>().text=helpOpen?"HIDE RESEARCH HELP":"HOW RESEARCH WORKS";
            helpText.gameObject.SetActive(helpOpen);
            helpText.text="Salvage also pays for permanent Workshop upgrades. Starting research spends the shown cost once.\n\n"+
                "Lab 1 unlocks at Tier 1 wave 25; Lab 2 at wave 100. Each lab runs one project and can hold one paid queued project. Queue duration is an estimate until it starts.\n\n"+
                "Timers use real time, including while paused or closed. Combat speed does not change research time. Completed benefits apply automatically.\n\n"+
                "Switching or suspending refunds the active project's cost and saves elapsed time. Resuming repays that cost. Removing a queued project refunds it. Nothing buys another rank automatically.";
            intents.Clear();
            for(int i=0;i<snapshot.slots.Length;i++)
            {
                var slot=snapshot.slots[i];bool locked=i>=unlocked;
                slotLabels[i].gameObject.SetActive(unlocked>0);
                slotLabels[i].text="LAB "+(i+1)+(locked?" - unlocks at Tier 1, wave 100":
                    slot.active==null?" - READY":"\n"+LastStandResearchPresentation.Project(slot.active));
                if(slot.queued!=null)slotLabels[i].text+="\nNext: "+LastStandResearchPresentation.Project(slot.queued,true);
                for(int a=0;a<5;a++)
                {
                    var button=actions[i*5+a];var action=(new[]{LastStandResearchAction.Start,LastStandResearchAction.Queue,
                        LastStandResearchAction.Switch,LastStandResearchAction.Suspend,LastStandResearchAction.RemoveQueued})[a];
                    bool shown=!locked && (action==LastStandResearchAction.Start?slot.active==null:
                        action==LastStandResearchAction.RemoveQueued?slot.queued!=null:
                        action==LastStandResearchAction.Queue?slot.active!=null&&slot.queued==null:slot.active!=null);
                    var intent=LastStandResearchPresentation.Intent(snapshot,i,Selected,action);
                    var offer=LastStandResearchPresentation.ProjectAction(snapshot,intent,balance,bestWave);
                    if(action==LastStandResearchAction.Start||action==LastStandResearchAction.Queue||action==LastStandResearchAction.Switch)
                        shown=shown&&offer.ValidWhenFunded;
                    button.gameObject.SetActive(shown);var explanation=actionDetails[i*5+a];explanation.gameObject.SetActive(shown);
                    if(!shown)continue;
                    intents[button]=intent;
                    bool possible=canAct&&offer.CanSubmit;var quote=offer.Funding;
                    string label=action==LastStandResearchAction.Start?(quote!=null&&quote.ResumesPartial?"RESUME RESEARCH":"START RESEARCH"):
                        action==LastStandResearchAction.Queue?"QUEUE RESEARCH":action==LastStandResearchAction.Switch?"SWITCH PROJECT":
                        action==LastStandResearchAction.Suspend?"SUSPEND PROJECT":"REMOVE QUEUED";
                    string actionText=action==LastStandResearchAction.Suspend?"Refund "+offer.Refund+" Salvage; keeps elapsed time.":
                        action==LastStandResearchAction.RemoveQueued?"Refund "+offer.Refund+" Salvage.":"";
                    if(action==LastStandResearchAction.Start||action==LastStandResearchAction.Queue||action==LastStandResearchAction.Switch)
                    {
                        actionText=selected.Name+(quote==null?" - all ranks funded":
                            " "+quote.Rank+" | Pay "+quote.Cost.ToString("N0")+" Salvage");
                        if(action==LastStandResearchAction.Queue&&quote!=null)actionText+=" | "+LastStandResearchPresentation.Duration(quote.RemainingMilliseconds)+" est.";
                        if(action==LastStandResearchAction.Switch)actionText+="\nRefunds "+offer.Refund+" Salvage; saves elapsed time";
                        if(!possible)actionText+="\n"+(!canAct?"Save unavailable":quote==null?"All ranks completed or funded":
                            offer.ValidWhenFunded&&offer.Shortfall>0?
                            "Need "+offer.Shortfall.ToString("N0")+" more Salvage":
                            "Project already funded or waiting on an earlier rank");
                    }
                    if(offer.RemovesQueuedProject&&action!=LastStandResearchAction.RemoveQueued)
                        actionText+="\nAlso removes and refunds the queued next rank.";
                    if(offer.StartsQueuedProject)actionText+="\nStarts the already-paid queued project.";
                    explanation.text=actionText;
                    button.GetComponentInChildren<Text>().text=label;modal.Style(button,possible,possible&&action==LastStandResearchAction.Start);
                }
                bool hasAction=false;for(int a=0;a<5;a++)hasAction|=actions[i*5+a].gameObject.activeSelf;
                slotLabels[i].gameObject.SetActive(unlocked>0&&(locked||hasAction));
            }
            if(width>0)Layout(width,height,unitsX,unitsY);
        }
        public void Layout(float w,float h,float sx,float sy)
        {
            width=w;height=h;unitsX=sx;unitsY=sy;if(!open)return;
            float panelWidth=modal.Layout(w,h,sx,sy,980);narrow=panelWidth<720;
            float top=modal.HeaderBottom;
            filter.gameObject.SetActive(!narrow||!detailSelected);back.gameObject.SetActive(narrow&&detailSelected);
            filter.transform.SetParent(listPane.Content,false);back.transform.SetParent(detailPane.Content,false);
            modal.Status.transform.SetParent(narrow&&detailSelected?detailPane.Content:listPane.Content,false);
            float available=Math.Max(44,modal.PanelHeight-top-12),inner=panelWidth-24;
            listPane.Viewport.gameObject.SetActive(!narrow||!detailSelected);
            detailPane.Viewport.gameObject.SetActive(!narrow||detailSelected);
            float left=narrow?inner:Math.Min(310,inner*.36f),right=narrow?inner:inner-left-12;
            listPane.Layout(12,top,left,available,sx,sy);detailPane.Layout(narrow?12:24+left,top,right,available,sx,sy);
            float y=8;
            if(!narrow||!detailSelected){float sh=modal.Preferred(modal.Status,left-24)+8;modal.Place(modal.Status,12,y,left-24,sh);y+=sh+8;}
            modal.Place(filter,8,y,left-16,44);y+=52;
            float summaryHeight=modal.Preferred(listStatus,left-24)+12;modal.Place(listStatus,12,y,left-24,summaryHeight);y+=summaryHeight+8;
            foreach(var button in projects)if(button.gameObject.activeSelf)
            {float row=Math.Max(64,modal.Preferred(button.GetComponentInChildren<Text>(),left-32)+16);modal.Place(button,8,y,left-16,row);y+=row+8;}
            listPane.Finish(y+8);
            y=8;
            if(narrow&&detailSelected)
            {
                modal.Place(back,12,y,right-24,44);y+=52;
                float sh=modal.Preferred(modal.Status,right-24)+8;modal.Place(modal.Status,12,y,right-24,sh);y+=sh+8;
            }
            float textHeight=modal.Preferred(detail,right-24)+8;modal.Place(detail,12,y,right-24,textHeight);y+=textHeight+12;
            // Put the immediate start before management of occupied labs. Keep
            // stable lab identities in intents and diagnostics despite display order.
            var slotOrder=new List<int>();for(int i=0;i<slotLabels.Count;i++)slotOrder.Add(i);
            int unlocked=LastStandResearchCatalog.UnlockedSlots(bestWave);
            slotOrder.Sort((a,b)=>
            {
                int left=a>=unlocked?2:snapshot.slots[a].active==null?0:1;
                int right=b>=unlocked?2:snapshot.slots[b].active==null?0:1;
                return left==right?a.CompareTo(b):left.CompareTo(right);
            });
            foreach(int i in slotOrder)
            {
                float row=0;
                if(slotLabels[i].gameObject.activeSelf)
                {row=modal.Preferred(slotLabels[i],right-24)+12;modal.Place(slotLabels[i],12,y,right-24,row);y+=row+4;}
                for(int a=0;a<5;a++)
                {var button=actions[i*5+a];if(!button.gameObject.activeSelf)continue;
                 var explanation=actionDetails[i*5+a];row=modal.Preferred(explanation,right-24)+8;
                 modal.Place(explanation,12,y,right-24,row);y+=row+4;
                 row=Math.Max(44,modal.Preferred(button.GetComponentInChildren<Text>(),right-40)+12);
                 modal.Place(button,12,y,right-24,row);y+=row+12;}
                if(slotLabels[i].gameObject.activeSelf)y+=16;
            }
            modal.Place(help,12,y,right-24,44);y+=52;
            if(helpOpen){float row=modal.Preferred(helpText,right-24)+12;modal.Place(helpText,12,y,right-24,row);y+=row;}
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

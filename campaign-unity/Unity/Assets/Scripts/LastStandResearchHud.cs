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
        readonly LastStandProgressionModal modal;
        readonly LastStandProgressionPane listPane, detailPane;
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
            modal=new LastStandProgressionModal("Research",parent,font,close,metal,surface);
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
                button.GetComponentInChildren<Text>().text=track.Name+"  "+snapshot.completedRanks[i]+" / "+track.MaximumRank+
                    "\n"+LastStandResearchPresentation.TrackState(snapshot,track.Id);
                modal.Style(button,true,track.Key==list.SelectedKey);
            }
            var selected=LastStandResearchCatalog.Get(Selected);int rank=snapshot.completedRanks[(int)Selected];
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

    // Shared chrome/layout plumbing for the Lab and history surfaces. It uses
    // the same clipped material mesh and feedback component as existing menus.
    internal sealed class LastStandProgressionModal
    {
        readonly Font font;readonly Texture2D metal;readonly Sprite surface;
        readonly Dictionary<Text,int> textSizes=new Dictionary<Text,int>();
        float sx=1,sy=1;
        public readonly RectTransform Shade,Panel;
        public readonly Text Title,Status;
        public readonly Button Close;
        public readonly List<Button> Buttons=new List<Button>();
        public float PanelHeight {get;private set;}
        public float HeaderBottom {get;private set;}
        static readonly Color Paper=new Color(.94f,.91f,.80f),Brass=new Color(.91f,.69f,.33f);
        internal static RectTransform Node(string name,Transform parent)
        {var rect=new GameObject(name,typeof(RectTransform)).GetComponent<RectTransform>();rect.SetParent(parent,false);
         rect.anchorMin=rect.anchorMax=rect.pivot=new Vector2(0,1);return rect;}
        internal static void Position(RectTransform rect,float x,float y,float w,float h)
        {rect.anchoredPosition=new Vector2(x,-y);rect.sizeDelta=new Vector2(w,h);}
        public LastStandProgressionModal(string name,Transform parent,Font font,Action close,Texture2D metal,Sprite surface)
        {
            this.font=font;this.metal=metal;this.surface=surface;
            Shade=Node(name+"Modal",parent);Shade.gameObject.AddComponent<Image>().color=new Color(0,0,0,.82f);
            Panel=Node(name+"Panel",Shade);LastStandConsoleChrome.Surface(Panel,surface,false).color=new Color(.12f,.15f,.13f);
            LastStandConsoleChrome.Frame(Panel,metal);Title=Text(name+"Heading",Panel,22);Title.color=Brass;
            Status=Text(name+"Status",Panel,16);Close=Button(name+"Close","CLOSE",Panel,close);
        }
        public Text Text(string name,Transform parent,int size)
        {
            var text=Node(name,parent).gameObject.AddComponent<Text>();text.font=font;text.fontSize=size;text.color=Paper;
            text.raycastTarget=false;text.supportRichText=false;text.horizontalOverflow=HorizontalWrapMode.Wrap;
            text.verticalOverflow=VerticalWrapMode.Truncate;textSizes.Add(text,size);return text;
        }
        public Button Button(string name,string label,Transform parent,Action handler)
        {
            var rect=Node(name,parent);var image=LastStandConsoleChrome.Surface(rect,surface,true);
            var frame=LastStandConsoleChrome.Frame(rect,metal,true);var button=rect.gameObject.AddComponent<Button>();button.targetGraphic=image;
            var colors=button.colors;colors.normalColor=colors.disabledColor=Color.white;
            colors.selectedColor=colors.highlightedColor=new Color(1.10f,1.10f,1.06f);colors.pressedColor=new Color(.85f,.85f,.85f);
            colors.fadeDuration=.08f;button.colors=colors;button.onClick.AddListener(()=>handler());
            var text=Text(name+"Text",rect,16);text.text=label;text.alignment=TextAnchor.MiddleCenter;
            text.rectTransform.anchorMin=Vector2.zero;text.rectTransform.anchorMax=Vector2.one;
            text.rectTransform.offsetMin=new Vector2(8,2);text.rectTransform.offsetMax=new Vector2(-8,-2);
            LastStandConsoleChrome.Feedback(button,text,frame);Buttons.Add(button);Style(button,true,false);return button;
        }
        public void Style(Button button,bool available,bool selected)
        {
            button.interactable=available;button.GetComponent<Image>().color=!available?new Color(.14f,.16f,.135f):selected?Brass:new Color(.24f,.27f,.205f);
            button.GetComponentInChildren<Text>().color=!available?new Color(.76f,.75f,.67f):selected?new Color(.055f,.068f,.064f):Paper;
            button.GetComponentInChildren<LastStandConsoleFrame>(true).SetAction(selected,available);
            button.GetComponent<LastStandActionFeedback>().Refresh();
        }
        public LastStandProgressionPane Pane(string name)=>new LastStandProgressionPane(name,Panel,surface);
        public void Place(Component item,float x,float y,float w,float h)=>Position((RectTransform)item.transform,x*sx,y*sy,w*sx,h*sy);
        public float Preferred(Text text,float width)
        {
            text.fontSize=Mathf.CeilToInt(textSizes[text]*sy);
            return Math.Max(20,text.cachedTextGeneratorForLayout.GetPreferredHeight(text.text,text.GetGenerationSettings(new Vector2(width*sx,0)))/text.pixelsPerUnit/sy);
        }
        public float Layout(float width,float height,float unitsX,float unitsY,float maxWidth)
        {
            sx=unitsX;sy=unitsY;float w=Math.Min(maxWidth,width-16);PanelHeight=height-16;
            Position(Shade,0,0,width*sx,height*sy);Position(Panel,(width-w)/2*sx,8*sy,w*sx,PanelHeight*sy);
            foreach(var entry in textSizes)entry.Key.fontSize=Mathf.CeilToInt(entry.Value*sy);
            Place(Title,12,12,w-124,44);Place(Close,w-104,12,92,44);
            float statusHeight=Preferred(Status,w-24)+8;Place(Status,12,64,w-24,statusHeight);HeaderBottom=64+statusHeight+8;
            return w;
        }
    }
    internal sealed class LastStandProgressionPane
    {
        public readonly RectTransform Viewport,Content;
        readonly ScrollRect scroll;
        float sx=1,sy=1,height;
        public float Offset=>Content.anchoredPosition.y/sy;
        public float MaximumOffset=>Math.Max(0,Content.rect.height/sy-height);
        public LastStandProgressionPane(string name,Transform parent,Sprite surface)
        {
            // A separate scroll host prevents the two sibling panes from handling
            // one wheel event twice through an ancestor ScrollRect.
            Viewport=LastStandProgressionModal.Node(name+"Viewport",parent);
            LastStandConsoleChrome.Surface(Viewport,surface,false).color=new Color(.09f,.11f,.10f);
            Viewport.gameObject.AddComponent<RectMask2D>();Content=LastStandProgressionModal.Node(name+"Content",Viewport);
            scroll=Viewport.gameObject.AddComponent<ScrollRect>();scroll.viewport=Viewport;scroll.content=Content;
            scroll.horizontal=false;scroll.vertical=true;scroll.inertia=false;scroll.movementType=ScrollRect.MovementType.Clamped;
        }
        public void Layout(float x,float y,float width,float h,float unitsX,float unitsY)
        {sx=unitsX;sy=unitsY;height=h;LastStandProgressionModal.Position(Viewport,x*sx,y*sy,width*sx,h*sy);
         Content.sizeDelta=new Vector2(width*sx,Content.sizeDelta.y);scroll.scrollSensitivity=44*sy;}
        public void Finish(float contentHeight)
        {Content.sizeDelta=new Vector2(Content.sizeDelta.x,Math.Max(height,contentHeight)*sy);Clamp();}
        void Clamp(){scroll.StopMovement();Content.anchoredPosition=new Vector2(0,Mathf.Clamp(Content.anchoredPosition.y,0,MaximumOffset*sy));}
        public void Reset(){scroll.StopMovement();Content.anchoredPosition=Vector2.zero;}
        public void Reveal(Button button)
        {
            if(!button||!button.transform.IsChildOf(Content))return;
            var rect=(RectTransform)button.transform;float y=-rect.anchoredPosition.y,offset=Content.anchoredPosition.y;
            if(y<offset)offset=y;else if(y+rect.rect.height>offset+height*sy)offset=y+rect.rect.height-height*sy;
            Content.anchoredPosition=new Vector2(0,offset);Clamp();
        }
        public void ScrollKeyboard(string direction)
        {
            float offset=Offset,step=Math.Max(44,height*.8f);
            if(direction=="scroll-up")offset-=step;else if(direction=="scroll-down")offset+=step;
            else if(direction=="scroll-start")offset=0;else if(direction=="scroll-end")offset=MaximumOffset;else return;
            Content.anchoredPosition=new Vector2(0,offset*sy);Clamp();
        }
    }
}

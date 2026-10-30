using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // Advisory projections only. Navigation returns to the existing action owners.
    internal sealed class LastStandPlannerHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly Action openWorkshop;
        readonly Func<bool> canOpenWorkshop;
        readonly Text summary,body,workshopBody,researchBody;
        readonly Button goalsTab,budgetTab,category,previous,next,pin,clear,route,back;
        readonly Button workshopPrevious,workshopNext,researchPrevious,researchNext,workshopOpen,researchOpen;
        readonly string[] categories={"Tier","Fitting","Workshop","Research"};
        LastStandPlannerView view;
        List<LastStandPlannerGoal> goals=new List<LastStandPlannerGoal>(),workshop=new List<LastStandPlannerGoal>(),research=new List<LastStandPlannerGoal>();
        string selectedKey,workshopKey,researchKey;
        int categoryIndex;
        bool open,budget;
        float width,height,sx=1,sy=1;
        public Button[] Buttons=>modal.Buttons.ToArray();
        public Button InitialFocus=>modal.Close;
        public float ScrollOffset=>pane.Offset;
        public float MaximumScrollOffset=>pane.MaximumOffset;
        public LastStandPlannerHud(LastStandLoopController loop,Transform parent,Font font,Action openWorkshop,
            Func<bool> canOpenWorkshop,Texture2D metal,Sprite surface)
        {
            this.loop=loop;this.openWorkshop=openWorkshop;this.canOpenWorkshop=canOpenWorkshop;
            modal=new LastStandModal("Planner",parent,font,loop.CloseMenu,metal,surface);
            pane=modal.Pane("Planner",scrollStatus:true);
            goalsTab=modal.Button("PlannerGoals","GOALS",pane.Content,()=>ChangeView(false));
            budgetTab=modal.Button("PlannerBudget","BUDGET",pane.Content,()=>ChangeView(true));
            summary=modal.Text("PlannerSummary",pane.Content,16);
            category=modal.Button("PlannerCategory","",pane.Content,()=>{categoryIndex=(categoryIndex+1)%categories.Length;selectedKey=null;Changed();});
            previous=modal.Button("PlannerPrevious","<",pane.Content,()=>{selectedKey=Move(goals,selectedKey,-1);Changed();});
            next=modal.Button("PlannerNext",">",pane.Content,()=>{selectedKey=Move(goals,selectedKey,1);Changed();});
            body=modal.Text("PlannerGoalDetail",pane.Content,16);
            pin=modal.Button("PlannerPin","PIN GOAL",pane.Content,()=>{
                var goal=Selected(goals,selectedKey);if(goal!=null)loop.SetPreferences(loop.Preferences.Current.With(pinnedGoal:goal.Key));});
            clear=modal.Button("PlannerClear","CLEAR PIN",pane.Content,()=>loop.SetPreferences(loop.Preferences.Current.With(pinnedGoal:"")));
            route=modal.Button("PlannerOpen","",pane.Content,()=>Navigate(Selected(goals,selectedKey)));
            workshopBody=modal.Text("PlannerWorkshopDetail",pane.Content,16);
            researchBody=modal.Text("PlannerResearchDetail",pane.Content,16);
            workshopPrevious=modal.Button("PlannerWorkshopPrevious","<",pane.Content,()=>{workshopKey=Move(workshop,workshopKey,-1);Changed();});
            workshopNext=modal.Button("PlannerWorkshopNext",">",pane.Content,()=>{workshopKey=Move(workshop,workshopKey,1);Changed();});
            researchPrevious=modal.Button("PlannerResearchPrevious","<",pane.Content,()=>{researchKey=Move(research,researchKey,-1);Changed();});
            researchNext=modal.Button("PlannerResearchNext",">",pane.Content,()=>{researchKey=Move(research,researchKey,1);Changed();});
            workshopOpen=modal.Button("PlannerWorkshopOpen","OPEN UPGRADES",pane.Content,OpenWorkshop);
            researchOpen=modal.Button("PlannerResearchOpen","OPEN LAB",pane.Content,loop.OpenResearch);
            back=modal.Button("PlannerBack","BACK TO MENU",pane.Content,()=>loop.OpenMenu());
            modal.Shade.gameObject.SetActive(false);
        }
        static LastStandPlannerGoal Selected(List<LastStandPlannerGoal> rows,string key)=>rows.Find(row=>row.Key==key)??rows.Find(row=>!row.Achieved)??(rows.Count>0?rows[0]:null);
        static string Move(List<LastStandPlannerGoal> rows,string key,int delta)
        {if(rows.Count==0)return null;int i=rows.FindIndex(row=>row.Key==key);return rows[(Math.Max(0,i)+delta+rows.Count)%rows.Count].Key;}
        void ChangeView(bool value){budget=value;Changed();}
        void Changed(){pane.Reset();loop.RefreshControls();}
        void OpenWorkshop(){if(!canOpenWorkshop())return;loop.CloseMenu();if(!loop.MenuOpen)openWorkshop();}
        void Navigate(LastStandPlannerGoal goal)
        {
            if(goal==null)return;
            if(goal.Route=="shop")OpenWorkshop();
            else if(goal.Route=="research")loop.OpenResearch();
            else loop.CloseMenu();
        }
        static string Detail(LastStandPlannerGoal goal,string empty)
            =>goal==null?empty:goal.Title+"\n\n"+goal.Detail;
        public void Refresh()
        {
            bool justOpened=!open&&loop.MenuPage=="planner";open=loop.MenuPage=="planner";
            modal.Shade.gameObject.SetActive(open);if(!open)return;
            view=LastStandProgressionPlanner.Project(loop.Progression,loop.ResearchSnapshot,LastStandFittingCatalog.Parse(loop.FittingId),loop.Preferences.Current.PinnedGoal);
            goals=new List<LastStandPlannerGoal>();workshop=new List<LastStandPlannerGoal>();research=new List<LastStandPlannerGoal>();
            foreach(var goal in view.Goals){if(goal.Category==categories[categoryIndex])goals.Add(goal);if(goal.Category=="Workshop")workshop.Add(goal);if(goal.Category=="Research")research.Add(goal);}
            // An old achieved or unavailable pin remains inspectable without changing its target.
            if(view.Pinned!=null&&view.Pinned.Category==categories[categoryIndex]&&!goals.Exists(g=>g.Key==view.Pinned.Key))goals.Insert(0,view.Pinned);
            if(justOpened&&view.Pinned!=null){int found=Array.IndexOf(categories,view.Pinned.Category);if(found>=0&&found!=categoryIndex){categoryIndex=found;selectedKey=view.Pinned.Key;Refresh();return;}selectedKey=view.Pinned.Key;}
            var selected=Selected(goals,selectedKey);selectedKey=selected?.Key;
            var w=Selected(workshop,workshopKey);workshopKey=w?.Key;
            var r=Selected(research,researchKey);researchKey=r?.Key;
            modal.Title.text="PROGRESSION";
            modal.Status.text="SALVAGE "+view.Wallet;
            summary.text=(view.Pinned==null?"Choose a target to pin. Planning never spends Salvage.":"Pinned: "+view.Pinned.Title+(view.Pinned.Achieved?" (achieved)":!view.Pinned.Available?" (unavailable)":""))+
                (loop.Preferences.SaveState!="ready"?"\n"+loop.Preferences.Status:"");
            category.GetComponentInChildren<Text>().text=categories[categoryIndex].ToUpperInvariant()+"  >";
            body.text=Detail(selected,"No targets in this category.");
            workshopBody.text="WORKSHOP - NEXT RUN\n\n"+Detail(w,"All Workshop targets complete.")+
                (!canOpenWorkshop()?"\n\nReturn to the garage to open permanent upgrades.":"");
            researchBody.text="RESEARCH - REAL TIME\n\n"+Detail(r,"All research targets complete.")+
                "\n\nThese alternatives share your current Salvage. Opening a page does not reserve funds; its current quote is checked when you confirm.";
            route.GetComponentInChildren<Text>().text=selected?.Route=="shop"?"OPEN UPGRADES":selected?.Route=="research"?"OPEN LAB":"BACK TO GAME";
            foreach(var component in new Component[]{category,previous,next,body,pin,clear,route})component.gameObject.SetActive(!budget);
            foreach(var component in new Component[]{workshopBody,researchBody,workshopPrevious,workshopNext,researchPrevious,researchNext,workshopOpen,researchOpen})component.gameObject.SetActive(budget);
            modal.Style(goalsTab,true,!budget);modal.Style(budgetTab,true,budget);
            modal.Style(previous,goals.Count>1,false);modal.Style(next,goals.Count>1,false);
            modal.Style(pin,selected!=null&&selected.Available&&selected.Key!=loop.Preferences.Current.PinnedGoal,false);
            modal.Style(clear,loop.Preferences.Current.PinnedGoal!="",false);
            modal.Style(route,selected!=null&&selected.Available&&(selected.Route!="shop"||canOpenWorkshop()),false);
            modal.Style(workshopPrevious,workshop.Count>1,false);modal.Style(workshopNext,workshop.Count>1,false);
            modal.Style(researchPrevious,research.Count>1,false);modal.Style(researchNext,research.Count>1,false);
            modal.Style(workshopOpen,w!=null&&canOpenWorkshop(),false);
            if(justOpened)pane.Reset();if(width>0)Layout(width,height,sx,sy);
        }
        public void Layout(float w,float h,float x,float y)
        {
            width=w;height=h;sx=x;sy=y;if(!open)return;
            float pw=modal.Layout(w,h,x,y,760),top=modal.HeaderBottom,cw=pw-48;
            pane.Layout(12,top,pw-24,Math.Max(44,modal.PanelHeight-top-12),x,y);
            float at=modal.Preferred(modal.Status,cw);modal.Place(modal.Status,12,0,cw,at);at+=8;
            modal.Place(goalsTab,12,at,(cw-8)/2,44);modal.Place(budgetTab,20+(cw-8)/2,at,(cw-8)/2,44);at+=52;
            float summaryHeight=modal.Preferred(summary,cw);modal.Place(summary,12,at,cw,summaryHeight);at+=summaryHeight+16;
            if(!budget)
            {
                modal.Place(previous,12,at,44,44);modal.Place(category,64,at,cw-104,44);modal.Place(next,cw-32,at,44,44);at+=56;
                float textHeight=modal.Preferred(body,cw);modal.Place(body,12,at,cw,textHeight);at+=textHeight+16;
                modal.Place(pin,12,at,(cw-8)/2,44);modal.Place(clear,20+(cw-8)/2,at,(cw-8)/2,44);at+=52;
                modal.Place(route,12,at,cw,44);at+=52;
            }
            else
            {
                foreach(var row in new[]{new Component[]{workshopPrevious,workshopNext,workshopBody,workshopOpen},new Component[]{researchPrevious,researchNext,researchBody,researchOpen}})
                {
                    modal.Place(row[0],12,at,44,44);modal.Place(row[1],cw-32,at,44,44);at+=52;
                    var text=(Text)row[2];float th=modal.Preferred(text,cw);modal.Place(text,12,at,cw,th);at+=th+12;
                    modal.Place(row[3],12,at,cw,44);at+=64;
                }
            }
            modal.Place(back,12,at,cw,44);pane.Finish(at+56);
        }
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction){if(open)pane.ScrollKeyboard(direction);}
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // One owner for modal navigation/focus. Individual pages only render.
    internal sealed class LastStandModalHost
    {
        // A page is registered once with the behavior the shell needs. The
        // shell never needs another page-name branch when a screen is added.
        sealed class Page
        {
            public readonly Button[] Buttons;
            public readonly Func<Button> InitialFocus;
            public readonly Action<bool> Refresh;
            public readonly Action<float,float,float,float> Layout;
            public readonly Action<Button> Reveal;
            public readonly Action<string> Scroll;
            public Page(Button[] buttons,Func<Button> initialFocus,Action<bool> refresh,
                Action<float,float,float,float> layout,Action<Button> reveal,Action<string> scroll)
            {Buttons=buttons;InitialFocus=initialFocus;Refresh=refresh;Layout=layout;Reveal=reveal;Scroll=scroll;}
        }
        readonly LastStandLoopController loop;
        readonly Dictionary<string,Page> pages=new Dictionary<string,Page>(StringComparer.Ordinal);
        readonly List<Page> orderedPages=new List<Page>();
        readonly Page settingsPage;
        Page activePage;
        public readonly LastStandSettingsHud Settings;
        public readonly LastStandResearchHud Research;
        public readonly LastStandRunHistoryHud History;
        public readonly LastStandPlannerHud Planner;
        public readonly Button Menu;
        public readonly Button[] Buttons;
        Button returnFocus;bool wasOpen,changed;string wasPage;
        public LastStandModalHost(LastStandLoopController loop,RectTransform root,Font font,Texture2D metal,Sprite surface,LastStandHudElements elements,
            Action openWorkshop,Func<bool> canOpenWorkshop)
        {
            this.loop=loop;Menu=elements.Action("Menu","Menu",root,()=>loop.OpenMenu());
            for(int i=0;i<3;i++)
            {var bar=LastStandUiPrimitives.Node("MenuBar"+i,Menu.transform);elements.Nodes.Add(bar.name,bar);
             var image=bar.gameObject.AddComponent<Image>();image.color=LastStandUiPrimitives.Paper;image.raycastTarget=false;}
            Settings=new LastStandSettingsHud(loop,root,font,metal,surface);
            Research=new LastStandResearchHud(root,font,loop.CloseMenu,loop.RefreshResearch,loop.SubmitResearch,metal,surface);
            History=new LastStandRunHistoryHud(root,font,loop.CloseMenu,loop.RefreshControls,metal,surface);
            Planner=new LastStandPlannerHud(loop,root,font,openWorkshop,canOpenWorkshop,metal,surface);
            settingsPage=Register(null,new Page(Settings.Buttons,()=>Settings.InitialFocus,Settings.Refresh,Settings.Layout,Settings.Reveal,Settings.ScrollKeyboard));
            Register("research",new Page(Research.Buttons,()=>Research.InitialFocus,
                visible=>Research.Refresh(visible,loop.ResearchSnapshot,loop.Progression.GetBestWave(1),loop.Progression.Wallet,loop.ResearchCanAct,loop.ResearchStatus),
                Research.Layout,Research.Reveal,Research.ScrollKeyboard));
            Register("history",new Page(History.Buttons,()=>History.InitialFocus,
                visible=>History.Refresh(visible,loop.RunHistorySnapshot),History.Layout,History.Reveal,History.ScrollKeyboard));
            Register("planner",new Page(Planner.Buttons,()=>Planner.InitialFocus,Planner.Refresh,Planner.Layout,Planner.Reveal,Planner.ScrollKeyboard));
            var buttons=new List<Button>();foreach(var page in orderedPages)buttons.AddRange(page.Buttons);Buttons=buttons.ToArray();
        }
        Page Register(string key,Page page)
        {if(key!=null)pages.Add(key,page);orderedPages.Add(page);return page;}
        public void BindKeyboard(LastStandHudKeyboard keyboard)
        {Research.FocusRequested=keyboard.Focus;keyboard.Escape=()=>{if(loop.MenuOpen)loop.CloseMenu();else loop.OpenMenu();};keyboard.ScrollContent=Scroll;}
        public void BeforeRefresh(Button researchEntry,Button waveInfo)
        {
            changed=wasOpen!=loop.MenuOpen||wasPage!=loop.MenuPage;
            if(!wasOpen&&loop.MenuOpen)
            {var selected=EventSystem.current?EventSystem.current.currentSelectedGameObject:null;
             returnFocus=selected==researchEntry.gameObject?researchEntry:selected==waveInfo.gameObject?waveInfo:Menu;}
        }
        public void Refresh(LastStandHudKeyboard keyboard,Button[] background)
        {
            activePage=loop.MenuOpen?(pages.TryGetValue(loop.MenuPage,out var selected)?selected:settingsPage):null;
            foreach(var page in orderedPages)page.Refresh(activePage==page);
            keyboard.TrapFocus=loop.MenuOpen;
            if(loop.MenuOpen)foreach(var button in background)button.interactable=false;
        }
        public void AfterRefresh(LastStandHudKeyboard keyboard,Button tierNext,Button fittingNext)
        {
            if(changed)keyboard.Focus(activePage!=null?activePage.InitialFocus():
                wasPage=="tier"?tierNext:wasPage=="fitting"?fittingNext:returnFocus??Menu);
            wasOpen=loop.MenuOpen;wasPage=loop.MenuPage;
        }
        public void Layout(float w,float h,float sx,float sy)
        {activePage?.Layout(w,h,sx,sy);}
        public void Reveal(Button button)=>activePage?.Reveal(button);
        public void Scroll(string direction)
        {activePage?.Scroll(direction);}
    }
}

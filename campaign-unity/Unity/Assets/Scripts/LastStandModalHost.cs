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
            public readonly bool HidesBackground;
            public Page(Button[] buttons,Func<Button> initialFocus,Action<bool> refresh,
                Action<float,float,float,float> layout,Action<Button> reveal,Action<string> scroll,bool hidesBackground=false)
            {Buttons=buttons;InitialFocus=initialFocus;Refresh=refresh;Layout=layout;Reveal=reveal;Scroll=scroll;HidesBackground=hidesBackground;}
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
        public readonly LastStandAppearanceHud Appearance;
        public readonly LastStandArmoryHud Armory;
        public readonly LastStandSkillsHud Skills;
        public bool HidesBackground=>activePage?.HidesBackground==true;
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
            Settings=new LastStandSettingsHud(loop,root,font,metal,surface,openWorkshop,canOpenWorkshop);
            Research=new LastStandResearchHud(root,font,loop.CloseMenu,loop.RefreshResearch,loop.SubmitResearch,metal,surface);
            History=new LastStandRunHistoryHud(root,font,loop.CloseMenu,loop.RefreshControls,metal,surface);
            Planner=new LastStandPlannerHud(loop,root,font,openWorkshop,canOpenWorkshop,metal,surface);
            Appearance=new LastStandAppearanceHud(loop,root,font,metal,surface);
            Armory=new LastStandArmoryHud(loop,root,font,metal,surface);
            Skills=new LastStandSkillsHud(loop,root,font,metal,surface);
            settingsPage=Register(null,new Page(Settings.Buttons,()=>Settings.InitialFocus,Settings.Refresh,Settings.Layout,Settings.Reveal,Settings.ScrollKeyboard));
            Register("research",new Page(Research.Buttons,()=>Research.InitialFocus,
                visible=>Research.Refresh(visible,loop.ResearchSnapshot,loop.Progression.GetBestWave(1),loop.Progression.Wallet,loop.ResearchCanAct,loop.ResearchStatus,loop.Progression.GetBestWave(2),loop.Progression.SelectedLoadout),
                Research.Layout,Research.Reveal,Research.ScrollKeyboard));
            Register("history",new Page(History.Buttons,()=>History.InitialFocus,
                visible=>History.Refresh(visible,loop.RunHistorySnapshot),History.Layout,History.Reveal,History.ScrollKeyboard));
            Register("planner",new Page(Planner.Buttons,()=>Planner.InitialFocus,Planner.Refresh,Planner.Layout,Planner.Reveal,Planner.ScrollKeyboard));
            Register("appearance",new Page(Appearance.Buttons,()=>Appearance.InitialFocus,Appearance.Refresh,Appearance.Layout,Appearance.Reveal,Appearance.ScrollKeyboard,true));
            Register("armory",new Page(Armory.Buttons,()=>Armory.InitialFocus,Armory.Refresh,Armory.Layout,Armory.Reveal,Armory.ScrollKeyboard,true));
            Register("skills",new Page(Skills.Buttons,()=>Skills.InitialFocus,Skills.Refresh,Skills.Layout,Skills.Reveal,Skills.ScrollKeyboard));
            var buttons=new List<Button>();foreach(var page in orderedPages)buttons.AddRange(page.Buttons);Buttons=buttons.ToArray();
        }
        Page Register(string key,Page page)
        {if(key!=null)pages.Add(key,page);orderedPages.Add(page);return page;}
        public void BindKeyboard(LastStandHudKeyboard keyboard)
        {Research.FocusRequested=keyboard.Focus;keyboard.Escape=()=>{if(loop.MenuOpen)loop.CloseMenu();else loop.OpenMenu();};keyboard.ScrollContent=Scroll;
         keyboard.RevealInput=input=>{if(input==Armory.NameInput)Armory.RevealName();};}
        public void BeforeRefresh(Button researchEntry,Button waveInfo,Button armoryEntry)
        {
            changed=wasOpen!=loop.MenuOpen||wasPage!=loop.MenuPage;
            if(!wasOpen&&loop.MenuOpen)
            {var selected=EventSystem.current?EventSystem.current.currentSelectedGameObject:null;
             returnFocus=selected==researchEntry.gameObject?researchEntry:selected==waveInfo.gameObject?waveInfo:selected==armoryEntry.gameObject?armoryEntry:Menu;}
        }
        public void Refresh(LastStandHudKeyboard keyboard,Button[] background)
        {
            activePage=loop.MenuOpen?(pages.TryGetValue(loop.MenuPage,out var selected)?selected:settingsPage):null;
            foreach(var page in orderedPages)page.Refresh(activePage==page);
            keyboard.TrapFocus=loop.MenuOpen;
            if(loop.MenuOpen)foreach(var button in background)button.interactable=false;
        }
        public void AfterRefresh(LastStandHudKeyboard keyboard,Button tierNext,Button armoryEntry)
        {
            if(changed)keyboard.Focus(activePage!=null?activePage.InitialFocus():
                wasPage=="tier"?tierNext:wasPage=="fitting"?armoryEntry:returnFocus??Menu);
            wasOpen=loop.MenuOpen;wasPage=loop.MenuPage;
        }
        public void Layout(float w,float h,float sx,float sy)
        {
            // Match the bay's type scale on large displays while keeping
            // compact windows at their existing usable target sizes.
            float density=Mathf.Max(1,Mathf.Min(w/1600,h/900));
            activePage?.Layout(w/density,h/density,sx*density,sy*density);
        }
        public void Reveal(Button button)=>activePage?.Reveal(button);
        public void Scroll(string direction)
        {activePage?.Scroll(direction);}
    }
}

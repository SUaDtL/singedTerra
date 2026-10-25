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
        readonly LastStandLoopController loop;
        public readonly LastStandSettingsHud Settings;
        public readonly LastStandResearchHud Research;
        public readonly LastStandRunHistoryHud History;
        public readonly Button Menu;
        public readonly Button[] Buttons;
        Button returnFocus;bool wasOpen,changed;string wasPage;
        public LastStandModalHost(LastStandLoopController loop,RectTransform root,Font font,Texture2D metal,Sprite surface,LastStandHudElements elements)
        {
            this.loop=loop;Menu=elements.Action("Menu","Menu",root,()=>loop.OpenMenu());
            for(int i=0;i<3;i++)
            {var bar=LastStandUiPrimitives.Node("MenuBar"+i,Menu.transform);elements.Nodes.Add(bar.name,bar);
             var image=bar.gameObject.AddComponent<Image>();image.color=LastStandUiPrimitives.Paper;image.raycastTarget=false;}
            Settings=new LastStandSettingsHud(loop,root,font,metal,surface);
            Research=new LastStandResearchHud(root,font,loop.CloseMenu,loop.RefreshResearch,loop.SubmitResearch,metal,surface);
            History=new LastStandRunHistoryHud(root,font,loop.CloseMenu,loop.RefreshResearch,metal,surface);
            var buttons=new List<Button>(Settings.Buttons);buttons.AddRange(Research.Buttons);buttons.AddRange(History.Buttons);Buttons=buttons.ToArray();
        }
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
            Settings.Refresh();Research.Refresh(loop.MenuPage=="research",loop.ResearchSnapshot,loop.Progression.GetBestWave(1),loop.Progression.Wallet,loop.ResearchCanAct,loop.ResearchStatus);
            History.Refresh(loop.MenuPage=="history",loop.RunHistorySnapshot);keyboard.TrapFocus=loop.MenuOpen;
            if(loop.MenuOpen)foreach(var button in background)button.interactable=false;
        }
        public void AfterRefresh(LastStandHudKeyboard keyboard,Button tierNext,Button fittingNext)
        {
            if(changed)keyboard.Focus(loop.MenuOpen?loop.MenuPage=="research"?Research.InitialFocus:loop.MenuPage=="history"?History.InitialFocus:Settings.InitialFocus:
                wasPage=="tier"?tierNext:wasPage=="fitting"?fittingNext:returnFocus??Menu);
            wasOpen=loop.MenuOpen;wasPage=loop.MenuPage;
        }
        public void Layout(float w,float h,float sx,float sy)
        {Settings.Layout(w,h,sx,sy);Research.Layout(w,h,sx,sy);History.Layout(w,h,sx,sy);}
        public void Reveal(Button button){Settings.Reveal(button);Research.Reveal(button);History.Reveal(button);}
        public void Scroll(string direction)
        {if(loop.MenuPage=="research")Research.ScrollKeyboard(direction);else if(loop.MenuPage=="history")History.ScrollKeyboard(direction);else Settings.ScrollKeyboard(direction);}
    }
}

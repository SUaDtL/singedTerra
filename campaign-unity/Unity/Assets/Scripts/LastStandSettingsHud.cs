using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // A modal extension of the existing Canvas, using its one keyboard owner.
    public sealed class LastStandSettingsHud
    {
        readonly LastStandLoopController loop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly RectTransform shade, panel, viewport, content;
        readonly Text title, body, choiceName;
        readonly ScrollRect scroll;
        readonly Button close;
        readonly List<Button> buttons;
        readonly Dictionary<string,Button> controls = new Dictionary<string,Button>();
        readonly List<Button> visible = new List<Button>();
        readonly Button[] tabs;
        string tab = "Audio", previousPage = "";
        float scaleX = 1, scaleY = 1, viewportHeight;
        public Button[] Buttons => buttons.ToArray();
        public float ScrollOffset => loop.MenuOpen ? pane.Offset : 0;
        public float MaximumScrollOffset => loop.MenuOpen ? pane.MaximumOffset : 0;
        public Button InitialFocus => loop.MenuPage == "confirm" ? controls["ConfirmCancel"] : close;
        static readonly Color Paper = new Color(.94f,.91f,.80f);
        static readonly Color Brass = new Color(.91f,.69f,.33f);
        static void Place(RectTransform r,float x,float y,float w,float h)=>LastStandUiPrimitives.Place(r,x,y,w,h);
        Text Text(string name,Transform parent,int size)=>modal.Text(name,parent,size);
        Button Button(string name,string label,Transform parent,Action handler)
        {var button=modal.Button(name,label,parent,handler);controls.Add(name,button);return button;}
        public LastStandSettingsHud(LastStandLoopController owner, Transform parent, Font sharedFont,
            Texture2D sharedMetal = null, Sprite sharedSurface = null)
        {
            loop=owner;
            modal=new LastStandModal("Settings",parent,sharedFont,loop.CloseMenu,sharedMetal,sharedSurface);
            shade=modal.Shade;panel=modal.Panel;title=modal.Title;close=modal.Close;
            modal.Status.gameObject.SetActive(false);buttons=modal.Buttons;controls.Add(close.name,close);
            choiceName=Text("SelectionName",panel,18);choiceName.alignment=TextAnchor.MiddleCenter;choiceName.color=Brass;
            Button("ChoicePrevious","<",panel,() => loop.MoveSelection(-1));
            Button("ChoiceNext",">",panel,() => loop.MoveSelection(1));
            tabs = new Button[4]; string[] labels = { "Audio", "Display", "Gameplay", loop.Platform.CanOpenAccount ? "Save & Account" : "Save" };
            for (int i=0;i<labels.Length;i++)
            {
                string value = labels[i]; tabs[i] = Button("SettingsTab" + i,value,panel,() => { tab=value; ResetScroll(); loop.RefreshControls(); });
            }
            pane=modal.Pane("Settings");viewport=pane.Viewport;content=pane.Content;scroll=pane.Scroll;
            body = Text("SettingsBody",content,16);
            Button("MenuResume","RESUME / CLOSE",content,loop.CloseMenu);
            Button("MenuSettings","SETTINGS",content,() => loop.OpenMenu("settings"));
            Button("MenuHelp","HELP & CONTROLS",content,() => loop.OpenMenu("help"));
            Button("MenuMilestones","WAVE MILESTONES",content,() => loop.OpenMenu("milestones"));
            Button("MenuWaveInfo","CURRENT WAVE ENEMIES",content,() => loop.OpenMenu("wave"));
            Button("MenuResearch","RESEARCH LAB",content,loop.OpenResearch);
            Button("MenuHistory","RUN HISTORY",content,loop.OpenHistory);
            Button("MenuPlanner","PROGRESSION PLANNER",content,() => loop.OpenMenu("planner"));
            Button("MenuNewRun","NEW RUN",content,() => loop.RequestConfirmation("new-run"));
            Button("MenuAbandon","ABANDON RUN",content,() => loop.RequestConfirmation("abandon"));
            Button("MenuCampaigns","RETURN TO CAMPAIGNS",content,() => loop.RequestNavigation(false));
            Button("MenuAbout","ABOUT & CREDITS",content,() => loop.OpenMenu("about"));
            Button("SettingsBack","BACK TO MENU",content,() => loop.OpenMenu());
            Button("SettingsMute","",content,loop.ToggleMute);
            Volume("Master",() => loop.Preferences.Current.MasterVolume,v => loop.SetPreferences(loop.Preferences.Current.With(masterVolume:v)));
            Volume("Effects",() => loop.Preferences.Current.EffectsVolume,v => loop.SetPreferences(loop.Preferences.Current.With(effectsVolume:v)));
            Button("EffectsSample","PLAY EFFECTS SAMPLE",content,() => loop.Audio.PreviewEffect());
            Button("MusicEnabled","",content,() => {
                loop.Audio.UnlockFromGesture("music"); loop.SetPreferences(loop.Preferences.Current.With(musicEnabled:!loop.Preferences.Current.MusicEnabled)); });
            Volume("Music",() => loop.Preferences.Current.MusicVolume,v => loop.SetPreferences(loop.Preferences.Current.With(musicVolume:v)));
            Button("DisplayQuality","",content,() => loop.SetPreferences(loop.Preferences.Current.With(quality:
                loop.Preferences.Current.Quality == LastStandQuality.Current ? LastStandQuality.Performance : LastStandQuality.Current)));
            Button("DisplayEffects","",content,loop.ToggleEffects);
            Button("DisplayFullscreen","",content,() => loop.Platform.ToggleFullscreen());
            Button("TutorialTips","",content,() => loop.SetPreferences(loop.Preferences.Current.With(tutorialTips:!loop.Preferences.Current.TutorialTips)));
            Button("PurchaseSuggestions","",content,() => loop.SetPreferences(loop.Preferences.Current.With(purchaseSuggestions:!loop.Preferences.Current.PurchaseSuggestions)));
            Button("GameplayHelp","HELP & CONTROLS",content,() => loop.OpenMenu("help"));
            Button("DataRetry","RETRY GAMEPLAY SAVE",content,loop.RetrySave);
            Button("PreferencesRetry","RETRY SETTINGS SAVE",content,loop.RetryPreferences);
            Button("DataAccount","MANAGE ACCOUNT",content,() => loop.RequestNavigation(true));
            Button("SettingsDefaults","RESTORE SETTINGS DEFAULTS",content,() => loop.RequestConfirmation("reset-settings"));
            Button("ConfirmCancel","CANCEL",content,loop.CancelConfirmation);
            Button("ConfirmProceed","CONFIRM",content,loop.ConfirmAction);
            shade.gameObject.SetActive(false);
        }
        void Volume(string channel, Func<int> read, Action<int> set)
        {
            Button(channel + "Minus","",content,() => { loop.Audio.UnlockFromGesture("volume"); set(Math.Max(0,read()-10)); });
            Button(channel + "Plus","",content,() => { loop.Audio.UnlockFromGesture("volume"); set(Math.Min(100,read()+10)); });
        }
        void Show(string id, string label = null, bool enabled = true)
        {
            var b = controls[id]; b.gameObject.SetActive(true); b.interactable = enabled;
            if (label != null) b.GetComponentInChildren<Text>().text = label;
            visible.Add(b);
        }
        void ResetScroll()=>pane.Reset();
        void ClampScroll()=>pane.Clamp();
        public void Refresh()
        {
            bool visiblePage=loop.MenuOpen && loop.MenuPage!="research" && loop.MenuPage!="history" && loop.MenuPage!="planner";
            shade.gameObject.SetActive(visiblePage); if (!visiblePage) { previousPage=""; return; }
            if (previousPage != loop.MenuPage) { ResetScroll(); previousPage=loop.MenuPage; }
            foreach (var b in buttons) b.gameObject.SetActive(false);
            close.gameObject.SetActive(true); visible.Clear();
            choiceName.gameObject.SetActive(loop.SelectionOpen);
            shade.GetComponent<Image>().color=loop.SelectionOpen ? Color.clear : new Color(0,0,0,.82f);
            var p = loop.Preferences.Current;
            title.text = loop.MenuPage == "settings" ? "SETTINGS" : loop.MenuPage == "confirm" ? "PLEASE CONFIRM" : loop.MenuPage.ToUpperInvariant();
            body.text = "";
            bool canLeave = LastStandNavigationPolicy.CanLeave(loop.Progression.SaveState,loop.Session.CatchingUp);
            switch (loop.MenuPage)
            {
                case "tier":
                case "fitting":
                    var choice=loop.Selection.Current;
                    title.text=loop.MenuPage=="tier" ? "TIER" : "FITTING";
                    choiceName.text=choice.Name;
                    body.text=(choice.Unlocked ? "SELECTED" : "LOCKED PREVIEW - DEPLOY UNAVAILABLE")+"\n"+choice.Description;
                    if(!loop.CanSelectLoadout)body.text+="\n"+(loop.Progression.SaveError ?? "Selection is currently unavailable.");
                    Show("ChoicePrevious",enabled:loop.CanSelectLoadout && loop.Selection.CanPrevious);
                    Show("ChoiceNext",enabled:loop.CanSelectLoadout && loop.Selection.CanNext);
                    break;
                case "menu":
                    body.text = loop.Session.Model != null ? "Run paused. Closing this menu preserves a manual pause." : "LAST STAND";
                    if(loop.Guidance.Tutorial != "") body.text += "\n\n" + loop.Guidance.Tutorial;
                    Show("MenuResume"); Show("MenuSettings"); Show("MenuHelp"); Show("MenuMilestones");
                    Show("MenuWaveInfo",enabled:loop.CanInspectWave);
                    Show("MenuResearch",loop.Progression.GetBestWave(1)>=25?"RESEARCH LAB":"RESEARCH LAB - T1 WAVE 25");
                    Show("MenuHistory");
                    Show("MenuPlanner");
                    if(loop.Progression.HasCheckpoint)Show("MenuNewRun",enabled:canLeave);
                    Show("MenuAbandon",enabled:canLeave && loop.Progression.ActiveRunId != 0);
                    if(loop.Platform.CanNavigate)Show("MenuCampaigns",enabled:canLeave); Show("MenuAbout"); break;
                case "settings":
                    foreach (var b in tabs) b.gameObject.SetActive(true);
                    body.text = loop.Preferences.Status;
                    if (tab == "Audio")
                    {
                        Show("SettingsMute",p.Muted ? "MASTER SOUND: OFF" : "MASTER SOUND: ON");
                        VolumeRows("Master",p.MasterVolume); VolumeRows("Effects",p.EffectsVolume); Show("EffectsSample");
                        Show("MusicEnabled",p.MusicEnabled ? "AMBIENT MUSIC: ON" : "AMBIENT MUSIC: OFF"); VolumeRows("Music",p.MusicVolume);
                    }
                    else if (tab == "Display")
                    {
                        body.text += "\nPerformance lowers 3D render resolution to 75%. Interface text stays at full resolution.\n" + loop.Platform.FullscreenStatus;
                        Show("DisplayQuality","QUALITY: " + p.Quality.ToString().ToUpperInvariant(),loop.Display.Available);
                        Show("DisplayEffects",p.ReducedEffects ? "EFFECTS: REDUCED" : "EFFECTS: FULL");
                        if(loop.Platform.FullscreenAvailable)Show("DisplayFullscreen",loop.Platform.Fullscreen ? "EXIT FULLSCREEN" : "ENTER FULLSCREEN",loop.Platform.FullscreenAvailable);
                    }
                    else if (tab == "Gameplay")
                    {
                        body.text += "\nLast running speed: " + loop.Session.LastPositiveSpeed.ToString("0.0") +
                            "x. Research cap: "+loop.Session.MaximumSpeed.ToString("0.0")+
                            "x. Research raises the cap; you choose the running speed.\nEssential status, errors and confirmations remain visible.";
                        Show("TutorialTips",p.TutorialTips ? "TUTORIAL TIPS: ON" : "TUTORIAL TIPS: OFF");
                        Show("PurchaseSuggestions",p.PurchaseSuggestions ? "PURCHASE SUGGESTIONS: ON" : "PURCHASE SUGGESTIONS: OFF"); Show("GameplayHelp");
                    }
                    else
                    {
                        body.text += "\nGameplay save: " + loop.Progression.SaveState + ". " + (loop.Progression.SaveError ?? "") +
                            "\nProgress is saved locally and is not synced to an account. Each cleared wave saves hull, upgrades, Scrap and cooldowns. Leaving or reloading restores the last checkpoint; partial-wave spending and upgrades roll back together. Resume starts paused, without closed-tab catch-up.";
                        Show("DataRetry",enabled:loop.Progression.SaveState != "ready");
                        Show("PreferencesRetry",enabled:loop.Preferences.CanRetry);
                        if(loop.Platform.CanOpenAccount)Show("DataAccount",enabled:canLeave); Show("SettingsDefaults");
                    }
                    Show("SettingsBack"); break;
                case "help": body.text = LastStandGuidance.Help+
                    "\n\nRESEARCH & FARMING\nTemporary Scrap buys upgrades for this run. Persistent Salvage funds both Mechanics Shop starting upgrades and Lab research. Research uses real time, including while closed; combat speed changes combat only. Switching research keeps elapsed progress and refunds the paid Salvage; resuming pays that cost again.\nRun History compares repeatable Salvage per real active hour, with milestone bonuses shown separately. Comparisons disclose short runs, changing upgrades and checkpoint measurement limits.";
                    Show("SettingsBack"); break;
                case "wave":
                    title.text="ENEMY STATS";
                    body.text=loop.Session.Model!=null && loop.Shop!=null
                        ?new LastStandWaveInformation(loop.Session.Model,loop.Shop,
                            loop.Progression.ResearchRank(LastStandResearchTrackId.ScrapLogistics)).Describe()
                        :"Deploy or resume a run to inspect its current wave.";
                    Show("SettingsBack");break;
                case "milestones":
                    int tier=loop.Session.Model?.Profile.Tier??loop.Progression.Checkpoint?.Tier??loop.Progression.SelectedTier;
                    title.text="TIER "+tier+" MILESTONES";
                    var rewardEdition=loop.Session.Model?.Profile.Edition??loop.Progression.Checkpoint?.Edition??LastStandRunEdition.Current;
                    body.text=LastStandMilestonePresentation.Roadmap(tier,loop.Progression.HasFirstClear,rewardEdition);
                    int legacyTicks=loop.Progression.GetBestTicks(tier),legacyKills=loop.Progression.GetBestKills(tier);
                    if(legacyTicks>0||legacyKills>0)body.text+="\n"+LastStandTierHudText.Best(legacyTicks,legacyKills)+" (not wave credit)";
                    Show("SettingsBack");break;
                case "about":
                    body.text = "LAST STAND\nSinged Terra - " + Application.version + "\n\nOriginal tank, battlefield and interface work by the Singed Terra project.\nAmbient music and effects are generated from project-owned source. Music: Holding Ground, an original procedural ambient composition.\n\nOpen source under the repository MIT license. Local prototype progression is separate from account progression.";
                    Show("SettingsBack"); break;
                case "confirm":
                    body.text = loop.Confirmation == "reset-settings" ? "Restore audio, display and guidance preferences to their defaults? Your upgrades, wallet, tiers and pending rewards are kept. The current run's speed and pause state are kept." :
                        "Abandon this run and remove its checkpoint? Temporary Scrap and run upgrades will be lost. All completed-wave rewards, milestone unlocks and permanent upgrades are kept.";
                    Show("ConfirmCancel"); Show("ConfirmProceed",loop.Confirmation == "reset-settings" ? "RESTORE SETTINGS" : loop.Confirmation=="new-run"?"ABANDON & START NEW":"ABANDON RUN",loop.Confirmation == "reset-settings" || canLeave); break;
            }
            foreach (var b in buttons)
            {
                bool available = b.interactable;
                var label = b.GetComponentInChildren<Text>(true);
                bool selectedTab = loop.MenuPage == "settings" && Array.IndexOf(tabs,b) >= 0 && label.text == tab;
                modal.Style(b,available,selectedTab);
            }
        }
        void VolumeRows(string name, int value)
        { Show(name+"Minus",name.ToUpperInvariant()+" " + value + "%  -",value>0); Show(name+"Plus",name.ToUpperInvariant()+" " + value + "%  +",value<100); }
        public void Layout(float width, float height, float unitsX, float unitsY)
        {
            if (!loop.MenuOpen || loop.MenuPage=="research" || loop.MenuPage=="history" || loop.MenuPage=="planner") return;
            scaleX=unitsX; scaleY=unitsY;
            Place(shade,0,0,width*unitsX,height*unitsY);
            if(loop.SelectionOpen)
            {
                // A fixed footprint with the real battlefield visible behind it.
                // Only the description scrolls; arrows and Close remain reachable.
                float cw=Math.Min(420,width-16), ch=Math.Min(280,height-16);
                Place(panel,(width-cw-8)*unitsX,(height-ch-8)*unitsY,cw*unitsX,ch*unitsY);
                Place(title.rectTransform,12*unitsX,12*unitsY,(cw-124)*unitsX,44*unitsY);
                Place((RectTransform)close.transform,(cw-104)*unitsX,12*unitsY,92*unitsX,44*unitsY);
                Place((RectTransform)controls["ChoicePrevious"].transform,12*unitsX,68*unitsY,44*unitsX,44*unitsY);
                Place((RectTransform)controls["ChoiceNext"].transform,(cw-56)*unitsX,68*unitsY,44*unitsX,44*unitsY);
                Place(choiceName.rectTransform,64*unitsX,64*unitsY,(cw-128)*unitsX,52*unitsY);
                viewportHeight=Math.Max(44,ch-132);
                pane.Layout(12,120,cw-24,viewportHeight,unitsX,unitsY);
                float bw=cw-40;body.fontSize=Mathf.CeilToInt(16*unitsY);
                var textSettings=body.GetGenerationSettings(new Vector2(bw*unitsX,0));
                float bh=body.cachedTextGeneratorForLayout.GetPreferredHeight(body.text,textSettings)/body.pixelsPerUnit+16*unitsY;
                Place(body.rectTransform,8*unitsX,8*unitsY,bw*unitsX,bh);
                pane.Finish(bh/unitsY+16);
                ClampScroll();scroll.scrollSensitivity=44*unitsY;
                foreach(var t in shade.GetComponentsInChildren<Text>(true))if(t!=body)t.fontSize=Mathf.CeilToInt((t==title?22:t==choiceName?18:16)*unitsY);
                return;
            }
            float w=Math.Min(700,width-16), h=height-16, x=(width-w)/2;
            Place(panel,x*unitsX,8*unitsY,w*unitsX,h*unitsY);
            Place(title.rectTransform,12*unitsX,12*unitsY,(w-124)*unitsX,44*unitsY);
            Place((RectTransform)close.transform,(w-104)*unitsX,12*unitsY,92*unitsX,44*unitsY);
            float y=64, inner=w-24;
            if (loop.MenuPage == "settings")
            {
                int columns=w<500?2:4; float tw=(inner-(columns-1)*8)/columns;
                for(int i=0;i<4;i++) Place((RectTransform)tabs[i].transform,(12+(i%columns)*(tw+8))*unitsX,(y+(i/columns)*52)*unitsY,tw*unitsX,44*unitsY);
                y += (4/columns)*52;
            }
            viewportHeight=Math.Max(44,h-y-12); pane.Layout(12,y,inner,viewportHeight,unitsX,unitsY);
            float bodyWidth=inner-16;
            body.fontSize=Mathf.CeilToInt(16*unitsY);
            var settings=body.GetGenerationSettings(new Vector2(bodyWidth*unitsX,0));
            float bodyHeight=Math.Max(24,body.cachedTextGeneratorForLayout.GetPreferredHeight(body.text,settings)/body.pixelsPerUnit/unitsY)+12;
            Place(body.rectTransform,8*unitsX,8*unitsY,bodyWidth*unitsX,bodyHeight*unitsY);
            float row=bodyHeight+16;
            for(int i=0;i<visible.Count;i++)
            {
                var b=visible[i]; bool volume=b.name.EndsWith("Minus",StringComparison.Ordinal) && i+1<visible.Count;
                float bw=volume?(bodyWidth-8)/2:bodyWidth;
                Place((RectTransform)b.transform,8*unitsX,row*unitsY,bw*unitsX,44*unitsY);
                if(volume) { i++; Place((RectTransform)visible[i].transform,(16+bw)*unitsX,row*unitsY,bw*unitsX,44*unitsY); }
                row+=52;
            }
            pane.Finish(row+8);
            // Preserve a valid reading position on same-page refreshes, but
            // repair the actual content when text or viewport bounds contract.
            ClampScroll();
            foreach(var t in shade.GetComponentsInChildren<Text>(true)) if(t!=body) t.fontSize=Mathf.CeilToInt((t==title?22:16)*unitsY);
            scroll.scrollSensitivity=44*unitsY;
        }
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction)
        {if(loop.MenuOpen)pane.ScrollKeyboard(direction);}
    }
}

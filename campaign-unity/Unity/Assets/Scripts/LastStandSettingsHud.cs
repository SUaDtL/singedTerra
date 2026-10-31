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
        readonly Action openWorkshop;
        readonly Func<bool> canOpenWorkshop;
        readonly LastStandModal modal;
        readonly LastStandScrollPane pane;
        readonly RectTransform shade, panel, viewport, content;
        readonly Text title, body, choiceName, footer;
        readonly ScrollRect scroll;
        readonly Button close;
        readonly List<Button> buttons;
        readonly Dictionary<string,Button> controls = new Dictionary<string,Button>();
        readonly List<Button> visible = new List<Button>();
        readonly Button[] tabs;
        string tab = "Audio", previousPage = "";
        int helpTopic;
        float viewportHeight;
        public Button[] Buttons => buttons.ToArray();
        public float ScrollOffset => loop.MenuOpen ? pane.Offset : 0;
        public float MaximumScrollOffset => loop.MenuOpen ? pane.MaximumOffset : 0;
        public Button InitialFocus => loop.MenuPage == "confirm" ? controls["ConfirmCancel"] : loop.MenuPage=="backup-preview"?controls["BackupCancel"]:close;
        static readonly Color Paper = new Color(.94f,.91f,.80f);
        static readonly Color Brass = new Color(.91f,.69f,.33f);
        static void Place(RectTransform r,float x,float y,float w,float h)=>LastStandUiPrimitives.Place(r,x,y,w,h);
        Text Text(string name,Transform parent,int size)=>modal.Text(name,parent,size);
        Button Button(string name,string label,Transform parent,Action handler)
        {var button=modal.Button(name,label,parent,handler);controls.Add(name,button);return button;}
        public LastStandSettingsHud(LastStandLoopController owner, Transform parent, Font sharedFont,
            Texture2D sharedMetal = null, Sprite sharedSurface = null,Action workshop = null,Func<bool> workshopAvailable = null)
        {
            loop=owner;
            openWorkshop=workshop;canOpenWorkshop=workshopAvailable??(()=>false);
            modal=new LastStandModal("Settings",parent,sharedFont,loop.CloseMenu,sharedMetal,sharedSurface);
            shade=modal.Shade;panel=modal.Panel;title=modal.Title;close=modal.Close;
            modal.Status.gameObject.SetActive(false);buttons=modal.Buttons;controls.Add(close.name,close);
            choiceName=Text("SelectionName",panel,18);choiceName.alignment=TextAnchor.MiddleCenter;choiceName.color=Brass;
            Button("ChoicePrevious","<",panel,() => loop.MoveSelection(-1));
            Button("ChoiceNext",">",panel,() => loop.MoveSelection(1));
            Button("HelpPrevious","<",panel,() => MoveHelp(-1));
            Button("HelpNext",">",panel,() => MoveHelp(1));
            tabs = new Button[4]; string[] labels = { "Audio", "Display", "Gameplay", loop.Platform.CanOpenAccount ? "Save & Account" : "Save" };
            for (int i=0;i<labels.Length;i++)
            {
                string value = labels[i]; tabs[i] = Button("SettingsTab" + i,value,panel,() => { tab=value; ResetScroll(); loop.RefreshControls(); });
            }
            pane=modal.Pane("Settings");viewport=pane.Viewport;content=pane.Content;scroll=pane.Scroll;
            body = Text("SettingsBody",content,16);
            footer = Text("SettingsDetail",content,14);
            Button("MenuResume","RESUME / CLOSE",content,loop.CloseMenu);
            Button("MenuSettings","SETTINGS",content,() => loop.OpenMenu("settings"));
            Button("MenuHelp","HELP & CONTROLS",content,() => loop.OpenMenu("help"));
            Button("MenuGuidance","",content,FollowGuidance);
            Button("GuidanceDismiss","DISMISS THIS TIP",content,() => {var action=loop.ContextGuidance;if(action!=null)loop.Guidance.DismissContext(action.Id);loop.RefreshControls();});
            Button("HelpAction","",content,() => FollowDestination(LastStandGuidance.HelpTopics[helpTopic].Destination));
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
            Button("DataExport","EXPORT BACKUP",content,loop.ExportBackup);
            Button("DataImport","CHOOSE BACKUP TO RESTORE",content,loop.ChooseBackup);
            Button("DataPrevious","REVIEW PREVIOUS SAVE",content,loop.PreviewPreviousBackup);
            Button("DataGarage","RETURN TO GARAGE",content,() => loop.RequestConfirmation("return-garage"));
            Button("BackupCancel","KEEP CURRENT SAVE",content,loop.CancelBackupPreview);
            Button("BackupReplace","REPLACE SAVE",content,loop.ConfirmBackupRestore);
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
        void MoveHelp(int direction)
        {helpTopic=Math.Max(0,Math.Min(LastStandGuidance.HelpTopics.Count-1,helpTopic+direction));ResetScroll();loop.RefreshControls();}
        void FollowGuidance()
        {
            var action=loop.ContextGuidance;if(action==null)return;
            for(int i=0;i<LastStandGuidance.HelpTopics.Count;i++)if(LastStandGuidance.HelpTopics[i].Id==action.TopicId)helpTopic=i;
            if(action.Destination=="help")loop.OpenMenu("help");else FollowDestination(action.Destination);
        }
        void FollowDestination(string destination)
        {
            if(destination=="workshop")
            {if(!canOpenWorkshop())return;loop.CloseMenu();openWorkshop?.Invoke();}
            else if(destination=="research")loop.OpenResearch();
            else if(destination=="data")loop.OpenMenu("save");
            else if(destination!="")loop.OpenMenu(destination);
        }
        public void Refresh(bool visiblePage)
        {
            shade.gameObject.SetActive(visiblePage); if (!visiblePage) { previousPage=""; return; }
            if (previousPage != loop.MenuPage)
            {if(loop.MenuPage=="save")tab=loop.Platform.CanOpenAccount?"Save & Account":"Save";ResetScroll(); previousPage=loop.MenuPage;}
            foreach (var b in buttons) b.gameObject.SetActive(false);
            close.gameObject.SetActive(true); visible.Clear();
            choiceName.gameObject.SetActive(loop.SelectionOpen || loop.MenuPage=="help");
            shade.GetComponent<Image>().color=loop.SelectionOpen ? Color.clear : new Color(0,0,0,.82f);
            var p = loop.Preferences.Current;
            title.text = loop.MenuPage == "settings" || loop.MenuPage=="save" ? "SETTINGS" : loop.MenuPage == "confirm" ? "PLEASE CONFIRM" : loop.MenuPage=="backup-preview"?"RESTORE BACKUP":loop.MenuPage.ToUpperInvariant();
            body.text = "";
            footer.text="";
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
                    var guidance=loop.ContextGuidance;
                    if(guidance!=null)
                    {body.text+="\n\n"+guidance.Body;Show("MenuGuidance",guidance.Label,guidance.Destination!="workshop"||canOpenWorkshop());Show("GuidanceDismiss");}
                    Show("MenuResume"); Show("MenuSettings"); Show("MenuHelp"); Show("MenuMilestones");
                    Show("MenuWaveInfo",enabled:loop.CanInspectWave);
                    Show("MenuResearch",loop.Progression.GetBestWave(1)>=25?"RESEARCH LAB":"RESEARCH LAB - T1 WAVE 25");
                    Show("MenuHistory");
                    Show("MenuPlanner");
                    if(loop.Progression.HasCheckpoint)Show("MenuNewRun",enabled:canLeave);
                    Show("MenuAbandon",enabled:canLeave && loop.Progression.ActiveRunId != 0);
                    if(loop.Platform.CanNavigate)Show("MenuCampaigns",enabled:canLeave); Show("MenuAbout"); break;
                case "save":
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
                        body.text=loop.SaveHealthHeading+"\n"+loop.ConfirmedCheckpointText;
                        if(loop.Progression.SaveState!="ready")body.text+="\n"+loop.Progression.SaveError;
                        if(loop.Progression.RecoveredPreviousRecord)body.text+="\nA damaged newer record was skipped. The preceding confirmed save was recovered.";
                        if(loop.BackupStatus!="")body.text+="\n\n"+loop.BackupStatus;
                        if(loop.Progression.SaveState!="ready")Show("DataRetry",enabled:!loop.BackupBusy);
                        if(loop.Session.Model!=null)
                        {body.text+="\n\nReturn to the garage before restoring. Your last confirmed checkpoint is kept.";Show("DataGarage",enabled:loop.CanReturnToGarage);}
                        Show("DataExport",enabled:loop.CanExportBackup);
                        Show("DataImport",enabled:loop.CanChooseBackup);
                        if(!loop.BackupAvailable)body.text+="\nFile backups are unavailable on this platform.";
                        if(loop.PreviousBackupAvailable)
                            Show("DataPrevious");
                        if(loop.Preferences.CanRetry)Show("PreferencesRetry");
                        if(loop.Platform.CanOpenAccount)Show("DataAccount",enabled:canLeave); Show("SettingsDefaults");
                        footer.text="Local save only; account sync is unavailable. Backups contain gameplay progress, not account or device settings.\n"+
                            loop.Preferences.Status+"\nGame "+Application.version+" / Unity "+Application.unityVersion+" / "+Application.platform;
                    }
                    Show("SettingsBack"); break;
                case "backup-preview":
                    body.text=loop.BackupComparison();
                    Show("BackupCancel");Show("BackupReplace",enabled:loop.BackupPreview!=null && !loop.BackupBusy && !loop.Progression.RestorePending && loop.Session.Model==null);
                    break;
                case "help":
                    var topic=LastStandGuidance.HelpTopics[helpTopic];choiceName.text=topic.Title;
                    body.text=topic.Body;footer.text="Topic "+(helpTopic+1)+" of "+LastStandGuidance.HelpTopics.Count+". Help is always available, even with tips turned off.";
                    Show("HelpPrevious",enabled:helpTopic>0);Show("HelpNext",enabled:helpTopic<LastStandGuidance.HelpTopics.Count-1);
                    // Selector buttons live beside the topic title, not in the action list.
                    visible.Remove(controls["HelpPrevious"]);visible.Remove(controls["HelpNext"]);
                    if(topic.Destination!="")Show("HelpAction",topic.ActionLabel,topic.Destination!="workshop"||canOpenWorkshop());
                    if(topic.Destination=="workshop"&&!canOpenWorkshop())footer.text+="\nPermanent upgrades are available from the garage.";
                    Show("SettingsBack");break;
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
                        loop.Confirmation=="return-garage"?"Return to the garage at your last confirmed checkpoint? Progress and purchases since that checkpoint roll back together. Completed-wave rewards and permanent upgrades are kept. Resume starts paused.":
                        "Abandon this run and remove its checkpoint? Temporary Scrap and run upgrades will be lost. All completed-wave rewards, milestone unlocks and permanent upgrades are kept.";
                    Show("ConfirmCancel"); Show("ConfirmProceed",loop.Confirmation == "reset-settings" ? "RESTORE SETTINGS" : loop.Confirmation=="return-garage"?"KEEP CHECKPOINT & RETURN":loop.Confirmation=="new-run"?"ABANDON & START NEW":"ABANDON RUN",loop.Confirmation == "reset-settings" || canLeave); break;
            }
            foreach (var b in buttons)
            {
                bool available = b.interactable;
                var label = b.GetComponentInChildren<Text>(true);
                bool selectedTab = (loop.MenuPage == "settings" || loop.MenuPage=="save") && Array.IndexOf(tabs,b) >= 0 && label.text == tab;
                modal.Style(b,available,selectedTab);
            }
        }
        void VolumeRows(string name, int value)
        { Show(name+"Minus",name.ToUpperInvariant()+" " + value + "%  -",value>0); Show(name+"Plus",name.ToUpperInvariant()+" " + value + "%  +",value<100); }
        public void Layout(float width, float height, float unitsX, float unitsY)
        {
            if (!shade.gameObject.activeSelf) return;
            if(loop.SelectionOpen)
            {
                // A fixed footprint with the real battlefield visible behind it.
                // Short windows scroll the selector too, preserving a complete
                // touch target instead of pushing its viewport off the panel.
                float cw=modal.LayoutFloating(width,height,unitsX,unitsY,420,280);
                bool compact=modal.PanelHeight<220;
                var selectorParent=compact?content:panel;
                foreach(var item in new Component[]{choiceName,controls["ChoicePrevious"],controls["ChoiceNext"]})
                    if(item.transform.parent!=selectorParent)item.transform.SetParent(selectorParent,false);
                float afterSelector=modal.Selector(choiceName,controls["ChoicePrevious"],controls["ChoiceNext"],
                    compact?8:12,compact?8:modal.HeaderBottom,cw-(compact?40:24));
                float contentTop=compact?modal.HeaderBottom:afterSelector;
                viewportHeight=Math.Max(44,modal.PanelHeight-contentTop-12);
                pane.Layout(12,contentTop,cw-24,viewportHeight,unitsX,unitsY);
                float bw=cw-40,bh=modal.Preferred(body,bw)+16,bodyTop=compact?afterSelector:8;
                modal.Place(body,8,bodyTop,bw,bh);
                pane.Finish(bodyTop+bh+8);
                ClampScroll();scroll.scrollSensitivity=44*unitsY;
                return;
            }
            float w=modal.Layout(width,height,unitsX,unitsY,700),h=modal.PanelHeight;
            float y=modal.HeaderBottom,inner=w-24,bodyTopOffset=8;
            if(loop.MenuPage=="help")
            {
                bool compact=h<260;var parent=compact?content:panel;
                foreach(var item in new Component[]{choiceName,controls["HelpPrevious"],controls["HelpNext"]})
                    if(item.transform.parent!=parent)item.transform.SetParent(parent,false);
                float after=modal.Selector(choiceName,controls["HelpPrevious"],controls["HelpNext"],compact?8:12,compact?8:y,compact?inner-16:inner);
                if(compact)bodyTopOffset=after+8;else y=after+8;
            }
            if (loop.MenuPage == "settings" || loop.MenuPage=="save")
            {
                bool compact=h<260;var tabParent=compact?content:panel;
                int columns=w<500?2:4;float tabWidth=compact?inner-16:inner,tw=(tabWidth-(columns-1)*8)/columns;
                for(int i=0;i<4;i++)
                {if(tabs[i].transform.parent!=tabParent)tabs[i].transform.SetParent(tabParent,false);
                 modal.Place(tabs[i],(compact?8:12)+(i%columns)*(tw+8),(compact?8:y)+(i/columns)*52,tw,44);}
                if(compact)bodyTopOffset+=(4/columns)*52;else y+=(4/columns)*52;
            }
            viewportHeight=Math.Max(44,h-y-12); pane.Layout(12,y,inner,viewportHeight,unitsX,unitsY);
            float bodyWidth=inner-16;
            body.fontSize=Mathf.CeilToInt(16*unitsY);
            var settings=body.GetGenerationSettings(new Vector2(bodyWidth*unitsX,0));
            float bodyHeight=Math.Max(24,body.cachedTextGeneratorForLayout.GetPreferredHeight(body.text,settings)/body.pixelsPerUnit/unitsY)+12;
            Place(body.rectTransform,8*unitsX,bodyTopOffset*unitsY,bodyWidth*unitsX,bodyHeight*unitsY);
            float row=bodyTopOffset+bodyHeight+8;
            for(int i=0;i<visible.Count;i++)
            {
                var b=visible[i]; bool volume=b.name.EndsWith("Minus",StringComparison.Ordinal) && i+1<visible.Count;
                float bw=volume?(bodyWidth-8)/2:bodyWidth;
                Place((RectTransform)b.transform,8*unitsX,row*unitsY,bw*unitsX,44*unitsY);
                if(volume) { i++; Place((RectTransform)visible[i].transform,(16+bw)*unitsX,row*unitsY,bw*unitsX,44*unitsY); }
                row+=52;
            }
            footer.gameObject.SetActive(footer.text!="");
            if(footer.text!="")
            {float fh=modal.Preferred(footer,bodyWidth)+16;modal.Place(footer,8,row,bodyWidth,fh);row+=fh;}
            pane.Finish(row+8);
            // Preserve a valid reading position on same-page refreshes, but
            // repair the actual content when text or viewport bounds contract.
            ClampScroll();
            scroll.scrollSensitivity=44*unitsY;
        }
        public void Reveal(Button button)=>pane.Reveal(button);
        public void ScrollKeyboard(string direction)
        {if(loop.MenuOpen)pane.ScrollKeyboard(direction);}
    }
}

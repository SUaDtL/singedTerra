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
        readonly Font font;
        readonly Texture2D metalGrain;
        readonly Sprite metalSurface;
        readonly RectTransform shade, panel, viewport, content;
        readonly Text title, body, choiceName;
        readonly ScrollRect scroll;
        readonly Button close;
        readonly List<Button> buttons = new List<Button>();
        readonly Dictionary<string,Button> controls = new Dictionary<string,Button>();
        readonly List<Button> visible = new List<Button>();
        readonly Button[] tabs;
        string tab = "Audio", previousPage = "";
        float scaleX = 1, scaleY = 1, viewportHeight;
        public Button[] Buttons => buttons.ToArray();
        public float ScrollOffset => loop.MenuOpen ? content.anchoredPosition.y / scaleY : 0;
        public float MaximumScrollOffset => loop.MenuOpen ? Math.Max(0,content.rect.height / scaleY - viewportHeight) : 0;
        public Button InitialFocus => loop.MenuPage == "confirm" ? controls["ConfirmCancel"] : close;
        static readonly Color Paper = new Color(.94f,.91f,.80f);
        static readonly Color Brass = new Color(.91f,.69f,.33f);
        static RectTransform Node(string name, Transform parent)
        {
            var r = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            r.SetParent(parent, false); r.anchorMin = r.anchorMax = r.pivot = new Vector2(0,1); return r;
        }
        static void Place(RectTransform r, float x, float y, float w, float h)
        { r.anchoredPosition = new Vector2(x,-y); r.sizeDelta = new Vector2(w,h); }
        Text Text(string name, Transform parent, int size)
        {
            var text = Node(name,parent).gameObject.AddComponent<Text>(); text.font = font;
            text.fontSize = size; text.color = Paper; text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Truncate; return text;
        }
        Button Button(string name, string label, Transform parent, Action handler)
        {
            var r = Node(name,parent); var image = LastStandConsoleChrome.Surface(r,metalSurface,true); image.color = new Color(.24f,.27f,.205f);
            var frame = LastStandConsoleChrome.Frame(r,metalGrain,true);
            var b = r.gameObject.AddComponent<Button>(); b.targetGraphic = image;
            var colors = b.colors; colors.normalColor = colors.disabledColor = Color.white;
            colors.selectedColor = colors.highlightedColor = new Color(1.10f,1.10f,1.06f);
            colors.pressedColor = new Color(.85f,.85f,.85f); colors.fadeDuration = .08f; b.colors = colors;
            b.onClick.AddListener(() => handler());
            var t = Text(name + "Text",r,16); t.text = label; t.alignment = TextAnchor.MiddleCenter;
            t.rectTransform.anchorMin = Vector2.zero; t.rectTransform.anchorMax = Vector2.one;
            t.rectTransform.offsetMin = new Vector2(8,2); t.rectTransform.offsetMax = new Vector2(-8,-2);
            LastStandConsoleChrome.Feedback(b,t,frame);
            controls.Add(name,b); buttons.Add(b); return b;
        }
        public LastStandSettingsHud(LastStandLoopController owner, Transform parent, Font sharedFont,
            Texture2D sharedMetal = null, Sprite sharedSurface = null)
        {
            loop = owner; font = sharedFont; metalGrain = sharedMetal; metalSurface = sharedSurface;
            shade = Node("SettingsModal",parent); shade.gameObject.AddComponent<Image>().color = new Color(0,0,0,.82f);
            panel = Node("SettingsPanel",shade);
            LastStandConsoleChrome.Surface(panel,metalSurface,false).color = new Color(.12f,.15f,.13f);
            LastStandConsoleChrome.Frame(panel,metalGrain);
            title = Text("SettingsHeading",panel,22); title.color = Brass;
            choiceName = Text("SelectionName",panel,18);choiceName.alignment=TextAnchor.MiddleCenter;choiceName.color=Brass;
            close = Button("SettingsClose","CLOSE",panel,loop.CloseMenu);
            Button("ChoicePrevious","<",panel,() => loop.MoveSelection(-1));
            Button("ChoiceNext",">",panel,() => loop.MoveSelection(1));
            tabs = new Button[4]; string[] labels = { "Audio", "Display", "Gameplay", "Save & Account" };
            for (int i=0;i<labels.Length;i++)
            {
                string value = labels[i]; tabs[i] = Button("SettingsTab" + i,value,panel,() => { tab=value; ResetScroll(); loop.RefreshControls(); });
            }
            viewport = Node("SettingsViewport",panel);
            LastStandConsoleChrome.Surface(viewport,metalSurface,false).color = new Color(.09f,.11f,.10f);
            viewport.gameObject.AddComponent<RectMask2D>(); content = Node("SettingsContent",viewport);
            scroll = panel.gameObject.AddComponent<ScrollRect>(); scroll.viewport = viewport; scroll.content = content;
            scroll.horizontal = false; scroll.vertical = true; scroll.inertia = false; scroll.movementType = ScrollRect.MovementType.Clamped;
            body = Text("SettingsBody",content,16);
            Button("MenuResume","RESUME / CLOSE",content,loop.CloseMenu);
            Button("MenuSettings","SETTINGS",content,() => loop.OpenMenu("settings"));
            Button("MenuHelp","HELP & CONTROLS",content,() => loop.OpenMenu("help"));
            Button("MenuMilestones","WAVE MILESTONES",content,() => loop.OpenMenu("milestones"));
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
            Button("DisplayFullscreen","",content,() => loop.Browser.ToggleFullscreen());
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
        void ResetScroll()
        {
            // Normalized positioning uses bounds from the previous page. Set
            // the actual top offset exactly before the new content is laid out.
            scroll.StopMovement(); content.anchoredPosition=Vector2.zero;
        }
        void ClampScroll()
        {
            float maximum=Math.Max(0,content.rect.height-viewportHeight*scaleY);
            float current=content.anchoredPosition.y;
            float bounded=Mathf.Clamp(current,0,maximum);
            if(content.anchoredPosition.x!=0 || current!=bounded)
            {
                scroll.StopMovement();content.anchoredPosition=new Vector2(0,bounded);
            }
        }
        public void Refresh()
        {
            shade.gameObject.SetActive(loop.MenuOpen); if (!loop.MenuOpen) { previousPage=""; return; }
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
                    if(loop.Progression.HasCheckpoint)Show("MenuNewRun",enabled:canLeave);
                    Show("MenuAbandon",enabled:canLeave && loop.Progression.ActiveRunId != 0);
                    Show("MenuCampaigns",enabled:canLeave); Show("MenuAbout"); break;
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
                        body.text += "\nPerformance lowers 3D render resolution to 75%. Interface text stays at full resolution.\n" + loop.Browser.FullscreenStatus;
                        Show("DisplayQuality","QUALITY: " + p.Quality.ToString().ToUpperInvariant(),loop.Display.Available);
                        Show("DisplayEffects",p.ReducedEffects ? "EFFECTS: REDUCED" : "EFFECTS: FULL");
                        Show("DisplayFullscreen",loop.Browser.Fullscreen ? "EXIT FULLSCREEN" : "ENTER FULLSCREEN",loop.Browser.FullscreenAvailable);
                    }
                    else if (tab == "Gameplay")
                    {
                        body.text += "\nLast running speed: " + loop.Session.LastPositiveSpeed.ToString("0.0") + "x. Current cap: 1x. Higher speeds will require research.\nEssential status, errors and confirmations remain visible.";
                        Show("TutorialTips",p.TutorialTips ? "TUTORIAL TIPS: ON" : "TUTORIAL TIPS: OFF");
                        Show("PurchaseSuggestions",p.PurchaseSuggestions ? "PURCHASE SUGGESTIONS: ON" : "PURCHASE SUGGESTIONS: OFF"); Show("GameplayHelp");
                    }
                    else
                    {
                        body.text += "\nGameplay save: " + loop.Progression.SaveState + ". " + (loop.Progression.SaveError ?? "") +
                            "\nProgress stays in this browser; signing in does not sync it. Each cleared wave saves hull, upgrades, Scrap and cooldowns. Leaving or reloading restores the last checkpoint; partial-wave spending and upgrades roll back together. Resume starts paused, without closed-tab catch-up.";
                        Show("DataRetry",enabled:loop.Progression.SaveState != "ready");
                        Show("PreferencesRetry",enabled:loop.Preferences.CanRetry);
                        Show("DataAccount",enabled:canLeave); Show("SettingsDefaults");
                    }
                    Show("SettingsBack"); break;
                case "help": body.text = LastStandGuidance.Help; Show("SettingsBack"); break;
                case "milestones":
                    int tier=loop.Session.Model?.Profile.Tier??loop.Progression.Checkpoint?.Tier??loop.Progression.SelectedTier;
                    title.text="TIER "+tier+" MILESTONES";
                    body.text="Every completed wave pays repeatable Salvage. Bonuses below are earned once per tier. Unlocking a tier never ends or moves your run.\n";
                    foreach(var milestone in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(tier)))
                    {
                        bool earned=loop.Progression.HasFirstClear(milestone.Id);
                        body.text+="\nWAVE "+milestone.Wave+" / "+(earned?"EARNED":"UPCOMING")+"\nOne-time bonus: +"+milestone.FirstClearSalvage+" Salvage";
                        if(milestone.UnlockTierId!=0)body.text+=" / Unlock Tier "+milestone.UnlockTierId;
                        if(milestone.UnlockFittingId!=null)body.text+=" / Unlock "+milestone.UnlockFittingId;
                        body.text+="\nRepeatable wave reward: +"+LastStandRewardCatalog.At(LastStandTierCatalog.Get(tier),milestone.Wave).RepeatableSalvage+" Salvage\n";
                    }
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
                b.GetComponent<Image>().color = !available ? new Color(.14f,.16f,.135f,1) :
                    selectedTab ? Brass : new Color(.24f,.27f,.205f,1);
                label.color = !available ? new Color(.76f,.75f,.67f,1) :
                    selectedTab ? new Color(.055f,.068f,.064f,1) : Paper;
                b.GetComponentInChildren<LastStandConsoleFrame>(true).SetAction(selectedTab,available);
                b.GetComponent<LastStandActionFeedback>().Refresh();
            }
        }
        void VolumeRows(string name, int value)
        { Show(name+"Minus",name.ToUpperInvariant()+" " + value + "%  -",value>0); Show(name+"Plus",name.ToUpperInvariant()+" " + value + "%  +",value<100); }
        public void Layout(float width, float height, float unitsX, float unitsY)
        {
            if (!loop.MenuOpen) return;
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
                Place(viewport,12*unitsX,120*unitsY,(cw-24)*unitsX,viewportHeight*unitsY);
                float bw=cw-40;body.fontSize=Mathf.CeilToInt(16*unitsY);
                var textSettings=body.GetGenerationSettings(new Vector2(bw*unitsX,0));
                float bh=body.cachedTextGeneratorForLayout.GetPreferredHeight(body.text,textSettings)/body.pixelsPerUnit+16*unitsY;
                Place(body.rectTransform,8*unitsX,8*unitsY,bw*unitsX,bh);
                content.sizeDelta=new Vector2((cw-24)*unitsX,Math.Max(viewportHeight*unitsY,bh+16*unitsY));
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
            viewportHeight=Math.Max(44,h-y-12); Place(viewport,12*unitsX,y*unitsY,inner*unitsX,viewportHeight*unitsY);
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
            content.sizeDelta=new Vector2(inner*unitsX,Math.Max(viewportHeight,row+8)*unitsY);
            // Preserve a valid reading position on same-page refreshes, but
            // repair the actual content when text or viewport bounds contract.
            ClampScroll();
            foreach(var t in shade.GetComponentsInChildren<Text>(true)) if(t!=body) t.fontSize=Mathf.CeilToInt((t==title?22:16)*unitsY);
            scroll.scrollSensitivity=44*unitsY;
        }
        public void Reveal(Button button)
        {
            if (!button || !button.transform.IsChildOf(content)) return;
            var rect=(RectTransform)button.transform; float y=-rect.anchoredPosition.y, offset=content.anchoredPosition.y;
            if(y<offset) offset=y;
            else if(y+rect.rect.height>offset+viewportHeight*scaleY) offset=y+rect.rect.height-viewportHeight*scaleY;
            content.anchoredPosition=new Vector2(0,Mathf.Clamp(offset,0,Math.Max(0,content.rect.height-viewportHeight*scaleY)));
        }
        public void ScrollKeyboard(string direction)
        {
            if(!loop.MenuOpen)return;
            float maximum=Math.Max(0,content.rect.height-viewportHeight*scaleY),offset=content.anchoredPosition.y;
            float step=Math.Max(44,viewportHeight*.8f)*scaleY;
            if(direction=="scroll-up")offset-=step;
            else if(direction=="scroll-down")offset+=step;
            else if(direction=="scroll-start")offset=0;
            else if(direction=="scroll-end")offset=maximum;
            else return;
            scroll.StopMovement();content.anchoredPosition=new Vector2(0,Mathf.Clamp(offset,0,maximum));
        }
    }
}

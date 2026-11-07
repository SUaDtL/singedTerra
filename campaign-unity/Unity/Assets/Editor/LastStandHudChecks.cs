using System;
using System.Collections.Generic;
using System.Reflection;
using System.Text.RegularExpressions;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;

// The actual scene, font, HUD, controller, progression, attachment and UI event
// path are imported. A target texture varies the real Canvas viewport in batch
// Editor without changing world settings or pretending a pure layout is Canvas.
[UnityEditor.InitializeOnLoad]
public static class LastStandHudChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    sealed class MemoryStorage : ILastStandStorage
    {
        public string Value;
        public bool DenyRead, DenyWrite;
        public string Read() { if (DenyRead) throw new InvalidOperationException(); return Value; }
        public void Write(string value) { if (DenyWrite) throw new InvalidOperationException(); Value = value; }
    }
    sealed class Fixture : IDisposable
    {
        public readonly LastStandLoopController Loop;
        public readonly TankPresentation Art;
        public readonly LastStandLoopHud Hud;
        public readonly Canvas Canvas;
        public readonly Camera Camera;
        public readonly RectTransform Root;
        public readonly MemoryStorage Storage;
        readonly RenderTexture texture;
        public Fixture(int width = 1366, int height = 768, int level = 0, int wallet = 0,
            bool denyRead = false, bool denyWrite = false, int nextId = 1)
        {
            Storage = new MemoryStorage { Value = denyWrite ? null : Save(level, wallet, nextId),
                DenyRead = denyRead, DenyWrite = denyWrite };
            LastStandLoopController.StorageFactory = () => Storage;
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art, "Start"); Invoke(Art.GetComponent<ArtHud>(), "Start");
            Loop = Art.GetComponent<LastStandLoopController>();
            Hud = (LastStandLoopHud)typeof(LastStandLoopController).GetField("hud", Private).GetValue(Loop);
            Canvas = UnityEngine.Object.FindFirstObjectByType<Canvas>();
            Camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            texture = new RenderTexture(width, height, 16); Camera.targetTexture = texture;
            Canvas.renderMode = RenderMode.ScreenSpaceCamera; Canvas.worldCamera = Camera;
            Canvas.planeDistance = 1;
            var scaler = Canvas.GetComponent<CanvasScaler>();
            scaler.enabled = false;
            Canvas.scaleFactor = Mathf.Sqrt((width / 1280f) * (height / 720f));
            Root = (RectTransform)Canvas.transform.Find("LastStandLoopHud");
            typeof(EncounterSession).GetField("focused", Private).SetValue(Loop.Session, true);
            RefreshCameraCanvas(Canvas,Hud.Refresh);
            Require(Math.Abs(Canvas.pixelRect.width - width) < .1f && Math.Abs(Canvas.pixelRect.height - height) < .1f,
                "actual camera Canvas viewport");
        }
        public Button Button(string id) { return FindButton(Root,id); }
        public Text Text(string id) { return Root.Find("LastStandCard/" + id).GetComponent<Text>(); }
        public void Dispose()
        {
            Camera.targetTexture = null; UnityEngine.Object.DestroyImmediate(texture);
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }
    static string Save(int level, int wallet, int nextId)
    { return "{\"version\":1,\"credits\":" + wallet + ",\"permanentLevel\":" + level +
        ",\"nextRunId\":" + nextId + ",\"lastFinalizedRunId\":0,\"pendingDefeat\":null}"; }
    static void Require(bool value, string label)
    { if (!value) throw new InvalidOperationException(label); }
    static void Invoke(object value, string method)
    { value.GetType().GetMethod(method, Private).Invoke(value, null); }
    static void RefreshCameraCanvas(Canvas canvas,Action refresh)
    {
        // Settle any world-camera change before rebinding this batch fixture's
        // camera Canvas. Production uses an independent screen-space overlay.
        Canvas.ForceUpdateCanvases();refresh();
        if(canvas.renderMode==RenderMode.ScreenSpaceCamera)
        {
            var camera=canvas.worldCamera;canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=camera;
        }
        Canvas.ForceUpdateCanvases();refresh();Canvas.ForceUpdateCanvases();
    }
    static void Click(Button button)
    { ExecuteEvents.Execute(button.gameObject, new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left }, ExecuteEvents.pointerClickHandler); }
    static Button FindButton(Transform root, string id)
    {
        Button found=null; int count=0;
        foreach(var button in root.GetComponentsInChildren<Button>(true))
            if(button.name==id) { found=button;count++; }
        Require(count==1,"one actual HUD control "+id);return found;
    }
    static Text FindText(Transform root,string id)
    {
        Text found=null;int count=0;
        foreach(var text in root.GetComponentsInChildren<Text>(true))if(text.name==id){found=text;count++;}
        Require(count==1,"one actual HUD text "+id);return found;
    }
    static bool IsInlineArrow(string id) => id=="TierPrevious"||id=="TierNext"||id=="FittingPrevious"||id=="FittingNext";
    static bool ExpectedGarageCards(LastStandLoopController loop) => (loop.Phase=="garage"||loop.Phase=="workshop") &&
        loop.Progression.SaveState=="ready" && loop.Progression.ActiveRunId==0 && loop.Progression.PendingDefeat==null && loop.Session.Model==null;
    static string CorePath(string id) => id=="WaveInfo"?"LastStandCard/WaveInfo":id=="Menu"||id=="ResearchEntry" ? id : id=="TierPrevious"||id=="TierNext" ? "GarageTierCard/"+id :
        id=="FittingPrevious"||id=="FittingNext" ? "GarageFittingCard/"+id : "LastStandDock/"+id;
    static void AssertInlineGarageFields(LastStandLoopController loop,RectTransform root)
    {
        var tier=LastStandTierCatalog.Get(loop.Progression.SelectedTier);
        LastStandSelectionOption fitting=null;
        foreach(var option in LastStandFittingCatalog.Options)if(option.Id==loop.FittingId)fitting=option;
        Require(fitting!=null,"actual fitting has authored catalog content");
        foreach(string id in new[]{"GarageTierName","GarageTierDetail","GarageFittingName","GarageFittingDescription","GarageSave"})
            RequireVisible(FindText(root,id),"visible inline garage field "+id);
        Require(FindText(root,"GarageTierName").text==("Tier "+tier.Id+" - "+LastStandEnvironmentCatalog.Get(tier.EnvironmentId).Name).ToUpperInvariant(),
            "inline card names the actual committed tier");
        Require(FindText(root,"GarageTierDetail").text=="Goal: survive "+tier.GoalTicks/20+"s. "+
            LastStandTierHudText.Best(loop.Progression.GetBestTicks(tier.Id),loop.Progression.GetBestKills(tier.Id)),"inline tier goal and best are owner-derived");
        Require(FindText(root,"GarageFittingName").text==fitting.Name.ToUpperInvariant() &&
            FindText(root,"GarageFittingDescription").text==fitting.Description,"inline fitting names and explains the equipped module");
        string expectedSave=loop.HasLockedTierPreview?"DEPLOY: Choose an unlocked tier.":
            !loop.Session.CanRun?"DEPLOY: Return to this tab.":
            loop.Progression.NextRunId==int.MaxValue?"DEPLOY: Local run limit reached.":
            "SALVAGE "+loop.Progression.Wallet+"  |  LOCAL SAVE READY";
        Require(FindText(root,"GarageSave").text==expectedSave,
            "garage shows exact owner refusal when unavailable and quiet salvage/confirmed save when admitted; expected="+expectedSave);
        Require(!FindText(root,"PhaseDetail").gameObject.activeInHierarchy&&!FindText(root,"SaveStatus").gameObject.activeInHierarchy,
            "ready inline garage removes the old dense detail/status card");
    }
    static void AssertGarageHierarchy(LastStandLoopController loop,RectTransform root,Func<RectTransform,Rect> bounds,Rect viewport)
    {
        AssertInlineGarageFields(loop,root);
        var tier=bounds((RectTransform)root.Find("GarageTierCard"));
        var fitting=bounds((RectTransform)root.Find("GarageFittingCard"));
        var menu=FindButton(root,"Menu");var menuBounds=bounds((RectTransform)menu.transform);
        var deploy=FindButton(root,loop.Phase=="workshop"?"Redeploy":"Deploy");var primary=bounds((RectTransform)deploy.transform);
        var upgrades=FindButton(root,"ShopEntry");var secondary=bounds((RectTransform)upgrades.transform);
        Require(root.Find("LastStandDock").GetComponent<Image>().color.a==0,
            "ready garage footer is a transparent structural region around separate actions");
        Require(menu.transform.parent==root && Contained(menuBounds,viewport) && menuBounds.yMax<=60.2f &&
            Math.Abs(menuBounds.xMax-(viewport.width-LastStandHudLayout.Edge))<.2f,"Menu floats independently at the top right");
        Require(Contained(tier,viewport)&&Contained(fitting,viewport)&&!Overlap(tier,fitting),"tier and fitting cards are separate onscreen panels");
        if(viewport.width>=LastStandHudLayout.PortraitBreakpoint&&viewport.height<240)
            Require(primary.yMax>=viewport.height-LastStandHudLayout.Edge-.2f&&primary.xMin>=fitting.xMax&&
                primary.width>secondary.width&&primary.height>=43.9f&&secondary.height>=43.9f,
                "tiny landscape retains a wider primary Deploy beside Upgrades below the preview");
        else Require(Math.Abs(primary.center.x-viewport.center.x)<.2f && primary.yMax>=viewport.height-LastStandHudLayout.Edge-.2f &&
            primary.height>secondary.height && primary.width>secondary.width,"Deploy dominates the lower centre over Upgrades");
        Require(upgrades.GetComponentInChildren<Text>().text=="UPGRADES","secondary action names permanent upgrades");
        foreach(var panel in new[]{tier,fitting})
            Require(!Overlap(panel,menuBounds)&&!Overlap(panel,primary)&&!Overlap(panel,secondary),"garage cards do not cover Menu or primary actions");
        if(viewport.width<LastStandHudLayout.PortraitBreakpoint)Require(fitting.yMin>=tier.yMax,"portrait fitting follows the tier and preview");
        foreach(string id in new[]{"TierPrevious","TierNext","FittingPrevious","FittingNext"})
        {
            var button=FindButton(root,id);var target=bounds((RectTransform)button.transform);
            Require(Contained(target,id.StartsWith("Tier",StringComparison.Ordinal)?tier:fitting),"inline arrow stays inside its own card "+id);
        }
    }
    static void SelectFitting(LastStandLoopController loop, TankPresentation art, Transform root, bool launcher, Action refresh)
    {
        if(art.showingLauncher==launcher)return;
        Require(loop.MenuPage=="" && loop.Session.Model==null,"inline fitting starts outside a modal or run");
        var arrow=FindButton(root,launcher ? "FittingNext" : "FittingPrevious");
        Require(arrow.IsActive() && arrow.IsInteractable(),"requested fitting arrow is available");Click(arrow);
        Require(art.showingLauncher==launcher && loop.FittingId==(launcher ? "launcher" : "repair"),
            "actual fitting arrow selects the explicit catalog identity");
        RefreshCameraCanvas(root.GetComponentInParent<Canvas>(),refresh);
        Require(loop.MenuPage=="" && loop.Session.Model==null,"inline fitting never opens a modal or deploys");
    }
    public static void RunGarage()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory;
        int failures = 0;
        try
        {
            Case("test_live_values_and_fitting", LiveValuesAndFitting, ref failures);
            Case("test_deploy_readiness_and_primary_hierarchy", DeployReadinessAndPrimary, ref failures);
            Case("test_garage_profile_geometry_and_contrast", GarageGeometryAndContrast, ref failures);
            Case("test_short_landscape_garage_readability", ShortLandscapeGarageReadability, ref failures);
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
        if (failures != 0) throw new InvalidOperationException("Actual HUD assertion failures: " + failures);
    }
    static void Case(string name, Action test, ref int failures)
    {
        try { test(); Debug.Log("ST_LS_HUD_PASS " + name); }
        catch (Exception error) { failures++; Debug.LogError("ST_LS_HUD_FAIL " + name + " " + error); }
    }
    static void LiveValuesAndFitting()
    {
        for (int level = 0; level <= 3; level++)
        using (var f = new Fixture(level: level))
        {
            foreach (bool launcher in new[] { false, true })
            {
                SelectFitting(f.Loop,f.Art,f.Root,launcher,() => f.Hud.Refresh());
                f.Hud.Refresh();
                string text = f.Text("PhaseDetail").text;
                AssertGarageFields(f);
                RequireGarageVisible(f);
                Require(text.IndexOf(launcher ? "Auxiliary launcher" : "Field repair", StringComparison.OrdinalIgnoreCase) >= 0,
                    "live actual fitting");
                Require(text.Contains(level + "/3") && text.Contains((20 + 10 * level).ToString()), "live actual level and damage");
                Require(text.Contains("Salvage") && text.Contains("0") && text.Contains(level == 3 ? "MAX" : (level + 1).ToString()),
                    "live wallet and next cost/MAX");
                Require(f.Text("SaveStatus").text.Contains("LOCAL SAVE READY"), "actual confirmed save");
                string before = f.Storage.Value;
                SelectFitting(f.Loop,f.Art,f.Root,!launcher,() => f.Hud.Refresh());
                Require(f.Art.showingLauncher != launcher && f.Storage.Value == before && f.Loop.Session.Model == null,
                    "actual fitting selection changes attachment without progression/run");
                Require(f.Text("PhaseDetail").text.IndexOf(launcher ? "Field repair" : "Auxiliary launcher", StringComparison.OrdinalIgnoreCase) >= 0,
                    "fitting selection refreshes live label");
                Require(FindText(f.Root,"GarageFittingName").text == (launcher ? "FIELD REPAIR" : "AUXILIARY LAUNCHER"),
                    "inline card names the actual equipped fitting");
                AssertGarageFields(f);
            }
            Require(f.Text("PhaseHeading").text == "LAST STAND", "Field Console garage title replaces oversized prototype heading");
        }
        using (var f = new Fixture(wallet: 23))
        {
            typeof(LastStandLoopController).GetField("<Phase>k__BackingField", Private).SetValue(f.Loop, "garage"); f.Hud.Refresh();
            Require(f.Text("PhaseDetail").text.Contains("23"), "actual nonzero wallet");
            AssertGarageFields(f);
        }
    }
    static void Denied(Fixture f, string reason)
    {
        f.Hud.Refresh(); var deploy = f.Button("Deploy");
        AssertGarageSaveTruth(f);
        RequireGarageVisible(f);
        Require(deploy.gameObject.activeInHierarchy && !deploy.IsInteractable(), reason + " disabled actual Deploy");
        int run = f.Loop.Progression.ActiveRunId; string save = f.Storage.Value;
        Click(deploy);
        Require(f.Loop.Session.Model == null && f.Loop.Progression.ActiveRunId == run && f.Storage.Value == save,
            reason + " pointer cannot start or persist a run");
        Require(deploy.GetComponentInChildren<Text>().text.Contains("UNAVAILABLE"), reason + " textual disabled cue");
    }
    static void DeployReadinessAndPrimary()
    {
        using (var f = new Fixture())
        {
            typeof(EncounterSession).GetField("focused", Private).SetValue(f.Loop.Session, false); Denied(f, "unfocused");
        }
        using (var f = new Fixture(denyRead: true)) Denied(f, "blocked read");
        using (var f = new Fixture(denyWrite: true)) Denied(f, "unconfirmed initial write");
        using (var f = new Fixture(nextId: int.MaxValue)) Denied(f, "exhausted run id");
        using (var f = new Fixture())
        {
            Require(f.Loop.Progression.TryDeploy(), "actual reserved-run fixture"); Denied(f, "active reservation");
        }
        using (var f = new Fixture())
        {
            Require(f.Loop.Progression.TryDeploy() && f.Loop.Progression.TryStageDefeat(120, 2), "actual pending-result fixture");
            Denied(f, "pending defeat");
        }
        using (var f = new Fixture())
        {
            var deploy = f.Button("Deploy");
            int count = 0; foreach (var b in f.Root.GetComponentsInChildren<Button>()) if (b.name == "Deploy") count++;
            Require(count == 1 && deploy.IsInteractable(), "one ready Deploy");
            var primary = deploy.GetComponent<Image>().color;
            Require(primary.r > .7f && primary.g > .5f && primary.b < .5f && primary != f.Button("FittingNext").GetComponent<Image>().color,
                "Deploy alone has brass primary surface");
            Require(Contrast(deploy.GetComponentInChildren<Text>().color, primary) >= 4.5, "primary ink contrast");
            var label = deploy.GetComponentInChildren<Text>();
            var outline = deploy.GetComponent<Outline>();
            Require(outline != null, "shared action has visible shape focus treatment");
            ExecuteEvents.Execute(deploy.gameObject, new BaseEventData(EventSystem.current), ExecuteEvents.selectHandler);
            Require(outline.enabled, "selected focus shows stroke beyond color");
            ExecuteEvents.Execute(deploy.gameObject, new PointerEventData(EventSystem.current), ExecuteEvents.pointerEnterHandler);
            Require(outline.enabled, "hover shows stroke beyond color");
            ExecuteEvents.Execute(deploy.gameObject, new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left }, ExecuteEvents.pointerDownHandler);
            Require(label.fontStyle == FontStyle.BoldAndItalic, "pressed type cue beyond color");
            ExecuteEvents.Execute(deploy.gameObject, new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left }, ExecuteEvents.pointerUpHandler);
            AssertGarageFeedback(f);
            AssertGarageMuteToggle(f);
            Click(deploy);
            Require(f.Loop.Phase == "battle" && f.Loop.Session.Model != null && f.Loop.Progression.ActiveRunId != 0,
                "actual ready pointer uses existing controller");
        }
    }
    static Rect Bounds(Fixture f, RectTransform rect)
    {
        var corners = new Vector3[4]; rect.GetWorldCorners(corners);
        var lo = f.Camera.WorldToScreenPoint(corners[0]); var hi = f.Camera.WorldToScreenPoint(corners[2]);
        return new Rect(lo.x, f.Canvas.pixelRect.height - hi.y, hi.x - lo.x, hi.y - lo.y);
    }
    static bool Overlap(Rect a, Rect b)
    { return Math.Min(a.xMax, b.xMax) - Math.Max(a.xMin, b.xMin) > .2f && Math.Min(a.yMax, b.yMax) - Math.Max(a.yMin, b.yMin) > .2f; }
    static double Linear(float channel)
    { return channel <= .04045f ? channel / 12.92 : Math.Pow((channel + .055) / 1.055, 2.4); }
    static double Luminance(Color c) { return .2126 * Linear(c.r) + .7152 * Linear(c.g) + .0722 * Linear(c.b); }
    static double Contrast(Color a, Color b)
    { double x = Luminance(a), y = Luminance(b); return (Math.Max(x, y) + .05) / (Math.Min(x, y) + .05); }
    static void GarageGeometryAndContrast()
    {
        var profiles = new[] { new Vector2Int(1366,768), new Vector2Int(1920,1080), new Vector2Int(390,844),
            new Vector2Int(844,390), new Vector2Int(720,640) };
        foreach (var profile in profiles)
        foreach (bool blocked in new[] { false, true })
        using (var f = new Fixture(profile.x, profile.y, denyRead: blocked))
        {
            if (!blocked)
                typeof(LastStandLoopController).GetField("<Notice>k__BackingField", Private).SetValue(f.Loop,
                    "Local save confirmed. Unfinished runs earn no reward. This page must remain loaded for active time to continue. Claim salvage manually after defeat.");
            f.Hud.Refresh(); Canvas.ForceUpdateCanvases();
            RequireGarageVisible(f);
            AssertGarageFields(f);
            AssertGarageSaveTruth(f);
            AssertGarageFeedback(f);
            AssertGarageMuteToggle(f);
            var viewport = new Rect(0, 0, profile.x, profile.y);
            var card = Bounds(f, (RectTransform)f.Root.Find("LastStandCard"));
            Require(Math.Abs(card.x - LastStandHudLayout.Edge) < .2,profile + " loadout keeps its edge alignment");
            if(f.Loop.GarageCardsVisible) AssertGarageHierarchy(f.Loop,f.Root,r=>Bounds(f,r),viewport);
            else if(card.width > LastStandHudLayout.MaximumCardWidth + .2f)
            {
                var detail=Bounds(f,f.Text("PhaseDetail").rectTransform);
                var status=Bounds(f,f.Text("SaveStatus").rectTransform);
                float stackedHeight=2*LastStandHudLayout.PanelPadding+LastStandHudLayout.HeadingLines*LastStandHudLayout.HeadingLineHeight+
                    (LastStandHudLayout.DetailLines+LastStandHudLayout.NoticeLines)*LastStandHudLayout.LineHeight+2*LastStandHudLayout.Gap;
                Require(profile.x>=LastStandHudLayout.PortraitBreakpoint &&
                    card.width<=Math.Min(profile.x-2*LastStandHudLayout.Edge,LastStandHudLayout.MaximumDockWidth)+.2f &&
                    card.height<stackedHeight && Math.Abs(detail.y-status.y)<.2f && detail.xMax+LastStandHudLayout.Gap<=status.xMin+.2f,
                    profile+" short-height loadout reflows into bounded reading columns and frees vertical battlefield space");
            }
            else Require(card.width<=LastStandHudLayout.MaximumCardWidth+.2f,profile+" stacked side loadout keeps tank space");
            var controls = new List<Rect>();
            foreach (var button in f.Root.GetComponentsInChildren<Button>())
            {
                var bounds = Bounds(f, (RectTransform)button.transform);
                Require(bounds.width >= 43.9 && bounds.height >= 43.9, profile + " actual 44px target " + button.name);
                Require(bounds.xMin >= -.2 && bounds.yMin >= -.2 && bounds.xMax <= viewport.xMax + .2 && bounds.yMax <= viewport.yMax + .2,
                    profile + " onscreen target " + button.name);
                Require(!Overlap(bounds, card), profile + " control does not cover the actual title/recovery panel " + button.name +
                    " blocked="+blocked+" control="+bounds+" panel="+card);
                foreach (var prior in controls) Require(!Overlap(bounds, prior), profile + " nonoverlap controls");
                controls.Add(bounds);
                Color background = button.GetComponent<Image>().color;
                Require(Contrast(button.GetComponentInChildren<Text>().color, background) >= 4.5, profile + " normal/disabled action contrast");
            }
            var texts = new List<Rect>();
            foreach (var text in f.Root.GetComponentsInChildren<Text>())
            {
                var bounds = Bounds(f, text.rectTransform);
                float actualScale = bounds.width / text.rectTransform.rect.width;
                Require(text.fontSize * actualScale >= 13.99f, profile + " actual 14px text " + text.name);
                Require(bounds.xMin >= -.2 && bounds.yMin >= -.2 && bounds.xMax <= viewport.xMax + .2 && bounds.yMax <= viewport.yMax + .2,
                    profile + " onscreen text " + text.name);
                Require(text.preferredHeight <= text.rectTransform.rect.height + .2f,
                    profile + " required text not truncated " + text.name + " preferred=" + text.preferredHeight + " rect=" + text.rectTransform.rect.height);
                foreach (var prior in texts) Require(!Overlap(bounds, prior), profile + " nonoverlap text " + text.name);
                texts.Add(bounds);
                if (text.transform.parent.name == "LastStandCard")
                    Require(Contrast(text.color, text.transform.parent.GetComponent<Image>().color) >= 4.5, profile + " loadout text contrast");
            }
            Debug.Log("ST_LS_HUD_PROFILE " + profile.x + "x" + profile.y + " blocked=" + blocked + " canvasScale=" + f.Canvas.scaleFactor);
        }
    }
    static void ShortLandscapeGarageReadability()
    {
        foreach (bool blocked in new[] {false,true})
        foreach (int level in new[] {0,3})
        using (var f = new Fixture(568,196,level:level,denyRead:blocked))
        foreach (bool launcher in new[] {false,true})
        {
            if(!blocked)SelectFitting(f.Loop,f.Art,f.Root,launcher,f.Hud.Refresh);
            else Require(f.Art.TrySelectFitting(launcher?"launcher":"repair"),"blocked short-layout fixture supplies the actual module without bypassing a UI admission claim");
            RefreshCameraCanvas(f.Canvas,f.Hud.Refresh);
            AssertGarageFields(f); AssertGarageSaveTruth(f); RequireGarageVisible(f);
            var card = Bounds(f,(RectTransform)f.Root.Find("LastStandCard"));
            if(f.Loop.GarageCardsVisible) AssertGarageHierarchy(f.Loop,f.Root,r=>Bounds(f,r),new Rect(0,0,568,196));
            var controls = new List<Rect>();
            foreach (var button in f.Root.GetComponentsInChildren<Button>())
            {
                var bounds = Bounds(f,(RectTransform)button.transform);
                Require(bounds.width >= 43.9 && bounds.height >= 43.9,"short landscape actual target " + button.name);
                Require(bounds.xMin >= -.2 && bounds.yMin >= -.2 && bounds.xMax <= 568.2 && bounds.yMax <= 196.2,
                    "short landscape target onscreen " + button.name);
                Require(!Overlap(bounds,card),"short landscape target/card nonoverlap " + button.name);
                foreach (var prior in controls) Require(!Overlap(bounds,prior),"short landscape target nonoverlap");
                controls.Add(bounds);
            }
            foreach (var text in f.Root.GetComponentsInChildren<Text>())
            {
                var bounds = Bounds(f,text.rectTransform);
                float scale = bounds.width / text.rectTransform.rect.width;
                Require(text.fontSize * scale >= 13.99,"short landscape actual14px text " + text.name);
                Require(text.preferredHeight <= text.rectTransform.rect.height + .2f,
                    "short landscape complete text " + text.name + " preferred=" + text.preferredHeight + " rect=" + text.rectTransform.rect.height +
                    " width=" + bounds.width + " label=" + text.text + " blocked=" + blocked + " level=" + level + " launcher=" + launcher);
                Require(bounds.xMin >= -.2 && bounds.yMin >= -.2 && bounds.xMax <= 568.2 && bounds.yMax <= 196.2,
                    "short landscape text onscreen " + text.name);
            }
        }
    }

    // Additive field-boundary oracles. Fixture/domain truth is independent of
    // the presentation text: a repeated digit in another row cannot satisfy it.
    static Match Field(string text, string pattern, string label)
    {
        var found = Regex.Matches(text, pattern, RegexOptions.Multiline | RegexOptions.CultureInvariant);
        Require(found.Count == 1, "one actual labeled garage field " + label);
        return found[0];
    }
    static void AssertGarageFields(Fixture f)
    {
        var progress = f.Loop.Progression; string text = f.Text("PhaseDetail").text;
        var fitting = Field(text, @"^Fitting:[ \t]*(Field repair|Auxiliary launcher)[ \t]*$", "Fitting");
        Require(fitting.Groups[1].Value == (f.Art.showingLauncher ? "Auxiliary launcher" : "Field repair"), "field-bound actual fitting");
        var tier = Field(text, @"^Tier ([12]) / Goal ([0-9]+)s$", "tier and goal");
        Require(int.Parse(tier.Groups[1].Value) == progress.SelectedTier && int.Parse(tier.Groups[2].Value) ==
            (progress.SelectedTier == 1 ? 60 : 90), "approved selected tier goal");
        var level = Field(text, @"^Cannon Attack ([0-9]+)/3 / Damage ([0-9]+)$", "cannon level and damage");
        Require(int.Parse(level.Groups[1].Value) == progress.CannonAttackLevel &&
            int.Parse(level.Groups[2].Value) == progress.CannonDamage, "field-bound actual cannon projection");
        var economy = Field(text, @"^Salvage ([0-9]+) / Next ([0-9]+|MAX)$", "Salvage / Next");
        Require(int.Parse(economy.Groups[1].Value) == progress.Wallet && economy.Groups[2].Value ==
            (progress.NextCost == 0 ? "MAX" : progress.NextCost.ToString()), "actual wallet and next cost");
        Require(text.Split('\n').Length == 5 && text.Split('\n')[1].StartsWith("Best"), "tier best has a dedicated reading line");
    }
    static void AssertGarageSaveTruth(Fixture f)
    {
        if(f.Loop.GarageCardsVisible) { AssertInlineGarageFields(f.Loop,f.Root);return; }
        var status = f.Text("SaveStatus"); RequireVisible(status, "required garage SaveStatus");
        if (f.Loop.Progression.SaveState == "ready")
            Require(status.text.Split('\n')[0] == "LOCAL SAVE READY", "confirmed storage has ready field");
        else
        {
            Require(status.text == f.Loop.Progression.SaveError && !string.IsNullOrEmpty(status.text),
                f.Loop.Progression.SaveState + " storage status shows actual owner failure");
            Require(!status.text.Contains("LOCAL SAVE READY"), f.Loop.Progression.SaveState + " rejected storage cannot claim ready");
        }
    }
    static void RequireVisible(Graphic graphic, string label)
    {
        Require(graphic && graphic.enabled && graphic.gameObject.activeInHierarchy, label + " active/enabled");
        float alpha = graphic.color.a * graphic.canvasRenderer.GetAlpha();
        for (var node = graphic.transform; node != null; node = node.parent)
        {
            var group = node.GetComponent<CanvasGroup>();
            if (group && group.enabled) alpha *= group.alpha;
        }
        Require(alpha > 0, label + " has visible inherited alpha");
        Image background = null;
        for (var node = graphic.transform.parent; node != null && background == null; node = node.parent)
            background = node.GetComponent<Image>();
        if (graphic is Text && background)
        {
            var color = graphic.color;
            var effective = Color.Lerp(background.color, color, Mathf.Clamp01(alpha));
            Require(Contrast(effective, background.color) >= 4.5, label + " effective visible text contrast");
        }
    }
    static void RequireGarageVisible(Fixture f)
    {
        Require(f.Loop.GarageCardsVisible==ExpectedGarageCards(f.Loop),"garage hierarchy follows ready unresolved-run boundaries");
        RequireVisible(f.Text("PhaseHeading"),"required garage title");
        if(f.Loop.GarageCardsVisible) AssertInlineGarageFields(f.Loop,f.Root);
        else foreach(string id in new[]{"PhaseDetail","SaveStatus"})RequireVisible(f.Text(id),"required recovery "+id);
        foreach (string id in CoreControlIds)
        {
            var button = f.Button(id);
            bool expected = id == "Deploy" || id == "Menu" || id == "ResearchEntry" && f.Loop.GarageCardsVisible ||
                IsInlineArrow(id)&&f.Loop.GarageCardsVisible ||
                (id == "RetrySave" && f.Loop.Progression.SaveState != "ready");
            Require(button.gameObject.activeInHierarchy == expected, "actual garage control inventory " + id+
                " phase="+f.Loop.Phase+" save="+f.Loop.Progression.SaveState+" activeSelf="+button.gameObject.activeSelf+
                " activeInHierarchy="+button.gameObject.activeInHierarchy+" menu="+f.Loop.MenuPage);
            if (!expected) continue;
            Require(button.enabled, "required garage Button enabled " + id);
            RequireVisible(button.GetComponent<Image>(), "required garage control " + id);
            var label = button.transform.Find(id + "Text").GetComponent<Text>();
            RequireVisible(label, "required garage control text " + id);
            Require(!string.IsNullOrEmpty(label.text), "required garage action label " + id);
        }
    }
    static void AssertGarageFeedback(Fixture f)
    {
        foreach (string id in new[] { "TierPrevious","TierNext","FittingPrevious","FittingNext","Deploy","ToggleMute","RetrySave","Menu" })
        {
            var button = f.Button(id); if (!button.gameObject.activeInHierarchy) continue;
            var label = button.GetComponentInChildren<Text>(true); var outline = button.GetComponent<Outline>();
            Require(outline, id + " shared stroke exists");
            var pointer = new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left };
            var basic = new BaseEventData(EventSystem.current);
            // Clear every earlier interaction before each isolated state. A
            // selected stroke must never hide a missing hover response.
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerUpHandler);
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerExitHandler);
            ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.deselectHandler);
            bool available = button.IsInteractable();
            Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), id + " isolated neutral cue");
            ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.selectHandler);
            Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.Bold : FontStyle.Italic), id + " isolated selected cue");
            ExecuteEvents.Execute(button.gameObject, basic, ExecuteEvents.deselectHandler);
            Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), id + " deselection clears cue");
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerEnterHandler);
            Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.Bold : FontStyle.Italic), id + " isolated hover cue");
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerExitHandler);
            Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), id + " pointer exit clears cue");
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerDownHandler);
            Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.BoldAndItalic : FontStyle.Italic), id + " isolated pressed cue");
            ExecuteEvents.Execute(button.gameObject, pointer, ExecuteEvents.pointerUpHandler);
            Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), id + " pointer release clears cue");
            if (available) Require(outline.effectColor.a > 0 && outline.effectDistance.sqrMagnitude > 0, id + " visible non-color stroke");
        }
    }
    static void AssertGarageMuteToggle(Fixture f)
    {
        Require(!f.Button("ToggleMute").IsActive(),"garage leaves audio control in Settings");
        OpenSettings(f.Loop,f.Root,0,f.Hud.Refresh);
        var button = f.Button("SettingsMute"); var label = button.GetComponentInChildren<Text>(true);
        bool before = f.Loop.Muted; string save = f.Storage.Value; int run = f.Loop.Progression.ActiveRunId;
        RequireVisible(label, "visible actual sound toggle");
        Require(label.text == (before ? "MASTER SOUND: OFF" : "MASTER SOUND: ON"), "actual current sound label");
        Click(button); Require(f.Loop.Muted != before, "actual sound callback changes owner mute");
        RequireVisible(label, "visible toggled sound label");
        Require(label.text == (f.Loop.Muted ? "MASTER SOUND: OFF" : "MASTER SOUND: ON"), "actual toggled sound label");
        Click(button); Require(f.Loop.Muted == before && label.text == (before ? "MASTER SOUND: OFF" : "MASTER SOUND: ON"), "sound callback restores owner and label");
        Click(f.Button("SettingsClose")); Require(!f.Loop.MenuOpen,"garage settings closes through actual control");
        Require(f.Storage.Value == save && f.Loop.Progression.ActiveRunId == run && f.Loop.Session.Model == null,
            "garage sound toggling cannot save or start a run");
    }
    static void OpenSettings(LastStandLoopController loop,RectTransform root,int tab,Action refresh)
    {
        foreach(string id in new[]{"Menu","MenuSettings","SettingsTab"+tab})
        {
            var button=FindOrdinaryButton(root,id);
            Require(button.IsActive()&&button.IsInteractable(),"settings journey exposes actual control "+id);
            Click(button);refresh();
        }
        Require(loop.MenuPage=="settings","actual Menu journey opens Settings");
        if(loop.Session.Model!=null)Require(loop.Session.MenuPaused&&loop.Session.Paused,"settings holds active run pause");
    }

    // T-06 extends the same actual scene/Canvas fixture. All garage fixtures,
    // selectors and assertions above remain unchanged.
    static readonly Vector2Int[] BattleProfiles = { new Vector2Int(1366,768), new Vector2Int(1920,1080),
        new Vector2Int(390,844), new Vector2Int(844,390), new Vector2Int(720,640) };
    public static void RunBattle()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory; int failures = 0;
        try
        {
            Case("test_live_hull_time_kills_damage_and_fitting", BattleLiveValues, ref failures);
            Case("test_battle_chrome_geometry_and_contrast", BattleGeometry, ref failures);
            Case("test_pause_mute_and_catchup_presentation", BattleActions, ref failures);
            Case("test_battle_canvas_derived_geometry", DerivedBattleGeometry, ref failures);
        }
        finally
        {
            LastStandLoopController.StorageFactory = factory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
        if (failures != 0) throw new InvalidOperationException("Actual battle HUD assertion failures: " + failures);
    }
    static LastStandRunClock Clock(Fixture f)
    { return (LastStandRunClock)typeof(EncounterSession).GetField("runClock", Private).GetValue(f.Loop.Session); }
    static void DeployBattle(Fixture f, bool launcher)
    {
        SelectFitting(f.Loop,f.Art,f.Root,launcher,() => f.Hud.Refresh());
        Click(f.Button("Deploy"));
        Require(f.Loop.Phase == "battle" && f.Loop.Session.Model != null, "real controller deploys combat fixture");
        // Deploy changes the real world camera. In edit-mode batch checks,
        // rebind the camera-backed Canvas after that move (the player uses
        // overlay). This retains actual Canvas nodes and the target viewport.
        f.Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        f.Canvas.renderMode = RenderMode.ScreenSpaceCamera; f.Canvas.worldCamera = f.Camera;
        Canvas.ForceUpdateCanvases(); f.Hud.Refresh(); Canvas.ForceUpdateCanvases();
    }
    static void StepBattle(Fixture f)
    { f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp + LastStandRunClock.StepSeconds); f.Hud.Refresh(); }
    static void ReanchorPointer(Fixture f)
    {
        // Preserve the real clock's debt/steps/pause state while moving the
        // injected test timeline back to the runtime clock for a real pointer.
        typeof(LastStandRunClock).GetField("anchor", Private).SetValue(Clock(f), Time.realtimeSinceStartupAsDouble);
    }
    static Image BattleImage(Fixture f, string path)
    {
        var node = f.Root.Find("LastStandCard/" + path);
        Require(node != null, "required actual battle image " + path);
        var image = node.GetComponent<Image>(); Require(image != null, "actual battle Image " + path);
        RequireVisible(image, "required battle image " + path); return image;
    }
    static void AssertBattleFields(Fixture f)
    {
        var model = f.Loop.Session.Model; Require(model != null, "actual deployed model supplies readouts");
        var expected = new Dictionary<string,string> {
            { "HullValue", "HULL  " + model.Hull + " / " + EncounterModel.MaximumHull },
            { "ElapsedTime", "T" + model.Profile.Tier + " " + model.Tick / 20 + "/" + (model.Profile.Tier == 1 ? 60 : 90) + "s" },
            { "DisabledCount", "DISABLED  " + model.Kills },
            { "CannonDamage", "CANNON  " + model.CommittedCannonDamage + " DAMAGE" },
            { "Fitting", "FITTING  " + (model.HasLauncher ? "AUXILIARY LAUNCHER" : "FIELD REPAIR") }
        };
        foreach (var item in expected)
        {
            var text = f.Text(item.Key); RequireVisible(text, "required battle " + item.Key);
            Require(text.text == item.Value, "field-bound committed battle " + item.Key + " expected=" + item.Value + " actual=" + text.text);
        }
        var track = BattleImage(f,"HullBar"); var fill = BattleImage(f,"HullBar/HullFill");
        var bounds = Bounds(f, track.rectTransform); var filled = Bounds(f, fill.rectTransform);
        Require(bounds.width > 0 && bounds.height >= 3.9f, "real nonempty hull track bounds=" + bounds);
        Require(Math.Abs(filled.width / bounds.width - model.Hull / (float)EncounterModel.MaximumHull) < .001f,
            "actual hull fill ratio follows committed Hull/MaximumHull");
        Require(Math.Abs(filled.x - bounds.x) < .2f && Math.Abs(filled.y - bounds.y) < .2f &&
            Math.Abs(filled.height - bounds.height) < .2f, "actual fill stays left-aligned inside hull track");
        Require(fill.color.g > fill.color.r && fill.color.g > fill.color.b && fill.color.a >= .99f,
            "actual opaque green hull fill accompanies numeric HULL");
        Require(Contrast(fill.color, track.color) >= 3, "hull fill distinguished from track");
        Require(Contrast(Color.Lerp(track.color, fill.color, Mathf.Clamp01(GraphicAlpha(fill))), track.color) >= 3,
            "actual rendered hull fill effective contrast including CanvasRenderer and ancestor alpha");
    }
    static void RequireBattleInventory(Fixture f)
    {
        RequireVisible(f.Text("PhaseHeading"), "required battle PhaseHeading");
        foreach (string id in CoreControlIds)
        {
            var button = f.Button(id); bool active = id=="Menu" || id=="SpeedMinus"||id=="SpeedRate"||id=="SpeedPlus" ||
                id=="WaveInfo" && f.Loop.Session.Model?.Profile.IsWaveBased==true;
            Require(button.gameObject.activeInHierarchy == active, "actual battle stable control inventory " + id);
            if (!active) continue;
            Require(button.enabled, "actual battle Button enabled " + id);
            if(id=="WaveInfo") { RequireVisible(f.Text("ElapsedTime"),"interactive wave readout");continue; }
            RequireVisible(button.GetComponent<Image>(), "required battle action " + id);
            RequireVisible(button.transform.Find(id + "Text").GetComponent<Text>(), "required battle action label " + id);
        }
        Require(!f.Text("PhaseDetail").gameObject.activeInHierarchy && !f.Text("SaveStatus").gameObject.activeInHierarchy,
            "battle uses shared perimeter readouts instead of opaque phase content");
    }
    static void BattleLiveValues()
    {
        foreach (var profile in BattleProfiles)
        for (int level = 0; level <= 3; level++)
        foreach (bool launcher in new[] { false, true })
        using (var f = new Fixture(profile.x, profile.y, level: level))
        {
            DeployBattle(f, launcher); f.Hud.Refresh(); Canvas.ForceUpdateCanvases();
            AssertBattleFields(f); RequireBattleInventory(f);
            var model = f.Loop.Session.Model;
            Require(model.CommittedCannonDamage == 20 + 10 * level && model.HasLauncher == launcher, "actual committed deployment inputs");
            int initialHull = model.Hull, initialTick = model.Tick, initialKills = model.Kills;
            for (int i = 0; i < model.Profile.Horizon && model.Status == EncounterStatus.Running; i++)
            {
                StepBattle(f);
                if (model.Hull < initialHull && model.Kills > initialKills) break;
            }
            Require(model.Status == EncounterStatus.Running && model.Hull < initialHull && model.Tick > initialTick && model.Kills > initialKills,
                "real stepping changes hull time and disabled count before terminal");
            Canvas.ForceUpdateCanvases(); AssertBattleFields(f);
            string save = f.Storage.Value; int tick = model.Tick, hull = model.Hull, kills = model.Kills;
            // Independent stale-source control: change only test-owned owner
            // inputs after deployment. The combat readouts must stay committed.
            var other = new MemoryStorage { Value = Save((level + 1) % 4, 0, 9) };
            typeof(LastStandLoopController).GetField("<Progression>k__BackingField", Private).SetValue(f.Loop, LastStandProgression.Load(other));
            f.Art.showingLauncher = !launcher; f.Hud.Refresh(); Canvas.ForceUpdateCanvases(); AssertBattleFields(f);
            Require(f.Storage.Value == save && model.Tick == tick && model.Hull == hull && model.Kills == kills,
                "presentation refresh cannot change committed combat or save");
            Debug.Log("ST_LS_HUD_BATTLE_PROFILE live " + profile.x + "x" + profile.y + " level=" + level + " launcher=" + launcher);
        }
    }
    static void BattleState(Fixture f, string state)
    {
        if (state == "paused" || state == "resume-blocked") { ReanchorPointer(f); Click(f.Button("SpeedRate")); Require(f.Loop.Session.Paused, "actual pause fixture"); }
        if (state == "background" || state == "resume-blocked")
            typeof(EncounterSession).GetMethod("OnApplicationFocus", Private).Invoke(f.Loop.Session,new object[] { false });
        if (state == "muted")
        {
            ReanchorPointer(f);OpenSettings(f.Loop,f.Root,0,f.Hud.Refresh);
            Click(f.Button("SettingsMute"));Click(f.Button("SettingsClose"));
            Require(!f.Loop.MenuOpen&&!f.Loop.Session.Paused,"audio journey releases only the menu pause");
        }
        if (state == "catch-up") { f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp + 10); Require(f.Loop.Session.CatchingUp, "actual over-budget clock debt"); }
        if (state == "settling")
        {
            while (f.Loop.Session.Model.Status == EncounterStatus.Running) StepBattle(f);
            Require(f.Loop.Phase == "settling" && f.Loop.Progression.PendingDefeat != null, "actual persisted defeat settling fixture");
        }
        f.Hud.Refresh(); Canvas.ForceUpdateCanvases();
    }
    static void BattleGeometry()
    {
        foreach (var profile in BattleProfiles)
        foreach (string state in new[] { "running", "paused", "muted", "background", "catch-up", "settling", "resume-blocked" })
        using (var f = new Fixture(profile.x, profile.y))
        {
            DeployBattle(f, true); BattleState(f, state);
            AssertBattleFields(f); RequireBattleInventory(f); AssertGarageFeedback(f); AssertBattlePauseFeedback(f);
            var center = new Rect(profile.x * .2f, profile.y * .2f, profile.x * .6f, profile.y * .6f);
            var card = Bounds(f, (RectTransform)f.Root.Find("LastStandCard"));
            var dock = Bounds(f, (RectTransform)f.Root.Find("LastStandDock"));
            Require(!Overlap(card,dock), "actual battle containing panels do not overlap");
            Require((card.width * card.height + dock.width * dock.height) / (profile.x * (float)profile.y) <= .25001f,
                "actual containing combat chrome at most 25 percent");
            foreach (var image in f.Root.GetComponentsInChildren<Image>())
            {
                RequireVisible(image, "actual battle Image " + image.name);
                var bounds = Bounds(f, image.rectTransform);
                Require(!Overlap(bounds,center), "no actual battle opaque Image intersects center " + image.name);
                Require(Contained(bounds,new Rect(0,0,profile.x,profile.y)), "actual battle Image onscreen " + image.name);
            }
            var controls = new List<Rect>();
            foreach (var button in f.Root.GetComponentsInChildren<Button>())
            {
                var bounds = Bounds(f,(RectTransform)button.transform);
                Require(bounds.width >= 43.9f && bounds.height >= 43.9f, "actual battle 44px target " + button.name);
                foreach (var prior in controls) Require(!Overlap(bounds,prior), "actual battle controls nonoverlap");
                controls.Add(bounds);
            }
            var texts = new List<Rect>();
            foreach (var text in f.Root.GetComponentsInChildren<Text>())
            {
                RequireVisible(text,"actual battle readable " + text.name);
                var bounds = Bounds(f,text.rectTransform);
                Require(text.fontSize * bounds.height / text.rectTransform.rect.height >= 13.99f, "actual battle 14px text " + text.name);
                Require(Contained(bounds,new Rect(0,0,profile.x,profile.y)), "actual battle text onscreen " + text.name);
                Require(text.preferredHeight <= text.rectTransform.rect.height + .2f, "actual battle text not truncated " + text.name + " value=" + text.text);
                Require(Contained(bounds,Bounds(f,(RectTransform)text.transform.parent)), "actual battle text inside real parent " + text.name);
                foreach (var prior in texts) Require(!Overlap(bounds,prior), "actual battle text nonoverlap " + text.name);
                texts.Add(bounds);
            }
            Debug.Log("ST_LS_HUD_BATTLE_PROFILE geometry " + profile.x + "x" + profile.y + " state=" + state);
        }
    }
    static bool Contained(Rect inner, Rect outer)
    { return inner.xMin >= outer.xMin - .2f && inner.yMin >= outer.yMin - .2f && inner.xMax <= outer.xMax + .2f && inner.yMax <= outer.yMax + .2f; }
    static void AssertBattlePauseFeedback(Fixture f)
    {
        var button = f.Button("SpeedRate"); var label = button.GetComponentInChildren<Text>(true); var outline = button.GetComponent<Outline>();
        Require(outline, "battle Pause shared stroke exists");
        var pointer = new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left };
        var basic = new BaseEventData(EventSystem.current); bool available = button.IsInteractable();
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerUpHandler);
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerExitHandler);
        ExecuteEvents.Execute(button.gameObject,basic,ExecuteEvents.deselectHandler);
        Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), "battle Pause neutral/disabled type cue");
        ExecuteEvents.Execute(button.gameObject,basic,ExecuteEvents.selectHandler);
        Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.Bold : FontStyle.Italic), "battle Pause isolated focus shape/type");
        ExecuteEvents.Execute(button.gameObject,basic,ExecuteEvents.deselectHandler);
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerEnterHandler);
        Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.Bold : FontStyle.Italic), "battle Pause isolated hover shape/type");
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerExitHandler);
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerDownHandler);
        Require(outline.enabled == available && label.fontStyle == (available ? FontStyle.BoldAndItalic : FontStyle.Italic), "battle Pause isolated press shape/type");
        ExecuteEvents.Execute(button.gameObject,pointer,ExecuteEvents.pointerUpHandler);
        Require(!outline.enabled && label.fontStyle == (available ? FontStyle.Normal : FontStyle.Italic), "battle Pause release/disabled cue");
        if (available) Require(outline.effectColor.a > 0 && outline.effectDistance.sqrMagnitude > 0, "battle Pause visible shared stroke");
    }
    static void BattleActions()
    {
        foreach (var profile in BattleProfiles)
        using (var f = new Fixture(profile.x,profile.y))
        {
            DeployBattle(f, false); f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp + 10); f.Hud.Refresh();
            Require(f.Loop.Session.CatchingUp && f.Text("PhaseHeading").text == "CATCHING UP", "actual clock debt has honest visible catch-up heading");
            var pause = f.Button("SpeedRate");
            Require(pause.gameObject.activeInHierarchy && !pause.IsInteractable() && pause.GetComponentInChildren<Text>().text == "WAIT",
                "catch-up disables actual conflicting Pause with textual state");
            string save = f.Storage.Value; string snapshot = f.Loop.Session.Model.Snapshot(); double debt = Clock(f).PendingSeconds;
            Click(pause); Require(!f.Loop.Session.Paused && f.Loop.Session.Model.Snapshot() == snapshot && Clock(f).PendingSeconds == debt && f.Storage.Value == save,
                "disabled catch-up pointer cannot pause drain debt change combat or save");
            f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp); f.Hud.Refresh();
            Require(!f.Loop.Session.CatchingUp && pause.IsInteractable() && pause.GetComponentInChildren<Text>().text == "1.0x" &&
                f.Text("PhaseHeading").text == LastStandTierHudText.BattleHeading(f.Loop.Session.Model.Profile.Tier,f.Loop.Session.Model.Tick),
                "debt drainage restores the current tier and goal heading");
            ReanchorPointer(f); Click(pause);
            Require(f.Loop.Session.Paused && f.Text("PhaseHeading").text == "BATTLE PAUSED" && pause.GetComponentInChildren<Text>().text == "0x\nPAUSED", "real rate control pauses the owner with visible state");
            snapshot = f.Loop.Session.Model.Snapshot(); f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp + 10);
            Require(f.Loop.Session.Model.Snapshot() == snapshot, "paused owner excludes time and combat changes");
            typeof(EncounterSession).GetMethod("OnApplicationFocus", Private).Invoke(f.Loop.Session,new object[] { false });
            f.Hud.Refresh(); Require(f.Loop.Session.Paused && !pause.IsInteractable() && pause.GetComponentInChildren<Text>().text == "WAIT",
                "unfocused explicit pause stays visible and Resume follows actual owner refusal");
            Click(pause); Require(f.Loop.Session.Paused && f.Loop.Session.Model.Snapshot() == snapshot, "blocked Resume pointer cannot clear user Pause");
            typeof(EncounterSession).GetMethod("OnApplicationFocus", Private).Invoke(f.Loop.Session,new object[] { true });
            ReanchorPointer(f); Click(pause); Require(!f.Loop.Session.Paused && pause.IsInteractable() && pause.GetComponentInChildren<Text>().text == "1.0x", "real Resume owner excludes paused interval");
            bool before = f.Loop.Muted; snapshot = f.Loop.Session.Model.Snapshot();
            ReanchorPointer(f);OpenSettings(f.Loop,f.Root,0,f.Hud.Refresh);var sound = f.Button("SettingsMute");
            Click(sound); Require(f.Loop.Muted != before && sound.GetComponentInChildren<Text>().text == (f.Loop.Muted ? "MASTER SOUND: OFF" : "MASTER SOUND: ON"), "actual battle Audio setting callback and active label");
            Click(sound);Click(f.Button("SettingsClose"));
            Require(f.Loop.Muted == before && f.Loop.Session.Model.Snapshot() == snapshot && f.Storage.Value == save &&
                !f.Loop.Session.Paused&&!f.Loop.Session.MenuPaused&&!f.Loop.MenuOpen,"Audio round trip preserves combat and releases only menu pause");
            typeof(EncounterSession).GetMethod("OnApplicationFocus", Private).Invoke(f.Loop.Session,new object[] { false });
            StepBattle(f); Require(!f.Loop.Session.Paused && pause.GetComponentInChildren<Text>().text == "1.0x", "focus loss alone never becomes manual pause");
            typeof(EncounterSession).GetMethod("OnApplicationFocus", Private).Invoke(f.Loop.Session,new object[] { true });
            BattleState(f,"settling"); RequireBattleInventory(f); ReanchorPointer(f); Click(pause);
            Require(f.Loop.Session.Paused && pause.IsInteractable() && pause.GetComponentInChildren<Text>().text == "0x\nPAUSED" && f.Text("PhaseHeading").text == "SETTLING PAUSED", "existing settling owner exposes rate Pause/Resume");
            double terminal = f.Loop.Session.TerminalElapsedSeconds; f.Loop.Session.AdvanceAt(Clock(f).LastTimestamp + 10); Invoke(f.Loop,"Update");
            Require(f.Loop.Phase == "settling" && f.Loop.Session.TerminalElapsedSeconds == terminal, "paused settling cannot advance or auto-Claim");
            ReanchorPointer(f); Click(pause); Require(!f.Loop.Session.Paused && f.Text("PhaseHeading").text == "LAST SHOT", "real settling Resume is presented");
            Debug.Log("ST_LS_HUD_BATTLE_PROFILE actions " + profile.x + "x" + profile.y);
        }
        using (var f = new Fixture())
        {
            DeployBattle(f,false); f.Loop.Session.AdvanceAt(double.NaN); f.Hud.Refresh();
            Require(f.Loop.Session.Model == null && f.Loop.Phase == "garage" && !f.Button("Pause").gameObject.activeInHierarchy &&
                f.Text("SaveStatus").text.Contains("technical problem") && !f.Text("PhaseHeading").text.Contains("PAUSED") &&
                f.Loop.Progression.PendingDefeat == null && f.Loop.Progression.Wallet == 0, "actual technical failure stays distinct and non-awarding through existing owner");
        }
    }
    // Additional available-Canvas inputs from the existing page wrapper. The
    // original five fixtures and their geometry assertions above stay intact.
    static void DerivedBattleGeometry()
    {
        var original = (Vector2Int[])BattleProfiles.Clone();
        var available = new[] { new Vector2Int(1366,664), new Vector2Int(1920,976),
            new Vector2Int(390,688), new Vector2Int(844,266), new Vector2Int(720,516) };
        try
        {
            Array.Copy(available, BattleProfiles, available.Length);
            Debug.Log("ST_LS_HUD_DERIVED_BEGIN original-profiles-preserved");
            BattleGeometry();
            Debug.Log("ST_LS_HUD_DERIVED_END five-available-canvas-profiles");
        }
        finally { Array.Copy(original, BattleProfiles, original.Length); }
    }
    static float GraphicAlpha(Graphic graphic)
    {
        float alpha = graphic.color.a * graphic.canvasRenderer.GetAlpha();
        for (var node = graphic.transform; node != null; node = node.parent)
        {
            var group = node.GetComponent<CanvasGroup>();
            if (group && group.enabled) alpha *= group.alpha;
        }
        return alpha;
    }
    const string RuntimeKey = "ST_T06_OWNED_RUNTIME_CHECK";
    static readonly List<string> runtimeReports = new List<string>();
    static MemoryStorage runtimeStorage;
    static int runtimeFactoryCalls, runtimeStage, runtimeTick, runtimeFrames;
    static double runtimeDeadline, runtimeStageTime;
    static LastStandLoopController runtimeLoop;
    static LastStandLoopHud runtimeHud;
    static RectTransform runtimeRoot;
    static LastStandTestPreferencesScope runtimePreferences;
    static LastStandHudChecks()
    {
        // Domain reload calls this before the dedicated scene's actual Start.
        if (UnityEditor.SessionState.GetBool(RuntimeKey, false)) ArmRuntime();
    }
    static void ArmRuntime()
    {
        if(runtimePreferences==null)runtimePreferences=new LastStandTestPreferencesScope();
        runtimeStorage = new MemoryStorage { Value = Save(0,0,1) };
        LastStandLoopController.StorageFactory = () => { runtimeFactoryCalls++; return runtimeStorage; };
        Application.logMessageReceived -= CaptureRuntime;
        Application.logMessageReceived += CaptureRuntime;
        UnityEditor.EditorApplication.update -= RuntimeUpdate;
        UnityEditor.EditorApplication.update += RuntimeUpdate;
        runtimeDeadline = UnityEditor.EditorApplication.timeSinceStartup + 90;
    }
    public static void RunBattleRuntime()
    {
        Require(!Application.isPlaying, "runtime launch starts in actual Editor edit mode");
        UnityEditor.SessionState.SetBool(RuntimeKey,true);
        ArmRuntime(); // Also protects Start when the user's Editor skips reload.
        EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity", OpenSceneMode.Single);
        UnityEditor.EditorApplication.isPlaying = true;
    }
    static void CaptureRuntime(string text, string stack, LogType type)
    {
        const string prefix = "ST_LS_HUD_LAYOUT ";
        if (text.StartsWith(prefix,StringComparison.Ordinal)) runtimeReports.Add(text.Substring(prefix.Length));
    }
    [Serializable] sealed class RuntimeControl
    { public string name,label; public float x,y,width,height; public bool active,interactable; }
    [Serializable] sealed class RuntimeLayout
    { public string schema,phase,coordinates; public int width,height; public RuntimeControl[] controls,shopControls,settingsControls,researchControls,historyControls,plannerControls; }
    static Button RuntimeButton(string id)
    { return FindOrdinaryButton(runtimeRoot,id); }
    static void AssertRuntimeReport(string state)
    {
        Require(Application.isPlaying, "actual play mode, never an edited isPlaying premise");
        Require(runtimeReports.Count > 0, "actual current ST_LS_HUD_LAYOUT emitted " + state);
        var report = JsonUtility.FromJson<RuntimeLayout>(runtimeReports[runtimeReports.Count - 1]);
        Require(report.phase == runtimeLoop.Phase && report.coordinates == "top-left", "runtime current phase and top-left coordinate contract " + state);
        Require(report.width == Screen.width && report.height == Screen.height && report.width > 0 && report.height > 0,
            "runtime actual Screen dimensions " + state);
        Require(report.schema=="singedterra-last-stand-observation/v4","runtime declares the current controls schema");
        AssertOrdinaryInventory(runtimeRoot,"runtime " + state);
        var seen=new HashSet<string>();int expectedCount=0;
        foreach(var inventory in LastStandObservationContractChecks.CurrentControlInventory())
        {
            var controls=(RuntimeControl[])typeof(RuntimeLayout).GetField(inventory.Key).GetValue(report);
            AssertRuntimeControls(controls,inventory.Value,seen,state);
            expectedCount+=inventory.Value.Length;
        }
        Require(seen.Count==expectedCount,"runtime exact unique complete control union");
        int count = runtimeReports.Count;
        runtimeHud.Refresh(); runtimeHud.Layout(); runtimeHud.Layout();
        Require(runtimeReports.Count == count, "runtime duplicate current layout payload suppressed " + state);
        Debug.Log("ST_LS_HUD_RUNTIME_STATE " + state + " phase=" + report.phase + " screen=" + report.width + "x" + report.height + " controls=" + expectedCount + " duplicate-suppressed");
    }
    static void AssertRuntimeControls(RuntimeControl[] controls,string[] ids,HashSet<string> seen,string state)
    {
        Require(controls!=null&&controls.Length==ids.Length,"runtime exact current control inventory "+state);
        var corners=new Vector3[4];
        for(int i=0;i<ids.Length;i++)
        {
            var control=controls[i];var button=RuntimeButton(ids[i]);
            Require(control.name==ids[i]&&seen.Add(control.name),"runtime ordered unique control identity "+ids[i]);
            string actualLabel=ids[i]=="WaveInfo"?runtimeRoot.Find("LastStandCard/ElapsedTime").GetComponent<Text>().text:button.GetComponentInChildren<Text>(true).text;
            Require(control.label==actualLabel&&control.active==button.gameObject.activeInHierarchy&&control.interactable==button.IsInteractable(),
                "runtime current label active/interactable state "+ids[i]+" "+state);
            ((RectTransform)button.transform).GetWorldCorners(corners);
            var lo=RectTransformUtility.WorldToScreenPoint(null,corners[0]);var hi=RectTransformUtility.WorldToScreenPoint(null,corners[2]);
            Require(Math.Abs(control.x-lo.x)<.2f&&Math.Abs(control.y-(Screen.height-hi.y))<.2f&&
                Math.Abs(control.width-(hi.x-lo.x))<.2f&&Math.Abs(control.height-(hi.y-lo.y))<.2f,
                "runtime actual top-left control bounds "+ids[i]+" "+state);
        }
    }
    static void RuntimeUpdate()
    {
        try
        {
            Require(UnityEditor.EditorApplication.timeSinceStartup < runtimeDeadline, "runtime actual Start/Update deadline");
            if (!Application.isPlaying || ++runtimeFrames < 5) return;
            if (runtimeStage == 0)
            {
                runtimeLoop = UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();
                if (!runtimeLoop || runtimeLoop.Session == null || runtimeLoop.Progression == null) return;
                Require(runtimeFactoryCalls == 1 && runtimeStorage != null && runtimeLoop.Progression.SaveState == "ready",
                    "memory storage installed before actual Start; player save never accessed");
                runtimeHud = (LastStandLoopHud)typeof(LastStandLoopController).GetField("hud",Private).GetValue(runtimeLoop);
                runtimeRoot = (RectTransform)UnityEngine.Object.FindFirstObjectByType<Canvas>().transform.Find("LastStandLoopHud");
                AssertRuntimeReport("actual-Start-garage");
                typeof(EncounterSession).GetMethod("OnApplicationFocus",Private).Invoke(runtimeLoop.Session,new object[] { true });
                runtimeHud.Refresh();
                Require(runtimeLoop.Session.CanRun && RuntimeButton("Deploy").IsInteractable(), "runtime focused owner admits Deploy");
                Click(RuntimeButton("Deploy"));
                Require(runtimeLoop.Phase == "battle" && runtimeLoop.Session.Model != null, "runtime real Deploy pointer enters battle");
                AssertRuntimeReport("deployed-battle"); runtimeTick = runtimeLoop.Session.Model.Tick;
                runtimeStageTime = Time.realtimeSinceStartupAsDouble; runtimeStage = 1;
            }
            else if (runtimeStage == 1)
            {
                if (Time.realtimeSinceStartupAsDouble - runtimeStageTime < .25) return;
                Require(runtimeLoop.Session.Model.Tick > runtimeTick, "actual runtime Update advances committed battle tick");
                AssertRuntimeReport("actual-Update-battle"); Click(RuntimeButton("SpeedRate"));
                Require(runtimeLoop.Session.Paused && RuntimeButton("SpeedRate").GetComponentInChildren<Text>().text == "0x\nPAUSED", "runtime actual rate Pause owner and visible paused label");
                AssertRuntimeReport("paused-battle"); runtimeTick = runtimeLoop.Session.Model.Tick;
                runtimeStageTime = Time.realtimeSinceStartupAsDouble; runtimeStage = 2;
            }
            else if(runtimeStage==2)
            {
                if (Time.realtimeSinceStartupAsDouble - runtimeStageTime < .25) return;
                Require(runtimeLoop.Session.Model.Tick == runtimeTick, "actual runtime paused Update excludes battle time");
                bool muted = runtimeLoop.Muted;OpenSettings(runtimeLoop,runtimeRoot,0,runtimeHud.Refresh);Click(RuntimeButton("SettingsMute"));
                Require(runtimeLoop.Muted != muted && runtimeLoop.Session.MenuPaused && runtimeLoop.Session.ManualPaused, "runtime actual sound state changes under both pause owners");
                Click(RuntimeButton("SettingsClose"));
                Require(!runtimeLoop.MenuOpen&&!runtimeLoop.Session.MenuPaused&&runtimeLoop.Session.ManualPaused&&runtimeLoop.Session.Model.Tick==runtimeTick,
                    "runtime Audio close preserves manual pause and exact tick");
                // Closing Settings genuinely transfers focus to Menu. Its
                // Selectable tint fades over real frames and belongs in the
                // reported payload; test de-duplication only after that actual
                // visual transition has completed, without changing its color.
                runtimeStageTime=Time.realtimeSinceStartupAsDouble;runtimeStage=3;
            }
            else
            {
                var menu=RuntimeButton("Menu");var colors=menu.colors;
                if(Time.realtimeSinceStartupAsDouble-runtimeStageTime<colors.fadeDuration+.5)return;
                Require(EventSystem.current.currentSelectedGameObject==menu.gameObject,"runtime Settings close restores actual Menu focus");
                var tint=menu.targetGraphic.canvasRenderer.GetColor();var expected=colors.selectedColor*colors.colorMultiplier;
                Require(Math.Abs(tint.r-expected.r)<.001f&&Math.Abs(tint.g-expected.g)<.001f&&
                    Math.Abs(tint.b-expected.b)<.001f&&Math.Abs(tint.a-expected.a)<.001f,
                    "runtime Menu highlight completes its real bounded Selectable fade");
                Require(runtimeLoop.Session.ManualPaused&&!runtimeLoop.Session.MenuPaused&&runtimeLoop.Session.Model.Tick==runtimeTick,
                    "runtime focus transition cannot release manual pause or advance combat");
                AssertRuntimeReport("sound-toggled"); Click(RuntimeButton("SpeedRate"));
                Require(!runtimeLoop.Session.Paused, "runtime real Resume callback"); AssertRuntimeReport("resumed-battle");
                Debug.Log("ST_LS_HUD_PASS test_current_layout_runtime_report"); FinishRuntime(0);
            }
        }
        catch (Exception error)
        { Debug.LogError("ST_LS_HUD_FAIL test_current_layout_runtime_report " + error); FinishRuntime(1); }
    }
    static void FinishRuntime(int exit)
    {
        runtimePreferences?.Dispose();runtimePreferences=null;
        UnityEditor.SessionState.SetBool(RuntimeKey,false);
        Application.logMessageReceived -= CaptureRuntime;
        UnityEditor.EditorApplication.update -= RuntimeUpdate;
        UnityEditor.EditorApplication.Exit(exit);
    }

    // T-07 adds actual outcome fixtures. All original garage/battle fixtures,
    // assertion statements, runtime selectors and report checks remain intact.
    sealed class OutcomeStorage : ILastStandStorage
    {
        public string Value;
        public bool DenyRead, DenyWrite, WriteThenFailRead, FailNextRead, MismatchAfterWrite, MismatchNextRead;
        public int Writes;
        public string Read()
        {
            if (DenyRead || FailNextRead) { FailNextRead = false; throw new InvalidOperationException("read failed"); }
            if (MismatchNextRead) { MismatchNextRead = false; return "mismatch"; }
            return Value;
        }
        public void Write(string value)
        {
            if (DenyWrite) throw new InvalidOperationException("write failed");
            Value = value; Writes++;
            if (WriteThenFailRead) { WriteThenFailRead = false; FailNextRead = true; }
            if (MismatchAfterWrite) { MismatchAfterWrite = false; MismatchNextRead = true; }
        }
    }
    sealed class OutcomeFixture : IDisposable
    {
        public readonly LastStandLoopController Loop;
        public readonly TankPresentation Art;
        public readonly LastStandLoopHud Hud;
        public readonly Canvas Canvas;
        public readonly Camera Camera;
        public readonly RectTransform Root;
        public readonly OutcomeStorage Storage;
        readonly RenderTexture texture;
        public OutcomeFixture(Vector2Int profile, OutcomeStorage storage = null)
        {
            Storage = storage ?? new OutcomeStorage { Value = Save(0,0,1) };
            int calls = 0;
            LastStandLoopController.StorageFactory = () => { calls++; return Storage; };
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
            Art = UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Invoke(Art,"Start"); Invoke(Art.GetComponent<ArtHud>(),"Start");
            Loop = Art.GetComponent<LastStandLoopController>();
            Require(calls == 1,"outcome memory storage before actual Initialize; no player save access");
            Hud = (LastStandLoopHud)typeof(LastStandLoopController).GetField("hud",Private).GetValue(Loop);
            Canvas = UnityEngine.Object.FindFirstObjectByType<Canvas>(); Camera = UnityEngine.Object.FindFirstObjectByType<Camera>();
            texture = new RenderTexture(profile.x,profile.y,16); Camera.targetTexture = texture;
            Canvas.renderMode = RenderMode.ScreenSpaceCamera; Canvas.worldCamera = Camera; Canvas.planeDistance = 1;
            Canvas.GetComponent<CanvasScaler>().enabled = false;
            Canvas.scaleFactor = Mathf.Sqrt((profile.x/1280f)*(profile.y/720f));
            Root = (RectTransform)Canvas.transform.Find("LastStandLoopHud");
            typeof(EncounterSession).GetField("focused",Private).SetValue(Loop.Session,true);
            Refresh(); Require(Math.Abs(Canvas.pixelRect.width-profile.x)<.1f && Math.Abs(Canvas.pixelRect.height-profile.y)<.1f,"actual outcome Canvas size");
        }
        public Button Button(string id) { return FindButton(Root,id); }
        public Text Text(string id) { return Root.Find("LastStandCard/"+id).GetComponent<Text>(); }
        public void Refresh() { RefreshCameraCanvas(Canvas,Hud.Refresh); }
        public Rect Bounds(RectTransform rect)
        {
            var corners = new Vector3[4]; rect.GetWorldCorners(corners);
            var lo=Camera.WorldToScreenPoint(corners[0]); var hi=Camera.WorldToScreenPoint(corners[2]);
            return new Rect(lo.x,Canvas.pixelRect.height-hi.y,hi.x-lo.x,hi.y-lo.y);
        }
        public void Deploy()
        {
            Click(Button(Loop.Phase=="workshop" ? "Redeploy" : "Deploy"));
            Require(Loop.Phase=="battle" && Loop.Session.Model!=null,"actual outcome deploy");
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            Canvas.renderMode=RenderMode.ScreenSpaceCamera; Canvas.worldCamera=Camera; Refresh();
        }
        public void Defeat()
        {
            var clock=(LastStandRunClock)typeof(EncounterSession).GetField("runClock",Private).GetValue(Loop.Session);
            while(Loop.Session.Model.Status==EncounterStatus.Running) Loop.Session.AdvanceAt(clock.LastTimestamp+LastStandRunClock.StepSeconds);
            Refresh();
        }
        public void FinishSettling()
        {
            var clock=(LastStandRunClock)typeof(EncounterSession).GetField("runClock",Private).GetValue(Loop.Session);
            Loop.Session.AdvanceAt(clock.LastTimestamp+.5); Invoke(Loop,"Update");
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            Canvas.renderMode=RenderMode.ScreenSpaceCamera; Canvas.worldCamera=Camera; Refresh();
            Require(Loop.Phase=="result" && Loop.Session.Model==null,"actual interval finishes into pending result");
        }
        public void Dispose()
        { Camera.targetTexture=null; UnityEngine.Object.DestroyImmediate(texture); EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
    }
    static readonly Vector2Int[] OutcomeProfiles = { new Vector2Int(1366,768),new Vector2Int(1920,1080),
        new Vector2Int(390,844),new Vector2Int(844,390),new Vector2Int(720,640),
        new Vector2Int(1366,664),new Vector2Int(1920,976),new Vector2Int(390,688),new Vector2Int(844,266),new Vector2Int(720,516) };
    public static void RunOutcomes()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory=LastStandLoopController.StorageFactory; int failures=0;
        try
        {
            Case("test_settling_pending_and_claim_states",OutcomeClaim,ref failures);
            Case("test_workshop_purchase_cap_and_redeploy_gates",OutcomeWorkshop,ref failures);
            Case("test_storage_errors_retry_and_profile_readability",OutcomeRecovery,ref failures);
        }
        finally { LastStandLoopController.StorageFactory=factory; EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
        if(failures!=0)throw new InvalidOperationException("Actual outcome HUD assertion failures: "+failures);
    }
    static void OutcomeInventory(OutcomeFixture f)
    {
        string phase=f.Loop.Phase; bool ready=f.Loop.Progression.SaveState=="ready";
        string[] ids=CoreControlIds;bool cards=ExpectedGarageCards(f.Loop);
        Require(f.Loop.GarageCardsVisible==cards,"outcome hierarchy follows actual save/run boundaries");
        AssertOrdinaryInventory(f.Root,"outcome " + phase);
        foreach(string id in ids)
        {
            bool active=id=="Menu" || id=="RetrySave"&&!ready ||
                id=="Claim"&&phase=="result" || id=="Purchase"&&phase=="workshop"&&!cards || id=="Redeploy"&&phase=="workshop" ||
                id=="Deploy"&&phase=="garage" || IsInlineArrow(id)&&cards ||
                (id=="SpeedMinus"||id=="SpeedRate"||id=="SpeedPlus")&&(phase=="battle"||phase=="settling");
            var b=f.Button(id); Require(b.gameObject.activeInHierarchy==active,"outcome exact active inventory "+id+" "+phase);
            if(!active)continue;
            Require(b.enabled,"outcome Button enabled "+id); RequireVisible(b.GetComponent<Image>(),"outcome visible action "+id);
            var text=b.transform.Find(id+"Text").GetComponent<Text>();RequireVisible(text,"outcome visible action label "+id);
            Require(!string.IsNullOrEmpty(text.text),"outcome label nonempty "+id);
            var outline=b.GetComponent<Outline>(); Require(outline,"outcome shared stroke "+id);
            var basic=new BaseEventData(EventSystem.current);var pointer=new PointerEventData(EventSystem.current){button=PointerEventData.InputButton.Left};
            ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerUpHandler);ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerExitHandler);ExecuteEvents.Execute(b.gameObject,basic,ExecuteEvents.deselectHandler);
            bool available=b.IsInteractable();Require(!outline.enabled&&text.fontStyle==(available?FontStyle.Normal:FontStyle.Italic),"outcome neutral/disabled type "+id);
            ExecuteEvents.Execute(b.gameObject,basic,ExecuteEvents.selectHandler);Require(outline.enabled==available&&text.fontStyle==(available?FontStyle.Bold:FontStyle.Italic),"outcome isolated selected "+id);
            ExecuteEvents.Execute(b.gameObject,basic,ExecuteEvents.deselectHandler);ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerEnterHandler);
            Require(outline.enabled==available&&text.fontStyle==(available?FontStyle.Bold:FontStyle.Italic),"outcome isolated hover "+id);
            ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerExitHandler);ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerDownHandler);
            Require(outline.enabled==available&&text.fontStyle==(available?FontStyle.BoldAndItalic:FontStyle.Italic),"outcome isolated press "+id);
            ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerUpHandler);Require(!outline.enabled&&text.fontStyle==(available?FontStyle.Normal:FontStyle.Italic),"outcome release "+id);
        }
    }
    static void OutcomeGeometry(OutcomeFixture f,string label)
    {
        f.Refresh();OutcomeInventory(f);
        var viewport=new Rect(0,0,f.Canvas.pixelRect.width,f.Canvas.pixelRect.height);
        var card=f.Bounds((RectTransform)f.Root.Find("LastStandCard"));var dock=f.Bounds((RectTransform)f.Root.Find("LastStandDock"));
        Require(Contained(card,viewport)&&Contained(dock,viewport),"outcome containing panels onscreen "+label);
        Require(!Overlap(card,dock),"outcome card/dock nonoverlap "+label);
        if(f.Loop.GarageCardsVisible)AssertGarageHierarchy(f.Loop,f.Root,f.Bounds,viewport);
        foreach(var image in f.Root.GetComponentsInChildren<Image>())Require(Contained(f.Bounds(image.rectTransform),viewport),"outcome image onscreen "+image.name+" "+label);
        var controls=new List<Rect>();
        foreach(var button in f.Root.GetComponentsInChildren<Button>())
        {
            var bounds=f.Bounds((RectTransform)button.transform);
            Require(bounds.width>=43.9f&&bounds.height>=43.9f,"outcome actual44px target "+button.name);
            Require(Contained(bounds,viewport)&&Contained(bounds,f.Bounds((RectTransform)button.transform.parent)),
                "outcome target stays inside its actual approved owner "+button.name+" target="+bounds+" parent="+button.transform.parent.name);
            Require(!Overlap(bounds,card),"outcome control does not cover the actual title/recovery panel "+button.name+
                " target="+bounds+" panel="+card);
            foreach(var prior in controls)Require(!Overlap(bounds,prior),"outcome control nonoverlap");controls.Add(bounds);
        }
        var texts=new List<Rect>();
        foreach(var text in f.Root.GetComponentsInChildren<Text>())
        {
            RequireVisible(text,"outcome required readable "+text.name);
            var bounds=f.Bounds(text.rectTransform);
            Require(text.fontSize*bounds.height/text.rectTransform.rect.height>=13.99f,"outcome14px text "+text.name);
            Require(Contained(bounds,viewport)&&Contained(bounds,f.Bounds((RectTransform)text.transform.parent)),"outcome text containment "+text.name);
            Require(text.preferredHeight<=text.rectTransform.rect.height+.2f,"outcome text not truncated "+text.name+" "+label+" preferred="+text.preferredHeight+" rect="+text.rectTransform.rect.height);
            foreach(var prior in texts)Require(!Overlap(bounds,prior),"outcome text nonoverlap "+text.name);texts.Add(bounds);
        }
        Debug.Log("ST_LS_HUD_OUTCOME_PROFILE "+viewport.width+"x"+viewport.height+" phase="+f.Loop.Phase+" state="+label);
    }
    static void OutcomeResultFields(OutcomeFixture f)
    {
        var p=f.Loop.Progression.PendingDefeat;Require(p!=null,"actual persisted pending owns result fields");
        RequireVisible(f.Text("PhaseDetail"),"outcome visible pending fields");string t=f.Text("PhaseDetail").text;
        Require(t.Split('\n')[0]==(p.Tier == 0 ? "Legacy run" : "Tier " + p.Tier)+" / "+(p.ElapsedTicks/(float)EncounterModel.TicksPerSecond).ToString("F1")+"s / "+p.Kills+" disabled","outcome own exact tier/duration/kills");
        Require(t.Split('\n')[1]=="Earned salvage  "+p.Reward,"outcome separate own earned salvage field");
        Require(t.Split('\n')[2]=="Wallet  "+f.Loop.Progression.Wallet+" salvage","outcome separate committed wallet field");
        bool claim=f.Loop.Progression.SaveState=="ready"&&f.Loop.Progression.ActiveRunId==0&&(p.Reward == 0 || f.Loop.Progression.Wallet!=int.MaxValue);
        Require(f.Button("Claim").IsInteractable()==claim,"outcome Claim agrees with complete owner guard");
    }
    static void OutcomeClaim()
    {
        using(var f=new OutcomeFixture(OutcomeProfiles[0],new OutcomeStorage{Value=Save(0,int.MaxValue,1)}))
        {
            f.Deploy();f.Defeat();f.FinishSettling();
            Require(!f.Button("Claim").IsInteractable(),"saturated wallet disables refused Claim");
        }
        foreach(var profile in OutcomeProfiles)
        {
            string pending,claimed;
            using(var f=new OutcomeFixture(profile))
            {
                f.Deploy();f.Defeat();Require(f.Loop.Phase=="settling"&&f.Loop.Progression.PendingDefeat!=null,"actual persisted terminal settling");
                Require(!f.Button("Claim").gameObject.activeInHierarchy,"no premature visible Claim");
                string save=f.Storage.Value;f.Loop.Claim();Require(f.Storage.Value==save&&f.Loop.Progression.Wallet==0,"settling cannot award");
                OutcomeGeometry(f,"settling");f.FinishSettling();OutcomeResultFields(f);OutcomeGeometry(f,"pending");pending=f.Storage.Value;
                Click(f.Button("Claim"));Require(f.Loop.Phase=="workshop"&&f.Loop.Progression.Wallet==1&&f.Loop.Progression.PendingDefeat==null&&f.Loop.Progression.FinalizedRunId==1,"real manual Claim exactly once");
                claimed=f.Storage.Value;int writes=f.Storage.Writes;f.Loop.Claim();f.Hud.Refresh();
                Require(f.Storage.Value==claimed&&f.Storage.Writes==writes&&f.Loop.Progression.Wallet==1&&!f.Button("Claim").gameObject.activeInHierarchy,"duplicate Claim/Refresh cannot award");
            }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=pending}))
            { Require(f.Loop.Phase=="result"&&f.Loop.Progression.Wallet==0,"actual pending reload");OutcomeResultFields(f);OutcomeGeometry(f,"pending-reload"); }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=claimed}))
            { Require(f.Loop.Phase=="workshop"&&f.Loop.Progression.Wallet==1&&!f.Button("Claim").gameObject.activeInHierarchy,"actual claimed reload");OutcomeGeometry(f,"claimed-reload"); }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=pending.Replace("\"credits\":0","\"credits\":"+int.MaxValue)}))
            {
                OutcomeResultFields(f);Require(!f.Button("Claim").IsInteractable(),"saturated wallet disables refused Claim");
                string save=f.Storage.Value;Click(f.Button("Claim"));Require(f.Storage.Value==save&&f.Loop.Progression.Wallet==int.MaxValue,"disabled saturated Claim pointer preserves record");OutcomeGeometry(f,"saturated-claim");
            }
        }
    }
    static void OutcomeWorkshopFields(OutcomeFixture f)
    {
        var p=f.Loop.Progression;string t=f.Text("PhaseDetail").text;
        if(f.Loop.GarageCardsVisible)AssertInlineGarageFields(f.Loop,f.Root);
        else RequireVisible(f.Text("PhaseDetail"),"outcome visible recovery workshop fields");
        Require(t.Split('\n')[0] == "Tier " + p.SelectedTier + " / Goal " + (p.SelectedTier == 1 ? 60 : 90) + "s", "workshop selected tier/goal");
        Require(t.Split('\n')[1].StartsWith("Best"), "workshop persistent best reading line");
        Require(t.Split('\n')[2] == "Cannon Attack " + p.CannonAttackLevel + "/3 / Damage " + p.CannonDamage, "workshop cannon state");
        Require(t.Split('\n')[3] == "Salvage " + p.Wallet + " / Cost " + (p.NextCost == 0 ? "MAX" : p.NextCost.ToString()), "workshop saved wallet and next cost");
        Require(t.Split('\n')[4] == "Fitting: " + (f.Art.showingLauncher ? "Auxiliary launcher" : "Field repair"), "workshop selected fitting");
        bool available=p.SaveState=="ready"&&p.ActiveRunId==0&&p.PendingDefeat==null&&p.NextCost!=0&&p.Wallet>=p.NextCost;
        if(f.Loop.GarageCardsVisible)
        {
            Require(!f.Button("Purchase").IsActive(),"ready workshop exposes Upgrades instead of duplicate cannon purchase");
            Click(f.Button("ShopEntry"));f.Refresh();var buy=f.Button("ShopCard_cannonAttackBuy");
            var card=LastStandShopPresentation.ProjectPermanent(p,f.Art.showingLauncher?LastStandFitting.Launcher:LastStandFitting.Repair).Cards[(int)LastStandUpgradeTrackId.CannonAttack];
            Require(buy.IsActive()&&buy.IsInteractable()==available,"actual permanent cannon card retains purchase owner guards");
            RequireVisible(FindText(f.Root,"ShopCard_cannonAttackLevels"),"actual visible permanent cannon level");
            Require(FindText(f.Root,"ShopCard_cannonAttackLevels").text=="Level "+p.CannonAttackLevel+" / "+card.Cap &&
                FindText(f.Root,"ShopCard_cannonAttackPrice").text==card.PriceDescription,"actual upgrade card reports committed level and price/MAX");
            Click(f.Button("ShopClose"));f.Refresh();
        }
        else
        {
            Require(f.Button("Purchase").IsInteractable()==available,"outcome complete recovery purchase owner guards");
            Require(f.Button("Purchase").GetComponentInChildren<Text>(true).text==(p.NextCost==0?"CANNON ATTACK MAX":available?"BUY CANNON ATTACK":"PURCHASE UNAVAILABLE"),"outcome no purchase offer at MAX/unavailable");
        }
        bool deploy=p.SaveState=="ready"&&f.Loop.Session.CanRun&&p.ActiveRunId==0&&p.PendingDefeat==null&&p.NextRunId!=int.MaxValue;
        Require(f.Button("Redeploy").IsInteractable()==deploy,"outcome complete Redeploy gates");
    }
    static void PurchaseCannon(OutcomeFixture f)
    {
        if(!f.Loop.GarageCardsVisible){Click(f.Button("Purchase"));return;}
        var entry=f.Button("ShopEntry");Require(entry.IsActive()&&entry.IsInteractable(),"actual Upgrades entry available");
        Click(entry);f.Refresh();Click(f.Button("ShopCard_cannonAttackBuy"));f.Refresh();
        if(f.Button("ShopClose").IsActive()){Click(f.Button("ShopClose"));f.Refresh();}
    }
    static void OutcomeWorkshop()
    {
        using(var f=new OutcomeFixture(OutcomeProfiles[0],new OutcomeStorage{Value=Save(3,6,1)}))
            Require(f.Button("Purchase").GetComponentInChildren<Text>(true).text=="CANNON ATTACK MAX","capped workshop has MAX rather than a purchase offer");
        foreach(var profile in OutcomeProfiles)
        {
            string upgraded;
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=Save(0,6,1)}))
            {
                for(int level=0;level<=3;level++)
                {
                    OutcomeWorkshopFields(f);OutcomeGeometry(f,"workshop-level"+level);
                    SelectFitting(f.Loop,f.Art,f.Root,!f.Art.showingLauncher,f.Refresh);OutcomeWorkshopFields(f);
                    if(level<3) { PurchaseCannon(f);Require(f.Loop.Progression.CannonAttackLevel==level+1&&f.Loop.Progression.CannonDamage==30+10*level,"confirmed real purchase damage"); }
                }
                Require(f.Loop.Progression.Wallet==0,"actual1/2/3costs consumed six");string save=f.Storage.Value;PurchaseCannon(f);Require(f.Storage.Value==save,"capped pointer cannot purchase");
            }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=Save(0,1,1)}))
            {
                OutcomeWorkshopFields(f);PurchaseCannon(f);Require(f.Loop.Progression.CannonDamage==30&&f.Loop.Progression.Wallet==0&&f.Loop.Progression.NextCost==2,"first actual20to30at1 and next2");
                upgraded=f.Storage.Value;OutcomeWorkshopFields(f);string save=f.Storage.Value;PurchaseCannon(f);Require(f.Storage.Value==save,"insufficient pointer cannot purchase");
                typeof(EncounterSession).GetField("focused",Private).SetValue(f.Loop.Session,false);f.Refresh();OutcomeWorkshopFields(f);
                Click(f.Button("Redeploy"));Require(f.Loop.Session.Model==null&&f.Storage.Value==save,"unfocused Redeploy refused");
                typeof(EncounterSession).GetField("focused",Private).SetValue(f.Loop.Session,true);f.Refresh();f.Deploy();Require(f.Loop.Session.Model.CommittedCannonDamage==30,"real stronger Redeploy commits30");
            }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=upgraded}))
            { Require(f.Loop.Progression.CannonDamage==30,"actual upgraded reload");typeof(LastStandLoopController).GetField("<Phase>k__BackingField",Private).SetValue(f.Loop,"workshop");f.Refresh();OutcomeWorkshopFields(f);OutcomeGeometry(f,"upgraded-reload"); }
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=Save(1,1,int.MaxValue)}))
            { OutcomeWorkshopFields(f);string save=f.Storage.Value;Click(f.Button("Redeploy"));Require(f.Storage.Value==save&&f.Loop.Session.Model==null,"exhausted Redeploy denied");OutcomeGeometry(f,"insufficient-exhausted"); }
            foreach(string guard in new[]{"reservation","pending"})
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=Save(0,2,1)}))
            {
                Require(f.Loop.Progression.TryDeploy(),"actual reserved owner fixture");if(guard=="pending")Require(f.Loop.Progression.TryStageDefeat(17,3),"actual pending owner fixture");f.Refresh();OutcomeWorkshopFields(f);
                string save=f.Storage.Value;Click(f.Button("Purchase"));Click(f.Button("Redeploy"));Require(f.Storage.Value==save&&f.Loop.Session.Model==null,"guarded workshop pointers preserve owner "+guard);OutcomeGeometry(f,guard);
            }
        }
    }
    static void OutcomeSaveTruth(OutcomeFixture f)
    {
        if(f.Loop.GarageCardsVisible){AssertInlineGarageFields(f.Loop,f.Root);return;}
        var p=f.Loop.Progression;var status=f.Text("SaveStatus");RequireVisible(status,"outcome visible real save status");
        if(p.SaveState=="ready")Require(status.text.Split('\n')[0]=="LOCAL SAVE READY","outcome confirmed ready badge");
        else
        {
            Require(status.text==p.SaveError&&!string.IsNullOrEmpty(status.text)&&!status.text.Contains("LOCAL SAVE READY"),"outcome exact specific unconfirmed status");
            Require(f.Button("RetrySave").gameObject.activeInHierarchy&&f.Button("RetrySave").IsInteractable(),"outcome actual Retry available");
            Require(!f.Button("Claim").IsInteractable()&&!f.Button("Purchase").IsInteractable()&&!f.Button("Redeploy").IsInteractable()&&!f.Button("Deploy").IsInteractable(),"outcome unready domain actions disabled");
            Require(!status.text.Contains("claimed")&&!status.text.Contains("upgraded and saved"),"outcome no false successful award/purchase");
        }
    }
    static void OutcomeRecovery()
    {
        using(var f=new OutcomeFixture(new Vector2Int(844,266)))
        {
            typeof(LastStandLoopController).GetField("<Notice>k__BackingField",Private).SetValue(f.Loop,"Local save confirmed. Unfinished runs earn no reward. This page must remain loaded for active time to continue. Claim salvage manually after defeat.");
            OutcomeGeometry(f,"derived-short-Canvas-long-notice");
        }
        foreach(var profile in OutcomeProfiles)
        {
            using(var f=new OutcomeFixture(profile))
            {
                typeof(LastStandLoopController).GetField("<Notice>k__BackingField",Private).SetValue(f.Loop,"Local save confirmed. Unfinished runs earn no reward. This page must remain loaded for active time to continue. Claim salvage manually after defeat.");
                OutcomeGeometry(f,"long-ready-garage-notice");
            }
            foreach(string problem in new[]{"read","corrupt","initial-write","unsupported"})
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=problem=="initial-write"?null:problem=="corrupt"?"broken":problem=="unsupported"?Save(0,0,1).Replace("\"version\":1","\"version\":2"):Save(0,0,1),DenyRead=problem=="read",DenyWrite=problem=="initial-write"}))
            {
                OutcomeSaveTruth(f);OutcomeGeometry(f,problem);string save=f.Storage.Value;Click(f.Button("Deploy"));Require(f.Storage.Value==save&&f.Loop.Session.Model==null,"blocked load cannot deploy");
                f.Storage.DenyRead=f.Storage.DenyWrite=false;if(problem=="corrupt"||problem=="unsupported")f.Storage.Value=Save(0,0,1);
                Click(f.Button("RetrySave"));Require(f.Loop.Progression.SaveState=="ready"&&f.Loop.Phase=="garage","real load Retry recovers garage");OutcomeSaveTruth(f);OutcomeGeometry(f,problem+"-recovered");
            }
            foreach(string action in new[]{"reserve","stage","claim","purchase"})
            foreach(string failure in new[]{"denied-write","write-readback","mismatch-readback","conflict"})
            using(var f=new OutcomeFixture(profile,new OutcomeStorage{Value=Save(0,action=="purchase"?1:0,1)}))
            {
                if(action=="stage"||action=="claim") { f.Deploy();if(action=="claim"){f.Defeat();f.FinishSettling();} }
                int wallet=f.Loop.Progression.Wallet,level=f.Loop.Progression.CannonAttackLevel,writes=f.Storage.Writes;string prior=f.Storage.Value;
                f.Storage.DenyWrite=failure=="denied-write";f.Storage.WriteThenFailRead=failure=="write-readback";f.Storage.MismatchAfterWrite=failure=="mismatch-readback";
                if(failure=="conflict")f.Storage.Value=Save(2,9,22);
                if(action=="reserve")Click(f.Button("Deploy"));else if(action=="stage")f.Defeat();else if(action=="claim")Click(f.Button("Claim"));else PurchaseCannon(f);
                f.Refresh();Require(f.Loop.Progression.SaveState!="ready"&&f.Loop.Progression.Wallet==wallet&&f.Loop.Progression.CannonAttackLevel==level,"unconfirmed transaction leaves committed values "+action+" "+failure);
                if(action=="stage")Require(f.Loop.Phase=="save-error"&&f.Loop.Progression.PendingDefeat==null&&!f.Text("PhaseDetail").text.Contains("Earned"),"unconfirmed defeat is no earned award");
                if(action=="claim")OutcomeResultFields(f);if(action=="purchase")OutcomeWorkshopFields(f);
                OutcomeSaveTruth(f);OutcomeGeometry(f,action+"-"+failure);
                f.Storage.DenyWrite=false;if(failure=="conflict")f.Storage.Value=prior;int before=f.Storage.Writes;
                Click(f.Button("RetrySave"));Require(f.Loop.Progression.SaveState=="ready","real transaction Retry confirms "+action);
                if(failure=="write-readback"||failure=="mismatch-readback")Require(f.Storage.Writes==before,"immutable candidate recognized without duplicate write");
                if(action=="reserve")Require(f.Loop.Phase=="battle"&&f.Loop.Session.Model!=null,"reservation Retry starts actual reserved run");
                if(action=="stage"){Require(f.Loop.Phase=="result"&&f.Loop.Progression.PendingDefeat!=null&&f.Loop.Progression.Wallet==0,"stage Retry recovers pending, no award");OutcomeResultFields(f);}
                if(action=="claim")Require(f.Loop.Phase=="workshop"&&f.Loop.Progression.Wallet==wallet+1&&f.Loop.Progression.PendingDefeat==null,"claim Retry awards exactly once");
                if(action=="purchase"){Require(f.Loop.Phase=="workshop"&&f.Loop.Progression.CannonAttackLevel==1&&f.Loop.Progression.CannonDamage==30&&f.Loop.Progression.Wallet==0,"purchase Retry shows only confirmed30");OutcomeWorkshopFields(f);}
                Canvas.ForceUpdateCanvases();f.Canvas.renderMode=RenderMode.ScreenSpaceOverlay;f.Canvas.renderMode=RenderMode.ScreenSpaceCamera;f.Canvas.worldCamera=f.Camera;f.Refresh();
                OutcomeSaveTruthForPhase(f);OutcomeGeometry(f,action+"-"+failure+"-recovered");
            }
        }
    }
    static void OutcomeSaveTruthForPhase(OutcomeFixture f)
    { if(f.Loop.Phase!="battle"&&f.Loop.Phase!="settling")OutcomeSaveTruth(f); }

    // T-08 adds input assertions to the same imported scene and owner fixtures.
    // Earlier assertions, fixtures, selectors and geometry remain unchanged.
    static readonly string[] InputIds = { "ToggleFitting", "Deploy", "Claim", "Purchase", "Redeploy", "RetrySave", "Pause", "ToggleMute", "ToggleTier", "Effects", "SpeedMinus", "SpeedRate", "SpeedPlus",
        "TierPrevious","TierNext","FittingPrevious","FittingNext" };
    static readonly string[] CoreControlIds = { "ToggleFitting", "Deploy", "Claim", "Purchase", "Redeploy", "RetrySave", "Pause", "ToggleMute", "ToggleTier", "Effects",
        "Menu", "SpeedMinus", "SpeedRate", "SpeedPlus", "TierPrevious","TierNext","FittingPrevious","FittingNext","ResearchEntry","WaveInfo" };
    static Button FindOrdinaryButton(RectTransform root, string id)
    {
        Button found = null; int count = 0;
        foreach (var button in root.GetComponentsInChildren<Button>(true)) if (button.name == id) { found = button; count++; }
        Require(count == 1,"exact one ordinary Button " + id); return found;
    }
    internal static void AssertOrdinaryInventory(RectTransform root, string state)
    {
        // This assertion runs against the current imported UI. Its complete
        // inventory comes from the independently authored versioned contract;
        // retained contracts remain unchanged.
        var inventories=LastStandObservationContractChecks.CurrentControlInventory();
        Require(new HashSet<string>(inventories["controls"]).SetEquals(CoreControlIds),"exact stable core control set "+state);
        var expected=new Dictionary<string,string>(StringComparer.Ordinal);
        foreach(var inventory in inventories)
            foreach(var name in inventory.Value)
            {Require(!expected.ContainsKey(name),"one declared current control owner "+name);expected.Add(name,inventory.Key);}
        int expectedCount=expected.Count;
        foreach (string id in CoreControlIds)
            Require(root.Find(CorePath(id)).GetComponent<Button>() == FindOrdinaryButton(root,id),
                "exact approved core control path " + id + " " + state);
        var all = root.GetComponentsInChildren<Button>(true); Require(all.Length==expectedCount,"exact catalog-derived ordinary Button count "+state);
        foreach (var button in all)
        {
            Require(expected.TryGetValue(button.name,out var owner),"unique complete ordinary Button union "+button.name+" "+state);
            string prefix=owner=="researchControls"?"Research":owner=="historyControls"?"RunHistory":owner=="plannerControls"?"Planner":owner=="settingsControls"?"Settings":null;
            if(prefix!=null)Require(button.transform.IsChildOf(root.Find(prefix+"Modal/"+prefix+"Panel")),"control belongs to its declared modal "+button.name);
            expected.Remove(button.name);
        }
        Require(expected.Count==0,"complete ordinary control registry "+state);
    }
    static readonly string[] InputStates = { "garage", "battle", "paused", "settling", "result", "workshop", "capped", "blocked", "save-error" };
    public static void RunInput()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory; int failures = 0;
        try
        {
            Case("test_visible_enabled_navigation_order", InputNavigation, ref failures);
            Case("test_keyboard_activation_and_focus_style", InputActivation, ref failures);
            Case("test_pointer_targets_match_visual_bounds", InputBounds, ref failures);
            Case("test_effects_control_preserves_run_and_setting_state", EffectsControl, ref failures);
        }
        finally { LastStandLoopController.StorageFactory = factory; EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
        if (failures != 0) throw new InvalidOperationException("Actual input HUD assertion failures: " + failures);
    }
    public static void RunEffects()
    {
        using var preferencesScope = new LastStandTestPreferencesScope();
        var factory = LastStandLoopController.StorageFactory; int failures = 0;
        try { Case("test_effects_control_preserves_run_and_setting_state", EffectsControl, ref failures); }
        finally { LastStandLoopController.StorageFactory = factory; EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single); }
        if (failures != 0) throw new InvalidOperationException("Actual effects HUD assertion failures: " + failures);
    }
    static void EffectsControl()
    {
        foreach (var profile in OutcomeProfiles) foreach (string state in new[] { "battle", "paused", "settling" })
        using (var f = InputFixture(profile,state))
        {
            var model = f.Loop.Session.Model; string snapshot = model.Snapshot(), save = f.Storage.Value, phase = f.Loop.Phase;
            bool muted = f.Loop.Muted, paused = f.Loop.Session.ManualPaused;
            ReanchorInput(f);OpenSettings(f.Loop,f.Root,1,f.Refresh);
            var button = FindOrdinaryButton(f.Root,"DisplayEffects");
            Require(button.IsActive() && button.IsInteractable(),"Display effects setting available in " + state);
            var label = button.GetComponentInChildren<Text>();
            int clicks = 0; button.onClick.AddListener(() => clicks++);
            foreach (bool submit in new[] { false, true })
            {
                bool previous = f.Loop.Session.View.FullEffects;
                Require(label.text == (previous ? "EFFECTS: FULL" : "EFFECTS: REDUCED"),"effects label reads actual View state");
                KeyboardCommand(f,"enter-first");int remaining=VisibleEnabledInput(f).Count;
                while(EventSystem.current.currentSelectedGameObject!=button.gameObject&&remaining-->0)KeyboardCommand(f,"next");
                SelectedInput(button,"Display effects reached and revealed by ordinary Tab navigation");
                f.Camera.Render();Canvas.ForceUpdateCanvases();
                var bounds = f.Bounds((RectTransform)button.transform);
                Require(bounds.width >= 43.99f && bounds.height >= 43.99f,"effects actual 44px target");
                Require(Contained(bounds,f.Bounds((RectTransform)f.Root.Find("SettingsModal/SettingsPanel/SettingsViewport"))),
                    "Display effects target is fully revealed inside the actual settings mask");
                Require(label.preferredHeight <= label.rectTransform.rect.height + .2f,"effects label fits " + profile);
                if (submit)SubmitInput(button);
                else
                {
                    Require(InputRaycast(f,new Vector2(bounds.center.x,f.Canvas.pixelRect.height-bounds.center.y),-1)==button,
                        "Display effect pointer uses the visible settings mask and actual raycast owner");
                    Click(button);
                }
                Require(clicks == (submit ? 2 : 1) && f.Loop.Session.View.FullEffects != previous,"one effects activation uses actual View owner");
                Require(label.text == (f.Loop.Session.View.FullEffects ? "EFFECTS: FULL" : "EFFECTS: REDUCED"),"effects label immediately synchronizes");
                Require(f.Loop.Session.Model == model && model.Snapshot() == snapshot && f.Storage.Value == save && f.Loop.Phase == phase &&
                    f.Loop.Muted == muted && f.Loop.Session.ManualPaused == paused && f.Loop.Session.MenuPaused && f.Loop.Session.Paused,
                    "Display effects preserves model save phase audio and both pause owners");
            }
            f.Loop.SetPreferences(f.Loop.Preferences.Current.With(reducedEffects:!f.Loop.Preferences.Current.ReducedEffects));
            Require(label.text == (f.Loop.Session.View.FullEffects ? "EFFECTS: FULL" : "EFFECTS: REDUCED"),"external preference change refreshes actual Display label");
            Click(f.Button("SettingsClose"));
            Require(!f.Loop.MenuOpen&&!f.Loop.Session.MenuPaused&&f.Loop.Session.ManualPaused==paused&&f.Loop.Session.Paused==paused&&
                model.Snapshot()==snapshot&&f.Storage.Value==save,"Display close releases only menu pause and preserves run/save");
        }
        foreach (string state in new[] { "garage", "battle", "paused", "settling", "result", "workshop", "blocked", "catch-up", "failure" })
        using (var f = InputFixture(OutcomeProfiles[0],state == "catch-up" || state == "failure" ? "battle" : state))
        {
            if (state == "catch-up")
            {
                var clock = (LastStandRunClock)typeof(EncounterSession).GetField("runClock",Private).GetValue(f.Loop.Session);
                f.Loop.Session.AdvanceAt(clock.LastTimestamp + 10);
                Require(f.Loop.Session.CatchingUp,"actual catch-up disables effects setting");
            }
            if (state == "failure") typeof(EncounterSession).GetMethod("Fail",Private).Invoke(f.Loop.Session,new object[] { "EffectsCheck" });
            f.Refresh();
            bool effects = f.Loop.Session.View.FullEffects, muted = f.Loop.Muted;
            bool manualPaused=f.Loop.Session.ManualPaused;double speed=f.Loop.Session.SelectedSpeed;
            string save = f.Storage.Value, phase = f.Loop.Phase, snapshot = f.Loop.Session.Model?.Snapshot();
            foreach(string id in new[]{"Pause","ToggleMute","Effects"})
            {
            var button=FindOrdinaryButton(f.Root,id);Require(!button.IsActive(),"legacy battlefield control hidden in "+state+" "+id);
            int calls = 0; button.onClick.AddListener(() => calls++); Click(button); SubmitInput(button);
            Require(calls == 0 && f.Loop.Session.View.FullEffects == effects && f.Loop.Muted == muted && f.Storage.Value == save &&
                f.Loop.Phase == phase && f.Loop.Session.Model?.Snapshot() == snapshot && f.Loop.Session.ManualPaused==manualPaused&&
                f.Loop.Session.SelectedSpeed==speed,"hidden legacy pointer/Submit cannot change any owner " + state+" "+id);
            }
        }
    }
    static OutcomeFixture InputFixture(Vector2Int profile, string state)
    {
        var storage = new OutcomeStorage { Value = Save(state == "capped" ? 3 : 0, state == "workshop" || state == "capped" ? 6 : 0,1), DenyRead = state == "blocked" };
        var f = new OutcomeFixture(profile,storage);
        // Edit-mode batch import does not tick EventSystem.OnEnable. Select
        // the scene's existing actual EventSystem explicitly; create no owner.
        foreach (var events in Resources.FindObjectsOfTypeAll<EventSystem>())
            if (events.gameObject.scene == f.Art.gameObject.scene) { Invoke(events,"OnEnable"); EventSystem.current = events; break; }
        Require(EventSystem.current != null,"actual scene EventSystem available");
        Invoke(f.Canvas.GetComponent<GraphicRaycaster>(),"OnEnable");
        if (state == "battle" || state == "paused" || state == "settling" || state == "result" || state == "save-error") f.Deploy();
        if (state == "paused") { ReanchorInput(f); Click(f.Button("SpeedRate"));Require(f.Loop.Session.ManualPaused,"actual rate button establishes manual pause"); }
        if (state == "settling" || state == "result") { InputDefeat(f); if (state == "result") f.FinishSettling(); }
        if (state == "save-error") { storage.DenyWrite = true; InputDefeat(f); }
        f.Refresh(); EventSystem.current.SetSelectedGameObject(null); return f;
    }
    static void ReanchorInput(OutcomeFixture f)
    {
        var clock = (LastStandRunClock)typeof(EncounterSession).GetField("runClock",Private).GetValue(f.Loop.Session);
        typeof(LastStandRunClock).GetField("anchor",Private).SetValue(clock,Time.realtimeSinceStartupAsDouble);
    }
    static void InputDefeat(OutcomeFixture f)
    {
        // Real deterministic owner/model, bounded batches, no per-step log
        // amplification or changed outcome/award fixture.
        var clock = (LastStandRunClock)typeof(EncounterSession).GetField("runClock",Private).GetValue(f.Loop.Session);
        while (f.Loop.Session.Model.Status == EncounterStatus.Running)
            f.Loop.Session.AdvanceAt(clock.LastTimestamp + 128 * LastStandRunClock.StepSeconds);
        f.Refresh();
    }
    static List<Button> VisibleEnabledInput(OutcomeFixture f)
    {
        var result = new List<Button>();
        foreach (var b in f.Root.GetComponentsInChildren<Button>(true)) if (b.IsActive() && b.IsInteractable()) result.Add(b);
        result.Sort((a,b) => { var x = f.Bounds((RectTransform)a.transform); var y = f.Bounds((RectTransform)b.transform);
            return Math.Abs(x.y-y.y) > .2f ? x.y.CompareTo(y.y) : x.x.CompareTo(y.x); });
        return result;
    }
    static void KeyboardCommand(OutcomeFixture f, string command)
    {
        // Honest baseline adapter: the unmodified HUD has no Tab owner. Its
        // current EventSystem entry/default movement is exercised, never a
        // substitute model or production change made to manufacture RED.
        MonoBehaviour input = null;
        foreach (var component in f.Root.GetComponents<MonoBehaviour>())
            if (component.GetType().Name == "LastStandHudKeyboard") input = component;
        if (input != null) { input.GetType().GetMethod("NavigateKeyboard").Invoke(input,new object[] { command }); return; }
        var events = EventSystem.current;
        if (command == "enter-first" || command == "enter-last") events.SetSelectedGameObject(events.firstSelectedGameObject);
        else if (events.currentSelectedGameObject != null)
            ExecuteEvents.Execute(events.currentSelectedGameObject,new AxisEventData(events) { moveDir = command == "previous" ? MoveDirection.Up : MoveDirection.Down },ExecuteEvents.moveHandler);
    }
    static void SelectedInput(Button expected, string label)
    { Require(EventSystem.current.currentSelectedGameObject == expected.gameObject,label + " actual selected " + expected.name); }
    static void InputNavigation()
    {
        foreach (var profile in OutcomeProfiles) foreach (string state in InputStates)
        using (var f = InputFixture(profile,state))
        {
            var enabled = VisibleEnabledInput(f); Require(enabled.Count > 0,"actual enabled input inventory");
            KeyboardCommand(f,"enter-first");
            for (int i = 0; i < enabled.Count; i++) { SelectedInput(enabled[i],profile+" "+state+" forward visible order"); KeyboardCommand(f,"next"); }
            Require(EventSystem.current.currentSelectedGameObject == null,state+" forward Tab releases outer native Return boundary");
            KeyboardCommand(f,"enter-last");
            for (int i = enabled.Count-1; i >= 0; i--) { SelectedInput(enabled[i],state+" reverse visible order"); KeyboardCommand(f,"previous"); }
            Require(EventSystem.current.currentSelectedGameObject == null,state+" Shift+Tab releases native Return boundary");
            for (int i = 0; i < enabled.Count; i++)
            {
                foreach (var direction in new[] { MoveDirection.Down, MoveDirection.Right })
                {
                    EventSystem.current.SetSelectedGameObject(enabled[i].gameObject);
                    ExecuteEvents.Execute(enabled[i].gameObject,new AxisEventData(EventSystem.current) { moveDir = direction },ExecuteEvents.moveHandler);
                    SelectedInput(enabled[Math.Min(i+1,enabled.Count-1)],state+" forward native arrow");
                }
                foreach (var direction in new[] { MoveDirection.Up, MoveDirection.Left })
                {
                    EventSystem.current.SetSelectedGameObject(enabled[i].gameObject);
                    ExecuteEvents.Execute(enabled[i].gameObject,new AxisEventData(EventSystem.current) { moveDir = direction },ExecuteEvents.moveHandler);
                    SelectedInput(enabled[Math.Max(0,i-1)],state+" reverse native arrow");
                }
            }
            foreach (string id in InputIds)
            {
                var b = f.Button(id); if (b.IsActive() && b.IsInteractable()) continue;
                EventSystem.current.SetSelectedGameObject(b.gameObject); f.Refresh();
                Require(EventSystem.current.currentSelectedGameObject == null || enabled.Exists(x=>x.gameObject == EventSystem.current.currentSelectedGameObject),
                    state+" disabled/hidden selection repairs to current enabled owner controls");
            }
            Debug.Log("ST_LS_HUD_INPUT_ORDER "+profile+" "+state+" enabled="+enabled.Count);
        }
        using (var f = InputFixture(OutcomeProfiles[0],"garage"))
        {
            EventSystem.current.SetSelectedGameObject(f.Button("Deploy").gameObject); f.Deploy();
            SelectedInput(VisibleEnabledInput(f)[0],"hidden Deploy after phase change rehomes focus");
            EventSystem.current.SetSelectedGameObject(null); f.Refresh();
            Require(EventSystem.current.currentSelectedGameObject == null,"refresh cannot steal focus after leaving Canvas");
        }
    }
    static void SubmitInput(Button b)
    { ExecuteEvents.Execute(b.gameObject,new BaseEventData(EventSystem.current),ExecuteEvents.submitHandler); }
    static void InputActivation()
    {
        foreach (string state in InputStates)
        using (var f = InputFixture(OutcomeProfiles[0],state))
        {
            var enabled = VisibleEnabledInput(f); KeyboardCommand(f,"enter-first"); SelectedInput(enabled[0],state+" keyboard entry before native Submit");
            foreach (string id in InputIds)
            {
                var b = f.Button(id); if (b.IsActive() && b.IsInteractable()) continue;
                string before = f.Storage.Value; int callbacks = 0; b.onClick.AddListener(()=>callbacks++);
                SubmitInput(b); Click(b);
                Require(callbacks == 0 && f.Storage.Value == before,state+" hidden/disabled cannot submit or click "+id);
                if (b.IsActive()) Require(b.GetComponentInChildren<Text>(true).fontStyle == FontStyle.Italic && !b.GetComponent<Outline>().enabled,
                    state+" textual disabled cue with no false selected outline "+id);
            }
        }
        foreach (string id in new[]{"Deploy","Claim","Redeploy","RetrySave","SpeedRate",
            "TierPrevious","TierNext","FittingPrevious","FittingNext"})
        using (var f = InputFixture(OutcomeProfiles[0],id == "Claim" ? "result" : id == "Redeploy" ? "workshop" : id == "RetrySave" ? "blocked" :
            id == "SpeedRate" ? "battle" : "garage"))
        {
            if(id=="TierPrevious"||id=="TierNext")
            {
                Require(f.Loop.Progression.TryDeploy()&&f.Loop.Progression.TryStageDefeat(1200,1)&&f.Loop.Progression.TryClaim(),
                    "keyboard tier fixture unlocks via the actual saved outcome and claim owner");
                f.Refresh();if(id=="TierPrevious"){Click(f.Button("TierNext"));f.Refresh();}
            }
            if(id=="FittingPrevious")SelectFitting(f.Loop,f.Art,f.Root,true,f.Refresh);
            var b = f.Button(id); Require(b.IsActive() && b.IsInteractable(),"actual eligible action "+id);
            EventSystem.current.SetSelectedGameObject(b.gameObject);
            var text = b.GetComponentInChildren<Text>(true); var outline = b.GetComponent<Outline>();
            Require(outline.enabled && outline.effectColor.a > 0 && outline.effectDistance.sqrMagnitude > 0 && text.fontStyle == FontStyle.Bold,
                id+" visible stroke and weight selected cue");
            var pointer = new PointerEventData(EventSystem.current) { button = PointerEventData.InputButton.Left };
            ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerDownHandler);
            Require(text.fontStyle == FontStyle.BoldAndItalic && outline.enabled,id+" distinct non-color press cue");
            ExecuteEvents.Execute(b.gameObject,pointer,ExecuteEvents.pointerUpHandler);
            int calls = 0; b.onClick.AddListener(()=>calls++); bool attachment = f.Art.showingLauncher;
            int wallet = f.Loop.Progression.Wallet;
            if (id == "RetrySave") f.Storage.DenyRead = false;
            if (id == "SpeedRate") ReanchorInput(f);
            SubmitInput(b); Require(calls == 1,"one native Button Submit callback "+id);
            if (b.IsActive() && b.IsInteractable())
                Require(text.fontStyle == FontStyle.BoldAndItalic && outline.enabled,id+" native keyboard press has non-color cue");
            if (id == "FittingPrevious" || id=="FittingNext")
            {
                Require(f.Art.showingLauncher!=attachment && f.Loop.FittingId==(id=="FittingNext"?"launcher":"repair") &&
                    f.Loop.MenuPage=="" && f.Loop.Session.Model==null && f.Loop.Progression.Wallet==wallet,
                    "one native inline arrow Submit selects the exact fitting without modal, progression or run");
            }
            if (id == "Deploy" || id == "Redeploy") Require(f.Loop.Phase == "battle" && f.Loop.Progression.ActiveRunId != 0 && f.Loop.Session.Model != null,"Submit existing run owner");
            if (id == "Claim") { Require(f.Loop.Phase == "workshop" && f.Loop.Progression.Wallet == wallet+1 && f.Loop.Progression.PendingDefeat == null,"Submit one manual Claim"); SubmitInput(b); Require(calls == 1 && f.Loop.Progression.Wallet == wallet+1,"hidden claimed control cannot award twice"); }
            if (id == "RetrySave") Require(f.Loop.Progression.SaveState == "ready" && !b.gameObject.activeInHierarchy,"Submit existing storage recovery owner");
            if (id == "SpeedRate") Require(f.Loop.Session.ManualPaused && text.text == "0x\nPAUSED","Submit rate control uses existing Pause owner and visible state");
            if (id == "TierPrevious" || id=="TierNext")
            {
                Require(f.Loop.Progression.SelectedTier==(id=="TierNext"?2:1) && f.Loop.Progression.ActiveRunId==0 &&
                    f.Loop.Session.Model==null && f.Loop.MenuPage=="",
                    "one native inline arrow Submit selects the exact unlocked tier without modal or deployment");
            }
        }
        using(var f=InputFixture(OutcomeProfiles[0],"paused"))
        {
            string snapshot=f.Loop.Session.Model.Snapshot(),save=f.Storage.Value;bool muted=f.Loop.Muted;
            ReanchorInput(f);OpenSettings(f.Loop,f.Root,0,f.Refresh);var sound=f.Button("SettingsMute");
            KeyboardCommand(f,"enter-first");int remaining=VisibleEnabledInput(f).Count;
            while(EventSystem.current.currentSelectedGameObject!=sound.gameObject&&remaining-->0)KeyboardCommand(f,"next");
            SelectedInput(sound,"Audio sound control reached by ordinary keyboard navigation");
            int calls=0;sound.onClick.AddListener(()=>calls++);SubmitInput(sound);
            Require(calls==1&&f.Loop.Muted!=muted&&sound.GetComponentInChildren<Text>().text==(f.Loop.Muted?"MASTER SOUND: OFF":"MASTER SOUND: ON"),
                "one native Audio Submit changes the actual preference owner and label");
            Click(f.Button("SettingsClose"));Require(f.Loop.Session.ManualPaused&&f.Loop.Session.Paused&&!f.Loop.Session.MenuPaused&&
                !f.Loop.MenuOpen&&f.Loop.Session.Model.Snapshot()==snapshot&&f.Storage.Value==save,"Audio keyboard journey preserves manual pause/run/save");
        }
        using(var f=InputFixture(OutcomeProfiles[0],"workshop"))
        {
            SubmitInput(f.Button("ShopEntry"));f.Refresh();var buy=f.Button("ShopCard_cannonAttackBuy");
            Require(buy.IsActive()&&buy.IsInteractable(),"Upgrades exposes actual eligible cannon card to keyboard");
            EventSystem.current.SetSelectedGameObject(buy.gameObject);int calls=0;buy.onClick.AddListener(()=>calls++);
            int wallet=f.Loop.Progression.Wallet,level=f.Loop.Progression.CannonAttackLevel;
            SubmitInput(buy);
            Require(calls==1&&f.Loop.Progression.CannonAttackLevel==level+1&&f.Loop.Progression.Wallet==wallet-1,
                "one native upgrade-card Submit uses the existing saved purchase owner");
        }
    }
    static Button InputRaycast(OutcomeFixture f, Vector2 point, int pointerId)
    {
        var hits = new List<RaycastResult>();
        EventSystem.current.RaycastAll(new PointerEventData(EventSystem.current) { position = point, pointerId = pointerId },hits);
        foreach (var hit in hits) { var b = hit.gameObject.GetComponentInParent<Button>(); if (b) return b; }
        return null;
    }
    static void InputBounds()
    {
        foreach (var profile in OutcomeProfiles) foreach (string state in InputStates)
        using (var f = InputFixture(profile,state))
        {
            f.Camera.Render(); Canvas.ForceUpdateCanvases();
            var enabled = VisibleEnabledInput(f); var before = new Dictionary<Button,Rect>();
            foreach (var b in enabled) before.Add(b,f.Bounds((RectTransform)b.transform));
            KeyboardCommand(f,"enter-first"); SelectedInput(enabled[0],state+" keyboard focus shares actual pointer controls");
            foreach (var b in enabled)
            {
                var bounds = f.Bounds((RectTransform)b.transform); Require(bounds == before[b],"focus retains visual/pointer rect "+b.name);
                Require(bounds.width >= 43.99f && bounds.height >= 43.99f,"actual 44px pointer/touch target "+b.name);
                foreach (int pointerId in new[] { -1, 0 }) foreach (var position in new[] { bounds.center, new Vector2(bounds.xMin+.5f,bounds.yMin+.5f), new Vector2(bounds.xMax-.5f,bounds.yMax-.5f) })
                    Require(InputRaycast(f,new Vector2(position.x,f.Canvas.pixelRect.height-position.y),pointerId) == b,"actual GraphicRaycaster matches mouse/touch visual bounds "+b.name);
                foreach (int pointerId in new[] { -1,0 }) foreach (var position in new[] {
                    new Vector2(bounds.xMin-.5f,bounds.center.y),new Vector2(bounds.xMax+.5f,bounds.center.y),
                    new Vector2(bounds.center.x,bounds.yMin-.5f),new Vector2(bounds.center.x,bounds.yMax+.5f) })
                    Require(InputRaycast(f,new Vector2(position.x,f.Canvas.pixelRect.height-position.y),pointerId) != b,"actual pointer/touch cannot activate beyond reported visual bounds "+b.name);
                KeyboardCommand(f,"next");
            }
            if(f.Loop.GarageCardsVisible)
            {
                string save=f.Storage.Value;int writes=f.Storage.Writes;
                foreach(int pointerId in new[]{-1,0})
                {
                    bool prior=f.Art.showingLauncher;var arrow=f.Button(prior?"FittingPrevious":"FittingNext");
                    var targetBounds=f.Bounds((RectTransform)arrow.transform);int arrowCallbacks=0;arrow.onClick.AddListener(()=>arrowCallbacks++);
                    var pointer=new PointerEventData(EventSystem.current){position=new Vector2(targetBounds.center.x,f.Canvas.pixelRect.height-targetBounds.center.y),
                        pointerId=pointerId,button=PointerEventData.InputButton.Left};
                    Require(InputRaycast(f,pointer.position,pointerId)==arrow,"inline fitting uses the same mouse/touch raycast owner");
                    ExecuteEvents.Execute(arrow.gameObject,pointer,ExecuteEvents.pointerDownHandler);
                    ExecuteEvents.Execute(arrow.gameObject,pointer,ExecuteEvents.pointerUpHandler);
                    ExecuteEvents.Execute(arrow.gameObject,pointer,ExecuteEvents.pointerClickHandler);
                    Require(arrowCallbacks==1&&f.Art.showingLauncher!=prior&&f.Loop.FittingId==(prior?"repair":"launcher")&&f.Loop.MenuPage=="",
                        "one actual mouse/touch activation selects exact inline fitting");
                    Require(f.Bounds((RectTransform)arrow.transform)==targetBounds&&f.Storage.Value==save&&f.Storage.Writes==writes,
                        "inline activation preserves target geometry and gameplay save");
                }
                Debug.Log("ST_LS_HUD_INPUT_BOUNDS "+profile+" "+state+" enabled="+enabled.Count);continue;
            }
            var menu = f.Button("Menu"); var rect = f.Bounds((RectTransform)menu.transform);
            int callbacks = 0; menu.onClick.AddListener(()=>callbacks++);
            foreach (int pointerId in new[] { -1,0 })
            {
                bool manualPaused=f.Loop.Session.ManualPaused;string snapshot=f.Loop.Session.Model?.Snapshot(),save=f.Storage.Value;
                if(f.Loop.Session.Model!=null)ReanchorInput(f);
                var pointer = new PointerEventData(EventSystem.current) { position = new Vector2(rect.center.x,f.Canvas.pixelRect.height-rect.center.y), pointerId = pointerId, button = PointerEventData.InputButton.Left };
                var target = InputRaycast(f,pointer.position,pointerId); Require(target == menu,"same floating Menu mouse/touch owner");
                ExecuteEvents.Execute(target.gameObject,pointer,ExecuteEvents.pointerDownHandler);
                ExecuteEvents.Execute(target.gameObject,pointer,ExecuteEvents.pointerUpHandler);
                int priorCalls = callbacks; ExecuteEvents.Execute(target.gameObject,pointer,ExecuteEvents.pointerClickHandler);
                Require(callbacks == priorCalls+1 && f.Loop.MenuPage=="menu","single mouse/touch activation opens the actual menu");
                if(f.Loop.Session.Model!=null)Require(f.Loop.Session.MenuPaused&&f.Loop.Session.Paused,"Menu pointer holds active run");
                Click(f.Button("SettingsClose"));
                Require(!f.Loop.MenuOpen&&!f.Loop.Session.MenuPaused&&f.Loop.Session.ManualPaused==manualPaused&&
                    f.Loop.Session.Model?.Snapshot()==snapshot&&f.Storage.Value==save,"Menu pointer round trip preserves manual pause/model/save");
                Require(f.Bounds((RectTransform)menu.transform) == rect,"Menu round trip retains target bounds");
            }
            Debug.Log("ST_LS_HUD_INPUT_BOUNDS "+profile+" "+state+" enabled="+enabled.Count);
        }
    }
}

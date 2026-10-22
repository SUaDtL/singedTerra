using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.Encounter;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Imported-scene controller and UI integration, with isolated local records.
// Synthetic timestamps prove scheduling only; logs prove audio admission only.
// This suite cannot establish browser navigation/fullscreen, pixels or listening.
public static class LastStandControlsChecks
{
    const BindingFlags Private = BindingFlags.Instance | BindingFlags.NonPublic;
    const string Playable = "Assets/Scenes/LastStandPrototype.unity";
    const string Funded = "{\"version\":1,\"credits\":9,\"permanentLevel\":0," +
        "\"nextRunId\":1,\"lastFinalizedRunId\":0,\"pendingDefeat\":null}";

    sealed class Storage : ILastStandStorage
    {
        public string Value;
        public bool DenyWrite;
        public int Writes;
        public string Read() => Value;
        public void Write(string value)
        { Writes++; if(DenyWrite)throw new InvalidOperationException("controls test denied write"); Value=value; }
    }
    sealed class Fixture
    {
        public readonly Storage Game, Preferences;
        public readonly LastStandLoopController Loop;
        public readonly TankPresentation Art;
        public readonly UniversalRenderPipelineAsset SourcePipeline;
        public readonly float SourceScale;
        public readonly Canvas Canvas;
        public Fixture(LastStandPreferenceValues values=null, string gameplay=null)
        {
            Game=new Storage { Value=gameplay }; Preferences=new Storage();
            if(values!=null)Require(LastStandPreferences.Load(Preferences).Apply(values),"seed isolated preferences through real writer");
            LastStandLoopController.StorageFactory=()=>Game;
            LastStandLoopController.PreferencesStorageFactory=()=>Preferences;
            EditorSceneManager.OpenScene(Playable,OpenSceneMode.Single);
            Art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();
            Require(Art,"actual imported tank exists");
            var review=Art.GetComponent<BattlefieldReview>();
            Require(review && review.reviewPipeline,"imported scene names its real pipeline");
            Invoke(review,"Awake");
            SourcePipeline=review.reviewPipeline as UniversalRenderPipelineAsset;
            Require(SourcePipeline,"real scene uses URP");SourceScale=SourcePipeline.renderScale;
            Invoke(Art,"Start");Invoke(Art.GetComponent<ArtHud>(),"Start");
            Loop=Art.GetComponent<LastStandLoopController>();
            Set(Loop.Session,"focused",true);Set(Loop.Session,"applicationPaused",false);
            Invoke(Loop.Audio,"OnApplicationFocus",true);Invoke(Loop.Audio,"OnApplicationPause",false);
            Canvas=Art.GetComponentInChildren<Canvas>();
            // Batch edit-mode import does not run EventSystem.OnEnable. Use
            // this scene's real owner, as the existing input suite does.
            foreach(var events in Resources.FindObjectsOfTypeAll<EventSystem>())
                if(events.gameObject.scene==Art.gameObject.scene)
                { Invoke(events,"OnEnable");EventSystem.current=events;break; }
            Require(EventSystem.current,"actual scene EventSystem is enabled");
            Invoke(Canvas.GetComponent<GraphicRaycaster>(),"OnEnable");
            UnityEngine.Canvas.ForceUpdateCanvases();Loop.RefreshControls();
            Require(Loop.Progression.SaveState=="ready" && Loop.Preferences.SaveState=="ready","isolated stores are ready");
        }
        public Button Button(string name)
        {
            var matches=Canvas.GetComponentsInChildren<Button>(true).Where(b=>b.name==name).ToArray();
            Require(matches.Length==1,"one actual button "+name);return matches[0];
        }
        public void Click(string name)
        {
            var button=Button(name);Require(button.IsActive()&&button.IsInteractable(),"available button "+name);
            ExecuteEvents.Execute(button.gameObject,new PointerEventData(EventSystem.current) {
                button=PointerEventData.InputButton.Left },ExecuteEvents.pointerClickHandler);
        }
        public LastStandRunClock Clock => (LastStandRunClock)Get(Loop.Session,"runClock");
    }
    static void Require(bool value,string message)
    { if(!value)throw new InvalidOperationException("Controls integration: "+message); }
    static object Get(object value,string field) => value.GetType().GetField(field,Private).GetValue(value);
    static void Set(object value,string field,object data) => value.GetType().GetField(field,Private).SetValue(value,data);
    static void Invoke(object value,string method,params object[] arguments)
    {
        var found=value.GetType().GetMethod(method,Private);
        Require(found!=null,"actual lifecycle method "+method);found.Invoke(value,arguments);
    }
    static void Check(string name,Action action)
    {
        try { action();Debug.Log("ST_LS_CONTROLS_PASS "+name); }
        catch(Exception error) { Debug.LogError("ST_LS_CONTROLS_FAIL "+name+" "+error);throw; }
    }
    public static void Run()
    {
        var gameFactory=LastStandLoopController.StorageFactory;
        var preferencesFactory=LastStandLoopController.PreferencesStorageFactory;
        var pipeline=QualitySettings.renderPipeline;
        bool background=Application.runInBackground;
        try
        {
            Check("test_scalable_selector_entries",ScalableSelectorEntries);
            Check("test_locked_tier_preview_preserves_admission",LockedTierPreviewPreservesAdmission);
            Check("test_unlocked_tier_and_fitting_selection",UnlockedTierAndFittingSelection);
            Check("test_selector_save_failure_restores_environment",SelectorSaveFailureRestoresEnvironment);
            Check("test_selector_environment_preflight_preserves_save",SelectorEnvironmentPreflightPreservesSave);
            Check("test_selector_description_keyboard_scroll",SelectorDescriptionKeyboardScroll);
            Check("test_failed_deploy_retry_preserves_menu_hold",FailedDeployRetryPreservesMenuHold);
            Check("test_existing_suite_preference_scope",ExistingSuitePreferenceScope);
            Check("test_existing_suite_pipeline_scope",ExistingSuitePipelineScope);
            Check("test_settings_scroll_resets_and_content_contraction",SettingsScrollResetsAndContentContraction);
            Check("test_preferences_applied_before_deploy",PreferencesAppliedBeforeDeploy);
            Check("test_speed_and_independent_pause_holds",SpeedAndIndependentPauseHolds);
            Check("test_modal_core_input_and_cancel_focus",ModalCoreInputAndCancelFocus);
            Check("test_abandon_cancel_and_confirm_without_award",AbandonCancelAndConfirmWithoutAward);
            Check("test_reset_defaults_preserves_gameplay_and_pause",ResetDefaultsPreservesGameplayAndPause);
            Check("test_failed_save_refuses_navigation",FailedSaveRefusesNavigation);
            Check("test_idle_controls_restore_after_focus_and_visibility",IdleControlsRestoreAfterFocusAndVisibility);
            Check("test_display_owns_runtime_pipeline_clone",DisplayOwnsRuntimePipelineClone);
            Check("test_guidance_optout_and_audio_sample_admission",GuidanceOptoutAndAudioSampleAdmission);
        }
        finally
        {
            LastStandLoopController.StorageFactory=gameFactory;
            LastStandLoopController.PreferencesStorageFactory=preferencesFactory;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }

    static void IdleControlsRestoreAfterFocusAndVisibility()
    {
        var pending=new Storage();var progress=LastStandProgression.Load(pending);
        Require(progress.TryDeploy()&&progress.TryStageDefeat(1600,30),"seed result through its real writer");
        foreach(var gameplay in new[] { null,Funded,pending.Value })
        foreach(bool visibility in new[] { false,true })
        {
            var f=new Fixture(gameplay:gameplay);string phase=f.Loop.Phase;
            string callback=visibility?"OnApplicationPause":"OnApplicationFocus";
            Invoke(f.Loop.Session,callback,visibility);
            // The background terminal publishes its result while unavailable.
            // Also cover an idle panel refreshed by resize while in the background.
            f.Loop.RefreshControls();
            Require(!f.Loop.CanOpenMenu&&!f.Button("Menu").IsInteractable(),"background menu is unavailable");
            string saved=f.Game.Value;int writes=f.Game.Writes;
            Invoke(f.Loop.Session,callback,!visibility);
            Require(f.Loop.CanOpenMenu&&f.Button("Menu").IsInteractable(),
                phase+" menu restores after actual "+callback+" without another action or refresh");
            f.Click("Menu");Require(f.Loop.MenuPage=="menu","restored menu accepts its real pointer action");
            f.Click("SettingsClose");
            Require(f.Loop.Phase==phase&&f.Loop.Session.Model==null&&f.Game.Value==saved&&f.Game.Writes==writes,
                "idle focus restoration and menu never deploy, award or write gameplay");
        }
    }

    static void ScalableSelectorEntries()
    {
        var f=new Fixture();
        Require(!f.Button("ToggleTier").IsActive()&&!f.Button("ToggleFitting").IsActive(),"legacy binary entries remain allocated but hidden");
        Require(f.Button("TierNext").IsActive()&&f.Button("TierNext").IsInteractable()&&!f.Button("TierPrevious").IsInteractable(),
            "compact tier card exposes the first locked preview and a bounded previous arrow");
        Require(f.Canvas.GetComponentsInChildren<Text>().Single(t=>t.name=="GarageTierName").text.Contains("TIER 1"),"tier card names the selected battlefield");
        Require(f.Canvas.GetComponentsInChildren<Text>().Single(t=>t.name=="GarageFittingName").text=="FIELD REPAIR", "inline fitting card names actual selected identity");
        Require(f.Button("Menu").transform.parent.name=="LastStandLoopHud"&&f.Button("ShopEntry").GetComponentInChildren<Text>().text=="UPGRADES",
            "floating menu and secondary upgrades are separate from the hero selectors");
        f.Click("FittingNext");
        Require(f.Loop.FittingId=="launcher"&&f.Loop.MenuPage==""&&!f.Button("FittingNext").IsInteractable(),
            "inline fitting arrow changes identity without opening a modal or wrapping");
        f.Click("FittingPrevious");
        Require(f.Loop.FittingId=="repair"&&!f.Button("FittingPrevious").IsInteractable(),"previous restores first catalog fitting");
        GarageAndCombatGeometry();
    }

    static void LockedTierPreviewPreservesAdmission()
    {
        var f=new Fixture();var review=f.Art.GetComponent<BattlefieldReview>();
        string save=f.Game.Value;int writes=f.Game.Writes;
        f.Click("TierNext");
        Require(f.Loop.GarageTierSelection.Current.Id=="2"&&f.Loop.HasLockedTierPreview&&!f.Loop.MenuOpen,"inline next previews first locked tier");
        Require(review.EnvironmentId=="iron-perimeter"&&review.ironEnvironment.activeSelf&&!review.ashEnvironment.activeSelf,
            "locked preview shows the actual second authored environment");
        Require(!f.Button("TierNext").IsInteractable(),"next stops at first locked tier without wrap");
        Require(!f.Button("Deploy").IsInteractable(),"underlying deploy is disabled during locked preview");
        f.Loop.Deploy();f.Loop.SelectTier(2);
        Require(f.Loop.Progression.SelectedTier==1&&f.Loop.Session.Model==null&&f.Loop.Progression.ActiveRunId==0&&
            f.Game.Value==save&&f.Game.Writes==writes,"preview/direct calls cannot save a locked tier or deploy the prior tier");
        f.Click("TierPrevious");
        Require(review.EnvironmentId=="sunlit-ash"&&review.ashEnvironment.activeSelf&&!review.ironEnvironment.activeSelf,
            "previous restores the selected playable environment immediately");
        Require(f.Button("Deploy").IsInteractable(),"returning to an unlocked tier restores Deploy");
        f.Click("TierNext");f.Click("Menu");
        Require(!f.Loop.HasLockedTierPreview&&review.EnvironmentId=="sunlit-ash","floating Menu restores the playable environment");
        f.Click("SettingsClose");
        Require(EventSystem.current.currentSelectedGameObject==f.Button("Menu").gameObject,"close restores floating menu focus");
        f.Click("TierNext");f.Click("ShopEntry");
        Require(!f.Loop.HasLockedTierPreview&&review.EnvironmentId=="sunlit-ash"&&!f.Button("TierNext").IsActive(),
            "opening permanent Upgrades restores playable selection and hides inline cards");
        f.Click("ShopClose");
        Require(f.Button("TierNext").IsActive()&&f.Button("Deploy").IsInteractable(),"closing Upgrades restores the playable inline cards");
    }
    static Rect ScreenBounds(Fixture f,RectTransform target)
    {
        var corners=new Vector3[4];target.GetWorldCorners(corners);
        var points=corners.Select(c=>RectTransformUtility.WorldToScreenPoint(f.Canvas.worldCamera,c)).ToArray();
        return Rect.MinMaxRect(points.Min(p=>p.x),points.Min(p=>p.y),points.Max(p=>p.x),points.Max(p=>p.y));
    }
    static void AssertVisibleGeometry(Fixture f,Vector2Int profile,string state)
    {
        // Batch edit-mode does not run the camera-follow Canvas player loop.
        // Reanchor its test-owned screen-space camera after the world camera
        // changes; the shipped Canvas remains screen-space overlay.
        f.Canvas.renderMode=RenderMode.ScreenSpaceOverlay;
        f.Canvas.renderMode=RenderMode.ScreenSpaceCamera;f.Canvas.worldCamera=f.Art.view;
        UnityEngine.Canvas.ForceUpdateCanvases();f.Loop.RefreshControls();
        UnityEngine.Canvas.ForceUpdateCanvases();
        var root=f.Button("Menu").transform.parent;
        var buttons=root.GetComponentsInChildren<Button>().Where(b=>b.IsActive()).ToArray();
        var bounds=buttons.Select(b=>ScreenBounds(f,b.GetComponent<RectTransform>())).ToArray();
        string context=profile+" "+state+" ";
        for(int i=0;i<buttons.Length;i++)
        {
            var rect=bounds[i];
            Require(rect.width>=43.9f&&rect.height>=43.9f,context+buttons[i].name+" retains a 44px target: "+rect);
            Require(rect.xMin>=-.2f&&rect.yMin>=-.2f&&rect.xMax<=profile.x+.2f&&rect.yMax<=profile.y+.2f,
                context+buttons[i].name+" stays inside actual Canvas pixels: "+rect);
            for(int j=i+1;j<buttons.Length;j++)
            {
                var other=bounds[j];
                Require(Mathf.Min(rect.xMax,other.xMax)-Mathf.Max(rect.xMin,other.xMin)<.5f||
                    Mathf.Min(rect.yMax,other.yMax)-Mathf.Max(rect.yMin,other.yMin)<.5f,
                    context+"targets do not overlap: "+buttons[i].name+" "+buttons[j].name);
            }
        }
        var menu=ScreenBounds(f,f.Button("Menu").GetComponent<RectTransform>());
        Require(menu.xMax>profile.x-13&&menu.yMax>profile.y-13,context+"Menu is a standalone top-right target");
        foreach(var text in root.GetComponentsInChildren<Text>().Where(t=>t.isActiveAndEnabled&&!string.IsNullOrEmpty(t.text)))
        {
            var rect=ScreenBounds(f,text.rectTransform);
            float pixelScale=rect.height/text.rectTransform.rect.height;
            Require(text.fontSize*pixelScale>=13.9f,context+text.name+" retains readable 14px minimum");
            Require(text.preferredHeight<=text.rectTransform.rect.height+.6f/pixelScale,
                context+text.name+" keeps complete text: "+text.text+" preferred="+text.preferredHeight+" rect="+text.rectTransform.rect+
                " font="+text.fontSize+" pixelsPerUnit="+text.pixelsPerUnit+" root="+((RectTransform)root).rect);
            Require(rect.xMin>=-.2f&&rect.yMin>=-.2f&&rect.xMax<=profile.x+.2f&&rect.yMax<=profile.y+.2f,
                context+text.name+" text stays inside viewport");
            if(!text.transform.IsChildOf(f.Button("Menu").transform))
                Require(Mathf.Min(rect.xMax,menu.xMax)-Mathf.Max(rect.xMin,menu.xMin)<.5f||
                    Mathf.Min(rect.yMax,menu.yMax)-Mathf.Max(rect.yMin,menu.yMin)<.5f,
                    context+"floating Menu does not cover "+text.name);
        }
    }
    static void GarageAndCombatGeometry()
    {
        foreach(var profile in new[]{new Vector2Int(1920,1080),new Vector2Int(1366,768),new Vector2Int(720,640),
            new Vector2Int(390,844),new Vector2Int(844,390),new Vector2Int(390,688),new Vector2Int(844,266),
            new Vector2Int(720,516),new Vector2Int(568,196)})
        {
            var f=new Fixture();var camera=f.Art.view;var texture=new RenderTexture(profile.x,profile.y,16);
            try
            {
                camera.targetTexture=texture;f.Canvas.renderMode=RenderMode.ScreenSpaceCamera;f.Canvas.worldCamera=camera;
                f.Canvas.planeDistance=1;f.Canvas.GetComponent<CanvasScaler>().enabled=false;
                f.Canvas.scaleFactor=Mathf.Sqrt((profile.x/1280f)*(profile.y/720f));
                UnityEngine.Canvas.ForceUpdateCanvases();f.Loop.RefreshControls();
                AssertVisibleGeometry(f,profile,"garage");
                var deploy=ScreenBounds(f,f.Button("Deploy").GetComponent<RectTransform>());
                var upgrades=ScreenBounds(f,f.Button("ShopEntry").GetComponent<RectTransform>());
                Require(deploy.width*deploy.height>upgrades.width*upgrades.height,profile+" Deploy has stronger area than Upgrades");
                f.Click("TierNext");AssertVisibleGeometry(f,profile,"locked preview");f.Click("TierPrevious");
                f.Click("FittingNext");AssertVisibleGeometry(f,profile,"launcher fitting");
                // The established 568x196 fixture is a garage/recovery-only
                // viewport; combat keeps the maintained eight field profiles.
                if(profile.y<240)continue;
                f.Click("Deploy");AssertVisibleGeometry(f,profile,"combat");
                Require(new[]{"Pause","ToggleMute","Effects","TierPrevious","TierNext","FittingPrevious","FittingNext"}.All(id=>!f.Button(id).IsActive()),
                    profile+" combat shows only the compact rate controls, floating Menu and separate Run Upgrades");
                var speed=ScreenBounds(f,f.Button("SpeedRate").GetComponent<RectTransform>());
                var shop=ScreenBounds(f,f.Button("ShopEntry").GetComponent<RectTransform>());
                Require(Math.Abs(speed.center.x-profile.x/2f)<1&&speed.yMax<profile.y*.3f&&shop.xMax>profile.x-13,
                    profile+" rate stays bottom center and Run Upgrades stays at the lower corner");
                Require(f.Button("ShopEntry").GetComponentInChildren<Text>().text=="RUN\nUPGRADES",profile+" shop entry names its run scope");
                f.Click("SpeedRate");AssertVisibleGeometry(f,profile,"paused combat");
                Require(f.Loop.Session.ManualPaused&&f.Button("SpeedRate").GetComponentInChildren<Text>().text=="0x\nPAUSED",
                    profile+" actual compact rate button pauses with the full visible status");
                f.Click("Menu");f.Click("MenuSettings");f.Click("SettingsMute");f.Click("SettingsTab1");f.Click("DisplayEffects");f.Click("SettingsClose");
                Require(f.Loop.Muted&&!f.Loop.Session.View.FullEffects&&f.Loop.Session.ManualPaused&&!f.Loop.Session.MenuPaused,
                    profile+" Settings audio/display work and closing preserves manual pause");
                f.Click("SpeedRate");Require(!f.Loop.Session.Paused,profile+" same rate control resumes");
            }
            finally { camera.targetTexture=null;UnityEngine.Object.DestroyImmediate(texture); }
        }
    }
    static void UnlockSecondTier(Fixture f)
    {
        Require(f.Loop.Progression.TryDeploy()&&f.Loop.Progression.TryStageDefeat(1200,1)&&f.Loop.Progression.TryClaim(),
            "isolated integration fixture unlocks through real saved outcome/claim contract");
        f.Loop.RefreshControls();
    }
    static void UnlockedTierAndFittingSelection()
    {
        var f=new Fixture();UnlockSecondTier(f);
        f.Click("TierNext");
        Require(f.Loop.GarageTierSelection.Current.Unlocked&&f.Loop.Progression.SelectedTier==2&&f.Loop.EnvironmentId=="iron-perimeter",
            "unlocked choice commits exact selected tier and environment");
        Require(!f.Button("FittingPrevious").IsInteractable()&&f.Loop.GarageFittingSelection.Current.Id=="repair","fitting starts at explicit current identity");
        f.Click("FittingNext");
        Require(f.Loop.FittingId=="launcher"&&!f.Button("FittingNext").IsInteractable(),"fitting arrow equips explicit identity and stops at catalog endpoint");
        f.Click("Deploy");
        Require(f.Loop.Session.Model!=null&&f.Loop.Session.Model.HasLauncher&&f.Loop.Progression.ActiveTier==2,"deployment captures chosen fitting and tier");
        string snapshot=f.Loop.Session.Model.Snapshot();
        f.Loop.MoveGarageTier(-1);f.Loop.MoveGarageFitting(-1);f.Loop.OpenSelector("tier");f.Loop.MoveSelection(-1);f.Loop.SelectTier(1);
        Require(!f.Loop.MenuOpen&&!f.Art.TrySelectFitting("repair")&&!f.Art.GetComponent<BattlefieldReview>().TrySelectEnvironment("sunlit-ash"),
            "public selector, fitting and environment paths refuse during admitted run");
        Require(f.Loop.Session.Model.Snapshot()==snapshot&&f.Loop.EnvironmentId=="iron-perimeter","refused mutations preserve combat snapshot and environment");
    }
    static void SelectorSaveFailureRestoresEnvironment()
    {
        var f=new Fixture();UnlockSecondTier(f);string save=f.Game.Value;f.Game.DenyWrite=true;
        f.Click("TierNext");
        Require(f.Loop.Progression.SaveState!="ready"&&f.Loop.Progression.SelectedTier==1&&f.Game.Value==save,
            "denied selection write preserves durable tier");
        Require(f.Loop.GarageTierSelection.Current.Id=="1"&&f.Loop.EnvironmentId=="sunlit-ash","failed selection restores matching preview/environment");
        Require(!f.Button("TierNext").IsActive()&&!f.Loop.MenuOpen,"save failure replaces inline selectors with recovery without trapping a modal");
        f.Game.DenyWrite=false;f.Loop.RetrySave();
        Require(f.Loop.Progression.SaveState=="ready"&&f.Loop.Progression.SelectedTier==2&&f.Loop.EnvironmentId=="iron-perimeter"&&f.Loop.GarageTierSelection.Current.Id=="2",
            "confirmed retry applies the newly committed tier environment immediately");
    }
    static void SelectorEnvironmentPreflightPreservesSave()
    {
        var f=new Fixture();UnlockSecondTier(f);string save=f.Game.Value;int writes=f.Game.Writes;
        var review=f.Art.GetComponent<BattlefieldReview>();var iron=review.ironEnvironment;
        review.ironEnvironment=null;
        f.Loop.SelectTier(2);
        Require(f.Loop.Progression.SelectedTier==1&&f.Game.Value==save&&f.Game.Writes==writes&&f.Loop.EnvironmentId=="sunlit-ash",
            "controller environment preflight rejects missing content before saving a tier");
        var footer=f.Canvas.GetComponentsInChildren<Text>(true).Single(t=>t.name=="GarageSave");
        Require(footer.isActiveAndEnabled&&footer.text.Contains("Battlefield unavailable"),
            "failed environment preflight remains visible in the actual quiet garage footer");
        review.ironEnvironment=iron;f.Loop.SelectTier(1);
        Require(!footer.text.Contains("unavailable")&&footer.text.Contains("LOCAL SAVE READY")&&f.Game.Value==save&&f.Game.Writes==writes,
            "successful current-tier retry clears the error without saving or reserving a run");
    }
    static void SelectorDescriptionKeyboardScroll()
    {
        var f=new Fixture();var camera=f.Art.view;var texture=new RenderTexture(844,266,16);
        try
        {
            camera.targetTexture=texture;f.Canvas.renderMode=RenderMode.ScreenSpaceCamera;f.Canvas.worldCamera=camera;
            f.Canvas.planeDistance=1;f.Canvas.GetComponent<CanvasScaler>().enabled=false;
            f.Canvas.scaleFactor=Mathf.Sqrt((844/1280f)*(266/720f));UnityEngine.Canvas.ForceUpdateCanvases();
            f.Loop.OpenSelector("fitting");
            string description=string.Concat(Enumerable.Repeat("A longer fitting description with a visible lock requirement. ",15));
            Set(f.Loop,"<Selection>k__BackingField",new LastStandSelection(new[]{new LastStandSelectionOption("repair","Field Repair",description)},"repair",false));
            f.Loop.RefreshControls();UnityEngine.Canvas.ForceUpdateCanvases();
            var settings=(LastStandSettingsHud)Get(Get(f.Loop,"hud"),"settings");
            var keyboard=f.Canvas.GetComponentInChildren<LastStandHudKeyboard>(true);
            Require(settings.MaximumScrollOffset>0,"actual short selector has overflowing description content");
            string save=f.Game.Value;
            keyboard.NavigateKeyboard("scroll-down");Require(settings.ScrollOffset>0,"keyboard PageDown path reveals more description");
            keyboard.NavigateKeyboard("scroll-end");Require(Math.Abs(settings.ScrollOffset-settings.MaximumScrollOffset)<.1f,"keyboard End reveals final requirement");
            keyboard.NavigateKeyboard("scroll-start");Require(settings.ScrollOffset==0,"keyboard Home returns to the top");
            Require(f.Game.Value==save&&f.Loop.FittingId=="repair"&&f.Loop.Session.Model==null,"reading description never changes gameplay");
            f.Click("SettingsClose");
        }
        finally { camera.targetTexture=null;UnityEngine.Object.DestroyImmediate(texture); }
    }

    static void FailedDeployRetryPreservesMenuHold()
    {
        var f=new Fixture();f.Game.DenyWrite=true;f.Click("Deploy");
        Require(f.Loop.Progression.SaveState=="retry"&&f.Loop.Session.Model==null&&f.Loop.Progression.ActiveRunId==0,
            "denied deployment reservation has not started a run");
        f.Loop.OpenMenu("settings");f.Click("SettingsTab3");
        Require(f.Loop.MenuPage=="settings"&&f.Button("DataRetry").IsInteractable(),"actual Save & Account exposes the deployment retry");
        f.Game.DenyWrite=false;f.Click("DataRetry");
        Require(f.Loop.Progression.SaveState=="ready"&&f.Loop.Progression.ActiveRunId!=0&&f.Loop.Session.Model!=null&&f.Loop.Phase=="battle",
            "successful retry starts exactly the reserved run");
        Require(f.Loop.MenuPage=="settings"&&f.Loop.Session.MenuPaused&&f.Loop.Session.Paused&&f.Loop.Session.EffectiveSpeed==0,
            "run created by retry must inherit the already-open menu pause hold");
        Require(f.Loop.Session.Model.Tick==0,"retry never advances combat behind settings");
        f.Loop.Session.AdvanceAt(f.Clock.LastTimestamp+2);
        Require(f.Loop.Session.Model.Tick==0&&f.Loop.Session.Failure=="","open settings continues excluding combat time after retry");
    }

    static void ExistingSuitePreferenceScope()
    {
        var original=LastStandLoopController.PreferencesStorageFactory;
        using(var outer=new LastStandTestPreferencesScope())
        {
            var isolated=LastStandLoopController.PreferencesStorageFactory;
            var first=isolated();first.Write("isolated setting");
            Require(first.Read()=="isolated setting"&&isolated().Read()==null,"each legacy scene gets independent disposable settings");
            // Noncapturing factory delegates may be shared by the compiler.
            // Distinct storage values, plus a captured marker for restoration,
            // establish isolation without assuming delegate identity changes.
            Func<ILastStandStorage> marker=()=>first;
            LastStandLoopController.PreferencesStorageFactory=marker;
            using(var nested=new LastStandTestPreferencesScope())
            {
                var nestedStore=LastStandLoopController.PreferencesStorageFactory();
                Require(!ReferenceEquals(nestedStore,first)&&nestedStore.Read()==null,"nested regression suite starts with separate empty storage");
                nestedStore.Write("nested setting");
                Require(first.Read()=="isolated setting"&&nestedStore.Read()=="nested setting"&&
                    LastStandLoopController.PreferencesStorageFactory().Read()==null,"nested writes cannot alter enclosing or later-scene settings");
            }
            Require(LastStandLoopController.PreferencesStorageFactory==marker&&LastStandLoopController.PreferencesStorageFactory().Read()=="isolated setting",
                "nested regression suite restores its exact enclosing adapter and values");
        }
        Require(LastStandLoopController.PreferencesStorageFactory==original,"legacy suite restores original preference factory without using it");
    }

    static void ExistingSuitePipelineScope()
    {
        var original=QualitySettings.renderPipeline;
        var authored=UnityEditor.AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(
            "Assets/VisualReview/Materials/ReviewPipeline.asset");
        Require(authored,"saved pipeline fixture exists");
        UniversalRenderPipelineAsset nestedPipeline=null;
        try
        {
            QualitySettings.renderPipeline=authored;
            using(var outer=new LastStandTestPreferencesScope())
            {
                var f=new Fixture();
                var scenePipeline=QualitySettings.renderPipeline;
                Require(scenePipeline!=authored&&scenePipeline==GraphicsSettings.currentRenderPipeline,
                    "actual imported scene installs its display clone inside the scope");
                using(var inner=new LastStandTestPreferencesScope())
                {
                    nestedPipeline=UnityEngine.Object.Instantiate(f.SourcePipeline);
                    QualitySettings.renderPipeline=nestedPipeline;
                    Require(QualitySettings.renderPipeline==nestedPipeline,"nested scope can select its own real pipeline clone");
                }
                Require(QualitySettings.renderPipeline==scenePipeline,
                    "nested regression scope restores exact enclosing runtime pipeline");
            }
            Require(QualitySettings.renderPipeline==authored&&UnityEditor.AssetDatabase.Contains(QualitySettings.renderPipeline),
                "outer regression scope restores exact saved pipeline instead of leaking a nonasset clone");
            QualitySettings.renderPipeline=null;
            using(var empty=new LastStandTestPreferencesScope())QualitySettings.renderPipeline=authored;
            Require(QualitySettings.renderPipeline==null,"scope preserves an intentionally null quality override");
        }
        finally
        {
            QualitySettings.renderPipeline=original;
            if(nestedPipeline)UnityEngine.Object.DestroyImmediate(nestedPipeline);
        }
    }

    static void SettingsScrollResetsAndContentContraction()
    {
        foreach(var profile in new[]{new Vector2Int(720,512),new Vector2Int(390,480)})
        {
            var f=new Fixture();var camera=f.Art.view;
            var texture=new RenderTexture(profile.x,profile.y,16);
            var enlarged=new RenderTexture(720,900,16);
            try
            {
                camera.targetTexture=texture;f.Canvas.renderMode=RenderMode.ScreenSpaceCamera;
                f.Canvas.worldCamera=camera;f.Canvas.planeDistance=1;f.Canvas.GetComponent<CanvasScaler>().enabled=false;
                f.Canvas.scaleFactor=Mathf.Sqrt((profile.x/1280f)*(profile.y/720f));
                UnityEngine.Canvas.ForceUpdateCanvases();f.Loop.RefreshControls();
                Require(Math.Abs(f.Canvas.pixelRect.width-profile.x)<.1f&&Math.Abs(f.Canvas.pixelRect.height-profile.y)<.1f,
                    "scroll regression uses actual narrow camera Canvas dimensions");
                var hud=(LastStandLoopHud)Get(f.Loop,"hud");
                var settings=(LastStandSettingsHud)Get(hud,"settings");
                var scroll=(ScrollRect)Get(settings,"scroll");
                f.Click("Deploy");
                f.Loop.OpenMenu("help");scroll.Rebuild(CanvasUpdate.PostLayout);scroll.verticalNormalizedPosition=0;
                UnityEngine.Canvas.ForceUpdateCanvases();
                f.Click("SettingsBack");
                Require(f.Loop.MenuPage=="menu"&&scroll.content.anchoredPosition.y==0&&settings.ScrollOffset==0,
                    "Help to Back resets real content to exact top without a negative normalized-position residue");
                if(profile.x==390)
                {
                    float oldMaximum=settings.MaximumScrollOffset;
                    Require(oldMaximum>0,"first-run guidance produces an actually scrollable narrow menu");
                    scroll.Rebuild(CanvasUpdate.PostLayout);scroll.verticalNormalizedPosition=0;
                    f.Loop.SetPreferences(f.Loop.Preferences.Current.With(tutorialTips:false));
                    Require(settings.MaximumScrollOffset<oldMaximum&&settings.ScrollOffset>=0&&
                        settings.ScrollOffset<=settings.MaximumScrollOffset,
                        "same-page guidance dismissal contracts body and clamps actual reading offset");
                }
                f.Click("MenuSettings");scroll.Rebuild(CanvasUpdate.PostLayout);scroll.verticalNormalizedPosition=0;
                f.Click("SettingsTab2");
                Require(scroll.content.anchoredPosition.y==0&&settings.ScrollOffset==0,"tab switch resets actual offset after bounds change");
                f.Click("SettingsTab0");scroll.Rebuild(CanvasUpdate.PostLayout);scroll.verticalNormalizedPosition=0;
                Require(settings.MaximumScrollOffset>0&&scroll.content.anchoredPosition.y>0,"actual audio content scrolls in narrow viewport");
                float beforeResizeMaximum=settings.MaximumScrollOffset;
                // Grow the actual Canvas while retaining the same settings
                // page. The old positive reading offset must fit new bounds.
                camera.targetTexture=enlarged;f.Canvas.scaleFactor=Mathf.Sqrt((720/1280f)*(900/720f));
                UnityEngine.Canvas.ForceUpdateCanvases();f.Loop.RefreshControls();
                float actualMaximum=Math.Max(0,scroll.content.rect.height-scroll.viewport.rect.height);
                string bounds=" canvas="+f.Canvas.pixelRect+" content="+scroll.content.rect.size+" viewport="+scroll.viewport.rect.size+
                    " actualOffset="+scroll.content.anchoredPosition.y+" actualMaximum="+actualMaximum+
                    " reportedOffset="+settings.ScrollOffset+" reportedMaximum="+settings.MaximumScrollOffset+
                    " previousMaximum="+beforeResizeMaximum;
                Require(Math.Abs(f.Canvas.pixelRect.width-720)<.1f&&Math.Abs(f.Canvas.pixelRect.height-900)<.1f,
                    "resize reaches the actual camera Canvas"+bounds);
                // Text scaling may keep some overflow, and dividing equal
                // floating-point bounds can leave a tiny positive CSS range.
                // Prove contraction and the actual clamped position instead
                // of assuming the enlarged content has exactly zero overflow.
                Require(settings.MaximumScrollOffset<beforeResizeMaximum&&scroll.content.anchoredPosition.y>=0&&
                    scroll.content.anchoredPosition.y<=actualMaximum+.001f&&settings.ScrollOffset>=0&&
                    settings.ScrollOffset<=settings.MaximumScrollOffset+.001f,
                    "same-page viewport/content contraction clamps actual offset within the smaller range"+bounds);
                // Explicit numerical boundary fixture for the subpixel result
                // of ScrollRect transform arithmetic, not a player gesture.
                scroll.content.anchoredPosition=new Vector2(0,-.00003f);hud.Layout();
                Require(scroll.content.anchoredPosition.y==0&&settings.ScrollOffset==0,
                    "layout repairs a real negative subpixel offset instead of masking telemetry");
            }
            finally
            {
                camera.targetTexture=null;UnityEngine.Object.DestroyImmediate(texture);UnityEngine.Object.DestroyImmediate(enlarged);
            }
        }
    }

    static void PreferencesAppliedBeforeDeploy()
    {
        var values=LastStandPreferenceValues.Defaults.With(masterVolume:50,effectsVolume:30,musicVolume:10,
            muted:true,musicEnabled:false,reducedEffects:true,quality:LastStandQuality.Performance,
            tutorialTips:false,purchaseSuggestions:false,lastPositiveSpeed:.5);
        var f=new Fixture(values);var loop=f.Loop;
        Require(loop.Session.Model==null&&!loop.Audio.Unlocked&&loop.Muted&&!loop.Audio.MusicEnabled,
            "saved audio choices apply before a deployment or audio gesture");
        Require(!loop.Session.View.FullEffects&&loop.Display.RenderScale==.75f&&loop.Session.LastPositiveSpeed==.5,
            "saved display and speed preferences already reach their owners");
        Require(loop.Audio.GetComponents<AudioSource>().Length==5,"one music source and four retained effect sources");
        f.Click("Deploy");
        Require(loop.Session.SelectedSpeed==.5&&!loop.Audio.CanPlay&&loop.Guidance.Tutorial=="",
            "first deployment retains muted half speed and disabled tutorial");
    }

    static void SpeedAndIndependentPauseHolds()
    {
        var f=new Fixture(LastStandPreferenceValues.Defaults.With(lastPositiveSpeed:.5));var loop=f.Loop;
        f.Click("Deploy");loop.OpenMenu();
        Require(loop.Session.MenuPaused&&loop.Session.Paused&&!loop.Session.ManualPaused,"menu owns its separate pause hold");
        loop.CloseMenu();Require(!loop.Session.Paused&&loop.Session.SelectedSpeed==.5,"closing menu restores half speed");
        loop.TogglePause();Require(loop.Session.ManualPaused&&loop.Session.SelectedSpeed==0,"manual pause selects zero");
        loop.OpenMenu();loop.CloseMenu();
        Require(loop.Session.ManualPaused&&!loop.Session.MenuPaused&&loop.Session.Paused,"closing menu keeps prior manual pause");
        loop.ChangeSpeed(1);Require(!loop.Session.Paused&&loop.Session.SelectedSpeed==.5,"plus from zero selects half speed");
        loop.ChangeSpeed(-1);loop.TogglePause();
        Require(loop.Session.SelectedSpeed==.5&&loop.Preferences.Current.LastPositiveSpeed==.5,"Resume restores saved last positive rate");
        int before=loop.Session.Model.Tick;double at=f.Clock.LastTimestamp;
        loop.Session.AdvanceAt(at+.2);
        Require(loop.Session.Model.Tick==before+2,"half-speed clock admits two fixed ticks in 0.2 wall seconds");
        loop.Session.TogglePauseAt(at+.2);int paused=loop.Session.Model.Tick;
        loop.Session.AdvanceAt(at+100);
        Require(loop.Session.Model.Tick==paused&&loop.Session.Failure=="","manual pause excludes elapsed wall time");
        Require(loop.Session.TrySetMenuPausedAt(at+100,true)&&loop.Session.TrySetMenuPausedAt(at+101,false)&&loop.Session.ManualPaused,
            "actual session menu hold cannot remove manual hold");
    }

    static void ModalCoreInputAndCancelFocus()
    {
        var f=new Fixture();f.Click("Deploy");f.Click("Menu");
        var loop=f.Loop;var keyboard=f.Canvas.GetComponentInChildren<LastStandHudKeyboard>(true);
        Require(keyboard.TrapFocus&&loop.Session.MenuPaused,"modal owns focus and pause");
        foreach(string id in new[]{"Pause","ToggleMute","Effects","SpeedMinus","SpeedRate","SpeedPlus","ShopEntry","Menu"})
        {
            var button=f.Button(id);Require(!button.IsInteractable(),"underlying action disabled: "+id);
        }
        bool muted=loop.Muted;int run=loop.Progression.ActiveRunId;
        ExecuteEvents.Execute(f.Button("ToggleMute").gameObject,new PointerEventData(EventSystem.current) {
            button=PointerEventData.InputButton.Left },ExecuteEvents.pointerClickHandler);
        Require(loop.Muted==muted,"real disabled Button refuses pointer callback beneath modal");
        for(int i=0;i<32;i++)
        {
            keyboard.NavigateKeyboard("next");
            var selected=EventSystem.current.currentSelectedGameObject;
            Require(selected&&selected.transform.IsChildOf(f.Button("SettingsClose").transform.parent),"Tab remains inside modal");
        }
        f.Click("MenuAbandon");
        Require(loop.MenuPage=="confirm"&&EventSystem.current.currentSelectedGameObject==f.Button("ConfirmCancel").gameObject,
            "loss confirmation initially focuses Cancel");
        f.Click("ConfirmCancel");
        Require(loop.MenuPage=="menu"&&loop.Progression.ActiveRunId==run&&loop.Session.Model!=null,
            "Cancel preserves unfinished run");
        f.Click("SettingsClose");
        Require(!loop.MenuOpen&&!keyboard.TrapFocus&&EventSystem.current.currentSelectedGameObject==f.Button("Menu").gameObject,
            "explicit Close restores focus to the live menu control");
    }

    static void AbandonCancelAndConfirmWithoutAward()
    {
        foreach(bool launcher in new[]{false,true})
        {
            var f=new Fixture();if(launcher)f.Art.ToggleAttachment();f.Click("Deploy");
            int run=f.Loop.Progression.ActiveRunId,writes=f.Game.Writes;string save=f.Game.Value;
            f.Loop.RequestConfirmation("abandon");f.Click("ConfirmCancel");f.Loop.CloseMenu();
            Require(f.Loop.Progression.ActiveRunId==run&&f.Game.Value==save&&f.Game.Writes==writes,
                "cancelled abandon leaves fitting run and gameplay save unchanged");
            f.Loop.RequestConfirmation("abandon");f.Click("ConfirmProceed");
            Require(f.Loop.Progression.ActiveRunId==0&&f.Loop.Session.Model==null&&f.Loop.Phase=="garage"&&!f.Loop.MenuOpen,
                "confirmed abandon returns to garage without automatic redeploy");
            Require(f.Loop.Progression.Wallet==0&&f.Loop.Progression.PendingDefeat==null&&f.Game.Value==save&&f.Game.Writes==writes,
                "confirmed abandon does not manufacture a claim or reward/save");
        }
    }

    static void ResetDefaultsPreservesGameplayAndPause()
    {
        var f=new Fixture(LastStandPreferenceValues.Defaults.With(muted:true,musicEnabled:false,
            reducedEffects:true,quality:LastStandQuality.Performance,tutorialTips:false,lastPositiveSpeed:.5),Funded);
        Require(f.Loop.Phase=="workshop"&&!f.Button("Deploy").IsActive(),"funded save loads the workshop and its Redeploy action");
        f.Click("Redeploy");f.Loop.TogglePause();string gameplay=f.Game.Value;int writes=f.Game.Writes,run=f.Loop.Progression.ActiveRunId;
        f.Loop.RequestConfirmation("reset-settings");
        Require(EventSystem.current.currentSelectedGameObject==f.Button("ConfirmCancel").gameObject,"settings reset is Cancel-first");
        f.Click("ConfirmCancel");Require(f.Loop.Preferences.Current.Muted,"cancelled reset preserves preference choices");
        f.Loop.RequestConfirmation("reset-settings");f.Click("ConfirmProceed");
        Require(!f.Loop.Muted&&f.Loop.Preferences.Current.MusicEnabled&&f.Loop.Session.View.FullEffects&&
            f.Loop.Preferences.Current.LastPositiveSpeed==1,"confirmed reset reaches real preference owners");
        Require(f.Loop.Session.ManualPaused&&f.Loop.Session.MenuPaused&&f.Loop.Session.LastPositiveSpeed==.5,
            "reset keeps current run's rate and both pause holds");
        Require(f.Game.Value==gameplay&&f.Game.Writes==writes&&f.Loop.Progression.ActiveRunId==run&&f.Loop.Progression.Wallet==9,
            "settings-only reset never writes gameplay, wallet, or active run");
        f.Loop.CloseMenu();Require(f.Loop.Session.ManualPaused,"closing reset settings preserves manual pause");
    }

    static void FailedSaveRefusesNavigation()
    {
        var f=new Fixture();f.Click("Deploy");f.Game.DenyWrite=true;
        var model=f.Loop.Session.Model;
        for(int i=0;model.Status==EncounterStatus.Running&&i<3600;i++)model.Step();
        Require(model.Status==EncounterStatus.Defeated,"controlled terminal fixture actually defeats");
        Invoke(f.Loop,"OnSessionChanged");
        Require(f.Loop.Phase=="save-error"&&f.Loop.Progression.SaveState=="retry","actual terminal write is unconfirmed");
        string save=f.Game.Value;
        f.Loop.RequestNavigation(false);f.Loop.RequestNavigation(true);f.Loop.RequestConfirmation("abandon");
        Require(f.Loop.Confirmation==""&&f.Loop.Progression.SaveState=="retry"&&f.Game.Value==save,
            "return/account/abandon gates preserve unconfirmed terminal data");
        f.Loop.OpenMenu();Require(!f.Button("MenuCampaigns").IsInteractable()&&!f.Button("MenuAbandon").IsInteractable(),
            "actual menu disables routes that could lose the pending save");
        f.Click("MenuSettings");f.Click("SettingsTab3");
        Require(!f.Button("DataAccount").IsInteractable()&&f.Button("DataRetry").IsInteractable(),
            "Save & Account exposes recovery and refuses account departure");
        f.Game.DenyWrite=false;f.Click("DataRetry");
        Require(f.Loop.Progression.SaveState=="ready"&&f.Loop.Progression.PendingDefeat!=null&&f.Loop.Progression.Wallet==0,
            "Retry commits the pending result without automatic Claim");
    }

    static void DisplayOwnsRuntimePipelineClone()
    {
        var f=new Fixture();var pipeline=QualitySettings.renderPipeline as UniversalRenderPipelineAsset;
        Require(pipeline&&pipeline!=f.SourcePipeline&&pipeline==GraphicsSettings.currentRenderPipeline,
            "display owns a real runtime pipeline clone");
        f.Click("Deploy");string snapshot=f.Loop.Session.Model.Snapshot();
        f.Loop.SetPreferences(f.Loop.Preferences.Current.With(quality:LastStandQuality.Performance));
        Require(pipeline.renderScale==.75f&&f.SourcePipeline.renderScale==f.SourceScale,"Performance changes clone to 75 percent only");
        f.Loop.SetPreferences(f.Loop.Preferences.Current.With(reducedEffects:true));
        Require(!f.Loop.Session.View.FullEffects&&pipeline.renderScale==.75f&&f.Loop.Session.Model.Snapshot()==snapshot,
            "effects and render quality are independent and preserve combat state");
        f.Loop.SetPreferences(f.Loop.Preferences.Current.With(quality:LastStandQuality.Current));
        Require(pipeline.renderScale==f.SourceScale&&f.SourcePipeline.renderScale==f.SourceScale,"Current restores authored scale without asset mutation");
        Require((RenderPipelineAsset)Get(f.Loop.Display,"previous")==f.SourcePipeline,"display captured the actual previous scene pipeline");
        // Like the existing background lifecycle suite, deliver the real
        // callback explicitly: edit-mode batch loading does not dispatch the
        // player's OnDestroy lifecycle for these manually started components.
        Invoke(f.Loop.Display,"OnDestroy");
        UnityEngine.Object.DestroyImmediate(f.Loop.Display);
        Require(QualitySettings.renderPipeline==f.SourcePipeline,"destroyed display owner restores previous scene pipeline");
    }

    static void GuidanceOptoutAndAudioSampleAdmission()
    {
        var f=new Fixture(gameplay:Funded);f.Loop.Purchase();
        Require(f.Loop.Progression.CannonAttackLevel==1&&f.Loop.Guidance.Suggestion!="","confirmed real purchase can suggest trying the upgrade");
        string save=f.Game.Value;int writes=f.Game.Writes;
        f.Loop.SetPreferences(f.Loop.Preferences.Current.With(purchaseSuggestions:false));
        Require(f.Loop.Guidance.Suggestion==""&&f.Game.Value==save&&f.Game.Writes==writes,"opt-out dismisses suggestion without gameplay mutation");
        f.Loop.SetPreferences(f.Loop.Preferences.Current.With(purchaseSuggestions:true));
        Require(f.Loop.Guidance.Suggestion=="","enabling suggestions does not replay an old purchase prompt");
        f=new Fixture();f.Click("Deploy");Require(f.Loop.Guidance.Tutorial!="","real first deployment has optional tutorial");
        f.Loop.OpenMenu("settings");f.Click("SettingsTab2");f.Click("TutorialTips");
        Require(f.Loop.Guidance.Tutorial==""&&!LastStandPreferences.Load(f.Preferences).Current.TutorialTips,
            "actual toggle dismisses and persists tutorial opt-out");
        f.Click("GameplayHelp");Require(f.Loop.MenuPage=="help"&&f.Canvas.GetComponentsInChildren<Text>(true).Any(t=>t.text==LastStandGuidance.Help),
            "explicit Help remains available with tutorial disabled");
        f.Loop.OpenMenu("settings");f.Click("SettingsTab0");
        var events=new List<string>();Application.LogCallback capture=(message,trace,kind)=>{if(message.StartsWith("ST_LS_AUDIO event=",StringComparison.Ordinal))events.Add(message);};
        Application.logMessageReceived+=capture;
        try
        {
            f.Click("EffectsSample");Require(events.SequenceEqual(new[]{"ST_LS_AUDIO event=preview"})&&f.Loop.Session.MenuPaused&&f.Loop.Audio.Suspended,
                "real sample button admits exactly one cue while preserving menu pause");
            f.Click("SettingsMute");f.Click("EffectsSample");Require(events.Count==1,"muted sample produces no cue admission");
            f.Click("SettingsMute");Invoke(f.Loop.Audio,"OnApplicationFocus",false);f.Click("EffectsSample");
            Require(events.Count==1,"background sample produces no cue admission");
        }
        finally { Application.logMessageReceived-=capture; }
    }
}

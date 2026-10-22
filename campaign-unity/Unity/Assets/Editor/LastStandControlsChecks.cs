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

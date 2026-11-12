using System;
using System.Collections.Generic;
using System.Linq;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.UI;
using SingedTerra.LastStand;
using SingedTerra.Encounter;

public static class LastStandArmoryChecks
{
    static void Need(bool value,string message){if(!value)throw new InvalidOperationException("Armory UI: "+message);}
    static void Case(string name,Action run){run();Debug.Log("ST_LS_ARMORY_PASS "+name);}
    static object Codec(string method,object value)=>typeof(LastStandProgression).Assembly.GetType("SingedTerra.LastStand.LastStandSaveJson")
        .GetMethod(method,System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.Public|System.Reflection.BindingFlags.NonPublic)
        .Invoke(null,new[]{value});
    static object ProfileData(string method,object value)=>typeof(LastStandProgression)
        .GetMethod(method,System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).Invoke(null,new[]{value});
    // A gifted local UI fixture, not evidence of earned progression or native input.
    static string UnlockedSave()
    {
        var store=new LastStandAppearanceChecks.Storage();LastStandProgression.Load(store);
        var data=(Dictionary<string,object>)Codec("Read",store.Value);var tiers=(Dictionary<string,object>)data["tierRecords"];
        ((Dictionary<string,object>)tiers["tier-1"])["bestWave"]=750;
        ((Dictionary<string,object>)tiers["tier-2"])["unlocked"]=true;
        var clears=new List<object>();
        foreach(var milestone in LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)))if(milestone.Wave<=750)clears.Add(milestone.Id);
        data["firstClears"]=clears;data["unlockedFittings"]=new List<object>{"repair","launcher","scattergun","mortar"};
        return (string)Codec("Write",data);
    }
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var transport=LastStandLoopController.BackupTransportFactory;var pipeline=QualitySettings.renderPipeline;bool background=Application.runInBackground;
        try
        {
            Case("locked_bay_preview_cancel_and_saved_bytes",LockedBay);
            Case("two_bays_named_presets_atomic_apply_and_resume",TwoBays);
            Case("paid_effect_preview_matches_combat_without_changing_retained_run",EffectSummaries);
            Case("unconfirmed_save_and_stale_draft_refuse",SaveFailure);
            Case("responsive_controls_name_focus_and_scroll",Responsive);
            Case("compact_callouts_require_complete_labels_and_clear_panel_edges",CompactCallouts);
        }
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;LastStandLoopController.BackupTransportFactory=transport;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
    static void LockedBay()
    {
        using(var f=new LastStandAppearanceChecks.Fixture())
        {
            string raw=f.Game.Value;f.Click("ArmoryEntry");Need(f.Loop.MenuPage=="armory","garage opens Armory");
            Need(!f.Button("ArmoryBay2Next").IsInteractable(),"Bay2 has an earned gate");
            Need(f.Canvas.GetComponentsInChildren<Text>().Any(t=>t.text.Contains("Tier 1 wave 750")),"locked reason is visible");
            f.Click("ArmoryBay1Next");Need(f.Loop.ArmoryDraft.PrimaryId=="launcher","first bay preview");
            Need(f.Art.launcherModule.activeSelf&&f.Game.Value==raw,"actual model changes without save");
            f.Click("ArmoryBay1Next");Need(!f.Button("ArmoryApply").IsInteractable(),"locked fitting can't apply");
            f.Click("ArmoryCancel");Need(f.Game.Value==raw&&f.Art.FittingId=="repair","Cancel restores saved model and bytes");
        }
    }
    static void TwoBays()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(UnlockedSave()))
        {
            Need(f.Loop.Progression.EquipmentBayCount==2,"gift fixture unlocked second bay");
            f.Click("ArmoryEntry");f.Click("ArmoryBay2Next");
            Need(f.Loop.ArmoryDraft.SecondaryId=="launcher","same fitting skipped, distinct second bay");
            Need(f.Art.repairModule.activeSelf&&f.Art.launcherModule.activeSelf,"both real attachments shown");
            var input=f.Canvas.GetComponentsInChildren<InputField>(true).Single(i=>i.name=="ArmoryName");
            input.text="  Sustain + blast  ";f.Click("ArmoryApply");
            Need(f.Loop.Progression.SelectedLoadout.SecondaryId=="launcher"&&f.Loop.Progression.LoadoutPresets[0].Name=="Sustain + blast","atomic named build saved");
            var loaded=LastStandProgression.Load(f.Game);Need(loaded.SelectedLoadout.Equals(f.Loop.ArmoryDraft),"build reloads");
            f.Click("ArmoryCancel");Need(f.Loop.Progression.TryDeploy(),"reserved checkpoint");var checkpoint=f.Loop.Progression.Checkpoint;
            f.Loop.OpenArmory();f.Loop.MoveArmoryPreset(1);f.Loop.MoveArmoryFitting(0,1);f.Loop.ApplyArmory();
            Need(f.Loop.Progression.Checkpoint.Loadout.Equals(checkpoint.Loadout),"next build preparation keeps checkpoint");
            Need(!f.Loop.Progression.SelectedLoadout.Equals(checkpoint.Loadout),"next deployment build changes");
            f.Loop.CancelArmory();Need(f.Art.Loadout.Equals(checkpoint.Loadout),"Resume preview still shows checkpoint build");
        }
    }
    static void SaveFailure()
    {
        using(var f=new LastStandAppearanceChecks.Fixture())
        {
            f.Click("ArmoryEntry");f.Click("ArmoryBay1Next");string raw=f.Game.Value;
            var input=f.Canvas.GetComponentsInChildren<InputField>(true).Single(i=>i.name=="ArmoryName");
            input.text="";f.Click("ArmoryRotateRight");
            Need(input.text==""&&!f.Loop.ArmoryCanApply&&f.Loop.ArmoryStatus.Contains("Enter a name"),"invalid name remains visible after blur and refresh");
            input.text="Test build";
            f.Game.DenyWrite=true;f.Click("ArmoryApply");Need(f.Game.Value==raw&&!f.Loop.ArmoryCanApply,"unconfirmed write stops another apply");
            f.Game.DenyWrite=false;f.Loop.RetrySave();Need(f.Loop.Progression.SaveState=="ready","owned save recovery");
            f.Loop.CancelArmory();f.Loop.OpenArmory();
            Need(f.Loop.Progression.TryApplyLoadout(new LastStandLoadout(f.Loop.ArmoryDraft.PrimaryId=="repair"?"launcher":"repair")),"external saved build change");f.Loop.RefreshControls();
            Need(!f.Loop.ArmoryCanPreview&&!f.Loop.ArmoryCanApply,"stale editor refuses overwrite");
        }
    }
    static void EffectSummaries()
    {
        // Gifted Workshop strength plus paid research transitions with synthetic
        // elapsed time are a UI fixture, not earned progression or timer proof.
        var data=(Dictionary<string,object>)Codec("Read",UnlockedSave());
        var levels=(Dictionary<string,object>)data["permanentLevels"];
        levels["arcOutput"]=2;levels["shieldCapacity"]=3;
        var research=LastStandResearchState.Create(1790000000000L);long wallet=10000000;
        foreach(var track in new[]{LastStandResearchTrackId.AreaControl,LastStandResearchTrackId.FieldEngineering})
            for(int rank=0;rank<10;rank++){
                var intent=LastStandResearchPresentation.Intent(research.Snapshot(),0,track,LastStandResearchAction.Start);
                Need(research.TryApply(intent,wallet,750,0,out var started),"funded research fixture starts");
                wallet+=started.WalletDelta;research=started.State;
                long duration=research.Snapshot().slots[0].active.durationMilliseconds;
                Need(research.TryAdvance(duration,research.Snapshot().lastObservedUtcMilliseconds+duration,false,out var done),"research fixture completes");
                research=done.State;
            }
        data["research"]=ProfileData("ResearchJson",research);
        var checkpoint=LastStandRunCheckpoint.Start(1,1,"repair",new int[10],LastStandRunEdition.CombatDepth);
        var history=new LastStandRunHistory();history.Begin(1,1,"repair",checkpoint.Edition.EconomyVersion,"retained fixture");
        data["checkpoint"]=ProfileData("CheckpointJson",checkpoint);data["nextRunId"]=2;data["history"]=ProfileData("HistoryJson",history);
        using(var f=new LastStandAppearanceChecks.Fixture((string)Codec("Write",data)))
        {
            Need(f.Loop.Progression.SaveState=="ready"&&f.Loop.Progression.Checkpoint.Edition==LastStandRunEdition.CombatDepth,"retained checkpoint fixture admitted");
            var captured=f.Loop.Progression.Checkpoint;string before=captured.RestoreModel().Snapshot();
            f.Click("Menu");f.Click("MenuArmory");string raw=f.Game.Value;
            Action<int,string,int> select=(bay,id,direction)=>{
                for(int n=0;n<8&&(bay==0?f.Loop.ArmoryDraft.PrimaryId:f.Loop.ArmoryDraft.SecondaryId)!=id;n++)f.Loop.MoveArmoryFitting(bay,direction);
                Need((bay==0?f.Loop.ArmoryDraft.PrimaryId:f.Loop.ArmoryDraft.SecondaryId)==id,"preview selection "+id);
            };
            Action verify=()=>{
                var draft=f.Loop.ArmoryDraft;var permanent=new int[LastStandUpgradeCatalog.Tracks.Count];
                foreach(var track in LastStandUpgradeCatalog.Tracks)permanent[(int)track.Id]=f.Loop.Progression.GetPermanentLevel(track.Id);
                var shop=new LastStandShopState(2,draft.Primary,permanent,LastStandUpgradeCatalog.EconomyVersion,LastStandRunEdition.Current,1,draft,f.Loop.Progression.CompletedCombatResearch);
                var model=EncounterModel.CreatePlayable(draft.Primary,1,shop);
                int arc=draft.PrimaryId=="arc"?0:1,shield=1-arc;
                Need(f.Loop.ArmoryBayDescription(arc).Contains(model.CurrentArcDamage+" damage"),"Armory Arc preview must show its paid damage and completed Area Control");
                Need(f.Loop.ArmoryBayDescription(shield).Contains(model.CurrentShieldCapacity+" shield; recovers "+model.ShieldRecoveryAmount),"Armory shield preview must match capacity and researched recovery");
                Need(f.Loop.ArmoryBayDescription(arc).Contains("LOCKED")&&!f.Loop.ArmoryCanApply,"locked effects are visible without admitting Apply");
                Need(f.Game.Value==raw&&f.Loop.Progression.SelectedFitting=="repair"&&captured.RestoreModel().Snapshot()==before,"effect inspection preserves save, selection and retained checkpoint");
            };
            select(0,"arc",1);select(1,"shield",1);verify();
            select(0,"repair",-1);select(1,"arc",-1);select(0,"shield",1);verify();
        }
    }
    static void CompactCallouts()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(UnlockedSave()))
        {
            f.Click("ArmoryEntry");f.Click("ArmoryBay2Next");f.Resize(390,844);
            var pane=f.Canvas.GetComponentsInChildren<ScrollRect>().Single(p=>p.name=="ArmoryViewport");
            var label=f.Canvas.GetComponentsInChildren<Text>().Single(t=>t.name=="ArmoryBay1Name");
            var panel=f.Canvas.GetComponentsInChildren<RectTransform>().Single(r=>r.name=="ArmoryPanel");
            var lines=f.Canvas.GetComponentsInChildren<LastStandFittingCallout>().Where(c=>c.gameObject.name=="ArmoryModal").ToArray();
            Need(lines.Length==2,"two actual Armory callout owners");
            Action<float> placeCenter=screenY=>{
                float pixelsPerUnit=f.Bounds(pane.content).height/pane.content.rect.height;
                pane.content.anchoredPosition+=Vector2.up*((screenY-f.Bounds(label).center.y)/pixelsPerUnit);
                Canvas.ForceUpdateCanvases();lines[0].RefreshGroup();
            };
            var clip=f.Bounds(pane.viewport);float labelHeight=f.Bounds(label).height;
            // The center remains inside the viewport, while the upper quarter of
            // the actual label is clipped beneath the fixed Armory header.
            placeCenter(clip.yMax-labelHeight*.25f);
            Need(clip.Contains(f.Bounds(label).center)&&f.Bounds(label).yMax>clip.yMax+1,"partially clipped label fixture");
            Need(!lines[0].Visible,"partially clipped bay label must not retain a tank callout");
            placeCenter(clip.yMax-labelHeight*.5f-18);
            Debug.Log("ST_ARMORY_ROUTE_DIAGNOSTIC viewport="+f.Canvas.pixelRect+" panel="+f.Bounds(panel)+" label="+f.Bounds(label)+
                " clip="+clip+" target="+lines[0].EndpointScreen+" ratio="+lines[0].PixelRatio+" rotate="+f.Bounds(f.Button("ArmoryRotateLeft"))+" / "+f.Bounds(f.Button("ArmoryRotateRight")));
            Need(lines[0].Visible,"fully visible bay label retains a useful compact leader");
            var boundary=f.Bounds(panel);var route=lines[0].RoutePoints;
            Need(route.Count>=2&&Vector2.Distance(route[route.Count-1],lines[0].EndpointScreen)<.1f,"compact route ends on the actual fitting");
            Need(Mathf.Min(Mathf.Abs(route[0].x-boundary.xMin),Mathf.Abs(route[0].x-boundary.xMax))<1&&
                Mathf.Abs(route[0].y-f.Bounds(label).center.y)<1,"compact leader attaches to the panel side at its visible label");
            var interior=Rect.MinMaxRect(boundary.xMin+.2f,boundary.yMin+.2f,boundary.xMax-.2f,boundary.yMax-.2f);
            for(int i=1;i<route.Count;i++)for(int sample=0;sample<=40;sample++)
                Need(!interior.Contains(Vector2.Lerp(route[i-1],route[i],sample/40f)),"compact leader must not cross the panel or sticky header");
            placeCenter(clip.yMax+labelHeight);
            Need(!lines[0].Visible,"offscreen bay label hides decoration immediately after scrolling");
            f.Resize(1600,900);lines[0].RefreshGroup();
            Need(lines.All(c=>c.Visible),"desktop service-card leaders remain visible after compact scrolling");
        }
    }
    static void Responsive()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(UnlockedSave()))
        {
            f.Click("ArmoryEntry");
            foreach(var size in new[]{new Vector2Int(1280,720),new Vector2Int(390,844),new Vector2Int(844,390),new Vector2Int(568,180),new Vector2Int(280,142)})
            {
                f.Resize(size.x,size.y);var pane=f.Canvas.GetComponentsInChildren<ScrollRect>().Single(p=>p.name=="ArmoryViewport");
                foreach(var button in f.Canvas.GetComponentsInChildren<Button>().Where(b=>b.name.StartsWith("Armory",StringComparison.Ordinal)))
                    Need(f.Bounds(button).height>=43.8f&&f.Bounds(button).width>=43.8f,"44px target "+button.name);
                f.Keyboard.NavigateKeyboard("enter-first");bool nameSeen=false;
                for(int n=0;n<24;n++)
                {
                    var selected=EventSystem.current.currentSelectedGameObject;Need(selected&&selected.name.StartsWith("Armory",StringComparison.Ordinal),"focus remains in Armory");
                    if(selected.name=="ArmoryName"){nameSeen=true;Need(pane.content.anchoredPosition.y>=0,"name reveals within bounded scroll");}
                    f.Keyboard.NavigateKeyboard("next");
                }
                Need(nameSeen,"keyboard reaches the text field");f.Keyboard.NavigateKeyboard("scroll-end");
                Need(pane.content.anchoredPosition.y>=0,"scroll is bounded");
                f.Keyboard.NavigateKeyboard("scroll-start");
            }
        }
    }
}

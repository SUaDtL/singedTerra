using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using SingedTerra.LastStand;

// Imported controls and measured layout only. Gifted isolated profiles here do
// not establish earned progression, rendered art acceptance or native input.
public static class LastStandSkillsChecks
{
    static void Need(bool value,string message){if(!value)throw new InvalidOperationException("Skills UI: "+message);}
    static void Case(string name,Action run){run();Debug.Log("ST_LS_SKILLS_UI_PASS "+name);}
    static object Codec(string method,object value)=>typeof(LastStandProgression).Assembly.GetType("SingedTerra.LastStand.LastStandSaveJson")
        .GetMethod(method,BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic).Invoke(null,new[]{value});
    internal static string Profile(int best=500,int copies=1,int intel=3)
    {
        var store=new LastStandAppearanceChecks.Storage();LastStandProgression.Load(store);
        var data=(Dictionary<string,object>)Codec("Read",store.Value);
        var tiers=(Dictionary<string,object>)data["tierRecords"];
        ((Dictionary<string,object>)tiers["tier-1"])["bestWave"]=best;
        ((Dictionary<string,object>)tiers["tier-2"])["unlocked"]=best>=LastStandTierCatalog.Get(2).RequiredWave;
        data["firstClears"]=LastStandRewardCatalog.Milestones(LastStandTierCatalog.Get(1)).Where(m=>m.Wave<=best).Select(m=>(object)m.Id).ToList();
        data["unlockedFittings"]=LastStandFittingCatalog.Definitions.Where(f=>f.Playable&&(f.InitiallyUnlocked||f.UnlockTier==1&&best>=f.UnlockWave)).Select(f=>(object)f.Id).ToList();
        var skills=(Dictionary<string,object>)data["skills"];
        skills["intel"]=intel;skills["copies"]=LastStandSkillCatalog.All.Select(s=>(object)(best>=s.UnlockWave?copies:0)).ToList();
        string raw=(string)Codec("Write",data);
        var verification=LastStandProgression.Load(new LastStandAppearanceChecks.Storage{Value=raw});
        Need(verification.SaveState=="ready","gifted UI profile satisfies the production save reader");return raw;
    }
    static Text Label(LastStandAppearanceChecks.Fixture f,string name)=>f.Canvas.GetComponentsInChildren<Text>(true).Single(t=>t.name==name);
    static int Total(LastStandProgression p)=>LastStandSkillCatalog.All.Sum(s=>p.SkillCopies(s.Id));
    static bool Contains(Rect outer,Rect inner)=>inner.xMin>=outer.xMin-1&&inner.xMax<=outer.xMax+1&&inner.yMin>=outer.yMin-1&&inner.yMax<=outer.yMax+1;
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var backup=LastStandLoopController.BackupTransportFactory;var pipeline=QualitySettings.renderPipeline;bool background=Application.runInBackground;
        try
        {
            Case("locked_and_complete_pool_refuse_spending",LockedAndComplete);
            Case("draw_equip_apply_cancel_and_failed_save_retry",Collection);
            Case("named_builds_capture_skills_and_cancel_navigation_draft",Builds);
            Case("help_preserves_garage_only_collection_boundary",HelpBoundary);
            Case("responsive_cards_controls_and_focus",Responsive);
            Case("prepared_build_deploys_and_admits_skills_across_resume",DeployAndResume);
            Case("combat_controls_reenable_after_reconciliation",ReconciledControls);
        }
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;LastStandLoopController.BackupTransportFactory=backup;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
    static void LockedAndComplete()
    {
        using(var f=new LastStandAppearanceChecks.Fixture())
        {
            f.Click("Menu");f.Click("MenuSkills");string saved=f.Game.Value;
            Need(f.Loop.MenuPage=="skills"&&!f.Button("SkillsDraw").interactable,"fresh collection is inspectable but draw locked");
            Need(Label(f,"SkillsSelection").text.Contains("0 / 0")&&Label(f,"SkillsPool").text.Contains("wave 25"),"first capacity and draw milestone explained");
            foreach(var skill in LastStandSkillCatalog.All)Need(!f.Button("Skill"+skill.Id+"Equip").interactable,"unowned skill cannot equip");
            f.Loop.DrawSkill();Need(f.Game.Value==saved,"locked draw did not mutate save");
            f.Click("SkillsClose");Need(!f.Loop.MenuOpen,"Skills closes through modal owner");
        }
        using(var f=new LastStandAppearanceChecks.Fixture(Profile(copies:6)))
        {
            f.Loop.OpenSkills();string saved=f.Game.Value;
            Need(!f.Button("SkillsDraw").interactable&&Label(f,"SkillsPool").text.Contains("No Intel will be spent"),"complete pool disables draw with explanation");
            f.Loop.DrawSkill();Need(f.Game.Value==saved&&f.Loop.Progression.SkillIntel==3,"complete pool does not spend");
        }
    }
    static void Collection()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
        {
            var p=f.Loop.Progression;f.Loop.OpenSkills();string initial=f.Game.Value;
            f.Click("SkillOverdriveEquip");Need(f.Loop.SkillDraft.Contains(LastStandSkillId.Overdrive)&&p.SelectedSkills.Count==0,"selection is staged");
            f.Click("SkillsCancel");Need(f.Game.Value==initial&&p.SelectedSkills.Count==0,"cancel preserves saved build");
            f.Loop.OpenSkills();f.Click("SkillOverdriveEquip");f.Click("SkillsApply");
            Need(p.SelectedSkills.Contains(LastStandSkillId.Overdrive)&&!f.Button("SkillsApply").interactable,"apply commits selection");
            int before=Total(p),intel=p.SkillIntel;f.Click("SkillsDraw");
            Need(Total(p)==before+1&&p.SkillIntel==intel-1&&p.LastSkillDraw!=null,"actual draw spends and grants exactly once");
            Need(Label(f,"SkillsStatus").text.Contains("Saved."),"confirmed draw receipt is visible");
            before=Total(p);intel=p.SkillIntel;f.Game.DenyWrite=true;f.Click("SkillsDraw");
            Need(p.SaveState!="ready"&&p.SkillIntel==intel&&Total(p)==before,"failed draw does not publish progress");
            Need(!f.Button("SkillsDraw").interactable&&f.Button("SkillsRetrySave").IsActive(),"pending save disables spending and exposes recovery");
            f.Game.DenyWrite=false;f.Click("SkillsRetrySave");
            Need(p.SaveState=="ready"&&p.SkillIntel==intel-1&&Total(p)==before+1,"retry commits one draw");
            Need(p.SelectedSkills.Contains(LastStandSkillId.Overdrive)&&Label(f,"SkillsStatus").text.Contains("Saved."),"retry keeps equipped skills and refreshes receipt");
        }
    }
    static void Builds()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(Profile(best:750)))
        {
            var p=f.Loop.Progression;var fitting=p.SelectedLoadout;
            var attack=new LastStandSkillLoadout(LastStandSkillId.Overdrive);
            var guard=new LastStandSkillLoadout(LastStandSkillId.ReinforcedHull);
            Need(p.TryApplyLoadoutPreset(1,"Guard",fitting,guard,p.Revision),"guard build fixture saves");
            Need(p.TryApplyLoadoutPreset(0,"Assault",fitting,attack,p.Revision),"attack build fixture saves");
            f.Loop.RefreshControls();f.Click("ArmoryEntry");
            f.Resize(1024,768);
            Need(!f.Bounds(Label(f,"ArmoryHeading")).Overlaps(f.Bounds(f.Button("ArmorySkills"))),"Armory heading and Skills navigation do not overlap at bay threshold");
            var secondaryArt=f.Canvas.GetComponentsInChildren<RawImage>(true).Single(i=>i.name=="ArmoryBay2Art");
            Need(!f.Loop.ArmoryDraft.Secondary.HasValue&&!secondaryArt.gameObject.activeInHierarchy,"empty Armory bay does not borrow another fitting illustration");
            f.Click("ArmoryBay2Next");Need(f.Loop.ArmoryDraft.Secondary.HasValue&&secondaryArt.gameObject.activeInHierarchy,"equipping a secondary fitting reveals its illustration");
            f.Click("ArmoryBay2Previous");f.Resize(1600,900);
            Need(!f.Loop.ArmoryDraft.Secondary.HasValue&&!secondaryArt.gameObject.activeInHierarchy,"removing a fitting and resizing keeps the empty bay illustration hidden");
            Need(f.Loop.ArmorySkillDraft.Equals(attack),"Armory begins with full selected build");
            f.Click("ArmoryPresetNext");
            Need(f.Loop.ArmorySkillDraft.Equals(guard)&&p.SelectedSkills.Equals(attack),"preset previews skills without applying");
            Need(Label(f,"ArmorySkillsSummary").text.Contains("Reinforced Hull"),"preview summary names preset skills");
            f.Click("ArmoryApply");Need(p.SelectedSkills.Equals(guard)&&p.LoadoutPresets[1].Skills.Equals(guard),"Apply commits preset skills and fittings");
            f.Click("ArmoryPresetPrevious");Need(f.Loop.ArmorySkillDraft.Equals(attack),"alternate preset preview");
            f.Click("ArmorySkills");Need(f.Loop.MenuPage=="skills"&&f.Loop.SkillDraft.Equals(guard),"Skills navigation discards unapplied Armory preset only");
            Need(f.Loop.SkillsStatus.Contains("draft cancelled")&&p.LoadoutPresets[0].Skills.Equals(attack),"discard explained and saved presets preserved");
            f.Click("SkillBallisticsEquip");f.Click("SkillsArmory");
            Need(f.Loop.MenuPage=="armory"&&p.SelectedSkills.Equals(guard)&&f.Loop.ArmorySkillDraft.Equals(guard),"returning to Armory cancels unsaved Skills draft");
        }
    }
    static void Responsive()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
        {
            f.Loop.OpenSkills();
            foreach(var size in new[]{new Vector2Int(1920,1080),new Vector2Int(1280,720),new Vector2Int(1024,768),new Vector2Int(390,844),new Vector2Int(844,390),new Vector2Int(568,180),new Vector2Int(280,142)})
            {
                f.Resize(size.x,size.y);var pane=f.Canvas.GetComponentsInChildren<ScrollRect>().Single(s=>s.name=="SkillsViewport");
                foreach(var button in f.Canvas.GetComponentsInChildren<Button>().Where(b=>b.name.StartsWith("Skill",StringComparison.Ordinal)))
                {
                    var bounds=f.Bounds(button);Need(bounds.width>=43.8f&&bounds.height>=43.8f,"44px target "+button.name+" at "+size);
                    Need(button.GetComponentInChildren<Text>().preferredHeight<=((RectTransform)button.GetComponentInChildren<Text>().transform).rect.height+1,"button label fits "+button.name+" at "+size);
                    if(button.IsInteractable()&&button.transform.IsChildOf(pane.content))
                    {f.Keyboard.Focus(button);f.Keyboard.Selected(button);Canvas.ForceUpdateCanvases();Need(Contains(f.Bounds(pane.viewport),f.Bounds(button)),"focused action revealed "+button.name+" at "+size);}
                }
                foreach(var text in f.Canvas.GetComponentsInChildren<Text>().Where(t=>t.name.StartsWith("Skill",StringComparison.Ordinal)&&!t.name.EndsWith("Text",StringComparison.Ordinal)))
                    Need(text.preferredHeight<=text.rectTransform.rect.height+1,"measured text fits "+text.name+" at "+size);
                var cards=f.Canvas.GetComponentsInChildren<RectTransform>().Where(t=>t.name.StartsWith("Skill",StringComparison.Ordinal)&&t.name.EndsWith("Card",StringComparison.Ordinal)).ToArray();
                Need(cards.Length==6,"all six cards visible in collection");
                for(int a=0;a<cards.Length;a++)for(int b=a+1;b<cards.Length;b++)Need(!f.Bounds(cards[a]).Overlaps(f.Bounds(cards[b])),"cards do not overlap");
                f.Keyboard.NavigateKeyboard("enter-first");
                for(int n=0;n<18;n++){Need(EventSystem.current.currentSelectedGameObject.name.StartsWith("Skill",StringComparison.Ordinal),"focus trapped in Skills");f.Keyboard.NavigateKeyboard("next");}
                f.Keyboard.NavigateKeyboard("scroll-start");Need(pane.content.anchoredPosition.y>=0,"bounded scroll position");
            }
        }
    }
    static void HelpBoundary()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
        {
            f.Click("Deploy");f.Click("Menu");f.Click("MenuHelp");
            int index=0;while(index<LastStandGuidance.HelpTopics.Count&&LastStandGuidance.HelpTopics[index].Id!="skills")index++;
            Need(index<LastStandGuidance.HelpTopics.Count,"Skills help topic exists");
            for(int i=0;i<index;i++)f.Click("HelpNext");
            Need(!f.Button("HelpAction").interactable&&Label(f,"SettingsDetail").text.Contains("from the garage"),"combat help explains unavailable collection navigation");
            Need(f.Loop.MenuPage=="help"&&f.Loop.Session.Model!=null,"help preserves paused active run");
        }
    }
    static string SkillLabel(LastStandAppearanceChecks.Fixture f,int slot)=>f.Button(LastStandSkillHudLayout.Prefix+slot).GetComponentInChildren<Text>(true).text;
    static void ReconciledControls()
    {
        using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
        {
            f.Loop.OpenSkills();f.Click("SkillOverdriveEquip");f.Click("SkillMinefieldEquip");
            f.Click("SkillsApply");f.Click("SkillsCancel");ClickDeploy(f);
            var session=f.Loop.Session;var model=session.Model;
            double now=Time.realtimeSinceStartupAsDouble;
            int steps=0;bool admittedDuringSteps=false;
            session.Stepped+=_=>{steps++;admittedDuringSteps|=session.CanActivateSkill(LastStandSkillId.Overdrive);};
            now+=.2;session.AdvanceAt(now);
            Need(steps>=2&&!admittedDuringSteps,"multi-step reconciliation keeps live skill input gated until its last step");
            Need(!session.CatchingUp&&session.CanActivateSkill(LastStandSkillId.Overdrive),"finished callback admits an unused active");
            Need(f.Button("CombatSkill0").interactable&&f.Button("CombatSkill1").interactable,"finished callback refreshes clickable active controls");
            now+=10;session.AdvanceAt(now);
            Need(session.CatchingUp&&!f.Button("CombatSkill0").interactable,"retained simulation debt keeps active controls unavailable");
            session.AdvanceAt(now);
            Need(!session.CatchingUp&&f.Button("CombatSkill0").interactable,"last debt-draining callback reenables active controls");
            session.TogglePauseAt(now);
            Need(session.Paused&&!f.Button("CombatSkill0").interactable,"manual pause still disables active controls");
            session.TogglePauseAt(now);
            Need(f.Button("CombatSkill0").interactable&&session.TryActivateSkillAt(now,LastStandSkillId.Overdrive),"resumed callback accepts the captured active exactly once");
            Need(model.SkillUsed(LastStandSkillId.Overdrive)&&!f.Button("CombatSkill0").interactable,"spent active remains disabled after accepted input");
        }
    }
    static void ClickDeploy(LastStandAppearanceChecks.Fixture f)
    {
        Need(f.Loop.Phase=="garage"||f.Loop.Phase=="workshop","deployment starts from a preparation phase");
        f.Click(f.Loop.Phase=="workshop"?"Redeploy":"Deploy");
    }
    static void DeployAndResume()
    {
        string checkpoint=null;
        var cues=new List<string>();Application.LogCallback capture=(message,stack,type)=>{if(message.StartsWith("ST_LS_AUDIO event=skill-",StringComparison.Ordinal))cues.Add(message);};
        Application.logMessageReceived+=capture;
        try
        {
            using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
            {
                f.Click("Menu");f.Click("MenuSkills");
                foreach(var id in new[]{LastStandSkillId.Overdrive,LastStandSkillId.Minefield,LastStandSkillId.ReinforcedHull})f.Click("Skill"+id+"Equip");
                f.Click("SkillsApply");f.Click("SkillsArmory");
                Need(f.Loop.ArmorySkillDraft.Count==3,"Armory previews the three saved shared slots");
                f.Loop.RenameArmoryPreset("Mixed skills");f.Click("ArmoryApply");f.Click("ArmoryCancel");ClickDeploy(f);
                var model=f.Loop.Session.Model;
                Need(f.Loop.Phase=="battle"&&model!=null&&model.Skills.Loadout.Count==3,"prepared complete build deploys through actual controls");
                Need(f.Button("CombatSkill0").IsActive()&&SkillLabel(f,0).Contains("BOOST")&&SkillLabel(f,0).Contains("1 USE"),"active slot label survives hidden garage-to-battle transition");
                Need(SkillLabel(f,1).Contains("MINES")&&SkillLabel(f,2).Contains("PASSIVE")&&!f.Button("CombatSkill2").interactable,"mixed passive occupies shared slot without action");
                f.Click("SpeedRate");int tick=model.Tick;
                Need(f.Loop.Session.Paused&&!f.Loop.Session.TryActivateSkill(LastStandSkillId.Overdrive),"Session refuses manual-pause activation");
                f.Loop.ActivateSkill(LastStandSkillId.Overdrive);f.Loop.Session.AdvanceAt(Time.realtimeSinceStartupAsDouble);
                Need(model.Tick==tick&&model.RemainingSkillUses(LastStandSkillId.Overdrive)==1&&cues.Count==0,"paused input keeps time, use and audio unchanged");
                f.Click("SpeedRate");f.Click("Menu");
                Need(f.Loop.Session.MenuPaused&&!f.Loop.Session.TryActivateSkill(LastStandSkillId.Minefield),"Session refuses menu-pause activation");
                f.Loop.ActivateSkill(LastStandSkillId.Overdrive);
                Need(model.RemainingSkillUses(LastStandSkillId.Overdrive)==1&&cues.Count==0,"menu controller input does not consume or play");
                f.Click("MenuResume");f.Click("CombatSkill0");
                Need(model.SkillUsed(LastStandSkillId.Overdrive)&&model.OverdriveRemainingTicks>0&&SkillLabel(f,0).Contains("ACTIVE"),"controller activates captured Overdrive once with live label");
                Need(cues.Count(c=>c=="ST_LS_AUDIO event=skill-overdrive")==1,"successful controller activation admits one actual skill audio cue");
                f.Loop.ActivateSkill(LastStandSkillId.Overdrive);Need(cues.Count==1,"repeated spent activation cannot replay cue");
                // Advance the production Session to one real committed wave. This
                // explicit synthetic clock is portable lifecycle evidence, not
                // an assertion of native play duration or earned balance.
                double now=Time.realtimeSinceStartupAsDouble;
                for(int n=0;n<2400&&f.Loop.Progression.Checkpoint!=null&&f.Loop.Progression.Checkpoint.CompletedWave<1&&f.Loop.Session.Model==model;n++)
                {now+=.05;f.Loop.Session.AdvanceAt(now);}
                Need(f.Loop.Progression.Checkpoint!=null&&f.Loop.Progression.Checkpoint.CompletedWave>=1,"production Session commits the first cleared wave");
                Need(f.Loop.Progression.Checkpoint.RestoreModel().SkillUsed(LastStandSkillId.Overdrive),"confirmed checkpoint retains spent active");
                checkpoint=f.Game.Value;
            }
            using(var f=new LastStandAppearanceChecks.Fixture(checkpoint))
            {
                ClickDeploy(f);var model=f.Loop.Session.Model;
                Need(f.Loop.Session.Paused&&model.SkillUsed(LastStandSkillId.Overdrive)&&model.RemainingSkillUses(LastStandSkillId.Minefield)==1,"resume is paused with captured spent and unused actives");
                Need(SkillLabel(f,0).Contains("ACTIVE")||SkillLabel(f,0).Contains("SPENT"),"restored used slot has no fresh-use label");
                Need(SkillLabel(f,2).Contains("PASSIVE"),"passive slot survives restore");
                int before=cues.Count;Need(!f.Loop.Session.TryActivateSkill(LastStandSkillId.Minefield),"restored paused Session refuses activation");
                f.Loop.ActivateSkill(LastStandSkillId.Minefield);Need(cues.Count==before&&!model.MinefieldArmed,"restored paused controller cannot arm or play cue");
                f.Click("SpeedRate");f.Click("CombatSkill1");
                Need(model.MinefieldArmed&&model.SkillUsed(LastStandSkillId.Minefield)&&SkillLabel(f,1).Contains("ARMED"),"resumed controller arms remaining mine use");
                Need(cues.Count(c=>c=="ST_LS_AUDIO event=skill-mines-armed")==1,"resumed activation admits one actual mine cue");
            }
            using(var f=new LastStandAppearanceChecks.Fixture(Profile()))
            {
                f.Loop.OpenSkills();f.Click("SkillEmergencyRepairsEquip");f.Click("SkillsApply");f.Click("SkillsCancel");ClickDeploy(f);
                Need(SkillLabel(f,0).Contains("REPAIR")&&!f.Button("CombatSkill0").interactable,"full-hull repair is visible but refused");
                Need(SkillLabel(f,1).Contains("EMPTY")&&SkillLabel(f,2).Contains("EMPTY"),"unfilled slot labels survive inactive transition");
            }
        }
        finally{Application.logMessageReceived-=capture;}
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandCombatHud
    {
        readonly LastStandLoopController loop;
        public readonly RectTransform Card,Dock;
        readonly RectTransform hullFill;
        public readonly LastStandConsoleFrame CardFrame,DockFrame;
        public readonly Text Heading,Detail,Status,WaveReceipt,WaveReceiptDetail;
        public readonly Button Fitting,Deploy,Claim,Purchase,Redeploy,Retry,Pause,Mute,Tier,Effects,SpeedMinus,SpeedRate,SpeedPlus,WaveInfo;
        public readonly Dictionary<string,Text> Readouts=new Dictionary<string,Text>();
        static readonly Color Ink=LastStandUiPrimitives.Ink,Graphite=LastStandUiPrimitives.Graphite,Paper=LastStandUiPrimitives.Paper,
            Brass=LastStandUiPrimitives.Brass,DisabledPaper=LastStandUiPrimitives.DisabledPaper,HullGreen=new Color(.42f,.65f,.32f);
        public LastStandCombatHud(LastStandLoopController loop,RectTransform root,LastStandHudElements elements,Texture2D metalGrain,Sprite metalSurface)
        {
            this.loop=loop;var nodes=elements.Nodes;
            Func<string,Transform,RectTransform> Node=LastStandUiPrimitives.Node;
            Func<RectTransform,LastStandConsoleFrame> Frame=parent=>LastStandConsoleChrome.Frame(parent,metalGrain);
            Func<string,Transform,RectTransform> Panel=(name,parent)=>elements.Panel(name,parent);
            Func<string,string,Transform,UnityEngine.Events.UnityAction,Button> Action=elements.Action;
            Func<string,Transform,int,Text> Label=elements.Label;
            Card = Node("LastStandCard",root); var cardImage = LastStandConsoleChrome.Surface(Card,metalSurface,false,false); cardImage.color = Graphite;
            CardFrame = Frame(Card);
            nodes.Add(Card.name,Card);
            Heading = Label("PhaseHeading",Card,29); Heading.color = Brass; Heading.fontStyle = FontStyle.Bold;
            Detail = Label("PhaseDetail",Card,18);
            Status = Label("SaveStatus",Card,15); Status.color = Brass;
            Dock = Node("LastStandDock",root); var dockImage = LastStandConsoleChrome.Surface(Dock,metalSurface,false,false); dockImage.color = Graphite;
            DockFrame=Frame(Dock);
            nodes.Add(Dock.name,Dock);
            var dockHeading = Label("DockHeading",Dock,14); dockHeading.text = "FIELD CONTROLS";
            dockHeading.color = Brass; dockHeading.fontStyle = FontStyle.Bold;
            var receiptPanel=Panel("WaveReceiptPanel",root);
            WaveReceipt=Label("WaveReceipt",receiptPanel,14);WaveReceipt.color=Brass;
            WaveReceipt.alignment=TextAnchor.MiddleLeft;
            WaveReceiptDetail=Label("WaveReceiptDetail",Card,14);WaveReceiptDetail.color=Brass;
            WaveReceiptDetail.alignment=TextAnchor.MiddleLeft;
            Fitting = Action("ToggleFitting","",Dock,() => loop.OpenSelector("fitting"));
            Deploy = Action("Deploy","DEPLOY",Dock,loop.Deploy);
            Claim = Action("Claim","CLAIM 1 SALVAGE",Dock,loop.Claim);
            Purchase = Action("Purchase","BUY CANNON ATTACK",Dock,loop.Purchase);
            Redeploy = Action("Redeploy","REDEPLOY",Dock,loop.Redeploy);
            Retry = Action("RetrySave","RETRY SAVE",Dock,loop.RetrySave);
            Pause = Action("Pause","PAUSE",Dock,loop.TogglePause);
            Mute = Action("ToggleMute","SOUND ON",Dock,loop.ToggleMute);
            Tier = Action("ToggleTier","",Dock,() => loop.OpenSelector("tier"));
            Effects = Action("Effects","",Dock,ToggleEffects);
            SpeedMinus = Action("SpeedMinus","-",Dock,() => loop.ChangeSpeed(-1));
            SpeedRate = Action("SpeedRate","1x",Dock,loop.TogglePause);
            SpeedPlus = Action("SpeedPlus","+",Dock,() => loop.ChangeSpeed(1));
            foreach (string id in new[] { "HullValue", "ElapsedTime", "DisabledCount", "CannonDamage", "Fitting" })
                Readouts.Add(id,Label(id,Card,(int)LastStandHudLayout.MinimumTextSize));
            // The existing wave instrument is the entry point: a full-size
            // transparent hit target adds no extra opaque HUD panel or row.
            var waveTarget=Node("WaveInfo",Card);nodes.Add(waveTarget.name,waveTarget);
            waveTarget.gameObject.AddComponent<Image>().color=Color.clear;
            WaveInfo=waveTarget.gameObject.AddComponent<Button>();WaveInfo.targetGraphic=Readouts["ElapsedTime"];
            var waveColors=WaveInfo.colors;waveColors.normalColor=Brass;waveColors.highlightedColor=waveColors.selectedColor=Paper;
            waveColors.disabledColor=DisabledPaper;waveColors.pressedColor=Color.white;WaveInfo.colors=waveColors;
            WaveInfo.onClick.AddListener(()=>loop.OpenMenu("wave"));
            var waveOutline=Readouts["ElapsedTime"].gameObject.AddComponent<Outline>();
            waveOutline.effectColor=Ink;waveOutline.effectDistance=new Vector2(1,-1);waveOutline.enabled=false;
            WaveInfo.gameObject.AddComponent<LastStandActionFeedback>().Initialize(WaveInfo,Readouts["ElapsedTime"],waveOutline,null);
            var hullBar = Node("HullBar",Card); nodes.Add(hullBar.name,hullBar);
            hullBar.gameObject.AddComponent<Image>().color = Ink;
            hullBar.GetComponent<Image>().sprite = metalSurface; hullBar.GetComponent<Image>().type = Image.Type.Sliced;
            hullFill = Node("HullFill",hullBar); hullFill.gameObject.AddComponent<Image>().color = HullGreen;
            hullFill.anchorMin = Vector2.zero; hullFill.anchorMax = Vector2.one;
            hullFill.offsetMin = hullFill.offsetMax = Vector2.zero;
            hullBar.GetComponent<Image>().raycastTarget = hullFill.GetComponent<Image>().raycastTarget = false;
        }
        bool CanChangeEffects()
        { return (loop.Phase == "battle" || loop.Phase == "settling") && loop.Session.Model != null && loop.Session.Failure == "" && !loop.Session.CatchingUp; }
        void ToggleEffects() { if (CanChangeEffects()) loop.ToggleEffects(); }
        // A transient presentation snapshot, read once per refresh. No copied
        // progression, save, simulation, reservation or award state is owned here.
        internal sealed class Presentation
        {
            public string Phase, Heading, Detail, Status, Primary;
            public bool[] Active, Available;
            public string[] Labels;
            public float HullFraction;
            public readonly Dictionary<string,string> Readouts = new Dictionary<string,string>();
        }
        public Presentation Project(bool shopOpen)
        {
            string phase=loop.Phase;var progress=loop.Progression;var model=loop.Session.Model;
            int runTier=model?.Profile.Tier??progress.Checkpoint?.Tier??progress.SelectedTier;
            bool ready=progress.SaveState=="ready",garage=phase=="garage",workshop=phase=="workshop";
            bool battle=phase=="battle",settling=phase=="settling",result=phase=="result";
            bool cards=loop.GarageCardsVisible,checkpoint=progress.HasCheckpoint;
            string fittingName=loop.FittingId.ToUpperInvariant();
            foreach(var option in LastStandFittingCatalog.Options)if(option.Id==loop.FittingId)fittingName=option.Name;
            bool canDeploy=ready && loop.Session.CanRun && progress.PendingDefeat==null &&
                (checkpoint || !loop.HasLockedTierPreview && progress.NextRunId!=int.MaxValue);
            bool canPause=(battle||settling) && model!=null && !loop.Session.CheckpointBlocked && loop.Session.Failure=="" &&
                !loop.Session.CatchingUp && (!loop.Session.Paused||loop.Session.CanRun);
            bool canClaim=ready && result && !checkpoint;
            var state=new Presentation {Phase=phase,Primary=garage?"Deploy":workshop?"Redeploy":result?"Claim":battle||settling?"SpeedRate":"RetrySave",
                Active=new[]{false,garage,result,false,workshop,!ready,false,false,false,false,true,battle||settling,battle||settling,battle||settling,
                    cards&&!shopOpen,cards&&!shopOpen,cards&&!shopOpen,cards&&!shopOpen,cards&&!shopOpen},
                Available=new[]{loop.CanSelectLoadout,canDeploy,canClaim,false,canDeploy,true,canPause,true,loop.CanSelectLoadout,CanChangeEffects(),
                    loop.CanOpenMenu,battle&&canPause&&loop.Session.SelectedSpeed>0,canPause,battle&&canPause&&loop.Session.SelectedSpeed<loop.Session.MaximumSpeed,
                    loop.CanSelectLoadout&&loop.GarageTierSelection!=null&&loop.GarageTierSelection.CanPrevious,
                    loop.CanSelectLoadout&&loop.GarageTierSelection!=null&&loop.GarageTierSelection.CanNext,
                    loop.CanSelectLoadout&&loop.GarageFittingSelection!=null&&loop.GarageFittingSelection.CanPrevious,
                    loop.CanSelectLoadout&&loop.GarageFittingSelection!=null&&loop.GarageFittingSelection.CanNext,loop.CanOpenMenu},
                Labels=new[]{"FITTING: "+fittingName,canDeploy?checkpoint?"RESUME RUN":"DEPLOY":"UNAVAILABLE",
                    progress.PendingDefeat!=null && progress.PendingDefeat.Reward>0?"CLAIM LEGACY REWARD":"CONTINUE","UPGRADES",canDeploy?checkpoint?"RESUME RUN":"DEPLOY":"UNAVAILABLE","RETRY SAVE",
                    canPause?loop.Session.Paused?"RESUME":"PAUSE":"WAIT",loop.Muted?"SOUND OFF":"SOUND ON","TIER "+runTier,
                    loop.Session.View.FullEffects?"FX FULL":"FX LOW","Menu","-",!canPause?"WAIT":loop.Session.Paused?"0x\nPAUSED":loop.Session.EffectiveSpeed.ToString("0.0")+"x","+","<",">","<",">","RESEARCH"}};
            if(garage||workshop)
            {
                state.Heading=checkpoint?"RESUME YOUR RUN":"LAST STAND";
                state.Detail=checkpoint?"Tier "+progress.Checkpoint.Tier+" / Wave "+(progress.Checkpoint.CompletedWave+1)+
                    "\nSaved hull "+progress.Checkpoint.Encounter.Hull+" / "+progress.Checkpoint.Encounter.MaximumHull+
                    "\nFitting: "+fittingName+"\nResume starts paused. Menu > New Run abandons this checkpoint.":
                    TierSummary(progress)+"\nFitting: "+fittingName+"\nSalvage "+progress.Wallet;
            }
            else if(battle&&model!=null)
            {
                state.Heading=loop.Session.CatchingUp?"CATCHING UP":loop.Session.Paused?"BATTLE PAUSED":"CLEAR THE WAVE";
                state.Detail=LastStandTierHudText.WaveProgress(runTier,model.Wave,model.RemainingWaveEnemies)+
                    "\nHull "+model.Hull+" / "+model.CurrentMaximumHull+"\n"+LastStandTierHudText.NextMilestone(runTier,model.CompletedWave);
            }
            else if(result)
            {
                state.Heading=progress.PendingDefeat!=null?"LEGACY RESULT":"RUN ENDED";
                state.Detail=progress.PendingDefeat!=null?LastStandTierHudText.Result(progress.PendingDefeat.Tier,progress.PendingDefeat.IsLimit,
                    progress.PendingDefeat.ElapsedTicks,progress.PendingDefeat.Kills,progress.PendingDefeat.Reward,progress.Wallet,true,false,false,false):
                    "Completed-wave rewards are already banked.\nSalvage "+progress.Wallet+"\n"+LastStandTierHudText.WaveBest(progress.GetBestWave(runTier))+"\nUpgrade, choose a fitting and deploy again.";
            }
            else
            {
                state.Heading=settling?"LAST SHOT":"CHECKPOINT NOT CONFIRMED";
                state.Detail=settling?"The final impact is settling\u2026":"Combat is stopped at the save boundary.\nRetry Save before continuing. The last confirmed checkpoint is preserved.";
            }
            state.Status=ready?(loop.Notice==""?"LOCAL SAVE READY / Completed rewards are banked.":loop.Notice):progress.SaveError;
            if(ready&&progress.LastReceipt==null&&loop.Guidance.Suggestion!="")state.Status=loop.Guidance.Suggestion;
            if(model!=null)
            {
                var reward=LastStandRewardCatalog.At(LastStandTierCatalog.Get(runTier),model.Wave);
                state.HullFraction=Mathf.Clamp01(model.Hull/(float)model.CurrentMaximumHull);
                state.Readouts.Add("HullValue","HULL "+model.Hull+" / "+model.CurrentMaximumHull);
                state.Readouts.Add("ElapsedTime","T"+runTier+" / WAVE "+model.Wave+" >");
                state.Readouts.Add("DisabledCount","LEFT "+model.RemainingWaveEnemies);
                state.Readouts.Add("CannonDamage","NEXT +"+reward.RepeatableSalvage+" SALVAGE");
                state.Readouts.Add("Fitting",LastStandTierHudText.NextMilestone(runTier,model.CompletedWave).ToUpperInvariant());
            }
            return state;
        }
        static string TierSummary(LastStandProgression progress) => LastStandTierHudText.Goal(progress.SelectedTier) + "\n" +
            LastStandTierHudText.WaveBest(progress.GetBestWave(progress.SelectedTier));

        public void Refresh(Presentation state,bool garageCards,bool shopOpen)
        {
            Heading.text=garageCards?"LAST STAND":state.Heading;Detail.text=state.Detail;Status.text=state.Status;
            WaveReceipt.text=loop.ConfirmedWaveReceipt;
            foreach(var entry in Readouts)entry.Value.text=state.Readouts.TryGetValue(entry.Key,out var value)?value:"";
            WaveInfo.gameObject.SetActive((state.Phase=="battle"||state.Phase=="settling")&&loop.Session.Model?.Profile.IsWaveBased==true);
            WaveInfo.interactable=loop.CanInspectWave&&!loop.MenuOpen;WaveInfo.GetComponent<LastStandActionFeedback>().Refresh();
            hullFill.anchorMax=new Vector2(state.HullFraction,1);
            if(shopOpen){Purchase.gameObject.SetActive(false);SpeedMinus.gameObject.SetActive(false);SpeedPlus.gameObject.SetActive(false);}
            Card.GetComponent<Image>().color=Dock.GetComponent<Image>().color=garageCards&&!shopOpen?Color.clear:Graphite;
            CardFrame.enabled=DockFrame.enabled=!(garageCards&&!shopOpen);
        }
        public void SetSummary(string heading,string detail){Heading.text=heading;Detail.text=detail;}
        public void LayoutInstruments(Dictionary<string,LastStandHudLayout.Slot> slots,float unitsX,float unitsY)
        {
            var cardSlot = slots["LastStandCard"].Bounds;
            bool instruments = slots.ContainsKey("HullValue") && cardSlot.Height == LastStandHudLayout.InstrumentCardHeight;
            if (instruments)
            {
                var hull = slots["HullValue"].Bounds; var timer = slots["ElapsedTime"].Bounds; var kills = slots["DisabledCount"].Bounds;
                var bar = slots["HullBar"].Bounds;
                float height = bar.Y + bar.Height - hull.Y + 8;
                CardFrame.SetInstruments(true,
                    new Rect((hull.X-cardSlot.X-4)*unitsX,(hull.Y-cardSlot.Y-4)*unitsY,(hull.Width+8)*unitsX,height*unitsY),
                    new Rect((timer.X-cardSlot.X-4)*unitsX,(timer.Y-cardSlot.Y-4)*unitsY,(timer.Width+8)*unitsX,height*unitsY),
                    new Rect((kills.X-cardSlot.X-4)*unitsX,(kills.Y-cardSlot.Y-4)*unitsY,(kills.Width+8)*unitsX,height*unitsY));
            }
            else CardFrame.SetInstruments(false,default(Rect),default(Rect),default(Rect));
        }
    }
}

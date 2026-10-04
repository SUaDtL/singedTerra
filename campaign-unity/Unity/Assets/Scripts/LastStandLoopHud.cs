using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    public sealed class LastStandLoopHud
    {
        readonly LastStandLoopController loop;
        readonly Canvas canvas;
        readonly Font font;
        readonly RectTransform root, card, dock;
        readonly Text heading, detail, status, muteLabel, fittingLabel;
        readonly Button deploy, claim, purchase, redeploy, retry, fitting, pause, mute;
        string previousLayout;
        static readonly Color Ink = new Color(.035f,.048f,.045f,.95f);
        static readonly Color Paper = new Color(.94f,.91f,.80f);
        static readonly Color Brass = new Color(.91f,.69f,.33f);
        static RectTransform Node(string name, Transform parent)
        {
            var rect = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent, false); rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(0,1);
            return rect;
        }
        static void Place(RectTransform rect, float x, float y, float w, float h)
        { rect.anchoredPosition = new Vector2(x,-y); rect.sizeDelta = new Vector2(w,h); }
        Text Label(string name, Transform parent, int size)
        {
            var rect = Node(name,parent); var text = rect.gameObject.AddComponent<Text>();
            text.font = font; text.fontSize = size; text.color = Paper; text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Truncate;
            return text;
        }
        Button Action(string name, string label, Transform parent, UnityEngine.Events.UnityAction handler)
        {
            var rect = Node(name,parent); var image = rect.gameObject.AddComponent<Image>();
            image.color = new Color(.18f,.20f,.16f,.98f);
            var button = rect.gameObject.AddComponent<Button>(); button.targetGraphic = image;
            button.onClick.AddListener(handler);
            var text = Label(name + "Text", rect, 17); text.text = label; text.alignment = TextAnchor.MiddleCenter;
            text.rectTransform.anchorMin = Vector2.zero; text.rectTransform.anchorMax = Vector2.one;
            text.rectTransform.offsetMin = new Vector2(8,3); text.rectTransform.offsetMax = new Vector2(-8,-3);
            return button;
        }
        public LastStandLoopHud(LastStandLoopController owner, Canvas sharedCanvas, Font sharedFont)
        {
            loop = owner; canvas = sharedCanvas; font = sharedFont;
            root = Node("LastStandLoopHud",canvas.transform); root.anchorMin = Vector2.zero; root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            card = Node("LastStandCard",root); card.gameObject.AddComponent<Image>().color = Ink;
            heading = Label("PhaseHeading",card,29); heading.color = Brass;
            detail = Label("PhaseDetail",card,18);
            status = Label("SaveStatus",card,15); status.color = Brass;
            dock = Node("LastStandDock",root); dock.gameObject.AddComponent<Image>().color = Ink;
            fitting = Action("ToggleFitting","",dock,ToggleFitting);
            fittingLabel = fitting.GetComponentInChildren<Text>();
            deploy = Action("Deploy","DEPLOY",dock,loop.Deploy);
            claim = Action("Claim","CLAIM 1 SALVAGE",dock,loop.Claim);
            purchase = Action("Purchase","BUY CANNON ATTACK",dock,loop.Purchase);
            redeploy = Action("Redeploy","REDEPLOY",dock,loop.Redeploy);
            retry = Action("RetrySave","RETRY SAVE",dock,loop.RetrySave);
            pause = Action("Pause","PAUSE",dock,loop.TogglePause);
            mute = Action("ToggleMute","SOUND ON",dock,loop.ToggleMute);
            muteLabel = mute.GetComponentInChildren<Text>();
        }
        void ToggleFitting() { loop.GetComponent<SingedTerra.Art.TankPresentation>().ToggleAttachment(); Refresh(); }
        public void Refresh()
        {
            string phase = loop.Phase;
            var progress = loop.Progression;
            var model = loop.Session.Model;
            bool ready = progress.SaveState == "ready";
            bool garage = phase == "garage", battle = phase == "battle", result = phase == "result", workshop = phase == "workshop";
            fitting.gameObject.SetActive(garage || workshop);
            deploy.gameObject.SetActive(garage); claim.gameObject.SetActive(result);
            purchase.gameObject.SetActive(workshop); redeploy.gameObject.SetActive(workshop);
            retry.gameObject.SetActive(!ready); pause.gameObject.SetActive(battle);
            deploy.interactable = ready && loop.Session.CanRun && progress.PendingDefeat == null;
            claim.interactable = ready && progress.PendingDefeat != null;
            purchase.interactable = ready && progress.NextCost != 0 && progress.Wallet >= progress.NextCost;
            redeploy.interactable = ready && loop.Session.CanRun;
            fitting.interactable = model == null;
            pause.interactable = model != null && model.Status == EncounterStatus.Running && loop.Session.Failure == "";
            pause.GetComponentInChildren<Text>().text = loop.Session.Paused ? "RESUME" : "PAUSE";
            muteLabel.text = loop.Muted ? "SOUND OFF" : "SOUND ON";
            fittingLabel.text = loop.GetComponent<SingedTerra.Art.TankPresentation>().showingLauncher ? "FIT REPAIR" : "FIT LAUNCHER";
            if (garage)
            {
                heading.text = "PREPARE YOUR LAST STAND";
                detail.text = "Fitting: " + (loop.GetComponent<SingedTerra.Art.TankPresentation>().showingLauncher ? "Auxiliary launcher" : "Field repair") +
                    "\nCannon Attack  " + progress.CannonAttackLevel + " / 3    •    " + progress.CannonDamage + " damage" +
                    "\nSalvage  " + progress.Wallet + "    •    Next upgrade " + (progress.NextCost == 0 ? "MAX" : progress.NextCost.ToString());
            }
            else if (battle && model != null)
            {
                heading.text = loop.Session.Paused ? "BATTLE PAUSED" : "HOLD THE POSITION";
                detail.text = "HULL  " + model.Hull + " / 120      TIME  " + (model.Tick / 20f).ToString("F1") + "s" +
                    "\nDISABLED  " + model.Kills + "      CANNON  " + model.CommittedCannonDamage + " DAMAGE" +
                    "\nFITTING  " + (model.HasLauncher ? "AUXILIARY LAUNCHER" : "FIELD REPAIR");
            }
            else if (result && progress.PendingDefeat != null)
            {
                heading.text = "LAST STAND ENDED";
                detail.text = "Time  " + (progress.PendingDefeat.ElapsedTicks / 20f).ToString("F1") + "s    •    Disabled  " + progress.PendingDefeat.Kills +
                    "\nEarned  1 salvage    •    Balance  " + progress.Wallet + "\nClaim to continue to the workshop.";
            }
            else if (workshop)
            {
                heading.text = "WORKSHOP  /  CANNON ATTACK";
                detail.text = "Level  " + progress.CannonAttackLevel + " / 3    /    Damage  " + progress.CannonDamage +
                    (progress.NextCost == 0 ? "    /    MAX LEVEL" : " to " + (progress.CannonDamage + 10) + "\nCost  " + progress.NextCost + " salvage") +
                    "\nBalance  " + progress.Wallet + "    /    Choose a fitting and redeploy.";
            }
            else { heading.text = phase == "settling" ? "LAST SHOT" : "SAVE NEEDS ATTENTION"; detail.text = phase == "settling" ? "The final impact is settling…" : "Your result is held while storage is checked."; }
            status.text = ready ? (loop.Notice == "" ? "LOCAL SAVE READY  /  PROTOTYPE" : loop.Notice) : progress.SaveError;
            Layout();
        }
        public void Layout()
        {
            if (!root) return;
            var size = root.rect.size; if (size.x < 1 || size.y < 1) return;
            float width = Mathf.Min(size.x - 32, 720);
            bool battleCard = loop.Phase == "battle";
            float cardWidth = battleCard ? Mathf.Min(size.x - 32, 460) : width;
            float cardHeight = battleCard ? 150 : loop.Phase == "settling" ? 118 : Screen.height < 650 ? 202 : 226;
            Place(card,battleCard ? 16 : (size.x-cardWidth)/2,16,cardWidth,cardHeight);
            heading.fontSize = battleCard ? 23 : 29;
            detail.fontSize = battleCard ? 17 : 18;
            Place(heading.rectTransform,22,battleCard ? 14 : 20,cardWidth-44,battleCard ? 34 : 42);
            Place(detail.rectTransform,22,battleCard ? 50 : 72,cardWidth-44,battleCard ? 86 : 112);
            status.gameObject.SetActive(!battleCard && loop.Phase != "settling");
            if (status.gameObject.activeSelf) Place(status.rectTransform,22,cardHeight-30,cardWidth-44,22);
            var active = new[] { fitting, deploy, claim, purchase, redeploy, retry, pause, mute };
            int count = 0; foreach (var button in active) if (button.gameObject.activeSelf) count++;
            bool wrap = Screen.width < 900;
            int columns = wrap ? 2 : count;
            int rows = wrap ? (count + 1) / 2 : 1;
            float dockHeight = wrap ? 12 + rows * 58 : 76;
            Place(dock,(size.x-width)/2,size.y-dockHeight-16,width,dockHeight);
            float gap = 8, w = (width-24-(columns-1)*gap)/columns, h = 50;
            int n = 0;
            foreach (var button in active)
            {
                if (!button.gameObject.activeSelf) continue;
                Place((RectTransform)button.transform,12+(n%columns)*(w+gap),wrap ? 10+(n/columns)*58 : 13,w,h); n++;
            }
            ReportLayout();
        }
        [Serializable] sealed class Control { public string name,label; public float x,y,width,height; public bool active,interactable; }
        [Serializable] sealed class LayoutState { public string phase,coordinates; public int width,height; public Control[] controls; }
        void ReportLayout()
        {
            if (!Application.isPlaying) return;
            Canvas.ForceUpdateCanvases();
            var buttons = new[] { fitting, deploy, claim, purchase, redeploy, retry, pause, mute };
            var controls = new Control[buttons.Length]; var corners = new Vector3[4];
            for (int i=0;i<buttons.Length;i++)
            {
                var b=buttons[i]; ((RectTransform)b.transform).GetWorldCorners(corners);
                var lo=RectTransformUtility.WorldToScreenPoint(null,corners[0]);
                var hi=RectTransformUtility.WorldToScreenPoint(null,corners[2]);
                controls[i]=new Control { name=b.name,label=b.GetComponentInChildren<Text>(true)?.text ?? "",x=lo.x,y=Screen.height-hi.y,width=hi.x-lo.x,height=hi.y-lo.y,
                    active=b.gameObject.activeInHierarchy,interactable=b.IsInteractable() };
            }
            var layout=new LayoutState { phase=loop.Phase,coordinates="top-left",width=Screen.width,height=Screen.height,controls=controls };
            string payload=JsonUtility.ToJson(layout);
            if(payload==previousLayout)return; previousLayout=payload;
            Debug.Log("ST_LS_HUD_LAYOUT " + payload);
        }
        public void Dispose()
        {
            if (!root) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(root.gameObject); else UnityEngine.Object.DestroyImmediate(root.gameObject);
        }
    }
}

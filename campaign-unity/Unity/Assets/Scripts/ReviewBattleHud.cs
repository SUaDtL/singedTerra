using System;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Encounter;

namespace SingedTerra.VisualReview
{
    // A view helper, refreshed and disposed by EncounterHud. The existing session
    // still owns every run command; this class only projects its current state.
    public sealed class ReviewBattleHud
    {
        const float Margin = 16, CardHeight = 94, ReadoutWidth = 360, TreatmentsWidth = 432;
        const float DockWidth = 724, ButtonHeight = 52;
        static readonly Color Ink = new Color(.045f, .055f, .052f, .96f);
        static readonly Color Paper = new Color(.89f, .86f, .76f);
        static readonly Color Brass = new Color(.76f, .61f, .34f);
        static readonly Color Muted = new Color(.61f, .64f, .56f);
        static readonly Color Warning = new Color(.89f, .48f, .29f);
        static readonly Color ButtonInk = new Color(.14f, .16f, .13f, .98f);
        readonly EncounterSession session;
        readonly BattlefieldReview review;
        readonly Canvas canvas;
        readonly Font font;
        readonly RectTransform root, battle, deploy, readout, treatments, dock;
        readonly RectTransform hullMeter;
        readonly Text hullValue, timeValue, pressureValue, fitting, status, selected, pauseLabel, effectsLabel;
        readonly Button ashButton, ironButton, pauseButton, effectsButton, returnButton;
        Vector2 lastSize;
        string lastUiState;

        static RectTransform Node(string name, Transform parent, Vector2 position, Vector2 size)
        {
            var node = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            node.SetParent(parent, false);
            node.anchorMin = node.anchorMax = node.pivot = new Vector2(0, 1);
            Place(node, position.x, position.y, size.x, size.y);
            return node;
        }

        static void Place(RectTransform node, float x, float y, float width, float height)
        {
            node.anchoredPosition = new Vector2(x, -y);
            node.sizeDelta = new Vector2(width, height);
        }

        static RectTransform Stretch(string name, Transform parent)
        {
            var node = Node(name, parent, Vector2.zero, Vector2.zero);
            node.anchorMin = Vector2.zero; node.anchorMax = Vector2.one;
            node.offsetMin = node.offsetMax = Vector2.zero;
            return node;
        }

        Text Label(Transform parent, string name, string text, int size, float x, float y, float width, float height, Color color)
        {
            var node = Node(name, parent, new Vector2(x, y), new Vector2(width, height));
            var label = node.gameObject.AddComponent<Text>();
            label.font = font; label.fontSize = size; label.text = text; label.color = color;
            label.raycastTarget = false; label.supportRichText = false;
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            label.verticalOverflow = VerticalWrapMode.Truncate;
            return label;
        }

        static Image ColorBlock(string name, Transform parent, float x, float y, float width, float height, Color color)
        {
            var node = Node(name, parent, new Vector2(x, y), new Vector2(width, height));
            var image = node.gameObject.AddComponent<Image>();
            image.color = color; image.raycastTarget = false;
            return image;
        }

        static RectTransform Panel(string name, Transform parent, float width, float height)
        {
            var panel = Node(name, parent, Vector2.zero, new Vector2(width, height));
            var image = panel.gameObject.AddComponent<Image>();
            image.color = Ink; image.raycastTarget = false;
            var edge = panel.gameObject.AddComponent<Outline>();
            edge.effectColor = new Color(Brass.r, Brass.g, Brass.b, .42f);
            edge.effectDistance = new Vector2(1, -1);
            return panel;
        }

        Button MakeButton(Transform parent, string name, string text, int size, UnityEngine.Events.UnityAction action)
        {
            var node = Node(name, parent, Vector2.zero, new Vector2(200, ButtonHeight));
            var image = node.gameObject.AddComponent<Image>(); image.color = ButtonInk;
            var edge = node.gameObject.AddComponent<Outline>();
            edge.effectColor = new Color(Brass.r, Brass.g, Brass.b, .4f);
            edge.effectDistance = new Vector2(1, -1);
            var button = node.gameObject.AddComponent<Button>(); button.targetGraphic = image;
            var colors = button.colors;
            colors.normalColor = Color.white; colors.highlightedColor = new Color(1.25f, 1.2f, 1.08f);
            colors.pressedColor = new Color(.78f, .70f, .49f);
            colors.selectedColor = Color.white; colors.disabledColor = new Color(.5f, .5f, .5f, .65f);
            colors.fadeDuration = .08f; button.colors = colors;
            button.onClick.AddListener(action);
            var label = Label(node, name + "Label", text, size, 8, 4, 184, ButtonHeight - 8, Paper);
            label.alignment = TextAnchor.MiddleCenter;
            label.rectTransform.anchorMin = Vector2.zero; label.rectTransform.anchorMax = Vector2.one;
            label.rectTransform.offsetMin = new Vector2(8, 4); label.rectTransform.offsetMax = new Vector2(-8, -4);
            return button;
        }

        public ReviewBattleHud(EncounterSession owner, BattlefieldReview treatmentOwner, Canvas sharedCanvas, Font sharedFont)
        {
            session = owner; review = treatmentOwner; canvas = sharedCanvas; font = sharedFont;
            root = Stretch("ReviewEncounterHud", canvas.transform);
            deploy = (RectTransform)MakeButton(root, "DeployEncounter", "BEGIN LAST STAND", 18, session.Deploy).transform;
            battle = Stretch("ReviewEncounterControls", root);

            readout = Panel("ReviewReadout", battle, ReadoutWidth, CardHeight);
            Label(readout, "RunHeading", "LAST STAND  /  01", 14, 14, 9, 180, 18, Brass);
            fitting = Label(readout, "CommittedFitting", "", 13, 204, 9, 142, 18, Muted);
            fitting.alignment = TextAnchor.UpperRight;
            hullValue = Label(readout, "HullValue", "", 24, 14, 28, 140, 32, Paper);
            timeValue = Label(readout, "TimeValue", "", 24, 164, 28, 100, 32, Paper);
            pressureValue = Label(readout, "PressureValue", "", 24, 278, 28, 68, 32, Paper);
            Label(readout, "HullHeading", "HULL", 13, 14, 62, 140, 18, Muted);
            Label(readout, "TimeHeading", "ELAPSED", 13, 164, 62, 100, 18, Muted);
            Label(readout, "PressureHeading", "THREATS", 13, 278, 62, 68, 18, Muted);
            ColorBlock("HullMeterTrack", readout, 14, 85, 332, 3, new Color(.24f, .25f, .20f));
            hullMeter = ColorBlock("HullMeterFill", readout, 14, 85, 332, 3, Brass).rectTransform;

            treatments = Panel("ReviewTreatments", battle, TreatmentsWidth, CardHeight);
            Label(treatments, "TreatmentHeading", "BATTLEFIELD TREATMENT", 14, 12, 9, 268, 18, Brass);
            selected = Label(treatments, "TreatmentSelection", "", 13, 286, 9, 134, 18, Muted);
            selected.alignment = TextAnchor.UpperRight;
            ashButton = MakeButton(treatments, "SelectAsh", "A  SUNLIT ASH", 17, review.SelectAsh);
            ironButton = MakeButton(treatments, "SelectIron", "B  IRON PERIMETER", 17, review.SelectIron);
            Place((RectTransform)ashButton.transform, 12, 34, 198, ButtonHeight);
            Place((RectTransform)ironButton.transform, 222, 34, 198, ButtonHeight);

            dock = Panel("ReviewRunDock", battle, DockWidth, CardHeight);
            status = Label(dock, "EncounterPhase", "", 14, 16, 8, DockWidth - 32, 18, Brass);
            status.alignment = TextAnchor.MiddleCenter;
            pauseButton = MakeButton(dock, "PauseEncounter", "PAUSE", 18, session.TogglePause);
            effectsButton = MakeButton(dock, "EncounterEffects", "EFFECTS: FULL", 17, session.ToggleEffects);
            returnButton = MakeButton(dock, "ReturnToInspection", "RETURN TO INSPECTION", 17, session.ReturnToInspection);
            pauseLabel = pauseButton.GetComponentInChildren<Text>();
            effectsLabel = effectsButton.GetComponentInChildren<Text>();
            Refresh();
        }

        public void Layout()
        {
            if (!root) return;
            Vector2 size = root.rect.size;
            if (size.x <= 0 || size.y <= 0 || (size - lastSize).sqrMagnitude < .01f) return;
            lastSize = size;
            bool stacked = size.x < 880;
            Place(deploy, (size.x - 268) / 2, 20, 268, ButtonHeight);
            Place(readout, stacked ? (size.x - ReadoutWidth) / 2 : Margin, Margin, ReadoutWidth, CardHeight);
            Place(treatments, stacked ? (size.x - TreatmentsWidth) / 2 : size.x - Margin - TreatmentsWidth,
                stacked ? Margin + CardHeight + 10 : Margin, TreatmentsWidth, CardHeight);
            float width = Mathf.Min(DockWidth, size.x - Margin * 2);
            bool twoRows = size.x < 760;
            float height = twoRows ? 152 : CardHeight;
            Place(dock, (size.x - width) / 2, size.y - Margin - height, width, height);
            Place(status.rectTransform, 16, 8, width - 32, 18);
            if (twoRows)
            {
                float column = (width - 44) / 2;
                Place((RectTransform)pauseButton.transform, 16, 30, column, ButtonHeight);
                Place((RectTransform)effectsButton.transform, 28 + column, 30, column, ButtonHeight);
                Place((RectTransform)returnButton.transform, 16, 88, width - 32, ButtonHeight);
            }
            else
            {
                Place((RectTransform)pauseButton.transform, 16, 30, 196, ButtonHeight);
                Place((RectTransform)effectsButton.transform, 224, 30, 216, ButtonHeight);
                Place((RectTransform)returnButton.transform, 452, 30, 256, ButtonHeight);
            }
            ReportLayout();
        }

        public void Refresh()
        {
            bool active = session.Model != null;
            deploy.gameObject.SetActive(!active); battle.gameObject.SetActive(active);
            bool full = session.View == null || session.View.FullEffects;
            if (active)
            {
                var model = session.Model;
                int seconds = model.Tick / EncounterModel.TicksPerSecond;
                hullValue.text = model.Hull + " / " + EncounterModel.MaximumHull;
                timeValue.text = (seconds / 60).ToString("00") + ":" + (seconds % 60).ToString("00");
                pressureValue.text = model.ActiveCount.ToString();
                fitting.text = model.HasLauncher ? "AUX LAUNCHER" : "FIELD REPAIR";
                hullMeter.sizeDelta = new Vector2(332 * Mathf.Clamp01((float)model.Hull / EncounterModel.MaximumHull), 3);
                hullMeter.GetComponent<Image>().color = model.Hull <= EncounterModel.MaximumHull / 3 ? Warning : Brass;
                status.text = session.Failure != "" ? "PREVIEW UNAVAILABLE  /  RETURN TO INSPECTION" :
                    model.Status == EncounterStatus.Defeated ? "LAST STAND ENDED  /  " + model.Kills + " DISABLED" :
                    model.Status == EncounterStatus.Limit ? "REVIEW LIMIT REACHED" :
                    session.Paused ? PauseStatus(session.Reason) : "HOLD THE POSITION  /  AUTOMATIC DEFENSE";
                status.color = session.Failure != "" || model.Status == EncounterStatus.Defeated ? Warning : Brass;
                pauseButton.interactable = model.Status == EncounterStatus.Running && session.Failure == "";
                pauseLabel.text = session.Paused ? "RESUME" : "PAUSE";
                effectsLabel.text = full ? "EFFECTS: FULL" : "EFFECTS: REDUCED";
            }
            selected.text = review.Treatment == 0 ? "A SELECTED" : "B SELECTED";
            SelectStyle(ashButton, review.Treatment == 0);
            SelectStyle(ironButton, review.Treatment == 1);
            Layout();
            string state = active + ":" + session.Paused + ":" + session.Model?.Status + ":" + session.Failure + ":" + full + ":" + review.Treatment;
            if (state != lastUiState) { lastUiState = state; ReportLayout(); }
        }

        static string PauseStatus(string reason)
        {
            if (reason == "focus" || reason == "background" || reason == "application") return "PAUSED  /  RESUME WHEN READY";
            if (reason == "frame-gap") return "PAUSED  /  FRAME INTERRUPTED";
            return "PAUSED  /  COMPARE BOTH TREATMENTS";
        }

        static void SelectStyle(Button button, bool active)
        {
            button.GetComponent<Image>().color = active ? new Color(.31f, .28f, .17f, .98f) : ButtonInk;
            button.GetComponent<Outline>().effectColor = active ? Brass : new Color(Brass.r, Brass.g, Brass.b, .35f);
            button.GetComponentInChildren<Text>().color = active ? Paper : Muted;
        }

        // Screen-space geometry for source-bound pointer verification. Coordinates
        // use the canvas's top-left browser convention; this exposes no input API.
        void ReportLayout()
        {
            if (!Application.isPlaying || !canvas) return;
            Canvas.ForceUpdateCanvases();
            var buttons = canvas.GetComponentsInChildren<Button>(true);
            var controls = new Control[buttons.Length];
            var corners = new Vector3[4];
            for (int i = 0; i < buttons.Length; i++)
            {
                var button = buttons[i];
                ((RectTransform)button.transform).GetWorldCorners(corners);
                Vector2 low = RectTransformUtility.WorldToScreenPoint(null, corners[0]);
                Vector2 high = RectTransformUtility.WorldToScreenPoint(null, corners[2]);
                controls[i] = new Control { name = button.name, label = button.GetComponentInChildren<Text>(true)?.text ?? "",
                    x = low.x, y = Screen.height - high.y, width = high.x - low.x, height = high.y - low.y,
                    active = button.gameObject.activeInHierarchy, interactable = button.IsInteractable() };
            }
            var panelNodes = new[] { readout, treatments, dock };
            var panels = new PanelState[panelNodes.Length];
            for (int i = 0; i < panelNodes.Length; i++)
            {
                panelNodes[i].GetWorldCorners(corners);
                Vector2 low = RectTransformUtility.WorldToScreenPoint(null, corners[0]);
                Vector2 high = RectTransformUtility.WorldToScreenPoint(null, corners[2]);
                panels[i] = new PanelState { name = panelNodes[i].name, x = low.x, y = Screen.height - high.y,
                    width = high.x - low.x, height = high.y - low.y, active = panelNodes[i].gameObject.activeInHierarchy };
            }
            Debug.Log("ST_VIS_HUD_LAYOUT " + JsonUtility.ToJson(new LayoutState {
                coordinates = "top-left", width = Screen.width, height = Screen.height, controls = controls, panels = panels }));
        }

        public void Dispose()
        {
            if (!root) return;
            if (Application.isPlaying) UnityEngine.Object.Destroy(root.gameObject);
            else UnityEngine.Object.DestroyImmediate(root.gameObject);
        }

        [Serializable] sealed class LayoutState
        { public string coordinates; public int width, height; public Control[] controls; public PanelState[] panels; }
        [Serializable] sealed class Control
        {
            public string name, label;
            public float x, y, width, height;
            public bool active, interactable;
        }
        [Serializable] sealed class PanelState
        {
            public string name;
            public float x, y, width, height;
            public bool active;
        }
    }
}

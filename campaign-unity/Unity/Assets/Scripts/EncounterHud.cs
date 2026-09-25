using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;

namespace SingedTerra.Encounter
{
    public sealed class EncounterHud : MonoBehaviour
    {
        EncounterSession session;
        ArtHud artHud;
        RectTransform root, battle, deploy;
        Font font;
        Text title, stats, pauseLabel, effectsLabel;
        Button pauseButton;
        bool wasActive;
        readonly Color ink = new Color(.045f,.055f,.052f,.94f);
        readonly Color paper = new Color(.89f,.86f,.75f);
        readonly Color brass = new Color(.76f,.61f,.34f);
        static RectTransform Node(string name, Transform parent, Vector2 anchor, Vector2 pivot, Vector2 position, Vector2 size)
        {
            var node = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            node.SetParent(parent, false); node.anchorMin = node.anchorMax = anchor;
            node.pivot = pivot; node.anchoredPosition = position; node.sizeDelta = size; return node;
        }
        Text Label(Transform parent, string text, int size, Vector2 position, Vector2 bounds)
        {
            var node = Node("Label", parent, new Vector2(0,1), new Vector2(0,1), position, bounds);
            var label = node.gameObject.AddComponent<Text>(); label.font = font; label.fontSize = size;
            label.text = text; label.color = paper; label.raycastTarget = false; return label;
        }
        RectTransform Panel(string name, Transform parent, Vector2 anchor, Vector2 position, Vector2 size)
        {
            var node = Node(name, parent, anchor, anchor, position, size);
            node.gameObject.AddComponent<Image>().color = ink; return node;
        }
        Text MakeButton(Transform parent, string name, string text, float x, bool top, UnityEngine.Events.UnityAction action)
        {
            Vector2 anchor = new Vector2(.5f, top ? 1 : 0);
            var node = Node(name, parent, anchor, anchor, new Vector2(x, top ? -28 : 32), new Vector2(260,52));
            node.gameObject.AddComponent<Image>().color = new Color(.16f,.17f,.13f,.98f);
            var button = node.gameObject.AddComponent<Button>(); button.onClick.AddListener(action);
            var colors = button.colors; colors.pressedColor = brass; button.colors = colors;
            var label = Label(node, text, 16, new Vector2(8,-4), new Vector2(244,44));
            label.alignment = TextAnchor.MiddleCenter; return label;
        }
        public void Initialize(EncounterSession owner, ArtHud hud, Canvas canvas, Font sharedFont)
        {
            session = owner; artHud = hud; font = sharedFont;
            root = Node("EncounterHud", canvas.transform, Vector2.zero, new Vector2(.5f,.5f), Vector2.zero, Vector2.zero);
            root.anchorMax = Vector2.one;
            deploy = (RectTransform)MakeButton(root, "DeployEncounter", "DEPLOY TEST ENCOUNTER", 0, true, session.Deploy).transform.parent;
            battle = Node("EncounterControls", root, Vector2.zero, new Vector2(.5f,.5f), Vector2.zero, Vector2.zero);
            battle.anchorMax = Vector2.one;
            var panel = Panel("RunReadout", battle, new Vector2(0,1), new Vector2(28,-28), new Vector2(440,214));
            title = Label(panel, "", 26, new Vector2(18,-12), new Vector2(406,42));
            title.color = brass;
            stats = Label(panel, "", 17, new Vector2(18,-58), new Vector2(406,142));
            var note = Panel("EncounterNotice", battle, new Vector2(1,1), new Vector2(-28,-28), new Vector2(300,114));
            Label(note, "AUTOMATIC LAST STAND\nTest opponents and tuning.\nNo rewards or saved progression.", 15,
                new Vector2(16,-16), new Vector2(270,90));
            pauseLabel = MakeButton(battle, "PauseEncounter", "PAUSE", -300, false, session.TogglePause);
            pauseButton = pauseLabel.transform.parent.GetComponent<Button>();
            effectsLabel = MakeButton(battle, "EncounterEffects", "", 0, false, session.ToggleEffects);
            MakeButton(battle, "ReturnToInspection", "RETURN TO INSPECTION", 300, false, session.ReturnToInspection);
            session.Changed += Refresh; Refresh();
        }
        void Refresh()
        {
            bool active = session.Model != null;
            if (active != wasActive) { wasActive = active; artHud.SetEncounterVisible(active); }
            deploy.gameObject.SetActive(!active); battle.gameObject.SetActive(active);
            if (!active) return;
            var model = session.Model;
            title.text = session.Failure != "" ? "PREVIEW UNAVAILABLE" :
                model.Status == EncounterStatus.Defeated ? "LAST STAND ENDED" :
                model.Status == EncounterStatus.Limit ? "TEST LIMIT REACHED" : session.Paused ? "ENCOUNTER PAUSED" : "HOLD THE POSITION";
            stats.text = "HULL  " + model.Hull + " / " + EncounterModel.MaximumHull +
                "     TIME  " + (model.Tick / 20f).ToString("F1") + " s\n" +
                "FITTING  " + (model.HasLauncher ? "AUXILIARY LAUNCHER" : "FIELD REPAIR") + "\n" +
                "HOSTILES  " + model.ActiveCount + "     DISABLED  " + model.Kills + "\n" +
                "CANNON  " + model.CannonShots + "     AUX  " + model.LauncherShots + "\n" +
                "REPAIRED  " + model.Restored + (session.Paused ? "     " + session.Reason.ToUpperInvariant() : "");
            pauseButton.interactable = model.Status == EncounterStatus.Running && session.Failure == "";
            pauseLabel.text = session.Paused ? "RESUME ENCOUNTER" : "PAUSE ENCOUNTER";
            effectsLabel.text = session.View.FullEffects ? "REDUCE TRACERS" : "RESTORE TRACERS";
        }
        void OnDestroy()
        {
            if (session) session.Changed -= Refresh;
            if (root) Destroy(root.gameObject);
        }
    }
}

using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace SingedTerra.PartsGallery
{
    // Art inspection only. These selections never enter an encounter or a saved fitting.
    public sealed class PartsGalleryController : MonoBehaviour
    {
        [Serializable] public sealed class Entry
        {
            public string id, title, category, mount, description;
            public GameObject prefab;
        }

        public Camera viewCamera;
        public Entry[] entries;

        static readonly string[] PaintNames = { "OLIVE", "SLATE", "OXIDE" };
        static readonly Color[] PaintColors =
        {
            Color.white,
            new Color(.45f, .63f, 1.12f),
            new Color(1f, .40f, .40f)
        };
        readonly Color ink = new Color(.065f, .075f, .067f, .96f);
        readonly Color paper = new Color(.89f, .86f, .76f);
        readonly Color brass = new Color(.77f, .61f, .33f);
        GameObject displayed;
        Font font;
        Text detail, heading, paintLabel, assemblyLabel;
        Button[] entryButtons;
        ScrollRect listScroll;
        Vector3 focus;
        float radius, yaw = 32f;
        int selected, paint;

        public string SelectedId => entries != null && entries.Length > 0 ? entries[selected].id : "";
        public string PaintName => PaintNames[paint];
        public float OrbitYaw => yaw;

        void Start()
        {
            if (entries == null || entries.Length != 23 || !viewCamera)
                throw new InvalidOperationException("Gallery requires saved camera and 23 prefab entries");
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            BuildInterface();
            Select(0);
            Debug.Log("ST_KIT_GALLERY_READY entries=" + entries.Length);
        }

        void Update()
        {
            if (Input.GetMouseButton(0) && !EventSystem.current.IsPointerOverGameObject())
                Orbit(Input.GetAxis("Mouse X") * 2f);
        }

        public void Select(int index)
        {
            if (index < 0 || index >= entries.Length) return;
            selected = index;
            if (displayed) Destroy(displayed);
            displayed = Instantiate(entries[selected].prefab);
            displayed.name = "Selected " + entries[selected].id;
            displayed.transform.SetParent(transform, false);
            foreach (var collider in displayed.GetComponentsInChildren<Collider>(true)) Destroy(collider);
            var renderers = displayed.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new InvalidOperationException("Gallery prefab has no renderers: " + SelectedId);
            var bounds = renderers[0].bounds;
            foreach (var renderer in renderers) bounds.Encapsulate(renderer.bounds);
            displayed.transform.position -= new Vector3(bounds.center.x, bounds.min.y, bounds.center.z);
            focus = new Vector3(0, bounds.size.y * .52f, 0);
            radius = Mathf.Max(7f, bounds.extents.magnitude * 3.3f);
            ApplyPaint();
            UpdateCamera();
            Refresh();
            Report("select");
        }

        public void SelectNext() { Select((selected + 1) % entries.Length); }
        public void SelectPrevious() { Select((selected + entries.Length - 1) % entries.Length); }

        public void NextAssembly()
        {
            for (int offset = 1; offset <= entries.Length; offset++)
            {
                int index = (selected + offset) % entries.Length;
                if (entries[index].id.StartsWith("STK-S", StringComparison.Ordinal))
                { Select(index); Report("assembly"); return; }
            }
        }

        public void NextPaint()
        {
            paint = (paint + 1) % PaintNames.Length;
            ApplyPaint(); Refresh(); Report("paint");
        }

        public void Orbit(float degrees)
        {
            yaw = Mathf.Repeat(yaw + degrees, 360f);
            UpdateCamera(); Report("orbit");
        }

        public void ResetOrbit()
        {
            yaw = 32f; UpdateCamera(); Report("orbit_reset");
        }

        public void ScrollList(float amount)
        {
            listScroll.StopMovement();
            listScroll.verticalNormalizedPosition = Mathf.Clamp01(listScroll.verticalNormalizedPosition + amount);
            Report("list_scroll");
        }

        void UpdateCamera()
        {
            if (!viewCamera) return;
            float angle = yaw * Mathf.Deg2Rad;
            viewCamera.transform.position = focus + new Vector3(Mathf.Sin(angle) * radius,
                radius * .42f, Mathf.Cos(angle) * radius);
            viewCamera.transform.LookAt(focus);
        }

        void ApplyPaint()
        {
            if (!displayed) return;
            var block = new MaterialPropertyBlock();
            foreach (var renderer in displayed.GetComponentsInChildren<Renderer>(true))
            {
                var materials = renderer.sharedMaterials;
                for (int i = 0; i < materials.Length; i++)
                {
                    renderer.SetPropertyBlock(null, i);
                    if (!materials[i]) continue;
                    string name = materials[i].name;
                    if (name != "Armor" && !name.StartsWith("KitPaint_", StringComparison.Ordinal)) continue;
                    // Assembly prefabs already carry a paint material; the property block
                    // makes the same three finishes inspectable without editing saved assets.
                    block.Clear(); block.SetColor("_BaseColor", PaintColors[paint]);
                    renderer.SetPropertyBlock(block, i);
                }
            }
        }

        void Report(string action)
        {
            Debug.Log("ST_KIT_GALLERY_STATE " + JsonUtility.ToJson(new State
            { action = action, id = SelectedId, paint = PaintName, yaw = yaw,
                assembly = SelectedId.StartsWith("STK-S", StringComparison.Ordinal) }));
        }

        [Serializable] sealed class State
        { public string action, id, paint; public float yaw; public bool assembly; }

        RectTransform Rect(string name, Transform parent, Vector2 anchor, Vector2 pivot, Vector2 pos, Vector2 size)
        {
            var node = new GameObject(name, typeof(RectTransform));
            var rect = (RectTransform)node.transform; rect.SetParent(parent, false);
            rect.anchorMin = rect.anchorMax = anchor; rect.pivot = pivot;
            rect.anchoredPosition = pos; rect.sizeDelta = size;
            return rect;
        }

        Text Label(string name, Transform parent, string value, int size, Color color,
            Vector2 pos, Vector2 extent)
        {
            var rect = Rect(name, parent, new Vector2(0, 1), new Vector2(0, 1), pos, extent);
            var label = rect.gameObject.AddComponent<Text>();
            label.font = font; label.text = value; label.fontSize = size; label.color = color;
            label.raycastTarget = false; label.horizontalOverflow = HorizontalWrapMode.Wrap;
            return label;
        }

        Button Button(string name, Transform parent, string title, Vector2 pos, Vector2 size, Action action)
        {
            var rect = Rect(name, parent, new Vector2(0, 1), new Vector2(0, 1), pos, size);
            rect.gameObject.AddComponent<Image>().color = new Color(.16f, .18f, .15f, .98f);
            var button = rect.gameObject.AddComponent<Button>(); button.onClick.AddListener(() => action());
            var label = Label("Label", rect, title, 16, paper, new Vector2(6, -3), size - new Vector2(12, 6));
            label.alignment = TextAnchor.MiddleCenter;
            return button;
        }

        void BuildInterface()
        {
            var canvas = new GameObject("GalleryInterface", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvas.transform.SetParent(transform, false);
            canvas.GetComponent<Canvas>().renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvas.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1600, 900); scaler.matchWidthOrHeight = .5f;
            if (!FindFirstObjectByType<EventSystem>())
                new GameObject("GalleryInput", typeof(EventSystem), typeof(StandaloneInputModule)).transform.SetParent(transform, false);

            var left = Rect("PartsList", canvas.transform, new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(22, -22), new Vector2(310, 840));
            left.gameObject.AddComponent<Image>().color = ink;
            Label("LibraryTitle", left, "FIELD KIT / PARTS", 22, brass, new Vector2(18, -14), new Vector2(280, 34));
            Label("LibraryHint", left, "20 pieces  /  3 assemblies", 13, paper,
                new Vector2(18, -52), new Vector2(280, 24));
            var listWindow = Rect("ListWindow", left, new Vector2(0, 1), new Vector2(0, 1),
                new Vector2(12, -88), new Vector2(286, 672));
            listWindow.gameObject.AddComponent<Image>().color = new Color(.08f, .09f, .08f, .96f);
            listWindow.gameObject.AddComponent<Mask>().showMaskGraphic = true;
            var scroll = listWindow.gameObject.AddComponent<ScrollRect>(); scroll.horizontal = false;
            listScroll = scroll;
            var content = Rect("Content", listWindow, new Vector2(0, 1), new Vector2(0, 1),
                Vector2.zero, new Vector2(286, entries.Length * 42));
            scroll.content = content; scroll.viewport = listWindow;
            entryButtons = new Button[entries.Length];
            for (int i = 0; i < entries.Length; i++)
            {
                int index = i;
                entryButtons[i] = Button("Select " + entries[i].id, content,
                    entries[i].id + "  " + entries[i].title,
                    new Vector2(3, -i * 42), new Vector2(280, 39), () => Select(index));
            }
            Button("ListUp", left, "LIST UP", new Vector2(12, -776),
                new Vector2(136, 43), () => ScrollList(.5f));
            Button("ListDown", left, "LIST DOWN", new Vector2(160, -776),
                new Vector2(136, 43), () => ScrollList(-.5f));

            var info = Rect("SelectedPart", canvas.transform, new Vector2(1, 1), new Vector2(1, 1),
                new Vector2(-22, -22), new Vector2(392, 178));
            info.gameObject.AddComponent<Image>().color = ink;
            heading = Label("Heading", info, "", 22, brass, new Vector2(18, -13), new Vector2(355, 38));
            detail = Label("Details", info, "", 15, paper, new Vector2(18, -57), new Vector2(355, 104));

            var controls = Rect("GalleryControls", canvas.transform, new Vector2(.5f, 0),
                new Vector2(.5f, 0), new Vector2(130, 18), new Vector2(910, 132));
            controls.gameObject.AddComponent<Image>().color = ink;
            Button("Previous", controls, "PREVIOUS", new Vector2(12, -12), new Vector2(140, 46), SelectPrevious);
            Button("Next", controls, "NEXT PART", new Vector2(162, -12), new Vector2(140, 46), SelectNext);
            assemblyLabel = Button("Assembly", controls, "ASSEMBLY", new Vector2(312, -12),
                new Vector2(284, 46), NextAssembly).GetComponentInChildren<Text>();
            paintLabel = Button("Paint", controls, "PAINT", new Vector2(606, -12),
                new Vector2(290, 46), NextPaint).GetComponentInChildren<Text>();
            Button("OrbitLeft", controls, "ORBIT LEFT", new Vector2(12, -72),
                new Vector2(210, 46), () => Orbit(-30f));
            Button("OrbitRight", controls, "ORBIT RIGHT", new Vector2(232, -72),
                new Vector2(210, 46), () => Orbit(30f));
            Button("OrbitReset", controls, "RESET VIEW", new Vector2(452, -72),
                new Vector2(210, 46), ResetOrbit);
            Label("DragHint", controls, "DRAG MODEL TO ORBIT", 14, brass,
                new Vector2(680, -76), new Vector2(205, 40));
        }

        void Refresh()
        {
            var entry = entries[selected];
            heading.text = entry.id + "  /  " + entry.title.ToUpperInvariant();
            detail.text = entry.category.ToUpperInvariant() + "  •  " + entry.mount + "\n" +
                entry.description + "\nART STUDY ONLY  /  NO GAMEPLAY EFFECT";
            paintLabel.text = "PAINT  /  " + PaintName;
            assemblyLabel.text = "VIEW NEXT ASSEMBLY";
            for (int i = 0; i < entryButtons.Length; i++)
                entryButtons[i].GetComponent<Image>().color = i == selected ?
                    new Color(.36f, .30f, .18f, 1) : new Color(.16f, .18f, .15f, .98f);
        }
    }
}

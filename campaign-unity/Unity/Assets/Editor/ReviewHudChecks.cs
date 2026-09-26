using System;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Encounter;
using SingedTerra.VisualReview;

// ST-VIS-01 interface obligations: actual generated geometry, text, lifecycle and
// read-only state projection. Pointer dispatch remains a browser acceptance check.
public static class ReviewHudChecks
{
    static void Require(bool condition, string name)
    { if (!condition) throw new InvalidOperationException("Review HUD check failed: " + name); }

    static Rect Bounds(RectTransform node, RectTransform canvas)
    {
        var corners = new Vector3[4];
        node.GetWorldCorners(corners);
        Vector3 low = canvas.InverseTransformPoint(corners[0]);
        Vector3 high = canvas.InverseTransformPoint(corners[2]);
        return new Rect(low.x + canvas.rect.width / 2, canvas.rect.height / 2 - high.y,
            high.x - low.x, high.y - low.y);
    }

    public static void Run()
    {
        var host = new GameObject("ReviewHudCheckHost");
        var canvasObject = new GameObject("ReviewHudCheckCanvas", typeof(RectTransform), typeof(Canvas));
        var canvas = canvasObject.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.WorldSpace;
        var canvasRect = (RectTransform)canvas.transform;
        var session = host.AddComponent<EncounterSession>();
        var review = host.AddComponent<BattlefieldReview>();
        ReviewBattleHud hud = null;
        try
        {
            canvasRect.sizeDelta = new Vector2(1600, 900);
            hud = new ReviewBattleHud(session, review, canvas, Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));
            var controls = canvas.GetComponentsInChildren<Button>(true);
            Require(controls.Length == 6 && controls.Select(b => b.name).Distinct().Count() == 6,
                "one deploy, two treatments and three session controls");
            Require(controls.Single(b => b.name == "DeployEncounter").gameObject.activeInHierarchy &&
                controls.Count(b => b.gameObject.activeInHierarchy) == 1, "inspection exposes deployment only");

            var model = new EncounterModel(false, EncounterProfile.VisualReview);
            typeof(EncounterSession).GetField("model", BindingFlags.Instance | BindingFlags.NonPublic).SetValue(session, model);
            hud.Refresh();
            Require(!controls.Single(b => b.name == "DeployEncounter").gameObject.activeInHierarchy &&
                controls.Count(b => b.gameObject.activeInHierarchy) == 5, "battle exposes matched A/B and run controls");

            foreach (var pixels in new[] { new Vector2(1600, 900), new Vector2(1280, 720),
                new Vector2(960, 720), new Vector2(390, 844), new Vector2(320, 960) })
            {
                float scale = Mathf.Sqrt(pixels.x / 1600 * pixels.y / 900);
                canvasRect.sizeDelta = pixels / scale;
                hud.Layout(); Canvas.ForceUpdateCanvases();
                var active = controls.Where(b => b.gameObject.activeInHierarchy).ToArray();
                var bounds = active.Select(b => Bounds((RectTransform)b.transform, canvasRect)).ToArray();
                for (int i = 0; i < bounds.Length; i++)
                {
                    Rect r = bounds[i];
                    Require(r.xMin >= 0 && r.yMin >= 0 && r.xMax <= canvasRect.rect.width + .1f &&
                        r.yMax <= canvasRect.rect.height + .1f, pixels + " onscreen " + active[i].name);
                    Require(r.width * scale >= 75 && r.height * scale >= 23, pixels + " usable target " + active[i].name);
                    for (int j = i + 1; j < bounds.Length; j++)
                        Require(!r.Overlaps(bounds[j]), pixels + " disjoint " + active[i].name + "/" + active[j].name);
                }
                foreach (var label in canvas.GetComponentsInChildren<Text>())
                    Require(label.preferredWidth <= label.rectTransform.rect.width + 1 &&
                        label.preferredHeight <= label.rectTransform.rect.height + 1, pixels + " unclipped text " + label.name);
                if (pixels.x >= 960)
                    foreach (string name in new[] { "ReviewReadout", "ReviewTreatments", "ReviewRunDock" })
                    {
                        Rect r = Bounds(canvas.GetComponentsInChildren<RectTransform>().Single(t => t.name == name), canvasRect);
                        Require(r.yMax <= canvasRect.rect.height * .15f || r.yMin >= canvasRect.rect.height * .85f,
                            pixels + " central approach area clear of " + name);
                    }
            }

            string before = model.Snapshot();
            hud.Refresh(); hud.Layout();
            Require(before == model.Snapshot(), "HUD refresh and resize never advance combat");
            var texts = canvas.GetComponentsInChildren<Text>(true);
            Require(texts.Single(t => t.name == "HullValue").text == "120 / 120" &&
                texts.Single(t => t.name == "TimeValue").text == "00:00" &&
                texts.Single(t => t.name == "PressureValue").text == "0", "fresh hull, time and pressure readout");
            typeof(EncounterSession).GetProperty("Paused").SetValue(session, true);
            hud.Refresh();
            Require(texts.Single(t => t.name == "PauseEncounterLabel").text == "RESUME", "paused state offers explicit resume");
            while (model.Status == EncounterStatus.Running) model.Step();
            hud.Refresh();
            Require(!controls.Single(b => b.name == "PauseEncounter").interactable &&
                controls.Single(b => b.name == "ReturnToInspection").interactable, "terminal return remains available");
            foreach (var label in canvas.GetComponentsInChildren<Text>())
                Require(label.preferredWidth <= label.rectTransform.rect.width + 1 &&
                    label.preferredHeight <= label.rectTransform.rect.height + 1, "terminal text fits " + label.name);
            hud.Dispose(); hud = null;
            Require(canvas.transform.childCount == 0, "disposing helper removes every review control");
            Debug.Log("ST_VIS_HUD_PASS responsive geometry/text at five viewports; state projection; lifecycle");
        }
        finally
        {
            hud?.Dispose();
            UnityEngine.Object.DestroyImmediate(host);
            UnityEngine.Object.DestroyImmediate(canvasObject);
        }
    }
}

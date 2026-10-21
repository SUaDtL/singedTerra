// Independent geometry oracle. Baseline calls actual pre-change HUD methods;
// candidate reads every slot emitted by the actual production projection.
using System;
using System.Collections.Generic;
using System.Linq;
using SingedTerra.LastStand;

static class HudLayoutChecks
{
    sealed class Box
    {
        public string Id, Parent, Kind;
        public double X, Y, Width, Height, FontSize;
        public double Right { get { return X + Width; } }
        public double Bottom { get { return Y + Height; } }
    }
    sealed class Scenario
    {
        public string Phase;
        public bool SaveError;
        public string[] Controls;
    }
    static readonly int[,] Profiles = { {1366,768}, {1920,1080}, {390,844}, {844,390}, {720,640},
        {1366,664}, {1920,976}, {390,688}, {844,266}, {720,516} };
    static readonly Scenario[] Scenarios = {
        new Scenario { Phase="garage", Controls=new[] {"ToggleFitting","Deploy","ToggleMute"} },
        new Scenario { Phase="garage", SaveError=true, Controls=new[] {"ToggleFitting","Deploy","RetrySave","ToggleMute"} },
        new Scenario { Phase="battle", Controls=new[] {"Pause","ToggleMute"} },
        new Scenario { Phase="settling", Controls=new[] {"Pause","ToggleMute"} },
        new Scenario { Phase="battle", Controls=new[] {"Pause","ToggleMute","Effects","ShopEntry"} },
        new Scenario { Phase="settling", Controls=new[] {"Pause","ToggleMute","Effects"} },
        new Scenario { Phase="result", Controls=new[] {"Claim","ToggleMute"} },
        new Scenario { Phase="result", SaveError=true, Controls=new[] {"Claim","RetrySave","ToggleMute"} },
        new Scenario { Phase="workshop", Controls=new[] {"ToggleFitting","Purchase","Redeploy","ToggleMute"} },
        new Scenario { Phase="workshop", SaveError=true, Controls=new[] {"ToggleFitting","Purchase","Redeploy","RetrySave","ToggleMute"} },
        new Scenario { Phase="save-error", SaveError=true, Controls=new[] {"RetrySave","ToggleMute"} }
    };
    static void Require(bool condition, string reason)
    { if (!condition) throw new InvalidOperationException(reason); }
    static bool Intersects(Box a, Box b)
    { return a.X < b.Right - .001 && b.X < a.Right - .001 && a.Y < b.Bottom - .001 && b.Y < a.Bottom - .001; }
    static bool Contains(Box parent, Box child)
    { return child.X >= parent.X-.001 && child.Y >= parent.Y-.001 && child.Right <= parent.Right+.001 && child.Bottom <= parent.Bottom+.001; }
    static bool Ancestor(Box ancestor, Box child, List<Box> boxes)
    {
        string id=child.Parent;
        while (id != null)
        {
            if (id == ancestor.Id) return true;
            var parent=boxes.Find(b => b.Id == id);
            id=parent == null ? null : parent.Parent;
        }
        return false;
    }
    static List<Box> Observe(int width, int height, Scenario scenario)
    {
#if ST_HUD_LAYOUT_BASELINE
        // The existing CanvasScaler uses reference 1280x720 and match=.5.
        // Scaffolding projects the actual emitted native canvas bounds using
        // that scale; it contains no copy of the HUD's layout arithmetic.
        UnityEngine.Screen.width=width; UnityEngine.Screen.height=height;
        UnityEngine.RectTransform.Scale=Math.Sqrt((width/1280.0)*(height/720.0));
        var canvas=new UnityEngine.GameObject("Canvas", typeof(UnityEngine.Canvas));
        ((UnityEngine.RectTransform)canvas.transform).sizeDelta=new UnityEngine.Vector2(
            (float)(width/UnityEngine.RectTransform.Scale), (float)(height/UnityEngine.RectTransform.Scale));
        var loop=new LastStandLoopController { Phase=scenario.Phase };
        loop.Progression.SaveState=scenario.SaveError ? "blocked" : "ready";
        loop.Progression.SaveError="Storage could not confirm this result. Keep this page open and retry the save before claiming salvage or deploying again. Your pending result is held until storage confirms it.";
        if (scenario.Phase == "battle" || scenario.Phase == "settling" || scenario.Phase == "result")
            loop.Session.Model=new SingedTerra.Encounter.Model();
        var hud=new LastStandLoopHud(loop,canvas.GetComponent<UnityEngine.Canvas>(),new UnityEngine.Font());
        hud.Refresh();
        var observed=new List<Box>();
        foreach(var node in UnityEngine.GameObject.Nodes.Where(n => n.activeInHierarchy && n.name != "Canvas" && n.name != "LastStandLoopHud"))
        {
            var text=node.GetComponent<UnityEngine.UI.Text>();
            var button=node.GetComponent<UnityEngine.UI.Button>();
            var image=node.GetComponent<UnityEngine.UI.Image>();
            if(text == null && image == null) continue;
            var rect=(UnityEngine.RectTransform)node.transform;
            observed.Add(new Box { Id=node.name, Parent=rect.parent.name == "LastStandLoopHud" ? null : rect.parent.name,
                Kind=button != null ? "control" : text != null ? "text" : "panel",
                X=rect.Left*UnityEngine.RectTransform.Scale, Y=rect.Top*UnityEngine.RectTransform.Scale,
                Width=rect.Width*UnityEngine.RectTransform.Scale, Height=rect.Height*UnityEngine.RectTransform.Scale,
                FontSize=text == null ? 0 : text.fontSize*UnityEngine.RectTransform.Scale });
        }
        UnityEngine.GameObject.Nodes.Clear();
        hud.Dispose();
        return observed;
#else
        return LastStandHudLayout.Project(width,height,scenario.Phase,scenario.Controls).Slots.Select(slot =>
            new Box { Id=slot.Id, Parent=slot.Parent, Kind=slot.Kind, X=slot.Bounds.X, Y=slot.Bounds.Y,
                Width=slot.Bounds.Width, Height=slot.Bounds.Height, FontSize=slot.FontSize }).ToList();
#endif
    }
    static void Fit(List<Box> boxes, int width, int height, string context)
    {
        Require(boxes.Count > 0, context+": emitted no bounds");
        Require(boxes.Select(b => b.Id).Distinct().Count() == boxes.Count,context+": duplicate identity");
        foreach(var box in boxes)
        {
            Require(!double.IsNaN(box.X+box.Y+box.Width+box.Height) && !double.IsInfinity(box.X+box.Y+box.Width+box.Height),context+": nonfinite "+box.Id);
            Require(box.Width > 0 && box.Height > 0,context+": empty "+box.Id);
            Require(box.X >= -.001 && box.Y >= -.001 && box.Right <= width+.001 && box.Bottom <= height+.001,context+": offscreen "+box.Id);
            if(box.Parent != null)
            {
                var parent=boxes.Find(b => b.Id == box.Parent);
                Require(parent != null && Contains(parent,box),context+": clipped child "+box.Id);
            }
        }
        for(int i=0;i<boxes.Count;i++) for(int j=i+1;j<boxes.Count;j++)
            Require(!Intersects(boxes[i],boxes[j]) || Ancestor(boxes[i],boxes[j],boxes) || Ancestor(boxes[j],boxes[i],boxes),
                context+": overlap "+boxes[i].Id+" / "+boxes[j].Id);
    }
    static double UnionArea(List<Box> boxes)
    {
        var xs=boxes.SelectMany(b => new[] {b.X,b.Right}).Distinct().OrderBy(x => x).ToArray();
        double area=0;
        for(int i=1;i<xs.Length;i++)
        {
            var rows=boxes.Where(b => b.X < xs[i] && b.Right > xs[i-1]).OrderBy(b => b.Y).ToArray();
            if(rows.Length == 0) continue;
            double start=rows[0].Y, end=rows[0].Bottom, span=0;
            foreach(var row in rows.Skip(1))
            {
                if(row.Y > end) { span += end-start; start=row.Y; end=row.Bottom; }
                else end=Math.Max(end,row.Bottom);
            }
            area += (xs[i]-xs[i-1])*(span+end-start);
        }
        return area;
    }
    static void Battle(List<Box> boxes, int width, int height, string context)
    {
        var center=new Box { X=width*.2,Y=height*.2,Width=width*.6,Height=height*.6 };
        foreach(var panel in boxes.Where(b => b.Kind == "panel"))
            Require(!Intersects(panel,center),context+": central battle occlusion by "+panel.Id);
        double area=UnionArea(boxes);
        Require(area <= width*height*.25+.001,context+": chrome area "+area+" exceeds 25 percent");
    }
    static void Sizes(List<Box> boxes, string phase, string context)
    {
        foreach(var text in boxes.Where(b => b.Kind == "text"))
            Require(text.FontSize >= 14-.001 && text.Height >= text.FontSize,context+": text smaller than 14 pixels "+text.Id+" at "+text.FontSize);
        foreach(var control in boxes.Where(b => b.Kind == "control"))
            Require(control.Width >= 44-.001 && control.Height >= 44-.001,context+": target smaller than 44x44 "+control.Id);
        if(phase != "battle" && phase != "settling")
        {
            var notice=boxes.Find(b => b.Id == "SaveStatus");
            Require(notice != null && notice.Height >= 5*20 && notice.Width >= 300,context+": long storage notice lacks five full lines");
        }
    }
    static void Run(string name)
    {
        for(int p=0;p<Profiles.GetLength(0);p++) foreach(var scenario in Scenarios)
        {
            if (p >= 5 && scenario.Phase != "battle" && scenario.Phase != "settling") continue;
            int width=Profiles[p,0],height=Profiles[p,1];
            string context=width+"x"+height+" "+scenario.Phase+(scenario.SaveError ? " blocked" : " ready");
            var boxes=Observe(width,height,scenario);
            if(name == "profiles_fit_without_overlap")
            {
                Fit(boxes,width,height,context);
                foreach(string id in scenario.Controls) Require(boxes.Any(b => b.Kind == "control" && b.Id == id),context+": missing stable control "+id);
                Require(boxes.Any(b => b.Id == "PhaseHeading"),context+": missing phase heading");
                if(scenario.Phase != "battle" && scenario.Phase != "settling")
                    Require(boxes.Any(b => b.Kind == "text" && b.Id == "PhaseDetail"),context+": missing required noncombat detail slot PhaseDetail");
            }
            else if(name == "battle_center_and_area_limits")
            {
                if(scenario.Phase != "battle" && scenario.Phase != "settling") continue;
                Battle(boxes,width,height,context);
                foreach(string id in new[] {"HullValue","HullBar","ElapsedTime","DisabledCount","CannonDamage","Fitting"})
                    Require(boxes.Any(b => b.Id == id),context+": missing live instrument slot "+id);
            }
            else if(name == "text_targets_and_long_notice_bounds") Sizes(boxes,scenario.Phase,context);
            else throw new ArgumentException("Unknown check "+name);
        }
    }
    public static int Main(string[] args)
    {
        try { Run(args[0]); Console.WriteLine("PASS "+args[0]); return 0; }
        catch(Exception failure) { Console.Error.WriteLine("ASSERTION "+failure.Message); return 1; }
    }
}

#if ST_HUD_LAYOUT_BASELINE
// Minimal test-owned Unity/controller surface. Production HUD is compiled
// unchanged; only framework storage/parent transforms and domain inputs are
// supplied here. Candidate builds exclude every type in this section.
namespace UnityEngine
{
    public class Object
    {
        public static implicit operator bool(Object o) { return o != null; }
        public static void Destroy(Object o) { }
        public static void DestroyImmediate(Object o) { }
    }
    public class Component : Object
    {
        public GameObject gameObject;
        public Transform transform { get { return gameObject.transform; } }
        public string name { get { return gameObject.name; } }
        public T GetComponent<T>() where T:Component { return gameObject.GetComponent<T>(); }
        public T GetComponentInChildren<T>(bool includeInactive=false) where T:Component { return gameObject.GetComponentInChildren<T>(); }
    }
    public sealed class GameObject : Object
    {
        public static readonly List<GameObject> Nodes=new List<GameObject>();
        public string name;
        public Transform transform;
        bool active=true;
        readonly List<Component> components=new List<Component>();
        public bool activeSelf { get { return active; } }
        public bool activeInHierarchy { get { return active && (transform.parent == null || transform.parent.gameObject.activeInHierarchy); } }
        public GameObject(string name,params Type[] types)
        {
            this.name=name; transform=new RectTransform { gameObject=this }; components.Add(transform); Nodes.Add(this);
            foreach(var type in types) if(type != typeof(RectTransform)) Add(type);
        }
        Component Add(Type type) { var component=(Component)Activator.CreateInstance(type); component.gameObject=this; components.Add(component); return component; }
        public T AddComponent<T>() where T:Component,new() { return (T)Add(typeof(T)); }
        public T GetComponent<T>() where T:Component { return components.OfType<T>().FirstOrDefault(); }
        public T GetComponentInChildren<T>() where T:Component
        {
            var own=GetComponent<T>(); if(own != null) return own;
            foreach(var child in Nodes.Where(n => n.transform.parent == transform)) { var found=child.GetComponentInChildren<T>(); if(found != null) return found; }
            return null;
        }
        public void SetActive(bool enabled) { active=enabled; }
    }
    public class Transform : Component
    {
        public Transform parent;
        public void SetParent(Transform value,bool world) { parent=value; }
    }
    public sealed class RectTransform : Transform
    {
        public static double Scale;
        public Vector2 anchorMin,anchorMax,pivot,offsetMin,offsetMax,anchoredPosition,sizeDelta;
        bool StretchX { get { return anchorMax.x-anchorMin.x > .5f; } }
        bool StretchY { get { return anchorMax.y-anchorMin.y > .5f; } }
        public double Width { get { return StretchX ? ((RectTransform)parent).Width+offsetMax.x-offsetMin.x : sizeDelta.x; } }
        public double Height { get { return StretchY ? ((RectTransform)parent).Height+offsetMax.y-offsetMin.y : sizeDelta.y; } }
        public double Left { get { return (parent == null ? 0 : ((RectTransform)parent).Left)+anchoredPosition.x+(StretchX ? offsetMin.x : 0); } }
        public double Top { get { return (parent == null ? 0 : ((RectTransform)parent).Top)-anchoredPosition.y-(StretchY ? offsetMax.y : 0); } }
        public Rect rect { get { return new Rect { size=new Vector2((float)Width,(float)Height) }; } }
        public void GetWorldCorners(Vector3[] corners)
        {
            corners[0]=new Vector3((float)(Left*Scale),(float)(Screen.height-(Top+Height)*Scale),0);
            corners[2]=new Vector3((float)((Left+Width)*Scale),(float)(Screen.height-Top*Scale),0);
        }
    }
    public struct Rect { public Vector2 size; }
    public struct Vector2
    {
        public float x,y;
        public Vector2(float x,float y) { this.x=x; this.y=y; }
        public static Vector2 zero { get { return new Vector2(0,0); } }
        public static Vector2 one { get { return new Vector2(1,1); } }
    }
    public struct Vector3 { public float x,y,z; public Vector3(float x,float y,float z) { this.x=x; this.y=y; this.z=z; } }
    public struct Color { public Color(float r,float g,float b,float a=1) { } }
    public sealed class Font : Object { }
    public sealed class Canvas : Component { public static void ForceUpdateCanvases() { } }
    public static class Screen { public static int width,height; }
    public static class Mathf { public static float Min(float a,float b) { return Math.Min(a,b); } }
    public static class Application { public static bool isPlaying { get { return false; } } }
    public static class RectTransformUtility { public static Vector3 WorldToScreenPoint(Object camera,Vector3 point) { return point; } }
    public static class JsonUtility { public static string ToJson(object obj) { return ""; } }
    public static class Debug { public static void Log(string text) { } }
    public enum HorizontalWrapMode { Wrap }
    public enum VerticalWrapMode { Truncate }
    public enum TextAnchor { MiddleCenter }
}
namespace UnityEngine.Events { public delegate void UnityAction(); }
namespace UnityEngine.UI
{
    public class Image : UnityEngine.Component { public UnityEngine.Color color; }
    public sealed class Text : UnityEngine.Component
    {
        public UnityEngine.Font font; public int fontSize; public UnityEngine.Color color; public bool raycastTarget;
        public UnityEngine.HorizontalWrapMode horizontalOverflow; public UnityEngine.VerticalWrapMode verticalOverflow;
        public UnityEngine.TextAnchor alignment; public string text;
        public UnityEngine.RectTransform rectTransform { get { return (UnityEngine.RectTransform)transform; } }
    }
    public sealed class Button : UnityEngine.Component
    {
        public Image targetGraphic; public bool interactable;
        public readonly Click onClick=new Click();
        public bool IsInteractable() { return interactable; }
        public sealed class Click { public void AddListener(UnityEngine.Events.UnityAction action) { } }
    }
}
namespace SingedTerra.Encounter
{
    public enum EncounterStatus { Running }
    public sealed class Model { public int Hull=120,Tick=0,Kills=0,CommittedCannonDamage=20; public bool HasLauncher=false; public EncounterStatus Status=EncounterStatus.Running; }
    public sealed class Session { public Model Model; public bool CanRun=true,Paused=false; public string Failure=""; }
}
namespace SingedTerra.Art
{
    public sealed class TankPresentation : UnityEngine.Component { public bool showingLauncher=false; public void ToggleAttachment() { } }
}
namespace SingedTerra.LastStand
{
    public sealed class Progress
    {
        public string SaveState="ready",SaveError="";
        public int NextCost=1,Wallet=0,CannonAttackLevel=0,CannonDamage=20;
        public readonly Defeat PendingDefeat=new Defeat();
    }
    public sealed class Defeat { public int ElapsedTicks=20,Kills=0; }
    public sealed class LastStandLoopController
    {
        public string Phase,Notice=""; public bool Muted=false;
        public readonly Progress Progression=new Progress(); public readonly SingedTerra.Encounter.Session Session=new SingedTerra.Encounter.Session();
        public T GetComponent<T>() where T:new() { return new T(); }
        public void Deploy() { } public void Claim() { } public void Purchase() { } public void Redeploy() { }
        public void RetrySave() { } public void TogglePause() { } public void ToggleMute() { }
    }
}
#endif

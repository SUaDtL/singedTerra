using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace SingedTerra.LastStand
{
    // A bounded, non-interactive material layer under the live Unity labels.
    // Shared by the gameplay HUD and every modal page. Images remain the
    // semantic Button targets; only their visible material mesh is clipped.
    static class LastStandConsoleChrome
    {
        public static Image Surface(RectTransform parent, Sprite material, bool action, bool blocksPointer = true)
        {
            var image = parent.gameObject.AddComponent<LastStandConsoleSurface>();
            image.Initialize(action); image.sprite = material; image.raycastTarget = blocksPointer;
            return image;
        }
        public static LastStandConsoleFrame Frame(RectTransform parent, Texture2D material, bool action = false)
        {
            var rect = new GameObject("ConsoleFrame",typeof(RectTransform),typeof(CanvasRenderer)).GetComponent<RectTransform>();
            rect.SetParent(parent,false); rect.pivot = new Vector2(0,1);
            rect.anchorMin = Vector2.zero; rect.anchorMax = Vector2.one;
            rect.offsetMin = rect.offsetMax = Vector2.zero;
            var frame = rect.gameObject.AddComponent<LastStandConsoleFrame>(); frame.Initialize(action,material); return frame;
        }
        public static void Feedback(Button button, Text label, LastStandConsoleFrame frame)
        {
            var outline = button.gameObject.AddComponent<LastStandConsoleOutline>();
            outline.effectColor = new Color(.91f,.69f,.33f); outline.effectDistance = new Vector2(2,-2); outline.enabled = false;
            button.gameObject.AddComponent<LastStandActionFeedback>().Initialize(button,label,outline,frame);
        }
    }
    static class LastStandConsoleGeometry
    {
        public static float Cut(Rect r, bool action)
        { return Mathf.Min(action ? 6 : r.height <= 52 ? 2 : 9,Mathf.Min(r.width,r.height)/2); }
        public static Vector2 Corner(Rect r, int point, float cut)
        {
            cut = Mathf.Clamp(cut,0,Mathf.Min(r.width,r.height)/2);
            switch (point & 7)
            {
                case 0: return new Vector2(r.xMin+cut,r.yMax);
                case 1: return new Vector2(r.xMax-cut,r.yMax);
                case 2: return new Vector2(r.xMax,r.yMax-cut);
                case 3: return new Vector2(r.xMax,r.yMin+cut);
                case 4: return new Vector2(r.xMax-cut,r.yMin);
                case 5: return new Vector2(r.xMin+cut,r.yMin);
                case 6: return new Vector2(r.xMin,r.yMin+cut);
                default: return new Vector2(r.xMin,r.yMax-cut);
            }
        }
        public static void Face(VertexHelper mesh, Rect r, float cut, Color top, Color bottom)
        {
            if (r.width <= 0 || r.height <= 0) return;
            int start = mesh.currentVertCount; var center = r.center;
            mesh.AddVert(center,Color.Lerp(bottom,top,.5f),center/96);
            for (int i=0;i<=8;i++)
            {
                var point = Corner(r,i,cut);
                mesh.AddVert(point,Color.Lerp(bottom,top,(point.y-r.yMin)/r.height),point/96);
                if (i>0) mesh.AddTriangle(start,start+i,start+i+1);
            }
        }
        // Outline's displaced copies must stay in the same convex silhouette.
        // This changes decoration only, never the rectangular pointer target.
        public static void Confine(VertexHelper mesh, Rect r, float cut)
        {
            var vertex = UIVertex.simpleVert;
            for (int i=0;i<mesh.currentVertCount;i++)
            {
                mesh.PopulateUIVertex(ref vertex,i); var p = vertex.position;
                p.x = Mathf.Clamp(p.x,r.xMin,r.xMax); p.y = Mathf.Clamp(p.y,r.yMin,r.yMax);
                float shift = Mathf.Max(0,cut-(p.x-r.xMin+r.yMax-p.y))/2; p.x+=shift; p.y-=shift;
                shift = Mathf.Max(0,cut-(r.xMax-p.x+r.yMax-p.y))/2; p.x-=shift; p.y-=shift;
                shift = Mathf.Max(0,cut-(p.x-r.xMin+p.y-r.yMin))/2; p.x+=shift; p.y+=shift;
                shift = Mathf.Max(0,cut-(r.xMax-p.x+p.y-r.yMin))/2; p.x-=shift; p.y+=shift;
                vertex.position = p; mesh.SetUIVertex(vertex,i);
            }
        }
    }
    sealed class LastStandConsoleSurface : Image
    {
        bool action;
        public void Initialize(bool isAction) { action = isAction; SetVerticesDirty(); }
        protected override void OnPopulateMesh(VertexHelper mesh)
        {
            mesh.Clear(); var r = rectTransform.rect;
            LastStandConsoleGeometry.Face(mesh,r,LastStandConsoleGeometry.Cut(r,action),color,color);
        }
    }
    sealed class LastStandConsoleOutline : Outline
    {
        public override void ModifyMesh(VertexHelper mesh)
        {
            if (!IsActive()) return;
            base.ModifyMesh(mesh);
            var r = graphic.rectTransform.rect;
            LastStandConsoleGeometry.Confine(mesh,r,LastStandConsoleGeometry.Cut(r,true));
        }
    }
    // Bevels, worn brass, recessed readings and captive screws share one mesh
    // treatment. Meshes rebuild on dimensions/state changes, not every frame.
    sealed class LastStandConsoleFrame : MaskableGraphic
    {
        bool action, primary, available = true, highlighted, pressed, instruments;
        Texture2D surface;
        Rect hull, timer, disabled;
        static readonly Color Metal = new Color(.22f,.245f,.225f,1);
        static readonly Color Rim = new Color(.43f,.35f,.22f,1);
        static readonly Color EdgeLight = new Color(.67f,.56f,.37f,1);
        static readonly Color EdgeDark = new Color(.028f,.034f,.032f,1);
        static readonly Color Well = new Color(.044f,.058f,.056f,1);
        public override Texture mainTexture { get { return surface ? surface : Texture2D.whiteTexture; } }
        public void Initialize(bool isAction, Texture2D material)
        { action = isAction; surface = material; raycastTarget = false; SetVerticesDirty(); SetMaterialDirty(); }
        public void SetAction(bool isPrimary, bool isAvailable)
        {
            if (primary == isPrimary && available == isAvailable) return;
            primary = isPrimary; available = isAvailable; SetVerticesDirty();
        }
        public void SetInteraction(bool isHighlighted, bool isPressed)
        {
            if (highlighted == isHighlighted && pressed == isPressed) return;
            highlighted = isHighlighted; pressed = isPressed; SetVerticesDirty();
        }
        public void SetInstruments(bool show, Rect hullBounds, Rect timerBounds, Rect disabledBounds)
        {
            if (instruments == show && hull == hullBounds && timer == timerBounds && disabled == disabledBounds) return;
            instruments = show; hull = hullBounds; timer = timerBounds; disabled = disabledBounds; SetVerticesDirty();
        }
        static Rect Inset(Rect r, float value)
        { return new Rect(r.x + value,r.y + value,Mathf.Max(0,r.width-2*value),Mathf.Max(0,r.height-2*value)); }
        static Rect Inset(Rect r, float x, float y)
        { return new Rect(r.x+x,r.y+y,Mathf.Max(0,r.width-2*x),Mathf.Max(0,r.height-2*y)); }
        static Vector2 Corner(Rect r, int point, float cut)
        { return LastStandConsoleGeometry.Corner(r,point,cut); }
        static void Quad(VertexHelper mesh, Vector2 a, Vector2 b, Vector2 c, Vector2 d, Color color)
        {
            int start = mesh.currentVertCount;
            mesh.AddVert(a,color,a/96); mesh.AddVert(b,color,b/96);
            mesh.AddVert(c,color,c/96); mesh.AddVert(d,color,d/96);
            mesh.AddTriangle(start,start+1,start+2); mesh.AddTriangle(start+2,start+3,start);
        }
        static void Box(VertexHelper mesh, Rect r, Color color)
        { Quad(mesh,new Vector2(r.xMin,r.yMax),new Vector2(r.xMax,r.yMax),new Vector2(r.xMax,r.yMin),new Vector2(r.xMin,r.yMin),color); }
        static void Face(VertexHelper mesh, Rect r, float cut, Color top, Color bottom)
        { LastStandConsoleGeometry.Face(mesh,r,cut,top,bottom); }
        static void Ring(VertexHelper mesh, Rect outer, float width, float cut, Color top, Color bottom)
        {
            var inner = Inset(outer,width); float innerCut = Mathf.Max(0,cut-width);
            for (int i = 0; i < 8; i++)
                Quad(mesh,Corner(outer,i,cut),Corner(outer,i+1,cut),Corner(inner,i+1,innerCut),Corner(inner,i,innerCut),
                    i == 0 || i == 6 || i == 7 ? top : bottom);
        }
        static void KeyBevel(VertexHelper mesh, Rect r, float x, float y, float cut, Color top, Color bottom)
        {
            var inner = Inset(r,x,y);
            for (int i = 0; i < 8; i++)
                Quad(mesh,Corner(r,i,cut),Corner(r,i+1,cut),Corner(inner,i+1,Mathf.Max(0,cut-x)),Corner(inner,i,Mathf.Max(0,cut-x)),
                    i == 0 || i == 6 || i == 7 ? top : bottom);
        }
        static void Screw(VertexHelper mesh, Vector2 center, Color light, Color dark, float radius = 2.5f)
        {
            const int sides = 12;
            int start = mesh.currentVertCount; mesh.AddVert(center,dark,center/96);
            for (int i = 0; i <= sides; i++)
            {
                float angle = i * Mathf.PI * 2 / sides;
                var point = center + new Vector2(Mathf.Cos(angle),Mathf.Sin(angle))*radius;
                mesh.AddVert(point,i < sides/2 ? light : dark,point/96);
                if (i > 0) mesh.AddTriangle(start,start+i,start+i+1);
            }
            Box(mesh,new Rect(center.x-radius*.8f,center.y-.4f,radius*1.6f,.8f),EdgeDark);
        }
        void Instrument(VertexHelper mesh, Rect parent, Rect bounds)
        {
            var r = new Rect(parent.xMin+bounds.x,parent.yMax-bounds.y-bounds.height,bounds.width,bounds.height);
            Face(mesh,r,4,new Color(.082f,.097f,.089f,1),Well);
            Ring(mesh,r,.75f,4,Rim,EdgeDark);
            Ring(mesh,Inset(r,.75f),2.25f,3.25f,EdgeDark,Metal);
            // The recess occupies the existing four-pixel instrument margin.
            Ring(mesh,Inset(r,3),.5f,.5f,EdgeDark,new Color(.32f,.29f,.20f,1));
        }
        protected override void OnPopulateMesh(VertexHelper mesh)
        {
            mesh.Clear(); Rect r = rectTransform.rect; if (r.width < 14 || r.height < 14) return;
            Color rim = !available ? Metal : Rim;
            Color light = !available ? Metal : highlighted ? new Color(.81f,.69f,.45f,1) : EdgeLight;
            float cut = LastStandConsoleGeometry.Cut(r,action);
            if (!action && r.height <= 52)
            {
                // The short-height layout reserves only two CSS pixels of
                // padding. Its material rim must stay out of the live glyphs.
                Ring(mesh,r,1,2,light,EdgeDark); return;
            }
            if (!action)
            {
                Face(mesh,r,cut,new Color(.14f,.16f,.155f,1),new Color(.065f,.080f,.075f,1));
                Ring(mesh,r,1,cut,EdgeDark,EdgeDark);
                Ring(mesh,Inset(r,1),1,cut-1,light,EdgeDark);
                Ring(mesh,Inset(r,2),3,cut-2,rim,new Color(.16f,.13f,.085f,1));
                Ring(mesh,Inset(r,5),1,cut-5,EdgeDark,Metal);
                // Stable scuffs in the metal, contained beneath the text. The
                // mesh uses no RNG, clock, gameplay input or external asset.
                for (int i = 0; i < 8; i++)
                {
                    float x = r.xMin + 10 + ((i * 47) % 101) / 101f * (r.width-30);
                    float y = i % 2 == 0 ? r.yMax-3.5f : r.yMin+3;
                    Box(mesh,new Rect(x,y,Mathf.Min(9,r.xMax-x-10),.5f),new Color(.72f,.61f,.39f,.22f));
                }
                Screw(mesh,new Vector2(r.xMin+7,r.yMax-7),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMax-7,r.yMax-7),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMin+7,r.yMin+7),light,EdgeDark);
                Screw(mesh,new Vector2(r.xMax-7,r.yMin+7),light,EdgeDark);
            }
            else
            {
                Color top = !available ? new Color(.17f,.19f,.155f,1) : primary ? new Color(.82f,.67f,.41f,1) : new Color(.23f,.265f,.22f,1);
                Color bottom = !available ? new Color(.10f,.12f,.095f,1) : primary ? new Color(.71f,.55f,.31f,1) : new Color(.115f,.145f,.12f,1);
                Face(mesh,r,cut,pressed ? bottom : top,pressed ? top : bottom);
                // Wider side bevels and narrow top/bottom lips stay inside the
                // unchanged eight-by-two action padding. Press reverses relief.
                KeyBevel(mesh,r,1,.5f,cut,EdgeDark,EdgeDark);
                KeyBevel(mesh,Inset(r,1,.5f),4,1,cut-1,pressed ? EdgeDark : light,pressed ? light : EdgeDark);
                KeyBevel(mesh,Inset(r,5,1.5f),1,.5f,1,pressed ? rim : EdgeDark,pressed ? EdgeDark : rim);
                Screw(mesh,new Vector2(r.xMin+3.5f,r.center.y),light,EdgeDark,1.3f);
                Screw(mesh,new Vector2(r.xMax-3.5f,r.center.y),light,EdgeDark,1.3f);
                if (highlighted && available)
                    Ring(mesh,Inset(r,1),1.5f,cut-1,new Color(.96f,.82f,.5f,1),new Color(.96f,.82f,.5f,1));
            }
            if (instruments) { Instrument(mesh,r,hull); Instrument(mesh,r,timer); Instrument(mesh,r,disabled); }
            LastStandConsoleGeometry.Confine(mesh,r,cut);
        }
    }
}

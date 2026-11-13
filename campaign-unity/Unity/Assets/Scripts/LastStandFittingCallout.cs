using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;

namespace SingedTerra.LastStand
{
    // Decoration only: the fitting card and presentation retain all selection authority.
    public sealed class LastStandFittingCallout : MonoBehaviour
    {
        Canvas canvas;
        TankPresentation art;
        Func<IReadOnlyList<Renderer>> targetRenderers;
        Func<string> targetName;
        string observationPrefix="ST_LS_FITTING_CALLOUT";
        RectTransform card, layer, leader, connector, endpoint;
        RectTransform[] brackets;
        readonly List<RectTransform> routedSegments=new List<RectTransform>();
        Vector2[] route=Array.Empty<Vector2>();
        Vector2[] routeGeometry;
        public IReadOnlyList<Vector2> RoutePoints=>route;
        public Rect CardBounds {get;private set;}
        // Scrolled labels connect at their containing panel's side. The line
        // remains outside its opaque frame, including any fixed header.
        public RectTransform ConnectionPanel {get;set;}
        public RectTransform[] AvoidPanels {get;set;}=Array.Empty<RectTransform>();
        readonly Vector3[] cardCorners = new Vector3[4];
        readonly Vector2[] projectedBounds = new Vector2[8];
        public float PixelRatio { get; set; } = 1;
        public bool Visible => layer && layer.gameObject.activeSelf;
        public Vector3 AnchorWorld { get; private set; }
        public Vector2 EndpointScreen { get; private set; }
        public string TargetName { get; private set; } = "";
        public RectTransform Endpoint => endpoint;
        public RectTransform DecorationRoot => layer;
        Color tint=new Color(.94f,.91f,.80f,.92f);
        public void SetTint(Color value)
        {tint=value;if(layer)foreach(var graphic in layer.GetComponentsInChildren<Graphic>(true))graphic.color=value;}
        public void SetCard(RectTransform value)
        {if(card==value)return;card=value;GetComponents<LastStandFittingCallout>()[0].routeGeometry=null;}
        float nextObservation;
        bool observedVisible;
        bool requestedVisible;
        string observedTarget;
        int observedWidth, observedHeight;

        static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        static bool Finite(Vector3 value) => Finite(value.x) && Finite(value.y) && Finite(value.z);
        Camera UiCamera => canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : canvas.worldCamera;

        RectTransform Graphic(string name)
        {
            var rect = new GameObject(name,typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(layer,false); rect.anchorMin = rect.anchorMax = rect.pivot = new Vector2(.5f,.5f);
            var image = rect.gameObject.AddComponent<Image>();
            image.color = tint; image.raycastTarget = false;
            return rect;
        }
        public void Initialize(Canvas sharedCanvas, TankPresentation presentation, RectTransform fittingCard)
            => Initialize(sharedCanvas,presentation,fittingCard,()=>presentation.ActiveFittingRenderers,
                ()=>presentation.ActiveFittingModule?presentation.ActiveFittingModule.name:"","ST_LS_FITTING_CALLOUT");
        public void Initialize(Canvas sharedCanvas,TankPresentation presentation,RectTransform fittingCard,
            Func<IReadOnlyList<Renderer>> renderers,Func<string> name,string prefix)
        {
            if (layer) throw new InvalidOperationException("Fitting callout already initialized.");
            if (!sharedCanvas || !presentation || !fittingCard) throw new ArgumentNullException("Fitting callout references");
            canvas = sharedCanvas.rootCanvas; art = presentation; card = fittingCard;
            targetRenderers=renderers??throw new ArgumentNullException(nameof(renderers));
            targetName=name??throw new ArgumentNullException(nameof(name));
            observationPrefix=prefix;
            layer = new GameObject("FittingModuleCallout",typeof(RectTransform)).GetComponent<RectTransform>();
            layer.SetParent(transform,false); layer.anchorMin = Vector2.zero; layer.anchorMax = Vector2.one;
            layer.pivot = new Vector2(.5f,.5f); layer.offsetMin = layer.offsetMax = Vector2.zero;
            layer.SetAsFirstSibling();
            leader = Graphic("FittingLeader"); connector = Graphic("FittingConnector"); endpoint = Graphic("FittingAnchor");
            routedSegments.Add(leader);routedSegments.Add(connector);
            brackets = new RectTransform[8];
            for (int i = 0; i < brackets.Length; i++) brackets[i] = Graphic("FittingHighlight" + i);
            Refresh(false);
        }
        bool Local(Vector2 screen, out Vector2 point)
        { return RectTransformUtility.ScreenPointToLocalPointInRectangle(layer,screen,UiCamera,out point) && Finite(point.x) && Finite(point.y); }
        bool Segment(RectTransform rect, Vector2 start, Vector2 end, float pixels)
        {
            if (!Local(start,out var a) || !Local(end,out var b) || !Local(start + Vector2.up * pixels,out var side)) return false;
            Vector2 delta = b - a;
            rect.anchoredPosition = (a + b) * .5f;
            rect.sizeDelta = new Vector2(delta.magnitude,Vector2.Distance(a,side));
            rect.localRotation = Quaternion.Euler(0,0,Mathf.Atan2(delta.y,delta.x) * Mathf.Rad2Deg);
            return true;
        }
        bool ActiveBounds(IReadOnlyList<Renderer> meshes, out Bounds bounds)
        {
            bounds = default(Bounds); bool found = false;
            foreach (var mesh in meshes)
            {
                if (!mesh || !mesh.enabled || mesh.forceRenderingOff || !mesh.gameObject.activeInHierarchy ||
                    (art.view.cullingMask & (1 << mesh.gameObject.layer)) == 0) continue;
                if (!found) { bounds = mesh.bounds; found = true; } else bounds.Encapsulate(mesh.bounds);
            }
            return found && Finite(bounds.center) && Finite(bounds.size);
        }
        public void Refresh(bool visible)
        {
            requestedVisible=visible;
            RefreshGroup();
        }
        void LateUpdate(){if(GetComponents<LastStandFittingCallout>()[0]==this)RefreshGroup();}
        public void RefreshGroup()
        {
            var group=GetComponents<LastStandFittingCallout>();
            foreach(var c in group)c.UpdateDecoration(c.requestedVisible);
            var active=new List<LastStandFittingCallout>();foreach(var c in group)if(c.Visible)active.Add(c);
            if(active.Count>1)
            {
                var cards=new List<Rect>();var ends=new List<Vector2>();var geometry=new List<Vector2>();
                foreach(var c in active){cards.Add(c.CardBounds);ends.Add(c.EndpointScreen);geometry.Add(c.CardBounds.min);geometry.Add(c.CardBounds.max);geometry.Add(c.EndpointScreen);
                    if(c.ConnectionPanel){var bounds=c.ScreenBounds(c.ConnectionPanel);geometry.Add(bounds.min);geometry.Add(bounds.max);}}
                foreach(var panel in group[0].AvoidPanels)if(panel&&panel.gameObject.activeInHierarchy)
                {
                    panel.GetWorldCorners(cardCorners);
                    var lo=RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[0]);var hi=RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[2]);
                    var bounds=Rect.MinMaxRect(lo.x,lo.y,hi.x,hi.y);if(!cards.Contains(bounds))cards.Add(bounds);
                    geometry.Add(lo);geometry.Add(hi);
                }
                var leader=group[0];bool changed=leader.routeGeometry==null||leader.routeGeometry.Length!=geometry.Count;
                if(!changed)for(int i=0;i<geometry.Count;i++)if(Vector2.Distance(geometry[i],leader.routeGeometry[i])>1){changed=true;break;}
                if(changed)
                {
                    leader.routeGeometry=geometry.ToArray();
                    var prior=new List<Vector2[]>();
                    // Short local routes first leave the long routes room to go around.
                    active.Sort((a,b)=>Vector2.Distance(a.CardBounds.center,a.EndpointScreen).CompareTo(Vector2.Distance(b.CardBounds.center,b.EndpointScreen)));
                    foreach(var c in active)
                    {
                        c.route=c.ConnectionPanel?c.RouteAroundPanel(cards,prior):
                            LastStandCalloutRouting.Route(c.CardBounds,c.EndpointScreen,canvas.pixelRect,cards,prior,ends,c.PixelRatio);
                        if(c.route.Length>0)prior.Add(c.route);
                    }
                }
                foreach(var c in active)c.DrawRoute();
            }
            else
            {
                group[0].routeGeometry=null;
                foreach(var c in active){c.route=c.ConnectionPanel?c.RouteAroundPanel(Array.Empty<Rect>(),Array.Empty<Vector2[]>()):
                    new[]{c.RouteStart,c.RouteElbow,c.EndpointScreen};c.DrawRoute();}
            }
            foreach(var c in group)c.Observe();
        }
        Vector2 RouteStart,RouteElbow;
        Rect ScreenBounds(RectTransform rect)
        {
            rect.GetWorldCorners(cardCorners);
            var lo=RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[0]);
            var hi=RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[2]);
            return Rect.MinMaxRect(lo.x,lo.y,hi.x,hi.y);
        }
        static bool ContainsRect(Rect outer,Rect inner)=>inner.xMin>=outer.xMin-.1f&&inner.yMin>=outer.yMin-.1f&&
            inner.xMax<=outer.xMax+.1f&&inner.yMax<=outer.yMax+.1f;
        static bool CrossesPanel(Vector2 a,Vector2 b,Rect panel)
        {
            if(panel.Contains(a)||panel.Contains(b))return true;
            var lo=panel.min;var hi=panel.max;var tl=new Vector2(lo.x,hi.y);var br=new Vector2(hi.x,lo.y);
            return LastStandCalloutRouting.Crosses(a,b,lo,tl)||LastStandCalloutRouting.Crosses(a,b,tl,hi)||
                LastStandCalloutRouting.Crosses(a,b,hi,br)||LastStandCalloutRouting.Crosses(a,b,br,lo);
        }
        Vector2[] RouteAroundPanel(IReadOnlyList<Rect> cards,IReadOnlyList<Vector2[]> prior)
        {
            var panel=ScreenBounds(ConnectionPanel);var viewport=canvas.pixelRect;
            if(!ContainsRect(panel,CardBounds)||panel.Contains(EndpointScreen))return Array.Empty<Vector2>();
            float gap=Mathf.Max(3,6*PixelRatio);
            var interior=Rect.MinMaxRect(panel.xMin+.1f,panel.yMin+.1f,panel.xMax-.1f,panel.yMax-.1f);
            Vector2[] best=null;float bestLength=float.PositiveInfinity;
            foreach(int side in new[]{-1,1})
            {
                float margin=side<0?panel.xMin-viewport.xMin:viewport.xMax-panel.xMax;
                float clearance=Mathf.Min(gap,margin*.5f);
                if(clearance<Mathf.Max(1,1.65f*PixelRatio))continue;
                var start=new Vector2(side<0?panel.xMin:panel.xMax,CardBounds.center.y);
                var stub=start+Vector2.right*(side*clearance);
                var candidates=new[]{new[]{start,stub,EndpointScreen},
                    new[]{start,stub,new Vector2(stub.x,panel.yMax+clearance),EndpointScreen},
                    new[]{start,stub,new Vector2(stub.x,panel.yMin-clearance),EndpointScreen}};
                foreach(var candidate in candidates)
                {
                    bool clear=true;float length=0;
                    for(int i=0;i<candidate.Length&&clear;i++)
                    {
                        if(!viewport.Contains(candidate[i])){clear=false;break;}
                        if(i==0)continue;
                        var a=candidate[i-1];var b=candidate[i];length+=Vector2.Distance(a,b);
                        if(CrossesPanel(a,b,interior)){clear=false;break;}
                        foreach(var card in cards)if(CrossesPanel(a,b,card)){clear=false;break;}
                        foreach(var obstacle in AvoidPanels)if(obstacle&&obstacle.gameObject.activeInHierarchy&&CrossesPanel(a,b,ScreenBounds(obstacle))){clear=false;break;}
                        foreach(var placed in prior)for(int j=1;j<placed.Length;j++)
                            if(LastStandCalloutRouting.Crosses(a,b,placed[j-1],placed[j])||
                                LastStandCalloutRouting.Distance(a,placed[j-1],placed[j])<gap*.5f||
                                LastStandCalloutRouting.Distance(b,placed[j-1],placed[j])<gap*.5f){clear=false;break;}
                    }
                    if(clear&&length<bestLength){best=candidate;bestLength=length;}
                }
            }
            return best??Array.Empty<Vector2>();
        }
        void DrawRoute()
        {
            if(route.Length<2){layer.gameObject.SetActive(false);return;}
            // Keep the final endpoint exact between bounded routing updates.
            route[route.Length-1]=EndpointScreen;
            while(routedSegments.Count<route.Length-1)routedSegments.Add(Graphic("FittingRoute"+routedSegments.Count));
            for(int i=0;i<routedSegments.Count;i++)
            {
                bool show=i<route.Length-1;routedSegments[i].gameObject.SetActive(show);
                if(show)Segment(routedSegments[i],route[i],route[i+1],1.65f*PixelRatio);
            }
        }
        void UpdateDecoration(bool visible)
        {
            if (!layer) return;
            layer.gameObject.SetActive(false); TargetName = "";
            if (!visible || !isActiveAndEnabled || !art || !art.isActiveAndEnabled || art.EncounterActive ||
                !art.view || !art.view.isActiveAndEnabled || !canvas ||
                !canvas.isActiveAndEnabled || !card || !card.gameObject.activeInHierarchy ||
                (canvas.renderMode != RenderMode.ScreenSpaceOverlay && !canvas.worldCamera)) return;
            var meshes = targetRenderers();
            var name = targetName();
            if (meshes==null || string.IsNullOrEmpty(name) || !ActiveBounds(meshes,out var bounds)) return;
            var camera = art.view;
            var center = camera.WorldToScreenPoint(bounds.center);
            var viewport = camera.pixelRect; var uiViewport = canvas.pixelRect;
            var clip = Rect.MinMaxRect(Mathf.Max(viewport.xMin,uiViewport.xMin),Mathf.Max(viewport.yMin,uiViewport.yMin),
                Mathf.Min(viewport.xMax,uiViewport.xMax),Mathf.Min(viewport.yMax,uiViewport.yMax));
            if (!Finite(center) || center.z <= camera.nearClipPlane || center.z >= camera.farClipPlane || clip.width <= 0 || clip.height <= 0 ||
                !clip.Contains(new Vector2(center.x,center.y))) return;
            float minX = float.PositiveInfinity, minY = float.PositiveInfinity;
            float maxX = float.NegativeInfinity, maxY = float.NegativeInfinity;
            for (int i = 0; i < projectedBounds.Length; i++)
            {
                var corner = bounds.center + Vector3.Scale(bounds.extents,new Vector3((i & 1) == 0 ? -1 : 1,
                    (i & 2) == 0 ? -1 : 1,(i & 4) == 0 ? -1 : 1));
                var point = camera.WorldToScreenPoint(corner);
                if (!Finite(point) || point.z <= camera.nearClipPlane || point.z >= camera.farClipPlane) return;
                projectedBounds[i] = point;
                minX = Mathf.Min(minX,point.x); maxX = Mathf.Max(maxX,point.x);
                minY = Mathf.Min(minY,point.y); maxY = Mathf.Max(maxY,point.y);
            }
            card.GetWorldCorners(cardCorners);
            Vector2 bottomLeft = RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[0]);
            Vector2 topRight = RectTransformUtility.WorldToScreenPoint(UiCamera,cardCorners[2]);
            var end = new Vector2(center.x,center.y);
            // No misleading line when a panel covers the attachment.
            var panel = Rect.MinMaxRect(bottomLeft.x,bottomLeft.y,topRight.x,topRight.y);
            CardBounds=panel;
            if (!Finite(bottomLeft.x) || !Finite(bottomLeft.y) || !Finite(topRight.x) || !Finite(topRight.y) || panel.Contains(end)) return;
            // A scrolling editor can move a bay label behind its viewport.
            // Follow actual geometry each frame and never point from hidden text.
            if(ConnectionPanel&&!ContainsRect(uiViewport,panel))return;
            foreach(var mask in card.GetComponentsInParent<RectMask2D>())
                if(mask.isActiveAndEnabled&&!ContainsRect(ScreenBounds(mask.rectTransform),panel))return;
            float ratio = Finite(PixelRatio) && PixelRatio > 0 ? PixelRatio : 1;
            float thickness = 1.65f * ratio;
            bool beside = end.x > panel.xMax + 12 * ratio || end.x < panel.xMin - 12 * ratio;
            Vector2 start, elbow;
            if (beside)
            {
                float side = end.x > panel.center.x ? 1 : -1;
                start = new Vector2(side > 0 ? panel.xMax : panel.xMin,panel.center.y);
                elbow = start + new Vector2(side * 20 * ratio,0);
            }
            else
            {
                float side = end.y > panel.center.y ? 1 : -1;
                start = new Vector2(panel.center.x,side > 0 ? panel.yMax : panel.yMin);
                elbow = start + new Vector2(0,side * 18 * ratio);
            }
            if (!Segment(leader,start,elbow,thickness) || !Segment(connector,elbow,end,thickness) ||
                !Local(end,out var localEnd) || !Local(end + Vector2.one * 5 * ratio,out var dotSize)) return;
            endpoint.anchoredPosition = localEnd;
            endpoint.sizeDelta = new Vector2(Mathf.Abs(dotSize.x-localEnd.x),Mathf.Abs(dotSize.y-localEnd.y));
            minX = Mathf.Max(clip.xMin,minX - 3 * ratio); maxX = Mathf.Min(clip.xMax,maxX + 3 * ratio);
            minY = Mathf.Max(clip.yMin,minY - 3 * ratio); maxY = Mathf.Min(clip.yMax,maxY + 3 * ratio);
            float length = Mathf.Min(8 * ratio,Mathf.Min(maxX-minX,maxY-minY) * .35f);
            for (int i = 0; i < 4; i++)
            {
                float x = (i & 1) == 0 ? minX : maxX, y = (i & 2) == 0 ? minY : maxY;
                var corner = new Vector2(x,y);
                if (!Segment(brackets[i*2],corner,corner + new Vector2((i & 1) == 0 ? length : -length,0),thickness) ||
                    !Segment(brackets[i*2+1],corner,corner + new Vector2(0,(i & 2) == 0 ? length : -length),thickness)) return;
            }
            AnchorWorld = bounds.center; EndpointScreen = end; TargetName = name;
            RouteStart=start;RouteElbow=elbow;
            layer.gameObject.SetActive(true);
        }
        [Serializable] sealed class Observation
        {
            public bool visible;
            public string target;
            public int width,height;
            public float pixelRatio;
            public Vector3 anchorWorld,projectedAnchor;
            public Vector2 endpointScreen;
        }
        void Observe()
        {
            if(!Application.isPlaying || !layer)return;
            bool changed=observedVisible!=Visible || observedTarget!=TargetName || observedWidth!=Screen.width || observedHeight!=Screen.height;
            if(!changed && (!Visible || Time.unscaledTime<nextObservation))return;
            observedVisible=Visible;observedTarget=TargetName;observedWidth=Screen.width;observedHeight=Screen.height;
            nextObservation=Time.unscaledTime+.5f;
            Debug.Log(observationPrefix+" "+JsonUtility.ToJson(new Observation {
                visible=Visible,target=TargetName,width=Screen.width,height=Screen.height,pixelRatio=PixelRatio,
                anchorWorld=AnchorWorld,projectedAnchor=Visible?art.view.WorldToScreenPoint(AnchorWorld):Vector3.zero,
                endpointScreen=Visible?RectTransformUtility.WorldToScreenPoint(UiCamera,endpoint.position):Vector2.zero }));
        }
        void OnDisable() { if (layer) layer.gameObject.SetActive(false); }
    }
}

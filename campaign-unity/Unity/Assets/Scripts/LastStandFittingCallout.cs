using System;
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
        RectTransform card, layer, leader, connector, endpoint;
        RectTransform[] brackets;
        readonly Vector3[] cardCorners = new Vector3[4];
        readonly Vector2[] projectedBounds = new Vector2[8];
        public float PixelRatio { get; set; } = 1;
        public bool Visible => layer && layer.gameObject.activeSelf;
        public Vector3 AnchorWorld { get; private set; }
        public Vector2 EndpointScreen { get; private set; }
        public string TargetName { get; private set; } = "";
        public RectTransform Endpoint => endpoint;
        public RectTransform DecorationRoot => layer;
        float nextObservation;
        bool observedVisible;
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
            image.color = new Color(.91f,.69f,.33f,.86f); image.raycastTarget = false;
            return rect;
        }
        public void Initialize(Canvas sharedCanvas, TankPresentation presentation, RectTransform fittingCard)
        {
            if (layer) throw new InvalidOperationException("Fitting callout already initialized.");
            if (!sharedCanvas || !presentation || !fittingCard) throw new ArgumentNullException("Fitting callout references");
            canvas = sharedCanvas.rootCanvas; art = presentation; card = fittingCard;
            layer = new GameObject("FittingModuleCallout",typeof(RectTransform)).GetComponent<RectTransform>();
            layer.SetParent(transform,false); layer.anchorMin = Vector2.zero; layer.anchorMax = Vector2.one;
            layer.pivot = new Vector2(.5f,.5f); layer.offsetMin = layer.offsetMax = Vector2.zero;
            layer.SetAsFirstSibling();
            leader = Graphic("FittingLeader"); connector = Graphic("FittingConnector"); endpoint = Graphic("FittingAnchor");
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
        bool ActiveBounds(Renderer[] meshes, out Bounds bounds)
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
            UpdateDecoration(visible);
            Observe();
        }
        void UpdateDecoration(bool visible)
        {
            if (!layer) return;
            layer.gameObject.SetActive(false); TargetName = "";
            if (!visible || !isActiveAndEnabled || !art || !art.isActiveAndEnabled || art.EncounterActive ||
                !art.view || !art.view.isActiveAndEnabled || !canvas ||
                !canvas.isActiveAndEnabled || !card || !card.gameObject.activeInHierarchy ||
                (canvas.renderMode != RenderMode.ScreenSpaceOverlay && !canvas.worldCamera)) return;
            var module = art.ActiveFittingModule;
            var meshes = art.ActiveFittingRenderers;
            if (!module || !module.activeInHierarchy || !ActiveBounds(meshes,out var bounds)) return;
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
            if (!Finite(bottomLeft.x) || !Finite(bottomLeft.y) || !Finite(topRight.x) || !Finite(topRight.y) || panel.Contains(end)) return;
            float ratio = Finite(PixelRatio) && PixelRatio > 0 ? PixelRatio : 1;
            float thickness = 1.35f * ratio;
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
            AnchorWorld = bounds.center; EndpointScreen = end; TargetName = module.name;
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
            Debug.Log("ST_LS_FITTING_CALLOUT "+JsonUtility.ToJson(new Observation {
                visible=Visible,target=TargetName,width=Screen.width,height=Screen.height,pixelRatio=PixelRatio,
                anchorWorld=AnchorWorld,projectedAnchor=Visible?art.view.WorldToScreenPoint(AnchorWorld):Vector3.zero,
                endpointScreen=Visible?RectTransformUtility.WorldToScreenPoint(UiCamera,endpoint.position):Vector2.zero }));
        }
        void OnDisable() { if (layer) layer.gameObject.SetActive(false); }
    }
}

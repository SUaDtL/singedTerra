using System;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.Art
{
    // Inspection decoration only. The existing presentation owns cameras and fittings.
    public sealed class TankPartCallouts : MonoBehaviour
    {
        sealed class Row
        {
            public string id;
            public RectTransform panel, first, second, dot;
            public Text title;
            public Renderer[] meshes;
            public Transform target;
            public Vector3 anchor, screen;
            public bool visible;
        }
        TankPresentation owner;
        RectTransform root, controls;
        Row[] rows;
        Renderer[] repairMeshes, launcherMeshes;
        readonly Vector3[] corners = new Vector3[4];
        readonly Color ink = new Color(.055f,.068f,.064f,.94f);
        readonly Color gold = new Color(.76f,.61f,.34f,1f);
        float reportDelay = 1.3f;
        int lastWidth, lastHeight;
        static RectTransform Node(string name, Transform parent)
        {
            var node = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            node.SetParent(parent,false);
            node.anchorMin = node.anchorMax = node.pivot = new Vector2(.5f,.5f);
            return node;
        }
        RectTransform Graphic(string name, Color color)
        {
            var node = Node(name,root);
            var image = node.gameObject.AddComponent<Image>();
            image.color = color; image.raycastTarget = false;
            return node;
        }
        Text Label(RectTransform panel, string value, int size, float y, Font font, Color color)
        {
            var node = Node("Label",panel);
            node.anchorMin = node.anchorMax = node.pivot = new Vector2(0,1);
            node.anchoredPosition = new Vector2(14,y); node.sizeDelta = new Vector2(224,22);
            var text = node.gameObject.AddComponent<Text>();
            text.font = font; text.text = value; text.fontSize = size; text.color = color;
            text.raycastTarget = false; return text;
        }
        Row MakeRow(string id, Transform target, string title, string detail, Font font)
        {
            var row = new Row { id=id, target=target, meshes=target.GetComponentsInChildren<Renderer>(true) };
            row.first = Graphic(id+"Leader",gold); row.second = Graphic(id+"Connector",gold);
            row.dot = Graphic(id+"Anchor",gold); row.dot.sizeDelta = new Vector2(6,6);
            row.panel = Graphic(id+"Panel",ink); row.panel.sizeDelta = new Vector2(252,64);
            row.title = Label(row.panel,title,16,-10,font,gold);
            Label(row.panel,detail,11,-36,font,new Color(.88f,.85f,.74f,1));
            if(row.meshes.Length==0) throw new InvalidOperationException("No callout mesh: "+id);
            return row;
        }
        public void Initialize(Canvas canvas, TankPresentation presentation, Font font, RectTransform inspectionControls)
        {
            if(owner) throw new InvalidOperationException("Callouts already initialized");
            owner=presentation; controls=inspectionControls;
            root=Node("PartCallouts",canvas.transform);
            root.anchorMin=Vector2.zero; root.anchorMax=Vector2.one; root.sizeDelta=Vector2.zero;
            root.anchoredPosition=Vector2.zero; root.SetAsFirstSibling();
            Transform hull=null;
            foreach(var part in owner.tank.GetComponentsInChildren<Transform>(true))
                if(part.name=="Hull") { hull=part; break; }
            if(!hull) throw new InvalidOperationException("Authored hull missing");
            repairMeshes=owner.repairModule.GetComponentsInChildren<Renderer>(true);
            launcherMeshes=owner.launcherModule.GetComponentsInChildren<Renderer>(true);
            bool review=owner.GetComponent<SingedTerra.VisualReview.BattlefieldReview>();
            rows=new[] {
                MakeRow("cannon",owner.barrel,"MAIN CANNON","Articulated barrel assembly",font),
                MakeRow("hull",hull,"ARMORED HULL","Persistent vehicle silhouette",font),
                MakeRow("fitting",owner.repairModule.transform,"FIELD REPAIR UNIT",review?"Active fitting for this encounter":"Optional fitting / appearance sample",font)
            };
            owner.Changed+=QueueReport;
        }
        void QueueReport() { reportDelay=1.3f; }
        static void Segment(RectTransform rect, Vector2 a, Vector2 b)
        {
            var delta=b-a; rect.anchoredPosition=(a+b)*.5f;
            rect.sizeDelta=new Vector2(delta.magnitude,1.5f);
            rect.localRotation=Quaternion.Euler(0,0,Mathf.Atan2(delta.y,delta.x)*Mathf.Rad2Deg);
        }
        void LateUpdate()
        {
            if(!owner || rows==null) return;
            if(lastWidth!=Screen.width || lastHeight!=Screen.height)
            { lastWidth=Screen.width; lastHeight=Screen.height; QueueReport(); }
            bool shown=!owner.battlefield && owner.ShowPartCallouts;
            root.gameObject.SetActive(shown);
            rows[2].target=owner.showingLauncher?owner.launcherModule.transform:owner.repairModule.transform;
            rows[2].meshes=owner.showingLauncher?launcherMeshes:repairMeshes;
            rows[2].title.text=owner.showingLauncher?"AUXILIARY LAUNCHER":"FIELD REPAIR UNIT";
            for(int i=0;i<rows.Length;i++)
            {
                var row=rows[i]; var bounds=row.meshes[0].bounds;
                for(int j=1;j<row.meshes.Length;j++) bounds.Encapsulate(row.meshes[j].bounds);
                row.anchor=bounds.center; row.screen=owner.view.WorldToScreenPoint(row.anchor);
                row.visible=shown && row.target.gameObject.activeInHierarchy && row.screen.z>0
                    && row.screen.x>=0 && row.screen.x<=Screen.width && row.screen.y>=0 && row.screen.y<=Screen.height;
                row.panel.gameObject.SetActive(row.visible); row.first.gameObject.SetActive(row.visible);
                row.second.gameObject.SetActive(row.visible); row.dot.gameObject.SetActive(row.visible);
                if(!row.visible) continue;
                float side=i==2?1f:-1f;
                row.panel.anchoredPosition=new Vector2(side*(root.rect.width*.5f-162f),root.rect.height*(i==0?.13f:i==1?-.14f:.04f));
                RectTransformUtility.ScreenPointToLocalPointInRectangle(root,row.screen,null,out var end);
                Vector2 start=row.panel.anchoredPosition-new Vector2(side*126f,0);
                Vector2 elbow=start-new Vector2(side*30f,0);
                Segment(row.first,start,elbow); Segment(row.second,elbow,end); row.dot.anchoredPosition=end;
            }
            if(reportDelay>=0)
            {
                reportDelay-=Time.unscaledDeltaTime;
                if(reportDelay<0) EmitReceipt();
            }
        }
        [Serializable] sealed class PartReceipt
        {
            public string id, target, label;
            public bool visible;
            public Vector3 anchorWorld, anchorScreen;
            public Vector2 endpointScreen, panelMin, panelMax;
        }
        [Serializable] sealed class InspectionReceipt
        {
            public int width,height;
            public string view;
            public bool requested, controlsVisible;
            public float yaw;
            public Vector3 cameraPosition, cameraForward;
            public Quaternion tankRotation, turretRotation;
            public PartReceipt[] parts;
        }
        void EmitReceipt()
        {
            var parts=new PartReceipt[rows.Length];
            for(int i=0;i<rows.Length;i++)
            {
                var row=rows[i]; row.panel.GetWorldCorners(corners);
                parts[i]=new PartReceipt { id=row.id,target=row.target.name,label=row.title.text,visible=row.visible,
                    anchorWorld=row.anchor,anchorScreen=row.screen,
                    endpointScreen=RectTransformUtility.WorldToScreenPoint(null,row.dot.position),
                    panelMin=RectTransformUtility.WorldToScreenPoint(null,corners[0]),
                    panelMax=RectTransformUtility.WorldToScreenPoint(null,corners[2]) };
            }
            Debug.Log("ST_ART_INSPECTION "+JsonUtility.ToJson(new InspectionReceipt {
                width=Screen.width,height=Screen.height,view=owner.battlefield?"battlefield":"inspection",
                requested=owner.ShowPartCallouts,controlsVisible=controls.gameObject.activeInHierarchy,
                yaw=owner.InspectionYaw,cameraPosition=owner.view.transform.position,
                cameraForward=owner.view.transform.forward,tankRotation=owner.tank.rotation,
                turretRotation=owner.turret.localRotation,parts=parts }));
        }
        void OnDestroy()
        {
            if(owner) owner.Changed-=QueueReport;
            if(root) Destroy(root.gameObject);
        }
    }
}

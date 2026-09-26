using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
namespace SingedTerra.Art
{
    public sealed class ArtHud : MonoBehaviour
    {
        public TankPresentation presentation;
        Font font; Canvas canvas; Text viewLabel,partLabel,motionLabel,partDetail;
        RectTransform inspectionControls; Text calloutLabel;
        Transform[] artNodes;
        readonly Color ink=new Color(.055f,.068f,.064f,.93f);
        readonly Color gold=new Color(.76f,.61f,.34f,1);
        readonly Color paper=new Color(.88f,.85f,.74f,1);
        RectTransform Rect(string name,Transform parent,Vector2 anchor,Vector2 pivot,Vector2 pos,Vector2 size)
        {
            var g=new GameObject(name,typeof(RectTransform));g.transform.SetParent(parent,false);
            var r=(RectTransform)g.transform;r.anchorMin=r.anchorMax=anchor;r.pivot=pivot;
            r.anchoredPosition=pos;r.sizeDelta=size;return r;
        }
        Text Label(Transform parent,string name,string value,int size,Vector2 pos,Vector2 extent,Color color)
        {
            var r=Rect(name,parent,new Vector2(0,1),new Vector2(0,1),pos,extent);
            var t=r.gameObject.AddComponent<Text>();t.font=font;t.text=value;t.fontSize=size;
            t.color=color;t.raycastTarget=false;t.horizontalOverflow=HorizontalWrapMode.Wrap;
            t.verticalOverflow=VerticalWrapMode.Truncate;return t;
        }
        RectTransform Panel(string name,Vector2 anchor,Vector2 pivot,Vector2 pos,Vector2 size)
        {
            var r=Rect(name,canvas.transform,anchor,pivot,pos,size);
            r.gameObject.AddComponent<Image>().color=ink;return r;
        }
        Text Button(string name,string value,float x,UnityEngine.Events.UnityAction action)
        {
            var r=Rect(name,canvas.transform,new Vector2(.5f,0),new Vector2(.5f,0),new Vector2(x,32),new Vector2(212,52));
            r.gameObject.AddComponent<Image>().color=new Color(.16f,.17f,.13f,.98f);
            var b=r.gameObject.AddComponent<Button>();var c=b.colors;
            c.normalColor=Color.white;c.highlightedColor=new Color(1.3f,1.2f,.9f);c.pressedColor=gold;b.colors=c;
            b.onClick.AddListener(action);
            var text=Label(r,"Label",value,17,new Vector2(8,-4),new Vector2(196,44),paper);
            text.alignment=TextAnchor.MiddleCenter;return text;
        }
        void Start()
        {
            bool review=presentation.GetComponent<SingedTerra.VisualReview.BattlefieldReview>();
            font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var g=new GameObject("ArtInterface",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));
            g.transform.SetParent(transform,false);canvas=g.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;
            var scaler=g.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution=new Vector2(1600,900);scaler.matchWidthOrHeight=.5f;
            if(!FindFirstObjectByType<EventSystem>())new GameObject("ArtInput",typeof(EventSystem),typeof(StandaloneInputModule)).transform.SetParent(transform,false);
            var title=Panel("Identity",new Vector2(0,1),new Vector2(0,1),new Vector2(28,-28),new Vector2(330,116));
            Label(title,"Brand","singedTerra",32,new Vector2(18,-12),new Vector2(300,40),gold);
            Label(title,"Slice",review?"LAST STAND 01 / PREPARATION":"STARTER 01  /  FIELD ASSEMBLY",16,new Vector2(20,-61),new Vector2(294,25),paper);
            Label(title,"Stage",review?"INSPECT, FIT, THEN DEPLOY":"WORKING ART  -  NO COMBAT",12,new Vector2(20,-88),new Vector2(294,20),gold);
            var part=Panel("Attachment",new Vector2(1,1),new Vector2(1,1),new Vector2(-28,-28),new Vector2(285,106));
            Label(part,"Heading","OPTIONAL FITTING",13,new Vector2(18,-13),new Vector2(250,22),gold);
            partDetail=Label(part,"Part","",20,new Vector2(18,-38),new Vector2(250,30),paper);
            Label(part,"Note",review?"Active fitting; locked when deployed.":"Appearance sample; no selected item stats.",12,new Vector2(18,-77),new Vector2(255,22),paper);
            viewLabel=Button("View","",-342,presentation.ToggleView);
            partLabel=Button("Attachment","",-114,presentation.ToggleAttachment);
            Button("Preview","PREVIEW RECOIL",114,presentation.PreviewMotion);
            motionLabel=Button("Motion","",342,presentation.ToggleMotion);
            var footer=Rect("Footer",canvas.transform,new Vector2(.5f,0),new Vector2(.5f,0),new Vector2(0,8),new Vector2(900,20));
            var f=footer.gameObject.AddComponent<Text>();f.font=font;f.fontSize=11;f.color=gold;f.alignment=TextAnchor.MiddleCenter;
            f.text=review?"ONE TANK. HOLD THE POSITION.":"ONE TANK. ROOM TO GROW.   /   UNITY WEB ART SLICE";f.raycastTarget=false;
            inspectionControls=Rect("InspectionControls",canvas.transform,new Vector2(.5f,0),new Vector2(.5f,0),Vector2.zero,Vector2.zero);
            InspectionButton("OrbitLeft","ORBIT LEFT",-342,presentation.OrbitLeft);
            InspectionButton("OrbitRight","ORBIT RIGHT",-114,presentation.OrbitRight);
            InspectionButton("OrbitReset","FRONT VIEW",114,presentation.ResetInspection);
            calloutLabel=InspectionButton("Callouts","",342,presentation.ToggleCallouts);
            gameObject.AddComponent<TankPartCallouts>().Initialize(canvas,presentation,font,inspectionControls);
            presentation.Changed+=Refresh;Refresh();
            artNodes=new Transform[canvas.transform.childCount];
            for(int i=0;i<artNodes.Length;i++)artNodes[i]=canvas.transform.GetChild(i);
            gameObject.AddComponent<SingedTerra.Encounter.EncounterSession>().Initialize(presentation,this,canvas,font);
        }
        Text InspectionButton(string name,string value,float x,UnityEngine.Events.UnityAction action)
        {
            var text=Button(name,value,x,action);
            var r=(RectTransform)text.transform.parent;
            r.SetParent(inspectionControls,false);r.anchoredPosition=new Vector2(x,96);
            return text;
        }
        void Refresh()
        {
            if(!viewLabel)return;
            inspectionControls.gameObject.SetActive(!presentation.battlefield);
            calloutLabel.text=presentation.ShowPartCallouts?"HIDE PART LABELS":"SHOW PART LABELS";
            viewLabel.text=presentation.battlefield?"INSPECTION VIEW":"BATTLEFIELD VIEW";
            partLabel.text=presentation.showingLauncher?"FIT REPAIR UNIT":"FIT LAUNCHER";
            motionLabel.text=presentation.animate?"PAUSE IDLE MOTION":"RESUME IDLE MOTION";
            partDetail.text=presentation.showingLauncher?"AUXILIARY LAUNCHER":"FIELD REPAIR UNIT";
        }
        public void SetEncounterVisible(bool active)
        {
            foreach(var node in artNodes)node.gameObject.SetActive(!active);
            if(!active)Refresh();
        }
        void OnDestroy(){if(presentation)presentation.Changed-=Refresh;}
    }
}

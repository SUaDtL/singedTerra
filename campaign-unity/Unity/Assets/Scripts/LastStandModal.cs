using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace SingedTerra.LastStand
{
    // Shared chrome/layout plumbing for all modal surfaces. It uses
    // the same clipped material mesh and feedback component as existing menus.
    internal sealed class LastStandModal
    {
        readonly LastStandUiPrimitives ui;
        readonly Sprite surface;
        float sx=1,sy=1;
        bool statusInContent;
        public readonly RectTransform Shade,Panel;
        public readonly Text Title,Status;
        public readonly Button Close;
        public readonly List<Button> Buttons=new List<Button>();
        public float PanelHeight {get;private set;}
        public float HeaderBottom {get;private set;}
        static readonly Color Paper=new Color(.94f,.91f,.80f),Brass=new Color(.91f,.69f,.33f);
        internal static RectTransform Node(string name,Transform parent)=>LastStandUiPrimitives.Node(name,parent);
        internal static void Position(RectTransform rect,float x,float y,float w,float h)=>LastStandUiPrimitives.Place(rect,x,y,w,h);
        public LastStandModal(string name,Transform parent,Font font,Action close,Texture2D metal,Sprite surface)
        {
            ui=new LastStandUiPrimitives(font,metal,surface);this.surface=surface;
            Shade=Node(name+"Modal",parent);Shade.gameObject.AddComponent<Image>().color=new Color(0,0,0,.82f);
            Panel=Node(name+"Panel",Shade);LastStandConsoleChrome.Surface(Panel,surface,false).color=new Color(.12f,.15f,.13f);
            LastStandConsoleChrome.Frame(Panel,metal);Title=Text(name+"Heading",Panel,22);Title.color=Brass;
            Status=Text(name+"Status",Panel,16);Close=Button(name+"Close","CLOSE",Panel,close);
        }
        public Text Text(string name,Transform parent,int size)=>ui.Text(name,parent,size);
        public Button Button(string name,string label,Transform parent,Action handler)
        {var button=ui.Button(name,label,parent,handler);Buttons.Add(button);return button;}
        public void Style(Button button,bool available,bool selected)=>LastStandUiPrimitives.Style(button,available,selected);
        public LastStandScrollPane Pane(string name,bool scrollStatus=false)
        {
            var pane=new LastStandScrollPane(name,Panel,surface);
            if(scrollStatus){Status.transform.SetParent(pane.Content,false);statusInContent=true;}
            return pane;
        }
        public void Place(Component item,float x,float y,float w,float h)=>Position((RectTransform)item.transform,x*sx,y*sy,w*sx,h*sy);
        public float Preferred(Text text,float width)=>ui.Preferred(text,width,sx,sy);
        public float Layout(float width,float height,float unitsX,float unitsY,float maxWidth)
        {
            sx=unitsX;sy=unitsY;float w=Math.Min(maxWidth,width-16);PanelHeight=height-16;
            Position(Shade,0,0,width*sx,height*sy);Position(Panel,(width-w)/2*sx,8*sy,w*sx,PanelHeight*sy);
            ui.ScaleText(sy);
            Place(Title,12,12,w-124,44);Place(Close,w-104,12,92,44);
            if(statusInContent)HeaderBottom=64;
            else{float statusHeight=Preferred(Status,w-24)+8;Place(Status,12,64,w-24,statusHeight);HeaderBottom=64+statusHeight+8;}
            return w;
        }
    }
}

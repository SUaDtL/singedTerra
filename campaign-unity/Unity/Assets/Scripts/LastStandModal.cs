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
            float w=Math.Min(maxWidth,width-16);
            return LayoutFrame(width,height,unitsX,unitsY,new Rect((width-w)/2,8,w,height-16));
        }
        public float LayoutFloating(float width,float height,float unitsX,float unitsY,float maxWidth,float maxHeight)
        {
            float w=Math.Min(maxWidth,width-16),h=Math.Min(maxHeight,height-16);
            return LayoutFrame(width,height,unitsX,unitsY,new Rect(width-w-8,height-h-8,w,h));
        }
        float LayoutFrame(float width,float height,float unitsX,float unitsY,Rect bounds)
        {
            sx=unitsX;sy=unitsY;float w=bounds.width;PanelHeight=bounds.height;
            Position(Shade,0,0,width*sx,height*sy);Position(Panel,bounds.x*sx,bounds.y*sy,w*sx,PanelHeight*sy);
            ui.ScaleText(sy);
            Place(Title,12,12,w-124,44);Place(Close,w-104,12,92,44);
            if(statusInContent||!Status.gameObject.activeSelf)HeaderBottom=64;
            else{float statusHeight=Preferred(Status,w-24)+8;Place(Status,12,64,w-24,statusHeight);HeaderBottom=64+statusHeight+8;}
            return w;
        }
        // The center describes what the arrows change. All pages retain the
        // same target size and wrapping behavior as labels grow with content.
        public float Selector(Component label,Button previous,Button next,float x,float y,float width)
        {
            var text=label is Text value?value:label.GetComponentInChildren<Text>();
            float row=Math.Max(44,Preferred(text,width-104)+8);
            float buttonTop=y+(row-44)/2;
            Place(previous,x,buttonTop,44,44);Place(label,x+52,y,width-104,row);
            Place(next,x+width-44,buttonTop,44,44);return y+row+12;
        }
    }
}

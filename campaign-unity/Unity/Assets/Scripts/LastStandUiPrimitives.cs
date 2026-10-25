using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SingedTerra.LastStand
{
    // One presentation vocabulary. Features supply content and actions; the
    // factory owns their material, typography and interaction treatment.
    internal sealed class LastStandUiPrimitives
    {
        public static readonly Color Ink = new Color(.055f,.068f,.064f);
        public static readonly Color Graphite = new Color(.17f,.19f,.155f);
        public static readonly Color Paper = new Color(.94f,.91f,.80f);
        public static readonly Color Brass = new Color(.91f,.69f,.33f);
        public static readonly Color Olive = new Color(.24f,.27f,.205f);
        public static readonly Color DisabledSurface = new Color(.14f,.16f,.135f);
        public static readonly Color DisabledPaper = new Color(.76f,.75f,.67f);
        readonly Font font;
        readonly Texture2D metal;
        readonly Sprite surface;
        readonly Dictionary<Text,int> sizes = new Dictionary<Text,int>();

        public LastStandUiPrimitives(Font font, Texture2D metal, Sprite surface)
        { this.font=font; this.metal=metal; this.surface=surface; }

        public static RectTransform Node(string name, Transform parent)
        {
            var rect=new GameObject(name,typeof(RectTransform)).GetComponent<RectTransform>();
            rect.SetParent(parent,false); rect.anchorMin=rect.anchorMax=rect.pivot=new Vector2(0,1);
            return rect;
        }
        public static void Place(RectTransform rect,float x,float y,float width,float height)
        { rect.anchoredPosition=new Vector2(x,-y);rect.sizeDelta=new Vector2(width,height); }

        public Text Text(string name,Transform parent,int size)
        {
            var text=Node(name,parent).gameObject.AddComponent<Text>();
            text.font=font;text.fontSize=size;text.color=Paper;text.raycastTarget=false;text.supportRichText=false;
            text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Truncate;
            sizes.Add(text,size);return text;
        }
        public RectTransform Panel(string name,Transform parent,bool blocksPointer=false,bool framed=true)
        {
            var rect=Node(name,parent);
            LastStandConsoleChrome.Surface(rect,surface,false,blocksPointer).color=Graphite;
            if(framed)LastStandConsoleChrome.Frame(rect,metal);return rect;
        }
        public Button Button(string name,string label,Transform parent,Action handler,int size=16,bool stretchLabel=true)
        {
            var rect=Node(name,parent);var image=LastStandConsoleChrome.Surface(rect,surface,true);
            var frame=LastStandConsoleChrome.Frame(rect,metal,true);
            var button=rect.gameObject.AddComponent<Button>();button.targetGraphic=image;
            var colors=button.colors;colors.normalColor=colors.disabledColor=Color.white;
            colors.selectedColor=colors.highlightedColor=new Color(1.10f,1.10f,1.06f);
            colors.pressedColor=new Color(.85f,.85f,.85f);colors.fadeDuration=.08f;button.colors=colors;
            button.onClick.AddListener(()=>handler());
            var text=Text(name+"Text",rect,size);text.text=label;text.alignment=TextAnchor.MiddleCenter;
            if(stretchLabel)
            {
                text.rectTransform.anchorMin=Vector2.zero;text.rectTransform.anchorMax=Vector2.one;
                text.rectTransform.offsetMin=new Vector2(8,2);text.rectTransform.offsetMax=new Vector2(-8,-2);
            }
            LastStandConsoleChrome.Feedback(button,text,frame);Style(button,true,false);return button;
        }
        public static void Style(Button button,bool available,bool selected)
        {
            button.interactable=available;button.GetComponent<Image>().color=!available?DisabledSurface:selected?Brass:Olive;
            button.GetComponentInChildren<Text>(true).color=!available?DisabledPaper:selected?Ink:Paper;
            button.GetComponentInChildren<LastStandConsoleFrame>(true).SetAction(selected,available);
            button.GetComponent<LastStandActionFeedback>().Refresh();
        }
        public void ScaleText(float sy)
        { foreach(var entry in sizes)if(entry.Key)entry.Key.fontSize=Mathf.CeilToInt(entry.Value*sy); }
        public float Preferred(Text text,float width,float sx,float sy)
        {
            text.fontSize=Mathf.CeilToInt(sizes[text]*sy);
            return Math.Max(20,text.cachedTextGeneratorForLayout.GetPreferredHeight(text.text,
                text.GetGenerationSettings(new Vector2(width*sx,0)))/text.pixelsPerUnit/sy);
        }
    }
}

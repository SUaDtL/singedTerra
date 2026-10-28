using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using SingedTerra.Encounter;

namespace SingedTerra.LastStand
{
    // Shared construction/registration boundary consumed by feature views.
    internal sealed class LastStandHudElements
    {
        readonly LastStandUiPrimitives ui;
        public readonly Dictionary<string,RectTransform> Nodes=new Dictionary<string,RectTransform>();
        public LastStandHudElements(LastStandUiPrimitives ui){this.ui=ui;}
        public Text Label(string name,Transform parent,int size)
        {var text=ui.Text(name,parent,size);Nodes.Add(name,text.rectTransform);return text;}
        public Button Action(string name,string label,Transform parent,UnityEngine.Events.UnityAction handler)
        {
            var button=ui.Button(name,label,parent,()=>handler(),17,false);
            Nodes.Add(name,(RectTransform)button.transform);
            var text=button.GetComponentInChildren<Text>();Nodes.Add(text.name,text.rectTransform);return button;
        }
        public RectTransform Panel(string name,Transform parent,bool blocksPointer=false,bool framed=true)
        {var panel=ui.Panel(name,parent,blocksPointer,framed);Nodes.Add(name,panel);return panel;}
        public static float MeasureText(Text text,LastStandHudLayout.Slot slot,float unitsX,float unitsY)
        {
            var settings=text.GetGenerationSettings(new Vector2(slot.Bounds.Width*unitsX,0));
            settings.fontSize=Mathf.CeilToInt(slot.FontSize*unitsY);settings.verticalOverflow=VerticalWrapMode.Overflow;
            float preferred=text.cachedTextGeneratorForLayout.GetPreferredHeight(text.text,settings)/text.pixelsPerUnit;
            return Mathf.Max(LastStandHudLayout.LineHeight,Mathf.Ceil(preferred/unitsY));
        }
    }
}

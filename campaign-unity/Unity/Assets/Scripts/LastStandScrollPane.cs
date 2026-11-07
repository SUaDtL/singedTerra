using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;

namespace SingedTerra.LastStand
{
    internal sealed class LastStandScrollPane
    {
        public readonly RectTransform Viewport,Content;
        readonly ScrollRect scroll;
        public ScrollRect Scroll=>scroll;
        float sx=1,sy=1,height;
        public float Offset=>Content.anchoredPosition.y/sy;
        public float MaximumOffset=>Math.Max(0,Content.rect.height/sy-height);
        public LastStandScrollPane(string name,Transform parent,Sprite surface)
        {
            // A separate scroll host prevents the two sibling panes from handling
            // one wheel event twice through an ancestor ScrollRect.
            Viewport=LastStandModal.Node(name+"Viewport",parent);
            LastStandConsoleChrome.Surface(Viewport,surface,false).color=new Color(.09f,.11f,.10f);
            Viewport.gameObject.AddComponent<RectMask2D>();Content=LastStandModal.Node(name+"Content",Viewport);
            scroll=Viewport.gameObject.AddComponent<ScrollRect>();scroll.viewport=Viewport;scroll.content=Content;
            scroll.horizontal=false;scroll.vertical=true;scroll.inertia=false;scroll.movementType=ScrollRect.MovementType.Clamped;
        }
        public void Layout(float x,float y,float width,float h,float unitsX,float unitsY)
        {sx=unitsX;sy=unitsY;height=h;LastStandModal.Position(Viewport,x*sx,y*sy,width*sx,h*sy);
         Content.sizeDelta=new Vector2(width*sx,Content.sizeDelta.y);scroll.scrollSensitivity=44*sy;}
        public void Finish(float contentHeight)
        {Content.sizeDelta=new Vector2(Content.sizeDelta.x,Math.Max(height,contentHeight)*sy);Clamp();}
        public void Clamp(){scroll.StopMovement();Content.anchoredPosition=new Vector2(0,Mathf.Clamp(Content.anchoredPosition.y,0,MaximumOffset*sy));}
        public void Reset(){scroll.StopMovement();Content.anchoredPosition=Vector2.zero;}
        public void Reveal(Button button)
        {
            if(!button||!button.transform.IsChildOf(Content))return;
            var rect=(RectTransform)button.transform;float y=-rect.anchoredPosition.y,offset=Content.anchoredPosition.y;
            if(y<offset)offset=y;else if(y+rect.rect.height>offset+height*sy)offset=y+rect.rect.height-height*sy;
            Content.anchoredPosition=new Vector2(0,offset);Clamp();
        }
        public void ScrollKeyboard(string direction)
        {
            float offset=Offset,step=Math.Max(44,height*.8f);
            if(direction=="scroll-up")offset-=step;else if(direction=="scroll-down")offset+=step;
            else if(direction=="scroll-start")offset=0;else if(direction=="scroll-end")offset=MaximumOffset;else return;
            Content.anchoredPosition=new Vector2(0,offset*sy);Clamp();
        }
    }
}

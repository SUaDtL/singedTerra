using System;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using SingedTerra.LastStand;

// A neutral feature uses the production factory, shell and scroll panes. This
// exercises their actual Unity behavior without adding a test screen to players.
public static class LastStandUiFoundationChecks
{
    const BindingFlags Public = BindingFlags.Instance | BindingFlags.Public;
    static object Call(object target,string method,params object[] args)
        => target.GetType().GetMethod(method,Public).Invoke(target,args);
    static T Field<T>(object target,string name)=>(T)target.GetType().GetField(name,Public).GetValue(target);
    static T Property<T>(object target,string name)=>(T)target.GetType().GetProperty(name,Public).GetValue(target);
    static void Require(bool value,string message){if(!value)throw new InvalidOperationException(message);}

    public static void Run()
    {
        bool failed=false;
        try
        {
            foreach(var profile in new[]{new Vector2(1280,720),new Vector2(390,844),new Vector2(720,512)})
                NeutralModal(profile);
            Debug.Log("ST_LS_UI_FOUNDATION_PASS shared_modal_lifecycle_focus_and_scroll");
        }
        catch(Exception error){failed=true;Debug.LogError("ST_LS_UI_FOUNDATION_FAIL "+error);}
        finally{EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);}
        if(failed)EditorApplication.Exit(1);
    }

    static void NeutralModal(Vector2 profile)
    {
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        var root=new GameObject("NeutralCanvas",typeof(RectTransform),typeof(Canvas)).GetComponent<RectTransform>();
        root.sizeDelta=profile;
        var events=new GameObject("Events",typeof(EventSystem)).GetComponent<EventSystem>();
        EventSystem.current=events;
        var font=Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        var modalType=typeof(LastStandLoopHud).Assembly.GetType("SingedTerra.LastStand.LastStandModal",true);
        int closes=0,clicks=0;
        var modal=Activator.CreateInstance(modalType,new object[]{"Neutral",root,font,(Action)(()=>closes++),null,null});
        var shade=Field<RectTransform>(modal,"Shade");var panel=Field<RectTransform>(modal,"Panel");
        float width=(float)Call(modal,"Layout",profile.x,profile.y,1f,1f,700f);
        var pane=Call(modal,"Pane","NeutralList");var second=Call(modal,"Pane","NeutralDetail");
        var content=Field<RectTransform>(pane,"Content");var viewport=Field<RectTransform>(pane,"Viewport");
        var secondViewport=Field<RectTransform>(second,"Viewport");
        float paneWidth=(width-36)/2,height=Math.Min(180,profile.y-140);
        Call(pane,"Layout",12f,100f,paneWidth,height,1f,1f);
        Call(second,"Layout",24f+paneWidth,100f,paneWidth,height,1f,1f);
        Button last=null;
        for(int i=0;i<12;i++)
        {
            last=(Button)Call(modal,"Button","NeutralAction"+i,"ACTION "+i,content,(Action)(()=>clicks++));
            Call(modal,"Place",last,8f,8f+i*52,paneWidth-16,44f);
        }
        Call(pane,"Finish",640f);Call(second,"Finish",height);
        Require(viewport.GetComponent<RectMask2D>()&&secondViewport.GetComponent<RectMask2D>(),"each pane clips its own content");
        Require(viewport.GetComponentsInParent<ScrollRect>().Length==1&&secondViewport.GetComponentsInParent<ScrollRect>().Length==1,
            "a wheel event has one scroll owner, including sibling panes");
        Require(!panel.GetComponent<ScrollRect>(),"modal shell cannot intercept a pane wheel event");
        Require(Math.Abs(((RectTransform)last.transform).rect.height-44)<.01f,"minimum action target");
        Call(pane,"Reveal",last);
        Require(Property<float>(pane,"Offset")>0&&Property<float>(second,"Offset")==0,"focus reveal only scrolls the selected pane");
        Call(pane,"ScrollKeyboard","scroll-end");
        Require(Math.Abs(Property<float>(pane,"Offset")-Property<float>(pane,"MaximumOffset"))<.01f,"keyboard end reaches content boundary");
        Call(pane,"Finish",44f);
        Require(Property<float>(pane,"Offset")==0&&Property<float>(pane,"MaximumOffset")==0,"content contraction repairs actual scroll position");
        Call(pane,"Finish",640f);Call(pane,"ScrollKeyboard","scroll-end");Call(pane,"Reset");
        Require(Property<float>(pane,"Offset")==0,"page reset returns exact top");
        Call(modal,"Style",last,false,false);Require(!last.IsInteractable(),"unavailable action is disabled");
        Call(modal,"Style",last,true,true);
        for(int i=0;i<3;i++){shade.gameObject.SetActive(false);shade.gameObject.SetActive(true);}
        last.onClick.Invoke();Require(clicks==1,"open-close cycles do not install duplicate action listeners");
        Field<Button>(modal,"Close").onClick.Invoke();Require(closes==1,"shared shell close invokes its owner once");
        UnityEngine.Object.DestroyImmediate(root.gameObject);UnityEngine.Object.DestroyImmediate(events.gameObject);
    }
}

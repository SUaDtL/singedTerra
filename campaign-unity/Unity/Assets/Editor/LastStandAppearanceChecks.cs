using System;
using System.Linq;
using System.Reflection;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Real imported UI and lifecycle with isolated stores. Geometry and labels are
// measured from Unity; these checks do not claim visual-art or device approval.
public static class LastStandAppearanceChecks
{
    const BindingFlags Private=BindingFlags.Instance|BindingFlags.NonPublic;
    sealed class Storage : ILastStandStorage
    {
        public string Value;
        public bool DenyWrite;
        public string Read()=>Value;
        public void Write(string value){if(DenyWrite)throw new InvalidOperationException("Appearance test denied write");Value=value;}
    }
    sealed class Transport : ILastStandBackupTransport
    {
        public bool Available=>false;
        public bool Busy=>false;
        public void Export(byte[] value,Action<LastStandBackupTransferResult> done){throw new InvalidOperationException("No file IO in UI check");}
        public void Import(Action<LastStandBackupTransferResult> done){throw new InvalidOperationException("No file IO in UI check");}
        public void Cancel(){}
        public void Dispose(){}
    }
    sealed class Fixture : IDisposable
    {
        public readonly Storage Game=new Storage(),Preferences=new Storage();
        public readonly LastStandLoopController Loop;
        public readonly TankPresentation Art;
        public readonly Canvas Canvas;
        public readonly LastStandHudKeyboard Keyboard;
        RenderTexture target;
        public Fixture()
        {
            LastStandLoopController.StorageFactory=()=>Game;LastStandLoopController.PreferencesStorageFactory=()=>Preferences;
            LastStandLoopController.BackupTransportFactory=_=>new Transport();
            EditorSceneManager.OpenScene("Assets/Scenes/LastStandPrototype.unity",OpenSceneMode.Single);
            Art=UnityEngine.Object.FindFirstObjectByType<TankPresentation>();Need(Art,"imported tank exists");
            Invoke(Art.GetComponent<BattlefieldReview>(),"Awake");Invoke(Art,"Start");Invoke(Art.GetComponent<ArtHud>(),"Start");
            Loop=Art.GetComponent<LastStandLoopController>();Set(Loop.Session,"focused",true);Set(Loop.Session,"applicationPaused",false);
            Invoke(Loop.Audio,"OnApplicationFocus",true);Invoke(Loop.Audio,"OnApplicationPause",false);
            Canvas=Art.GetComponentInChildren<Canvas>();Keyboard=Canvas.GetComponentInChildren<LastStandHudKeyboard>();
            foreach(var owner in Resources.FindObjectsOfTypeAll<EventSystem>())if(owner.gameObject.scene==Art.gameObject.scene)
            {Invoke(owner,"OnEnable");EventSystem.current=owner;break;}
            Need(EventSystem.current,"imported event owner enabled");Invoke(Canvas.GetComponent<GraphicRaycaster>(),"OnEnable");
            UnityEngine.Canvas.ForceUpdateCanvases();Loop.RefreshControls();Need(Loop.CanCustomizeAppearance,"imported appearance assembly available");
        }
        public Button Button(string id)
        {var matches=Canvas.GetComponentsInChildren<Button>(true).Where(b=>b.name==id).ToArray();Need(matches.Length==1,"one control "+id);return matches[0];}
        public void Click(string id)
        {
            var b=Button(id);Need(b.IsActive()&&b.IsInteractable(),"available control "+id);
            Keyboard.Focus(b);Keyboard.Selected(b);
            ExecuteEvents.Execute(b.gameObject,new PointerEventData(EventSystem.current){button=PointerEventData.InputButton.Left},ExecuteEvents.pointerClickHandler);
            UnityEngine.Canvas.ForceUpdateCanvases();
        }
        public void Open(){Click("Menu");Click("MenuAppearance");Need(Loop.MenuPage=="appearance","menu opens appearance");}
        public void Resize(int w,int h)
        {
            Art.view.targetTexture=null;if(target)UnityEngine.Object.DestroyImmediate(target);
            target=new RenderTexture(w,h,16);Art.view.targetTexture=target;
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;Canvas.renderMode=RenderMode.ScreenSpaceCamera;
            Canvas.worldCamera=Art.view;Canvas.planeDistance=1;Canvas.GetComponent<CanvasScaler>().enabled=false;
            Canvas.scaleFactor=Mathf.Sqrt((w/1280f)*(h/720f));UnityEngine.Canvas.ForceUpdateCanvases();Loop.RefreshControls();
            // Batch mode does not execute the usual screen-space camera follow.
            Canvas.renderMode=RenderMode.ScreenSpaceOverlay;Canvas.renderMode=RenderMode.ScreenSpaceCamera;
            Canvas.worldCamera=Art.view;UnityEngine.Canvas.ForceUpdateCanvases();Loop.RefreshControls();UnityEngine.Canvas.ForceUpdateCanvases();
        }
        public Rect Bounds(Component component)
        {
            var corners=new Vector3[4];((RectTransform)component.transform).GetWorldCorners(corners);
            var points=corners.Select(c=>RectTransformUtility.WorldToScreenPoint(Canvas.worldCamera,c)).ToArray();
            return Rect.MinMaxRect(points.Min(p=>p.x),points.Min(p=>p.y),points.Max(p=>p.x),points.Max(p=>p.y));
        }
        public void Dispose(){if(Art)Art.view.targetTexture=null;if(target)UnityEngine.Object.DestroyImmediate(target);}
    }
    static void Need(bool value,string message){if(!value)throw new InvalidOperationException("Appearance UI: "+message);}
    static void Set(object value,string field,object data)=>value.GetType().GetField(field,Private).SetValue(value,data);
    static void Invoke(object value,string method,params object[] args)=>value.GetType().GetMethod(method,Private).Invoke(value,args);
    static string Token(string value)=>char.ToUpperInvariant(value[0])+value.Substring(1);
    static bool Contains(Rect parent,Rect child)=>child.xMin>=parent.xMin-.6f&&child.yMin>=parent.yMin-.6f&&child.xMax<=parent.xMax+.6f&&child.yMax<=parent.yMax+.6f;
    static void Case(string name,Action body){body();Debug.Log("ST_LS_APPEARANCE_PASS "+name);}
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var transport=LastStandLoopController.BackupTransportFactory;RenderPipelineAsset pipeline=QualitySettings.renderPipeline;
        bool background=Application.runInBackground;
        try
        {
            Case("named_choices_preview_and_cancel",NamedChoicesPreviewAndCancel);
            Case("apply_reload_escape_and_exit",ApplyReloadEscapeAndExit);
            Case("failed_save_and_live_battle_refuse",FailedSaveAndLiveBattleRefuse);
            Case("visible_tank_fills_preview_without_cropping",VisibleTankFillsPreviewWithoutCropping);
            Case("responsive_scroll_keyboard_and_text",ResponsiveScrollKeyboardAndText);
        }
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;
            LastStandLoopController.BackupTransportFactory=transport;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
    static void NamedChoicesPreviewAndCancel()
    {
        using(var f=new Fixture())
        {
            var saved=f.Loop.AppearanceSaved;string raw=f.Game.Value;f.Open();
            foreach(var kit in LastStandTankAppearanceCatalog.Kits)
            {
                string id="AppearancePreset"+Token(kit.Id);Need(f.Button(id).GetComponentInChildren<Text>().text.Contains(kit.Label),"named preset "+kit.Id);
                f.Click(id);foreach(var slot in LastStandTankAppearanceCatalog.Slots)Need(f.Loop.AppearanceDraft.Part(slot)==kit.Id,"preset changes each draft slot");
            }
            f.Click("AppearancePartsTab");
            foreach(var slot in LastStandTankAppearanceCatalog.Slots)foreach(var kit in LastStandTankAppearanceCatalog.Kits)
            {
                string id="Appearance"+slot+Token(kit.Id);var before=f.Loop.AppearanceDraft;
                Need(f.Button(id).GetComponentInChildren<Text>().text.Contains(LastStandTankAppearanceCatalog.PartLabel(slot,kit.Id)),"named part "+id);
                f.Click(id);Need(f.Loop.AppearanceDraft.Part(slot)==kit.Id,"independent selected part");
                foreach(var other in LastStandTankAppearanceCatalog.Slots)if(other!=slot)Need(f.Loop.AppearanceDraft.Part(other)==before.Part(other),"other slots unchanged");
                Need(f.Loop.AppearancePartRenderers.Count>0,"selected part has actual renderers");
            }
            f.Click("AppearancePaintTab");foreach(var paint in LastStandTankAppearanceCatalog.Paints)
            {f.Click("AppearancePaint"+Token(paint.Id));Need(f.Loop.AppearanceDraft.Paint==paint.Id,"named paint applied to draft");}
            Need(f.Loop.AppearanceSaved.Equals(saved)&&f.Game.Value==raw,"all preview choices leave confirmed bytes unchanged");
            f.Click("AppearanceCancel");Need(!f.Loop.MenuOpen&&f.Loop.AppearanceDraft.Equals(saved)&&f.Game.Value==raw,"Cancel discards draft without writing");
        }
    }
    static void ApplyReloadEscapeAndExit()
    {
        using(var f=new Fixture())
        {
            f.Open();f.Click("AppearancePresetBulwark");f.Click("AppearancePartsTab");f.Click("AppearanceBarrelRanger");
            f.Click("AppearancePaintTab");f.Click("AppearancePaintBlue");var draft=f.Loop.AppearanceDraft;f.Click("AppearanceApply");
            Need(f.Loop.AppearanceSaved.Equals(draft)&&LastStandProgression.Load(f.Game).Appearance.Equals(draft),"Apply confirms appearance through the durable profile owner");
            Need(!f.Button("AppearanceApply").IsInteractable(),"unchanged draft cannot apply twice");
            f.Click("AppearanceKitsTab");f.Click("AppearancePresetJackal");f.Keyboard.Escape();
            Need(!f.Loop.MenuOpen&&f.Loop.AppearanceDraft.Equals(draft),"Escape restores last confirmed appearance");
            f.Open();f.Click("AppearancePresetRanger");f.Loop.OpenMenu("settings");
            Need(f.Loop.MenuPage=="settings"&&f.Loop.AppearanceDraft.Equals(draft),"navigation away rolls back preview");
        }
    }
    static void FailedSaveAndLiveBattleRefuse()
    {
        using(var f=new Fixture())
        {
            var saved=f.Loop.AppearanceSaved;f.Open();f.Click("AppearancePresetJackal");string raw=f.Game.Value;
            f.Game.DenyWrite=true;f.Click("AppearanceApply");
            Need(f.Game.Value==raw&&f.Loop.AppearanceSaved.Equals(saved),"denied write never presents draft as confirmed");
            Need(!f.Loop.AppearanceCanApply&&!f.Button("AppearanceApply").IsInteractable(),"failed save blocks duplicate apply");
            f.Click("AppearanceCancel");Need(f.Loop.AppearanceDraft.Equals(saved),"Cancel restores confirmed appearance after failed save");
        }
        using(var f=new Fixture())
        {
            f.Click("Deploy");Need(f.Loop.Session.Model!=null,"real deployment started combat");
            f.Loop.OpenAppearance();Need(f.Loop.MenuPage!="appearance"&&!f.Loop.CanCustomizeAppearance,"live battle cannot open appearance");
        }
    }
    static void ResponsiveScrollKeyboardAndText()
    {
        foreach(var size in new[]{new Vector2Int(280,142),new Vector2Int(280,280),new Vector2Int(280,560),new Vector2Int(320,142),
            new Vector2Int(1366,768),new Vector2Int(390,688),new Vector2Int(500,142),new Vector2Int(568,142)})
        using(var f=new Fixture())
        {
            f.Resize(size.x,size.y);f.Open();f.Resize(size.x,size.y);
            Need(!f.Button("Menu").IsActive()&&!f.Button("Deploy").IsActive(),"appearance hides background controls");
            var pane=f.Canvas.GetComponentsInChildren<ScrollRect>(true).Single(s=>s.name=="AppearanceViewport");
            var bounds=f.Bounds(pane);Need(bounds.height>=43.9f,"44px scroll viewport at "+size);
            Need(Contains(new Rect(0,0,size.x,size.y),bounds),"scroll viewport inside actual canvas");
            foreach(var tab in new[]{"AppearanceKitsTab","AppearancePartsTab","AppearancePaintTab"})
            {
                f.Click(tab);f.Resize(size.x,size.y);
                foreach(var button in f.Canvas.GetComponentsInChildren<Button>().Where(b=>b.name.StartsWith("Appearance",StringComparison.Ordinal)))
                {
                    if(button.IsInteractable()){f.Keyboard.Focus(button);f.Keyboard.Selected(button);UnityEngine.Canvas.ForceUpdateCanvases();}
                    Rect b=f.Bounds(button);Need(b.width>=43.9f&&b.height>=43.9f,"44px target "+button.name+" at "+size);
                    if(button.IsInteractable())Need(Contains(button.transform.IsChildOf(pane.content)?f.Bounds(pane):new Rect(0,0,size.x,size.y),b),"whole target can be revealed "+button.name+" at "+size+" "+b);
                    var text=button.GetComponentInChildren<Text>();Need(text.preferredHeight<=text.rectTransform.rect.height+.6f,"complete label "+button.name+" at "+size+": "+text.text);
                    if(button.name.StartsWith("AppearancePaint",StringComparison.Ordinal)&&button.name!="AppearancePaintTab")
                    {f.Click(button.name);Need(button.GetComponentInChildren<Text>().text.Contains("SELECTED"),"paint selected state is textual");}
                }
                foreach(var text in pane.content.GetComponentsInChildren<Text>())
                    Need(text.preferredHeight<=text.rectTransform.rect.height+.6f,"complete content label "+text.name+" at "+size+": "+text.text);
                f.Keyboard.NavigateKeyboard("enter-first");
                for(int i=0;i<45;i++)
                {f.Keyboard.NavigateKeyboard("next");Need(EventSystem.current.currentSelectedGameObject&&EventSystem.current.currentSelectedGameObject.name.StartsWith("Appearance",StringComparison.Ordinal),"keyboard remains in appearance page");}
            }
            f.Keyboard.NavigateKeyboard("scroll-end");UnityEngine.Canvas.ForceUpdateCanvases();
            Need(Contains(f.Bounds(pane),f.Bounds(f.Button("AppearanceCancel"))),"Cancel reachable at scroll end");
        }
    }
    static void VisibleTankFillsPreviewWithoutCropping()
    {
        foreach(var size in new[]{new Vector2Int(390,688),new Vector2Int(1366,768),new Vector2Int(500,142),
            new Vector2Int(568,142),new Vector2Int(280,560),new Vector2Int(280,142)})
        using(var f=new Fixture())
        {
            f.Resize(size.x,size.y);f.Open();f.Resize(size.x,size.y);
            var box=LastStandAppearanceLayout.Project(size.x,size.y).World;
            var viewport=new Rect(box.X,size.y-box.Y-box.Height,box.Width,box.Height);
            float minimumFill=float.PositiveInfinity;
            foreach(var kit in LastStandTankAppearanceCatalog.Kits)
            {
                f.Loop.PreviewAppearancePreset(kit.Id);f.Art.ResetInspection();
                for(int yaw=0;yaw<8;yaw++)
                {
                    // Inspect the real camera goal after orbit rather than
                    // depending on batch mode's absent frame interpolation.
                    f.Art.SetView(false,true);
                    float minX=float.PositiveInfinity,minY=float.PositiveInfinity;
                    float maxX=float.NegativeInfinity,maxY=float.NegativeInfinity;
                    int points=0;
                    foreach(var filter in f.Art.tank.GetComponentsInChildren<MeshFilter>(true))
                    {
                        var renderer=filter.GetComponent<Renderer>();
                        if(!renderer||!renderer.enabled||renderer.forceRenderingOff||!renderer.gameObject.activeInHierarchy||
                            (f.Art.view.cullingMask&(1<<renderer.gameObject.layer))==0)continue;
                        // Independently project imported vertices through the
                        // actual camera, without repeating the fitter's equations.
                        foreach(var vertex in filter.sharedMesh.vertices)
                        {
                            var screen=f.Art.view.WorldToScreenPoint(filter.transform.TransformPoint(vertex));
                            Need(screen.z>f.Art.view.nearClipPlane&&screen.z<f.Art.view.farClipPlane,"preview vertex stays in depth range");
                            minX=Mathf.Min(minX,screen.x);minY=Mathf.Min(minY,screen.y);
                            maxX=Mathf.Max(maxX,screen.x);maxY=Mathf.Max(maxY,screen.y);points++;
                        }
                    }
                    Need(points>0,"visible tank vertices exist");var rendered=Rect.MinMaxRect(minX,minY,maxX,maxY);
                    Need(Contains(viewport,rendered),"tank is not cropped at "+size+" "+kit.Id+" yaw "+yaw+" "+rendered+" inside "+viewport);
                    float fill=Mathf.Max(rendered.width/viewport.width,rendered.height/viewport.height);
                    Need(fill>=.65f,"tank fills at least65percent of a preview dimension at "+size+" "+kit.Id+" yaw "+yaw+"; actual="+fill);
                    minimumFill=Mathf.Min(minimumFill,fill);
                    f.Art.OrbitRight();
                }
            }
            Debug.Log("ST_LS_APPEARANCE_FRAMING "+size+" minimum_fill="+minimumFill);
        }
    }
}

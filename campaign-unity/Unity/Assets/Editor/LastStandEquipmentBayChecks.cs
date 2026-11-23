using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Rendering.Universal;
using SingedTerra.LastStand;

// Imported controls and reversible presentation ownership, not visual acceptance.
public static class LastStandEquipmentBayChecks
{
    static void Need(bool value,string message){if(!value)throw new InvalidOperationException("Equipment bay: "+message);}
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var transport=LastStandLoopController.BackupTransportFactory;var pipeline=QualitySettings.renderPipeline;bool background=Application.runInBackground;
        try
        {
            foreach(var size in new[]{new Vector2Int(1024,736),new Vector2Int(1024,768),new Vector2Int(1100,640),new Vector2Int(1280,720),new Vector2Int(1600,900),
                new Vector2Int(1920,1080),new Vector2Int(3440,1440),new Vector2Int(390,844),new Vector2Int(844,390)})
            using(var f=new LastStandAppearanceChecks.Fixture())
            {
                f.Resize(size.x,size.y);var targets=new List<Rect>();
                if(size.x>=1024&&size.y>=640)
                {
                    Need(UnityEngine.Object.FindObjectsByType<RawImage>(FindObjectsSortMode.None).Any(i=>i.name=="HangarMatte"&&i.isActiveAndEnabled),size+" retains the authored equipment bay");
                    var title=UnityEngine.Object.FindObjectsByType<Text>(FindObjectsSortMode.None).Single(t=>t.name=="BayTitle");
                    Need(Mathf.Abs(title.transform.lossyScale.x/title.transform.lossyScale.y-1)<.005f,size+" bay lettering preserves its aspect");
                    CheckParkedFloor(f,size);
                }
                foreach(string id in new[]{"Deploy","ArmoryEntry","TierPrevious","TierNext","ShopEntry","ResearchEntry","Menu"})
                {
                    var b=f.Button(id);Need(b.IsActive(),size+" visible control "+id);
                    var r=f.Bounds(b);Need(r.width>=43.9f&&r.height>=43.9f,size+" minimum target "+id);
                    Need(r.xMin>=-.2f&&r.yMin>=-.2f&&r.xMax<=size.x+.2f&&r.yMax<=size.y+.2f,size+" onscreen "+id);
                    foreach(var other in targets)Need(!r.Overlaps(other),size+" separate controls "+id);targets.Add(r);
                    var label=b.GetComponentInChildren<Text>();Need(label&&label.preferredHeight<=label.rectTransform.rect.height+.2f,size+" complete label "+id);
                }
                f.Click("Deploy");Need(f.Loop.Phase=="battle"&&f.Loop.Session.Model!=null,size+" actual Deploy handler");
                f.Resize(size.x,size.y);targets.Clear();
                foreach(string id in new[]{"SpeedMinus","SpeedRate","SpeedPlus","ShopEntry","Menu","WaveInfo"})
                {
                    var button=f.Button(id);Need(button.IsActive(),size+" combat control "+id);var r=f.Bounds(button);
                    Need(r.width>=43.9f&&r.height>=43.9f,size+" combat target "+id);
                    Need(r.xMin>=-.2f&&r.yMin>=-.2f&&r.xMax<=size.x+.2f&&r.yMax<=size.y+.2f,size+" combat onscreen "+id);
                    foreach(var other in targets)Need(!r.Overlaps(other),size+" separate combat controls "+id);targets.Add(r);
                }
                Debug.Log("ST_LS_BAY_PASS controls_and_deploy_"+size.x+"x"+size.y);
            }
            using(var f=new LastStandAppearanceChecks.Fixture())
            {
                var activePipeline=(UniversalRenderPipelineAsset)UnityEngine.Rendering.GraphicsSettings.currentRenderPipeline;
                Need(activePipeline.allowPostProcessAlphaOutput,"live tank compositing preserves post-process alpha");
                var pipelineSettings=new SerializedObject(activePipeline);
                var renderer=(UniversalRendererData)pipelineSettings.FindProperty("m_RendererDataList").GetArrayElementAtIndex(0).objectReferenceValue;
                Need(renderer.postProcessData,"authored grading and bloom have actual renderer resources");
                const BindingFlags flags=BindingFlags.Instance|BindingFlags.NonPublic;
                var hud=typeof(LastStandLoopController).GetField("hud",flags).GetValue(f.Loop);
                var garage=hud.GetType().GetField("garage",flags).GetValue(hud);
                var bay=garage.GetType().GetField("equipmentBay",flags).GetValue(garage);
                var toggle=bay.GetType().GetMethod("SetActive",flags);
                toggle.Invoke(bay,new object[]{false});
                var camera=f.Art.view;var target=camera.targetTexture;var clear=camera.clearFlags;var color=camera.backgroundColor;var projection=camera.projectionMatrix;
                var renderers=UnityEngine.Object.FindObjectsByType<Renderer>(FindObjectsInactive.Include,FindObjectsSortMode.None).ToDictionary(r=>r,r=>r.forceRenderingOff);
                var sun=RenderSettings.sun;bool lit=sun&&sun.enabled;
                var reflection=RenderSettings.customReflectionTexture;var reflectionMode=RenderSettings.defaultReflectionMode;
                var ambientMode=RenderSettings.ambientMode;var sky=RenderSettings.ambientSkyColor;
                var equator=RenderSettings.ambientEquatorColor;var ground=RenderSettings.ambientGroundColor;
                float ambientIntensity=RenderSettings.ambientIntensity,reflectionIntensity=RenderSettings.reflectionIntensity,fov=camera.fieldOfView;
                var cameraData=camera.GetUniversalAdditionalCameraData();bool post=cameraData.renderPostProcessing;
                for(int i=0;i<2;i++)
                {
                    toggle.Invoke(bay,new object[]{true});Need(camera.targetTexture&&camera.targetTexture!=target,"owned live tank target");
                    toggle.Invoke(bay,new object[]{false});Need(camera.targetTexture==target&&camera.clearFlags==clear&&camera.backgroundColor==color,"camera restored");
                    Need(renderers.All(pair=>pair.Key.forceRenderingOff==pair.Value),"world renderers restored");
                    Need(RenderSettings.sun==sun&&(!sun||sun.enabled==lit),"scene lighting restored");
                    Need(RenderSettings.customReflectionTexture==reflection&&RenderSettings.defaultReflectionMode==reflectionMode,"environment reflections restored");
                    Need(RenderSettings.ambientMode==ambientMode&&RenderSettings.ambientSkyColor==sky&&RenderSettings.ambientEquatorColor==equator&&
                        RenderSettings.ambientGroundColor==ground&&RenderSettings.ambientIntensity==ambientIntensity&&RenderSettings.reflectionIntensity==reflectionIntensity,"ambient and reflection strength restored");
                    Need(Mathf.Approximately(camera.fieldOfView,fov),"camera lens restored");
                    Need(camera.projectionMatrix==projection,"camera projection restored");
                    Need(cameraData.renderPostProcessing==post,"post processing restored");
                }
                Debug.Log("ST_LS_BAY_PASS reversible_camera_lighting_and_world");
                var observations=hud.GetType().GetField("observations",flags).GetValue(hud);
                var snapshot=observations.GetType().GetMethod("CaptureLayoutSnapshot",flags).Invoke(observations,new object[]{null});
                string diagnostic=JsonUtility.ToJson(snapshot);
                Need(!diagnostic.Contains("FittingModuleCallout"),"moving decoration is excluded from layout-change identity");
                Need(diagnostic.Contains("ServicePartTitle")&&diagnostic.Contains("ArmoryEntry"),"substantive bay labels and actions remain observable");
                Debug.Log("ST_LS_BAY_PASS animated_callouts_do_not_spam_layout_diagnostics");
            }
            using(var f=new LastStandAppearanceChecks.Fixture())
            {
                f.Resize(1600,900);
                UnityEngine.Object.DestroyImmediate(f.Art.view.gameObject);
                // Disposal at scope exit must tolerate the native destruction
                // order observed when quitting directly from the garage.
            }
            Debug.Log("ST_LS_BAY_PASS camera_destroyed_before_hud_disposal");
            Mesh orphanedFloorMesh;
            using(var f=new LastStandAppearanceChecks.Fixture())
            {
                f.Resize(1600,900);
                var floor=GameObject.Find("Bay shadow receiver");
                orphanedFloorMesh=floor.GetComponent<MeshFilter>().sharedMesh;
                UnityEngine.Object.DestroyImmediate(floor);
            }
            Need(!orphanedFloorMesh,"owned shadow mesh released when receiver is destroyed before HUD");
            Debug.Log("ST_LS_BAY_PASS receiver_destroyed_before_hud_disposal");
        }
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;LastStandLoopController.BackupTransportFactory=transport;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);QualitySettings.renderPipeline=pipeline;Application.runInBackground=background;
        }
    }
    static void CheckParkedFloor(LastStandAppearanceChecks.Fixture f,Vector2Int size)
    {
        var matte=f.Canvas.GetComponentsInChildren<RawImage>().Single(i=>i.name=="HangarMatte");
        float textureAspect=(float)matte.texture.width/matte.texture.height;
        Need(Mathf.Abs(textureAspect*matte.uvRect.width/matte.uvRect.height-(float)size.x/size.y)<.005f,size+" photograph retains perspective");
        var tread=f.Art.TankVisuals.PartRenderers(LastStandTankPartSlot.Treads).Where(r=>r.enabled&&r.gameObject.activeInHierarchy).ToArray();
        var foot=tread[0].bounds;foreach(var renderer in tread.Skip(1))foot.Encapsulate(renderer.bounds);
        var floor=GameObject.Find("Bay shadow receiver");Need(floor&&Mathf.Abs(floor.transform.position.y-foot.min.y)<.01f,"shadow plane meets tread contact");
        Need(floor.GetComponents<Collider>().Length==0,"garage shadow receiver needs no physics component in stripped players");
        var groundBounds=floor.GetComponent<MeshRenderer>().bounds;
        Need(Mathf.Abs(groundBounds.size.x-30)<.01f&&Mathf.Abs(groundBounds.size.z-30)<.01f,"render-only floor retains its full shadow footprint");
        var point=new Vector3(foot.center.x,foot.min.y,foot.center.z);
        var before=f.Art.view.WorldToViewportPoint(point);
        Need(Vector2.Distance(new Vector2(matte.uvRect.x+before.x*matte.uvRect.width,matte.uvRect.y+before.y*matte.uvRect.height),new Vector2(.5f,.405f))<.002f,"chassis is attached to the photographed floor mark");
        f.Loop.OpenArmory();f.Loop.RefreshControls();
        var inArmory=f.Art.view.WorldToViewportPoint(point);var uv=matte.uvRect;
        Need(Vector2.Distance(new Vector2(uv.x+inArmory.x*uv.width,uv.y+inArmory.y*uv.height),new Vector2(.5f,.405f))<.002f,"Armory retains the same floor mark");
        if(size.y<900)
        {
            var header=f.Bounds(f.Canvas.GetComponentsInChildren<RectTransform>().Single(r=>r.name=="ArmoryHeader"));
            var drawer=f.Bounds(f.Canvas.GetComponentsInChildren<RectTransform>().Single(r=>r.name=="ArmoryPanel"));
            for(int yaw=0;yaw<8;yaw++)
            {
                f.Art.SetView(false,true);
                foreach(var filter in f.Art.tank.GetComponentsInChildren<MeshFilter>())
                {
                    var renderer=filter.GetComponent<Renderer>();
                    if(!renderer||!renderer.enabled||renderer.forceRenderingOff||(f.Art.view.cullingMask&(1<<renderer.gameObject.layer))==0)continue;
                    foreach(var vertex in filter.sharedMesh.vertices)
                    {
                        var screen=f.Art.view.WorldToScreenPoint(filter.transform.TransformPoint(vertex));
                        Need(screen.y>=drawer.yMax+8&&screen.y<=header.yMin-8&&screen.x>=8&&screen.x<=size.x-8,
                            size+" complete Armory silhouette clears header and drawer at yaw "+yaw+": "+screen);
                    }
                }
                f.Loop.RotateArmory(1);
            }
        }
        f.Loop.CancelArmory();f.Loop.RefreshControls();
        Need(Vector3.Distance(before,f.Art.view.WorldToViewportPoint(point))<.002f,"Armory cancel restores the complete parked composition");
        Debug.Log("ST_LS_BAY_PASS grounded_floor_and_aspect_"+size.x+"x"+size.y);
    }
}

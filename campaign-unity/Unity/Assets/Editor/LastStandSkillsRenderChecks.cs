using System;
using System.IO;
using System.Reflection;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.Art;
using SingedTerra.LastStand;

// Fixed desktop Play Mode captures use the production codec and isolated stores.
// Compact capture is verified in the actual players: this Editor's offscreen
// camera path is unstable for portrait targets. No native input is claimed here.
[InitializeOnLoad]
public static class LastStandSkillsRenderChecks
{
    const string Key="ST_SKILLS_RENDER";
    [Serializable] sealed class FixtureProfiles{public string collection;}
    [Serializable] sealed class FixtureFile{public FixtureProfiles profiles;}
    sealed class Store:ILastStandStorage{public string Raw;public string Read()=>Raw;public void Write(string value){Raw=value;}}
    static LastStandLoopController loop;static TankPresentation art;static Canvas canvas;static Camera ui;
    static RenderTexture frame,world;static RawImage backdrop;
    static int stage,frames;static double due,deadline;
    static LastStandSkillsRenderChecks(){if(SessionState.GetBool(Key,false))Arm();}
    static void Arm()
    {
        string path=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Evidence/last-stand-skills/review-profiles.json"));
        var fixture=JsonUtility.FromJson<FixtureFile>(File.ReadAllText(path));
        if(fixture?.profiles?.collection==null)throw new InvalidOperationException("Missing isolated collection fixture.");
        var game=new Store{Raw=fixture.profiles.collection};var prefs=new Store();
        LastStandLoopController.StorageFactory=()=>game;LastStandLoopController.PreferencesStorageFactory=()=>prefs;
        EditorApplication.update-=Update;EditorApplication.update+=Update;deadline=EditorApplication.timeSinceStartup+150;
    }
    public static void Run(){SessionState.SetBool(Key,true);Arm();EditorSceneManager.OpenScene(LastStandLoopBuild.ScenePath);EditorApplication.isPlaying=true;}
    static void Size(int width,int height)
    {
        if(frame||world)throw new InvalidOperationException("Use one fixed viewport per review process.");
        frame=new RenderTexture(width,height,24);frame.Create();world=new RenderTexture(width,height,24);world.Create();
        ui.targetTexture=frame;backdrop.texture=world;loop.RefreshControls();frames=0;
    }
    static void Update()
    {
        try
        {
            if(EditorApplication.timeSinceStartup>deadline)throw new InvalidOperationException("Skills render deadline");
            if(!Application.isPlaying||++frames<12)return;
            if(stage==0)
            {
                loop=UnityEngine.Object.FindFirstObjectByType<LastStandLoopController>();if(loop?.Progression==null)return;
                art=loop.GetComponent<TankPresentation>();canvas=UnityEngine.Object.FindFirstObjectByType<Canvas>();
                ui=new GameObject("Skills review UI camera").AddComponent<Camera>();ui.cullingMask=1<<5;ui.clearFlags=CameraClearFlags.Depth;ui.nearClipPlane=.1f;ui.farClipPlane=10;ui.enabled=false;
                canvas.renderMode=RenderMode.ScreenSpaceCamera;canvas.worldCamera=ui;canvas.planeDistance=1;canvas.GetComponent<CanvasScaler>().enabled=false;canvas.scaleFactor=1;
                backdrop=new GameObject("Skills battle frame",typeof(RectTransform),typeof(RawImage)).GetComponent<RawImage>();
                backdrop.transform.SetParent(canvas.transform,false);backdrop.transform.SetAsFirstSibling();backdrop.raycastTarget=false;
                backdrop.rectTransform.anchorMin=Vector2.zero;backdrop.rectTransform.anchorMax=Vector2.one;backdrop.rectTransform.offsetMin=backdrop.rectTransform.offsetMax=Vector2.zero;
                foreach(var t in canvas.GetComponentsInChildren<Transform>(true))t.gameObject.layer=5;
                art.view.cullingMask&=~(1<<5);
                typeof(SingedTerra.Encounter.EncounterSession).GetMethod("OnApplicationFocus",BindingFlags.Instance|BindingFlags.NonPublic).Invoke(loop.Session,new object[]{true});
                Size(1920,1080);loop.OpenSkills();stage=1;due=EditorApplication.timeSinceStartup+1;return;
            }
            if(EditorApplication.timeSinceStartup<due)return;
            switch(stage)
            {
                case 1:
                    if(loop.MenuPage!="skills")throw new InvalidOperationException("Skills page not open.");
                    Capture("skills");loop.CloseMenu();loop.OpenArmory();break;
                case 2:
                    if(loop.MenuPage!="armory")throw new InvalidOperationException("Armory page not open.");
                    Capture("armory-skills");loop.CloseMenu();loop.Deploy();due=EditorApplication.timeSinceStartup+5;stage++;return;
                case 3:
                    if(loop.Session.Model==null)throw new InvalidOperationException("Deployment did not create encounter.");
                    loop.ActivateSkill(LastStandSkillId.Overdrive);loop.ActivateSkill(LastStandSkillId.Minefield);Capture("combat-skills-active");
                    if(!loop.Session.Model.SkillUsed(LastStandSkillId.Overdrive)||!loop.Session.Model.SkillUsed(LastStandSkillId.Minefield))
                        throw new InvalidOperationException("Review skills were not activated.");
                    SessionState.SetBool(Key,false);Debug.Log("ST_SKILLS_RENDER_PASS captures=3");EditorApplication.Exit(0);return;
            }
            stage++;due=EditorApplication.timeSinceStartup+1;
        }
        catch(Exception ex){SessionState.SetBool(Key,false);Debug.LogException(ex);EditorApplication.Exit(1);}
    }
    static void Capture(string name)
    {
        loop.RefreshControls();Canvas.ForceUpdateCanvases();
        backdrop.gameObject.SetActive(loop.Session.Model!=null);
        if(loop.Session.Model!=null)art.view.targetTexture=world;
        art.view.Render();ui.Render();
        var prior=RenderTexture.active;RenderTexture.active=frame;var pixels=new Texture2D(frame.width,frame.height,TextureFormat.RGB24,false);
        pixels.ReadPixels(new Rect(0,0,frame.width,frame.height),0,0);pixels.Apply();
        string suffix=Environment.GetEnvironmentVariable("ST_SKILLS_RENDER_FOLDER")??"renders-01";
        string folder=Path.GetFullPath(Path.Combine(Application.dataPath,"../../Evidence/last-stand-skills/",suffix));Directory.CreateDirectory(folder);
        File.WriteAllBytes(Path.Combine(folder,name+".png"),pixels.EncodeToPNG());UnityEngine.Object.Destroy(pixels);RenderTexture.active=prior;
        Debug.Log("ST_SKILLS_CAPTURE "+name+" "+frame.width+"x"+frame.height+" phase="+loop.Phase);
    }
}

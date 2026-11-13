using System;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using SingedTerra.LastStand;

public static class LastStandInterfaceCompositionChecks
{
    static void Need(bool value,string message){if(!value)throw new InvalidOperationException("Interface composition: "+message);}
    static float Side(Vector2 a,Vector2 b,Vector2 p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    static bool Intersects(Vector2 a,Vector2 b,Vector2 c,Vector2 d)=>Side(a,b,c)*Side(a,b,d)<-.01f&&Side(c,d,a)*Side(c,d,b)<-.01f;
    static void Routes(LastStandAppearanceChecks.Fixture f,int expected)
    {
        var bay=f.Canvas.GetComponentsInChildren<LastStandFittingCallout>().Where(c=>c.gameObject.name=="EquipmentBayFurniture").ToArray();
        Need(bay.Length==4,"four service callouts exist");bay[0].RefreshGroup();
        foreach(var c in bay)Debug.Log("ST_UI_ROUTE "+c.TargetName+" visible="+c.Visible+" card="+c.CardBounds+" points="+string.Join(";",c.RoutePoints));
        Need(bay.Count(c=>c.Visible)==expected,"every exposed service attachment has a route");
        for(int i=0;i<bay.Length;i++)if(bay[i].Visible)
        {
            var a=bay[i].RoutePoints;Need(a.Count>=2&&Vector2.Distance(a[a.Count-1],bay[i].EndpointScreen)<.1f,"leader ends at actual attachment");
            for(int j=i+1;j<bay.Length;j++)if(bay[j].Visible)
            {
                var b=bay[j].RoutePoints;
                for(int x=1;x<a.Count;x++)for(int y=1;y<b.Count;y++)Need(!Intersects(a[x-1],a[x],b[y-1],b[y]),"leaders do not cross: "+i+" / "+j);
            }
        }
    }
    public static void Run()
    {
        var game=LastStandLoopController.StorageFactory;var preferences=LastStandLoopController.PreferencesStorageFactory;
        var backup=LastStandLoopController.BackupTransportFactory;
        try
        {
            using(var f=new LastStandAppearanceChecks.Fixture())
            {
                foreach(var size in new[]{new Vector2Int(1600,900),new Vector2Int(1920,1080),new Vector2Int(3440,1440),new Vector2Int(1024,768)})
                {
                    f.Resize(size.x,size.y);Routes(f,4);Debug.Log("ST_UI_COMPOSITION_PASS service_routes_"+size);
                    f.Click("Menu");f.Click("MenuSettings");
                    float density=Mathf.Max(1,Mathf.Min(size.x/1600f,size.y/900f));
                    Need(f.Bounds(f.Button("SettingsBack")).height>=44*density-1,"settings controls share the display scale");
                    f.Click("SettingsClose");
                }
                f.Resize(1600,900);f.Click("Menu");
                Routes(f,4);
                Need(Math.Abs(f.Bounds(f.Button("MenuSettings")).xMin-f.Bounds(f.Button("MenuHelp")).xMin)<1,"settings belongs with guidance and options");
                f.Click("MenuSettings");Routes(f,4);
                Debug.Log("ST_UI_COMPOSITION_PASS modal_preserves_complete_bay_chrome");
                int original=f.Loop.Preferences.Current.MasterVolume;f.Click("MasterMinus");
                Need(f.Loop.Preferences.Current.MasterVolume==Math.Max(0,original-10),"volume control invokes real preference owner");
                for(int i=0;i<4;i++)
                {
                    f.Click("SettingsTab"+i);
                    var back=f.Bounds(f.Button("SettingsBack"));var reset=f.Bounds(f.Button("SettingsDefaults"));
                    Need(!back.Overlaps(reset),"navigation and reset remain distinct");
                    foreach(var b in f.Canvas.GetComponentsInChildren<Button>().Where(b=>b.IsActive()&&b.transform.IsChildOf(f.Button("SettingsBack").transform.parent)))
                    {var r=f.Bounds(b);Need(r.width>=43&&r.height>=43,"settings target remains usable: "+b.name);}
                    Debug.Log("ST_UI_COMPOSITION_PASS settings_tab_"+i);
                }
                f.Click("SettingsTab0");
                var label=f.Canvas.GetComponentsInChildren<Text>().Single(t=>t.name=="MasterMinusLabel");
                Need(f.Bounds(label).xMax+8<f.Bounds(f.Button("MasterMinus")).xMin,"label and volume control have separate columns");
                Need(f.Button("MasterMinus").GetComponentInChildren<Text>().text=="−","volume stepper does not repeat its row label");
                f.Click("SettingsClose");Need(!f.Loop.MenuOpen,"settings closes through existing owner");
                Debug.Log("ST_UI_COMPOSITION_PASS settings_rows_and_saved_value");
                f.Click("Deploy");
                foreach(var size in new[]{new Vector2Int(1600,900),new Vector2Int(1920,1080),new Vector2Int(3440,1440)})
                {
                    f.Resize(size.x,size.y);float density=Mathf.Min(size.x/1600f,size.y/900f);
                    foreach(string id in new[]{"SpeedMinus","SpeedRate","SpeedPlus","ShopEntry"})
                    {
                        var button=f.Button(id);var text=button.GetComponentInChildren<Text>();
                        float pixelType=text.fontSize*f.Bounds(text).height/text.rectTransform.rect.height;
                        Need(pixelType>=Mathf.Floor(18*density),"combat action type scales with its frame: "+id+" "+size);
                        Need(f.Bounds(button).width>=44*density-.1f,"combat action width scales with its label: "+id);
                        Need(text.preferredHeight<=text.rectTransform.rect.height+.2f,"combat action label fits: "+id);
                    }
                    Debug.Log("ST_UI_COMPOSITION_PASS combat_control_type_"+size);
                }
            }
            string unlocked=(string)typeof(LastStandArmoryChecks).GetMethod("UnlockedSave",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic).Invoke(null,null);
            using(var f=new LastStandAppearanceChecks.Fixture(unlocked))
            {
                f.Resize(1600,900);f.Click("ArmoryEntry");f.Click("ArmoryBay2Next");
                for(int rotation=0;rotation<8;rotation++)
                {
                    var lines=f.Canvas.GetComponentsInChildren<LastStandFittingCallout>().Where(c=>c.gameObject.name=="ArmoryModal").ToArray();
                    Need(lines.Length==2,"Armory owns two service routes");lines[0].RefreshGroup();
                    Need(lines.All(c=>c.Visible),"both fitted systems retain leaders at rotation "+rotation);
                    var a=lines[0].RoutePoints;var b=lines[1].RoutePoints;
                    for(int x=1;x<a.Count;x++)for(int y=1;y<b.Count;y++)Need(!Intersects(a[x-1],a[x],b[y-1],b[y]),"Armory leaders remain separate during rotation");
                    f.Click("ArmoryRotateRight");
                }
                Debug.Log("ST_UI_COMPOSITION_PASS two_bay_routes_during_rotation");
            }
        }
        catch(Exception error){Debug.LogException(error);EditorApplication.Exit(1);}
        finally
        {
            LastStandLoopController.StorageFactory=game;LastStandLoopController.PreferencesStorageFactory=preferences;LastStandLoopController.BackupTransportFactory=backup;
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        }
    }
}

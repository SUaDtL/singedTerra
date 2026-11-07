using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;
using SingedTerra.Art;
using SingedTerra.LastStand;
using SingedTerra.VisualReview;

// Appends authored campaign environments to the playable scene. The protected
// comparison scenes and the reviewed source meshes, prefabs and paints are inputs.
public static class LastStandCampaignEnvironmentBuild
{
    public const string ScenePath="Assets/Scenes/LastStandPrototype.unity";
    public const string CinderMaterialPath="Assets/Materials/LastStandCinderGround.mat";
    public const string FoundryMaterialPath="Assets/Materials/LastStandFoundryGround.mat";
    public const string GlassMaterialPath="Assets/Materials/LastStandGlassGround.mat";
    public const string FrostMaterialPath="Assets/Materials/LastStandFrostGround.mat";
    const string CinderRoot="C - Cinder Basin";
    const string FoundryRoot="D - Storm Foundry";
    const string GlassRoot="E - Glass Wastes";
    const string FrostRoot="F - Frostline Relay";
    static readonly string[] Ids={"sunlit-ash","iron-perimeter","cinder-basin","storm-foundry","glass-wastes","frostline-relay"};
    static readonly string[] RootNames={CinderRoot,FoundryRoot,GlassRoot,FrostRoot};
    static readonly string[] MaterialPaths={CinderMaterialPath,FoundryMaterialPath,GlassMaterialPath,FrostMaterialPath};
    const string Owner="CampaignEnvironmentAuthoring01";
    const string Seed="Assets/SeedPack02/Generated/Prefabs/";

    static void Require(bool value,string message)
    { if(!value)throw new InvalidOperationException("Campaign environment authoring: "+message); }
    static T Load<T>(string path) where T:UnityEngine.Object
    {
        var value=AssetDatabase.LoadAssetAtPath<T>(path);
        Require(value,"missing reviewed asset "+path);return value;
    }
    static Transform Group(string name,Transform parent)
    { var value=new GameObject(name).transform;value.SetParent(parent,false);return value; }
    static GameObject Landmark(string id,Transform parent,float x,float z,float yaw)
    {
        var source=Load<GameObject>(Seed+id+".prefab");
        var instance=(GameObject)PrefabUtility.InstantiatePrefab(source,parent);
        instance.name=id+" landmark";
        instance.transform.SetPositionAndRotation(new Vector3(x,0,z),Quaternion.Euler(0,yaw,0));
        var meshes=instance.GetComponentsInChildren<MeshFilter>(true);
        Require(meshes.Length>0&&meshes.All(m=>m.sharedMesh&&m.GetComponent<Renderer>()),"landmark has real renderable geometry: "+id);
        float bottom=meshes.SelectMany(m=>m.sharedMesh.vertices.Select(v=>m.transform.TransformPoint(v).y)).Min();
        instance.transform.position+=Vector3.down*bottom;
        Require(instance.GetComponentsInChildren<Collider>(true).Length==0&&
            instance.GetComponentsInChildren<MonoBehaviour>(true).Length==0,"landmark must remain art only: "+id);
        return instance;
    }
    static GameObject Environment(string name,Material ground)
    {
        var root=new GameObject(name);
        Group(Owner,root.transform);Group("SceneryPolish01",root.transform);
        var floor=Group("ContinuousGround",root.transform).gameObject;
        floor.AddComponent<MeshFilter>().sharedMesh=Load<Mesh>("Assets/VisualReview/Meshes/Ground.asset");
        floor.AddComponent<MeshRenderer>().sharedMaterial=ground;
        root.SetActive(false);return root;
    }
    static GameObject Cinder(Material ground)
    {
        var root=Environment(CinderRoot,ground);
        var rim=Group("Broken caldera rim",root.transform.Find("SceneryPolish01"));
        // Curved escarpments and alternating basalt teeth enclose a broad basin.
        // These are independent mesh prefabs, not copies of either old layout.
        for(int n=0;n<7;n++)
        {
            float angle=(-62+n*41)*Mathf.Deg2Rad;
            Landmark("ST2-T05",rim,Mathf.Sin(angle)*38,Mathf.Cos(angle)*38,-62+n*41+90);
            float tooth=angle+17*Mathf.Deg2Rad;
            Landmark("ST2-T04",rim,Mathf.Sin(tooth)*35.5f,Mathf.Cos(tooth)*35.5f,n*53);
        }
        var ruins=Group("Buried southern works",root.transform.Find("SceneryPolish01"));
        Landmark("ST2-B04",ruins,-25,-34,28);
        Landmark("ST2-T07",ruins,-31,-29,-20);
        Landmark("ST2-P07",ruins,25,-29,-38);
        Landmark("ST2-P01",ruins,-29,-34,12);
        return root;
    }
    static GameObject Foundry(Material ground)
    {
        var root=Environment(FoundryRoot,ground);
        var yard=Group("Northern foundry yard",root.transform.Find("SceneryPolish01"));
        Landmark("ST2-B02",yard,-16,37,0);Landmark("ST2-B02",yard,-4,39,0);
        Landmark("ST2-B03",yard,12,39,0);
        for(int n=0;n<5;n++)Landmark("ST2-P02",yard,-16+n*4.2f,31.8f,0);
        var tanks=Group("Eastern pressure bank",root.transform.Find("SceneryPolish01"));
        for(int n=0;n<3;n++)
        {
            Landmark("ST2-B05",tanks,36,-12+n*10,90);
            Landmark("ST2-P03",tanks,32.5f,-12+n*10,n*90);
        }
        var service=Group("Western cable service",root.transform.Find("SceneryPolish01"));
        Landmark("ST2-B02",service,-38,-9,90);
        Landmark("ST2-P05",service,-32,-12,90);Landmark("ST2-P05",service,-32,-7,90);
        Landmark("ST2-P04",service,-33,-16,60);Landmark("ST2-P01",service,-34,-2,0);
        return root;
    }
    static Material Ground(string source,string name,Color color)
    {
        var material=new Material(Load<Material>(source)){name=name};
        material.SetColor("_BaseColor",color);material.SetColor("_Color",color);
        return material;
    }
    static GameObject Glass(Material ground)
    {
        var root=Environment(GlassRoot,ground);
        var shards=Group("Vitrified shard fields",root.transform.Find("SceneryPolish01"));
        for(int n=0;n<14;n++)
        {
            float angle=(n*25+9)*Mathf.Deg2Rad;
            var shard=Landmark("ST2-T04",shards,Mathf.Sin(angle)*40,Mathf.Cos(angle)*40,n*47);
            shard.transform.localScale=new Vector3(.8f,1.7f+(n%3)*.45f,.65f);
            // Reuse the faceted source mesh, with a glossy mineral surface owned
            // only by this new environment. Imported prefab materials stay intact.
            foreach(var renderer in shard.GetComponentsInChildren<Renderer>())
                renderer.sharedMaterials=renderer.sharedMaterials.Select(_=>ground).ToArray();
        }
        var expedition=Group("Abandoned survey line",root.transform.Find("SceneryPolish01"));
        Landmark("ST2-P06",expedition,-34,-23,28);Landmark("ST2-P04",expedition,28,-31,-20);
        Landmark("ST2-P07",expedition,-27,32,40);
        return root;
    }
    static GameObject Frost(Material ground)
    {
        var root=Environment(FrostRoot,ground);
        var ridge=Group("Relay ridge",root.transform.Find("SceneryPolish01"));
        for(int n=0;n<8;n++)
        {
            float angle=(n*45+8)*Mathf.Deg2Rad;
            var bank=Landmark("ST2-T05",ridge,Mathf.Sin(angle)*43,Mathf.Cos(angle)*43,n*45+98);
            bank.transform.localScale=new Vector3(1.1f,.65f,1.2f);
            foreach(var renderer in bank.GetComponentsInChildren<Renderer>())
                renderer.sharedMaterials=renderer.sharedMaterials.Select(_=>ground).ToArray();
        }
        // Tall relays stay at the far skyline, clear of the threat projection.
        Landmark("ST2-B03",ridge,-21,42,35);Landmark("ST2-B03",ridge,23,43,-35);
        var service=Group("Snowbound relay service",root.transform.Find("SceneryPolish01"));
        Landmark("ST2-B01",service,-38,-16,90);Landmark("ST2-P05",service,-35,-21,60);
        Landmark("ST2-P04",service,35,-17,-40);Landmark("ST2-P06",service,32,-26,20);
        return root;
    }
    static void FreshAsset(string path)
    {
        Require(!File.Exists(path)&&!Directory.Exists(path)&&!File.Exists(path+".meta")&&
            !AssetDatabase.LoadMainAssetAtPath(path),"refuse to overwrite existing or unknown asset "+path);
    }
    static void ValidateRoot(BattlefieldReview review,GameObject root,string id,string materialPath)
    {
        Require(root&&root.scene==review.gameObject.scene&&root.transform.parent==null&&
            root.transform.Find(Owner)&&root.transform.Find("SceneryPolish01"),"incomplete or foreign authored root "+id);
        var floor=root.transform.Find("ContinuousGround");
        Require(floor&&floor.GetComponent<Renderer>()&&
            AssetDatabase.GetAssetPath(floor.GetComponent<Renderer>().sharedMaterial)==materialPath,"conflicting ground material ownership "+id);
        Require(root.GetComponentsInChildren<Collider>(true).Length==0&&
            root.GetComponentsInChildren<MonoBehaviour>(true).Length==0,"environment contains gameplay behavior "+id);
    }
    static void ValidateClearance(BattlefieldReview review,GameObject root,string id)
    {
        // Match the actual TankPresentation camera direction without invoking
        // runtime Start methods or changing any saved camera, lighting or globals.
        var cameraObject=new GameObject("Temporary campaign clearance camera"){hideFlags=HideFlags.HideAndDontSave};
        try
        {
            var camera=cameraObject.AddComponent<Camera>();camera.orthographic=true;
            camera.transform.rotation=Quaternion.Euler(LastStandEnvironmentCatalog.Get(id).CameraPitch,-30,0);
            VisualReviewPolish.ValidateScenery(review,camera,root);
        }
        finally { UnityEngine.Object.DestroyImmediate(cameraObject); }
    }
    public static bool EnsureAuthored(Scene scene)
    {
        Require(scene.IsValid()&&scene.isLoaded&&scene.path==ScenePath,"only the saved playable scene may be authored");
        Require(SceneManager.GetActiveScene()==scene,"the playable scene must be the active authoring scene");
        Require(!EditorApplication.isPlayingOrWillChangePlaymode,"authoring cannot run during play");
        var reviews=scene.GetRootGameObjects().SelectMany(r=>r.GetComponentsInChildren<BattlefieldReview>(true)).ToArray();
        Require(reviews.Length==1,"exactly one scene environment owner required");
        var review=reviews[0];var art=review.GetComponent<TankPresentation>();
        Require(art&&art.tank&&review.sun&&review.ashEnvironment&&review.ironEnvironment,"retained scene references required");
        var bindings=review.environmentBindings;
        int retained=bindings==null||bindings.Length==0?2:bindings.Length;
        Require(retained==2||retained==4||retained==6,"unrecognized existing binding count");
        if(bindings!=null&&bindings.Length>0)
        {
            Require(bindings.All(b=>b!=null&&b.root)&&bindings.Select(b=>b.environmentId).SequenceEqual(Ids.Take(retained)),"unknown or reordered campaign binding ownership");
            Require(bindings[0].root==review.ashEnvironment&&bindings[1].root==review.ironEnvironment&&
                bindings.Select(b=>b.root).Distinct().Count()==retained,"existing root identity was changed or aliased");
            for(int i=2;i<retained;i++)
            {
                Require(bindings[i].root.name==RootNames[i-2],"unknown campaign roots");
                ValidateRoot(review,bindings[i].root,Ids[i],MaterialPaths[i-2]);
                ValidateClearance(review,bindings[i].root,Ids[i]);
            }
        }
        if(retained==6)return false; // Never rewrite existing roots, materials or scene.
        Require(!scene.GetRootGameObjects().Any(r=>RootNames.Skip(retained-2).Contains(r.name)),"campaign roots already exist without complete ownership bindings");
        for(int i=retained-2;i<MaterialPaths.Length;i++)FreshAsset(MaterialPaths[i]);
        var paints=new Material[4];var roots=new GameObject[4];
        try
        {
            if(retained==2)
            {
                paints[0]=Ground("Assets/VisualReview/Materials/GroundAsh.mat","LastStandCinderGround",new Color(.78f,.49f,.34f));
                paints[1]=Ground("Assets/VisualReview/Materials/GroundIron.mat","LastStandFoundryGround",new Color(.44f,.56f,.68f));
                roots[0]=Cinder(paints[0]);roots[1]=Foundry(paints[1]);
            }
            paints[2]=Ground("Assets/VisualReview/Materials/GroundIron.mat","LastStandGlassGround",new Color(.45f,.66f,.46f));
            paints[2].SetFloat("_Smoothness",.72f);
            paints[3]=Ground("Assets/VisualReview/Materials/GroundAsh.mat","LastStandFrostGround",new Color(.80f,.87f,.92f));
            paints[3].SetFloat("_Smoothness",.12f);
            roots[2]=Glass(paints[2]);roots[3]=Frost(paints[3]);
            for(int i=retained-2;i<roots.Length;i++)
            {
                Require(roots[i].scene==scene,"authoring must target the active playable scene");
                ValidateClearance(review,roots[i],Ids[i+2]);
            }
            // Validate all geometry before the first asset write; keep old roots
            // and their saved identities untouched when extending a four-tier scene.
            for(int i=retained-2;i<paints.Length;i++)AssetDatabase.CreateAsset(paints[i],MaterialPaths[i]);
        }
        catch
        {
            foreach(var root in roots)if(root)UnityEngine.Object.DestroyImmediate(root);
            foreach(var paint in paints)if(paint&&!AssetDatabase.Contains(paint))UnityEngine.Object.DestroyImmediate(paint);
            throw;
        }
        var next=new BattlefieldReview.EnvironmentBinding[6];
        next[0]=new BattlefieldReview.EnvironmentBinding{environmentId=Ids[0],root=review.ashEnvironment};
        next[1]=new BattlefieldReview.EnvironmentBinding{environmentId=Ids[1],root=review.ironEnvironment};
        for(int i=2;i<next.Length;i++)next[i]=i<retained?bindings[i]:new BattlefieldReview.EnvironmentBinding{environmentId=Ids[i],root=roots[i-2]};
        review.environmentBindings=next;
        EditorUtility.SetDirty(review);
        Require(EditorSceneManager.SaveScene(scene,ScenePath),"saving the playable scene failed");
        return true;
    }
    public static void Build()
    {
        for(int n=0;n<SceneManager.sceneCount;n++)Require(!SceneManager.GetSceneAt(n).isDirty,"refuse to discard unsaved scene changes");
        var scene=EditorSceneManager.OpenScene(ScenePath,OpenSceneMode.Single);
        bool changed=EnsureAuthored(scene);
        Debug.Log("ST_LS_CAMPAIGN_ENVIRONMENT_BUILD_PASS changed="+changed);
    }
}

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

// Adds only the two campaign environments to the playable scene. The protected
// comparison scenes and the reviewed source meshes, prefabs and paints are inputs.
public static class LastStandCampaignEnvironmentBuild
{
    public const string ScenePath="Assets/Scenes/LastStandPrototype.unity";
    public const string CinderMaterialPath="Assets/Materials/LastStandCinderGround.mat";
    public const string FoundryMaterialPath="Assets/Materials/LastStandFoundryGround.mat";
    const string CinderRoot="C - Cinder Basin";
    const string FoundryRoot="D - Storm Foundry";
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
        if(bindings!=null&&bindings.Length==4)
        {
            var ids=new[]{"sunlit-ash","iron-perimeter","cinder-basin","storm-foundry"};
            Require(bindings.All(b=>b!=null&&b.root)&&bindings.Select(b=>b.environmentId).SequenceEqual(ids),"unknown or reordered campaign binding ownership");
            Require(bindings[0].root==review.ashEnvironment&&bindings[1].root==review.ironEnvironment&&
                bindings.Select(b=>b.root).Distinct().Count()==4,"existing root identity was changed or aliased");
            Require(bindings[2].root.name==CinderRoot&&bindings[3].root.name==FoundryRoot,"unknown campaign roots");
            ValidateRoot(review,bindings[2].root,ids[2],CinderMaterialPath);
            ValidateRoot(review,bindings[3].root,ids[3],FoundryMaterialPath);
            ValidateClearance(review,bindings[2].root,ids[2]);ValidateClearance(review,bindings[3].root,ids[3]);
            return false; // Never rewrite an existing root, material, child or scene.
        }
        Require(bindings==null||bindings.Length==0||bindings.Length==2&&
            bindings[0]!=null&&bindings[1]!=null&&bindings[0].environmentId=="sunlit-ash"&&bindings[1].environmentId=="iron-perimeter"&&
            bindings[0].root==review.ashEnvironment&&bindings[1].root==review.ironEnvironment,"unrecognized existing bindings");
        Require(!scene.GetRootGameObjects().Any(r=>r.name==CinderRoot||r.name==FoundryRoot),"campaign roots already exist without complete ownership bindings");
        FreshAsset(CinderMaterialPath);FreshAsset(FoundryMaterialPath);
        var cinderPaint=Ground("Assets/VisualReview/Materials/GroundAsh.mat","LastStandCinderGround",new Color(.78f,.49f,.34f));
        var foundryPaint=Ground("Assets/VisualReview/Materials/GroundIron.mat","LastStandFoundryGround",new Color(.44f,.56f,.68f));
        var cinder=Cinder(cinderPaint);var foundry=Foundry(foundryPaint);
        Require(cinder.scene==scene&&foundry.scene==scene,"authoring must target the active playable scene");
        ValidateClearance(review,cinder,"cinder-basin");ValidateClearance(review,foundry,"storm-foundry");
        // All geometry and admission checks precede the first asset write.
        AssetDatabase.CreateAsset(cinderPaint,CinderMaterialPath);
        AssetDatabase.CreateAsset(foundryPaint,FoundryMaterialPath);
        review.environmentBindings=new[]{
            new BattlefieldReview.EnvironmentBinding{environmentId="sunlit-ash",root=review.ashEnvironment},
            new BattlefieldReview.EnvironmentBinding{environmentId="iron-perimeter",root=review.ironEnvironment},
            new BattlefieldReview.EnvironmentBinding{environmentId="cinder-basin",root=cinder},
            new BattlefieldReview.EnvironmentBinding{environmentId="storm-foundry",root=foundry}};
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

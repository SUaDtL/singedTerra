using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEditor.SceneManagement;
public static class PartsLibraryImport
{
    const string Root="Assets/PartsLibrary";
    const string ScenePath=Root+"/PartsLibrary_Layout.unity";
    [Serializable] sealed class Catalog { public Item[] items; }
    [Serializable] sealed class Item
    {
        public string id,title,category,mount,description,fbx,prefab;
        public float[] bounds_min,bounds_max;
        public int triangles,meshes;
    }
    [Serializable] sealed class Measure { public string id; public Vector3 center,size; public int meshes,triangles; }
    [Serializable] sealed class Receipt { public int schema=1; public Measure[] items; public string[] assemblies; public bool gameplayChanged=false; }
    static readonly Dictionary<string,Material> Materials=new Dictionary<string,Material>();
    static Bounds BoundsOf(GameObject obj)
    {
        var rr=obj.GetComponentsInChildren<Renderer>(true);
        if(rr.Length==0)throw new Exception("No meshes: "+obj.name);
        // Renderer AABBs conservatively expand rotated meshes. Verify actual transformed vertices.
        bool first=true;var b=new Bounds();
        foreach(var mf in obj.GetComponentsInChildren<MeshFilter>(true))
            foreach(var vertex in mf.sharedMesh.vertices)
            {
                var world=mf.transform.TransformPoint(vertex);
                if(!float.IsFinite(world.x)||!float.IsFinite(world.y)||!float.IsFinite(world.z))throw new Exception("Nonfinite vertex");
                if(first){b=new Bounds(world,Vector3.zero);first=false;}else b.Encapsulate(world);
            }
        if(first)throw new Exception("No vertices");return b;
    }
    static Material Mat(string name)
    {
        if(Materials.TryGetValue(name,out var found))return found;
        var m=AssetDatabase.LoadAssetAtPath<Material>("Assets/Materials/"+name+".mat");
        if(!m)m=AssetDatabase.LoadAssetAtPath<Material>(Root+"/Materials/"+name+".mat");
        if(!m)throw new Exception("Unknown library material: "+name);
        Materials[name]=m;return m;
    }
    static void NewMaterial(string name,Color color,float metallic,float smoothness)
    {
        string path=Root+"/Materials/"+name+".mat";
        if(File.Exists(path))throw new Exception("Refuse material overwrite: "+path);
        var m=new Material(Shader.Find("Universal Render Pipeline/Lit"));m.name=name;
        m.SetColor("_BaseColor",color);m.SetFloat("_Metallic",metallic);m.SetFloat("_Smoothness",smoothness);
        m.enableInstancing=true;AssetDatabase.CreateAsset(m,path);Materials[name]=m;
    }
    static void Paint(string name,Color tint)
    {
        var m=new Material(Mat("Armor"));m.name=name;m.SetColor("_BaseColor",tint);
        AssetDatabase.CreateAsset(m,Root+"/Materials/"+name+".mat");
    }
    static GameObject Part(string id,Transform parent,Vector3 pos)
    {
        var prefab=AssetDatabase.LoadAssetAtPath<GameObject>(Root+"/Prefabs/"+id+".prefab");
        if(!prefab)throw new Exception("Missing assembly part: "+id);
        var obj=(GameObject)PrefabUtility.InstantiatePrefab(prefab);
        obj.transform.SetParent(parent,false);obj.transform.localPosition=pos;return obj;
    }
    static void Assembly(string id,string gun,string module,int style)
    {
        var root=new GameObject(id);
        Part("STK-H01",root.transform,Vector3.zero);Part("STK-T01",root.transform,Vector3.zero);
        var turret=new GameObject("TurretPivot").transform;turret.SetParent(root.transform,false);
        turret.localPosition=new Vector3(0,1.77f,0);Part("STK-U01",turret,Vector3.zero);
        Part(gun,turret,new Vector3(0,.46f,-1.17f));Part(module,turret,new Vector3(1.34f,.30f,.40f));
        if(style==0)Part("STK-C01",root.transform,new Vector3(0,1.05f,2.64f));
        if(style==1)
        {
            Part("STK-A01",root.transform,new Vector3(0,1.14f,-2.73f));
            Part("STK-A02",root.transform,Vector3.zero);Part("STK-A03",turret,Vector3.zero);
        }
        if(style==2)
        {
            Part("STK-C02",turret,new Vector3(-.72f,1.0f,.60f));
            Part("STK-C03",root.transform,new Vector3(0,1.13f,-2.98f));
        }
        var material=AssetDatabase.LoadAssetAtPath<Material>(Root+"/Materials/KitPaint_"+new[]{"Olive","Slate","Oxide"}[style]+".mat");
        foreach(var r in root.GetComponentsInChildren<Renderer>())
        {
            var mm=r.sharedMaterials;for(int i=0;i<mm.Length;i++)if(mm[i].name=="Armor")mm[i]=material;
            r.sharedMaterials=mm;
        }
        var b=BoundsOf(root);
        if(b.size.x>6 || b.size.y>5 || b.size.z>10)throw new Exception("Assembly dimensions: "+b);
        PrefabUtility.SaveAsPrefabAsset(root,Root+"/Prefabs/"+id+".prefab");UnityEngine.Object.DestroyImmediate(root);
    }
    [MenuItem("singedTerra/Import new parts library")]
    public static void Prepare()
    {
        if(Application.unityVersion!="6000.3.24f1")throw new Exception("Unexpected editor version");
        if(Directory.Exists(Root))throw new Exception("Library already imported; preserve authored edits");
        Directory.CreateDirectory(Root+"/Materials");Directory.CreateDirectory(Root+"/Prefabs");
        AssetDatabase.Refresh();var scene=EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
        NewMaterial("Canvas",new Color(.30f,.32f,.21f),0,.05f);
        NewMaterial("Oxide",new Color(.38f,.115f,.065f),.35f,.28f);
        NewMaterial("Warning",new Color(.77f,.51f,.12f),.15f,.35f);
        Paint("KitPaint_Olive",Color.white);Paint("KitPaint_Oxide",new Color(1,.40f,.40f));
        Paint("KitPaint_Slate",new Color(.45f,.63f,1.12f));
        var catalog=JsonUtility.FromJson<Catalog>(File.ReadAllText("Assets/Art/PartsLibrary/catalog.json"));
        if(catalog.items.Length!=20 || catalog.items.Select(i=>i.id).Distinct().Count()!=20)
            throw new Exception("Twenty unique library entries required");
        var measured=new List<Measure>();
        foreach(var item in catalog.items)
        {
            string path=item.fbx.Substring("Unity/".Length);
            var importer=AssetImporter.GetAtPath(path) as ModelImporter;
            if(!importer)throw new Exception("No FBX importer: "+path);
            importer.importAnimation=false;importer.importCameras=false;importer.importLights=false;
            importer.globalScale=1;importer.isReadable=false;
            importer.materialImportMode=ModelImporterMaterialImportMode.ImportStandard;importer.SaveAndReimport();
            var source=AssetDatabase.LoadAssetAtPath<GameObject>(path);
            var root=new GameObject(item.id);var model=(GameObject)PrefabUtility.InstantiatePrefab(source);
            model.transform.SetParent(root.transform,false);
            foreach(var r in root.GetComponentsInChildren<Renderer>())
            {
                var mm=r.sharedMaterials;
                for(int i=0;i<mm.Length;i++)mm[i]=Mat(mm[i].name);
                r.sharedMaterials=mm;
            }
            var b=BoundsOf(root);
            var expected=new Vector3(item.bounds_max[0]-item.bounds_min[0],item.bounds_max[2]-item.bounds_min[2],item.bounds_max[1]-item.bounds_min[1]);
            if(!float.IsFinite(b.size.x) || Vector3.Distance(b.size,expected)>.025f)
                throw new Exception("Import size differs: "+item.id+" got "+b.size+" expected "+expected);
            if(root.GetComponentsInChildren<Collider>(true).Length!=0 || root.GetComponentsInChildren<MonoBehaviour>(true).Length!=0)
                throw new Exception("Art-only prefab contains behavior: "+item.id);
            int triangles=root.GetComponentsInChildren<MeshFilter>().Sum(m=>m.sharedMesh.triangles.Length/3);
            measured.Add(new Measure{id=item.id,center=b.center,size=b.size,
                meshes=root.GetComponentsInChildren<Renderer>().Length,triangles=triangles});
            PrefabUtility.SaveAsPrefabAsset(root,Root+"/Prefabs/"+item.id+".prefab");
            UnityEngine.Object.DestroyImmediate(root);
        }
        Assembly("STK-S01","STK-G01","STK-M01",0);
        Assembly("STK-S02","STK-G02","STK-M04",1);
        Assembly("STK-S03","STK-G03","STK-M02",2);
        string[] ids=catalog.items.Select(i=>i.id).Concat(new[]{"STK-S01","STK-S02","STK-S03"}).ToArray();
        for(int i=0;i<ids.Length;i++)
        {
            var obj=Part(ids[i],null,new Vector3((i%5)*8,0,(i/5)*8));
            obj.transform.position+=Vector3.up*(-BoundsOf(obj).min.y);
        }
        var floor=GameObject.CreatePrimitive(PrimitiveType.Cube);floor.name="Library floor";
        UnityEngine.Object.DestroyImmediate(floor.GetComponent<Collider>());
        floor.transform.position=new Vector3(16,-.12f,16);floor.transform.localScale=new Vector3(48,.20f,48);
        floor.GetComponent<Renderer>().sharedMaterial=Mat("Concrete");
        var camera=new GameObject("Library overview",typeof(Camera)).GetComponent<Camera>();
        camera.tag="MainCamera";camera.orthographic=true;camera.orthographicSize=29;
        camera.transform.position=new Vector3(38,42,-25);camera.transform.LookAt(new Vector3(16,0,16));
        camera.clearFlags=CameraClearFlags.SolidColor;camera.backgroundColor=new Color(.09f,.10f,.10f);
        var sun=new GameObject("Library key",typeof(Light)).GetComponent<Light>();
        sun.type=LightType.Directional;sun.intensity=1.6f;sun.transform.rotation=Quaternion.Euler(48,-35,0);
        sun.shadows=LightShadows.Soft;RenderSettings.ambientLight=new Color(.55f,.56f,.56f);
        EditorSceneManager.SaveScene(scene,ScenePath);AssetDatabase.SaveAssets();
        var receipt=new Receipt{items=measured.ToArray(),assemblies=new[]{"STK-S01","STK-S02","STK-S03"}};
        File.WriteAllText(Root+"/import-receipt.json",JsonUtility.ToJson(receipt,true));
        AssetDatabase.Refresh();
        Debug.Log("ST_KIT_IMPORT_PASS "+JsonUtility.ToJson(receipt));
    }
}

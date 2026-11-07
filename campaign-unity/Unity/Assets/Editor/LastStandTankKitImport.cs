using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.LastStand;

public static class LastStandTankKitImport
{
    const string Root = "Assets/TankKits02";
    public const string BindingPath = Root + "/Prefabs/TankVisualBindings.prefab";
    static readonly string[] Families = { "foundry", "ranger", "bulwark", "jackal" };
    static readonly string[] Slots = { "treads", "hull", "turret", "barrel" };
    [Serializable] sealed class TextureEntry { public string kind, path, sha256; }
    [Serializable] sealed class Surface { public string id; public float metallic, roughness; public TextureEntry[] textures; }
    [Serializable] sealed class Part
    {
        public string id, family, slot, model, sha256;
        public int triangles, meshes;
        public float[] bounds_min, bounds_max;
    }
    [Serializable] sealed class Catalog { public string schema, source, source_sha256; public Part[] parts; public Surface[] materials; }
    [Serializable] sealed class Measurement { public string id; public int triangles, meshes; public Vector3 minimum, maximum; }
    [Serializable] sealed class Receipt
    {
        public int schema = 1, compositions, maximumCoreTriangles;
        public string editor, catalogSha256, sourceSha256;
        public Measurement[] parts;
        public bool preservedRig, fiveFittings, barrelTipsAligned;
        public int cardinalShotChecks;
        public long readableVertexAndIndexBytes, cachedPositionBytes;
        public int readableVertices;
    }
    [Serializable] sealed class HashRequest { public string[] paths; }
    [Serializable] sealed class HashFile { public string path, sha256; }
    [Serializable] sealed class HashResponse { public HashFile[] files; }
    static string Hash(string path)
    {
        string input=Path.GetFullPath(path);
        string helper=Path.GetFullPath(Path.Combine(Application.dataPath,"../../../scripts/lib/provenance-hash.mjs"));
        // Only a trusted, fixed helper path enters argv; file paths are JSON
        // data on stdin. No shell or executable source is built from inputs.
        if(helper.IndexOf('"')>=0)throw new InvalidOperationException("Unsupported checksum helper path");
        var start=new System.Diagnostics.ProcessStartInfo("node") {
            Arguments="\""+helper+"\" --hash-files",UseShellExecute=false,CreateNoWindow=true,
            RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,
            StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8 };
        using(var process=System.Diagnostics.Process.Start(start))
        {
            if(process==null)throw new InvalidOperationException("Checksum tool could not start");
            var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();
            process.StandardInput.Write(JsonUtility.ToJson(new HashRequest{paths=new[]{input}}));process.StandardInput.Close();
            if(!process.WaitForExit(30000))
            {try{process.Kill();}catch(InvalidOperationException){}throw new TimeoutException("Checksum tool timed out");}
            if(process.ExitCode!=0)throw new InvalidOperationException("Provenance checksum failed");
            string response=output.GetAwaiter().GetResult();errors.GetAwaiter().GetResult();
            if(response.Length>16384)throw new InvalidOperationException("Checksum response exceeds bound");
            var result=JsonUtility.FromJson<HashResponse>(response);
            if(result?.files==null||result.files.Length!=1||result.files[0].path!=input||
                result.files[0].sha256==null||result.files[0].sha256.Length!=64||
                result.files[0].sha256.Any(c=>!"0123456789abcdef".Contains(c)))
                throw new InvalidOperationException("Malformed provenance checksum response");
            return result.files[0].sha256;
        }
    }
    static void Require(bool value, string message) { if (!value) throw new InvalidOperationException(message); }
    static Transform Find(Transform root, string name)
    { foreach (var child in root.GetComponentsInChildren<Transform>(true)) if (child.name == name) return child; throw new Exception("Missing rig node: " + name); }
    static Bounds BoundsOf(GameObject root)
    {
        var bounds = new Bounds(); bool first = true;
        foreach (var filter in root.GetComponentsInChildren<MeshFilter>(true))
            foreach (var vertex in filter.sharedMesh.vertices)
            {
                var point = root.transform.InverseTransformPoint(filter.transform.TransformPoint(vertex));
                Require(float.IsFinite(point.x) && float.IsFinite(point.y) && float.IsFinite(point.z), "Nonfinite imported geometry");
                if (first) { bounds = new Bounds(point, Vector3.zero); first = false; } else bounds.Encapsulate(point);
            }
        Require(!first, "Empty imported geometry"); return bounds;
    }
    static Catalog ReadCatalog()
    {
        var catalog = JsonUtility.FromJson<Catalog>(File.ReadAllText(Root + "/catalog.json"));
        Require(catalog.schema == "singedterra-tank-kits/1" && catalog.parts.Length == 16 && catalog.materials.Length == 6, "Unexpected tank art contract");
        Require(Hash("../" + catalog.source) == catalog.source_sha256, "Editable source changed without export receipt");
        for (int f = 0; f < 4; f++) for (int s = 0; s < 4; s++)
        {
            var part = catalog.parts[f * 4 + s];
            Require(part.family == Families[f] && part.slot == Slots[s] && part.id == Families[f] + "-" + Slots[s], "Part order/identity mismatch");
            Require(part.model == "Models/" + part.id + ".fbx" && Hash(Root + "/" + part.model) == part.sha256, "Model export changed: " + part.id);
        }
        return catalog;
    }

    [MenuItem("singedTerra/Import original modular tank art")]
    public static void Prepare()
    {
        Require(!Directory.Exists(Root + "/Prefabs") && !Directory.Exists(Root + "/Materials"), "Preserve existing imported art; Prepare never overwrites authored assets");
        var catalog = ReadCatalog();
        Directory.CreateDirectory(Root + "/Prefabs"); Directory.CreateDirectory(Root + "/Materials"); AssetDatabase.Refresh();
        var palette = new Dictionary<string, Material>();
        foreach (var surface in catalog.materials)
        {
            var textures = new Dictionary<string, Texture2D>();
            foreach (var entry in surface.textures)
            {
                Require(Hash(Root + "/" + entry.path) == entry.sha256, "Original texture hash changed");
                var importer = AssetImporter.GetAtPath(Root + "/" + entry.path) as TextureImporter;
                Require(importer != null, "Texture importer missing");
                importer.textureType = entry.kind == "Normal" ? TextureImporterType.NormalMap : TextureImporterType.Default;
                importer.sRGBTexture = entry.kind == "BaseColor"; importer.mipmapEnabled = true;
                importer.alphaSource = TextureImporterAlphaSource.FromInput;
                importer.wrapMode = TextureWrapMode.Repeat; importer.maxTextureSize = 512;
                importer.SaveAndReimport(); textures.Add(entry.kind, AssetDatabase.LoadAssetAtPath<Texture2D>(Root + "/" + entry.path));
            }
            var mat = new Material(Shader.Find("Universal Render Pipeline/Lit")) { name = surface.id, enableInstancing = true };
            mat.SetColor("_BaseColor", Color.white); mat.SetTexture("_BaseMap", textures["BaseColor"]);
            mat.SetTexture("_BumpMap", textures["Normal"]); mat.SetFloat("_BumpScale", .65f); mat.EnableKeyword("_NORMALMAP");
            mat.SetTexture("_MetallicGlossMap", textures["Mask"]); mat.EnableKeyword("_METALLICSPECGLOSSMAP");
            mat.SetFloat("_Metallic", 1); mat.SetFloat("_Smoothness", 1);
            mat.SetTexture("_OcclusionMap", textures["Mask"]); mat.SetFloat("_OcclusionStrength", .5f); mat.EnableKeyword("_OCCLUSIONMAP");
            if (surface.id == "Optic")
            { mat.SetTexture("_EmissionMap", textures["BaseColor"]); mat.SetColor("_EmissionColor", new Color(.8f,.5f,.12f)); mat.EnableKeyword("_EMISSION"); }
            AssetDatabase.CreateAsset(mat, Root + "/Materials/" + surface.id + ".mat"); palette.Add(surface.id, mat);
        }
        var prefabAssets = new GameObject[16];
        for (int index = 0; index < catalog.parts.Length; index++)
        {
            var part = catalog.parts[index]; string path = Root + "/" + part.model;
            var importer = AssetImporter.GetAtPath(path) as ModelImporter;
            Require(importer != null, "Model importer missing");
            importer.importAnimation = false; importer.importCameras = false; importer.importLights = false;
            importer.globalScale = 1; importer.isReadable = true; importer.addCollider = false;
            importer.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            importer.importNormals = ModelImporterNormals.Import; importer.importTangents = ModelImporterTangents.CalculateMikk;
            importer.SaveAndReimport();
            var wrapper = new GameObject(part.id);
            try
            {
                var model = (GameObject)PrefabUtility.InstantiatePrefab(AssetDatabase.LoadAssetAtPath<GameObject>(path));
                model.transform.SetParent(wrapper.transform, false);
                foreach (var renderer in wrapper.GetComponentsInChildren<Renderer>(true))
                {
                    var slots = renderer.sharedMaterials;
                    for (int i = 0; i < slots.Length; i++) slots[i] = palette[slots[i].name];
                    renderer.sharedMaterials = slots;
                }
                prefabAssets[index] = PrefabUtility.SaveAsPrefabAsset(wrapper, Root + "/Prefabs/" + part.id + ".prefab");
            }
            finally { UnityEngine.Object.DestroyImmediate(wrapper); }
        }
        var bindings = new GameObject("TankVisualBindings");
        try
        {
            var visuals = bindings.AddComponent<LastStandTankVisuals>(); visuals.parts = prefabAssets;
            visuals.armor = palette["Armor"]; visuals.steel = palette["Steel"]; visuals.edge = palette["Edge"];
            visuals.rubber = palette["Rubber"]; visuals.brass = palette["Brass"]; visuals.optic = palette["Optic"];
            PrefabUtility.SaveAsPrefabAsset(bindings, BindingPath);
        }
        finally { UnityEngine.Object.DestroyImmediate(bindings); }
        AssetDatabase.SaveAssets();
        Validate();
        Debug.Log("ST_TANK_IMPORT_PASS " + BindingPath);
    }

    [MenuItem("singedTerra/Validate all modular tank compositions")]
    public static void Validate()
    {
        var catalog = ReadCatalog(); var measured = new List<Measurement>();
        int readableVertices=0;long readableBytes=0;
        var bindings = AssetDatabase.LoadAssetAtPath<GameObject>(BindingPath);
        Require(bindings != null && bindings.GetComponent<LastStandTankVisuals>() != null, "Tank visual binding prefab is missing");
        for (int i = 0; i < catalog.parts.Length; i++)
        {
            var part = catalog.parts[i];
            var instance = UnityEngine.Object.Instantiate(bindings.GetComponent<LastStandTankVisuals>().parts[i]);
            try
            {
                Require(instance.GetComponentsInChildren<Collider>(true).Length == 0 && instance.GetComponentsInChildren<MonoBehaviour>(true).Length == 0, "Part contains gameplay behavior");
                var meshes = instance.GetComponentsInChildren<MeshFilter>(true);
                foreach(var filter in meshes)
                {
                    var mesh=filter.sharedMesh;
                    Require(mesh.isReadable,"New core mesh must allow player camera readback: "+part.id);
                    readableVertices+=mesh.vertexCount;
                    for(int stream=0;stream<mesh.vertexBufferCount;stream++)readableBytes+=(long)mesh.GetVertexBufferStride(stream)*mesh.vertexCount;
                    for(int submesh=0;submesh<mesh.subMeshCount;submesh++)readableBytes+=(long)mesh.GetIndexCount(submesh)*(mesh.indexFormat==UnityEngine.Rendering.IndexFormat.UInt32?4:2);
                }
                int triangles = meshes.Sum(mesh => mesh.sharedMesh.triangles.Length / 3);
                Require(triangles == part.triangles && meshes.Length == part.meshes, "Imported triangle/mesh count changed: " + part.id);
                var bounds = BoundsOf(instance);
                var expected = new Vector3(part.bounds_max[0] - part.bounds_min[0], part.bounds_max[2] - part.bounds_min[2], part.bounds_max[1] - part.bounds_min[1]);
                Require(Vector3.Distance(bounds.size, expected) < .002f, "Imported metre scale differs: " + part.id);
                measured.Add(new Measurement { id = part.id, triangles = triangles, meshes = meshes.Length, minimum = bounds.min, maximum = bounds.max });
            }
            finally { UnityEngine.Object.DestroyImmediate(instance); }
        }
        var tank = UnityEngine.Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Prefabs/StarterTank.prefab"));
        var presentationObject = new GameObject("Tank composition verification");
        var cameraObject = new GameObject("Tank composition camera", typeof(Camera));
        int maximum = 0, combinations = 0, cardinalShots = 0;
        bool priorBackground=Application.runInBackground;
        try
        {
            var owner = presentationObject.AddComponent<TankPresentation>(); owner.tank = tank.transform;
            owner.turret = Find(tank.transform, "TurretYaw"); owner.barrel = Find(tank.transform, "BarrelRecoil");
            owner.muzzle = Find(tank.transform, "MuzzleMarker"); owner.flash = Find(tank.transform, "MuzzlePreview").gameObject;
            owner.repairModule = Find(tank.transform, "Attachment_Repair").gameObject;
            owner.launcherModule = Find(tank.transform, "Attachment_Launcher").gameObject;
            owner.view = cameraObject.GetComponent<Camera>(); owner.tankVisualsPrefab = bindings.GetComponent<LastStandTankVisuals>();
            var muzzle = owner.muzzle.position; var barrel = owner.barrel.localPosition; var turret = owner.turret.localRotation;
            Require(owner.TrySelectFitting("repair"), "Initialize fitting/visual rig");
            var socket = owner.TankVisuals.FittingSocket.position;
            var fittingRoots = new Dictionary<LastStandFitting, Vector3>();
            foreach (LastStandFitting fitting in Enum.GetValues(typeof(LastStandFitting)))
            { Require(owner.TrySelectFitting(LastStandFittingCatalog.Id(fitting)), "Select fitting"); fittingRoots[fitting] = owner.ActiveFittingModule.transform.position; }
            int callbacks = 0; owner.TankVisuals.GeometryChanged += () => callbacks++;
            foreach (string mobility in Families) foreach (string hull in Families) foreach (string turretId in Families) foreach (string gun in Families)
            {
                Require(LastStandTankAppearance.TryCreate(mobility, hull, turretId, gun, "red", out var appearance), "Appearance rejected");
                owner.ApplyAppearance(appearance); combinations++;
                Require(owner.muzzle.position == muzzle && owner.barrel.localPosition == barrel && owner.turret.localRotation == turret, "Cosmetic selection moved gameplay rig");
                Require(Vector3.Distance(owner.TankVisuals.FittingSocket.position, socket) < .00001f, "Fitting socket moved");
                int triangles = 0; var selectedRenderers = new HashSet<Renderer>();
                foreach (var slot in LastStandTankAppearanceCatalog.Slots)
                {
                    var renderers = owner.TankVisuals.PartRenderers(slot);
                    Require(renderers.Count > 0 && renderers.All(r => r.gameObject.activeInHierarchy), "Selected part is not visible");
                    foreach (var renderer in renderers)
                    { selectedRenderers.Add(renderer); triangles += renderer.GetComponent<MeshFilter>().sharedMesh.triangles.Length / 3; }
                }
                foreach (var renderer in owner.tank.GetComponentsInChildren<Renderer>(true))
                    if (renderer.enabled && renderer.gameObject.activeInHierarchy &&
                        !renderer.transform.IsChildOf(owner.ActiveFittingModule.transform) && !renderer.transform.IsChildOf(owner.flash.transform))
                        Require(selectedRenderers.Contains(renderer), "Unselected or original core geometry remained visible");
                Require(triangles < 25000, "Mixed assembly exceeded core triangle budget"); maximum = Math.Max(maximum, triangles);
                var barrelRenderer = owner.TankVisuals.PartRenderers(LastStandTankPartSlot.Barrel)[0];
                var barrelRoot = barrelRenderer.transform;
                while (barrelRoot.parent && barrelRoot.name != gun + "-barrel") barrelRoot = barrelRoot.parent;
                var tip = barrelRoot.GetComponentsInChildren<Transform>(true).First(t => t.name.StartsWith("VisualMuzzle", StringComparison.Ordinal));
                Require(Vector3.Distance(tip.position, owner.muzzle.position) < .002f, "Cosmetic barrel misses canonical muzzle: " + gun);
                foreach (LastStandFitting fitting in Enum.GetValues(typeof(LastStandFitting)))
                {
                    Require(owner.TrySelectFitting(LastStandFittingCatalog.Id(fitting)), "Fitting selection failed");
                    Require(owner.ActiveFittingRenderers.Length > 0 && owner.ActiveFittingRenderers.All(r => r.enabled && r.gameObject.activeInHierarchy), "Fitting hidden by cosmetics");
                    Require(Vector3.Distance(owner.ActiveFittingModule.transform.position, fittingRoots[fitting]) < .00001f, "Cosmetics moved fitting");
                }
                Require(!owner.ApplyAppearance(appearance), "Repeated appearance should not invalidate geometry");
            }
            Require(callbacks == 255, "Geometry notification count differs from changed appearances");
            // Exercise the actual public shot pipeline: four authored barrels,
            // four cardinal aims, visible peak recoil, then return to rest.
            var tankPosition = owner.tank.position; var tankRotation = owner.tank.rotation;
            foreach (var gun in Families)
            {
                owner.ApplyAppearance(LastStandTankAppearance.Default.WithPart(LastStandTankPartSlot.Barrel, gun));
                var activeBarrel = owner.TankVisuals.PartRenderers(LastStandTankPartSlot.Barrel)[0].transform;
                while (activeBarrel.parent && activeBarrel.name != gun + "-barrel") activeBarrel = activeBarrel.parent;
                var movingTip = activeBarrel.GetComponentsInChildren<Transform>(true).First(t => t.name.StartsWith("VisualMuzzle", StringComparison.Ordinal));
                Require(owner.BeginEncounter(), "Begin real shot verification"); owner.SetEncounterPaused(true);
                foreach (var direction in new[] { Vector3.forward, Vector3.right, Vector3.back, Vector3.left })
                {
                    owner.PlayEncounterShot(owner.tank.position + direction * 20);
                    Require(Vector3.Dot((owner.muzzle.position-owner.barrel.position).normalized, direction) > .999f, "Cardinal aim differs");
                    var rest = owner.barrel.position; float peak = 0;
                    for (int frame = 0; frame < 16; frame++)
                    {
                        owner.AdvanceTerminalShot(.05f);
                        peak = Mathf.Max(peak, Vector3.Distance(owner.barrel.position, rest));
                        Require(Vector3.Distance(movingTip.position, owner.muzzle.position) < .002f, "Visual muzzle detached during real recoil");
                    }
                    Require(peak > .31f && peak < .33f, "Expected .32 metre real recoil");
                    Require(Vector3.Distance(owner.barrel.position, rest) < .00001f && owner.barrel.localPosition == barrel, "Recoil did not return to rest");
                    Require(owner.tank.position == tankPosition && owner.tank.rotation == tankRotation, "Shot moved chassis");
                    cardinalShots++;
                }
                owner.EndEncounter();
            }
        }
        finally
        {
            UnityEngine.Object.DestroyImmediate(presentationObject); UnityEngine.Object.DestroyImmediate(tank); UnityEngine.Object.DestroyImmediate(cameraObject);
            Application.runInBackground=priorBackground;
        }
        var receipt = new Receipt { editor = Application.unityVersion, catalogSha256 = Hash(Root + "/catalog.json"), sourceSha256 = catalog.source_sha256,
            compositions = combinations, maximumCoreTriangles = maximum, parts = measured.ToArray(), preservedRig = true, fiveFittings = true, barrelTipsAligned = true,
            cardinalShotChecks = cardinalShots, readableVertices=readableVertices, readableVertexAndIndexBytes=readableBytes,
            cachedPositionBytes=(long)readableVertices*3*sizeof(float) };
        string evidence = Environment.GetEnvironmentVariable("ST_LS_TANK_ART_EVIDENCE");
        if (!string.IsNullOrEmpty(evidence))
        {
            Directory.CreateDirectory(evidence);
            using (var stream = new FileStream(Path.Combine(evidence, "import-receipt.json"), FileMode.CreateNew, FileAccess.Write))
            using (var writer = new StreamWriter(stream)) writer.Write(JsonUtility.ToJson(receipt, true));
        }
        Debug.Log("ST_TANK_COMPOSITIONS_PASS " + JsonUtility.ToJson(receipt));
    }

    // Explicit, finite upgrade of this sprint's sixteen models. No authored
    // geometry, legacy import settings, materials or scene may be regenerated.
    public static void EnableFramingReadback()
    {
        var catalog=ReadCatalog();
        string evidence=Environment.GetEnvironmentVariable("ST_LS_TANK_ART_EVIDENCE");
        Require(!string.IsNullOrEmpty(evidence),"A fresh metadata-backup evidence directory is required");
        string backup=Path.Combine(evidence,"prior-model-import-settings");
        Require(!Directory.Exists(backup),"Preserve existing metadata backups");Directory.CreateDirectory(backup);
        foreach(var part in catalog.parts)
        {
            string path=Root+"/"+part.model;
            File.Copy(path+".meta",Path.Combine(backup,part.id+".fbx.meta"),false);
            var importer=AssetImporter.GetAtPath(path) as ModelImporter;
            Require(importer!=null,"Core importer missing");importer.isReadable=true;importer.SaveAndReimport();
            Require(Hash(path)==part.sha256,"Readability upgrade changed authored model bytes");
        }
        AssetDatabase.SaveAssets();Validate();Debug.Log("ST_TANK_FRAMING_READBACK_PASS sixteen core models only");
    }
}

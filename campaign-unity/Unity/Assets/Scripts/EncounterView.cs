using System.Collections.Generic;
using UnityEngine;
using SingedTerra.Art;

namespace SingedTerra.Encounter
{
    // Bounded diagnostic opponent geometry and decorative tracers; no damage authority.
    public sealed class EncounterView : MonoBehaviour
    {
        TankPresentation owner;
        Mesh cube;
        Renderer[] repairMeshes, launcherMeshes;
        readonly Transform[] units = new Transform[EncounterModel.Capacity];
        readonly Transform[] bars = new Transform[EncounterModel.Capacity];
        readonly GameObject[] guns = new GameObject[EncounterModel.Capacity];
        readonly Renderer[] bodies = new Renderer[EncounterModel.Capacity];
        readonly LineRenderer[] trails = new LineRenderer[12];
        readonly float[] life = new float[12];
        readonly List<Material> materials = new List<Material>();
        Material closePaint, rangedPaint, rubber, health, shell, rocket, incoming, repair;
        int nextTrail;
        public bool FullEffects { get; private set; } = true;
        public int VisibleUnits { get; private set; }
        public int PoolSize => units.Length;
        Material Paint(Material basis, Color color)
        {
            var material = new Material(basis);
            material.SetTexture("_BaseMap", null); material.SetColor("_BaseColor", color);
            materials.Add(material); return material;
        }
        Transform Box(string name, Transform parent, Vector3 position, Vector3 scale, Material material)
        {
            var obj = new GameObject(name, typeof(MeshFilter), typeof(MeshRenderer));
            obj.GetComponent<MeshFilter>().sharedMesh = cube;
            obj.transform.SetParent(parent, false); obj.transform.localPosition = position;
            obj.transform.localScale = scale; obj.GetComponent<Renderer>().sharedMaterial = material;
            return obj.transform;
        }
        public void Initialize(TankPresentation presentation)
        {
            owner = presentation; cube = CreateCube();
            repairMeshes = owner.repairModule.GetComponentsInChildren<Renderer>(true);
            launcherMeshes = owner.launcherModule.GetComponentsInChildren<Renderer>(true);
            var basis = owner.tank.GetComponentInChildren<Renderer>().sharedMaterial;
            closePaint = Paint(basis, new Color(.48f,.19f,.12f));
            rangedPaint = Paint(basis, new Color(.43f,.34f,.19f));
            rubber = Paint(basis, new Color(.055f,.06f,.065f));
            health = Paint(basis, new Color(.55f,.75f,.37f));
            shell = Paint(basis, new Color(1f,.82f,.32f));
            rocket = Paint(basis, new Color(1f,.38f,.12f));
            incoming = Paint(basis, new Color(.86f,.24f,.18f));
            repair = Paint(basis, new Color(.25f,.9f,.65f));
            for (int i = 0; i < units.Length; i++)
            {
                var root = new GameObject("EncounterFoe_" + i).transform;
                root.SetParent(transform, false); units[i] = root;
                bodies[i] = Box("Hull", root, Vector3.zero, new Vector3(1.15f,.5f,1.5f), closePaint).GetComponent<Renderer>();
                Box("LeftTrack", root, new Vector3(-.65f,-.15f,0), new Vector3(.32f,.4f,1.8f), rubber);
                Box("RightTrack", root, new Vector3(.65f,-.15f,0), new Vector3(.32f,.4f,1.8f), rubber);
                guns[i] = Box("RangedTube", root, new Vector3(0,.4f,.65f), new Vector3(.24f,.24f,1.8f), rangedPaint).gameObject;
                bars[i] = Box("HullIndicator", root, new Vector3(0,.7f,0), new Vector3(1,.06f,.16f), health);
                root.gameObject.SetActive(false);
            }
            for (int i = 0; i < trails.Length; i++)
            {
                var line = new GameObject("EncounterTracer_" + i).AddComponent<LineRenderer>();
                line.transform.SetParent(transform, false); line.positionCount = 2;
                line.useWorldSpace = true; line.startWidth = .075f; line.endWidth = .035f;
                line.sharedMaterial = shell; line.enabled = false; trails[i] = line;
            }
        }
        public Vector3 Position(EncounterFoe foe)
        {
            float angle = foe.Lane * Mathf.PI / 4;
            return owner.tank.position + new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle)) * (foe.Distance * .001f)
                + Vector3.up * .85f;
        }
        public void Render(EncounterModel model)
        {
            VisibleUnits = 0;
            for (int i = 0; i < units.Length; i++)
            {
                var foe = model.Foes[i]; units[i].gameObject.SetActive(foe.Alive);
                if (!foe.Alive) continue;
                VisibleUnits++; units[i].position = Position(foe);
                units[i].rotation = Quaternion.LookRotation(Vector3.ProjectOnPlane(owner.tank.position - units[i].position, Vector3.up));
                bool ranged = foe.Kind == FoeKind.Ranged;
                bodies[i].sharedMaterial = ranged ? rangedPaint : closePaint;
                guns[i].SetActive(ranged);
                bars[i].localScale = new Vector3((float)foe.Hull / foe.MaximumHull, .06f, .16f);
            }
        }
        public void Present(EncounterModel model)
        {
            foreach (var e in model.Events)
            {
                Vector3 center = owner.tank.position + Vector3.up * 1.5f;
                Vector3 target = e.Slot < 0 ? center : Position(model.Foes[e.Slot]);
                if (e.Kind == EncounterEventKind.Cannon)
                {
                    owner.PlayEncounterShot(target);
                    Trace(owner.muzzle.position, target, shell);
                }
                else if (e.Kind == EncounterEventKind.Launcher)
                    Trace(Center(launcherMeshes), target, rocket);
                else if (e.Kind == EncounterEventKind.Repair)
                    Trace(Center(repairMeshes), center, repair);
                else Trace(target, center, incoming);
            }
        }
        static Mesh CreateCube()
        {
            var points = new[] {
                new Vector3(-.5f,-.5f,-.5f), new Vector3(.5f,-.5f,-.5f),
                new Vector3(.5f,.5f,-.5f), new Vector3(-.5f,.5f,-.5f),
                new Vector3(-.5f,-.5f,.5f), new Vector3(.5f,-.5f,.5f),
                new Vector3(.5f,.5f,.5f), new Vector3(-.5f,.5f,.5f) };
            int[] faces = {0,2,1,0,3,2,4,5,6,4,6,7,3,7,6,3,6,2,
                0,1,5,0,5,4,0,4,7,0,7,3,1,2,6,1,6,5};
            var vertices = new Vector3[faces.Length]; var triangles = new int[faces.Length];
            for(int i=0;i<faces.Length;i++){vertices[i]=points[faces[i]];triangles[i]=i;}
            var mesh = new Mesh { name = "EncounterDiagnosticCube" };
            mesh.vertices = vertices; mesh.triangles = triangles;
            mesh.RecalculateNormals(); mesh.RecalculateBounds(); return mesh;
        }
        static Vector3 Center(Renderer[] meshes)
        {
            var bounds = meshes[0].bounds;
            for(int i=1;i<meshes.Length;i++)bounds.Encapsulate(meshes[i].bounds);
            return bounds.center;
        }
        void Trace(Vector3 from, Vector3 to, Material material)
        {
            if (!FullEffects) return;
            int i = nextTrail; nextTrail = (nextTrail + 1) % trails.Length; life[i] = .22f;
            trails[i].sharedMaterial = material; trails[i].SetPosition(0, from);
            trails[i].SetPosition(1, to); trails[i].enabled = true;
        }
        public void Advance(float elapsed)
        {
            for (int i = 0; i < life.Length; i++)
            {
                life[i] = Mathf.Max(0, life[i] - elapsed);
                trails[i].enabled = FullEffects && life[i] > 0;
            }
        }
        public void ToggleEffects()
        {
            FullEffects = !FullEffects;
            for (int i = 0; i < life.Length; i++) { life[i] = 0; trails[i].enabled = false; }
        }
        public void Clear()
        {
            VisibleUnits = 0; nextTrail = 0;
            foreach (var unit in units) if (unit) unit.gameObject.SetActive(false);
            for (int i = 0; i < life.Length; i++) { life[i] = 0; if (trails[i]) trails[i].enabled = false; }
        }
        void OnDestroy()
        {
            foreach (var material in materials) if (material) Destroy(material);
            if(cube)Destroy(cube);
        }
    }
}

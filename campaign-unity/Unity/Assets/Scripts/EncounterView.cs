using System.Collections.Generic;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.LastStand;

namespace SingedTerra.Encounter
{
    // Bounded diagnostic opponent geometry and decorative tracers; no damage authority.
    public sealed class EncounterView : MonoBehaviour
    {
        TankPresentation owner;
        SingedTerra.VisualReview.ReviewCombatVisuals reviewVisuals;
        SingedTerra.VisualReview.BattlefieldReview review;
        Mesh cube;
        Renderer[] repairMeshes, launcherMeshes;
        readonly Transform[] units = new Transform[EncounterModel.Capacity];
        readonly Transform[] bars = new Transform[EncounterModel.Capacity];
        readonly GameObject[] guns = new GameObject[EncounterModel.Capacity];
        readonly Renderer[] bodies = new Renderer[EncounterModel.Capacity];
        readonly LineRenderer[] trails = new LineRenderer[12];
        readonly float[] life = new float[12];
        readonly bool[] mortarPresented=new bool[EncounterModel.Capacity];
        readonly List<Material> materials = new List<Material>();
        Material closePaint, rangedPaint, rubber, health, shell, rocket, incoming, repair, scatter,mortar,railgun,arc,shield;
        int nextTrail;
        bool currentGeometry;
        Transform skillMines;
        LineRenderer mineBoundary;
        public bool FullEffects { get; private set; } = true;
        public int VisibleUnits { get; private set; }
        public int PoolSize => units.Length;
        Material Paint(Material basis, Color color)
        {
            var material = new Material(basis);
            material.SetTexture("_BaseMap", null); material.SetColor("_BaseColor", color);
            materials.Add(material); return material;
        }
        Material Signal(Color color)
        {
            var material=new Material(Shader.Find("SingedTerra/Combat Glow"));
            material.SetColor("_BaseColor",new Color(color.r*2.4f,color.g*2.4f,color.b*2.4f,1));materials.Add(material);return material;
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
            owner = presentation;owner.EnsureInitialized(); cube = CreateCube();
            owner.SetEncounterEffects(FullEffects);
            repairMeshes = owner.repairModule.GetComponentsInChildren<Renderer>(true);
            launcherMeshes = owner.launcherModule.GetComponentsInChildren<Renderer>(true);
            var basis = owner.tank.GetComponentInChildren<Renderer>().sharedMaterial;
            closePaint = Paint(basis, new Color(.48f,.19f,.12f));
            rangedPaint = Paint(basis, new Color(.43f,.34f,.19f));
            rubber = Paint(basis, new Color(.055f,.06f,.065f));
            health = Paint(basis, new Color(.55f,.75f,.37f));
            shell = Signal(new Color(1f,.86f,.55f));
            rocket = Signal(new Color(1f,.38f,.12f));
            incoming = Signal(new Color(.86f,.24f,.18f));
            repair = Signal(new Color(.25f,.9f,.65f));
            scatter = Signal(new Color(1f,.70f,.40f));
            mortar=Signal(new Color(.94f,.66f,.33f));railgun=Signal(new Color(.56f,.87f,1f));
            arc=Signal(new Color(.44f,.62f,1f));shield=Signal(new Color(.42f,.75f,1f));
            skillMines=new GameObject("Armed defensive minefield").transform;skillMines.SetParent(transform,false);
            mineBoundary=new GameObject("Minefield perimeter").AddComponent<LineRenderer>();mineBoundary.transform.SetParent(skillMines,false);
            mineBoundary.useWorldSpace=false;mineBoundary.loop=true;mineBoundary.positionCount=64;mineBoundary.widthMultiplier=.045f;mineBoundary.sharedMaterial=mortar;
            for(int i=0;i<64;i++){float angle=i*Mathf.PI*2/64;mineBoundary.SetPosition(i,new Vector3(Mathf.Sin(angle)*10,.06f,Mathf.Cos(angle)*10));}
            for(int i=0;i<12;i++)
            {
                float angle=i*Mathf.PI/6;var at=new Vector3(Mathf.Sin(angle)*10,.11f,Mathf.Cos(angle)*10);
                var mine=Box("Buried mine",skillMines,at,new Vector3(.38f,.14f,.38f),rangedPaint);mine.localRotation=Quaternion.Euler(0,angle*Mathf.Rad2Deg,0);
                Box("Mine armed indicator",skillMines,at+Vector3.up*.09f,new Vector3(.08f,.045f,.08f),mortar);
            }
            skillMines.gameObject.SetActive(false);
            review=owner.GetComponent<SingedTerra.VisualReview.BattlefieldReview>();
            if(review){reviewVisuals=new SingedTerra.VisualReview.ReviewCombatVisuals(review,owner,transform);review.Changed+=reviewVisuals.FaceCamera;}
            for (int i = 0; i < (review ? 0 : units.Length); i++)
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
                line.useWorldSpace = true; line.startWidth = .11f; line.endWidth = .045f;
                line.sharedMaterial = shell; line.enabled = false; trails[i] = line;
            }
        }
        public Vector3 Position(EncounterFoe foe)
        {
            if(reviewVisuals!=null)return reviewVisuals.Position(foe)+Vector3.up*.85f;
            if(currentGeometry)
            {
                var point=EncounterGeometry.Position(foe.Lane,foe.Id,foe.Distance);
                return owner.tank.position+new Vector3(point.X*.001f,.85f,point.Z*.001f);
            }
            float angle = foe.Lane * Mathf.PI / 4;
            return owner.tank.position + new Vector3(Mathf.Sin(angle), 0, Mathf.Cos(angle)) * (foe.Distance * .001f)
                + Vector3.up * .85f;
        }
        public void Render(EncounterModel model)
        {
            BindModel(model);
            skillMines.position=owner.tank.position;skillMines.gameObject.SetActive(model.MinefieldArmed);
            mineBoundary.enabled=model.MinefieldArmed&&FullEffects;
            owner.SetShieldCharge(model.Shield,model.CurrentShieldCapacity);
            if(reviewVisuals!=null){reviewVisuals.Render(model);VisibleUnits=reviewVisuals.Active;return;}
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
            BindModel(model);System.Array.Clear(mortarPresented,0,mortarPresented.Length);
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
                else if (e.Kind == EncounterEventKind.Scattergun)
                {
                    owner.PlayScattergunShot(target);
                    var origin=owner.ScattergunMuzzle;
                    var spread=Vector3.Cross(Vector3.up,target-origin).normalized*.16f;
                    for(int pellet=-1;pellet<=1;pellet++)Trace(origin,target+spread*pellet,scatter);
                }
                else if(e.Kind==EncounterEventKind.Mortar&&!mortarPresented[e.AimSlot])
                {
                    mortarPresented[e.AimSlot]=true;
                    var centerTarget=Position(model.Foes[e.AimSlot]);
                    owner.PlayFittingShot(LastStandFitting.Mortar,centerTarget);
                    Trace(owner.FittingMuzzle(LastStandFitting.Mortar),centerTarget,mortar,true);
                }
                else if(e.Kind==EncounterEventKind.Railgun)
                {
                    owner.PlayFittingShot(LastStandFitting.Railgun,target);
                    Trace(owner.FittingMuzzle(LastStandFitting.Railgun),target,railgun);
                }
                else if(e.Kind==EncounterEventKind.Arc)
                {
                    bool first=e.AimSlot==e.Slot;
                    if(first)owner.PlayFittingShot(LastStandFitting.Arc,target);
                    Trace(first?owner.FittingMuzzle(LastStandFitting.Arc):Position(model.Foes[e.AimSlot]),target,arc);
                }
                else if(e.Kind==EncounterEventKind.ShieldAbsorb||e.Kind==EncounterEventKind.ShieldRecharge)
                {
                    owner.PlayShieldPulse(e.Kind==EncounterEventKind.ShieldRecharge);
                    owner.SetShieldCharge(model.Shield,model.CurrentShieldCapacity);
                }
                else if(e.Kind==EncounterEventKind.EnemyShield||e.Kind==EncounterEventKind.EnemyRepair)
                    Trace(target+Vector3.up*.85f,target,e.Kind==EncounterEventKind.EnemyShield?shield:repair);
                else if (e.Kind == EncounterEventKind.Repair)
                    Trace(Center(repairMeshes), center, repair);
                else if(e.Kind==EncounterEventKind.EmergencyRepairs)Trace(center-Vector3.up,center+Vector3.up*1.8f,repair);
                else if(e.Kind==EncounterEventKind.Overdrive)Trace(center-Vector3.right,center+Vector3.right,mortar);
                else if(e.Kind==EncounterEventKind.Minefield)Trace(target-Vector3.up*.5f,target+Vector3.up*1.6f,rocket);
                else if(e.Kind==EncounterEventKind.CloseHit || e.Kind==EncounterEventKind.RangedHit)Trace(target, center, incoming);
            }
            reviewVisuals?.Present(model);
        }
        void BindModel(EncounterModel model)
        {
            currentGeometry=model.Profile.IsWaveBased&&!model.Profile.Edition.IsLegacy;
            reviewVisuals?.BindModel(model);
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
        void Trace(Vector3 from, Vector3 to, Material material,bool arc=false)
        {
            if (!FullEffects) return;
            int i = nextTrail; nextTrail = (nextTrail + 1) % trails.Length; life[i] = .22f;
            bool electrical=material==this.arc;
            trails[i].sharedMaterial = material;trails[i].positionCount=arc?9:electrical?13:2;
            trails[i].startColor=trails[i].endColor=Color.white;
            trails[i].SetPosition(0,from);trails[i].SetPosition(trails[i].positionCount-1,to);
            for(int point=1;point<trails[i].positionCount-1;point++)
            {
                float t=point/(float)(trails[i].positionCount-1);
                Vector3 offset=Vector3.up*(4*t*(1-t)*3f);
                if(electrical)
                {
                    var sideways=Vector3.Cross((to-from).normalized,Vector3.up).normalized;
                    float envelope=Mathf.Sin(t*Mathf.PI);
                    offset=envelope*(sideways*Mathf.Sin(point*19.7f+i*7.1f)*.42f+Vector3.up*Mathf.Cos(point*11.3f+i)*.25f);
                }
                trails[i].SetPosition(point,Vector3.Lerp(from,to,t)+offset);
            }
            trails[i].enabled = true;
        }
        public void Advance(float elapsed)
        {
            reviewVisuals?.Advance(elapsed);
            for (int i = 0; i < life.Length; i++)
            {
                life[i] = Mathf.Max(0, life[i] - elapsed);
                trails[i].enabled = FullEffects && life[i] > 0;
                trails[i].startColor=trails[i].endColor=new Color(1,1,1,Mathf.Clamp01(life[i]/.22f));
            }
        }
        public void ToggleEffects()
        {
            FullEffects = !FullEffects;
            reviewVisuals?.SetEffects(FullEffects);
            owner.SetEncounterEffects(FullEffects);
            for (int i = 0; i < life.Length; i++) { life[i] = 0; trails[i].enabled = false; }
        }
        public void Clear()
        {
            VisibleUnits = 0; nextTrail = 0;currentGeometry=false;
            reviewVisuals?.Clear();
            if(skillMines)skillMines.gameObject.SetActive(false);
            foreach (var unit in units) if (unit) unit.gameObject.SetActive(false);
            for (int i = 0; i < life.Length; i++) { life[i] = 0; if (trails[i]) trails[i].enabled = false; }
        }
        void OnDestroy()
        {
            if(review&&reviewVisuals!=null)review.Changed-=reviewVisuals.FaceCamera;
            reviewVisuals?.Dispose();
            foreach (var material in materials) if (material) Destroy(material);
            if(cube)Destroy(cube);
        }
    }
}

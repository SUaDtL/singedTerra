using System;
using System.Linq;
using UnityEngine;
using SingedTerra.Art;
using SingedTerra.Encounter;

namespace SingedTerra.VisualReview
{
    // Presentation helper owned and driven only by EncounterView.
    public sealed class ReviewCombatVisuals
    {
        // Separates the authored 2.318m-wide vehicles throughout both review runs.
        const float FormationAngleStep = .42f;
        sealed class Vehicle
        {
            public Transform root;
            public GameObject close, ranged;
            public GameObject bruteArmor,eliteTurret;
            public LineRenderer warning;
            public Vector3 closeScale,rangedScale;
            public Transform[] wheels;
            public Renderer[] paint;
            public Vector3 goal;
            public int id, health;
            public float flash, dustClock;
        }
        sealed class Puff
        {
            public Transform node;
            public Renderer renderer;
            public float age, duration, start, end;
            public Vector3 velocity;
            public Color color;
            public bool ground;
        }
        readonly BattlefieldReview settings;
        readonly TankPresentation tank;
        readonly Transform root;
        readonly Vehicle[] vehicles = new Vehicle[EncounterModel.Capacity];
        readonly bool[] destructionPresented = new bool[EncounterModel.Capacity];
        readonly bool[] mortarPresented = new bool[EncounterModel.Capacity];
        readonly Mesh rolePlate;
        readonly Puff[] puffs = new Puff[80];
        readonly MaterialPropertyBlock block = new MaterialPropertyBlock();
        int nextPuff;
        bool full = true;
        bool currentGeometry;
        public int Active { get; private set; }
        public ReviewCombatVisuals(BattlefieldReview settings, TankPresentation tank, Transform parent)
        {
            this.settings=settings; this.tank=tank;
            rolePlate=LastStandModuleGeometry.Prism(true,"Enemy role");
            root=new GameObject("Review combat visuals").transform; root.SetParent(parent,false);
            for(int i=0;i<vehicles.Length;i++)
            {
                var v=new Vehicle(); vehicles[i]=v;
                v.root=new GameObject("Review foe "+i).transform; v.root.SetParent(root,false);
                v.close=UnityEngine.Object.Instantiate(settings.closeVehicle,v.root);
                v.ranged=UnityEngine.Object.Instantiate(settings.rangedVehicle,v.root);
                v.closeScale=v.close.transform.localScale;v.rangedScale=v.ranged.transform.localScale;
                var steel=LastStandModuleGeometry.Material(tank,"Steel");
                var armor=LastStandModuleGeometry.Material(tank,"Armor");
                v.bruteArmor=new GameObject("Brute layered armor");v.bruteArmor.transform.SetParent(v.root,false);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Brute side armor "+side,v.bruteArmor.transform,new Vector3(side*1.22f,.78f,0),new Vector3(.30f,.72f,1.95f),rolePlate,armor);
                LastStandModuleGeometry.Part("Brute sloped prow",v.bruteArmor.transform,new Vector3(0,.68f,-1.05f),new Vector3(2.15f,.68f,.34f),rolePlate,steel).localRotation=Quaternion.Euler(-20,0,0);
                v.eliteTurret=new GameObject("Elite twin siege turret");v.eliteTurret.transform.SetParent(v.root,false);
                LastStandModuleGeometry.Part("Elite high turret",v.eliteTurret.transform,new Vector3(0,1.65f,.05f),new Vector3(1.65f,.75f,1.2f),rolePlate,armor);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Elite heavy barrel "+side,v.eliteTurret.transform,new Vector3(side*.50f,1.85f,-1.1f),new Vector3(.30f,.32f,1.75f),rolePlate,steel);
                v.wheels=v.root.GetComponentsInChildren<Transform>(true).Where(t=>t.name.StartsWith("Wheel_")).ToArray();
                v.paint=v.root.GetComponentsInChildren<Renderer>(true);
                v.warning=new GameObject("Elite attack warning").AddComponent<LineRenderer>();v.warning.transform.SetParent(v.root,false);
                v.warning.useWorldSpace=false;v.warning.loop=true;v.warning.positionCount=16;
                v.warning.startWidth=v.warning.endWidth=.14f;v.warning.sharedMaterial=settings.flashMaterial;
                v.warning.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;v.warning.receiveShadows=false;
                for(int point=0;point<16;point++){float angle=point*Mathf.PI/8;v.warning.SetPosition(point,new Vector3(Mathf.Sin(angle)*1.9f,.12f,Mathf.Cos(angle)*1.9f));}
                var warningPaint=new MaterialPropertyBlock();warningPaint.SetColor("_BaseColor",new Color(1f,.75f,.25f));v.warning.SetPropertyBlock(warningPaint);
                v.warning.gameObject.SetActive(false);
                v.root.gameObject.SetActive(false);
            }
            for(int i=0;i<puffs.Length;i++)
            {
                var node=new GameObject("Review feedback "+i,typeof(MeshFilter),typeof(MeshRenderer));
                node.transform.SetParent(root,false);
                node.GetComponent<MeshFilter>().sharedMesh=settings.effectQuad;
                var renderer=node.GetComponent<MeshRenderer>();
                renderer.sharedMaterial=settings.dustMaterial;
                renderer.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;
                renderer.receiveShadows=false;
                puffs[i]=new Puff{node=node.transform,renderer=renderer};
                node.SetActive(false);
            }
        }
        public Vector3 Position(EncounterFoe foe)
        {
            if(currentGeometry)
            {
                var point=EncounterGeometry.Position(foe.Lane,foe.Id,foe.Distance);
                return tank.tank.position+new Vector3(point.X*.001f,0,point.Z*.001f);
            }
            // Four clockwise columns follow fixed radial paths, keeping hulls
            // aligned with travel. The model still owns the exact radius.
            float radius=foe.Distance*.001f;
            float separation=(1.5f-(foe.Id-1)%4)*FormationAngleStep;
            float angle=foe.Lane*Mathf.PI/4+separation;
            return tank.tank.position+new Vector3(Mathf.Sin(angle),0,Mathf.Cos(angle))*radius;
        }
        internal void BindModel(EncounterModel model)
        { currentGeometry=model.Profile.IsWaveBased&&!model.Profile.Edition.IsLegacy; }
        public void Render(EncounterModel model)
        {
            BindModel(model);
            Active=0;
            for(int i=0;i<vehicles.Length;i++)
            {
                var v=vehicles[i];var foe=model.Foes[i];
                if(!foe.Alive){v.warning.gameObject.SetActive(false);v.root.gameObject.SetActive(false);continue;}
                Active++;v.goal=Position(foe);
                if(v.id!=foe.Id)
                {
                    v.id=foe.Id;v.health=foe.Hull;v.flash=0;v.dustClock=0;
                    v.root.position=v.goal;
                }
                v.root.gameObject.SetActive(true);
                bool ranged=foe.Kind==FoeKind.Ranged||foe.Kind==FoeKind.SiegeElite;
                v.close.SetActive(!ranged);v.ranged.SetActive(ranged);
                v.close.transform.localScale=Vector3.Scale(v.closeScale,foe.Kind==FoeKind.Swarmer?new Vector3(.67f,.52f,.75f):
                    foe.Kind==FoeKind.ArmoredBrute?new Vector3(1.14f,1.12f,1.05f):Vector3.one);
                v.ranged.transform.localScale=v.rangedScale*(foe.Kind==FoeKind.SiegeElite?1.12f:1f);
                v.bruteArmor.SetActive(foe.Kind==FoeKind.ArmoredBrute);v.eliteTurret.SetActive(foe.Kind==FoeKind.SiegeElite);
                int warningTicks=model.Status==EncounterStatus.Running?model.TelegraphRemainingTicks(foe):0;
                v.warning.gameObject.SetActive(warningTicks>0);
                if(warningTicks>0)v.warning.transform.localScale=Vector3.one*(.9f+.1f*warningTicks/
                    SingedTerra.LastStand.LastStandEnemyCatalog.Get(foe.Kind).TelegraphTicks);
                Vector3 direction=Vector3.ProjectOnPlane(tank.tank.position-v.goal,Vector3.up);
                if(direction.sqrMagnitude>.01f)v.root.rotation=Quaternion.LookRotation(-direction);
                v.health=foe.Hull;
            }
        }
        public void Present(EncounterModel model)
        {
            BindModel(model);
            Array.Clear(destructionPresented,0,destructionPresented.Length);
            Array.Clear(mortarPresented,0,mortarPresented.Length);
            foreach(var e in model.Events)
            {
                if(e.Kind==EncounterEventKind.Repair)continue;
                bool outgoing=e.Kind==EncounterEventKind.Cannon||e.Kind==EncounterEventKind.Launcher||e.Kind==EncounterEventKind.Scattergun||
                    e.Kind==EncounterEventKind.Mortar||e.Kind==EncounterEventKind.Railgun;
                var foe=model.Foes[e.Slot];Vector3 position=Position(foe)+Vector3.up*.7f;
                if(outgoing)
                {
                    vehicles[e.Slot].flash=full?.12f:0;
                    Emit(position,full?.18f:.14f,full?.25f:.12f,full?1.0f:.4f,
                        new Color(1f,.66f,.25f,full?1f:.6f),settings.flashMaterial,false,Vector3.zero);
                    if(e.Killed&&!destructionPresented[e.Slot])
                    {
                        destructionPresented[e.Slot]=true;
                        Destruction(position);
                    }
                    if(full&&e.Kind==EncounterEventKind.Cannon)
                        Emit(tank.muzzle.position,.10f,.25f,.85f,new Color(1f,.82f,.43f),settings.flashMaterial,false,Vector3.zero);
                    if(full&&e.Kind==EncounterEventKind.Scattergun)
                        Emit(tank.ScattergunMuzzle,.08f,.20f,.62f,new Color(1f,.70f,.40f),settings.flashMaterial,false,Vector3.zero);
                    if(e.Kind==EncounterEventKind.Mortar&&!mortarPresented[e.AimSlot])
                    {
                        mortarPresented[e.AimSlot]=true;
                        if(full)
                        {
                            Emit(tank.FittingMuzzle(SingedTerra.LastStand.LastStandFitting.Mortar),.12f,.25f,.8f,new Color(1f,.72f,.35f),settings.flashMaterial,false,Vector3.zero);
                            var center=Position(model.Foes[e.AimSlot]);center.y=tank.tank.position.y+.04f;
                            Emit(center,.30f,.45f,2.4f,new Color(.90f,.56f,.28f,.55f),settings.flashMaterial,true,Vector3.zero);
                        }
                    }
                    if(full&&e.Kind==EncounterEventKind.Railgun)
                        Emit(tank.FittingMuzzle(SingedTerra.LastStand.LastStandFitting.Railgun),.08f,.16f,.42f,new Color(.60f,.88f,1f),settings.flashMaterial,false,Vector3.zero);
                }
                else if(e.Kind==EncounterEventKind.CloseHit||e.Kind==EncounterEventKind.RangedHit)
                {
                    if(full)Emit(position+Vector3.up*.35f,.10f,.18f,.55f,new Color(1f,.59f,.20f),settings.flashMaterial,false,Vector3.zero);
                    Emit(tank.tank.position+Vector3.up,full?.18f:.14f,full?.25f:.12f,full?.80f:.4f,
                        new Color(1f,.48f,.17f,full?1f:.6f),settings.flashMaterial,false,Vector3.zero);
                }
            }
        }
        void Destruction(Vector3 position)
        {
            Emit(position,.28f,full?.55f:.2f,full?2.0f:.65f,
                new Color(1f,.49f,.12f,full?1f:.65f),settings.flashMaterial,false,Vector3.zero);
            if(!full)return;
            for(int i=0;i<4;i++)
            {
                float angle=i*Mathf.PI*.5f;
                Vector3 drift=new Vector3(Mathf.Cos(angle)*.35f,.65f,Mathf.Sin(angle)*.35f);
                Emit(position+drift*.3f,1.6f,.55f,1.8f,new Color(.23f,.22f,.20f,.65f),settings.dustMaterial,false,drift);
            }
            position.y=tank.tank.position.y+.015f;
            Emit(position,5f,1.2f,1.9f,new Color(.11f,.10f,.085f,.5f),settings.scorchMaterial,true,Vector3.zero);
        }
        void Emit(Vector3 position,float duration,float start,float end,Color color,Material material,bool ground,Vector3 velocity)
        {
            var puff=puffs[nextPuff];nextPuff=(nextPuff+1)%puffs.Length;
            puff.age=0;puff.duration=duration;puff.start=start;puff.end=end;
            puff.color=color;puff.velocity=velocity;puff.ground=ground;
            puff.node.position=position;puff.node.localScale=Vector3.one*start;
            puff.renderer.sharedMaterial=material;
            puff.node.gameObject.SetActive(true);PaintPuff(puff);
        }
        void PaintPuff(Puff puff)
        {
            Color color=puff.color;color.a*=1-Mathf.Clamp01(puff.age/puff.duration);
            block.Clear();block.SetColor("_BaseColor",color);puff.renderer.SetPropertyBlock(block);
            puff.node.rotation=puff.ground?Quaternion.Euler(90,0,0):tank.view.transform.rotation;
        }
        public void Advance(float elapsed)
        {
            if(!float.IsFinite(elapsed)||elapsed<0)throw new ArgumentOutOfRangeException(nameof(elapsed));
            foreach(var v in vehicles)
            {
                if(!v.root.gameObject.activeSelf)continue;
                Vector3 before=v.root.position;
                v.root.position=Vector3.Lerp(before,v.goal,1-Mathf.Exp(-elapsed*32));
                float travelled=Vector3.Distance(before,v.root.position);
                foreach(var wheel in v.wheels)
                    wheel.rotation=Quaternion.AngleAxis(travelled/.24f*Mathf.Rad2Deg,v.root.right)*wheel.rotation;
                v.flash=Mathf.Max(0,v.flash-elapsed);
                block.Clear();block.SetColor("_EmissionColor",v.flash>0?new Color(.5f,.18f,.025f):Color.black);
                foreach(var renderer in v.paint)renderer.SetPropertyBlock(block);
                if(full&&travelled>.001f)
                {
                    v.dustClock+=elapsed;
                    if(v.dustClock>=.24f)
                    {
                        v.dustClock=0;
                        Emit(v.root.position+v.root.forward*1.2f+Vector3.up*.15f,1.0f,.22f,.9f,
                            new Color(.39f,.34f,.27f,.23f),settings.dustMaterial,false,Vector3.up*.16f);
                    }
                }
            }
            foreach(var puff in puffs)
            {
                if(!puff.node.gameObject.activeSelf)continue;                puff.age+=elapsed;
                if(puff.age>=puff.duration){puff.node.gameObject.SetActive(false);continue;}
                puff.node.position+=puff.velocity*elapsed;
                puff.node.localScale=Vector3.one*Mathf.Lerp(puff.start,puff.end,puff.age/puff.duration);
                PaintPuff(puff);
            }
        }
        public void FaceCamera()
        {
            foreach(var puff in puffs)if(puff.node.gameObject.activeSelf)PaintPuff(puff);
        }
        public void SetEffects(bool value)
        {
            full=value;
            foreach(var puff in puffs)puff.node.gameObject.SetActive(false);
            // The player may change effects while paused, before Advance runs.
            block.Clear();block.SetColor("_EmissionColor",Color.black);
            foreach(var v in vehicles)
            {
                v.flash=0;
                foreach(var renderer in v.paint)renderer.SetPropertyBlock(block);
            }
        }
        public void Clear()
        {
            Active=0;nextPuff=0;currentGeometry=false;
            foreach(var v in vehicles){v.root.gameObject.SetActive(false);v.warning.gameObject.SetActive(false);v.id=0;v.flash=0;v.dustClock=0;}
            foreach(var puff in puffs)puff.node.gameObject.SetActive(false);
        }
        public void Dispose()
        {
            if(root)UnityEngine.Object.Destroy(root.gameObject);
            LastStandModuleGeometry.Release(rolePlate);
        }
    }
}

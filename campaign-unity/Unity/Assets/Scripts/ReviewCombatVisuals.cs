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
            public Transform closeDetail,rangedDetail;
            public GameObject bruteArmor,eliteTurret,shieldProjector,repairCrane,commanderRig;
            public Transform supportIndicator;
            public Transform hullIndicator,hullFill;
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
            public float aspect,spin,rotation;
        }
        sealed class Wreck { public Transform root;public float age,smokeClock; }
        readonly BattlefieldReview settings;
        readonly TankPresentation tank;
        readonly Transform root;
        readonly Vehicle[] vehicles = new Vehicle[EncounterModel.Capacity];
        readonly bool[] destructionPresented = new bool[EncounterModel.Capacity];
        readonly bool[] mortarPresented = new bool[EncounterModel.Capacity];
        readonly Mesh rolePlate;
        readonly Material hullBack,hullSignal;
        readonly Puff[] puffs = new Puff[256];
        readonly Wreck[] wrecks=new Wreck[12];
        readonly LastStandEnemyDetail enemyDetail;
        readonly Material smokeMaterial,cloudMaterial,fireMaterial,flameMaterial,wreckMaterial,enemyArmor;
        readonly MaterialPropertyBlock block = new MaterialPropertyBlock();
        int nextPuff;
        int nextWreck;
        bool full = true;
        bool currentGeometry;
        public int Active { get; private set; }
        public ReviewCombatVisuals(BattlefieldReview settings, TankPresentation tank, Transform parent)
        {
            this.settings=settings; this.tank=tank;
            rolePlate=LastStandModuleGeometry.Prism(true,"Enemy role");
            enemyArmor=new Material(LastStandModuleGeometry.Material(tank,"Armor"));enemyArmor.name="Enemy worn ochre armor";
            enemyArmor.SetColor("_BaseColor",new Color(.56f,.48f,.34f));enemyArmor.SetFloat("_Metallic",.3f);
            enemyDetail=new LastStandEnemyDetail(enemyArmor,LastStandModuleGeometry.Material(tank,"Steel"));
            smokeMaterial=Particle("Charcoal blast smoke",new Vector4(0,.5f,.5f,.5f));
            cloudMaterial=Particle("Track and impact dust",new Vector4(.5f,.5f,.5f,.5f));
            fireMaterial=Particle("Explosive flash",new Vector4(0,0,.5f,.5f));
            flameMaterial=Particle("Burning wreck flame",new Vector4(.5f,0,.5f,.5f));
            wreckMaterial=new Material(LastStandModuleGeometry.Material(tank,"Steel"));
            wreckMaterial.name="Burnt vehicle steel";wreckMaterial.SetColor("_BaseColor",new Color(.19f,.17f,.14f));
            wreckMaterial.SetFloat("_Smoothness",.08f);wreckMaterial.SetFloat("_Metallic",.22f);
            hullBack=new Material(Shader.Find("Universal Render Pipeline/Unlit"));hullBack.SetColor("_BaseColor",new Color(.035f,.025f,.02f));hullBack.SetFloat("_Cull",0);
            hullSignal=new Material(hullBack);hullSignal.SetColor("_BaseColor",new Color(.82f,.17f,.10f));
            root=new GameObject("Review combat visuals").transform; root.SetParent(parent,false);
            for(int i=0;i<vehicles.Length;i++)
            {
                var v=new Vehicle(); vehicles[i]=v;
                v.root=new GameObject("Review foe "+i).transform; v.root.SetParent(root,false);
                v.close=UnityEngine.Object.Instantiate(settings.closeVehicle,v.root);
                v.ranged=UnityEngine.Object.Instantiate(settings.rangedVehicle,v.root);
                v.closeDetail=enemyDetail.Attach(v.root,false);v.rangedDetail=enemyDetail.Attach(v.root,true);
                v.closeScale=v.close.transform.localScale;v.rangedScale=v.ranged.transform.localScale;
                var steel=LastStandModuleGeometry.Material(tank,"Steel");
                var armor=enemyArmor;
                v.bruteArmor=new GameObject("Brute layered armor");v.bruteArmor.transform.SetParent(v.root,false);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Brute side armor "+side,v.bruteArmor.transform,new Vector3(side*1.22f,.78f,0),new Vector3(.30f,.72f,1.95f),rolePlate,armor);
                LastStandModuleGeometry.Part("Brute sloped prow",v.bruteArmor.transform,new Vector3(0,.68f,-1.05f),new Vector3(2.15f,.68f,.34f),rolePlate,steel).localRotation=Quaternion.Euler(-20,0,0);
                v.eliteTurret=new GameObject("Elite twin siege turret");v.eliteTurret.transform.SetParent(v.root,false);
                LastStandModuleGeometry.Part("Elite high turret",v.eliteTurret.transform,new Vector3(0,1.65f,.05f),new Vector3(1.65f,.75f,1.2f),rolePlate,armor);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Elite heavy barrel "+side,v.eliteTurret.transform,new Vector3(side*.50f,1.85f,-1.1f),new Vector3(.30f,.32f,1.75f),rolePlate,steel);
                var brass=LastStandModuleGeometry.Material(tank,"Brass");
                v.shieldProjector=new GameObject("Shield carrier projector");v.shieldProjector.transform.SetParent(v.root,false);
                LastStandModuleGeometry.Part("Carrier upright shield",v.shieldProjector.transform,new Vector3(0,1.25f,-.65f),new Vector3(2.4f,1.65f,.30f),rolePlate,armor).localRotation=Quaternion.Euler(-12,0,0);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Carrier emitter "+side,v.shieldProjector.transform,new Vector3(side*.95f,2.05f,-.65f),new Vector3(.28f,.35f,.40f),rolePlate,brass);
                v.repairCrane=new GameObject("Medic service crane");v.repairCrane.transform.SetParent(v.root,false);
                LastStandModuleGeometry.Part("Medic raised mast",v.repairCrane.transform,new Vector3(0,1.55f,.45f),new Vector3(.36f,1.6f,.4f),rolePlate,steel);
                LastStandModuleGeometry.Part("Medic lateral boom",v.repairCrane.transform,new Vector3(0,2.25f,.2f),new Vector3(2.65f,.28f,.35f),rolePlate,armor);
                for(int side=-1;side<=1;side+=2)
                    LastStandModuleGeometry.Part("Medic repair tool "+side,v.repairCrane.transform,new Vector3(side*1.18f,1.9f,.2f),new Vector3(.35f,.60f,.35f),rolePlate,brass);
                v.commanderRig=new GameObject("Commander command rig");v.commanderRig.transform.SetParent(v.root,false);
                LastStandModuleGeometry.Part("Commander siege turret",v.commanderRig.transform,new Vector3(0,1.95f,.05f),new Vector3(2.25f,.85f,1.55f),rolePlate,armor);
                for(int barrel=-1;barrel<=1;barrel++)
                    LastStandModuleGeometry.Part("Commander siege barrel "+barrel,v.commanderRig.transform,new Vector3(barrel*.62f,2.05f,-1.4f),new Vector3(.38f,.38f,2.15f),rolePlate,steel);
                LastStandModuleGeometry.Part("Commander signal mast",v.commanderRig.transform,new Vector3(.88f,2.7f,.65f),new Vector3(.13f,1.25f,.13f),rolePlate,brass);
                v.supportIndicator=LastStandModuleGeometry.Part("Support reserve",v.root,new Vector3(0,2.55f,.1f),new Vector3(1.2f,.13f,.16f),rolePlate,brass);
                v.wheels=v.root.GetComponentsInChildren<Transform>(true).Where(t=>t.name.StartsWith("Wheel_")).ToArray();
                v.paint=v.root.GetComponentsInChildren<Renderer>(true);
                v.hullIndicator=LastStandModuleGeometry.Part("Enemy hull backdrop",v.root,new Vector3(0,2.6f,0),new Vector3(1.7f,.18f,1),settings.effectQuad,hullBack);
                v.hullFill=LastStandModuleGeometry.Part("Enemy hull fill",v.hullIndicator,Vector3.zero,new Vector3(.9f,.55f,1),settings.effectQuad,hullSignal);
                foreach(var indicator in v.hullIndicator.GetComponentsInChildren<Renderer>())
                {indicator.shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;indicator.receiveShadows=false;}
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
            for(int i=0;i<wrecks.Length;i++)
            {
                var node=new GameObject("Spent wreck "+i).transform;node.SetParent(root,false);
                UnityEngine.Object.Instantiate(settings.closeVehicle,node);
                var detail=enemyDetail.Attach(node,false);detail.localRotation=Quaternion.Euler(0,16,0);
                foreach(var renderer in node.GetComponentsInChildren<Renderer>())
                {
                    var palette=renderer.sharedMaterials;for(int m=0;m<palette.Length;m++)palette[m]=wreckMaterial;
                    renderer.sharedMaterials=palette;
                }
                wrecks[i]=new Wreck{root=node};node.gameObject.SetActive(false);
            }
        }
        static Material Particle(string name,Vector4 tile)
        {
            var material=new Material(Shader.Find("SingedTerra/Combat Particle")){name=name};
            material.SetTexture("_BaseMap",Resources.Load<Texture2D>("ArtDirection/CombatParticles"));material.SetVector("_Tile",tile);return material;
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
                bool ranged=foe.Kind==FoeKind.Ranged||foe.Kind==FoeKind.SiegeElite||foe.Kind==FoeKind.SiegeCommander;
                v.close.SetActive(!ranged);v.ranged.SetActive(ranged);
                v.closeDetail.gameObject.SetActive(!ranged);v.rangedDetail.gameObject.SetActive(ranged);
                v.closeDetail.localScale=foe.Kind==FoeKind.Swarmer?new Vector3(.67f,.52f,.75f):foe.Kind==FoeKind.ArmoredBrute?new Vector3(1.14f,1.12f,1.05f):Vector3.one;
                v.rangedDetail.localScale=Vector3.one*(foe.Kind==FoeKind.SiegeCommander?1.28f:foe.Kind==FoeKind.SiegeElite?1.12f:1f);
                v.close.transform.localScale=Vector3.Scale(v.closeScale,foe.Kind==FoeKind.Swarmer?new Vector3(.67f,.52f,.75f):
                    foe.Kind==FoeKind.ArmoredBrute?new Vector3(1.14f,1.12f,1.05f):Vector3.one);
                v.ranged.transform.localScale=v.rangedScale*(foe.Kind==FoeKind.SiegeCommander?1.28f:foe.Kind==FoeKind.SiegeElite?1.12f:1f);
                v.bruteArmor.SetActive(foe.Kind==FoeKind.ArmoredBrute);v.eliteTurret.SetActive(foe.Kind==FoeKind.SiegeElite);
                v.shieldProjector.SetActive(foe.Kind==FoeKind.ShieldCarrier);v.repairCrane.SetActive(foe.Kind==FoeKind.Medic);
                v.commanderRig.SetActive(foe.Kind==FoeKind.SiegeCommander);
                bool support=foe.Kind==FoeKind.ShieldCarrier||foe.Kind==FoeKind.Medic;
                v.supportIndicator.gameObject.SetActive(support&&foe.SupportRemaining>0);
                if(support&&foe.SupportRemaining>0)
                {
                    var stats=SingedTerra.LastStand.LastStandEnemyCatalog.ForKind(foe.Kind,
                        SingedTerra.LastStand.LastStandWaveCatalog.ForWave(model.Profile.TierDefinition,model.Wave,model.Profile.Edition),model.Profile.Edition);
                    float capacity=stats.ShieldBuffer+stats.HealingBudget;
                    v.supportIndicator.localScale=new Vector3(1.2f*Mathf.Clamp01(foe.SupportRemaining/Mathf.Max(1,capacity)),.13f,.16f);
                }
                int warningTicks=model.Status==EncounterStatus.Running?model.TelegraphRemainingTicks(foe):0;
                v.warning.gameObject.SetActive(warningTicks>0);
                if(warningTicks>0)v.warning.transform.localScale=Vector3.one*(.9f+.1f*warningTicks/
                    SingedTerra.LastStand.LastStandEnemyCatalog.Get(foe.Kind).TelegraphTicks);
                Vector3 direction=Vector3.ProjectOnPlane(tank.tank.position-v.goal,Vector3.up);
                if(direction.sqrMagnitude>.01f)v.root.rotation=Quaternion.LookRotation(-direction);
                float fraction=Mathf.Clamp01(foe.Hull/(float)Mathf.Max(1,foe.MaximumHull));
                v.hullIndicator.rotation=tank.view.transform.rotation;
                v.hullFill.localScale=new Vector3(.9f*fraction,.55f,1);v.hullFill.localPosition=new Vector3(-.45f*(1-fraction),0,-.015f);
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
                if(e.Kind==EncounterEventKind.Overdrive||e.Kind==EncounterEventKind.EmergencyRepairs||e.Kind==EncounterEventKind.MinefieldArmed)
                {
                    var color=e.Kind==EncounterEventKind.EmergencyRepairs?new Color(.3f,1f,.65f,.7f):new Color(1f,.68f,.23f,.7f);
                    Emit(tank.tank.position+Vector3.up*.12f,.6f,full?.9f:.35f,e.Kind==EncounterEventKind.MinefieldArmed?20f:5.5f,
                        color,settings.flashMaterial,true,Vector3.zero);
                    if(full)for(int burst=0;burst<5;burst++)Emit(tank.tank.position+Vector3.up*(.6f+burst*.3f),.3f,.5f,.7f,color,settings.flashMaterial,false,Vector3.up*.7f);
                    continue;
                }
                if(e.Kind==EncounterEventKind.ShieldAbsorb||e.Kind==EncounterEventKind.ShieldRecharge)
                {
                    bool recharge=e.Kind==EncounterEventKind.ShieldRecharge;
                    Emit(tank.tank.position+Vector3.up,full?.25f:.16f,full?.65f:.3f,full?1.7f:.8f,
                        recharge?new Color(.4f,1f,.8f,.7f):new Color(.38f,.72f,1f,.8f),settings.flashMaterial,false,Vector3.zero);
                    continue; // Tank events have no enemy slot.
                }
                bool outgoing=e.Kind==EncounterEventKind.Cannon||e.Kind==EncounterEventKind.Launcher||e.Kind==EncounterEventKind.Scattergun||
                    e.Kind==EncounterEventKind.Mortar||e.Kind==EncounterEventKind.Railgun||e.Kind==EncounterEventKind.Arc||e.Kind==EncounterEventKind.Minefield;
                var foe=model.Foes[e.Slot];Vector3 position=Position(foe)+Vector3.up*.7f;
                if(e.Kind==EncounterEventKind.EnemyShield||e.Kind==EncounterEventKind.EnemyRepair)
                {
                    Emit(position,full?.28f:.18f,.2f,full?1.3f:.6f,
                        e.Kind==EncounterEventKind.EnemyShield?new Color(.38f,.72f,1f,.8f):new Color(.35f,.95f,.65f,.8f),
                        settings.flashMaterial,false,Vector3.zero);
                    continue;
                }
                if(outgoing)
                {
                    vehicles[e.Slot].flash=full?.12f:0;
                    Emit(position,full?.18f:.14f,full?.25f:.12f,full?1.0f:.4f,
                        new Color(1f,.66f,.25f,full?1f:.6f),settings.flashMaterial,false,Vector3.zero);
                    if(full)
                    {
                        // The event owns every impact. Sparks never imply an
                        // extra hit, and all of them clear with reduced effects.
                        for(int spark=0;spark<5;spark++)
                        {
                            float a=(spark*1.256f+e.Slot*.71f);
                            Emit(position,.24f+spark*.035f,.075f,.018f,new Color(1f,.72f,.30f,.95f),settings.flashMaterial,false,
                                new Vector3(Mathf.Cos(a)*3.2f,1.1f+spark*.22f,Mathf.Sin(a)*3.2f),3.8f);
                        }
                        Emit(position,.75f,.25f,1.45f,new Color(.82f,.74f,.62f,.48f),cloudMaterial,false,Vector3.up*.32f);
                    }
                    if(e.Killed&&!destructionPresented[e.Slot])
                    {
                        destructionPresented[e.Slot]=true;
                        Destruction(position);
                    }
                    if(full&&e.Kind==EncounterEventKind.Cannon)
                    {
                        Emit(tank.muzzle.position,.10f,.25f,.85f,new Color(1f,.82f,.43f),settings.flashMaterial,false,Vector3.zero);
                        Emit(tank.muzzle.position,.12f,.48f,1.1f,new Color(3.1f,2.1f,1.35f,.88f),fireMaterial,false,Vector3.zero);
                        Emit(tank.muzzle.position,.8f,.32f,1.35f,new Color(.75f,.74f,.69f,.38f),smokeMaterial,false,tank.muzzle.forward*.5f+Vector3.up*.3f);
                    }
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
            Emit(position+Vector3.up*.8f,.6f,1.8f,4.2f,new Color(2.4f,1.8f,1.2f,.95f),fireMaterial,false,Vector3.up*.7f);
            for(int i=0;i<6;i++)
            {
                float angle=i*Mathf.PI*.5f;
                Vector3 drift=new Vector3(Mathf.Cos(angle)*.45f,.55f+i*.08f,Mathf.Sin(angle)*.45f);
                Emit(position+drift*.3f,3.2f+i*.25f,.65f,2.7f,new Color(.66f,.63f,.59f,.57f),smokeMaterial,false,drift,1.1f,.16f);
            }
            var wreck=wrecks[nextWreck];nextWreck=(nextWreck+1)%wrecks.Length;
            wreck.age=0;wreck.smokeClock=0;wreck.root.position=new Vector3(position.x,tank.tank.position.y-.08f,position.z);
            wreck.root.rotation=Quaternion.LookRotation(Vector3.ProjectOnPlane(position-tank.tank.position,Vector3.up))*Quaternion.Euler(0,nextWreck*17%33-16,5);
            wreck.root.localScale=new Vector3(1,.68f,1);wreck.root.gameObject.SetActive(true);
            position.y=tank.tank.position.y+.015f;
            Emit(position,5f,1.2f,1.9f,new Color(.11f,.10f,.085f,.5f),settings.scorchMaterial,true,Vector3.zero);
        }
        void Emit(Vector3 position,float duration,float start,float end,Color color,Material material,bool ground,Vector3 velocity,float aspect=1,float spin=0)
        {
            var puff=puffs[nextPuff];nextPuff=(nextPuff+1)%puffs.Length;
            puff.age=0;puff.duration=duration;puff.start=start;puff.end=end;
            puff.color=color;puff.velocity=velocity;puff.ground=ground;
            puff.aspect=aspect;puff.spin=spin;puff.rotation=material==flameMaterial?0:nextPuff*2.39996f;
            puff.node.position=position;puff.node.localScale=new Vector3(start,start*aspect,start);
            puff.renderer.sharedMaterial=material;
            puff.node.gameObject.SetActive(true);PaintPuff(puff);
        }
        void PaintPuff(Puff puff)
        {
            Color color=puff.color;color.a*=1-Mathf.Clamp01(puff.age/puff.duration);
            if(puff.renderer.sharedMaterial==settings.flashMaterial){color.r*=2; color.g*=2; color.b*=2;}
            block.Clear();block.SetColor("_BaseColor",color);block.SetFloat("_Spin",puff.rotation+puff.age*puff.spin);puff.renderer.SetPropertyBlock(block);
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
                        Emit(v.root.position+v.root.forward*1.2f+Vector3.up*.15f,1.7f,.40f,1.7f,
                            new Color(.80f,.73f,.61f,.29f),cloudMaterial,false,Vector3.up*.19f, .72f,.1f);
                    }
                }
            }
            foreach(var wreck in wrecks)
            {
                if(!wreck.root.gameObject.activeSelf)continue;
                wreck.age+=elapsed;wreck.smokeClock+=elapsed;
                if(wreck.age>=30){wreck.root.gameObject.SetActive(false);continue;}
                if(full&&wreck.age<8&&wreck.smokeClock>=.48f)
                {
                    wreck.smokeClock=0;var p=wreck.root.position+Vector3.up*1.35f;
                    Emit(p,1.25f,1.45f,2.25f,new Color(2.2f,1.65f,1.0f,.85f*(1-wreck.age/9)),flameMaterial,false,Vector3.up*.3f,1.6f);
                    Emit(p+Vector3.up,4.5f,1.4f,4.2f,new Color(.74f,.71f,.65f,.65f),smokeMaterial,false,new Vector3(.25f,.85f,.13f),1.2f,.12f);
                }
            }
            foreach(var puff in puffs)
            {
                if(!puff.node.gameObject.activeSelf)continue;                puff.age+=elapsed;
                if(puff.age>=puff.duration){puff.node.gameObject.SetActive(false);continue;}
                puff.node.position+=puff.velocity*elapsed;
                float scale=Mathf.Lerp(puff.start,puff.end,puff.age/puff.duration);puff.node.localScale=new Vector3(scale,scale*puff.aspect,scale);
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
            foreach(var wreck in wrecks)wreck.root.gameObject.SetActive(false);
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
            Active=0;nextPuff=nextWreck=0;currentGeometry=false;
            foreach(var v in vehicles){v.root.gameObject.SetActive(false);v.warning.gameObject.SetActive(false);v.id=0;v.flash=0;v.dustClock=0;}
            foreach(var puff in puffs)puff.node.gameObject.SetActive(false);
            foreach(var wreck in wrecks)wreck.root.gameObject.SetActive(false);
        }
        public void Dispose()
        {
            if(root)UnityEngine.Object.Destroy(root.gameObject);
            LastStandModuleGeometry.Release(rolePlate);
            enemyDetail.Dispose();
            foreach(var material in new[]{smokeMaterial,cloudMaterial,fireMaterial,flameMaterial,wreckMaterial,enemyArmor})
                if(material)UnityEngine.Object.Destroy(material);
            if(hullBack)UnityEngine.Object.Destroy(hullBack);if(hullSignal)UnityEngine.Object.Destroy(hullSignal);
        }
    }
}

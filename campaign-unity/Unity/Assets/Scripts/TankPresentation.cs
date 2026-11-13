using System;
using System.Collections.Generic;
using UnityEngine;
using SingedTerra.LastStand;
namespace SingedTerra.Art
{
    // Art presentation only. No combat, inventory or persistent progression.
    public sealed class TankPresentation : MonoBehaviour
    {
        public Camera view;
        public Transform tank, turret, barrel, muzzle;
        public GameObject repairModule, launcherModule, flash;
        public LastStandTankVisuals tankVisualsPrefab;
        public LastStandTankVisuals TankVisuals { get; private set; }
        public GameObject scattergunModule { get; private set; }
        LastStandShieldModule shieldModule;
        sealed class ModuleBinding
        {
            public GameObject Root;public Renderer[] Renderers;public Func<Vector3> Muzzle;
            public Vector3 HomePosition,SecondaryOffset;
            public Action<Vector3> Fire;public Action<float> Advance;public Action Clear,Restore;
        }
        readonly Dictionary<LastStandFitting,ModuleBinding> modules=new Dictionary<LastStandFitting,ModuleBinding>();
        public LastStandFitting Fitting { get; private set; }=LastStandFitting.Repair;
        public LastStandLoadout Loadout { get; private set; }=LastStandLoadout.Single(LastStandFitting.Repair);
        public GameObject ActiveFittingModule => Module(Fitting);
        public Renderer[] ActiveFittingRenderers=>modules.TryGetValue(Fitting,out var binding)?binding.Renderers:Array.Empty<Renderer>();
        public Renderer[] FittingRenderers(LastStandFitting fitting)=>modules.TryGetValue(fitting,out var binding)?binding.Renderers:Array.Empty<Renderer>();
        public Vector3 ScattergunMuzzle=>FittingMuzzle(LastStandFitting.Scattergun);
        GameObject Module(LastStandFitting fitting)=>modules.TryGetValue(fitting,out var binding)?binding.Root:null;
        public Vector3 FittingMuzzle(LastStandFitting fitting)=>modules[fitting].Muzzle();
        void Bind(LastStandFitting fitting,GameObject root,Func<Vector3> muzzle=null,Action<Vector3> fire=null,
            Action<float> advance=null,Action clear=null,Action restore=null)
        {
            var renderers=root.GetComponentsInChildren<Renderer>(true);
            if(renderers.Length==0)throw new InvalidOperationException("Fitting has no visible geometry: "+fitting);
            var bounds=renderers[0].bounds;foreach(var renderer in renderers)bounds.Encapsulate(renderer.bounds);
            var forward=Vector3.ProjectOnPlane(this.muzzle.position-barrel.position,Vector3.up).normalized;
            var right=Vector3.Cross(Vector3.up,forward);
            float lateral=Vector3.Dot(bounds.center-tank.position,right);
            if(Mathf.Abs(lateral)<.6f)lateral=.85f;
            modules.Add(fitting,new ModuleBinding{Root=root,Renderers=renderers,HomePosition=root.transform.localPosition,
                SecondaryOffset=root.transform.parent.InverseTransformVector(-2*lateral*right),Muzzle=muzzle??(()=>{
                var current=renderers[0].bounds;foreach(var renderer in renderers)current.Encapsulate(renderer.bounds);return current.center;
            }),Fire=fire,Advance=advance,Clear=clear,Restore=restore});
        }
        public bool battlefield, showingLauncher, animate=true;
        public int previewCount;
        Vector3 barrelHome, recoilAxis;
        Quaternion turretHome;
        Vector3 turretUp;
        float phase, recoilTime, flashTime;
        float peakRecoilWorld;
        const float InspectionRadius=13.5f, InspectionHeight=5.4f, OrbitStep=45f;
        Vector3 inspectionForward;
        public float InspectionYaw { get; private set; }
        public bool ShowPartCallouts { get; private set; }=true;
        bool focused=true, recoilDiagnostic=true, encounterWasWide, encounterWasAnimating;
        bool encounterFullEffects=true;
        Quaternion turretHomeWorld;
        public bool EncounterActive { get; private set; }
        public bool EncounterPaused { get; private set; }
        public event Action Changed;
        bool initialized;
        void Start() { EnsureInitialized(); }
        // Unity does not order these sibling Start callbacks. The HUD and any
        // direct fitting consumer require complete module/rest-pose metadata;
        // a later Start must not reset the fitting restored by the controller.
        internal void EnsureInitialized()
        {
            if(initialized)return;
            if(!view||!tank||!turret||!barrel||!muzzle||!repairModule||!launcherModule)
                throw new InvalidOperationException("Incomplete tank presentation references");
            barrelHome=barrel.localPosition;turretHome=turret.localRotation;turretHomeWorld=turret.rotation;
            // The displacement is in world units; include parent scale in its local conversion.
            recoilAxis=barrel.parent.InverseTransformVector((muzzle.position-barrel.position).normalized);
            turretUp=turret.InverseTransformDirection(Vector3.up);
            inspectionForward=Vector3.ProjectOnPlane(muzzle.position-barrel.position,Vector3.up).normalized;
            if(inspectionForward.sqrMagnitude<.5f)throw new InvalidOperationException("No horizontal inspection axis");
            Application.targetFrameRate=60;
            if(!GetComponent<SingedTerra.LastStand.LastStandLoopController>())Application.runInBackground=false;
            if(tankVisualsPrefab)
            {
                TankVisuals=Instantiate(tankVisualsPrefab,transform,false);
                TankVisuals.Initialize(this);
                TankVisuals.GeometryChanged+=InvalidateGarageFraming;
            }
            scattergunModule=new GameObject("Attachment_Scattergun");
            var scattergun=scattergunModule.AddComponent<LastStandScattergunModule>();scattergun.Initialize(this);
            var mortarRoot=new GameObject("Attachment_Mortar");var mortar=mortarRoot.AddComponent<LastStandMortarModule>();mortar.Initialize(this);
            var railgunRoot=new GameObject("Attachment_Railgun");var railgun=railgunRoot.AddComponent<LastStandRailgunModule>();railgun.Initialize(this);
            var arcRoot=new GameObject("Attachment_Arc");var arc=arcRoot.AddComponent<LastStandArcModule>();arc.Initialize(this);
            var shieldRoot=new GameObject("Attachment_Shield");shieldModule=shieldRoot.AddComponent<LastStandShieldModule>();shieldModule.Initialize(this);
            Bind(LastStandFitting.Repair,repairModule);Bind(LastStandFitting.Launcher,launcherModule);
            Bind(LastStandFitting.Scattergun,scattergunModule,()=>scattergun.MuzzlePosition,scattergun.Fire,scattergun.Advance,scattergun.Clear,scattergun.RestoreMount);
            Bind(LastStandFitting.Mortar,mortarRoot,()=>mortar.MuzzlePosition,mortar.Fire,mortar.Advance,mortar.Clear,mortar.RestoreMount);
            Bind(LastStandFitting.Railgun,railgunRoot,()=>railgun.MuzzlePosition,railgun.Fire,railgun.Advance,railgun.Clear,railgun.RestoreMount);
            Bind(LastStandFitting.Arc,arcRoot,()=>arc.MuzzlePosition,arc.Fire,arc.Advance,arc.Clear,arc.RestoreMount);
            Bind(LastStandFitting.Shield,shieldRoot,advance:shieldModule.Advance,clear:shieldModule.Clear,restore:shieldModule.RestoreMount);
            Fitting=LastStandFitting.Repair;showingLauncher=false;
            foreach(var item in modules)item.Value.Root.SetActive(item.Key==Fitting);
            initialized=true;
            flash.SetActive(false);SetView(false,true);Report("ready");
        }
        Vector3 cameraGoal,lookGoal;
        int reviewWidth,reviewHeight;
        Rect garageViewport;
        bool garageFraming;
        float garageAspect;
        LastStandFitting garageFitting;
        Renderer[] garageMeshes;
        readonly Dictionary<Mesh,Vector3[]> garageVertices=new Dictionary<Mesh,Vector3[]>();
        bool bayGrounded;
        Vector3 bayGround;
        Rect bayMatte;
        float bayFieldOfView;
        const float BayDistance=13.1f,BayPitch=18f;
        bool bayFitValid;
        Rect bayFitViewport,bayFitMatte;
        float bayFitYaw,bayFitAspect;
        Vector3 BayDirection => Quaternion.AngleAxis(InspectionYaw+58f,Vector3.up)*inspectionForward*Mathf.Cos(BayPitch*Mathf.Deg2Rad)+Vector3.up*Mathf.Sin(BayPitch*Mathf.Deg2Rad);
        // A parked vehicle uses a fixed lens and floor mark. Fitting a different
        // gun must not move the whole chassis across a photographed floor.
        internal void SetBayGrounding(bool enabled,Vector3 ground=default(Vector3),Rect matte=default(Rect))
        {
            // Native shutdown may destroy the camera before the HUD owner.
            if(!view){bayGrounded=false;return;}
            if(enabled&&!bayGrounded)bayFieldOfView=view.fieldOfView;
            if(!enabled&&bayGrounded){view.fieldOfView=bayFieldOfView;view.ResetProjectionMatrix();}
            bool changed=bayGrounded!=enabled||bayGround!=ground||bayMatte!=matte;
            bayGrounded=enabled;bayGround=ground;bayMatte=matte;
            if(!changed||!tank)return;
            if(enabled)view.fieldOfView=2*Mathf.Atan(Mathf.Tan(bayFieldOfView*Mathf.Deg2Rad*.5f)*matte.height)*Mathf.Rad2Deg;
            UpdateCameraGoal();view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);
        }
        internal Rect FitBayMatte(Rect viewport,float photoAspect)
        {
            if(bayFitValid&&bayFitViewport==viewport&&bayFitYaw==InspectionYaw&&Mathf.Approximately(bayFitAspect,view.aspect))return bayFitMatte;
            var rotation=Quaternion.LookRotation(-BayDirection);var inverse=Quaternion.Inverse(rotation);
            float vertical=Mathf.Tan(bayFieldOfView*Mathf.Deg2Rad*.5f),horizontal=vertical*photoAspect;
            var camera=bayGround+BayDirection*BayDistance;
            if(garageMeshes==null)garageMeshes=tank.GetComponentsInChildren<Renderer>(true);
            var min=new Vector2(float.PositiveInfinity,float.PositiveInfinity);var max=new Vector2(float.NegativeInfinity,float.NegativeInfinity);
            foreach(var renderer in garageMeshes)
            {
                if(!VisibleGarageMesh(renderer))continue;
                var filter=renderer.GetComponent<MeshFilter>();Vector3[] vertices=null;
                if(filter&&filter.sharedMesh&&filter.sharedMesh.isReadable&&!garageVertices.TryGetValue(filter.sharedMesh,out vertices))
                {vertices=filter.sharedMesh.vertices;garageVertices.Add(filter.sharedMesh,vertices);}
                var bounds=renderer.localBounds;
                for(int i=0;i<(vertices?.Length??8);i++)
                {
                    var local=vertices!=null?vertices[i]:bounds.center+Vector3.Scale(bounds.extents,new Vector3((i&1)==0?-1:1,(i&2)==0?-1:1,(i&4)==0?-1:1));
                    var p=inverse*(renderer.transform.TransformPoint(local)-camera);
                    var uv=new Vector2(.5f+p.x/(2*horizontal*p.z),.405f+p.y/(2*vertical*p.z));
                    min=Vector2.Min(min,uv);max=Vector2.Max(max,uv);
                }
            }
            float ratio=view.aspect/photoAspect;
            float height=Mathf.Max((max.x-min.x)/(viewport.width*ratio),(max.y-min.y)/viewport.height)/.88f;
            float width=height*ratio;var centre=(min+max)*.5f;
            bayFitMatte=new Rect(centre.x-viewport.center.x*width,centre.y-viewport.center.y*height,width,height);
            bayFitViewport=viewport;bayFitYaw=InspectionYaw;bayFitAspect=view.aspect;bayFitValid=true;return bayFitMatte;
        }
        public bool ApplyAppearance(LastStandTankAppearance appearance)
        {EnsureInitialized();return TankVisuals && TankVisuals.Apply(appearance);}
        public void InvalidateGarageFraming()
        {
            garageMeshes=null;bayFitValid=false;
            if(garageFraming && !EncounterActive && !battlefield && view)
            {UpdateCameraGoal();view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);}
            garageFraming=false;
        }
        // Fit the authored tank into the space left by the garage cards without
        // cropping the world camera or changing the active encounter framing.
        public void SetGarageFraming(Rect normalizedViewport)
        {
            if(bayGrounded || EncounterActive || battlefield || !view || !tank ||
                float.IsNaN(normalizedViewport.x) || float.IsNaN(normalizedViewport.y) ||
                float.IsNaN(normalizedViewport.width) || float.IsNaN(normalizedViewport.height) ||
                float.IsInfinity(normalizedViewport.x) || float.IsInfinity(normalizedViewport.y) ||
                float.IsInfinity(normalizedViewport.width) || float.IsInfinity(normalizedViewport.height) ||
                normalizedViewport.xMin<0 || normalizedViewport.yMin<0 || normalizedViewport.xMax>1 || normalizedViewport.yMax>1 ||
                normalizedViewport.width<=0 || normalizedViewport.height<=0)return;
            if(garageFraming && garageViewport==normalizedViewport && Mathf.Approximately(garageAspect,view.aspect) && garageFitting==Fitting)return;
            garageViewport=normalizedViewport;garageFraming=true;garageAspect=view.aspect;garageFitting=Fitting;
            UpdateCameraGoal();view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);
        }
        public void RefreshReviewCamera()
        {
            if(!GetComponent<SingedTerra.VisualReview.BattlefieldReview>())return;
            UpdateCameraGoal();
            if(battlefield){view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);}
        }
        public void SetView(bool wide,bool immediate=false)
        {
            if(EncounterActive)return;
            battlefield=wide;
            UpdateCameraGoal();
            if(immediate){view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);}
            Report(wide?"battlefield":"inspection");
        }
        void UpdateCameraGoal()
        {
            lookGoal=tank.position+Vector3.up*(battlefield?.5f:1.35f);
            var review=GetComponent<SingedTerra.VisualReview.BattlefieldReview>();
            view.orthographic=review&&battlefield;
            if(review&&battlefield)
            {
                float radius=SingedTerra.VisualReview.BattlefieldReview.FramingRadius;
                view.orthographicSize=Mathf.Max(radius*Mathf.Sin(review.CameraPitch*Mathf.Deg2Rad)/.88f,
                    radius/(Mathf.Max(.2f,view.aspect)*.90f));
                cameraGoal=lookGoal+Quaternion.Euler(review.CameraPitch,-30f,0)*Vector3.back*75f;
                reviewWidth=Screen.width;reviewHeight=Screen.height;return;
            }
            if(bayGrounded&&!battlefield)
            {
                float distance=BayDistance;var direction=BayDirection;
                var rotation=Quaternion.LookRotation(-direction);
                var anchor=new Vector2((.50f-bayMatte.x)/bayMatte.width,(.405f-bayMatte.y)/bayMatte.height);
                // Shift the lens, not the physical camera: cropping the matte
                // cannot introduce a second perspective or slide the tank over it.
                var projection=Matrix4x4.Perspective(view.fieldOfView,view.aspect,view.nearClipPlane,view.farClipPlane);
                projection.m02=1-2*anchor.x;projection.m12=1-2*anchor.y;view.projectionMatrix=projection;
                lookGoal=bayGround;
                cameraGoal=lookGoal+direction*distance;return;
            }
            if(garageFraming && !battlefield)
            {
                if(garageMeshes==null)garageMeshes=tank.GetComponentsInChildren<Renderer>(true);
                Bounds bounds=default(Bounds);bool found=false;
                foreach(var mesh in garageMeshes)
                {
                    if(!VisibleGarageMesh(mesh))continue;
                    if(!found){bounds=mesh.bounds;found=true;}else bounds.Encapsulate(mesh.bounds);
                }
                if(found)
                {
                    var direction=(Quaternion.AngleAxis(InspectionYaw+58f,Vector3.up)*inspectionForward*InspectionRadius+Vector3.up*InspectionHeight).normalized;
                    var rotation=Quaternion.LookRotation(-direction);
                    float vertical=Mathf.Tan(view.fieldOfView*.5f*Mathf.Deg2Rad),horizontal=vertical*Mathf.Max(.2f,view.aspect);
                    Vector2 centre=garageViewport.center-new Vector2(.5f,.5f);
                    float distance=GarageFitDistance(bounds.center,rotation,horizontal,vertical,centre,out var offset);
                    lookGoal=bounds.center-rotation*new Vector3(offset.x,offset.y,0);
                    cameraGoal=lookGoal+direction*distance;return;
                }
            }
            cameraGoal=tank.position+(battlefield?new Vector3(17,23,19):
                Quaternion.AngleAxis(InspectionYaw+58f,Vector3.up)*inspectionForward*InspectionRadius
                +Vector3.up*InspectionHeight);
        }
        bool VisibleGarageMesh(Renderer mesh)=>mesh && mesh.enabled && !mesh.forceRenderingOff &&
            mesh.gameObject.activeInHierarchy && (view.cullingMask&(1<<mesh.gameObject.layer))!=0;
        float GarageFitDistance(Vector3 origin,Quaternion rotation,float horizontal,float vertical,Vector2 centre,out Vector2 offset)
        {
            // Solve the four perspective inequalities for visible geometry.
            // A point's depth is distance+p.z; using distance alone
            // clips off-centre previews, particularly the upper portrait pane.
            float halfWidth=horizontal*garageViewport.width*.90f,halfHeight=vertical*garageViewport.height*.90f;
            float centreX=centre.x*2*horizontal,centreY=centre.y*2*vertical;
            float left=centreX-halfWidth,right=centreX+halfWidth,bottom=centreY-halfHeight,top=centreY+halfHeight;
            var inverse=Quaternion.Inverse(rotation);float distance=1;
            float lowerX=float.NegativeInfinity,upperX=float.PositiveInfinity,lowerY=float.NegativeInfinity,upperY=float.PositiveInfinity;
            foreach(var mesh in garageMeshes)
            {
                if(!VisibleGarageMesh(mesh))continue;
                // New core meshes permit CPU readback. Cache positions once per
                // shared mesh; fitting only runs when the framing changes.
                // Retained unreadable fittings keep an oriented-bounds fallback.
                Vector3[] vertices=null;var filter=mesh.GetComponent<MeshFilter>();
                if(filter && filter.sharedMesh && filter.sharedMesh.isReadable && !garageVertices.TryGetValue(filter.sharedMesh,out vertices))
                {vertices=filter.sharedMesh.vertices;garageVertices.Add(filter.sharedMesh,vertices);}
                var bounds=mesh.localBounds;
                int count=vertices==null?8:vertices.Length;
                for(int corner=0;corner<count;corner++)
                {
                    var local=vertices!=null?vertices[corner]:bounds.center+Vector3.Scale(bounds.extents,new Vector3((corner&1)==0?-1:1,
                        (corner&2)==0?-1:1,(corner&4)==0?-1:1));
                    var point=mesh.transform.TransformPoint(local);
                    var p=inverse*(point-origin);
                    lowerX=Mathf.Max(lowerX,left*p.z-p.x);upperX=Mathf.Min(upperX,right*p.z-p.x);
                    lowerY=Mathf.Max(lowerY,bottom*p.z-p.y);upperY=Mathf.Min(upperY,top*p.z-p.y);
                    distance=Mathf.Max(distance,view.nearClipPlane+.1f-p.z);
                }
            }
            distance=Mathf.Max(distance,(lowerX-upperX)/(2*halfWidth));
            distance=Mathf.Max(distance,(lowerY-upperY)/(2*halfHeight));
            // Select the midpoint of each feasible translation interval. In an
            // offset viewport, the world AABB centre is not the projected centre.
            offset=new Vector2(centreX*distance+(lowerX+upperX)*.5f,centreY*distance+(lowerY+upperY)*.5f);
            return distance;
        }
        public void OrbitLeft(){Orbit(-OrbitStep);}
        public void OrbitRight(){Orbit(OrbitStep);}
        void Orbit(float degrees)
        {
            if(battlefield)return;
            InspectionYaw=Mathf.Repeat(InspectionYaw+degrees,360f);
            UpdateCameraGoal();Report("orbit");
        }
        public void ResetInspection()
        {
            if(battlefield)return;
            InspectionYaw=0;UpdateCameraGoal();Report("orbit_reset");
        }
        public void ToggleCallouts()
        {
            if(battlefield)return;
            ShowPartCallouts=!ShowPartCallouts;Report("callouts");
        }
        public void ToggleView(){SetView(!battlefield);}
        public void ToggleAttachment()
        {
            // Legacy art-review shortcut; the playable UI selects explicit identities.
            TrySelectFitting(Fitting==LastStandFitting.Repair ? "launcher" : "repair");
        }
        public string FittingId => LastStandFittingCatalog.Id(Fitting);
        public bool TrySelectFitting(string id)
        {
            try{return TrySelectLoadout(new LastStandLoadout(id));}catch(ArgumentException){return false;}
        }
        public bool TrySelectLoadout(LastStandLoadout loadout)
        {
            if(EncounterActive||loadout==null)return false;
            EnsureInitialized();
            if(!Module(loadout.Primary)||loadout.Secondary.HasValue&&!Module(loadout.Secondary.Value))return false;
            bool changed=!Loadout.Equals(loadout);Loadout=loadout;Fitting=loadout.Primary;showingLauncher=loadout.Contains(LastStandFitting.Launcher);
            foreach(var item in modules)
            {
                var binding=item.Value;
                binding.Root.transform.localPosition=binding.HomePosition+(loadout.Secondary==item.Key?binding.SecondaryOffset:Vector3.zero);
                binding.Root.SetActive(loadout.Contains(item.Key));
            }
            if(changed)InvalidateGarageFraming();Report("attachment");
            return true;
        }
        public void PlayScattergunShot(Vector3 target)
        { PlayFittingShot(LastStandFitting.Scattergun,target); }
        public void PlayFittingShot(LastStandFitting fitting,Vector3 target)
        { if(EncounterActive&&Loadout.Contains(fitting)&&modules.TryGetValue(fitting,out var binding))binding.Fire?.Invoke(target); }
        public void SetShieldCharge(int current,int capacity){if(shieldModule)shieldModule.SetCharge(current,capacity);}
        public void PlayShieldPulse(bool recharging){if(EncounterActive&&Loadout.Contains(LastStandFitting.Shield))shieldModule.Pulse(recharging);}
        public void PreviewMotion()
        {
            if(EncounterActive||recoilTime>0)return;
            recoilDiagnostic=true;
            peakRecoilWorld=0;previewCount++;recoilTime=.7f;flashTime=.09f;Report("preview");
        }
        public void ToggleMotion(){if(EncounterActive)return;animate=!animate;Report("motion");}
        public bool BeginEncounter()
        {
            if(EncounterActive)return false;
            encounterWasWide=battlefield;encounterWasAnimating=animate;
            SetView(true,true);EncounterActive=true;EncounterPaused=false;animate=false;
            recoilTime=flashTime=0;barrel.localPosition=barrelHome;flash.SetActive(false);
            foreach(var binding in modules.Values)binding.Clear?.Invoke();
            return true;
        }
        public void EndEncounter()
        {
            if(!EncounterActive)return;
            EncounterActive=false;EncounterPaused=false;animate=encounterWasAnimating;
            recoilTime=flashTime=0;barrel.localPosition=barrelHome;flash.SetActive(false);
            foreach(var binding in modules.Values)binding.Restore?.Invoke();
            SetView(encounterWasWide,true);
        }
        public void SetEncounterPaused(bool value){EncounterPaused=EncounterActive&&value;}
        public void SetEncounterEffects(bool full)
        {
            encounterFullEffects=full;
            if(EncounterActive&&!full){flashTime=0;flash.SetActive(false);}
        }
        public void ClearEncounterFeedback()
        {
            if(!EncounterActive)return;
            recoilTime=flashTime=0;barrel.localPosition=barrelHome;flash.SetActive(false);
            foreach(var binding in modules.Values)binding.Clear?.Invoke();
        }
        // The session admits terminal time only after its pause/focus/failure guards.
        // Keep the camera, idle motion and committed encounter locked.
        public void AdvanceTerminalShot(float elapsed)
        {
            if(EncounterActive&&EncounterPaused)AdvanceShot(Mathf.Min(elapsed,.05f));
        }
        public void PlayEncounterShot(Vector3 target)
        {
            if(!EncounterActive)return;
            Vector3 direction=Vector3.ProjectOnPlane(target-tank.position,Vector3.up).normalized;
            if(direction.sqrMagnitude<.5f)return;
            Quaternion world=EncounterWorldYaw(turretHomeWorld,inspectionForward,direction);
            turret.localRotation=Quaternion.Inverse(turret.parent.rotation)*world;
            recoilDiagnostic=false;peakRecoilWorld=0;recoilTime=.7f;flashTime=encounterFullEffects?.09f:0;
        }
        public static Quaternion EncounterWorldYaw(Quaternion worldHome,Vector3 restForward,Vector3 direction)
        {
            // FromToRotation has no unique axis for opposite directions. Constrain yaw to world up.
            float yaw=Vector3.SignedAngle(restForward,direction,Vector3.up);
            return Quaternion.AngleAxis(yaw,Vector3.up)*worldHome;
        }
        void Update()
        {
            if(battlefield&&(reviewWidth!=Screen.width||reviewHeight!=Screen.height))RefreshReviewCamera();
            float dt=focused&&!EncounterPaused?Mathf.Min(Time.unscaledDeltaTime,.05f):0;
            if(animate&&!EncounterActive)phase+=dt;
            if(!EncounterActive)turret.localRotation=turretHome*Quaternion.AngleAxis(Mathf.Sin(phase*.28f)*12, turretUp);
            AdvanceShot(dt);
            float t=1-Mathf.Exp(-dt*7);
            // Arc interpolation avoids moving through the model between opposite views.
            view.transform.position=lookGoal+Vector3.Slerp(view.transform.position-lookGoal,cameraGoal-lookGoal,t);
            Quaternion q=Quaternion.LookRotation(lookGoal-view.transform.position);
            view.transform.rotation=Quaternion.Slerp(view.transform.rotation,q,t);
        }
        void AdvanceShot(float dt)
        {
            foreach(var binding in modules.Values)binding.Advance?.Invoke(dt);
            bool wasRecoiling=recoilTime>0;
            if(recoilTime>0)recoilTime=Mathf.Max(0,recoilTime-dt);
            float kick=recoilTime>0?Mathf.Sin((1-recoilTime/.7f)*Mathf.PI)*.32f:0;
            barrel.localPosition=barrelHome-recoilAxis*kick;
            if(wasRecoiling)
            {
                float distance=Vector3.Distance(barrel.position,barrel.parent.TransformPoint(barrelHome));
                peakRecoilWorld=Mathf.Max(peakRecoilWorld,distance);
                if(recoilTime==0&&recoilDiagnostic)Debug.Log("ST_ART_RECOIL "+JsonUtility.ToJson(new RecoilReceipt
                    {preview=previewCount,peakWorld=peakRecoilWorld,returnWorld=distance}));
            }
            flashTime=Mathf.Max(0,flashTime-dt);flash.SetActive(flashTime>0);
        }
        void OnApplicationFocus(bool value){focused=value;}
        void OnApplicationPause(bool value){focused=!value;}
        [Serializable] class RecoilReceipt
        {
            public int preview;
            public float peakWorld,returnWorld;
        }
        [Serializable] class State
        {
            public string action,view,attachment;
            public bool motion,repairVisible,launcherVisible,scattergunVisible;
            public int previews,width,height;
            public float inspectionYaw;
            public bool callouts;
        }
        void Report(string action)
        {
            var state=new State{action=action,view=battlefield?"battlefield":"inspection",
                attachment=FittingId,motion=animate,
                repairVisible=repairModule.activeSelf,launcherVisible=launcherModule.activeSelf,
                scattergunVisible=scattergunModule && scattergunModule.activeSelf,
                previews=previewCount,width=Screen.width,height=Screen.height,
                inspectionYaw=InspectionYaw,callouts=ShowPartCallouts};
            Debug.Log("ST_ART_STATE "+JsonUtility.ToJson(state));Changed?.Invoke();
        }
    }
}

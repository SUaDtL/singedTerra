using System;
using UnityEngine;
namespace SingedTerra.Art
{
    // Art presentation only. No combat, inventory or persistent progression.
    public sealed class TankPresentation : MonoBehaviour
    {
        public Camera view;
        public Transform tank, turret, barrel, muzzle;
        public GameObject repairModule, launcherModule, flash;
        public bool battlefield, showingLauncher, animate=true;
        public int previewCount;
        Vector3 barrelHome, recoilAxis;
        Quaternion turretHome;
        Vector3 turretUp;
        float phase, recoilTime, flashTime;
        float peakRecoilWorld;
        const float InspectionRadius=13.5f, InspectionHeight=6.7f, OrbitStep=45f;
        Vector3 inspectionForward;
        public float InspectionYaw { get; private set; }
        public bool ShowPartCallouts { get; private set; }=true;
        bool focused=true, recoilDiagnostic=true, encounterWasWide, encounterWasAnimating;
        Quaternion turretHomeWorld;
        public bool EncounterActive { get; private set; }
        public bool EncounterPaused { get; private set; }
        public event Action Changed;
        void Start()
        {
            if(!view||!tank||!turret||!barrel||!muzzle||!repairModule||!launcherModule)
                throw new InvalidOperationException("Incomplete tank presentation references");
            barrelHome=barrel.localPosition;turretHome=turret.localRotation;turretHomeWorld=turret.rotation;
            // The displacement is in world units; include parent scale in its local conversion.
            recoilAxis=barrel.parent.InverseTransformVector((muzzle.position-barrel.position).normalized);
            turretUp=turret.InverseTransformDirection(Vector3.up);
            inspectionForward=Vector3.ProjectOnPlane(muzzle.position-barrel.position,Vector3.up).normalized;
            if(inspectionForward.sqrMagnitude<.5f)throw new InvalidOperationException("No horizontal inspection axis");
            Application.targetFrameRate=60;Application.runInBackground=false;
            repairModule.SetActive(true);launcherModule.SetActive(false);
            flash.SetActive(false);SetView(false,true);Report("ready");
        }
        Vector3 cameraGoal,lookGoal;
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
            cameraGoal=tank.position+(battlefield?new Vector3(17,23,19):
                Quaternion.AngleAxis(InspectionYaw+38f,Vector3.up)*inspectionForward*InspectionRadius
                +Vector3.up*InspectionHeight);
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
            if(EncounterActive)return;
            showingLauncher=!showingLauncher;repairModule.SetActive(!showingLauncher);
            launcherModule.SetActive(showingLauncher);Report("attachment");
        }
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
            return true;
        }
        public void EndEncounter()
        {
            if(!EncounterActive)return;
            EncounterActive=false;EncounterPaused=false;animate=encounterWasAnimating;
            recoilTime=flashTime=0;barrel.localPosition=barrelHome;flash.SetActive(false);
            SetView(encounterWasWide,true);
        }
        public void SetEncounterPaused(bool value){EncounterPaused=EncounterActive&&value;}
        public void PlayEncounterShot(Vector3 target)
        {
            if(!EncounterActive)return;
            Vector3 direction=Vector3.ProjectOnPlane(target-tank.position,Vector3.up).normalized;
            if(direction.sqrMagnitude<.5f)return;
            Quaternion world=EncounterWorldYaw(turretHomeWorld,inspectionForward,direction);
            turret.localRotation=Quaternion.Inverse(turret.parent.rotation)*world;
            recoilDiagnostic=false;peakRecoilWorld=0;recoilTime=.7f;flashTime=.09f;
        }
        public static Quaternion EncounterWorldYaw(Quaternion worldHome,Vector3 restForward,Vector3 direction)
        {
            // FromToRotation has no unique axis for opposite directions. Constrain yaw to world up.
            float yaw=Vector3.SignedAngle(restForward,direction,Vector3.up);
            return Quaternion.AngleAxis(yaw,Vector3.up)*worldHome;
        }
        void Update()
        {
            float dt=focused&&!EncounterPaused?Mathf.Min(Time.unscaledDeltaTime,.05f):0;
            if(animate&&!EncounterActive)phase+=dt;
            if(!EncounterActive)turret.localRotation=turretHome*Quaternion.AngleAxis(Mathf.Sin(phase*.28f)*12, turretUp);
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
            float t=1-Mathf.Exp(-dt*7);
            // Arc interpolation avoids moving through the model between opposite views.
            view.transform.position=lookGoal+Vector3.Slerp(view.transform.position-lookGoal,cameraGoal-lookGoal,t);
            Quaternion q=Quaternion.LookRotation(lookGoal-view.transform.position);
            view.transform.rotation=Quaternion.Slerp(view.transform.rotation,q,t);
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
            public bool motion,repairVisible,launcherVisible;
            public int previews,width,height;
            public float inspectionYaw;
            public bool callouts;
        }
        void Report(string action)
        {
            var state=new State{action=action,view=battlefield?"battlefield":"inspection",
                attachment=showingLauncher?"launcher":"repair",motion=animate,
                repairVisible=repairModule.activeSelf,launcherVisible=launcherModule.activeSelf,
                previews=previewCount,width=Screen.width,height=Screen.height,
                inspectionYaw=InspectionYaw,callouts=ShowPartCallouts};
            Debug.Log("ST_ART_STATE "+JsonUtility.ToJson(state));Changed?.Invoke();
        }
    }
}

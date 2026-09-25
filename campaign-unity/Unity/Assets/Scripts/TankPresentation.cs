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
        bool focused=true;
        public event Action Changed;
        void Start()
        {
            if(!view||!tank||!turret||!barrel||!muzzle||!repairModule||!launcherModule)
                throw new InvalidOperationException("Incomplete tank presentation references");
            barrelHome=barrel.localPosition;turretHome=turret.localRotation;
            // The displacement is in world units; include parent scale in its local conversion.
            recoilAxis=barrel.parent.InverseTransformVector((muzzle.position-barrel.position).normalized);
            turretUp=turret.InverseTransformDirection(Vector3.up);
            Application.targetFrameRate=60;Application.runInBackground=false;
            repairModule.SetActive(true);launcherModule.SetActive(false);
            flash.SetActive(false);SetView(false,true);Report("ready");
        }
        Vector3 cameraGoal,lookGoal;
        public void SetView(bool wide,bool immediate=false)
        {
            battlefield=wide;
            cameraGoal=wide?new Vector3(17,23,19):new Vector3(8.8f,6.7f,10.8f);
            lookGoal=wide?new Vector3(0,.5f,0):new Vector3(0,1.35f,0);
            if(immediate){view.transform.position=cameraGoal;view.transform.LookAt(lookGoal);}
            Report(wide?"battlefield":"inspection");
        }
        public void ToggleView(){SetView(!battlefield);}
        public void ToggleAttachment()
        {
            showingLauncher=!showingLauncher;repairModule.SetActive(!showingLauncher);
            launcherModule.SetActive(showingLauncher);Report("attachment");
        }
        public void PreviewMotion()
        {
            if(recoilTime>0)return;
            peakRecoilWorld=0;previewCount++;recoilTime=.7f;flashTime=.09f;Report("preview");
        }
        public void ToggleMotion(){animate=!animate;Report("motion");}
        void Update()
        {
            float dt=focused?Mathf.Min(Time.unscaledDeltaTime,.05f):0;
            if(animate)phase+=dt;
            turret.localRotation=turretHome*Quaternion.AngleAxis(Mathf.Sin(phase*.28f)*12, turretUp);
            bool wasRecoiling=recoilTime>0;
            if(recoilTime>0)recoilTime=Mathf.Max(0,recoilTime-dt);
            float kick=recoilTime>0?Mathf.Sin((1-recoilTime/.7f)*Mathf.PI)*.32f:0;
            barrel.localPosition=barrelHome-recoilAxis*kick;
            if(wasRecoiling)
            {
                float distance=Vector3.Distance(barrel.position,barrel.parent.TransformPoint(barrelHome));
                peakRecoilWorld=Mathf.Max(peakRecoilWorld,distance);
                if(recoilTime==0)Debug.Log("ST_ART_RECOIL "+JsonUtility.ToJson(new RecoilReceipt
                    {preview=previewCount,peakWorld=peakRecoilWorld,returnWorld=distance}));
            }
            flashTime=Mathf.Max(0,flashTime-dt);flash.SetActive(flashTime>0);
            float t=1-Mathf.Exp(-dt*7);
            view.transform.position=Vector3.Lerp(view.transform.position,cameraGoal,t);
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
        }
        void Report(string action)
        {
            var state=new State{action=action,view=battlefield?"battlefield":"inspection",
                attachment=showingLauncher?"launcher":"repair",motion=animate,
                repairVisible=repairModule.activeSelf,launcherVisible=launcherModule.activeSelf,
                previews=previewCount,width=Screen.width,height=Screen.height};
            Debug.Log("ST_ART_STATE "+JsonUtility.ToJson(state));Changed?.Invoke();
        }
    }
}

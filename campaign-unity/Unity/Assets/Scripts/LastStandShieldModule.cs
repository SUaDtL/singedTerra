using System;
using UnityEngine;
using static SingedTerra.Art.LastStandModuleGeometry;

namespace SingedTerra.Art
{
    // A low three-lobed projector reads as a defensive fitting at garage and
    // battle scale. Its charge vanes follow model state, never a local timer.
    public sealed class LastStandShieldModule : MonoBehaviour
    {
        Mesh plate,cylinder;
        Transform core;
        readonly Transform[] chargeVanes=new Transform[3];
        Quaternion mountRotation;
        float pulse,charge=1;
        bool recharging;
        public Vector3 MuzzlePosition=>core.position;
        public void Initialize(TankPresentation owner)
        {
            if(core)throw new InvalidOperationException("Shield module already initialized.");
            mountRotation=Mount(owner,transform);
            var armor=Material(owner,"Armor");var steel=Material(owner,"Steel");var brass=Material(owner,"Brass");
            plate=Prism(true,"Shield");cylinder=Prism(false,"Shield");
            Part("Shield projector plinth",transform,Vector3.zero,new Vector3(.87f,.18f,.87f),plate,steel);
            core=new GameObject("Shield projector core").transform;core.SetParent(transform,false);core.localPosition=new Vector3(0,.34f,0);
            var hub=Part("Shield central coil",core,Vector3.zero,new Vector3(.43f,.43f,.28f),cylinder,brass);hub.localRotation=Quaternion.Euler(90,0,0);
            for(int n=0;n<3;n++)
            {
                float angle=n*120*Mathf.Deg2Rad;
                var vane=new GameObject("Shield projector vane "+n).transform;vane.SetParent(transform,false);
                vane.localPosition=new Vector3(Mathf.Sin(angle)*.36f,.28f,Mathf.Cos(angle)*.36f);vane.localRotation=Quaternion.Euler(0,n*120,0);
                Part("Shield armored petal "+n,vane,Vector3.zero,new Vector3(.32f,.30f,.21f),plate,armor);
                chargeVanes[n]=Part("Shield charge strip "+n,vane,new Vector3(0,.06f,.12f),new Vector3(.21f,.08f,.035f),plate,brass);
            }
        }
        public void SetCharge(int current,int capacity)
        {
            charge=capacity<=0?0:Mathf.Clamp01(current/(float)capacity);
            for(int i=0;i<chargeVanes.Length;i++)if(chargeVanes[i])chargeVanes[i].localScale=new Vector3(.21f*Mathf.Clamp01(charge*3-i),.08f,.035f);
        }
        public void Pulse(bool recharging){this.recharging=recharging;pulse=.32f;}
        public void Advance(float elapsed)
        {
            if(!core)return;pulse=Mathf.Max(0,pulse-elapsed);
            float amount=pulse>0?Mathf.Sin(pulse/.32f*Mathf.PI)*.13f:0;
            core.localScale=Vector3.one*(1+(recharging?amount:-amount));
        }
        public void Clear(){pulse=0;if(core)core.localScale=Vector3.one;}
        public void RestoreMount(){Clear();SetCharge(1,1);transform.localRotation=mountRotation;}
        void OnDisable(){RestoreMount();}
        void OnDestroy(){Release(plate);Release(cylinder);}
    }
}

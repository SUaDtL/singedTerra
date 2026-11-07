using System;
using UnityEngine;
using static SingedTerra.Art.LastStandModuleGeometry;

namespace SingedTerra.Art
{
    // A short elevated tube and substantial breech distinguish the area weapon.
    // This owns only its visible pose; model events own blast membership/damage.
    public sealed class LastStandMortarModule : MonoBehaviour
    {
        Mesh plate,cylinder;
        Transform assembly,muzzle;
        Quaternion mountRotation;
        float recoil;
        public Vector3 MuzzlePosition=>muzzle.position;
        public void Initialize(TankPresentation owner)
        {
            if(assembly)throw new InvalidOperationException("Mortar module already initialized.");
            mountRotation=Mount(owner,transform);
            var armor=Material(owner,"Armor");var steel=Material(owner,"Steel");
            var brass=Material(owner,"Brass");var rubber=Material(owner,"Rubber");
            plate=Prism(true,"Mortar");cylinder=Prism(false,"Mortar");
            Part("Mortar turntable",transform,Vector3.zero,new Vector3(.82f,.18f,.88f),plate,steel);
            Part("Mortar left cradle",transform,new Vector3(-.32f,.27f,-.05f),new Vector3(.17f,.46f,.48f),plate,armor);
            Part("Mortar right cradle",transform,new Vector3(.32f,.27f,-.05f),new Vector3(.17f,.46f,.48f),plate,armor);
            assembly=new GameObject("Mortar recoil assembly").transform;assembly.SetParent(transform,false);
            var tube=new GameObject("Elevated mortar tube").transform;tube.SetParent(assembly,false);
            tube.localPosition=new Vector3(0,.33f,-.18f);tube.localRotation=Quaternion.Euler(-48,0,0);
            Part("Mortar breech",tube,Vector3.zero,new Vector3(.52f,.52f,.35f),cylinder,armor);
            Part("Mortar barrel",tube,new Vector3(0,0,.36f),new Vector3(.43f,.43f,.76f),cylinder,steel);
            Part("Mortar muzzle ring",tube,new Vector3(0,0,.73f),new Vector3(.54f,.54f,.13f),cylinder,brass);
            Part("Mortar open bore",tube,new Vector3(0,0,.80f),new Vector3(.35f,.35f,.018f),cylinder,rubber);
            muzzle=new GameObject("Mortar muzzle").transform;muzzle.SetParent(tube,false);muzzle.localPosition=new Vector3(0,0,.82f);
            Part("Mortar shell rack",transform,new Vector3(.56f,.18f,-.20f),new Vector3(.26f,.24f,.63f),plate,steel);
            for(int n=0;n<3;n++)Part("Mortar reserve shell "+n,transform,new Vector3(.56f,.35f,-.41f+n*.20f),new Vector3(.13f,.31f,.13f),cylinder,brass).localRotation=Quaternion.Euler(90,0,0);
        }
        public void Fire(Vector3 target)
        {
            var direction=Vector3.ProjectOnPlane(target-transform.position,Vector3.up);
            if(direction.sqrMagnitude<.01f)return;
            transform.rotation=Quaternion.LookRotation(direction.normalized,Vector3.up);recoil=.38f;
        }
        public void Advance(float elapsed)
        {
            if(!assembly)return;recoil=Mathf.Max(0,recoil-elapsed);
            float kick=recoil>0?Mathf.Sin(recoil/.38f*Mathf.PI)*.11f:0;
            assembly.localPosition=new Vector3(0,-kick*.74f,-kick*.67f);
        }
        public void Clear(){recoil=0;if(assembly)assembly.localPosition=Vector3.zero;}
        public void RestoreMount(){Clear();transform.localRotation=mountRotation;}
        void OnDisable(){RestoreMount();}
        void OnDestroy(){Release(plate);Release(cylinder);}
    }
}

using System;
using UnityEngine;
using static SingedTerra.Art.LastStandModuleGeometry;

namespace SingedTerra.Art
{
    // Long separated rails, induction coils and a rear capacitor bank make the
    // penetrating weapon identifiable without relying on paint or tracer color.
    public sealed class LastStandRailgunModule : MonoBehaviour
    {
        Mesh plate,cylinder;
        Transform assembly,muzzle;
        Quaternion mountRotation;
        float recoil;
        public Vector3 MuzzlePosition=>muzzle.position;
        public void Initialize(TankPresentation owner)
        {
            if(assembly)throw new InvalidOperationException("Railgun module already initialized.");
            mountRotation=Mount(owner,transform);
            var armor=Material(owner,"Armor");var steel=Material(owner,"Steel");var brass=Material(owner,"Brass");
            plate=Prism(true,"Railgun");cylinder=Prism(false,"Railgun");
            Part("Railgun swivel base",transform,Vector3.zero,new Vector3(.78f,.17f,.87f),plate,steel);
            assembly=new GameObject("Railgun recoil assembly").transform;assembly.SetParent(transform,false);
            Part("Railgun breech",assembly,new Vector3(0,.27f,-.29f),new Vector3(.64f,.40f,.66f),plate,armor);
            for(int side=-1;side<=1;side+=2)
            {
                Part("Railgun separated rail "+side,assembly,new Vector3(side*.19f,.38f,.57f),new Vector3(.14f,.20f,1.40f),plate,steel);
                for(int n=0;n<4;n++)Part("Railgun induction coil "+side+"-"+n,assembly,new Vector3(side*.19f,.38f,.11f+n*.30f),new Vector3(.24f,.30f,.08f),plate,brass);
                Part("Railgun capacitor "+side,assembly,new Vector3(side*.38f,.27f,-.37f),new Vector3(.22f,.22f,.55f),cylinder,steel);
            }
            Part("Railgun muzzle bridge",assembly,new Vector3(0,.38f,1.26f),new Vector3(.53f,.10f,.12f),plate,armor);
            muzzle=new GameObject("Railgun muzzle").transform;muzzle.SetParent(assembly,false);muzzle.localPosition=new Vector3(0,.38f,1.34f);
        }
        public void Fire(Vector3 target)
        {
            var direction=Vector3.ProjectOnPlane(target-transform.position,Vector3.up);
            if(direction.sqrMagnitude<.01f)return;
            transform.rotation=Quaternion.LookRotation(direction.normalized,Vector3.up);recoil=.28f;
        }
        public void Advance(float elapsed)
        {
            if(!assembly)return;recoil=Mathf.Max(0,recoil-elapsed);
            assembly.localPosition=new Vector3(0,0,recoil>0?-Mathf.Sin(recoil/.28f*Mathf.PI)*.13f:0);
        }
        public void Clear(){recoil=0;if(assembly)assembly.localPosition=Vector3.zero;}
        public void RestoreMount(){Clear();transform.localRotation=mountRotation;}
        void OnDisable(){RestoreMount();}
        void OnDestroy(){Release(plate);Release(cylinder);}
    }
}

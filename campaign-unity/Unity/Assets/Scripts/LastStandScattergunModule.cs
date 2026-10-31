using System;
using static SingedTerra.Art.LastStandModuleGeometry;
using UnityEngine;

namespace SingedTerra.Art
{
    // Decorative geometry on the existing attachment socket; combat owns hits.
    public sealed class LastStandScattergunModule : MonoBehaviour
    {
        Mesh plate, cylinder;
        Transform assembly;
        Quaternion mountRotation;
        float recoil;
        public Vector3 MuzzlePosition => transform.TransformPoint(new Vector3(0,.57f,.88f));

        public void Initialize(TankPresentation owner)
        {
            if(assembly)throw new InvalidOperationException("Scattergun module already initialized.");
            mountRotation=LastStandModuleGeometry.Mount(owner,transform);
            plate=Prism(true,"Scattergun"); cylinder=Prism(false,"Scattergun");
            var paint=Material(owner,"Armor");var steel=Material(owner,"Steel");var brass=Material(owner,"Brass");var rubber=Material(owner,"Rubber");
            Part("Scattergun mount",transform,Vector3.zero,new Vector3(.74f,.16f,.86f),plate,steel);
            assembly=new GameObject("Scattergun recoil assembly").transform;assembly.SetParent(transform,false);
            Part("Scattergun receiver",assembly,new Vector3(0,.25f,-.06f),new Vector3(.66f,.43f,.63f),plate,paint);
            Part("Receiver top rail",assembly,new Vector3(0,.49f,-.12f),new Vector3(.45f,.08f,.48f),plate,steel);
            Part("Receiver brass latch",assembly,new Vector3(.34f,.27f,-.06f),new Vector3(.04f,.13f,.23f),plate,brass);
            for(int i=0;i<3;i++)
            {
                float x=i==2?0:(i==0?-.17f:.17f),y=i==2?.68f:.43f;
                Part("Scattergun barrel "+i,assembly,new Vector3(x,y,.39f),new Vector3(.25f,.25f,.80f),cylinder,steel);
                Part("Scattergun muzzle collar "+i,assembly,new Vector3(x,y,.78f),new Vector3(.30f,.30f,.12f),cylinder,brass);
                Part("Scattergun bore "+i,assembly,new Vector3(x,y,.845f),new Vector3(.19f,.19f,.012f),cylinder,rubber);
            }
            for(int side=-1;side<=1;side+=2)
            {
                var drum=Part("Scattergun feed drum "+side,assembly,new Vector3(side*.40f,.26f,-.13f),new Vector3(.29f,.29f,.18f),cylinder,steel);
                drum.localRotation=Quaternion.Euler(0,90,0);
                var cap=Part("Feed drum brass cap "+side,assembly,new Vector3(side*.50f,.26f,-.13f),new Vector3(.20f,.20f,.025f),cylinder,brass);
                cap.localRotation=Quaternion.Euler(0,90,0);
            }
        }
        public void Fire(Vector3 target)
        {
            var direction=Vector3.ProjectOnPlane(target-transform.position,Vector3.up);
            if(direction.sqrMagnitude<.01f)return;
            transform.rotation=Quaternion.LookRotation(direction.normalized,Vector3.up);recoil=.22f;
        }
        public void Advance(float elapsed)
        {
            if(!assembly)return;
            recoil=Mathf.Max(0,recoil-elapsed);
            assembly.localPosition=new Vector3(0,0,recoil>0?-Mathf.Sin(recoil/.22f*Mathf.PI)*.08f:0);
        }
        public void Clear() { recoil=0; if(assembly)assembly.localPosition=Vector3.zero; }
        public void RestoreMount() { Clear();transform.localRotation=mountRotation; }
        void OnDisable(){RestoreMount();}
        void OnDestroy()
        {
            Release(plate);Release(cylinder);
        }
    }
}

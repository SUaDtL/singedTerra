using System;
using UnityEngine;
using static SingedTerra.Art.LastStandModuleGeometry;

namespace SingedTerra.Art
{
    // Split electrodes and a raised ceramic stack distinguish the chain emitter
    // from the solid barrels. Feedback borrows materials and owns only its meshes.
    public sealed class LastStandArcModule : MonoBehaviour
    {
        Mesh plate,cylinder;
        Transform head,muzzle;
        Quaternion mountRotation;
        float pulse;
        public Vector3 MuzzlePosition=>muzzle.position;
        public void Initialize(TankPresentation owner)
        {
            if(head)throw new InvalidOperationException("Arc module already initialized.");
            mountRotation=Mount(owner,transform);
            var armor=Material(owner,"Armor");var steel=Material(owner,"Steel");var brass=Material(owner,"Brass");
            plate=Prism(true,"Arc");cylinder=Prism(false,"Arc");
            Part("Arc swivel base",transform,Vector3.zero,new Vector3(.83f,.18f,.82f),plate,steel);
            Part("Arc capacitor housing",transform,new Vector3(0,.22f,-.23f),new Vector3(.65f,.34f,.55f),plate,armor);
            head=new GameObject("Arc electrode head").transform;head.SetParent(transform,false);
            for(int n=0;n<4;n++)
                Part("Arc insulator ring "+n,head,new Vector3(0,.38f+n*.11f,.08f),new Vector3(.43f,.07f,.40f),plate,n%2==0?steel:brass);
            for(int side=-1;side<=1;side+=2)
            {
                Part("Arc fork "+side,head,new Vector3(side*.27f,.74f,.24f),new Vector3(.12f,.13f,.63f),plate,steel);
                Part("Arc electrode "+side,head,new Vector3(side*.27f,.74f,.60f),new Vector3(.20f,.20f,.18f),cylinder,brass);
            }
            muzzle=new GameObject("Arc discharge gap").transform;muzzle.SetParent(head,false);muzzle.localPosition=new Vector3(0,.74f,.72f);
        }
        public void Fire(Vector3 target)
        {
            var direction=Vector3.ProjectOnPlane(target-transform.position,Vector3.up);
            if(direction.sqrMagnitude<.01f)return;
            transform.rotation=Quaternion.LookRotation(direction.normalized,Vector3.up);pulse=.22f;
        }
        public void Advance(float elapsed)
        {
            if(!head)return;pulse=Mathf.Max(0,pulse-elapsed);
            head.localPosition=Vector3.up*(pulse>0?Mathf.Sin(pulse/.22f*Mathf.PI)*.065f:0);
        }
        public void Clear(){pulse=0;if(head)head.localPosition=Vector3.zero;}
        public void RestoreMount(){Clear();transform.localRotation=mountRotation;}
        void OnDisable(){RestoreMount();}
        void OnDestroy(){Release(plate);Release(cylinder);}
    }
}

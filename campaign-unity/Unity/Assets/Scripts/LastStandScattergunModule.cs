using System;
using System.Collections.Generic;
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
            var source=owner.launcherModule.GetComponentsInChildren<Renderer>(true);
            Renderer foot=null;
            // The imported FBX combines authored parts by material; its Steel
            // mesh is the original launcher foot, shared by the module socket.
            foreach(var renderer in source)if(renderer.name=="Attachment_Launcher_Steel"){foot=renderer;break;}
            if(!foot)throw new InvalidOperationException("Authored attachment mount is missing.");
            transform.SetParent(owner.launcherModule.transform.parent,true);
            transform.position=foot.bounds.center;
            transform.rotation=Quaternion.LookRotation(Vector3.ProjectOnPlane(owner.muzzle.position-owner.barrel.position,Vector3.up).normalized,Vector3.up);
            mountRotation=transform.localRotation;
            plate=Prism(true); cylinder=Prism(false);
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
        static Material Material(TankPresentation owner,string identity)
        {
            foreach(var renderer in owner.tank.GetComponentsInChildren<Renderer>(true))
                foreach(var material in renderer.sharedMaterials)
                    if(material && material.name==identity)return material;
            throw new InvalidOperationException("Authored tank material missing: "+identity);
        }
        static Transform Part(string name,Transform parent,Vector3 position,Vector3 scale,Mesh mesh,Material material)
        {
            var part=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));part.transform.SetParent(parent,false);
            part.transform.localPosition=position;part.transform.localScale=scale;
            part.GetComponent<MeshFilter>().sharedMesh=mesh;part.GetComponent<MeshRenderer>().sharedMaterial=material;
            return part.transform;
        }
        static Mesh Prism(bool chamfered)
        {
            var outline=new List<Vector2>();
            if(chamfered)outline.AddRange(new[]{new Vector2(-.4f,-.5f),new Vector2(.4f,-.5f),new Vector2(.5f,-.4f),new Vector2(.5f,.4f),
                new Vector2(.4f,.5f),new Vector2(-.4f,.5f),new Vector2(-.5f,.4f),new Vector2(-.5f,-.4f)});
            else for(int i=0;i<16;i++){float angle=i*Mathf.PI/8;outline.Add(new Vector2(Mathf.Cos(angle),Mathf.Sin(angle))*.5f);}
            var vertices=new List<Vector3>();var triangles=new List<int>();var uv=new List<Vector2>();
            Action<Vector3,Vector3,Vector3> triangle=(a,b,c)=>{int start=vertices.Count;vertices.Add(a);vertices.Add(b);vertices.Add(c);
                uv.Add(new Vector2(a.x,a.y));uv.Add(new Vector2(b.x,b.y));uv.Add(new Vector2(c.x,c.y));triangles.Add(start);triangles.Add(start+1);triangles.Add(start+2);};
            for(int i=0;i<outline.Count;i++)
            {
                Vector2 a=outline[i],b=outline[(i+1)%outline.Count];
                var frontA=new Vector3(a.x,a.y,.5f);var frontB=new Vector3(b.x,b.y,.5f);
                var backA=new Vector3(a.x,a.y,-.5f);var backB=new Vector3(b.x,b.y,-.5f);
                triangle(new Vector3(0,0,.5f),frontA,frontB);triangle(new Vector3(0,0,-.5f),backB,backA);
                triangle(backA,backB,frontB);triangle(backA,frontB,frontA);
            }
            var mesh=new Mesh{name=chamfered?"Scattergun chamfered plate":"Scattergun barrel prism"};
            mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
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
            foreach(var mesh in new[]{plate,cylinder})if(mesh){if(Application.isPlaying)Destroy(mesh);else DestroyImmediate(mesh);}
        }
    }
}

using System;
using System.Collections.Generic;
using UnityEngine;

namespace SingedTerra.Art
{
    // Shared decorative construction. Callers own generated meshes; imported
    // materials and the authored launcher socket are borrowed, never rewritten.
    public static class LastStandModuleGeometry
    {
        public static Quaternion Mount(TankPresentation owner,Transform module)
        {
            if(!owner||!module)throw new ArgumentNullException(nameof(owner));
            Renderer foot=null;
            foreach(var renderer in owner.launcherModule.GetComponentsInChildren<Renderer>(true))
                if(renderer.name=="Attachment_Launcher_Steel"){foot=renderer;break;}
            if(!foot)throw new InvalidOperationException("Authored attachment mount is missing.");
            var forward=Vector3.ProjectOnPlane(owner.muzzle.position-owner.barrel.position,Vector3.up);
            if(forward.sqrMagnitude<.01f)throw new InvalidOperationException("Authored attachment direction is missing.");
            module.SetParent(owner.launcherModule.transform.parent,true);module.position=foot.bounds.center;
            module.rotation=Quaternion.LookRotation(forward.normalized,Vector3.up);return module.localRotation;
        }
        public static void Release(Mesh mesh)
        { if(mesh){if(Application.isPlaying)UnityEngine.Object.Destroy(mesh);else UnityEngine.Object.DestroyImmediate(mesh);} }
        public static Material Material(TankPresentation owner,string identity)
        {
            foreach(var renderer in owner.tank.GetComponentsInChildren<Renderer>(true))
                foreach(var material in renderer.sharedMaterials)
                    if(material && material.name==identity)return material;
            throw new InvalidOperationException("Authored tank material missing: "+identity);
        }
        public static Transform Part(string name,Transform parent,Vector3 position,Vector3 scale,Mesh mesh,Material material)
        {
            var part=new GameObject(name,typeof(MeshFilter),typeof(MeshRenderer));part.transform.SetParent(parent,false);
            part.transform.localPosition=position;part.transform.localScale=scale;
            part.GetComponent<MeshFilter>().sharedMesh=mesh;part.GetComponent<MeshRenderer>().sharedMaterial=material;
            return part.transform;
        }
        public static Mesh Prism(bool chamfered,string label="Attachment")
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
            var mesh=new Mesh{name=label+(chamfered?" chamfered plate":" barrel prism")};
            mesh.SetVertices(vertices);mesh.SetTriangles(triangles,0);mesh.SetUVs(0,uv);mesh.RecalculateNormals();mesh.RecalculateBounds();return mesh;
        }
    }
}
